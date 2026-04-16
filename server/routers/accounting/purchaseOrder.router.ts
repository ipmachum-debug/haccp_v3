/**
 * 발주서 (Purchase Order) 라우터 — Phase A (2026-04-14)
 * ═══════════════════════════════════════════════════════════════
 * 발주 → 승인 → 입고 → 매입전표 자동 변환 전체 워크플로우
 * ═══════════════════════════════════════════════════════════════
 */
import { router, tenantRequiredProcedure, adminProcedure } from "../../_core/trpc";
import { z } from "zod";
import { getDb, withTransaction } from "../../db";
import { purchaseOrders, purchaseOrderLines } from "../../../drizzle/schema/schema_purchase_orders";
import { partners } from "../../../drizzle/schema/schema_main_accounting";
import { and, eq, desc, sql, like, gte, lte, inArray } from "drizzle-orm";
import { todayKST } from "../../utils/timezone";

// ─── PO 번호 자동 생성 (PO-YYYY-NNNN) ────────────────────────
async function generatePoNumber(tenantId: number): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const year = new Date().getFullYear();
  const prefix = `PO-${year}-`;

  const [lastRow]: any = await (await import("../../db")).getRawConnection().then((pool) =>
    pool.execute(
      `SELECT po_number FROM purchase_orders
       WHERE tenant_id = ? AND po_number LIKE ?
       ORDER BY id DESC LIMIT 1`,
      [tenantId, `${prefix}%`],
    ),
  );
  const rows = lastRow as any[];

  let nextSeq = 1;
  if (rows && rows[0]?.po_number) {
    const match = rows[0].po_number.match(/-(\d+)$/);
    if (match) nextSeq = parseInt(match[1], 10) + 1;
  }
  return `${prefix}${String(nextSeq).padStart(4, "0")}`;
}

// ─── Zod 스키마 ──────────────────────────────────────────────
const lineInput = z.object({
  materialId: z.number().optional(),
  itemName: z.string().min(1, "품목명 필수"),
  itemCode: z.string().optional(),
  orderedQty: z.number().positive("수량은 양수"),
  unit: z.string().default("EA"),
  unitPrice: z.number().nonnegative(),
  taxAmount: z.number().nonnegative().optional(),
  expectedDeliveryDate: z.string().optional(),
  notes: z.string().optional(),
});

const createInput = z.object({
  partnerId: z.number(),
  orderDate: z.string(),
  expectedDeliveryDate: z.string().optional(),
  deliveryAddress: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(lineInput).min(1, "최소 1개 품목 필요"),
});

const receiveInput = z.object({
  poId: z.number(),
  lines: z
    .array(
      z.object({
        lineId: z.number(),
        receivedQty: z.number().positive(),
      }),
    )
    .min(1),
  receiptDate: z.string().optional(), // 입고일 (기본: 오늘)
});

// ─── Router ──────────────────────────────────────────────────
export const purchaseOrderRouter = router({
  /**
   * 발주 목록 조회 (필터 지원)
   */
  list: tenantRequiredProcedure
    .input(
      z
        .object({
          status: z
            .enum(["draft", "approved", "partial_received", "received", "cancelled"])
            .optional(),
          partnerId: z.number().optional(),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          search: z.string().optional(), // PO 번호 또는 거래처명
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");

      const conditions: any[] = [eq(purchaseOrders.tenantId, ctx.tenantId)];
      if (input?.status) conditions.push(eq(purchaseOrders.status, input.status));
      if (input?.partnerId) conditions.push(eq(purchaseOrders.partnerId, input.partnerId));
      if (input?.startDate) conditions.push(gte(purchaseOrders.orderDate, input.startDate));
      if (input?.endDate) conditions.push(lte(purchaseOrders.orderDate, input.endDate));
      if (input?.search) {
        conditions.push(like(purchaseOrders.poNumber, `%${input.search}%`));
      }

      const rows = await db
        .select({
          id: purchaseOrders.id,
          poNumber: purchaseOrders.poNumber,
          partnerId: purchaseOrders.partnerId,
          partnerName: partners.companyName,
          orderDate: purchaseOrders.orderDate,
          expectedDeliveryDate: purchaseOrders.expectedDeliveryDate,
          totalAmount: purchaseOrders.totalAmount,
          taxAmount: purchaseOrders.taxAmount,
          grandTotal: purchaseOrders.grandTotal,
          status: purchaseOrders.status,
          notes: purchaseOrders.notes,
          createdAt: purchaseOrders.createdAt,
          approvedAt: purchaseOrders.approvedAt,
        })
        .from(purchaseOrders)
        .leftJoin(partners, eq(purchaseOrders.partnerId, partners.id))
        .where(and(...conditions))
        .orderBy(desc(purchaseOrders.orderDate), desc(purchaseOrders.id));

      return rows;
    }),

  /**
   * 발주 상세 조회 (헤더 + 라인)
   */
  getById: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");

      const [po] = await db
        .select()
        .from(purchaseOrders)
        .leftJoin(partners, eq(purchaseOrders.partnerId, partners.id))
        .where(
          and(eq(purchaseOrders.id, input.id), eq(purchaseOrders.tenantId, ctx.tenantId)),
        )
        .limit(1);

      if (!po) throw new Error(`발주서 #${input.id} 를 찾을 수 없습니다.`);

      const lines = await db
        .select()
        .from(purchaseOrderLines)
        .where(
          and(
            eq(purchaseOrderLines.poId, input.id),
            eq(purchaseOrderLines.tenantId, ctx.tenantId),
          ),
        )
        .orderBy(purchaseOrderLines.lineNumber);

      return {
        ...po.purchase_orders,
        partner: po.partners,
        lines,
      };
    }),

  /**
   * 발주 생성 (draft 상태로 시작)
   */
  create: adminProcedure.input(createInput).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("DB 연결 실패");

    // 합계 계산
    let totalAmount = 0;
    let taxAmount = 0;
    for (const line of input.lines) {
      const lineAmount = line.orderedQty * line.unitPrice;
      totalAmount += lineAmount;
      taxAmount += line.taxAmount ?? Math.round(lineAmount * 0.1);
    }
    const grandTotal = totalAmount + taxAmount;

    const poNumber = await generatePoNumber(ctx.tenantId);

    return await withTransaction(async (conn) => {
      // 1. 헤더 insert
      const [headerResult] = await conn.execute(
        `INSERT INTO purchase_orders
           (tenant_id, po_number, partner_id, order_date, expected_delivery_date,
            delivery_address, total_amount, tax_amount, grand_total, status, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
        [
          ctx.tenantId,
          poNumber,
          input.partnerId,
          input.orderDate,
          input.expectedDeliveryDate ?? null,
          input.deliveryAddress ?? null,
          totalAmount.toFixed(2),
          taxAmount.toFixed(2),
          grandTotal.toFixed(2),
          input.notes ?? null,
          ctx.user.id,
        ],
      );
      const poId = Number((headerResult as any).insertId);

      // 2. 라인 insert
      let lineNumber = 1;
      for (const line of input.lines) {
        const lineAmount = line.orderedQty * line.unitPrice;
        await conn.execute(
          `INSERT INTO purchase_order_lines
             (tenant_id, po_id, line_number, material_id, item_name, item_code,
              ordered_qty, received_qty, unit, unit_price, amount, tax_amount,
              expected_delivery_date, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, '0.000', ?, ?, ?, ?, ?, ?)`,
          [
            ctx.tenantId,
            poId,
            lineNumber++,
            line.materialId ?? null,
            line.itemName,
            line.itemCode ?? null,
            line.orderedQty.toString(),
            line.unit,
            line.unitPrice.toFixed(2),
            lineAmount.toFixed(2),
            (line.taxAmount ?? Math.round(lineAmount * 0.1)).toFixed(2),
            line.expectedDeliveryDate ?? null,
            line.notes ?? null,
          ],
        );
      }

      return { id: poId, poNumber, message: `발주서 ${poNumber} 생성 완료` };
    }, `purchaseOrder.create`);
  }),

  /**
   * 발주서 수정 (draft 상태만 가능)
   */
  update: adminProcedure
    .input(
      z.object({
        id: z.number(),
        partnerId: z.number().optional(),
        orderDate: z.string().optional(),
        expectedDeliveryDate: z.string().optional(),
        deliveryAddress: z.string().optional(),
        notes: z.string().optional(),
        lines: z.array(lineInput).min(1, "최소 1개 품목 필요").optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");

      // 상태 검증
      const [existing] = await db
        .select({ status: purchaseOrders.status, poNumber: purchaseOrders.poNumber })
        .from(purchaseOrders)
        .where(
          and(eq(purchaseOrders.id, input.id), eq(purchaseOrders.tenantId, ctx.tenantId)),
        )
        .limit(1);
      if (!existing) throw new Error(`발주서 #${input.id} 없음`);
      if (existing.status !== "draft") {
        throw new Error(`작성 중(draft) 발주서만 수정 가능합니다. 현재: ${existing.status}`);
      }

      return await withTransaction(async (conn) => {
        // 헤더 업데이트
        const headerUpdates: string[] = [];
        const headerParams: any[] = [];

        if (input.partnerId !== undefined) {
          headerUpdates.push("partner_id = ?");
          headerParams.push(input.partnerId);
        }
        if (input.orderDate !== undefined) {
          headerUpdates.push("order_date = ?");
          headerParams.push(input.orderDate);
        }
        if (input.expectedDeliveryDate !== undefined) {
          headerUpdates.push("expected_delivery_date = ?");
          headerParams.push(input.expectedDeliveryDate || null);
        }
        if (input.deliveryAddress !== undefined) {
          headerUpdates.push("delivery_address = ?");
          headerParams.push(input.deliveryAddress || null);
        }
        if (input.notes !== undefined) {
          headerUpdates.push("notes = ?");
          headerParams.push(input.notes || null);
        }

        // 라인 재생성 (전체 교체)
        if (input.lines) {
          // 합계 재계산
          let totalAmount = 0;
          let taxAmount = 0;
          for (const line of input.lines) {
            const lineAmount = line.orderedQty * line.unitPrice;
            totalAmount += lineAmount;
            taxAmount += line.taxAmount ?? Math.round(lineAmount * 0.1);
          }
          const grandTotal = totalAmount + taxAmount;

          headerUpdates.push("total_amount = ?");
          headerParams.push(totalAmount.toFixed(2));
          headerUpdates.push("tax_amount = ?");
          headerParams.push(taxAmount.toFixed(2));
          headerUpdates.push("grand_total = ?");
          headerParams.push(grandTotal.toFixed(2));
        }

        if (headerUpdates.length > 0) {
          await conn.execute(
            `UPDATE purchase_orders SET ${headerUpdates.join(", ")}
             WHERE id = ? AND tenant_id = ?`,
            [...headerParams, input.id, ctx.tenantId],
          );
        }

        if (input.lines) {
          // 기존 라인 삭제 후 재생성
          await conn.execute(
            `DELETE FROM purchase_order_lines WHERE po_id = ? AND tenant_id = ?`,
            [input.id, ctx.tenantId],
          );

          let lineNumber = 1;
          for (const line of input.lines) {
            const lineAmount = line.orderedQty * line.unitPrice;
            await conn.execute(
              `INSERT INTO purchase_order_lines
                 (tenant_id, po_id, line_number, material_id, item_name, item_code,
                  ordered_qty, received_qty, unit, unit_price, amount, tax_amount,
                  expected_delivery_date, notes)
               VALUES (?, ?, ?, ?, ?, ?, ?, '0.000', ?, ?, ?, ?, ?, ?)`,
              [
                ctx.tenantId,
                input.id,
                lineNumber++,
                line.materialId ?? null,
                line.itemName,
                line.itemCode ?? null,
                line.orderedQty.toString(),
                line.unit,
                line.unitPrice.toFixed(2),
                lineAmount.toFixed(2),
                (line.taxAmount ?? Math.round(lineAmount * 0.1)).toFixed(2),
                line.expectedDeliveryDate ?? null,
                line.notes ?? null,
              ],
            );
          }
        }

        return { message: `발주서 ${existing.poNumber} 수정 완료` };
      }, `purchaseOrder.update:${input.id}`);
    }),

  /**
   * 발주 승인 (draft → approved)
   */
  approve: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      return await withTransaction(async (conn) => {
        const [rows]: any = await conn.execute(
          `SELECT status FROM purchase_orders WHERE id = ? AND tenant_id = ? FOR UPDATE`,
          [input.id, ctx.tenantId],
        );
        const current = (rows as any[])[0];
        if (!current) throw new Error(`발주서 #${input.id} 없음`);
        if (current.status !== "draft") {
          throw new Error(`작성 중(draft) 발주서만 승인 가능. 현재: ${current.status}`);
        }

        await conn.execute(
          `UPDATE purchase_orders
           SET status = 'approved', approved_by = ?, approved_at = NOW()
           WHERE id = ? AND tenant_id = ?`,
          [ctx.user.id, input.id, ctx.tenantId],
        );

        return { message: "발주서가 승인되었습니다." };
      }, `purchaseOrder.approve:${input.id}`);
    }),

  /**
   * 발주 취소 (draft/approved → cancelled)
   * 이미 입고가 시작된 (partial_received/received) 건은 취소 불가
   */
  cancel: adminProcedure
    .input(z.object({ id: z.number(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      return await withTransaction(async (conn) => {
        const [rows]: any = await conn.execute(
          `SELECT status FROM purchase_orders WHERE id = ? AND tenant_id = ? FOR UPDATE`,
          [input.id, ctx.tenantId],
        );
        const current = (rows as any[])[0];
        if (!current) throw new Error(`발주서 #${input.id} 없음`);
        if (!["draft", "approved"].includes(current.status)) {
          throw new Error(`이미 입고가 시작된 발주서는 취소할 수 없습니다. 현재: ${current.status}`);
        }

        await conn.execute(
          `UPDATE purchase_orders
           SET status = 'cancelled', cancelled_by = ?, cancelled_at = NOW(), cancel_reason = ?
           WHERE id = ? AND tenant_id = ?`,
          [ctx.user.id, input.reason ?? null, input.id, ctx.tenantId],
        );

        return { message: "발주서가 취소되었습니다." };
      }, `purchaseOrder.cancel:${input.id}`);
    }),

  /**
   * 발주 삭제 — 모든 상태 지원 (양방향 역수행)
   *
   * - draft: 단순 삭제
   * - approved/cancelled: 단순 삭제
   * - partial_received/received: 연결된 매입전표 전체 취소 (cancelPurchase)
   *   → LOT 역차감, 재고원장, 입고전표, 원료수불, 회계분개 모두 역수행
   *   → 이후 PO 삭제
   */
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      return await withTransaction(async (conn) => {
        const [rows]: any = await conn.execute(
          `SELECT status FROM purchase_orders WHERE id = ? AND tenant_id = ? FOR UPDATE`,
          [input.id, ctx.tenantId],
        );
        const current = (rows as any[])[0];
        if (!current) throw new Error(`발주서 #${input.id} 없음`);

        // 입고된 PO → 연결된 매입전표 역수행
        if (["partial_received", "received"].includes(current.status)) {
          // source_type='purchase_order' AND source_id=poId 인 매입전표 조회
          const [purchaseRows]: any = await conn.execute(
            `SELECT id, status FROM accounting_purchases
             WHERE tenant_id = ? AND source_type = 'purchase_order' AND source_id = ?
             AND status != 'cancelled'`,
            [ctx.tenantId, input.id],
          );
          const linkedPurchases = purchaseRows as any[];

          if (linkedPurchases.length > 0) {
            // cancelPurchase 는 트랜잭션 내부에서 호출 불가 (자체 트랜잭션)
            // → 직접 역수행 로직 인라인
            for (const p of linkedPurchases) {
              const purchaseId = p.id;

              // (1) 원본 receipt 거래 → LOT 역차감
              const [txRows]: any = await conn.execute(
                `SELECT id, lot_id, quantity FROM h_inventory_transactions
                 WHERE tenant_id = ? AND UPPER(reference_type) = 'PURCHASE'
                   AND source_id = ? AND transaction_type = 'receipt'
                 LIMIT 1`,
                [ctx.tenantId, purchaseId],
              );
              const origTx = (txRows as any[])[0];
              if (origTx) {
                const lotId = Number(origTx.lot_id);
                const cancelQty = Number(origTx.quantity);

                // LOT 수량 감소
                await conn.execute(
                  `UPDATE h_inventory_lots
                   SET available_quantity = GREATEST(0, available_quantity - ?),
                       current_quantity = GREATEST(0, COALESCE(current_quantity, quantity) - ?),
                       status = CASE WHEN GREATEST(0, available_quantity - ?) <= 0.001 THEN 'disposed' ELSE status END,
                       updated_at = NOW()
                   WHERE id = ? AND tenant_id = ?`,
                  [cancelQty, cancelQty, cancelQty, lotId, ctx.tenantId],
                );

                // 역거래 기록
                await conn.execute(
                  `INSERT INTO h_inventory_transactions
                     (tenant_id, lot_id, transaction_type, quantity, unit, transaction_date,
                      reference_type, source_type, source_id, notes, created_by)
                   VALUES (?, ?, 'usage', ?, 'EA', CURDATE(), 'PO_DELETE', 'PO_DELETE', ?, ?, ?)`,
                  [ctx.tenantId, lotId, cancelQty, purchaseId,
                   `[발주삭제] PO-${input.id}`, ctx.user.id],
                );
              }

              // (2) 입고전표 취소
              await conn.execute(
                `UPDATE h_inbound_headers SET status = 'cancelled', updated_at = NOW()
                 WHERE tenant_id = ? AND inbound_number = ?`,
                [ctx.tenantId, `INB-PURCHASE-${purchaseId}`],
              );

              // (3) 원료수불 역차감
              const [apRows]: any = await conn.execute(
                `SELECT material_id, quantity, transaction_date FROM accounting_purchases WHERE id = ? AND tenant_id = ?`,
                [purchaseId, ctx.tenantId],
              );
              const ap = (apRows as any[])[0];
              if (ap?.material_id) {
                await conn.execute(
                  `UPDATE material_ledger_daily
                   SET receiving_qty = GREATEST(0, receiving_qty - ?), updated_at = NOW()
                   WHERE tenant_id = ? AND material_id = ? AND ledger_date = ?`,
                  [Number(ap.quantity || 0), ctx.tenantId, ap.material_id, ap.transaction_date],
                );
              }

              // (4) 회계 분개 삭제 (역분개 대신 직접 삭제 — PO 전체 삭제이므로)
              const [jeRows]: any = await conn.execute(
                `SELECT id FROM expense_journal_entries
                 WHERE tenant_id = ? AND voucher_id = ? AND description LIKE ?`,
                [ctx.tenantId, purchaseId, `%PURCHASE-${purchaseId}%`],
              );
              for (const je of (jeRows as any[])) {
                await conn.execute(
                  `DELETE FROM expense_journal_lines WHERE journal_entry_id = ?`,
                  [je.id],
                );
                await conn.execute(
                  `DELETE FROM expense_journal_entries WHERE id = ? AND tenant_id = ?`,
                  [je.id, ctx.tenantId],
                );
              }

              // (5) 매입전표 삭제
              await conn.execute(
                `DELETE FROM accounting_purchases WHERE id = ? AND tenant_id = ?`,
                [purchaseId, ctx.tenantId],
              );
            }

            console.log(`[PO.delete] PO#${input.id}: ${linkedPurchases.length}건 매입전표 역수행 완료`);
          }
        }

        // PO 라인 + 헤더 삭제
        await conn.execute(
          `DELETE FROM purchase_order_lines WHERE po_id = ? AND tenant_id = ?`,
          [input.id, ctx.tenantId],
        );
        await conn.execute(
          `DELETE FROM purchase_orders WHERE id = ? AND tenant_id = ?`,
          [input.id, ctx.tenantId],
        );

        return { message: "발주서가 삭제되었습니다. (연관 재고/회계 역수행 완료)" };
      }, `purchaseOrder.delete:${input.id}`);
    }),

  /**
   * ★ 입고 처리 — PO → accounting_purchases 자동 생성
   *
   * 워크플로우:
   *   1. PO 잠금 + 상태 검증 (approved 또는 partial_received 만 가능)
   *   2. 각 라인별 입고량 검증 (ordered_qty - received_qty 초과 금지)
   *   3. haccpIntegration.createPurchase 호출 → 매입전표 생성
   *      → 이 경로가 h_inventory_lots + h_inventory_transactions
   *      + h_inbound_headers + material_ledger_daily 자동 처리
   *   4. 라인 received_qty 누적
   *   5. 전량 입고면 status='received', 일부면 'partial_received'
   */
  receive: adminProcedure.input(receiveInput).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("DB 연결 실패");

    console.log(`[purchaseOrder.receive] 시작: poId=${input.poId}, lines=${input.lines.length}건, tenant=${ctx.tenantId}`);

    // PO 헤더 + 라인 조회
    const [po] = await db
      .select()
      .from(purchaseOrders)
      .where(
        and(eq(purchaseOrders.id, input.poId), eq(purchaseOrders.tenantId, ctx.tenantId)),
      )
      .limit(1);
    if (!po) throw new Error(`발주서 #${input.poId} 없음`);
    if (!["approved", "partial_received"].includes(po.status!)) {
      throw new Error(`승인(approved) 상태 발주서만 입고 처리 가능. 현재: ${po.status}`);
    }

    const lineIds = input.lines.map((l) => l.lineId);
    const existingLines = await db
      .select()
      .from(purchaseOrderLines)
      .where(
        and(
          eq(purchaseOrderLines.poId, input.poId),
          eq(purchaseOrderLines.tenantId, ctx.tenantId),
          inArray(purchaseOrderLines.id, lineIds),
        ),
      );

    // 라인별 검증 + 매입전표 생성 + received_qty 업데이트 + 재고/회계 POST
    // ★ 2026-04-15 수정: createPurchase() → 직접 INSERT + postPurchase()
    //   이전: createPurchase 가 h_inventory_lots + material_ledger_daily 만 생성
    //         → h_inventory_transactions, h_inbound_headers, 회계 분개가 모두 누락
    //         → 재고 원장 / 입고전표 / 재무제표 반영 안 됨
    //   현재: pending 상태 INSERT 후 postPurchase 호출로 전체 파이프라인 처리
    //         (LOT + 재고 이력 + 입고전표 + 수불부 + 회계 분개)
    const { accountingPurchases } = await import("../../../drizzle/schema");
    const { postPurchase } = await import("../../lib/accounting/purchasePost");
    const receiptDate = input.receiptDate || new Date().toISOString().slice(0, 10);
    const createdPurchases: number[] = [];
    // ★ 2026-04-15: 라인별 실패 수집 → 부분 성공 허용 + 상세 에러 메시지
    const lineFailures: Array<{ lineNumber: number; itemName: string; error: string }> = [];

    for (const received of input.lines) {
      const line = existingLines.find((l) => l.id === received.lineId);
      if (!line) {
        lineFailures.push({ lineNumber: 0, itemName: `라인ID=${received.lineId}`, error: "라인 없음" });
        continue;
      }

      const ordered = Number(line.orderedQty);
      const alreadyReceived = Number(line.receivedQty);
      const remaining = ordered - alreadyReceived;

      if (received.receivedQty > remaining + 0.001) {
        lineFailures.push({
          lineNumber: line.lineNumber,
          itemName: line.itemName,
          error: `입고량 초과 (발주 ${ordered}, 기존입고 ${alreadyReceived}, 요청 ${received.receivedQty}, 잔량 ${remaining})`,
        });
        continue;
      }

      try {
        // (1) accounting_purchases INSERT (pending 상태) — 컬럼 부재 fallback 포함
        const totalAmount = received.receivedQty * Number(line.unitPrice);
        const taxAmount = Math.round(totalAmount * 0.1);
        const baseValues: any = {
          tenantId: ctx.tenantId,
          transactionDate: receiptDate,
          partnerId: po.partnerId,
          itemName: line.itemName,
          quantity: received.receivedQty.toString(),
          unit: line.unit || "EA",
          unitPrice: Number(line.unitPrice).toString(),
          totalAmount: totalAmount.toString(),
          taxAmount: taxAmount.toString(),
          taxRate: "10.00",
          sourceType: "purchase_order",
          sourceId: input.poId,
          notes: `발주서 ${po.poNumber} 입고 (라인 ${line.lineNumber})`,
          status: "pending", // postPurchase 가 approved 로 전환
          createdBy: ctx.user.id,
        };
        if (line.materialId !== undefined && line.materialId !== null) {
          baseValues.materialId = line.materialId;
        }

        let insertResult: any;
        try {
          [insertResult] = await db.insert(accountingPurchases).values(baseValues);
        } catch (insErr: any) {
          const msg = insErr?.message || String(insErr);
          // Unknown column → 선택 컬럼 제거 후 재시도
          if (msg.includes("Unknown column") || insErr?.code === "ER_BAD_FIELD_ERROR") {
            if (msg.includes("material_id")) delete baseValues.materialId;
            if (msg.includes("source_type")) delete baseValues.sourceType;
            if (msg.includes("source_id")) delete baseValues.sourceId;
            [insertResult] = await db.insert(accountingPurchases).values(baseValues);
            console.warn(`[purchaseOrder.receive] 컬럼 fallback INSERT 성공 (line ${line.lineNumber})`);
          } else {
            throw insErr;
          }
        }
        const newPurchaseId = Number(insertResult?.insertId || 0);
        if (!newPurchaseId) throw new Error("매입전표 INSERT 실패 (insertId 없음)");

        // (2) postPurchase 호출 — LOT + 재고 이력 + 입고전표 + 수불부 + 회계 분개 전체 처리
        await postPurchase(newPurchaseId, ctx.user.id);
        createdPurchases.push(newPurchaseId);

        // (3) 라인 received_qty 업데이트
        await db
          .update(purchaseOrderLines)
          .set({
            receivedQty: (alreadyReceived + received.receivedQty).toFixed(3),
          })
          .where(
            and(
              eq(purchaseOrderLines.id, received.lineId),
              eq(purchaseOrderLines.tenantId, ctx.tenantId),
            ),
          );

        console.log(`[purchaseOrder.receive] 라인 #${line.lineNumber} (${line.itemName}) 입고 완료: qty=${received.receivedQty}, purchaseId=${newPurchaseId}`);
      } catch (lineErr: any) {
        const errMsg = lineErr?.message || String(lineErr);
        console.error(`[purchaseOrder.receive] 라인 #${line.lineNumber} (${line.itemName}) 처리 실패:`, lineErr);
        lineFailures.push({
          lineNumber: line.lineNumber,
          itemName: line.itemName,
          error: errMsg,
        });
      }
    }

    // 전체 실패 시 명시적 에러 (사용자가 이유를 알 수 있도록)
    if (createdPurchases.length === 0 && lineFailures.length > 0) {
      const detail = lineFailures.map(f => `라인 ${f.lineNumber} (${f.itemName}): ${f.error}`).join(" | ");
      throw new Error(`입고 확정 실패 — 모든 라인 처리 실패: ${detail}`);
    }

    // PO 상태 업데이트 (전부 received 인지 확인)
    const allLines = await db
      .select()
      .from(purchaseOrderLines)
      .where(
        and(
          eq(purchaseOrderLines.poId, input.poId),
          eq(purchaseOrderLines.tenantId, ctx.tenantId),
        ),
      );

    const allReceived = allLines.every(
      (l) => Number(l.receivedQty) >= Number(l.orderedQty) - 0.001,
    );
    const newStatus = allReceived ? "received" : "partial_received";

    await db
      .update(purchaseOrders)
      .set({ status: newStatus })
      .where(
        and(eq(purchaseOrders.id, input.poId), eq(purchaseOrders.tenantId, ctx.tenantId)),
      );

    // 부분 성공 메시지
    let message = `${createdPurchases.length}건 입고 처리 완료`;
    if (lineFailures.length > 0) {
      message += ` (${lineFailures.length}건 실패: ${lineFailures.map(f => f.itemName).join(", ")})`;
    }

    console.log(`[purchaseOrder.receive] 완료: 성공=${createdPurchases.length}, 실패=${lineFailures.length}, newStatus=${newStatus}`);

    return {
      message,
      newStatus,
      createdPurchaseIds: createdPurchases,
      lineFailures, // ★ 프론트엔드에서 세부 실패 표시 가능
    };
  }),

  /**
   * ★ 발주서 PDF 생성 — Phase A-6 (2026-04-14)
   * - 헤더 + 라인 + 거래처 정보 + 회사 정보 조회
   * - purchaseOrderPdf.ts 로 PDF Buffer 생성
   * - base64 반환 (클라이언트가 iframe print 또는 새탭 미리보기)
   */
  generatePdf: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");

      const [po] = await db
        .select()
        .from(purchaseOrders)
        .leftJoin(partners, eq(purchaseOrders.partnerId, partners.id))
        .where(
          and(eq(purchaseOrders.id, input.id), eq(purchaseOrders.tenantId, ctx.tenantId)),
        )
        .limit(1);

      if (!po) throw new Error(`발주서 #${input.id} 없음`);

      const lines = await db
        .select()
        .from(purchaseOrderLines)
        .where(
          and(
            eq(purchaseOrderLines.poId, input.id),
            eq(purchaseOrderLines.tenantId, ctx.tenantId),
          ),
        )
        .orderBy(purchaseOrderLines.lineNumber);

      // 회사 정보 조회 (발주처)
      const { getCompanyInfo } = await import("../../db/system/companyInfo");
      const companyInfo = await getCompanyInfo(ctx.tenantId);

      const header = (po as any).purchase_orders;
      const partner = (po as any).partners;

      // PDF 생성
      const { generatePurchaseOrderPDF } = await import("../../lib/purchaseOrderPdf");
      const pdfBuffer = await generatePurchaseOrderPDF({
        poNumber: header.poNumber,
        orderDate: header.orderDate,
        expectedDeliveryDate: header.expectedDeliveryDate,
        deliveryAddress: header.deliveryAddress,
        buyer: {
          name: companyInfo.companyName || "회사명 미설정",
          businessNumber: companyInfo.companyBusinessNumber,
          address: companyInfo.companyAddress,
          representative: companyInfo.companyRepresentative,
          phone: companyInfo.companyPhone,
        },
        supplier: {
          name: partner?.companyName || "거래처 미지정",
          businessNumber: partner?.bizNo || undefined,
          address: partner?.address || undefined,
          representative: partner?.ceoName || undefined,
          phone: partner?.phone || undefined,
        },
        lines: lines.map((l: any) => ({
          lineNumber: Number(l.lineNumber),
          itemName: l.itemName,
          itemCode: l.itemCode || undefined,
          orderedQty: Number(l.orderedQty),
          unit: l.unit || "EA",
          unitPrice: Number(l.unitPrice),
          amount: Number(l.amount),
          expectedDeliveryDate: l.expectedDeliveryDate || undefined,
          notes: l.notes || undefined,
        })),
        totalAmount: Number(header.totalAmount || 0),
        taxAmount: Number(header.taxAmount || 0),
        grandTotal: Number(header.grandTotal || 0),
        notes: header.notes || undefined,
        status: header.status,
      });

      return {
        pdf: pdfBuffer.toString("base64"),
        filename: `발주서_${header.poNumber}_${todayKST()}.pdf`,
      };
    }),

  /**
   * ★ 반복 구매 품목 추천 — Phase B (2026-04-14)
   *
   * 거래처 선택 시 해당 공급업체로부터 과거에 자주/최근에 구매한 품목을
   * 집계해서 발주서 라인 프리필 용도로 반환.
   *
   * 집계 소스:
   *   - purchase_order_lines + purchase_orders (발주 이력)
   *   - accounting_purchases (매입 이력)
   *
   * 점수:
   *   - 최근성 (days_since_last_purchase 역수)
   *   - 빈도 (purchase_count)
   *   - 최신 단가 (last_unit_price)
   *
   * 반환 상위 20건.
   */
  suggestRepeatItems: tenantRequiredProcedure
    .input(
      z.object({
        partnerId: z.number(),
        limit: z.number().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");

      // purchase_order_lines + accounting_purchases 에서 반복 구매 집계
      const poHistoryResult: any = await db.execute(sql`
        SELECT
          pol.material_id AS materialId,
          pol.item_name AS itemName,
          pol.item_code AS itemCode,
          pol.unit AS unit,
          COUNT(*) AS purchaseCount,
          AVG(CAST(pol.unit_price AS DECIMAL(15,2))) AS avgPrice,
          MAX(CAST(pol.unit_price AS DECIMAL(15,2))) AS maxPrice,
          MIN(CAST(pol.unit_price AS DECIMAL(15,2))) AS minPrice,
          MAX(po.order_date) AS lastOrderDate,
          SUM(CAST(pol.ordered_qty AS DECIMAL(15,3))) AS totalQty,
          AVG(CAST(pol.ordered_qty AS DECIMAL(15,3))) AS avgQty
        FROM purchase_order_lines pol
        INNER JOIN purchase_orders po
          ON pol.po_id = po.id AND pol.tenant_id = po.tenant_id
        WHERE po.tenant_id = ${ctx.tenantId}
          AND po.partner_id = ${input.partnerId}
          AND po.status != 'cancelled'
        GROUP BY pol.material_id, pol.item_name, pol.item_code, pol.unit
        ORDER BY purchaseCount DESC, lastOrderDate DESC
        LIMIT ${input.limit}
      `);
      const poRows: any[] = poHistoryResult?.[0] || [];

      // accounting_purchases 이력도 병합 (legacy 데이터 + 수동 매입)
      const apHistoryResult: any = await db.execute(sql`
        SELECT
          ap.material_id AS materialId,
          ap.item_name AS itemName,
          ap.unit AS unit,
          COUNT(*) AS purchaseCount,
          AVG(CAST(ap.unit_price AS DECIMAL(15,2))) AS avgPrice,
          MAX(CAST(ap.unit_price AS DECIMAL(15,2))) AS maxPrice,
          MIN(CAST(ap.unit_price AS DECIMAL(15,2))) AS minPrice,
          MAX(ap.transaction_date) AS lastOrderDate,
          SUM(CAST(ap.quantity AS DECIMAL(15,3))) AS totalQty,
          AVG(CAST(ap.quantity AS DECIMAL(15,3))) AS avgQty
        FROM accounting_purchases ap
        WHERE ap.tenant_id = ${ctx.tenantId}
          AND ap.partner_id = ${input.partnerId}
          AND ap.status != 'cancelled'
        GROUP BY ap.material_id, ap.item_name, ap.unit
        ORDER BY purchaseCount DESC, lastOrderDate DESC
        LIMIT ${input.limit}
      `);
      const apRows: any[] = apHistoryResult?.[0] || [];

      // 병합 (material_id 또는 item_name 기준) - material_id 가 같으면 합침
      const merged = new Map<string, any>();
      const mergeRow = (source: string, row: any) => {
        const key = row.materialId ? `m-${row.materialId}` : `n-${(row.itemName || "").trim()}`;
        const existing = merged.get(key);
        if (!existing) {
          merged.set(key, {
            key,
            source,
            materialId: row.materialId ? Number(row.materialId) : null,
            itemName: row.itemName,
            itemCode: row.itemCode || null,
            unit: row.unit || "EA",
            purchaseCount: Number(row.purchaseCount || 0),
            avgPrice: Math.round(Number(row.avgPrice || 0)),
            minPrice: Math.round(Number(row.minPrice || 0)),
            maxPrice: Math.round(Number(row.maxPrice || 0)),
            lastOrderDate: row.lastOrderDate,
            totalQty: Number(row.totalQty || 0),
            avgQty: Number(row.avgQty || 0),
          });
        } else {
          // 둘 다 있으면 합계 병합
          existing.purchaseCount += Number(row.purchaseCount || 0);
          existing.totalQty += Number(row.totalQty || 0);
          // 최근 날짜로 업데이트
          if (row.lastOrderDate && (!existing.lastOrderDate || row.lastOrderDate > existing.lastOrderDate)) {
            existing.lastOrderDate = row.lastOrderDate;
          }
          // 평균 단가는 가중평균 (간이 처리: 그냥 평균)
          existing.avgPrice = Math.round((existing.avgPrice + Number(row.avgPrice || 0)) / 2);
        }
      };
      poRows.forEach((r) => mergeRow("po", r));
      apRows.forEach((r) => mergeRow("ap", r));

      // 최근성 스코어 계산 (days_since 역수 + 빈도)
      const today = new Date();
      const scored = Array.from(merged.values()).map((item: any) => {
        const lastDate = item.lastOrderDate ? new Date(item.lastOrderDate) : null;
        const daysSince = lastDate
          ? Math.max(1, Math.round((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)))
          : 999;
        // 스코어: 빈도 * 10 / sqrt(최근성)
        const score = Math.round((item.purchaseCount * 10) / Math.sqrt(daysSince));
        return {
          ...item,
          daysSinceLast: daysSince,
          score,
        };
      });

      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, input.limit);
    }),
});

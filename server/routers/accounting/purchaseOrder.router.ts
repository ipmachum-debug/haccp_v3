/**
 * 발주서 (Purchase Order) 라우터 — Phase A (2026-04-14)
 * ═══════════════════════════════════════════════════════════════
 * 발주 → 승인 → 입고 → 매입전표 자동 변환 전체 워크플로우
 * ═══════════════════════════════════════════════════════════════
 */
import { router, tenantRequiredProcedure, adminProcedure, requireCapability } from "../../_core/trpc";
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

/**
 * 발주 줄에 쓸 원료 번호 (2026-10-20, 번호 체계 2b).
 *   purchase_order_lines.material_id 는 종류 표시가 없는 옛 칸이라 (옛 줄 = 재고 번호, 새 줄 = 품목 번호) 새로 쓰는 값은
 *   다시 읽어도 같은 원료로 읽히는 숫자로 저장한다 (storableMaterialNumberOfItem). 원료를 바꾸지 않은 줄은 저장된 번호 그대로.
 */
async function poLineMaterialIds(
  conn: any, tenantId: number,
  lines: Array<{ itemMasterId?: number; sameMaterialAsLineId?: number; itemName: string }>,
  stored: Map<number, number | null>,
): Promise<Array<number | null>> {
  const { storableMaterialNumberOfItem, asItemMasterId } = await import("../../lib/identity/itemIdentityService");
  const out: Array<number | null> = [];
  for (const [i, l] of lines.entries()) {
    if (l.itemMasterId != null && l.sameMaterialAsLineId != null) throw new Error(`${i + 1}번 줄(${l.itemName}): 원료는 새로 고른 품목 또는 기존 줄 중 하나로만 지정합니다.`);
    if (l.sameMaterialAsLineId != null) {
      if (!stored.has(l.sameMaterialAsLineId)) throw new Error(`${i + 1}번 줄(${l.itemName}): 이 발주서의 기존 줄이 아닙니다.`);
      out.push(stored.get(l.sameMaterialAsLineId) ?? null);
    } else if (l.itemMasterId != null) {
      try { out.push(await storableMaterialNumberOfItem(asItemMasterId(l.itemMasterId), tenantId, conn)); }
      catch (e: any) { throw new Error(`${i + 1}번 줄(${l.itemName}): ${e?.message ?? e}`); }
    } else out.push(null);
  }
  return out;
}

// ─── Zod 스키마 ──────────────────────────────────────────────
const lineInput = z.object({
  /** 품목 선택창(material.list)에서 고른 원료 = 품목 번호 (번호 체계 2b — 종류를 밝혀 받는다) */
  itemMasterId: z.number().int().positive().optional(),
  /** 수정 때 원료를 바꾸지 않은 줄 — 그 줄에 저장된 원료 번호를 그대로 둔다 (옛 줄의 번호를 품목 번호로 다시 해석하지 않게) */
  sameMaterialAsLineId: z.number().int().positive().optional(),
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
        receivedQty: z.number().positive(),            // 발주 단위 입고량
        stockQuantity: z.number().positive().optional(), // 재고 단위 수량 (포장 환산 — 없으면 발주 단위 그대로)
        stockUnit: z.string().min(1).max(20).optional(),
        lotNumber: z.string().max(100).optional(),
        expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        productionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        inspectionResult: z.enum(["pending", "pass", "fail", "conditional"]).optional(),
      }),
    )
    .min(1),
  receiptDate: z.string().optional(), // 입고일 (기본: 오늘)
  idempotencyKey: z.string().min(8).max(64).optional(), // 화면이 만든 키 — 더블 클릭·재시도에 같은 입고 문서
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
        .leftJoin(
          partners,
          and(
            eq(purchaseOrders.partnerId, partners.id),
            eq(partners.tenantId, ctx.tenantId),
          ),
        )
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
        .leftJoin(
          partners,
          and(
            eq(purchaseOrders.partnerId, partners.id),
            eq(partners.tenantId, ctx.tenantId),
          ),
        )
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

      // 줄마다 품목 번호 — 저장 번호의 두 해석이 같은 원료일 때만 (모호·연결 없음은 null + 이유). 화면 수정은 이 값으로 (번호 체계 2b)
      const { inventoryMaterialIdOfStoredMixed } = await import("../../lib/identity/itemIdentityService");
      const raw = await (await import("../../db")).getRawConnection();
      const linesOut = [];
      for (const l of lines) {
        const r = l.materialId != null ? await inventoryMaterialIdOfStoredMixed(Number(l.materialId), ctx.tenantId, raw) : null;
        linesOut.push({
          ...l,
          itemMasterId: r?.ok ? (r.itemMasterId != null ? Number(r.itemMasterId) : null) : null,
          materialProblem: r && !r.ok ? r.message : null,
        });
      }

      return {
        ...po.purchase_orders,
        partner: po.partners,
        lines: linesOut,
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
      const materialIds = await poLineMaterialIds(conn, ctx.tenantId, input.lines, new Map());
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
      for (const [li, line] of input.lines.entries()) {
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
            materialIds[li],
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
          // 원료를 바꾸지 않은 줄은 저장된 번호 그대로 (삭제 전에 읽어 둔다)
          const [oldRows]: any = await conn.execute(
            `SELECT id, material_id FROM purchase_order_lines WHERE po_id = ? AND tenant_id = ?`, [input.id, ctx.tenantId],
          );
          const stored = new Map<number, number | null>((oldRows as any[]).map((r) => [Number(r.id), r.material_id != null ? Number(r.material_id) : null]));
          const materialIds = await poLineMaterialIds(conn, ctx.tenantId, input.lines, stored);
          // 기존 라인 삭제 후 재생성
          await conn.execute(
            `DELETE FROM purchase_order_lines WHERE po_id = ? AND tenant_id = ?`,
            [input.id, ctx.tenantId],
          );

          let lineNumber = 1;
          for (const [li, line] of input.lines.entries()) {
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
                materialIds[li],
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
   * 발주 삭제 — 입고가 시작되지 않은 발주서만 (2026-10-17, 입고 정본화 PR-3)
   *
   * 이전: 입고된 발주도 삭제하며 연결 매입전표·분개를 **DELETE** 로 역수행(감사 추적 소실, 이미 쓴 LOT 은 0 에서 멈춰
   *   원장과 어긋남). 지금: 입고 수량·입고 문서가 있으면 거부 — 입고 취소(입고 줄 취소) 를 먼저 한다.
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
        const [recv]: any = await conn.execute(
          `SELECT COALESCE(SUM(received_qty), 0) AS r FROM purchase_order_lines WHERE po_id = ? AND tenant_id = ?`,
          [input.id, ctx.tenantId],
        );
        const [docs]: any = await conn.execute(
          `SELECT COUNT(*) AS n FROM h_inbound_headers WHERE po_id = ? AND tenant_id = ? AND status <> 'cancelled'`,
          [input.id, ctx.tenantId],
        );
        const [vouchers]: any = await conn.execute(
          `SELECT COUNT(*) AS n FROM accounting_purchases WHERE tenant_id = ? AND source_type = 'purchase_order' AND source_id = ? AND status <> 'cancelled'`,
          [ctx.tenantId, input.id],
        );
        if (["partial_received", "received"].includes(current.status) || Number((recv as any[])[0]?.r ?? 0) > 0
          || Number((docs as any[])[0]?.n ?? 0) > 0 || Number((vouchers as any[])[0]?.n ?? 0) > 0) {
          throw new Error("입고가 시작된 발주서는 삭제할 수 없습니다. 입고를 먼저 취소하세요.");
        }
        await conn.execute(`DELETE FROM purchase_order_lines WHERE po_id = ? AND tenant_id = ?`, [input.id, ctx.tenantId]);
        await conn.execute(`DELETE FROM purchase_orders WHERE id = ? AND tenant_id = ?`, [input.id, ctx.tenantId]);
        return { message: "발주서가 삭제되었습니다." };
      }, `purchaseOrder.delete:${input.id}`);
    }),

  /**
   * 입고 처리 — 입고 확정 단일 서비스(inboundService) 로 (2026-10-17, 입고 정본화 PR-3)
   *
   * 이전: 줄마다 대기 매입전표 INSERT → postPurchase(재고·분개) → received_qty 갱신, 줄 단위 부분 성공 허용
   *   (운영 PO-2026-0003: 두 번 실패하며 대기 전표 8건만 남고 입고량 0).
   * 지금: 입고 문서(draft) 1건 → confirmInbound 한 트랜잭션 — LOT·원장·수불부·발주 입고량·상태 + 줄마다 대기 매입전표 초안
   *   (입고 줄 연결, CEO 결정). 하나라도 실패하면 전부 되돌림. 같은 idempotencyKey 재요청은 같은 문서·결과.
   *   전표 확정은 분개만 (재고는 입고가 이미 반영 — postPurchase 의 inbound_line_id 경로).
   */
  receive: adminProcedure.input(receiveInput).mutation(async ({ ctx, input }) => {
    const { createInboundDraft, confirmInbound } = await import("../../lib/inventory/inbound/inboundService");
    const db = await getDb();
    if (!db) throw new Error("DB 연결 실패");
    const [po] = await db.select().from(purchaseOrders)
      .where(and(eq(purchaseOrders.id, input.poId), eq(purchaseOrders.tenantId, ctx.tenantId))).limit(1);
    if (!po) throw new Error(`발주서 #${input.poId} 없음`);
    const lineIds = input.lines.map((l) => l.lineId);
    const poLines = await db.select().from(purchaseOrderLines)
      .where(and(eq(purchaseOrderLines.poId, input.poId), eq(purchaseOrderLines.tenantId, ctx.tenantId), inArray(purchaseOrderLines.id, lineIds)));
    // 발주 줄 번호는 종류 표시가 없는 옛 칸 — 두 해석이 같은 원료일 때만 재고 원료로 (모호·연결 없음은 입고 전에 거부, 번호 체계 2b)
    const { inventoryMaterialIdOfStoredMixed } = await import("../../lib/identity/itemIdentityService");
    const raw0 = await (await import("../../db")).getRawConnection();
    const draftLines = [];
    for (const r of input.lines) {
      const line = poLines.find((l) => l.id === r.lineId);
      if (!line) throw new Error(`발주 줄 #${r.lineId} 를 찾을 수 없습니다.`);
      if (line.materialId == null) throw new Error(`${line.lineNumber}번 줄(${line.itemName}) 은 원재료와 연결되지 않아 입고할 수 없습니다.`);
      const mat = await inventoryMaterialIdOfStoredMixed(Number(line.materialId), ctx.tenantId, raw0);
      if (!mat.ok) throw new Error(`${line.lineNumber}번 줄(${line.itemName}): ${mat.message}`);
      draftLines.push({
        material: { kind: "inventory" as const, id: mat.inventoryMaterialId },
        poLineId: Number(line.id),
        purchaseQuantity: r.receivedQty,
        purchaseUnit: line.unit || "EA",
        // 재고 수량·단위는 서버가 포장 단위 환산으로 계산 (화면 값이 있으면 같아야 함, 설정 없으면 거부)
        stockQuantity: r.stockQuantity ?? null,
        stockUnit: r.stockUnit ?? null,
        unitPrice: Number(line.unitPrice),
        lotNumber: r.lotNumber ?? null,
        expiryDate: r.expiryDate ?? null,
        productionDate: r.productionDate ?? null,
        inspectionResult: r.inspectionResult ?? null,
      });
    }
    const receiptDate = input.receiptDate || new Date().toISOString().slice(0, 10);
    const key = input.idempotencyKey ?? `po-${input.poId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const { headerId } = await createInboundDraft({
      tenantId: ctx.tenantId, userId: ctx.user.id, idempotencyKey: key, sourceType: "purchase_order",
      poId: input.poId, supplierId: po.partnerId ?? null, inboundDate: receiptDate, lines: draftLines,
    });
    // 같은 요청 키의 문서가 이미 전부 반품·취소됐으면 확정을 다시 부르지 않고 그 상태로 답한다 (Codex #568 검증 R1).
    //   새 키로 같은 발주에 새로 입고하는 경로는 그대로.
    const { getRawConnection } = await import("../../db/connection");
    const raw = await getRawConnection();
    const [hs]: any = await raw.execute(`SELECT status FROM h_inbound_headers WHERE id = ? AND tenant_id = ?`, [headerId, ctx.tenantId]);
    if ((hs as any[])[0]?.status === "cancelled") {
      const [cl]: any = await raw.execute(`SELECT id FROM h_inbound_lines WHERE header_id = ? AND tenant_id = ? ORDER BY line_number`, [headerId, ctx.tenantId]);
      const [cur] = await db.select({ status: purchaseOrders.status }).from(purchaseOrders)
        .where(and(eq(purchaseOrders.id, input.poId), eq(purchaseOrders.tenantId, ctx.tenantId))).limit(1);
      return {
        message: "이 입고는 이미 전부 반품·취소됐습니다 — 다시 받으려면 새로 입고하세요.",
        newStatus: cur?.status, inboundHeaderId: headerId, createdPurchaseIds: [], quarantinedLineIds: [],
        cancelledLineIds: (cl as any[]).map((x) => Number(x.id)), lineFailures: [],
      };
    }
    const r = await confirmInbound(headerId, ctx.tenantId, ctx.user.id, { createVoucherDrafts: true });
    const [after] = await db.select({ status: purchaseOrders.status }).from(purchaseOrders)
      .where(and(eq(purchaseOrders.id, input.poId), eq(purchaseOrders.tenantId, ctx.tenantId))).limit(1);
    if (r.status === "pending_approval") {
      return { message: "입고 승인 대기 — 승인되면 재고에 반영됩니다.", newStatus: after?.status, inboundHeaderId: headerId, createdPurchaseIds: [], lineFailures: [] };
    }
    // 다시 보낸 요청이면 줄의 지금 상태로 센다 — 격리·반품·취소 줄은 '입고 확정' 에 넣지 않는다 (Codex #567 Q2)
    const q = r.quarantinedLineIds?.length ?? 0;
    const c = (r.cancelledLineIds ?? []).filter((id) => !(r.quarantinedLineIds ?? []).includes(id)).length;
    return {
      message: `${r.lots.length - q - c}건 입고 확정 (매입전표 초안 ${r.voucherIds.length}건)${q ? ` · 검수 불합격 ${q}건 격리 — 재고에 넣지 않음, 재검수·반품으로 처리` : ""}${c ? ` · 반품·취소 ${c}건` : ""}`,
      quarantinedLineIds: r.quarantinedLineIds ?? [],
      newStatus: after?.status,
      inboundHeaderId: headerId,
      createdPurchaseIds: r.voucherIds,
      lineFailures: [] as Array<{ lineNumber: number; itemName: string; error: string }>,
    };
  }),

  /** 발주 수량 변경 — 요청 (CEO 결정 3: 초과 입고는 변경 승인 후 추가 입고, 이력 보존) */
  requestQtyChange: requireCapability("ERP_PURCHASE", "WRITE")
    .input(z.object({ poLineId: z.number().int().positive(), newQty: z.number().positive(), reason: z.string().min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      const { requestPoLineQtyChange } = await import("../../lib/inventory/inbound/poQtyChange");
      return withTransaction((conn: any) => requestPoLineQtyChange(conn, { tenantId: ctx.tenantId, userId: ctx.user.id, ...input }), "po.requestQtyChange");
    }),

  /** 발주 수량 변경 — 승인·반려 */
  decideQtyChange: requireCapability("ERP_PURCHASE", "APPROVE")
    .input(z.object({ changeId: z.number().int().positive(), approve: z.boolean(), note: z.string().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      const { decidePoLineQtyChange } = await import("../../lib/inventory/inbound/poQtyChange");
      return withTransaction((conn: any) => decidePoLineQtyChange(conn, { tenantId: ctx.tenantId, userId: ctx.user.id, ...input }), "po.decideQtyChange");
    }),

  /** 발주 수량 변경 이력 */
  qtyChanges: tenantRequiredProcedure
    .input(z.object({ poId: z.number() }))
    .query(async ({ ctx, input }) => {
      const { listPoLineQtyChanges } = await import("../../lib/inventory/inbound/poQtyChange");
      const { getRawConnection } = await import("../../db");
      return listPoLineQtyChanges(await getRawConnection(), ctx.tenantId, input.poId);
    }),

  /** 발주 줄 입고 가능 잔량 — '미입고 잔량 전체 채우기' */
  receivableLines: tenantRequiredProcedure
    .input(z.object({ poId: z.number() }))
    .query(async ({ ctx, input }) => {
      const { getReceivableLines } = await import("../../lib/inventory/inbound/inboundService");
      return getReceivableLines(input.poId, ctx.tenantId);
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
        .leftJoin(
          partners,
          and(
            eq(purchaseOrders.partnerId, partners.id),
            eq(partners.tenantId, ctx.tenantId),
          ),
        )
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

      // 병합 (2026-10-20, 번호 체계 2b — Codex 반복 추천 점검)
      //   이전: 발주 줄 번호(주로 품목 번호)와 매입 번호(주로 재고 번호)를 같은 숫자면 합쳤고(m-${id}), 단위도 키에 없어
      //   다른 원료가 합쳐지거나 같은 원료가 갈라지고, kg·포대 수량을 더하고 단가를 단순 평균했다.
      //   지금: 줄마다 저장 번호를 FK 로 하나의 품목 정체성으로 바꾼다 (두 해석이 같은 원료일 때만 — 모호·연결 없음은 합치지 않고 '연결 안 됨').
      //   키 = 품목 정체성 + 구매 단위. 같은 원료라도 단위가 다르면 따로 (환산해 합치지 않음). 단가는 건수 가중 평균.
      const { inventoryMaterialIdOfStoredMixed } = await import("../../lib/identity/itemIdentityService");
      const raw = await (await import("../../db")).getRawConnection();
      const normUnit = (u: unknown) => String(u ?? "").trim().toLowerCase();
      const identity = new Map<number, { itemMasterId: number | null; problem: string | null }>();
      const identityOf = async (stored: unknown) => {
        const n = Number(stored);
        if (!(n > 0)) return { itemMasterId: null, problem: null };
        if (!identity.has(n)) {
          const r = await inventoryMaterialIdOfStoredMixed(n, ctx.tenantId, raw);
          identity.set(n, r.ok
            ? { itemMasterId: r.itemMasterId != null ? Number(r.itemMasterId) : null, problem: r.itemMasterId == null ? "재고 원료가 품목과 연결되지 않았습니다" : null }
            : { itemMasterId: null, problem: r.message });
        }
        return identity.get(n)!;
      };
      const merged = new Map<string, any>();
      const mergeRow = async (source: string, row: any) => {
        const id = await identityOf(row.materialId);
        const unit = row.unit || "EA";
        // 연결 안 된 이력은 다른 이력과 합치지 않는다 (출처·저장 번호·이름·단위 그대로)
        const key = id.itemMasterId != null
          ? `i-${id.itemMasterId}-u-${normUnit(unit)}`
          : `x-${source}-${row.materialId ?? ""}-${(row.itemName || "").trim()}-u-${normUnit(unit)}`;
        const count = Number(row.purchaseCount || 0);
        const existing = merged.get(key);
        if (!existing) {
          merged.set(key, {
            key,
            source,
            itemMasterId: id.itemMasterId,
            linked: id.itemMasterId != null,
            materialProblem: id.itemMasterId != null ? null : (id.problem ?? "원료가 연결되지 않은 이력입니다"),
            itemName: row.itemName,
            itemCode: row.itemCode || null,
            unit,
            purchaseCount: count,
            avgPrice: Math.round(Number(row.avgPrice || 0)),
            minPrice: Math.round(Number(row.minPrice || 0)),
            maxPrice: Math.round(Number(row.maxPrice || 0)),
            lastOrderDate: row.lastOrderDate,
            totalQty: Number(row.totalQty || 0),
            avgQty: Number(row.avgQty || 0),
          });
        } else {
          // 같은 원료·같은 단위 — 건수 가중 평균
          const total = existing.purchaseCount + count;
          if (total > 0) {
            existing.avgPrice = Math.round((existing.avgPrice * existing.purchaseCount + Number(row.avgPrice || 0) * count) / total);
            existing.avgQty = (existing.avgQty * existing.purchaseCount + Number(row.avgQty || 0) * count) / total;
          }
          existing.minPrice = Math.min(existing.minPrice, Math.round(Number(row.minPrice || 0)));
          existing.maxPrice = Math.max(existing.maxPrice, Math.round(Number(row.maxPrice || 0)));
          existing.purchaseCount = total;
          existing.totalQty += Number(row.totalQty || 0);
          if (row.lastOrderDate && (!existing.lastOrderDate || row.lastOrderDate > existing.lastOrderDate)) {
            existing.lastOrderDate = row.lastOrderDate;
          }
        }
      };
      for (const r of poRows) await mergeRow("po", r);
      for (const r of apRows) await mergeRow("ap", r);
      // 연결된 추천의 이름·코드는 지금 품목 정체성 기준 (옛 이름에 번호만 붙이지 않게)
      const linkedIds = [...new Set([...merged.values()].map((m: any) => m.itemMasterId).filter((x: any) => x != null))];
      if (linkedIds.length) {
        const [ims]: any = await raw.execute(
          `SELECT id, item_name, item_code FROM item_master WHERE tenant_id = ? AND id IN (${linkedIds.map(() => "?").join(",")})`,
          [ctx.tenantId, ...linkedIds],
        );
        const byId = new Map((ims as any[]).map((r) => [Number(r.id), r]));
        for (const m of merged.values()) {
          const im = m.itemMasterId != null ? byId.get(m.itemMasterId) : null;
          if (im) { m.itemName = im.item_name; m.itemCode = im.item_code ?? m.itemCode; }
        }
      }

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

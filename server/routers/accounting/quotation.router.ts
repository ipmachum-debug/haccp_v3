/**
 * 견적서 (Quotation) 라우터 — Phase C (2026-04-14)
 * ═══════════════════════════════════════════════════════════════
 * 견적 → 발송 → 수락 → 매출/PO 변환 전체 워크플로우
 * ═══════════════════════════════════════════════════════════════
 */
import { router, tenantRequiredProcedure, adminProcedure } from "../../_core/trpc";
import { z } from "zod";
import { getDb, withTransaction } from "../../db";
import { quotations, quotationLines } from "../../../drizzle/schema/schema_quotations";
import { partners } from "../../../drizzle/schema/schema_main_accounting";
import { and, eq, desc, sql, like, gte, lte } from "drizzle-orm";
import { todayKST } from "../../utils/timezone";

// ─── 견적서 번호 자동 생성 (QUO-YYYY-NNNN) ────────────────────
async function generateQuotationNumber(tenantId: number): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `QUO-${year}-`;

  const pool = await (await import("../../db")).getRawConnection();
  const [rows]: any = await pool.execute(
    `SELECT quotation_number FROM quotations
     WHERE tenant_id = ? AND quotation_number LIKE ?
     ORDER BY id DESC LIMIT 1`,
    [tenantId, `${prefix}%`],
  );

  let nextSeq = 1;
  if (rows && rows[0]?.quotation_number) {
    const match = rows[0].quotation_number.match(/-(\d+)$/);
    if (match) nextSeq = parseInt(match[1], 10) + 1;
  }
  return `${prefix}${String(nextSeq).padStart(4, "0")}`;
}

// ─── Zod 스키마 ──────────────────────────────────────────────
const lineInput = z.object({
  targetType: z.enum(["material", "product", "service"]).default("product"),
  materialId: z.number().optional(),
  productId: z.number().optional(),
  itemName: z.string().min(1, "품목명 필수"),
  itemCode: z.string().optional(),
  description: z.string().optional(),
  quantity: z.number().positive("수량은 양수"),
  unit: z.string().default("EA"),
  unitPrice: z.number().nonnegative(),
  discountRate: z.number().min(0).max(100).optional(),
  taxAmount: z.number().nonnegative().optional(),
  notes: z.string().optional(),
});

const createInput = z.object({
  partnerId: z.number().optional(), // 기존 거래처 (없으면 신규)
  partnerName: z.string().optional(), // 신규 거래처 직접 입력
  quoteDate: z.string(),
  validUntil: z.string().optional(),
  title: z.string().optional(),
  paymentTerms: z.string().optional(),
  deliveryTerms: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(lineInput).min(1, "최소 1개 품목 필요"),
});

// ─── Router ──────────────────────────────────────────────────
export const quotationRouter = router({
  /**
   * 견적서 목록 조회 (필터 지원)
   */
  list: tenantRequiredProcedure
    .input(
      z
        .object({
          status: z
            .enum(["draft", "sent", "accepted", "rejected", "expired", "converted", "cancelled"])
            .optional(),
          partnerId: z.number().optional(),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          search: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");

      const conditions: any[] = [eq(quotations.tenantId, ctx.tenantId)];
      if (input?.status) conditions.push(eq(quotations.status, input.status));
      if (input?.partnerId) conditions.push(eq(quotations.partnerId, input.partnerId));
      if (input?.startDate) conditions.push(gte(quotations.quoteDate, input.startDate));
      if (input?.endDate) conditions.push(lte(quotations.quoteDate, input.endDate));
      if (input?.search) {
        conditions.push(like(quotations.quotationNumber, `%${input.search}%`));
      }

      const rows = await db
        .select({
          id: quotations.id,
          quotationNumber: quotations.quotationNumber,
          partnerId: quotations.partnerId,
          partnerName: partners.companyName,
          quoteDate: quotations.quoteDate,
          validUntil: quotations.validUntil,
          title: quotations.title,
          totalAmount: quotations.totalAmount,
          taxAmount: quotations.taxAmount,
          grandTotal: quotations.grandTotal,
          status: quotations.status,
          convertedSaleId: quotations.convertedSaleId,
          notes: quotations.notes,
          createdAt: quotations.createdAt,
          sentAt: quotations.sentAt,
          acceptedAt: quotations.acceptedAt,
        })
        .from(quotations)
        .leftJoin(
          partners,
          and(
            eq(quotations.partnerId, partners.id),
            eq(partners.tenantId, ctx.tenantId),
          ),
        )
        .where(and(...conditions))
        .orderBy(desc(quotations.quoteDate), desc(quotations.id));

      return rows;
    }),

  /**
   * 견적서 상세 조회 (헤더 + 라인)
   */
  getById: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");

      const [quo] = await db
        .select()
        .from(quotations)
        .leftJoin(
          partners,
          and(
            eq(quotations.partnerId, partners.id),
            eq(partners.tenantId, ctx.tenantId),
          ),
        )
        .where(
          and(eq(quotations.id, input.id), eq(quotations.tenantId, ctx.tenantId)),
        )
        .limit(1);

      if (!quo) throw new Error(`견적서 #${input.id} 를 찾을 수 없습니다.`);

      const lines = await db
        .select()
        .from(quotationLines)
        .where(
          and(
            eq(quotationLines.quotationId, input.id),
            eq(quotationLines.tenantId, ctx.tenantId),
          ),
        )
        .orderBy(quotationLines.lineNumber);

      return {
        ...(quo as any).quotations,
        partner: (quo as any).partners,
        lines,
      };
    }),

  /**
   * 견적서 생성 (draft 상태로 시작)
   */
  create: adminProcedure.input(createInput).mutation(async ({ ctx, input }) => {
    // 합계 계산 (라인 할인율 적용)
    let totalAmount = 0;
    let taxAmount = 0;
    for (const line of input.lines) {
      const gross = line.quantity * line.unitPrice;
      const discount = gross * ((line.discountRate ?? 0) / 100);
      const lineAmount = gross - discount;
      totalAmount += lineAmount;
      taxAmount += line.taxAmount ?? Math.round(lineAmount * 0.1);
    }
    const grandTotal = totalAmount + taxAmount;

    const quotationNumber = await generateQuotationNumber(ctx.tenantId);

    return await withTransaction(async (conn) => {
      // 신규 거래처명만 들어온 경우 partners 에 customer 로 자동 등록
      // (같은 이름 customer 가 이미 있으면 재사용 — 중복 방지)
      let resolvedPartnerId: number;
      if (input.partnerId) {
        resolvedPartnerId = input.partnerId;
      } else if (input.partnerName?.trim()) {
        const trimmed = input.partnerName.trim();
        const [existing]: any = await conn.execute(
          `SELECT id FROM partners
           WHERE tenant_id = ? AND company_name = ? AND partner_type = 'customer'
           LIMIT 1`,
          [ctx.tenantId, trimmed],
        );
        if (existing[0]) {
          resolvedPartnerId = Number(existing[0].id);
        } else {
          const [created]: any = await conn.execute(
            `INSERT INTO partners (tenant_id, partner_type, company_name, customer_type, is_active)
             VALUES (?, 'customer', ?, 'b2b', 1)`,
            [ctx.tenantId, trimmed],
          );
          resolvedPartnerId = Number(created.insertId);
        }
      } else {
        throw new Error("거래처를 선택하거나 거래처명을 입력하세요.");
      }

      const [headerResult] = await conn.execute(
        `INSERT INTO quotations
           (tenant_id, quotation_number, partner_id, quote_date, valid_until, title,
            total_amount, tax_amount, grand_total, status,
            payment_terms, delivery_terms, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)`,
        [
          ctx.tenantId,
          quotationNumber,
          resolvedPartnerId,
          input.quoteDate,
          input.validUntil ?? null,
          input.title ?? null,
          totalAmount.toFixed(2),
          taxAmount.toFixed(2),
          grandTotal.toFixed(2),
          input.paymentTerms ?? null,
          input.deliveryTerms ?? null,
          input.notes ?? null,
          ctx.user.id,
        ],
      );
      const quotationId = Number((headerResult as any).insertId);

      // 2. 라인 insert
      let lineNumber = 1;
      for (const line of input.lines) {
        const gross = line.quantity * line.unitPrice;
        const discount = gross * ((line.discountRate ?? 0) / 100);
        const lineAmount = gross - discount;
        await conn.execute(
          `INSERT INTO quotation_lines
             (tenant_id, quotation_id, line_number, target_type, material_id, product_id,
              item_name, item_code, description, quantity, unit, unit_price,
              discount_rate, amount, tax_amount, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            ctx.tenantId,
            quotationId,
            lineNumber++,
            line.targetType,
            line.materialId ?? null,
            line.productId ?? null,
            line.itemName,
            line.itemCode ?? null,
            line.description ?? null,
            line.quantity.toString(),
            line.unit,
            line.unitPrice.toFixed(2),
            (line.discountRate ?? 0).toFixed(2),
            lineAmount.toFixed(2),
            (line.taxAmount ?? Math.round(lineAmount * 0.1)).toFixed(2),
            line.notes ?? null,
          ],
        );
      }

      return {
        id: quotationId,
        quotationNumber,
        message: `견적서 ${quotationNumber} 생성 완료`,
      };
    }, `quotation.create`);
  }),

  /**
   * 견적서 수정 (draft 상태만 가능)
   */
  update: adminProcedure
    .input(
      z.object({
        id: z.number(),
        partnerId: z.number().optional(),
        quoteDate: z.string().optional(),
        validUntil: z.string().optional(),
        title: z.string().optional(),
        paymentTerms: z.string().optional(),
        deliveryTerms: z.string().optional(),
        notes: z.string().optional(),
        lines: z.array(lineInput).min(1, "최소 1개 품목 필요").optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");

      // 상태 검증
      const [existing] = await db
        .select({ status: quotations.status, quotationNumber: quotations.quotationNumber })
        .from(quotations)
        .where(
          and(eq(quotations.id, input.id), eq(quotations.tenantId, ctx.tenantId)),
        )
        .limit(1);
      if (!existing) throw new Error(`견적서 #${input.id} 없음`);
      if (existing.status !== "draft") {
        throw new Error(`작성 중(draft) 견적서만 수정 가능합니다. 현재: ${existing.status}`);
      }

      return await withTransaction(async (conn) => {
        const headerUpdates: string[] = [];
        const headerParams: any[] = [];

        if (input.partnerId !== undefined) {
          headerUpdates.push("partner_id = ?");
          headerParams.push(input.partnerId);
        }
        if (input.quoteDate !== undefined) {
          headerUpdates.push("quote_date = ?");
          headerParams.push(input.quoteDate);
        }
        if (input.validUntil !== undefined) {
          headerUpdates.push("valid_until = ?");
          headerParams.push(input.validUntil || null);
        }
        if (input.title !== undefined) {
          headerUpdates.push("title = ?");
          headerParams.push(input.title || null);
        }
        if (input.paymentTerms !== undefined) {
          headerUpdates.push("payment_terms = ?");
          headerParams.push(input.paymentTerms || null);
        }
        if (input.deliveryTerms !== undefined) {
          headerUpdates.push("delivery_terms = ?");
          headerParams.push(input.deliveryTerms || null);
        }
        if (input.notes !== undefined) {
          headerUpdates.push("notes = ?");
          headerParams.push(input.notes || null);
        }

        // 라인 재생성
        if (input.lines) {
          let totalAmount = 0;
          let taxAmount = 0;
          for (const line of input.lines) {
            const gross = line.quantity * line.unitPrice;
            const discount = gross * ((line.discountRate ?? 0) / 100);
            const lineAmount = gross - discount;
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
            `UPDATE quotations SET ${headerUpdates.join(", ")}
             WHERE id = ? AND tenant_id = ?`,
            [...headerParams, input.id, ctx.tenantId],
          );
        }

        if (input.lines) {
          await conn.execute(
            `DELETE FROM quotation_lines WHERE quotation_id = ? AND tenant_id = ?`,
            [input.id, ctx.tenantId],
          );

          let lineNumber = 1;
          for (const line of input.lines) {
            const gross = line.quantity * line.unitPrice;
            const discount = gross * ((line.discountRate ?? 0) / 100);
            const lineAmount = gross - discount;
            await conn.execute(
              `INSERT INTO quotation_lines
                 (tenant_id, quotation_id, line_number, target_type, material_id, product_id,
                  item_name, item_code, description, quantity, unit, unit_price,
                  discount_rate, amount, tax_amount, notes)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                ctx.tenantId,
                input.id,
                lineNumber++,
                line.targetType,
                line.materialId ?? null,
                line.productId ?? null,
                line.itemName,
                line.itemCode ?? null,
                line.description ?? null,
                line.quantity.toString(),
                line.unit,
                line.unitPrice.toFixed(2),
                (line.discountRate ?? 0).toFixed(2),
                lineAmount.toFixed(2),
                (line.taxAmount ?? Math.round(lineAmount * 0.1)).toFixed(2),
                line.notes ?? null,
              ],
            );
          }
        }

        return { message: `견적서 ${existing.quotationNumber} 수정 완료` };
      }, `quotation.update:${input.id}`);
    }),

  /**
   * 견적서 발송 (draft → sent)
   * - PDF 생성 후 고객에게 이메일/카톡 등으로 전송
   * - 상태 sent + sent_at 기록
   */
  markSent: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      return await withTransaction(async (conn) => {
        const [rows]: any = await conn.execute(
          `SELECT status FROM quotations WHERE id = ? AND tenant_id = ? FOR UPDATE`,
          [input.id, ctx.tenantId],
        );
        const current = (rows as any[])[0];
        if (!current) throw new Error(`견적서 #${input.id} 없음`);
        if (!["draft", "sent"].includes(current.status)) {
          throw new Error(`작성/발송 상태에서만 발송 가능. 현재: ${current.status}`);
        }

        await conn.execute(
          `UPDATE quotations
           SET status = 'sent', sent_by = ?, sent_at = NOW()
           WHERE id = ? AND tenant_id = ?`,
          [ctx.user.id, input.id, ctx.tenantId],
        );

        return { message: "견적서가 발송 처리되었습니다." };
      }, `quotation.markSent:${input.id}`);
    }),

  /**
   * 견적서 수락 (sent → accepted)
   */
  markAccepted: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      return await withTransaction(async (conn) => {
        const [rows]: any = await conn.execute(
          `SELECT status FROM quotations WHERE id = ? AND tenant_id = ? FOR UPDATE`,
          [input.id, ctx.tenantId],
        );
        const current = (rows as any[])[0];
        if (!current) throw new Error(`견적서 #${input.id} 없음`);
        if (current.status !== "sent") {
          throw new Error(`발송(sent) 상태 견적서만 수락 가능. 현재: ${current.status}`);
        }

        await conn.execute(
          `UPDATE quotations SET status = 'accepted', accepted_at = NOW()
           WHERE id = ? AND tenant_id = ?`,
          [input.id, ctx.tenantId],
        );

        return { message: "견적서가 수락 처리되었습니다." };
      }, `quotation.markAccepted:${input.id}`);
    }),

  /**
   * 견적서 거절 (sent → rejected)
   */
  markRejected: adminProcedure
    .input(z.object({ id: z.number(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      await withTransaction(async (conn) => {
        const [rows]: any = await conn.execute(
          `SELECT status FROM quotations WHERE id = ? AND tenant_id = ? FOR UPDATE`,
          [input.id, ctx.tenantId],
        );
        const current = (rows as any[])[0];
        if (!current) throw new Error(`견적서 #${input.id} 없음`);
        if (current.status !== "sent") {
          throw new Error(`발송(sent) 상태 견적서만 거절 가능. 현재: ${current.status}`);
        }

        await conn.execute(
          `UPDATE quotations
           SET status = 'rejected', rejected_at = NOW(), reject_reason = ?
           WHERE id = ? AND tenant_id = ?`,
          [input.reason ?? null, input.id, ctx.tenantId],
        );
      }, `quotation.markRejected:${input.id}`);
      return { message: "견적서가 거절 처리되었습니다." };
    }),

  /**
   * 견적서 취소 (draft/sent → cancelled)
   */
  cancel: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await withTransaction(async (conn) => {
        const [rows]: any = await conn.execute(
          `SELECT status FROM quotations WHERE id = ? AND tenant_id = ? FOR UPDATE`,
          [input.id, ctx.tenantId],
        );
        const current = (rows as any[])[0];
        if (!current) throw new Error(`견적서 #${input.id} 없음`);
        if (!["draft", "sent"].includes(current.status)) {
          throw new Error(`작성/발송 상태 견적서만 취소 가능. 현재: ${current.status}`);
        }
        await conn.execute(
          `UPDATE quotations SET status = 'cancelled' WHERE id = ? AND tenant_id = ?`,
          [input.id, ctx.tenantId],
        );
      }, `quotation.cancel:${input.id}`);
      return { message: "견적서가 취소되었습니다." };
    }),

  /**
   * 견적서 삭제 (draft 만 가능)
   */
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await withTransaction(async (conn) => {
        const [rows]: any = await conn.execute(
          `SELECT status FROM quotations WHERE id = ? AND tenant_id = ? FOR UPDATE`,
          [input.id, ctx.tenantId],
        );
        const current = (rows as any[])[0];
        if (!current) throw new Error(`견적서 #${input.id} 없음`);
        if (current.status !== "draft") {
          throw new Error(`작성 중 견적서만 삭제 가능. 현재: ${current.status}`);
        }
        await conn.execute(
          `DELETE FROM quotation_lines WHERE quotation_id = ? AND tenant_id = ?`,
          [input.id, ctx.tenantId],
        );
        await conn.execute(
          `DELETE FROM quotations WHERE id = ? AND tenant_id = ?`,
          [input.id, ctx.tenantId],
        );
      }, `quotation.delete:${input.id}`);
      return { message: "견적서가 삭제되었습니다." };
    }),

  /**
   * ★ 견적서 → 매출 전표 변환 (accepted → converted)
   *
   * accounting_sales 에 라인별 매출 전표 생성
   * (haccpIntegration.createSale 재사용)
   */
  convertToSale: adminProcedure
    .input(z.object({ id: z.number(), saleDate: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");

      const [quo] = await db
        .select()
        .from(quotations)
        .where(
          and(eq(quotations.id, input.id), eq(quotations.tenantId, ctx.tenantId)),
        )
        .limit(1);
      if (!quo) throw new Error(`견적서 #${input.id} 없음`);
      if (quo.status !== "accepted") {
        throw new Error(`수락(accepted) 상태 견적서만 변환 가능. 현재: ${quo.status}`);
      }

      const lines = await db
        .select()
        .from(quotationLines)
        .where(
          and(
            eq(quotationLines.quotationId, input.id),
            eq(quotationLines.tenantId, ctx.tenantId),
          ),
        )
        .orderBy(quotationLines.lineNumber);

      const saleDate = input.saleDate || new Date().toISOString().slice(0, 10);
      const { createSale } = await import("../../db/haccp/haccpIntegration");
      const createdSaleIds: number[] = [];

      for (const line of lines) {
        const result: any = await createSale(
          {
            transactionDate: saleDate,
            partnerId: quo.partnerId,
            itemName: line.itemName,
            quantity: Number(line.quantity),
            unitPrice: Number(line.unitPrice),
            amount: Number(line.amount),
            taxAmount: Number(line.taxAmount || 0),
            memo: `견적서 ${quo.quotationNumber} 변환 (라인 ${line.lineNumber})`,
            unit: line.unit,
            createdBy: ctx.user.id,
          },
          ctx.tenantId,
        );
        if (result?.insertId) createdSaleIds.push(Number(result.insertId));
      }

      // 견적서 상태 → converted
      await db
        .update(quotations)
        .set({
          status: "converted",
          convertedSaleId: createdSaleIds[0] ?? null,
          convertedAt: new Date(),
        })
        .where(
          and(eq(quotations.id, input.id), eq(quotations.tenantId, ctx.tenantId)),
        );

      return {
        message: `견적서를 매출 전표 ${createdSaleIds.length}건으로 변환했습니다.`,
        createdSaleIds,
      };
    }),

  /**
   * ★ 견적서 PDF 생성
   */
  generatePdf: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");

      const [quo] = await db
        .select()
        .from(quotations)
        .leftJoin(
          partners,
          and(
            eq(quotations.partnerId, partners.id),
            eq(partners.tenantId, ctx.tenantId),
          ),
        )
        .where(
          and(eq(quotations.id, input.id), eq(quotations.tenantId, ctx.tenantId)),
        )
        .limit(1);
      if (!quo) throw new Error(`견적서 #${input.id} 없음`);

      const lines = await db
        .select()
        .from(quotationLines)
        .where(
          and(
            eq(quotationLines.quotationId, input.id),
            eq(quotationLines.tenantId, ctx.tenantId),
          ),
        )
        .orderBy(quotationLines.lineNumber);

      const { getCompanyInfo } = await import("../../db/system/companyInfo");
      const companyInfo = await getCompanyInfo(ctx.tenantId);

      const header = (quo as any).quotations;
      const partner = (quo as any).partners;

      const { generateQuotationPDF } = await import("../../lib/quotationPdf");
      const pdfBuffer = await generateQuotationPDF({
        quotationNumber: header.quotationNumber,
        quoteDate: header.quoteDate,
        validUntil: header.validUntil,
        title: header.title,
        seller: {
          name: companyInfo.companyName || "회사명 미설정",
          businessNumber: companyInfo.companyBusinessNumber,
          address: companyInfo.companyAddress,
          representative: companyInfo.companyRepresentative,
          phone: companyInfo.companyPhone,
        },
        customer: {
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
          description: l.description || undefined,
          quantity: Number(l.quantity),
          unit: l.unit || "EA",
          unitPrice: Number(l.unitPrice),
          discountRate: Number(l.discountRate || 0),
          amount: Number(l.amount),
        })),
        totalAmount: Number(header.totalAmount || 0),
        taxAmount: Number(header.taxAmount || 0),
        grandTotal: Number(header.grandTotal || 0),
        paymentTerms: header.paymentTerms || undefined,
        deliveryTerms: header.deliveryTerms || undefined,
        notes: header.notes || undefined,
        status: header.status,
      });

      return {
        pdf: pdfBuffer.toString("base64"),
        filename: `견적서_${header.quotationNumber}_${todayKST()}.pdf`,
      };
    }),

  /**
   * 견적서 통계 (대시보드 KPI)
   */
  stats: tenantRequiredProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("DB 연결 실패");

    const result: any = await db.execute(sql`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) AS draftCount,
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sentCount,
        SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) AS acceptedCount,
        SUM(CASE WHEN status = 'converted' THEN 1 ELSE 0 END) AS convertedCount,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejectedCount,
        COALESCE(SUM(CASE WHEN status IN ('sent','accepted','converted') THEN grand_total ELSE 0 END), 0) AS pipelineAmount
      FROM quotations
      WHERE tenant_id = ${ctx.tenantId}
    `);
    const row = (result as any)?.[0]?.[0] || {};
    return {
      total: Number(row.total || 0),
      draftCount: Number(row.draftCount || 0),
      sentCount: Number(row.sentCount || 0),
      acceptedCount: Number(row.acceptedCount || 0),
      convertedCount: Number(row.convertedCount || 0),
      rejectedCount: Number(row.rejectedCount || 0),
      pipelineAmount: Number(row.pipelineAmount || 0),
    };
  }),

  /**
   * ★ 반복 판매 품목 추천 — Phase B (2026-04-14)
   *
   * 고객 선택 시 해당 고객사에게 과거에 자주/최근에 판매한 품목을
   * 집계해서 견적서 라인 프리필 용도로 반환.
   *
   * 집계 소스:
   *   - quotation_lines + quotations (견적 이력)
   *   - accounting_sales (매출 이력)
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

      // quotation_lines 기반 집계
      const quoHistoryResult: any = await db.execute(sql`
        SELECT
          ql.target_type AS targetType,
          ql.material_id AS materialId,
          ql.product_id AS productId,
          ql.item_name AS itemName,
          ql.item_code AS itemCode,
          ql.unit AS unit,
          COUNT(*) AS purchaseCount,
          AVG(CAST(ql.unit_price AS DECIMAL(15,2))) AS avgPrice,
          MIN(CAST(ql.unit_price AS DECIMAL(15,2))) AS minPrice,
          MAX(CAST(ql.unit_price AS DECIMAL(15,2))) AS maxPrice,
          MAX(q.quote_date) AS lastOrderDate,
          SUM(CAST(ql.quantity AS DECIMAL(15,3))) AS totalQty,
          AVG(CAST(ql.quantity AS DECIMAL(15,3))) AS avgQty
        FROM quotation_lines ql
        INNER JOIN quotations q
          ON ql.quotation_id = q.id AND ql.tenant_id = q.tenant_id
        WHERE q.tenant_id = ${ctx.tenantId}
          AND q.partner_id = ${input.partnerId}
          AND q.status NOT IN ('cancelled', 'rejected')
        GROUP BY ql.target_type, ql.material_id, ql.product_id, ql.item_name, ql.item_code, ql.unit
        ORDER BY purchaseCount DESC, lastOrderDate DESC
        LIMIT ${input.limit}
      `);
      const quoRows: any[] = quoHistoryResult?.[0] || [];

      // accounting_sales 기반 집계
      const saleHistoryResult: any = await db.execute(sql`
        SELECT
          'product' AS targetType,
          asa.product_id AS productId,
          NULL AS materialId,
          asa.item_name AS itemName,
          NULL AS itemCode,
          asa.unit AS unit,
          COUNT(*) AS purchaseCount,
          AVG(CAST(asa.unit_price AS DECIMAL(15,2))) AS avgPrice,
          MIN(CAST(asa.unit_price AS DECIMAL(15,2))) AS minPrice,
          MAX(CAST(asa.unit_price AS DECIMAL(15,2))) AS maxPrice,
          MAX(asa.transaction_date) AS lastOrderDate,
          SUM(CAST(asa.quantity AS DECIMAL(15,3))) AS totalQty,
          AVG(CAST(asa.quantity AS DECIMAL(15,3))) AS avgQty
        FROM accounting_sales asa
        WHERE asa.tenant_id = ${ctx.tenantId}
          AND asa.partner_id = ${input.partnerId}
          AND asa.status != 'cancelled'
        GROUP BY asa.product_id, asa.item_name, asa.unit
        ORDER BY purchaseCount DESC, lastOrderDate DESC
        LIMIT ${input.limit}
      `);
      const saleRows: any[] = saleHistoryResult?.[0] || [];

      // 병합
      const merged = new Map<string, any>();
      const mergeRow = (row: any) => {
        const key = row.productId
          ? `p-${row.productId}`
          : row.materialId
            ? `m-${row.materialId}`
            : `n-${(row.itemName || "").trim()}`;
        const existing = merged.get(key);
        if (!existing) {
          merged.set(key, {
            key,
            targetType: row.targetType || "product",
            materialId: row.materialId ? Number(row.materialId) : null,
            productId: row.productId ? Number(row.productId) : null,
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
          existing.purchaseCount += Number(row.purchaseCount || 0);
          existing.totalQty += Number(row.totalQty || 0);
          if (row.lastOrderDate && (!existing.lastOrderDate || row.lastOrderDate > existing.lastOrderDate)) {
            existing.lastOrderDate = row.lastOrderDate;
          }
          existing.avgPrice = Math.round((existing.avgPrice + Number(row.avgPrice || 0)) / 2);
        }
      };
      quoRows.forEach(mergeRow);
      saleRows.forEach(mergeRow);

      const today = new Date();
      const scored = Array.from(merged.values()).map((item: any) => {
        const lastDate = item.lastOrderDate ? new Date(item.lastOrderDate) : null;
        const daysSince = lastDate
          ? Math.max(1, Math.round((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)))
          : 999;
        const score = Math.round((item.purchaseCount * 10) / Math.sqrt(daysSince));
        return { ...item, daysSinceLast: daysSince, score };
      });

      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, input.limit);
    }),

  /** 견적서 복사 */
  duplicate: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const pool = (await import("../../db/pool")).getPool();
      const tenantId = ctx.tenantId;

      // 원본 조회
      const [headers]: any = await pool.execute(
        `SELECT * FROM quotations WHERE id = ? AND tenant_id = ?`, [input.id, tenantId]);
      if (!headers[0]) throw new Error("원본 견적서를 찾을 수 없습니다.");
      const orig = headers[0];

      const newNumber = await generateQuotationNumber(tenantId);
      const today = new Date().toISOString().slice(0, 10);

      const [result]: any = await pool.execute(
        `INSERT INTO quotations (tenant_id, quotation_number, partner_id, quote_date,
          valid_until, title, payment_terms, delivery_terms, notes, total_amount, tax_amount, grand_total,
          status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`,
        [tenantId, newNumber, orig.partner_id, today,
         orig.valid_until, `[복사] ${orig.title || ""}`, orig.payment_terms, orig.delivery_terms,
         orig.notes, orig.total_amount, orig.tax_amount, orig.grand_total, ctx.user.id],
      );
      const newId = result.insertId;

      // 라인 복사
      const [lines]: any = await pool.execute(
        `SELECT * FROM quotation_lines WHERE quotation_id = ? AND tenant_id = ?`, [input.id, tenantId]);
      for (const line of lines as any[]) {
        await pool.execute(
          `INSERT INTO quotation_lines (tenant_id, quotation_id, line_number, target_type,
            material_id, product_id, item_name, item_code, description, quantity, unit,
            unit_price, discount_rate, amount, tax_amount)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [tenantId, newId, line.line_number, line.target_type,
           line.material_id, line.product_id, line.item_name, line.item_code, line.description,
           line.quantity, line.unit, line.unit_price, line.discount_rate, line.amount, line.tax_amount],
        );
      }

      return { id: newId, quotationNumber: newNumber, message: "견적서가 복사되었습니다." };
    }),

  /** 거래처별 견적 이력 */
  partnerHistory: tenantRequiredProcedure
    .input(z.object({ partnerId: z.number().optional(), partnerName: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const pool = (await import("../../db/pool")).getPool();
      const tenantId = ctx.tenantId;

      let where = `WHERE q.tenant_id = ? AND (p.tenant_id = ? OR p.tenant_id IS NULL)`;
      const params: any[] = [tenantId, tenantId];
      if (input.partnerId) { where += ` AND q.partner_id = ?`; params.push(input.partnerId); }
      else if (input.partnerName) { where += ` AND p.company_name LIKE ?`; params.push(`%${input.partnerName}%`); }
      else { return { history: [], summary: null }; }

      const [rows]: any = await pool.execute(
        `SELECT q.id, q.quotation_number, q.quote_date, q.title, q.grand_total, q.status,
                p.company_name AS partner_name, q.created_at
         FROM quotations q
         LEFT JOIN partners p ON p.id = q.partner_id
         ${where}
         ORDER BY q.quote_date DESC LIMIT 50`, params);

      const history = rows as any[];
      const totalCount = history.length;
      const totalAmount = history.reduce((s: number, h: any) => s + Number(h.grand_total || 0), 0);
      const convertedCount = history.filter((h: any) => h.status === "converted").length;
      const conversionRate = totalCount > 0 ? Math.round((convertedCount / totalCount) * 100) : 0;

      return {
        history: history.map((h: any) => ({
          id: h.id, number: h.quotation_number,
          date: h.quote_date instanceof Date ? h.quote_date.toISOString().slice(0, 10) : String(h.quote_date || ""),
          title: h.title, amount: Number(h.grand_total || 0), status: h.status,
        })),
        summary: { totalCount, totalAmount, convertedCount, conversionRate },
      };
    }),
});

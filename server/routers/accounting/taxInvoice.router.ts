/**
 * 세금계산서 (Tax Invoice) 라우터 — Phase C (2026-04-14)
 * ═══════════════════════════════════════════════════════════════
 * - 사내 발행 (PDF) + 팝빌 어댑터 연동
 * - 매출(sales) / 매입(purchase) 양방향 지원
 * - 부가세 신고 자료 (Phase C-8) 의 데이터 원천
 * ═══════════════════════════════════════════════════════════════
 */
import { router, tenantRequiredProcedure, adminProcedure } from "../../_core/trpc";
import { z } from "zod";
import { getDb, withTransaction } from "../../db";
import { taxInvoices, taxInvoiceLines, popbillSettings } from "../../../drizzle/schema/schema_tax_invoices";
import { partners } from "../../../drizzle/schema/schema_main_accounting";
import { and, eq, desc, sql, like, gte, lte } from "drizzle-orm";

// ─── 세금계산서 번호 자동 생성 (TI-YYYY-MM-NNNN) ───────────────
async function generateInvoiceNumber(tenantId: number, invoiceType: string): Promise<string> {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const prefix = invoiceType === "sales"
    ? `TI-${year}-${month}-`
    : `PI-${year}-${month}-`;

  const pool = await (await import("../../db")).getRawConnection();
  const [rows]: any = await pool.execute(
    `SELECT invoice_number FROM tax_invoices
     WHERE tenant_id = ? AND invoice_number LIKE ?
     ORDER BY id DESC LIMIT 1`,
    [tenantId, `${prefix}%`],
  );

  let nextSeq = 1;
  if (rows && rows[0]?.invoice_number) {
    const match = rows[0].invoice_number.match(/-(\d+)$/);
    if (match) nextSeq = parseInt(match[1], 10) + 1;
  }
  return `${prefix}${String(nextSeq).padStart(4, "0")}`;
}

// ─── Zod ────────────────────────────────────────────────────
const lineInput = z.object({
  itemName: z.string().min(1),
  itemSpec: z.string().optional(),
  quantity: z.number().optional(),
  unit: z.string().optional(),
  unitPrice: z.number().optional(),
  supplyAmount: z.number().nonnegative(),
  taxAmount: z.number().nonnegative().optional(),
  notes: z.string().optional(),
});

const createInput = z.object({
  invoiceType: z.enum(["sales", "purchase"]),
  taxCategory: z.enum(["taxed", "zero_rated", "tax_free"]).default("taxed"),
  receiptType: z.enum(["invoice", "receipt"]).default("invoice"),
  partnerId: z.number(),
  issueDate: z.string(),
  supplyDate: z.string().optional(),
  sourceType: z.enum(["sale", "quotation", "purchase", "manual"]).optional(),
  sourceId: z.number().optional(),
  remark1: z.string().optional(),
  remark2: z.string().optional(),
  remark3: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(lineInput).min(1, "최소 1개 라인 필요"),
});

// ─── Router ─────────────────────────────────────────────────
export const taxInvoiceRouter = router({
  /**
   * 세금계산서 목록
   */
  list: tenantRequiredProcedure
    .input(
      z
        .object({
          invoiceType: z.enum(["sales", "purchase"]).optional(),
          status: z
            .enum([
              "draft",
              "issued",
              "sent_to_popbill",
              "approved",
              "rejected",
              "cancelled",
            ])
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

      const conditions: any[] = [eq(taxInvoices.tenantId, ctx.tenantId)];
      if (input?.invoiceType) conditions.push(eq(taxInvoices.invoiceType, input.invoiceType));
      if (input?.status) conditions.push(eq(taxInvoices.status, input.status));
      if (input?.partnerId) conditions.push(eq(taxInvoices.partnerId, input.partnerId));
      if (input?.startDate) conditions.push(gte(taxInvoices.issueDate, input.startDate));
      if (input?.endDate) conditions.push(lte(taxInvoices.issueDate, input.endDate));
      if (input?.search) {
        conditions.push(like(taxInvoices.invoiceNumber, `%${input.search}%`));
      }

      return await db
        .select({
          id: taxInvoices.id,
          invoiceNumber: taxInvoices.invoiceNumber,
          invoiceType: taxInvoices.invoiceType,
          taxCategory: taxInvoices.taxCategory,
          receiptType: taxInvoices.receiptType,
          partnerId: taxInvoices.partnerId,
          partnerName: partners.companyName,
          partnerBizNo: taxInvoices.partnerBizNo,
          issueDate: taxInvoices.issueDate,
          supplyDate: taxInvoices.supplyDate,
          supplyAmount: taxInvoices.supplyAmount,
          taxAmount: taxInvoices.taxAmount,
          totalAmount: taxInvoices.totalAmount,
          status: taxInvoices.status,
          popbillMgtKey: taxInvoices.popbillMgtKey,
          popbillIssueId: taxInvoices.popbillIssueId,
          createdAt: taxInvoices.createdAt,
        })
        .from(taxInvoices)
        .leftJoin(partners, eq(taxInvoices.partnerId, partners.id))
        .where(and(...conditions))
        .orderBy(desc(taxInvoices.issueDate), desc(taxInvoices.id));
    }),

  /**
   * 상세 조회 (라인 포함)
   */
  getById: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");

      const [ti] = await db
        .select()
        .from(taxInvoices)
        .leftJoin(partners, eq(taxInvoices.partnerId, partners.id))
        .where(
          and(eq(taxInvoices.id, input.id), eq(taxInvoices.tenantId, ctx.tenantId)),
        )
        .limit(1);
      if (!ti) throw new Error(`세금계산서 #${input.id} 없음`);

      const lines = await db
        .select()
        .from(taxInvoiceLines)
        .where(
          and(
            eq(taxInvoiceLines.taxInvoiceId, input.id),
            eq(taxInvoiceLines.tenantId, ctx.tenantId),
          ),
        )
        .orderBy(taxInvoiceLines.lineNumber);

      return {
        ...(ti as any).tax_invoices,
        partner: (ti as any).partners,
        lines,
      };
    }),

  /**
   * 세금계산서 생성 (draft)
   */
  create: adminProcedure.input(createInput).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("DB 연결 실패");

    // 거래처 정보 snapshot
    const [partner] = await db
      .select()
      .from(partners)
      .where(and(eq(partners.id, input.partnerId), eq(partners.tenantId, ctx.tenantId)))
      .limit(1);
    if (!partner) throw new Error("거래처를 찾을 수 없습니다.");

    // 발행자 정보 (회사 정보)
    const { getCompanyInfo } = await import("../../db/system/companyInfo");
    const company = await getCompanyInfo(ctx.tenantId);

    // 합계 계산
    let supplyAmount = 0;
    let taxAmount = 0;
    for (const line of input.lines) {
      supplyAmount += line.supplyAmount;
      const isTaxed = input.taxCategory === "taxed";
      const lineTax = line.taxAmount ?? (isTaxed ? Math.round(line.supplyAmount * 0.1) : 0);
      taxAmount += lineTax;
    }
    const totalAmount = supplyAmount + taxAmount;

    const invoiceNumber = await generateInvoiceNumber(ctx.tenantId, input.invoiceType);

    return await withTransaction(async (conn) => {
      const [headerResult] = await conn.execute(
        `INSERT INTO tax_invoices
           (tenant_id, invoice_number, invoice_type, tax_category, receipt_type,
            partner_id, partner_biz_no, partner_name, partner_ceo, partner_address,
            issuer_biz_no, issuer_name,
            issue_date, supply_date,
            supply_amount, tax_amount, total_amount,
            status, source_type, source_id,
            remark1, remark2, remark3, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?)`,
        [
          ctx.tenantId,
          invoiceNumber,
          input.invoiceType,
          input.taxCategory,
          input.receiptType,
          input.partnerId,
          partner.bizNo || null,
          partner.companyName || null,
          partner.ceoName || null,
          partner.address || null,
          company.companyBusinessNumber || null,
          company.companyName || null,
          input.issueDate,
          input.supplyDate ?? null,
          supplyAmount.toFixed(2),
          taxAmount.toFixed(2),
          totalAmount.toFixed(2),
          input.sourceType ?? null,
          input.sourceId ?? null,
          input.remark1 ?? null,
          input.remark2 ?? null,
          input.remark3 ?? null,
          input.notes ?? null,
          ctx.user.id,
        ],
      );
      const taxInvoiceId = Number((headerResult as any).insertId);

      // 라인 insert
      let lineNumber = 1;
      for (const line of input.lines) {
        const lineTax =
          line.taxAmount ??
          (input.taxCategory === "taxed" ? Math.round(line.supplyAmount * 0.1) : 0);
        await conn.execute(
          `INSERT INTO tax_invoice_lines
             (tenant_id, tax_invoice_id, line_number, item_name, item_spec,
              quantity, unit, unit_price, supply_amount, tax_amount, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            ctx.tenantId,
            taxInvoiceId,
            lineNumber++,
            line.itemName,
            line.itemSpec ?? null,
            line.quantity?.toString() ?? null,
            line.unit ?? null,
            line.unitPrice?.toFixed(2) ?? null,
            line.supplyAmount.toFixed(2),
            lineTax.toFixed(2),
            line.notes ?? null,
          ],
        );
      }

      return {
        id: taxInvoiceId,
        invoiceNumber,
        message: `세금계산서 ${invoiceNumber} 생성 완료`,
      };
    }, "taxInvoice.create");
  }),

  /**
   * 사내 발행 (draft → issued)
   */
  issue: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await withTransaction(async (conn) => {
        const [rows]: any = await conn.execute(
          `SELECT status FROM tax_invoices WHERE id = ? AND tenant_id = ? FOR UPDATE`,
          [input.id, ctx.tenantId],
        );
        const current = (rows as any[])[0];
        if (!current) throw new Error(`세금계산서 #${input.id} 없음`);
        if (current.status !== "draft") {
          throw new Error(`작성 중(draft)만 발행 가능. 현재: ${current.status}`);
        }
        await conn.execute(
          `UPDATE tax_invoices
           SET status = 'issued', issued_by = ?, issued_at = NOW()
           WHERE id = ? AND tenant_id = ?`,
          [ctx.user.id, input.id, ctx.tenantId],
        );
      }, `taxInvoice.issue:${input.id}`);
      return { message: "세금계산서가 발행되었습니다." };
    }),

  /**
   * 취소 (issued/approved → cancelled)
   * 팝빌에 전송된 건은 cancelTaxInvoice 호출
   */
  cancel: adminProcedure
    .input(z.object({ id: z.number(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");

      const [ti] = await db
        .select()
        .from(taxInvoices)
        .where(
          and(eq(taxInvoices.id, input.id), eq(taxInvoices.tenantId, ctx.tenantId)),
        )
        .limit(1);
      if (!ti) throw new Error(`세금계산서 #${input.id} 없음`);
      if (ti.status === "cancelled") {
        throw new Error("이미 취소된 세금계산서입니다.");
      }

      // 팝빌 전송된 건은 팝빌 취소 호출
      if (ti.popbillMgtKey && ti.status === "approved") {
        const { cancelTaxInvoice } = await import("../../lib/popbill/popbillAdapter");
        const result = await cancelTaxInvoice(
          (ti.issuerBizNo || "").replace(/-/g, ""),
          ti.popbillMgtKey,
          input.reason,
        );
        if (!result.success) {
          throw new Error(`팝빌 취소 실패: ${result.message}`);
        }
      }

      await db
        .update(taxInvoices)
        .set({
          status: "cancelled",
          cancelledAt: new Date(),
          cancelReason: input.reason ?? null,
        })
        .where(
          and(eq(taxInvoices.id, input.id), eq(taxInvoices.tenantId, ctx.tenantId)),
        );

      return { message: "세금계산서가 취소되었습니다." };
    }),

  /**
   * 삭제 (draft 만)
   */
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await withTransaction(async (conn) => {
        const [rows]: any = await conn.execute(
          `SELECT status FROM tax_invoices WHERE id = ? AND tenant_id = ? FOR UPDATE`,
          [input.id, ctx.tenantId],
        );
        const current = (rows as any[])[0];
        if (!current) throw new Error(`세금계산서 #${input.id} 없음`);
        if (current.status !== "draft") {
          throw new Error(`작성 중만 삭제 가능. 현재: ${current.status}`);
        }
        await conn.execute(
          `DELETE FROM tax_invoice_lines WHERE tax_invoice_id = ? AND tenant_id = ?`,
          [input.id, ctx.tenantId],
        );
        await conn.execute(
          `DELETE FROM tax_invoices WHERE id = ? AND tenant_id = ?`,
          [input.id, ctx.tenantId],
        );
      }, `taxInvoice.delete:${input.id}`);
      return { message: "세금계산서가 삭제되었습니다." };
    }),

  /**
   * ★ 팝빌 전송 (issued → sent_to_popbill → approved)
   *
   * 1. 세금계산서 + 라인 조회
   * 2. popbillAdapter.buildPopbillPayload 로 변환
   * 3. issueTaxInvoice 호출
   * 4. 결과 저장 (popbill_mgt_key, popbill_issue_id, response)
   */
  sendToPopbill: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");

      const [ti] = await db
        .select()
        .from(taxInvoices)
        .where(
          and(eq(taxInvoices.id, input.id), eq(taxInvoices.tenantId, ctx.tenantId)),
        )
        .limit(1);
      if (!ti) throw new Error(`세금계산서 #${input.id} 없음`);
      if (!["issued", "draft"].includes(ti.status!)) {
        throw new Error(`발행(issued) 또는 작성(draft) 상태만 팝빌 전송 가능. 현재: ${ti.status}`);
      }
      if (ti.invoiceType !== "sales") {
        throw new Error("매출 세금계산서만 팝빌로 발행 가능합니다.");
      }
      if (!ti.issuerBizNo) {
        throw new Error("발행자 사업자번호가 없습니다. 회사 정보를 먼저 등록하세요.");
      }

      const lines = await db
        .select()
        .from(taxInvoiceLines)
        .where(
          and(
            eq(taxInvoiceLines.taxInvoiceId, input.id),
            eq(taxInvoiceLines.tenantId, ctx.tenantId),
          ),
        )
        .orderBy(taxInvoiceLines.lineNumber);

      const { buildPopbillPayload, issueTaxInvoice, isPopbillStubMode } = await import(
        "../../lib/popbill/popbillAdapter"
      );

      // 사내 발번호 → 팝빌 mgtKey (재시도 시 동일 키)
      const mgtKey = ti.popbillMgtKey || `TI-${ti.tenantId}-${ti.id}`;

      const payload = buildPopbillPayload(
        { ...ti, popbillMgtKey: mgtKey },
        lines,
        ti.issuerBizNo,
        ti.issuerName || "",
      );

      // 팝빌 호출
      const result = await issueTaxInvoice(payload, "사내 발행 → 팝빌 전송");

      // 결과 저장
      await db
        .update(taxInvoices)
        .set({
          status: result.success ? "approved" : "rejected",
          popbillMgtKey: mgtKey,
          popbillIssueId: result.ntsConfirmNum ?? null,
          popbillResponse: result.raw ?? null,
        })
        .where(
          and(eq(taxInvoices.id, input.id), eq(taxInvoices.tenantId, ctx.tenantId)),
        );

      return {
        message: result.success
          ? `팝빌 발행 성공 ${isPopbillStubMode() ? "(STUB)" : ""}`
          : `발행 실패: ${result.message}`,
        result,
      };
    }),

  /**
   * 통계 (KPI)
   */
  stats: tenantRequiredProcedure
    .input(z.object({ year: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");

      const year = input?.year || new Date().getFullYear();
      const yearPrefix = `${year}-`;

      const result: any = await db.execute(sql`
        SELECT
          invoice_type,
          tax_category,
          COUNT(*) AS count,
          COALESCE(SUM(supply_amount), 0) AS supplyTotal,
          COALESCE(SUM(tax_amount), 0) AS taxTotal,
          COALESCE(SUM(total_amount), 0) AS grandTotal
        FROM tax_invoices
        WHERE tenant_id = ${ctx.tenantId}
          AND issue_date LIKE ${yearPrefix + "%"}
          AND status NOT IN ('draft', 'cancelled')
        GROUP BY invoice_type, tax_category
      `);
      return (result as any)[0] || [];
    }),
});

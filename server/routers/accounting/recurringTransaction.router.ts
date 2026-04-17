/**
 * 반복거래 라우터 — 매입/매출 복사 생성 + 반복 템플릿
 */
import { z } from "zod";
import { router, adminProcedure, tenantRequiredProcedure } from "../../_core/trpc";
import { getPool } from "../../db/pool";

export const recurringTransactionRouter = router({
  /**
   * 매입 복사 생성 (기존 매입을 날짜만 바꿔서 복사)
   */
  duplicatePurchase: adminProcedure
    .input(z.object({ purchaseId: z.number(), newDate: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const pool = getPool();
      const [rows]: any = await pool.execute(
        `SELECT * FROM accounting_purchases WHERE id = ? AND tenant_id = ?`,
        [input.purchaseId, ctx.tenantId],
      );
      if (!rows[0]) throw new Error("원본 매입을 찾을 수 없습니다.");
      const p = rows[0];

      const [result]: any = await pool.execute(
        `INSERT INTO accounting_purchases
           (tenant_id, transaction_date, partner_id, item_name, quantity, unit, unit_price,
            total_amount, tax_amount, tax_rate, material_id, notes, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
        [ctx.tenantId, input.newDate, p.partner_id, p.item_name, p.quantity, p.unit,
         p.unit_price, p.total_amount, p.tax_amount, p.tax_rate, p.material_id,
         `[복사] 원본 #${input.purchaseId}`, ctx.user.id],
      );
      return { id: result.insertId, message: "매입이 복사되었습니다." };
    }),

  /**
   * 매출 복사 생성
   */
  duplicateSale: adminProcedure
    .input(z.object({ saleId: z.number(), newDate: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const pool = getPool();
      const [rows]: any = await pool.execute(
        `SELECT * FROM accounting_sales WHERE id = ? AND tenant_id = ?`,
        [input.saleId, ctx.tenantId],
      );
      if (!rows[0]) throw new Error("원본 매출을 찾을 수 없습니다.");
      const s = rows[0];

      const [result]: any = await pool.execute(
        `INSERT INTO accounting_sales
           (tenant_id, transaction_date, partner_id, item_name, quantity, unit, unit_price,
            total_amount, tax_amount, tax_rate, notes, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
        [ctx.tenantId, input.newDate, s.partner_id, s.item_name, s.quantity, s.unit,
         s.unit_price, s.total_amount, s.tax_amount, s.tax_rate,
         `[복사] 원본 #${input.saleId}`, ctx.user.id],
      );
      return { id: result.insertId, message: "매출이 복사되었습니다." };
    }),

  /**
   * 반복 거래 템플릿 목록
   */
  listTemplates: tenantRequiredProcedure.query(async ({ ctx }) => {
    const pool = getPool();
    try {
      const [rows]: any = await pool.execute(
        `SELECT * FROM recurring_templates WHERE tenant_id = ? ORDER BY created_at DESC`,
        [ctx.tenantId],
      );
      return (rows as any[]).map((r: any) => ({
        id: r.id, type: r.type, name: r.name, partnerId: r.partner_id,
        itemName: r.item_name, quantity: Number(r.quantity || 0),
        unitPrice: Number(r.unit_price || 0), amount: Number(r.amount || 0),
        frequency: r.frequency, nextDate: r.next_date,
        isActive: r.is_active, lastGenerated: r.last_generated,
      }));
    } catch (_) { return []; }
  }),

  /**
   * 반복 거래 템플릿 생성
   */
  createTemplate: adminProcedure
    .input(z.object({
      type: z.enum(["purchase", "sale"]),
      name: z.string().min(1),
      partnerId: z.number().optional(),
      itemName: z.string(),
      quantity: z.number(),
      unitPrice: z.number(),
      amount: z.number(),
      frequency: z.enum(["monthly", "quarterly", "yearly"]),
      nextDate: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const pool = getPool();
      try {
        await pool.execute(
          `CREATE TABLE IF NOT EXISTS recurring_templates (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            tenant_id INT NOT NULL,
            type ENUM('purchase','sale') NOT NULL,
            name VARCHAR(200) NOT NULL,
            partner_id BIGINT NULL,
            item_name VARCHAR(200),
            quantity DECIMAL(15,3) DEFAULT 0,
            unit_price DECIMAL(15,2) DEFAULT 0,
            amount DECIMAL(15,2) DEFAULT 0,
            frequency ENUM('monthly','quarterly','yearly') DEFAULT 'monthly',
            next_date DATE,
            is_active TINYINT DEFAULT 1,
            last_generated DATE NULL,
            created_by BIGINT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_rt_tenant (tenant_id)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
        );
      } catch (_) {}

      const [result]: any = await pool.execute(
        `INSERT INTO recurring_templates (tenant_id, type, name, partner_id, item_name, quantity, unit_price, amount, frequency, next_date, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [ctx.tenantId, input.type, input.name, input.partnerId || null,
         input.itemName, input.quantity, input.unitPrice, input.amount,
         input.frequency, input.nextDate, ctx.user.id],
      );
      return { id: result.insertId, message: "반복 거래 템플릿이 생성되었습니다." };
    }),

  /**
   * 반복 거래 실행 (템플릿 → 실제 매입/매출 생성)
   */
  generateFromTemplate: adminProcedure
    .input(z.object({ templateId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const pool = getPool();
      const [rows]: any = await pool.execute(
        `SELECT * FROM recurring_templates WHERE id = ? AND tenant_id = ?`,
        [input.templateId, ctx.tenantId],
      );
      if (!rows[0]) throw new Error("템플릿을 찾을 수 없습니다.");
      const t = rows[0];

      const taxAmount = Math.round(Number(t.amount) * 0.1);
      const totalAmount = Number(t.amount) + taxAmount;
      const table = t.type === "purchase" ? "accounting_purchases" : "accounting_sales";

      const [result]: any = await pool.execute(
        `INSERT INTO ${table}
           (tenant_id, transaction_date, partner_id, item_name, quantity, unit, unit_price,
            total_amount, tax_amount, tax_rate, notes, status, created_by)
         VALUES (?, ?, ?, ?, ?, 'EA', ?, ?, ?, '10.00', ?, 'pending', ?)`,
        [ctx.tenantId, t.next_date, t.partner_id, t.item_name, t.quantity,
         t.unit_price, totalAmount, taxAmount,
         `[반복] ${t.name}`, ctx.user.id],
      );

      // 다음 실행일 업데이트
      const freq = t.frequency === "monthly" ? 1 : t.frequency === "quarterly" ? 3 : 12;
      await pool.execute(
        `UPDATE recurring_templates SET last_generated = next_date,
           next_date = DATE_ADD(next_date, INTERVAL ? MONTH)
         WHERE id = ? AND tenant_id = ?`,
        [freq, input.templateId, ctx.tenantId],
      );

      return { id: result.insertId, message: `반복 거래 생성 완료 (${t.name})` };
    }),
});

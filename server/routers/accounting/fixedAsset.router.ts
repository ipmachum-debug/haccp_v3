/**
 * 고정자산 관리 라우터 — ERP 강화 Phase 2-1
 *
 * 자산 등록/조회/감가상각/처분
 * DB 테이블: fixed_assets (startupMigrations에서 자동 생성)
 */
import { z } from "zod";
import { router, tenantRequiredProcedure, adminProcedure } from "../../_core/trpc";
import { getPool } from "../../db/pool";
import { withTransaction } from "../../db";

export const fixedAssetRouter = router({
  /**
   * 고정자산 목록
   */
  list: tenantRequiredProcedure
    .input(z.object({
      status: z.enum(["active", "disposed", "all"]).optional(),
      search: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const pool = getPool();
      const tenantId = ctx.tenantId;

      let where = `WHERE fa.tenant_id = ?`;
      const params: any[] = [tenantId];

      if (input?.status && input.status !== "all") {
        where += ` AND fa.status = ?`;
        params.push(input.status);
      }
      if (input?.search) {
        where += ` AND (fa.asset_name LIKE ? OR fa.asset_code LIKE ?)`;
        params.push(`%${input.search}%`, `%${input.search}%`);
      }

      const [rows]: any = await pool.execute(
        `SELECT fa.*, u.name as registered_by_name,
                aa.name as account_name, aa.code as account_code
         FROM fixed_assets fa
         LEFT JOIN users u ON fa.registered_by = u.id
         LEFT JOIN accounting_accounts aa ON fa.accounting_account_id = aa.id
         ${where}
         ORDER BY fa.acquisition_date DESC, fa.id DESC`,
        params,
      );

      return (rows as any[]).map((r: any) => ({
        id: r.id,
        assetCode: r.asset_code,
        assetName: r.asset_name,
        category: r.category,
        acquisitionDate: r.acquisition_date,
        acquisitionCost: Number(r.acquisition_cost || 0),
        usefulLifeMonths: r.useful_life_months,
        depreciationMethod: r.depreciation_method,
        salvageValue: Number(r.salvage_value || 0),
        accumulatedDepreciation: Number(r.accumulated_depreciation || 0),
        bookValue: Number(r.acquisition_cost || 0) - Number(r.accumulated_depreciation || 0),
        status: r.status,
        disposalDate: r.disposal_date,
        disposalAmount: Number(r.disposal_amount || 0),
        location: r.location,
        notes: r.notes,
        accountName: r.account_name,
        accountCode: r.account_code,
        registeredByName: r.registered_by_name,
        createdAt: r.created_at,
      }));
    }),

  /**
   * 고정자산 요약 통계
   */
  summary: tenantRequiredProcedure.query(async ({ ctx }) => {
    const pool = getPool();
    const [rows]: any = await pool.execute(
      `SELECT
         COUNT(*) as totalCount,
         SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as activeCount,
         SUM(CASE WHEN status = 'disposed' THEN 1 ELSE 0 END) as disposedCount,
         COALESCE(SUM(CASE WHEN status = 'active' THEN CAST(acquisition_cost AS DECIMAL(15,2)) ELSE 0 END), 0) as totalCost,
         COALESCE(SUM(CASE WHEN status = 'active' THEN CAST(accumulated_depreciation AS DECIMAL(15,2)) ELSE 0 END), 0) as totalDepreciation,
         COALESCE(SUM(CASE WHEN status = 'active' THEN CAST(acquisition_cost AS DECIMAL(15,2)) - CAST(accumulated_depreciation AS DECIMAL(15,2)) ELSE 0 END), 0) as totalBookValue
       FROM fixed_assets WHERE tenant_id = ?`,
      [ctx.tenantId],
    );
    const r = rows[0];
    return {
      totalCount: Number(r.totalCount || 0),
      activeCount: Number(r.activeCount || 0),
      disposedCount: Number(r.disposedCount || 0),
      totalCost: Number(r.totalCost || 0),
      totalDepreciation: Number(r.totalDepreciation || 0),
      totalBookValue: Number(r.totalBookValue || 0),
    };
  }),

  /**
   * 고정자산 등록
   */
  create: adminProcedure
    .input(z.object({
      assetName: z.string().min(1),
      category: z.enum(["building", "machinery", "vehicle", "furniture", "computer", "other"]),
      acquisitionDate: z.string(),
      acquisitionCost: z.number().positive(),
      usefulLifeMonths: z.number().int().positive(),
      depreciationMethod: z.enum(["straight_line", "declining_balance"]).default("straight_line"),
      salvageValue: z.number().nonnegative().default(0),
      accountingAccountId: z.number().optional(),
      location: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const pool = getPool();
      const tenantId = ctx.tenantId;

      // 자산코드 자동생성
      const [lastCode]: any = await pool.execute(
        `SELECT asset_code FROM fixed_assets WHERE tenant_id = ? ORDER BY id DESC LIMIT 1`,
        [tenantId],
      );
      const nextNum = lastCode[0]?.asset_code
        ? Number(lastCode[0].asset_code.replace(/\D/g, "")) + 1
        : 1;
      const assetCode = `FA-${String(nextNum).padStart(4, "0")}`;

      const [result]: any = await pool.execute(
        `INSERT INTO fixed_assets
           (tenant_id, asset_code, asset_name, category, acquisition_date, acquisition_cost,
            useful_life_months, depreciation_method, salvage_value, accumulated_depreciation,
            accounting_account_id, location, notes, status, registered_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 'active', ?)`,
        [tenantId, assetCode, input.assetName, input.category, input.acquisitionDate,
         input.acquisitionCost, input.usefulLifeMonths, input.depreciationMethod,
         input.salvageValue, input.accountingAccountId || null,
         input.location || null, input.notes || null, ctx.user.id],
      );

      return { id: result.insertId, assetCode, message: "고정자산이 등록되었습니다." };
    }),

  /**
   * 감가상각 실행 (월별)
   */
  runDepreciation: adminProcedure
    .input(z.object({ yearMonth: z.string() })) // "2026-04"
    .mutation(async ({ ctx, input }) => {
      const pool = getPool();
      const tenantId = ctx.tenantId;

      // 활성 자산 조회
      const [assets]: any = await pool.execute(
        `SELECT id, asset_name, acquisition_cost, salvage_value, useful_life_months,
                depreciation_method, accumulated_depreciation, acquisition_date
         FROM fixed_assets
         WHERE tenant_id = ? AND status = 'active'`,
        [tenantId],
      );

      let processedCount = 0;
      let totalAmount = 0;

      for (const asset of assets as any[]) {
        const cost = Number(asset.acquisition_cost);
        const salvage = Number(asset.salvage_value || 0);
        const months = asset.useful_life_months;
        const accumulated = Number(asset.accumulated_depreciation || 0);
        const depreciable = cost - salvage;
        const bookValue = cost - accumulated;

        if (bookValue <= salvage) continue; // 이미 완전상각

        let monthlyAmount: number;
        if (asset.depreciation_method === "straight_line") {
          monthlyAmount = Math.round(depreciable / months);
        } else {
          // 정률법: 2/내용연수 × 장부가액
          const rate = 2 / months;
          monthlyAmount = Math.round(bookValue * rate);
        }

        // 잔존가치 이하로 떨어지지 않게
        monthlyAmount = Math.min(monthlyAmount, bookValue - salvage);
        if (monthlyAmount <= 0) continue;

        // 상각 기록
        await pool.execute(
          `INSERT INTO fixed_asset_depreciation
             (tenant_id, asset_id, year_month, amount, accumulated_after)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE amount = VALUES(amount), accumulated_after = VALUES(accumulated_after)`,
          [tenantId, asset.id, input.yearMonth, monthlyAmount, accumulated + monthlyAmount],
        );

        // 누적상각액 업데이트
        await pool.execute(
          `UPDATE fixed_assets SET accumulated_depreciation = accumulated_depreciation + ? WHERE id = ? AND tenant_id = ?`,
          [monthlyAmount, asset.id, tenantId],
        );

        processedCount++;
        totalAmount += monthlyAmount;
      }

      return {
        processedCount,
        totalAmount,
        message: `${input.yearMonth} 감가상각 완료: ${processedCount}건, ₩${totalAmount.toLocaleString()}`,
      };
    }),

  /**
   * 고정자산 처분
   */
  dispose: adminProcedure
    .input(z.object({
      id: z.number(),
      disposalDate: z.string(),
      disposalAmount: z.number().nonnegative(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const pool = getPool();
      await pool.execute(
        `UPDATE fixed_assets
         SET status = 'disposed', disposal_date = ?, disposal_amount = ?,
             notes = CONCAT(COALESCE(notes, ''), ?)
         WHERE id = ? AND tenant_id = ?`,
        [input.disposalDate, input.disposalAmount,
         `\n[처분] ${input.disposalDate}: ${input.reason || "처분"}`,
         input.id, ctx.tenantId],
      );
      return { message: "고정자산이 처분되었습니다." };
    }),

  /**
   * 감가상각 이력 조회
   */
  depreciationHistory: tenantRequiredProcedure
    .input(z.object({ assetId: z.number() }))
    .query(async ({ ctx, input }) => {
      const pool = getPool();
      const [rows]: any = await pool.execute(
        `SELECT year_month, amount, accumulated_after, created_at
         FROM fixed_asset_depreciation
         WHERE tenant_id = ? AND asset_id = ?
         ORDER BY year_month DESC`,
        [ctx.tenantId, input.assetId],
      );
      return (rows as any[]).map((r: any) => ({
        yearMonth: r.year_month,
        amount: Number(r.amount || 0),
        accumulatedAfter: Number(r.accumulated_after || 0),
        createdAt: r.created_at,
      }));
    }),
});

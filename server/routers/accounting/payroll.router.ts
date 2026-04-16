/**
 * 급여 관리 라우터 — ERP 강화 Phase 3-1
 *
 * 급여대장 + 급여명세서 + 4대보험 자동계산
 */
import { z } from "zod";
import { router, tenantRequiredProcedure, adminProcedure } from "../../_core/trpc";
import { getPool } from "../../db/pool";

// 4대보험 요율 (2026년 기준)
const INSURANCE_RATES = {
  nationalPension: 0.045,    // 국민연금 4.5% (근로자)
  healthInsurance: 0.03545,  // 건강보험 3.545% (근로자)
  longTermCare: 0.1295,      // 장기요양 12.95% (건강보험료의)
  employment: 0.009,         // 고용보험 0.9% (근로자)
};

// 간이세액표 기반 소득세 간편 계산
function calcIncomeTax(monthlyTaxableIncome: number): number {
  if (monthlyTaxableIncome <= 1500000) return 0;
  if (monthlyTaxableIncome <= 3000000) return Math.round((monthlyTaxableIncome - 1500000) * 0.06);
  if (monthlyTaxableIncome <= 5000000) return 90000 + Math.round((monthlyTaxableIncome - 3000000) * 0.15);
  if (monthlyTaxableIncome <= 8000000) return 390000 + Math.round((monthlyTaxableIncome - 5000000) * 0.24);
  return 1110000 + Math.round((monthlyTaxableIncome - 8000000) * 0.35);
}

export const payrollRouter = router({
  /**
   * 급여대장 목록 (년/월)
   */
  list: tenantRequiredProcedure
    .input(z.object({ year: z.number(), month: z.number() }))
    .query(async ({ ctx, input }) => {
      const pool = getPool();
      const yearMonth = `${input.year}-${String(input.month).padStart(2, "0")}`;

      try {
        const [rows]: any = await pool.execute(
          `SELECT p.*, e.name as employee_name, e.position, e.department
           FROM payroll_records p
           LEFT JOIN h_employees e ON p.employee_id = e.id
           WHERE p.tenant_id = ? AND p.year_month = ?
           ORDER BY e.name ASC`,
          [ctx.tenantId, yearMonth],
        );

      return (rows as any[]).map((r: any) => ({
        id: r.id,
        employeeId: r.employee_id,
        employeeName: r.employee_name,
        position: r.position,
        department: r.department,
        yearMonth: r.year_month,
        baseSalary: Number(r.base_salary || 0),
        overtime: Number(r.overtime || 0),
        bonus: Number(r.bonus || 0),
        allowances: Number(r.allowances || 0),
        grossPay: Number(r.gross_pay || 0),
        nationalPension: Number(r.national_pension || 0),
        healthInsurance: Number(r.health_insurance || 0),
        longTermCare: Number(r.long_term_care || 0),
        employment: Number(r.employment_insurance || 0),
        incomeTax: Number(r.income_tax || 0),
        localIncomeTax: Number(r.local_income_tax || 0),
        totalDeductions: Number(r.total_deductions || 0),
        netPay: Number(r.net_pay || 0),
        status: r.status,
        paidAt: r.paid_at,
      }));
      } catch (err: any) {
        console.warn("[payroll.list] 쿼리 실패:", err.message?.substring(0, 100));
        return [];
      }
    }),

  /**
   * 급여대장 요약
   */
  summary: tenantRequiredProcedure
    .input(z.object({ year: z.number(), month: z.number() }))
    .query(async ({ ctx, input }) => {
      try {
        const pool = getPool();
        const yearMonth = `${input.year}-${String(input.month).padStart(2, "0")}`;
        const [rows]: any = await pool.execute(
          `SELECT COUNT(*) as cnt,
             COALESCE(SUM(CAST(gross_pay AS DECIMAL(15,2))), 0) as totalGross,
             COALESCE(SUM(CAST(total_deductions AS DECIMAL(15,2))), 0) as totalDeductions,
             COALESCE(SUM(CAST(net_pay AS DECIMAL(15,2))), 0) as totalNet,
             SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) as paidCount
           FROM payroll_records WHERE tenant_id = ? AND year_month = ?`,
          [ctx.tenantId, yearMonth],
        );
        const r = rows[0];
        return { count: Number(r.cnt || 0), totalGross: Number(r.totalGross || 0),
          totalDeductions: Number(r.totalDeductions || 0), totalNet: Number(r.totalNet || 0),
          paidCount: Number(r.paidCount || 0) };
      } catch (err: any) {
        console.warn("[payroll.summary] 쿼리 실패:", err.message?.substring(0, 100));
        return { count: 0, totalGross: 0, totalDeductions: 0, totalNet: 0, paidCount: 0 };
      }
    }),

  /**
   * 급여 대상 직원 목록 (h_employees → users 폴백)
   */
  employees: tenantRequiredProcedure.query(async ({ ctx }) => {
    const pool = getPool();
    // users 테이블에서 직접 조회 (가장 확실한 소스)
    try {
      const [rows]: any = await pool.execute(
        `SELECT id, name, role as position, '' as department
         FROM users WHERE tenant_id = ? AND status = 'approved'
         ORDER BY name`,
        [ctx.tenantId],
      );
      if ((rows as any[]).length > 0) return rows;
    } catch (e: any) {
      console.warn("[payroll.employees] users 조회 실패:", e.message?.substring(0, 80));
    }
    // h_employees 폴백
    try {
      const [rows]: any = await pool.execute(
        `SELECT id, name, COALESCE(position, '') as position, COALESCE(department, '') as department
         FROM h_employees WHERE tenant_id = ? ORDER BY name`,
        [ctx.tenantId],
      );
      return rows;
    } catch (_) { return []; }
  }),

  /**
   * 급여 일괄 생성 (직원 목록 기반)
   */
  generate: adminProcedure
    .input(z.object({
      year: z.number(),
      month: z.number(),
      employees: z.array(z.object({
        employeeId: z.number(),
        baseSalary: z.number().nonnegative(),
        overtime: z.number().nonnegative().default(0),
        bonus: z.number().nonnegative().default(0),
        allowances: z.number().nonnegative().default(0),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      const pool = getPool();
      const tenantId = ctx.tenantId;
      const yearMonth = `${input.year}-${String(input.month).padStart(2, "0")}`;

      let created = 0;
      for (const emp of input.employees) {
        const grossPay = emp.baseSalary + emp.overtime + emp.bonus + emp.allowances;

        // 4대보험 계산
        const nationalPension = Math.round(grossPay * INSURANCE_RATES.nationalPension);
        const healthInsurance = Math.round(grossPay * INSURANCE_RATES.healthInsurance);
        const longTermCare = Math.round(healthInsurance * INSURANCE_RATES.longTermCare);
        const employmentIns = Math.round(grossPay * INSURANCE_RATES.employment);

        // 소득세 계산
        const taxableIncome = grossPay - nationalPension - healthInsurance - longTermCare - employmentIns;
        const incomeTax = calcIncomeTax(taxableIncome);
        const localIncomeTax = Math.round(incomeTax * 0.1); // 지방소득세 10%

        const totalDeductions = nationalPension + healthInsurance + longTermCare + employmentIns + incomeTax + localIncomeTax;
        const netPay = grossPay - totalDeductions;

        await pool.execute(
          `INSERT INTO payroll_records
             (tenant_id, employee_id, year_month, base_salary, overtime, bonus, allowances,
              gross_pay, national_pension, health_insurance, long_term_care, employment_insurance,
              income_tax, local_income_tax, total_deductions, net_pay, status, created_by)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'draft',?)
           ON DUPLICATE KEY UPDATE
             base_salary=VALUES(base_salary), overtime=VALUES(overtime), bonus=VALUES(bonus),
             allowances=VALUES(allowances), gross_pay=VALUES(gross_pay),
             national_pension=VALUES(national_pension), health_insurance=VALUES(health_insurance),
             long_term_care=VALUES(long_term_care), employment_insurance=VALUES(employment_insurance),
             income_tax=VALUES(income_tax), local_income_tax=VALUES(local_income_tax),
             total_deductions=VALUES(total_deductions), net_pay=VALUES(net_pay)`,
          [tenantId, emp.employeeId, yearMonth,
           emp.baseSalary, emp.overtime, emp.bonus, emp.allowances,
           grossPay, nationalPension, healthInsurance, longTermCare, employmentIns,
           incomeTax, localIncomeTax, totalDeductions, netPay, ctx.user.id],
        );
        created++;
      }

      return { created, message: `${yearMonth} 급여대장 ${created}건 생성 완료` };
    }),

  /**
   * 급여 지급 확정
   */
  confirmPayment: adminProcedure
    .input(z.object({ year: z.number(), month: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const pool = getPool();
      const yearMonth = `${input.year}-${String(input.month).padStart(2, "0")}`;

      const [result]: any = await pool.execute(
        `UPDATE payroll_records SET status = 'paid', paid_at = NOW()
         WHERE tenant_id = ? AND year_month = ? AND status = 'draft'`,
        [ctx.tenantId, yearMonth],
      );

      return { updated: result.affectedRows, message: `${yearMonth} 급여 ${result.affectedRows}건 지급 확정` };
    }),

  /**
   * 개별 급여 수정 (4대보험 재계산)
   */
  update: adminProcedure
    .input(z.object({
      id: z.number(),
      baseSalary: z.number().nonnegative(),
      overtime: z.number().nonnegative().default(0),
      bonus: z.number().nonnegative().default(0),
      allowances: z.number().nonnegative().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      const pool = getPool();
      const grossPay = input.baseSalary + input.overtime + input.bonus + input.allowances;
      const nationalPension = Math.round(grossPay * INSURANCE_RATES.nationalPension);
      const healthInsurance = Math.round(grossPay * INSURANCE_RATES.healthInsurance);
      const longTermCare = Math.round(healthInsurance * INSURANCE_RATES.longTermCare);
      const employmentIns = Math.round(grossPay * INSURANCE_RATES.employment);
      const taxableIncome = grossPay - nationalPension - healthInsurance - longTermCare - employmentIns;
      const incomeTax = calcIncomeTax(taxableIncome);
      const localIncomeTax = Math.round(incomeTax * 0.1);
      const totalDeductions = nationalPension + healthInsurance + longTermCare + employmentIns + incomeTax + localIncomeTax;
      const netPay = grossPay - totalDeductions;

      await pool.execute(
        `UPDATE payroll_records SET
           base_salary=?, overtime=?, bonus=?, allowances=?, gross_pay=?,
           national_pension=?, health_insurance=?, long_term_care=?, employment_insurance=?,
           income_tax=?, local_income_tax=?, total_deductions=?, net_pay=?
         WHERE id=? AND tenant_id=?`,
        [input.baseSalary, input.overtime, input.bonus, input.allowances, grossPay,
         nationalPension, healthInsurance, longTermCare, employmentIns,
         incomeTax, localIncomeTax, totalDeductions, netPay,
         input.id, ctx.tenantId],
      );
      return { message: "급여가 수정되었습니다." };
    }),

  /**
   * 개별 급여 삭제
   */
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const pool = getPool();
      await pool.execute(
        `DELETE FROM payroll_records WHERE id=? AND tenant_id=? AND status='draft'`,
        [input.id, ctx.tenantId],
      );
      return { message: "급여가 삭제되었습니다." };
    }),
});

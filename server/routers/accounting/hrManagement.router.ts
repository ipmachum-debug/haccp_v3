/**
 * 인사관리 라우터 — ERP 강화 Phase 3-2
 *
 * 근태관리 (출퇴근/근무시간) + 휴가관리 (연차/병가/잔여)
 */
import { z } from "zod";
import { router, tenantRequiredProcedure, adminProcedure } from "../../_core/trpc";
import { getPool } from "../../db/pool";

export const hrManagementRouter = router({
  // ═══════════════════════════════════════
  //  근태 관리
  // ═══════════════════════════════════════

  /** 출근 체크 */
  clockIn: tenantRequiredProcedure.mutation(async ({ ctx }) => {
    const pool = getPool();
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date().toISOString().slice(11, 19);

    // 이미 출근했는지 확인
    const [existing]: any = await pool.execute(
      `SELECT id FROM attendance_records WHERE tenant_id = ? AND employee_id = ? AND work_date = ?`,
      [ctx.tenantId, ctx.user.id, today],
    );
    if (existing.length > 0) {
      return { alreadyClockedIn: true, message: "이미 출근 처리되었습니다." };
    }

    await pool.execute(
      `INSERT INTO attendance_records (tenant_id, employee_id, work_date, clock_in, status)
       VALUES (?, ?, ?, ?, 'present')`,
      [ctx.tenantId, ctx.user.id, today, now],
    );
    return { alreadyClockedIn: false, message: `출근 완료 (${now})` };
  }),

  /** 퇴근 체크 */
  clockOut: tenantRequiredProcedure.mutation(async ({ ctx }) => {
    const pool = getPool();
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date().toISOString().slice(11, 19);

    const [result]: any = await pool.execute(
      `UPDATE attendance_records SET clock_out = ?,
         work_hours = TIMESTAMPDIFF(MINUTE, CONCAT(work_date, ' ', clock_in), CONCAT(work_date, ' ', ?)) / 60.0
       WHERE tenant_id = ? AND employee_id = ? AND work_date = ? AND clock_out IS NULL`,
      [now, now, ctx.tenantId, ctx.user.id, today],
    );
    if (result.affectedRows === 0) {
      return { message: "출근 기록이 없거나 이미 퇴근했습니다." };
    }
    return { message: `퇴근 완료 (${now})` };
  }),

  /** 오늘 내 근태 */
  myToday: tenantRequiredProcedure.query(async ({ ctx }) => {
    const pool = getPool();
    const today = new Date().toISOString().slice(0, 10);
    const [rows]: any = await pool.execute(
      `SELECT * FROM attendance_records WHERE tenant_id = ? AND employee_id = ? AND work_date = ?`,
      [ctx.tenantId, ctx.user.id, today],
    );
    return rows[0] ? {
      clockIn: rows[0].clock_in,
      clockOut: rows[0].clock_out,
      workHours: Number(rows[0].work_hours || 0),
      status: rows[0].status,
    } : null;
  }),

  /** 근태 목록 (관리자: 전체, 직원: 본인) */
  attendanceList: tenantRequiredProcedure
    .input(z.object({
      startDate: z.string(),
      endDate: z.string(),
      employeeId: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const pool = getPool();
      const isAdmin = ctx.user.role === "admin" || ctx.user.role === "super_admin";

      let where = `WHERE a.tenant_id = ? AND a.work_date >= ? AND a.work_date <= ?`;
      const params: any[] = [ctx.tenantId, input.startDate, input.endDate];

      if (input.employeeId) {
        where += ` AND a.employee_id = ?`;
        params.push(input.employeeId);
      } else if (!isAdmin) {
        where += ` AND a.employee_id = ?`;
        params.push(ctx.user.id);
      }

      const [rows]: any = await pool.execute(
        `SELECT a.*, u.name as employee_name, u.role as employee_role
         FROM attendance_records a
         LEFT JOIN users u ON a.employee_id = u.id
         ${where}
         ORDER BY a.work_date DESC, u.name ASC`,
        params,
      );

      return (rows as any[]).map((r: any) => ({
        id: r.id,
        employeeId: r.employee_id,
        employeeName: r.employee_name,
        employeeRole: r.employee_role,
        workDate: r.work_date,
        clockIn: r.clock_in,
        clockOut: r.clock_out,
        workHours: Number(r.work_hours || 0),
        status: r.status,
        overtimeHours: Math.max(0, Number(r.work_hours || 0) - 8),
      }));
    }),

  /** 근태 요약 (월별) */
  attendanceSummary: tenantRequiredProcedure
    .input(z.object({ year: z.number(), month: z.number(), employeeId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const pool = getPool();
      const startDate = `${input.year}-${String(input.month).padStart(2, "0")}-01`;
      const endDate = `${input.year}-${String(input.month).padStart(2, "0")}-31`;

      let empFilter = "";
      const params: any[] = [ctx.tenantId, startDate, endDate];
      if (input.employeeId) { empFilter = ` AND employee_id = ?`; params.push(input.employeeId); }

      const [rows]: any = await pool.execute(
        `SELECT employee_id,
                COUNT(*) as total_days,
                SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) as present_days,
                SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END) as late_days,
                SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) as absent_days,
                COALESCE(SUM(work_hours), 0) as total_hours,
                COALESCE(SUM(GREATEST(work_hours - 8, 0)), 0) as overtime_hours
         FROM attendance_records
         WHERE tenant_id = ? AND work_date >= ? AND work_date <= ? ${empFilter}
         GROUP BY employee_id`,
        params,
      );

      return (rows as any[]).map((r: any) => ({
        employeeId: r.employee_id,
        totalDays: Number(r.total_days),
        presentDays: Number(r.present_days),
        lateDays: Number(r.late_days),
        absentDays: Number(r.absent_days),
        totalHours: Number(r.total_hours),
        overtimeHours: Number(r.overtime_hours),
      }));
    }),

  // ═══════════════════════════════════════
  //  휴가 관리
  // ═══════════════════════════════════════

  /** 휴가 신청 */
  requestLeave: tenantRequiredProcedure
    .input(z.object({
      leaveType: z.enum(["annual", "sick", "personal", "maternity", "other"]),
      startDate: z.string(),
      endDate: z.string(),
      reason: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const pool = getPool();
      // 일수 계산
      const start = new Date(input.startDate);
      const end = new Date(input.endDate);
      const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

      await pool.execute(
        `INSERT INTO leave_requests
           (tenant_id, employee_id, leave_type, start_date, end_date, days, reason, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [ctx.tenantId, ctx.user.id, input.leaveType, input.startDate, input.endDate, days, input.reason],
      );
      return { message: `휴가 신청 완료 (${days}일)` };
    }),

  /** 휴가 승인/반려 */
  approveLeave: adminProcedure
    .input(z.object({
      id: z.number(),
      action: z.enum(["approved", "rejected"]),
      comment: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const pool = getPool();
      await pool.execute(
        `UPDATE leave_requests SET status = ?, approved_by = ?, approved_at = NOW(), approval_comment = ?
         WHERE id = ? AND tenant_id = ?`,
        [input.action, ctx.user.id, input.comment || null, input.id, ctx.tenantId],
      );
      return { message: input.action === "approved" ? "승인 완료" : "반려 완료" };
    }),

  /** 휴가 목록 */
  leaveList: tenantRequiredProcedure
    .input(z.object({
      year: z.number().optional(),
      status: z.enum(["pending", "approved", "rejected", "all"]).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const pool = getPool();
      const isAdmin = ctx.user.role === "admin" || ctx.user.role === "super_admin";

      let where = `WHERE lr.tenant_id = ?`;
      const params: any[] = [ctx.tenantId];

      if (!isAdmin) { where += ` AND lr.employee_id = ?`; params.push(ctx.user.id); }
      if (input?.year) { where += ` AND YEAR(lr.start_date) = ?`; params.push(input.year); }
      if (input?.status && input.status !== "all") { where += ` AND lr.status = ?`; params.push(input.status); }

      const [rows]: any = await pool.execute(
        `SELECT lr.*, u.name as employee_name, u.role as employee_role,
                a.name as approved_by_name
         FROM leave_requests lr
         LEFT JOIN users u ON lr.employee_id = u.id
         LEFT JOIN users a ON lr.approved_by = a.id
         ${where}
         ORDER BY lr.start_date DESC`,
        params,
      );

      return (rows as any[]).map((r: any) => ({
        id: r.id,
        employeeId: r.employee_id,
        employeeName: r.employee_name,
        leaveType: r.leave_type,
        startDate: r.start_date,
        endDate: r.end_date,
        days: Number(r.days),
        reason: r.reason,
        status: r.status,
        approvedByName: r.approved_by_name,
        approvalComment: r.approval_comment,
      }));
    }),

  /** 연차 잔여 현황 */
  leaveBalance: tenantRequiredProcedure
    .input(z.object({ year: z.number() }).optional())
    .query(async ({ ctx, input }) => {
      const pool = getPool();
      const year = input?.year || new Date().getFullYear();
      const isAdmin = ctx.user.role === "admin" || ctx.user.role === "super_admin";

      let empFilter = isAdmin ? "" : ` AND u.id = ${ctx.user.id}`;

      const [rows]: any = await pool.execute(
        `SELECT u.id, u.name, u.role,
                COALESCE(lb.annual_total, 15) as annual_total,
                COALESCE((SELECT SUM(days) FROM leave_requests
                  WHERE employee_id = u.id AND tenant_id = ? AND leave_type = 'annual'
                  AND status = 'approved' AND YEAR(start_date) = ?), 0) as annual_used
         FROM users u
         LEFT JOIN leave_balances lb ON u.id = lb.employee_id AND lb.tenant_id = ? AND lb.year = ?
         WHERE u.tenant_id = ? AND u.status = 'approved' ${empFilter}
         ORDER BY u.name`,
        [ctx.tenantId, year, ctx.tenantId, year, ctx.tenantId],
      );

      return (rows as any[]).map((r: any) => ({
        employeeId: r.id,
        employeeName: r.name,
        employeeRole: r.role,
        annualTotal: Number(r.annual_total),
        annualUsed: Number(r.annual_used),
        annualRemaining: Number(r.annual_total) - Number(r.annual_used),
      }));
    }),

  /** 연차 부여 (관리자) */
  setLeaveBalance: adminProcedure
    .input(z.object({
      employeeId: z.number(),
      year: z.number(),
      annualTotal: z.number().nonnegative(),
    }))
    .mutation(async ({ ctx, input }) => {
      const pool = getPool();
      await pool.execute(
        `INSERT INTO leave_balances (tenant_id, employee_id, year, annual_total)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE annual_total = VALUES(annual_total)`,
        [ctx.tenantId, input.employeeId, input.year, input.annualTotal],
      );
      return { message: "연차 부여 완료" };
    }),
});

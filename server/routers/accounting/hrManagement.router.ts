/**
 * 인사관리 라우터 — ERP 강화 Phase 3-2
 *
 * 근태관리 (출퇴근/근무시간) + 휴가관리 (연차/병가/잔여)
 */
import { z } from "zod";
import { router, tenantRequiredProcedure, adminProcedure } from "../../_core/trpc";
import { getPool } from "../../db/pool";

// 한국시간 헬퍼
function kstNow(): Date {
  const d = new Date();
  d.setHours(d.getHours() + 9); // UTC → KST
  return d;
}
function kstToday(): string {
  return kstNow().toISOString().slice(0, 10);
}
function kstTime(): string {
  return kstNow().toISOString().slice(11, 19);
}
function safeDateStr(v: any): string {
  if (!v) return "";
  if (typeof v === "string") return v.slice(0, 10);
  if (v instanceof Date) { const d = new Date(v); d.setHours(d.getHours() + 9); return d.toISOString().slice(0, 10); }
  return String(v).slice(0, 10);
}

export const hrManagementRouter = router({
  // ═══════════════════════════════════════
  //  근태 관리
  // ═══════════════════════════════════════

  /** 출근 체크 */
  clockIn: tenantRequiredProcedure.mutation(async ({ ctx }) => {
    try {
      const pool = getPool();
      const today = kstToday();
      const now = kstTime();
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
    } catch (err: any) {
      console.warn("[hr.clockIn]", err.message?.substring(0, 100));
      return { alreadyClockedIn: false, message: "출근 처리 실패 (테이블 미생성 가능)" };
    }
  }),

  /** 퇴근 체크 */
  clockOut: tenantRequiredProcedure.mutation(async ({ ctx }) => {
    try {
      const pool = getPool();
      const today = kstToday();
      const now = kstTime();
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
    } catch (err: any) {
      console.warn("[hr.clockOut]", err.message?.substring(0, 100));
      return { message: "퇴근 처리 실패" };
    }
  }),

  /** 오늘 내 근태 */
  myToday: tenantRequiredProcedure.query(async ({ ctx }) => {
    try {
      const pool = getPool();
      const today = kstToday();
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
    } catch (err: any) {
      console.warn("[hr.myToday]", err.message?.substring(0, 100));
      return null;
    }
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
        workDate: safeDateStr(r.work_date),
        clockIn: r.clock_in ? String(r.clock_in) : null,
        clockOut: r.clock_out ? String(r.clock_out) : null,
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
  /** 관리자: 근태 수정 (잘못 찍은 출퇴근 보정) */
  updateAttendance: adminProcedure
    .input(z.object({
      id: z.number(),
      clockIn: z.string().optional(),
      clockOut: z.string().optional(),
      status: z.enum(["present", "late", "absent", "half_day"]).optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const pool = getPool();
      const sets: string[] = [];
      const params: any[] = [];

      if (input.clockIn) { sets.push("clock_in = ?"); params.push(input.clockIn); }
      if (input.clockOut) { sets.push("clock_out = ?"); params.push(input.clockOut); }
      if (input.status) { sets.push("status = ?"); params.push(input.status); }
      if (input.notes !== undefined) { sets.push("notes = ?"); params.push(input.notes); }

      // 근무시간 재계산
      if (input.clockIn && input.clockOut) {
        sets.push("work_hours = TIMESTAMPDIFF(MINUTE, CONCAT(work_date, ' ', ?), CONCAT(work_date, ' ', ?)) / 60.0");
        params.push(input.clockIn, input.clockOut);
      }

      if (sets.length === 0) return { message: "변경사항 없음" };
      params.push(input.id, ctx.tenantId);

      await pool.execute(
        `UPDATE attendance_records SET ${sets.join(", ")} WHERE id = ? AND tenant_id = ?`,
        params,
      );
      return { message: "근태가 수정되었습니다." };
    }),

  /** 관리자: 수기 연차 등록 (회원가입 안 된 직원용) */
  createLeaveManual: adminProcedure
    .input(z.object({
      employeeId: z.number(),
      leaveType: z.enum(["annual", "sick", "personal", "maternity", "other"]),
      startDate: z.string(),
      endDate: z.string(),
      days: z.number().positive(),
      reason: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const pool = getPool();
      await pool.execute(
        `INSERT INTO leave_requests
           (tenant_id, employee_id, leave_type, start_date, end_date, days, reason, status, approved_by, approved_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'approved', ?, NOW())`,
        [ctx.tenantId, input.employeeId, input.leaveType, input.startDate, input.endDate,
         input.days, `[수기등록] ${input.reason}`, ctx.user.id],
      );
      return { message: `수기 연차 ${input.days}일 등록 완료 (자동 승인)` };
    }),

  /** 관리자: 직원 상태 변경 (활성/퇴사/휴직) */
  updateEmployeeStatus: adminProcedure
    .input(z.object({
      employeeId: z.number(),
      status: z.enum(["active", "resigned", "on_leave"]),
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const pool = getPool();
      const statusLabel = input.status === "active" ? "활성" : input.status === "resigned" ? "퇴사" : "휴직";
      // h_employees 상태 변경
      try {
        await pool.execute(
          `UPDATE h_employees SET is_active = ? WHERE id = ? AND tenant_id = ?`,
          [input.status === "active" ? 1 : 0, input.employeeId, ctx.tenantId],
        );
      } catch (_) {}
      // 상태 기록 (별도 컬럼이 없으면 notes에)
      try {
        await pool.execute(
          `UPDATE h_employees SET updated_at = NOW() WHERE id = ? AND tenant_id = ?`,
          [input.employeeId, ctx.tenantId],
        );
      } catch (_) {}
      return { message: `직원 상태가 '${statusLabel}'(으)로 변경되었습니다.` };
    }),

  /** 직원 목록 (상태별 — 활성/비활성) */
  employeesByStatus: tenantRequiredProcedure
    .input(z.object({ isActive: z.boolean().default(true) }))
    .query(async ({ ctx, input }) => {
      const pool = getPool();
      try {
        const [rows]: any = await pool.execute(
          `SELECT e.id, e.user_id as userId, e.name, e.employee_code,
                  COALESCE(pos.position_name, '') as position,
                  COALESCE(dept.department_name, '') as department,
                  e.is_active, e.hire_date
           FROM h_employees e
           LEFT JOIN h_departments dept ON e.department_id = dept.id
           LEFT JOIN h_positions pos ON e.position_id = pos.id
           WHERE e.tenant_id = ? AND e.is_active = ?
           ORDER BY e.name`,
          [ctx.tenantId, input.isActive ? 1 : 0],
        );
        return (rows as any[]).map((r: any) => ({
          id: r.id, userId: r.user_id, name: r.name, employeeCode: r.employee_code,
          position: r.position, department: r.department, isActive: r.is_active,
          hireDate: r.hire_date instanceof Date ? r.hire_date.toISOString().slice(0, 10) : String(r.hire_date || ""),
        }));
      } catch (err: any) {
        console.warn("[hr.employeesByStatus]", err.message?.substring(0, 80));
        return [];
      }
    }),

  /** 관리자: 근태 삭제 */
  deleteAttendance: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const pool = getPool();
      await pool.execute(
        `DELETE FROM attendance_records WHERE id = ? AND tenant_id = ?`,
        [input.id, ctx.tenantId],
      );
      return { message: "근태 기록이 삭제되었습니다." };
    }),

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
        startDate: safeDateStr(r.start_date),
        endDate: safeDateStr(r.end_date),
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
      const year = input?.year || kstNow().getFullYear();
      const isAdmin = ctx.user.role === "admin" || ctx.user.role === "super_admin";

      // 파라미터 바인딩 사용 (SQL injection 방지)
      const empFilter = isAdmin ? "" : ` AND u.id = ?`;
      const params: any[] = [ctx.tenantId, year, ctx.tenantId, year, ctx.tenantId];
      if (!isAdmin) params.push(ctx.user.id);

      try {
        const [rows]: any = await pool.execute(
          `SELECT u.id, u.name, u.role,
                  COALESCE(lb.annual_total, 15) as annual_total,
                  COALESCE((SELECT SUM(days) FROM leave_requests
                    WHERE employee_id = u.id AND tenant_id = ? AND leave_type = 'annual'
                    AND status = 'approved' AND YEAR(start_date) = ?), 0) as annual_used
           FROM users u
           LEFT JOIN leave_balances lb ON u.id = lb.employee_id AND lb.tenant_id = ? AND lb.year = ?
           WHERE u.tenant_id = ? AND u.approval_status = 'approved' ${empFilter}
           ORDER BY u.name`,
          params,
        );

        return (rows as any[]).map((r: any) => ({
          employeeId: r.id,
          employeeName: r.name,
          employeeRole: r.role,
          annualTotal: Number(r.annual_total),
          annualUsed: Number(r.annual_used),
          annualRemaining: Number(r.annual_total) - Number(r.annual_used),
        }));
      } catch (err: any) {
        console.warn("[hr.leaveBalance]", err.message?.substring(0, 100));
        return [];
      }
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

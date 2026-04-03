/**
 * 오늘의 5분 HACCP - Daily Micro Training Router
 * 
 * 핵심 로직: 배치(생산)가 있는 날만 교육 배정 → 휴무일 자동 이월
 * - getTodayTraining: 오늘 교육 가져오기 (없으면 자동 배정)
 * - complete: 교육 완료 처리
 * - getStatus: 관리자용 완료/미완료 현황
 * - getStats: 이수율 통계
 * - listTopics: 전체 교육 목록 (관리자)
 */
import { z } from "zod";
import { router, tenantRequiredProcedure } from "../_core/trpc";
import { getPool } from "../db/pool";

// ── 오늘의 교육 Day 계산 (선배정, 주말만 제외) ──
// 핵심: 평일이면 무조건 배정 (배치 유무 상관없이)
// 주말(토/일)만 제외. 배치가 없는 평일에도 교육은 진행.
async function getOrCreateAssignment(tenantId: number, today: string): Promise<number | null> {
  const pool = getPool();

  // 1) 이미 오늘 배정이 있는지 확인
  const [existing] = await pool.execute<any[]>(
    "SELECT day_no FROM h_training_assignments WHERE assignment_date = ? AND tenant_id = ?",
    [today, tenantId]
  );
  if (existing.length > 0) return existing[0].day_no;

  // 2) 주말(토/일)이면 배정 안 함
  const dayOfWeek = new Date(today + "T00:00:00").getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  if (isWeekend) return null;

  // 3) 평일이면 무조건 배정 (선배정)
  const [lastAssign] = await pool.execute<any[]>(
    "SELECT day_no FROM h_training_assignments WHERE tenant_id = ? ORDER BY assignment_date DESC LIMIT 1",
    [tenantId]
  );

  let nextDayNo: number;
  if (lastAssign.length > 0) {
    nextDayNo = (lastAssign[0].day_no % 120) + 1; // 120일 순환
  } else {
    nextDayNo = 1; // 첫 시작
  }

  // 4) 배정 생성
  await pool.execute(
    "INSERT IGNORE INTO h_training_assignments (assignment_date, day_no, tenant_id) VALUES (?, ?, ?)",
    [today, nextDayNo, tenantId]
  );

  return nextDayNo;
}

// ── 오늘 날짜 문자열 ──
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const dailyTrainingRouter = router({
  // ── 오늘의 교육 가져오기 (직원용) ──
  getTodayTraining: tenantRequiredProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenantId;
    const userId = ctx.user.id;
    const today = todayStr();
    const pool = getPool();

    // 1) 오늘 배정된 Day 가져오기 (없으면 자동 생성)
    const dayNo = await getOrCreateAssignment(tenantId, today);
    if (dayNo === null) {
      return { assigned: false, reason: "today_no_work", today };
    }

    // 2) 교육 내용 조회 (tenant_id=0: 시스템 공통, 또는 tenant 커스텀)
    const [topics] = await pool.execute<any[]>(
      `SELECT * FROM h_training_topics 
       WHERE day_no = ? AND (tenant_id = 0 OR tenant_id = ?)
       ORDER BY tenant_id DESC LIMIT 1`,
      [dayNo, tenantId]
    );
    if (topics.length === 0) {
      return { assigned: false, reason: "no_topic", today };
    }

    // 3) 현재 사용자의 완료 여부 확인
    const [logs] = await pool.execute<any[]>(
      "SELECT * FROM h_training_logs WHERE user_id = ? AND day_no = ? AND assignment_date = ? AND tenant_id = ?",
      [userId, dayNo, today, tenantId]
    );

    // 4) 전체 배정 정보에서 현재 Day 번호 확인
    const [totalAssigned] = await pool.execute<any[]>(
      "SELECT COUNT(*) as cnt FROM h_training_assignments WHERE tenant_id = ?",
      [tenantId]
    );

    const topic = topics[0];
    return {
      assigned: true,
      today,
      dayNo,
      totalDays: totalAssigned[0]?.cnt || 0,
      topic: {
        id: topic.id,
        dayNo: topic.day_no,
        title: topic.title,
        question: topic.question,
        content: topic.content,
        action: topic.action,
        category: topic.category,
      },
      completed: logs.length > 0,
      completedAt: logs[0]?.completed_at || null,
    };
  }),

  // ── 교육 완료 체크 + 레벨/점수 업데이트 ──
  complete: tenantRequiredProcedure
    .input(z.object({ dayNo: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const pool = getPool();
      const today = todayStr();
      const userId = ctx.user.id;
      const tenantId = ctx.tenantId;

      // 1) 완료 기록
      const [result] = await pool.execute<any>(
        `INSERT IGNORE INTO h_training_logs (user_id, day_no, assignment_date, status, tenant_id)
         VALUES (?, ?, ?, 'DONE', ?)`,
        [userId, input.dayNo, today, tenantId]
      );

      // 이미 완료된 경우 스킵
      if (result.affectedRows === 0) return { success: true, alreadyDone: true };

      // 2) 연속일수(streak) 계산: 어제 완료 여부
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;

      const [yesterdayLog] = await pool.execute<any[]>(
        "SELECT id FROM h_training_logs WHERE user_id = ? AND assignment_date = ? AND tenant_id = ? AND status = 'DONE'",
        [userId, yesterdayStr, tenantId]
      );

      // 3) 레벨 테이블 UPSERT
      const hadYesterday = yesterdayLog.length > 0;
      await pool.execute(
        `INSERT INTO h_training_levels (user_id, tenant_id, score, streak, max_streak, level)
         VALUES (?, ?, 1, 1, 1, 1)
         ON DUPLICATE KEY UPDATE
           score = score + 1,
           streak = IF(? = 1, streak + 1, 1),
           max_streak = GREATEST(max_streak, IF(? = 1, streak + 1, 1)),
           level = CASE
             WHEN score + 1 >= 100 THEN 5
             WHEN score + 1 >= 60 THEN 4
             WHEN score + 1 >= 30 THEN 3
             WHEN score + 1 >= 10 THEN 2
             ELSE 1
           END`,
        [userId, tenantId, hadYesterday ? 1 : 0, hadYesterday ? 1 : 0]
      );

      return { success: true, alreadyDone: false };
    }),

  // ── 내 레벨 정보 ──
  getMyLevel: tenantRequiredProcedure.query(async ({ ctx }) => {
    const pool = getPool();
    const [rows] = await pool.execute<any[]>(
      "SELECT score, streak, max_streak, level FROM h_training_levels WHERE user_id = ? AND tenant_id = ?",
      [ctx.user.id, ctx.tenantId]
    );
    if (rows.length === 0) return { score: 0, streak: 0, maxStreak: 0, level: 1 };
    return {
      score: rows[0].score,
      streak: rows[0].streak,
      maxStreak: rows[0].max_streak,
      level: rows[0].level,
    };
  }),

  // ── 관리자: 오늘 완료 현황 ──
  getStatus: tenantRequiredProcedure.query(async ({ ctx }) => {
    const pool = getPool();
    const today = todayStr();
    const tenantId = ctx.tenantId;

    // 오늘 배정된 Day
    const dayNo = await getOrCreateAssignment(tenantId, today);
    if (dayNo === null) {
      return { assigned: false, users: [], completedCount: 0, totalCount: 0 };
    }

    // 전체 직원 목록 (해당 테넌트)
    const [users] = await pool.execute<any[]>(
      "SELECT id, name, email, role FROM users WHERE tenant_id = ? AND status = 'approved'",
      [tenantId]
    );

    // 오늘 완료 목록
    const [logs] = await pool.execute<any[]>(
      "SELECT user_id, completed_at FROM h_training_logs WHERE day_no = ? AND assignment_date = ? AND tenant_id = ?",
      [dayNo, today, tenantId]
    );

    const completedUserIds = new Set(logs.map((l: any) => l.user_id));

    const userList = users.map((u: any) => ({
      id: u.id,
      name: u.name,
      role: u.role,
      completed: completedUserIds.has(u.id),
      completedAt: logs.find((l: any) => l.user_id === u.id)?.completed_at || null,
    }));

    return {
      assigned: true,
      dayNo,
      today,
      users: userList,
      completedCount: completedUserIds.size,
      totalCount: users.length,
    };
  }),

  // ── 이수율 통계 ──
  getStats: tenantRequiredProcedure
    .input(z.object({
      days: z.number().default(30),
    }).optional())
    .query(async ({ ctx, input }) => {
      const pool = getPool();
      const tenantId = ctx.tenantId;
      const days = input?.days || 30;

      // 최근 N일간 배정 일수
      const [assignments] = await pool.execute<any[]>(
        `SELECT COUNT(*) as cnt FROM h_training_assignments 
         WHERE tenant_id = ? AND assignment_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)`,
        [tenantId, days]
      );

      // 전체 직원 수
      const [userCount] = await pool.execute<any[]>(
        "SELECT COUNT(*) as cnt FROM users WHERE tenant_id = ? AND status = 'approved'",
        [tenantId]
      );

      // 완료 건수
      const [logCount] = await pool.execute<any[]>(
        `SELECT COUNT(*) as cnt FROM h_training_logs 
         WHERE tenant_id = ? AND assignment_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY) AND status = 'DONE'`,
        [tenantId, days]
      );

      const totalExpected = assignments[0].cnt * userCount[0].cnt;
      const totalDone = logCount[0].cnt;
      const rate = totalExpected > 0 ? Math.round((totalDone / totalExpected) * 100) : 0;

      // 직원별 연속일수 (streak)
      const [streaks] = await pool.execute<any[]>(
        `SELECT u.id, u.name, COUNT(l.id) as done_count
         FROM users u
         LEFT JOIN h_training_logs l ON u.id = l.user_id AND l.tenant_id = ? AND l.status = 'DONE'
           AND l.assignment_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
         WHERE u.tenant_id = ? AND u.status = 'approved'
         GROUP BY u.id, u.name
         ORDER BY done_count DESC`,
        [tenantId, days, tenantId]
      );

      return {
        period: days,
        assignedDays: assignments[0].cnt,
        totalUsers: userCount[0].cnt,
        totalExpected,
        totalDone,
        completionRate: rate,
        userStats: streaks,
      };
    }),

  // ── 전체 교육 목록 + 배정일/이수율 포함 (관리자) ──
  listTopics: tenantRequiredProcedure.query(async ({ ctx }) => {
    const pool = getPool();
    const tenantId = ctx.tenantId;

    // 교육 주제
    const [topics] = await pool.execute<any[]>(
      `SELECT * FROM h_training_topics
       WHERE tenant_id = 0 OR tenant_id = ?
       ORDER BY day_no ASC`,
      [tenantId]
    );

    // 배정 이력 (day_no → assignment_date 매핑)
    const [assignments] = await pool.execute<any[]>(
      "SELECT day_no, assignment_date FROM h_training_assignments WHERE tenant_id = ? ORDER BY assignment_date DESC",
      [tenantId]
    );
    const assignMap = new Map<number, string>();
    for (const a of assignments) {
      if (!assignMap.has(a.day_no)) assignMap.set(a.day_no, a.assignment_date);
    }

    // 전체 직원 수
    const [userCountRows] = await pool.execute<any[]>(
      "SELECT COUNT(*) as cnt FROM users WHERE tenant_id = ? AND status = 'approved'",
      [tenantId]
    );
    const totalUsers = userCountRows[0]?.cnt || 1;

    // Day별 완료 수
    const [logCounts] = await pool.execute<any[]>(
      `SELECT day_no, COUNT(DISTINCT user_id) as done_count
       FROM h_training_logs WHERE tenant_id = ? AND status = 'DONE'
       GROUP BY day_no`,
      [tenantId]
    );
    const doneMap = new Map<number, number>();
    for (const l of logCounts) doneMap.set(l.day_no, l.done_count);

    return topics.map((t: any) => ({
      ...t,
      assignedDate: assignMap.get(t.day_no) || null,
      doneCount: doneMap.get(t.day_no) || 0,
      totalUsers,
      completionRate: Math.round(((doneMap.get(t.day_no) || 0) / totalUsers) * 100),
    }));
  }),

  // ── 미완료 인원 수 (대시보드 위젯용) ──
  getIncompleteCount: tenantRequiredProcedure.query(async ({ ctx }) => {
    const pool = getPool();
    const today = todayStr();
    const tenantId = ctx.tenantId;

    const dayNo = await getOrCreateAssignment(tenantId, today);
    if (dayNo === null) return { count: 0, assigned: false };

    const [users] = await pool.execute<any[]>(
      "SELECT COUNT(*) as cnt FROM users WHERE tenant_id = ? AND status = 'approved'",
      [tenantId]
    );
    const [logs] = await pool.execute<any[]>(
      "SELECT COUNT(*) as cnt FROM h_training_logs WHERE day_no = ? AND assignment_date = ? AND tenant_id = ?",
      [dayNo, today, tenantId]
    );

    return {
      count: users[0].cnt - logs[0].cnt,
      total: users[0].cnt,
      assigned: true,
    };
  }),

  // ── 월간 교육훈련일지 데이터 (출력/승인용) ──
  getMonthlyReport: tenantRequiredProcedure
    .input(z.object({
      year: z.number(),
      month: z.number().min(1).max(12),
    }))
    .query(async ({ ctx, input }) => {
      const pool = getPool();
      const tenantId = ctx.tenantId;
      const { year, month } = input;
      const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
      const endDate = `${year}-${String(month).padStart(2, "0")}-31`;

      // 해당 월 배정 목록
      const [assignments] = await pool.execute<any[]>(
        `SELECT a.assignment_date, a.day_no, t.title, t.question, t.content, t.action, t.category
         FROM h_training_assignments a
         LEFT JOIN h_training_topics t ON a.day_no = t.day_no AND (t.tenant_id = 0 OR t.tenant_id = ?)
         WHERE a.tenant_id = ? AND a.assignment_date >= ? AND a.assignment_date <= ?
         ORDER BY a.assignment_date ASC`,
        [tenantId, tenantId, startDate, endDate]
      );

      // 전체 직원 목록
      const [users] = await pool.execute<any[]>(
        "SELECT id, name, role FROM users WHERE tenant_id = ? AND status = 'approved' ORDER BY name",
        [tenantId]
      );

      // 해당 월 완료 기록
      const [logs] = await pool.execute<any[]>(
        `SELECT user_id, day_no, assignment_date, completed_at
         FROM h_training_logs
         WHERE tenant_id = ? AND assignment_date >= ? AND assignment_date <= ? AND status = 'DONE'`,
        [tenantId, startDate, endDate]
      );

      // 유저별 완료 맵: {userId: Set<dayNo>}
      const userDoneMap = new Map<number, Set<number>>();
      for (const l of logs) {
        if (!userDoneMap.has(l.user_id)) userDoneMap.set(l.user_id, new Set());
        userDoneMap.get(l.user_id)!.add(l.day_no);
      }

      // 직원별 이수 현황
      const userStats = users.map((u: any) => {
        const doneSet = userDoneMap.get(u.id) || new Set();
        return {
          id: u.id,
          name: u.name,
          role: u.role,
          doneCount: doneSet.size,
          totalDays: assignments.length,
          rate: assignments.length > 0 ? Math.round((doneSet.size / assignments.length) * 100) : 0,
          details: assignments.map((a: any) => ({
            date: a.assignment_date,
            dayNo: a.day_no,
            done: doneSet.has(a.day_no),
          })),
        };
      });

      return {
        year,
        month,
        totalDays: assignments.length,
        totalUsers: users.length,
        assignments: assignments.map((a: any) => ({
          date: a.assignment_date,
          dayNo: a.day_no,
          title: a.title,
          category: a.category,
          content: a.content,
          action: a.action,
        })),
        userStats,
        overallRate: assignments.length > 0 && users.length > 0
          ? Math.round((logs.length / (assignments.length * users.length)) * 100) : 0,
      };
    }),

  // ── 월간 리포트 생성 + 승인 요청 ──
  createMonthlyReport: tenantRequiredProcedure
    .input(z.object({ year: z.number(), month: z.number().min(1).max(12) }))
    .mutation(async ({ ctx, input }) => {
      const pool = getPool();
      const tenantId = ctx.tenantId;
      const { year, month } = input;
      const title = `${year}년 ${month}월 교육훈련 월간 기록부`;

      // 중복 체크 (같은 년/월 이미 생성됐는지)
      const [existing] = await pool.execute<any[]>(
        `SELECT id FROM h_training_monthly_reports WHERE tenant_id = ? AND year = ? AND month = ?`,
        [tenantId, year, month]
      );
      if (existing.length > 0) {
        return { success: false, message: "이미 해당 월의 리포트가 존재합니다.", reportId: existing[0].id };
      }

      // 집계 데이터 생성
      const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
      const endDate = `${year}-${String(month).padStart(2, "0")}-31`;

      const [assignCount] = await pool.execute<any[]>(
        "SELECT COUNT(*) as cnt FROM h_training_assignments WHERE tenant_id = ? AND assignment_date >= ? AND assignment_date <= ?",
        [tenantId, startDate, endDate]
      );
      const [userCount] = await pool.execute<any[]>(
        "SELECT COUNT(*) as cnt FROM users WHERE tenant_id = ? AND status = 'approved'", [tenantId]
      );
      const [logCount] = await pool.execute<any[]>(
        `SELECT COUNT(*) as cnt FROM h_training_logs
         WHERE tenant_id = ? AND assignment_date >= ? AND assignment_date <= ? AND status = 'DONE'`,
        [tenantId, startDate, endDate]
      );

      const totalExpected = assignCount[0].cnt * userCount[0].cnt;
      const overallRate = totalExpected > 0 ? Math.round((logCount[0].cnt / totalExpected) * 100) : 0;

      // 리포트 레코드 생성
      const [result] = await pool.execute<any>(
        `INSERT INTO h_training_monthly_reports
         (tenant_id, year, month, title, total_days, total_users, total_done, overall_rate, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`,
        [tenantId, year, month, title, assignCount[0].cnt, userCount[0].cnt, logCount[0].cnt, overallRate, ctx.user.id]
      );
      const reportId = result.insertId;

      // 승인 요청 생성
      const { createApprovalRequest } = await import("../db");
      const approvalId = await createApprovalRequest({
        tenantId,
        siteId: (ctx.user.siteId || tenantId) as number,
        requestType: "document_approval",
        referenceType: "training_monthly_report",
        referenceId: reportId,
        title,
        description: `교육일수 ${assignCount[0].cnt}일, 대상인원 ${userCount[0].cnt}명, 전체 이수율 ${overallRate}%`,
        priority: "medium",
        requestedBy: ctx.user.id,
      });

      // 상태 업데이트
      await pool.execute(
        "UPDATE h_training_monthly_reports SET status = 'pending', approval_id = ? WHERE id = ?",
        [approvalId, reportId]
      );

      return { success: true, reportId, approvalId, message: "월간 리포트 생성 + 승인 요청 완료" };
    }),

  // ── 월간 리포트 목록 조회 (교육훈련일지 리스트) ──
  listMonthlyReports: tenantRequiredProcedure.query(async ({ ctx }) => {
    const pool = getPool();
    const [rows] = await pool.execute<any[]>(
      `SELECT r.*, u.name as created_by_name
       FROM h_training_monthly_reports r
       LEFT JOIN users u ON r.created_by = u.id
       WHERE r.tenant_id = ?
       ORDER BY r.year DESC, r.month DESC`,
      [ctx.tenantId]
    );
    return rows;
  }),

  // ── 리포트 상태 업데이트 (승인 콜백용) ──
  updateReportStatus: tenantRequiredProcedure
    .input(z.object({ reportId: z.number(), status: z.enum(["approved", "rejected"]) }))
    .mutation(async ({ ctx, input }) => {
      const pool = getPool();
      await pool.execute(
        "UPDATE h_training_monthly_reports SET status = ? WHERE id = ? AND tenant_id = ?",
        [input.status, input.reportId, ctx.tenantId]
      );
      return { success: true };
    }),

  // ── 3년 경과 데이터 자동 폐기 (법적 보관기간 준수) ──
  // HACCP 교육 기록: 3년 보관 의무 (식품위생법 시행규칙)
  // 3년 경과 후 순차적 자동 삭제
  purgeExpiredData: tenantRequiredProcedure.mutation(async ({ ctx }) => {
    const pool = getPool();
    const tenantId = ctx.tenantId;
    const cutoffDate = new Date();
    cutoffDate.setFullYear(cutoffDate.getFullYear() - 3);
    const cutoff = cutoffDate.toISOString().slice(0, 10);

    // 3년 지난 교육 로그 삭제
    const [logResult] = await pool.execute<any>(
      "DELETE FROM h_training_logs WHERE tenant_id = ? AND assignment_date < ?",
      [tenantId, cutoff]
    );

    // 3년 지난 배정 기록 삭제
    const [assignResult] = await pool.execute<any>(
      "DELETE FROM h_training_assignments WHERE tenant_id = ? AND assignment_date < ?",
      [tenantId, cutoff]
    );

    return {
      purgedLogs: logResult.affectedRows || 0,
      purgedAssignments: assignResult.affectedRows || 0,
      cutoffDate: cutoff,
      message: `${cutoff} 이전 데이터 ${logResult.affectedRows + assignResult.affectedRows}건 폐기 완료`,
    };
  }),

  // ── 데이터 보관 현황 (감사용) ──
  getRetentionInfo: tenantRequiredProcedure.query(async ({ ctx }) => {
    const pool = getPool();
    const tenantId = ctx.tenantId;

    const [oldest] = await pool.execute<any[]>(
      "SELECT MIN(assignment_date) as oldest_date FROM h_training_assignments WHERE tenant_id = ?",
      [tenantId]
    );
    const [total] = await pool.execute<any[]>(
      "SELECT COUNT(*) as logs FROM h_training_logs WHERE tenant_id = ?",
      [tenantId]
    );
    const [totalAssign] = await pool.execute<any[]>(
      "SELECT COUNT(*) as cnt FROM h_training_assignments WHERE tenant_id = ?",
      [tenantId]
    );

    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 3);

    const [expirable] = await pool.execute<any[]>(
      "SELECT COUNT(*) as cnt FROM h_training_logs WHERE tenant_id = ? AND assignment_date < ?",
      [tenantId, cutoff.toISOString().slice(0, 10)]
    );

    return {
      oldestDate: oldest[0]?.oldest_date || null,
      totalLogs: total[0]?.logs || 0,
      totalAssignments: totalAssign[0]?.cnt || 0,
      retentionYears: 3,
      expirableCount: expirable[0]?.cnt || 0,
      nextPurgeDate: cutoff.toISOString().slice(0, 10),
    };
  }),
});

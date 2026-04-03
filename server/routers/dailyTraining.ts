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

// ── 배치 존재 여부로 "근무일" 판단 ──
async function hasBatchOnDate(tenantId: number, dateStr: string): Promise<boolean> {
  const pool = getPool();
  const [rows] = await pool.execute<any[]>(
    `SELECT COUNT(*) as cnt FROM h_batches 
     WHERE tenant_id = ? AND DATE(created_at) = ?`,
    [tenantId, dateStr]
  );
  return rows[0]?.cnt > 0;
}

// ── 오늘의 교육 Day 계산 (배치 없는 날 건너뛰기) ──
async function getOrCreateAssignment(tenantId: number, today: string): Promise<number | null> {
  const pool = getPool();

  // 1) 이미 오늘 배정이 있는지 확인
  const [existing] = await pool.execute<any[]>(
    "SELECT day_no FROM h_training_assignments WHERE assignment_date = ? AND tenant_id = ?",
    [today, tenantId]
  );
  if (existing.length > 0) return existing[0].day_no;

  // 2) 오늘 배치가 있는지 (또는 오늘이 과거이면서 배치가 있었는지)
  //    현재 날짜이면 아직 배치가 없을 수 있으므로, 평일이면 배정
  const dayOfWeek = new Date(today + "T00:00:00").getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  
  // 주말이면서 배치도 없으면 → 이월 (배정 안 함)
  if (isWeekend) {
    const hasBatch = await hasBatchOnDate(tenantId, today);
    if (!hasBatch) return null;
  }

  // 3) 마지막 배정된 day_no 찾기
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

  // ── 교육 완료 체크 ──
  complete: tenantRequiredProcedure
    .input(z.object({ dayNo: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const pool = getPool();
      const today = todayStr();
      await pool.execute(
        `INSERT IGNORE INTO h_training_logs (user_id, day_no, assignment_date, status, tenant_id)
         VALUES (?, ?, ?, 'DONE', ?)`,
        [ctx.user.id, input.dayNo, today, ctx.tenantId]
      );
      return { success: true };
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

  // ── 전체 교육 목록 (관리자) ──
  listTopics: tenantRequiredProcedure.query(async ({ ctx }) => {
    const pool = getPool();
    const [rows] = await pool.execute<any[]>(
      `SELECT * FROM h_training_topics 
       WHERE tenant_id = 0 OR tenant_id = ?
       ORDER BY day_no ASC`,
      [ctx.tenantId]
    );
    return rows;
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
});

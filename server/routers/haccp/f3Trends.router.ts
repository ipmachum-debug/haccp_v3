/**
 * F-3 트렌드 분석 라우터 (CP-3-k)
 *
 * ============================================================================
 * 목적:
 *   CCP 이탈/시정조치 데이터의 시계열·분포 분석. 영업 데모, 감사 보고서,
 *   QA 회의 자료. PR #143 의 F-3 대시보드는 "지금 / 24h" 가 초점이라면,
 *   본 라우터는 "지난 N일 패턴" 이 초점.
 *
 * 4 endpoints:
 *   - byCcpType(days)  — CCP type 별 deviation 빈도 (어느 공정이 가장 위험?)
 *   - daily(days)      — 일자별 추이 (시간 라인 차트)
 *   - bySeverity(days) — priority 분포 (urgent/high/medium/low)
 *   - byHour(days)     — 시간대 분포 (야간 사고 빈도 등)
 *
 * 모든 집계는 같은 tenant 한정 (cross-tenant 격리).
 *
 * 데이터 소스: h_notifications.notification_type='ccp_deviation'
 *   (PR #132~#139 가 일관되게 INSERT 하는 알림 row 활용 — 별도 집계 테이블 불필요)
 * ============================================================================
 */
import { z } from "zod";
import { sql } from "drizzle-orm";
import { tenantRequiredProcedure, router } from "../../_core/trpc";
import { getDb } from "../../db";

const daysInput = z.object({
  days: z.number().int().min(1).max(365).default(30),
});

export const f3TrendsRouter = router({
  /**
   * CCP type 별 deviation 빈도 (top 10).
   * title 에서 "[CCP 이탈] CCP-1B — ..." 패턴 파싱.
   *
   * 반환: [{ ccpType: 'CCP-1B', count: 12, lastAt: ... }, ...]
   */
  byCcpType: tenantRequiredProcedure.input(daysInput).query(async ({ ctx, input }) => {
    const tenantId = Number(ctx.tenantId);
    const db = await getDb();
    if (!db) return [];

    // ★ db.execute(sql) 는 [rows, fields] 튜플 반환 — [0] 으로 rows 추출
    const result: any = await db.execute(sql`
      SELECT
        SUBSTRING_INDEX(SUBSTRING_INDEX(title, '[CCP 이탈] ', -1), ' —', 1) AS ccp_type,
        COUNT(*) AS cnt,
        MAX(created_at) AS last_at
      FROM h_notifications
      WHERE tenant_id = ${tenantId}
        AND notification_type = 'ccp_deviation'
        AND created_at >= DATE_SUB(NOW(), INTERVAL ${input.days} DAY)
      GROUP BY ccp_type
      ORDER BY cnt DESC
      LIMIT 10
    `);

    const rows = ((result as any)?.[0] ?? []) as any[];
    return rows.map((r) => ({
      ccpType: String(r.ccp_type ?? "?"),
      count: Number(r.cnt ?? 0),
      lastAt: r.last_at,
    }));
  }),

  /**
   * 일자별 deviation 추이 (라인 차트용).
   *
   * 반환: [{ date: 'YYYY-MM-DD', count: N }, ...] — 0건인 날도 포함하려면
   * 클라이언트에서 보강. 이 endpoint 는 발생일만 반환 (가벼움).
   */
  daily: tenantRequiredProcedure.input(daysInput).query(async ({ ctx, input }) => {
    const tenantId = Number(ctx.tenantId);
    const db = await getDb();
    if (!db) return [];

    // ★ db.execute(sql) 는 [rows, fields] 튜플 반환 — [0] 으로 rows 추출
    const result: any = await db.execute(sql`
      SELECT
        DATE(created_at) AS d,
        COUNT(*) AS cnt
      FROM h_notifications
      WHERE tenant_id = ${tenantId}
        AND notification_type = 'ccp_deviation'
        AND created_at >= DATE_SUB(NOW(), INTERVAL ${input.days} DAY)
      GROUP BY d
      ORDER BY d ASC
    `);

    const rows = ((result as any)?.[0] ?? []) as any[];
    return rows.map((r) => ({
      date: typeof r.d === "string" ? r.d : new Date(r.d).toISOString().slice(0, 10),
      count: Number(r.cnt ?? 0),
    }));
  }),

  /**
   * severity (priority) 분포.
   * deviation 알림의 priority enum: low/medium/high/urgent.
   */
  bySeverity: tenantRequiredProcedure.input(daysInput).query(async ({ ctx, input }) => {
    const tenantId = Number(ctx.tenantId);
    const db = await getDb();
    if (!db) return [];

    // ★ db.execute(sql) 는 [rows, fields] 튜플 반환 — [0] 으로 rows 추출
    const result: any = await db.execute(sql`
      SELECT priority, COUNT(*) AS cnt
      FROM h_notifications
      WHERE tenant_id = ${tenantId}
        AND notification_type = 'ccp_deviation'
        AND created_at >= DATE_SUB(NOW(), INTERVAL ${input.days} DAY)
      GROUP BY priority
      ORDER BY FIELD(priority, 'urgent', 'high', 'medium', 'low')
    `);

    const rows = ((result as any)?.[0] ?? []) as any[];
    return rows.map((r) => ({
      priority: String(r.priority ?? "medium"),
      count: Number(r.cnt ?? 0),
    }));
  }),

  /**
   * 시간대별 (0~23시) 분포.
   * 야간/주간 패턴 분석 — 인적 요인 vs 자동화 시간대 차이 등.
   */
  byHour: tenantRequiredProcedure.input(daysInput).query(async ({ ctx, input }) => {
    const tenantId = Number(ctx.tenantId);
    const db = await getDb();
    if (!db) return [];

    // ★ db.execute(sql) 는 [rows, fields] 튜플 반환 — [0] 으로 rows 추출
    const result: any = await db.execute(sql`
      SELECT HOUR(created_at) AS h, COUNT(*) AS cnt
      FROM h_notifications
      WHERE tenant_id = ${tenantId}
        AND notification_type = 'ccp_deviation'
        AND created_at >= DATE_SUB(NOW(), INTERVAL ${input.days} DAY)
      GROUP BY h
      ORDER BY h ASC
    `);

    const rows = ((result as any)?.[0] ?? []) as any[];
    // 0~23시 24개 슬롯 보장 — 0건인 시간도 포함
    const counts = new Array(24).fill(0);
    for (const r of rows) {
      const h = Number(r.h);
      if (h >= 0 && h < 24) counts[h] = Number(r.cnt ?? 0);
    }

    return counts.map((count, hour) => ({ hour, count }));
  }),
});

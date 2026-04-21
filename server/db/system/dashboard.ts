import { getDb } from "../connection";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { hBatches } from "../../../drizzle/schema/schema_main";

/**
 * 대시보드 통계 데이터 조회
 */
export async function getDashboardStats(tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 배치 현황 통계
  const batchStats = await db
    .select({
      status: hBatches.status,
      count: sql<number>`COUNT(*)`
    })
    .from(hBatches)
    .where(eq(hBatches.tenantId, tenantId))
    .groupBy(hBatches.status);

  // 오늘 생성된 배치 수
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayBatches = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(hBatches)
    .where(and(eq(hBatches.tenantId, tenantId), gte(hBatches.createdAt, today)));

  // 이번 주 생성된 배치 수
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  weekAgo.setHours(0, 0, 0, 0);
  const weekBatches = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(hBatches)
    .where(and(eq(hBatches.tenantId, tenantId), gte(hBatches.createdAt, weekAgo)));

  // 이번 달 생성된 배치 수
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthBatches = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(hBatches)
    .where(and(eq(hBatches.tenantId, tenantId), gte(hBatches.createdAt, monthStart)));

  return {
    batchStats: batchStats.reduce((acc, stat) => {
      acc[stat.status] = Number(stat.count);
      return acc;
    }, {} as Record<string, number>),
    todayBatches: Number(todayBatches[0]?.count || 0),
    weekBatches: Number(weekBatches[0]?.count || 0),
    monthBatches: Number(monthBatches[0]?.count || 0)
  };
}

/**
 * CCP 점검 완료율 조회
 */
export async function getCCPCompletionRate(tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 전체 CCP 인스턴스 수
  const totalCCPQuery = await db.execute(sql`
    SELECT COUNT(*) as total
    FROM h_ccp_instances
    WHERE tenant_id = ${tenantId}
  `);
  const totalCCP = Number((totalCCPQuery[0] as any)?.total || 0);

  // 완료된 CCP 인스턴스 수
  const completedCCPQuery = await db.execute(sql`
    SELECT COUNT(DISTINCT cr.instance_id) as completed
    FROM h_ccp_records cr
    JOIN h_ccp_instances ci ON cr.instance_id = ci.id
    WHERE ci.tenant_id = ${tenantId}
  `);
  const completedCCP = Number((completedCCPQuery[0] as any)?.completed || 0);

  const completionRate = totalCCP > 0 ? (completedCCP / totalCCP) * 100 : 0;

  return {
    totalCCP,
    completedCCP,
    completionRate: Math.round(completionRate * 10) / 10,
  };
}

/**
 * 재고 회전율 알림 수 조회
 */
export async function getTurnoverAlertCount(tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const alertCountQuery = await db.execute(sql`
    SELECT COUNT(*) as count
    FROM h_alerts
    WHERE alert_type = 'turnover_alert' AND status = 'active' AND tenant_id = ${tenantId}
  `);
  const alertCount = Number((alertCountQuery[0] as any)?.count || 0);

  return alertCount;
}

/**
 * 실패 작업 수 조회
 */
export async function getFailedTaskCount(tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const failedTaskCountQuery = await db.execute(sql`
    SELECT COUNT(*) as count
    FROM h_batch_completion_retries
    WHERE status = 'failed' AND tenant_id = ${tenantId}
  `);
  const failedTaskCount = Number((failedTaskCountQuery[0] as any)?.count || 0);

  return failedTaskCount;
}

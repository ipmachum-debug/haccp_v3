import { eq, and, gte, lte, sql } from "drizzle-orm";
import { getDb } from "../connection";
import { hBatches } from "../../../drizzle/schema/schema_main";

/**
 * 진행 중인 배치 목록 조회 (진행률, 예상 완료 시간 포함)
 */
export async function getActiveBatches(tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const now = new Date();

  const batches = await db
    .select()
    .from(hBatches)
    .where(
      and(eq(hBatches.tenantId, tenantId as any) , 
        eq(hBatches.status, "in_progress"),
        lte(hBatches.startTime, now)
      ) as any
    )
    .orderBy(hBatches.startTime);

  return batches.map((batch) => {
    const startTime = batch.startTime ? new Date(batch.startTime).getTime() : Date.now();
    const endTime = batch.endTime ? new Date(batch.endTime).getTime() : Date.now();
    const currentTime = Date.now();

    // 진행률 계산 (0-100%)
    const totalDuration = endTime - startTime;
    const elapsedDuration = currentTime - startTime;
    const progress = totalDuration > 0 ? Math.min(100, Math.max(0, (elapsedDuration / totalDuration) * 100)) : 0;

    // 지연 여부 판단
    const isDelayed = currentTime > endTime;

    return {
      ...batch,
      progress: Math.round(progress),
      isDelayed,
      estimatedCompletion: batch.endTime
    };
  });
}

/**
 * 배치 상태별 통계 조회
 */
export async function getBatchStats(tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const stats = await db
    .select({
      status: hBatches.status,
      count: sql<number>`COUNT(*)`
    })
    .from(hBatches).where(eq(hBatches.tenantId, tenantId as any) ).groupBy(hBatches.status);

  const result = {
    planned: 0,
    in_progress: 0,
    completed: 0,
    shipped: 0
  };

  stats.forEach((stat) => {
    if (stat.status === "planned") result.planned = Number(stat.count);
    else if (stat.status === "in_progress") result.in_progress = Number(stat.count);
    else if (stat.status === "completed") result.completed = Number(stat.count);
    else if (stat.status === "shipped") result.shipped = Number(stat.count);
  });

  return result;
}

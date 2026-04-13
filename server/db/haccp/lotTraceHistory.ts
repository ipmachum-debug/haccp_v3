import { getDb } from "../connection";
import { lotTraceHistory } from "../../../drizzle/schema";
import { desc, sql, eq, and} from "drizzle-orm";

/**
 * LOT 추적 이력 저장
 */
export async function saveLotTraceHistory(data: {
  traceType: "forward" | "backward";
  searchLotNumber: string;
  resultData: string; // JSON.stringify된 결과
  userId?: number;
  userName?: string;
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  await db
    .insert(lotTraceHistory)
    .values({
      traceType: data.traceType,
      searchLotNumber: data.searchLotNumber,
      resultData: data.resultData,
      userId: data.userId,
      userName: data.userName,
      tenantId,
    } as any);

  return { success: true };
}

/**
 * LOT 추적 이력 조회 (최근 100개)
 */
export async function getLotTraceHistory(limit: number = 100, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const history = await db
    .select()
    .from(lotTraceHistory).where(eq(lotTraceHistory.tenantId, tenantId as any) ).orderBy(desc(lotTraceHistory.createdAt))
    .limit(limit);

  return history;
}

/**
 * LOT 추적 통계 - 자주 조회되는 LOT 번호 TOP 10
 */
export async function getTopSearchedLots(tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const result = await db
    .select({
      searchLotNumber: lotTraceHistory.searchLotNumber,
      count: sql<number>`count(*)`.as("count"),
      lastSearchedAt: sql<string>`max(${lotTraceHistory.createdAt})`.as("last_searched_at")
    })
    .from(lotTraceHistory).where(eq(lotTraceHistory.tenantId, tenantId as any) ).groupBy(lotTraceHistory.searchLotNumber)
    .orderBy(desc(sql`count(*)`))
    .limit(10);

  return result;
}

/**
 * LOT 추적 통계 - 사용자별 추적 횟수
 */
export async function getUserTraceStats(tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const conditions: any[] = [sql`${lotTraceHistory.userName} IS NOT NULL`];
  if (tenantId) {
    conditions.push(eq(lotTraceHistory.tenantId, tenantId as any));
  }

  const result = await db
    .select({
      userName: lotTraceHistory.userName,
      count: sql<number>`count(*)`.as("count"),
      lastSearchedAt: sql<string>`max(${lotTraceHistory.createdAt})`.as("last_searched_at")
    })
    .from(lotTraceHistory)
    .where(and(...conditions))
    .groupBy(lotTraceHistory.userName)
    .orderBy(desc(sql`count(*)`))
    .limit(10);

  return result;
}

/**
 * 특정 LOT 번호의 추적 이력 조회
 */
export async function getLotTraceHistoryByLotNumber(lotNumber: string, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const history = await db
    .select()
    .from(lotTraceHistory)
    .where(and(eq(lotTraceHistory.tenantId, tenantId as any) , eq(lotTraceHistory.searchLotNumber, lotNumber)) as any)    .orderBy(desc(lotTraceHistory.createdAt))
    .limit(50);

  return history;
}

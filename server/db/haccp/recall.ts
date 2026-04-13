/**
 * 회수 시뮬레이션 DB 함수
 */

import { getDb } from "../connection";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import {
  h_recall_simulations,
  h_recall_distribution_tracking,
  h_recall_checklist,
  h_recall_attachments,
  h_recall_stats,
} from "../../../drizzle/schema";

// ============================================================================
// 회수 시뮬레이션 관리
// ============================================================================

export async function createRecallSimulation(tenantId: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결 실패");
  if (!tenantId) throw new Error("tenantId is required");
  
  const [result] = await db.insert(h_recall_simulations).values({ ...data, tenantId });
  return result.insertId;
}

export async function getRecallSimulations(tenantId: number, filters: {
  siteId: number;
  status?: string;
  simulationType?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결 실패");
  if (!tenantId) throw new Error("tenantId is required");

  const conditions: any[] = [
    eq(h_recall_simulations.tenantId, tenantId),
    eq(h_recall_simulations.siteId, filters.siteId)
  ];
  if (filters.status) conditions.push(eq(h_recall_simulations.status, filters.status as any));
  if (filters.simulationType) conditions.push(eq(h_recall_simulations.simulationType, filters.simulationType as any));
  if (filters.dateFrom) conditions.push(gte(h_recall_simulations.simulationDate, filters.dateFrom as any) );
  if (filters.dateTo) conditions.push(lte(h_recall_simulations.simulationDate, filters.dateTo as any) );

  const query = db.select().from(h_recall_simulations).where(and(...conditions)).orderBy(desc(h_recall_simulations.simulationDate));
  if (filters.limit) query.limit(filters.limit);
  if (filters.offset) query.offset(filters.offset);
  return await query;
}

export async function getRecallSimulationById(tenantId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결 실패");
  if (!tenantId) throw new Error("tenantId is required");
  
  const [result] = await db.select().from(h_recall_simulations).where(
    and(
      eq(h_recall_simulations.id, id),
      eq(h_recall_simulations.tenantId, tenantId)
    )
  );
  return result;
}

export async function updateRecallSimulation(tenantId: number, id: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결 실패");
  if (!tenantId) throw new Error("tenantId is required");
  
  await db.update(h_recall_simulations).set(data).where(
    and(
      eq(h_recall_simulations.id, id),
      eq(h_recall_simulations.tenantId, tenantId)
    )
  );
}

export async function deleteRecallSimulation(tenantId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결 실패");
  if (!tenantId) throw new Error("tenantId is required");
  
  await db.delete(h_recall_simulations).where(
    and(
      eq(h_recall_simulations.id, id),
      eq(h_recall_simulations.tenantId, tenantId)
    )
  );
}

// 시뮬레이션 시작
export async function startRecallSimulation(tenantId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결 실패");
  if (!tenantId) throw new Error("tenantId is required");
  
  await db.update(h_recall_simulations).set({
    status: "in_progress" as any,
    startTime: new Date(),
  }).where(
    and(
      eq(h_recall_simulations.id, id),
      eq(h_recall_simulations.tenantId, tenantId)
    )
  );
}

// 시뮬레이션 완료 및 효과성 평가
export async function completeRecallSimulation(tenantId: number, id: number, data: {
  actualRecalledQuantity: string;
  actualRecallRate: string;
  traceabilityScore: number;
  responseTimeScore: number;
  recallRateScore: number;
  overallScore: number;
  result: string;
  findings?: string;
  improvements?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결 실패");
  if (!tenantId) throw new Error("tenantId is required");

  const simulation = await getRecallSimulationById(tenantId, id);
  if (!simulation) throw new Error("시뮬레이션을 찾을 수 없습니다");

  const endTime = new Date();
  const startTime = new Date(simulation.startTime);
  const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000);

  await db.update(h_recall_simulations).set({
    ...data,
    status: "completed" as any,
    endTime,
    durationMinutes,
    result: data.result as any,
  }).where(
    and(
      eq(h_recall_simulations.id, id),
      eq(h_recall_simulations.tenantId, tenantId)
    )
  );
}

// ============================================================================
// 유통 경로 추적
// ============================================================================

export async function addDistributionTracking(tenantId: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결 실패");
  if (!tenantId) throw new Error("tenantId is required");
  
  const [result] = await db.insert(h_recall_distribution_tracking).values({ ...data, tenantId });
  return result.insertId;
}

export async function getDistributionTracking(tenantId: number, simulationId: number) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결 실패");
  if (!tenantId) throw new Error("tenantId is required");
  
  return await db.select().from(h_recall_distribution_tracking)
    .where(
      and(
        eq(h_recall_distribution_tracking.simulationId, simulationId),
        eq(h_recall_distribution_tracking.tenantId, tenantId)
      )
    )
    .orderBy(desc(h_recall_distribution_tracking.shipmentDate));
}

export async function updateDistributionTracking(tenantId: number, id: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결 실패");
  if (!tenantId) throw new Error("tenantId is required");
  
  await db.update(h_recall_distribution_tracking).set(data).where(
    and(
      eq(h_recall_distribution_tracking.id, id),
      eq(h_recall_distribution_tracking.tenantId, tenantId)
    )
  );
}

export async function deleteDistributionTracking(tenantId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결 실패");
  if (!tenantId) throw new Error("tenantId is required");
  
  await db.delete(h_recall_distribution_tracking).where(
    and(
      eq(h_recall_distribution_tracking.id, id),
      eq(h_recall_distribution_tracking.tenantId, tenantId)
    )
  );
}

// 거래처 회수 상태 업데이트
export async function updateDistributionRecallStatus(tenantId: number, id: number, data: {
  recallStatus: string;
  recalledQuantity?: string;
  recallDate?: string;
  recallRate?: string;
  notificationDate?: string;
  notificationMethod?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결 실패");
  if (!tenantId) throw new Error("tenantId is required");
  
  await db.update(h_recall_distribution_tracking).set({
    ...data,
    recallStatus: data.recallStatus as any,
    notificationMethod: data.notificationMethod as any,
  } as any).where(
    and(
      eq(h_recall_distribution_tracking.id, id),
      eq(h_recall_distribution_tracking.tenantId, tenantId)
    )
  );
}

// ============================================================================
// 체크리스트 관리
// ============================================================================

export async function addChecklistItem(tenantId: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결 실패");
  if (!tenantId) throw new Error("tenantId is required");
  
  const [result] = await db.insert(h_recall_checklist).values({ ...data, tenantId });
  return result.insertId;
}

export async function getChecklist(tenantId: number, simulationId: number) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결 실패");
  if (!tenantId) throw new Error("tenantId is required");
  
  return await db.select().from(h_recall_checklist)
    .where(
      and(
        eq(h_recall_checklist.simulationId, simulationId),
        eq(h_recall_checklist.tenantId, tenantId)
      )
    )
    .orderBy(h_recall_checklist.category, h_recall_checklist.id);
}

export async function updateChecklistItem(tenantId: number, id: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결 실패");
  if (!tenantId) throw new Error("tenantId is required");
  
  await db.update(h_recall_checklist).set(data).where(
    and(
      eq(h_recall_checklist.id, id),
      eq(h_recall_checklist.tenantId, tenantId)
    )
  );
}

export async function completeChecklistItem(tenantId: number, id: number, completedBy: number) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결 실패");
  if (!tenantId) throw new Error("tenantId is required");
  
  await db.update(h_recall_checklist).set({
    isCompleted: 1,
    completedAt: new Date(),
    completedBy,
  }).where(
    and(
      eq(h_recall_checklist.id, id),
      eq(h_recall_checklist.tenantId, tenantId)
    )
  );
}

// 기본 체크리스트 생성 (시뮬레이션 생성 시 자동)
export async function createDefaultChecklist(simulationId: number, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결 실패");
  if (!tenantId) throw new Error("tenantId is required");

  const defaultItems = [
    { category: "preparation", checkItem: "회수 팀 소집 및 역할 배정" },
    { category: "preparation", checkItem: "회수 절차서 확인" },
    { category: "preparation", checkItem: "관련 기관 연락처 확인" },
    { category: "identification", checkItem: "회수 대상 제품 LOT 번호 확인" },
    { category: "identification", checkItem: "생산 기록 확인 (원재료, 공정 조건)" },
    { category: "identification", checkItem: "출고 기록 확인 (거래처, 수량)" },
    { category: "identification", checkItem: "재고 현황 확인 및 격리" },
    { category: "notification", checkItem: "거래처 회수 통지" },
    { category: "notification", checkItem: "관할 관청 보고 (필요 시)" },
    { category: "notification", checkItem: "소비자 공지 (필요 시)" },
    { category: "retrieval", checkItem: "거래처별 회수 진행 상황 확인" },
    { category: "retrieval", checkItem: "회수 제품 입고 및 격리 보관" },
    { category: "retrieval", checkItem: "회수율 계산" },
    { category: "disposal", checkItem: "회수 제품 처리 방법 결정" },
    { category: "disposal", checkItem: "회수 제품 처리 실행" },
    { category: "disposal", checkItem: "처리 기록 작성" },
    { category: "documentation", checkItem: "회수 보고서 작성" },
    { category: "documentation", checkItem: "시정 조치 기록" },
    { category: "documentation", checkItem: "관련 문서 보관" },
    { category: "evaluation", checkItem: "추적성 평가 (LOT 추적 소요 시간)" },
    { category: "evaluation", checkItem: "대응 시간 평가" },
    { category: "evaluation", checkItem: "회수율 평가" },
    { category: "evaluation", checkItem: "개선 사항 도출" },
  ];

  for (const item of defaultItems) {
    await db.insert(h_recall_checklist).values({
      simulationId,
      category: item.category as any,
      checkItem: item.checkItem,
      tenantId,
    });
  }
}

// ============================================================================
// 첨부 파일 관리
// ============================================================================

export async function addAttachment(tenantId: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결 실패");
  if (!tenantId) throw new Error("tenantId is required");
  
  const [result] = await db.insert(h_recall_attachments).values({ ...data, tenantId });
  return result.insertId;
}

export async function getAttachments(tenantId: number, simulationId: number) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결 실패");
  if (!tenantId) throw new Error("tenantId is required");
  
  return await db.select().from(h_recall_attachments)
    .where(
      and(
        eq(h_recall_attachments.simulationId, simulationId),
        eq(h_recall_attachments.tenantId, tenantId)
      )
    )
    .orderBy(desc(h_recall_attachments.uploadedAt));
}

export async function deleteAttachment(tenantId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결 실패");
  if (!tenantId) throw new Error("tenantId is required");
  
  await db.delete(h_recall_attachments).where(
    and(
      eq(h_recall_attachments.id, id),
      eq(h_recall_attachments.tenantId, tenantId)
    )
  );
}

// ============================================================================
// 통계 및 대시보드
// ============================================================================

export async function getRecallDashboard(tenantId: number, siteId: number) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결 실패");
  if (!tenantId) throw new Error("tenantId is required");

  const [totalStats] = await db.select({
    total: sql<number>`COUNT(*)`,
    planned: sql<number>`SUM(CASE WHEN status = 'planned' THEN 1 ELSE 0 END)`,
    inProgress: sql<number>`SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END)`,
    completed: sql<number>`SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)`,
    avgOverallScore: sql<number>`AVG(overall_score)`,
    avgRecallRate: sql<number>`AVG(actual_recall_rate)`,
  }).from(h_recall_simulations).where(
    and(
      eq(h_recall_simulations.siteId, siteId),
      eq(h_recall_simulations.tenantId, tenantId)
    )
  );

  const resultDistribution = await db.select({
    result: h_recall_simulations.result,
    count: sql<number>`COUNT(*)`,
  }).from(h_recall_simulations)
    .where(
      and(
        eq(h_recall_simulations.siteId, siteId),
        eq(h_recall_simulations.tenantId, tenantId),
        eq(h_recall_simulations.status, "completed")
      )
    )
    .groupBy(h_recall_simulations.result);

  const yearlyTrend = await db.select({
    year: sql<string>`YEAR(simulation_date)`,
    count: sql<number>`COUNT(*)`,
    avgScore: sql<number>`AVG(overall_score)`,
  }).from(h_recall_simulations)
    .where(
      and(
        eq(h_recall_simulations.siteId, siteId),
        eq(h_recall_simulations.tenantId, tenantId)
      )
    )
    .groupBy(sql`YEAR(simulation_date)`)
    .orderBy(sql`YEAR(simulation_date)`);

  return { totalStats, resultDistribution, yearlyTrend };
}

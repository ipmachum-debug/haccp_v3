import { eq, and, gte, lte, desc, sql, inArray } from "drizzle-orm";
import { getDb } from "../db";
import {
  hInternalAuditPlans,
  hInternalAudits,
  hInternalAuditChecklist,
  hInternalAuditFindings,
  hInternalAuditAttachments,
} from "../../drizzle/schema";

/**
 * 내부 감사 DB 함수
 */

// ============================================================================
// 내부 감사 계획
// ============================================================================

export async function createAuditPlan(data: any & { tenantId: number }) {
  const db = await getDb();
  const result = await db.insert(hInternalAuditPlans).values(data);
  return result[0].insertId;
}

export async function getAuditPlans(params: {
  planYear?: number;
  status?: string;
  limit?: number;
  offset?: number;
  tenantId: number;
}) {
  const db = await getDb();
  const { planYear, status, limit = 50, offset = 0, tenantId } = params;

  let query = db.select().from(hInternalAuditPlans);

  const conditions: any[] = [eq(hInternalAuditPlans.tenantId, tenantId)];
  if (planYear) conditions.push(eq(hInternalAuditPlans.planYear, planYear));
  if (status) conditions.push(eq(hInternalAuditPlans.status, status as any));

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  return await query
    .orderBy(desc(hInternalAuditPlans.planYear))
    .limit(limit)
    .offset(offset);
}

export async function getAuditPlanById(id: number) {
  const db = await getDb();
  const results = await db
    .select()
    .from(hInternalAuditPlans)
    .where(eq(hInternalAuditPlans.id, id))
    .limit(1);

  return results.length > 0 ? results[0] : null;
}

export async function updateAuditPlan(id: number, data: any) {
  const db = await getDb();
  await db
    .update(hInternalAuditPlans)
    .set(data)
    .where(eq(hInternalAuditPlans.id, id));
}

export async function deleteAuditPlan(id: number) {
  const db = await getDb();
  await db
    .delete(hInternalAuditPlans)
    .where(eq(hInternalAuditPlans.id, id));
}

// ============================================================================
// 내부 감사 실시
// ============================================================================

export async function createAudit(data: any & { tenantId: number }) {
  const db = await getDb();
  const result = await db.insert(hInternalAudits).values(data);
  return result[0].insertId;
}

export async function getAudits(params: {
  planId?: number;
  siteId?: number;
  auditType?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
  tenantId: number;
}) {
  const db = await getDb();
  const { planId, siteId, auditType, status, startDate, endDate, limit = 50, offset = 0, tenantId } = params;

  let query = db.select().from(hInternalAudits);

  const conditions: any[] = [eq(hInternalAudits.tenantId, tenantId)];
  if (planId) conditions.push(eq(hInternalAudits.planId, planId));
  if (siteId) conditions.push(eq(hInternalAudits.siteId, siteId));
  if (auditType) conditions.push(eq(hInternalAudits.auditType, auditType as any));
  if (status) conditions.push(eq(hInternalAudits.status, status as any));
  if (startDate) conditions.push(gte(hInternalAudits.scheduledDate, startDate));
  if (endDate) conditions.push(lte(hInternalAudits.scheduledDate, endDate));

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  return await query
    .orderBy(desc(hInternalAudits.scheduledDate))
    .limit(limit)
    .offset(offset);
}

export async function getAuditById(id: number) {
  const db = await getDb();
  const results = await db
    .select()
    .from(hInternalAudits)
    .where(eq(hInternalAudits.id, id))
    .limit(1);

  if (results.length === 0) return null;

  const audit = results[0];

  // 체크리스트, 발견 사항, 첨부 파일 함께 조회
  const checklistItems = await getChecklistItems(id);
  const findings = await getFindings({ auditId: id });
  const attachments = await getAttachments(id);

  return {
    ...audit,
    auditAreas: audit.auditAreas ? JSON.parse(audit.auditAreas) : [],
    auditTeam: audit.auditTeam ? JSON.parse(audit.auditTeam) : [],
    checklistItems,
    findings,
    attachments,
  };
}

export async function updateAudit(id: number, data: any) {
  const db = await getDb();
  await db
    .update(hInternalAudits)
    .set(data)
    .where(eq(hInternalAudits.id, id));
}

export async function deleteAudit(id: number) {
  const db = await getDb();
  
  // 관련 데이터 먼저 삭제
  await db.delete(hInternalAuditChecklist).where(eq(hInternalAuditChecklist.auditId, id));
  await db.delete(hInternalAuditFindings).where(eq(hInternalAuditFindings.auditId, id));
  await db.delete(hInternalAuditAttachments).where(eq(hInternalAuditAttachments.auditId, id));
  
  // 감사 기록 삭제
  await db.delete(hInternalAudits).where(eq(hInternalAudits.id, id));
}

// ============================================================================
// 내부 감사 체크리스트
// ============================================================================

export async function createChecklistItem(data: any) {
  const db = await getDb();
  const result = await db.insert(hInternalAuditChecklist).values(data);
  return result[0].insertId;
}

export async function getChecklistItems(auditId: number) {
  const db = await getDb();
  return await db
    .select()
    .from(hInternalAuditChecklist)
    .where(eq(hInternalAuditChecklist.auditId, auditId));
}

export async function getChecklistItemById(id: number) {
  const db = await getDb();
  const results = await db
    .select()
    .from(hInternalAuditChecklist)
    .where(eq(hInternalAuditChecklist.id, id))
    .limit(1);

  return results.length > 0 ? results[0] : null;
}

export async function updateChecklistItem(id: number, data: any) {
  const db = await getDb();
  await db
    .update(hInternalAuditChecklist)
    .set(data)
    .where(eq(hInternalAuditChecklist.id, id));
}

export async function deleteChecklistItem(id: number) {
  const db = await getDb();
  await db
    .delete(hInternalAuditChecklist)
    .where(eq(hInternalAuditChecklist.id, id));
}

// 감사 통계 업데이트 (체크리스트 결과 기반)
export async function updateAuditStatistics(auditId: number) {
  const db = await getDb();
  
  const checklistItems = await getChecklistItems(auditId);
  
  const totalCheckItems = checklistItems.length;
  const passedItems = checklistItems.filter((item: any) => item.checkResult === "pass").length;
  const failedItems = checklistItems.filter((item: any) => item.checkResult === "fail").length;
  const naItems = checklistItems.filter((item: any) => item.checkResult === "na").length;
  
  const complianceRate = totalCheckItems > 0 
    ? ((passedItems / (totalCheckItems - naItems)) * 100).toFixed(2)
    : "0.00";
  
  await updateAudit(auditId, {
    totalCheckItems,
    passedItems,
    failedItems,
    naItems,
    complianceRate,
  });
}

// ============================================================================
// 내부 감사 발견 사항
// ============================================================================

export async function createFinding(data: any) {
  const db = await getDb();
  const result = await db.insert(hInternalAuditFindings).values(data);
  return result[0].insertId;
}

export async function getFindings(params: {
  auditId?: number;
  status?: string;
  severity?: string;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  const { auditId, status, severity, limit = 50, offset = 0 } = params;

  let query = db.select().from(hInternalAuditFindings);

  const conditions: any[] = [];
  if (auditId) conditions.push(eq(hInternalAuditFindings.auditId, auditId));
  if (status) conditions.push(eq(hInternalAuditFindings.status, status as any));
  if (severity) conditions.push(eq(hInternalAuditFindings.severity, severity as any));

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  return await query
    .orderBy(desc(hInternalAuditFindings.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function getFindingById(id: number) {
  const db = await getDb();
  const results = await db
    .select()
    .from(hInternalAuditFindings)
    .where(eq(hInternalAuditFindings.id, id))
    .limit(1);

  return results.length > 0 ? results[0] : null;
}

export async function updateFinding(id: number, data: any) {
  const db = await getDb();
  await db
    .update(hInternalAuditFindings)
    .set(data)
    .where(eq(hInternalAuditFindings.id, id));
}

export async function deleteFinding(id: number) {
  const db = await getDb();
  await db
    .delete(hInternalAuditFindings)
    .where(eq(hInternalAuditFindings.id, id));
}

// ============================================================================
// 첨부 파일
// ============================================================================

export async function createAttachment(data: any) {
  const db = await getDb();
  const result = await db.insert(hInternalAuditAttachments).values(data);
  return result[0].insertId;
}

export async function getAttachments(auditId: number) {
  const db = await getDb();
  return await db
    .select()
    .from(hInternalAuditAttachments)
    .where(eq(hInternalAuditAttachments.auditId, auditId));
}

export async function deleteAttachment(id: number) {
  const db = await getDb();
  await db
    .delete(hInternalAuditAttachments)
    .where(eq(hInternalAuditAttachments.id, id));
}

// ============================================================================
// 통계 및 대시보드
// ============================================================================

export async function getAuditStatistics(params: {
  siteId?: number;
  startDate?: string;
  endDate?: string;
  tenantId: number;
}) {
  const db = await getDb();
  const { siteId, startDate, endDate, tenantId } = params;

  const conditions: any[] = [eq(hInternalAudits.tenantId, tenantId)];
  if (siteId) conditions.push(eq(hInternalAudits.siteId, siteId));
  if (startDate) conditions.push(gte(hInternalAudits.scheduledDate, startDate));
  if (endDate) conditions.push(lte(hInternalAudits.scheduledDate, endDate));

  let query = db.select().from(hInternalAudits);
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  const audits = await query;

  const total = audits.length;
  const completed = audits.filter((a: any) => a.status === "completed").length;
  const inProgress = audits.filter((a: any) => a.status === "in_progress").length;
  const scheduled = audits.filter((a: any) => a.status === "scheduled").length;

  const byType = {
    scheduled: audits.filter((a: any) => a.auditType === "scheduled").length,
    special: audits.filter((a: any) => a.auditType === "special").length,
    follow_up: audits.filter((a: any) => a.auditType === "follow_up").length,
  };

  const byRating = {
    excellent: audits.filter((a: any) => a.overallRating === "excellent").length,
    good: audits.filter((a: any) => a.overallRating === "good").length,
    acceptable: audits.filter((a: any) => a.overallRating === "acceptable").length,
    needs_improvement: audits.filter((a: any) => a.overallRating === "needs_improvement").length,
    unacceptable: audits.filter((a: any) => a.overallRating === "unacceptable").length,
  };

  // 평균 준수율
  const completedAudits = audits.filter((a: any) => a.status === "completed" && a.complianceRate);
  const avgComplianceRate = completedAudits.length > 0
    ? (completedAudits.reduce((sum: number, a: any) => sum + parseFloat(a.complianceRate || "0"), 0) / completedAudits.length).toFixed(2)
    : "0.00";

  return {
    total,
    byStatus: {
      completed,
      inProgress,
      scheduled,
    },
    byType,
    byRating,
    avgComplianceRate,
  };
}

export async function getUpcomingAudits(params: {
  siteId?: number;
  days?: number;
  tenantId: number;
}) {
  const db = await getDb();
  const { siteId, days = 30, tenantId } = params;

  const today = new Date().toISOString().split("T")[0];
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + days);
  const futureDateStr = futureDate.toISOString().split("T")[0];

  const conditions: any[] = [
    eq(hInternalAudits.tenantId, tenantId),
    gte(hInternalAudits.scheduledDate, today),
    lte(hInternalAudits.scheduledDate, futureDateStr),
    eq(hInternalAudits.status, "scheduled"),
  ];

  if (siteId) {
    conditions.push(eq(hInternalAudits.siteId, siteId));
  }

  return await db
    .select()
    .from(hInternalAudits)
    .where(and(...conditions))
    .orderBy(hInternalAudits.scheduledDate);
}

export async function getOpenFindingsStatistics(params: {
  siteId?: number;
}) {
  const db = await getDb();
  const { siteId } = params;

  let query = db.select().from(hInternalAuditFindings);

  const conditions: any[] = [
    inArray(hInternalAuditFindings.status, ["open", "in_progress"]),
  ];

  if (siteId) {
    // 사업장 필터링을 위해 감사 테이블과 조인 필요
    const audits = await db
      .select()
      .from(hInternalAudits)
      .where(eq(hInternalAudits.siteId, siteId));
    
    const auditIds = audits.map((a: any) => a.id);
    if (auditIds.length > 0) {
      conditions.push(inArray(hInternalAuditFindings.auditId, auditIds));
    } else {
      return {
        total: 0,
        bySeverity: { critical: 0, major: 0, minor: 0 },
        byType: { non_conformity: 0, observation: 0, opportunity: 0 },
      };
    }
  }

  const findings = await db
    .select()
    .from(hInternalAuditFindings)
    .where(and(...conditions));

  const total = findings.length;

  const bySeverity = {
    critical: findings.filter((f: any) => f.severity === "critical").length,
    major: findings.filter((f: any) => f.severity === "major").length,
    minor: findings.filter((f: any) => f.severity === "minor").length,
  };

  const byType = {
    non_conformity: findings.filter((f: any) => f.findingType === "non_conformity").length,
    observation: findings.filter((f: any) => f.findingType === "observation").length,
    opportunity: findings.filter((f: any) => f.findingType === "opportunity").length,
  };

  return {
    total,
    bySeverity,
    byType,
  };
}

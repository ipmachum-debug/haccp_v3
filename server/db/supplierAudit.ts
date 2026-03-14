/**
 * 거래처(공급업체) 감사 DB 함수
 */

import { getDb } from "../db";
import { eq, and, desc, gte, lte, sql, like } from "drizzle-orm";
import { hSuppliers, hSupplierAudits, hSupplierEvaluations } from "../../drizzle/schema";

// ============================================================================
// 공급업체 관리
// ============================================================================

export async function createSupplier(tenantId: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결 실패");
  if (!tenantId) throw new Error("tenantId is required");
  
  const [result] = await db.insert(hSuppliers).values({ ...data, tenantId });
  return result.insertId;
}

export async function getSuppliers(filters: {
  tenantId: number;
  supplierType?: string;
  isActive?: number;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결 실패");
  if (!filters.tenantId) throw new Error("tenantId is required");

  const conditions: any[] = [eq(hSuppliers.tenantId, filters.tenantId)];
  if (filters.supplierType) conditions.push(eq(hSuppliers.supplierType, filters.supplierType));
  if (filters.isActive !== undefined) conditions.push(eq(hSuppliers.isActive, filters.isActive));
  if (filters.search) conditions.push(like(hSuppliers.supplierName, `%${filters.search}%`));

  const query = db.select().from(hSuppliers).where(and(...conditions)).orderBy(desc(hSuppliers.createdAt));
  if (filters.limit) query.limit(filters.limit);
  if (filters.offset) query.offset(filters.offset);
  return await query;
}

export async function getSupplierById(tenantId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결 실패");
  if (!tenantId) throw new Error("tenantId is required");
  
  const [result] = await db.select().from(hSuppliers).where(
    and(
      eq(hSuppliers.id, id),
      eq(hSuppliers.tenantId, tenantId)
    )
  );
  return result;
}

export async function updateSupplier(tenantId: number, id: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결 실패");
  if (!tenantId) throw new Error("tenantId is required");
  
  await db.update(hSuppliers).set(data).where(
    and(
      eq(hSuppliers.id, id),
      eq(hSuppliers.tenantId, tenantId)
    )
  );
}

export async function deleteSupplier(tenantId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결 실패");
  if (!tenantId) throw new Error("tenantId is required");
  
  await db.update(hSuppliers).set({ isActive: 0 }).where(
    and(
      eq(hSuppliers.id, id),
      eq(hSuppliers.tenantId, tenantId)
    )
  );
}

// ============================================================================
// 공급업체 감사
// ============================================================================

export async function createSupplierAudit(tenantId: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결 실패");
  if (!tenantId) throw new Error("tenantId is required");
  
  const [result] = await db.insert(hSupplierAudits).values({ ...data, tenantId });
  return result.insertId;
}

export async function getSupplierAudits(filters: {
  tenantId: number;
  supplierId?: number;
  auditType?: string;
  result?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결 실패");
  if (!filters.tenantId) throw new Error("tenantId is required");

  const conditions: any[] = [eq(hSupplierAudits.tenantId, filters.tenantId)];
  if (filters.supplierId) conditions.push(eq(hSupplierAudits.supplierId, filters.supplierId));
  if (filters.auditType) conditions.push(eq(hSupplierAudits.auditType, filters.auditType));
  if (filters.result) conditions.push(eq(hSupplierAudits.result, filters.result as any));
  if (filters.dateFrom) conditions.push(gte(hSupplierAudits.auditDate, filters.dateFrom as any) );
  if (filters.dateTo) conditions.push(lte(hSupplierAudits.auditDate, filters.dateTo as any) );

  const query = db.select().from(hSupplierAudits).where(and(...conditions)).orderBy(desc(hSupplierAudits.auditDate));
  if (filters.limit) query.limit(filters.limit);
  if (filters.offset) query.offset(filters.offset);
  return await query;
}

export async function getSupplierAuditById(tenantId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결 실패");
  if (!tenantId) throw new Error("tenantId is required");
  
  const [result] = await db.select().from(hSupplierAudits).where(
    and(
      eq(hSupplierAudits.id, id),
      eq(hSupplierAudits.tenantId, tenantId)
    )
  );
  return result;
}

export async function updateSupplierAudit(tenantId: number, id: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결 실패");
  if (!tenantId) throw new Error("tenantId is required");
  
  await db.update(hSupplierAudits).set(data).where(
    and(
      eq(hSupplierAudits.id, id),
      eq(hSupplierAudits.tenantId, tenantId)
    )
  );
}

export async function deleteSupplierAudit(tenantId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결 실패");
  if (!tenantId) throw new Error("tenantId is required");
  
  await db.delete(hSupplierAudits).where(
    and(
      eq(hSupplierAudits.id, id),
      eq(hSupplierAudits.tenantId, tenantId)
    )
  );
}

// ============================================================================
// 공급업체 평가
// ============================================================================

export async function createSupplierEvaluation(tenantId: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결 실패");
  if (!tenantId) throw new Error("tenantId is required");
  
  const [result] = await db.insert(hSupplierEvaluations).values({ ...data, tenantId });
  return result.insertId;
}

export async function getSupplierEvaluations(filters: {
  tenantId: number;
  supplierId?: number;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결 실패");
  if (!filters.tenantId) throw new Error("tenantId is required");

  const conditions: any[] = [eq(hSupplierEvaluations.tenantId, filters.tenantId)];
  if (filters.supplierId) conditions.push(eq(hSupplierEvaluations.supplierId, filters.supplierId));
  if (filters.dateFrom) conditions.push(gte(hSupplierEvaluations.evaluationDate, filters.dateFrom as any) );
  if (filters.dateTo) conditions.push(lte(hSupplierEvaluations.evaluationDate, filters.dateTo as any) );

  const query = db.select().from(hSupplierEvaluations).where(and(...conditions)).orderBy(desc(hSupplierEvaluations.evaluationDate));
  if (filters.limit) query.limit(filters.limit);
  if (filters.offset) query.offset(filters.offset);
  return await query;
}

export async function getSupplierEvaluationById(tenantId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결 실패");
  if (!tenantId) throw new Error("tenantId is required");
  
  const [result] = await db.select().from(hSupplierEvaluations).where(
    and(
      eq(hSupplierEvaluations.id, id),
      eq(hSupplierEvaluations.tenantId, tenantId)
    )
  );
  return result;
}

export async function updateSupplierEvaluation(tenantId: number, id: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결 실패");
  if (!tenantId) throw new Error("tenantId is required");
  
  await db.update(hSupplierEvaluations).set(data).where(
    and(
      eq(hSupplierEvaluations.id, id),
      eq(hSupplierEvaluations.tenantId, tenantId)
    )
  );
}

export async function deleteSupplierEvaluation(tenantId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결 실패");
  if (!tenantId) throw new Error("tenantId is required");
  
  await db.delete(hSupplierEvaluations).where(
    and(
      eq(hSupplierEvaluations.id, id),
      eq(hSupplierEvaluations.tenantId, tenantId)
    )
  );
}

// ============================================================================
// 통계 및 대시보드
// ============================================================================

export async function getSupplierDashboard(tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결 실패");
  if (!tenantId) throw new Error("tenantId is required");

  const [supplierStats] = await db.select({
    total: sql<number>`COUNT(*)`,
    active: sql<number>`SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END)`,
    inactive: sql<number>`SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END)`,
  }).from(hSuppliers).where(eq(hSuppliers.tenantId, tenantId));

  const [auditStats] = await db.select({
    total: sql<number>`COUNT(*)`,
    pass: sql<number>`SUM(CASE WHEN result = 'pass' THEN 1 ELSE 0 END)`,
    fail: sql<number>`SUM(CASE WHEN result = 'fail' THEN 1 ELSE 0 END)`,
    conditional: sql<number>`SUM(CASE WHEN result = 'conditional' THEN 1 ELSE 0 END)`,
    avgScore: sql<number>`AVG(score)`,
  }).from(hSupplierAudits).where(eq(hSupplierAudits.tenantId, tenantId));

  const [evalStats] = await db.select({
    total: sql<number>`COUNT(*)`,
    avgOverall: sql<number>`AVG(overall_score)`,
    avgQuality: sql<number>`AVG(quality_score)`,
    avgDelivery: sql<number>`AVG(delivery_score)`,
    avgPrice: sql<number>`AVG(price_score)`,
    avgService: sql<number>`AVG(service_score)`,
    avgResponse: sql<number>`AVG(response_score)`,
  }).from(hSupplierEvaluations).where(eq(hSupplierEvaluations.tenantId, tenantId));

  return { supplierStats, auditStats, evalStats };
}

// 감사 예정 목록 (다음 감사일이 가까운 순)
export async function getUpcomingAudits(tenantId: number, limit: number = 10) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결 실패");
  if (!tenantId) throw new Error("tenantId is required");

  return await db.select().from(hSupplierAudits)
    .where(and(
      eq(hSupplierAudits.tenantId, tenantId),
      gte(hSupplierAudits.nextAuditDate, sql`CURDATE()`)
    ))
    .orderBy(hSupplierAudits.nextAuditDate)
    .limit(limit);
}

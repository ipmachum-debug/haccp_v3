/**
 * 부적합 제품 관리 DB 함수
 */

import { getDb } from "../db";
import { eq, and, desc, gte, lte, sql, inArray } from "drizzle-orm";
import {
  h_nonconforming_products,
  h_nonconforming_product_attachments,
  h_nonconforming_product_stats,
} from "../../drizzle/schema";

// ============================================================================
// 부적합 제품 관리
// ============================================================================

/**
 * 부적합 제품 생성
 */
export async function createNonconformingProduct(data: any, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결 실패");

  const [result] = await db.insert(h_nonconforming_products).values({
      ...data, tenantId });
  return result.insertId;
}

/**
 * 부적합 제품 목록 조회
 */
export async function getNonconformingProducts(filters: {
  siteId: number;
  status?: string;
  detectionSource?: string;
  nonconformityType?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결 실패");

  const conditions: any[] = [eq(h_nonconforming_products.tenantId, tenantId as any) , eq(h_nonconforming_products.siteId, filters.siteId)];

  if (filters.status) {
    conditions.push(eq(h_nonconforming_products.status, filters.status as any));
  }
  if (filters.detectionSource) {
    conditions.push(eq(h_nonconforming_products.detectionSource, filters.detectionSource as any));
  }
  if (filters.nonconformityType) {
    conditions.push(eq(h_nonconforming_products.nonconformityType, filters.nonconformityType as any));
  }
  if (filters.dateFrom) {
    conditions.push(gte(h_nonconforming_products.detectionDate, filters.dateFrom as any) );
  }
  if (filters.dateTo) {
    conditions.push(lte(h_nonconforming_products.detectionDate, filters.dateTo as any) );
  }

  const query = db
    .select()
    .from(h_nonconforming_products)
    .where(and(eq(h_nonconforming_products.tenantId, tenantId as any) , ...conditions) as any)
    .orderBy(desc(h_nonconforming_products.detectionDate));

  if (filters.limit) {
    query.limit(filters.limit);
  }
  if (filters.offset) {
    query.offset(filters.offset);
  }

  return await query;
}

/**
 * 부적합 제품 상세 조회
 */
export async function getNonconformingProductById(id: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결 실패");

  const [result] = await db
    .select()
    .from(h_nonconforming_products)
    .where(and(eq(h_nonconforming_products.tenantId, tenantId as any) , eq(h_nonconforming_products.id, id)) as any);
  return result;
}

/**
 * 부적합 제품 수정
 */
export async function updateNonconformingProduct(id: number, data: any, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결 실패");

  await db
    .update(h_nonconforming_products)
    .set(data)
    .where(and(eq(h_nonconforming_products.tenantId, tenantId as any) , eq(h_nonconforming_products.id, id)) as any);}

/**
 * 부적합 제품 삭제
 */
export async function deleteNonconformingProduct(id: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결 실패");

  await db
    .delete(h_nonconforming_products)
    .where(and(eq(h_nonconforming_products.tenantId, tenantId as any) , eq(h_nonconforming_products.id, id)) as any);}

/**
 * 부적합 제품 상태 변경
 */
export async function updateNonconformingProductStatus(id: number, status: string, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결 실패");

  await db
    .update(h_nonconforming_products)
    .set({ status: status as any })
    .where(and(eq(h_nonconforming_products.tenantId, tenantId as any) , eq(h_nonconforming_products.id, id)) as any);}

/**
 * 부적합 제품 승인
 */
export async function approveNonconformingProduct(id: number, approvedBy: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결 실패");

  await db
    .update(h_nonconforming_products)
    .set({
      approvedBy,
      approvedAt: new Date(),
      status: "disposed" as any,
    })
    .where(and(eq(h_nonconforming_products.tenantId, tenantId as any) , eq(h_nonconforming_products.id, id)) as any);}

// ============================================================================
// 첨부 파일 관리
// ============================================================================

/**
 * 첨부 파일 추가
 */
export async function addAttachment(data: any, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결 실패");

  const [result] = await db.insert(h_nonconforming_product_attachments).values({
      ...data, tenantId });
  return result.insertId;
}

/**
 * 첨부 파일 목록 조회
 */
export async function getAttachments(ncpId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결 실패");

  return await db
    .select()
    .from(h_nonconforming_product_attachments)
    .where(and(eq(h_nonconforming_product_attachments.tenantId, tenantId as any) , eq(h_nonconforming_product_attachments.ncpId, ncpId)) as any)    .orderBy(desc(h_nonconforming_product_attachments.uploadedAt));
}

/**
 * 첨부 파일 삭제
 */
export async function deleteAttachment(id: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결 실패");

  await db
    .delete(h_nonconforming_product_attachments)
    .where(and(eq(h_nonconforming_product_attachments.tenantId, tenantId as any) , eq(h_nonconforming_product_attachments.id, id)) as any);}

// ============================================================================
// 통계 및 보고서
// ============================================================================

/**
 * 부적합 제품 통계 조회
 */
export async function getNonconformingProductStats(filters: {
  siteId: number;
  year?: number;
  month?: number;
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결 실패");

  const conditions: any[] = [eq(h_nonconforming_product_stats.tenantId, tenantId as any) , eq(h_nonconforming_product_stats.siteId, filters.siteId)];

  if (filters.year) {
    conditions.push(eq(h_nonconforming_product_stats.year, filters.year));
  }
  if (filters.month) {
    conditions.push(eq(h_nonconforming_product_stats.month, filters.month));
  }

  return await db
    .select()
    .from(h_nonconforming_product_stats)
    .where(and(eq(h_nonconforming_product_stats.tenantId, tenantId as any) , ...conditions) as any)
    .orderBy(
      desc(h_nonconforming_product_stats.year),
      desc(h_nonconforming_product_stats.month)
    );
}

/**
 * 부적합 제품 대시보드 데이터
 */
export async function getNonconformingProductDashboard(siteId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결 실패");

  // 전체 통계
  const [totalStats] = await db
    .select({
      total: sql<number>`COUNT(*)`,
      detected: sql<number>`SUM(CASE WHEN status = 'detected' THEN 1 ELSE 0 END)`,
      underInvestigation: sql<number>`SUM(CASE WHEN status = 'under_investigation' THEN 1 ELSE 0 END)`,
      pendingDisposal: sql<number>`SUM(CASE WHEN status = 'pending_disposal' THEN 1 ELSE 0 END)`,
      disposed: sql<number>`SUM(CASE WHEN status = 'disposed' THEN 1 ELSE 0 END)`,
      closed: sql<number>`SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END)`,
    })
    .from(h_nonconforming_products)
    .where(and(eq(h_nonconforming_products.tenantId, tenantId as any) , eq(h_nonconforming_products.siteId, siteId)) as any);
  // 발견 경로별 통계
  const detectionSourceStats = await db
    .select({
      detectionSource: h_nonconforming_products.detectionSource,
      count: sql<number>`COUNT(*)`,
    })
    .from(h_nonconforming_products)
    .where(and(eq(h_nonconforming_products.tenantId, tenantId as any) , eq(h_nonconforming_products.siteId, siteId)) as any)    .groupBy(h_nonconforming_products.detectionSource);

  // 부적합 유형별 통계
  const nonconformityTypeStats = await db
    .select({
      nonconformityType: h_nonconforming_products.nonconformityType,
      count: sql<number>`COUNT(*)`,
    })
    .from(h_nonconforming_products)
    .where(and(eq(h_nonconforming_products.tenantId, tenantId as any) , eq(h_nonconforming_products.siteId, siteId)) as any)    .groupBy(h_nonconforming_products.nonconformityType);

  // 처리 방법별 통계
  const disposalMethodStats = await db
    .select({
      disposalMethod: h_nonconforming_products.disposalMethod,
      count: sql<number>`COUNT(*)`,
    })
    .from(h_nonconforming_products)
    .where(and(eq(h_nonconforming_products.tenantId, tenantId as any) , eq(h_nonconforming_products.siteId, siteId)) as any)    .groupBy(h_nonconforming_products.disposalMethod);

  // 월별 추세 (최근 12개월)
  const monthlyTrend = await db
    .select({
      month: sql<string>`DATE_FORMAT(detection_date, '%Y-%m')`,
      count: sql<number>`COUNT(*)`,
    })
    .from(h_nonconforming_products)
    .where(
      and(eq(h_nonconforming_products.tenantId, tenantId as any) , 
        eq(h_nonconforming_products.siteId, siteId),
        gte(h_nonconforming_products.detectionDate, sql`DATE_SUB(CURDATE(), INTERVAL 12 MONTH)`)
      ) as any
    )
    .groupBy(sql`DATE_FORMAT(detection_date, '%Y-%m')`)
    .orderBy(sql`DATE_FORMAT(detection_date, '%Y-%m')`);

  return {
    totalStats,
    detectionSourceStats,
    nonconformityTypeStats,
    disposalMethodStats,
    monthlyTrend,
  };
}

/**
 * 부적합률 계산
 */
export async function calculateNonconformityRate(filters: {
  siteId: number;
  dateFrom: string;
  dateTo: string;
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결 실패");

  // 부적합 제품 수량
  const [ncpResult] = await db
    .select({
      totalQuantity: sql<number>`SUM(quantity)`,
      totalCount: sql<number>`COUNT(*)`,
    })
    .from(h_nonconforming_products)
    .where(
      and(eq(h_nonconforming_products.tenantId, tenantId as any) , 
        eq(h_nonconforming_products.siteId, filters.siteId),
        gte(h_nonconforming_products.detectionDate, filters.dateFrom as any) ,
        lte(h_nonconforming_products.detectionDate, filters.dateTo as any) 
      ) as any
    );

  // TODO: 전체 생산량 조회 (배치 테이블에서)
  // 현재는 부적합 제품 통계만 반환
  return {
    ncpQuantity: ncpResult?.totalQuantity || 0,
    ncpCount: ncpResult?.totalCount || 0,
  };
}

/**
 * 부적합 제품 보고서 생성
 */
export async function generateNonconformingProductReport(filters: {
  siteId: number;
  dateFrom: string;
  dateTo: string;
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결 실패");

  const products = await getNonconformingProducts({
    siteId: filters.siteId,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
  }, tenantId);

  const dashboard = await getNonconformingProductDashboard(filters.siteId, tenantId);
  const rate = await calculateNonconformityRate(filters, tenantId);

  return {
    period: {
      from: filters.dateFrom,
      to: filters.dateTo,
    },
    summary: {
      totalCount: products.length,
      ...dashboard.totalStats,
    },
    statistics: {
      byDetectionSource: dashboard.detectionSourceStats,
      byNonconformityType: dashboard.nonconformityTypeStats,
      byDisposalMethod: dashboard.disposalMethodStats,
    },
    trend: dashboard.monthlyTrend,
    nonconformityRate: rate,
    products,
  };
}

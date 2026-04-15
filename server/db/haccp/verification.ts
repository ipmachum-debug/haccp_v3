import { eq, and, gte, lte, desc, sql, type SQL } from "drizzle-orm";
import { getDb } from "../connection";
import { todayKST, formatLocalDate} from "../../utils/timezone";

import {
  hHaccpPlanVerification,
  hHaccpPlanVerificationChecklist,
} from "../../../drizzle/schema";

/**
 * HACCP 계획 검증 DB 함수
 */

// HACCP 계획 검증 생성
export async function createHaccpPlanVerification(data: Record<string, unknown>, tenantId?: number) {
  const db = await getDb();
  const result = await db.insert(hHaccpPlanVerification).values({
      ...data, tenantId } as any);
  return result[0].insertId;
}

// HACCP 계획 검증 목록 조회
export async function getHaccpPlanVerifications(params: {
  siteId?: number;
  verificationType?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}, tenantId?: number) {
  const db = await getDb();
  const { siteId, verificationType, startDate, endDate, limit = 50, offset = 0 } = params;

  let query: any = db.select().from(hHaccpPlanVerification).where(eq(hHaccpPlanVerification.tenantId, tenantId as any) );

  const conditions: SQL[] = [];
  if (tenantId) conditions.push(eq(hHaccpPlanVerification.tenantId, tenantId as number));
  if (siteId) conditions.push(eq(hHaccpPlanVerification.siteId, siteId));
  if (verificationType) conditions.push(eq(hHaccpPlanVerification.verificationType, verificationType as any));
  if (startDate) conditions.push(gte(hHaccpPlanVerification.verificationDate, startDate as any) );
  if (endDate) conditions.push(lte(hHaccpPlanVerification.verificationDate, endDate as any) );

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  const results = await query
    .orderBy(desc(hHaccpPlanVerification.verificationDate))
    .limit(limit)
    .offset(offset);

  return results;
}

// HACCP 계획 검증 상세 조회
export async function getHaccpPlanVerificationById(id: number, tenantId?: number) {
  const db = await getDb();
  const results = await db
    .select()
    .from(hHaccpPlanVerification)
    .where(and(eq(hHaccpPlanVerification.tenantId, tenantId as any) , eq(hHaccpPlanVerification.id, id)) as any)    .limit(1);

  if (results.length === 0) return null;

  const verification = results[0];

  // 체크리스트 함께 조회
  const checklistItems = await getVerificationChecklistItems(id);

  return {
    ...verification,
    productIds: verification.productIds ? JSON.parse(verification.productIds) : [],
    verificationTeam: verification.verificationTeam ? JSON.parse(verification.verificationTeam) : [],
    findings: verification.findings ? JSON.parse(verification.findings) : [],
    attachments: verification.attachments ? JSON.parse(verification.attachments) : [],
    checklistItems,
  };
}

// HACCP 계획 검증 수정
export async function updateHaccpPlanVerification(id: number, data: Record<string, unknown>, tenantId?: number) {
  const db = await getDb();
  await db
    .update(hHaccpPlanVerification)
    .set(data)
    .where(and(eq(hHaccpPlanVerification.tenantId, tenantId as any) , eq(hHaccpPlanVerification.id, id)) as any);}

// HACCP 계획 검증 삭제
export async function deleteHaccpPlanVerification(id: number, tenantId?: number) {
  const db = await getDb();
  
  // 체크리스트 항목 먼저 삭제
  await db
    .delete(hHaccpPlanVerificationChecklist)
    .where(and(eq(hHaccpPlanVerificationChecklist.tenantId, tenantId as any) , eq(hHaccpPlanVerificationChecklist.verificationId, id)) as any);  
  // 검증 기록 삭제
  await db
    .delete(hHaccpPlanVerification)
    .where(and(eq(hHaccpPlanVerification.tenantId, tenantId as any) , eq(hHaccpPlanVerification.id, id)) as any);}

// 검증 체크리스트 항목 생성
export async function createVerificationChecklistItem(data: Record<string, unknown>, tenantId?: number) {
  const db = await getDb();
  const result = await db.insert(hHaccpPlanVerificationChecklist).values({
      ...data, tenantId } as any);
  return result[0].insertId;
}

// 검증 체크리스트 목록 조회
export async function getVerificationChecklistItems(verificationId: number, tenantId?: number) {
  const db = await getDb();
  return await db
    .select()
    .from(hHaccpPlanVerificationChecklist)
    .where(and(eq(hHaccpPlanVerificationChecklist.tenantId, tenantId as any) , eq(hHaccpPlanVerificationChecklist.verificationId, verificationId)) as any);}

// 검증 체크리스트 항목 수정
export async function updateVerificationChecklistItem(id: number, data: Record<string, unknown>, tenantId?: number) {
  const db = await getDb();
  await db
    .update(hHaccpPlanVerificationChecklist)
    .set(data)
    .where(and(eq(hHaccpPlanVerificationChecklist.tenantId, tenantId as any) , eq(hHaccpPlanVerificationChecklist.id, id)) as any);}

// 검증 체크리스트 항목 삭제
export async function deleteVerificationChecklistItem(id: number, tenantId?: number) {
  const db = await getDb();
  await db
    .delete(hHaccpPlanVerificationChecklist)
    .where(and(eq(hHaccpPlanVerificationChecklist.tenantId, tenantId as any) , eq(hHaccpPlanVerificationChecklist.id, id)) as any);}

// 검증 통계 조회
export async function getVerificationStatistics(params: {
  siteId?: number;
  startDate?: string;
  endDate?: string;
}, tenantId?: number) {
  const db = await getDb();
  const { siteId, startDate, endDate } = params;

  const conditions: SQL[] = [];
  if (tenantId) conditions.push(eq(hHaccpPlanVerification.tenantId, tenantId as number));
  if (siteId) conditions.push(eq(hHaccpPlanVerification.siteId, siteId));
  if (startDate) conditions.push(gte(hHaccpPlanVerification.verificationDate, startDate as any) );
  if (endDate) conditions.push(lte(hHaccpPlanVerification.verificationDate, endDate as any) );

  let query: any = db.select().from(hHaccpPlanVerification).where(eq(hHaccpPlanVerification.tenantId, tenantId as any) );
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  const verifications = await query;

  interface VerificationRow { overallResult?: string | null; verificationType?: string | null }
  const total = verifications.length;
  const adequate = verifications.filter((v: VerificationRow) => v.overallResult === "adequate").length;
  const needsImprovement = verifications.filter((v: VerificationRow) => v.overallResult === "needs_improvement").length;
  const inadequate = verifications.filter((v: VerificationRow) => v.overallResult === "inadequate").length;

  const byType = {
    annual: verifications.filter((v: VerificationRow) => v.verificationType === "annual").length,
    product_change: verifications.filter((v: VerificationRow) => v.verificationType === "product_change").length,
    process_change: verifications.filter((v: VerificationRow) => v.verificationType === "process_change").length,
    incident: verifications.filter((v: VerificationRow) => v.verificationType === "incident").length,
    regulation_change: verifications.filter((v: VerificationRow) => v.verificationType === "regulation_change").length,
  };

  return {
    total,
    byResult: {
      adequate,
      needsImprovement,
      inadequate,
    },
    byType,
  };
}

// 다음 검증 예정 목록
export async function getUpcomingVerifications(params: {
  siteId?: number;
  days?: number;
}, tenantId?: number) {
  const db = await getDb();
  const { siteId, days = 30 } = params;

  const today = todayKST();
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + days);
  const futureDateStr = formatLocalDate(futureDate);

  const conditions: SQL[] = [
    gte(hHaccpPlanVerification.nextVerificationDate, today as any) ,
    lte(hHaccpPlanVerification.nextVerificationDate, futureDateStr as any) ,
  ];

  if (siteId) {
    conditions.push(eq(hHaccpPlanVerification.siteId, siteId));
  }

  return await db
    .select()
    .from(hHaccpPlanVerification)
    .where(and(eq(hHaccpPlanVerification.tenantId, tenantId as any) , ...conditions) as any)
    .orderBy(hHaccpPlanVerification.nextVerificationDate);
}

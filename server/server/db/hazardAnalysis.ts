import { eq, and, desc } from "drizzle-orm";
import { getDb } from "../db";
import {
  hHazardAnalysis,
  hHazardControls
} from "../../drizzle/schema";

/**
 * 위험 분석 DB 헬퍼 함수
 */

// ============================================================================
// 위험 분석 (Hazard Analysis)
// ============================================================================

export async function createHazardAnalysis(data: {
  productId: number;
  siteId: number;
  processStep: string;
  hazardType: "biological" | "chemical" | "physical";
  hazardDescription: string;
  severity: number;
  likelihood: number;
  controlMeasures?: string;
  monitoringProcedure?: string;
  criticalLimit?: string;
  analyzedBy: number;
  analyzedDate: string; // YYYY-MM-DD 형식
}, tenantId?: number) {
  const riskScore = data.severity * data.likelihood;
  let riskLevel: "low" | "medium" | "high" | "critical";
  
  if (riskScore <= 5) riskLevel = "low";
  else if (riskScore <= 10) riskLevel = "medium";
  else if (riskScore <= 15) riskLevel = "high";
  else riskLevel = "critical";

  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [result] = await db.insert(hHazardAnalysis).values({
      tenantId,
    productId: data.productId,
    siteId: data.siteId,
    processStep: data.processStep,
    hazardType: data.hazardType,
    hazardDescription: data.hazardDescription,
    severity: data.severity,
    likelihood: data.likelihood,
    riskScore,
    riskLevel,
    controlMeasures: data.controlMeasures,
    monitoringProcedure: data.monitoringProcedure,
    criticalLimit: data.criticalLimit,
    analyzedBy: data.analyzedBy,
    analyzedDate: new Date(data.analyzedDate)
  });

  return result.insertId;
}

export async function getHazardAnalysisByProduct(productId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db
    .select()
    .from(hHazardAnalysis)
    .where(and(eq(hHazardAnalysis.tenantId, tenantId), eq(hHazardAnalysis.productId, productId)))    .orderBy(desc(hHazardAnalysis.createdAt));
}

export async function getHazardAnalysisById(id: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db
    .select()
    .from(hHazardAnalysis)
    .where(and(eq(hHazardAnalysis.tenantId, tenantId), eq(hHazardAnalysis.id, id)));  return result;
}

export async function updateHazardAnalysis(
  id: number,
  data: {
    processStep?: string;
    hazardType?: "biological" | "chemical" | "physical";
    hazardDescription?: string;
    severity?: number;
    likelihood?: number;
    isCcp?: number;
    ccpNumber?: string;
    controlMeasures?: string;
    monitoringProcedure?: string;
    criticalLimit?: string;
    status?: "draft" | "submitted" | "approved" | "rejected";
    approvedBy?: number;
    approvedDate?: string;
    reviewDate?: string;
  }, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 심각도나 발생 가능성이 변경되면 위험도 재계산
  if (data.severity !== undefined || data.likelihood !== undefined) {
    const current = await getHazardAnalysisById(id);
    const severity = data.severity ?? current.severity;
    const likelihood = data.likelihood ?? current.likelihood;
    const riskScore = severity * likelihood;
    
    let riskLevel: "low" | "medium" | "high" | "critical";
    if (riskScore <= 5) riskLevel = "low";
    else if (riskScore <= 10) riskLevel = "medium";
    else if (riskScore <= 15) riskLevel = "high";
    else riskLevel = "critical";

    const updateData: any = { ...data, riskScore, riskLevel };
    if (data.approvedDate) updateData.approvedDate = new Date(data.approvedDate);
    if (data.reviewDate) updateData.reviewDate = new Date(data.reviewDate);

    await db
      .update(hHazardAnalysis)
      .set(updateData)
      .where(and(eq(hHazardAnalysis.tenantId, tenantId), eq(hHazardAnalysis.id, id)));  } else {
    const updateData: any = { ...data };
    if (data.approvedDate) updateData.approvedDate = new Date(data.approvedDate);
    if (data.reviewDate) updateData.reviewDate = new Date(data.reviewDate);

    await db
      .update(hHazardAnalysis)
      .set(updateData)
      .where(and(eq(hHazardAnalysis.tenantId, tenantId), eq(hHazardAnalysis.id, id)));  }
}

export async function deleteHazardAnalysis(id: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // 관련 관리 방법도 함께 삭제
  await db
    .delete(hHazardControls)
    .where(and(eq(hHazardControls.tenantId, tenantId), eq(hHazardControls.hazardAnalysisId, id)));  
  await db
    .delete(hHazardAnalysis)
    .where(and(eq(hHazardAnalysis.tenantId, tenantId), eq(hHazardAnalysis.id, id)));}

export async function getHazardAnalysisBySite(siteId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db
    .select()
    .from(hHazardAnalysis)
    .where(and(eq(hHazardAnalysis.tenantId, tenantId), eq(hHazardAnalysis.siteId, siteId)))    .orderBy(desc(hHazardAnalysis.createdAt));
}

export async function getHazardAnalysisByStatus(status: "draft" | "submitted" | "approved" | "rejected", tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db
    .select()
    .from(hHazardAnalysis)
    .where(and(eq(hHazardAnalysis.tenantId, tenantId), eq(hHazardAnalysis.status, status)))    .orderBy(desc(hHazardAnalysis.createdAt));
}

export async function getCcpHazardAnalysis(productId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db
    .select()
    .from(hHazardAnalysis)
    .where(
      and(eq(hHazardAnalysis.tenantId, tenantId), 
        eq(hHazardAnalysis.productId, productId),
        eq(hHazardAnalysis.isCcp, 1)
      )
    )
    .orderBy(desc(hHazardAnalysis.createdAt));
}

// ============================================================================
// 위험 요소 관리 방법 (Hazard Controls)
// ============================================================================

export async function createHazardControl(data: {
  hazardAnalysisId: number;
  controlType: "preventive" | "corrective" | "monitoring";
  controlDescription: string;
  responsibility?: string;
  frequency?: string;
  recordForm?: string;
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(hHazardControls).values({
      tenantId, ...data, tenantId });
  return result.insertId;
}

export async function getHazardControlsByAnalysisId(hazardAnalysisId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db
    .select()
    .from(hHazardControls)
    .where(and(eq(hHazardControls.tenantId, tenantId), eq(hHazardControls.hazardAnalysisId, hazardAnalysisId)));}

export async function updateHazardControl(
  id: number,
  data: {
    controlType?: "preventive" | "corrective" | "monitoring";
    controlDescription?: string;
    responsibility?: string;
    frequency?: string;
    recordForm?: string;
  }, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(hHazardControls)
    .set(data)
    .where(and(eq(hHazardControls.tenantId, tenantId), eq(hHazardControls.id, id)));}

export async function deleteHazardControl(id: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .delete(hHazardControls)
    .where(and(eq(hHazardControls.tenantId, tenantId), eq(hHazardControls.id, id)));}

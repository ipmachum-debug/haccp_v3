import { eq, and, desc, or } from "drizzle-orm";
import { getDb } from "../db";
import {
  hCorrectiveActionRequests,
  hCorrectiveActionAttachments
} from "../../drizzle/schema";

/**
 * 시정 조치 관리 DB 헬퍼 함수
 */

// ============================================================================
// 시정 조치 요청 (Corrective Action Requests)
// ============================================================================

export async function generateRequestNumber(tenantId?: number): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // CAR-YYYYMMDD-XXX 형식
  const today = new Date().toISOString().split("T")[0].replace(/-/g, "");
  const prefix = `CAR-${today}`;

  const [lastRequest] = await db
    .select()
    .from(hCorrectiveActionRequests)
    .where(and(eq(hCorrectiveActionRequests.tenantId, tenantId), eq(hCorrectiveActionRequests.requestNumber, prefix)))    .orderBy(desc(hCorrectiveActionRequests.id))
    .limit(1);

  if (!lastRequest) {
    return `${prefix}-001`;
  }

  const lastNumber = parseInt(lastRequest.requestNumber.split("-")[2] || "0");
  const nextNumber = (lastNumber + 1).toString().padStart(3, "0");
  return `${prefix}-${nextNumber}`;
}

export async function createCorrectiveActionRequest(data: {
  sourceType: "ccp_deviation" | "inspection_failure" | "customer_complaint" | "internal_audit" | "other";
  sourceId?: number;
  batchId?: number;
  ccpInstanceId?: number;
  problemDescription: string;
  occurredAt: Date;
  detectedBy: number;
  immediateAction?: string;
  priority?: "low" | "medium" | "high" | "critical";
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const requestNumber = await generateRequestNumber();

  const [result] = await db.insert(hCorrectiveActionRequests).values({
      tenantId,
    requestNumber,
    ...data,
    priority: data.priority || "medium"
  });

  return result.insertId;
}

export async function getCorrectiveActionRequestById(id: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [result] = await db
    .select()
    .from(hCorrectiveActionRequests)
    .where(and(eq(hCorrectiveActionRequests.tenantId, tenantId), eq(hCorrectiveActionRequests.id, id)));  
  return result;
}

export async function getCorrectiveActionRequestsByBatch(batchId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return db
    .select()
    .from(hCorrectiveActionRequests)
    .where(and(eq(hCorrectiveActionRequests.tenantId, tenantId), eq(hCorrectiveActionRequests.batchId, batchId)))    .orderBy(desc(hCorrectiveActionRequests.createdAt));
}

export async function getCorrectiveActionRequestsByStatus(
  status: "open" | "investigating" | "action_taken" | "verifying" | "closed" | "reopened", tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return db
    .select()
    .from(hCorrectiveActionRequests)
    .where(and(eq(hCorrectiveActionRequests.tenantId, tenantId), eq(hCorrectiveActionRequests.status, status)))    .orderBy(desc(hCorrectiveActionRequests.createdAt));
}

export async function getAllCorrectiveActionRequests(tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return db
    .select()
    .from(hCorrectiveActionRequests).where(eq(hCorrectiveActionRequests.tenantId, tenantId)).orderBy(desc(hCorrectiveActionRequests.createdAt));
}

export async function updateCorrectiveActionRequest(
  id: number,
  data: {
    immediateAction?: string;
    immediateActionBy?: number;
    immediateActionAt?: Date;
    rootCauseAnalysis?: string;
    rootCauseCategory?: "human_error" | "equipment_failure" | "material_defect" | "process_issue" | "environmental" | "other";
    correctiveAction?: string;
    actionBy?: number;
    actionStartDate?: string;
    actionDueDate?: string;
    actionCompletedDate?: string;
    verificationMethod?: string;
    verificationResult?: string;
    verifiedBy?: number;
    verifiedDate?: string;
    isEffective?: number;
    status?: "open" | "investigating" | "action_taken" | "verifying" | "closed" | "reopened";
    priority?: "low" | "medium" | "high" | "critical";
    preventiveAction?: string;
  }, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const updateData: any = { ...data };
  if (data.actionStartDate) updateData.actionStartDate = new Date(data.actionStartDate);
  if (data.actionDueDate) updateData.actionDueDate = new Date(data.actionDueDate);
  if (data.actionCompletedDate) updateData.actionCompletedDate = new Date(data.actionCompletedDate);
  if (data.verifiedDate) updateData.verifiedDate = new Date(data.verifiedDate);

  await db
    .update(hCorrectiveActionRequests)
    .set(updateData)
    .where(and(eq(hCorrectiveActionRequests.tenantId, tenantId), eq(hCorrectiveActionRequests.id, id)));}

export async function deleteCorrectiveActionRequest(id: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // 첨부 파일도 함께 삭제
  await db
    .delete(hCorrectiveActionAttachments)
    .where(and(eq(hCorrectiveActionAttachments.tenantId, tenantId), eq(hCorrectiveActionAttachments.requestId, id)));  
  await db
    .delete(hCorrectiveActionRequests)
    .where(and(eq(hCorrectiveActionRequests.tenantId, tenantId), eq(hCorrectiveActionRequests.id, id)));}

// ============================================================================
// 시정 조치 첨부 파일 (Corrective Action Attachments)
// ============================================================================

export async function addCorrectiveActionAttachment(data: {
  requestId: number;
  fileName: string;
  fileUrl: string;
  fileType?: string;
  fileSize?: number;
  uploadedBy: number;
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [result] = await db.insert(hCorrectiveActionAttachments).values({
      tenantId, ...data, tenantId });
  return result.insertId;
}

export async function getCorrectiveActionAttachments(requestId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return db
    .select()
    .from(hCorrectiveActionAttachments)
    .where(and(eq(hCorrectiveActionAttachments.tenantId, tenantId), eq(hCorrectiveActionAttachments.requestId, requestId)));}

export async function deleteCorrectiveActionAttachment(id: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db
    .delete(hCorrectiveActionAttachments)
    .where(and(eq(hCorrectiveActionAttachments.tenantId, tenantId), eq(hCorrectiveActionAttachments.id, id)));}

// ============================================================================
// CCP 이탈 시 자동 시정 조치 생성
// ============================================================================

export async function createCorrectiveActionFromCcpDeviation(data: {
  ccpInstanceId: number;
  batchId: number;
  problemDescription: string;
  detectedBy: number;
}, tenantId?: number) {
  return createCorrectiveActionRequest({
    sourceType: "ccp_deviation",
    sourceId: data.ccpInstanceId,
    batchId: data.batchId,
    ccpInstanceId: data.ccpInstanceId,
    problemDescription: data.problemDescription,
    occurredAt: new Date(),
    detectedBy: data.detectedBy,
    priority: "high", // CCP 이탈은 높은 우선순위
  });
}

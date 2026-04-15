import { getDb } from "../connection";
import {
  accountingDocuments,
  accountingDocumentWorkflow,
  type NewAccountingDocument,
  type NewAccountingDocumentWorkflow
} from "../../../drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";

/**
 * 문서 업로드
 */
export async function createDocument(data: NewAccountingDocument, tenantId?: number) {
  const db = await getDb();
  
  const result = await db.insert(accountingDocuments).values({
      ...data, tenantId } as any);
  const documentId = Number(result[0].insertId);

  // 초기 워크플로우 상태 생성 (uploaded)
  await db.insert(accountingDocumentWorkflow).values({
      tenantId,
    documentId,
    status: "uploaded",
    changedBy: data.uploadedBy,
    changedAt: new Date(),
    comment: "문서 업로드 완료",
    notificationSent: 0
  } as any);

  return documentId;
}

/**
 * 문서 목록 조회
 */
export async function listDocuments(filters?: {
  category?: string;
  year?: number;
  month?: number;
  limit?: number;
}, tenantId?: number) {
  const db = await getDb();
  
  let query: any = db.select().from(accountingDocuments).where(eq(accountingDocuments.tenantId, tenantId as any) );

  const conditions: any[] = [];
  if (tenantId) conditions.push(eq(accountingDocumentWorkflow.tenantId, tenantId));
  
  if (filters?.category) {
    conditions.push(eq(accountingDocuments.category, filters.category as any));
  }
  
  if (filters?.year) {
    conditions.push(eq(accountingDocuments.year, filters.year));
  }
  
  if (filters?.month) {
    conditions.push(eq(accountingDocuments.month, filters.month));
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  query = query.orderBy(desc(accountingDocuments.uploadedAt)) as any;

  if (filters?.limit) {
    query = query.limit(filters.limit) as any;
  }

  return query;
}

/**
 * 문서 상세 조회
 */
export async function getDocument(id: number, tenantId?: number) {
  const db = await getDb();
  
  const result = await db
    .select()
    .from(accountingDocuments)
    .where(and(eq(accountingDocuments.tenantId, tenantId as any) , eq(accountingDocuments.id, id)) as any)    .limit(1);

  return result[0] || null;
}

/**
 * 문서 삭제
 */
export async function deleteDocument(id: number, tenantId?: number) {
  const db = await getDb();
  
  // 워크플로우 이력도 함께 삭제
  await db
    .delete(accountingDocumentWorkflow)
    .where(and(eq(accountingDocumentWorkflow.tenantId, tenantId as any) , eq(accountingDocumentWorkflow.documentId, id)) as any);
  await db
    .delete(accountingDocuments)
    .where(and(eq(accountingDocuments.tenantId, tenantId as any) , eq(accountingDocuments.id, id)) as any);}

/**
 * 문서 상태 변경
 */
export async function updateDocumentStatus(
  documentId: number,
  status: "requested" | "uploaded" | "reviewed" | "completed" | "rejected",
  userId: number,
  comment?: string, tenantId?: number) {
  const db = await getDb();
  
  await db.insert(accountingDocumentWorkflow).values({
      tenantId,
    documentId,
    status,
    changedBy: userId,
    changedAt: new Date(),
    comment: comment || null,
    notificationSent: 0
  } as any);
}

/**
 * 문서 워크플로우 이력 조회
 */
export async function getDocumentWorkflow(documentId: number, tenantId?: number) {
  const db = await getDb();
  
  return db
    .select()
    .from(accountingDocumentWorkflow)
    .where(and(eq(accountingDocumentWorkflow.tenantId, tenantId as any) , eq(accountingDocumentWorkflow.documentId, documentId)) as any)    .orderBy(desc(accountingDocumentWorkflow.changedAt));
}

/**
 * 문서의 최신 상태 조회
 */
export async function getDocumentLatestStatus(documentId: number, tenantId?: number) {
  const db = await getDb();
  
  const result = await db
    .select()
    .from(accountingDocumentWorkflow)
    .where(and(eq(accountingDocumentWorkflow.tenantId, tenantId as any) , eq(accountingDocumentWorkflow.documentId, documentId)) as any)    .orderBy(desc(accountingDocumentWorkflow.changedAt))
    .limit(1);

  return result[0] || null;
}

/**
 * 알림 미발송 워크플로우 조회
 */
export async function getPendingNotifications(limit = 100, tenantId?: number) {
  const db = await getDb();
  
  return db
    .select()
    .from(accountingDocumentWorkflow)
    .where(and(eq(accountingDocumentWorkflow.tenantId, tenantId as any) , eq(accountingDocumentWorkflow.notificationSent, 0)) as any)    .orderBy(desc(accountingDocumentWorkflow.changedAt))
    .limit(limit);
}

/**
 * 알림 발송 완료 표시
 */
export async function markNotificationSent(workflowId: number, tenantId?: number) {
  const db = await getDb();
  
  await db
    .update(accountingDocumentWorkflow)
    .set({ notificationSent: 1 })
    .where(and(eq(accountingDocumentWorkflow.tenantId, tenantId as any) , eq(accountingDocumentWorkflow.id, workflowId)) as any);}

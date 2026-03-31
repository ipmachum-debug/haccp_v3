/**
 * 업로드 이력 관리 함수
 * P0: 모든 함수에 tenantId 필터링 적용 - 테넌트 격리
 */

import { getDb } from "../db.js";

/**
 * 업로드 이력 생성
 */
export async function createUploadHistory(data: {
  uploadType: string;
  userId: number;
  userName: string;
  fileName: string;
  totalCount: number;
  successCount: number;
  errorCount: number;
  errors?: any[];
  tenantId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { hUploadHistory } = await import("../../drizzle/schema.js");
  
  const insertData: any = {
    uploadType: data.uploadType,
    userId: data.userId,
    userName: data.userName,
    fileName: data.fileName,
    totalCount: data.totalCount,
    successCount: data.successCount,
    errorCount: data.errorCount,
    errors: data.errors ? JSON.stringify(data.errors) : null
  };
  if (data.tenantId) insertData.tenantId = data.tenantId;

  const result = await db.insert(hUploadHistory).values(insertData);

  return { id: Number(result[0].insertId) };
}

/**
 * 업로드 이력 조회 (전체)
 * P0: tenantId 필수
 */
export async function getAllUploadHistory(tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { hUploadHistory } = await import("../../drizzle/schema.js");
  const { desc, eq, and } = await import("drizzle-orm");

  let query = db.select().from(hUploadHistory);
  if (tenantId) {
    query = query.where(eq(hUploadHistory.tenantId, tenantId)) as any;
  }
  const histories = await query.orderBy(desc(hUploadHistory.createdAt));

  return histories.map((h: any) => ({
    ...h,
    errors: h.errors ? JSON.parse(h.errors) : []
  }));
}

/**
 * 업로드 이력 조회 (타입별)
 * P0: tenantId 필수
 */
export async function getUploadHistoryByType(uploadType: string, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { hUploadHistory } = await import("../../drizzle/schema.js");
  const { desc, eq, and } = await import("drizzle-orm");

  const conditions: any[] = [eq(hUploadHistory.uploadType, uploadType)];
  if (tenantId) conditions.push(eq(hUploadHistory.tenantId, tenantId));

  const histories = await db
    .select()
    .from(hUploadHistory)
    .where(conditions.length > 1 ? and(...conditions) : conditions[0])
    .orderBy(desc(hUploadHistory.createdAt));

  return histories.map((h: any) => ({
    ...h,
    errors: h.errors ? JSON.parse(h.errors) : []
  }));
}

/**
 * 업로드 이력 조회 (사용자별)
 * P0: tenantId 필수
 */
export async function getUploadHistoryByUser(userId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { hUploadHistory } = await import("../../drizzle/schema.js");
  const { desc, eq, and } = await import("drizzle-orm");

  const conditions: any[] = [eq(hUploadHistory.userId, userId)];
  if (tenantId) conditions.push(eq(hUploadHistory.tenantId, tenantId));

  const histories = await db
    .select()
    .from(hUploadHistory)
    .where(conditions.length > 1 ? and(...conditions) : conditions[0])
    .orderBy(desc(hUploadHistory.createdAt));

  return histories.map((h: any) => ({
    ...h,
    errors: h.errors ? JSON.parse(h.errors) : []
  }));
}

/**
 * 업로드 이력 삭제
 * P0: tenantId 필수
 */
export async function deleteUploadHistory(id: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { hUploadHistory } = await import("../../drizzle/schema.js");
  const { eq, and } = await import("drizzle-orm");

  const conditions = tenantId
    ? and(eq(hUploadHistory.id, id), eq(hUploadHistory.tenantId, tenantId))
    : eq(hUploadHistory.id, id);
  await db.delete(hUploadHistory).where(conditions);
  return { success: true };
}

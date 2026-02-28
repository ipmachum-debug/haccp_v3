/**
 * 업로드 이력 관리 함수
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
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { hUploadHistory } = await import("../../drizzle/schema.js");
  
  const result = await db.insert(hUploadHistory).values({
    uploadType: data.uploadType,
    userId: data.userId,
    userName: data.userName,
    fileName: data.fileName,
    totalCount: data.totalCount,
    successCount: data.successCount,
    errorCount: data.errorCount,
    errors: data.errors ? JSON.stringify(data.errors) : null
  });

  return { id: Number(result[0].insertId) };
}

/**
 * 업로드 이력 조회 (전체)
 */
export async function getAllUploadHistory() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { hUploadHistory } = await import("../../drizzle/schema.js");
  const { desc } = await import("drizzle-orm");

  const histories = await db
    .select()
    .from(hUploadHistory)
    .orderBy(desc(hUploadHistory.createdAt));

  return histories.map((h) => ({
    ...h,
    errors: h.errors ? JSON.parse(h.errors) : []
  }));
}

/**
 * 업로드 이력 조회 (타입별)
 */
export async function getUploadHistoryByType(uploadType: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { hUploadHistory } = await import("../../drizzle/schema.js");
  const { desc, eq } = await import("drizzle-orm");

  const histories = await db
    .select()
    .from(hUploadHistory)
    .where(eq(hUploadHistory.uploadType, uploadType))
    .orderBy(desc(hUploadHistory.createdAt));

  return histories.map((h) => ({
    ...h,
    errors: h.errors ? JSON.parse(h.errors) : []
  }));
}

/**
 * 업로드 이력 조회 (사용자별)
 */
export async function getUploadHistoryByUser(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { hUploadHistory } = await import("../../drizzle/schema.js");
  const { desc, eq } = await import("drizzle-orm");

  const histories = await db
    .select()
    .from(hUploadHistory)
    .where(eq(hUploadHistory.userId, userId))
    .orderBy(desc(hUploadHistory.createdAt));

  return histories.map((h) => ({
    ...h,
    errors: h.errors ? JSON.parse(h.errors) : []
  }));
}

/**
 * 업로드 이력 삭제
 */
export async function deleteUploadHistory(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { hUploadHistory } = await import("../../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");

  await db.delete(hUploadHistory).where(eq(hUploadHistory.id, id));
  return { success: true };
}

import { getDb } from "../connection";
import { hBatchApprovals } from "../../../drizzle/schema/part2";
import { eq, and, desc } from "drizzle-orm";

/**
 * 배치 승인 요청 생성
 */
export async function createBatchApproval(data: {
  batchId: number;
  approverId: number;
  notes?: string;
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const [result] = await db.insert(hBatchApprovals).values({
      tenantId,
    batchId: data.batchId,
    approverId: data.approverId,
    status: "pending",
    notes: data.notes || null
  } as any);

  return result.insertId;
}

/**
 * 배치 승인
 */
export async function approveBatch(data: {
  batchId: number;
  approverId: number;
  notes?: string;
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 기존 pending 승인 요청 업데이트
  await db
    .update(hBatchApprovals)
    .set({
      status: "approved",
      approvalDate: new Date(),
      notes: data.notes || null
    })
    .where(
      and(
        eq(hBatchApprovals.batchId, data.batchId),
        eq(hBatchApprovals.status, "pending")
      )
    );

  // 없으면 새로 생성
  const [existing] = await db
    .select()
    .from(hBatchApprovals)
    .where(and(eq(hBatchApprovals.tenantId, tenantId as any) , eq(hBatchApprovals.batchId, data.batchId)) as any)    .limit(1);

  if (!existing) {
    await db.insert(hBatchApprovals).values({
      tenantId,
      batchId: data.batchId,
      approverId: data.approverId,
      status: "approved",
      approvalDate: new Date(),
      notes: data.notes || null
    } as any);
  }
}

/**
 * 배치 반려
 */
export async function rejectBatch(data: {
  batchId: number;
  approverId: number;
  rejectionReason: string;
  notes?: string;
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 기존 pending 승인 요청 업데이트
  await db
    .update(hBatchApprovals)
    .set({
      status: "rejected",
      rejectionReason: data.rejectionReason,
      notes: data.notes || null
    })
    .where(
      and(
        eq(hBatchApprovals.batchId, data.batchId),
        eq(hBatchApprovals.status, "pending")
      )
    );

  // 없으면 새로 생성
  const [existing] = await db
    .select()
    .from(hBatchApprovals)
    .where(and(eq(hBatchApprovals.tenantId, tenantId as any) , eq(hBatchApprovals.batchId, data.batchId)) as any)    .limit(1);

  if (!existing) {
    await db.insert(hBatchApprovals).values({
      tenantId,
      batchId: data.batchId,
      approverId: data.approverId,
      status: "rejected",
      rejectionReason: data.rejectionReason,
      notes: data.notes || null
    } as any);
  }
}

/**
 * 배치 승인 이력 조회
 */
export async function getBatchApprovals(batchId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const approvals = await db
    .select()
    .from(hBatchApprovals)
    .where(and(eq(hBatchApprovals.tenantId, tenantId as any) , eq(hBatchApprovals.batchId, batchId)) as any)    .orderBy(desc(hBatchApprovals.createdAt));

  return approvals;
}

/**
 * 배치 승인 상태 확인
 */
export async function getBatchApprovalStatus(batchId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const [approval] = await db
    .select()
    .from(hBatchApprovals)
    .where(and(eq(hBatchApprovals.tenantId, tenantId as any) , eq(hBatchApprovals.batchId, batchId)) as any)    .orderBy(desc(hBatchApprovals.createdAt))
    .limit(1);

  return approval || null;
}

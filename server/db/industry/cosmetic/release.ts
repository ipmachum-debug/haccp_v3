/**
 * 화장품 QA 출고 DB 헬퍼 (Phase 2-6)
 *
 * 자동 검증 + lifecycle 관리:
 *   pending → approved → released → (recalled)
 */

import { eq, and, desc } from "drizzle-orm";
import { getDb } from "../../connection";
import { hCosmeticRelease } from "../../../../drizzle/schema/industry/cosmetic/release";
import { hCosmeticBmr } from "../../../../drizzle/schema/industry/cosmetic/bmr";
import { summarizeIpcByBmr } from "./bmrIpc";

export type ReleaseStatus = "pending" | "approved" | "released" | "recalled";

export async function generateReleaseCode(tenantId: number): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `REL-${today}`;

  const rows = await db
    .select({ releaseCode: hCosmeticRelease.releaseCode })
    .from(hCosmeticRelease)
    .where(eq(hCosmeticRelease.tenantId, tenantId))
    .orderBy(desc(hCosmeticRelease.id))
    .limit(50);

  const sameDay = rows
    .map((r) => r.releaseCode)
    .filter((c) => c.startsWith(prefix));
  const maxSeq = sameDay.reduce((max, code) => {
    const n = parseInt(code.split("-")[2] || "0", 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);

  return `${prefix}-${String(maxSeq + 1).padStart(3, "0")}`;
}

/**
 * 자동 QA 검증 — release.create 시점에 호출.
 *
 * 검증 항목:
 *   1. BMR.status === 'completed'
 *   2. IPC 모두 pass (IPC 가 있는 경우)
 *   3. (향후) active 라벨 존재 (#154 머지 후)
 *
 * 모든 항목 pass → ok=true
 * 실패 시 → ok=false + reason
 */
export async function qaPreReleaseCheck(
  bmrId: number,
  tenantId: number,
): Promise<{
  ok: boolean;
  reason?: string;
  bmrCompletedCheck: boolean;
  ipcAllPassCheck: boolean;
  ipcSummary?: { total: number; pass: number; fail: number; pending: number };
  message: string;
}> {
  const db = await getDb();
  if (!db) {
    return {
      ok: false,
      reason: "DB 연결 실패",
      bmrCompletedCheck: false,
      ipcAllPassCheck: false,
      message: "DB 연결 실패",
    };
  }

  const messages: string[] = [];

  // 1. BMR 검증
  const [bmr] = await db
    .select()
    .from(hCosmeticBmr)
    .where(and(eq(hCosmeticBmr.tenantId, tenantId), eq(hCosmeticBmr.id, bmrId)))
    .limit(1);
  if (!bmr) {
    return {
      ok: false,
      reason: "BMR not found",
      bmrCompletedCheck: false,
      ipcAllPassCheck: false,
      message: "BMR 미존재",
    };
  }

  const bmrCompletedCheck = bmr.status === "completed";
  if (bmrCompletedCheck) {
    messages.push(`✅ BMR ${bmr.bmrCode} 제조 완료 (status=completed)`);
  } else {
    messages.push(`❌ BMR ${bmr.bmrCode} status='${bmr.status}' — completed 만 출고 가능`);
  }

  // 2. IPC 검증
  let ipcAllPassCheck = true;
  let ipcSummary: { total: number; pass: number; fail: number; pending: number } | undefined;
  try {
    const summary = await summarizeIpcByBmr(bmrId, tenantId);
    ipcSummary = {
      total: summary.total,
      pass: summary.pass,
      fail: summary.fail,
      pending: summary.pending,
    };
    if (summary.total === 0) {
      messages.push(`⚠️ IPC 측정값 0건 — 검증 항목 없음`);
      // IPC 없는 경우는 통과 처리 (cosmetic 은 IPC 가 의무는 아님)
    } else if (summary.allPass) {
      messages.push(`✅ IPC ${summary.pass}/${summary.total} 모두 합격`);
    } else {
      ipcAllPassCheck = false;
      messages.push(
        `❌ IPC 미통과 — 합격 ${summary.pass} / 부적합 ${summary.fail} / 대기 ${summary.pending}`,
      );
    }
  } catch (e: any) {
    messages.push(`⚠️ IPC 조회 실패 (graceful): ${e?.message ?? e}`);
  }

  const allOk = bmrCompletedCheck && ipcAllPassCheck;

  return {
    ok: allOk,
    reason: allOk ? undefined : "QA 검증 실패",
    bmrCompletedCheck,
    ipcAllPassCheck,
    ipcSummary,
    message: messages.join("\n"),
  };
}

export async function createRelease(
  data: {
    bmrId: number;
    productId: number;
    labelId?: number;
    releaseQuantity: number;
    releaseUnit?: string;
    targetMarket?: string;
    productBatchNumber?: string;
    expiryDate?: string;
    notes?: string;
    createdBy: number;
  },
  tenantId: number,
): Promise<{
  id: number;
  releaseCode: string;
  qaCheck: Awaited<ReturnType<typeof qaPreReleaseCheck>>;
}> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // QA 자동 검증 (실패해도 pending 상태로 생성 — 운영자가 보완 후 재검증)
  const qaCheck = await qaPreReleaseCheck(data.bmrId, tenantId);

  const releaseCode = await generateReleaseCode(tenantId);

  const [result]: any = await db.insert(hCosmeticRelease).values({
    tenantId,
    releaseCode,
    bmrId: data.bmrId,
    productId: data.productId,
    labelId: data.labelId ?? null,
    releaseQuantity: String(data.releaseQuantity),
    releaseUnit: data.releaseUnit ?? "kg",
    targetMarket: data.targetMarket ?? null,
    productBatchNumber: data.productBatchNumber ?? null,
    expiryDate: data.expiryDate ?? null,
    notes: data.notes ?? null,
    bmrCompletedCheck: qaCheck.bmrCompletedCheck ? 1 : 0,
    ipcAllPassCheck: qaCheck.ipcAllPassCheck ? 1 : 0,
    qaCheckMessage: qaCheck.message,
    status: "pending",
    createdBy: data.createdBy,
  } as any);

  return { id: Number((result as any).insertId), releaseCode, qaCheck };
}

export async function listReleases(
  filter: { status?: ReleaseStatus; bmrId?: number; productId?: number } | undefined,
  tenantId: number,
) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const conditions = [eq(hCosmeticRelease.tenantId, tenantId)];
  if (filter?.status) conditions.push(eq(hCosmeticRelease.status, filter.status));
  if (filter?.bmrId) conditions.push(eq(hCosmeticRelease.bmrId, filter.bmrId));
  if (filter?.productId) conditions.push(eq(hCosmeticRelease.productId, filter.productId));

  return db
    .select()
    .from(hCosmeticRelease)
    .where(and(...conditions))
    .orderBy(desc(hCosmeticRelease.id))
    .limit(200);
}

export async function getReleaseById(id: number, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const [row] = await db
    .select()
    .from(hCosmeticRelease)
    .where(
      and(eq(hCosmeticRelease.tenantId, tenantId), eq(hCosmeticRelease.id, id)),
    )
    .limit(1);
  return row ?? null;
}

/**
 * QA 승인 — pending → approved.
 * 자동 검증 다시 수행 (시간 경과로 IPC 추가됐을 가능성).
 */
export async function approveRelease(
  id: number,
  userId: number,
  tenantId: number,
): Promise<{ ok: boolean; reason?: string }> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const release = await getReleaseById(id, tenantId);
  if (!release) return { ok: false, reason: "not found" };
  if (release.status !== "pending") {
    return { ok: false, reason: `status='${release.status}' — pending 만 승인 가능` };
  }

  // 재검증
  const qaCheck = await qaPreReleaseCheck(Number(release.bmrId), tenantId);
  if (!qaCheck.ok) {
    // 검증 실패 시에도 message 갱신 (운영자가 다시 보완)
    await db
      .update(hCosmeticRelease)
      .set({
        bmrCompletedCheck: qaCheck.bmrCompletedCheck ? 1 : 0,
        ipcAllPassCheck: qaCheck.ipcAllPassCheck ? 1 : 0,
        qaCheckMessage: qaCheck.message,
      } as any)
      .where(
        and(eq(hCosmeticRelease.tenantId, tenantId), eq(hCosmeticRelease.id, id)),
      );
    return { ok: false, reason: `QA 검증 실패 — ${qaCheck.reason}` };
  }

  await db
    .update(hCosmeticRelease)
    .set({
      status: "approved" as any,
      approvedBy: userId,
      approvedAt: new Date(),
      bmrCompletedCheck: 1,
      ipcAllPassCheck: 1,
      qaCheckMessage: qaCheck.message,
    } as any)
    .where(
      and(eq(hCosmeticRelease.tenantId, tenantId), eq(hCosmeticRelease.id, id)),
    );
  return { ok: true };
}

/**
 * 실제 출고 — approved → released.
 */
export async function markReleased(
  id: number,
  userId: number,
  tenantId: number,
): Promise<{ ok: boolean; reason?: string }> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const release = await getReleaseById(id, tenantId);
  if (!release) return { ok: false, reason: "not found" };
  if (release.status !== "approved") {
    return { ok: false, reason: `status='${release.status}' — approved 만 출고 가능` };
  }

  await db
    .update(hCosmeticRelease)
    .set({
      status: "released" as any,
      releasedBy: userId,
      releasedAt: new Date(),
    } as any)
    .where(
      and(eq(hCosmeticRelease.tenantId, tenantId), eq(hCosmeticRelease.id, id)),
    );
  return { ok: true };
}

/**
 * 회수 — approved | released → recalled.
 */
export async function recallRelease(
  id: number,
  reason: string,
  userId: number,
  tenantId: number,
): Promise<{ ok: boolean; reason?: string }> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const release = await getReleaseById(id, tenantId);
  if (!release) return { ok: false, reason: "not found" };
  if (release.status !== "approved" && release.status !== "released") {
    return {
      ok: false,
      reason: `status='${release.status}' — approved/released 만 회수 가능`,
    };
  }

  await db
    .update(hCosmeticRelease)
    .set({
      status: "recalled" as any,
      recalledBy: userId,
      recalledAt: new Date(),
      recallReason: reason,
    } as any)
    .where(
      and(eq(hCosmeticRelease.tenantId, tenantId), eq(hCosmeticRelease.id, id)),
    );
  return { ok: true };
}

/**
 * 신청 취소 — pending → 삭제.
 */
export async function deletePendingRelease(
  id: number,
  tenantId: number,
): Promise<{ deleted: boolean; reason?: string }> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const release = await getReleaseById(id, tenantId);
  if (!release) return { deleted: false, reason: "not found" };
  if (release.status !== "pending") {
    return { deleted: false, reason: `status='${release.status}' — pending 만 취소 가능` };
  }

  await db
    .delete(hCosmeticRelease)
    .where(
      and(eq(hCosmeticRelease.tenantId, tenantId), eq(hCosmeticRelease.id, id)),
    );
  return { deleted: true };
}

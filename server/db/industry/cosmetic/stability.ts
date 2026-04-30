/**
 * 화장품 안정성시험 DB 헬퍼 (Phase 2-8)
 */

import { eq, and, desc, asc } from "drizzle-orm";
import { getDb } from "../../connection";
import {
  hCosmeticStabilityTest,
  hCosmeticStabilityObservation,
} from "../../../../drizzle/schema/industry/cosmetic/stability";

export type StabilityStatus = "planned" | "in_progress" | "completed" | "failed";
export type StabilityTestType = "long_term" | "accelerated" | "stress";

export async function generateStabilityCode(tenantId: number): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `STB-${today}`;

  const rows = await db
    .select({ testCode: hCosmeticStabilityTest.testCode })
    .from(hCosmeticStabilityTest)
    .where(eq(hCosmeticStabilityTest.tenantId, tenantId))
    .orderBy(desc(hCosmeticStabilityTest.id))
    .limit(50);

  const sameDay = rows
    .map((r) => r.testCode)
    .filter((c) => c.startsWith(prefix));
  const maxSeq = sameDay.reduce((max, code) => {
    const n = parseInt(code.split("-")[2] || "0", 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);

  return `${prefix}-${String(maxSeq + 1).padStart(3, "0")}`;
}

export async function createStabilityTest(
  data: {
    productId: number;
    bmrId?: number;
    testType: StabilityTestType;
    storageTempC?: number;
    storageHumidity?: number;
    storageLight?: "dark" | "ambient" | "direct_sunlight";
    plannedDurationMonths?: number;
    startedAt?: string;
    createdBy: number;
  },
  tenantId: number,
): Promise<{ id: number; testCode: string }> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const testCode = await generateStabilityCode(tenantId);

  const [result]: any = await db.insert(hCosmeticStabilityTest).values({
    tenantId,
    testCode,
    productId: data.productId,
    bmrId: data.bmrId ?? null,
    testType: data.testType,
    storageTempC:
      data.storageTempC !== undefined ? String(data.storageTempC) : null,
    storageHumidity:
      data.storageHumidity !== undefined ? String(data.storageHumidity) : null,
    storageLight: data.storageLight ?? "dark",
    plannedDurationMonths: data.plannedDurationMonths ?? 12,
    startedAt: data.startedAt ?? null,
    createdBy: data.createdBy,
    status: "planned",
  } as any);

  return { id: Number((result as any).insertId), testCode };
}

export async function listStabilityTests(
  filter: { status?: StabilityStatus; productId?: number } | undefined,
  tenantId: number,
) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const conditions = [eq(hCosmeticStabilityTest.tenantId, tenantId)];
  if (filter?.status)
    conditions.push(eq(hCosmeticStabilityTest.status, filter.status));
  if (filter?.productId)
    conditions.push(eq(hCosmeticStabilityTest.productId, filter.productId));

  return db
    .select()
    .from(hCosmeticStabilityTest)
    .where(and(...conditions))
    .orderBy(desc(hCosmeticStabilityTest.id))
    .limit(200);
}

export async function getStabilityTestById(id: number, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const [row] = await db
    .select()
    .from(hCosmeticStabilityTest)
    .where(
      and(
        eq(hCosmeticStabilityTest.tenantId, tenantId),
        eq(hCosmeticStabilityTest.id, id),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * 시험 시작 — planned → in_progress.
 */
export async function startStabilityTest(
  id: number,
  startDate: string,
  tenantId: number,
): Promise<{ ok: boolean; reason?: string }> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const test = await getStabilityTestById(id, tenantId);
  if (!test) return { ok: false, reason: "not found" };
  if (test.status !== "planned") {
    return { ok: false, reason: `status='${test.status}' — planned 만 시작 가능` };
  }
  await db
    .update(hCosmeticStabilityTest)
    .set({ status: "in_progress" as any, startedAt: startDate } as any)
    .where(
      and(
        eq(hCosmeticStabilityTest.tenantId, tenantId),
        eq(hCosmeticStabilityTest.id, id),
      ),
    );
  return { ok: true };
}

/**
 * 시험 완료 — in_progress → completed (결론 + approver 기록).
 */
export async function completeStabilityTest(
  id: number,
  conclusion: string,
  userId: number,
  tenantId: number,
): Promise<{ ok: boolean; reason?: string }> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const test = await getStabilityTestById(id, tenantId);
  if (!test) return { ok: false, reason: "not found" };
  if (test.status !== "in_progress") {
    return { ok: false, reason: `status='${test.status}' — in_progress 만 완료 가능` };
  }
  await db
    .update(hCosmeticStabilityTest)
    .set({
      status: "completed" as any,
      conclusion,
      completedAt: new Date().toISOString().slice(0, 10),
      approvedBy: userId,
      approvedAt: new Date(),
    } as any)
    .where(
      and(
        eq(hCosmeticStabilityTest.tenantId, tenantId),
        eq(hCosmeticStabilityTest.id, id),
      ),
    );
  return { ok: true };
}

export async function failStabilityTest(
  id: number,
  reason: string,
  tenantId: number,
): Promise<{ ok: boolean; reason?: string }> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const test = await getStabilityTestById(id, tenantId);
  if (!test) return { ok: false, reason: "not found" };

  await db
    .update(hCosmeticStabilityTest)
    .set({
      status: "failed" as any,
      conclusion: `[FAIL] ${reason}`,
    } as any)
    .where(
      and(
        eq(hCosmeticStabilityTest.tenantId, tenantId),
        eq(hCosmeticStabilityTest.id, id),
      ),
    );
  return { ok: true };
}

// ============================================================================
// Observations
// ============================================================================

export async function listObservationsByTest(testId: number, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  return db
    .select()
    .from(hCosmeticStabilityObservation)
    .where(
      and(
        eq(hCosmeticStabilityObservation.tenantId, tenantId),
        eq(hCosmeticStabilityObservation.testId, testId),
      ),
    )
    .orderBy(asc(hCosmeticStabilityObservation.observationMonth));
}

export async function addObservation(
  data: {
    testId: number;
    observationMonth: number;
    observationDate: string;
    appearance?: string;
    color?: string;
    odor?: string;
    ph?: number;
    viscosity?: number;
    microbialCount?: number;
    passFail?: "pass" | "acceptable" | "fail";
    notes?: string;
    measuredBy?: number;
  },
  tenantId: number,
): Promise<{ id: number }> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 시험이 in_progress 인지 검증 (planned/completed/failed 에는 추가 불가)
  const test = await getStabilityTestById(data.testId, tenantId);
  if (!test) throw new Error("test not found");
  if (test.status !== "in_progress") {
    throw new Error(
      `test status='${test.status}' — in_progress 일 때만 관측치 추가 가능`,
    );
  }

  const [result]: any = await db.insert(hCosmeticStabilityObservation).values({
    tenantId,
    testId: data.testId,
    observationMonth: data.observationMonth,
    observationDate: data.observationDate,
    appearance: data.appearance ?? null,
    color: data.color ?? null,
    odor: data.odor ?? null,
    ph: data.ph !== undefined ? String(data.ph) : null,
    viscosity: data.viscosity !== undefined ? String(data.viscosity) : null,
    microbialCount: data.microbialCount ?? null,
    passFail: data.passFail ?? "pass",
    notes: data.notes ?? null,
    measuredBy: data.measuredBy ?? null,
    measuredAt: new Date(),
  } as any);

  return { id: Number((result as any).insertId) };
}

export async function deleteObservation(
  id: number,
  tenantId: number,
): Promise<{ deleted: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const result: any = await db
    .delete(hCosmeticStabilityObservation)
    .where(
      and(
        eq(hCosmeticStabilityObservation.tenantId, tenantId),
        eq(hCosmeticStabilityObservation.id, id),
      ),
    );
  const affected =
    (result as any)?.[0]?.affectedRows ?? (result as any)?.affectedRows ?? 0;
  return { deleted: Number(affected) > 0 };
}

/**
 * 시험 관측치 요약 — fail 발견 시 시험 자체 status 영향.
 */
export async function summarizeStability(
  testId: number,
  tenantId: number,
): Promise<{
  total: number;
  pass: number;
  acceptable: number;
  fail: number;
  hasFail: boolean;
}> {
  const rows = await listObservationsByTest(testId, tenantId);
  const total = rows.length;
  const pass = rows.filter((r) => r.passFail === "pass").length;
  const acceptable = rows.filter((r) => r.passFail === "acceptable").length;
  const fail = rows.filter((r) => r.passFail === "fail").length;
  return { total, pass, acceptable, fail, hasFail: fail > 0 };
}

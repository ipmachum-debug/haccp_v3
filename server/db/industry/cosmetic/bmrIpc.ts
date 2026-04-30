/**
 * 화장품 BMR IPC DB 헬퍼 (Phase 2-3)
 *
 * In-Process Control 측정값 CRUD + passFail 자동 평가.
 *
 * 의존성 규칙:
 *   - 본 파일은 industry/cosmetic + shared-kernel 만 import
 *   - food / 다른 industry cross-ref 금지
 */

import { eq, and, desc } from "drizzle-orm";
import { getDb } from "../../connection";
import { hCosmeticBmrIpc } from "../../../../drizzle/schema/industry/cosmetic/bmrIpc";

export type IpcPassFail = "pass" | "fail" | "pending";

/**
 * passFail 자동 평가.
 *   - measuredValue 또는 expected 미설정 → pending
 *   - 측정값이 [min, max] 범위 → pass
 *   - 범위 밖 → fail
 */
export function evaluatePassFail(
  measuredValue: number | null | undefined,
  expectedMin: number | null | undefined,
  expectedMax: number | null | undefined,
): IpcPassFail {
  if (
    measuredValue === null ||
    measuredValue === undefined ||
    !Number.isFinite(measuredValue)
  ) {
    return "pending";
  }
  if (
    (expectedMin === null || expectedMin === undefined) &&
    (expectedMax === null || expectedMax === undefined)
  ) {
    return "pending";
  }
  const minOk =
    expectedMin === null || expectedMin === undefined
      ? true
      : measuredValue >= Number(expectedMin);
  const maxOk =
    expectedMax === null || expectedMax === undefined
      ? true
      : measuredValue <= Number(expectedMax);
  return minOk && maxOk ? "pass" : "fail";
}

export async function createIpc(
  data: {
    bmrId: number;
    measurementType: string;
    measurementLabel?: string;
    expectedMin?: number;
    expectedMax?: number;
    measuredValue?: number;
    unit?: string;
    notes?: string;
    measuredBy?: number;
    measuredAt?: Date;
  },
  tenantId: number,
): Promise<{ id: number; passFail: IpcPassFail }> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const passFail = evaluatePassFail(
    data.measuredValue,
    data.expectedMin,
    data.expectedMax,
  );

  const [result]: any = await db.insert(hCosmeticBmrIpc).values({
    tenantId,
    bmrId: data.bmrId,
    measurementType: data.measurementType,
    measurementLabel: data.measurementLabel ?? null,
    expectedMin: data.expectedMin !== undefined ? String(data.expectedMin) : null,
    expectedMax: data.expectedMax !== undefined ? String(data.expectedMax) : null,
    measuredValue:
      data.measuredValue !== undefined ? String(data.measuredValue) : null,
    unit: data.unit ?? null,
    passFail,
    measuredBy: data.measuredBy ?? null,
    measuredAt: data.measuredAt ?? (data.measuredValue !== undefined ? new Date() : null),
    notes: data.notes ?? null,
  } as any);

  const id = Number((result as any).insertId);

  // CP-3-style F-3 cosmetic (Phase 2-7): IPC fail 시 자동 알림
  // env 미활성 시 no-op. catch 무시 — 메인 흐름 보호.
  if (passFail === "fail") {
    try {
      const { dispatchIpcFailAlert, isCosmeticAlertEnabled } = await import(
        "../../../services/cosmetic/cosmeticAlerts"
      );
      if (isCosmeticAlertEnabled(tenantId)) {
        await dispatchIpcFailAlert(
          {
            id,
            bmrId: data.bmrId,
            measurementType: data.measurementType,
            measurementLabel: data.measurementLabel,
            measuredValue: data.measuredValue,
            expectedMin: data.expectedMin,
            expectedMax: data.expectedMax,
            unit: data.unit,
            measuredBy: data.measuredBy,
          },
          tenantId,
        );
      }
    } catch (alertErr: any) {
      console.warn(
        `[cosmeticIpc.create] 알림 dispatch 실패 (안전 무시) — ipc=#${id}: ${alertErr?.message ?? alertErr}`,
      );
    }
  }

  return { id, passFail };
}

export async function listIpcByBmr(bmrId: number, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  return db
    .select()
    .from(hCosmeticBmrIpc)
    .where(
      and(
        eq(hCosmeticBmrIpc.tenantId, tenantId),
        eq(hCosmeticBmrIpc.bmrId, bmrId),
      ),
    )
    .orderBy(desc(hCosmeticBmrIpc.id))
    .limit(500);
}

export async function deleteIpc(
  id: number,
  tenantId: number,
): Promise<{ deleted: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const result: any = await db
    .delete(hCosmeticBmrIpc)
    .where(
      and(eq(hCosmeticBmrIpc.tenantId, tenantId), eq(hCosmeticBmrIpc.id, id)),
    );

  // mysql2 delete returns affectedRows
  const affected =
    (result as any)?.[0]?.affectedRows ?? (result as any)?.affectedRows ?? 0;
  return { deleted: Number(affected) > 0 };
}

/**
 * BMR 의 IPC 요약 — pass/fail/pending 개수 + 모든 IPC 가 pass 인지 여부.
 *
 * 활용: BMR completed 전 검증 — 모든 IPC 가 pass 가 아니면 경고.
 */
export async function summarizeIpcByBmr(
  bmrId: number,
  tenantId: number,
): Promise<{
  total: number;
  pass: number;
  fail: number;
  pending: number;
  allPass: boolean;
}> {
  const rows = await listIpcByBmr(bmrId, tenantId);
  const total = rows.length;
  const pass = rows.filter((r) => r.passFail === "pass").length;
  const fail = rows.filter((r) => r.passFail === "fail").length;
  const pending = rows.filter((r) => r.passFail === "pending").length;
  return {
    total,
    pass,
    fail,
    pending,
    allPass: total > 0 && pass === total,
  };
}

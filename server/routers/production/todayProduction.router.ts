/**
 * 오늘의 생산 — 쓰기 (UI/UX 개편 P-2, 2026-10-14) — 명세 14 §7-2 ④ 생산 시작, §7-3
 *
 * checkStart: ③ 재고·LOT 확인 — 시작 직전 서버 재검증과 같은 계산을 미리 보여 준다 (읽기 전용)
 * start:      ④ 생산 시작 — 다음 순서를 서버에서 보장한다
 *   1. 상태 확인: 완료·취소 등은 거부, 이미 진행 중이면 아무것도 하지 않고 already_started (자동출고 재실행 없음)
 *   2. 재검증: 누른 그 순간의 투입 계획·가용 LOT 로 부족을 다시 센다 (validateBatchStart)
 *   3. 부족이 있으면 확인(acknowledgeShortage) 없이 시작하지 않는다 → needs_confirmation + 부족 목록·정책 설명
 *      기존 음수 재고 정책은 바꾸지 않는다: 허용 테넌트 = 부족분 음수 차감, 금지 테넌트 = 출고 기록만 (자동출고 그대로)
 *      확인하고 시작하면 누가·언제·무엇이 부족했는지를 배치 메모에 남긴다
 *   4. 시작 권리 잡기: status 가 planned/paused 일 때만 in_progress 로 바꾸는 조건부 UPDATE —
 *      동시에 두 번 눌러도 한 요청만 성공 → 자동출고는 한 번 (줄 단위 #483 방어도 그대로)
 *   5. 자동출고 dispatcher · 생산일지 갱신 (기존 batch.updateStatus 와 같은 후속 처리)
 * retryIssue:  시작 후 자동출고 실패·부분 성공 복구 — 진행 중 배치의 남은 줄만 다시 출고 (Codex #501 검토)
 *   시작·재출고의 자동출고는 배치 잠금(GET_LOCK) 안에서만 — 줄 단위 방어(#483)의 조회-후-출고 경합 차단
 * 완료(⑥)는 기존 batch.complete(관리자, idempotency 키) 를 그대로 쓴다 — 이미 출고된 투입을 다시 차감하지 않는 기존 방어 유지.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, workerProcedure } from "../../_core/trpc";
import { toKSTDate, todayKST, nowKST } from "../../utils/timezone";

export const START_FROM = ["planned", "paused"] as const;

/**
 * 쓰기 스위치 (2026-10-14, Codex 권고) — 테스트 환경 검증 전에는 운영에서 시작·재출고를 막는다. 기본 꺼짐.
 *   TODAY_PRODUCTION_WRITE=true            — 전체 켬
 *   TODAY_PRODUCTION_WRITE_TENANTS="2,5"   — 적어 둔 테넌트만 켬 (TODAY_PRODUCTION_WRITE 보다 우선)
 * 꺼져 있으면 화면은 P-1 처럼 표시만 하고 기존 생산관리 화면으로 안내한다. 완료(batch.complete)는 기존 화면들이 쓰는
 * 공용 API 라 서버에서 막지 않고, 오늘의 생산 화면의 완료 버튼만 숨긴다.
 */
export function isTodayProductionWriteEnabled(tenantId?: number | null): boolean {
  const list = process.env.TODAY_PRODUCTION_WRITE_TENANTS?.trim();
  if (list) {
    const ids = list.split(",").map((x) => Number(x.trim())).filter((n) => Number.isFinite(n) && n > 0);
    if (ids.length > 0) return tenantId != null && ids.includes(Number(tenantId));
  }
  const flag = process.env.TODAY_PRODUCTION_WRITE?.toLowerCase().trim();
  return flag === "true" || flag === "1" || flag === "yes";
}

function assertWriteEnabled(tenantId: number) {
  if (!isTodayProductionWriteEnabled(tenantId)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "오늘의 생산 화면의 시작·출고 기능은 검증 중이라 아직 꺼져 있습니다. 기존 생산관리 화면에서 진행해 주세요.",
    });
  }
}

/** 이미 시작된 배치 — 출고를 다시 하지 않고, 누락 줄이 있으면 알려 준다 (복구는 retryIssue) */
async function alreadyStarted(batchId: number, tenantId: number, head: string) {
  let unissuedLines = 0;
  try {
    const { validateBatchStart } = await import("../../lib/production/batchStartValidation");
    unissuedLines = (await validateBatchStart(batchId, tenantId)).unissuedLines;
  } catch { /* 표시용 — 실패해도 already_started */ }
  return {
    status: "already_started" as const,
    unissuedLines,
    message: unissuedLines > 0
      ? `${head} 아직 출고되지 않은 원료 ${unissuedLines}줄이 있습니다 — '누락 출고 다시 실행' 으로 출고하세요.`
      : `${head} 원료 출고는 다시 하지 않습니다.`,
  };
}

type IssueRun = { busy: boolean; autoIssue: { success: boolean; warnings: string[]; errors: string[] }; unissuedLines: number };

/** 자동출고를 배치 잠금 안에서 실행하고, 끝난 뒤 아직 출고 기록이 없는 줄 수를 다시 센다 */
async function runIssue(batchId: number, batch: any, ctx: any): Promise<IssueRun> {
  const { withBatchIssueLock } = await import("../../lib/production/batchIssueLock");
  const { validateBatchStart } = await import("../../lib/production/batchStartValidation");
  const locked = await withBatchIssueLock(ctx.tenantId, batchId, async () => {
    try {
      const { autoIssueMaterialsDispatch } = await import("../../lib/production/autoMaterialIssueDispatcher");
      return (await autoIssueMaterialsDispatch(batchId, batch.createdBy || ctx.user.id, ctx.tenantId)) as any;
    } catch (e: any) {
      console.error("[todayProduction] 자동출고 오류:", e?.message || e);
      return { success: false, errors: [String(e?.message || e)] };
    }
  }).catch((e: any) => {
    // 잠금 연결 자체 실패 — 출고를 실행하지 않았으므로 미출고로 남는다 (재출고로 복구)
    console.error("[todayProduction] 출고 잠금 실패:", e?.message || e);
    return { locked: true as const, value: { success: false, errors: [`출고 잠금 실패: ${String(e?.message || e)}`] } };
  });
  let unissuedLines = 0;
  try { unissuedLines = (await validateBatchStart(batchId, ctx.tenantId)).unissuedLines; } catch { /* 재확인 실패 — 0 으로 두지 않고 아래 오류로 알림 */ unissuedLines = -1; }
  if (!locked.locked) {
    return { busy: true, autoIssue: { success: false, warnings: [], errors: [] }, unissuedLines: Math.max(unissuedLines, 0) };
  }
  const r = locked.value ?? {};
  const errors = [...((r.errors ?? []) as string[])];
  if (unissuedLines < 0) errors.push("출고 결과 재확인 실패 — 배치 상세에서 출고 내역을 확인해 주세요.");
  return {
    busy: false,
    autoIssue: { success: !!r.success && errors.length === 0, warnings: (r.warnings ?? []) as string[], errors },
    unissuedLines: Math.max(unissuedLines, 0),
  };
}

export const todayProductionRouter = router({
  /** 화면이 시작·완료 버튼을 보여 줄지 (서버 스위치와 같은 판정) */
  writeEnabled: workerProcedure.query(({ ctx }) => ({ enabled: isTodayProductionWriteEnabled(ctx.tenantId) })),

  checkStart: workerProcedure
    .input(z.object({ batchId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const { validateBatchStart } = await import("../../lib/production/batchStartValidation");
      return validateBatchStart(input.batchId, ctx.tenantId);
    }),

  start: workerProcedure
    .input(z.object({
      batchId: z.number().int().positive(),
      /** 부족 목록을 보고 '그래도 시작' 을 누른 경우 */
      acknowledgeShortage: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertWriteEnabled(ctx.tenantId);
      const { getBatchById } = await import("../../db");
      const batch: any = await getBatchById(input.batchId, ctx.tenantId);
      if (!batch) throw new TRPCError({ code: "NOT_FOUND", message: "배치를 찾을 수 없습니다." });

      if (batch.status === "in_progress") {
        return alreadyStarted(input.batchId, ctx.tenantId, "이미 생산 중인 배치입니다.");
      }
      if (!(START_FROM as readonly string[]).includes(batch.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `지금 상태(${batch.status})에서는 생산을 시작할 수 없습니다.` });
      }

      // 2. 누른 순간의 재검증
      const { validateBatchStart, shortageAckNote } = await import("../../lib/production/batchStartValidation");
      const check = await validateBatchStart(input.batchId, ctx.tenantId);
      if (check.shortages.length > 0 && !input.acknowledgeShortage) {
        return {
          status: "needs_confirmation" as const,
          shortages: check.shortages,
          allowNegative: check.allowNegative,
          message: check.allowNegative
            ? "재고가 부족한 원료가 있습니다. 시작하면 있는 LOT 를 먼저 쓰고 모자란 양은 음수로 차감됩니다(다음 입고 때 상쇄)."
            : "재고가 부족한 원료가 있습니다. 이 회사는 음수 재고를 허용하지 않아, 모자란 양은 출고 기록만 남고 재고는 차감되지 않습니다.",
        };
      }

      // 4. 시작 권리 — 조건부 UPDATE (동시 요청 중 하나만)
      const { getRawConnection } = await import("../../db/connection");
      const conn = await getRawConnection();
      const [upd]: any = await conn.execute(
        `UPDATE h_batches
            SET status = 'in_progress', start_time = COALESCE(start_time, NOW()), updated_at = NOW()
          WHERE id = ? AND tenant_id = ? AND status IN (${START_FROM.map(() => "?").join(",")})`,
        [input.batchId, ctx.tenantId, ...START_FROM],
      );
      if (!upd || Number(upd.affectedRows) !== 1) {
        const again: any = await getBatchById(input.batchId, ctx.tenantId);
        if (again?.status === "in_progress") {
          return alreadyStarted(input.batchId, ctx.tenantId, "다른 사용자가 방금 시작했습니다.");
        }
        throw new TRPCError({ code: "CONFLICT", message: "배치 상태가 바뀌어 시작하지 못했습니다. 새로고침 후 다시 확인해 주세요." });
      }

      // 부족 확인 기록 — 배치 메모
      if (check.shortages.length > 0) {
        const note = shortageAckNote({
          userName: ctx.user?.name || ctx.user?.email || "사용자", userId: Number(ctx.user?.id ?? 0),
          at: nowKST(), shortages: check.shortages, allowNegative: check.allowNegative,
        });
        await conn.execute(
          `UPDATE h_batches SET notes = CONCAT(COALESCE(notes, ''), CASE WHEN COALESCE(notes, '') = '' THEN '' ELSE '\\n' END, ?) WHERE id = ? AND tenant_id = ?`,
          [note, input.batchId, ctx.tenantId],
        );
      }

      // 감사 로그 — 누가 언제 시작했는지 (부족 확인 포함). 실패해도 시작은 유지
      try {
        const { createAuditLog } = await import("../../db/system/auditApprovalSupplier");
        await createAuditLog({
          action: "batch.start", entityType: "batch", entityId: input.batchId,
          userId: Number(ctx.user?.id ?? 0), userEmail: ctx.user?.email ?? undefined, userRole: ctx.user?.role,
          description: check.shortages.length > 0 ? "오늘의 생산 · 생산 시작 (재고 부족 확인)" : "오늘의 생산 · 생산 시작",
          changes: { from: batch.status, to: "in_progress", shortages: check.shortages, allowNegative: check.allowNegative },
        }, ctx.tenantId);
      } catch { /* 기록 실패가 시작을 막지 않음 */ }

      // 5. 자동출고 (잠금 안에서) · 생산일지 갱신 · 남은 미출고 줄 재확인
      const run = await runIssue(input.batchId, batch, ctx);
      try {
        const { autoRegenerateProductionDaily } = await import("../../lib/production/autoProductionDaily");
        const d = batch.plannedDate ? toKSTDate(new Date(batch.plannedDate)) : todayKST();
        await autoRegenerateProductionDaily(ctx.tenantId, d);
      } catch (e: any) {
        console.error("[todayProduction.start] 생산일지 갱신 오류:", e?.message || e);
      }

      return {
        status: "started" as const,
        shortagesAcknowledged: check.shortages,
        autoIssue: run.autoIssue,
        unissuedLines: run.unissuedLines,
        message: run.unissuedLines > 0
          ? `생산을 시작했지만 원료 ${run.unissuedLines}줄이 출고되지 않았습니다. '누락 출고 다시 실행' 으로 이어서 출고하세요.`
          : "생산을 시작했습니다. 원료 자동출고가 실행되었습니다.",
      };
    }),

  /**
   * 시작 후 자동출고가 실패·부분 성공한 배치의 복구 (Codex #501 검토).
   * 진행 중 배치만. 이미 출고 기록이 있는 줄은 자동출고가 건너뛴다(#483) → 남은 줄만 출고.
   * 시작·재출고가 겹치지 않도록 배치 잠금 안에서 실행.
   */
  retryIssue: workerProcedure
    .input(z.object({ batchId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      assertWriteEnabled(ctx.tenantId);
      const { getBatchById } = await import("../../db");
      const batch: any = await getBatchById(input.batchId, ctx.tenantId);
      if (!batch) throw new TRPCError({ code: "NOT_FOUND", message: "배치를 찾을 수 없습니다." });
      if (batch.status !== "in_progress") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `생산 중인 배치만 다시 출고할 수 있습니다 (지금 상태: ${batch.status}).` });
      }
      const { validateBatchStart } = await import("../../lib/production/batchStartValidation");
      const before = await validateBatchStart(input.batchId, ctx.tenantId);
      if (before.unissuedLines === 0) {
        return { status: "nothing_to_issue" as const, unissuedLines: 0, message: "출고할 원료가 남아 있지 않습니다." };
      }
      const run = await runIssue(input.batchId, batch, ctx);
      if (run.busy) {
        return { status: "busy" as const, unissuedLines: before.unissuedLines, message: "이 배치의 원료 출고가 이미 진행 중입니다. 잠시 후 다시 확인해 주세요." };
      }
      try {
        const { createAuditLog } = await import("../../db/system/auditApprovalSupplier");
        await createAuditLog({
          action: "batch.reissue", entityType: "batch", entityId: input.batchId,
          userId: Number(ctx.user?.id ?? 0), userEmail: ctx.user?.email ?? undefined, userRole: ctx.user?.role,
          description: "오늘의 생산 · 누락 출고 다시 실행",
          changes: { unissuedBefore: before.unissuedLines, unissuedAfter: run.unissuedLines, errors: run.autoIssue.errors },
        }, ctx.tenantId);
      } catch { /* 기록 실패가 출고를 막지 않음 */ }
      return {
        status: "reissued" as const,
        autoIssue: run.autoIssue,
        unissuedLines: run.unissuedLines,
        message: run.unissuedLines > 0
          ? `다시 출고했지만 원료 ${run.unissuedLines}줄이 아직 출고되지 않았습니다. 원인(재고 마스터·단위 등)을 확인해 주세요.`
          : "남은 원료를 모두 출고했습니다.",
      };
    }),
});

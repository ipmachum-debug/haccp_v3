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
 * 완료(⑥)는 기존 batch.complete(관리자, idempotency 키) 를 그대로 쓴다 — 이미 출고된 투입을 다시 차감하지 않는 기존 방어 유지.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, workerProcedure } from "../../_core/trpc";
import { toKSTDate, todayKST, nowKST } from "../../utils/timezone";

export const START_FROM = ["planned", "paused"] as const;

export const todayProductionRouter = router({
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
      const { getBatchById } = await import("../../db");
      const batch: any = await getBatchById(input.batchId, ctx.tenantId);
      if (!batch) throw new TRPCError({ code: "NOT_FOUND", message: "배치를 찾을 수 없습니다." });

      if (batch.status === "in_progress") {
        return { status: "already_started" as const, message: "이미 생산 중인 배치입니다. 원료 출고는 다시 하지 않습니다." };
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
          return { status: "already_started" as const, message: "다른 사용자가 방금 시작했습니다. 원료 출고는 다시 하지 않습니다." };
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

      // 5. 자동출고 (기존 dispatcher — 줄 단위 재출고 방어 #483 포함) · 생산일지 갱신
      let autoIssue: any = null;
      try {
        const { autoIssueMaterialsDispatch } = await import("../../lib/production/autoMaterialIssueDispatcher");
        autoIssue = await autoIssueMaterialsDispatch(input.batchId, batch.createdBy || ctx.user.id, ctx.tenantId);
      } catch (e: any) {
        console.error("[todayProduction.start] 자동출고 오류:", e?.message || e);
        autoIssue = { success: false, errors: [String(e?.message || e)] };
      }
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
        autoIssue: {
          success: !!autoIssue?.success,
          warnings: (autoIssue?.warnings ?? []) as string[],
          errors: (autoIssue?.errors ?? []) as string[],
        },
        message: "생산을 시작했습니다. 원료 자동출고가 실행되었습니다.",
      };
    }),
});

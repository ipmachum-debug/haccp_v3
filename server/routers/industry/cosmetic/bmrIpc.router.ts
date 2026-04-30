/**
 * 화장품 GMP — BMR IPC (In-Process Control) 측정값 라우터 (Phase 2-3)
 *
 * ============================================================================
 * BMR 제조 중/후 IPC 측정값 기록.
 * passFail 은 서버에서 자동 평가 (createIpc 헬퍼).
 *
 * 의존성 (.dependency-cruiser.cjs):
 *   - core / shared-kernel / industry/cosmetic 만 import
 *   - food / 다른 industry cross-ref 금지 (ADR-002)
 *
 * 향후 확장:
 *   - bulk create (여러 IPC 한 번에)
 *   - 한계 위반 시 자동 알림 (Phase 2-7 — F-3 cosmetic 폐쇄 루프)
 *   - 측정 항목 마스터 (h_cosmetic_ipc_template) 로 표준 IPC 정의
 * ============================================================================
 */
import { z } from "zod";
import { router, tenantRequiredProcedure } from "../../../_core/trpc";
import {
  createIpc,
  listIpcByBmr,
  deleteIpc,
  summarizeIpcByBmr,
} from "../../../db/industry/cosmetic/bmrIpc";

export const cosmeticBmrIpcRouter = router({
  /** BMR 별 IPC 목록 */
  listByBmr: tenantRequiredProcedure
    .input(z.object({ bmrId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const rows = await listIpcByBmr(input.bmrId, ctx.tenantId);
      return rows.map((r) => ({
        id: Number(r.id),
        bmrId: Number(r.bmrId),
        measurementType: String(r.measurementType),
        measurementLabel: r.measurementLabel,
        expectedMin: r.expectedMin !== null ? Number(r.expectedMin) : null,
        expectedMax: r.expectedMax !== null ? Number(r.expectedMax) : null,
        measuredValue: r.measuredValue !== null ? Number(r.measuredValue) : null,
        unit: r.unit,
        passFail: r.passFail as "pass" | "fail" | "pending",
        measuredBy: r.measuredBy,
        measuredAt: r.measuredAt,
        notes: r.notes,
        createdAt: r.createdAt,
      }));
    }),

  /** BMR 별 IPC 요약 (pass/fail/pending 카운트) */
  summaryByBmr: tenantRequiredProcedure
    .input(z.object({ bmrId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      return summarizeIpcByBmr(input.bmrId, ctx.tenantId);
    }),

  /** IPC 측정값 등록 (passFail 자동 평가) */
  create: tenantRequiredProcedure
    .input(
      z.object({
        bmrId: z.number().int().positive(),
        measurementType: z.string().min(1).max(50),
        measurementLabel: z.string().max(100).optional(),
        expectedMin: z.number().optional(),
        expectedMax: z.number().optional(),
        measuredValue: z.number().optional(),
        unit: z.string().max(20).optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return createIpc(
        {
          ...input,
          measuredBy: Number(ctx.user.id),
          measuredAt: input.measuredValue !== undefined ? new Date() : undefined,
        },
        ctx.tenantId,
      );
    }),

  /** IPC 삭제 */
  delete: tenantRequiredProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      return deleteIpc(input.id, ctx.tenantId);
    }),
});

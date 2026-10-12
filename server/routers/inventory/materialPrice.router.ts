/**
 * materialPrice 라우터 — 원재료 단가 관리 (2026-10-13, CEO 요청)
 *
 *  list        : 자재별 현재 단가 / 최근 입고가 / 차이 / 자동 갱신 여부 / 마지막 변경
 *  history     : 단가 변경 이력
 *  setManual   : 수동 입력 (샘플·1회성 매입·누락 보강) — 사유 필수, 수동 고정(자동 갱신 OFF) 선택
 *  setAutoUpdate: 입고 시 자동 갱신 ON/OFF
 *  refreshAll  : 현재 단가 → 최근 입고가로 일괄 갱신 (자동 갱신 꺼진 자재는 건너뜀)
 *
 * 레이어: core-erp(inventory). 단가 변경은 전부 h_material_price_history 에 남는다.
 */
import { adminProcedure, tenantRequiredProcedure, router, workerProcedure } from "../../_core/trpc";
import { z } from "zod";

export const materialPriceRouter = router({
  list: tenantRequiredProcedure
    .input(z.object({ search: z.string().optional(), includeInactive: z.boolean().optional() }).optional())
    .query(async ({ input, ctx }) => {
      const { getRawConnection } = await import("../../db/connection");
      const { listMaterialPrices } = await import("../../lib/inventory/materialPrice");
      return await listMaterialPrices(await getRawConnection(), ctx.tenantId, input ?? undefined);
    }),

  history: tenantRequiredProcedure
    .input(z.object({ materialId: z.number(), limit: z.number().min(1).max(200).optional() }))
    .query(async ({ input, ctx }) => {
      const { getRawConnection } = await import("../../db/connection");
      const { getMaterialPriceHistory } = await import("../../lib/inventory/materialPrice");
      return await getMaterialPriceHistory(await getRawConnection(), input.materialId, ctx.tenantId, input.limit ?? 20);
    }),

  setManual: workerProcedure
    .input(z.object({
      materialId: z.number(),
      unitPrice: z.number().min(0),
      reason: z.string().min(1, "사유를 입력하세요").max(200),
      autoUpdate: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { getRawConnection } = await import("../../db/connection");
      const { setManualMaterialPrice } = await import("../../lib/inventory/materialPrice");
      return await setManualMaterialPrice(await getRawConnection(), {
        materialId: input.materialId, tenantId: ctx.tenantId, unitPrice: input.unitPrice,
        reason: input.reason, changedBy: ctx.user.id, autoUpdate: input.autoUpdate,
      });
    }),

  setAutoUpdate: workerProcedure
    .input(z.object({ materialId: z.number(), enabled: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const { getRawConnection } = await import("../../db/connection");
      const { setMaterialPriceAutoUpdate } = await import("../../lib/inventory/materialPrice");
      await setMaterialPriceAutoUpdate(await getRawConnection(), { materialId: input.materialId, tenantId: ctx.tenantId, enabled: input.enabled });
      return { success: true };
    }),

  refreshAll: adminProcedure
    .input(z.object({ onlyMissing: z.boolean().optional() }).optional())
    .mutation(async ({ input, ctx }) => {
      const { getRawConnection } = await import("../../db/connection");
      const { refreshMaterialPricesFromReceipts } = await import("../../lib/inventory/materialPrice");
      return await refreshMaterialPricesFromReceipts(await getRawConnection(), {
        tenantId: ctx.tenantId, changedBy: ctx.user.id, onlyMissing: input?.onlyMissing ?? false,
      });
    }),
});

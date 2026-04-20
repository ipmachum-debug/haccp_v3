/**
 * AI SKU 매칭 라우터 (Phase 8+)
 *
 * 엑셀 업로드 매칭 파이프라인에서 의심 구간(퍼지 0.7~0.9)만 LLM으로 재검증.
 * 배치 호출로 비용 절감.
 */
import { z } from "zod";
import { router, tenantRequiredProcedure } from "../../_core/trpc";

export const aiSkuMatchRouter = router({
  /**
   * 배치 AI 매칭
   * - 클라이언트가 퍼지 매칭 후 needsAi=true 행들만 모아 호출
   * - partnerId 제공 시 거래처 과거 이력을 컨텍스트로 활용
   */
  matchBatch: tenantRequiredProcedure
    .input(
      z.object({
        partnerId: z.number().nullable().optional(),
        rows: z.array(
          z.object({
            rowIndex: z.number(),
            itemName: z.string().optional(),
            skuCode: z.string().optional(),
            candidates: z.array(
              z.object({
                skuId: z.number(),
                skuCode: z.string(),
                skuName: z.string(),
                itemName: z.string(),
                itemType: z.string(),
                score: z.number(),
              }),
            ),
          }),
        ).max(100, "한 번에 최대 100행까지 처리 가능합니다"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.rows.length === 0) return [];
      const { matchSkuWithAiBatch } = await import(
        "../../services/ai/aiSkuMatch.service"
      );
      return await matchSkuWithAiBatch(
        ctx.tenantId,
        input.partnerId ?? null,
        input.rows,
      );
    }),
});

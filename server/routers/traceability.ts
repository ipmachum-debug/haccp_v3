import { z } from "zod";
import { generateLotTracePdf } from "../pdf/lotTracePdf";
import { tenantRequiredProcedure, router } from "../_core/trpc";
import {
  traceLotForward,
  traceLotBackward,
  traceLotByProductLotNumber,
  traceLotByMaterialLotNumber,
} from "../db/traceability";
import {
  saveLotTraceHistory,
  getLotTraceHistory,
  getTopSearchedLots,
  getUserTraceStats,
  getLotTraceHistoryByLotNumber,
} from "../db/lotTraceHistory";

/**
 * LOT 추적성 라우터
 */
export const traceabilityRouter = router({
  /**
   * 정방향 추적: 원재료 LOT → 배치 → 완제품
   */
  forward: tenantRequiredProcedure
    .input(z.object({ lotId: z.number() }))
    .query(async ({ input }) => {
      return await traceLotForward(input.lotId);
    }),

  /**
   * 역방향 추적: 완제품 → 배치 → 원재료 LOT
   */
  backward: tenantRequiredProcedure
    .input(z.object({ batchId: z.number() }))
    .query(async ({ input }) => {
      return await traceLotBackward(input.batchId);
    }),

  /**
   * 완제품 LOT 번호로 역방향 추적
   */
  byProductLot: tenantRequiredProcedure
    .input(z.object({ lotNumber: z.string() }))
    .query(async ({ input }) => {
      return await traceLotByProductLotNumber(input.lotNumber);
    }),

  /**
   * 원재료 LOT 번호로 정방향 추적
   */
  byMaterialLot: tenantRequiredProcedure
    .input(z.object({ lotNumber: z.string() }))
    .query(async ({ input }) => {
      return await traceLotByMaterialLotNumber(input.lotNumber);
    }),

  /**
   * LOT 추적 이력 저장
   */
  saveHistory: tenantRequiredProcedure
    .input(
      z.object({
        traceType: z.enum(["forward", "backward"]),
        searchLotNumber: z.string(),
        resultData: z.string(),
        userId: z.number().optional(),
        userName: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return await saveLotTraceHistory(input);
    }),

  /**
   * LOT 추적 이력 조회
   */
  getHistory: tenantRequiredProcedure.query(async () => {
    return await getLotTraceHistory();
  }),

  /**
   * 자주 조회되는 LOT 번호 (Top 10)
   */
  getTopSearched: tenantRequiredProcedure.query(async () => {
    return await getTopSearchedLots();
  }),

  /**
   * 사용자별 추적 통계
   */
  getUserStats: tenantRequiredProcedure.query(async () => {
    return await getUserTraceStats();
  }),

  /**
   * 특정 LOT 번호의 추적 이력
   */
  getHistoryByLot: tenantRequiredProcedure
    .input(z.object({ lotNumber: z.string() }))
    .query(async ({ input }) => {
      return await getLotTraceHistoryByLotNumber(input.lotNumber);
    }),

  /**
   * LOT 추적 결과 PDF 생성
   */
  generateTracePdf: tenantRequiredProcedure
    .input(
      z.object({
        traceType: z.enum(["forward", "backward"]),
        searchLotNumber: z.string(),
        resultData: z.any(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const pdfBuffer = await generateLotTracePdf({
        traceType: input.traceType,
        searchLotNumber: input.searchLotNumber,
        resultData: input.resultData,
        tracedAt: new Date(),
        tracedBy: ctx.user.name,
      });

      // PDF를 Base64로 인코딩하여 반환
      const pdfBase64 = pdfBuffer.toString("base64");
      return { pdfBase64 };
    }),
});

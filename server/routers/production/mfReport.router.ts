// mfReport 라우터 - routers.ts에서 분리됨
import { adminProcedure, tenantRequiredProcedure, router } from "../../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, or } from "drizzle-orm";
import { hMfFlavors } from "../../../drizzle/schema";
import { getDb } from "../../db";

export const mfReportRouter = router({
    // 품목제조보고 목록 조회
    list: tenantRequiredProcedure.query(async ({ ctx }) => {
      const { getMfReports } = await import("../../db/mfReportAPI");
      return await getMfReports(ctx.tenantId ?? undefined);
    }),
    
    // 품목제조보고 상세 조회
    getById: tenantRequiredProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getMfReportDetail } = await import("../../db/mfReportAPI");
        return await getMfReportDetail(input.id, ctx.tenantId ?? undefined);
      }),
    
    // 품목제조보고 생성
    create: adminProcedure
      .input(
        z.object({
          productId: z.number(),
          reportNo: z.string().min(1),
          reportDate: z.string(),
          flavorId: z.number().optional(),
          ingredients: z.array(
            z.object({
              materialId: z.number().optional(),
              intermediateId: z.number().optional(),
              quantity: z.number(),
              unit: z.string(),
              isDeductible: z.number(),
              materialType: z.enum(["RAW", "MIXED", "FLAVOR_SPECIFIC"]),
              flavorName: z.string().optional(),
              processGroupId: z.number().optional(),
              adjustedWeightKg: z.number().optional(),
              isAdditional: z.number().optional()
            })
          ).optional(),
          createdBy: z.number().optional(),
          // 배치 정보 필드
          yieldBasis: z.enum(["UNIT", "BATCH"]).optional(),
          unitWeightG: z.number().optional(),
          batchTargetKg: z.number().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { createMfReport } = await import("../../db/mfReportAPI");
        return await createMfReport(input, ctx.tenantId ?? undefined);
      }),
    // 품목제조보고 수정 (기존 보고서 업데이트)
    update: adminProcedure
      .input(
        z.object({
          mfReportId: z.number(),
          reportNo: z.string().optional(),
          reportDate: z.string().optional(),
          yieldBasis: z.string().optional(),
          unitWeightG: z.number().optional(),
          batchTargetKg: z.number().optional(),
          ingredients: z.array(
            z.object({
              materialId: z.number().optional(),
              intermediateId: z.number().optional(),
              quantity: z.number(),
              unit: z.string(),
              isDeductible: z.number(),
              materialType: z.enum(["RAW", "MIXED", "FLAVOR_SPECIFIC"]),
              flavorName: z.string().optional(),
              processGroupId: z.number().optional(),
              adjustedWeightKg: z.number().optional(),
              isAdditional: z.number().optional()
            })
          ).optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { updateMfReport } = await import("../../db/mfReportAPI");
        return await updateMfReport(input, ctx.tenantId ?? undefined);
      }),
    
    // 품목제조보고 버전 생성
    createVersion: adminProcedure
      .input(
        z.object({
          mfReportId: z.number(),
          effectiveFrom: z.string(),
          changeReason: z.string().optional(),
          compositionTotalRule: z.string().optional(),
          createdBy: z.number().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { createMfReportVersion } = await import("../../db/mfReportAPI");
        return await createMfReportVersion(input);
      }),
    
    // 품목제조보고 버전 승인
    approveVersion: adminProcedure
      .input(z.object({ versionId: z.number(), comment: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        const { approveMfReportVersion } = await import("../../db/mfReportAPI");
        return await approveMfReportVersion(input.versionId, ctx.user.id, input.comment, ctx.tenantId ?? undefined);
      }),
    
    // 품목제조보고 버전 목록 조회
    getVersions: tenantRequiredProcedure
      .input(z.object({ mfReportId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getMfReportVersions } = await import("../../db/mfReportAPI");
        return await getMfReportVersions(input.mfReportId, ctx.tenantId ?? undefined);
      }),
    
    // 품목제조보고 버전 상세 조회
    getVersionDetail: tenantRequiredProcedure
      .input(z.object({ versionId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getMfReportVersionDetail } = await import("../../db/mfReportAPI");
        return await getMfReportVersionDetail(input.versionId, ctx.tenantId ?? undefined);
      }),
    
    // 특정 날짜에 유효한 버전 조회
    getVersionByDate: tenantRequiredProcedure
      .input(
        z.object({
          mfReportId: z.number(),
          date: z.string()
        })
      )
      .query(async ({ input, ctx }) => {
        const { getMfReportVersionByDate } = await import("../../db/mfReportAPI");
        return await getMfReportVersionByDate(input.mfReportId, input.date, ctx.tenantId ?? undefined);
      }),
    
    // 맛(Flavor) 목록 조회
    listFlavors: tenantRequiredProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection failed" });
      return await db.select().from(hMfFlavors).where(eq((hMfFlavors as any).tenantId, ctx.tenantId ?? undefined));
    }),
    
    // 맛(Flavor) 생성
    createFlavor: adminProcedure
      .input(
        z.object({
          mfReportVersionId: z.number(),
          flavorCode: z.string().min(1),
          flavorName: z.string().min(1),
          appliesToSku: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { createMfFlavor } = await import("../../db/mfReportAPI");
        return await createMfFlavor(input);
      }),
    
    // 원재료 구성 추가
    addIngredient: adminProcedure
      .input(
        z.object({
          mfReportVersionId: z.number(),
          lineNo: z.number(),
          materialId: z.number().optional(),
          intermediateId: z.number().optional(),
          quantity: z.string(),
          unit: z.string(),
          isDeductible: z.number()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { addMfIngredient } = await import("../../db/mfReportAPI");
        return await addMfIngredient(input);
      }),
    
    // 원재료 구성 수정
    updateIngredient: adminProcedure
      .input(
        z.object({
          ingredientId: z.number(),
          percent: z.string().optional(),
          isDeductible: z.number().optional(),
          labelNameOverride: z.string().optional(),
          allergens: z.string().optional(),
          originNote: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { updateMfIngredient } = await import("../../db/mfReportAPI");
        const { ingredientId, ...data } = input;
        return await updateMfIngredient(ingredientId, data);
      }),
    
    // 원재료 구성 삭제
    deleteIngredient: adminProcedure
      .input(z.object({ ingredientId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { deleteMfIngredient } = await import("../../db/mfReportAPI");
        return await deleteMfIngredient(input.ingredientId, ctx.tenantId ?? undefined);
      }),
    
    // 일괄 상태 변경
    bulkUpdateStatus: adminProcedure
      .input(
        z.object({
          ids: z.array(z.number()),
          status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"])
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { bulkUpdateMfReportStatus } = await import("../../db/mfReportAPI");
        return await bulkUpdateMfReportStatus(input.ids, input.status, ctx.tenantId ?? undefined);
      }),
    
    // 일괄 삭제
    bulkDelete: adminProcedure
      .input(z.object({ ids: z.array(z.number()) }))
      .mutation(async ({ input, ctx }) => {
        const { bulkDeleteMfReports } = await import("../../db/mfReportAPI");
        return await bulkDeleteMfReports(input.ids, ctx.tenantId ?? undefined);
      }),
    
    // 일괄 PDF 출력
    bulkExportPdf: adminProcedure
      .input(z.object({ ids: z.array(z.number()) }))
      .mutation(async ({ input, ctx }) => {
        const { bulkExportMfReportsPdf } = await import("../../db/mfReportAPI");
        return await bulkExportMfReportsPdf(input.ids, ctx.tenantId ?? undefined);
      }),
    
    // 배치 생산량 g 환산 계산
    calculateBatchRequirements: tenantRequiredProcedure
      .input(
        z.object({
          versionId: z.number(),
          batchKg: z.number()
        })
      )
      .query(async ({ input, ctx }) => {
        const { calculateBatchRequirements } = await import("../../db/mfReportAPI");
        return await calculateBatchRequirements(input.versionId, input.batchKg, ctx.tenantId ?? undefined);
      }),
    
    // 승인 요청
    requestApproval: tenantRequiredProcedure
      .input(
        z.object({
          versionId: z.number(),
          comment: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { requestMfReportApproval } = await import("../../db/mfReportAPI");
        return await requestMfReportApproval(input.versionId, ctx.user.id, input.comment, ctx.tenantId ?? undefined);
      }),
    
    // 승인 처리
    approve: adminProcedure
      .input(
        z.object({
          versionId: z.number(),
          comment: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { approveMfReportVersion } = await import("../../db/mfReportAPI");
        return await approveMfReportVersion(input.versionId, ctx.user.id, input.comment);
      }),
    // 반려 처리
    reject: adminProcedure
      .input(
        z.object({
          versionId: z.number(),
          reason: z.string().min(1)
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { rejectMfReportVersion } = await import("../../db/mfReportAPI");
        return await rejectMfReportVersion(input.versionId, ctx.user.id, input.reason, ctx.tenantId ?? undefined);
      }),
    
    // 승인 이력 조회
    getApprovalHistory: tenantRequiredProcedure
      .input(z.object({ versionId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getMfReportApprovalHistory } = await import("../../db/mfReportAPI");
        return await getMfReportApprovalHistory(input.versionId, ctx.tenantId ?? undefined);
      }),
    
    // 보정 배합비 재계산
    recalculateCorrectedRatios: adminProcedure
      .input(z.object({ versionId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { calculateAndSaveCorrectedRatios } = await import("../../db/mfReportAPI");
        return await calculateAndSaveCorrectedRatios(input.versionId);
      }),

    // 오차 분석 (배치 학습 기반)
    getDeviationAnalysis: tenantRequiredProcedure
      .input(z.object({ versionId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getDeviationAnalysis } = await import("../../db/mfReportAPI");
        return await getDeviationAnalysis(input.versionId);
      }),

    // 재고 차감 (원재료/중간재/부재료 정책 적용)
    deductInventory: adminProcedure
      .input(
        z.object({
          versionId: z.number(),
          batchKg: z.number(),
          productionDate: z.string(),
          producedQuantity: z.number(),
          notes: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { deductInventoryByMfReport } = await import("../../db/mfReportAPI");
        return await deductInventoryByMfReport({
          ...input,
          createdBy: ctx.user.id
        });
      }),
    
    // 표시사항 출력 (요약형/상세형)
    generateLabel: tenantRequiredProcedure
      .input(
        z.object({
          versionId: z.number(),
          mode: z.enum(["summary", "detailed"])
        })
      )
      .query(async ({ input, ctx }) => {
        const { generateIngredientLabel } = await import("../../db/mfReportAPI");
        const pdfBuffer = await generateIngredientLabel(input.versionId, input.mode, ctx.tenantId ?? undefined);
        return {
          pdfBase64: pdfBuffer.toString("base64")
        };
      }),
    
    // 생산 이력 조회
    getProductionLogs: tenantRequiredProcedure
      .input(
        z.object({
          versionId: z.number()
        })
      )
      .query(async ({ input, ctx }) => {
        const { getProductionLogsByVersionId } = await import("../../db/productionLogAPI");
        return await getProductionLogsByVersionId(input.versionId);
      }),
    
    // 재고 차감 이력 조회
    getInventoryDeductionLogs: tenantRequiredProcedure
      .input(
        z.object({
          versionId: z.number()
        })
      )
      .query(async ({ input, ctx }) => {
        const { getAllInventoryDeductionLogsByVersionId } = await import("../../db/productionLogAPI");
        return await getAllInventoryDeductionLogsByVersionId(input.versionId);
      }),
    // === 공정그룹 재료 매핑 & 배치 배합비 조정 API ===
    
    // 재료-공정 매핑 조회
    getIngredientProcessMappings: tenantRequiredProcedure
      .input(z.object({ versionId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getIngredientProcessMappings } = await import("../../db/mfReportAPI");
        return await getIngredientProcessMappings(input.versionId, ctx.tenantId ?? undefined);
      }),

    // 재료-공정 매핑 일괄 저장
    saveIngredientProcessMappings: tenantRequiredProcedure
      .input(z.object({
        versionId: z.number(),
        mappings: z.array(z.object({
          ingredientId: z.number(),
          processGroupId: z.number().nullable(),
          processCategory: z.enum(["DOUGH", "FILLING", "TOPPING", "NONE"]),
          sortOrder: z.number().optional(),
        })),
      }))
      .mutation(async ({ input, ctx }) => {
        const { saveIngredientProcessMappings } = await import("../../db/mfReportAPI");
        return await saveIngredientProcessMappings(input.versionId, ctx.tenantId ?? undefined, input.mappings);
      }),

    // 공정별 조정 파라미터 조회
    getProcessAdjustments: tenantRequiredProcedure
      .input(z.object({ versionId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getProcessAdjustments } = await import("../../db/mfReportAPI");
        return await getProcessAdjustments(input.versionId, ctx.tenantId ?? undefined);
      }),

    // 공정별 조정 파라미터 일괄 저장
    saveProcessAdjustments: tenantRequiredProcedure
      .input(z.object({
        versionId: z.number(),
        adjustments: z.array(z.object({
          processGroupId: z.number().nullable(),
          processCategory: z.enum(["DOUGH", "FILLING", "TOPPING", "NONE"]),
          yieldFactor: z.number().optional(),
          yieldMaterialId: z.number().nullable().optional(),
          waterAdditionKg: z.number().optional(),
          steamAbsorptionPct: z.number().optional(),
          targetOutputKg: z.number().nullable().optional(),
          inputTiming: z.enum(["BEFORE_PROCESS", "DURING_PROCESS", "AFTER_PROCESS"]).optional(),
          weightChange: z.number().optional(),
          notes: z.string().optional(),
        })),
      }))
      .mutation(async ({ input, ctx }) => {
        const { saveProcessAdjustments } = await import("../../db/mfReportAPI");
        return await saveProcessAdjustments(input.versionId, ctx.tenantId ?? undefined, input.adjustments);
      }),

    // 공정그룹 기반 배치 배합비 계산
    calculateAdjustedBatchFormula: tenantRequiredProcedure
      .input(z.object({
        versionId: z.number(),
        batchKg: z.number(),
      }))
      .query(async ({ input, ctx }) => {
        const { calculateAdjustedBatchFormula } = await import("../../db/mfReportAPI");
        return await calculateAdjustedBatchFormula(input.versionId, input.batchKg, ctx.tenantId ?? undefined);
      }),
});

// mfReport 라우터 - routers.ts에서 분리됨
import { adminProcedure, tenantRequiredProcedure, router } from "../../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, or } from "drizzle-orm";
import { hMfFlavors } from "../../../drizzle/schema";
import { getDb } from "../../db";

// 회사 소유 검증 (2026-10-19, 설계 18 R6) — 입력의 보고서·버전·원료 줄·품목·공정 번호가 모두 이 회사 것일 때만 실행
//   이전: 버전·원료 줄을 번호만으로 찾아 고쳐 다른 회사의 BOM 이 바뀔 수 있었다 (updateMfReport 등)
async function mfOwned(opts: { ctx: any; getRawInput: () => Promise<unknown>; next: () => any }) {
  const tenantId = opts.ctx?.tenantId;
  if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "회사 정보가 없습니다." });
  const { getRawConnection } = await import("../../db");
  const { assertMfIdsOwned, MfOwnershipError } = await import("../../lib/production/mfReportOwnership");
  try {
    await assertMfIdsOwned(await getRawConnection(), Number(tenantId), await opts.getRawInput());
  } catch (e: any) {
    if (e instanceof MfOwnershipError) throw new TRPCError({ code: "NOT_FOUND", message: e.message });
    throw e;
  }
  return opts.next();
}
const mfAdmin = adminProcedure.use(mfOwned as any);
const mfTenant = tenantRequiredProcedure.use(mfOwned as any);

export const mfReportRouter = router({
    // 품목제조보고 목록 조회
    list: tenantRequiredProcedure.query(async ({ ctx }) => {
      const { getMfReports } = await import("../../db/production/mfReportAPI");
      return await getMfReports(ctx.tenantId);
    }),
    
    // 품목제조보고 상세 조회
    getById: mfTenant
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getMfReportDetail } = await import("../../db/production/mfReportAPI");
        const detail: any = await getMfReportDetail(input.id, ctx.tenantId);
        // 편집 기준 표식 — 저장 때 비교해 동시 편집 충돌을 막는다 (Codex #605 재검토 2)
        const { getRawConnection } = await import("../../db");
        const { snapshotRecipe, recipeEditToken } = await import("../../lib/production/designChangeDiff");
        const snap = detail ? await snapshotRecipe(await getRawConnection(), ctx.tenantId, input.id).catch(() => null) : null;
        return detail ? { ...detail, editToken: snap ? recipeEditToken(snap) : null } : detail;
      }),
    
    // 품목제조보고 생성
    create: mfAdmin
      .input(
        z.object({
          productId: z.number(),
          reportNo: z.string().min(1),
          reportDate: z.string(),
          flavorId: z.number().optional(),
          /** ★ PR #299: BASIC = 단품 BOM, MIXED = 혼합 (child SKU + 비율) */
          reportType: z.enum(["BASIC", "MIXED"]).default("BASIC"),
          ingredients: z.array(
            z.object({
              materialId: z.number().optional(),
              intermediateId: z.number().optional(),
              /** ★ PR #299: MIXED 시 child SKU 참조 */
              childSkuId: z.number().optional(),
              /** ★ PR #299: 1box 당 child 개수 (라벨용, 선택) */
              pieceCount: z.number().int().optional(),
              /** ★ PR #299: 1개당 g (라벨용, 선택) */
              pieceWeightG: z.number().optional(),
              quantity: z.number(),
              unit: z.string(),
              isDeductible: z.number(),
              materialType: z.enum(["RAW", "MIXED", "FLAVOR_SPECIFIC", "CHILD_SKU"]),
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
        const { createMfReport } = await import("../../db/production/mfReportAPI");
        const result = await createMfReport(input, ctx.tenantId);

        // ★ 2026-05-10 (PR #299): MIXED type 이면 sku_bundles 자동 동기화
        if (input.reportType === "MIXED") {
          try {
            const { syncMfReportToBundles } = await import(
              "../../lib/production/syncMfReportToBundles.js"
            );
            await syncMfReportToBundles(result.mfReportId, ctx.tenantId);
          } catch (e: any) {
            console.error("[mfReport.create] sku_bundles 자동 동기화 실패 (mfReport 는 정상 저장):", e?.message ?? e);
          }
        }
        return result;
      }),
    // 품목제조보고 수정 (기존 보고서 업데이트)
    /** 회사가 원물·공정 기준(수율 보정) 방식을 쓰는지 (2026-10-16 — 회사 선택, 기본 꺼짐) */
    massBasisFeature: tenantRequiredProcedure.query(async ({ ctx }) => {
      const { getRawConnection } = await import("../../db");
      const { isTenantFeatureEnabled, MASS_BASIS_FEATURE } = await import("../../lib/production/massBasisPolicy");
      return { enabled: await isTenantFeatureEnabled(await getRawConnection(), ctx.tenantId, MASS_BASIS_FEATURE) };
    }),

    /** 관리자: 회사의 원물·공정 기준 방식 켜기/끄기. 끄면 새 배치는 기존 계산, 이미 고정된 배치 기준은 유지 */
    setMassBasisFeature: adminProcedure
      .input(z.object({ enabled: z.boolean() }))
      .mutation(async ({ input, ctx }) => {
        const { getRawConnection } = await import("../../db");
        const { setTenantFeature, MASS_BASIS_FEATURE } = await import("../../lib/production/massBasisPolicy");
        await setTenantFeature(await getRawConnection(), ctx.tenantId, MASS_BASIS_FEATURE, input.enabled, ctx.user?.id ?? null);
        const { createAuditLog } = await import("../../db/system/auditApprovalSupplier");
        await createAuditLog({
          action: "tenant_feature.update", entityType: "tenant_feature", userId: ctx.user?.id,
          changes: { feature: MASS_BASIS_FEATURE, enabled: input.enabled },
          description: `원물·공정 기준(수율 보정) 방식 ${input.enabled ? "사용" : "사용 안 함"}`,
        }, ctx.tenantId);
        return { enabled: input.enabled };
      }),

    update: mfAdmin
      .input(
        z.object({
          mfReportId: z.number(),
          reportNo: z.string().optional(),
          reportDate: z.string().optional(),
          /** ★ PR #299: BASIC ↔ MIXED 전환 가능 */
          reportType: z.enum(["BASIC", "MIXED"]).optional(),
          yieldBasis: z.string().optional(),
          unitWeightG: z.number().optional(),
          batchTargetKg: z.number().optional(),
          // ★ 2026-10-16 원물·공정·완제품 기준 (수율 기준 PR B) — 생략하면 유지
          referenceFinishedKg: z.number().positive().nullable().optional(),
          referenceRawTotalKg: z.number().positive().nullable().optional(),
          massBasisEnabled: z.boolean().optional(),
          /** 편집기가 불러온 버전 · 배합 지문 — 다르면 저장 거부 (Codex #605 재검토 2·5) */
          versionId: z.number().int().positive().optional(),
          editToken: z.string().max(64).optional(),
          ingredients: z.array(
            z.object({
              /** ★ 2026-10-16: 원래 행 id — 보내지 않은 값(CCP 공정 지정 등)을 이 행에서 이어받는다 */
              id: z.number().optional(),
              materialId: z.number().optional(),
              intermediateId: z.number().optional(),
              childSkuId: z.number().optional(),
              pieceCount: z.number().int().optional(),
              pieceWeightG: z.number().optional(),
              quantity: z.number(),
              unit: z.string(),
              isDeductible: z.number().default(1),
              materialType: z.enum(["RAW", "MIXED", "FLAVOR_SPECIFIC", "CHILD_SKU"]),
              flavorName: z.string().optional(),
              processGroupId: z.number().nullable().optional(), // null = 미지정으로 비움, 생략 = 유지
              adjustedWeightKg: z.number().nullable().optional(),
              basisRawKg: z.number().nonnegative().nullable().optional(),
              pretreatmentFactor: z.number().positive().nullable().optional(),
              /** 공정 미지정 원료의 들어가는 곳 — 생산 설계 2a (생략 = 유지) */
              entryStage: z.enum(["direct", "late"]).nullable().optional(),
              isAdditional: z.number().optional()
            })
          ).optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        // ★ 2026-10-16: 원물·공정 기준(수율 보정) 은 회사가 선택한 경우에만 켤 수 있다 (massBasisPolicy)
        if (input.massBasisEnabled === true) {
          const { getRawConnection } = await import("../../db");
          const { isTenantFeatureEnabled, MASS_BASIS_FEATURE } = await import("../../lib/production/massBasisPolicy");
          if (!(await isTenantFeatureEnabled(await getRawConnection(), ctx.tenantId, MASS_BASIS_FEATURE))) {
            throw new TRPCError({ code: "FORBIDDEN", message: "이 회사는 원물·공정 기준(수율 보정) 방식을 사용하지 않습니다. 관리자 설정에서 먼저 켜세요." });
          }
        }
        const { updateMfReport } = await import("../../db/production/mfReportAPI");
        // 변경·적용 이력: 저장 전·후를 같은 트랜잭션에서 읽어 바뀐 것만 남긴다 (저장과 함께 성공·취소 — Codex #605 재검토 2)
        let result: any;
        try {
          result = await updateMfReport({ ...input, audit: { userId: ctx.user.id, userEmail: ctx.user.email, userRole: ctx.user.role } }, ctx.tenantId);
        } catch (e: any) {
          if (e?.code === "MF_EDIT_CONFLICT") throw new TRPCError({ code: "CONFLICT", message: e.message });
          throw e;
        }

        // ★ 2026-05-10 (PR #299): MIXED type 이면 sku_bundles 자동 재동기화
        if (input.reportType === "MIXED") {
          try {
            const { syncMfReportToBundles } = await import(
              "../../lib/production/syncMfReportToBundles.js"
            );
            await syncMfReportToBundles(input.mfReportId, ctx.tenantId);
          } catch (e: any) {
            console.error("[mfReport.update] sku_bundles 자동 동기화 실패:", e?.message ?? e);
          }
        }
        return result;
      }),
    
    // 품목제조보고 버전 생성
    createVersion: mfAdmin
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
        const tenantId = ctx.tenantId;
        const { createMfReportVersion } = await import("../../db/production/mfReportAPI");
        return await createMfReportVersion(input, tenantId ?? undefined);
      }),
    
    // 품목제조보고 버전 승인
    approveVersion: mfAdmin
      .input(z.object({ versionId: z.number(), comment: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        const { approveMfReportVersion } = await import("../../db/production/mfReportAPI");
        return await approveMfReportVersion(input.versionId, ctx.user.id, input.comment, ctx.tenantId);
      }),
    
    // 품목제조보고 버전 목록 조회
    getVersions: mfTenant
      .input(z.object({ mfReportId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getMfReportVersions } = await import("../../db/production/mfReportAPI");
        return await getMfReportVersions(input.mfReportId, ctx.tenantId);
      }),
    
    // 품목제조보고 버전 상세 조회
    getVersionDetail: mfTenant
      .input(z.object({ versionId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getMfReportVersionDetail } = await import("../../db/production/mfReportAPI");
        return await getMfReportVersionDetail(input.versionId, ctx.tenantId);
      }),
    
    // 특정 날짜에 유효한 버전 조회
    getVersionByDate: mfTenant
      .input(
        z.object({
          mfReportId: z.number(),
          date: z.string()
        })
      )
      .query(async ({ input, ctx }) => {
        const { getMfReportVersionByDate } = await import("../../db/production/mfReportAPI");
        return await getMfReportVersionByDate(input.mfReportId, input.date, ctx.tenantId);
      }),
    
    // 맛(Flavor) 목록 조회
    listFlavors: tenantRequiredProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 실패" });
      return await db.select().from(hMfFlavors).where(eq((hMfFlavors as any).tenantId, ctx.tenantId));
    }),
    
    // 맛(Flavor) 생성
    createFlavor: mfAdmin
      .input(
        z.object({
          mfReportVersionId: z.number(),
          flavorCode: z.string().min(1),
          flavorName: z.string().min(1),
          appliesToSku: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        const { createMfFlavor } = await import("../../db/production/mfReportAPI");
        return await createMfFlavor(input, tenantId ?? undefined);
      }),
    
    // 원재료 구성 추가
    addIngredient: mfAdmin
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
        const tenantId = ctx.tenantId;
        const { addMfIngredient } = await import("../../db/production/mfReportAPI");
        return await addMfIngredient(input, tenantId ?? undefined);
      }),
    
    // 원재료 구성 수정
    updateIngredient: mfAdmin
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
        const tenantId = ctx.tenantId;
        const { updateMfIngredient } = await import("../../db/production/mfReportAPI");
        const { ingredientId, ...data } = input;
        return await updateMfIngredient(ingredientId, data, tenantId ?? undefined);
      }),
    
    // 원재료 구성 삭제
    deleteIngredient: mfAdmin
      .input(z.object({ ingredientId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { deleteMfIngredient } = await import("../../db/production/mfReportAPI");
        return await deleteMfIngredient(input.ingredientId, ctx.tenantId);
      }),
    
    // 일괄 상태 변경
    bulkUpdateStatus: mfAdmin
      .input(
        z.object({
          ids: z.array(z.number()),
          status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"])
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { bulkUpdateMfReportStatus } = await import("../../db/production/mfReportAPI");
        return await bulkUpdateMfReportStatus(input.ids, input.status, ctx.tenantId);
      }),
    
    // 일괄 삭제
    bulkDelete: mfAdmin
      .input(z.object({ ids: z.array(z.number()) }))
      .mutation(async ({ input, ctx }) => {
        const { bulkDeleteMfReports } = await import("../../db/production/mfReportAPI");
        return await bulkDeleteMfReports(input.ids, ctx.tenantId);
      }),
    
    // 일괄 PDF 출력
    bulkExportPdf: mfAdmin
      .input(z.object({ ids: z.array(z.number()) }))
      .mutation(async ({ input, ctx }) => {
        const { bulkExportMfReportsPdf } = await import("../../db/production/mfReportAPI");
        return await bulkExportMfReportsPdf(input.ids, ctx.tenantId);
      }),
    
    // 배치 생산량 g 환산 계산
    calculateBatchRequirements: mfTenant
      .input(
        z.object({
          versionId: z.number(),
          batchKg: z.number()
        })
      )
      .query(async ({ input, ctx }) => {
        const { calculateBatchRequirements } = await import("../../db/production/mfReportAPI");
        return await calculateBatchRequirements(input.versionId, input.batchKg, ctx.tenantId);
      }),
    
    // 승인 요청
    requestApproval: mfTenant
      .input(
        z.object({
          versionId: z.number(),
          comment: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { requestMfReportApproval } = await import("../../db/production/mfReportAPI");
        return await requestMfReportApproval(input.versionId, ctx.user.id, input.comment, ctx.tenantId);
      }),
    
    // 승인 처리
    approve: mfAdmin
      .input(
        z.object({
          versionId: z.number(),
          comment: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { approveMfReportVersion } = await import("../../db/production/mfReportAPI");
        return await approveMfReportVersion(input.versionId, ctx.user.id, input.comment, ctx.tenantId);
      }),
    // 반려 처리
    reject: mfAdmin
      .input(
        z.object({
          versionId: z.number(),
          reason: z.string().min(1)
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { rejectMfReportVersion } = await import("../../db/production/mfReportAPI");
        return await rejectMfReportVersion(input.versionId, ctx.user.id, input.reason, ctx.tenantId);
      }),
    
    // 승인 이력 조회
    getApprovalHistory: mfTenant
      .input(z.object({ versionId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getMfReportApprovalHistory } = await import("../../db/production/mfReportAPI");
        return await getMfReportApprovalHistory(input.versionId, ctx.tenantId);
      }),
    
    // 보정 배합비 재계산
    recalculateCorrectedRatios: mfAdmin
      .input(z.object({ versionId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        const { calculateAndSaveCorrectedRatios } = await import("../../db/production/mfReportAPI");
        return await calculateAndSaveCorrectedRatios(input.versionId, tenantId ?? undefined);
      }),

    // 오차 분석 (배치 학습 기반)
    getDeviationAnalysis: mfTenant
      .input(z.object({ versionId: z.number() }))
      .query(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        const { getDeviationAnalysis } = await import("../../db/production/mfReportAPI");
        return await getDeviationAnalysis(input.versionId, tenantId ?? undefined);
      }),

    // 재고 차감 (원재료/중간재/부재료 정책 적용)
    deductInventory: mfAdmin
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
        const tenantId = ctx.tenantId;
        const { deductInventoryByMfReport } = await import("../../db/production/mfReportAPI");
        return await deductInventoryByMfReport({
          ...input,
          createdBy: ctx.user.id
        }, tenantId ?? undefined);
      }),
    
    // 표시사항 출력 (요약형/상세형)
    generateLabel: mfTenant
      .input(
        z.object({
          versionId: z.number(),
          mode: z.enum(["summary", "detailed"])
        })
      )
      .query(async ({ input, ctx }) => {
        const { generateIngredientLabel } = await import("../../db/production/mfReportAPI");
        const pdfBuffer = await generateIngredientLabel(input.versionId, input.mode, ctx.tenantId);
        return {
          pdfBase64: pdfBuffer.toString("base64")
        };
      }),
    
    // 생산 이력 조회
    getProductionLogs: mfTenant
      .input(
        z.object({
          versionId: z.number()
        })
      )
      .query(async ({ input, ctx }) => {
        const { getProductionLogsByVersionId } = await import("../../db/production/productionLogAPI");
        return await getProductionLogsByVersionId(ctx.tenantId, input.versionId);
      }),
    
    // 재고 차감 이력 조회
    getInventoryDeductionLogs: mfTenant
      .input(
        z.object({
          versionId: z.number()
        })
      )
      .query(async ({ input, ctx }) => {
        const { getAllInventoryDeductionLogsByVersionId } = await import("../../db/production/productionLogAPI");
        return await getAllInventoryDeductionLogsByVersionId(ctx.tenantId, input.versionId);
      }),
    // === 공정그룹 재료 매핑 & 배치 배합비 조정 API ===
    
    // 재료-공정 매핑 조회
    getIngredientProcessMappings: mfTenant
      .input(z.object({ versionId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getIngredientProcessMappings } = await import("../../db/production/mfReportAPI");
        return await getIngredientProcessMappings(input.versionId, ctx.tenantId);
      }),

    // 재료-공정 매핑 일괄 저장
    saveIngredientProcessMappings: mfTenant
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
        const { saveIngredientProcessMappings } = await import("../../db/production/mfReportAPI");
        return await saveIngredientProcessMappings(input.versionId, ctx.tenantId, input.mappings);
      }),

    // 공정별 조정 파라미터 조회
    getProcessAdjustments: mfTenant
      .input(z.object({ versionId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getProcessAdjustments } = await import("../../db/production/mfReportAPI");
        return await getProcessAdjustments(input.versionId, ctx.tenantId);
      }),

    // 공정별 조정 파라미터 일괄 저장
    saveProcessAdjustments: mfTenant
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
        const { saveProcessAdjustments } = await import("../../db/production/mfReportAPI");
        return await saveProcessAdjustments(input.versionId, ctx.tenantId, input.adjustments);
      }),

    // 공정그룹 기반 배치 배합비 계산
    calculateAdjustedBatchFormula: mfTenant
      .input(z.object({
        versionId: z.number(),
        batchKg: z.number(),
      }))
      .query(async ({ input, ctx }) => {
        const { calculateAdjustedBatchFormula } = await import("../../db/production/mfReportAPI");
        return await calculateAdjustedBatchFormula(input.versionId, input.batchKg, ctx.tenantId);
      }),

    /**
     * 품목제조보고서 BOM 트리 분해 — PR #254
     * 식약처 양식 출력 준비 (트리 구조 + depth + 원산지)
     */
    flattenedBom: mfTenant
      .input(z.object({ versionId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { flattenBomTree } = await import("../../db/production/mfReportFlatten");
        return await flattenBomTree(input.versionId, Number(ctx.tenantId));
      }),

    /**
     * 품목제조보고서 Excel 출력 — PR #256
     */
    exportFlattenedExcel: mfTenant
      .input(z.object({ versionId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { exportMfReportExcel } = await import("../../db/production/mfReportExcelExport");
        return await exportMfReportExcel(input.versionId, Number(ctx.tenantId));
      }),

    /**
     * 품목제조보고서 PDF 출력 — PR #256 (puppeteer HTML→PDF, 한글 폰트 지원)
     */
    exportFlattenedPdf: mfTenant
      .input(z.object({ versionId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { exportMfReportPdf } = await import("../../db/production/mfReportPdfExport");
        return await exportMfReportPdf(input.versionId, Number(ctx.tenantId));
      }),
});

import { z } from "zod";
import { tenantRequiredProcedure, router } from "../_core/trpc";
import * as hazardAnalysisDb from "../db/hazardAnalysis";

/**
 * 위험 분석 시스템 라우터 (HACCP 원칙 1)
 */

export const hazardAnalysisRouter = router({
  // 위험 분석 생성
  create: tenantRequiredProcedure
    .input(
      z.object({
        productId: z.number(),
        siteId: z.number(),
        processStep: z.string(),
        hazardType: z.enum(["biological", "chemical", "physical"]),
        hazardDescription: z.string(),
        severity: z.number().min(1).max(5),
        likelihood: z.number().min(1).max(5),
        controlMeasures: z.string().optional(),
        monitoringProcedure: z.string().optional(),
        criticalLimit: z.string().optional(),
        analyzedDate: z.string(), // YYYY-MM-DD
      })
    )
    .mutation(async ({ input, ctx }) => {
      const id = await hazardAnalysisDb.createHazardAnalysis({
        ...input,
        analyzedBy: ctx.user.id,
      });
      return { id };
    }),

  // 제품별 위험 분석 목록 조회
  listByProduct: tenantRequiredProcedure
    .input(z.object({ productId: z.number() }))
    .query(async ({ input }) => {
      return hazardAnalysisDb.getHazardAnalysisByProduct(input.productId);
    }),

  // 위험 분석 상세 조회
  getById: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return hazardAnalysisDb.getHazardAnalysisById(input.id);
    }),

  // CCP 지정
  designateAsCcp: tenantRequiredProcedure
    .input(z.object({ id: z.number(), ccpNumber: z.string() }))
    .mutation(async ({ input }) => {
      await hazardAnalysisDb.updateHazardAnalysis(input.id, {
        isCcp: 1,
        ccpNumber: input.ccpNumber,
      });
      return { success: true };
    }),

  // 위험 분석 승인
  approve: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await hazardAnalysisDb.updateHazardAnalysis(input.id, {
        status: "approved",
        approvedBy: ctx.user.id,
        approvedDate: new Date().toISOString().split("T")[0],
      });
      return { success: true };
    }),

  // 위험 분석 수정
  update: tenantRequiredProcedure
    .input(
      z.object({
        id: z.number(),
        processStep: z.string().optional(),
        hazardType: z.enum(["biological", "chemical", "physical"]).optional(),
        hazardDescription: z.string().optional(),
        severity: z.number().min(1).max(5).optional(),
        likelihood: z.number().min(1).max(5).optional(),
        isCcp: z.number().optional(),
        ccpNumber: z.string().optional(),
        controlMeasures: z.string().optional(),
        monitoringProcedure: z.string().optional(),
        criticalLimit: z.string().optional(),
        status: z.enum(["draft", "submitted", "approved", "rejected"]).optional(),
        approvedDate: z.string().optional(),
        reviewDate: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      
      // 승인 상태로 변경 시 승인자 정보 추가
      if (data.status === "approved") {
        await hazardAnalysisDb.updateHazardAnalysis(id, {
          ...data,
          approvedBy: ctx.user.id,
          approvedDate: new Date().toISOString().split("T")[0],
        });
      } else {
        await hazardAnalysisDb.updateHazardAnalysis(id, data);
      }
      
      return { success: true };
    }),

  // 위험 분석 삭제
  delete: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await hazardAnalysisDb.deleteHazardAnalysis(input.id);
      return { success: true };
    }),

  // 사업장별 위험 분석 목록
  listBySite: tenantRequiredProcedure
    .input(z.object({ siteId: z.number() }))
    .query(async ({ input }) => {
      return hazardAnalysisDb.getHazardAnalysisBySite(input.siteId);
    }),

  // 상태별 위험 분석 목록
  listByStatus: tenantRequiredProcedure
    .input(z.object({ status: z.enum(["draft", "submitted", "approved", "rejected"]) }))
    .query(async ({ input }) => {
      return hazardAnalysisDb.getHazardAnalysisByStatus(input.status);
    }),

  // CCP로 지정된 위험 분석 목록
  listCcp: tenantRequiredProcedure
    .input(z.object({ productId: z.number() }))
    .query(async ({ input }) => {
      return hazardAnalysisDb.getCcpHazardAnalysis(input.productId);
    }),

  // 위험 요소 관리 방법 추가
  addControl: tenantRequiredProcedure
    .input(
      z.object({
        hazardAnalysisId: z.number(),
        controlType: z.enum(["preventive", "corrective", "monitoring"]),
        controlDescription: z.string(),
        responsibility: z.string().optional(),
        frequency: z.string().optional(),
        recordForm: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const id = await hazardAnalysisDb.createHazardControl(input);
      return { id };
    }),

  // 위험 분석별 관리 방법 목록
  listControls: tenantRequiredProcedure
    .input(z.object({ hazardAnalysisId: z.number() }))
    .query(async ({ input }) => {
      return hazardAnalysisDb.getHazardControlsByAnalysisId(input.hazardAnalysisId);
    }),

  // 관리 방법 수정
  updateControl: tenantRequiredProcedure
    .input(
      z.object({
        id: z.number(),
        controlType: z.enum(["preventive", "corrective", "monitoring"]).optional(),
        controlDescription: z.string().optional(),
        responsibility: z.string().optional(),
        frequency: z.string().optional(),
        recordForm: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await hazardAnalysisDb.updateHazardControl(id, data);
      return { success: true };
    }),

  // 관리 방법 삭제
  deleteControl: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await hazardAnalysisDb.deleteHazardControl(input.id);
      return { success: true };
    }),
});

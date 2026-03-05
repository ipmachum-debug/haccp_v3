/**
 * 부적합 제품 관리 tRPC 라우터
 */

import { z } from "zod";
import { router, tenantRequiredProcedure } from "../_core/trpc";
import * as ncpDb from "../db/nonconformingProduct";

export const nonconformingProductRouter = router({
  // ============================================================================
  // 부적합 제품 관리
  // ============================================================================

  /**
   * 부적합 제품 생성
   */
  create: tenantRequiredProcedure
    .input(
      z.object({
        siteId: z.number(),
        ncpNumber: z.string(),
        detectionDate: z.string(),
        detectionSource: z.enum([
          "incoming_inspection",
          "in_process_inspection",
          "final_inspection",
          "customer_complaint",
          "internal_audit",
          "ccp_monitoring",
          "other",
        ]),
        productId: z.number().optional(),
        productName: z.string(),
        lotNumber: z.string().optional(),
        batchId: z.number().optional(),
        quantity: z.number(),
        unit: z.string(),
        nonconformityType: z.enum([
          "physical",
          "chemical",
          "biological",
          "sensory",
          "packaging",
          "labeling",
          "specification",
          "other",
        ]),
        nonconformityDescription: z.string(),
        rootCause: z.string().optional(),
        causeCategory: z
          .enum(["material", "process", "equipment", "human_error", "environment", "method", "other"])
          .optional(),
        disposalMethod: z
          .enum([
            "pending",
            "rework",
            "downgrade",
            "alternative_use",
            "disposal",
            "return_to_supplier",
            "customer_return",
          ])
          .optional(),
        disposalDate: z.string().optional(),
        disposalDetails: z.string().optional(),
        disposalCost: z.number().optional(),
        responsiblePerson: z.number().optional(),
        correctiveActionId: z.number().optional(),
        preventiveActions: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const id = await ncpDb.createNonconformingProduct({
        ...input,
        detectedBy: ctx.user.id,
        createdBy: ctx.user.id,
        tenantId: ctx.user.tenantId,
      });
      return { id };
    }),

  /**
   * 부적합 제품 목록 조회
   */
  list: tenantRequiredProcedure
    .input(
      z.object({
        siteId: z.number(),
        status: z.string().optional(),
        detectionSource: z.string().optional(),
        nonconformityType: z.string().optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        limit: z.number().optional(),
        offset: z.number().optional(),
      })
    )
    .query(async ({ input }) => {
      return await ncpDb.getNonconformingProducts(input);
    }),

  /**
   * 부적합 제품 상세 조회
   */
  getById: tenantRequiredProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    return await ncpDb.getNonconformingProductById(input.id);
  }),

  /**
   * 부적합 제품 수정
   */
  update: tenantRequiredProcedure
    .input(
      z.object({
        id: z.number(),
        productName: z.string().optional(),
        lotNumber: z.string().optional(),
        quantity: z.number().optional(),
        unit: z.string().optional(),
        nonconformityDescription: z.string().optional(),
        rootCause: z.string().optional(),
        causeCategory: z
          .enum(["material", "process", "equipment", "human_error", "environment", "method", "other"])
          .optional(),
        disposalMethod: z
          .enum([
            "pending",
            "rework",
            "downgrade",
            "alternative_use",
            "disposal",
            "return_to_supplier",
            "customer_return",
          ])
          .optional(),
        disposalDate: z.string().optional(),
        disposalDetails: z.string().optional(),
        disposalCost: z.number().optional(),
        responsiblePerson: z.number().optional(),
        preventiveActions: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await ncpDb.updateNonconformingProduct(id, data);
      return { success: true };
    }),

  /**
   * 부적합 제품 삭제
   */
  delete: tenantRequiredProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    await ncpDb.deleteNonconformingProduct(input.id);
    return { success: true };
  }),

  /**
   * 부적합 제품 상태 변경
   */
  updateStatus: tenantRequiredProcedure
    .input(
      z.object({
        id: z.number(),
        status: z.enum(["detected", "under_investigation", "pending_disposal", "disposed", "closed"]),
      })
    )
    .mutation(async ({ input }) => {
      await ncpDb.updateNonconformingProductStatus(input.id, input.status);
      return { success: true };
    }),

  /**
   * 부적합 제품 승인
   */
  approve: tenantRequiredProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
    await ncpDb.approveNonconformingProduct(input.id, ctx.user.id);
    return { success: true };
  }),

  // ============================================================================
  // 첨부 파일 관리
  // ============================================================================

  /**
   * 첨부 파일 추가
   */
  addAttachment: tenantRequiredProcedure
    .input(
      z.object({
        ncpId: z.number(),
        fileName: z.string(),
        filePath: z.string(),
        fileSize: z.number().optional(),
        mimeType: z.string().optional(),
        attachmentType: z.enum(["photo", "document", "test_report", "other"]),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const id = await ncpDb.addAttachment({
        ...input,
        uploadedBy: ctx.user.id,
        tenantId: ctx.user.tenantId,
      });
      return { id };
    }),

  /**
   * 첨부 파일 목록 조회
   */
  getAttachments: tenantRequiredProcedure.input(z.object({ ncpId: z.number() })).query(async ({ input }) => {
    return await ncpDb.getAttachments(input.ncpId);
  }),

  /**
   * 첨부 파일 삭제
   */
  deleteAttachment: tenantRequiredProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    await ncpDb.deleteAttachment(input.id);
    return { success: true };
  }),

  // ============================================================================
  // 통계 및 보고서
  // ============================================================================

  /**
   * 부적합 제품 통계 조회
   */
  getStats: tenantRequiredProcedure
    .input(
      z.object({
        siteId: z.number(),
        year: z.number().optional(),
        month: z.number().optional(),
      })
    )
    .query(async ({ input }) => {
      return await ncpDb.getNonconformingProductStats(input);
    }),

  /**
   * 부적합 제품 대시보드
   */
  getDashboard: tenantRequiredProcedure.input(z.object({ siteId: z.number() })).query(async ({ input }) => {
    return await ncpDb.getNonconformingProductDashboard(input.siteId);
  }),

  /**
   * 부적합률 계산
   */
  calculateRate: tenantRequiredProcedure
    .input(
      z.object({
        siteId: z.number(),
        dateFrom: z.string(),
        dateTo: z.string(),
      })
    )
    .query(async ({ input }) => {
      return await ncpDb.calculateNonconformityRate(input);
    }),

  /**
   * 부적합 제품 보고서 생성
   */
  generateReport: tenantRequiredProcedure
    .input(
      z.object({
        siteId: z.number(),
        dateFrom: z.string(),
        dateTo: z.string(),
      })
    )
    .query(async ({ input }) => {
      return await ncpDb.generateNonconformingProductReport(input);
    }),
});

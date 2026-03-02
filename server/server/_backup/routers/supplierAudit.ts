/**
 * 거래처(공급업체) 감사 tRPC 라우터
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import * as supplierDb from "../db/supplierAudit";

export const supplierAuditRouter = router({
  // ============================================================================
  // 공급업체 관리
  // ============================================================================

  createSupplier: protectedProcedure
    .input(z.object({
      supplierCode: z.string().optional(),
      supplierName: z.string(),
      businessNumber: z.string().optional(),
      contactPerson: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      address: z.string().optional(),
      supplierType: z.string().optional(),
      certifications: z.string().optional(),
      rating: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const id = await supplierDb.createSupplier({
        ...input,
        tenantId: ctx.user.tenantId,
      });
      return { id };
    }),

  listSuppliers: protectedProcedure
    .input(z.object({
      supplierType: z.string().optional(),
      isActive: z.number().optional(),
      search: z.string().optional(),
      limit: z.number().optional(),
      offset: z.number().optional(),
    }))
    .query(async ({ input, ctx }) => {
      return await supplierDb.getSuppliers({
        ...input,
        tenantId: ctx.user.tenantId,
      });
    }),

  getSupplier: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return await supplierDb.getSupplierById(input.id);
    }),

  updateSupplier: protectedProcedure
    .input(z.object({
      id: z.number(),
      supplierCode: z.string().optional(),
      supplierName: z.string().optional(),
      businessNumber: z.string().optional(),
      contactPerson: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      address: z.string().optional(),
      supplierType: z.string().optional(),
      certifications: z.string().optional(),
      rating: z.string().optional(),
      isActive: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await supplierDb.updateSupplier(id, data);
      return { success: true };
    }),

  deleteSupplier: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await supplierDb.deleteSupplier(input.id);
      return { success: true };
    }),

  // ============================================================================
  // 공급업체 감사
  // ============================================================================

  createAudit: protectedProcedure
    .input(z.object({
      supplierId: z.number(),
      auditDate: z.string(),
      auditType: z.string().optional(),
      auditorName: z.string().optional(),
      score: z.number().optional(),
      result: z.enum(["pass", "fail", "conditional"]).optional(),
      findings: z.string().optional(),
      recommendations: z.string().optional(),
      nextAuditDate: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const id = await supplierDb.createSupplierAudit({
        ...input,
        score: input.score ? String(input.score) : undefined,
        tenantId: ctx.user.tenantId,
      });
      return { id };
    }),

  listAudits: protectedProcedure
    .input(z.object({
      supplierId: z.number().optional(),
      auditType: z.string().optional(),
      result: z.string().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      limit: z.number().optional(),
      offset: z.number().optional(),
    }))
    .query(async ({ input, ctx }) => {
      return await supplierDb.getSupplierAudits({
        ...input,
        tenantId: ctx.user.tenantId,
      });
    }),

  getAudit: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return await supplierDb.getSupplierAuditById(input.id);
    }),

  updateAudit: protectedProcedure
    .input(z.object({
      id: z.number(),
      auditDate: z.string().optional(),
      auditType: z.string().optional(),
      auditorName: z.string().optional(),
      score: z.number().optional(),
      result: z.enum(["pass", "fail", "conditional"]).optional(),
      findings: z.string().optional(),
      recommendations: z.string().optional(),
      nextAuditDate: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      const updateData: any = { ...data };
      if (data.score) updateData.score = String(data.score);
      await supplierDb.updateSupplierAudit(id, updateData);
      return { success: true };
    }),

  deleteAudit: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await supplierDb.deleteSupplierAudit(input.id);
      return { success: true };
    }),

  // ============================================================================
  // 공급업체 평가
  // ============================================================================

  createEvaluation: protectedProcedure
    .input(z.object({
      supplierId: z.number(),
      evaluationDate: z.string(),
      qualityScore: z.number().min(1).max(5),
      deliveryScore: z.number().min(1).max(5),
      priceScore: z.number().min(1).max(5),
      serviceScore: z.number().min(1).max(5),
      responseScore: z.number().min(1).max(5),
      comments: z.string().optional(),
      strengths: z.string().optional(),
      weaknesses: z.string().optional(),
      recommendations: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const overallScore = ((input.qualityScore + input.deliveryScore + input.priceScore + input.serviceScore + input.responseScore) / 5).toFixed(2);
      const id = await supplierDb.createSupplierEvaluation({
        ...input,
        overallScore,
        evaluatedBy: ctx.user.id,
        tenantId: ctx.user.tenantId,
      });
      return { id };
    }),

  listEvaluations: protectedProcedure
    .input(z.object({
      supplierId: z.number().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      limit: z.number().optional(),
      offset: z.number().optional(),
    }))
    .query(async ({ input, ctx }) => {
      return await supplierDb.getSupplierEvaluations({
        ...input,
        tenantId: ctx.user.tenantId,
      });
    }),

  getEvaluation: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return await supplierDb.getSupplierEvaluationById(input.id);
    }),

  updateEvaluation: protectedProcedure
    .input(z.object({
      id: z.number(),
      qualityScore: z.number().min(1).max(5).optional(),
      deliveryScore: z.number().min(1).max(5).optional(),
      priceScore: z.number().min(1).max(5).optional(),
      serviceScore: z.number().min(1).max(5).optional(),
      responseScore: z.number().min(1).max(5).optional(),
      comments: z.string().optional(),
      strengths: z.string().optional(),
      weaknesses: z.string().optional(),
      recommendations: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await supplierDb.updateSupplierEvaluation(id, data);
      return { success: true };
    }),

  deleteEvaluation: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await supplierDb.deleteSupplierEvaluation(input.id);
      return { success: true };
    }),

  // ============================================================================
  // 대시보드 및 통계
  // ============================================================================

  getDashboard: protectedProcedure
    .query(async ({ ctx }) => {
      return await supplierDb.getSupplierDashboard(ctx.user.tenantId);
    }),

  getUpcomingAudits: protectedProcedure
    .input(z.object({ limit: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      return await supplierDb.getUpcomingAudits(ctx.user.tenantId, input.limit);
    }),
});

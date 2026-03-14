/**
 * 거래처(공급업체) 감사 tRPC 라우터
 */

import { z } from "zod";
import { router, tenantRequiredProcedure } from "../_core/trpc";
import * as supplierDb from "../db/supplierAudit";

export const supplierAuditRouter = router({
  // ============================================================================
  // 공급업체 관리
  // ============================================================================

  createSupplier: tenantRequiredProcedure
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
      const id = await supplierDb.createSupplier(ctx.tenantId ?? undefined, input);
      return { id };
    }),

  listSuppliers: tenantRequiredProcedure
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
        tenantId: ctx.tenantId ?? undefined,
      });
    }),

  getSupplier: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      return await supplierDb.getSupplierById(ctx.tenantId ?? undefined, input.id);
    }),

  updateSupplier: tenantRequiredProcedure
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
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      await supplierDb.updateSupplier(ctx.tenantId ?? undefined, id, data);
      return { success: true };
    }),

  deleteSupplier: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await supplierDb.deleteSupplier(ctx.tenantId ?? undefined, input.id);
      return { success: true };
    }),

  // ============================================================================
  // 공급업체 감사
  // ============================================================================

  createAudit: tenantRequiredProcedure
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
      const id = await supplierDb.createSupplierAudit(ctx.tenantId ?? undefined, {
        ...input,
        score: input.score ? String(input.score) : undefined,
      });
      return { id };
    }),

  listAudits: tenantRequiredProcedure
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
        tenantId: ctx.tenantId ?? undefined,
      });
    }),

  getAudit: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      return await supplierDb.getSupplierAuditById(ctx.tenantId ?? undefined, input.id);
    }),

  updateAudit: tenantRequiredProcedure
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
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      const updateData: any = { ...data };
      if (data.score) updateData.score = String(data.score);
      await supplierDb.updateSupplierAudit(ctx.tenantId ?? undefined, id, updateData);
      return { success: true };
    }),

  deleteAudit: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await supplierDb.deleteSupplierAudit(ctx.tenantId ?? undefined, input.id);
      return { success: true };
    }),

  // ============================================================================
  // 공급업체 평가
  // ============================================================================

  createEvaluation: tenantRequiredProcedure
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
      const id = await supplierDb.createSupplierEvaluation(ctx.tenantId ?? undefined, {
        ...input,
        overallScore,
        evaluatedBy: ctx.user.id,
      });
      return { id };
    }),

  listEvaluations: tenantRequiredProcedure
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
        tenantId: ctx.tenantId ?? undefined,
      });
    }),

  getEvaluation: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      return await supplierDb.getSupplierEvaluationById(ctx.tenantId ?? undefined, input.id);
    }),

  updateEvaluation: tenantRequiredProcedure
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
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      await supplierDb.updateSupplierEvaluation(ctx.tenantId ?? undefined, id, data);
      return { success: true };
    }),

  deleteEvaluation: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await supplierDb.deleteSupplierEvaluation(ctx.tenantId ?? undefined, input.id);
      return { success: true };
    }),

  // ============================================================================
  // 대시보드 및 통계
  // ============================================================================

  getDashboard: tenantRequiredProcedure
    .query(async ({ ctx }) => {
      return await supplierDb.getSupplierDashboard(ctx.tenantId ?? undefined);
    }),

  getUpcomingAudits: tenantRequiredProcedure
    .input(z.object({ limit: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      return await supplierDb.getUpcomingAudits(ctx.tenantId ?? undefined, input.limit);
    }),
});

/**
 * 회수 시뮬레이션 tRPC 라우터
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import * as recallDb from "../db/recall";

export const recallSimulationRouter = router({
  // ============================================================================
  // 회수 시뮬레이션 관리
  // ============================================================================

  create: protectedProcedure
    .input(z.object({
      siteId: z.number(),
      simulationNumber: z.string(),
      simulationDate: z.string(),
      simulationType: z.enum(["scheduled", "unscheduled", "actual_recall"]),
      productId: z.number(),
      productName: z.string(),
      lotNumber: z.string(),
      batchId: z.number().optional(),
      recallReason: z.string(),
      recallCategory: z.enum(["class_1", "class_2", "class_3"]),
      productionDate: z.string(),
      expiryDate: z.string().optional(),
      totalProducedQuantity: z.number(),
      totalProducedUnit: z.string(),
      distributedQuantity: z.number(),
      remainingInventory: z.number(),
      targetRecallQuantity: z.number(),
      targetRecallRate: z.number(),
      responsiblePerson: z.number(),
      participants: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const id = await recallDb.createRecallSimulation({
        ...input,
        totalProducedQuantity: String(input.totalProducedQuantity),
        distributedQuantity: String(input.distributedQuantity),
        remainingInventory: String(input.remainingInventory),
        targetRecallQuantity: String(input.targetRecallQuantity),
        targetRecallRate: String(input.targetRecallRate),
        startTime: new Date(),
        createdBy: ctx.user.id,
        tenantId: ctx.user.tenantId,
      });
      // 기본 체크리스트 자동 생성
      await recallDb.createDefaultChecklist(id, ctx.user.tenantId);
      return { id };
    }),

  list: protectedProcedure
    .input(z.object({
      siteId: z.number(),
      status: z.string().optional(),
      simulationType: z.string().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      limit: z.number().optional(),
      offset: z.number().optional(),
    }))
    .query(async ({ input }) => {
      return await recallDb.getRecallSimulations(input);
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return await recallDb.getRecallSimulationById(input.id);
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      recallReason: z.string().optional(),
      recallCategory: z.enum(["class_1", "class_2", "class_3"]).optional(),
      targetRecallQuantity: z.number().optional(),
      targetRecallRate: z.number().optional(),
      responsiblePerson: z.number().optional(),
      participants: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      const updateData: any = { ...data };
      if (data.targetRecallQuantity) updateData.targetRecallQuantity = String(data.targetRecallQuantity);
      if (data.targetRecallRate) updateData.targetRecallRate = String(data.targetRecallRate);
      await recallDb.updateRecallSimulation(id, updateData);
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await recallDb.deleteRecallSimulation(input.id);
      return { success: true };
    }),

  start: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await recallDb.startRecallSimulation(input.id);
      return { success: true };
    }),

  complete: protectedProcedure
    .input(z.object({
      id: z.number(),
      actualRecalledQuantity: z.number(),
      actualRecallRate: z.number(),
      traceabilityScore: z.number().min(0).max(100),
      responseTimeScore: z.number().min(0).max(100),
      recallRateScore: z.number().min(0).max(100),
      overallScore: z.number().min(0).max(100),
      result: z.enum(["excellent", "good", "fair", "poor", "fail"]),
      findings: z.string().optional(),
      improvements: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await recallDb.completeRecallSimulation(id, {
        ...data,
        actualRecalledQuantity: String(data.actualRecalledQuantity),
        actualRecallRate: String(data.actualRecallRate),
      });
      return { success: true };
    }),

  // ============================================================================
  // 유통 경로 추적
  // ============================================================================

  addDistribution: protectedProcedure
    .input(z.object({
      simulationId: z.number(),
      customerId: z.number(),
      customerName: z.string(),
      customerType: z.enum(["wholesaler", "retailer", "restaurant", "institution", "other"]),
      shipmentId: z.number().optional(),
      shipmentDate: z.string(),
      shippedQuantity: z.number(),
      unit: z.string(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const id = await recallDb.addDistributionTracking({
        ...input,
        shippedQuantity: String(input.shippedQuantity),
        tenantId: ctx.user.tenantId,
      });
      return { id };
    }),

  getDistributions: protectedProcedure
    .input(z.object({ simulationId: z.number() }))
    .query(async ({ input }) => {
      return await recallDb.getDistributionTracking(input.simulationId);
    }),

  updateDistributionStatus: protectedProcedure
    .input(z.object({
      id: z.number(),
      recallStatus: z.enum(["pending", "notified", "in_progress", "completed", "failed"]),
      recalledQuantity: z.number().optional(),
      recallDate: z.string().optional(),
      recallRate: z.number().optional(),
      notificationDate: z.string().optional(),
      notificationMethod: z.enum(["phone", "email", "fax", "visit", "other"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      const updateData: any = { ...data };
      if (data.recalledQuantity) updateData.recalledQuantity = String(data.recalledQuantity);
      if (data.recallRate) updateData.recallRate = String(data.recallRate);
      await recallDb.updateDistributionRecallStatus(id, updateData);
      return { success: true };
    }),

  deleteDistribution: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await recallDb.deleteDistributionTracking(input.id);
      return { success: true };
    }),

  // ============================================================================
  // 체크리스트 관리
  // ============================================================================

  getChecklist: protectedProcedure
    .input(z.object({ simulationId: z.number() }))
    .query(async ({ input }) => {
      return await recallDb.getChecklist(input.simulationId);
    }),

  addChecklistItem: protectedProcedure
    .input(z.object({
      simulationId: z.number(),
      category: z.enum(["preparation", "identification", "notification", "retrieval", "disposal", "documentation", "evaluation"]),
      checkItem: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const id = await recallDb.addChecklistItem({
        ...input,
        tenantId: ctx.user.tenantId,
      });
      return { id };
    }),

  completeChecklistItem: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await recallDb.completeChecklistItem(input.id, ctx.user.id);
      return { success: true };
    }),

  // ============================================================================
  // 첨부 파일 관리
  // ============================================================================

  addAttachment: protectedProcedure
    .input(z.object({
      simulationId: z.number(),
      fileName: z.string(),
      filePath: z.string(),
      fileSize: z.number().optional(),
      mimeType: z.string().optional(),
      attachmentType: z.enum(["photo", "document", "report", "notification", "other"]),
      description: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const id = await recallDb.addAttachment({
        ...input,
        uploadedBy: ctx.user.id,
        tenantId: ctx.user.tenantId,
      });
      return { id };
    }),

  getAttachments: protectedProcedure
    .input(z.object({ simulationId: z.number() }))
    .query(async ({ input }) => {
      return await recallDb.getAttachments(input.simulationId);
    }),

  deleteAttachment: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await recallDb.deleteAttachment(input.id);
      return { success: true };
    }),

  // ============================================================================
  // 통계 및 대시보드
  // ============================================================================

  getDashboard: protectedProcedure
    .input(z.object({ siteId: z.number() }))
    .query(async ({ input }) => {
      return await recallDb.getRecallDashboard(input.siteId);
    }),
});

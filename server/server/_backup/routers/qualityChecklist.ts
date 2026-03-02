import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import {
  checklistTemplates,
  checklistTemplateItems,
  checklistInstances,
  checklistInstanceItems,
  checklistInstanceItemHistory,
} from "../../drizzle/schema/checklist";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import { isTemplateCategoryInMapCategory } from "../../shared/categoryMapping";

/**
 * 품질 체크리스트 라우터
 * Phase 1: 템플릿 관리
 * Phase 2: 체크리스트 인스턴스 관리
 * Phase 3: 승인 플로우
 * Phase 77-79: 이력 추적, 실시간 협업, 모바일 최적화
 */
export const qualityChecklistRouter = router({
  // ==================== 템플릿 관리 ====================
  
  /**
   * 템플릿 목록 조회
   */
  listTemplates: protectedProcedure
    .input(
      z.object({
        category: z.enum(["CCP", "SANITATION", "QUALITY", "SAFETY", "TRAINING", "MAINTENANCE"]).optional(),
        isActive: z.boolean().optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const conditions = [];
      
      if (input?.category) {
        conditions.push(eq(checklistTemplates.category, input.category));
      }
      
      if (input?.isActive !== undefined) {
        conditions.push(eq(checklistTemplates.isActive, input.isActive ? 1 : 0));
      }
      
      const templates = await db
        .select()
        .from(checklistTemplates)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(checklistTemplates.priority), desc(checklistTemplates.createdAt));
      
      return templates;
    }),

  /**
   * 템플릿 상세 조회 (항목 포함)
   */
  getTemplate: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const template = await db
        .select()
        .from(checklistTemplates)
        .where(eq(checklistTemplates.id, input.id))
        .limit(1);
      
      if (template.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "템플릿을 찾을 수 없습니다.",
        });
      }
      
      const items = await db
        .select()
        .from(checklistTemplateItems)
        .where(eq(checklistTemplateItems.templateId, input.id))
        .orderBy(checklistTemplateItems.sortOrder);
      
      return {
        template: template[0],
        items,
      };
    }),

  /**
   * 템플릿 생성
   */
  createTemplate: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1, "템플릿 이름을 입력하세요"),
        description: z.string().optional(),
        category: z.enum(["CCP", "SANITATION", "QUALITY", "SAFETY", "TRAINING", "MAINTENANCE"]),
        ccpType: z.string().optional(),
        priority: z.number().default(0),
        isActive: z.boolean().default(true),
        generationMode: z.enum(["manual", "auto"]).default("manual"),
        frequency: z.enum(["daily", "weekly", "monthly", "batch_create", "batch_complete"]).optional(),
        autoTriggerRules: z.string().optional(),
        items: z.array(
          z.object({
            itemName: z.string(),
            itemType: z.enum(["checkbox", "text", "number", "select", "time", "date", "temperature", "pressure"]),
            description: z.string().optional(),
            sortOrder: z.number(),
          })
        ).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const result = await db.insert(checklistTemplates).values({
        name: input.name,
        description: input.description || null,
        category: input.category,
        ccpType: input.ccpType || null,
        priority: input.priority,
        isActive: input.isActive ? 1 : 0,
        generationMode: input.generationMode,
        frequency: input.frequency || null,
        autoTriggerRules: input.autoTriggerRules ? (typeof input.autoTriggerRules === 'string' ? JSON.parse(input.autoTriggerRules) : input.autoTriggerRules) : null,
        createdBy: ctx.user.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      
      const templateId = Number(result[0].insertId);
      
      if (input.items && input.items.length > 0) {
        await db.insert(checklistTemplateItems).values(
          input.items.map((item) => ({
            templateId,
            itemName: item.itemName,
            itemType: item.itemType,
            description: item.description || null,
            sortOrder: item.sortOrder,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }))
        );
      }
      
      return { id: templateId };
    }),

  /**
   * 템플릿 수정
   */
  updateTemplate: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1, "템플릿 이름을 입력하세요").optional(),
        description: z.string().optional(),
        category: z.enum(["CCP", "SANITATION", "QUALITY", "SAFETY", "TRAINING", "MAINTENANCE"]).optional(),
        ccpType: z.string().optional(),
        priority: z.number().optional(),
        isActive: z.boolean().optional(),
        generationMode: z.enum(["manual", "auto"]).optional(),
        frequency: z.enum(["daily", "weekly", "monthly", "batch_create", "batch_complete"]).optional(),
        autoTriggerRules: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const updateData: any = {
        updatedAt: new Date().toISOString(),
      };
      
      if (input.name !== undefined) updateData.name = input.name;
      if (input.description !== undefined) updateData.description = input.description || null;
      if (input.category !== undefined) updateData.category = input.category;
      if (input.ccpType !== undefined) updateData.ccpType = input.ccpType || null;
      if (input.priority !== undefined) updateData.priority = input.priority;
      if (input.isActive !== undefined) updateData.isActive = input.isActive ? 1 : 0;
      if (input.generationMode !== undefined) updateData.generationMode = input.generationMode;
      if (input.frequency !== undefined) updateData.frequency = input.frequency || null;
      if (input.autoTriggerRules !== undefined) {
        updateData.autoTriggerRules = input.autoTriggerRules ? (typeof input.autoTriggerRules === 'string' ? JSON.parse(input.autoTriggerRules) : input.autoTriggerRules) : null;
      }
      
      await db
        .update(checklistTemplates)
        .set(updateData)
        .where(eq(checklistTemplates.id, input.id));
      
      return { success: true };
    }),

  /**
   * 템플릿 삭제
   */
  deleteTemplate: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      await db.delete(checklistTemplateItems).where(eq(checklistTemplateItems.templateId, input.id));
      await db.delete(checklistTemplates).where(eq(checklistTemplates.id, input.id));
      
      return { success: true };
    }),

  /**
   * 템플릿 항목 추가
   */
  addTemplateItem: protectedProcedure
    .input(
      z.object({
        templateId: z.number(),
        itemName: z.string(),
        itemType: z.enum(["checkbox", "text", "number", "textarea"]),
        description: z.string().optional(),
        sortOrder: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const result = await db.insert(checklistTemplateItems).values({
        templateId: input.templateId,
        itemName: input.itemName,
        itemType: input.itemType,
        description: input.description || null,
        sortOrder: input.sortOrder,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      
      return { id: Number(result[0].insertId) };
    }),

  /**
   * 템플릿 항목 수정
   */
  updateTemplateItem: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        itemName: z.string(),
        itemType: z.enum(["checkbox", "text", "number", "textarea"]),
        description: z.string().optional(),
        sortOrder: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      await db
        .update(checklistTemplateItems)
        .set({
          itemName: input.itemName,
          itemType: input.itemType,
          description: input.description || null,
          sortOrder: input.sortOrder,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(checklistTemplateItems.id, input.id));
      
      return { success: true };
    }),

  /**
   * 템플릿 항목 삭제
   */
  deleteTemplateItem: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      await db.delete(checklistTemplateItems).where(eq(checklistTemplateItems.id, input.id));
      
      return { success: true };
    }),

  /**
   * 템플릿 복제 (Phase 79)
   */
  cloneTemplate: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      // 원본 템플릿 조회
      const originalTemplate = await db
        .select()
        .from(checklistTemplates)
        .where(eq(checklistTemplates.id, input.id))
        .limit(1);
      
      if (originalTemplate.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "템플릿을 찾을 수 없습니다.",
        });
      }
      
      const template = originalTemplate[0];
      
      // 새 템플릿 생성 (이름에 "복사본" 추가)
      const result = await db.insert(checklistTemplates).values({
        name: `${template.name} (복사본)`,
        description: template.description,
        category: template.category,
        ccpType: template.ccpType,
        priority: template.priority,
        isActive: 0, // 복제된 템플릿은 기본적으로 비활성화
        generationMode: template.generationMode,
        frequency: template.frequency,
        autoTriggerRules: template.autoTriggerRules,
        createdBy: ctx.user.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      
      const newTemplateId = Number(result[0].insertId);
      
      // 원본 템플릿의 항목 복제
      const originalItems = await db
        .select()
        .from(checklistTemplateItems)
        .where(eq(checklistTemplateItems.templateId, input.id))
        .orderBy(checklistTemplateItems.sortOrder);
      
      if (originalItems.length > 0) {
        await db.insert(checklistTemplateItems).values(
          originalItems.map((item) => ({
            templateId: newTemplateId,
            itemName: item.itemName,
            itemType: item.itemType,
            description: item.description,
            sortOrder: item.sortOrder,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }))
        );
      }
      
      return { id: newTemplateId };
    }),

  // ==================== 체크리스트 인스턴스 관리 ====================

  /**
   * 체크리스트 인스턴스 생성
   */
  createInstance: protectedProcedure
    .input(
      z.object({
        templateId: z.number(),
        targetDate: z.string().optional(),
        assignedTo: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const template = await db
        .select()
        .from(checklistTemplates)
        .where(eq(checklistTemplates.id, input.templateId))
        .limit(1);
      
      if (template.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "템플릿을 찾을 수 없습니다.",
        });
      }
      
      const result = await db.insert(checklistInstances).values({
        templateId: input.templateId,
        targetDate: input.targetDate || new Date().toISOString(),
        status: "pending",
        assignedTo: input.assignedTo || null,
        createdBy: ctx.user.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      
      const instanceId = Number(result[0].insertId);
      
      const templateItems = await db
        .select()
        .from(checklistTemplateItems)
        .where(eq(checklistTemplateItems.templateId, input.templateId))
        .orderBy(checklistTemplateItems.sortOrder);
      
      if (templateItems.length > 0) {
        await db.insert(checklistInstanceItems).values(
          templateItems.map((item) => ({
            instanceId,
            templateItemId: item.id,
            itemName: item.itemName,
            itemType: item.itemType,
            description: item.description,
            sortOrder: item.sortOrder,
            value: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }))
        );
      }
      
      return { id: instanceId };
    }),

  /**
   * 체크리스트 인스턴스 목록 조회
   */
  listInstances: protectedProcedure
    .input(
      z.object({
        status: z.enum(["pending", "in_progress", "completed", "pending_review", "approved", "rejected"]).optional(),
        category: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        assignedTo: z.number().optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const conditions = [];
      
      if (input?.status) {
        conditions.push(eq(checklistInstances.status, input.status));
      }
      
      if (input?.startDate) {
        conditions.push(gte(checklistInstances.targetDate, input.startDate));
      }
      
      if (input?.endDate) {
        conditions.push(lte(checklistInstances.targetDate, input.endDate));
      }
      
      if (input?.assignedTo) {
        conditions.push(eq(checklistInstances.assignedTo, input.assignedTo));
      }
      
      let instances = await db
        .select({
          id: checklistInstances.id,
          templateId: checklistInstances.templateId,
          targetDate: checklistInstances.targetDate,
          status: checklistInstances.status,
          assignedTo: checklistInstances.assignedTo,
          reviewerId: checklistInstances.reviewerId,
          reviewedAt: checklistInstances.reviewedAt,
          createdBy: checklistInstances.createdBy,
          createdAt: checklistInstances.createdAt,
          updatedAt: checklistInstances.updatedAt,
          completedAt: checklistInstances.completedAt,
          completedBy: checklistInstances.completedBy,
          templateName: checklistTemplates.name,
          templateCategory: checklistTemplates.category,
          category: checklistTemplates.category,
        })
        .from(checklistInstances)
        .leftJoin(checklistTemplates, eq(checklistInstances.templateId, checklistTemplates.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(checklistInstances.targetDate));
      
      if (input?.category) {
        instances = instances.filter((instance) =>
          isTemplateCategoryInMapCategory(instance.templateCategory || "", input.category! as any)
        );
      }
      
      return instances;
    }),

  /**
   * 체크리스트 인스턴스 상세 조회 (실시간 협업 지원 - Phase 79)
   */
  getInstance: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const instance = await db
        .select()
        .from(checklistInstances)
        .where(eq(checklistInstances.id, input.id))
        .limit(1);
      
      if (instance.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "체크리스트를 찾을 수 없습니다.",
        });
      }
      
      const items = await db
        .select()
        .from(checklistInstanceItems)
        .where(eq(checklistInstanceItems.instanceId, input.id))
        .orderBy(checklistInstanceItems.sortOrder);
      
      // 마지막 수정 시간 계산 (실시간 협업 충돌 방지용)
      const lastModifiedAt = items.reduce((latest, item) => {
        const itemUpdatedAt = item.updatedAt ? new Date(item.updatedAt).getTime() : 0;
        return Math.max(latest, itemUpdatedAt);
      }, new Date(instance[0].updatedAt || instance[0].createdAt).getTime());
      
      return {
        instance: instance[0],
        items,
        lastModifiedAt, // 클라이언트에서 충돌 감지에 사용
      };
    }),

  /**
   * 체크리스트 항목 저장 (실시간 협업 충돌 방지 - Phase 79)
   */
  saveInstanceItem: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        value: z.string(),
        lastModifiedAt: z.number().optional(), // 클라이언트가 알고 있는 마지막 수정 시간
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      // 현재 항목 조회
      const currentItem = await db
        .select()
        .from(checklistInstanceItems)
        .where(eq(checklistInstanceItems.id, input.id))
        .limit(1);
      
      if (currentItem.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "체크리스트 항목을 찾을 수 없습니다.",
        });
      }
      
      // 충돌 감지: 클라이언트가 알고 있는 마지막 수정 시간과 서버의 실제 수정 시간 비교
      if (input.lastModifiedAt) {
        const serverUpdatedAt = new Date(currentItem[0].updatedAt || currentItem[0].createdAt).getTime();
        if (serverUpdatedAt > input.lastModifiedAt) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "다른 사용자가 이 항목을 수정했습니다. 페이지를 새로고침하세요.",
          });
        }
      }
      
      const oldValue = currentItem[0].value;
      
      // 항목 업데이트
      await db
        .update(checklistInstanceItems)
        .set({
          value: input.value,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(checklistInstanceItems.id, input.id));
      
      // 이력 기록
      await db.insert(checklistInstanceItemHistory).values({
        instanceItemId: input.id,
        userId: ctx.user.id,
        oldValue: oldValue,
        newValue: input.value,
        changedAt: new Date().toISOString(),
      });
      
      // 인스턴스 상태 업데이트
      const item = currentItem[0];
      await db
        .update(checklistInstances)
        .set({
          status: "in_progress",
          updatedAt: new Date().toISOString(),
        })
        .where(eq(checklistInstances.id, item.instanceId));
      
      return { success: true, updatedAt: new Date().getTime() };
    }),

  /**
   * 체크리스트 완료 처리
   */
  completeInstance: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      await db
        .update(checklistInstances)
        .set({
          status: "completed",
          completedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(checklistInstances.id, input.id));
      
      return { success: true };
    }),

  // ==================== 승인 플로우 ====================

  /**
   * 승인자 지정
   */
  assignReviewer: protectedProcedure
    .input(
      z.object({
        instanceId: z.number(),
        reviewerId: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      await db
        .update(checklistInstances)
        .set({
          reviewerId: input.reviewerId,
          status: "pending_review",
          updatedAt: new Date().toISOString(),
        })
        .where(eq(checklistInstances.id, input.instanceId));
      
      return { success: true };
    }),

  /**
   * 체크리스트 승인
   */
  approveInstance: protectedProcedure
    .input(
      z.object({
        instanceId: z.number(),
        comments: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      await db
        .update(checklistInstances)
        .set({
          status: "approved",
          reviewerId: ctx.user.id,
          reviewedAt: new Date().toISOString(),
          reviewComments: input.comments || null,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(checklistInstances.id, input.instanceId));
      
      return { success: true };
    }),

  /**
   * 체크리스트 반려
   */
  rejectInstance: protectedProcedure
    .input(
      z.object({
        instanceId: z.number(),
        comments: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      await db
        .update(checklistInstances)
        .set({
          status: "rejected",
          reviewerId: ctx.user.id,
          reviewedAt: new Date().toISOString(),
          reviewComments: input.comments,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(checklistInstances.id, input.instanceId));
      
      return { success: true };
    }),

  /**
   * 일괄 승인 (Phase 80)
   */
  batchApprove: protectedProcedure
    .input(
      z.object({
        instanceIds: z.array(z.number()),
        comments: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      if (input.instanceIds.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "선택된 항목이 없습니다." });
      }
      
      // 일괄 업데이트
      for (const instanceId of input.instanceIds) {
        await db
          .update(checklistInstances)
          .set({
            status: "approved",
            reviewerId: ctx.user.id,
            reviewedAt: new Date().toISOString(),
            reviewComments: input.comments || null,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(checklistInstances.id, instanceId));
      }
      
      return { success: true, count: input.instanceIds.length };
    }),

  /**
   * 일괄 반려 (Phase 80)
   */
  batchReject: protectedProcedure
    .input(
      z.object({
        instanceIds: z.array(z.number()),
        comments: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      if (input.instanceIds.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "선택된 항목이 없습니다." });
      }
      
      if (!input.comments || input.comments.trim() === "") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "반려 사유를 입력해주세요." });
      }
      
      // 일괄 업데이트
      for (const instanceId of input.instanceIds) {
        await db
          .update(checklistInstances)
          .set({
            status: "rejected",
            reviewerId: ctx.user.id,
            reviewedAt: new Date().toISOString(),
            reviewComments: input.comments,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(checklistInstances.id, instanceId));
      }
      
      return { success: true, count: input.instanceIds.length };
    }),

  /**
   * 승인 대기 목록 조회
   */
  getPendingApprovals: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    
    const instances = await db
      .select({
        id: checklistInstances.id,
        templateId: checklistInstances.templateId,
        targetDate: checklistInstances.targetDate,
        status: checklistInstances.status,
        assignedTo: checklistInstances.assignedTo,
        reviewerId: checklistInstances.reviewerId,
        createdBy: checklistInstances.createdBy,
        createdAt: checklistInstances.createdAt,
        updatedAt: checklistInstances.updatedAt,
        completedAt: checklistInstances.completedAt,
        completedBy: checklistInstances.completedBy,
        templateName: checklistTemplates.name,
        templateCategory: checklistTemplates.category,
      })
      .from(checklistInstances)
      .leftJoin(checklistTemplates, eq(checklistInstances.templateId, checklistTemplates.id))
      .where(eq(checklistInstances.status, "pending_review"))
      .orderBy(desc(checklistInstances.targetDate));
    
    return instances;
  }),

  // ==================== 통계 ====================

  /**
   * 체크리스트 통계 조회
   */
  getStatistics: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    
    const inProgressCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(checklistInstances)
      .where(eq(checklistInstances.status, "in_progress"));
    
    const completedCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(checklistInstances)
      .where(eq(checklistInstances.status, "completed"));
    
    const pendingApprovalCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(checklistInstances)
      .where(eq(checklistInstances.status, "pending_review"));
    
    return {
      inProgress: Number(inProgressCount[0]?.count || 0),
      completed: Number(completedCount[0]?.count || 0),
      pendingApproval: Number(pendingApprovalCount[0]?.count || 0),
    };
  }),

  // ==================== 이력 추적 (Phase 77) ====================

  /**
   * 체크리스트 항목 이력 조회
   */
  getItemHistory: protectedProcedure
    .input(z.object({ instanceItemId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const history = await db
        .select({
          id: checklistInstanceItemHistory.id,
          instanceItemId: checklistInstanceItemHistory.instanceItemId,
          userId: checklistInstanceItemHistory.userId,
          oldValue: checklistInstanceItemHistory.oldValue,
          newValue: checklistInstanceItemHistory.newValue,
          changedAt: checklistInstanceItemHistory.changedAt,
          changeReason: checklistInstanceItemHistory.changeReason,
          ipAddress: checklistInstanceItemHistory.ipAddress,
          userName: sql<string>`(SELECT name FROM users WHERE id = ${checklistInstanceItemHistory.userId})`,
        })
        .from(checklistInstanceItemHistory)
        .where(eq(checklistInstanceItemHistory.instanceItemId, input.instanceItemId))
        .orderBy(desc(checklistInstanceItemHistory.changedAt));
      
      return history;
    }),

  /**
   * 체크리스트 인스턴스 전체 이력 조회
   */
  getInstanceHistory: protectedProcedure
    .input(z.object({ instanceId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const history = await db
        .select({
          id: checklistInstanceItemHistory.id,
          instanceItemId: checklistInstanceItemHistory.instanceItemId,
          itemName: checklistInstanceItems.itemName,
          userId: checklistInstanceItemHistory.userId,
          userName: sql<string>`(SELECT name FROM users WHERE id = ${checklistInstanceItemHistory.userId})`,
          oldValue: checklistInstanceItemHistory.oldValue,
          newValue: checklistInstanceItemHistory.newValue,
          changedAt: checklistInstanceItemHistory.changedAt,
          changeReason: checklistInstanceItemHistory.changeReason,
        })
        .from(checklistInstanceItemHistory)
        .leftJoin(
          checklistInstanceItems,
          eq(checklistInstanceItemHistory.instanceItemId, checklistInstanceItems.id)
        )
        .where(eq(checklistInstanceItems.instanceId, input.instanceId))
        .orderBy(desc(checklistInstanceItemHistory.changedAt));
      
      return history;
    }),

  // ==================== 템플릿 버전 관리 ====================
  
  /**
   * 템플릿 수정 시 자동 버전 생성
   * 템플릿 업데이트 시 호출하여 이전 버전 스냅샷 저장
   */
  createTemplateVersion: protectedProcedure
    .input(
      z.object({
        templateId: z.number(),
        version: z.string().optional(), // 미제공 시 자동 생성 (예: 1.0.0 → 1.0.1)
        changeDescription: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // 템플릿 및 항목 조회
      const template = await db
        .select()
        .from(checklistTemplates)
        .where(eq(checklistTemplates.id, input.templateId))
        .limit(1);

      if (template.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "템플릿을 찾을 수 없습니다." });
      }

      const items = await db
        .select()
        .from(checklistTemplateItems)
        .where(eq(checklistTemplateItems.templateId, input.templateId))
        .orderBy(checklistTemplateItems.sortOrder);

      // 버전 번호 생성
      let version = input.version;
      if (!version) {
        // 최신 버전 조회
        const { checklistTemplateVersions } = await import("../../drizzle/schema/checklistTemplateVersion");
        const latestVersion = await db
          .select()
          .from(checklistTemplateVersions)
          .where(eq(checklistTemplateVersions.templateId, input.templateId))
          .orderBy(desc(checklistTemplateVersions.createdAt))
          .limit(1);

        if (latestVersion.length === 0) {
          version = "1.0.0";
        } else {
          // 버전 번호 증가 (예: 1.0.0 → 1.0.1)
          const [major, minor, patch] = latestVersion[0].version.split(".").map(Number);
          version = `${major}.${minor}.${patch + 1}`;
        }
      }

      // 템플릿 스냅샷 생성
      const templateSnapshot = {
        template: template[0],
        items,
      };

      // 버전 저장
      const { checklistTemplateVersions } = await import("../../drizzle/schema/checklistTemplateVersion");
      const [newVersion] = await db.insert(checklistTemplateVersions).values({
        templateId: input.templateId,
        version,
        changeDescription: input.changeDescription || "템플릿 수정",
        templateSnapshot: templateSnapshot as any,
        createdBy: ctx.user.id,
      });

      return {
        id: Number(newVersion.insertId),
        version,
        message: "템플릿 버전이 생성되었습니다.",
      };
    }),

  /**
   * 템플릿 버전 이력 조회
   */
  getTemplateVersions: protectedProcedure
    .input(z.object({ templateId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const { checklistTemplateVersions } = await import("../../drizzle/schema/checklistTemplateVersion");
      const versions = await db
        .select()
        .from(checklistTemplateVersions)
        .where(eq(checklistTemplateVersions.templateId, input.templateId))
        .orderBy(desc(checklistTemplateVersions.createdAt));

      return versions;
    }),

  /**
   * 특정 버전으로 롤백
   * 버전의 스냅샷을 현재 템플릿에 복원
   */
  rollbackToVersion: protectedProcedure
    .input(z.object({ versionId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // 버전 조회
      const { checklistTemplateVersions } = await import("../../drizzle/schema/checklistTemplateVersion");
      const version = await db
        .select()
        .from(checklistTemplateVersions)
        .where(eq(checklistTemplateVersions.id, input.versionId))
        .limit(1);

      if (version.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "버전을 찾을 수 없습니다." });
      }

      const snapshot = version[0].templateSnapshot as any;
      const templateId = version[0].templateId;

      // 현재 버전 백업 (롤백 전 자동 버전 생성)
      const currentTemplate = await db
        .select()
        .from(checklistTemplates)
        .where(eq(checklistTemplates.id, templateId))
        .limit(1);

      if (currentTemplate.length > 0) {
        const currentItems = await db
          .select()
          .from(checklistTemplateItems)
          .where(eq(checklistTemplateItems.templateId, templateId));

        const currentSnapshot = {
          template: currentTemplate[0],
          items: currentItems,
        };

        // 롤백 전 현재 상태 백업
        await db.insert(checklistTemplateVersions).values({
          templateId,
          version: `${version[0].version}-rollback-backup`,
          changeDescription: `롤백 전 백업 (버전 ${version[0].version}로 롤백)`,
          templateSnapshot: currentSnapshot as any,
          createdBy: ctx.user.id,
        });
      }

      // 템플릿 복원
      await db
        .update(checklistTemplates)
        .set({
          name: snapshot.template.name,
          description: snapshot.template.description,
          category: snapshot.template.category,
          frequency: snapshot.template.frequency,
          isActive: snapshot.template.isActive,
          priority: snapshot.template.priority,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(checklistTemplates.id, templateId));

      // 기존 항목 삭제
      await db
        .delete(checklistTemplateItems)
        .where(eq(checklistTemplateItems.templateId, templateId));

      // 항목 복원
      if (snapshot.items && snapshot.items.length > 0) {
        await db.insert(checklistTemplateItems).values(
          snapshot.items.map((item: any) => ({
            templateId,
            itemName: item.itemName,
            itemType: item.itemType,
            itemOptions: item.itemOptions,
            isRequired: item.isRequired,
            sortOrder: item.sortOrder,
            criticalLimit: item.criticalLimit,
            correctiveAction: item.correctiveAction,
          }))
        );
      }

      return {
        message: `버전 ${version[0].version}로 롤백되었습니다.`,
      };
    }),

  // ==================== AI 기반 자동 완성 ====================
  
  /**
   * 체크리스트 항목 자동 완성 제안
   * 과거 데이터를 분석하여 항목별 자동 입력 값을 제안합니다.
   */
  getSuggestions: protectedProcedure
    .input(
      z.object({
        templateId: z.number(),
        itemId: z.number(),
        limit: z.number().optional().default(5),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // 템플릿 항목 조회
      const templateItem = await db
        .select()
        .from(checklistTemplateItems)
        .where(eq(checklistTemplateItems.id, input.itemId))
        .limit(1);

      if (templateItem.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "템플릿 항목을 찾을 수 없습니다." });
      }

      const item = templateItem[0];

      // 과거 데이터 조회 (최근 30일, 완료된 체크리스트만)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const historicalData = await db
        .select({
          value: checklistInstanceItems.value,
          completedAt: checklistInstances.completedAt,
        })
        .from(checklistInstanceItems)
        .innerJoin(
          checklistInstances,
          eq(checklistInstanceItems.instanceId, checklistInstances.id)
        )
        .where(
          and(
            eq(checklistInstanceItems.templateItemId, input.itemId),
            eq(checklistInstances.status, "completed"),
            sql`${checklistInstances.completedAt} >= ${thirtyDaysAgo.toISOString().slice(0, 19).replace('T', ' ')}`
          )
        )
        .orderBy(desc(checklistInstances.completedAt))
        .limit(100);

      if (historicalData.length === 0) {
        return {
          suggestions: [],
          message: "과거 데이터가 부족하여 제안할 수 없습니다.",
        };
      }

      // 항목 유형에 따라 제안 생성
      let suggestions: any[] = [];

      if (item.itemType === "select") {
        // 선택형: 가장 많이 선택된 값
        const valueCounts = historicalData.reduce((acc: any, row) => {
          const value = row.value;
          if (value) {
            acc[value] = (acc[value] || 0) + 1;
          }
          return acc;
        }, {});

        suggestions = Object.entries(valueCounts)
          .map(([value, count]) => ({
            value,
            count,
            percentage: Math.round(((count as number) / historicalData.length) * 100),
          }))
          .sort((a, b) => (b.count as number) - (a.count as number))
          .slice(0, input.limit);
      } else if (item.itemType === "number" || item.itemType === "temperature" || item.itemType === "pressure") {
        // 숫자형: 평균, 최소, 최대, 최빈값
        const values = historicalData
          .map((row) => parseFloat(row.value || "0"))
          .filter((v) => !isNaN(v));

        if (values.length > 0) {
          const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
          const min = Math.min(...values);
          const max = Math.max(...values);

          // 최빈값 계산
          const valueCounts = values.reduce((acc: any, v) => {
            acc[v] = (acc[v] || 0) + 1;
            return acc;
          }, {});
          const mode = Object.entries(valueCounts).sort((a: any, b: any) => b[1] - a[1])[0][0];

          suggestions = [
            { type: "평균", value: avg.toFixed(2), description: "최근 30일 평균값" },
            { type: "최빈값", value: mode, description: "가장 많이 입력된 값" },
            { type: "최소", value: min.toFixed(2), description: "최근 30일 최소값" },
            { type: "최대", value: max.toFixed(2), description: "최근 30일 최대값" },
          ];
        }
      } else if (item.itemType === "text" || item.itemType === "textarea") {
        // 텍스트형: 가장 많이 입력된 텍스트
        const valueCounts = historicalData.reduce((acc: any, row) => {
          const value = row.value;
          if (value && value.trim() !== "") {
            acc[value] = (acc[value] || 0) + 1;
          }
          return acc;
        }, {});

        suggestions = Object.entries(valueCounts)
          .map(([value, count]) => ({
            value,
            count,
            percentage: Math.round(((count as number) / historicalData.length) * 100),
          }))
          .sort((a, b) => (b.count as number) - (a.count as number))
          .slice(0, input.limit);
      } else if (item.itemType === "checkbox") {
        // 체크박스: 체크 비율
        const checkedCount = historicalData.filter((row) => row.value === "true" || row.value === "1").length;
        const percentage = Math.round((checkedCount / historicalData.length) * 100);

        suggestions = [
          {
            value: percentage >= 50 ? "true" : "false",
            description: `최근 30일 ${percentage}% 체크됨`,
            percentage,
          },
        ];
      }

      return {
        suggestions,
        totalSamples: historicalData.length,
        message: `최근 30일 ${historicalData.length}건의 데이터를 분석했습니다.`,
      };
    }),

  /**
   * 체크리스트 전체 자동 완성 제안
   * 템플릿의 모든 항목에 대해 자동 완성 제안을 생성합니다.
   */
  getInstanceSuggestions: protectedProcedure
    .input(
      z.object({
        templateId: z.number(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // 템플릿 항목 조회
      const items = await db
        .select()
        .from(checklistTemplateItems)
        .where(eq(checklistTemplateItems.templateId, input.templateId))
        .orderBy(checklistTemplateItems.sortOrder);

      // 각 항목에 대해 제안 생성
      const suggestions: any = {};

      for (const item of items) {
        // 과거 데이터 조회
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const historicalData = await db
          .select({
            value: checklistInstanceItems.value,
          })
          .from(checklistInstanceItems)
          .innerJoin(
            checklistInstances,
            eq(checklistInstanceItems.instanceId, checklistInstances.id)
          )
          .where(
            and(
              eq(checklistInstanceItems.templateItemId, item.id),
              eq(checklistInstances.status, "completed"),
              sql`${checklistInstances.completedAt} >= ${thirtyDaysAgo.toISOString().slice(0, 19).replace('T', ' ')}`
            )
          )
          .orderBy(desc(checklistInstances.completedAt))
          .limit(50);

        if (historicalData.length > 0) {
          // 가장 많이 사용된 값 또는 평균값
          if (item.itemType === "number" || item.itemType === "temperature" || item.itemType === "pressure") {
            const values = historicalData
              .map((row) => parseFloat(row.value || "0"))
              .filter((v) => !isNaN(v));
            if (values.length > 0) {
              const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
              suggestions[item.id] = avg.toFixed(2);
            }
          } else {
            // 최빈값
            const valueCounts = historicalData.reduce((acc: any, row) => {
              const value = row.value;
              if (value) {
                acc[value] = (acc[value] || 0) + 1;
              }
              return acc;
            }, {});

            const mostCommon = Object.entries(valueCounts).sort((a: any, b: any) => b[1] - a[1])[0];
            if (mostCommon) {
              suggestions[item.id] = mostCommon[0];
            }
          }
        }
      }

      return {
        suggestions,
        message: `${Object.keys(suggestions).length}개 항목에 대한 제안이 생성되었습니다.`,
      };
    }),

  /**
   * 카테고리별 최근 작성 체크리스트 조회
   * 각 카테고리별로 최근 작성된 체크리스트 1건씩 반환
   */
  getRecentByCategory: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

    // 모든 카테고리의 최근 인스턴스 조회
    const categories = ["CCP", "SANITATION", "QUALITY", "SAFETY", "TRAINING", "MAINTENANCE"] as const;
    const result: Record<string, any> = {};

    for (const category of categories) {
      const instances = await db
        .select({
          id: checklistInstances.id,
          templateId: checklistInstances.templateId,
          templateName: checklistTemplates.name,
          targetDate: checklistInstances.targetDate,
          status: checklistInstances.status,
          createdAt: checklistInstances.createdAt,
          createdBy: checklistInstances.createdBy,
          completedAt: checklistInstances.completedAt,
          completedBy: checklistInstances.completedBy,
        })
        .from(checklistInstances)
        .leftJoin(checklistTemplates, eq(checklistInstances.templateId, checklistTemplates.id))
        .where(eq(checklistTemplates.category, category))
        .orderBy(desc(checklistInstances.createdAt))
        .limit(1);

      if (instances.length > 0) {
        result[category] = instances[0];
      }
    }

    return result;
  }),
});

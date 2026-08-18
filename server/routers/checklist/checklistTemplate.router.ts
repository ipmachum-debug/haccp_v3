// checklistTemplate 라우터 - routers.ts에서 분리됨
import { adminProcedure, tenantRequiredProcedure, router } from "../../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { lt, or } from "drizzle-orm";
import { requireTenantId } from "../../helpers/tenantGuards";

export const checklistTemplateRouter = router({
    // 템플릿 목록 조회
    list: tenantRequiredProcedure
      .input(z.object({
        category: z.string().optional(),
        ccpType: z.string().optional(),
        isActive: z.boolean().optional()
      }))
      .query(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        const { getChecklistTemplates } = await import("../../db");
        return await getChecklistTemplates({ ...input, tenantId: tenantId ?? undefined });
      }),
    
    // 템플릿 상세 조회 (항목 포함)
    getById: tenantRequiredProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        const { getChecklistTemplateById } = await import("../../db");
        const template = await getChecklistTemplateById(input.id, tenantId);
        if (!template) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "템플릿을 찾을 수 없습니다."
          });
        }
        return template;
      }),
    
    // 템플릿 생성 (관리자만)
    create: adminProcedure
      .input(z.object({
        name: z.string().min(1, "템플릿 이름은 필수입니다"),
        description: z.string().optional(),
        category: z.enum(["CCP", "SANITATION", "QUALITY", "SAFETY", "TRAINING", "MAINTENANCE"]),
        ccpType: z.string().optional(),
        priority: z.number().default(0),
        // ★ 2026-08-18: 자동 생성 주기 — batch_create 이면 배치 생성 파이프라인(STEP 10)이
        //   해당 템플릿으로 체크리스트 인스턴스를 자동 생성한다.
        frequency: z.enum(["daily", "weekly", "monthly", "batch_create", "batch_complete"]).nullish(),
        generationMode: z.enum(["manual", "auto"]).optional(),
        requiresApproval: z.boolean().optional(),
        requiresAttachment: z.boolean().optional(),
        autoTriggerRules: z.any().optional(),
        items: z.array(
          z.object({
            sortOrder: z.number(),
            itemName: z.string().min(1, "항목 텍스트는 필수입니다"),
            itemType: z.enum(["checkbox", "number", "text", "textarea", "select", "time", "date", "temperature", "pressure"]).default("checkbox"),
            required: z.boolean().default(true),
            validationRules: z.any().optional(),
            defaultValue: z.string().optional(),
            helpText: z.string().optional()
          })
        )
      }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = requireTenantId(ctx as any);
        const { createChecklistTemplateWithItems, createAuditLog } = await import("../../db");
        const template = await createChecklistTemplateWithItems({
          ...input,
          tenantId,
          createdBy: ctx.user.id
        });

        // 감사 로그 기록
        await createAuditLog({
          userId: ctx.user.id,
          action: "checklist_template.create",
          entityType: "checklist_template",
          entityId: template?.id,
          userEmail: ctx.user.email,
          userRole: ctx.user.role,
          description: `체크리스트 템플릿 생성: ${input.name}`
        });
        
        return template;
      }),
    
    // 템플릿 수정 (관리자만)
    update: adminProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        category: z.enum(["CCP", "SANITATION", "QUALITY", "SAFETY", "TRAINING", "MAINTENANCE"]).optional(),
        ccpType: z.string().optional(),
        priority: z.number().optional(),
        frequency: z.enum(["daily", "weekly", "monthly", "batch_create", "batch_complete"]).nullish(),
        generationMode: z.enum(["manual", "auto"]).optional(),
        requiresApproval: z.boolean().optional(),
        requiresAttachment: z.boolean().optional(),
        autoTriggerRules: z.any().optional(),
        isActive: z.boolean().optional(),
        items: z.array(
          z.object({
            id: z.number().optional(),
            sortOrder: z.number(),
            itemName: z.string().min(1),
            itemType: z.enum(["checkbox", "number", "text", "textarea", "select", "time", "date", "temperature", "pressure"]),
            required: z.boolean(),
            description: z.string().optional(),
            validationRules: z.any().optional(),
            defaultValue: z.string().optional(),
            helpText: z.string().optional()
          })
        ).optional()
      }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        const { updateChecklistTemplate, createAuditLog } = await import("../../db");
        const { id, items, ...templateData } = input;
        const template = await updateChecklistTemplate(id, templateData, items, tenantId);

        // 감사 로그 기록
        await createAuditLog({
          userId: ctx.user.id,
          action: "checklist_template.update",
          entityType: "checklist_template",
          entityId: id,
          userEmail: ctx.user.email,
          userRole: ctx.user.role,
          description: `체크리스트 템플릿 수정: ${input.name || id}`
        });

        return template;
      }),
    
    // 템플릿 삭제 (비활성화, 관리자만)
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        const { deleteChecklistTemplate, createAuditLog } = await import("../../db");
        const result = await deleteChecklistTemplate(input.id, tenantId);

        // 감사 로그 기록
        await createAuditLog({
          userId: ctx.user.id,
          action: "checklist_template.delete",
          entityType: "checklist_template",
          entityId: input.id,
          userEmail: ctx.user.email,
          userRole: ctx.user.role,
          description: `체크리스트 템플릿 삭제: ${input.id}`
        });

        return result;
      }),
    
    // 템플릿 복제 (관리자만)
    duplicate: adminProcedure
      .input(z.object({
        id: z.number(),
        newName: z.string().min(1)
      }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = requireTenantId(ctx as any);
        const { getChecklistTemplateById, createChecklistTemplateWithItems, createAuditLog } = await import("../../db");
        const template = await getChecklistTemplateById(input.id, tenantId);
        if (!template) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "템플릿을 찾을 수 없습니다."
          });
        }
        
        const newTemplate = await createChecklistTemplateWithItems({
          name: input.newName,
          description: template.description || undefined,
          category: template.category as any,
          ccpType: template.ccpType || undefined,
          priority: template.priority,
          frequency: (template as any).frequency ?? undefined,
          generationMode: (template as any).generationMode ?? undefined,
          requiresApproval: Boolean((template as any).requiresApproval),
          requiresAttachment: Boolean((template as any).requiresAttachment),
          autoTriggerRules: template.autoTriggerRules,
          tenantId,
          createdBy: ctx.user.id,
          items: template.items.map((item: any) => ({
            sortOrder: item.sortOrder,
            itemName: item.itemName,
            itemType: item.itemType as any,
            required: Boolean(item.required),
            validationRules: item.validationRules,
            defaultValue: item.defaultValue || undefined,
            helpText: item.helpText || undefined
          }))
        });

        // 감사 로그 기록
        await createAuditLog({
          userId: ctx.user.id,
          action: "checklist_template.duplicate",
          entityType: "checklist_template",
          entityId: newTemplate?.id,
          userEmail: ctx.user.email,
          userRole: ctx.user.role,
          description: `체크리스트 템플릿 복제: ${input.newName}`
        });
        
        return newTemplate;
      }),

    /**
     * 배치 생성 시 자동 생성될 기본 체크리스트 템플릿 시드 (관리자)
     *
     * 배경: checklist_templates.frequency 를 지정할 수 있는 경로가 없어
     *   배치 파이프라인 STEP 10 (autoCreateChecklistsForBatch) 이 항상 0건을 생성했다.
     *   이 엔드포인트는 표준 양식(위생점검표/공정점검표/작업 전 준비)을 frequency='batch_create'
     *   로 1회 시드한다. 같은 이름의 활성 템플릿이 이미 있으면 건너뛴다 (재실행 안전).
     */
    seedBatchDefaults: adminProcedure
      .mutation(async ({ ctx }) => {
        const tenantId = requireTenantId(ctx as any);
        const { seedBatchCreateChecklistTemplates, createAuditLog } = await import("../../db");
        const result = await seedBatchCreateChecklistTemplates(tenantId, ctx.user.id);

        if (result.created.length > 0) {
          await createAuditLog({
            userId: ctx.user.id,
            action: "checklist_template.seed_batch_defaults",
            entityType: "checklist_template",
            userEmail: ctx.user.email,
            userRole: ctx.user.role,
            description: `배치 자동생성 기본 템플릿 시드: ${result.created.join(", ")}`,
          });
        }

        return result;
      })
});

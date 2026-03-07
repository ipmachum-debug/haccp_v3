// checklist 라우터 - routers.ts에서 분리됨
import { tenantRequiredProcedure, router, workerProcedure } from "../../_core/trpc";
import { z } from "zod";

export const checklistRouter = router({
    // 템플릿 관리
    template: router({
      // 템플릿 목록 조회
      list: tenantRequiredProcedure
        .input(
          z
            .object({
              category: z.string().optional()
            })
            .optional()
        )
        .query(async ({ input, ctx }) => {
          const { getChecklistTemplates } = await import("../../db");
          return await getChecklistTemplates({
            category: input?.category as any,
            tenantId: ctx.tenantId
          });
        }),
      // 템플릿 상세 조회
      getById: tenantRequiredProcedure
        .input(z.object({ id: z.number() }))
        .query(async ({ input, ctx }) => {
          const { getChecklistTemplateById } = await import("../../db");
          return await getChecklistTemplateById(input.id, ctx.tenantId);
        }),
      // 템플릿 생성
      create: workerProcedure
        .input(
          z.object({
            name: z.string(),
            description: z.string().optional(),
            category: z.string(),
            items: z.array(
              z.object({
                itemName: z.string(),
                itemType: z.string(),
                sortOrder: z.number(),
                required: z.boolean()
              })
            )
          })
        )
        .mutation(async ({ input, ctx }) => {
          const { createChecklistTemplate } = await import("../../db");
          return await createChecklistTemplate({
            ...input,
            category: input.category as any
          });
        }),
      // 템플릿 수정
      update: workerProcedure
        .input(
          z.object({
            id: z.number(),
            name: z.string().optional(),
            description: z.string().optional(),
            category: z.string().optional(),
            items: z
              .array(
                z.object({
                  id: z.number().optional(),
                  itemName: z.string(),
                  itemType: z.string(),
                  sortOrder: z.number(),
                  required: z.boolean()
                })
              )
              .optional()
          })
        )
        .mutation(async ({ input, ctx }) => {
          const { updateChecklistTemplate } = await import("../../db");
          const { id, ...data } = input;
          return await updateChecklistTemplate(id, {
            ...data,
            category: data.category as any
          });
        }),
      // 템플릿 삭제
      delete: workerProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
          const { deleteChecklistTemplate } = await import("../../db");
          return await deleteChecklistTemplate(input.id);
        })
    }),
    // 인스턴스 관리
    instance: router({
      // 인스턴스 목록 조회
      list: tenantRequiredProcedure
        .input(
          z
            .object({
              templateId: z.number().optional(),
              status: z.string().optional(),
              startDate: z.string().optional(),
              endDate: z.string().optional()
            })
            .optional()
        )
        .query(async ({ input, ctx }) => {
          const { getChecklistInstancesByBatch } = await import("../../db");
          // 기존 함수는 batchId만 지원하므로 모든 인스턴스 조회는 별도 구현 필요
          // 임시로 빈 배열 반환
          return [];
        }),
      // 인스턴스 상세 조회
      getById: tenantRequiredProcedure
        .input(z.object({ id: z.number() }))
        .query(async ({ input, ctx }) => {
          const { getChecklistInstanceById } = await import("../../db");
          return await getChecklistInstanceById(input.id, ctx.tenantId);
        }),
      // 인스턴스 생성
      create: workerProcedure
        .input(
          z.object({
            templateId: z.number(),
            checkDate: z.string(),
            checkedBy: z.string(),
            notes: z.string().optional(),
            items: z.array(
              z.object({
                itemName: z.string(),
                itemType: z.string(),
                sortOrder: z.number(),
                required: z.boolean(),
                value: z.string().optional(),
                checked: z.boolean()
              })
            )
          })
        )
        .mutation(async ({ input, ctx }) => {
          const { createChecklistInstanceFromTemplate } = await import("../../db");
          return await createChecklistInstanceFromTemplate({
            templateId: input.templateId,
            batchId: undefined,
            ccpRecordId: undefined,
            scheduledDate: input.checkDate,
            createdBy: 0, // 사용자 ID는 추후 ctx.user.id로 대체
          });
        }),
      // 인스턴스 항목 업데이트
      updateItem: workerProcedure
        .input(
          z.object({
            itemId: z.number(),
            value: z.string().optional(),
            checked: z.boolean().optional()
          })
        )
        .mutation(async ({ input, ctx }) => {
          const { updateChecklistInstanceItem } = await import("../../db");
          const { itemId, ...data } = input;
          return await updateChecklistInstanceItem(itemId, data);
        }),
      // 인스턴스 상태 변경
      updateStatus: workerProcedure
        .input(
          z.object({
            id: z.number(),
            status: z.enum(["pending", "in_progress", "completed", "skipped", "cancelled"])
          })
        )
        .mutation(async ({ input, ctx }) => {
          const { completeChecklistInstance } = await import("../../db");
          if (input.status === "completed") {
            return await completeChecklistInstance(input.id, 0); // 사용자 ID는 추후 ctx.user.id로 대체
          }
          return { success: true };
        })
    })
});

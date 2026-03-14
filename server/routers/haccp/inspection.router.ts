// inspection 라우터 - routers.ts에서 분리됨
import { tenantRequiredProcedure, router, workerProcedure } from "../../_core/trpc";
import { z } from "zod";

export const inspectionRouter = router({
    // 검사 통계 대시보드
    getStatistics: tenantRequiredProcedure
      .input(
        z.object({
          type: z.enum(["material", "hygiene", "shipping"]),
          range: z.enum(["week", "month", "quarter"])
        })
      )
      .query(async ({ input, ctx }) => {
        const { getInspectionDashboardStatistics } = await import("../../db");
        return await getInspectionDashboardStatistics(input, ctx.tenantId);
      }),
    
    // 원재료 검사
    material: router({
      // 원재료 검사 기록 생성
      create: workerProcedure
        .input(
          z.object({
            materialId: z.number(),
            materialCode: z.string(),
            materialName: z.string(),
            lotNumber: z.string(),
            inspectionDate: z.string(),
            inspectorName: z.string(),
            supplierName: z.string().optional(),
            notes: z.string().optional(),
            items: z.array(
              z.object({
                itemName: z.string(),
                standard: z.string().optional(),
                result: z.string().optional(),
                passed: z.enum(["pass", "fail", "na"]),
                sortOrder: z.number()
              })
            )
          })
        )
        .mutation(async ({ input, ctx }) => {
          const tenantId = ctx.tenantId;
          const { createMaterialInspectionRecord, addMaterialInspectionItem } = await import("../../db");

          const recordId = await createMaterialInspectionRecord({
            ...input,
            inspectorId: ctx.user.id
          }, tenantId);

          for (const item of input.items) {
            await addMaterialInspectionItem({ recordId, ...item }, tenantId);
          }

          return { success: true, recordId };
        }),

      // 원재료 검사 기록 목록 조회
      list: tenantRequiredProcedure
        .input(
          z
            .object({
              startDate: z.string().optional(),
              endDate: z.string().optional(),
              status: z.string().optional(),
              inspectionResult: z.string().optional()
            })
            .optional()
        )
        .query(async ({ input, ctx }) => {
          const { getMaterialInspectionRecords } = await import("../../db");
          return await getMaterialInspectionRecords({ ...input, tenantId: ctx.tenantId });
        }),

      // 원재료 검사 기록 상세 조회
      getById: tenantRequiredProcedure
        .input(z.object({ id: z.number() }))
        .query(async ({ input, ctx }) => {
          const tenantId = ctx.tenantId;
          const { getMaterialInspectionRecordById } = await import("../../db");
          return await getMaterialInspectionRecordById(input.id, tenantId);
        }),

      // 원재료 검사 기록 상태 변경
      updateStatus: workerProcedure
        .input(
          z.object({
            id: z.number(),
            status: z.enum(["pending", "completed", "rejected"]),
            inspectionResult: z.enum(["pass", "fail", "conditional"]).optional()
          })
        )
        .mutation(async ({ input, ctx }) => {
          const tenantId = ctx.tenantId;
          const { updateMaterialInspectionStatus } = await import("../../db");
          return await updateMaterialInspectionStatus(
            input.id,
            input.status,
            input.inspectionResult,
            tenantId
          );
        }),
      // 원재료 검사 기록 수정
      update: workerProcedure
        .input(
          z.object({
            id: z.number(),
            materialName: z.string().optional(),
            lotNumber: z.string().optional(),
            inspectionDate: z.string().optional(),
            inspector: z.string().optional(),
            supplier: z.string().optional(),
            appearance: z.string().optional(), // 외관
            odor: z.string().optional(), // 냄새
            color: z.string().optional(), // 색상
            temperature: z.number().optional(), // 온도
            result: z.enum(["pass", "fail", "conditional"]).optional(), // 검사 결과
            inspectionResult: z.enum(["pass", "fail"]).optional(),
            status: z.enum(["pending", "completed", "rejected"]).optional(),
            items: z.array(
              z.object({
                id: z.number().optional(),
                itemName: z.string(),
                standard: z.string(),
                result: z.string(),
                passed: z.boolean(),
                sortOrder: z.number()
              })
            ).optional()
          })
        )
        .mutation(async ({ input, ctx }) => {
          const tenantId = ctx.tenantId;
          const { updateMaterialInspectionRecord } = await import("../../db");
          const { id, ...data } = input;
          await updateMaterialInspectionRecord(id, {
            ...data,
            inspectionDate: data.inspectionDate ? new Date(data.inspectionDate) : undefined
          }, tenantId);
          return { success: true, message: "검사 기록이 수정되었습니다." };
        })
    }),

    // 출하 검사
    shipping: router({
      // 출하 검사 기록 생성
      create: workerProcedure
        .input(
          z.object({
            batchId: z.number(),
            batchCode: z.string(),
            productCode: z.string(),
            productName: z.string(),
            inspectionDate: z.string(),
            inspectorName: z.string(),
            quantity: z.string().optional(),
            notes: z.string().optional(),
            items: z.array(
              z.object({
                itemName: z.string(),
                standard: z.string().optional(),
                result: z.string().optional(),
                passed: z.enum(["pass", "fail", "na"]),
                sortOrder: z.number()
              })
            )
          })
        )
        .mutation(async ({ input, ctx }) => {
          const tenantId = ctx.tenantId;
          const { createShippingInspectionRecord, addShippingInspectionItem } = await import("../../db");

          const recordId = await createShippingInspectionRecord({
            ...input,
            inspectorId: ctx.user.id
          }, tenantId);

          for (const item of input.items) {
            await addShippingInspectionItem({ recordId, ...item }, tenantId);
          }

          return { success: true, recordId };
        }),

      // 출하 검사 기록 목록 조회
      list: tenantRequiredProcedure
        .input(
          z
            .object({
              startDate: z.string().optional(),
              endDate: z.string().optional(),
              status: z.string().optional(),
              inspectionResult: z.string().optional()
            })
            .optional()
        )
        .query(async ({ input, ctx }) => {
          const { getShippingInspectionRecords } = await import("../../db");
          return await getShippingInspectionRecords({ ...input, tenantId: ctx.tenantId });
        }),

      // 출하 검사 기록 상세 조회
      getById: tenantRequiredProcedure
        .input(z.object({ id: z.number() }))
        .query(async ({ input, ctx }) => {
          const { getShippingInspectionRecordById } = await import("../../db");
          return await getShippingInspectionRecordById(input.id);
        }),

      // 출하 검사 기록 상태 변경
      updateStatus: workerProcedure
        .input(
          z.object({
            id: z.number(),
            status: z.enum(["pending", "completed", "rejected"]),
            inspectionResult: z.enum(["pass", "fail", "hold"]).optional()
          })
        )
        .mutation(async ({ input, ctx }) => {
          const { updateShippingInspectionStatus } = await import("../../db");
          return await updateShippingInspectionStatus(
            input.id,
            input.status,
            input.inspectionResult
          );
        }),
      // 출하 검사 기록 수정
      update: workerProcedure
        .input(
          z.object({
            id: z.number(),
            productName: z.string().optional(),
            batchCode: z.string().optional(),
            quantity: z.number().optional(),
            inspectionDate: z.string().optional(),
            inspector: z.string().optional(),
            inspectionResult: z.enum(["pass", "fail"]).optional(),
            status: z.enum(["pending", "completed", "rejected"]).optional(),
            items: z.array(
              z.object({
                id: z.number().optional(),
                itemName: z.string(),
                standard: z.string(),
                result: z.string(),
                passed: z.boolean(),
                sortOrder: z.number()
              })
            ).optional()
          })
        )
        .mutation(async ({ input, ctx }) => {
          const { updateShippingInspectionRecord } = await import("../../db");
          const { id, ...data } = input;
          await updateShippingInspectionRecord(id, {
            ...data,
            inspectionDate: data.inspectionDate ? new Date(data.inspectionDate) : undefined
          });
          return { success: true, message: "검사 기록이 수정되었습니다." };
        })
    }),

    // 위생 검사
    hygiene: router({
      // 위생 검사 기록 생성
      create: workerProcedure
        .input(
          z.object({
            inspectionDate: z.string(),
            inspectionArea: z.string(),
            inspectorName: z.string(),
            notes: z.string().optional(),
            items: z.array(
              z.object({
                itemName: z.string(),
                standard: z.string().optional(),
                result: z.string().optional(),
                passed: z.enum(["pass", "fail", "na"]),
                sortOrder: z.number()
              })
            )
          })
        )
        .mutation(async ({ input, ctx }) => {
          const { createHygieneInspectionRecord, addHygieneInspectionItem } = await import("../../db");
          
          const recordId = await createHygieneInspectionRecord({
            ...input,
            inspectorId: ctx.user.id
          });

          for (const item of input.items) {
            await addHygieneInspectionItem({ recordId, ...item });
          }

          return { success: true, recordId };
        }),

      // 위생 검사 기록 목록 조회
      list: tenantRequiredProcedure
        .input(
          z
            .object({
              startDate: z.string().optional(),
              endDate: z.string().optional(),
              status: z.string().optional(),
              result: z.string().optional()
            })
            .optional()
        )
        .query(async ({ input, ctx }) => {
          const { getHygieneInspectionRecords } = await import("../../db");
          return await getHygieneInspectionRecords({ ...input, tenantId: ctx.tenantId });
        }),

      // 위생 검사 기록 상세 조회
      getById: tenantRequiredProcedure
        .input(z.object({ id: z.number() }))
        .query(async ({ input, ctx }) => {
          const { getHygieneInspectionRecordById } = await import("../../db");
          return await getHygieneInspectionRecordById(input.id);
        }),

      // 위생 검사 기록 상태 변경
      updateStatus: workerProcedure
        .input(
          z.object({
            id: z.number(),
            status: z.enum(["pending", "completed", "action_required"]),
            result: z.enum(["good", "fair", "poor"]).optional()
          })
        )
        .mutation(async ({ input, ctx }) => {
          const { updateHygieneInspectionStatus } = await import("../../db");
          return await updateHygieneInspectionStatus(
            input.id,
            input.status,
            input.result
          );
        }),
      // 위생 검사 기록 수정
      update: workerProcedure
        .input(
          z.object({
            id: z.number(),
            inspectionArea: z.string().optional(),
            inspectionDate: z.string().optional(),
            inspector: z.string().optional(),
            result: z.enum(["pass", "fail"]).optional(),
            status: z.enum(["pending", "completed", "action_required"]).optional(),
            items: z.array(
              z.object({
                id: z.number().optional(),
                itemName: z.string(),
                standard: z.string(),
                result: z.string(),
                passed: z.boolean(),
                sortOrder: z.number()
              })
            ).optional()
          })
        )
        .mutation(async ({ input, ctx }) => {
          const { updateHygieneInspectionRecord } = await import("../../db");
          const { id, ...data } = input;
          await updateHygieneInspectionRecord(id, {
            ...data,
            inspectionDate: data.inspectionDate ? new Date(data.inspectionDate) : undefined
          });
          return { success: true, message: "검사 기록이 수정되었습니다." };
        })
     })
});

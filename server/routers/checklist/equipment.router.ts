// equipment 라우터 - routers.ts에서 분리됨
// ✅ P0 FIX: 모든 DB 호출에 ctx.tenantId 전달 (tenant 격리)
import { tenantRequiredProcedure, router } from "../../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

export const equipmentRouter = router({
    // 설비 프로필 생성
    create: tenantRequiredProcedure
      .input(z.object({
        code: z.string(),
        name: z.string(),
        type: z.string(),
        ccpType: z.string().optional(),
        defaultTemperature: z.string().optional(),
        edgeTemperature: z.string().optional(),
        centerTemperature: z.string().optional(),
        defaultPressure: z.string().optional(),
        defaultTime: z.number().optional(),
        batchOperationTime: z.number().optional(),
        monitoringInterval: z.number().optional(),
        rowsPerBatch: z.number().optional(),
        status: z.string().optional(),
        notes: z.string().optional()
      }))
      .mutation(async ({ ctx, input }) => {
        const { createEquipment, createAuditLog, getRawConnection } = await import("../../db");
        // 같은 회사에 같은 코드·이름의 설비를 또 만들지 않는다 (2026-10-20 신규 회사 시험 — 앞 양식 값이 남아 중복 등록되던 문제)
        const code = input.code.trim(), name = input.name.trim();
        if (!name) throw new TRPCError({ code: "BAD_REQUEST", message: "설비 이름을 입력하세요." });
        const pool: any = await getRawConnection();
        const [dup]: any = await pool.execute(
          `SELECT code, name FROM equipments WHERE tenant_id = ? AND ((? <> '' AND code = ?) OR name = ?) LIMIT 1`,
          [ctx.tenantId, code, code, name],
        );
        if ((dup as any[]).length) {
          const d = (dup as any[])[0];
          throw new TRPCError({ code: "CONFLICT", message: d.name === name ? `같은 이름의 설비가 이미 있습니다: ${name}` : `같은 코드의 설비가 이미 있습니다: ${code}` });
        }

        const equipmentId = await createEquipment({ ...input, code, name }, ctx.tenantId);
        
        await createAuditLog({
          userId: ctx.user.id,
          action: "equipment.create",
          entityType: "equipment",
          entityId: equipmentId,
          changes: input,
          ipAddress: "",
          description: `설비 프로필 생성: ${input.name}`
        });
        
        return { equipmentId };
      }),
    
    // 설비 프로필 목록 조회
    list: tenantRequiredProcedure
      .input(z.object({
        type: z.string().optional(),
        ccpType: z.string().optional(),
        status: z.string().optional(),
        page: z.number().optional(),
        limit: z.number().optional()
      }))
      .query(async ({ input, ctx }) => {
        const { getAllEquipments } = await import("../../db");
        return await getAllEquipments(input, ctx.tenantId);
      }),
    
    // 설비 프로필 상세 조회
    getById: tenantRequiredProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getEquipmentById } = await import("../../db");
        const equipment = await getEquipmentById(input.id, ctx.tenantId);
        
        if (!equipment) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "설비 프로필을 찾을 수 없습니다."
          });
        }
        
        return equipment;
      }),
    
    // 설비 프로필 수정
    update: tenantRequiredProcedure
      .input(z.object({
        id: z.number(),
        code: z.string().optional(),
        name: z.string().optional(),
        type: z.string().optional(),
        ccpType: z.string().optional(),
        defaultTemperature: z.string().optional(),
        edgeTemperature: z.string().optional(),
        centerTemperature: z.string().optional(),
        defaultPressure: z.string().optional(),
        defaultTime: z.number().optional(),
        batchOperationTime: z.number().optional(),
        feSensitivity: z.string().optional(),
        stsSensitivity: z.string().optional(),
        detectionSpeed: z.string().optional(),
        batchLinkMode: z.string().optional(),
        dailyProductCount: z.number().optional(),
        workStartTime: z.string().optional(),
        workEndTime: z.string().optional(),
        lunchStartTime: z.string().optional(),
        lunchEndTime: z.string().optional(),
        monitoringInterval: z.number().optional(),
        rowsPerBatch: z.number().optional(),
        status: z.string().optional(),
        notes: z.string().optional()
      }))
      .mutation(async ({ ctx, input }) => {
        const { updateEquipment, getEquipmentById, createAuditLog } = await import("../../db");
        
        const oldEquipment = await getEquipmentById(input.id, ctx.tenantId);
        if (!oldEquipment) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "설비 프로필을 찾을 수 없습니다."
          });
        }
        
        const { id, ...updates } = input;
        await updateEquipment(id, updates, ctx.tenantId);
        
        // 변경·적용 이력 (생산 설계, 2026-10-19): 받은 값 전체가 아니라 실제로 바뀐 칸만 전·후로 — 이 회사 기록으로
        const { diffFields } = await import("../../lib/production/designChangeDiff");
        const diff = diffFields(oldEquipment as any, updates as any);
        await createAuditLog({
          userId: ctx.user.id,
          action: "equipment.update",
          entityType: "equipment",
          entityId: id,
          changes: diff ?? {},
          ipAddress: "",
          description: `설비 수정: ${oldEquipment.name}${diff ? ` — ${Object.keys(diff).length}칸` : " (바뀐 값 없음)"}`
        }, ctx.tenantId);
        
        return { success: true };
      }),
    
    // 설비 프로필 삭제
    delete: tenantRequiredProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { deleteEquipment, getEquipmentById, createAuditLog } = await import("../../db");
        
        const equipment = await getEquipmentById(input.id, ctx.tenantId);
        if (!equipment) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "설비 프로필을 찾을 수 없습니다."
          });
        }
        
        await deleteEquipment(input.id, ctx.tenantId);
        
        await createAuditLog({
          userId: ctx.user.id,
          action: "equipment.delete",
          entityType: "equipment",
          entityId: input.id,
          changes: {},
          ipAddress: "",
          description: `설비 프로필 삭제: ${equipment.name}`
        });
        
        return { success: true };
      }),
    
    // CCP 유형별 설비 목록 조회
    getByCcpType: tenantRequiredProcedure
      .input(z.object({ ccpType: z.string() }))
      .query(async ({ input, ctx }) => {
        const { getEquipmentsByCcpType } = await import("../../db");
        return await getEquipmentsByCcpType(input.ccpType, ctx.tenantId);
      })
});

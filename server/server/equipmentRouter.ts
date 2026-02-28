import { router, protectedProcedure } from '../trpc';
import { z } from 'zod';
import { db } from '../db';

const equipmentTypeEnum = z.enum([
  '표충등', 'R-트랩', '냉장고', '냉동고', '원재료실', '기타',
  '증숙기', '교반기', '냉각기', '금속검출기', '오븐', '레토르트', '살균기', '건조기', '포장기'
]);

export const equipmentRouter = router({
  // 설비 목록 조회
  list: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.user.tenantId;

    const equipments = await db.query(
      `SELECT * FROM equipment_master 
       WHERE tenant_id = ? AND is_active = TRUE 
       ORDER BY display_order ASC, id ASC`,
      [tenantId]
    );

    return equipments;
  }),

  // 설비 유형별 조회
  listByType: protectedProcedure
    .input(
      z.object({
        equipment_type: equipmentTypeEnum,
      })
    )
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.user.tenantId;

      const equipments = await db.query(
        `SELECT * FROM equipment_master 
         WHERE tenant_id = ? AND equipment_type = ? AND is_active = TRUE 
         ORDER BY display_order ASC, id ASC`,
        [tenantId, input.equipment_type]
      );

      return equipments;
    }),

  // 설비 생성
  create: protectedProcedure
    .input(
      z.object({
        equipment_type: equipmentTypeEnum,
        equipment_name: z.string().min(1),
        code: z.string().optional(),
        location: z.string().optional().default(''),
        zone: z.string().optional(),
        temperature_range: z.string().optional(),
        ccp_type: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.user.tenantId;
      const userId = ctx.user.id;

      const result = await db.query(
        `INSERT INTO equipment_master 
         (tenant_id, equipment_type, equipment_name, code, location, zone, temperature_range, ccp_type, created_by, updated_by) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tenantId,
          input.equipment_type,
          input.equipment_name,
          input.code || null,
          input.location || '',
          input.zone || null,
          input.temperature_range || null,
          input.ccp_type || null,
          userId,
          userId,
        ]
      );

      return { id: result.insertId, success: true };
    }),

  // 설비 수정 (기본 정보)
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        equipment_type: equipmentTypeEnum.optional(),
        equipment_name: z.string().min(1).optional(),
        code: z.string().optional(),
        location: z.string().optional(),
        zone: z.string().optional(),
        temperature_range: z.string().optional(),
        ccp_type: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.user.tenantId;
      const userId = ctx.user.id;

      const setClauses: string[] = [];
      const params: any[] = [];

      if (input.equipment_type !== undefined) { setClauses.push('equipment_type = ?'); params.push(input.equipment_type); }
      if (input.equipment_name !== undefined) { setClauses.push('equipment_name = ?'); params.push(input.equipment_name); }
      if (input.code !== undefined) { setClauses.push('code = ?'); params.push(input.code || null); }
      if (input.location !== undefined) { setClauses.push('location = ?'); params.push(input.location); }
      if (input.zone !== undefined) { setClauses.push('zone = ?'); params.push(input.zone || null); }
      if (input.temperature_range !== undefined) { setClauses.push('temperature_range = ?'); params.push(input.temperature_range || null); }
      if (input.ccp_type !== undefined) { setClauses.push('ccp_type = ?'); params.push(input.ccp_type || null); }
      setClauses.push('updated_by = ?'); params.push(userId);

      if (setClauses.length === 1) return { success: true }; // updated_by만 있으면 스킵

      params.push(input.id, tenantId);

      await db.query(
        `UPDATE equipment_master SET ${setClauses.join(', ')} WHERE id = ? AND tenant_id = ?`,
        params
      );

      return { success: true };
    }),

  // 설비 운영 기준값 저장 (설비별 개별 저장)
  updateOperationSettings: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        default_temperature: z.string().optional(),
        edge_temperature: z.string().optional(),
        center_temperature: z.string().optional(),
        default_pressure: z.string().optional(),
        default_time: z.number().optional(),
        batch_operation_time: z.number().optional(),
        monitoring_interval: z.number().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.user.tenantId;
      const userId = ctx.user.id;

      await db.query(
        `UPDATE equipment_master 
         SET default_temperature = ?, edge_temperature = ?, center_temperature = ?, 
             default_pressure = ?, default_time = ?, batch_operation_time = ?, 
             monitoring_interval = ?, updated_by = ?
         WHERE id = ? AND tenant_id = ?`,
        [
          input.default_temperature || null,
          input.edge_temperature || null,
          input.center_temperature || null,
          input.default_pressure || null,
          input.default_time || null,
          input.batch_operation_time || null,
          input.monitoring_interval ?? 10,
          userId,
          input.id,
          tenantId,
        ]
      );

      return { success: true };
    }),

  // 설비 삭제 (소프트 삭제)
  delete: protectedProcedure
    .input(
      z.object({
        id: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.user.tenantId;

      await db.query(
        `UPDATE equipment_master 
         SET is_active = FALSE 
         WHERE id = ? AND tenant_id = ?`,
        [input.id, tenantId]
      );

      return { success: true };
    }),

  // 설비 순서 변경
  updateOrder: protectedProcedure
    .input(
      z.object({
        equipmentIds: z.array(z.number()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.user.tenantId;

      // 각 설비의 display_order를 배열 인덱스로 업데이트
      for (let i = 0; i < input.equipmentIds.length; i++) {
        await db.query(
          `UPDATE equipment_master 
           SET display_order = ? 
           WHERE id = ? AND tenant_id = ?`,
          [i, input.equipmentIds[i], tenantId]
        );
      }

      return { success: true };
    }),

  // CCP 타입별 설비 조회
  listByCcpType: protectedProcedure
    .input(
      z.object({
        ccp_type: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.user.tenantId;

      const equipments = await db.query(
        `SELECT * FROM equipment_master 
         WHERE tenant_id = ? AND ccp_type = ? AND is_active = TRUE 
         ORDER BY display_order ASC, id ASC`,
        [tenantId, input.ccp_type]
      );

      return equipments;
    }),

});

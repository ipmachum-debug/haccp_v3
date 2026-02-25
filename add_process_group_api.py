import re

filepath = '/root/haccp_v3/server/routers/ccpMonitoring.ts'

with open(filepath, 'r') as f:
    content = f.read()

# 1. import에 새 스키마 추가
old_import = 'productCcpSpecs,\n} from "../../drizzle/schema/ccpMonitoring";'
new_import = 'productCcpSpecs,\n  ccpProcessGroups,\n  ccpProcessGroupEquipments,\n} from "../../drizzle/schema/ccpMonitoring";'
if 'ccpProcessGroups' not in content:
    content = content.replace(old_import, new_import)

# 2. equipments import 추가
if 'from "../../drizzle/schema/equipment"' not in content:
    content = content.replace(
        'import { eq, and, gte, lte, desc, sql, like, asc } from "drizzle-orm";',
        'import { eq, and, gte, lte, desc, sql, like, asc } from "drizzle-orm";\nimport { equipments } from "../../drizzle/schema/equipment";'
    )

# 3. 마지막 }); 앞에 새 API 추가
process_group_apis = """
  // ========== 공정 그룹 관리 API ==========
  
  // 공정 그룹 목록 조회
  getProcessGroups: protectedProcedure
    .input(z.object({ ccpType: z.string().optional() }).optional())
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);
      
      const [rows] = await db.execute(
        sql`SELECT g.*, 
          (SELECT JSON_ARRAYAGG(
            JSON_OBJECT('id', ge.id, 'equipmentId', ge.equipment_id, 'sortOrder', ge.sort_order,
              'equipmentName', e.name, 'equipmentCode', e.code, 'equipmentType', e.type, 'equipmentCcpType', e.ccp_type)
          ) FROM ccp_process_group_equipments ge 
          JOIN equipments e ON ge.equipment_id = e.id
          WHERE ge.process_group_id = g.id) as equipmentList
        FROM ccp_process_groups g
        WHERE g.tenant_id = ${tenantId}
        ${input?.ccpType ? sql`AND g.ccp_type = ${input.ccpType}` : sql``}
        ORDER BY g.sort_order, g.name`
      );
      return (rows as any[]).map((r: any) => ({
        ...r,
        equipments: r.equipmentList ? (typeof r.equipmentList === 'string' ? JSON.parse(r.equipmentList) : r.equipmentList) : []
      }));
    }),

  // 공정 그룹 생성
  createProcessGroup: protectedProcedure
    .input(z.object({
      name: z.string(),
      ccpType: z.string(),
      description: z.string().optional(),
      temperatureMin: z.number().optional(),
      temperatureMax: z.number().optional(),
      timeMin: z.number().optional(),
      timeMax: z.number().optional(),
      pressureMin: z.number().optional(),
      pressureMax: z.number().optional(),
      phMin: z.number().optional(),
      phMax: z.number().optional(),
      monitoringMethod: z.string().optional(),
      correctiveAction: z.string().optional(),
      sortOrder: z.number().optional(),
      equipmentIds: z.array(z.number()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);
      
      const [result] = await db.execute(
        sql`INSERT INTO ccp_process_groups (tenant_id, name, ccp_type, description, temperature_min, temperature_max, time_min, time_max, pressure_min, pressure_max, ph_min, ph_max, monitoring_method, corrective_action, sort_order)
        VALUES (${tenantId}, ${input.name}, ${input.ccpType}, ${input.description || null}, ${input.temperatureMin || null}, ${input.temperatureMax || null}, ${input.timeMin || null}, ${input.timeMax || null}, ${input.pressureMin || null}, ${input.pressureMax || null}, ${input.phMin || null}, ${input.phMax || null}, ${input.monitoringMethod || null}, ${input.correctiveAction || null}, ${input.sortOrder || 0})`
      );
      
      const groupId = (result as any).insertId;
      
      if (input.equipmentIds && input.equipmentIds.length > 0) {
        for (let i = 0; i < input.equipmentIds.length; i++) {
          await db.execute(
            sql`INSERT INTO ccp_process_group_equipments (process_group_id, equipment_id, sort_order) VALUES (${groupId}, ${input.equipmentIds[i]}, ${i})`
          );
        }
      }
      
      return { id: groupId, success: true };
    }),

  // 공정 그룹 수정
  updateProcessGroup: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      ccpType: z.string().optional(),
      description: z.string().optional(),
      temperatureMin: z.number().nullable().optional(),
      temperatureMax: z.number().nullable().optional(),
      timeMin: z.number().nullable().optional(),
      timeMax: z.number().nullable().optional(),
      pressureMin: z.number().nullable().optional(),
      pressureMax: z.number().nullable().optional(),
      phMin: z.number().nullable().optional(),
      phMax: z.number().nullable().optional(),
      monitoringMethod: z.string().optional(),
      correctiveAction: z.string().optional(),
      sortOrder: z.number().optional(),
      equipmentIds: z.array(z.number()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);
      
      await db.execute(
        sql`UPDATE ccp_process_groups SET 
          name = COALESCE(${input.name}, name),
          ccp_type = COALESCE(${input.ccpType}, ccp_type),
          description = COALESCE(${input.description}, description),
          temperature_min = ${input.temperatureMin ?? null},
          temperature_max = ${input.temperatureMax ?? null},
          time_min = ${input.timeMin ?? null},
          time_max = ${input.timeMax ?? null},
          pressure_min = ${input.pressureMin ?? null},
          pressure_max = ${input.pressureMax ?? null},
          ph_min = ${input.phMin ?? null},
          ph_max = ${input.phMax ?? null},
          monitoring_method = COALESCE(${input.monitoringMethod}, monitoring_method),
          corrective_action = COALESCE(${input.correctiveAction}, corrective_action),
          sort_order = COALESCE(${input.sortOrder}, sort_order)
        WHERE id = ${input.id} AND tenant_id = ${tenantId}`
      );
      
      if (input.equipmentIds !== undefined) {
        await db.execute(sql`DELETE FROM ccp_process_group_equipments WHERE process_group_id = ${input.id}`);
        for (let i = 0; i < input.equipmentIds.length; i++) {
          await db.execute(
            sql`INSERT INTO ccp_process_group_equipments (process_group_id, equipment_id, sort_order) VALUES (${input.id}, ${input.equipmentIds[i]}, ${i})`
          );
        }
      }
      
      return { success: true };
    }),

  // 공정 그룹 삭제
  deleteProcessGroup: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);
      
      await db.execute(sql`DELETE FROM ccp_process_groups WHERE id = ${input.id} AND tenant_id = ${tenantId}`);
      return { success: true };
    }),
"""

# 마지막 }); 를 새 API + }); 로 교체
content = content.rstrip()
if content.endswith('});'):
    content = content[:-3] + process_group_apis + '\n});\n'

with open(filepath, 'w') as f:
    f.write(content)

print('API added successfully')

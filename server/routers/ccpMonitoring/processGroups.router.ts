import { router, tenantRequiredProcedure } from "../../_core/trpc";
import { z } from "zod";
import { getDb } from "../../db";
import { sql, SQL } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getEffectiveTenantId } from "./_helpers";

export const processGroupsRouter = router({
  // ========== 공정 그룹 관리 API ==========

  // 공정 그룹 목록 조회
  getProcessGroups: tenantRequiredProcedure
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
          WHERE ge.process_group_id = g.id AND ge.tenant_id = ${tenantId}) as equipmentList
        FROM ccp_process_groups g
        WHERE g.tenant_id = ${tenantId}
        ${input?.ccpType ? sql`AND g.ccp_type = ${input.ccpType}` : sql``}
        ORDER BY g.sort_order, g.name`
      );
      return (rows as unknown as unknown as any[]).map((r: any) => ({
        ...r,
        equipments: r.equipmentList ? (typeof r.equipmentList === 'string' ? JSON.parse(r.equipmentList) : r.equipmentList) : []
      }));
    }),

  // 공정 그룹 생성
  createProcessGroup: tenantRequiredProcedure
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
      // 배치 운영 설정 (공정그룹에서 관리)
      equipGroupMode: z.enum(['sequential', 'concurrent', 'grouped']).optional(),
      equipIntervalMin: z.number().optional(),
      equipBatchSize: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);

      const [result] = await db.execute(
        sql`INSERT INTO ccp_process_groups (tenant_id, name, ccp_type, description, temperature_min, temperature_max, time_min, time_max, pressure_min, pressure_max, ph_min, ph_max, monitoring_method, corrective_action, sort_order, equip_group_mode, equip_interval_min, equip_batch_size)
        VALUES (${tenantId}, ${input.name}, ${input.ccpType}, ${input.description || null}, ${input.temperatureMin || null}, ${input.temperatureMax || null}, ${input.timeMin || null}, ${input.timeMax || null}, ${input.pressureMin || null}, ${input.pressureMax || null}, ${input.phMin || null}, ${input.phMax || null}, ${input.monitoringMethod || null}, ${input.correctiveAction || null}, ${input.sortOrder || 0}, ${input.equipGroupMode || 'sequential'}, ${input.equipIntervalMin ?? 10}, ${input.equipBatchSize ?? 1})`
      );

      const groupId = (result as any).insertId;

      if (input.equipmentIds && input.equipmentIds.length > 0) {
        for (let i = 0; i < input.equipmentIds.length; i++) {
          await db.execute(
            sql`INSERT INTO ccp_process_group_equipments (tenant_id, process_group_id, equipment_id, sort_order) VALUES (${tenantId}, ${groupId}, ${input.equipmentIds[i]}, ${i})`
          );
        }
      }

      return { id: groupId, success: true };
    }),

  // 공정 그룹 수정
  updateProcessGroup: tenantRequiredProcedure
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
      // 배치 운영 설정
      equipGroupMode: z.enum(['sequential', 'concurrent', 'grouped']).optional(),
      equipIntervalMin: z.number().nullable().optional(),
      equipBatchSize: z.number().nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);

      // Build dynamic SET clauses using sql.join to avoid COALESCE issues
      const setClauses: SQL[] = [];

      if (input.name !== undefined) setClauses.push(sql`name = ${input.name}`);
      if (input.ccpType !== undefined) setClauses.push(sql`ccp_type = ${input.ccpType}`);
      if (input.description !== undefined) setClauses.push(sql`description = ${input.description}`);

      // Numeric nullable fields - always update
      const tempMin = input.temperatureMin !== undefined ? input.temperatureMin : null;
      const tempMax = input.temperatureMax !== undefined ? input.temperatureMax : null;
      const tMin = input.timeMin !== undefined ? input.timeMin : null;
      const tMax = input.timeMax !== undefined ? input.timeMax : null;
      const pMin = input.pressureMin !== undefined ? input.pressureMin : null;
      const pMax = input.pressureMax !== undefined ? input.pressureMax : null;
      const phMinVal = input.phMin !== undefined ? input.phMin : null;
      const phMaxVal = input.phMax !== undefined ? input.phMax : null;

      setClauses.push(sql`temperature_min = ${tempMin}`);
      setClauses.push(sql`temperature_max = ${tempMax}`);
      setClauses.push(sql`time_min = ${tMin}`);
      setClauses.push(sql`time_max = ${tMax}`);
      setClauses.push(sql`pressure_min = ${pMin}`);
      setClauses.push(sql`pressure_max = ${pMax}`);
      setClauses.push(sql`ph_min = ${phMinVal}`);
      setClauses.push(sql`ph_max = ${phMaxVal}`);

      if (input.monitoringMethod !== undefined) setClauses.push(sql`monitoring_method = ${input.monitoringMethod}`);
      if (input.correctiveAction !== undefined) setClauses.push(sql`corrective_action = ${input.correctiveAction}`);
      if (input.sortOrder !== undefined) setClauses.push(sql`sort_order = ${input.sortOrder}`);
      // 배치 운영 설정 업데이트
      if (input.equipGroupMode !== undefined) setClauses.push(sql`equip_group_mode = ${input.equipGroupMode}`);
      if (input.equipIntervalMin !== undefined) setClauses.push(sql`equip_interval_min = ${input.equipIntervalMin}`);
      if (input.equipBatchSize !== undefined) setClauses.push(sql`equip_batch_size = ${input.equipBatchSize}`);

      if (setClauses.length > 0) {
        const setClause = sql.join(setClauses, sql`, `);
        await db.execute(sql`UPDATE ccp_process_groups SET ${setClause} WHERE id = ${input.id} AND tenant_id = ${tenantId}`);
      }

      if (input.equipmentIds !== undefined) {
        await db.execute(sql`DELETE FROM ccp_process_group_equipments WHERE tenant_id = ${tenantId} AND process_group_id = ${input.id}`);
        for (let i = 0; i < input.equipmentIds.length; i++) {
          await db.execute(
            sql`INSERT INTO ccp_process_group_equipments (tenant_id, process_group_id, equipment_id, sort_order) VALUES (${tenantId}, ${input.id}, ${input.equipmentIds[i]}, ${i})`
          );
        }
      }

      return { success: true };
    }),

  // 공정 그룹 삭제
  deleteProcessGroup: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);

      // 연관 설비/제품 매핑도 함께 삭제
      await db.execute(sql`DELETE FROM ccp_process_group_equipments WHERE tenant_id = ${tenantId} AND process_group_id = ${input.id}`);
      await db.execute(sql`DELETE FROM ccp_process_group_products WHERE tenant_id = ${tenantId} AND process_group_id = ${input.id}`);
      await db.execute(sql`DELETE FROM ccp_process_groups WHERE id = ${input.id} AND tenant_id = ${tenantId}`);
      return { success: true };
    }),

  // ★ 제품 <-> 공정그룹 매핑 API
  getProcessGroupProducts: tenantRequiredProcedure
    .input(z.object({
      processGroupId: z.number().optional(),
      ccpType: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);

      if (input.processGroupId) {
        // 해당 공정그룹의 ccp_type 확인
        const [groupRows] = await db.execute(
          sql`SELECT id, name, ccp_type FROM ccp_process_groups WHERE id = ${input.processGroupId} AND tenant_id = ${tenantId}`
        );
        const group = (groupRows as unknown as any[])[0];

        if (group && group.ccp_type === 'CCP-4P') {
          // ★ CCP-4P(금속검출): 수동 매핑 (ccp_process_group_products 테이블)
          const [rows] = await db.execute(
            sql`SELECT gp.id, gp.process_group_id, gp.product_id, gp.created_at,
                p.product_name,
                'MANUAL' as mapping_source
              FROM ccp_process_group_products gp
              JOIN h_products_v2 p ON gp.product_id = p.id
              WHERE gp.tenant_id = ${tenantId} AND gp.process_group_id = ${input.processGroupId}
              ORDER BY p.product_name`
          );
          return rows as unknown as any[];
        } else {
          // ★ CCP-1B/2B: BOM 원재료의 process_group_id 기반 자동 매핑
          const [rows] = await db.execute(
            sql`SELECT DISTINCT
                r.product_id,
                p.product_name,
                'BOM' as mapping_source
              FROM h_mf_reports r
              JOIN h_mf_report_versions v ON v.mf_report_id = r.id
              JOIN h_mf_ingredients i ON i.mf_report_version_id = v.id
              JOIN h_products_v2 p ON r.product_id = p.id
              WHERE i.process_group_id = ${input.processGroupId}
                AND r.tenant_id = ${tenantId}
              ORDER BY p.product_name`
          );
          return (rows as unknown as any[]).map((r: any) => ({
            ...r,
            process_group_id: input.processGroupId,
          }));
        }
      } else if (input.ccpType) {
        if (input.ccpType === 'CCP-4P') {
          // CCP-4P: 수동 매핑 조회
          const [rows] = await db.execute(
            sql`SELECT gp.id, gp.process_group_id, gp.product_id, gp.created_at,
                p.product_name,
                g.name as group_name, g.ccp_type,
                'MANUAL' as mapping_source
              FROM ccp_process_group_products gp
              JOIN h_products_v2 p ON gp.product_id = p.id
              JOIN ccp_process_groups g ON gp.process_group_id = g.id
              WHERE gp.tenant_id = ${tenantId} AND g.ccp_type = 'CCP-4P'
              ORDER BY g.name, p.product_name`
          );
          return rows as unknown as any[];
        } else {
          // CCP-1B/2B: BOM 기반 자동
          const [rows] = await db.execute(
            sql`SELECT DISTINCT
                r.product_id,
                p.product_name,
                g.id as process_group_id,
                g.name as group_name,
                g.ccp_type,
                'BOM' as mapping_source
              FROM h_mf_reports r
              JOIN h_mf_report_versions v ON v.mf_report_id = r.id
              JOIN h_mf_ingredients i ON i.mf_report_version_id = v.id
              JOIN h_products_v2 p ON r.product_id = p.id
              JOIN ccp_process_groups g ON i.process_group_id = g.id
              WHERE r.tenant_id = ${tenantId}
                AND g.ccp_type = ${input.ccpType}
              ORDER BY g.name, p.product_name`
          );
          return rows as unknown as any[];
        }
      } else {
        // 전체 조회: BOM 기반(CCP-1B/2B) + 수동(CCP-4P)
        const [bomRows] = await db.execute(
          sql`SELECT DISTINCT
              r.product_id,
              p.product_name,
              g.id as process_group_id,
              g.name as group_name,
              g.ccp_type,
              'BOM' as mapping_source
            FROM h_mf_reports r
            JOIN h_mf_report_versions v ON v.mf_report_id = r.id
            JOIN h_mf_ingredients i ON i.mf_report_version_id = v.id
            JOIN h_products_v2 p ON r.product_id = p.id
            JOIN ccp_process_groups g ON i.process_group_id = g.id
            WHERE r.tenant_id = ${tenantId}
            ORDER BY g.ccp_type, g.name, p.product_name`
        );

        const [manualRows] = await db.execute(
          sql`SELECT gp.product_id,
              p.product_name,
              g.id as process_group_id,
              g.name as group_name,
              g.ccp_type,
              'MANUAL' as mapping_source
            FROM ccp_process_group_products gp
            JOIN h_products_v2 p ON gp.product_id = p.id
            JOIN ccp_process_groups g ON gp.process_group_id = g.id
            WHERE gp.tenant_id = ${tenantId} AND g.ccp_type = 'CCP-4P'
            ORDER BY g.name, p.product_name`
        );

        return [...(bomRows as unknown as any[]), ...(manualRows as unknown as any[])];
      }
    }),

  // 수동 제품 매핑 저장 (CCP-4P 금속검출공정용 - SKU 단위 매핑)
  updateProcessGroupProducts: tenantRequiredProcedure
    .input(z.object({
      processGroupId: z.number(),
      productIds: z.array(z.number()),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);

      // 기존 수동 매핑 삭제 (tenant 필터 필수)
      await db.execute(
        sql`DELETE FROM ccp_process_group_products WHERE tenant_id = ${tenantId} AND process_group_id = ${input.processGroupId}`
      );

      // 새 productIds 일괄 insert
      for (const productId of input.productIds) {
        await db.execute(
          sql`INSERT INTO ccp_process_group_products (tenant_id, process_group_id, product_id) VALUES (${tenantId}, ${input.processGroupId}, ${productId})`
        );
      }

      return { success: true, count: input.productIds.length };
    }),

  // ★ 시간 프로파일 CRUD (공정별 운영시간 관리)

  // 시간 프로파일 목록 조회
  getTimeProfiles: tenantRequiredProcedure
    .input(z.object({
      processType: z.string().optional(),
      isActive: z.boolean().default(true),
    }).optional())
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);

      let conditions = `WHERE tp.tenant_id = ${tenantId}`;
      if (input?.isActive !== false) {
        conditions += ` AND tp.is_active = 1`;
      }
      if (input?.processType) {
        // processType은 파라미터로 바인딩
      }

      if (input?.processType) {
        const [rows] = await db.execute(
          sql`SELECT tp.*, g.name as process_group_name, g.ccp_type
            FROM ccp_time_profiles tp
            LEFT JOIN ccp_process_groups g ON tp.ccp_process_group_id = g.id
            WHERE tp.tenant_id = ${tenantId} AND tp.is_active = 1 AND tp.process_type = ${input.processType}
            ORDER BY tp.process_type, tp.profile_name`
        );
        return rows as unknown as any[];
      } else {
        const [rows] = await db.execute(
          sql`SELECT tp.*, g.name as process_group_name, g.ccp_type
            FROM ccp_time_profiles tp
            LEFT JOIN ccp_process_groups g ON tp.ccp_process_group_id = g.id
            WHERE tp.tenant_id = ${tenantId} AND tp.is_active = 1
            ORDER BY tp.process_type, tp.profile_name`
        );
        return rows as unknown as any[];
      }
    }),

  // 시간 프로파일 생성 (가드레일: CL 검증 포함)
  createTimeProfile: tenantRequiredProcedure
    .input(z.object({
      processType: z.string(),  // MIX | STEAM | OVEN
      profileName: z.string(),
      timeMinutes: z.number().min(1),
      ccpProcessGroupId: z.number().optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);

      // ★ 가드레일 2: CL 검증 - timeMinutes >= CL_minTime
      if (input.ccpProcessGroupId) {
        const [clRows] = await db.execute(
          sql`SELECT time_min, time_max FROM ccp_process_groups WHERE id = ${input.ccpProcessGroupId} AND tenant_id = ${tenantId}`
        );
        const cl = (clRows as unknown as any[])[0];
        if (cl) {
          if (cl.time_min && input.timeMinutes < cl.time_min) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `시간(${input.timeMinutes}분)이 CL 최소 시간(${cl.time_min}분)보다 작습니다.`
            });
          }
          if (cl.time_max && input.timeMinutes > cl.time_max) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `시간(${input.timeMinutes}분)이 CL 최대 시간(${cl.time_max}분)을 초과합니다.`
            });
          }
        }
      }

      const [result] = await db.execute(
        sql`INSERT INTO ccp_time_profiles (tenant_id, process_type, profile_name, time_minutes, ccp_process_group_id, description)
          VALUES (${tenantId}, ${input.processType}, ${input.profileName}, ${input.timeMinutes}, ${input.ccpProcessGroupId || null}, ${input.description || null})`
      );
      return { id: (result as any).insertId, success: true };
    }),

  // 시간 프로파일 수정 (가드레일: CL 검증 포함)
  updateTimeProfile: tenantRequiredProcedure
    .input(z.object({
      id: z.number(),
      profileName: z.string().optional(),
      timeMinutes: z.number().min(1).optional(),
      ccpProcessGroupId: z.number().nullable().optional(),
      description: z.string().optional(),
      isActive: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);

      // ★ 가드레일 2: CL 검증
      if (input.timeMinutes !== undefined) {
        // ccpProcessGroupId를 먼저 확인 (현재 값 또는 새 값)
        let groupId = input.ccpProcessGroupId;
        if (groupId === undefined) {
          const [existing] = await db.execute(
            sql`SELECT ccp_process_group_id FROM ccp_time_profiles WHERE id = ${input.id} AND tenant_id = ${tenantId}`
          );
          groupId = (existing as unknown as any[])[0]?.ccp_process_group_id;
        }

        if (groupId) {
          const [clRows] = await db.execute(
            sql`SELECT time_min, time_max FROM ccp_process_groups WHERE id = ${groupId} AND tenant_id = ${tenantId}`
          );
          const cl = (clRows as unknown as any[])[0];
          if (cl) {
            if (cl.time_min && input.timeMinutes < cl.time_min) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: `시간(${input.timeMinutes}분)이 CL 최소 시간(${cl.time_min}분)보다 작습니다.`
              });
            }
            if (cl.time_max && input.timeMinutes > cl.time_max) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: `시간(${input.timeMinutes}분)이 CL 최대 시간(${cl.time_max}분)을 초과합니다.`
              });
            }
          }
        }
      }

      const setClauses: SQL[] = [];
      if (input.profileName !== undefined) setClauses.push(sql`profile_name = ${input.profileName}`);
      if (input.timeMinutes !== undefined) setClauses.push(sql`time_minutes = ${input.timeMinutes}`);
      if (input.ccpProcessGroupId !== undefined) setClauses.push(sql`ccp_process_group_id = ${input.ccpProcessGroupId}`);
      if (input.description !== undefined) setClauses.push(sql`description = ${input.description}`);
      if (input.isActive !== undefined) setClauses.push(sql`is_active = ${input.isActive}`);

      if (setClauses.length > 0) {
        const setClause = sql.join(setClauses, sql`, `);
        await db.execute(sql`UPDATE ccp_time_profiles SET ${setClause} WHERE id = ${input.id} AND tenant_id = ${tenantId}`);
      }
      return { success: true };
    }),

  // 시간 프로파일 삭제 (소프트 삭제)
  deleteTimeProfile: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);

      await db.execute(
        sql`UPDATE ccp_time_profiles SET is_active = 0 WHERE id = ${input.id} AND tenant_id = ${tenantId}`
      );
      return { success: true };
    }),

  // ★ 제품별 시간 프로파일 매핑 CRUD

  // 제품별 시간 프로파일 매핑 조회
  getProductTimeProfileMaps: tenantRequiredProcedure
    .input(z.object({
      productId: z.number().optional(),
      processType: z.string().optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);

      let extraWhere = sql``;
      if (input?.productId) {
        extraWhere = sql` AND m.product_id = ${input.productId}`;
      }
      if (input?.processType) {
        extraWhere = sql`${extraWhere} AND m.process_type = ${input.processType}`;
      }

      const [rows] = await db.execute(
        sql`SELECT m.id, m.product_id, m.process_type, m.time_profile_id, m.created_at, m.updated_at,
            p.product_name, p.process_flags,
            tp.profile_name, tp.time_minutes, tp.ccp_process_group_id
          FROM ccp_product_time_profile_map m
          JOIN h_products_v2 p ON m.product_id = p.id
          JOIN ccp_time_profiles tp ON m.time_profile_id = tp.id
          WHERE m.tenant_id = ${tenantId}${extraWhere}
          ORDER BY p.product_name, m.process_type`
      );
      return rows as unknown as any[];
    }),

  // 제품별 시간 프로파일 매핑 저장 (upsert)
  updateProductTimeProfileMap: tenantRequiredProcedure
    .input(z.object({
      productId: z.number(),
      processType: z.string(),
      timeProfileId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);

      // 기존 매핑 확인
      const [existing] = await db.execute(
        sql`SELECT id FROM ccp_product_time_profile_map
          WHERE tenant_id = ${tenantId} AND product_id = ${input.productId} AND process_type = ${input.processType}`
      );

      if ((existing as unknown as any[]).length > 0) {
        // 업데이트
        await db.execute(
          sql`UPDATE ccp_product_time_profile_map SET time_profile_id = ${input.timeProfileId}
            WHERE tenant_id = ${tenantId} AND product_id = ${input.productId} AND process_type = ${input.processType}`
        );
      } else {
        // 신규 생성
        await db.execute(
          sql`INSERT INTO ccp_product_time_profile_map (tenant_id, product_id, process_type, time_profile_id)
            VALUES (${tenantId}, ${input.productId}, ${input.processType}, ${input.timeProfileId})`
        );
      }

      return { success: true };
    }),

  // 제품별 시간 프로파일 매핑 삭제
  deleteProductTimeProfileMap: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);

      await db.execute(
        sql`DELETE FROM ccp_product_time_profile_map WHERE id = ${input.id} AND tenant_id = ${tenantId}`
      );
      return { success: true };
    }),

  // ★ 가드레일 1: 증숙 포함 제품의 timeProfile 매핑 상태 확인
  getUnmappedSteamProducts: tenantRequiredProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);

      // 증숙 공정이 포함된 제품 중 timeProfile 매핑이 없는 제품
      const [rows] = await db.execute(
        sql`SELECT p.id, p.product_name, p.process_flags
          FROM h_products_v2 p
          WHERE p.tenant_id = ${tenantId}
            AND p.process_flags LIKE '%STEAM%'
            AND p.id NOT IN (
              SELECT product_id FROM ccp_product_time_profile_map
              WHERE tenant_id = ${tenantId} AND process_type = 'STEAM'
            )
          ORDER BY p.product_name`
      );
      return rows as unknown as any[];
    }),

  // ★ 가드레일 1: 배치 확정 전 timeProfile 매핑 검증
  validateBatchTimeProfiles: tenantRequiredProcedure
    .input(z.object({
      productIds: z.array(z.number()),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);

      const results: { productId: number; productName: string; hasSteam: boolean; hasMapping: boolean }[] = [];

      for (const productId of input.productIds) {
        const [productRows] = await db.execute(
          sql`SELECT id, product_name, process_flags FROM h_products_v2 WHERE id = ${productId} AND tenant_id = ${tenantId}`
        );
        const product = (productRows as unknown as any[])[0];
        if (!product) continue;

        const hasSteam = (product.process_flags || '').includes('STEAM');
        let hasMapping = true;

        if (hasSteam) {
          const [mapRows] = await db.execute(
            sql`SELECT id FROM ccp_product_time_profile_map
              WHERE tenant_id = ${tenantId} AND product_id = ${productId} AND process_type = 'STEAM'`
          );
          hasMapping = (mapRows as unknown as any[]).length > 0;
        }

        results.push({
          productId: product.id,
          productName: product.product_name,
          hasSteam,
          hasMapping,
        });
      }

      const allValid = results.every(r => !r.hasSteam || r.hasMapping);
      return { valid: allValid, products: results };
    }),
});

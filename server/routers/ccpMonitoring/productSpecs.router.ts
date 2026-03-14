import { router, tenantRequiredProcedure } from "../../_core/trpc";
import { z } from "zod";
import { getDb } from "../../db";
import { productSpecifications, productCcpSpecs } from "../../../drizzle/schema/ccpMonitoring";
import { eq, and, desc, sql } from "drizzle-orm";
import { getEffectiveTenantId } from "./_helpers";

export const productSpecsRouter = router({
  // 제품 설명서 관리
  createProductSpecification: tenantRequiredProcedure
    .input(z.object({
      productName: z.string(),
      foodType: z.string().optional(),
      appearance: z.string().optional(),
      reportDate: z.date().optional(),
      reportNumber: z.string().optional(),
      authorDate: z.date().optional(),
      ingredients: z.string().optional(), // JSON
      packagingSizes: z.string().optional(), // JSON
      biologicalStandards: z.string().optional(), // JSON
      chemicalStandards: z.string().optional(), // JSON
      physicalStandards: z.string().optional(), // JSON
      storageConditions: z.string().optional(),
      transportConditions: z.string().optional(),
      distributionConditions: z.string().optional(),
      productUsage: z.string().optional(),
      consumptionMethod: z.string().optional(),
      expiryPeriod: z.string().optional(),
      packagingMethod: z.string().optional(),
      packagingMaterial: z.string().optional(),
      labelingInfo: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);
      const [result] = await db.insert(productSpecifications).values({
        ...input,
        tenantId,
        authorId: ctx.user.id,
      });
      return { id: result.insertId };
    }),

  getProductSpecifications: tenantRequiredProcedure
    .input(z.object({
      productName: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);
      let conditions: any[] = [eq(productSpecifications.tenantId, tenantId)];

      if (input.productName) {
        conditions.push(eq(productSpecifications.productName, input.productName));
      }

      return await db.select().from(productSpecifications).where(and(...conditions)).orderBy(desc(productSpecifications.createdAt));
    }),

  updateProductSpecification: tenantRequiredProcedure
    .input(z.object({
      id: z.number(),
      foodType: z.string().optional(),
      appearance: z.string().optional(),
      reportDate: z.date().optional(),
      reportNumber: z.string().optional(),
      ingredients: z.string().optional(),
      packagingSizes: z.string().optional(),
      biologicalStandards: z.string().optional(),
      chemicalStandards: z.string().optional(),
      physicalStandards: z.string().optional(),
      storageConditions: z.string().optional(),
      transportConditions: z.string().optional(),
      distributionConditions: z.string().optional(),
      productUsage: z.string().optional(),
      consumptionMethod: z.string().optional(),
      expiryPeriod: z.string().optional(),
      packagingMethod: z.string().optional(),
      packagingMaterial: z.string().optional(),
      labelingInfo: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);
      const { id, ...data } = input;
      await db.update(productSpecifications).set(data).where(and(eq(productSpecifications.id, id), eq(productSpecifications.tenantId, tenantId)));
      return { success: true };
    }),

  deleteProductSpecification: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);
      await db.delete(productSpecifications).where(and(eq(productSpecifications.id, input.id), eq(productSpecifications.tenantId, tenantId)));
      return { success: true };
    }),

  // stub: process_flags 업데이트 (읽기전용 전환으로 비활성화)
  updateProductProcessFlags: tenantRequiredProcedure
    .input(z.object({ productId: z.number(), processFlags: z.string() }))
    .mutation(async () => ({ success: true, message: '읽기전용 모드로 전환되었습니다. CCP 매핑은 제조보고서에서 관리하세요.' })),

  getProductCcpSpecs: tenantRequiredProcedure
    .input(z.object({
      productId: z.number().optional(),
      ccpType: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);

      let conditions: any[] = [eq(productCcpSpecs.tenantId, tenantId), eq(productCcpSpecs.isActive, 1)];
      if (input.productId) {
        conditions.push(eq(productCcpSpecs.productId, input.productId));
      }
      if (input.ccpType) {
        conditions.push(eq(productCcpSpecs.ccpType, input.ccpType));
      }

      return await db
        .select()
        .from(productCcpSpecs)
        .where(and(...conditions));
    }),

  createProductCcpSpec: tenantRequiredProcedure
    .input(z.object({
      productId: z.number(),
      ccpType: z.string(),
      minTempC: z.string().optional(),
      maxTempC: z.string().optional(),
      minDurationMin: z.number().optional(),
      maxDurationMin: z.number().optional(),
      minPressureBar: z.string().optional(),
      maxPressureBar: z.string().optional(),
      feSensitivity: z.string().optional(),
      susSensitivity: z.string().optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);

      const [result] = await db.insert(productCcpSpecs).values({
        ...input,
        tenantId,
        createdBy: ctx.user.id,
      });
      return { id: result.insertId };
    }),

  updateProductCcpSpec: tenantRequiredProcedure
    .input(z.object({
      id: z.number(),
      minTempC: z.string().optional().nullable(),
      maxTempC: z.string().optional().nullable(),
      minDurationMin: z.number().optional().nullable(),
      maxDurationMin: z.number().optional().nullable(),
      minPressureBar: z.string().optional().nullable(),
      maxPressureBar: z.string().optional().nullable(),
      feSensitivity: z.string().optional().nullable(),
      susSensitivity: z.string().optional().nullable(),
      description: z.string().optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);
      const { id, ...data } = input;

      await db.update(productCcpSpecs)
        .set(data)
        .where(and(eq(productCcpSpecs.id, id), eq(productCcpSpecs.tenantId, tenantId)));
      return { success: true };
    }),

  deleteProductCcpSpec: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);

      await db.update(productCcpSpecs)
        .set({ isActive: 0 })
        .where(and(eq(productCcpSpecs.id, input.id), eq(productCcpSpecs.tenantId, tenantId)));
      return { success: true };
    }),

  // ============================================================
  // 제품-CCP 매핑 조회 (마스터데이터 탭용) - ccp_process_group_products 기반
  // ============================================================
  getProductCcpMappings: tenantRequiredProcedure
    .input(z.object({
      productId: z.number().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);

      // h_products_v2 + ccp_process_group_products → 실제 CCP 공정 그룹 매핑
      const rows = await db.execute(
        sql`SELECT p.id, p.product_name, p.product_code, p.process_flags,
            GROUP_CONCAT(DISTINCT pg.ccp_type ORDER BY pg.ccp_type) as mapped_ccp_types,
            GROUP_CONCAT(DISTINCT CONCAT(pg.name, '(', pg.ccp_type, ')') ORDER BY pg.ccp_type SEPARATOR ', ') as process_group_names,
            COUNT(DISTINCT pgp.process_group_id) as process_group_count,
            (SELECT rh.recipe_name FROM h_recipe_headers rh
             JOIN item_master im ON rh.product_id = im.id AND im.tenant_id = ${tenantId}
             WHERE im.legacy_product_id = p.id AND rh.tenant_id = ${tenantId}
             AND rh.is_active = 1
             ORDER BY rh.version DESC LIMIT 1
            ) as recipe_name
          FROM h_products_v2 p
          LEFT JOIN ccp_process_group_products pgp ON pgp.product_id = p.id AND pgp.tenant_id = ${tenantId}
          LEFT JOIN ccp_process_groups pg ON pgp.process_group_id = pg.id AND pg.tenant_id = ${tenantId} AND pg.status = 'active'
          WHERE p.tenant_id = ${tenantId}
          ${input.productId ? sql`AND p.id = ${input.productId}` : sql``}
          GROUP BY p.id, p.product_name, p.product_code, p.process_flags
          ORDER BY p.product_code`
      );

      return (rows[0] as unknown as unknown as any[]) || [];
    }),

  // 제품별 BOM 원재료 + CCP 공정그룹 상세 조회
  getProductCcpDetail: tenantRequiredProcedure
    .input(z.object({
      productId: z.number(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);

      // 1. 이 제품에 매핑된 CCP 공정 그룹 목록 + 한계기준
      const processGroupRows = await db.execute(
        sql`SELECT pg.id, pg.name, pg.ccp_type, pg.description,
              pg.temperature_min, pg.temperature_max, pg.time_min, pg.time_max,
              pg.pressure_min, pg.pressure_max, pg.ph_min, pg.ph_max,
              pg.monitoring_method, pg.corrective_action
            FROM ccp_process_group_products pgp
            JOIN ccp_process_groups pg ON pgp.process_group_id = pg.id AND pg.tenant_id = ${tenantId}
            WHERE pgp.product_id = ${input.productId} AND pgp.tenant_id = ${tenantId}
              AND pg.status = 'active'
            ORDER BY pg.ccp_type, pg.name`
      );
      const processGroups = (processGroupRows[0] as unknown as unknown as any[]) || [];

      // 2. BOM 원재료 목록 (h_mf_ingredients → 최신 mf_report_version)
      const ingredientRows = await db.execute(
        sql`SELECT mi.id, mi.line_no, mi.material_id, im.item_name as material_name,
              mi.quantity, mi.corrected_quantity, mi.unit, mi.process_group_id,
              pg.name as process_group_name, pg.ccp_type as ingredient_ccp_type,
              mi.material_type
            FROM h_mf_ingredients mi
            JOIN h_mf_report_versions v ON mi.mf_report_version_id = v.id AND v.tenant_id = ${tenantId}
            JOIN h_mf_reports r ON v.mf_report_id = r.id AND r.tenant_id = ${tenantId}
            LEFT JOIN item_master im ON mi.material_id = im.id
            LEFT JOIN ccp_process_groups pg ON mi.process_group_id = pg.id AND pg.tenant_id = ${tenantId}
            WHERE r.product_id = ${input.productId} AND r.tenant_id = ${tenantId}
              AND r.status = 'ACTIVE'
              AND v.id = (
                SELECT MAX(v2.id) FROM h_mf_report_versions v2
                JOIN h_mf_reports r2 ON v2.mf_report_id = r2.id AND r2.tenant_id = ${tenantId}
                WHERE r2.product_id = ${input.productId} AND r2.status = 'ACTIVE'
              )
            ORDER BY mi.line_no`
      );
      const ingredients = (ingredientRows[0] as unknown as unknown as any[]) || [];

      return { processGroups, ingredients };
    }),
});

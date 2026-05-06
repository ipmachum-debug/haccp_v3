/**
 * 중간재 (Intermediate) 관리 라우터 — PR #248
 *
 * 도메인:
 *   - h_intermediates: 중간재 마스터 (예: 통팥앙금, 콩고물, 카스테라가루)
 *   - h_mixed_material_components: 중간재 → 원재료 분해 비율 (1 intermediate : N components)
 *
 * 사용 시나리오:
 *   - BOM (h_mf_ingredients) 가 중간재 ID 참조 → 생산 차감 시 components 분해 차감 (별도 PR)
 *
 * Genspark 가 SQL 로 9개 중간재 + 61개 components 직접 INSERT 한 후, 본 라우터 로 화면 노출.
 *
 * 작성: 2026-05-05
 */
import { z } from "zod";
import { sql, and, eq, desc, asc, like } from "drizzle-orm";
import { router, tenantRequiredProcedure, adminProcedure } from "../../_core/trpc";
import { getDb } from "../../db";
import { hIntermediates, hMixedMaterialComponents } from "../../../drizzle/schema";

export const intermediateRouter = router({
  // ═══════════════════════════════════════════════════════════════
  // 중간재 마스터 (h_intermediates)
  // ═══════════════════════════════════════════════════════════════

  list: tenantRequiredProcedure
    .input(
      z
        .object({
          search: z.string().optional(),
          category: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const tenantId = Number(ctx.tenantId);

      // 중간재 + 컴포넌트 카운트
      const result: any = await db.execute(sql`
        SELECT
          i.*,
          (SELECT COUNT(*) FROM h_mixed_material_components mmc WHERE mmc.intermediate_material_id = i.id) AS component_count,
          m.material_code AS linked_material_code,
          m.material_name AS linked_material_name,
          m.kind AS linked_material_kind
        FROM h_intermediates i
        LEFT JOIN h_materials m ON m.id = i.linked_material_id AND m.tenant_id = i.tenant_id
        WHERE i.tenant_id = ${tenantId}
          ${input?.search ? sql`AND (i.intermediate_name LIKE ${"%" + input.search + "%"} OR i.intermediate_code LIKE ${"%" + input.search + "%"})` : sql``}
          ${input?.category ? sql`AND i.category = ${input.category}` : sql``}
        ORDER BY i.intermediate_code ASC
      `);
      const rows = (Array.isArray((result as any)?.[0]) ? (result as any)[0] : (result as any)) as any[];
      return rows.map((r) => ({
        id: Number(r.id),
        intermediateCode: String(r.intermediate_code),
        intermediateName: String(r.intermediate_name),
        category: r.category ? String(r.category) : null,
        unit: r.unit ? String(r.unit) : null,
        shelfLifeDays: r.shelf_life_days ? Number(r.shelf_life_days) : null,
        description: r.description ? String(r.description) : null,
        componentCount: Number(r.component_count || 0),
        linkedMaterialId: r.linked_material_id ? Number(r.linked_material_id) : null,
        linkedMaterialCode: r.linked_material_code ? String(r.linked_material_code) : null,
        linkedMaterialName: r.linked_material_name ? String(r.linked_material_name) : null,
        linkedMaterialKind: r.linked_material_kind ? String(r.linked_material_kind) : null,
        createdAt: r.created_at,
      }));
    }),

  /**
   * 매칭 가능한 원재료 (kind='MIXED') 목록 — 매칭 다이얼로그용
   */
  matchableMaterials: tenantRequiredProcedure
    .input(
      z
        .object({
          search: z.string().optional(),
          /** 'MIXED' 만 / 'all' (모든 원재료) — 기본 'all' (사용자 유연성) */
          kindFilter: z.enum(["MIXED", "all"]).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const tenantId = Number(ctx.tenantId);
      // ★ 2026-05-05 hotfix: kind='MIXED' 필터 기본 해제 — 사용자가 모든 원재료에서 선택 가능.
      // kind='MIXED' 만 보고 싶으면 kindFilter='MIXED' 명시.
      const result: any = await db.execute(sql`
        SELECT
          m.id, m.material_code, m.material_name, m.unit, m.kind,
          (SELECT i.intermediate_code FROM h_intermediates i WHERE i.linked_material_id = m.id LIMIT 1) AS already_linked_to_code,
          (SELECT i.intermediate_name FROM h_intermediates i WHERE i.linked_material_id = m.id LIMIT 1) AS already_linked_to_name
        FROM h_materials m
        WHERE m.tenant_id = ${tenantId}
          ${input?.kindFilter === "MIXED" ? sql`AND m.kind = 'MIXED'` : sql``}
          ${input?.search ? sql`AND (m.material_name LIKE ${"%" + input.search + "%"} OR m.material_code LIKE ${"%" + input.search + "%"})` : sql``}
        ORDER BY m.kind = 'MIXED' DESC, m.material_code ASC
      `);
      const rows = ((result as any)?.[0] ?? []) as any[];
      return rows.map((r) => ({
        id: Number(r.id),
        materialCode: String(r.material_code),
        materialName: String(r.material_name),
        unit: r.unit ? String(r.unit) : null,
        kind: r.kind ? String(r.kind) : null,
        alreadyLinkedToCode: r.already_linked_to_code ? String(r.already_linked_to_code) : null,
        alreadyLinkedToName: r.already_linked_to_name ? String(r.already_linked_to_name) : null,
      }));
    }),

  /**
   * 중간재에 원재료 매칭 (linked_material_id 설정).
   * 같은 material 이 이미 다른 intermediate 에 연결되어 있으면 자동 해제 후 신규 연결.
   */
  linkMaterial: adminProcedure
    .input(z.object({ intermediateId: z.number(), materialId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");
      const tenantId = Number(ctx.tenantId);
      // 같은 material 에 이미 연결된 다른 intermediate 가 있으면 해제
      await db.execute(sql`
        UPDATE h_intermediates SET linked_material_id = NULL
        WHERE tenant_id = ${tenantId}
          AND linked_material_id = ${input.materialId}
          AND id != ${input.intermediateId}
      `);
      await db.execute(sql`
        UPDATE h_intermediates SET linked_material_id = ${input.materialId}
        WHERE id = ${input.intermediateId} AND tenant_id = ${tenantId}
      `);
      return { success: true };
    }),

  /**
   * 매칭 해제
   */
  unlinkMaterial: adminProcedure
    .input(z.object({ intermediateId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");
      await db.execute(sql`
        UPDATE h_intermediates SET linked_material_id = NULL
        WHERE id = ${input.intermediateId} AND tenant_id = ${Number(ctx.tenantId)}
      `);
      return { success: true };
    }),

  getById: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");
      const rows = await db
        .select()
        .from(hIntermediates)
        .where(
          and(
            eq(hIntermediates.id, input.id),
            eq(hIntermediates.tenantId, Number(ctx.tenantId)),
          ),
        )
        .limit(1);
      if (rows.length === 0) throw new Error("중간재를 찾을 수 없습니다");
      return rows[0];
    }),

  create: adminProcedure
    .input(
      z.object({
        intermediateCode: z.string().min(1).max(50),
        intermediateName: z.string().min(1).max(100),
        category: z.string().optional(),
        unit: z.string().optional(),
        shelfLifeDays: z.number().int().optional(),
        description: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");
      const result: any = await db.insert(hIntermediates).values({
        tenantId: Number(ctx.tenantId),
        intermediateCode: input.intermediateCode,
        intermediateName: input.intermediateName,
        category: input.category || null,
        unit: input.unit || null,
        shelfLifeDays: input.shelfLifeDays ?? null,
        description: input.description || null,
      } as any);
      return { success: true, id: Number(result?.[0]?.insertId ?? 0) };
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.number(),
        intermediateCode: z.string().min(1).max(50),
        intermediateName: z.string().min(1).max(100),
        category: z.string().optional(),
        unit: z.string().optional(),
        shelfLifeDays: z.number().int().optional(),
        description: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");
      await db
        .update(hIntermediates)
        .set({
          intermediateCode: input.intermediateCode,
          intermediateName: input.intermediateName,
          category: input.category || null,
          unit: input.unit || null,
          shelfLifeDays: input.shelfLifeDays ?? null,
          description: input.description || null,
        } as any)
        .where(
          and(
            eq(hIntermediates.id, input.id),
            eq(hIntermediates.tenantId, Number(ctx.tenantId)),
          ),
        );
      return { success: true };
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");
      const tenantId = Number(ctx.tenantId);

      // 사용 중인지 확인 (BOM h_mf_ingredients 에서 참조)
      const usageResult: any = await db.execute(sql`
        SELECT COUNT(*) AS cnt FROM h_mf_ingredients
        WHERE intermediate_id = ${input.id}
      `);
      const usageRows = (Array.isArray((usageResult as any)?.[0]) ? (usageResult as any)[0] : (usageResult as any)) as any[];
      const usageCount = Number(usageRows?.[0]?.cnt || 0);
      if (usageCount > 0) {
        throw new Error(`이 중간재는 ${usageCount}개의 BOM 에서 사용 중입니다. 먼저 BOM 에서 제거하세요.`);
      }

      // components 먼저 삭제 (FK 무관계)
      await db.execute(sql`
        DELETE FROM h_mixed_material_components
        WHERE intermediate_material_id = ${input.id}
          AND tenant_id = ${tenantId}
      `);

      await db
        .delete(hIntermediates)
        .where(
          and(
            eq(hIntermediates.id, input.id),
            eq(hIntermediates.tenantId, tenantId),
          ),
        );
      return { success: true };
    }),

  // ═══════════════════════════════════════════════════════════════
  // 컴포넌트 (h_mixed_material_components) — 중간재 → 원재료 분해
  // ═══════════════════════════════════════════════════════════════

  componentList: tenantRequiredProcedure
    .input(z.object({ intermediateId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const tenantId = Number(ctx.tenantId);

      // JOIN h_materials 로 원재료명 / 코드 조회
      const result: any = await db.execute(sql`
        SELECT
          mmc.id,
          mmc.intermediate_material_id,
          mmc.component_material_id,
          mmc.ratio_percent,
          mmc.grams_per_kg,
          mmc.note,
          m.material_code,
          m.material_name,
          m.unit AS material_unit,
          m.kind AS material_kind
        FROM h_mixed_material_components mmc
        LEFT JOIN h_materials m
          ON m.id = mmc.component_material_id AND m.tenant_id = ${tenantId}
        WHERE mmc.tenant_id = ${tenantId}
          AND mmc.intermediate_material_id = ${input.intermediateId}
        ORDER BY mmc.id ASC
      `);
      const rows = (Array.isArray((result as any)?.[0]) ? (result as any)[0] : (result as any)) as any[];
      return rows.map((r) => ({
        id: Number(r.id),
        intermediateMaterialId: Number(r.intermediate_material_id),
        componentMaterialId: Number(r.component_material_id),
        ratioPercent: r.ratio_percent !== null ? Number(r.ratio_percent) : null,
        gramsPerKg: r.grams_per_kg !== null ? Number(r.grams_per_kg) : null,
        note: r.note ? String(r.note) : null,
        materialCode: r.material_code ? String(r.material_code) : null,
        materialName: r.material_name ? String(r.material_name) : null,
        materialUnit: r.material_unit ? String(r.material_unit) : null,
        materialKind: r.material_kind ? String(r.material_kind) : null,
      }));
    }),

  componentAdd: adminProcedure
    .input(
      z.object({
        intermediateId: z.number(),
        componentMaterialId: z.number(),
        ratioPercent: z.number().nonnegative().optional(),
        gramsPerKg: z.number().nonnegative().optional(),
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");
      const result: any = await db.insert(hMixedMaterialComponents).values({
        tenantId: Number(ctx.tenantId),
        intermediateMaterialId: input.intermediateId,
        componentMaterialId: input.componentMaterialId,
        ratioPercent: input.ratioPercent !== undefined ? input.ratioPercent.toString() : null,
        gramsPerKg: input.gramsPerKg !== undefined ? input.gramsPerKg.toString() : null,
        note: input.note || null,
      } as any);
      return { success: true, id: Number(result?.[0]?.insertId ?? 0) };
    }),

  componentUpdate: adminProcedure
    .input(
      z.object({
        id: z.number(),
        ratioPercent: z.number().nonnegative().optional(),
        gramsPerKg: z.number().nonnegative().optional(),
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");
      await db
        .update(hMixedMaterialComponents)
        .set({
          ratioPercent: input.ratioPercent !== undefined ? input.ratioPercent.toString() : null,
          gramsPerKg: input.gramsPerKg !== undefined ? input.gramsPerKg.toString() : null,
          note: input.note || null,
        } as any)
        .where(
          and(
            eq(hMixedMaterialComponents.id, input.id),
            eq(hMixedMaterialComponents.tenantId, Number(ctx.tenantId)),
          ),
        );
      return { success: true };
    }),

  componentRemove: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");
      await db
        .delete(hMixedMaterialComponents)
        .where(
          and(
            eq(hMixedMaterialComponents.id, input.id),
            eq(hMixedMaterialComponents.tenantId, Number(ctx.tenantId)),
          ),
        );
      return { success: true };
    }),

  // 카테고리 목록 (필터용)
  categoryList: tenantRequiredProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const result: any = await db.execute(sql`
      SELECT DISTINCT category FROM h_intermediates
      WHERE tenant_id = ${Number(ctx.tenantId)} AND category IS NOT NULL AND category != ''
      ORDER BY category ASC
    `);
    const rows = (Array.isArray((result as any)?.[0]) ? (result as any)[0] : (result as any)) as any[];
    return rows.map((r) => String(r.category));
  }),
});

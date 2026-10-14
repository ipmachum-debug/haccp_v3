/**
 * SKU 별칭 (alias) 라우터 — PR #298
 *
 * Excel 일괄 등록 매출에서 자유로운 이름 ("혼합마카", "마카 5종 세트") 으로
 * SKU 매칭하기 위한 1 SKU : N alias 관리.
 */
import { z } from "zod";
import { and, asc, desc, eq, like, sql, or } from "drizzle-orm";
import { router, tenantRequiredProcedure, adminProcedure } from "../../_core/trpc";
import { getDb } from "../../db";
import { skuAliases } from "../../../drizzle/schema/skuAliases";
import { productSkus, itemMaster } from "../../../drizzle/schema/schema_dual_unit";

/** 입력 정규화 — trim + 연속 공백 1개로 */
function normalizeAlias(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

export const skuAliasRouter = router({
  /**
   * 매칭 학습 — 매출 엑셀 업로드에서 사용자가 확정한 "엑셀 품목명 → 품목/묶음" 을 별칭으로 저장 (2026-10-14, CEO 요청)
   * 다음 업로드 때 bulkMatchPreview 가 이 별칭으로 바로 매칭한다.
   *  - skuId 가 오면 그 SKU (묶음 대표 SKU 등) 로 저장
   *  - itemMasterId 만 오면 그 품목의 기본 SKU (is_default 우선, 없으면 첫 활성 SKU) 로 저장
   *  - 같은 별칭이 다른 SKU 에 있으면 최신 선택으로 갱신 (사용자가 고친 매칭이 정답)
   *  - SKU 가 없는 품목(원재료 등) 은 건너뛴다
   */
  learnAliases: adminProcedure
    .input(
      z.object({
        entries: z
          .array(z.object({ text: z.string().min(1).max(200), skuId: z.number().optional(), itemMasterId: z.number().optional() }))
          .max(2000),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { getRawConnection } = await import("../../db/connection");
      const conn = await getRawConnection();
      let learned = 0;
      let updated = 0;
      let skipped = 0;
      const seen = new Set<string>();
      for (const e of input.entries) {
        const alias = normalizeAlias(e.text);
        if (!alias || seen.has(alias)) continue;
        seen.add(alias);

        let skuId = e.skuId ?? null;
        if (skuId) {
          const [own] = await conn.execute<any[]>(
            `SELECT id FROM product_skus WHERE id = ? AND tenant_id = ? LIMIT 1`,
            [skuId, ctx.tenantId],
          );
          if (!(own as any[])[0]) skuId = null;
        }
        if (!skuId && e.itemMasterId) {
          const [rows] = await conn.execute<any[]>(
            `SELECT id FROM product_skus
             WHERE item_id = ? AND tenant_id = ? AND is_active = 1
             ORDER BY is_default DESC, id ASC LIMIT 1`,
            [e.itemMasterId, ctx.tenantId],
          );
          skuId = (rows as any[])[0]?.id != null ? Number((rows as any[])[0].id) : null;
        }
        if (!skuId) { skipped++; continue; }

        const [existing] = await conn.execute<any[]>(
          `SELECT id, sku_id FROM sku_aliases WHERE tenant_id = ? AND alias = ? LIMIT 1`,
          [ctx.tenantId, alias],
        );
        const ex = (existing as any[])[0];
        if (ex) {
          if (Number(ex.sku_id) !== skuId) {
            await conn.execute(
              `UPDATE sku_aliases SET sku_id = ?, note = ?, updated_at = NOW() WHERE id = ? AND tenant_id = ?`,
              [skuId, "엑셀 업로드 매칭 학습 (갱신)", ex.id, ctx.tenantId],
            );
            updated++;
          }
          continue;
        }
        await conn.execute(
          `INSERT INTO sku_aliases (tenant_id, sku_id, alias, is_primary, note) VALUES (?, ?, ?, 0, ?)`,
          [ctx.tenantId, skuId, alias, "엑셀 업로드 매칭 학습"],
        );
        learned++;
      }
      return { learned, updated, skipped };
    }),

  /** 특정 SKU 의 alias 목록 */
  listBySku: tenantRequiredProcedure
    .input(z.object({ skuId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");

      return db
        .select()
        .from(skuAliases)
        .where(
          and(
            eq(skuAliases.tenantId, ctx.tenantId),
            eq(skuAliases.skuId, input.skuId),
          ),
        )
        .orderBy(desc(skuAliases.isPrimary), asc(skuAliases.alias));
    }),

  /**
   * Alias 추가 — 이미 존재하면 에러 (UNIQUE).
   * 동일 alias 가 다른 SKU 에 매핑돼 있으면 명확한 에러 메시지.
   */
  addAlias: adminProcedure
    .input(
      z.object({
        skuId: z.number(),
        alias: z.string().min(1).max(200),
        isPrimary: z.boolean().optional(),
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");

      const aliasNorm = normalizeAlias(input.alias);
      if (!aliasNorm) {
        throw new Error("alias 가 빈 값입니다");
      }

      // 같은 tenant 안에서 중복 alias 검사
      const existing = await db
        .select({ id: skuAliases.id, skuId: skuAliases.skuId })
        .from(skuAliases)
        .where(
          and(
            eq(skuAliases.tenantId, ctx.tenantId),
            eq(skuAliases.alias, aliasNorm),
          ),
        )
        .limit(1);
      if (existing.length > 0) {
        if (existing[0].skuId === input.skuId) {
          throw new Error(`이미 등록된 별칭입니다: "${aliasNorm}"`);
        }
        throw new Error(
          `다른 SKU 에 이미 사용 중인 별칭입니다: "${aliasNorm}" (sku_id=${existing[0].skuId})`,
        );
      }

      // SKU 존재 확인 (테넌트 격리)
      const [sku] = await db
        .select({ id: productSkus.id })
        .from(productSkus)
        .where(
          and(
            eq(productSkus.id, input.skuId),
            eq(productSkus.tenantId, ctx.tenantId),
          ),
        )
        .limit(1);
      if (!sku) {
        throw new Error("SKU 를 찾을 수 없습니다");
      }

      // isPrimary=1 인 경우 같은 SKU 의 다른 alias 들은 0 으로 강등
      if (input.isPrimary) {
        await db
          .update(skuAliases)
          .set({ isPrimary: 0 })
          .where(
            and(
              eq(skuAliases.tenantId, ctx.tenantId),
              eq(skuAliases.skuId, input.skuId),
            ),
          );
      }

      const result = await db.insert(skuAliases).values({
        tenantId: ctx.tenantId,
        skuId: input.skuId,
        alias: aliasNorm,
        isPrimary: input.isPrimary ? 1 : 0,
        note: input.note ?? null,
      } as any);

      return { success: true, id: (result as any)[0]?.insertId, alias: aliasNorm };
    }),

  /** Alias 삭제 */
  removeAlias: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");

      const result = await db
        .delete(skuAliases)
        .where(
          and(eq(skuAliases.id, input.id), eq(skuAliases.tenantId, ctx.tenantId)),
        );
      return { success: true, deleted: (result as any)[0]?.affectedRows ?? 0 };
    }),

  /**
   * Excel/사용자 입력 텍스트로 SKU 매칭.
   * 우선순위:
   *   1. alias 정확 매칭 (case-insensitive, trim)
   *   2. product_skus.sku_name 정확 매칭
   *   3. product_skus.sku_code 정확 매칭
   *   4. item_master.item_name LIKE (마지막 폴백)
   *
   * 결과: { skuId, matchSource, candidate? } — 0 또는 1건
   */
  resolveByText: tenantRequiredProcedure
    .input(z.object({ text: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");

      const norm = normalizeAlias(input.text);
      if (!norm) return null;

      // 1. alias 정확 매칭
      const [a] = await db
        .select({
          skuId: skuAliases.skuId,
          skuCode: productSkus.skuCode,
          skuName: productSkus.skuName,
        })
        .from(skuAliases)
        .innerJoin(productSkus, eq(skuAliases.skuId, productSkus.id))
        .where(
          and(
            eq(skuAliases.tenantId, ctx.tenantId),
            eq(skuAliases.alias, norm),
          ),
        )
        .limit(1);
      if (a) return { ...a, matchSource: "alias" as const };

      // 2. sku_name 정확 매칭
      const [n] = await db
        .select({
          skuId: productSkus.id,
          skuCode: productSkus.skuCode,
          skuName: productSkus.skuName,
        })
        .from(productSkus)
        .where(
          and(
            eq(productSkus.tenantId, ctx.tenantId),
            eq(productSkus.skuName, norm),
            eq(productSkus.isActive, 1),
          ),
        )
        .limit(1);
      if (n) return { ...n, matchSource: "sku_name" as const };

      // 3. sku_code 정확 매칭
      const [c] = await db
        .select({
          skuId: productSkus.id,
          skuCode: productSkus.skuCode,
          skuName: productSkus.skuName,
        })
        .from(productSkus)
        .where(
          and(
            eq(productSkus.tenantId, ctx.tenantId),
            eq(productSkus.skuCode, norm),
            eq(productSkus.isActive, 1),
          ),
        )
        .limit(1);
      if (c) return { ...c, matchSource: "sku_code" as const };

      // 4. item_master.item_name LIKE — 첫 매칭 (default SKU)
      const [im] = await db
        .select({
          skuId: productSkus.id,
          skuCode: productSkus.skuCode,
          skuName: productSkus.skuName,
        })
        .from(itemMaster)
        .innerJoin(
          productSkus,
          and(
            eq(productSkus.itemId, itemMaster.id),
            eq(productSkus.isDefault, 1),
            eq(productSkus.isActive, 1),
          ),
        )
        .where(
          and(
            eq(itemMaster.tenantId, ctx.tenantId),
            eq(itemMaster.itemName, norm),
          ),
        )
        .limit(1);
      if (im) return { ...im, matchSource: "item_name" as const };

      return null;
    }),

  /**
   * Excel 일괄 dry-run — 행 배열을 받아 매칭 결과 + 부족분 리포트.
   * 실제 매출 INSERT 는 별도 mutation (PR-B 에서 구현).
   */
  bulkMatchPreview: tenantRequiredProcedure
    .input(z.object({ texts: z.array(z.string()).min(1).max(2000) }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");

      const distinctNorm = Array.from(
        new Set(input.texts.map((t) => normalizeAlias(t)).filter(Boolean)),
      );
      if (distinctNorm.length === 0) return { matches: [], unmatched: [] };

      // alias + sku_name + sku_code 한 번에 매칭 (UNION)
      // ★ PR-C/D (2026-05-11): itemId 도 함께 반환 — Excel 일괄 매출 매칭에서
      //   item_master 기준 라우팅 (`bulkCreateSales` 의 productId/materialId 결정) 에 사용.
      const aliasRows = await db
        .select({
          text: skuAliases.alias,
          skuId: skuAliases.skuId,
          itemId: productSkus.itemId,
          skuCode: productSkus.skuCode,
          skuName: productSkus.skuName,
        })
        .from(skuAliases)
        .innerJoin(productSkus, eq(skuAliases.skuId, productSkus.id))
        .where(
          and(
            eq(skuAliases.tenantId, ctx.tenantId),
            sql`${skuAliases.alias} IN (${sql.join(distinctNorm.map((t) => sql`${t}`), sql`, `)})`,
          ),
        );

      const skuRows = await db
        .select({
          name: productSkus.skuName,
          code: productSkus.skuCode,
          skuId: productSkus.id,
          itemId: productSkus.itemId,
        })
        .from(productSkus)
        .where(
          and(
            eq(productSkus.tenantId, ctx.tenantId),
            eq(productSkus.isActive, 1),
            sql`(${productSkus.skuName} IN (${sql.join(distinctNorm.map((t) => sql`${t}`), sql`, `)})
                 OR ${productSkus.skuCode} IN (${sql.join(distinctNorm.map((t) => sql`${t}`), sql`, `)}))`,
          ),
        );

      const matchMap = new Map<
        string,
        { skuId: number; itemId: number; skuCode: string; skuName: string; matchSource: string }
      >();
      for (const r of aliasRows) {
        if (!matchMap.has(r.text)) {
          matchMap.set(r.text, {
            skuId: r.skuId,
            itemId: r.itemId,
            skuCode: r.skuCode,
            skuName: r.skuName,
            matchSource: "alias",
          });
        }
      }
      for (const r of skuRows) {
        const byName = r.name && !matchMap.has(r.name);
        if (byName) {
          matchMap.set(r.name, {
            skuId: r.skuId,
            itemId: r.itemId,
            skuCode: r.code,
            skuName: r.name,
            matchSource: "sku_name",
          });
        }
        if (r.code && !matchMap.has(r.code)) {
          matchMap.set(r.code, {
            skuId: r.skuId,
            itemId: r.itemId,
            skuCode: r.code,
            skuName: r.name,
            matchSource: "sku_code",
          });
        }
      }

      const matches: Array<{
        text: string;
        skuId: number;
        itemId: number;
        skuCode: string;
        skuName: string;
        matchSource: string;
      }> = [];
      const unmatched: string[] = [];
      for (const t of distinctNorm) {
        const m = matchMap.get(t);
        if (m) matches.push({ text: t, ...m });
        else unmatched.push(t);
      }

      return {
        matches,
        unmatched,
        totalDistinct: distinctNorm.length,
        matchedCount: matches.length,
        unmatchedCount: unmatched.length,
      };
    }),
});

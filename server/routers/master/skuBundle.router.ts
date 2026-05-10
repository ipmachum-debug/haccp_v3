/**
 * SKU 번들 라우터 — PR #280
 *
 * 혼합 제품 SKU 의 child 구성/비율 관리.
 *
 * 사용 흐름:
 *   1. 품목 마스터에서 parent SKU 등록 (혼합 인절미 같은 출고용 SKU)
 *   2. 이 라우터로 child SKU 들 (쑥앙금/흑임자/콩고물) + 비율 등록
 *   3. PR #281 에서 배치 일괄 생성 + 출고 자동 분해 추가 예정
 */
import { z } from "zod";
import { and, asc, eq, sql } from "drizzle-orm";
import { router, tenantRequiredProcedure, adminProcedure } from "../../_core/trpc";
import { getDb } from "../../db";
import { skuBundles } from "../../../drizzle/schema/skuBundles";
import { skuAliases } from "../../../drizzle/schema/skuAliases";
import { productSkus, itemMaster } from "../../../drizzle/schema/schema_dual_unit";

export const skuBundleRouter = router({
  /**
   * 특정 parent SKU 의 번들 구성 조회.
   * child SKU 정보 (skuName, skuCode, salesUnit) JOIN.
   */
  listByParent: tenantRequiredProcedure
    .input(z.object({ parentSkuId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");

      const rows = await db
        .select({
          id: skuBundles.id,
          parentSkuId: skuBundles.parentSkuId,
          childSkuId: skuBundles.childSkuId,
          defaultRatio: skuBundles.defaultRatio,
          // ★ PR #298: count + piece weight (HACCP 라벨용)
          childPieces: skuBundles.childPieces,
          childPieceWeightG: skuBundles.childPieceWeightG,
          sortOrder: skuBundles.sortOrder,
          // child SKU info
          childSkuCode: productSkus.skuCode,
          childSkuName: productSkus.skuName,
          childSalesUnit: productSkus.salesUnit,
          childKgPerSalesUnit: productSkus.kgPerSalesUnit,
          // child SKU → item master (제품명)
          childItemId: productSkus.itemId,
          childItemName: itemMaster.itemName,
          childItemCode: itemMaster.itemCode,
        })
        .from(skuBundles)
        .innerJoin(productSkus, eq(skuBundles.childSkuId, productSkus.id))
        .leftJoin(itemMaster, eq(productSkus.itemId, itemMaster.id))
        .where(
          and(
            eq(skuBundles.tenantId, ctx.tenantId),
            eq(skuBundles.parentSkuId, input.parentSkuId),
          ),
        )
        .orderBy(asc(skuBundles.sortOrder), asc(skuBundles.id));

      const totalRatio = rows.reduce((s, r) => s + Number(r.defaultRatio || 0), 0);

      return {
        items: rows,
        totalRatio: Math.round(totalRatio * 100) / 100,
        isValid100: Math.abs(totalRatio - 100) < 0.01,
      };
    }),

  /**
   * 번들 구성 저장 (전체 덮어쓰기).
   * - 기존 행 삭제 후 새 행 일괄 INSERT
   * - 합계 100% 검증 (0.01 허용)
   */
  setBundleComposition: adminProcedure
    .input(
      z.object({
        parentSkuId: z.number(),
        children: z
          .array(
            z.object({
              childSkuId: z.number(),
              defaultRatio: z.number().positive(),
              // ★ PR #298: count + piece weight (HACCP 라벨용)
              childPieces: z.number().int().positive().nullable().optional(),
              childPieceWeightG: z.number().positive().nullable().optional(),
              sortOrder: z.number().optional(),
            }),
          )
          .min(2, "혼합 제품은 최소 2개 child SKU 필요"),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");

      // 100% 합계 검증
      const total = input.children.reduce((s, c) => s + c.defaultRatio, 0);
      if (Math.abs(total - 100) > 0.01) {
        throw new Error(`비율 합계는 100% 여야 합니다 (현재: ${total.toFixed(2)}%)`);
      }

      // child SKU 중복 검증
      const childIds = new Set(input.children.map((c) => c.childSkuId));
      if (childIds.size !== input.children.length) {
        throw new Error("child SKU 가 중복됩니다");
      }
      if (childIds.has(input.parentSkuId)) {
        throw new Error("parent SKU 는 child 로 포함될 수 없습니다 (자기 참조 금지)");
      }

      // parent SKU 존재 확인 (테넌트 격리)
      const [parent] = await db
        .select({ id: productSkus.id })
        .from(productSkus)
        .where(
          and(
            eq(productSkus.id, input.parentSkuId),
            eq(productSkus.tenantId, ctx.tenantId),
          ),
        )
        .limit(1);
      if (!parent) {
        throw new Error("parent SKU 를 찾을 수 없습니다");
      }

      // child SKU 모두 같은 테넌트인지 확인
      const validChildren = await db
        .select({ id: productSkus.id })
        .from(productSkus)
        .where(
          and(
            eq(productSkus.tenantId, ctx.tenantId),
            sql`${productSkus.id} IN (${sql.join(
              input.children.map((c) => sql`${c.childSkuId}`),
              sql`, `,
            )})`,
          ),
        );
      if (validChildren.length !== input.children.length) {
        throw new Error("child SKU 중 일부가 같은 테넌트에 없습니다");
      }

      // 기존 구성 삭제 후 신규 일괄 INSERT
      await db
        .delete(skuBundles)
        .where(
          and(
            eq(skuBundles.tenantId, ctx.tenantId),
            eq(skuBundles.parentSkuId, input.parentSkuId),
          ),
        );

      if (input.children.length > 0) {
        await db.insert(skuBundles).values(
          input.children.map((c, idx) => ({
            tenantId: ctx.tenantId,
            parentSkuId: input.parentSkuId,
            childSkuId: c.childSkuId,
            defaultRatio: c.defaultRatio.toString(),
            // ★ PR #298: piece info (NULL 허용 — Option A 호환)
            childPieces: c.childPieces ?? null,
            childPieceWeightG: c.childPieceWeightG?.toString() ?? null,
            sortOrder: c.sortOrder ?? idx,
          })) as any,
        );
      }

      return {
        success: true,
        savedCount: input.children.length,
        totalRatio: Math.round(total * 100) / 100,
      };
    }),

  /**
   * 번들 구성 전체 삭제 (parent SKU → 단일 SKU 로 전환).
   */
  removeBundle: adminProcedure
    .input(z.object({ parentSkuId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");

      const result = await db
        .delete(skuBundles)
        .where(
          and(
            eq(skuBundles.tenantId, ctx.tenantId),
            eq(skuBundles.parentSkuId, input.parentSkuId),
          ),
        );
      return { success: true, deletedCount: (result as any)[0]?.affectedRows ?? 0 };
    }),

  /**
   * 특정 child SKU 가 속한 parent 번들 목록 조회.
   * (배치 완료 시 production_sku_output.bundle_sku_id 자동 매칭에 사용)
   */
  parentsByChild: tenantRequiredProcedure
    .input(z.object({ childSkuId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");

      const rows = await db
        .select({
          parentSkuId: skuBundles.parentSkuId,
          defaultRatio: skuBundles.defaultRatio,
          parentSkuCode: productSkus.skuCode,
          parentSkuName: productSkus.skuName,
        })
        .from(skuBundles)
        .innerJoin(productSkus, eq(skuBundles.parentSkuId, productSkus.id))
        .where(
          and(
            eq(skuBundles.tenantId, ctx.tenantId),
            eq(skuBundles.childSkuId, input.childSkuId),
          ),
        );
      return rows;
    }),

  /**
   * ★ PR #282 (Phase 3): parent SKU 의 가용 번들 수 + child 별 재고 분포 조회.
   * 출고 화면에서 "최대 N box 가능" 표시용.
   */
  getAvailability: tenantRequiredProcedure
    .input(z.object({ parentSkuId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");
      const { getBundleAvailability } = await import(
        "../../lib/production/bundleStock.js"
      );
      const result = await getBundleAvailability(db, ctx.tenantId, input.parentSkuId);
      return result;
    }),

  /**
   * ★ PR #282 (Phase 3): parent N 단위 출고 시 child 차감 계획 미리보기.
   * 부족 발생 시 hasShortage=true 로 경고 (block 아님 — 사용자 승인 정책).
   */
  previewDecomposition: tenantRequiredProcedure
    .input(
      z.object({
        parentSkuId: z.number(),
        parentQty: z.number().positive(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");
      const { previewBundleDecomposition } = await import(
        "../../lib/production/bundleStock.js"
      );
      const result = await previewBundleDecomposition(
        db,
        ctx.tenantId,
        input.parentSkuId,
        input.parentQty,
      );
      return result;
    }),

  /**
   * ★ PR #298 (Phase 5): 실제 출고 분해 + FEFO 차감 + bundle_lots INSERT.
   * - parent LOT 신규 채번 (BLEND-YYYYMMDD-NNN)
   * - 각 child SKU FEFO LOT 차감 (h_inventory_lots.available_quantity)
   * - h_inventory_transactions 기록
   * - bundle_lots INSERT (parent ↔ child LOT 매핑)
   * - 트랜잭션 보장: 한 child SQL 실패 시 전체 ROLLBACK
   */
  applyOutbound: adminProcedure
    .input(
      z.object({
        parentSkuId: z.number(),
        parentQty: z.number().positive(),
        outboundDate: z.string().min(10), // YYYY-MM-DD
        referenceType: z.string().optional(),
        referenceId: z.number().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { withTransaction } = await import("../../db");
      const { decomposeBundleOutbound } = await import(
        "../../lib/production/decomposeBundleOutbound.js"
      );
      return withTransaction(async (conn: any) => {
        return decomposeBundleOutbound(conn, {
          parentSkuId: input.parentSkuId,
          parentQty: input.parentQty,
          outboundDate: input.outboundDate,
          tenantId: ctx.tenantId,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          userId: ctx.user.id,
        });
      });
    }),
});

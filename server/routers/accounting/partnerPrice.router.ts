/**
 * 거래처별 단가표 라우터 — Phase B (2026-04-14)
 * ═══════════════════════════════════════════════════════════════
 * CRUD + 단가 조회 (resolvePrice)
 * ═══════════════════════════════════════════════════════════════
 */
import { router, tenantRequiredProcedure, adminProcedure } from "../../_core/trpc";
import { z } from "zod";
import { getDb } from "../../db";
import { partnerPrices } from "../../../drizzle/schema/schema_partner_prices";
import { partners } from "../../../drizzle/schema/schema_main_accounting";
import { and, eq, desc, gte, lte, or, isNull, asc, sql } from "drizzle-orm";

// ─── Zod ──────────────────────────────────────────────────
const createInput = z.object({
  partnerId: z.number(),
  targetType: z.enum(["material", "product"]),
  materialId: z.number().optional(),
  productId: z.number().optional(),
  itemName: z.string().min(1),
  itemCode: z.string().optional(),
  unitPrice: z.number().nonnegative(),
  currency: z.string().default("KRW"),
  discountRate: z.number().min(0).max(100).optional(),
  effectiveFrom: z.string(), // YYYY-MM-DD
  effectiveTo: z.string().optional(),
  notes: z.string().optional(),
});

export const partnerPriceRouter = router({
  /**
   * 단가표 목록 (필터: partnerId, targetType, materialId/productId, active only)
   */
  list: tenantRequiredProcedure
    .input(
      z
        .object({
          partnerId: z.number().optional(),
          targetType: z.enum(["material", "product"]).optional(),
          materialId: z.number().optional(),
          productId: z.number().optional(),
          activeOnly: z.boolean().optional().default(true),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");

      const conditions: any[] = [eq(partnerPrices.tenantId, ctx.tenantId)];
      if (input?.partnerId) conditions.push(eq(partnerPrices.partnerId, input.partnerId));
      if (input?.targetType) conditions.push(eq(partnerPrices.targetType, input.targetType));
      if (input?.materialId) conditions.push(eq(partnerPrices.materialId, input.materialId));
      if (input?.productId) conditions.push(eq(partnerPrices.productId, input.productId));
      if (input?.activeOnly !== false) conditions.push(eq(partnerPrices.isActive, 1));

      const rows = await db
        .select({
          id: partnerPrices.id,
          partnerId: partnerPrices.partnerId,
          partnerName: partners.companyName,
          targetType: partnerPrices.targetType,
          materialId: partnerPrices.materialId,
          productId: partnerPrices.productId,
          itemName: partnerPrices.itemName,
          itemCode: partnerPrices.itemCode,
          unitPrice: partnerPrices.unitPrice,
          currency: partnerPrices.currency,
          discountRate: partnerPrices.discountRate,
          effectiveFrom: partnerPrices.effectiveFrom,
          effectiveTo: partnerPrices.effectiveTo,
          notes: partnerPrices.notes,
          isActive: partnerPrices.isActive,
          createdAt: partnerPrices.createdAt,
        })
        .from(partnerPrices)
        .leftJoin(partners, eq(partnerPrices.partnerId, partners.id))
        .where(and(...conditions))
        .orderBy(
          desc(partnerPrices.effectiveFrom),
          asc(partnerPrices.partnerId),
          asc(partnerPrices.itemName),
        );

      return rows;
    }),

  /**
   * ★ 핵심: 특정 거래처 + 품목의 현재 유효 단가 조회
   *   - 발주/매입/매출 등록 시 거래처+품목 선택 시 자동 호출
   *   - effective_from <= 오늘 AND (effective_to IS NULL OR effective_to >= 오늘)
   *   - 여러 레코드가 있으면 effective_from 이 가장 최근인 것
   */
  resolvePrice: tenantRequiredProcedure
    .input(
      z.object({
        partnerId: z.number(),
        targetType: z.enum(["material", "product"]),
        materialId: z.number().optional(),
        productId: z.number().optional(),
        onDate: z.string().optional(), // YYYY-MM-DD (기본 today)
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");

      const today = input.onDate || new Date().toISOString().slice(0, 10);

      const conditions: any[] = [
        eq(partnerPrices.tenantId, ctx.tenantId),
        eq(partnerPrices.partnerId, input.partnerId),
        eq(partnerPrices.targetType, input.targetType),
        eq(partnerPrices.isActive, 1),
        sql`${partnerPrices.effectiveFrom} <= ${today}`,
        or(
          isNull(partnerPrices.effectiveTo),
          sql`${partnerPrices.effectiveTo} >= ${today}`,
        )!,
      ];

      if (input.materialId) conditions.push(eq(partnerPrices.materialId, input.materialId));
      if (input.productId) conditions.push(eq(partnerPrices.productId, input.productId));

      const [row] = await db
        .select()
        .from(partnerPrices)
        .where(and(...conditions))
        .orderBy(desc(partnerPrices.effectiveFrom), desc(partnerPrices.id))
        .limit(1);

      if (!row) return null;

      return {
        id: row.id,
        unitPrice: Number(row.unitPrice),
        currency: row.currency,
        discountRate: Number(row.discountRate || 0),
        effectiveFrom: row.effectiveFrom,
        effectiveTo: row.effectiveTo,
        notes: row.notes,
      };
    }),

  /**
   * 단가 등록
   * 중복 방지: 같은 partner+item+effective_from 이 이미 있으면 업데이트 유도 (UNIQUE 제약이 잡음)
   */
  create: adminProcedure.input(createInput).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("DB 연결 실패");

    // targetType 에 따른 validation
    if (input.targetType === "material" && !input.materialId) {
      throw new Error("원재료 ID 필요");
    }
    if (input.targetType === "product" && !input.productId) {
      throw new Error("제품 ID 필요");
    }

    const [result] = await db.insert(partnerPrices).values({
      tenantId: ctx.tenantId,
      partnerId: input.partnerId,
      targetType: input.targetType,
      materialId: input.materialId ?? null,
      productId: input.productId ?? null,
      itemName: input.itemName,
      itemCode: input.itemCode ?? null,
      unitPrice: input.unitPrice.toString(),
      currency: input.currency,
      discountRate: (input.discountRate ?? 0).toString(),
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo ?? null,
      notes: input.notes ?? null,
      isActive: 1,
      createdBy: ctx.user.id,
    } as any);

    return { id: Number((result as any).insertId), message: "단가가 등록되었습니다." };
  }),

  /**
   * 단가 수정
   */
  update: adminProcedure
    .input(
      z.object({
        id: z.number(),
        unitPrice: z.number().nonnegative().optional(),
        discountRate: z.number().min(0).max(100).optional(),
        effectiveFrom: z.string().optional(),
        effectiveTo: z.string().optional().nullable(),
        notes: z.string().optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");

      const patch: any = {};
      if (input.unitPrice !== undefined) patch.unitPrice = input.unitPrice.toString();
      if (input.discountRate !== undefined) patch.discountRate = input.discountRate.toString();
      if (input.effectiveFrom !== undefined) patch.effectiveFrom = input.effectiveFrom;
      if (input.effectiveTo !== undefined) patch.effectiveTo = input.effectiveTo;
      if (input.notes !== undefined) patch.notes = input.notes;
      if (input.isActive !== undefined) patch.isActive = input.isActive ? 1 : 0;

      await db
        .update(partnerPrices)
        .set(patch)
        .where(
          and(
            eq(partnerPrices.id, input.id),
            eq(partnerPrices.tenantId, ctx.tenantId),
          ),
        );

      return { message: "단가가 수정되었습니다." };
    }),

  /**
   * 단가 삭제 (soft → isActive=0 권장, 실제 삭제는 별도)
   */
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");

      await db
        .delete(partnerPrices)
        .where(
          and(
            eq(partnerPrices.id, input.id),
            eq(partnerPrices.tenantId, ctx.tenantId),
          ),
        );

      return { message: "단가가 삭제되었습니다." };
    }),

  /**
   * 특정 거래처의 모든 단가 (단가표 탭 전용)
   */
  listByPartner: tenantRequiredProcedure
    .input(z.object({ partnerId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");

      return await db
        .select()
        .from(partnerPrices)
        .where(
          and(
            eq(partnerPrices.tenantId, ctx.tenantId),
            eq(partnerPrices.partnerId, input.partnerId),
          ),
        )
        .orderBy(desc(partnerPrices.isActive), desc(partnerPrices.effectiveFrom));
    }),
});

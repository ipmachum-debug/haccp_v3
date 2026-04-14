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
   * ★ 다중 품목 일괄 등록 — Phase B (2026-04-14)
   * 거래처당 수십 품목을 한 번에 등록.
   * 중복(UNIQUE 위반) 은 skip 카운트로 보고, 나머지는 성공.
   */
  createBatch: adminProcedure
    .input(
      z.object({
        partnerId: z.number(),
        effectiveFrom: z.string(), // 공통 적용일
        effectiveTo: z.string().optional(),
        currency: z.string().default("KRW"),
        items: z
          .array(
            z.object({
              targetType: z.enum(["material", "product"]),
              materialId: z.number().optional(),
              productId: z.number().optional(),
              itemName: z.string().min(1),
              itemCode: z.string().optional(),
              unitPrice: z.number().nonnegative(),
              discountRate: z.number().min(0).max(100).optional(),
              notes: z.string().optional(),
            }),
          )
          .min(1, "최소 1개 품목 필요")
          .max(200, "한 번에 200개까지"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");

      let successCount = 0;
      let skipCount = 0;
      const errors: Array<{ itemName: string; error: string }> = [];

      for (const item of input.items) {
        if (item.targetType === "material" && !item.materialId) {
          errors.push({ itemName: item.itemName, error: "원재료 ID 필요" });
          continue;
        }
        if (item.targetType === "product" && !item.productId) {
          errors.push({ itemName: item.itemName, error: "제품 ID 필요" });
          continue;
        }
        try {
          await db.insert(partnerPrices).values({
            tenantId: ctx.tenantId,
            partnerId: input.partnerId,
            targetType: item.targetType,
            materialId: item.materialId ?? null,
            productId: item.productId ?? null,
            itemName: item.itemName,
            itemCode: item.itemCode ?? null,
            unitPrice: item.unitPrice.toString(),
            currency: input.currency,
            discountRate: (item.discountRate ?? 0).toString(),
            effectiveFrom: input.effectiveFrom,
            effectiveTo: input.effectiveTo ?? null,
            notes: item.notes ?? null,
            isActive: 1,
            createdBy: ctx.user.id,
          } as any);
          successCount++;
        } catch (err: any) {
          // UNIQUE 위반 (같은 partner+item+effective_from)
          if (err?.code === "ER_DUP_ENTRY" || /Duplicate/.test(err?.message || "")) {
            skipCount++;
          } else {
            errors.push({ itemName: item.itemName, error: err?.message || "저장 실패" });
          }
        }
      }

      return {
        successCount,
        skipCount,
        errorCount: errors.length,
        errors,
        message: `${successCount}건 등록 · ${skipCount}건 중복 skip · ${errors.length}건 오류`,
      };
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

  /**
   * ★ 지능형 품목 매칭 — Phase B (2026-04-14)
   *
   * 엑셀 업로드 시 품목명/품목코드 오타/공백/어순 변형을 허용하여
   * 마스터 테이블(hMaterials / hProductsV2) 과 매칭.
   *
   * 매칭 우선순위:
   *   1. 코드 완전일치 (정규화 후)       → 100점
   *   2. 이름 완전일치 (정규화 후)       → 95점
   *   3. 코드 부분일치                   → 85~90
   *   4. 이름 포함관계 (양방향)          → 70~90
   *   5. Levenshtein 편집거리            → 60~85
   *   6. 토큰 중복 (한글/영숫자 분리)    → 30~60
   *
   * 반환:
   *   - bestMatch: 최고점 후보 (score + matchedBy 라벨)
   *   - suggestions: 상위 5개 후보 (score > 30)
   *   - confidence: "high" (≥90) / "medium" (60~89) / "low" (30~59) / "none" (<30)
   */
  matchItems: tenantRequiredProcedure
    .input(
      z.object({
        items: z
          .array(
            z.object({
              targetType: z.enum(["material", "product"]),
              query: z.string(),
              itemCode: z.string().optional(),
            }),
          )
          .min(1)
          .max(500),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");

      // 마스터 데이터 로드 (한 번만)
      const { hMaterials, hProductsV2 } = await import("../../../drizzle/schema/schema_main");

      const needMaterials = input.items.some((i) => i.targetType === "material");
      const needProducts = input.items.some((i) => i.targetType === "product");

      const materialRows = needMaterials
        ? await db
            .select({
              id: hMaterials.id,
              code: hMaterials.materialCode,
              name: hMaterials.materialName,
            })
            .from(hMaterials)
            .where(
              and(eq(hMaterials.tenantId, ctx.tenantId), eq(hMaterials.isActive, 1)),
            )
        : [];

      const productRows = needProducts
        ? await db
            .select({
              id: hProductsV2.id,
              code: hProductsV2.productCode,
              name: hProductsV2.productName,
            })
            .from(hProductsV2)
            .where(
              and(eq(hProductsV2.tenantId, ctx.tenantId), eq(hProductsV2.isActive, 1)),
            )
        : [];

      // ─── 매칭 유틸 ─────────────────────────────────
      const normalize = (s: string): string =>
        (s || "")
          .toLowerCase()
          .replace(/[\s\-_.,()\/\\]/g, "")
          .trim();

      const levenshtein = (a: string, b: string): number => {
        const m = a.length;
        const n = b.length;
        if (m === 0) return n;
        if (n === 0) return m;
        const dp: number[][] = Array.from({ length: m + 1 }, () =>
          new Array(n + 1).fill(0),
        );
        for (let i = 0; i <= m; i++) dp[i][0] = i;
        for (let j = 0; j <= n; j++) dp[0][j] = j;
        for (let i = 1; i <= m; i++) {
          for (let j = 1; j <= n; j++) {
            dp[i][j] =
              a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1]
                : Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]) + 1;
          }
        }
        return dp[m][n];
      };

      const tokenize = (s: string): string[] =>
        s.match(/[가-힣]+|\d+|[a-z]+/gi) || [];

      interface Candidate {
        id: number;
        code: string | null;
        name: string;
      }

      const scoreMatch = (
        query: { query: string; itemCode?: string },
        master: Candidate,
      ): { score: number; matchedBy: string } => {
        const qName = normalize(query.query || "");
        const qCode = normalize(query.itemCode || "");
        const mName = normalize(master.name || "");
        const mCode = normalize(master.code || "");

        // 1. 코드 완전일치
        if (qCode && mCode && qCode === mCode) return { score: 100, matchedBy: "code_exact" };

        // 2. 이름 완전일치
        if (qName && mName && qName === mName) return { score: 95, matchedBy: "name_exact" };

        // 3. 코드 부분일치
        if (qCode && mCode && (qCode.includes(mCode) || mCode.includes(qCode))) {
          return { score: 88, matchedBy: "code_partial" };
        }

        // 4. 이름 포함 관계
        if (qName && mName && (mName.includes(qName) || qName.includes(mName))) {
          const ratio =
            Math.min(qName.length, mName.length) / Math.max(qName.length, mName.length);
          return { score: Math.round(70 + ratio * 20), matchedBy: "name_contains" };
        }

        // 5. Levenshtein 편집거리 (오타 허용)
        if (qName.length > 0 && mName.length > 0) {
          const dist = levenshtein(qName, mName);
          const maxLen = Math.max(qName.length, mName.length);
          const similarity = 1 - dist / maxLen;
          if (similarity > 0.7) {
            return { score: Math.round(60 + similarity * 25), matchedBy: "name_similar" };
          }
        }

        // 6. 토큰 중복 (어순 변경 대응)
        const qTokens = tokenize(qName);
        const mTokens = tokenize(mName);
        if (qTokens.length > 0 && mTokens.length > 0) {
          const common = qTokens.filter((t) =>
            mTokens.some((mt) => mt === t || mt.includes(t) || t.includes(mt)),
          );
          const overlap = common.length / Math.max(qTokens.length, mTokens.length);
          if (overlap > 0.3) {
            return { score: Math.round(30 + overlap * 30), matchedBy: "token_overlap" };
          }
        }

        return { score: 0, matchedBy: "none" };
      };

      // ─── 각 쿼리 매칭 ─────────────────────────────
      return input.items.map((item) => {
        const masters: Candidate[] =
          item.targetType === "material" ? materialRows : productRows;

        const scored = masters
          .map((m) => {
            const { score, matchedBy } = scoreMatch(item, m);
            return {
              id: m.id,
              code: m.code,
              name: m.name,
              score,
              matchedBy,
            };
          })
          .filter((c) => c.score > 20)
          .sort((a, b) => b.score - a.score)
          .slice(0, 5);

        const best = scored[0] || null;
        const confidence: "high" | "medium" | "low" | "none" = !best
          ? "none"
          : best.score >= 90
            ? "high"
            : best.score >= 60
              ? "medium"
              : "low";

        return {
          query: item.query,
          itemCode: item.itemCode,
          targetType: item.targetType,
          confidence,
          bestMatch: best,
          suggestions: scored,
        };
      });
    }),

  /**
   * ★ AI 매칭 (LLM 기반) — Phase B (2026-04-14)
   *
   * 규칙기반 matchItems 로 매칭 실패했거나 신뢰도 낮은 건을
   * GPT-4o-mini 에게 보내서 의미론적으로 매칭.
   *
   * 예:
   *   "우리집 밀가루 특 5kg" → "국산 밀가루 (MAT-001)"
   *   "소맥분" → "밀가루" (동의어)
   *   "가래떡용 쌀가루 고급" → "쌀가루 프리미엄 (MAT-025)"
   *
   * JSON schema output 으로 structured response 보장.
   * OPENAI_API_KEY 미설정 시 규칙기반 fallback.
   */
  matchItemsAI: tenantRequiredProcedure
    .input(
      z.object({
        items: z
          .array(
            z.object({
              targetType: z.enum(["material", "product"]),
              query: z.string(),
              itemCode: z.string().optional(),
              // 클라이언트가 이미 규칙기반으로 본 top-5 후보 (있으면 LLM 힌트로 사용)
              candidates: z
                .array(
                  z.object({
                    id: z.number(),
                    name: z.string(),
                    code: z.string().nullable().optional(),
                  }),
                )
                .optional(),
            }),
          )
          .min(1)
          .max(50), // LLM 배치는 비용/속도 고려 50건 제한
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");

      const { hMaterials, hProductsV2 } = await import("../../../drizzle/schema/schema_main");

      // 마스터 로드 (LLM context 로 넘김)
      const needMaterials = input.items.some((i) => i.targetType === "material");
      const needProducts = input.items.some((i) => i.targetType === "product");

      const materialRows = needMaterials
        ? await db
            .select({
              id: hMaterials.id,
              code: hMaterials.materialCode,
              name: hMaterials.materialName,
            })
            .from(hMaterials)
            .where(
              and(eq(hMaterials.tenantId, ctx.tenantId), eq(hMaterials.isActive, 1)),
            )
        : [];

      const productRows = needProducts
        ? await db
            .select({
              id: hProductsV2.id,
              code: hProductsV2.productCode,
              name: hProductsV2.productName,
            })
            .from(hProductsV2)
            .where(
              and(eq(hProductsV2.tenantId, ctx.tenantId), eq(hProductsV2.isActive, 1)),
            )
        : [];

      // LLM 호출
      const { invokeLLM } = await import("../../_core/llm");

      // 마스터가 너무 많으면 토큰 초과 방지를 위해 간소화
      const materialCatalog = materialRows
        .map((m) => `[mat-${m.id}] ${m.code || "-"} | ${m.name}`)
        .join("\n")
        .slice(0, 15000); // ~15KB
      const productCatalog = productRows
        .map((p) => `[prod-${p.id}] ${p.code || "-"} | ${p.name}`)
        .join("\n")
        .slice(0, 15000);

      const systemPrompt = `당신은 식품 제조 ERP 의 품목 매칭 전문가입니다.
사용자가 입력한 품목명(오타/자연어/동의어/브랜드명 가능)을 받아서
마스터 카탈로그에서 가장 일치하는 ID 를 찾아 반환합니다.

매칭 규칙:
1. 동의어 인식: "소맥분"=밀가루, "당근"=홍근, "쌀"=백미 등
2. 브랜드/일반 구분: "CJ 설탕"→"설탕", "오뚜기 케첩"→"케첩"
3. 스펙/포장 무시: "밀가루 1kg"와 "밀가루 5kg"는 같은 품목으로 취급
4. 오타 허용: "밀갈루"→"밀가루"
5. 확신이 없으면 confidence 를 낮게 주고 candidate IDs 를 여러개 제안`;

      const userPrompt = `=== 원재료 카탈로그 (material) ===
${materialCatalog || "(없음)"}

=== 제품 카탈로그 (product) ===
${productCatalog || "(없음)"}

=== 매칭 요청 ===
${input.items
  .map(
    (it, idx) =>
      `${idx + 1}. [${it.targetType}] "${it.query}"${it.itemCode ? ` (코드: ${it.itemCode})` : ""}`,
  )
  .join("\n")}

각 요청에 대해 가장 적합한 마스터 ID 를 반환하세요.
- match_id 는 카탈로그의 "[mat-XX]" 또는 "[prod-XX]" 에서 숫자 부분
- confidence 는 0-100
- 확신이 없으면 match_id 를 null`;

      try {
        const result = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          maxTokens: 4000,
          responseFormat: {
            type: "json_schema",
            json_schema: {
              name: "item_match_results",
              strict: true,
              schema: {
                type: "object",
                additionalProperties: false,
                required: ["matches"],
                properties: {
                  matches: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      required: ["index", "match_id", "confidence", "reason"],
                      properties: {
                        index: { type: "integer", description: "요청 순번 (1-based)" },
                        match_id: {
                          type: ["integer", "null"],
                          description: "매칭된 마스터 ID. 확신 없으면 null",
                        },
                        confidence: {
                          type: "integer",
                          minimum: 0,
                          maximum: 100,
                        },
                        reason: { type: "string", description: "매칭 근거 (한 줄)" },
                      },
                    },
                  },
                },
              },
            },
          },
        });

        const content = result.choices[0]?.message?.content;
        const parsed = typeof content === "string" ? JSON.parse(content) : { matches: [] };
        const matches: Array<{
          index: number;
          match_id: number | null;
          confidence: number;
          reason: string;
        }> = parsed.matches || [];

        // LLM 결과 → 클라이언트 응답 형식으로 변환
        return input.items.map((item, idx) => {
          const m = matches.find((x) => x.index === idx + 1);
          if (!m || m.match_id === null) {
            return {
              query: item.query,
              itemCode: item.itemCode,
              targetType: item.targetType,
              confidence: "none" as const,
              bestMatch: null,
              aiReason: m?.reason || "AI가 적합한 매칭을 찾지 못함",
            };
          }
          const masters = item.targetType === "material" ? materialRows : productRows;
          const found = masters.find((x) => x.id === m.match_id);
          if (!found) {
            return {
              query: item.query,
              itemCode: item.itemCode,
              targetType: item.targetType,
              confidence: "none" as const,
              bestMatch: null,
              aiReason: `AI 반환 ID ${m.match_id} 가 카탈로그에 없음`,
            };
          }
          const confidence: "high" | "medium" | "low" | "none" =
            m.confidence >= 85 ? "high" : m.confidence >= 60 ? "medium" : "low";
          return {
            query: item.query,
            itemCode: item.itemCode,
            targetType: item.targetType,
            confidence,
            bestMatch: {
              id: found.id,
              code: found.code,
              name: found.name,
              score: m.confidence,
              matchedBy: "ai_llm",
            },
            aiReason: m.reason,
          };
        });
      } catch (err: any) {
        console.error("[matchItemsAI] LLM 호출 실패:", err);
        throw new Error(
          `AI 매칭 실패: ${err?.message || "알 수 없는 오류"}. OPENAI_API_KEY 설정을 확인하세요.`,
        );
      }
    }),
});

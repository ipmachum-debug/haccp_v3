/**
 * AI 생산입력 파서 라우터 (Phase 2: 학습 기반 개선)
 * 
 * 워크플로우:
 * 1. 사용자 입력 → 학습 사전 조회 (즉시 매칭) → LLM 파싱 → DB fuzzy 매칭
 * 2. 사용자 교정 시 alias → product 매핑을 DB에 저장 (학습)
 * 3. 다음 입력 시 학습된 alias가 우선 적용 (AI 호출 불필요 → 빠름 + 무비용)
 * 4. 파싱 히스토리 저장 → 정확도 추적
 */
import { z } from "zod";
import { tenantRequiredProcedure, router } from "../../_core/trpc";
import { invokeLLM } from "../../_core/llm";
import { ENV } from "../../_core/env";
import { getDb, getRawConnection } from "../../db";
import { itemMaster, productSkus } from "../../../drizzle/schema";
import { eq, and, like, or, sql } from "drizzle-orm";

// ========================================================
// 유틸: 정규화 + 한글 자모 분리
// ========================================================
function normalizeAlias(str: string): string {
  return str.replace(/\s+/g, "").replace(/[()（）]/g, "").toLowerCase().trim();
}

function decomposeHangul(str: string): string {
  return str.normalize("NFD").replace(/[\u1160-\u11FF]/g, "").toLowerCase();
}

function fuzzyScore(query: string, target: string): number {
  const q = query.replace(/\s+/g, "").toLowerCase();
  const t = target.replace(/\s+/g, "").toLowerCase();
  if (t === q) return 100;
  if (t.includes(q)) return 90;
  if (q.includes(t)) return 80;
  const dq = decomposeHangul(q);
  const dt = decomposeHangul(t);
  if (dt.includes(dq)) return 75;
  if (dq.includes(dt)) return 70;
  const qTokens = q.split(/[^가-힣a-z0-9]+/).filter(Boolean);
  const matchedTokens = qTokens.filter(token => t.includes(token));
  if (matchedTokens.length > 0) {
    return 50 + (matchedTokens.length / qTokens.length) * 30;
  }
  const maxLen = Math.max(q.length, t.length);
  if (maxLen === 0) return 0;
  let matches = 0;
  for (let i = 0; i < Math.min(q.length, t.length); i++) {
    if (q[i] === t[i]) matches++;
  }
  return (matches / maxLen) * 50;
}

// ========================================================
// AI 파싱 프롬프트
// ========================================================
const PARSE_SYSTEM_PROMPT = `당신은 식품 제조업체의 생산 계획 텍스트를 파싱하는 전문 AI입니다.
사용자가 입력한 자연어 텍스트에서 생산 항목을 추출하세요.

규칙:
1. 제품명과 수량(kg)을 정확히 추출합니다.
2. "콩고물쑥떡 150kg" → 제품명: "콩고물쑥떡", 수량: 150
3. 약어나 줄임말도 이해합니다 (예: "초코롤" → "롤크림떡(초코)")
4. 수량 단위가 없으면 kg으로 가정합니다.
5. 괄호 안의 텍스트는 규격/맛 변형입니다 (예: "롤크림떡(딸기)")
6. 여러 제품은 쉼표, 줄바꿈, "그리고" 등으로 구분됩니다.
7. "전체", "합계", "총" 같은 단어는 무시합니다.

반드시 아래 JSON 형식으로만 응답하세요:
{
  "items": [
    {
      "rawName": "사용자가 입력한 원래 텍스트",
      "parsedName": "정제된 제품명",
      "quantityKg": 숫자,
      "confidence": 0.0~1.0
    }
  ],
  "unparsedText": "파싱하지 못한 나머지 텍스트 (없으면 빈 문자열)"
}`;

// ========================================================
// 학습 사전 조회
// ========================================================
async function getLearnedAliases(tenantId: number): Promise<
  Map<string, { productId: number; productName: string; defaultQtyKg: number | null; useCount: number }>
> {
  const map = new Map();
  try {
    const pool = await getRawConnection();
    const [rows] = await pool.execute(
      `SELECT normalized_alias, product_id, product_name, default_quantity_kg, use_count
       FROM ai_parse_corrections
       WHERE tenant_id = ?
       ORDER BY use_count DESC`,
      [tenantId]
    );
    for (const row of rows as any[]) {
      // 가장 많이 사용된 매핑이 우선
      if (!map.has(row.normalized_alias)) {
        map.set(row.normalized_alias, {
          productId: Number(row.product_id),
          productName: row.product_name,
          defaultQtyKg: row.default_quantity_kg ? Number(row.default_quantity_kg) : null,
          useCount: Number(row.use_count),
        });
      }
    }
  } catch (err) {
    console.error("[AI Parser] 학습 사전 로드 실패:", err);
  }
  return map;
}

// ========================================================
// 라우터
// ========================================================
export const aiProductionParserRouter = router({
  // ============================================================
  // 1. 자연어 텍스트 → 생산 항목 파싱 (학습 우선 → LLM → regex → DB 매칭)
  // ============================================================
  parseProductionText: tenantRequiredProcedure
    .input(z.object({
      text: z.string().min(1).max(5000),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      const db = await getDb();

      // Step 1: 학습 사전 로드
      const learnedAliases = await getLearnedAliases(tenantId);

      // Step 2: DB 제품/SKU 목록
      const products = await db.select({
        id: itemMaster.id,
        itemCode: itemMaster.itemCode,
        itemName: itemMaster.itemName,
        itemType: itemMaster.itemType,
        baseUnit: itemMaster.baseUnit,
      })
        .from(itemMaster)
        .where(and(
          eq(itemMaster.tenantId, tenantId),
          eq(itemMaster.isActive, 1),
          or(
            eq(itemMaster.itemType, "own_product"),
            eq(itemMaster.itemType, "external_product"),
          )
        ));

      // v1 퇴출 완료: item_master.id = h_products_v2.id이므로 매핑 불필요
      // resolveProductId는 입력값을 그대로 반환
      const resolveProductId = (itemId: number): number => itemId;

      const skus = await db.select({
        id: productSkus.id,
        itemId: productSkus.itemId,
        skuCode: productSkus.skuCode,
        skuName: productSkus.skuName,
        netWeightG: productSkus.netWeightG,
        piecesPerPack: productSkus.piecesPerPack,
        packsPerBox: productSkus.packsPerBox,
        salesUnit: productSkus.salesUnit,
        kgPerSalesUnit: productSkus.kgPerSalesUnit,
        isDefault: productSkus.isDefault,
      })
        .from(productSkus)
        .where(and(
          eq(productSkus.tenantId, tenantId),
          eq(productSkus.isActive, 1),
        ));

      // Step 3: LLM 또는 regex 파싱
      let parsedItems: Array<{
        rawName: string;
        parsedName: string;
        quantityKg: number;
        confidence: number;
      }> = [];
      let unparsedText = "";
      let parseMethod: "ai" | "regex" | "learned" = "ai";

      if (ENV.forgeApiKey) {
        try {
          const productNameList = products.map(p => p.itemName).join(", ");
          const userPrompt = `현재 등록된 제품 목록: [${productNameList}]\n\n사용자 입력:\n${input.text}`;
          const result = await invokeLLM({
            messages: [
              { role: "system", content: PARSE_SYSTEM_PROMPT },
              { role: "user", content: userPrompt },
            ],
            maxTokens: 1500,
            responseFormat: { type: "json_object" },
          });
          const content = result.choices[0]?.message?.content;
          if (typeof content === "string") {
            const parsed = JSON.parse(content);
            if (Array.isArray(parsed.items)) {
              parsedItems = parsed.items;
            }
            unparsedText = parsed.unparsedText || "";
          }
        } catch (error: any) {
          console.error("[AI Production Parser] LLM 파싱 실패, regex 폴백:", error?.message);
          parseMethod = "regex";
        }
      } else {
        parseMethod = "regex";
      }

      if (parseMethod === "regex" || parsedItems.length === 0) {
        parseMethod = "regex";
        parsedItems = regexParseProduction(input.text);
      }

      // Step 4: 학습 사전 우선 매칭 → 나머지 fuzzy 매칭
      let learnedMatchCount = 0;
      const matchedItems = parsedItems.map(item => {
        const normalizedInput = normalizeAlias(item.parsedName);

        // (A) 학습 사전 조회 - 정확 매치 우선
        const learned = learnedAliases.get(normalizedInput);
        if (learned) {
          learnedMatchCount++;
          const product = products.find(p => Number(p.id) === learned.productId);
          const productSkuList = skus.filter(s => Number(s.itemId) === learned.productId);

          // 학습된 기본 수량이 있고 현재 수량이 0이면 학습된 값 사용
          const qty = item.quantityKg > 0 ? item.quantityKg : (learned.defaultQtyKg || 0);

          return {
            rawName: item.rawName,
            parsedName: item.parsedName,
            quantityKg: qty,
            confidence: 1.0,
            matchSource: "learned" as const,
            learnedUseCount: learned.useCount,
            matched: {
              productId: resolveProductId(learned.productId),
              productName: learned.productName,
              itemCode: product?.itemCode || "",
              matchScore: 100,
              skus: productSkuList.map(s => ({
                id: Number(s.id),
                skuCode: s.skuCode,
                skuName: s.skuName,
                netWeightG: s.netWeightG ? Number(s.netWeightG) : null,
                piecesPerPack: Number(s.piecesPerPack || 1),
                packsPerBox: Number(s.packsPerBox || 1),
                salesUnit: s.salesUnit || "kg",
                kgPerSalesUnit: s.kgPerSalesUnit ? Number(s.kgPerSalesUnit) : 1,
                isDefault: Number(s.isDefault || 0),
              })),
            },
            candidates: [] as Array<{
              productId: number;
              productName: string;
              itemCode: string;
              matchScore: number;
            }>,
          };
        }

        // (B) 학습 사전 부분 매칭 (normalized alias가 포함관계)
        let bestLearned: { productId: number; productName: string; score: number } | null = null;
        for (const [alias, data] of Array.from(learnedAliases)) {
          if (alias.includes(normalizedInput) || normalizedInput.includes(alias)) {
            const score = alias === normalizedInput ? 100 : 85;
            if (!bestLearned || score > bestLearned.score) {
              bestLearned = { productId: data.productId, productName: data.productName, score };
            }
          }
        }

        // (C) Fuzzy DB 매칭
        const matches = products
          .map(product => ({
            product,
            score: fuzzyScore(item.parsedName, product.itemName),
          }))
          .filter(m => m.score >= 40)
          .sort((a, b) => b.score - a.score);

        // 학습 부분매칭이 fuzzy보다 좋으면 학습 결과 우선
        if (bestLearned && (!matches[0] || bestLearned.score > matches[0].score)) {
          const product = products.find(p => Number(p.id) === bestLearned!.productId);
          const productSkuList = skus.filter(s => Number(s.itemId) === bestLearned!.productId);
          learnedMatchCount++;
          return {
            rawName: item.rawName,
            parsedName: item.parsedName,
            quantityKg: item.quantityKg,
            confidence: item.confidence,
            matchSource: "learned" as const,
            learnedUseCount: 0,
            matched: {
              productId: resolveProductId(bestLearned.productId),
              productName: bestLearned.productName,
              itemCode: product?.itemCode || "",
              matchScore: bestLearned.score,
              skus: productSkuList.map(s => ({
                id: Number(s.id),
                skuCode: s.skuCode,
                skuName: s.skuName,
                netWeightG: s.netWeightG ? Number(s.netWeightG) : null,
                piecesPerPack: Number(s.piecesPerPack || 1),
                packsPerBox: Number(s.packsPerBox || 1),
                salesUnit: s.salesUnit || "kg",
                kgPerSalesUnit: s.kgPerSalesUnit ? Number(s.kgPerSalesUnit) : 1,
                isDefault: Number(s.isDefault || 0),
              })),
            },
            candidates: matches.slice(0, 5).map(m => ({
              productId: resolveProductId(Number(m.product.id)),
              productName: m.product.itemName,
              itemCode: m.product.itemCode,
              matchScore: m.score,
            })),
          };
        }

        // (D) 순수 fuzzy 매칭 결과
        const bestMatch = matches[0];
        const productSkuList = bestMatch
          ? skus.filter(s => Number(s.itemId) === Number(bestMatch.product.id))
          : [];

        return {
          rawName: item.rawName,
          parsedName: item.parsedName,
          quantityKg: item.quantityKg,
          confidence: item.confidence,
          matchSource: "fuzzy" as const,
          learnedUseCount: 0,
          matched: bestMatch ? {
            productId: resolveProductId(Number(bestMatch.product.id)),
            productName: bestMatch.product.itemName,
            itemCode: bestMatch.product.itemCode,
            matchScore: bestMatch.score,
            skus: productSkuList.map(s => ({
              id: Number(s.id),
              skuCode: s.skuCode,
              skuName: s.skuName,
              netWeightG: s.netWeightG ? Number(s.netWeightG) : null,
              piecesPerPack: Number(s.piecesPerPack || 1),
              packsPerBox: Number(s.packsPerBox || 1),
              salesUnit: s.salesUnit || "kg",
              kgPerSalesUnit: s.kgPerSalesUnit ? Number(s.kgPerSalesUnit) : 1,
              isDefault: Number(s.isDefault || 0),
            })),
          } : null,
          candidates: matches.slice(0, 5).map(m => ({
            productId: resolveProductId(Number(m.product.id)),
            productName: m.product.itemName,
            itemCode: m.product.itemCode,
            matchScore: m.score,
          })),
        };
      });

      // 전체가 학습 매칭이면 parseMethod를 learned로 변경
      if (learnedMatchCount === matchedItems.length && learnedMatchCount > 0) {
        parseMethod = "learned";
      }

      return {
        success: true,
        parseMethod,
        items: matchedItems,
        unparsedText,
        totalItems: matchedItems.length,
        matchedCount: matchedItems.filter(i => i.matched).length,
        unmatchedCount: matchedItems.filter(i => !i.matched).length,
        learnedMatchCount,
        totalLearnedAliases: learnedAliases.size,
      };
    }),

  // ============================================================
  // 2. 교정 저장 (학습) - 사용자가 확인/수정한 매핑을 저장
  // ============================================================
  saveCorrections: tenantRequiredProcedure
    .input(z.object({
      // 원본 입력 텍스트 (히스토리용)
      inputText: z.string(),
      // 파싱 방법
      parseMethod: z.enum(["ai", "regex", "learned"]),
      // 확인된 항목 배열
      corrections: z.array(z.object({
        rawName: z.string(),         // AI가 파싱한 원래 이름
        parsedName: z.string(),      // 정제된 이름
        productId: z.number(),       // 최종 매칭 제품 ID
        productName: z.string(),     // 최종 매칭 제품명
        quantityKg: z.number(),      // 수량
        wasCorrected: z.boolean(),   // 사용자가 수정했는지
      })),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      const userId = ctx.user.id;

      try {
        const pool = await getRawConnection();

        // (1) 교정 사전 업데이트
        let savedCount = 0;
        for (const correction of input.corrections) {
          const aliases = new Set<string>();
          // rawName과 parsedName 모두 학습
          aliases.add(normalizeAlias(correction.rawName));
          aliases.add(normalizeAlias(correction.parsedName));
          // 제품명 자체도 alias로 등록 (정확 매치 보장)
          aliases.add(normalizeAlias(correction.productName));

          for (const alias of Array.from(aliases)) {
            if (!alias || alias.length < 2) continue;
            try {
              await pool.execute(
                `INSERT INTO ai_parse_corrections
                   (tenant_id, input_alias, normalized_alias, product_id, product_name, default_quantity_kg, use_count, corrected_by)
                 VALUES (?, ?, ?, ?, ?, ?, 1, ?)
                 ON DUPLICATE KEY UPDATE
                   product_name = VALUES(product_name),
                   default_quantity_kg = COALESCE(VALUES(default_quantity_kg), default_quantity_kg),
                   use_count = use_count + 1,
                   corrected_by = VALUES(corrected_by),
                   updated_at = NOW()`,
                [
                  tenantId,
                  correction.rawName.slice(0, 300),
                  alias.slice(0, 300),
                  correction.productId,
                  correction.productName,
                  correction.quantityKg > 0 ? correction.quantityKg : null,
                  userId,
                ]
              );
              savedCount++;
            } catch (aliasErr: any) {
              console.error(`[AI Parser] alias 저장 실패: ${alias}`, aliasErr?.message);
            }
          }
        }

        // (2) 파싱 히스토리 저장
        const correctionCount = input.corrections.filter(c => c.wasCorrected).length;
        const totalItems = input.corrections.length;
        const accuracy = totalItems > 0 ? (totalItems - correctionCount) / totalItems : 1;

        await pool.execute(
          `INSERT INTO ai_parse_history
             (tenant_id, input_text, parse_method, confirmed_result, correction_count, total_items, accuracy, user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            tenantId,
            input.inputText.slice(0, 5000),
            input.parseMethod,
            JSON.stringify(input.corrections),
            correctionCount,
            totalItems,
            accuracy,
            userId,
          ]
        );

        console.log(`[AI Parser] 학습 저장 완료: ${savedCount}개 alias, 정확도 ${(accuracy * 100).toFixed(1)}%`);

        return {
          success: true,
          savedAliasCount: savedCount,
          correctionCount,
          accuracy,
          message: correctionCount > 0
            ? `${correctionCount}개 교정이 학습되었습니다. 다음부터 자동 적용됩니다!`
            : "모든 항목이 정확하게 매칭되었습니다.",
        };
      } catch (err: any) {
        console.error("[AI Parser] 학습 저장 실패:", err?.message);
        return {
          success: false,
          savedAliasCount: 0,
          correctionCount: 0,
          accuracy: 0,
          message: "학습 데이터 저장 중 오류가 발생했습니다.",
        };
      }
    }),

  // ============================================================
  // 3. 학습 통계 조회
  // ============================================================
  getLearningStats: tenantRequiredProcedure
    .query(async ({ ctx }) => {
      const tenantId = ctx.tenantId;
      try {
        const pool = await getRawConnection();

        // 학습된 alias 수
        const [aliasRows] = await pool.execute(
          `SELECT COUNT(*) as cnt, SUM(use_count) as totalUses FROM ai_parse_corrections WHERE tenant_id = ?`,
          [tenantId]
        );
        const aliasCount = Number((aliasRows as any[])[0]?.cnt || 0);
        const totalUses = Number((aliasRows as any[])[0]?.totalUses || 0);

        // 최근 파싱 정확도 (최근 20건)
        const [historyRows] = await pool.execute(
          `SELECT accuracy, correction_count, total_items, parse_method, created_at
           FROM ai_parse_history
           WHERE tenant_id = ?
           ORDER BY created_at DESC
           LIMIT 20`,
          [tenantId]
        );
        const history = (historyRows as any[]).map(r => ({
          accuracy: Number(r.accuracy || 0),
          correctionCount: Number(r.correction_count),
          totalItems: Number(r.total_items),
          parseMethod: r.parse_method,
          date: r.created_at,
        }));

        const avgAccuracy = history.length > 0
          ? history.reduce((s, h) => s + h.accuracy, 0) / history.length
          : 0;

        // 자주 사용되는 alias TOP 10
        const [topAliasRows] = await pool.execute(
          `SELECT input_alias, product_name, use_count
           FROM ai_parse_corrections
           WHERE tenant_id = ?
           ORDER BY use_count DESC
           LIMIT 10`,
          [tenantId]
        );
        const topAliases = (topAliasRows as any[]).map(r => ({
          alias: r.input_alias,
          productName: r.product_name,
          useCount: Number(r.use_count),
        }));

        return {
          aliasCount,
          totalUses,
          avgAccuracy,
          recentHistory: history,
          topAliases,
        };
      } catch (err) {
        console.error("[AI Parser] 학습 통계 조회 실패:", err);
        return {
          aliasCount: 0,
          totalUses: 0,
          avgAccuracy: 0,
          recentHistory: [],
          topAliases: [],
        };
      }
    }),

  // ============================================================
  // 4. 제품 검색 (수동 매칭용)
  // ============================================================
  searchProducts: tenantRequiredProcedure
    .input(z.object({
      query: z.string().min(1).max(200),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      const tenantId = ctx.tenantId;
      const results = await db.select({
        id: itemMaster.id,
        itemCode: itemMaster.itemCode,
        itemName: itemMaster.itemName,
        itemType: itemMaster.itemType,
      })
        .from(itemMaster)
        .where(and(
          eq(itemMaster.tenantId, tenantId),
          eq(itemMaster.isActive, 1),
          or(
            eq(itemMaster.itemType, "own_product"),
            eq(itemMaster.itemType, "external_product"),
          ),
          or(
            like(itemMaster.itemName, `%${input.query}%`),
            like(itemMaster.itemCode, `%${input.query}%`)
          )
        ))
        .limit(10);

      // v1 퇴출 완료: item_master.id = h_products_v2.id → 매핑 불필요
      return results.map(r => ({
        productId: Number(r.id),
        productName: r.itemName,
        itemCode: r.itemCode,
      }));
    }),
});

// ========================================================
// Regex 폴백 파서
// ========================================================
function regexParseProduction(text: string): Array<{
  rawName: string;
  parsedName: string;
  quantityKg: number;
  confidence: number;
}> {
  const items: Array<{
    rawName: string;
    parsedName: string;
    quantityKg: number;
    confidence: number;
  }> = [];

  const lines = text.split(/[,\n;]+/).map(l => l.trim()).filter(Boolean);

  for (const line of lines) {
    const patterns = [
      /^(.+?)\s+(\d+(?:\.\d+)?)\s*(?:kg|킬로|키로)?$/i,
      /^(\d+(?:\.\d+)?)\s*(?:kg|킬로|키로)?\s+(.+?)$/i,
      /^([가-힣a-zA-Z()（）\s]+)$/,
    ];

    let matched = false;
    for (const pattern of patterns) {
      const m = line.match(pattern);
      if (m) {
        if (pattern === patterns[0]) {
          items.push({ rawName: line, parsedName: m[1].trim(), quantityKg: parseFloat(m[2]), confidence: 0.7 });
        } else if (pattern === patterns[1]) {
          items.push({ rawName: line, parsedName: m[2].trim(), quantityKg: parseFloat(m[1]), confidence: 0.6 });
        } else {
          items.push({ rawName: line, parsedName: m[1].trim(), quantityKg: 0, confidence: 0.3 });
        }
        matched = true;
        break;
      }
    }

    if (!matched && line.length > 1) {
      const glued = line.match(/^([가-힣a-zA-Z()（）]+)(\d+(?:\.\d+)?)\s*(?:kg|킬로|키로)?$/i);
      if (glued) {
        items.push({ rawName: line, parsedName: glued[1].trim(), quantityKg: parseFloat(glued[2]), confidence: 0.5 });
      }
    }
  }

  return items;
}

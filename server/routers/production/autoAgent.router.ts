/**
 * 생산 자동화 에이전트 라우터
 *
 * 자연어 입력 → 파싱 → 검증(preview) → 실행(execute)
 * "오늘 초코크림 케이크 3,200kg 생산, 시작 08:00" → 배치+CCP+체크리스트 자동 생성
 *
 * ★ DB 접근: getRawConnection() + pool.execute(sql, [params]) 패턴 사용
 *   (getDb()는 drizzle 인스턴스라 위치 파라미터 쿼리 미지원)
 *
 * 2026-08-18 (다음 세션 TODO #1) — 제품 수정 UI 지원:
 *   - preview 가 매칭 후보(candidates)와 SKU 목록을 함께 반환 → 잘못 매칭된 제품 교체 가능
 *   - searchProducts / listSkus 쿼리 추가 → 프론트엔드 검색 콤보박스
 *   - CCP 매핑 사전 검증(validateProductCcpMapping) 을 preview 에 반영
 *     (배치 생성 fail-fast 와 동일 기준 → "검증 통과했는데 실행 실패" 방지)
 *   - 체크리스트 카운트를 실제 파이프라인 STEP 10 기준(checklist_templates.frequency)으로 정정
 */
import { z } from "zod";
import { router, tenantRequiredProcedure } from "../../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getRawConnection } from "../../db";

/** 제품 매칭 후보 (프론트엔드 교체 UI 용) */
export interface ProductCandidate {
  productId: number;
  productName: string;
  productCode: string | null;
  score: number;
}

export const autoAgentRouter = router({
  preview: tenantRequiredProcedure
    .input(z.object({
      text: z.string().min(1).max(5000),
      workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId!;
      const parsed = await parseAndMatchProducts(input.text, tenantId);

      if (!parsed?.items?.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "입력에서 생산 정보를 인식할 수 없습니다. 예: '초코크림 케이크 3200kg'",
        });
      }

      // 파이프라인 STEP 10 이 실제로 생성할 체크리스트 템플릿 수 (테넌트 공통)
      const checklistCount = await countBatchCreateChecklistTemplates(tenantId);

      const plans = [];

      for (const item of parsed.items) {
        const productId = item.matched?.productId || item.productId;
        const productName = item.matched?.productName || item.productName || item.rawName;
        const quantity = item.quantityKg || item.quantity || 0;
        const candidates: ProductCandidate[] = item.candidates || [];

        if (!productId) {
          plans.push({
            status: "error" as const,
            rawName: item.rawName || "",
            productName: item.rawName || productName || "알 수 없음",
            quantity,
            unit: "kg",
            candidates,
            skus: [],
            error: `제품 "${item.rawName || productName}"을(를) 찾을 수 없습니다. 아래에서 직접 선택하세요.`,
          });
          continue;
        }

        const detail = await buildPlanDetail(tenantId, productId, quantity);

        plans.push({
          status: detail.blocked ? ("error" as const) : ("ready" as const),
          rawName: item.rawName || "",
          productId,
          productName,
          productCode: item.matched?.productCode ?? null,
          matchScore: item.matchScore ?? null,
          quantity,
          unit: "kg",
          bomInfo: detail.bomInfo,
          ccpCount: detail.ccpCount,
          ccpWarning: detail.ccpWarning,
          checklistCount,
          candidates,
          skus: detail.skus,
          startTime: input.startTime || parsed.startTime || "09:00",
          error: detail.blocked ? detail.ccpWarning : undefined,
        });
      }

      return {
        workDate: input.workDate || new Date().toISOString().slice(0, 10),
        startTime: input.startTime || parsed.startTime || "09:00",
        plans,
        rawParsed: parsed,
      };
    }),

  /**
   * 제품 검색 — 잘못 매칭된 제품을 사람이 직접 교체할 때 사용
   * (검색어가 없으면 이름순 상위 N건)
   */
  searchProducts: tenantRequiredProcedure
    .input(z.object({
      q: z.string().max(200).optional(),
      limit: z.number().int().min(1).max(100).default(30),
    }))
    .query(async ({ input, ctx }) => {
      const pool = await getRawConnection();
      const q = (input.q || "").trim();
      const params: any[] = [ctx.tenantId];
      let where = `WHERE tenant_id = ? AND is_active = 1`;
      if (q) {
        where += ` AND (product_name LIKE ? OR product_code LIKE ?)`;
        params.push(`%${q}%`, `%${q}%`);
      }
      const [rows]: any = await pool.execute(
        `SELECT id, product_name, product_code, category, unit
         FROM h_products_v2
         ${where}
         ORDER BY product_name
         LIMIT ${input.limit}`,
        params,
      );
      return (rows as any[]).map((r) => ({
        productId: Number(r.id),
        productName: r.product_name,
        productCode: r.product_code ?? null,
        category: r.category ?? null,
        unit: r.unit ?? null,
      }));
    }),

  /** 제품 1건의 계획 상세 재계산 (제품 교체 / 수량 변경 시 프론트엔드에서 호출) */
  planDetail: tenantRequiredProcedure
    .input(z.object({
      productId: z.number().int().positive(),
      quantity: z.number().nonnegative().default(0),
    }))
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId!;
      const pool = await getRawConnection();
      const [rows]: any = await pool.execute(
        `SELECT id, product_name, product_code FROM h_products_v2
         WHERE tenant_id = ? AND id = ? LIMIT 1`,
        [tenantId, input.productId],
      );
      const product = (rows as any[])[0];
      if (!product) {
        throw new TRPCError({ code: "NOT_FOUND", message: "제품을 찾을 수 없습니다." });
      }
      const detail = await buildPlanDetail(tenantId, input.productId, input.quantity);
      const checklistCount = await countBatchCreateChecklistTemplates(tenantId);
      return {
        productId: Number(product.id),
        productName: product.product_name,
        productCode: product.product_code ?? null,
        checklistCount,
        ...detail,
      };
    }),

  /** 제품의 SKU 목록 (생산수량 SKU 배분 UI 용) */
  listSkus: tenantRequiredProcedure
    .input(z.object({ productId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      return await loadSkus(ctx.tenantId!, input.productId);
    }),

  getSiteId: tenantRequiredProcedure
    .query(async ({ ctx }) => {
      const pool = await getRawConnection();
      const [rows]: any = await pool.execute(
        `SELECT id FROM h_sites WHERE tenant_id = ? LIMIT 1`,
        [ctx.tenantId]
      );
      return { siteId: rows?.[0]?.id || 1 };
    }),
});

// ─── 유틸 함수 ───

function normalize(s: string): string {
  return s.replace(/[\s\(\)\[\]·\-_]/g, "").toLowerCase();
}

function tokenize(s: string): string[] {
  return s.split(/[\s\(\)\[\]·\-_,]+/).filter(t => t.length > 0).map(t => t.toLowerCase());
}

function tokenMatchScore(inputTokens: string[], dbName: string): number {
  const dbNorm = normalize(dbName);
  const dbLower = dbName.toLowerCase();
  let matched = 0;
  for (const token of inputTokens) {
    if (dbNorm.includes(token) || dbLower.includes(token)) matched++;
  }
  if (matched === 0) return 0;
  return (matched / inputTokens.length) * 70 + (matched / Math.max(tokenize(dbName).length, 1)) * 30;
}

/** 입력 이름 1건에 대한 제품 매칭 점수 계산 (완전일치 100 → 부분포함 → 토큰) */
export function scoreProduct(rawName: string, productName: string): number {
  const input = normalize(rawName);
  const pName = normalize(productName);
  if (!input || !pName) return 0;
  if (pName === input) return 100;

  let score = 0;
  if (pName.includes(input) || input.includes(pName)) {
    score = (Math.min(input.length, pName.length) / Math.max(input.length, pName.length)) * 85;
  }
  const inputTokens = tokenize(rawName);
  if (inputTokens.length >= 1) {
    score = Math.max(score, tokenMatchScore(inputTokens, productName));
  }
  return score;
}

/** 매칭 채택 최소 점수 — 이 아래는 "찾을 수 없음" 처리하고 후보만 제시 */
const MATCH_THRESHOLD = 30;
/** 프론트엔드 교체 UI 에 노출할 후보 최대 개수 */
const CANDIDATE_LIMIT = 5;

/** STEP 10 (autoCreateChecklistsForBatch) 이 실제로 생성할 템플릿 수 */
async function countBatchCreateChecklistTemplates(tenantId: number): Promise<number> {
  try {
    const pool = await getRawConnection();
    const [rows]: any = await pool.execute(
      `SELECT COUNT(*) AS cnt FROM checklist_templates
       WHERE tenant_id = ? AND is_active = 1 AND frequency = 'batch_create'`,
      [tenantId],
    );
    return Number((rows as any[])[0]?.cnt || 0);
  } catch {
    return 0;
  }
}

/**
 * 제품의 SKU 목록.
 *
 * ★ product_skus.item_id 는 item_master.id 를 가리키는데, 환경에 따라
 *   h_products_v2.id 와 값이 일치하기도 하고(통합 마스터) 아니기도 하다.
 *   DailyBatchCreate 화면은 품목명 매칭으로 우회하고 있으므로
 *   여기서는 두 경로(id 직접 / 품목명 일치)를 모두 허용해 누락을 막는다.
 */
async function loadSkus(tenantId: number, productId: number) {
  try {
    const pool = await getRawConnection();
    const [rows]: any = await pool.execute(
      `SELECT ps.id, ps.sku_code, ps.sku_name, ps.kg_per_sales_unit, ps.sales_unit, ps.is_default
         FROM product_skus ps
         LEFT JOIN item_master im
           ON im.id = ps.item_id AND im.tenant_id = ps.tenant_id
        WHERE ps.tenant_id = ?
          AND ps.is_active = 1
          AND (
            ps.item_id = ?
            OR im.item_name = (SELECT product_name FROM h_products_v2 WHERE id = ? AND tenant_id = ?)
          )
        ORDER BY ps.is_default DESC, ps.sku_code`,
      [tenantId, productId, productId, tenantId],
    );
    return (rows as any[]).map((r) => ({
      skuId: Number(r.id),
      skuCode: r.sku_code,
      skuName: r.sku_name,
      kgPerSalesUnit: r.kg_per_sales_unit != null ? Number(r.kg_per_sales_unit) : null,
      salesUnit: r.sales_unit ?? null,
      isDefault: Number(r.is_default || 0) === 1,
    }));
  } catch {
    return [];
  }
}

/** 제품 1건의 BOM / CCP / SKU 계획 상세 */
async function buildPlanDetail(tenantId: number, productId: number, quantity: number) {
  const pool = await getRawConnection();

  // BOM 조회 (APPROVED 버전 우선 — 배치 생성이 사용하는 기준과 동일)
  let bomInfo: { batchKg: number; batchCount: number; versionId: number } | null = null;
  try {
    const [bomRows]: any = await pool.execute(
      `SELECT v.batch_target_kg, v.id AS version_id
       FROM h_mf_reports r
       JOIN h_mf_report_versions v ON v.mf_report_id = r.id
       WHERE r.tenant_id = ? AND r.product_id = ?
       ORDER BY (v.approval_status = 'APPROVED') DESC, v.version_no DESC
       LIMIT 1`,
      [tenantId, productId],
    );
    if (bomRows?.[0]) {
      const batchKg = Number(bomRows[0].batch_target_kg) || 0;
      const batchCount = batchKg > 0 ? Math.ceil(quantity / batchKg) : 1;
      bomInfo = { batchKg, batchCount, versionId: Number(bomRows[0].version_id) };
    }
  } catch {}

  // CCP 매핑 검증 — 배치 생성(fail-fast)과 동일 기준
  let ccpCount = 0;
  let ccpWarning: string | undefined;
  let blocked = false;
  try {
    const { validateProductCcpMapping } = await import("../../services/validateProductCcpMapping");
    const validation = await validateProductCcpMapping({
      productId,
      productName: `제품 #${productId}`,
      tenantId,
    });
    ccpCount = validation.bomMappingCount + validation.manualMappingCount
      + (validation.hasMetalDetection ? 1 : 0);
    if (!validation.valid) {
      blocked = true;
      ccpWarning = validation.message || "CCP 공정그룹 매핑이 없어 배치를 생성할 수 없습니다.";
    }
  } catch (err: any) {
    // 검증 자체가 실패하면 차단하지 않고 경고만 (배치 생성 시 재검증됨)
    ccpWarning = `CCP 매핑 확인 실패: ${err?.message || err}`;
  }

  const skus = await loadSkus(tenantId, productId);

  return { bomInfo, ccpCount, ccpWarning, blocked, skus };
}

async function parseAndMatchProducts(text: string, tenantId: number) {
  const items: any[] = [];
  const lines = text.split(/[,\n]/);
  for (const line of lines) {
    const match = line.match(/(.+?)\s*([\d,]+)\s*(?:kg|킬로)/i);
    if (match) {
      items.push({
        rawName: match[1].trim().replace(/^오늘\s*생산\s*:?\s*/i, "").replace(/^생산\s*:?\s*/i, "").trim(),
        quantityKg: Number(match[2].replace(/,/g, "")),
      });
    }
  }
  const timeMatch = text.match(/(\d{1,2}):(\d{2})/);

  if (items.length > 0) {
    const pool = await getRawConnection();
    let allProducts: any[] = [];
    try {
      const [productRows]: any = await pool.execute(
        `SELECT id, product_name, product_code FROM h_products_v2
         WHERE tenant_id = ? AND is_active = 1`,
        [tenantId]
      );
      allProducts = productRows || [];
    } catch {}

    for (const item of items) {
      // 전 제품에 대해 점수를 매기고 상위 N건을 후보로 보관 (프론트엔드 교체 UI)
      const scored: ProductCandidate[] = [];
      for (const p of allProducts) {
        const score = scoreProduct(item.rawName, p.product_name);
        if (score > 0) {
          scored.push({
            productId: Number(p.id),
            productName: p.product_name,
            productCode: p.product_code ?? null,
            score: Math.round(score),
          });
        }
      }
      scored.sort((a, b) => b.score - a.score);
      item.candidates = scored.slice(0, CANDIDATE_LIMIT);

      const best = scored[0];
      if (best && best.score >= MATCH_THRESHOLD) {
        item.matched = {
          productId: best.productId,
          productName: best.productName,
          productCode: best.productCode,
        };
        item.productId = best.productId;
        item.productName = best.productName;
        item.matchScore = best.score;
      }
    }
  }

  return {
    items,
    startTime: timeMatch ? `${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}` : undefined,
  };
}

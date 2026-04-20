/**
 * AI SKU 매칭 서비스 (Phase 8+)
 *
 * 흐름:
 *   1. 클라이언트가 퍼지 매칭 후 0.7~0.9 의심 구간 행들을 수집
 *   2. 거래처 ID + 미매칭 행들(itemName/skuCode) + 후보 SKU 목록을 서버로 전송
 *   3. 서버에서 거래처 과거 매출 이력(있다면)을 컨텍스트로 주입
 *   4. LLM 배치 호출: "이 품목명이 아래 후보 중 어느 것과 같은가?"
 *   5. confidence + 추천 SKU ID 반환
 *
 * 비용 최적화:
 *   - 배치 호출 (한 프롬프트에 10~20행 묶음)
 *   - 거래처 이력 캐시 (tenantId+partnerId 최근 30개만 로드)
 *   - 후보 목록은 상위 3~5개로 축소
 */
import { invokeLLM } from "../../_core/llm";
import { getPool } from "../../db/pool";
import { logWarn, logError } from "../../utils/logger";

export interface AiSkuMatchInput {
  rowIndex: number;           // 엑셀 행 번호 (클라이언트 추적용)
  itemName?: string;
  skuCode?: string;
  candidates: Array<{         // 클라이언트 퍼지 매칭 상위 후보
    skuId: number;
    skuCode: string;
    skuName: string;
    itemName: string;
    itemType: string;
    score: number;
  }>;
}

export interface AiSkuMatchResult {
  rowIndex: number;
  recommendedSkuId: number | null;
  confidence: number;         // 0~100
  reason: string;
  needsManualReview: boolean; // confidence < 70
}

/**
 * 거래처 과거 매출 이력 조회 (컨텍스트용)
 * - 최근 30건 중 item_name → product_sku 매핑 패턴
 */
async function getPartnerSalesHistory(
  tenantId: number,
  partnerId: number | null,
): Promise<string> {
  if (!partnerId) return "";
  try {
    const pool = getPool();
    const [rows]: any = await pool.execute(
      `SELECT DISTINCT s.item_name, ps.sku_code, ps.sku_name, im.item_name AS master_name
       FROM accounting_sales s
       LEFT JOIN product_skus ps ON ps.item_id = s.product_id AND ps.tenant_id = s.tenant_id
       LEFT JOIN item_master im ON im.id = s.product_id AND im.tenant_id = s.tenant_id
       WHERE s.tenant_id = ? AND s.partner_id = ?
         AND s.status IN ('approved', 'received')
       ORDER BY s.transaction_date DESC
       LIMIT 30`,
      [tenantId, partnerId],
    );
    const list = (rows as any[]).filter((r: any) => r.sku_code || r.master_name);
    if (list.length === 0) return "";
    return "\n\n과거 거래 이력 (이 거래처):\n" +
      list.slice(0, 15).map((r: any) =>
        `- "${r.item_name}" → ${r.sku_code || "(SKU없음)"} ${r.master_name || ""}`.trim()
      ).join("\n");
  } catch (err) {
    logWarn("AI SKU 매칭: 거래처 이력 조회 실패", { tenantId, partnerId, error: String(err) });
    return "";
  }
}

/**
 * 배치 AI 호출로 여러 행을 한 번에 매칭
 *
 * 최대 batch size = 10 (LLM 프롬프트 길이 제한 + 응답 JSON 안정성)
 */
export async function matchSkuWithAiBatch(
  tenantId: number,
  partnerId: number | null,
  rows: AiSkuMatchInput[],
): Promise<AiSkuMatchResult[]> {
  if (rows.length === 0) return [];

  const BATCH_SIZE = 10;
  const results: AiSkuMatchResult[] = [];
  const history = await getPartnerSalesHistory(tenantId, partnerId);

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    try {
      const batchResults = await callLlmForBatch(batch, history);
      results.push(...batchResults);
    } catch (err: any) {
      logError("AI SKU 매칭 배치 실패", { tenantId, partnerId, batchStart: i, error: err?.message });
      for (const r of batch) {
        results.push({
          rowIndex: r.rowIndex,
          recommendedSkuId: null,
          confidence: 0,
          reason: `AI 오류: ${err?.message?.substring(0, 50) || "알 수 없음"}`,
          needsManualReview: true,
        });
      }
    }
  }

  return results;
}

async function callLlmForBatch(
  batch: AiSkuMatchInput[],
  history: string,
): Promise<AiSkuMatchResult[]> {
  const items = batch.map((row, idx) => {
    const candidates = row.candidates
      .slice(0, 5)
      .map((c, cidx) => `  ${cidx + 1}. SKU ID ${c.skuId} / ${c.skuCode} — ${c.skuName} (품목: ${c.itemName}, 타입: ${c.itemType}, 퍼지점수: ${c.score.toFixed(2)})`)
      .join("\n");
    return `[${idx + 1}] 입력품목: "${row.itemName || ""}"${row.skuCode ? ` / SKU: ${row.skuCode}` : ""}\n후보:\n${candidates || "  (후보 없음)"}`;
  }).join("\n\n");

  const systemPrompt = `당신은 제조업 품목 마스터 매핑 전문가입니다.
엑셀로 업로드된 매출 품목명을 시스템 등록 SKU와 매칭합니다.
${history}

각 입력 행마다 가장 적절한 후보 SKU ID를 고르세요.
- 후보가 명확히 같은 제품이면 confidence 85~100
- 비슷하지만 확신 낮으면 50~84
- 후보 중 맞는 게 없으면 recommended_sku_id = null, confidence = 0

반드시 아래 JSON 배열로만 답하세요 (인덱스 순서 유지):
[{"idx":1,"recommended_sku_id":123,"confidence":92,"reason":"이유 한 줄"},{...},...]`;

  const userPrompt = `아래 ${batch.length}개 행을 매칭하세요:\n\n${items}`;

  const result = await invokeLLM({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const rawContent = result.choices?.[0]?.message?.content;
  const text = typeof rawContent === "string" ? rawContent : "";
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    logWarn("AI SKU 매칭: JSON 배열 파싱 실패", { preview: text.substring(0, 200) });
    return batch.map((r) => ({
      rowIndex: r.rowIndex,
      recommendedSkuId: null,
      confidence: 0,
      reason: "AI 응답 파싱 실패",
      needsManualReview: true,
    }));
  }

  let parsed: any[];
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (e) {
    logWarn("AI SKU 매칭: JSON.parse 실패", { error: String(e) });
    return batch.map((r) => ({
      rowIndex: r.rowIndex,
      recommendedSkuId: null,
      confidence: 0,
      reason: "AI JSON 파싱 실패",
      needsManualReview: true,
    }));
  }

  // 인덱스 기반 매핑 (LLM이 순서 어그러뜨릴 수 있어 idx 필드로 보정)
  return batch.map((r, batchIdx) => {
    const one = parsed.find((p: any) => Number(p.idx) === batchIdx + 1) || parsed[batchIdx];
    if (!one) {
      return {
        rowIndex: r.rowIndex,
        recommendedSkuId: null,
        confidence: 0,
        reason: "AI 응답 누락",
        needsManualReview: true,
      };
    }
    const confidence = Number(one.confidence || 0);
    const skuId = one.recommended_sku_id ? Number(one.recommended_sku_id) : null;
    return {
      rowIndex: r.rowIndex,
      recommendedSkuId: skuId,
      confidence,
      reason: String(one.reason || "AI 추천"),
      needsManualReview: confidence < 70 || !skuId,
    };
  });
}

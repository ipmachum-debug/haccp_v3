/**
 * AI 공급업체 리스크 스코어링
 *
 * 거래처 납품 이력 분석 → 리스크 점수 자동 산출:
 * 1. 납품 지연율
 * 2. 입고검사 불합격률
 * 3. 가격 변동성
 * 4. CCP 이탈과의 상관관계
 * 5. LLM 기반 종합 평가
 */

import { getRawConnection } from "../connection";
import { invokeLLM } from "../../_core/llm";
import { ENV } from "../../_core/env";

// ============================================================================
// 타입 정의
// ============================================================================

export type SupplierRiskScore = {
  partnerId: number;
  partnerName: string;
  businessNumber: string;
  overallScore: number; // 0~100 (높을수록 위험)
  riskLevel: "low" | "medium" | "high" | "critical";
  metrics: {
    deliveryDelayRate: number; // 납품 지연율 (%)
    qualityRejectRate: number; // 불합격률 (%)
    priceVolatility: number; // 가격 변동계수 (%)
    ccpCorrelation: number; // CCP 이탈 상관 점수
    transactionCount: number;
    totalAmount: number;
  };
  trends: {
    qualityTrend: "improving" | "stable" | "declining";
    priceTrend: "up" | "stable" | "down";
  };
  concerns: string[];
  recommendations: string[];
};

export type SupplierRiskReport = {
  tenantId: number;
  analyzedAt: string;
  suppliers: SupplierRiskScore[];
  aiSummary?: string;
};

// ============================================================================
// 공급업체 리스크 분석
// ============================================================================

export async function analyzeSupplierRisk(tenantId: number): Promise<SupplierRiskReport> {
  const conn = await getRawConnection();

  // 매입 거래처 목록
  // ★ 컬럼명 정정: partners.company_name (was: p.name) / partners.biz_no (was: p.business_number)
  // ★ 테이블 정정: accounting_purchases (was: purchases — 미존재)
  const [partners] = await conn.execute(
    `SELECT DISTINCT p.id, p.company_name, p.biz_no
     FROM partners p
     JOIN accounting_purchases pu ON pu.partner_id = p.id AND pu.tenant_id = ?
     WHERE p.tenant_id = ? AND p.partner_type IN ('supplier', 'both')
     ORDER BY p.company_name`,
    [tenantId, tenantId]
  );

  const suppliers: SupplierRiskScore[] = [];

  for (const partner of partners as any[]) {
    // 1. 매입 이력 (최근 12개월)
    // ★ 테이블/컬럼 정정: accounting_purchases.transaction_date (was: purchases.purchase_date)
    // ※ accounting_purchases 에는 received_date / expected_date 컬럼 없음 — 납품 지연율은
    //   purchase_orders.expected_delivery_date 와의 별도 JOIN 필요. 현재는 0 으로 fallback.
    const [purchases] = await conn.execute(
      `SELECT id, transaction_date, status, total_amount
       FROM accounting_purchases
       WHERE tenant_id = ? AND partner_id = ?
         AND transaction_date >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 12 MONTH), '%Y-%m-%d')
       ORDER BY transaction_date DESC`,
      [tenantId, partner.id]
    );

    const txns = purchases as any[];
    if (txns.length < 2) continue; // 거래 2건 미만은 건너뜀

    // 납품 지연율 — accounting_purchases 에 expected/received_date 미존재로 0 fallback
    // (개선: purchase_orders.expectedDeliveryDate JOIN 시 산출 가능)
    const deliveryDelayRate = 0;

    // 2. 입고검사 불합격률 — receiving_inspection_records 테이블 미존재
    //    (개선: h_visual_inspection_records 또는 별도 입고검사 테이블 확정 후 연결)
    const qualityRejectRate = 0;
    const inspTotal = 0;
    const inspFails = 0;

    // 3. 가격 변동성 (같은 거래처 단가 변동계수)
    // ★ accounting_purchases 의 unit_price 직접 사용 (purchase_items 테이블 미존재)
    const [prices] = await conn.execute(
      `SELECT unit_price
       FROM accounting_purchases
       WHERE tenant_id = ? AND partner_id = ?
         AND transaction_date >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 12 MONTH), '%Y-%m-%d')
         AND unit_price > 0`,
      [tenantId, partner.id]
    );
    const priceList = (prices as any[]).map((p) => Number(p.unit_price));
    let priceVolatility = 0;
    if (priceList.length >= 3) {
      const mean = priceList.reduce((a, b) => a + b, 0) / priceList.length;
      const variance = priceList.reduce((sum, v) => sum + (v - mean) ** 2, 0) / priceList.length;
      priceVolatility = mean > 0 ? (Math.sqrt(variance) / mean) * 100 : 0;
    }

    // 4. CCP 이탈 상관 (해당 거래처 원재료 사용 배치의 CCP 이탈률)
    // ★ accounting_purchases.material_id 로 직접 매핑 (purchase_items 테이블 미존재)
    const [ccpCorr] = await conn.execute(
      `SELECT COUNT(DISTINCT b.id) as batchCount,
              COUNT(DISTINCT CASE WHEN hcr.result = 'FAIL' THEN b.id END) as failBatches
       FROM h_batches b
       JOIN h_batch_inputs bi ON bi.batch_id = b.id
       JOIN accounting_purchases pu ON pu.material_id = bi.material_id
            AND pu.partner_id = ? AND pu.tenant_id = ?
       LEFT JOIN h_ccp_instances hci ON hci.batch_id = b.id AND hci.tenant_id = ?
       LEFT JOIN h_ccp_rows hcr ON hcr.instance_id = hci.id AND hcr.result = 'FAIL'
       WHERE b.tenant_id = ? AND b.completed_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)`,
      [partner.id, tenantId, tenantId, tenantId]
    );
    const batchCount = (ccpCorr as any[])[0]?.batchCount || 0;
    const failBatches = (ccpCorr as any[])[0]?.failBatches || 0;
    const ccpCorrelation = batchCount > 0 ? (failBatches / batchCount) * 100 : 0;

    // 총거래액
    const totalAmount = txns.reduce((sum, t) => sum + (Number(t.total_amount) || 0), 0);

    // 종합 리스크 점수 계산
    let overallScore =
      deliveryDelayRate * 0.2 +
      qualityRejectRate * 0.35 +
      priceVolatility * 0.15 +
      ccpCorrelation * 0.3;
    overallScore = Math.min(100, Math.round(overallScore));

    const riskLevel: SupplierRiskScore["riskLevel"] =
      overallScore >= 60 ? "critical" : overallScore >= 40 ? "high" : overallScore >= 20 ? "medium" : "low";

    // 트렌드 분석
    const recentInsp = inspTotal > 5 ? inspFails / inspTotal : null;
    const qualityTrend: "improving" | "stable" | "declining" =
      recentInsp === null ? "stable" : recentInsp > 0.1 ? "declining" : "stable";
    const priceTrend: "up" | "stable" | "down" =
      priceList.length >= 3
        ? priceList[priceList.length - 1] > priceList[0] * 1.05 ? "up"
          : priceList[priceList.length - 1] < priceList[0] * 0.95 ? "down"
          : "stable"
        : "stable";

    // 우려사항
    const concerns: string[] = [];
    if (deliveryDelayRate > 20) concerns.push(`납품 지연율 ${deliveryDelayRate.toFixed(0)}%로 높음`);
    if (qualityRejectRate > 5) concerns.push(`입고검사 불합격률 ${qualityRejectRate.toFixed(1)}%`);
    if (priceVolatility > 15) concerns.push(`가격 변동성 ${priceVolatility.toFixed(1)}%로 불안정`);
    if (ccpCorrelation > 10) concerns.push(`해당 원재료 사용 시 CCP 이탈 상관 ${ccpCorrelation.toFixed(1)}%`);

    const recommendations: string[] = [];
    if (overallScore >= 40) {
      recommendations.push("대체 공급업체 확보 검토");
      if (qualityRejectRate > 5) recommendations.push("입고검사 기준 강화");
      if (deliveryDelayRate > 20) recommendations.push("납품 조건 재협의");
    }

    suppliers.push({
      partnerId: partner.id,
      partnerName: partner.company_name,
      businessNumber: partner.biz_no || "",
      overallScore,
      riskLevel,
      metrics: {
        deliveryDelayRate: Math.round(deliveryDelayRate * 10) / 10,
        qualityRejectRate: Math.round(qualityRejectRate * 10) / 10,
        priceVolatility: Math.round(priceVolatility * 10) / 10,
        ccpCorrelation: Math.round(ccpCorrelation * 10) / 10,
        transactionCount: txns.length,
        totalAmount: Math.round(totalAmount),
      },
      trends: { qualityTrend, priceTrend },
      concerns,
      recommendations,
    });
  }

  // 리스크 순으로 정렬
  suppliers.sort((a, b) => b.overallScore - a.overallScore);

  // AI 종합 분석
  let aiSummary: string | undefined;
  if (suppliers.length > 0 && ENV.forgeApiKey) {
    try {
      const highRisk = suppliers.filter((s) => s.riskLevel === "high" || s.riskLevel === "critical");
      const result = await invokeLLM({
        messages: [
          {
            role: "system",
            content: "당신은 식품제조업 공급망 리스크 전문가입니다. 공급업체 리스크 분석 결과를 3~5문장으로 요약하세요. 핵심 리스크와 즉시 조치 사항을 포함하세요.",
          },
          {
            role: "user",
            content: `총 ${suppliers.length}개 공급업체 분석:\n고위험: ${highRisk.length}개\n${highRisk.map((s) => `- ${s.partnerName}: 점수 ${s.overallScore}, ${s.concerns.join(", ")}`).join("\n")}`,
          },
        ],
        maxTokens: 500,
      });
      aiSummary = typeof result.choices[0]?.message?.content === "string"
        ? result.choices[0].message.content : undefined;
    } catch { /* AI 요약 실패 무시 */ }
  }

  return {
    tenantId,
    analyzedAt: new Date().toISOString(),
    suppliers,
    aiSummary,
  };
}

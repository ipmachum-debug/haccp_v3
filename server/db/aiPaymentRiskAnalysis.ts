/**
 * AP/AR 연체 리스크 분석 + LLM 권고 (Phase B-3)
 *
 * 1. AP/AR Aging 버킷 분류 (current/30/60/90/120+)
 * 2. 거래처별 결제 패턴 분석 (평균 결제일, 연체율)
 * 3. LLM 기반 종합 분석 + 거래처별 권고사항
 */

import { getRawConnection } from "../db";
import { invokeLLM } from "../_core/llm";
import { ENV } from "../_core/env";

// ============================================================================
// 타입 정의
// ============================================================================

export type AgingBucket = {
  current: number;
  days30: number;
  days60: number;
  days90: number;
  days120plus: number;
  total: number;
};

export type PartnerPaymentProfile = {
  partnerId: number;
  partnerName: string;
  type: "ap" | "ar";
  totalOutstanding: number;
  aging: AgingBucket;
  avgPaymentDays: number;  // 평균 결제 소요일
  onTimeRate: number;       // 기한 내 결제율 (%)
  invoiceCount: number;
  oldestOverdueDays: number;
  riskScore: number;        // 0~100 (높을수록 위험)
  riskLevel: "low" | "medium" | "high" | "critical";
};

export type PaymentRiskReport = {
  tenantId: number;
  generatedAt: string;
  apProfiles: PartnerPaymentProfile[];
  arProfiles: PartnerPaymentProfile[];
  apSummary: AgingBucket;
  arSummary: AgingBucket;
  aiAnalysis?: string;
  recommendations: string[];
};

// ============================================================================
// AP Aging 분석
// ============================================================================

async function analyzeApAging(tenantId: number): Promise<PartnerPaymentProfile[]> {
  const conn = await getRawConnection();
  const profiles: PartnerPaymentProfile[] = [];

  const [rows] = await conn.execute(
    `SELECT
       apl.partner_id,
       p.name as partner_name,
       COUNT(*) as invoice_count,
       SUM(apl.amount) as total_outstanding,
       SUM(CASE WHEN apl.due_date >= CURDATE() THEN apl.amount ELSE 0 END) as current_amt,
       SUM(CASE WHEN DATEDIFF(CURDATE(), apl.due_date) BETWEEN 1 AND 30 THEN apl.amount ELSE 0 END) as days30,
       SUM(CASE WHEN DATEDIFF(CURDATE(), apl.due_date) BETWEEN 31 AND 60 THEN apl.amount ELSE 0 END) as days60,
       SUM(CASE WHEN DATEDIFF(CURDATE(), apl.due_date) BETWEEN 61 AND 90 THEN apl.amount ELSE 0 END) as days90,
       SUM(CASE WHEN DATEDIFF(CURDATE(), apl.due_date) > 90 THEN apl.amount ELSE 0 END) as days120plus,
       MAX(CASE WHEN apl.due_date < CURDATE() THEN DATEDIFF(CURDATE(), apl.due_date) ELSE 0 END) as oldest_overdue
     FROM ap_ledger apl
     LEFT JOIN partners p ON p.id = apl.partner_id AND p.tenant_id = ?
     WHERE apl.tenant_id = ? AND apl.status NOT IN ('paid', 'cancelled')
     GROUP BY apl.partner_id, p.name
     HAVING total_outstanding > 0
     ORDER BY total_outstanding DESC
     LIMIT 50`,
    [tenantId, tenantId]
  );

  // 거래처별 과거 결제 패턴
  const [historyRows] = await conn.execute(
    `SELECT
       apl.partner_id,
       AVG(DATEDIFF(apl.paid_date, apl.due_date)) as avg_delay,
       COUNT(CASE WHEN apl.paid_date <= apl.due_date THEN 1 END) as on_time,
       COUNT(*) as total
     FROM ap_ledger apl
     WHERE apl.tenant_id = ? AND apl.status = 'paid' AND apl.paid_date IS NOT NULL
       AND apl.created_at >= DATE_SUB(CURDATE(), INTERVAL 180 DAY)
     GROUP BY apl.partner_id`,
    [tenantId]
  );

  const historyMap = new Map<number, { avgDelay: number; onTimeRate: number }>();
  for (const h of historyRows as any[]) {
    historyMap.set(h.partner_id, {
      avgDelay: Number(h.avg_delay || 0),
      onTimeRate: h.total > 0 ? Math.round((Number(h.on_time) / Number(h.total)) * 100) : 50,
    });
  }

  for (const row of rows as any[]) {
    const history = historyMap.get(row.partner_id) || { avgDelay: 0, onTimeRate: 50 };
    const aging: AgingBucket = {
      current: Number(row.current_amt),
      days30: Number(row.days30),
      days60: Number(row.days60),
      days90: Number(row.days90),
      days120plus: Number(row.days120plus),
      total: Number(row.total_outstanding),
    };

    // 리스크 점수 계산
    const overdueRatio = (aging.days30 + aging.days60 + aging.days90 + aging.days120plus) / Math.max(aging.total, 1);
    const riskScore = Math.min(100, Math.round(
      overdueRatio * 40 +
      Math.min(Number(row.oldest_overdue), 180) / 180 * 30 +
      (100 - history.onTimeRate) * 0.3
    ));

    profiles.push({
      partnerId: row.partner_id,
      partnerName: row.partner_name || "미지정",
      type: "ap",
      totalOutstanding: aging.total,
      aging,
      avgPaymentDays: Math.round(history.avgDelay),
      onTimeRate: history.onTimeRate,
      invoiceCount: Number(row.invoice_count),
      oldestOverdueDays: Number(row.oldest_overdue),
      riskScore,
      riskLevel: riskScore >= 70 ? "critical" : riskScore >= 50 ? "high" : riskScore >= 30 ? "medium" : "low",
    });
  }

  return profiles.sort((a, b) => b.riskScore - a.riskScore);
}

// ============================================================================
// AR Aging 분석
// ============================================================================

async function analyzeArAging(tenantId: number): Promise<PartnerPaymentProfile[]> {
  const conn = await getRawConnection();
  const profiles: PartnerPaymentProfile[] = [];

  const [rows] = await conn.execute(
    `SELECT
       arl.partner_id,
       p.name as partner_name,
       COUNT(*) as invoice_count,
       SUM(arl.amount) as total_outstanding,
       SUM(CASE WHEN arl.due_date >= CURDATE() THEN arl.amount ELSE 0 END) as current_amt,
       SUM(CASE WHEN DATEDIFF(CURDATE(), arl.due_date) BETWEEN 1 AND 30 THEN arl.amount ELSE 0 END) as days30,
       SUM(CASE WHEN DATEDIFF(CURDATE(), arl.due_date) BETWEEN 31 AND 60 THEN arl.amount ELSE 0 END) as days60,
       SUM(CASE WHEN DATEDIFF(CURDATE(), arl.due_date) BETWEEN 61 AND 90 THEN arl.amount ELSE 0 END) as days90,
       SUM(CASE WHEN DATEDIFF(CURDATE(), arl.due_date) > 90 THEN arl.amount ELSE 0 END) as days120plus,
       MAX(CASE WHEN arl.due_date < CURDATE() THEN DATEDIFF(CURDATE(), arl.due_date) ELSE 0 END) as oldest_overdue
     FROM ar_ledger arl
     LEFT JOIN partners p ON p.id = arl.partner_id AND p.tenant_id = ?
     WHERE arl.tenant_id = ? AND arl.status NOT IN ('collected', 'cancelled')
     GROUP BY arl.partner_id, p.name
     HAVING total_outstanding > 0
     ORDER BY total_outstanding DESC
     LIMIT 50`,
    [tenantId, tenantId]
  );

  // 과거 회수 패턴
  const [historyRows] = await conn.execute(
    `SELECT
       arl.partner_id,
       AVG(DATEDIFF(arl.collected_date, arl.due_date)) as avg_delay,
       COUNT(CASE WHEN arl.collected_date <= arl.due_date THEN 1 END) as on_time,
       COUNT(*) as total
     FROM ar_ledger arl
     WHERE arl.tenant_id = ? AND arl.status = 'collected' AND arl.collected_date IS NOT NULL
       AND arl.created_at >= DATE_SUB(CURDATE(), INTERVAL 180 DAY)
     GROUP BY arl.partner_id`,
    [tenantId]
  );

  const historyMap = new Map<number, { avgDelay: number; onTimeRate: number }>();
  for (const h of historyRows as any[]) {
    historyMap.set(h.partner_id, {
      avgDelay: Number(h.avg_delay || 0),
      onTimeRate: h.total > 0 ? Math.round((Number(h.on_time) / Number(h.total)) * 100) : 50,
    });
  }

  for (const row of rows as any[]) {
    const history = historyMap.get(row.partner_id) || { avgDelay: 0, onTimeRate: 50 };
    const aging: AgingBucket = {
      current: Number(row.current_amt),
      days30: Number(row.days30),
      days60: Number(row.days60),
      days90: Number(row.days90),
      days120plus: Number(row.days120plus),
      total: Number(row.total_outstanding),
    };

    const overdueRatio = (aging.days30 + aging.days60 + aging.days90 + aging.days120plus) / Math.max(aging.total, 1);
    const riskScore = Math.min(100, Math.round(
      overdueRatio * 40 +
      Math.min(Number(row.oldest_overdue), 180) / 180 * 30 +
      (100 - history.onTimeRate) * 0.3
    ));

    profiles.push({
      partnerId: row.partner_id,
      partnerName: row.partner_name || "미지정",
      type: "ar",
      totalOutstanding: aging.total,
      aging,
      avgPaymentDays: Math.round(history.avgDelay),
      onTimeRate: history.onTimeRate,
      invoiceCount: Number(row.invoice_count),
      oldestOverdueDays: Number(row.oldest_overdue),
      riskScore,
      riskLevel: riskScore >= 70 ? "critical" : riskScore >= 50 ? "high" : riskScore >= 30 ? "medium" : "low",
    });
  }

  return profiles.sort((a, b) => b.riskScore - a.riskScore);
}

// ============================================================================
// Aging 합계 계산
// ============================================================================

function sumAging(profiles: PartnerPaymentProfile[]): AgingBucket {
  return profiles.reduce((sum, p) => ({
    current: sum.current + p.aging.current,
    days30: sum.days30 + p.aging.days30,
    days60: sum.days60 + p.aging.days60,
    days90: sum.days90 + p.aging.days90,
    days120plus: sum.days120plus + p.aging.days120plus,
    total: sum.total + p.aging.total,
  }), { current: 0, days30: 0, days60: 0, days90: 0, days120plus: 0, total: 0 });
}

// ============================================================================
// LLM 종합 분석
// ============================================================================

async function generateLlmAnalysis(
  apProfiles: PartnerPaymentProfile[],
  arProfiles: PartnerPaymentProfile[],
  apSummary: AgingBucket,
  arSummary: AgingBucket
): Promise<{ analysis: string; recommendations: string[] }> {
  if (!ENV.forgeApiKey) {
    return {
      analysis: "",
      recommendations: generateRuleBasedRecommendations(apProfiles, arProfiles, apSummary, arSummary),
    };
  }

  try {
    const result = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `당신은 식품제조업 전문 회계사입니다. AP/AR 연체 현황을 분석하여 실행 가능한 권고사항을 제공하세요.

## 출력 형식 (JSON)
{
  "analysis": "2~3문단의 종합 분석 (마크다운)",
  "recommendations": ["구체적 권고사항 1~5개 (거래처명, 금액 포함)"]
}`,
        },
        {
          role: "user",
          content: `AP 연체 현황: 총 ${apSummary.total.toLocaleString()}원
- 정상: ${apSummary.current.toLocaleString()}원
- 30일: ${apSummary.days30.toLocaleString()}원
- 60일: ${apSummary.days60.toLocaleString()}원
- 90일+: ${(apSummary.days90 + apSummary.days120plus).toLocaleString()}원
주요 AP 거래처: ${apProfiles.slice(0, 5).map((p) => `${p.partnerName}(${p.totalOutstanding.toLocaleString()}원, 리스크 ${p.riskScore}점)`).join(", ")}

AR 미수 현황: 총 ${arSummary.total.toLocaleString()}원
- 정상: ${arSummary.current.toLocaleString()}원
- 30일: ${arSummary.days30.toLocaleString()}원
- 60일: ${arSummary.days60.toLocaleString()}원
- 90일+: ${(arSummary.days90 + arSummary.days120plus).toLocaleString()}원
주요 AR 거래처: ${arProfiles.slice(0, 5).map((p) => `${p.partnerName}(${p.totalOutstanding.toLocaleString()}원, 기한준수 ${p.onTimeRate}%)`).join(", ")}`,
        },
      ],
      maxTokens: 800,
      responseFormat: { type: "json_object" },
    });

    const text = typeof result.choices[0]?.message?.content === "string"
      ? result.choices[0].message.content : "{}";
    const parsed = JSON.parse(text);
    return {
      analysis: parsed.analysis || "",
      recommendations: parsed.recommendations || [],
    };
  } catch {
    return {
      analysis: "",
      recommendations: generateRuleBasedRecommendations(apProfiles, arProfiles, apSummary, arSummary),
    };
  }
}

// 규칙 기반 폴백 권고사항
function generateRuleBasedRecommendations(
  apProfiles: PartnerPaymentProfile[],
  arProfiles: PartnerPaymentProfile[],
  apSummary: AgingBucket,
  arSummary: AgingBucket
): string[] {
  const recs: string[] = [];

  if (apSummary.days90 + apSummary.days120plus > 0) {
    recs.push(`AP 90일 이상 연체 ${(apSummary.days90 + apSummary.days120plus).toLocaleString()}원 - 즉시 결제 협의 필요`);
  }
  if (arSummary.days60 + arSummary.days90 + arSummary.days120plus > 0) {
    recs.push(`AR 60일 이상 미수 ${(arSummary.days60 + arSummary.days90 + arSummary.days120plus).toLocaleString()}원 - 회수 촉진 필요`);
  }

  const criticalAp = apProfiles.filter((p) => p.riskLevel === "critical");
  if (criticalAp.length > 0) {
    recs.push(`AP 고위험 거래처 ${criticalAp.length}곳: ${criticalAp.slice(0, 3).map((p) => p.partnerName).join(", ")}`);
  }

  const criticalAr = arProfiles.filter((p) => p.riskLevel === "critical");
  if (criticalAr.length > 0) {
    recs.push(`AR 고위험 거래처 ${criticalAr.length}곳: ${criticalAr.slice(0, 3).map((p) => p.partnerName).join(", ")} - 법적 조치 검토`);
  }

  if (recs.length === 0) {
    recs.push("AP/AR 연체 현황 양호");
  }

  return recs;
}

// ============================================================================
// 통합 분석 함수
// ============================================================================

export async function analyzePaymentRisk(tenantId: number): Promise<PaymentRiskReport> {
  const [apProfiles, arProfiles] = await Promise.all([
    analyzeApAging(tenantId),
    analyzeArAging(tenantId),
  ]);

  const apSummary = sumAging(apProfiles);
  const arSummary = sumAging(arProfiles);

  const { analysis, recommendations } = await generateLlmAnalysis(
    apProfiles, arProfiles, apSummary, arSummary
  );

  return {
    tenantId,
    generatedAt: new Date().toISOString(),
    apProfiles: apProfiles.slice(0, 20),
    arProfiles: arProfiles.slice(0, 20),
    apSummary,
    arSummary,
    aiAnalysis: analysis || undefined,
    recommendations,
  };
}

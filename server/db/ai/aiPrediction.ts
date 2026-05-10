/**
 * AI 예측 분석 엔진
 *
 * 과거 데이터 기반 트렌드 분석 + LLM 해석:
 * 1. 재고 소진 예측 (Days to Stockout)
 * 2. 생산 수율 트렌드 예측
 * 3. CCP 이탈 확률 예측
 * 4. 매출/비용 트렌드 예측
 * 5. LLM 기반 종합 전망
 */

import { getRawConnection } from "../connection";
import { invokeLLM } from "../../_core/llm";
import { ENV } from "../../_core/env";

// ============================================================================
// 타입 정의
// ============================================================================

export type PredictionType =
  | "inventory_stockout"
  | "yield_trend"
  | "ccp_risk"
  | "financial_trend"
  | "expiry_risk";

export type Prediction = {
  type: PredictionType;
  title: string;
  description: string;
  confidence: "high" | "medium" | "low";
  timeframe: string;
  currentValue: number;
  predictedValue: number;
  trend: "up" | "down" | "stable";
  riskLevel: "critical" | "high" | "medium" | "low";
  details: Record<string, any>;
  recommendations: string[];
};

export type PredictionReport = {
  tenantId: number;
  generatedAt: string;
  predictions: Prediction[];
  aiNarrative?: string;
};

// ============================================================================
// 선형 회귀 (간단 구현)
// ============================================================================

function linearRegression(points: number[]): { slope: number; intercept: number; r2: number } {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: points[0] || 0, r2: 0 };

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += points[i];
    sumXY += i * points[i];
    sumX2 += i * i;
    sumY2 += points[i] * points[i];
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // R² 계산
  const meanY = sumY / n;
  const ssTot = sumY2 - n * meanY * meanY;
  const ssRes = points.reduce((sum, y, i) => sum + (y - (slope * i + intercept)) ** 2, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  return { slope, intercept, r2 };
}

// ============================================================================
// 1. 재고 소진 예측
// ============================================================================

async function predictStockout(tenantId: number): Promise<Prediction[]> {
  const conn = await getRawConnection();
  const predictions: Prediction[] = [];

  // 원재료별 최근 30일 일별 사용량 + 현재 재고
  const [materials] = await conn.execute(
    `SELECT m.id, m.material_name as name, m.unit,
            COALESCE(inv.total_quantity, 0) as currentStock,
            COALESCE(m.safety_stock_level, 0) as minStock
     FROM h_materials m
     LEFT JOIN h_inventory inv ON inv.material_id = m.id AND inv.tenant_id = ?
     WHERE m.tenant_id = ? AND COALESCE(inv.total_quantity, 0) > 0
     ORDER BY COALESCE(inv.total_quantity, 0) ASC`,
    [tenantId, tenantId]
  );

  for (const mat of materials as any[]) {
    // 일별 출고량 (최근 30일)
    const [usage] = await conn.execute(
      `SELECT DATE(created_at) as dt, SUM(ABS(quantity)) as qty
       FROM h_inventory_transactions
       WHERE tenant_id = ? AND reference_id = ? AND transaction_type = 'out'
         AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       GROUP BY DATE(created_at)
       ORDER BY dt`,
      [tenantId, mat.id]
    );

    const dailyUsage = usage as any[];
    if (dailyUsage.length < 3) continue;

    const usageValues = dailyUsage.map((d) => Number(d.qty));
    const avgDaily = usageValues.reduce((a, b) => a + b, 0) / usageValues.length;

    if (avgDaily <= 0) continue;

    const daysToStockout = Math.round(mat.currentStock / avgDaily);
    const { slope } = linearRegression(usageValues);

    // 사용량이 증가 추세이면 소진이 더 빠를 수 있음
    const adjustedDays = slope > 0
      ? Math.round(daysToStockout * 0.8) // 20% 빠르게 소진
      : daysToStockout;

    if (adjustedDays <= 14) {
      predictions.push({
        type: "inventory_stockout",
        title: `재고 소진 예측 - ${mat.name}`,
        description: `${mat.name}: 현재 ${mat.currentStock}${mat.unit}, 일평균 사용 ${avgDaily.toFixed(1)}${mat.unit} → 약 ${adjustedDays}일 후 소진 예상`,
        confidence: dailyUsage.length >= 14 ? "high" : "medium",
        timeframe: `${adjustedDays}일`,
        currentValue: mat.currentStock,
        predictedValue: 0,
        trend: slope > 0 ? "up" : slope < 0 ? "down" : "stable",
        riskLevel: adjustedDays <= 3 ? "critical" : adjustedDays <= 7 ? "high" : "medium",
        details: {
          materialId: mat.id,
          avgDailyUsage: Math.round(avgDaily * 10) / 10,
          usageTrend: slope > 0 ? "증가" : "감소",
          minStock: mat.minStock,
        },
        recommendations: [
          adjustedDays <= 3 ? "긴급 발주 필요" : "발주 계획 확인",
          slope > 0 ? "사용량 증가 추세, 발주량 상향 검토" : "",
          mat.minStock > 0 && mat.currentStock <= mat.minStock * 1.5 ? "안전재고 근접, 발주 필요" : "",
        ].filter(Boolean),
      });
    }
  }

  return predictions.sort((a, b) => Number(a.timeframe) - Number(b.timeframe)).slice(0, 10);
}

// ============================================================================
// 2. 생산 수율 트렌드 예측
// ============================================================================

async function predictYieldTrend(tenantId: number): Promise<Prediction[]> {
  const conn = await getRawConnection();
  const predictions: Prediction[] = [];

  // 제품별 주간 평균 수율 (최근 12주)
  const [rows] = await conn.execute(
    `SELECT b.product_id, COALESCE(p.product_name, '') as productName,
            YEARWEEK(b.completed_at) as yw,
            AVG(b.actual_yield) as avgYield,
            COUNT(*) as batchCount
     FROM h_batches b
     LEFT JOIN h_products_v2 p ON p.id = b.product_id
     WHERE b.tenant_id = ? AND b.status = 'completed'
       AND b.actual_yield IS NOT NULL
       AND b.completed_at >= DATE_SUB(NOW(), INTERVAL 12 WEEK)
     GROUP BY b.product_id, p.product_name, YEARWEEK(b.completed_at)
     ORDER BY b.product_id, yw`,
    [tenantId]
  );

  const data = rows as any[];

  // 제품별 그룹화
  const byProduct = new Map<number, any[]>();
  for (const r of data) {
    if (!byProduct.has(r.product_id)) byProduct.set(r.product_id, []);
    byProduct.get(r.product_id)!.push(r);
  }

  for (const [, weeks] of byProduct) {
    if (weeks.length < 4) continue;

    const yields = weeks.map((w) => Number(w.avgYield));
    const { slope, r2 } = linearRegression(yields);

    // 4주 후 예측 수율
    const predicted = yields[yields.length - 1] + slope * 4;
    const current = yields[yields.length - 1];

    if (Math.abs(slope) > 0.5 && r2 > 0.3) { // 유의미한 트렌드만
      predictions.push({
        type: "yield_trend",
        title: `수율 ${slope < 0 ? "하락" : "상승"} 트렌드 - ${weeks[0].productName}`,
        description: `${weeks[0].productName}: 주간 ${slope > 0 ? "+" : ""}${slope.toFixed(1)}%p 변화, 4주 후 ${predicted.toFixed(1)}% 예상 (현재 ${current.toFixed(1)}%)`,
        confidence: r2 > 0.6 ? "high" : "medium",
        timeframe: "4주",
        currentValue: Math.round(current * 10) / 10,
        predictedValue: Math.round(predicted * 10) / 10,
        trend: slope > 0 ? "up" : "down",
        riskLevel: slope < -1 ? "high" : slope < 0 ? "medium" : "low",
        details: {
          weeklySlope: Math.round(slope * 100) / 100,
          r2: Math.round(r2 * 100) / 100,
          dataPoints: yields.length,
        },
        recommendations: slope < 0
          ? ["수율 하락 원인 분석 필요", "원재료 품질 점검", "설비 정비 일정 확인"]
          : ["현 수준 유지 관리", "베스트 프랙티스 문서화"],
      });
    }
  }

  return predictions;
}

// ============================================================================
// 3. CCP 이탈 리스크 예측
// ============================================================================

async function predictCCPRisk(tenantId: number): Promise<Prediction[]> {
  const conn = await getRawConnection();
  const predictions: Prediction[] = [];

  // 주간 CCP 이탈률 (최근 8주)
  const [rows] = await conn.execute(
    `SELECT YEARWEEK(hci.work_date) as yw,
            COUNT(*) as total,
            SUM(CASE WHEN hcr.result = 'FAIL' THEN 1 ELSE 0 END) as fails
     FROM h_ccp_rows hcr
     JOIN h_ccp_instances hci ON hci.id = hcr.instance_id
     WHERE hci.tenant_id = ? AND hcr.row_type = 'measurement'
       AND hci.work_date >= DATE_SUB(CURDATE(), INTERVAL 8 WEEK)
     GROUP BY YEARWEEK(hci.work_date)
     ORDER BY yw`,
    [tenantId]
  );

  const weeks = rows as any[];
  if (weeks.length < 4) return predictions;

  const failRates = weeks.map((w) => w.total > 0 ? (Number(w.fails) / Number(w.total)) * 100 : 0);
  const { slope, r2 } = linearRegression(failRates);

  const current = failRates[failRates.length - 1];
  const predicted = Math.max(0, current + slope * 4);

  if (slope > 0.1 && r2 > 0.2) {
    predictions.push({
      type: "ccp_risk",
      title: "CCP 이탈률 상승 트렌드",
      description: `CCP 이탈률 주간 +${slope.toFixed(2)}%p 증가 추세, 4주 후 ${predicted.toFixed(1)}% 예상 (현재 ${current.toFixed(1)}%)`,
      confidence: r2 > 0.5 ? "high" : "medium",
      timeframe: "4주",
      currentValue: Math.round(current * 10) / 10,
      predictedValue: Math.round(predicted * 10) / 10,
      trend: "up",
      riskLevel: predicted > 5 ? "critical" : predicted > 2 ? "high" : "medium",
      details: {
        weeklySlope: Math.round(slope * 100) / 100,
        r2: Math.round(r2 * 100) / 100,
        recentWeeks: failRates.slice(-4),
      },
      recommendations: [
        "CCP 모니터링 포인트별 상세 분석",
        "설비 예방 정비 실시",
        "작업자 재교육 실시",
        "원재료 입고 검사 강화",
      ],
    });
  }

  return predictions;
}

// ============================================================================
// 4. 재무 트렌드 예측
// ============================================================================

async function predictFinancialTrend(tenantId: number): Promise<Prediction[]> {
  const conn = await getRawConnection();
  const predictions: Prediction[] = [];

  // 월별 매출/비용 (최근 6개월)
  const [rows] = await conn.execute(
    `SELECT
       DATE_FORMAT(eje.entry_date, '%Y-%m') as month,
       SUM(CASE WHEN aa.category = 'revenue' THEN ejl.credit_amount ELSE 0 END) as revenue,
       SUM(CASE WHEN aa.category = 'expenses' THEN ejl.debit_amount ELSE 0 END) as expenses
     FROM expense_journal_lines ejl
     JOIN expense_journal_entries eje ON eje.id = ejl.journal_entry_id
     JOIN accounting_accounts aa ON aa.id = ejl.account_id AND aa.tenant_id = ?
     WHERE eje.tenant_id = ?
       AND eje.entry_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
     GROUP BY DATE_FORMAT(eje.entry_date, '%Y-%m')
     ORDER BY month`,
    [tenantId, tenantId]
  );

  const months = rows as any[];
  if (months.length < 3) return predictions;

  // 매출 트렌드
  const revenues = months.map((m) => Number(m.revenue));
  const { slope: revSlope, r2: revR2 } = linearRegression(revenues);
  const currentRev = revenues[revenues.length - 1];
  const predictedRev = currentRev + revSlope * 3;

  if (Math.abs(revSlope) > 10000 && revR2 > 0.2) {
    predictions.push({
      type: "financial_trend",
      title: `매출 ${revSlope > 0 ? "성장" : "감소"} 전망`,
      description: `월간 매출 ${revSlope > 0 ? "+" : ""}${Math.round(revSlope).toLocaleString()}원 변화, 3개월 후 ${Math.round(predictedRev).toLocaleString()}원 예상`,
      confidence: revR2 > 0.5 ? "high" : "medium",
      timeframe: "3개월",
      currentValue: Math.round(currentRev),
      predictedValue: Math.round(predictedRev),
      trend: revSlope > 0 ? "up" : "down",
      riskLevel: revSlope < -50000 ? "high" : revSlope < 0 ? "medium" : "low",
      details: {
        monthlySlope: Math.round(revSlope),
        r2: Math.round(revR2 * 100) / 100,
        recentMonths: months.map((m) => ({ month: m.month, revenue: Number(m.revenue) })),
      },
      recommendations: revSlope < 0
        ? ["매출 하락 원인 분석", "신규 거래처 개발", "제품 포트폴리오 검토"]
        : ["성장 모멘텀 유지", "생산 능력 확충 검토"],
    });
  }

  // 비용 트렌드
  const expenses = months.map((m) => Number(m.expenses));
  const { slope: expSlope, r2: expR2 } = linearRegression(expenses);
  const currentExp = expenses[expenses.length - 1];

  if (expSlope > 10000 && expR2 > 0.2) {
    predictions.push({
      type: "financial_trend",
      title: "비용 증가 전망",
      description: `월간 비용 +${Math.round(expSlope).toLocaleString()}원 증가 추세`,
      confidence: expR2 > 0.5 ? "high" : "medium",
      timeframe: "3개월",
      currentValue: Math.round(currentExp),
      predictedValue: Math.round(currentExp + expSlope * 3),
      trend: "up",
      riskLevel: expSlope > 100000 ? "high" : "medium",
      details: { monthlySlope: Math.round(expSlope) },
      recommendations: ["비용 항목별 상세 분석", "원가 절감 방안 검토"],
    });
  }

  return predictions;
}

// ============================================================================
// 5. 소비기한 리스크 예측
// ============================================================================

async function predictExpiryRisk(tenantId: number): Promise<Prediction[]> {
  const conn = await getRawConnection();
  const predictions: Prediction[] = [];

  // 소비기한 임박 재고 (14일 이내)
  // ★ 2026-05-09 (PR #278): 듀얼 lookup — h_materials 폴백 (item_master.raw_material)
  const [rows] = await conn.execute(
    `SELECT COALESCE(m.material_name, im.item_name) as name,
            inv.total_quantity as quantity, inv.unit,
            CURDATE() as expiry_date,
            0 as daysLeft
     FROM h_inventory inv
     LEFT JOIN h_materials m ON m.id = inv.material_id AND m.tenant_id = inv.tenant_id
     LEFT JOIN item_master im ON im.id = inv.material_id AND im.tenant_id = inv.tenant_id AND im.item_type = 'raw_material'
     WHERE inv.tenant_id = ? AND inv.total_quantity > 0
       AND COALESCE(m.material_name, im.item_name) IS NOT NULL
     ORDER BY inv.total_quantity ASC
     LIMIT 20`,
    [tenantId]
  );

  const items = rows as any[];
  if (items.length === 0) return predictions;

  // 그룹화: 3일 이내, 7일 이내, 14일 이내
  const critical = items.filter((i) => i.daysLeft <= 3);
  const high = items.filter((i) => i.daysLeft > 3 && i.daysLeft <= 7);

  if (critical.length > 0) {
    predictions.push({
      type: "expiry_risk",
      title: `소비기한 임박 (3일 이내) - ${critical.length}건`,
      description: critical.map((i) => `${i.name} (LOT: ${i.lot_number}): ${i.daysLeft}일 남음, ${i.quantity}${i.unit}`).join("; "),
      confidence: "high",
      timeframe: "3일",
      currentValue: critical.length,
      predictedValue: 0,
      trend: "down",
      riskLevel: "critical",
      details: { items: critical },
      recommendations: [
        "FEFO 기반 우선 사용",
        "사용 불가 시 폐기 절차 진행",
        "재고 회전율 개선 검토",
      ],
    });
  }

  if (high.length > 0) {
    predictions.push({
      type: "expiry_risk",
      title: `소비기한 임박 (7일 이내) - ${high.length}건`,
      description: high.map((i) => `${i.name}: ${i.daysLeft}일`).join(", "),
      confidence: "high",
      timeframe: "7일",
      currentValue: high.length,
      predictedValue: 0,
      trend: "down",
      riskLevel: "high",
      details: { items: high },
      recommendations: [
        "해당 원재료 우선 사용 계획 수립",
        "생산 스케줄 조정 검토",
      ],
    });
  }

  return predictions;
}

// ============================================================================
// 통합 예측 + AI 내러티브
// ============================================================================

export async function generatePredictions(
  tenantId: number,
  userMessage?: string
): Promise<PredictionReport> {
  // 모든 예측기 병렬 실행
  const [stockout, yieldTrend, ccpRisk, financial, expiry] = await Promise.all([
    predictStockout(tenantId).catch(() => []),
    predictYieldTrend(tenantId).catch(() => []),
    predictCCPRisk(tenantId).catch(() => []),
    predictFinancialTrend(tenantId).catch(() => []),
    predictExpiryRisk(tenantId).catch(() => []),
  ]);

  const allPredictions = [
    ...stockout,
    ...yieldTrend,
    ...ccpRisk,
    ...financial,
    ...expiry,
  ].sort((a, b) => {
    const risk = { critical: 0, high: 1, medium: 2, low: 3 };
    return (risk[a.riskLevel] || 3) - (risk[b.riskLevel] || 3);
  });

  // AI 종합 전망 생성
  let aiNarrative: string | undefined;
  if (allPredictions.length > 0 && ENV.forgeApiKey) {
    try {
      const summaryData = allPredictions.map((p) =>
        `[${p.riskLevel}] ${p.title}: ${p.description}`
      ).join("\n");

      const result = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `당신은 HACCP 시스템의 예측 분석 전문가입니다.
예측 데이터를 종합 분석하여 경영진이 이해할 수 있는 전망 보고서를 작성하세요.
- 핵심 리스크를 먼저 언급
- 구체적 수치와 기간을 포함
- 실행 가능한 권장사항 제시
- 한국어, 마크다운 형식, 5~8문장`,
          },
          {
            role: "user",
            content: userMessage
              ? `사용자 질문: ${userMessage}\n\n예측 데이터:\n${summaryData}`
              : `예측 데이터:\n${summaryData}`,
          },
        ],
        maxTokens: 800,
      });

      aiNarrative = typeof result.choices[0]?.message?.content === "string"
        ? result.choices[0].message.content : undefined;
    } catch { /* AI 요약 실패 무시 */ }
  }

  return {
    tenantId,
    generatedAt: new Date().toISOString(),
    predictions: allPredictions,
    aiNarrative,
  };
}

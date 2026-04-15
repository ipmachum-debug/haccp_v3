/**
 * AI 이상탐지 엔진 (Anomaly Detection)
 *
 * 규칙 기반 임계값 비교가 아닌, 데이터 패턴 기반 이상 감지:
 * 1. 온도 데이터 - 이동평균 대비 이상 편차 (Z-score)
 * 2. 생산 수율 - 히스토리 대비 급격한 변화
 * 3. CCP 이탈 빈도 - 시계열 패턴 이상
 * 4. 체크리스트 완료율 - 급격한 하락 감지
 * 5. LLM 기반 종합 이상 분석
 */

import { getRawConnection } from "../connection";
import { invokeLLM } from "../../_core/llm";
import { ENV } from "../../_core/env";

// ============================================================================
// 타입 정의
// ============================================================================

export type AnomalyType =
  | "temperature_spike"
  | "temperature_drift"
  | "yield_drop"
  | "ccp_frequency"
  | "checklist_decline"
  | "production_time_anomaly"
  | "equipment_pattern";

export type AnomalySeverity = "critical" | "high" | "medium" | "low";

export type DetectedAnomaly = {
  type: AnomalyType;
  severity: AnomalySeverity;
  title: string;
  description: string;
  dataPoints: Array<{ label: string; value: number; expected: number }>;
  detectedAt: string;
  location?: string;
  possibleCauses?: string[];
  recommendedActions?: string[];
  zScore?: number;
};

export type AnomalyReport = {
  tenantId: number;
  analyzedAt: string;
  totalAnomalies: number;
  criticalCount: number;
  anomalies: DetectedAnomaly[];
  aiSummary?: string;
};

// ============================================================================
// 통계 유틸리티
// ============================================================================

function calculateStats(values: number[]): { mean: number; stdDev: number } {
  if (values.length === 0) return { mean: 0, stdDev: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return { mean, stdDev: Math.sqrt(variance) };
}

function zScore(value: number, mean: number, stdDev: number): number {
  if (stdDev === 0) return 0;
  return Math.abs((value - mean) / stdDev);
}

// ============================================================================
// 1. 온도 이상 탐지
// ============================================================================

async function detectTemperatureAnomalies(tenantId: number): Promise<DetectedAnomaly[]> {
  const conn = await getRawConnection();
  const anomalies: DetectedAnomaly[] = [];

  // 최근 7일 온도 데이터 (위치별)
  const [rows] = await conn.execute(
    `SELECT location, temperature, humidity, log_time, status
     FROM h_temperature_logs
     WHERE tenant_id = ? AND log_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)
     ORDER BY location, log_time`,
    [tenantId]
  );

  const logs = rows as any[];
  if (logs.length === 0) return anomalies;

  // 위치별 그룹화
  const byLocation = new Map<string, any[]>();
  for (const log of logs) {
    const loc = log.location || "unknown";
    if (!byLocation.has(loc)) byLocation.set(loc, []);
    byLocation.get(loc)!.push(log);
  }

  for (const [location, locationLogs] of byLocation) {
    const temps = locationLogs.map((l) => Number(l.temperature)).filter((t) => !isNaN(t));
    if (temps.length < 5) continue;

    const { mean, stdDev } = calculateStats(temps);

    // 최근 24시간 데이터에서 이상 찾기
    const cutoff = new Date(Date.now() - 24 * 3600000);
    const recentLogs = locationLogs.filter((l) => new Date(l.log_time) >= cutoff);

    for (const log of recentLogs) {
      const temp = Number(log.temperature);
      const z = zScore(temp, mean, stdDev);

      // Z-score > 2.5 → 이상 탐지 (급격한 온도 변화)
      if (z > 2.5) {
        anomalies.push({
          type: "temperature_spike",
          severity: z > 4 ? "critical" : z > 3 ? "high" : "medium",
          title: `온도 이상 감지 - ${location}`,
          description: `${location}에서 비정상 온도 ${temp}°C 감지 (평균 ${mean.toFixed(1)}°C, Z-score: ${z.toFixed(1)})`,
          dataPoints: [
            { label: "현재 온도", value: temp, expected: Math.round(mean * 10) / 10 },
            { label: "표준편차", value: Math.round(stdDev * 10) / 10, expected: 0 },
          ],
          detectedAt: log.log_time,
          location,
          zScore: Math.round(z * 100) / 100,
          possibleCauses: [
            "냉장/냉동 장비 고장",
            "문 장시간 개방",
            "외부 온도 급변",
            "센서 오작동",
          ],
          recommendedActions: [
            "해당 장비 즉시 점검",
            "보관 식품 안전 확인",
            "온도 센서 정확도 검증",
          ],
        });
        break; // 위치당 1개만
      }
    }

    // 온도 드리프트 감지 (7일간 지속적 상승/하강)
    if (temps.length >= 14) {
      const firstHalf = temps.slice(0, Math.floor(temps.length / 2));
      const secondHalf = temps.slice(Math.floor(temps.length / 2));
      const firstMean = calculateStats(firstHalf).mean;
      const secondMean = calculateStats(secondHalf).mean;
      const drift = secondMean - firstMean;

      if (Math.abs(drift) > stdDev * 1.5 && stdDev > 0.5) {
        anomalies.push({
          type: "temperature_drift",
          severity: Math.abs(drift) > stdDev * 3 ? "high" : "medium",
          title: `온도 드리프트 감지 - ${location}`,
          description: `${location}의 온도가 지속적으로 ${drift > 0 ? "상승" : "하강"} 중 (${drift > 0 ? "+" : ""}${drift.toFixed(1)}°C)`,
          dataPoints: [
            { label: "초기 평균", value: Math.round(firstMean * 10) / 10, expected: Math.round(mean * 10) / 10 },
            { label: "최근 평균", value: Math.round(secondMean * 10) / 10, expected: Math.round(mean * 10) / 10 },
          ],
          detectedAt: new Date().toISOString(),
          location,
          possibleCauses: [
            "냉각 장비 성능 저하",
            "외부 환경 변화",
            "단열 손상",
          ],
          recommendedActions: [
            "냉각 장비 정비 일정 확인",
            "단열재 점검",
            "모니터링 주기 단축",
          ],
        });
      }
    }
  }

  return anomalies;
}

// ============================================================================
// 2. 생산 수율 이상 탐지
// ============================================================================

async function detectYieldAnomalies(tenantId: number): Promise<DetectedAnomaly[]> {
  const conn = await getRawConnection();
  const anomalies: DetectedAnomaly[] = [];

  // 최근 30일 배치별 수율
  const [rows] = await conn.execute(
    `SELECT b.id, b.batch_code, b.actual_yield, b.product_id,
            COALESCE(p.product_name, '') as productName,
            b.completed_at
     FROM h_batches b
     LEFT JOIN h_products_v2 p ON p.id = b.product_id
     WHERE b.tenant_id = ? AND b.status = 'completed'
       AND b.actual_yield IS NOT NULL
       AND b.completed_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)
     ORDER BY b.completed_at DESC`,
    [tenantId]
  );

  const batches = rows as any[];
  if (batches.length < 5) return anomalies;

  // 제품별 수율 분석
  const byProduct = new Map<number, any[]>();
  for (const b of batches) {
    if (!byProduct.has(b.product_id)) byProduct.set(b.product_id, []);
    byProduct.get(b.product_id)!.push(b);
  }

  for (const [productId, productBatches] of byProduct) {
    if (productBatches.length < 3) continue;
    const yields = productBatches.map((b) => Number(b.actual_yield));
    const { mean, stdDev } = calculateStats(yields);

    // 최근 배치 확인
    const recent = productBatches[0];
    const recentYield = Number(recent.actual_yield);
    const z = zScore(recentYield, mean, stdDev);

    if (z > 2 && recentYield < mean) {
      anomalies.push({
        type: "yield_drop",
        severity: z > 3 ? "high" : "medium",
        title: `수율 급락 - ${recent.productName}`,
        description: `${recent.productName} (${recent.batch_code}): 수율 ${recentYield}% (평균 ${mean.toFixed(1)}%, Z-score: ${z.toFixed(1)})`,
        dataPoints: [
          { label: "실제 수율", value: recentYield, expected: Math.round(mean) },
          { label: "평균 수율", value: Math.round(mean), expected: Math.round(mean) },
        ],
        detectedAt: recent.completed_at || new Date().toISOString(),
        possibleCauses: [
          "원재료 품질 변화",
          "공정 조건 변동",
          "설비 상태 이상",
          "작업자 변경",
        ],
        recommendedActions: [
          "해당 배치 원재료 이력 확인",
          "CCP 기록 검토",
          "설비 점검",
        ],
      });
    }
  }

  return anomalies;
}

// ============================================================================
// 3. CCP 이탈 빈도 이상 탐지
// ============================================================================

async function detectCCPFrequencyAnomalies(tenantId: number): Promise<DetectedAnomaly[]> {
  const conn = await getRawConnection();
  const anomalies: DetectedAnomaly[] = [];

  // 최근 30일 일별 CCP FAIL 수
  const [rows] = await conn.execute(
    `SELECT DATE(hci.work_date) as dt, COUNT(*) as failCount
     FROM h_ccp_rows hcr
     JOIN h_ccp_instances hci ON hci.id = hcr.instance_id
     WHERE hci.tenant_id = ? AND hcr.result = 'FAIL'
       AND hci.work_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
     GROUP BY DATE(hci.work_date)
     ORDER BY dt`,
    [tenantId]
  );

  const dailyFails = rows as any[];
  if (dailyFails.length < 5) return anomalies;

  const counts = dailyFails.map((d) => Number(d.failCount));
  const { mean, stdDev } = calculateStats(counts);

  // 최근 3일의 이탈 빈도가 비정상적으로 높은지 확인
  const recent3 = dailyFails.slice(-3);
  for (const day of recent3) {
    const z = zScore(Number(day.failCount), mean, stdDev);
    if (z > 2) {
      anomalies.push({
        type: "ccp_frequency",
        severity: z > 3 ? "critical" : "high",
        title: `CCP 이탈 빈도 급증 - ${day.dt}`,
        description: `${day.dt}: CCP 이탈 ${day.failCount}건 (일평균 ${mean.toFixed(1)}건, Z-score: ${z.toFixed(1)})`,
        dataPoints: [
          { label: "당일 이탈", value: Number(day.failCount), expected: Math.round(mean) },
        ],
        detectedAt: day.dt,
        possibleCauses: [
          "공정 조건 전반적 변화",
          "원재료 품질 일괄 하락",
          "설비 동시 고장",
          "계절적 환경 변화",
        ],
        recommendedActions: [
          "이탈 발생 CCP 포인트별 상세 분석",
          "원재료 수입검사 결과 확인",
          "공정 파라미터 재검증",
        ],
      });
      break; // 기간 내 1건만
    }
  }

  return anomalies;
}

// ============================================================================
// 4. 체크리스트 완료율 급락 탐지
// ============================================================================

async function detectChecklistDecline(tenantId: number): Promise<DetectedAnomaly[]> {
  const conn = await getRawConnection();
  const anomalies: DetectedAnomaly[] = [];

  // 최근 14일 일별 체크리스트 완료율
  const [rows] = await conn.execute(
    `SELECT DATE(ci.created_at) as dt,
            COUNT(*) as total,
            SUM(CASE WHEN ci.status IN ('completed', 'approved') THEN 1 ELSE 0 END) as completed
     FROM checklist_instances ci
     WHERE ci.tenant_id = ? AND ci.created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
     GROUP BY DATE(ci.created_at)
     ORDER BY dt`,
    [tenantId]
  );

  const daily = rows as any[];
  if (daily.length < 5) return anomalies;

  const rates = daily.map((d) => d.total > 0 ? (Number(d.completed) / Number(d.total)) * 100 : 100);
  const { mean, stdDev } = calculateStats(rates);

  // 최근 2일 확인
  const recent = daily.slice(-2);
  for (const day of recent) {
    const rate = day.total > 0 ? (Number(day.completed) / Number(day.total)) * 100 : 100;
    const z = zScore(rate, mean, stdDev);

    if (z > 2 && rate < mean) {
      anomalies.push({
        type: "checklist_decline",
        severity: rate < 50 ? "high" : "medium",
        title: `체크리스트 완료율 급락 - ${day.dt}`,
        description: `${day.dt}: 완료율 ${rate.toFixed(0)}% (평균 ${mean.toFixed(0)}%)`,
        dataPoints: [
          { label: "당일 완료율", value: Math.round(rate), expected: Math.round(mean) },
        ],
        detectedAt: day.dt,
        possibleCauses: [
          "인력 부족/교대 문제",
          "시스템 접근 문제",
          "업무 과부하",
        ],
        recommendedActions: [
          "미완료 체크리스트 즉시 작성 독려",
          "담당자 확인",
        ],
      });
      break;
    }
  }

  return anomalies;
}

// ============================================================================
// 5. 생산 시간 이상 탐지
// ============================================================================

async function detectProductionTimeAnomalies(tenantId: number): Promise<DetectedAnomaly[]> {
  const conn = await getRawConnection();
  const anomalies: DetectedAnomaly[] = [];

  // 최근 완료 배치의 생산 소요시간
  const [rows] = await conn.execute(
    `SELECT b.batch_code, b.product_id, COALESCE(p.product_name, '') as productName,
            TIMESTAMPDIFF(MINUTE, b.start_time, b.end_time) as durationMin,
            b.completed_at
     FROM h_batches b
     LEFT JOIN h_products_v2 p ON p.id = b.product_id
     WHERE b.tenant_id = ? AND b.status = 'completed'
       AND b.start_time IS NOT NULL AND b.end_time IS NOT NULL
       AND b.completed_at >= DATE_SUB(NOW(), INTERVAL 60 DAY)
     ORDER BY b.completed_at DESC`,
    [tenantId]
  );

  const batches = rows as any[];
  if (batches.length < 5) return anomalies;

  // 제품별 소요시간 분석
  const byProduct = new Map<number, any[]>();
  for (const b of batches) {
    if (!byProduct.has(b.product_id)) byProduct.set(b.product_id, []);
    byProduct.get(b.product_id)!.push(b);
  }

  for (const [, productBatches] of byProduct) {
    if (productBatches.length < 3) continue;
    const durations = productBatches.map((b) => Number(b.durationMin)).filter((d) => d > 0);
    const { mean, stdDev } = calculateStats(durations);

    const recent = productBatches[0];
    const dur = Number(recent.durationMin);
    const z = zScore(dur, mean, stdDev);

    if (z > 2.5 && dur > 0) {
      anomalies.push({
        type: "production_time_anomaly",
        severity: z > 3.5 ? "high" : "medium",
        title: `생산 시간 이상 - ${recent.productName}`,
        description: `${recent.batch_code}: 소요 ${dur}분 (평균 ${mean.toFixed(0)}분, ${dur > mean ? "초과" : "미달"})`,
        dataPoints: [
          { label: "소요시간(분)", value: dur, expected: Math.round(mean) },
        ],
        detectedAt: recent.completed_at || new Date().toISOString(),
        possibleCauses: dur > mean
          ? ["설비 속도 저하", "원재료 처리 지연", "인력 부족"]
          : ["공정 단축 (품질 우려)", "센서/기록 오류"],
        recommendedActions: [
          "해당 배치 품질 검사 결과 확인",
          "공정 기록 상세 검토",
        ],
      });
    }
  }

  return anomalies;
}

// ============================================================================
// 통합 이상 탐지 + AI 요약
// ============================================================================

export async function detectAnomalies(tenantId: number): Promise<AnomalyReport> {
  // 모든 탐지기 병렬 실행
  const [tempAnomalies, yieldAnomalies, ccpAnomalies, checklistAnomalies, timeAnomalies] =
    await Promise.all([
      detectTemperatureAnomalies(tenantId).catch(() => []),
      detectYieldAnomalies(tenantId).catch(() => []),
      detectCCPFrequencyAnomalies(tenantId).catch(() => []),
      detectChecklistDecline(tenantId).catch(() => []),
      detectProductionTimeAnomalies(tenantId).catch(() => []),
    ]);

  const allAnomalies = [
    ...tempAnomalies,
    ...yieldAnomalies,
    ...ccpAnomalies,
    ...checklistAnomalies,
    ...timeAnomalies,
  ].sort((a, b) => {
    const sev = { critical: 0, high: 1, medium: 2, low: 3 };
    return (sev[a.severity] || 3) - (sev[b.severity] || 3);
  });

  const criticalCount = allAnomalies.filter((a) => a.severity === "critical").length;

  // AI 종합 분석 (이상이 있을 때만)
  let aiSummary: string | undefined;
  if (allAnomalies.length > 0 && ENV.forgeApiKey) {
    try {
      const result = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `당신은 HACCP 식품안전 전문가입니다. 감지된 이상 패턴을 종합 분석하여 핵심 위험과 권장 조치를 한국어로 간결하게 요약하세요. 3~5문장으로 작성하세요.`,
          },
          {
            role: "user",
            content: `감지된 이상 패턴 ${allAnomalies.length}건:\n${allAnomalies.map((a) => `- [${a.severity}] ${a.title}: ${a.description}`).join("\n")}`,
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
    totalAnomalies: allAnomalies.length,
    criticalCount,
    anomalies: allAnomalies,
    aiSummary,
  };
}

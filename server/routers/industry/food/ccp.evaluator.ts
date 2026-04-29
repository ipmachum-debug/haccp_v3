/**
 * 식품 CCP 측정값 평가기 — ControlPoint.evaluate() 첫 사용 (CP-3 PoC)
 *
 * ============================================================================
 * Layer 4 (industry / food) — 식품 HACCP 어댑터 확장.
 *
 * 책임:
 *   ccp_monitoring_records row 의 측정값(온도/시간/압력/금속검출 등) 을
 *   업종 무관 Measurement entity 로 변환 → ControlPoint.evaluate() 호출.
 *
 * 가치 (CP-1/CP-2 의 첫 실 사용):
 *   - 식품 CCP record + ccp_limits → EvaluationResult { normal | deviation }
 *   - 이탈 감지 시 Deviation entity 생성 (F-3 IoT 폐쇄 루프 토대)
 *   - 향후 ccpRecords 라우터 INSERT 후 자동 호출 (별도 PR — 이번은 헬퍼만)
 *
 * 트리거: PR #119 ControlPoint 설계 / PR #122 CP-1 entity / PR #123 CP-2 어댑터
 * 단계: CP-3 (이 PR — PoC, 사용처 0)
 *
 * 의존:
 *   - server/core-mes/quality (Layer 2 — 정방향)
 *   - drizzle/schema/ccpMonitoring (식품 전용 스키마)
 *
 * 절대 import 금지 (ADR-002):
 *   - 다른 industry/* (cosmetic/pharma 등)
 * ============================================================================
 */

import {
  evaluate,
  type ControlPoint,
  type EvaluationResult,
  type Measurement,
  type Deviation,
} from "../../../core-mes/quality";
import { ccpMonitoringRecords } from "../../../../drizzle/schema/ccpMonitoring";
import { mapCcpLimitToControlPoint } from "./ccp.adapter";

/** ccp_monitoring_records row 타입 (Drizzle 추론) */
type CcpRecordRow = typeof ccpMonitoringRecords.$inferSelect;

/**
 * 측정값 추출 — record 의 컬럼별 측정 데이터를 Measurement[] 로 변환.
 *
 * ccp_monitoring_records 컬럼 매핑:
 *   - temperatureC      → 온도 측정 (CCP-1B 가열공정)
 *   - heatingTimeMin    → 가열 시간 측정
 *   - pressureMpa       → 압력 측정
 *   - feTestPiecePass   → Fe 시편 통과 (CCP-4P 금속검출)
 *   - stsTestPiecePass  → STS 시편 통과
 *   - productOnlyPass   → 제품만 통과
 *
 * 각 측정은 같은 measuredAt 시각을 공유 (record.recordDate 또는 measurementTime).
 */
export function extractMeasurementsFromRecord(
  record: CcpRecordRow,
): Map<string, Measurement> {
  const measurements = new Map<string, Measurement>();

  const measuredAt = record.recordDate ? new Date(record.recordDate) : new Date();
  const measuredBy = record.operatorId ? Number(record.operatorId) : undefined;
  const baseMetadata = {
    productName: record.productName,
    batchId: record.batchId,
  };

  // 온도 (CCP-1B / CCP-2B 가열공정)
  if (record.temperatureC !== null && record.temperatureC !== undefined) {
    measurements.set("온도", {
      value: parseFloat(String(record.temperatureC)),
      measuredAt,
      measuredBy,
      metadata: baseMetadata,
    });
  }

  // 가열 시간
  if (record.heatingTimeMin !== null && record.heatingTimeMin !== undefined) {
    measurements.set("가열시간", {
      value: Number(record.heatingTimeMin),
      measuredAt,
      measuredBy,
      metadata: baseMetadata,
    });
  }

  // 압력 (CCP-1B 만)
  if (record.pressureMpa !== null && record.pressureMpa !== undefined) {
    measurements.set("압력", {
      value: parseFloat(String(record.pressureMpa)),
      measuredAt,
      measuredBy,
      metadata: baseMetadata,
    });
  }

  // 금속검출 (CCP-4P) — boolean 측정 (O = pass / X = fail)
  if (record.feTestPiecePass) {
    measurements.set("Fe시편", {
      value: record.feTestPiecePass === "O",
      measuredAt,
      measuredBy,
      metadata: { ...baseMetadata, raw: record.feTestPiecePass },
    });
  }
  if (record.stsTestPiecePass) {
    measurements.set("STS시편", {
      value: record.stsTestPiecePass === "O",
      measuredAt,
      measuredBy,
      metadata: { ...baseMetadata, raw: record.stsTestPiecePass },
    });
  }
  if (record.productOnlyPass) {
    measurements.set("제품통과", {
      value: record.productOnlyPass === "O",
      measuredAt,
      measuredBy,
      metadata: { ...baseMetadata, raw: record.productOnlyPass },
    });
  }

  return measurements;
}

/**
 * ccp_record + control_point → EvaluationResult.
 *
 * record 의 측정값 중 controlPoint.limits 의 label 과 매칭되는 것을 평가.
 * 모든 한계 통과 시 normal, 하나라도 어기면 deviation.
 *
 * 예시:
 *   const cp = mapCcpLimitToControlPoint(ccpLimitsRow);
 *   const record = await db.select().from(ccpMonitoringRecords)...
 *   const result = evaluateCcpRecord(record, cp);
 *   if (result.type === "deviation") {
 *     // F-3 IoT 폐쇄 루프 트리거 (별도 PR)
 *     console.warn(`이탈: ${cp.code} - ${result.deviation.violatedLimit.label}`);
 *   }
 *
 * @param record         ccp_monitoring_records row
 * @param controlPoint   ControlPoint entity (mapCcpLimitToControlPoint 변환 결과)
 * @param context        선택 — Deviation 생성 시 보강 정보
 * @returns EvaluationResult — 첫 어긴 한계가 violatedLimit
 */
export function evaluateCcpRecord(
  record: CcpRecordRow,
  controlPoint: ControlPoint,
  context?: { batchId?: number; lotIds?: readonly number[] },
): EvaluationResult {
  const measurements = extractMeasurementsFromRecord(record);

  // ControlPoint 의 한계기준을 순차 평가
  // limits 의 label 이 measurement key 와 매칭되어야 함.
  for (const limit of controlPoint.limits) {
    const measurementKey = limit.label?.replace(/ (min|max)$/, ""); // "가열시간 min" → "가열시간"
    if (!measurementKey) continue;

    const measurement = measurements.get(measurementKey);
    if (!measurement) {
      // record 에 해당 측정값 없음 — skip (다른 한계로)
      continue;
    }

    // 단일 한계만 가진 임시 ControlPoint 로 평가 (간소화)
    const singleLimitCP: ControlPoint = {
      ...controlPoint,
      limits: [limit],
    };
    const result = evaluate(singleLimitCP, measurement, context);
    if (result.type === "deviation") {
      return result; // 첫 어긴 한계 즉시 반환
    }
  }

  // 모든 한계 통과 (또는 매칭 측정값 없음) → normal
  // 임시 measurement (ControlPoint 한 limit 의 측정 또는 첫 측정값)
  const firstMeasurement = measurements.values().next().value;
  if (firstMeasurement) {
    return { type: "normal", measurement: firstMeasurement };
  }

  // record 에 측정값 자체가 없음 — invariant 위배지만 normal 반환 (안전)
  return {
    type: "normal",
    measurement: {
      value: 0,
      measuredAt: new Date(),
      metadata: { warning: "no_measurement_extracted" },
    },
  };
}

/**
 * 다중 ControlPoint 에 대해 record 평가 — record 가 여러 CCP 의 측정 포함 시.
 *
 * 예: CCP-1B (가열) record 에 온도/시간/압력 측정. 각각 별도 ControlPoint 로 평가.
 *
 * @param record          ccp_monitoring_records row
 * @param controlPoints   해당 record 의 ccpType 에 매핑되는 ControlPoint 목록
 * @param context         선택
 * @returns EvaluationResult[] (각 ControlPoint 별 평가)
 */
export function evaluateCcpRecordMulti(
  record: CcpRecordRow,
  controlPoints: ControlPoint[],
  context?: { batchId?: number; lotIds?: readonly number[] },
): EvaluationResult[] {
  return controlPoints.map((cp) => evaluateCcpRecord(record, cp, context));
}

/**
 * 평가 결과에서 Deviation 만 추출 (편의 함수).
 *
 * F-3 IoT 폐쇄 루프 (별도 PR) 가 이 결과를 받아 자동 처리:
 *   - LOT HOLD (h_inventory_lots.status='reserved')
 *   - 손실 분개 자동 생성
 *   - 시정조치 워크플로우 트리거
 *   - 알림 발송
 */
export function extractDeviations(
  results: EvaluationResult[],
): Deviation[] {
  return results
    .filter((r): r is { type: "deviation"; deviation: Deviation } => r.type === "deviation")
    .map((r) => r.deviation);
}

// re-export for convenience
export { mapCcpLimitToControlPoint };

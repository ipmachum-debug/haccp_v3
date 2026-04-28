/**
 * ControlPoint — 한계관리점 추상
 *
 * ============================================================================
 * Layer 2 (core-mes / quality) — 업종 무관 도메인 entity.
 *
 * 본 entity 는 다음을 모두 표현 가능:
 *   - 식품 HACCP의 CCP (Critical Control Point)
 *   - 화장품 GMP의 CQP (Critical Quality Point)
 *   - 의약품 GMP의 IPC (In-Process Control)
 *   - ISO 22000의 OPRP / CCP
 *
 * 핵심 invariant:
 *   "이 파일에는 '식품' / 'HACCP' / 'CCP' 라는 단어가 코드 식별자에 0회 등장."
 *   → PR #118 외부 실사 자료 Part II 의 검증 통과 (코어 침투 0).
 *
 * 트리거: PR #119 ControlPoint 추상화 설계 / PR #118 Part II 인사이트
 * 의존성: 어떤 layer 도 import 하지 않음 (순수 도메인)
 *
 * 사용 예시 (어댑터에서 매핑):
 *   - food.ccp.adapter.ts: h_ccp_definitions → ControlPoint 변환
 *   - cosmetic.cqp.adapter.ts: 화장품 CQP 5종 → ControlPoint
 *   - pharma.ipc.adapter.ts: 의약품 IPC → ControlPoint
 *
 * 마이그레이션 단계 (PR #119 의 CP-1 ~ CP-6):
 *   ✅ CP-1 (이 PR): entity 선언 + evaluate() 함수
 *   ⏳ CP-2: 식품 어댑터 (h_ccp_* → ControlPoint 변환)
 *   ⏳ CP-3: F-3 IoT 폐쇄 루프 (ControlPoint.evaluate 사용)
 *   ⏳ CP-4: 기존 ccpRouter 점진 이주
 *   ⏳ CP-5: DB 스키마 추상화 (Phase 2 직전)
 *   ⏳ CP-6: 화장품 CQP 어댑터 (Phase 2 진입)
 * ============================================================================
 */

import { type CriticalLimit, isWithin } from "./criticalLimit";
import type { Measurement } from "./measurement";
import type { Deviation, DeviationSeverity } from "./deviation";

/** 모니터링 주기 */
export type MonitoringFrequency =
  | "continuous"        // 연속 (IoT 센서)
  | "every_batch"       // 매 배치
  | "hourly"            // 시간별
  | "daily"             // 일별
  | "weekly"            // 주별
  | "monthly"           // 월별
  | "ad_hoc";           // 부정기

/** 한계관리점 entity */
export interface ControlPoint {
  /** 도메인 식별자 */
  readonly id: number;

  /** tenant 격리 */
  readonly tenantId: number;

  /**
   * 업종별 표시 코드 (어댑터가 결정).
   *   - 식품: "CCP-1B", "CCP-2B", "CCP-3B", "CCP-4P"
   *   - 화장품: "CQP-1", "CQP-3"
   *   - 의약품: "IPC-A2"
   */
  readonly code: string;

  /**
   * 카테고리 (어댑터가 결정).
   *   - 식품: "온도", "시간", "pH", "금속검출"
   *   - 화장품: "충진량", "점도", "pH", "외관"
   *   - 의약품: "공정관리", "품질"
   */
  readonly category: string;

  /** 한계기준 (다중 가능 — AND 평가) */
  readonly limits: readonly CriticalLimit[];

  /** 모니터링 주기 */
  readonly monitoringFrequency: MonitoringFrequency;

  /** 책임자 역할 (예: "QA 팀장", "생산직 작업자") */
  readonly responsibleRole: string;

  /** 활성 여부 (비활성 시 모니터링 안 함) */
  readonly isActive: boolean;

  /**
   * 이탈 시 기본 심각도 (어댑터가 결정 — 식품 CCP 는 critical 권장).
   * 측정값별 심각도 차등은 어댑터에서 evaluate 결과를 후처리.
   */
  readonly defaultSeverity: DeviationSeverity;
}

/** ControlPoint.evaluate() 결과 */
export type EvaluationResult =
  | { readonly type: "normal"; readonly measurement: Measurement }
  | { readonly type: "deviation"; readonly deviation: Deviation };

/**
 * 측정값을 ControlPoint 의 한계기준 모두에 대해 평가.
 *
 * 평가 로직:
 *   1. 다중 한계기준은 AND 평가 (하나라도 어기면 deviation)
 *   2. 첫 번째 어긴 한계기준이 violatedLimit 으로 보고됨
 *   3. 정상이면 normal 반환
 *
 * @param controlPoint 평가 대상 ControlPoint
 * @param measurement  측정값
 * @param context      Deviation 생성 시 보강 정보 (영향 LOT 등) — F-3 가 채움
 * @returns EvaluationResult
 */
export function evaluate(
  controlPoint: ControlPoint,
  measurement: Measurement,
  context?: {
    readonly batchId?: number;
    readonly lotIds?: readonly number[];
  },
): EvaluationResult {
  if (!controlPoint.isActive) {
    // 비활성 ControlPoint 는 평가하지 않음 — 정상으로 분류
    return { type: "normal", measurement };
  }

  for (const limit of controlPoint.limits) {
    if (!isWithin(limit, measurement)) {
      const deviation: Deviation = {
        controlPointId: controlPoint.id,
        measurement,
        violatedLimit: limit,
        deviatedAt: measurement.measuredAt,
        severity: controlPoint.defaultSeverity,
        batchId: context?.batchId,
        lotIds: context?.lotIds ?? [],
        tenantId: controlPoint.tenantId,
      };
      return { type: "deviation", deviation };
    }
  }

  return { type: "normal", measurement };
}

/**
 * Deviation — 한계기준 이탈 이벤트
 *
 * ControlPoint.evaluate() 가 이탈 감지 시 발행하는 이벤트.
 * F-3 (IoT 폐쇄 루프, 특허 [0016]) 의 핵심 트리거.
 *
 * 후속 작업:
 *   - LOT HOLD 처리 (어댑터)
 *   - 손실 분개 자동 생성 (회계 도메인)
 *   - 시정조치 워크플로 트리거 (compliance 도메인)
 *
 * 트리거: PR #119 ControlPoint 추상화 설계
 */

import type { CriticalLimit } from "./criticalLimit";
import type { Measurement } from "./measurement";

/** 이탈 심각도 */
export type DeviationSeverity = "minor" | "major" | "critical";

/** 이탈 이벤트 entity */
export interface Deviation {
  /** 이탈한 ControlPoint id */
  readonly controlPointId: number;

  /** 이탈한 시점의 측정값 */
  readonly measurement: Measurement;

  /** 이탈한 한계기준 (다중 한계 중 어떤 것을 어겼는지) */
  readonly violatedLimit: CriticalLimit;

  /** 이탈 시각 (KST) */
  readonly deviatedAt: Date;

  /** 심각도 (어댑터가 결정 — 식품 CCP 는 항상 critical, 화장품 CQP 는 minor~critical) */
  readonly severity: DeviationSeverity;

  /** 영향받은 배치 (있을 때) */
  readonly batchId?: number;

  /** 영향받은 LOT 목록 (HOLD 대상) */
  readonly lotIds: readonly number[];

  /** tenant 격리 */
  readonly tenantId: number;
}

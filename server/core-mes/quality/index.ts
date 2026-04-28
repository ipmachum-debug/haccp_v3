/**
 * core-mes / quality — 한계관리점 도메인 (Layer 2)
 *
 * 업종 무관 entity 모음:
 *   - ControlPoint    한계관리점 (CCP / CQP / IPC 추상)
 *   - CriticalLimit   한계기준
 *   - Measurement     측정값
 *   - Deviation       이탈 이벤트
 *
 * 트리거: PR #119 ControlPoint 추상화 설계
 * 진행: CP-1 entity 선언 (이 PR)
 */

export type {
  ControlPoint,
  EvaluationResult,
  MonitoringFrequency,
} from "./controlPoint";
export { evaluate } from "./controlPoint";

export type {
  CriticalLimit,
  CriticalLimitType,
} from "./criticalLimit";
export { isWithin } from "./criticalLimit";

export type { Measurement } from "./measurement";

export type { Deviation, DeviationSeverity } from "./deviation";

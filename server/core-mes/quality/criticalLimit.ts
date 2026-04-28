/**
 * CriticalLimit — 한계기준 추상
 *
 * ============================================================================
 * Layer 2 (core-mes / quality) — 업종 무관 도메인 entity.
 *
 * 트리거: PR #119 ControlPoint 추상화 설계 / PR #118 외부 실사 자료 Part II
 * 의존성: 어떤 layer 도 import 하지 않음 (순수 도메인)
 *
 * 표현 가능한 한계 유형:
 *   - min:    측정값 ≥ value
 *   - max:    측정값 ≤ value
 *   - range:  min ≤ 측정값 ≤ max
 *   - boolean: 측정값이 true/false 와 일치
 *   - categorical: 측정값이 허용 카테고리 내
 *
 * 업종별 사용 예시 (어댑터에서 매핑):
 *   - 식품 HACCP CCP 가열공정: { type: "min", value: 75, unit: "°C" }
 *   - 화장품 GMP 충진량 검사:   { type: "range", value: { min: 49.5, max: 50.5 }, unit: "ml" }
 *   - 의약품 GMP IPC pH 검사:  { type: "range", value: { min: 6.8, max: 7.2 } }
 * ============================================================================
 */

import type { Measurement } from "./measurement";

/** 한계 유형 */
export type CriticalLimitType = "min" | "max" | "range" | "boolean" | "categorical";

/** 한계기준 entity */
export interface CriticalLimit {
  readonly type: CriticalLimitType;

  /**
   * 한계값. 유형에 따라 의미 다름:
   *   - min / max: number (단일 임계값)
   *   - range: { min: number; max: number } (범위)
   *   - boolean: boolean (기대값)
   *   - categorical: string[] (허용 카테고리 목록)
   */
  readonly value:
    | number
    | { min: number; max: number }
    | boolean
    | readonly string[];

  /** 측정 단위 (예: "°C", "ml", "ppm") — 유형 boolean / categorical 일 때 미사용 */
  readonly unit?: string;

  /** 한계 식별자 (감사 / 보고서 출력용, 어댑터가 결정) */
  readonly label?: string;
}

/** 측정값이 한계기준 내에 있는지 검사 */
export function isWithin(limit: CriticalLimit, measurement: Measurement): boolean {
  switch (limit.type) {
    case "min": {
      if (typeof measurement.value !== "number" || typeof limit.value !== "number") {
        return false;
      }
      return measurement.value >= limit.value;
    }
    case "max": {
      if (typeof measurement.value !== "number" || typeof limit.value !== "number") {
        return false;
      }
      return measurement.value <= limit.value;
    }
    case "range": {
      if (
        typeof measurement.value !== "number" ||
        typeof limit.value !== "object" ||
        Array.isArray(limit.value) ||
        typeof (limit.value as { min: number; max: number }).min !== "number"
      ) {
        return false;
      }
      const range = limit.value as { min: number; max: number };
      return measurement.value >= range.min && measurement.value <= range.max;
    }
    case "boolean": {
      if (typeof measurement.value !== "boolean" || typeof limit.value !== "boolean") {
        return false;
      }
      return measurement.value === limit.value;
    }
    case "categorical": {
      if (typeof measurement.value !== "string" || !Array.isArray(limit.value)) {
        return false;
      }
      return (limit.value as readonly string[]).includes(measurement.value);
    }
  }
}

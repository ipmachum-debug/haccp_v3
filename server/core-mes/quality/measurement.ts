/**
 * Measurement — 측정값 추상
 *
 * ControlPoint 의 한계기준 평가 입력. 업종 무관.
 *
 * 트리거: PR #119 ControlPoint 추상화 설계
 */

/** 측정값 entity */
export interface Measurement {
  /**
   * 실제 측정 값. 한계 유형과 호환되는 타입이어야 함:
   *   - min/max/range: number
   *   - boolean: boolean
   *   - categorical: string
   */
  readonly value: number | boolean | string;

  /** 측정 시각 (KST 권장) */
  readonly measuredAt: Date;

  /** 측정자 (사용자 ID) */
  readonly measuredBy?: number;

  /** 측정 메타데이터 (자유 형식) — 어댑터가 활용 */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

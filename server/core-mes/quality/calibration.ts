/**
 * Calibration — 검교정/설비 자격 entity (Layer 2 core-mes / quality)
 *
 * Phase Y-4 — Cross-cutting 도메인.
 *
 * 적용 범위:
 *   - 식품 HACCP: 온도계 / pH meter / 금속검출기 정기 검교정
 *   - 화장품 GMP: KGMP §7 — 충진기 / 점도계 / 저울 등
 *   - 의약품 KGMP: KGMP §7 — IQ (Installation) / OQ (Operational) / PQ (Performance)
 *   - 의료기기: ISO 13485 §7.6 — 모니터링 측정 장비 검교정
 *
 * ADR-002 준수: "식품" / "화장품" / "HACCP" / "GMP" 식별자 0회 등장.
 */

/**
 * 검교정 유형.
 *   - iq: 설치 자격 (Installation Qualification) — 신규 설비 검증
 *   - oq: 운영 자격 (Operational Qualification) — 기능 검증
 *   - pq: 성능 자격 (Performance Qualification) — 실제 운영 검증
 *   - routine: 정기 검교정 (반복 주기)
 */
export type CalibrationType = "iq" | "oq" | "pq" | "routine";

/**
 * 합격 여부.
 *   pass: 모든 측정값 허용 범위 내
 *   conditional_pass: 일부 측정값 경계 — 운영 가능하나 모니터링 필요
 *   fail: 한도 초과 — 격리 / 수리 필요
 *   pending: 평가 미완료
 */
export type CalibrationOutcome = "pass" | "conditional_pass" | "fail" | "pending";

/**
 * Vendor 유형 (자체 검교정 vs 외부 의뢰).
 */
export type CalibrationVendorType = "internal" | "external";

/**
 * 진행 상태 — lifecycle.
 *
 * 전이:
 *   planned → scheduled → in_progress → completed → archived
 *                                                    ↑
 *                                            cancelled (어느 단계든)
 */
export type CalibrationStatus =
  | "planned"
  | "scheduled"
  | "in_progress"
  | "completed"
  | "archived"
  | "cancelled";

/**
 * Industry 컨텍스트.
 */
export type IndustryContext =
  | "food"
  | "cosmetic"
  | "pharmaceutical"
  | "health-functional"
  | "medical-device"
  | "general-manufacturing";

/**
 * 측정 결과 — JSON array element.
 *
 * 예: { name: "정확도 0.1%", expected: 100, measured: 99.85,
 *      tolerance: 0.5, unit: "g", passed: true }
 */
export interface CalibrationMeasurement {
  /** 측정 항목 이름 (예: "정확도", "선형성", "재현성") */
  readonly name: string;

  /** 기대값 / 표준값 */
  readonly expected: number;

  /** 실측값 */
  readonly measured: number;

  /** 허용 오차 (절대값 또는 %) */
  readonly tolerance: number;

  /** 단위 (예: "°C", "g", "%") */
  readonly unit: string;

  /** 합격 여부 (호출자 판정 — Math.abs(measured - expected) <= tolerance) */
  readonly passed: boolean;

  /** 비고 (선택) */
  readonly notes: string | null;
}

/**
 * Calibration entity — DB row.
 */
export interface Calibration {
  readonly id: number;
  readonly tenantId: number;
  readonly industry: IndustryContext;

  /** 코드 (CAL-YYYY-NNNN) */
  readonly code: string;

  readonly type: CalibrationType;

  /** 설비 이름 */
  readonly equipmentName: string;

  /** 설비 시리얼 / 관리번호 */
  readonly equipmentSerial: string;

  /** 검교정 기관 / 자체 부서 */
  readonly vendor: string;

  readonly vendorType: CalibrationVendorType;

  /** 예정일 */
  readonly scheduledDate: string;

  /** 실시일 */
  readonly actualDate: string | null;

  /** 검교정 주기 (개월) */
  readonly intervalMonths: number;

  /** 다음 검교정일 (actualDate + intervalMonths 자동 계산) */
  readonly nextDueDate: string | null;

  /** 측정 결과 (JSON array) */
  readonly measurements: readonly CalibrationMeasurement[];

  readonly outcome: CalibrationOutcome;

  /** 인증서 URL (R2 / 외부) */
  readonly certificateUrl: string | null;

  /** 결론 / 권고 */
  readonly conclusion: string | null;

  readonly approvedBy: number | null;
  readonly approvedAt: Date | null;
  readonly closedAt: Date | null;

  readonly status: CalibrationStatus;

  /**
   * Industry-specific 확장 (JSON).
   * 식품: { ccpId?: number; equipmentCategory?: "thermometer" | "ph_meter" | ... }
   * 화장품: { kgmpClause?: string; gmpClass?: string }
   * 의약품: { kgmpYearOfApproval?: number; criticality?: "critical" | "non-critical" }
   */
  readonly industryMetadata: Record<string, unknown> | null;

  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * 진행 상태 전이 가능 여부 검증.
 *
 * 허용:
 *   planned → scheduled | cancelled
 *   scheduled → in_progress | cancelled
 *   in_progress → completed | cancelled
 *   completed → archived
 *   archived / cancelled → terminal
 */
export function canTransition(
  from: CalibrationStatus,
  to: CalibrationStatus,
): boolean {
  const allowed: Record<CalibrationStatus, readonly CalibrationStatus[]> = {
    planned: ["scheduled", "cancelled"],
    scheduled: ["in_progress", "cancelled"],
    in_progress: ["completed", "cancelled"],
    completed: ["archived"],
    archived: [],
    cancelled: [],
  };
  return allowed[from].includes(to);
}

/**
 * 다음 검교정일 자동 계산.
 *
 * @param actualDate 실시일 (YYYY-MM-DD)
 * @param intervalMonths 주기 (개월, 1~120)
 * @returns 다음 검교정 마감일 (YYYY-MM-DD)
 */
export function calculateNextDueDate(
  actualDate: string,
  intervalMonths: number,
): string {
  const d = new Date(actualDate);
  d.setMonth(d.getMonth() + intervalMonths);
  return d.toISOString().slice(0, 10);
}

/**
 * 측정 결과로 outcome 자동 추론.
 *
 * 규칙:
 *   - 측정값 0개 → pending
 *   - 모두 passed=true → pass
 *   - 일부 fail (절반 이하) → conditional_pass
 *   - 절반 이상 fail → fail
 */
export function suggestOutcome(
  measurements: readonly CalibrationMeasurement[],
): CalibrationOutcome {
  if (measurements.length === 0) return "pending";
  const failed = measurements.filter((m) => !m.passed).length;
  if (failed === 0) return "pass";
  const failRate = failed / measurements.length;
  if (failRate <= 0.5) return "conditional_pass";
  return "fail";
}

/**
 * 측정값 자동 합격 판정 (호출자 보조).
 *
 * @param expected 기대값
 * @param measured 실측값
 * @param tolerance 허용 오차 (절대값)
 * @returns 합격 여부
 */
export function isMeasurementPassed(
  expected: number,
  measured: number,
  tolerance: number,
): boolean {
  return Math.abs(measured - expected) <= tolerance;
}

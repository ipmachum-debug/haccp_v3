/**
 * Training — 교육/훈련 entity (Layer 2 core-mes / quality)
 *
 * ============================================================================
 * Phase Y-3 — Cross-cutting 도메인.
 *
 * 적용 범위 (모든 industry):
 *   - 식품 HACCP: 위생 / CCP 모니터링 / 식품안전 정기 교육
 *   - 화장품 GMP: KGMP §6 — 위생 / 품질 / 작업 자격
 *   - 의약품 KGMP: KGMP §6 — GMP / SOP / 위생
 *   - 의료기기: ISO 13485 §6.2 — 자격 / 교육 / 인지
 *   - ISO 22716 §7 — 화장품 GMP 인적 자원
 *
 * 핵심 invariant (ADR-002 준수):
 *   "이 파일에는 '식품' / '화장품' / 'HACCP' / 'GMP' 라는 단어가
 *    코드 식별자에 0회 등장."
 *
 * Attendees 구조 (JSON array — 단순화):
 *   다대다 attendee 기록은 정규화 가능하나 단순화 채택. 향후 별도 테이블 추출 가능.
 * ============================================================================
 */

/**
 * 교육 유형.
 */
export type TrainingType =
  | "internal"     // 내부 교육 (자체 강의)
  | "external"     // 외부 위탁 (외부 기관 / 강사)
  | "on_the_job"   // OJT (현장 교육)
  | "regulatory";  // 법규 / 규제 강의 (KFDA / 식약처 등)

/**
 * 진행 상태 — lifecycle.
 *
 * 전이:
 *   planned → scheduled → in_progress → completed → archived
 *                                                    ↑
 *                                            cancelled (어느 단계든)
 */
export type TrainingStatus =
  | "planned"     // 계획 (강사 / 일정 미확정)
  | "scheduled"   // 일정 확정
  | "in_progress" // 진행 중
  | "completed"   // 종료 (교육 실시 완료)
  | "archived"    // 아카이브 (효과성 평가 종결)
  | "cancelled";

/**
 * 이수자 출석 / 평가 상태.
 */
export type AttendanceStatus =
  | "registered" // 등록 (실시 전)
  | "attended"   // 출석
  | "passed"     // 합격 (시험 / 평가 통과)
  | "failed"     // 불합격
  | "absent";    // 결석

/**
 * Industry 컨텍스트 — view filter 키.
 */
export type IndustryContext =
  | "food"
  | "cosmetic"
  | "pharmaceutical"
  | "health-functional"
  | "medical-device"
  | "general-manufacturing";

/**
 * 이수자 — JSON array element.
 *
 * 향후 정규화 테이블 추출 시 이 인터페이스 그대로 row 매핑 가능.
 */
export interface TrainingAttendee {
  /** 이수자 user_id */
  readonly userId: number;

  /** 이수자 이름 (캐시 — user.name 변경 시점 보존) */
  readonly name: string;

  /** 출석 / 평가 상태 */
  readonly status: AttendanceStatus;

  /** 점수 (0~100, 선택) */
  readonly score: number | null;

  /** 자격증 / 수료증 URL (선택) */
  readonly certificateUrl: string | null;
}

/**
 * 교재 / 자료 — JSON array element.
 */
export interface TrainingMaterial {
  /** 자료 제목 */
  readonly title: string;

  /** 자료 URL (R2 / 외부) */
  readonly url: string;
}

/**
 * Training entity — DB row 표현.
 */
export interface Training {
  readonly id: number;
  readonly tenantId: number;
  readonly industry: IndustryContext;

  /** 코드 (TR-YYYY-NNNN 자동채번) */
  readonly code: string;

  readonly type: TrainingType;

  /** 제목 */
  readonly title: string;

  /** 교육 주제 / 영역 (예: "위생", "CCP 모니터링", "GMP §6") */
  readonly subject: string;

  /** 상세 설명 */
  readonly description: string;

  /** 강사 이름 (internal 시 user.name, external 시 외부 강사 이름) */
  readonly trainerName: string;

  /** 강사 유형 (internal: 사내 / external: 외부) */
  readonly trainerType: "internal" | "external";

  /** 강사 user_id (internal 시 — 선택) */
  readonly trainerUserId: number | null;

  /** 예정일 */
  readonly scheduledDate: string;

  /** 실시일 (in_progress 진입 시 입력) */
  readonly actualDate: string | null;

  /** 진행 시간 (분 단위) */
  readonly durationMinutes: number;

  /** 이수자 (JSON array) */
  readonly attendees: readonly TrainingAttendee[];

  /** 교재 / 자료 (JSON array) */
  readonly materials: readonly TrainingMaterial[];

  /** 효과성 평가 결과 (archived 직전 입력) */
  readonly effectivenessAssessment: string | null;

  /** 승인자 (completed 시) */
  readonly approvedBy: number | null;
  readonly approvedAt: Date | null;

  /** 아카이브 일 (archived 시) */
  readonly closedAt: Date | null;

  readonly status: TrainingStatus;

  /**
   * Industry-specific 확장 (JSON).
   * 식품: { kfdaRequiredHours?: number }
   * 화장품: { kgmpClause?: string }
   * 의약품: { kgmpYearOfApproval?: number; ctdSection?: string }
   */
  readonly industryMetadata: Record<string, unknown> | null;

  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * 진행 상태 전이 가능 여부 검증.
 *
 * 허용 전이:
 *   planned → scheduled | cancelled
 *   scheduled → in_progress | cancelled
 *   in_progress → completed | cancelled
 *   completed → archived
 *   archived → (terminal)
 *   cancelled → (terminal)
 */
export function canTransition(
  from: TrainingStatus,
  to: TrainingStatus,
): boolean {
  const allowed: Record<TrainingStatus, readonly TrainingStatus[]> = {
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
 * Attendees 통계 — 이수율 계산 (대시보드용).
 *
 * @returns { total, attended, passed, failed, absent, passRate (0~100) }
 */
export function summarizeAttendees(
  attendees: readonly TrainingAttendee[],
): {
  total: number;
  attended: number;
  passed: number;
  failed: number;
  absent: number;
  /** 합격률 (출석자 중 합격자 비율, 0~100). 출석자 0 시 0. */
  passRate: number;
} {
  let attended = 0;
  let passed = 0;
  let failed = 0;
  let absent = 0;
  for (const a of attendees) {
    if (a.status === "absent") absent += 1;
    else attended += 1;
    if (a.status === "passed") passed += 1;
    else if (a.status === "failed") failed += 1;
  }
  const total = attendees.length;
  const passRate = attended > 0 ? Math.round((passed / attended) * 100) : 0;
  return { total, attended, passed, failed, absent, passRate };
}

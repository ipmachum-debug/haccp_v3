/**
 * Audit — 감사 entity (Layer 2 core-mes / quality)
 *
 * ============================================================================
 * Phase Y-2-3 — Cross-cutting 도메인.
 *
 * Audit 종류:
 *   - internal: 내부 감사 (자체 조직)
 *   - supplier: 공급업체 감사 (원료/포장재 공급자)
 *   - external: 외부 감사 (KFDA / 인증기관 / 고객)
 *
 * 적용 범위 (모든 industry):
 *   - 식품 HACCP: 자체 검증 / 위해분석 재검토 / 공급업체 평가
 *   - 화장품 GMP: KGMP / ISO 22716 자체 감사 + 공급자 감사
 *   - 의약품 KGMP: KGMP / PIC/S 자체 감사 + GMP 실사
 *   - 의료기기: ISO 13485 / ISO 19011 / 공인 인증기관 감사
 *
 * 핵심 invariant (ADR-002 준수):
 *   "이 파일에는 '식품' / '화장품' / 'HACCP' / 'GMP' 라는 단어가
 *    코드 식별자에 0회 등장."
 *
 * Findings 구조 (JSON array — 단순화):
 *   각 finding 은 severity (critical/major/minor/observation) + correctiveActionId 선택.
 *   필요 시 별도 테이블로 정규화 (Y-2-3-d 후속 PR).
 * ============================================================================
 */

/**
 * 감사 유형.
 */
export type AuditType = "internal" | "supplier" | "external";

/**
 * 감사 진행 상태 — lifecycle.
 *
 * 전이:
 *   planned → scheduled → in_progress → reporting → closed
 *                                                   ↑
 *                                            (어느 단계든 cancelled)
 */
export type AuditStatus =
  | "planned"     // 계획 (감사 대상 / 일정 미확정)
  | "scheduled"   // 일정 확정
  | "in_progress" // 실시 중
  | "reporting"   // 보고서 작성 중
  | "closed"      // 종결 (보고서 승인 완료)
  | "cancelled";

/**
 * 감사 결과 종합 평가.
 */
export type AuditOutcome = "pass" | "conditional_pass" | "fail" | "pending";

/**
 * Industry 컨텍스트 — view filter 키 (ADR-003 IndustryKey 와 동기).
 */
export type IndustryContext =
  | "food"
  | "cosmetic"
  | "pharmaceutical"
  | "health-functional"
  | "medical-device"
  | "general-manufacturing";

/**
 * Finding 심각도.
 *   critical:    안전 / 효능 / 규제 위반 — 즉시 시정 필수
 *   major:       품질 / 시스템 결함 — 정기 시정
 *   minor:       경미한 이탈 — 관리 강화
 *   observation: 권고 / 개선 기회 — 의무 아님
 */
export type FindingSeverity = "critical" | "major" | "minor" | "observation";

/**
 * Finding (감사 발견사항) — JSON array element.
 *
 * 향후 정규화 테이블 추출 시 이 인터페이스 그대로 row 매핑 가능.
 */
export interface AuditFinding {
  /** 감사 내 일련번호 (1-based) */
  readonly seq: number;

  /** 발견사항 제목 */
  readonly title: string;

  /** 심각도 */
  readonly severity: FindingSeverity;

  /** 상세 설명 */
  readonly description: string;

  /** 위반 기준 / 절차 (예: "ISO 13485 §7.3.7", "KGMP §15") */
  readonly violatedClause: string | null;

  /** 시정조치 ID (h_corrective_actions.id) — Y-2-2 와 연계, 선택 */
  readonly correctiveActionId: number | null;
}

/**
 * Audit entity — DB row 표현.
 */
export interface Audit {
  /** 도메인 식별자 */
  readonly id: number;

  /** tenant 격리 */
  readonly tenantId: number;

  /** Industry 컨텍스트 */
  readonly industry: IndustryContext;

  /** 코드 (AUD-YYYY-NNNN 자동채번) */
  readonly code: string;

  /** 감사 유형 */
  readonly type: AuditType;

  /** 제목 (1줄 요약) */
  readonly title: string;

  /** 감사 범위 / 목적 */
  readonly scope: string;

  /** 감사 기준 (예: "ISO 13485:2016", "KGMP 2025-XX") */
  readonly criteria: string;

  /** 피감사 대상 — internal: 부서명 / supplier: 거래처명 / external: 인증기관 */
  readonly auditee: string;

  /** 감사 일정 (계획) */
  readonly plannedDate: string;

  /** 감사 실시일 (in_progress 진입 시 입력) */
  readonly actualDate: string | null;

  /** 주관 감사원 user_id */
  readonly leadAuditor: number;

  /** 보조 감사원 user_id 목록 (JSON) */
  readonly auditors: readonly number[];

  /** 발견사항 (JSON array) */
  readonly findings: readonly AuditFinding[];

  /** 종합 평가 */
  readonly outcome: AuditOutcome;

  /** 결론 / 권고사항 (보고서 본문) */
  readonly conclusion: string | null;

  /** 보고서 승인자 user_id */
  readonly approvedBy: number | null;
  readonly approvedAt: Date | null;

  /** 종결일 */
  readonly closedAt: Date | null;

  /** 진행 상태 */
  readonly status: AuditStatus;

  /**
   * Industry-specific 확장 (JSON).
   *
   * 식품: { hazardCategoriesCovered?: string[] }
   * 화장품: { kfdaInspectionType?: string }
   * 의약품: { picsClass?: string; kgmpYearOfApproval?: number }
   *
   * core-mes 자체는 해석 X.
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
 *   in_progress → reporting | cancelled
 *   reporting → closed | cancelled
 *   closed → (terminal)
 *   cancelled → (terminal)
 */
export function canTransition(from: AuditStatus, to: AuditStatus): boolean {
  const allowed: Record<AuditStatus, readonly AuditStatus[]> = {
    planned: ["scheduled", "cancelled"],
    scheduled: ["in_progress", "cancelled"],
    in_progress: ["reporting", "cancelled"],
    reporting: ["closed", "cancelled"],
    closed: [],
    cancelled: [],
  };
  return allowed[from].includes(to);
}

/**
 * Findings 종합 평가 자동 계산 (조언용 — outcome 자동 추천).
 *
 * 규칙:
 *   - critical 1건 이상 → fail
 *   - major 3건 이상 → fail
 *   - major 1~2건 → conditional_pass
 *   - 나머지 (minor / observation 만) → pass
 *   - findings 비었음 → pending (감사 미완료)
 */
export function suggestOutcome(findings: readonly AuditFinding[]): AuditOutcome {
  if (findings.length === 0) return "pending";
  let critical = 0;
  let major = 0;
  for (const f of findings) {
    if (f.severity === "critical") critical += 1;
    else if (f.severity === "major") major += 1;
  }
  if (critical >= 1) return "fail";
  if (major >= 3) return "fail";
  if (major >= 1) return "conditional_pass";
  return "pass";
}

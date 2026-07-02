/**
 * Environmental Monitoring Program (환경 모니터링, EMP) — entity (Layer 2 core-mes / quality)
 *
 * Phase Y-12 — 제조환경 병원균/지표균 모니터링 (FSSC 22000 / Codex).
 *
 * 적용 표준:
 *   - FSSC 22000 v6 (Environmental Monitoring, 적용 대상 시)
 *   - Codex CXC 1-1969 위생 일반원칙
 *   - Zone 기반 채취(Zone 1~4) + 병원균(Listeria/Salmonella)/지표균/ATP
 *
 * 핵심 모델 (기록 로그형):
 *   채취 지점(zone + location)별 검사 결과(pass/fail) 기록 + 부적합 시 시정조치.
 *   Zone 1(식품접촉면) ~ Zone 4(처리구역 외부).
 *
 * ADR-002 준수.
 */

/**
 * 위생 구역 (Zone) — 식품접촉면에서의 거리.
 */
export type MonitoringZone =
  | "zone1"  // 식품 접촉면 (설비 표면, 컨베이어 등)
  | "zone2"  // 비접촉 인접면 (설비 프레임, 조작 패널 등)
  | "zone3"  // 비접촉 처리구역 (바닥, 배수구, 벽 등)
  | "zone4"; // 처리구역 외부 (복도, 창고, 탈의실 등)

/**
 * 검사 대상.
 */
export type MonitoringTarget =
  | "listeria"     // 리스테리아 (병원균)
  | "salmonella"   // 살모넬라 (병원균)
  | "e_coli"       // 대장균
  | "coliform"     // 대장균군 (지표균)
  | "apc"          // 일반세균 (총균수)
  | "yeast_mold"   // 효모·곰팡이
  | "atp"          // ATP (신속 위생)
  | "other";

/**
 * 채취/측정 방법.
 */
export type MonitoringMethod =
  | "swab"          // 면봉 도말
  | "contact_plate" // 접촉 배지 (RODAC)
  | "air_settle"    // 낙하균 (공중)
  | "water"         // 용수
  | "atp";          // ATP 측정기

/**
 * 판정.
 *   - pass: 적합 (병원균 불검출 / 지표균·ATP 기준 이내)
 *   - fail: 부적합 (병원균 검출 / 기준 초과)
 *   - pending: 결과 대기 (배양 중)
 */
export type MonitoringResult = "pass" | "fail" | "pending";

/**
 * 진행 상태 — lifecycle (기록 → 검토 → 승인 → 종결).
 */
export type EmStatus = "draft" | "under_review" | "approved" | "archived";

export type IndustryContext =
  | "food"
  | "cosmetic"
  | "pharmaceutical"
  | "health-functional"
  | "medical-device"
  | "general-manufacturing";

/**
 * Environmental Monitoring 기록 entity — DB row.
 */
export interface EnvironmentalMonitoring {
  readonly id: number;
  readonly tenantId: number;
  readonly industry: IndustryContext;

  /** 코드 (EM-YYYY-NNNN) */
  readonly code: string;

  /** 채취일 (YYYY-MM-DD) */
  readonly samplingDate: string;

  /** 위생 구역 */
  readonly zone: MonitoringZone;

  /** 채취 지점명 (예: 충진기 노즐 / 바닥 배수구) */
  readonly location: string;

  /** 검사 대상 */
  readonly target: MonitoringTarget;

  /** 채취/측정 방법 */
  readonly method: MonitoringMethod;

  /** 판정 */
  readonly result: MonitoringResult;

  /** 측정값/판정 상세 (예: "불검출" / "120 CFU" / "250 RLU") */
  readonly resultValue: string | null;

  /** 기준 (예: "불검출" / "< 100 CFU" / "< 200 RLU") */
  readonly limitCriteria: string | null;

  /** 부적합 시 시정조치 */
  readonly correctiveAction: string | null;

  /** 연계 CAPA id (있으면) */
  readonly correctiveActionId: number | null;

  readonly notes: string | null;

  readonly assessedBy: number | null;
  readonly approvedBy: number | null;
  readonly approvedAt: Date | null;

  readonly closedAt: Date | null;
  readonly status: EmStatus;

  readonly industryMetadata: Record<string, unknown> | null;

  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export function canTransition(from: EmStatus, to: EmStatus): boolean {
  const allowed: Record<EmStatus, readonly EmStatus[]> = {
    draft: ["under_review"],
    under_review: ["approved", "draft"],
    approved: ["under_review", "archived"],
    archived: [],
  };
  return allowed[from].includes(to);
}

/** 병원균 대상 여부 (검출 = 부적합, 즉시 조치 대상). */
export function isPathogenTarget(target: MonitoringTarget): boolean {
  return target === "listeria" || target === "salmonella";
}

/** 시정조치 필요 여부 (부적합 판정). */
export function isActionRequired(result: MonitoringResult): boolean {
  return result === "fail";
}

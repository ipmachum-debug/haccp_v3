/**
 * 정합성 검증 공통 타입
 * ═══════════════════════════════════════════════════════════════
 * Module 0 — 재고/회계 전수 정합성 검증 도구 (READ-ONLY)
 *
 * 철학:
 *   - 이 모듈은 절대 DB 에 쓰지 않음 (SELECT 전용)
 *   - 수정 전/후 비교에 사용하는 baseline 도구
 *   - 발견 사항을 severity 별로 분류하여 리포트
 * ═══════════════════════════════════════════════════════════════
 */

export type Severity = "critical" | "high" | "medium" | "info";

export interface Finding {
  /** 규칙 식별자 (예: INV_NEG_STOCK) */
  code: string;
  /** 한국어 제목 */
  title: string;
  /** 심각도 */
  severity: Severity;
  /** 발견된 건수 */
  count: number;
  /** 관련 엔티티 (ID 리스트, 최대 20건 샘플) */
  samples: Array<Record<string, any>>;
  /** 전체 합계 금액/수량 차이 (해당되는 경우) */
  totalDelta?: number;
  /** 추가 설명 */
  message?: string;
}

export interface ConsistencyReport {
  tenantId: number | null;
  generatedAt: string;
  duration_ms: number;
  findings: Finding[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    info: number;
    totalFindings: number;
  };
}

export const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  info: 3,
};

export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const s = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (s !== 0) return s;
    return b.count - a.count;
  });
}

export function summarize(findings: Finding[]) {
  // count > 0 인 실제 이슈만 severity 별 집계 (count=0 은 통과한 규칙이므로 제외)
  const withIssues = findings.filter((f) => f.count > 0);
  return {
    critical: withIssues.filter((f) => f.severity === "critical").length,
    high: withIssues.filter((f) => f.severity === "high").length,
    medium: withIssues.filter((f) => f.severity === "medium").length,
    info: withIssues.filter((f) => f.severity === "info").length,
    totalFindings: findings.length,
  };
}

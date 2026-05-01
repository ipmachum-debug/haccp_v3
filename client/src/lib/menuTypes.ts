/**
 * Menu / Industry 공통 타입 — 클라이언트 (Layer 4)
 *
 * 작성: 2026-04-30 — Phase Y-2-0-c hotfix (PR #191 누락 파일).
 *
 * 정책 (ADR-003 Industry-First Menu):
 *   - IndustryKey 는 서버 IndustryContext 와 1:1 동기화.
 *   - 신규 industry 진입 시 본 파일 + 서버 ENUM 양쪽 ALTER 필요.
 *
 * 서버 정의 (참고):
 *   - server/core-mes/quality/changeControl.ts (IndustryContext)
 *   - server/core-mes/quality/nonconforming.ts (IndustryContext)
 *   - drizzle/schema/coreMes/quality/*.ts (industry ENUM 컬럼)
 */

/** 산업 키 — 서버 IndustryContext 와 동일 union 유지 */
export type IndustryKey =
  | "food"
  | "cosmetic"
  | "pharmaceutical"
  | "health-functional"
  | "medical-device"
  | "general-manufacturing";

/** 산업별 한글 라벨 — UI 표시 전용 */
export const INDUSTRY_LABELS: Record<IndustryKey, string> = {
  food: "식품 HACCP",
  cosmetic: "화장품 GMP",
  pharmaceutical: "의약품 KGMP",
  "health-functional": "건강기능식품",
  "medical-device": "의료기기",
  "general-manufacturing": "일반 제조",
};

/** 산업 키 목록 (반복 처리용) */
export const INDUSTRY_KEYS: readonly IndustryKey[] = [
  "food",
  "cosmetic",
  "pharmaceutical",
  "health-functional",
  "medical-device",
  "general-manufacturing",
] as const;

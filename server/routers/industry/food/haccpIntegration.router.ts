/**
 * 식품 HACCP-회계 통합 라우터 — Layer 4 industry/food (CP-4 6단계)
 *
 * 점진 이주 (Strangler Fig) — re-export 만.
 *   기존 위치: server/routers/haccp/haccpIntegration.router.ts
 *   신규 노출: industry.food.haccpIntegration
 *
 * 회계 의존성 메모:
 *   원본 라우터는 db/haccp/haccpIntegration 를 동적 import (런타임 lazy).
 *   re-export 자체는 정적 의존 추가 0 — ADR-002 (no-core-to-industry) 위반 없음.
 *   향후 실제 코드 이전 시 (해당 PR 에서) 회계 모듈 의존을 hooks/event 패턴으로 분리.
 */

export { haccpIntegrationRouter as foodHaccpIntegrationRouter } from "../../haccp/haccpIntegration.router";

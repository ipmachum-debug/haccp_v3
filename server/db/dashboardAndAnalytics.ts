/**
 * dashboardAndAnalytics.ts - 배럴 모듈 (하위 호환용 re-export)
 *
 * 실제 구현은 아래 파일에 분할:
 *   - dashboardStats.ts: 대시보드 통계, 재고 경고, CCP 검사 이력
 *   - costAnalysis.ts: 원가 분석, 수익성, 재고 회전율, 가격 이력
 *   - productionAnalytics.ts: 생산 최적화, 예측, 발주 제안
 */
export * from "./dashboardStats";
export * from "./costAnalysis";
export * from "./productionAnalytics";

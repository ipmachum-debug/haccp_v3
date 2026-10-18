/**
 * 금속검출(CCP-4P) 기록 정본 — h_ccp_form_rows (2026-10-18, PR-A2)
 *
 * 두 저장소가 있었다:
 *   - h_ccp_form_rows (감도행·통과행) — 화면 입력·제출·승인·인쇄가 모두 이것을 쓴다. 실제 기록의 유일한 위치.
 *   - h_ccp_batch_process_runs / h_ccp_metal_sku_slots / h_ccp_metal_sensitivity_checks — 계획만 쓰고 확인은 한 번도 안 됨
 *     (백업 v0.8.453: checks 8,681 전부 PENDING · slots 5,593 전부 PLANNED, 클라이언트 호출 0건). 두 저장소는 서로 동기화되지 않았고,
 *     행 동기화가 runs 만 지우고 하위 행을 남겨 고아·중복(같은 날 run 2개)이 생겼다.
 * 결정: 정본은 form rows. 계획 전용 표에는 새로 쓰지 않는다 (기존 행·표·조회 API 는 그대로 — 삭제는 별도 결정).
 */
export const WRITE_METAL_PLAN_TABLES = false;

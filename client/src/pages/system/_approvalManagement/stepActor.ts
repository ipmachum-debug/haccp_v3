/**
 * 결재 단계 옆 이름 (2026-10-15, Codex #522 시험 승인 검증)
 *  - 끝난 단계: 실제 처리자(요청에 저장된 reviewed_by / approved_by 사용자). 기록이 없으면 이름을 붙이지 않는다 —
 *    현재 지정자를 대신 보여 주면 처리하지 않은 사람이 처리한 것처럼 보인다 (요청 3613: 처리 한상갑, 표시 이정언).
 *  - 남은 단계: 현재 문서결재설정의 지정자를 "(지정)" 으로 구분해 보여 준다.
 */
export function stepActorLabel(done: boolean, actualName: string | null | undefined, designatedName: string | null | undefined): string | null {
  if (done) return actualName || null;
  return designatedName ? `${designatedName}(지정)` : null;
}

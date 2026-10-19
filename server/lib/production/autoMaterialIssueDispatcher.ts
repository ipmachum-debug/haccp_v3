/**
 * 배치 자동출고 — 공통 진입점 (2026-10-17, 재고 쓰기 경로 PR-5·6)
 *
 * 모든 원료 자동출고는 이 함수로 들어온다:
 *   생산 시작(todayProduction.start / retryIssue), 배치 상태 변경(batch.updateStatus → in_progress),
 *   일괄 배치 생성(batchOrchestrator), 생산완료의 미출고 줄(completeBatch), 소급 차감(retroactiveDeduction).
 *
 * 보장:
 *   - 배치 잠금(withBatchIssueLock) — 같은 배치에 두 실행이 겹치지 않는다 (이전: todayProduction 경로에만 있어
 *     batch.updateStatus 와 동시에 들어오면 같은 줄을 두 번 출고할 수 있었다). 잠금을 못 잡으면 busy 로 돌려준다.
 *   - 회사 확인 — tenantId 필수, 배치는 그 회사의 것만.
 *   - 엔진 하나 — autoIssueMaterialsForBatch (줄 단위 트랜잭션 + 재고 관문). 예전 v2 플래그
 *     (USE_AUTO_ISSUE_V2[_TENANTS]) 는 더 이상 분기하지 않는다 — v2 는 tenant 조건 누락·canonical id 미변환이 있었고
 *     v1 이 같은 단일 트랜잭션 계약을 갖게 됐다. 플래그가 남아 있으면 경고만 남긴다.
 */

import { autoIssueMaterialsForBatch } from "./autoMaterialIssue";
import { withBatchIssueLock } from "./batchIssueLock";

export type AutoIssueResult = Awaited<ReturnType<typeof autoIssueMaterialsForBatch>> & { busy?: boolean };

export async function autoIssueMaterialsDispatch(
  batchId: number,
  userId: number,
  tenantId: number,
  opts?: { onlyLineIds?: number[]; txConn?: any },
): Promise<AutoIssueResult> {
  const t = Number(tenantId);
  if (!Number.isFinite(t) || t <= 0) throw new Error("테넌트 정보가 필요합니다 (자동출고).");
  if (process.env.USE_AUTO_ISSUE_V2 || process.env.USE_AUTO_ISSUE_V2_TENANTS) {
    console.warn("[autoIssueDispatcher] USE_AUTO_ISSUE_V2* 설정은 더 이상 쓰지 않습니다 — 단일 엔진으로 출고합니다.");
  }
  const locked = await withBatchIssueLock(t, batchId, () => autoIssueMaterialsForBatch(batchId, userId, t, opts));
  if (!locked.locked) {
    return {
      success: false,
      busy: true,
      issuedMaterials: [],
      totalCost: 0,
      warnings: [],
      errors: ["같은 배치의 원료 출고가 진행 중입니다. 잠시 후 다시 시도하세요."],
    };
  }
  return locked.value;
}

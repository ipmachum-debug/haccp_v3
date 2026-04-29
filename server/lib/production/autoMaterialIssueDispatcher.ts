/**
 * 배치 자동출고 dispatcher — feature flag 기반 v1 / v2 분기 (F2-2-d)
 *
 * ============================================================================
 * 진입점: 운영 코드 (batchOrchestrator, batch.crud.router) 가 호출.
 * 책임: 환경변수 / tenant 매칭 보고 v1 (legacy) 또는 v2 (단일 트랜잭션) 분기.
 *
 * 환경변수 (운영 .env):
 *   USE_AUTO_ISSUE_V2=false (기본)            — 모든 호출 v1 (운영 안전 기본값)
 *   USE_AUTO_ISSUE_V2=true                    — 모든 호출 v2 (전체 전환)
 *   USE_AUTO_ISSUE_V2_TENANTS="2,5,7"         — 명시 tenant 만 v2 (점진 전환)
 *                                                (USE_AUTO_ISSUE_V2 보다 우선)
 *
 * 점진 전환 (권장):
 *   1. 머지 직후: 모든 환경변수 미설정 → 운영 v1 그대로 (영향 0)
 *   2. dev/staging 에서 USE_AUTO_ISSUE_V2=true 로 dual-run 검증
 *   3. 운영 단일 tenant (예: tenant_id=2) 에서 USE_AUTO_ISSUE_V2_TENANTS="2"
 *   4. 1주 검증 후 전체 전환 (USE_AUTO_ISSUE_V2=true)
 *   5. 1달 검증 후 v1 코드 제거 (F2-2-e)
 *
 * 트리거: PR #117 F-2 단일 트랜잭션 엔진 / PR #125 v2 외각 / PR #127 정식 통합
 * ============================================================================
 */

import { autoIssueMaterialsForBatch as runV1 } from "./autoMaterialIssue";
import { autoIssueMaterialsForBatchV2 as runV2 } from "./autoMaterialIssueV2";

/** v1 / v2 동일한 result 타입 (호환) */
export type AutoIssueResult = Awaited<ReturnType<typeof runV1>>;

/**
 * tenant 가 v2 활성화 대상인지 판정.
 *
 * 우선순위:
 *   1. USE_AUTO_ISSUE_V2_TENANTS — 명시 tenant 목록 우선
 *   2. USE_AUTO_ISSUE_V2 — 전체 전환 플래그
 *
 * @param tenantId 평가할 tenant (생략 시 USE_AUTO_ISSUE_V2 만 봄)
 */
export function shouldUseV2(tenantId?: number): boolean {
  const tenantsRaw = process.env.USE_AUTO_ISSUE_V2_TENANTS?.trim();
  if (tenantsRaw && tenantId !== undefined) {
    const enabledTenants = tenantsRaw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n));

    if (enabledTenants.length > 0) {
      return enabledTenants.includes(Number(tenantId));
    }
  }

  const flag = process.env.USE_AUTO_ISSUE_V2?.toLowerCase().trim();
  return flag === "true" || flag === "1" || flag === "yes";
}

/**
 * 배치 자동출고 — dispatcher.
 *
 * @param batchId  배치 ID
 * @param userId   작업자 ID
 * @param tenantId (선택) tenant ID — 점진 전환 매칭용. 미제공 시 전역 플래그만 봄.
 * @returns AutoIssueResult (v1/v2 동일 형태)
 */
export async function autoIssueMaterialsDispatch(
  batchId: number,
  userId: number,
  tenantId?: number,
): Promise<AutoIssueResult> {
  const useV2 = shouldUseV2(tenantId);

  if (useV2) {
    console.log(
      `[autoIssueDispatcher] v2 사용 batch=${batchId} tenant=${tenantId ?? "n/a"}`,
    );
    // v2 결과 타입은 v1 과 동일 형태 — 호출자 호환
    return (await runV2(batchId, userId)) as AutoIssueResult;
  }

  // 기본값 (운영 안전): v1
  return await runV1(batchId, userId);
}

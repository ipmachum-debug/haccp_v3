/**
 * 생산 완료 POST dispatcher — feature flag 기반 v1 / v2 분기 (F2-3-b)
 *
 * F2-2-d (autoMaterialIssueDispatcher) 와 동일 패턴.
 *
 * 환경변수 (운영 .env):
 *   USE_PRODUCTION_COMPLETE_V2=false (기본)         — 모든 호출 v1 (안전)
 *   USE_PRODUCTION_COMPLETE_V2=true                 — 전체 v2
 *   USE_PRODUCTION_COMPLETE_V2_TENANTS="2,5,7"      — 명시 tenant 만 v2
 *
 * 점진 전환 권장 (PR #128 패턴 동일):
 *   1. 머지 직후: env 미설정 → 100% v1
 *   2. dev/staging USE_PRODUCTION_COMPLETE_V2=true → 검증
 *   3. 운영 단일 tenant: USE_PRODUCTION_COMPLETE_V2_TENANTS="2"
 *   4. 1주 검증 후 전체 (USE_PRODUCTION_COMPLETE_V2=true)
 *   5. 1달 검증 후 v1 제거
 *
 * 트리거: PR #129 (F2-3-a v2) / PR #128 (autoMaterialIssue dispatcher 패턴)
 */

import { postProductionComplete as runV1 } from "./productionCompletePost";
import { postProductionCompleteV2 as runV2 } from "./productionCompletePostV2";
import type { ProductionCompleteResult } from "./productionCompletePostV2";

export type { ProductionCompleteResult };

/**
 * tenant 가 v2 활성화 대상인지 판정.
 *
 * 우선순위:
 *   1. USE_PRODUCTION_COMPLETE_V2_TENANTS — 명시 tenant 목록 우선
 *   2. USE_PRODUCTION_COMPLETE_V2 — 전체 전환 플래그
 */
export function shouldUseProductionCompleteV2(tenantId?: number): boolean {
  const tenantsRaw = process.env.USE_PRODUCTION_COMPLETE_V2_TENANTS?.trim();
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

  const flag = process.env.USE_PRODUCTION_COMPLETE_V2?.toLowerCase().trim();
  return flag === "true" || flag === "1" || flag === "yes";
}

/**
 * 생산 완료 POST — dispatcher.
 *
 * @param batchId        배치 ID
 * @param actualQuantity 실제 생산량
 * @param userId         작업자 ID
 * @param tenantId       tenant ID (점진 전환 매칭)
 */
export async function productionCompleteDispatch(
  batchId: number,
  actualQuantity: number,
  userId: number,
  tenantId: number,
): Promise<ProductionCompleteResult> {
  const useV2 = shouldUseProductionCompleteV2(tenantId);

  if (useV2) {
    console.log(
      `[productionCompleteDispatcher] v2 사용 batch=${batchId} tenant=${tenantId}`,
    );
    return await runV2(batchId, actualQuantity, userId, tenantId);
  }

  // 기본값 (운영 안전): v1
  return await runV1(batchId, actualQuantity, userId, tenantId);
}

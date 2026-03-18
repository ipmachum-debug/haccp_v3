/**
 * batch.helpers.ts - 배치 라우터 공통 헬퍼
 * 
 * ✅ P2 리팩토링: 모든 배치 서브 라우터에서 공통으로 사용하는 헬퍼
 * - requireBatchTenantId: ctx에서 tenantId를 안전하게 추출
 * - requireBatchSiteId: ctx에서 siteId를 안전하게 추출
 * - getBatchWithOwnership: 배치 조회 + 테넌트 소유권 검증
 */

import { TRPCError } from "@trpc/server";

/**
 * ctx에서 tenantId를 안전하게 추출
 * @throws FORBIDDEN if tenantId is missing
 */
export function requireBatchTenantId(ctx: any): number {
  const tenantId = ctx.tenantId ?? ctx.user?.tenantId;
  if (!tenantId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: ctx.user?.role === "super_admin"
        ? "테넌트를 먼저 선택해주세요."
        : "테넌트 정보가 필요합니다.",
    });
  }
  return tenantId;
}

/**
 * ctx에서 siteId를 안전하게 추출 (input.siteId > ctx.user.siteId > ctx.tenantId)
 */
export function resolveSiteId(input: { siteId?: number }, ctx: any): number {
  const siteId = input.siteId || ctx.user?.siteId || ctx.tenantId;
  if (!siteId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "사이트 정보가 필요합니다. (siteId)",
    });
  }
  return siteId;
}

/**
 * 배치 조회 + 테넌트 소유권 검증
 * @throws NOT_FOUND if batch doesn't exist or doesn't belong to tenant
 */
export async function getBatchWithOwnership(batchId: number, tenantId: number) {
  const { getBatchById } = await import("../../db");
  const batch = await getBatchById(batchId, tenantId);
  if (!batch) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "배치를 찾을 수 없습니다.",
    });
  }
  return batch;
}

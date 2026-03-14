import { TRPCError } from "@trpc/server";

// ✅ P0 FIX: 테넌트 격리 헬퍼 (fallback 제거 - ctx.tenantId만 인정)
export function getEffectiveTenantId(ctx: any): number {
  const tenantId = ctx.tenantId;
  if (!tenantId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "테넌트 정보가 필요합니다. (actingTenantId 누락)" });
  }
  return tenantId;
}

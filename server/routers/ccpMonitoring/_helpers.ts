import { TRPCError } from "@trpc/server";

// P0 FIX: tenant isolation helper (no fallback - only ctx.tenantId accepted)
export function getEffectiveTenantId(ctx: any): number {
  const tenantId = ctx.tenantId;
  if (!tenantId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "테넌트 정보가 필요합니다. (actingTenantId 누락)" });
  }
  return tenantId;
}

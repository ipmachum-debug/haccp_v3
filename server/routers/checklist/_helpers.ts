/**
 * Shared helper functions for HACCP checklist routers
 * Extracted from checklists.ts for reuse across individual router files
 */

import { TRPCError } from "@trpc/server";
import { eq, and } from "drizzle-orm";

// ✅ P0 FIX: 테넌트/사이트 격리 헬퍼
export function getEffectiveSiteId(input: { siteId?: number }, ctx: any): number {
  const siteId = input.siteId ?? ctx.user?.siteId;
  if (!siteId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "사이트 정보가 필요합니다. (siteId)" });
  }
  return siteId;
}

export function getEffectiveTenantId(ctx: any): number {
  // ✅ P0 FIX: fallback 제거 - ctx.tenantId는 trpc.ts 미들웨어에서 이미 결정됨
  // super_admin의 경우 actingTenantId가 없으면 tenantId = null → 명시적 403
  const tenantId = ctx.tenantId;
  if (!tenantId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: ctx.user?.role === "super_admin"
        ? "테넌트를 먼저 선택해주세요. (actingTenantId 필요)"
        : "테넌트 정보가 필요합니다. 관리자에게 문의하세요.",
    });
  }
  return tenantId;
}

/**
 * ✅ P0 FIX: verifySiteOwnership - siteId + tenantId 이중 교차 검증
 * siteId 단독으로는 테넌트 경계를 보장하지 못하므로,
 * tenantId를 함께 확인하여 타 테넌트의 레코드 접근을 원천 차단
 */
export async function verifySiteOwnership(
  db: any,
  table: any,
  id: number,
  siteId: number,
  tenantId?: number
) {
  // siteId 조건 기본
  const conditions: any[] = [eq(table.id, id), eq(table.siteId, siteId)];

  // tenantId 교차 검증 추가 (테이블에 tenantId 컬럼이 있는 경우)
  if (tenantId && table.tenantId) {
    conditions.push(eq(table.tenantId, tenantId));
  }

  const rows = await db.select().from(table).where(and(...conditions)).limit(1);
  if (!rows[0]) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "해당 레코드를 찾을 수 없거나 접근 권한이 없습니다.",
    });
  }
  return rows[0];
}

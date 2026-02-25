import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { TenantDb } from "../db/TenantDb";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

// ============================================================================
// 🔒 핵심: 인증 + 테넌트 격리 + TenantDb 자동 주입 미들웨어
// ============================================================================

/**
 * resolveTenantContext - 테넌트 정보를 해석하고 TenantDb를 생성하는 헬퍼
 * 모든 인증 미들웨어에서 공통으로 사용
 */
function resolveTenantContext(ctx: TrpcContext) {
  const tenantId = ctx.tenantId ?? (ctx.user as any)?.tenantId ?? null;

  // super_admin이 아닌데 tenantId가 없으면 차단
  if (ctx.user && ctx.user.role !== "super_admin" && !tenantId) {
    console.error(`[SECURITY] User ${ctx.user.email} (id: ${ctx.user.id}) has no tenantId! Blocking access.`);
    throw new TRPCError({ 
      code: "FORBIDDEN", 
      message: "테넌트 정보가 필요합니다. 관리자에게 문의하세요." 
    });
  }

  // TenantDb 생성 (super_admin은 tenantId가 없을 수 있음)
  let tenantDb: TenantDb | null = null;
  if (tenantId && ctx.user) {
    tenantDb = new TenantDb(tenantId, ctx.user.id as number);
  }

  return { tenantId, tenantDb };
}

/**
 * protectedProcedure - 인증 + 테넌트 격리 + TenantDb 주입
 * 
 * ⚠️ 변경사항: 기존에는 인증만 했으나 이제 tenantId 강제 + TenantDb 자동 주입 포함
 * - ctx.tenantId: 사용자의 테넌트 ID (super_admin은 null 가능)
 * - ctx.db: TenantDb 인스턴스 (super_admin은 null 가능)
 * - ctx.user: 인증된 사용자 정보
 */
const requireUserWithTenant = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  const { tenantId, tenantDb } = resolveTenantContext(ctx);

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
      tenantId,
      db: tenantDb,  // ✅ 모든 라우터에서 ctx.db로 접근 가능
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUserWithTenant);

// protectedTenantProcedure는 protectedProcedure와 동일 (하위 호환)
export const protectedTenantProcedure = protectedProcedure;

/**
 * adminProcedure - admin 권한 + 테넌트 격리
 */
export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin')) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    const { tenantId, tenantDb } = resolveTenantContext(ctx);

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
        tenantId,
        db: tenantDb,
      },
    });
  }),
);

/**
 * workerProcedure - 작업자 권한 (worker, admin, super_admin) + 테넌트 격리
 */
export const workerProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || (ctx.user.role !== 'worker' && ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin')) {
      throw new TRPCError({ code: "FORBIDDEN", message: "작업자 권한이 필요합니다." });
    }

    const { tenantId, tenantDb } = resolveTenantContext(ctx);

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
        tenantId,
        db: tenantDb,
      },
    });
  }),
);

/**
 * monitorProcedure - 모니터 권한 (monitor, admin, super_admin) + 테넌트 격리
 */
export const monitorProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || (ctx.user.role !== 'monitor' && ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin')) {
      throw new TRPCError({ code: "FORBIDDEN", message: "모니터 권한이 필요합니다." });
    }

    const { tenantId, tenantDb } = resolveTenantContext(ctx);

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
        tenantId,
        db: tenantDb,
      },
    });
  }),
);

import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { TenantDb } from "./db/TenantDb";

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
 * resolveTenantContextStrict - 테넌트 데이터 접근 시 필수로 tenantId를 요구하는 헬퍼
 * 일반 유저: ctx.tenantId 필수
 * 슈퍼관리자: ctx.actingTenantId 필수 (테넌트 선택 후에만 접근)
 */
function resolveTenantContextStrict(ctx: TrpcContext) {
  // 일반 유저: tenantId 필수
  if (ctx.user?.role !== "super_admin") {
    const tenantId = ctx.tenantId ?? (ctx.user as any)?.tenantId ?? null;
    if (!tenantId) {
      console.error(`[SECURITY] User ${ctx.user?.email} (id: ${ctx.user?.id}) has no tenantId! Blocking access.`);
      throw new TRPCError({ 
        code: "FORBIDDEN", 
        message: "테넌트 정보가 필요합니다. 관리자에게 문의하세요." 
      });
    }
    const tenantDb = new TenantDb(tenantId, ctx.user!.id as number);
    return { tenantId, tenantDb };
  }

  // 슈퍼관리자: actingTenantId 필수
  const actingTenantId = ctx.actingTenantId;
  if (!actingTenantId) {
    console.error(`[SECURITY] Super admin ${ctx.user.email} (id: ${ctx.user.id}) has no actingTenantId! Blocking access.`);
    throw new TRPCError({ 
      code: "FORBIDDEN", 
      message: "테넌트를 먼저 선택해주세요." 
    });
  }
  const tenantDb = new TenantDb(actingTenantId, ctx.user.id as number);
  return { tenantId: actingTenantId, tenantDb };
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
 * tenantProcedure - 테넌트 데이터 접근 시 필수로 tenantId를 요구하는 프로시저
 * 
 * 일반 유저: ctx.tenantId 필수 (403 if null)
 * 슈퍼관리자: ctx.actingTenantId 필수 (403 if null)
 * 
 * ⚠️ 사용 방법:
 * - 테넌트 데이터를 조회/수정하는 모든 API에서 protectedProcedure 대신 tenantProcedure 사용
 * - ctx.db로 TenantDb 인스턴스에 접근
 * - ctx.tenantId로 현재 테넌트 ID 확인
 */
const requireTenantAccess = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  const { tenantId, tenantDb } = resolveTenantContextStrict(ctx);

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
      tenantId,
      db: tenantDb,  // ✅ 모든 라우터에서 ctx.db로 접근 가능
    },
  });
});

export const tenantProcedure = t.procedure.use(requireTenantAccess);

/**
 * adminProcedure - admin 권한 + 테넌트 격리 (tenantId 필수)
 */
export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin')) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    const { tenantId, tenantDb } = resolveTenantContextStrict(ctx);

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

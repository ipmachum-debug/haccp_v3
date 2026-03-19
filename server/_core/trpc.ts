import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { TenantDb } from "../db/TenantDb";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const mergeRouters = t.mergeRouters;
export const publicProcedure = t.procedure;

// ============================================================================
// 🔒 핵심: 인증 + 테넌트 격리 + TenantDb 자동 주입 미들웨어
// ============================================================================

/**
 * resolveTenantContext - 테넌트 정보를 해석하고 TenantDb를 생성하는 헬퍼
 * 모든 인증 미들웨어에서 공통으로 사용
 */
function resolveTenantContext(ctx: TrpcContext) {
  // 슈퍼관리자는 actingTenantId를 우선 사용
  let tenantId: number | null = null;
  
  if (ctx.user?.role === "super_admin") {
    // 슈퍼관리자: actingTenantId 사용 (선택한 테넌트)
    tenantId = ctx.actingTenantId ?? null;
  } else {
    // ✨ 일반 사용자: actingTenantId 강제 무시 (보안)
    if (ctx.actingTenantId) {
      console.warn(`[SECURITY] Non-super-admin user ${ctx.user?.email} (id: ${ctx.user?.id}) attempted to use actingTenantId=${ctx.actingTenantId}. Ignoring.`);
    }
    // 일반 사용자: 기본 tenantId만 사용
    tenantId = ctx.tenantId ?? (ctx.user as any)?.tenantId ?? null;
    
    // 일반 사용자는 tenantId 필수
    if (ctx.user && !tenantId) {
      console.error(`[SECURITY] User ${ctx.user.email} (id: ${ctx.user.id}) has no tenantId! Blocking access.`);
      throw new TRPCError({ 
        code: "FORBIDDEN", 
        message: "테넌트 정보가 필요합니다. 관리자에게 문의하세요." 
      });
    }
  }

  // TenantDb 생성
  let tenantDb: TenantDb | null = null;
  if (tenantId && ctx.user) {
    tenantDb = new TenantDb(tenantId, ctx.user.id as number);
  }

  return { tenantId, tenantDb };
}

// ============================================================================
// 🔍 Audit Log: 슈퍼관리자 활동 기록
// ============================================================================

/**
 * logSuperAdminAction - 슈퍼관리자의 테넌트 접근 활동을 기록
 * 
 * ⚠️ 슈퍼관리자가 다른 테넌트의 데이터에 접근할 때 반드시 기록
 * - 누가 (userId, email)
 * - 어떤 테넌트에 (actingTenantId)
 * - 무엇을 했는지 (procedure path, type)
 * - 언제 (timestamp)
 */
function logSuperAdminAction(ctx: TrpcContext, path: string, type: string) {
  if (ctx.user?.role === "super_admin" && ctx.actingTenantId) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      userId: ctx.user.id,
      email: ctx.user.email,
      role: "super_admin",
      actingTenantId: ctx.actingTenantId,
      action: `${type}:${path}`,
      ip: (ctx as any).req?.ip || (ctx as any).req?.headers?.['x-forwarded-for'] || 'unknown',
    };
    console.log(`[AUDIT] super_admin action:`, JSON.stringify(logEntry));
  }
}

/**
 * protectedProcedure - 인증 + 테넌트 격리 + TenantDb 주입
 * 
 * ⚠️ 변경사항: 기존에는 인증만 했으나 이제 tenantId 강제 + TenantDb 자동 주입 포함
 * - ctx.tenantId: 사용자의 테넌트 ID (super_admin은 null 가능)
 * - ctx.db: TenantDb 인스턴스 (super_admin은 null 가능)
 * - ctx.user: 인증된 사용자 정보
 * - ctx.isSuperAdminActing: 슈퍼관리자가 다른 테넌트로 접근 중인지 여부
 */
const requireUserWithTenant = t.middleware(async opts => {
  const { ctx, next, path, type } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  const { tenantId, tenantDb } = resolveTenantContext(ctx);
  
  // 슈퍼관리자 활동 기록
  const isSuperAdminActing = ctx.user.role === "super_admin" && !!ctx.actingTenantId;
  if (isSuperAdminActing) {
    logSuperAdminAction(ctx, path, type);
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
      tenantId,
      db: tenantDb,
      isSuperAdminActing,  // ✅ 슈퍼관리자 활동 여부
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUserWithTenant);

// protectedTenantProcedure는 protectedProcedure와 동일 (하위 호환)
export const protectedTenantProcedure = protectedProcedure;

/**
 * tenantRequiredProcedure - 테넌트 데이터 접근 전용 프로시저
 * 
 * ✨ 테넌트 격리 강제:
 * - 일반 사용자: tenantId 필수
 * - 슈퍼관리자: actingTenantId 필수
 * - 둘 다 없으면 403 에러
 * 
 * ⚠️ 테넌트 데이터 CRUD 라우터는 반드시 이 프로시저를 사용해야 합니다!
 */
const requireTenant = t.middleware(async opts => {
  const { ctx, next, path, type } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  const { tenantId, tenantDb } = resolveTenantContext(ctx);

  // ✨ 테넌트 ID 필수 검증
  if (!tenantId) {
    if (ctx.user.role === "super_admin") {
      throw new TRPCError({ 
        code: "FORBIDDEN", 
        message: "테넌트를 먼저 선택해주세요." 
      });
    } else {
      throw new TRPCError({ 
        code: "FORBIDDEN", 
        message: "테넌트 정보가 필요합니다. 관리자에게 문의하세요." 
      });
    }
  }

  // 슈퍼관리자 활동 기록
  const isSuperAdminActing = ctx.user.role === "super_admin" && !!ctx.actingTenantId;
  if (isSuperAdminActing) {
    logSuperAdminAction(ctx, path, type);
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
      tenantId,
      db: tenantDb,
      isSuperAdminActing,
    },
  });
});

export const tenantRequiredProcedure = t.procedure.use(requireTenant);

/**
 * tenantReadOnlyProcedure - 슈퍼관리자 읽기 전용 프로시저
 * 
 * ✨ 슈퍼관리자는 기본적으로 View-only
 * - 일반 사용자: 정상 CRUD 가능
 * - 슈퍼관리자(actingTenant): 읽기만 가능, 쓰기 시도 시 403
 * 
 * ⚠️ 민감한 데이터 수정 라우터에 사용 권장
 */
const requireTenantReadOnly = t.middleware(async opts => {
  const { ctx, next, path, type } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  const { tenantId, tenantDb } = resolveTenantContext(ctx);

  if (!tenantId) {
    if (ctx.user.role === "super_admin") {
      throw new TRPCError({ 
        code: "FORBIDDEN", 
        message: "테넌트를 먼저 선택해주세요." 
      });
    } else {
      throw new TRPCError({ 
        code: "FORBIDDEN", 
        message: "테넌트 정보가 필요합니다. 관리자에게 문의하세요." 
      });
    }
  }

  // ✨ 슈퍼관리자 쓰기 제한 (mutation만 차단)
  const isSuperAdminActing = ctx.user.role === "super_admin" && !!ctx.actingTenantId;
  if (isSuperAdminActing && type === "mutation") {
    logSuperAdminAction(ctx, path, type);
    console.warn(`[SECURITY] super_admin ${ctx.user.email} attempted mutation on tenant ${ctx.actingTenantId}: ${path}. Blocked (read-only mode).`);
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "슈퍼관리자는 다른 테넌트의 데이터를 수정할 수 없습니다. 읽기만 가능합니다.",
    });
  }

  if (isSuperAdminActing) {
    logSuperAdminAction(ctx, path, type);
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
      tenantId,
      db: tenantDb,
      isSuperAdminActing,
    },
  });
});

export const tenantReadOnlyProcedure = t.procedure.use(requireTenantReadOnly);

/**
 * adminProcedure - admin 권한 + 테넌트 격리
 */
export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next, path, type } = opts;

    if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin')) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    const { tenantId, tenantDb } = resolveTenantContext(ctx);
    
    const isSuperAdminActing = ctx.user.role === "super_admin" && !!ctx.actingTenantId;
    if (isSuperAdminActing) {
      logSuperAdminAction(ctx, path, type);
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
        tenantId,
        db: tenantDb,
        isSuperAdminActing,
      },
    });
  }),
);

/**
 * workerProcedure - 작업자 권한 (worker, admin, super_admin) + 테넌트 격리
 */
export const workerProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next, path, type } = opts;

    if (!ctx.user || (ctx.user.role !== 'worker' && ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin')) {
      throw new TRPCError({ code: "FORBIDDEN", message: "작업자 권한이 필요합니다." });
    }

    const { tenantId, tenantDb } = resolveTenantContext(ctx);
    
    const isSuperAdminActing = ctx.user.role === "super_admin" && !!ctx.actingTenantId;
    if (isSuperAdminActing) {
      logSuperAdminAction(ctx, path, type);
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
        tenantId,
        db: tenantDb,
        isSuperAdminActing,
      },
    });
  }),
);

/**
 * monitorProcedure - 모니터 권한 (monitor, admin, super_admin) + 테넌트 격리
 */
export const monitorProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next, path, type } = opts;

    if (!ctx.user || (ctx.user.role !== 'monitor' && ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin')) {
      throw new TRPCError({ code: "FORBIDDEN", message: "모니터 권한이 필요합니다." });
    }

    const { tenantId, tenantDb } = resolveTenantContext(ctx);
    
    const isSuperAdminActing = ctx.user.role === "super_admin" && !!ctx.actingTenantId;
    if (isSuperAdminActing) {
      logSuperAdminAction(ctx, path, type);
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
        tenantId,
        db: tenantDb,
        isSuperAdminActing,
      },
    });
  }),
);

/**
 * superAdminProcedure - 슈퍼관리자 전용 프로시저
 * 
 * ✨ 슈퍼관리자만 접근 가능 (cross-tenant 조회):
 * - role === 'super_admin' 필수
 * - 테넌트 데이터가 아닌 글로벌 통계/사용자/테넌트 관리용
 * - getDb()로 직접 접근 (특정 테넌트 아님)
 * 
 * ⚠️ 슈퍼관리자 대시보드, 승인 관리 등에 사용
 */
export const superAdminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }

    if (ctx.user.role !== 'super_admin') {
      throw new TRPCError({ 
        code: "FORBIDDEN", 
        message: "슈퍼관리자 권한이 필요합니다." 
      });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

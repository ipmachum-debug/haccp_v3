// superadmin 라우터 - routers.ts에서 분리됨
import { superAdminProcedure, router } from "../../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { or, eq, sql } from "drizzle-orm";
import { getDb } from "../../db";

export const superadminRouter = router({
    /**
     * 슈퍼관리자가 테넌트를 선택하는 API
     * 선택된 tenantId는 세션에 actingTenantId로 저장됨
     */
    setActingTenant: superAdminProcedure
      .input(z.object({
        tenantId: z.number().nullable(),
      }))
      .mutation(async ({ input, ctx }) => {
        // 세션에 actingTenantId 저장
        if (!ctx.req.session) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "세션이 초기화되지 않았습니다.",
          });
        }

        (ctx.req.session as any).actingTenantId = input.tenantId;

        return {
          success: true,
          actingTenantId: input.tenantId,
          message: input.tenantId
            ? `테넌트 ID ${input.tenantId}로 전환되었습니다.`
            : "테넌트 선택이 해제되었습니다.",
        };
      }),

    /**
     * 현재 선택된 actingTenantId 조회
     */
    getActingTenant: superAdminProcedure
      .query(async ({ ctx }) => {
        const actingTenantId = (ctx.req.session as any)?.actingTenantId ?? null;
        return { actingTenantId };
      }),

    /**
     * 모든 테넌트 목록 조회 (슈퍼관리자 전용)
     */
    listTenants: superAdminProcedure
      .query(async ({ ctx }) => {
        const { getDb } = await import("../../db");
        const { tenants } = await import("../../../drizzle/schema");
        const db = await getDb();

        const tenantList = await db.select({
          id: tenants.id,
          name: tenants.name,
          status: tenants.status,
        }).from(tenants);

        return { tenants: tenantList };
      }),

    /**
     * 슈퍼관리자가 지정한 테넌트에 사용자 직접 생성 (비밀번호 명시 지정 가능)
     *
     * 일반 user.invite 와 차이점:
     *   - 임의 tenantId 지정 가능 (super_admin 권한 필요)
     *   - 비밀번호를 호출자가 직접 지정 (random temp 가 아님)
     *   - 즉시 활성화 + 승인 상태 (테스트/데모 계정 생성 용)
     *
     * 사용 예: 슈퍼관리자가 특정 고객 테넌트에 테스트 admin 계정을 만들고
     *         특정 비밀번호로 즉시 로그인 가능하게 할 때.
     */
    createUserForTenant: superAdminProcedure
      .input(z.object({
        tenantId: z.number().int().positive(),
        email: z.string().email("유효한 이메일을 입력해주세요"),
        password: z.string().min(8, "비밀번호는 최소 8자 이상이어야 합니다"),
        name: z.string().min(1, "이름을 입력해주세요"),
        role: z.enum(["admin", "worker", "monitor", "employee", "accountant", "inspector"]).default("admin"),
        userType: z.enum(["client_admin", "employee", "company_staff", "b2b_partner", "general_user", "other"]).default("client_admin"),
        companyName: z.string().optional(),
        adminMemo: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 실패" });
        }

        const { users, tenants } = await import("../../../drizzle/schema");

        // 1. 테넌트 존재 확인
        const [tenant] = await db.select({ id: tenants.id, name: tenants.name })
          .from(tenants)
          .where(eq(tenants.id, input.tenantId))
          .limit(1);
        if (!tenant) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `테넌트 ID ${input.tenantId}를 찾을 수 없습니다.`,
          });
        }

        // 2. 이메일 중복 체크 (전역 unique)
        const [existing] = await db.select({ id: users.id })
          .from(users)
          .where(eq(users.email, input.email))
          .limit(1);
        if (existing) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "이미 사용 중인 이메일입니다.",
          });
        }

        // 3. 비밀번호 해싱 (localAuth 의 표준 해시 사용 — 로그인 호환)
        const { hashPassword } = await import("../../localAuth");
        const passwordHash = await hashPassword(input.password);

        // 4. 사용자 생성 (즉시 활성화 + 승인 완료)
        const result = await db.execute(sql`
          INSERT INTO users (
            tenant_id, email, password_hash, name, role, user_type,
            is_active, approval_status, company_name, admin_memo,
            invited_by, invited_at, created_at, updated_at
          )
          VALUES (
            ${input.tenantId}, ${input.email}, ${passwordHash}, ${input.name},
            ${input.role}, ${input.userType},
            1, 'approved',
            ${input.companyName || tenant.name},
            ${input.adminMemo || `슈퍼관리자(${ctx.user.email})가 직접 생성`},
            ${ctx.user.id}, NOW(), NOW(), NOW()
          )
        `);

        const insertId = (result as any)?.insertId
          ?? (Array.isArray(result) ? (result[0] as any)?.insertId : undefined);

        // 감사 로그 (실패해도 user 생성은 성공으로 반환)
        try {
          const { createAuditLog } = await import("../../db");
          if (typeof createAuditLog === "function") {
            await createAuditLog({
              action: "superadmin.createUserForTenant",
              entityType: "user",
              entityId: insertId ? Number(insertId) : null,
              userId: ctx.user.id,
              userEmail: ctx.user.email,
              userRole: ctx.user.role,
              changes: {
                tenantId: input.tenantId,
                tenantName: tenant.name,
                email: input.email,
                name: input.name,
                role: input.role,
                userType: input.userType,
              },
              description: `슈퍼관리자가 테넌트[${tenant.name}](id=${input.tenantId})에 사용자 ${input.email} 직접 생성`,
            });
          }
        } catch (auditErr) {
          console.warn("[superadmin.createUserForTenant] 감사 로그 기록 실패:", auditErr);
        }

        return {
          success: true,
          userId: insertId ? Number(insertId) : null,
          tenantId: input.tenantId,
          tenantName: tenant.name,
          email: input.email,
          role: input.role,
          message: `${tenant.name} 테넌트에 ${input.email} 사용자가 생성되었습니다.`,
        };
      }),
});

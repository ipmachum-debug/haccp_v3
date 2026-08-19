/**
 * 테넌트 관리 라우터
 * 멀티 테넌트 시스템의 핵심 API
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, superAdminProcedure } from "../../_core/trpc";
import { tenants, users } from "../../../drizzle/schema/schema_main";
import { getDb, getRawConnection } from "../../db";
import { eq, desc, and, like, or, count } from "drizzle-orm";

/**
 * 슈퍼관리자 전용 프로시저 (로컬 정의 → core superAdminProcedure 사용)
 */
const localSuperAdminProcedure = superAdminProcedure;

export const tenantsRouter = router({
  /**
   * 테넌트 생성 (슈퍼관리자 전용)
   */
  create: localSuperAdminProcedure
    .input(
      z.object({
        name: z.string().min(1, "테넌트 이름은 필수입니다"),
        slug: z
          .string()
          .min(1, "슬러그는 필수입니다")
          .regex(/^[a-z0-9-]+$/, "슬러그는 소문자, 숫자, 하이픈만 사용 가능합니다"),
        status: z.enum(["active", "suspended", "trial", "expired"]).default("trial"),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [tenant] = await db.insert(tenants).values(input).$returningId();
      return { success: true, tenantId: tenant.id };
    }),

  /**
   * 테넌트 목록 조회 (슈퍼관리자 전용)
   */
  list: localSuperAdminProcedure
    .input(
      z.object({
        search: z.string().optional(),
        status: z.enum(["active", "suspended", "trial", "expired"]).optional(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      const { search, status, page, pageSize } = input;
      const offset = (page - 1) * pageSize;

      let conditions = [];
      if (search) {
        conditions.push(
          or(
            like(tenants.name, `%${search}%`),
            like(tenants.slug, `%${search}%`)
          )
        );
      }
      if (status) {
        conditions.push(eq(tenants.status, status));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [tenantsList, countResult] = await Promise.all([
        db
          .select()
          .from(tenants)
          .where(whereClause)
          .orderBy(desc(tenants.createdAt))
          .limit(pageSize)
          .offset(offset),
        db
          .select({ count: count() })
          .from(tenants)
          .where(whereClause),
      ]);

      const totalCount = countResult[0]?.count || 0;

      return {
        tenants: tenantsList,
        total: totalCount,
        page,
        pageSize,
        totalPages: Math.ceil(totalCount / pageSize),
      };
    }),

  /**
   * 시스템 모니터링용 통계 (슈퍼관리자 전용)
   * — 예전 tenantsPublic.getAll 에서 이관: 사용자 수/활성 여부 노출은 슈퍼관리자에게만
   */
  monitoringStats: localSuperAdminProcedure.query(async () => {
    const db = await getDb();
    const rows = await db
      .select({
        id: tenants.id,
        name: tenants.name,
        createdAt: tenants.createdAt,
        status: tenants.status,
        userCount: count(users.id),
      })
      .from(tenants)
      .leftJoin(users, eq(users.tenantId, tenants.id))
      .groupBy(tenants.id, tenants.name, tenants.createdAt, tenants.status)
      .orderBy(desc(tenants.createdAt));

    return {
      tenants: rows.map((t) => ({
        id: t.id,
        name: t.name,
        createdAt: t.createdAt,
        isActive: t.status === "active",
        _count: { users: Number(t.userCount || 0) },
      })),
    };
  }),

  /**
   * 테넌트 상세 조회
   */
  getDetail: protectedProcedure
    .input(z.object({ tenantId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      // 슬슈퍼관리자가 아니면 자기 테넌트만 조회 가능
      if (ctx.user.role !== "super_admin" && (ctx.tenantId) !== input.tenantId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "다른 테넌트의 정보를 조회할 수 없습니다.",
        });
      }

      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, input.tenantId))
        .limit(1);

      if (!tenant) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "테넌트를 찾을 수 없습니다.",
        });
      }

      return tenant;
    }),

  /**
   * 테넌트 정보 수정 (슈퍼관리자 전용)
   */
  update: localSuperAdminProcedure
    .input(
      z.object({
        tenantId: z.number(),
        name: z.string().min(1).optional(),
        slug: z
          .string()
          .regex(/^[a-z0-9-]+$/, "슬러그는 소문자, 숫자, 하이픈만 사용 가능합니다")
          .optional(),
        status: z.enum(["active", "suspended", "trial", "expired"]).optional(),
        industryCode: z.string().max(20).optional(),
        industryCategory: z.string().max(50).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { tenantId, ...updates } = input;

      await db.update(tenants).set(updates).where(eq(tenants.id, tenantId));

      return { success: true };
    }),

  /**
   * 테넌트 소속 사용자 수 조회 (삭제 전 확인용)
   */
  getUserCount: localSuperAdminProcedure
    .input(z.object({ tenantId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const result = await db
        .select({ count: count() })
        .from(users)
        .where(eq(users.tenantId, input.tenantId));
      return { count: result[0]?.count || 0 };
    }),

  /**
   * 테넌트 소속 사용자 전체 삭제 (하위 호환용 — delete에서 내부 처리)
   */
  deleteUsers: localSuperAdminProcedure
    .input(z.object({ tenantId: z.number() }))
    .mutation(async ({ input }) => {
      return { success: true, deletedCount: 0 };
    }),

  /**
   * 테넌트 삭제 (트랜잭션 기반 종속 삭제)
   *
   * 종속 테이블을 먼저 삭제한 후 tenants를 삭제합니다.
   * 트랜잭션이므로 실패 시 전체 롤백 (부작용 없음).
   */
  delete: localSuperAdminProcedure
    .input(z.object({ tenantId: z.number() }))
    .mutation(async ({ input }) => {
      const pool = await getRawConnection();
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        const tid = input.tenantId;
        const tables = [
          "h_user_favorites",
          "h_user_widget_settings",
          "h_approval_requests",
          "h_notifications",
          "h_stock_alerts",
          "package_features",
          "ai_alerts",
          "h_user_roles",
          "users",
        ];
        for (const table of tables) {
          const [exists]: any = await conn.execute(
            `SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
            [table]
          );
          if ((exists as any[]).length === 0) continue;
          await conn.execute(`DELETE FROM \`${table}\` WHERE tenant_id = ?`, [tid]);
        }

        await conn.execute("DELETE FROM tenants WHERE id = ?", [tid]);
        await conn.commit();

        return { success: true };
      } catch (e: any) {
        await conn.rollback();
        const fkMatch = e.message?.match(/CONSTRAINT `([^`]+)`/);
        const detail = fkMatch ? ` (${fkMatch[1]})` : "";
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `테넌트 삭제 실패${detail}: ${e.sqlMessage || e.message}`,
        });
      } finally {
        conn.release();
      }
    }),

  /**
   * 테넌트별 사용자 목록 조회
   */
  getUsersByTenant: protectedProcedure
    .input(
      z.object({
        tenantId: z.number(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      // 슬슈퍼관리자가 아니면 자기 테넌트만 조회 가능
      if (ctx.user.role !== "super_admin" && (ctx.tenantId) !== input.tenantId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "다른 테넌트의 사용자를 조회할 수 없습니다.",
        });
      }

      const { tenantId, page, pageSize } = input;
      const offset = (page - 1) * pageSize;

      const [usersList, userCountResult] = await Promise.all([
        db
          .select({
            id: users.id,
            email: users.email,
            name: users.name,
            role: users.role,
            userType: users.userType,
            isActive: users.isActive,
            approvalStatus: users.approvalStatus,
            createdAt: users.createdAt,
            lastLoginAt: users.lastLoginAt,
          })
          .from(users)
          .where(eq(users.tenantId, tenantId))
          .orderBy(desc(users.createdAt))
          .limit(pageSize)
          .offset(offset),
        db
          .select({ count: count() })
          .from(users)
          .where(eq(users.tenantId, tenantId)),
      ]);

      const userTotalCount = userCountResult[0]?.count || 0;

      return {
        users: usersList,
        total: userTotalCount,
        page,
        pageSize,
        totalPages: Math.ceil(userTotalCount / pageSize),
      };
    }),
});

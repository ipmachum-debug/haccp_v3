/**
 * 테넌트 관리 라우터
 * 멀티 테넌트 시스템의 핵심 API
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, superAdminProcedure } from "../../_core/trpc";
import { tenants, users } from "../../../drizzle/schema/schema_main";
import { getDb } from "../../db";
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
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { tenantId, ...updates } = input;

      await db.update(tenants).set(updates).where(eq(tenants.id, tenantId));

      return { success: true };
    }),

  /**
   * 테넌트 삭제 (슈퍼관리자 전용)
   * 주의: 테넌트에 속한 사용자가 있으면 삭제 불가
   */
  delete: localSuperAdminProcedure
    .input(z.object({ tenantId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      // 테넌트에 속한 사용자 확인
      const userCountResult = await db
        .select({ count: count() })
        .from(users)
        .where(eq(users.tenantId, input.tenantId));

      const userCount = userCountResult[0]?.count || 0;

      if (userCount > 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "테넌트에 속한 사용자가 있어 삭제할 수 없습니다. 먼저 사용자를 삭제하거나 다른 테넌트로 이동하세요.",
        });
      }

      await db.delete(tenants).where(eq(tenants.id, input.tenantId));

      return { success: true };
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

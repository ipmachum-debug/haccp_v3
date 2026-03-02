import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { auditLogs } from "../../drizzle/schema_control_plane_ops";
import { desc, eq, and, like, gte, lte, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

/**
 * 감사 로그 라우터
 * 슈퍼 관리자 전용
 */
export const auditLogsRouter = router({
  /**
   * 감사 로그 목록 조회 (페이지네이션, 필터링, 검색)
   */
  getAuditLogs: protectedProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
        action: z.string().optional(), // 액션 필터
        entityType: z.string().optional(), // 엔티티 타입 필터
        userId: z.number().optional(), // 사용자 ID 필터
        userEmail: z.string().optional(), // 사용자 이메일 검색
        startDate: z.string().optional(), // 시작 날짜 (YYYY-MM-DD)
        endDate: z.string().optional(), // 종료 날짜 (YYYY-MM-DD)
        search: z.string().optional(), // 전체 검색 (description)
      })
    )
    .query(async ({ input, ctx }) => {
      // 슈퍼관리자 권한 확인
      if (ctx.user.role !== 'super_admin') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: '슈퍼관리자 권한이 필요합니다.',
        });
      }

      const db = await getDb();
      const { page, limit, action, entityType, userId, userEmail, startDate, endDate, search } = input;
      const offset = (page - 1) * limit;

      // 필터 조건 구성
      const conditions = [];

      if (action) {
        conditions.push(eq(auditLogs.action, action));
      }

      if (entityType) {
        conditions.push(eq(auditLogs.entityType, entityType));
      }

      if (userId) {
        conditions.push(eq(auditLogs.userId, userId));
      }

      if (userEmail) {
        conditions.push(like(auditLogs.userEmail, `%${userEmail}%`));
      }

      if (startDate) {
        conditions.push(gte(auditLogs.createdAt, new Date(startDate)));
      }

      if (endDate) {
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        conditions.push(lte(auditLogs.createdAt, endDateTime));
      }

      if (search) {
        conditions.push(like(auditLogs.description, `%${search}%`));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // 총 개수 조회
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(auditLogs)
        .where(whereClause);

      // 로그 목록 조회
      const logs = await db
        .select()
        .from(auditLogs)
        .where(whereClause)
        .orderBy(desc(auditLogs.createdAt))
        .limit(limit)
        .offset(offset);

      return {
        logs,
        pagination: {
          page,
          limit,
          total: count,
          totalPages: Math.ceil(count / limit),
        },
      };
    }),

  /**
   * 감사 로그 통계 조회
   */
  getAuditLogStats: protectedProcedure.query(async ({ ctx }) => {
    // 슈퍼관리자 권한 확인
    if (ctx.user.role !== 'super_admin') {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: '슈퍼관리자 권한이 필요합니다.',
      });
    }

    const db = await getDb();

    // 최근 24시간 로그 수
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [{ recentCount }] = await db
      .select({ recentCount: sql<number>`count(*)` })
      .from(auditLogs)
      .where(gte(auditLogs.createdAt, oneDayAgo));

    // 액션별 통계
    const actionStats = await db
      .select({
        action: auditLogs.action,
        count: sql<number>`count(*)`,
      })
      .from(auditLogs)
      .groupBy(auditLogs.action)
      .orderBy(desc(sql`count(*)`))
      .limit(10);

    // 엔티티 타입별 통계
    const entityStats = await db
      .select({
        entityType: auditLogs.entityType,
        count: sql<number>`count(*)`,
      })
      .from(auditLogs)
      .groupBy(auditLogs.entityType)
      .orderBy(desc(sql`count(*)`))
      .limit(10);

    return {
      recentCount,
      actionStats,
      entityStats,
    };
  }),

  /**
   * 특정 엔티티의 감사 로그 조회
   */
  getEntityAuditLogs: protectedProcedure
    .input(
      z.object({
        entityType: z.string(),
        entityId: z.number(),
        limit: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ input, ctx }) => {
      // 슈퍼관리자 권한 확인
      if (ctx.user.role !== 'super_admin') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: '슈퍼관리자 권한이 필요합니다.',
        });
      }

      const db = await getDb();
      const { entityType, entityId, limit } = input;

      const logs = await db
        .select()
        .from(auditLogs)
        .where(and(eq(auditLogs.entityType, entityType), eq(auditLogs.entityId, entityId)))
        .orderBy(desc(auditLogs.createdAt))
        .limit(limit);

      return logs;
    }),
});

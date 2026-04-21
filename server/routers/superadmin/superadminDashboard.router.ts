/**
 * 슈퍼관리자 대시보드 통계 라우터
 * - 전체 시스템 통계
 * - 최근 활동 로그
 */

import { router, superAdminProcedure } from "../../_core/trpc";
import { getDb } from "../../db";
import { users, tenants } from "../../../drizzle/schema/schema_main";
import { eq, and, desc, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const superadminDashboardRouter = router({
  // 대시보드 통계 조회
  getStats: superAdminProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not initialized' });

    // 1. 전체 사용자 수
    const [totalUsersResult] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(users);
    const totalUsers = Number(totalUsersResult?.count || 0);

    // 2. 활성 사용자 수 (isActive = 1)
    const [activeUsersResult] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(users)
      .where(eq(users.isActive, 1));
    const activeUsers = Number(activeUsersResult?.count || 0);

    // 3. 승인 대기 사용자 수 (approvalStatus = 'pending')
    const [pendingUsersResult] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(users)
      .where(eq(users.approvalStatus, 'pending'));
    const pendingUsers = Number(pendingUsersResult?.count || 0);

    // 4. 전체 테넌트 수
    const [totalTenantsResult] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(tenants);
    const totalTenants = Number(totalTenantsResult?.count || 0);

    // 5. 활성 테넌트 수 (status = 'active')
    const [activeTenantsResult] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(tenants)
      .where(eq(tenants.status, 'active'));
    const activeTenants = Number(activeTenantsResult?.count || 0);

    // 6. 지난 30일 대비 증가율 계산 (간단한 예시)
    // 실제로는 더 복잡한 로직 필요
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [recentUsersResult] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(users)
      .where(sql`${users.createdAt} >= ${thirtyDaysAgo}`);
    const recentUsers = Number(recentUsersResult?.count || 0);

    const [recentTenantsResult] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(tenants)
      .where(sql`${tenants.createdAt} >= ${thirtyDaysAgo}`);
    const recentTenants = Number(recentTenantsResult?.count || 0);

    // 증가율 계산 (간단한 예시)
    const userGrowthRate = totalUsers > 0 ? Math.round((recentUsers / totalUsers) * 100) : 0;
    const tenantGrowthRate = totalTenants > 0 ? Math.round((recentTenants / totalTenants) * 100) : 0;

    return {
      totalUsers,
      activeUsers,
      pendingUsers,
      totalTenants,
      activeTenants,
      userGrowthRate,
      tenantGrowthRate,
    };
  }),

  // 최근 시스템 활동 조회
  getRecentActivities: superAdminProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not initialized' });

    // 최근 생성된 테넌트 (최근 5개)
    const recentTenants = await db
      .select({
        id: tenants.id,
        name: tenants.name,
        createdAt: tenants.createdAt,
      })
      .from(tenants)
      .orderBy(desc(tenants.createdAt))
      .limit(5);

    // 최근 가입한 사용자 (최근 5개)
    const recentUsers = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        userType: users.userType,
        approvalStatus: users.approvalStatus,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(5);

    // 활동 로그 통합 (테넌트 생성 + 사용자 가입)
    const activities = [
      ...recentTenants.map(t => ({
        type: 'tenant_created' as const,
        description: `새 테넌트 생성`,
        name: t.name,
        timestamp: t.createdAt,
      })),
      ...recentUsers.map(u => ({
        type: 'user_registered' as const,
        description: u.approvalStatus === 'pending' ? '사용자 승인' : '사용자 가입',
        name: u.name || u.email,
        timestamp: u.createdAt,
      })),
    ]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 10); // 최근 10개만

    return {
      activities,
    };
  }),
});

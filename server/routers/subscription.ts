import { router, protectedProcedure, adminProcedure, superAdminProcedure, tenantRequiredProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { tenants, subscriptionNotifications, packageFeatures } from "../../drizzle/schema_main";
import { eq, and, lte, gte, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { formatLocalDate } from "../utils/timezone";

/**
 * 구독 관리 라우터
 * ✅ P0 FIX: IDOR 위험 제거 - tenantId를 input에서 받지 않고 ctx에서 파생
 * - 슈퍼관리자 전용 엔드포인트: superAdminProcedure 사용 (tenantId input 허용)
 * - 일반 사용자 엔드포인트: tenantRequiredProcedure 사용 (ctx.tenantId 사용)
 */
export const subscriptionRouter = router({
  /**
   * 구독 정보 업데이트
   * ✅ P0 FIX: superAdminProcedure로 변경 (기존: protectedProcedure + role 체크)
   */
  updateSubscription: superAdminProcedure
    .input(
      z.object({
        tenantId: z.number(), // 슈퍼관리자가 관리 대상 테넌트 지정
        subscriptionPackage: z.enum(["basic", "pro"]),
        subscriptionDays: z.number().min(1),
        startDate: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const startDate = input.startDate ? new Date(input.startDate) : new Date();
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + input.subscriptionDays);

      const db = await getDb();
      await db
        .update(tenants)
        .set({
          subscriptionPackage: input.subscriptionPackage,
          subscriptionStartDate: startDate,
          subscriptionEndDate: endDate,
          subscriptionDays: input.subscriptionDays,
          status: "active",
          isReadOnly: false,
          gracePeriodEndDate: null,
        })
        .where(eq(tenants.id, input.tenantId));

      return {
        success: true,
        message: "구독 정보가 업데이트되었습니다.",
        startDate: formatLocalDate(startDate),
        endDate: formatLocalDate(endDate),
      };
    }),

  /**
   * 구독 연장
   * ✅ P0 FIX: superAdminProcedure로 변경
   */
  extendSubscription: superAdminProcedure
    .input(
      z.object({
        tenantId: z.number(), // 슈퍼관리자가 관리 대상 테넌트 지정
        additionalDays: z.number().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const tenant = await (db.query as any).tenants.findFirst({
        where: eq(tenants.id, input.tenantId),
      });

      if (!tenant) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "테넌트를 찾을 수 없습니다.",
        });
      }

      const currentEndDate = tenant.subscriptionEndDate
        ? new Date(tenant.subscriptionEndDate)
        : new Date();
      
      const newEndDate = new Date(currentEndDate);
      newEndDate.setDate(newEndDate.getDate() + input.additionalDays);

      const newTotalDays = (tenant.subscriptionDays || 0) + input.additionalDays;

      await db
        .update(tenants)
        .set({
          subscriptionEndDate: newEndDate,
          subscriptionDays: newTotalDays,
          status: "active",
          isReadOnly: false,
          gracePeriodEndDate: null,
        })
        .where(eq(tenants.id, input.tenantId));

      return {
        success: true,
        message: `구독이 ${input.additionalDays}일 연장되었습니다.`,
        newEndDate: formatLocalDate(newEndDate),
        totalDays: newTotalDays,
      };
    }),

  /**
   * 구독 정보 조회
   * ✅ P0 FIX: input에서 tenantId 제거 → ctx.tenantId 사용 (IDOR 방지)
   */
  getSubscription: tenantRequiredProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      const tenant = await (db.query as any).tenants.findFirst({
        where: eq(tenants.id, ctx.tenantId),
      });

      if (!tenant) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "테넌트를 찾을 수 없습니다.",
        });
      }

      const today = new Date();
      const endDate = tenant.subscriptionEndDate ? new Date(tenant.subscriptionEndDate) : null;
      const daysRemaining = endDate
        ? Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      return {
        subscriptionPackage: tenant.subscriptionPackage,
        subscriptionStartDate: tenant.subscriptionStartDate,
        subscriptionEndDate: tenant.subscriptionEndDate,
        subscriptionDays: tenant.subscriptionDays,
        status: tenant.status,
        gracePeriodEndDate: tenant.gracePeriodEndDate,
        daysRemaining: daysRemaining > 0 ? daysRemaining : 0,
        isReadOnly: tenant.isReadOnly,
      };
    }),

  /**
   * 슈퍼관리자용 특정 테넌트 구독 조회
   */
  getSubscriptionByTenant: superAdminProcedure
    .input(z.object({ tenantId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const tenant = await (db.query as any).tenants.findFirst({
        where: eq(tenants.id, input.tenantId),
      });

      if (!tenant) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "테넌트를 찾을 수 없습니다.",
        });
      }

      const today = new Date();
      const endDate = tenant.subscriptionEndDate ? new Date(tenant.subscriptionEndDate) : null;
      const daysRemaining = endDate
        ? Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      return {
        subscriptionPackage: tenant.subscriptionPackage,
        subscriptionStartDate: tenant.subscriptionStartDate,
        subscriptionEndDate: tenant.subscriptionEndDate,
        subscriptionDays: tenant.subscriptionDays,
        status: tenant.status,
        gracePeriodEndDate: tenant.gracePeriodEndDate,
        daysRemaining: daysRemaining > 0 ? daysRemaining : 0,
        isReadOnly: tenant.isReadOnly,
      };
    }),

  /**
   * 알림 목록 조회
   * ✅ P0 FIX: input에서 tenantId 제거 → ctx.tenantId 사용 (IDOR 방지)
   */
  getNotifications: tenantRequiredProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      const notifications = await (db.query as any).subscriptionNotifications.findMany({
        where: eq(subscriptionNotifications.tenantId, ctx.tenantId),
        orderBy: (notifications: any, { desc }: any) => [desc(notifications.createdAt)],
      });

      return notifications;
    }),

  /**
   * 알림 읽음 처리
   * ✅ P0 FIX: 알림이 현재 테넌트 소속인지 검증
   */
  markNotificationAsRead: tenantRequiredProcedure
    .input(z.object({ notificationId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      
      // 알림이 현재 테넌트 소속인지 검증
      await db
        .update(subscriptionNotifications)
        .set({ isRead: true })
        .where(and(
          eq(subscriptionNotifications.id, input.notificationId),
          eq(subscriptionNotifications.tenantId, ctx.tenantId)
        ));

      return { success: true };
    }),

  /**
   * 패키지 기능 목록 조회 (공개 정보이므로 protectedProcedure 유지)
   */
  getPackageFeatures: protectedProcedure
    .input(z.object({ packageName: z.enum(["basic", "pro"]) }))
    .query(async ({ input }) => {
      const db = await getDb();
      const features = await (db.query as any).packageFeatures.findMany({
        where: eq(packageFeatures.packageName, input.packageName),
      });

      return features;
    }),

  /**
   * 구독 상태 체크 (만료 여부 확인)
   * ✅ P0 FIX: ctx.tenantId 사용 (기존도 ctx.tenantId ?? undefined 사용하여 안전)
   */
  checkSubscriptionStatus: tenantRequiredProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, ctx.tenantId)).limit(1);

    if (!tenant) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "테넌트를 찾을 수 없습니다.",
      });
    }

    const today = new Date();
    const endDate = tenant.subscriptionEndDate ? new Date(tenant.subscriptionEndDate) : null;
    const daysRemaining = endDate
      ? Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    return {
      status: tenant.status,
      subscriptionEndDate: tenant.subscriptionEndDate,
      gracePeriodEndDate: tenant.gracePeriodEndDate,
      daysRemaining: daysRemaining > 0 ? daysRemaining : 0,
      isReadOnly: tenant.isReadOnly,
      subscriptionPackage: tenant.subscriptionPackage,
    };
  }),

  /**
   * 현재 사용자의 패키지 기능 확인
   * ✅ P0 FIX: ctx.tenantId 사용
   */
  checkFeatureAccess: tenantRequiredProcedure
    .input(
      z.object({
        featureName: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      // 슈퍼관리자는 모든 기능 접근 가능
      if (ctx.user.role === "super_admin") {
        return {
          hasAccess: true,
          packageName: "super_admin",
          message: "슈퍼관리자는 모든 기능에 접근할 수 있습니다.",
        };
      }

      const tenant = await (db.query as any).tenants.findFirst({
        where: eq(tenants.id, ctx.tenantId),
      });

      if (!tenant) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "테넌트를 찾을 수 없습니다.",
        });
      }

      if (tenant.status === "suspended") {
        return {
          hasAccess: false,
          packageName: tenant.subscriptionPackage || "none",
          message: "구독이 정지되었습니다. 구독을 갱신해주세요.",
        };
      }

      const feature = await (db.query as any).packageFeatures.findFirst({
        where: and(
          eq(packageFeatures.packageName, tenant.subscriptionPackage || "basic"),
          eq(packageFeatures.featureName, input.featureName)
        ),
      });

      if (!feature || !feature.isEnabled) {
        return {
          hasAccess: false,
          packageName: tenant.subscriptionPackage || "basic",
          message: `${input.featureName} 기능은 현재 패키지에서 사용할 수 없습니다.`,
        };
      }

      return {
        hasAccess: true,
        packageName: tenant.subscriptionPackage || "basic",
        message: "기능 접근이 허용되었습니다.",
      };
    }),

  /**
   * 현재 테넌트의 모든 사용 가능한 기능 목록 조회
   * ✅ P0 FIX: ctx.tenantId 사용
   */
  getAvailableFeatures: tenantRequiredProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (ctx.user.role === "super_admin") {
      return {
        features: ["haccp", "accounting", "all"],
        packageName: "super_admin",
      };
    }

    const tenant = await (db.query as any).tenants.findFirst({
      where: eq(tenants.id, ctx.tenantId),
    });

    if (!tenant) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "테넌트를 찾을 수 없습니다.",
      });
    }

    if (tenant.status === "suspended") {
      return {
        features: [],
        packageName: tenant.subscriptionPackage || "none",
        message: "구독이 정지되었습니다.",
      };
    }

    const features = await (db.query as any).packageFeatures.findMany({
      where: and(
        eq(packageFeatures.packageName, tenant.subscriptionPackage || "basic"),
        eq(packageFeatures.isEnabled, true)
      ),
    });

    return {
      features: features.map((f: any) => f.featureName),
      packageName: tenant.subscriptionPackage || "basic",
      isReadOnly: tenant.isReadOnly || false,
    };
  }),

  // 구독 통계 조회 (슈퍼관리자 전용)
  getSubscriptionStats: superAdminProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    const allTenants = await db.select().from(tenants);
    
    const today = new Date();
    const sevenDaysLater = new Date(today);
    sevenDaysLater.setDate(today.getDate() + 7);

    let active = 0, expiring_soon = 0, grace_period = 0, suspended = 0;
    let package_basic = 0, package_pro = 0;

    allTenants.forEach((tenant) => {
      if (tenant.subscriptionPackage === 'basic') package_basic++;
      else if (tenant.subscriptionPackage === 'pro') package_pro++;

      if ((tenant.status as string) === 'suspended') {
        suspended++;
      } else if ((tenant.status as string) === 'grace_period') {
        grace_period++;
      } else if (tenant.subscriptionEndDate) {
        const expiryDate = new Date(tenant.subscriptionEndDate);
        const daysRemaining = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysRemaining <= 7) {
          expiring_soon++;
        } else {
          active++;
        }
      } else {
        active++;
      }
    });

    return {
      total: allTenants.length,
      active,
      expiring_soon,
      grace_period,
      suspended,
      package_basic,
      package_pro,
      renewal_rate: 0,
    };
  }),

  // 만료 임박 테넌트 조회 (슈퍼관리자 전용)
  getExpiringTenants: superAdminProcedure
    .input(z.object({ days: z.number().default(7) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const today = new Date();
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() + input.days);

      const expiringTenants = await db
        .select()
        .from(tenants)
        .where(
          and(
            sql`${tenants.subscriptionEndDate} IS NOT NULL`,
            sql`${tenants.subscriptionEndDate} <= ${formatLocalDate(targetDate)}`,
            sql`${tenants.subscriptionEndDate} >= ${formatLocalDate(today)}`
          )
        );

      return expiringTenants;
    }),

  // 패키지 기능 업데이트 (슈퍼관리자 전용)
  updatePackageFeature: superAdminProcedure
    .input(
      z.object({
        id: z.number(),
        isEnabled: z.boolean(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db
        .update(packageFeatures)
        .set({ isEnabled: input.isEnabled })
        .where(eq(packageFeatures.id, input.id));

      return { success: true };
    }),

  // 새 패키지 기능 추가 (슈퍼관리자 전용)
  addPackageFeature: superAdminProcedure
    .input(
      z.object({
        packageName: z.enum(["basic", "pro"]),
        featureName: z.string(),
        featureDisplayName: z.string(),
        isEnabled: z.boolean().default(true),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.insert(packageFeatures).values({
        packageName: input.packageName,
        featureName: input.featureName,
        featureDisplayName: input.featureDisplayName,
        isEnabled: input.isEnabled,
      } as any);

      return { success: true };
    }),
});

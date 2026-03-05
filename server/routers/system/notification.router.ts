// notification 라우터 - routers.ts에서 분리됨
import { adminProcedure, tenantRequiredProcedure, router } from "../../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, or } from "drizzle-orm";
import { hSystemSettings } from "../../../drizzle/schema";
import { getDb } from "../../db";

export const notificationRouter = router({
    // 알림 목록 조회
    list: tenantRequiredProcedure.query(async ({ ctx }) => {
      const { getNotifications } = await import("../../db");
      return await getNotifications(ctx.user.id, ctx.user.tenantId);
    }),
    
    // 알림 읽음 처리
    markAsRead: tenantRequiredProcedure
      .input(z.object({ notificationId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { markNotificationAsRead } = await import("../../db");
        await markNotificationAsRead(input.notificationId, ctx.user.tenantId);
        return { success: true };
      }),
    
    // 알림 삭제
    delete: tenantRequiredProcedure
      .input(z.object({ notificationId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { deleteNotification } = await import("../../db");
        await deleteNotification(input.notificationId, ctx.user.tenantId);
        return { success: true };
      }),
    
    // 모든 알림 읽음 처리
    markAllAsRead: tenantRequiredProcedure
      .mutation(async ({ ctx }) => {
        const { markAllNotificationsAsRead } = await import("../../db");
        await markAllNotificationsAsRead(ctx.user.id);
        return { success: true };
      }),
    
    // 모든 알림 삭제
    deleteAll: tenantRequiredProcedure
      .mutation(async ({ ctx }) => {
        const { deleteAllNotifications } = await import("../../db");
        await deleteAllNotifications(ctx.user.id);
        return { success: true };
      }),
    
    // 알림 조치 완료 처리
    markAsResolved: tenantRequiredProcedure
      .input(z.object({ notificationId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { markNotificationAsResolved } = await import("../../db");
        await markNotificationAsResolved(input.notificationId, ctx.user.tenantId);
        return { success: true };
      }),
    
    // 알림 타입별 개수 조회 (읽지 않은 알림만)
    countsByType: tenantRequiredProcedure.query(async ({ ctx }) => {
      const { getNotificationCountsByType } = await import("../../db");
      return await getNotificationCountsByType(ctx.user.id, ctx.user.tenantId);
    }),
    
    getStatistics: tenantRequiredProcedure
      .input(z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional()
      }).optional())
      .query(async ({ input, ctx }) => {
        const { getNotificationStatistics } = await import("../../db");
        return await getNotificationStatistics(input?.startDate, input?.endDate, ctx.user.tenantId);
      }),
    
    // 재고 만료 알림 자동 생성 (테스트용)
    checkExpiry: tenantRequiredProcedure.mutation(async () => {
      const { checkAndCreateExpiryNotifications } = await import("../../db");
      const count = await checkAndCreateExpiryNotifications();
      return { success: true, count, message: `${count}개의 알림이 생성되었습니다.` };
    }),
    
    // 선택한 알림 읽음 처리
    markMultipleAsRead: tenantRequiredProcedure
      .input(z.object({ notificationIds: z.array(z.number()) }))
      .mutation(async ({ input, ctx }) => {
        const { markMultipleNotificationsAsRead } = await import("../../db");
        await markMultipleNotificationsAsRead(input.notificationIds);
        return { success: true, count: input.notificationIds.length };
      }),
    
    // 선택한 알림 삭제
    deleteMultiple: tenantRequiredProcedure
      .input(z.object({ notificationIds: z.array(z.number()) }))
      .mutation(async ({ input, ctx }) => {
        const { deleteMultipleNotifications } = await import("../../db");
        await deleteMultipleNotifications(input.notificationIds);
        return { success: true, count: input.notificationIds.length };
      }),
       // 알림 삭제
    deleteOldReadNotifications: tenantRequiredProcedure
      .input(z.object({ days: z.number().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const { deleteOldReadNotifications } = await import("../../db");
        const deletedCount = await deleteOldReadNotifications(input.days, ctx.user.tenantId);
        return { deletedCount, message: `${deletedCount}개의 오래된 알림을 삭제했습니다` };
      }),
    
    // 알림 보관 정책 설정 조회
    getNotificationRetentionPolicy: tenantRequiredProcedure
      .query(async () => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection failed" });
        
        const [setting] = await db
          .select()
          .from(hSystemSettings)
          .where(eq(hSystemSettings.settingKey, "notification_retention_days"));
        
        return {
          days: setting ? parseInt(setting.settingValue || "30", 10) : 30
        };
      }),
    
    // 알림 보관 정책 설정 저장
    setNotificationRetentionPolicy: adminProcedure
      .input(z.object({ days: z.number().min(1).max(365) }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection failed" });
        
        // 기존 설정 확인
        const [existing] = await db
          .select()
          .from(hSystemSettings)
          .where(eq(hSystemSettings.settingKey, "notification_retention_days"));
        
        if (existing) {
          // 업데이트
          await db
            .update(hSystemSettings)
            .set({
              settingValue: input.days.toString(),
              updatedBy: Number(ctx.user.id)
            })
            .where(eq(hSystemSettings.settingKey, "notification_retention_days"));
        } else {
          // 새로 삽입
          await db.insert(hSystemSettings).values({
            settingKey: "notification_retention_days",
            settingValue: input.days.toString(),
            settingType: "number",
            category: "notification",
            description: "알림 자동 삭제 기준일 (읽은 알림)",
            isEditable: 1,
            updatedBy: Number(ctx.user.id)
          });
        }
        
        return { message: `알림 보관 기간이 ${input.days}일로 설정되었습니다` };
      }),
    // 특정 타입 알림 자동 아카이브
    archiveByType: adminProcedure
      .input(z.object({ type: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const { archiveNotificationsByType } = await import("../../db");
        const result = await archiveNotificationsByType(input.type, ctx.user.tenantId);
        return { success: true, archivedCount: result.archivedCount };
      })
});

import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { eq, and, lte, gte, desc } from "drizzle-orm";

export const bannerRouter = router({
  // 활성 배너 조회 (일반 사용자용)
  getActiveBanners: protectedProcedure.query(async ({ ctx }) => {
    const db = getDb();
    const now = new Date();
    
    const banners = await db
      .select()
      .from(db.schema.banners)
      .where(
        and(
          eq(db.schema.banners.isActive, true),
          lte(db.schema.banners.startDate, now),
          gte(db.schema.banners.endDate, now),
          // 테넌트 필터: null(전체) 또는 현재 테넌트
          ctx.user.tenantId 
            ? or(
                eq(db.schema.banners.tenantId, null),
                eq(db.schema.banners.tenantId, ctx.user.tenantId)
              )
            : eq(db.schema.banners.tenantId, null)
        )
      )
      .orderBy(desc(db.schema.banners.priority));
    
    // 역할 필터링
    return banners.filter(banner => {
      if (!banner.targetRoles) return true;
      return banner.targetRoles.includes(ctx.user.role);
    });
  }),

  // 모든 배너 조회 (슈퍼관리자용)
  getAllBanners: adminProcedure.query(async () => {
    const db = getDb();
    return await db
      .select()
      .from(db.schema.banners)
      .orderBy(desc(db.schema.banners.createdAt));
  }),

  // 배너 생성 (슈퍼관리자용)
  createBanner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1).max(255),
        content: z.string().min(1),
        type: z.enum(["welcome", "event", "notice", "update"]).default("event"),
        color: z.string().default("blue"),
        icon: z.string().default("Bell"),
        startDate: z.string(), // ISO date string
        endDate: z.string(),
        targetRoles: z.array(z.string()).nullable().optional(),
        tenantId: z.number().nullable().optional(),
        priority: z.number().default(0),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      
      const [banner] = await db
        .insert(db.schema.banners)
        .values({
          ...input,
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
        })
        .$returningId();
      
      return { success: true, id: banner.id };
    }),

  // 배너 수정 (슈퍼관리자용)
  updateBanner: adminProcedure
    .input(
      z.object({
        id: z.number(),
        title: z.string().min(1).max(255).optional(),
        content: z.string().min(1).optional(),
        type: z.enum(["welcome", "event", "notice", "update"]).optional(),
        color: z.string().optional(),
        icon: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        targetRoles: z.array(z.string()).nullable().optional(),
        tenantId: z.number().nullable().optional(),
        priority: z.number().optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const { id, ...data } = input;
      
      const updateData: any = { ...data };
      if (data.startDate) updateData.startDate = new Date(data.startDate);
      if (data.endDate) updateData.endDate = new Date(data.endDate);
      
      await db
        .update(db.schema.banners)
        .set(updateData)
        .where(eq(db.schema.banners.id, id));
      
      return { success: true };
    }),

  // 배너 삭제 (슈퍼관리자용)
  deleteBanner: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      
      await db
        .delete(db.schema.banners)
        .where(eq(db.schema.banners.id, input.id));
      
      return { success: true };
    }),

  // 배너 활성화/비활성화 토글 (슈퍼관리자용)
  toggleBanner: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      
      const [banner] = await db
        .select()
        .from(db.schema.banners)
        .where(eq(db.schema.banners.id, input.id))
        .limit(1);
      
      if (!banner) {
        throw new Error("Banner not found");
      }
      
      await db
        .update(db.schema.banners)
        .set({ isActive: !banner.isActive })
        .where(eq(db.schema.banners.id, input.id));
      
      return { success: true, isActive: !banner.isActive };
    }),
});

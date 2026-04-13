import { router, protectedProcedure, adminProcedure } from "../../_core/trpc";
import { z } from "zod";
import { getDb } from "../../db";
import { eq, and, lte, gte, desc, or, isNull } from "drizzle-orm";
import { banners } from "../../../drizzle/schema/schema_control_plane_ops";

export const bannerRouter = router({
  // 활성 배너 조회 (일반 사용자용)
  getActiveBanners: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    const now = new Date();
    
    const rows = await db
      .select()
      .from(banners)
      .where(
        and(
          eq(banners.isActive, true),
          lte(banners.startDate, now),
          gte(banners.endDate, now),
          // 테넌트 필터: null(전체) 또는 현재 테넌트
          ctx.tenantId 
            ? or(
                isNull(banners.tenantId),
                eq(banners.tenantId, ctx.tenantId)
              )
            : isNull(banners.tenantId)
        )
      )
      .orderBy(desc(banners.priority));
    
    // 역할 필터링
    return rows.filter(banner => {
      if (!banner.targetRoles) return true;
      return banner.targetRoles.includes(ctx.user.role);
    });
  }),

  // 모든 배너 조회 (슈퍼관리자용)
  getAllBanners: adminProcedure.query(async () => {
    const db = await getDb();
    return await db
      .select()
      .from(banners)
      .orderBy(desc(banners.createdAt));
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
      const db = await getDb();
      
      const [banner] = await db
        .insert(banners)
        .values({
          title: input.title,
          content: input.content,
          type: input.type,
          color: input.color,
          icon: input.icon,
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
          targetRoles: input.targetRoles ?? null,
          tenantId: input.tenantId ?? null,
          priority: input.priority,
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
      const db = await getDb();
      const { id, ...data } = input;
      
      const updateData: any = { ...data };
      if (data.startDate) updateData.startDate = new Date(data.startDate);
      if (data.endDate) updateData.endDate = new Date(data.endDate);
      
      await db
        .update(banners)
        .set(updateData)
        .where(eq(banners.id, id));
      
      return { success: true };
    }),

  // 배너 삭제 (슈퍼관리자용)
  deleteBanner: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      
      await db
        .delete(banners)
        .where(eq(banners.id, input.id));
      
      return { success: true };
    }),

  // 배너 활성화/비활성화 토글 (슈퍼관리자용)
  toggleBanner: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      
      const [banner] = await db
        .select()
        .from(banners)
        .where(eq(banners.id, input.id))
        .limit(1);
      
      if (!banner) {
        throw new Error("Banner not found");
      }
      
      await db
        .update(banners)
        .set({ isActive: !banner.isActive })
        .where(eq(banners.id, input.id));
      
      return { success: true, isActive: !banner.isActive };
    }),
});

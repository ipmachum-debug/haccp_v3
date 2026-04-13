// favorites 라우터 - routers.ts에서 분리됨
import { tenantRequiredProcedure, router } from "../../_core/trpc";
import { z } from "zod";

export const favoritesRouter = router({
    // 즐겨찾기 목록 조회
    list: tenantRequiredProcedure.query(async ({ ctx }) => {
      const { getUserFavorites } = await import("../../db/system/favorites");
      return await getUserFavorites(ctx.user.id);
    }),

    // 즐겨찾기 추가
    add: tenantRequiredProcedure
      .input(z.object({
        menuPath: z.string(),
        menuLabel: z.string(),
        menuIcon: z.string().optional()
      }))
      .mutation(async ({ ctx, input }) => {
        const { addUserFavorite } = await import("../../db/system/favorites");
        const id = await addUserFavorite(
          ctx.user.id,
          input.menuPath,
          input.menuLabel,
          input.menuIcon,
          ctx.tenantId
        );
        return { id };
      }),

    // 즐겨찾기 제거
    remove: tenantRequiredProcedure
      .input(z.object({ favoriteId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { removeUserFavorite } = await import("../../db/system/favorites");
        await removeUserFavorite(ctx.user.id, input.favoriteId);
        return { success: true };
      }),

    // 즐겨찾기 순서 변경
    updateOrder: tenantRequiredProcedure
      .input(z.object({
        updates: z.array(z.object({
          favoriteId: z.number(),
          displayOrder: z.number()
        }))
      }))
      .mutation(async ({ ctx, input }) => {
        const { updateFavoriteOrder } = await import("../../db/system/favorites");
        for (const update of input.updates) {
          await updateFavoriteOrder(ctx.user.id, update.favoriteId, update.displayOrder);
        }
        return { success: true };
      })
});

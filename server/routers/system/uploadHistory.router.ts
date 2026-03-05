// uploadHistory 라우터 - routers.ts에서 분리됨
import { adminProcedure, tenantRequiredProcedure, router } from "../../_core/trpc";
import { z } from "zod";

export const uploadHistoryRouter = router({
    // 전체 이력 조회
    getAll: tenantRequiredProcedure.query(async () => {
      const { getAllUploadHistory } = await import("../../db/uploadHistory.js");
      return await getAllUploadHistory();
    }),
    
    // 타입별 이력 조회
    getByType: tenantRequiredProcedure
      .input(z.object({ uploadType: z.string() }))
      .query(async ({ input, ctx }) => {
        const { getUploadHistoryByType } = await import("../../db/uploadHistory.js");
        return await getUploadHistoryByType(input.uploadType);
      }),
    
    // 사용자별 이력 조회
    getByUser: tenantRequiredProcedure
      .input(z.object({ userId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getUploadHistoryByUser } = await import("../../db/uploadHistory.js");
        return await getUploadHistoryByUser(input.userId);
      }),
    
    // 이력 삭제
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { deleteUploadHistory } = await import("../../db/uploadHistory.js");
        return await deleteUploadHistory(input.id);
      })
});

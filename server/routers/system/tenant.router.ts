// tenant 라우터 - routers.ts에서 분리됨
import { adminProcedure, router } from "../../_core/trpc";
import { z } from "zod";

export const tenantRouter = router({
    // 모든 테넌트 목록 조회
    list: adminProcedure.query(async () => {
      const { getAllTenants } = await import("../../db");
      return await getAllTenants();
    }),
    
    // 테넌트 상세 정보 조회
    getDetail: adminProcedure
      .input(z.object({
        tenantId: z.number()
      }))
      .query(async ({ input, ctx }) => {
        const { getTenantDetail } = await import("../../db");
        return await getTenantDetail(input.tenantId);
      })
});

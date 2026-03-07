// auditLog 라우터 - routers.ts에서 분리됨
import { adminProcedure, tenantRequiredProcedure, router } from "../../_core/trpc";
import { z } from "zod";
import { lt } from "drizzle-orm";

export const auditLogRouter = router({
    // 감사 로그 목록 조회 (관리자만)
    list: adminProcedure
      .input(z.object({ limit: z.number().optional().default(100) }))
      .query(async ({ input, ctx }) => {
        const { getAuditLogs } = await import("../../db");
        return await getAuditLogs(input.limit);
      }),
    
    // 특정 엔티티의 감사 로그 조회
    getByEntity: tenantRequiredProcedure
      .input(z.object({
        entityType: z.string(),
        entityId: z.number()
      }))
      .query(async ({ input, ctx }) => {
        const { getAuditLogsByEntity } = await import("../../db");
        return await getAuditLogsByEntity(input.entityType, input.entityId, ctx.tenantId);
      }),
    
    // 사용자별 감사 로그 조회
    getByUser: tenantRequiredProcedure
      .input(z.object({
        userId: z.number(),
        limit: z.number().optional().default(50)
      }))
      .query(async ({ input, ctx }) => {
        const { getAuditLogsByUser } = await import("../../db");
        return await getAuditLogsByUser(input.userId, input.limit, ctx.tenantId);
      })
});

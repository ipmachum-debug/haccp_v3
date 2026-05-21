/**
 * 변경이력 로그 라우터 — ERP 감사 추적
 * 전표/거래/급여 등 수정 이력 기록 + 조회
 */
import { z } from "zod";
import { router, tenantRequiredProcedure, adminProcedure } from "../../_core/trpc";
import { getPool } from "../../db/pool";

export const changeLogRouter = router({
  /**
   * 변경이력 조회
   */
  list: tenantRequiredProcedure
    .input(z.object({
      entityType: z.string().optional(),
      entityId: z.number().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      page: z.number().default(1),
      limit: z.number().default(50),
    }).optional())
    .query(async ({ ctx, input }) => {
      const pool = getPool();
      const tenantId = ctx.tenantId;
      const page = input?.page || 1;
      const limit = input?.limit || 50;

      let where = `WHERE cl.tenant_id = ?`;
      const params: any[] = [tenantId];

      if (input?.entityType) { where += ` AND cl.entity_type = ?`; params.push(input.entityType); }
      if (input?.entityId) { where += ` AND cl.entity_id = ?`; params.push(input.entityId); }
      if (input?.startDate) { where += ` AND cl.created_at >= ?`; params.push(input.startDate); }
      if (input?.endDate) { where += ` AND cl.created_at <= ?`; params.push(input.endDate + " 23:59:59"); }

      try {
        const [countRows]: any = await pool.execute(
          `SELECT COUNT(*) as cnt FROM change_logs cl ${where}`, params,
        );
        const [rows]: any = await pool.execute(
          `SELECT cl.*, u.name as user_name
           FROM change_logs cl
           LEFT JOIN users u ON cl.user_id = u.id AND u.tenant_id = cl.tenant_id
           ${where}
           ORDER BY cl.created_at DESC
           LIMIT ? OFFSET ?`,
          [...params, limit, (page - 1) * limit],
        );

        return {
          items: (rows as any[]).map((r: any) => ({
            id: r.id, entityType: r.entity_type, entityId: r.entity_id,
            action: r.action, fieldName: r.field_name,
            oldValue: r.old_value, newValue: r.new_value,
            userName: r.user_name, createdAt: r.created_at,
          })),
          total: Number(countRows[0]?.cnt || 0),
          page, limit,
        };
      } catch (_) {
        return { items: [], total: 0, page, limit };
      }
    }),

  /**
   * 변경이력 기록 (내부 호출용)
   */
  log: adminProcedure
    .input(z.object({
      entityType: z.string(),
      entityId: z.number(),
      action: z.enum(["create", "update", "delete"]),
      fieldName: z.string().optional(),
      oldValue: z.string().optional(),
      newValue: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const pool = getPool();
      try {
        await pool.execute(
          `CREATE TABLE IF NOT EXISTS change_logs (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            tenant_id INT NOT NULL,
            entity_type VARCHAR(50) NOT NULL,
            entity_id BIGINT NOT NULL,
            action ENUM('create','update','delete') NOT NULL,
            field_name VARCHAR(100),
            old_value TEXT,
            new_value TEXT,
            user_id BIGINT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_cl_entity (tenant_id, entity_type, entity_id),
            INDEX idx_cl_date (tenant_id, created_at)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
        );
      } catch (_) {}

      await pool.execute(
        `INSERT INTO change_logs (tenant_id, entity_type, entity_id, action, field_name, old_value, new_value, user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [ctx.tenantId, input.entityType, input.entityId, input.action,
         input.fieldName || null, input.oldValue || null, input.newValue || null, ctx.user.id],
      );
      return { message: "이력 기록 완료" };
    }),
});

/**
 * 대결자/위임 관리 라우터
 *
 * h_delegation_records 테이블 기반
 * 특정 기간 동안 결재 권한을 위임하는 기능
 */
import { z } from "zod";
import { router, tenantRequiredProcedure, adminProcedure } from "../../_core/trpc";
import { getDb } from "../../db";
import { TRPCError } from "@trpc/server";
import { sql, eq, and } from "drizzle-orm";

export const delegationRouter = router({
  /**
   * 현재 활성 위임 목록 조회
   */
  listActive: tenantRequiredProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 실패" });

    const [rows] = await db.execute(sql`
      SELECT
        d.id, d.delegator_id, d.delegatee_id, d.delegation_type,
        d.start_date, d.end_date, d.reason, d.is_active,
        e1.name as delegator_name, e2.name as delegatee_name,
        u1.email as delegator_email, u2.email as delegatee_email
      FROM h_delegation_records d
      LEFT JOIN h_employees e1 ON d.delegator_id = e1.id AND e1.tenant_id = d.tenant_id
      LEFT JOIN h_employees e2 ON d.delegatee_id = e2.id AND e2.tenant_id = d.tenant_id
      LEFT JOIN users u1 ON e1.user_id = u1.id
      LEFT JOIN users u2 ON e2.user_id = u2.id
      WHERE d.tenant_id = ${ctx.tenantId}
        AND d.is_active = 1
        AND (d.end_date IS NULL OR d.end_date >= CURDATE())
      ORDER BY d.created_at DESC
    `);

    return (rows as any[]).map(r => ({
      id: r.id,
      delegatorId: r.delegator_id,
      delegatorName: r.delegator_name || r.delegator_email || `직원#${r.delegator_id}`,
      delegateeId: r.delegatee_id,
      delegateeName: r.delegatee_name || r.delegatee_email || `직원#${r.delegatee_id}`,
      delegationType: r.delegation_type,
      startDate: r.start_date,
      endDate: r.end_date,
      reason: r.reason,
      isActive: !!r.is_active,
    }));
  }),

  /**
   * 전체 위임 이력 (만료 포함)
   */
  listAll: adminProcedure
    .input(z.object({ limit: z.number().default(50) }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 실패" });

      const [rows] = await db.execute(sql`
        SELECT
          d.*, e1.name as delegator_name, e2.name as delegatee_name
        FROM h_delegation_records d
        LEFT JOIN h_employees e1 ON d.delegator_id = e1.id AND e1.tenant_id = d.tenant_id
        LEFT JOIN h_employees e2 ON d.delegatee_id = e2.id AND e2.tenant_id = d.tenant_id
        WHERE d.tenant_id = ${ctx.tenantId}
        ORDER BY d.created_at DESC
        LIMIT ${input?.limit || 50}
      `);

      return (rows as any[]).map(r => ({
        id: r.id,
        delegatorId: r.delegator_id,
        delegatorName: r.delegator_name || `직원#${r.delegator_id}`,
        delegateeId: r.delegatee_id,
        delegateeName: r.delegatee_name || `직원#${r.delegatee_id}`,
        delegationType: r.delegation_type,
        startDate: r.start_date,
        endDate: r.end_date,
        reason: r.reason,
        isActive: !!r.is_active,
        createdAt: r.created_at,
      }));
    }),

  /**
   * 위임 등록
   */
  create: adminProcedure
    .input(z.object({
      delegatorId: z.number(),
      delegateeId: z.number(),
      delegationType: z.string().default("approval"),
      startDate: z.string(),
      endDate: z.string().optional(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 실패" });

      if (input.delegatorId === input.delegateeId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "자기 자신에게 위임할 수 없습니다." });
      }

      await db.execute(sql`
        INSERT INTO h_delegation_records
          (tenant_id, delegator_id, delegatee_id, delegation_type, start_date, end_date, reason, is_active)
        VALUES
          (${ctx.tenantId}, ${input.delegatorId}, ${input.delegateeId},
           ${input.delegationType}, ${input.startDate}, ${input.endDate || null},
           ${input.reason || null}, 1)
      `);

      return { success: true, message: "위임이 등록되었습니다." };
    }),

  /**
   * 위임 종료 (비활성화)
   */
  deactivate: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 실패" });

      await db.execute(sql`
        UPDATE h_delegation_records SET is_active = 0
        WHERE id = ${input.id} AND tenant_id = ${ctx.tenantId}
      `);

      return { success: true, message: "위임이 종료되었습니다." };
    }),

  /**
   * 특정 사용자의 대결자 조회 (승인 처리 시 사용)
   */
  getActiveDelegatee: tenantRequiredProcedure
    .input(z.object({ employeeId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;

      const [rows] = await db.execute(sql`
        SELECT d.delegatee_id, e.name as delegatee_name
        FROM h_delegation_records d
        LEFT JOIN h_employees e ON d.delegatee_id = e.id AND e.tenant_id = d.tenant_id
        WHERE d.tenant_id = ${ctx.tenantId}
          AND d.delegator_id = ${input.employeeId}
          AND d.is_active = 1
          AND d.start_date <= CURDATE()
          AND (d.end_date IS NULL OR d.end_date >= CURDATE())
        LIMIT 1
      `);

      const row = (rows as any[])[0];
      if (!row) return null;

      return {
        delegateeId: row.delegatee_id,
        delegateeName: row.delegatee_name,
      };
    }),
});

/**
 * 결재선(워크플로우) 관리 라우터
 *
 * h_approval_workflows + h_approval_workflow_steps 기반
 * 문서 타입별 다단계 결재선 설정
 */
import { z } from "zod";
import { router, adminProcedure, tenantRequiredProcedure } from "../../_core/trpc";
import { getDb } from "../../db";
import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";

export const workflowRouter = router({
  /**
   * 워크플로우 목록 조회
   */
  list: tenantRequiredProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 실패" });

    const [rows] = await db.execute(sql`
      SELECT w.*, COUNT(s.id) as step_count
      FROM h_approval_workflows w
      LEFT JOIN h_approval_workflow_steps s ON w.id = s.workflow_id
      WHERE w.tenant_id = ${ctx.tenantId!}
      GROUP BY w.id
      ORDER BY w.created_at DESC
    `);

    return (rows as any[]).map(r => ({
      id: r.id,
      workflowName: r.workflow_name,
      workflowType: r.workflow_type,
      description: r.description,
      isActive: !!r.is_active,
      stepCount: Number(r.step_count),
      createdAt: r.created_at,
    }));
  }),

  /**
   * 워크플로우 상세 (단계 포함)
   */
  getById: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 실패" });

      const [workflows] = await db.execute(sql`
        SELECT * FROM h_approval_workflows
        WHERE id = ${input.id} AND tenant_id = ${ctx.tenantId!}
      `);
      const workflow = (workflows as any[])[0];
      if (!workflow) throw new TRPCError({ code: "NOT_FOUND", message: "워크플로우를 찾을 수 없습니다" });

      const [steps] = await db.execute(sql`
        SELECT s.*, e.name as approver_name
        FROM h_approval_workflow_steps s
        LEFT JOIN h_employees e ON s.approver_user_id = e.id AND e.tenant_id = ${ctx.tenantId!}
        WHERE s.workflow_id = ${input.id}
        ORDER BY s.step_order ASC
      `);

      return {
        id: workflow.id,
        workflowName: workflow.workflow_name,
        workflowType: workflow.workflow_type,
        description: workflow.description,
        isActive: !!workflow.is_active,
        steps: (steps as any[]).map(s => ({
          id: s.id,
          stepOrder: s.step_order,
          stepName: s.step_name,
          approverRoleId: s.approver_role_id,
          approverUserId: s.approver_user_id,
          approverName: s.approver_name,
          isRequired: !!s.is_required,
          timeoutHours: s.timeout_hours,
        })),
      };
    }),

  /**
   * 워크플로우 생성
   */
  create: adminProcedure
    .input(z.object({
      workflowName: z.string().min(1),
      workflowType: z.string().default("document"),
      description: z.string().optional(),
      steps: z.array(z.object({
        stepOrder: z.number(),
        stepName: z.string(),
        approverUserId: z.number().optional(),
        approverRoleId: z.number().optional(),
        isRequired: z.boolean().default(true),
        timeoutHours: z.number().optional(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 실패" });

      // 워크플로우 생성
      const [result] = await db.execute(sql`
        INSERT INTO h_approval_workflows
          (tenant_id, workflow_name, workflow_type, description, is_active)
        VALUES
          (${ctx.tenantId!}, ${input.workflowName}, ${input.workflowType},
           ${input.description || null}, 1)
      `);
      const workflowId = (result as any).insertId;

      // 단계 생성
      for (const step of input.steps) {
        await db.execute(sql`
          INSERT INTO h_approval_workflow_steps
            (workflow_id, step_order, step_name, approver_user_id, approver_role_id,
             is_required, timeout_hours)
          VALUES
            (${workflowId}, ${step.stepOrder}, ${step.stepName},
             ${step.approverUserId || null}, ${step.approverRoleId || null},
             ${step.isRequired ? 1 : 0}, ${step.timeoutHours || null})
        `);
      }

      return { success: true, workflowId, message: `결재선 '${input.workflowName}'이 생성되었습니다.` };
    }),

  /**
   * 워크플로우 활성/비활성 전환
   */
  toggleActive: adminProcedure
    .input(z.object({ id: z.number(), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 실패" });

      await db.execute(sql`
        UPDATE h_approval_workflows SET is_active = ${input.isActive ? 1 : 0}
        WHERE id = ${input.id} AND tenant_id = ${ctx.tenantId!}
      `);

      return { success: true, message: input.isActive ? "활성화되었습니다." : "비활성화되었습니다." };
    }),

  /**
   * 워크플로우 삭제
   */
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 실패" });

      await db.execute(sql`
        DELETE FROM h_approval_workflow_steps WHERE workflow_id = ${input.id}
      `);
      await db.execute(sql`
        DELETE FROM h_approval_workflows
        WHERE id = ${input.id} AND tenant_id = ${ctx.tenantId!}
      `);

      return { success: true, message: "결재선이 삭제되었습니다." };
    }),
});

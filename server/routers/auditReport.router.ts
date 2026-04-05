/**
 * HACCP 감사 리포트 통합 데이터 API
 * 교육 이수율 + 체크리스트 완료율 + CCP 이탈 현황 통합
 * 감사 대응용 종합 보고서 데이터
 */
import { z } from "zod";
import { router, tenantRequiredProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";

export const auditReportRouter = router({
  // ── 감사용 종합 리포트 데이터 ──
  getAuditSummary: tenantRequiredProcedure
    .input(z.object({
      startDate: z.string(), // YYYY-MM-DD
      endDate: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      if (!["super_admin", "admin"].includes(ctx.user?.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const { getRawConnection } = await import("../db");
      const conn = await getRawConnection();
      const tenantId = ctx.tenantId;
      const { startDate, endDate } = input;

      // 1. 교육 이수율
      const [trainAssign] = await conn.execute<any[]>(
        "SELECT COUNT(*) as cnt FROM h_training_assignments WHERE tenant_id = ? AND assignment_date >= ? AND assignment_date <= ?",
        [tenantId, startDate, endDate]
      );
      const [trainUsers] = await conn.execute<any[]>(
        "SELECT COUNT(*) as cnt FROM users WHERE tenant_id = ? AND status = 'approved'",
        [tenantId]
      );
      const [trainDone] = await conn.execute<any[]>(
        "SELECT COUNT(*) as cnt FROM h_training_logs WHERE tenant_id = ? AND assignment_date >= ? AND assignment_date <= ? AND status = 'DONE'",
        [tenantId, startDate, endDate]
      );
      const trainExpected = trainAssign[0].cnt * trainUsers[0].cnt;
      const trainingRate = trainExpected > 0 ? Math.round((trainDone[0].cnt / trainExpected) * 100) : 0;

      // 2. 체크리스트 완료율
      const [checkTotal] = await conn.execute<any[]>(
        `SELECT COUNT(*) as cnt FROM generic_checklists
         WHERE tenant_id = ? AND form_date >= ? AND form_date <= ?`,
        [tenantId, startDate, endDate]
      );
      const [checkComplete] = await conn.execute<any[]>(
        `SELECT COUNT(*) as cnt FROM generic_checklists
         WHERE tenant_id = ? AND form_date >= ? AND form_date <= ? AND status = 'completed'`,
        [tenantId, startDate, endDate]
      );
      const checklistRate = checkTotal[0].cnt > 0 ? Math.round((checkComplete[0].cnt / checkTotal[0].cnt) * 100) : 0;

      // 3. CCP 이탈 현황
      const [ccpTotal] = await conn.execute<any[]>(
        `SELECT COUNT(*) as cnt FROM h_ccp_records
         WHERE tenant_id = ? AND created_at >= ? AND created_at <= ?`,
        [tenantId, startDate, endDate]
      );
      const [ccpDeviation] = await conn.execute<any[]>(
        `SELECT COUNT(*) as cnt FROM h_ccp_records
         WHERE tenant_id = ? AND created_at >= ? AND created_at <= ? AND status = 'deviation'`,
        [tenantId, startDate, endDate]
      );
      const ccpComplianceRate = ccpTotal[0].cnt > 0 ? Math.round(((ccpTotal[0].cnt - ccpDeviation[0].cnt) / ccpTotal[0].cnt) * 100) : 100;

      // 4. 시정조치 현황
      const [capaTotal] = await conn.execute<any[]>(
        `SELECT COUNT(*) as cnt FROM h_corrective_actions
         WHERE tenant_id = ? AND created_at >= ? AND created_at <= ?`,
        [tenantId, startDate, endDate]
      );
      const [capaComplete] = await conn.execute<any[]>(
        `SELECT COUNT(*) as cnt FROM h_corrective_actions
         WHERE tenant_id = ? AND created_at >= ? AND created_at <= ? AND status = 'completed'`,
        [tenantId, startDate, endDate]
      );
      const capaRate = capaTotal[0].cnt > 0 ? Math.round((capaComplete[0].cnt / capaTotal[0].cnt) * 100) : 100;

      // 5. 위생검사 현황
      const [hygieneTotal] = await conn.execute<any[]>(
        `SELECT COUNT(*) as cnt FROM h_inspections
         WHERE tenant_id = ? AND inspection_date >= ? AND inspection_date <= ?`,
        [tenantId, startDate, endDate]
      );
      const [hygienePass] = await conn.execute<any[]>(
        `SELECT COUNT(*) as cnt FROM h_inspections
         WHERE tenant_id = ? AND inspection_date >= ? AND inspection_date <= ? AND result = 'pass'`,
        [tenantId, startDate, endDate]
      );
      const hygieneRate = hygieneTotal[0].cnt > 0 ? Math.round((hygienePass[0].cnt / hygieneTotal[0].cnt) * 100) : 100;

      return {
        period: { startDate, endDate },
        training: {
          assignedDays: trainAssign[0].cnt,
          totalUsers: trainUsers[0].cnt,
          totalDone: trainDone[0].cnt,
          expected: trainExpected,
          rate: trainingRate,
        },
        checklist: {
          total: checkTotal[0].cnt,
          completed: checkComplete[0].cnt,
          rate: checklistRate,
        },
        ccp: {
          total: ccpTotal[0].cnt,
          deviations: ccpDeviation[0].cnt,
          complianceRate: ccpComplianceRate,
        },
        capa: {
          total: capaTotal[0].cnt,
          completed: capaComplete[0].cnt,
          rate: capaRate,
        },
        hygiene: {
          total: hygieneTotal[0].cnt,
          passed: hygienePass[0].cnt,
          rate: hygieneRate,
        },
        overallScore: Math.round((trainingRate + checklistRate + ccpComplianceRate + capaRate + hygieneRate) / 5),
      };
    }),
});

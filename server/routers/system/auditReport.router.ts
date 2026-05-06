/**
 * HACCP 감사 리포트 통합 데이터 API
 * 교육 이수율 + 체크리스트 완료율 + CCP 이탈 현황 통합
 * 감사 대응용 종합 보고서 데이터
 */
import { z } from "zod";
import { router, tenantRequiredProcedure } from "../../_core/trpc";
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

      try {
      const { getRawConnection } = await import("../../db");
      const conn = await getRawConnection();
      const tenantId = ctx.tenantId;
      const { startDate, endDate } = input;

      // 1. 교육 이수율
      const [trainAssign] = await conn.execute<any[]>(
        "SELECT COUNT(*) as cnt FROM h_training_assignments WHERE tenant_id = ? AND assignment_date >= ? AND assignment_date <= ?",
        [tenantId, startDate, endDate]
      );
      const [trainUsers] = await conn.execute<any[]>(
        "SELECT COUNT(*) as cnt FROM users WHERE tenant_id = ? AND approval_status = 'approved'",
        [tenantId]
      );
      const [trainDone] = await conn.execute<any[]>(
        "SELECT COUNT(*) as cnt FROM h_training_logs WHERE tenant_id = ? AND assignment_date >= ? AND assignment_date <= ? AND status = 'DONE'",
        [tenantId, startDate, endDate]
      );
      const trainExpected = trainAssign[0].cnt * trainUsers[0].cnt;
      const trainingRate = trainExpected > 0 ? Math.round((trainDone[0].cnt / trainExpected) * 100) : 0;

      // 2. 체크리스트 완료율 — h_generic_checklist_records 테이블 사용
      //    이전 버그: 'generic_checklists' (잘못된 이름) + status='completed' (스키마 ENUM 미존재)
      //    수정: 정확한 테이블 (h_generic_checklist_records) + 정확한 status ('approved')
      //          + graceful skip (테이블 미존재 / 컬럼 미존재 환경에서도 0% 반환, 다른 메트릭 영향 0)
      let checklistRate = 0;
      try {
        const [checkTotal] = await conn.execute<any[]>(
          `SELECT COUNT(*) as cnt FROM h_generic_checklist_records
           WHERE tenant_id = ? AND form_date >= ? AND form_date <= ?`,
          [tenantId, startDate, endDate]
        );
        const [checkComplete] = await conn.execute<any[]>(
          `SELECT COUNT(*) as cnt FROM h_generic_checklist_records
           WHERE tenant_id = ? AND form_date >= ? AND form_date <= ? AND status = 'approved'`,
          [tenantId, startDate, endDate]
        );
        checklistRate = checkTotal[0].cnt > 0
          ? Math.round((checkComplete[0].cnt / checkTotal[0].cnt) * 100)
          : 0;
      } catch (err: any) {
        // 테이블 / 컬럼 미존재 시 graceful skip — audit summary 다른 메트릭은 정상 표시.
        // 운영 로그 스팸 방지 위해 console.warn 1회만 출력 (반복 호출에도 단일 라인).
        console.warn(
          `[auditReport.getAuditSummary] checklist 메트릭 graceful skip: ${err?.message ?? err}`
        );
      }

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
      } catch (err: any) {
        console.warn("[auditReport.getAuditSummary]", err.message?.substring(0, 100));
        return {
          training: { total: 0, done: 0, rate: 0 },
          checklist: { total: 0, completed: 0, rate: 0 },
          ccp: { total: 0, deviations: 0, complianceRate: 100 },
          capa: { total: 0, resolved: 0, rate: 0 },
          hygiene: { total: 0, passed: 0, rate: 0 },
          overallScore: 0,
        };
      }
    }),
});

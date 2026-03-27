// dailyReport 라우터 - routers.ts에서 분리됨
import { tenantRequiredProcedure, router } from "../../_core/trpc";
import { z } from "zod";
import { or, sql } from "drizzle-orm";
import { getDb, getRawConnection } from "../../db";

export const dailyReportRouter = router({
    // 일별 생산 실적 조회
    getProduction: tenantRequiredProcedure
      .input(z.object({ date: z.string() }))
      .query(async ({ input, ctx }) => {
        const { getDailyProduction } = await import("../../db/dailyReport");
        return await getDailyProduction(input.date, ctx.tenantId ?? undefined);
      }),
    
    // 일별 CCP 기록 조회
    getCcpRecords: tenantRequiredProcedure
      .input(z.object({ date: z.string() }))
      .query(async ({ input, ctx }) => {
        const { getDailyCcpRecords } = await import("../../db/dailyReport");
        return await getDailyCcpRecords(input.date, ctx.tenantId ?? undefined);
      }),
    
    // 일별 이상 사항 조회
    getIssues: tenantRequiredProcedure
      .input(z.object({ date: z.string() }))
      .query(async ({ input, ctx }) => {
        const { getDailyIssues } = await import("../../db/dailyReport");
        return await getDailyIssues(input.date, ctx.tenantId ?? undefined);
      }),
    
    // 일별 요약 통계
    getSummary: tenantRequiredProcedure
      .input(z.object({ date: z.string() }))
      .query(async ({ input, ctx }) => {
        const { getDailySummary } = await import("../../db/dailyReport");
        return await getDailySummary(input.date, ctx.tenantId ?? undefined);
      }),

    // 자동 생성된 생산일보 조회 (배치잡이 생성한 production_daily 레코드)
    getGeneratedReport: tenantRequiredProcedure
      .input(z.object({ date: z.string() }))
      .query(async ({ input, ctx }) => {
        const { getDb } = await import("../../db");
        const { sql } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) return null;
        try {
          const result = await db.execute(sql`
            SELECT id, report_date, summary, generated_at
            FROM h_daily_reports
            WHERE tenant_id = ${ctx.tenantId}
              AND report_date = ${input.date}
              AND report_type = 'production_daily'
            LIMIT 1
          `);
          const rows = (result as any)[0] || [];
          if (!(rows as any[]).length) return null;
          const row = (rows as any[])[0];
          let summary: any = {};
          try { summary = typeof row.summary === 'string' ? JSON.parse(row.summary) : (row.summary || {}); } catch {}
          return {
            id: row.id,
            reportDate: row.report_date instanceof Date ? row.report_date.toISOString().split('T')[0] : String(row.report_date),
            summary,
            generatedAt: row.generated_at,
          };
        } catch (err) {
          console.error('[dailyReport.getGeneratedReport]', err);
          return null;
        }
      }),

    // ID 기반 생산일보 조회 (인쇄 미리보기용 - 실시간 데이터 재생성)
    getReportById: tenantRequiredProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getDb } = await import("../../db");
        const { sql } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) return null;
        const tenantId = ctx.tenantId ?? undefined;
        try {
          // 1) 기본 리포트 정보 + 승인 상태 조회
          const result = await db.execute(sql`
            SELECT dr.id, dr.report_date, dr.summary, dr.generated_at,
              ar.status as approval_status,
              ar.requested_at, ar.reviewed_at, ar.approved_at,
              ar.requested_by, ar.reviewed_by, ar.approved_by
            FROM h_daily_reports dr
            LEFT JOIN h_approval_requests ar
              ON ar.reference_type = 'daily_report'
              AND ar.reference_id = dr.id
              AND ar.request_type = 'production_daily'
              AND ar.tenant_id = ${tenantId}
            WHERE dr.tenant_id = ${tenantId}
              AND dr.id = ${input.id}
              AND dr.report_type = 'production_daily'
            LIMIT 1
          `);
          const rows = (result as any)[0] || [];
          if (!(rows as any[]).length) return null;
          const row = (rows as any[])[0];
          const reportDate = row.report_date instanceof Date ? row.report_date.toISOString().split('T')[0] : String(row.report_date);

          // 2) 배치 실시간 데이터 재조회 (시작/종료 시간, CCP 포함)
          const batchResult = await db.execute(sql`
            SELECT b.id, b.batch_code, b.status, b.planned_quantity, b.actual_quantity,
              b.start_time, b.end_time,
              COALESCE(p.product_name, p1.product_name) as product_name,
              COALESCE(sku.total_kg_sum, 0) as sku_actual_kg,
              COALESCE(pp.actual_quantity, 0) as perf_actual_quantity,
              ps.start_time as prod_start_time,
              ccp_time.ccp_first_time,
              ccp_time.ccp_last_time
            FROM h_batches b
            LEFT JOIN h_products_v2 p ON p.id = b.product_id AND p.tenant_id = ${tenantId}
            LEFT JOIN h_products p1 ON p1.id = b.product_id
            LEFT JOIN (
              SELECT batch_id, SUM(total_kg) as total_kg_sum
              FROM production_sku_output WHERE tenant_id = ${tenantId} GROUP BY batch_id
            ) sku ON sku.batch_id = b.id
            LEFT JOIN h_production_performance pp ON pp.batch_id = b.id AND pp.tenant_id = ${tenantId}
            LEFT JOIN h_production_start ps ON ps.batch_id = b.id AND ps.tenant_id = ${tenantId}
            LEFT JOIN (
              SELECT fr2.batch_id,
                MIN(r2.measurement_time) as ccp_first_time,
                MAX(r2.measurement_time) as ccp_last_time
              FROM h_ccp_form_records fr2
              JOIN h_ccp_form_rows r2 ON r2.form_record_id = fr2.id AND r2.tenant_id = ${tenantId}
              WHERE fr2.tenant_id = ${tenantId} AND r2.measurement_time IS NOT NULL
              GROUP BY fr2.batch_id
            ) ccp_time ON ccp_time.batch_id = b.id
            WHERE b.tenant_id = ${tenantId} AND DATE(b.planned_date) = ${reportDate}
            ORDER BY b.batch_order ASC, b.created_at ASC
          `);
          const batches = (batchResult as any)[0] || [];

          // 3) CCP 상세 정보 (배치별)
          const ccpDetailResult = await db.execute(sql`
            SELECT fr.batch_id, fr.ccp_type, fr.status as ccp_status,
              COUNT(r.id) as row_count,
              SUM(CASE WHEN r.is_deviation = 0 THEN 1 ELSE 0 END) as pass_count,
              SUM(CASE WHEN r.is_deviation = 1 THEN 1 ELSE 0 END) as fail_count
            FROM h_ccp_form_records fr
            INNER JOIN h_batches b ON fr.batch_id = b.id
            LEFT JOIN h_ccp_form_rows r ON r.form_record_id = fr.id AND r.tenant_id = ${tenantId}
            WHERE fr.tenant_id = ${tenantId} AND DATE(b.planned_date) = ${reportDate}
            GROUP BY fr.batch_id, fr.ccp_type, fr.status
          `);
          const ccpDetails = (ccpDetailResult as any)[0] || [];
          const ccpByBatch = new Map<number, any[]>();
          for (const c of (ccpDetails as any[])) {
            const bId = Number(c.batch_id);
            if (!ccpByBatch.has(bId)) ccpByBatch.set(bId, []);
            ccpByBatch.get(bId)!.push({
              ccpType: c.ccp_type, status: c.ccp_status,
              rowCount: Number(c.row_count || 0), passCount: Number(c.pass_count || 0), failCount: Number(c.fail_count || 0),
            });
          }

          // 4) CCP 전체 통계
          const ccpResult = await db.execute(sql`
            SELECT COUNT(fr.id) as total_ccp,
              SUM(CASE WHEN EXISTS (
                SELECT 1 FROM h_ccp_form_rows r WHERE r.form_record_id = fr.id AND r.is_deviation = 1
              ) THEN 1 ELSE 0 END) as deviation_count
            FROM h_ccp_form_records fr
            INNER JOIN h_batches b ON fr.batch_id = b.id
            WHERE fr.tenant_id = ${tenantId} AND DATE(b.planned_date) = ${reportDate}
          `);
          const ccpStatsRaw = (ccpResult as any)[0]?.[0] || { total_ccp: 0, deviation_count: 0 };
          const totalCcp = Number(ccpStatsRaw.total_ccp) || 0;
          const deviationCount = Number(ccpStatsRaw.deviation_count) || 0;

          // 5) 배치 목록 구성
          const batchList = (batches as any[]).map((b: any) => {
            const actualQty = parseFloat(b.sku_actual_kg || '0') || parseFloat(b.actual_quantity || '0') || parseFloat(b.perf_actual_quantity || '0') || 0;
            let startTime: string | null = null;
            if (b.ccp_first_time) startTime = String(b.ccp_first_time);
            else if (b.prod_start_time) startTime = String(b.prod_start_time);
            else if (b.start_time) startTime = String(b.start_time);
            let endTime: string | null = null;
            if (b.ccp_last_time) endTime = String(b.ccp_last_time);
            else if (b.end_time) endTime = String(b.end_time);
            return {
              batchId: b.id, batchCode: b.batch_code, productName: b.product_name || '미확인',
              plannedQuantity: parseFloat(b.planned_quantity || '0'),
              actualQuantity: actualQty,
              status: b.status === 'completed' || b.status === 'approved' ? 'completed' : b.status,
              startTime, endTime,
              ccpDetails: ccpByBatch.get(Number(b.id)) || [],
            };
          });
          const totalPlanned = batchList.reduce((s: number, b: any) => s + b.plannedQuantity, 0);
          const totalActual = batchList.reduce((s: number, b: any) => s + b.actualQuantity, 0);

          // 6) 실시간 summary 구성
          const summary = {
            date: reportDate, reportDate,
            production: {
              batches: batchList, totalBatches: batchList.length,
              completedBatches: batchList.filter((b: any) => b.status === 'completed').length,
              totalPlannedQty: totalPlanned, totalActualQty: totalActual,
              achievementRate: totalPlanned > 0 ? Math.round((totalActual / totalPlanned) * 100) : 0,
            },
            ccp: {
              totalRecords: totalCcp,
              normalCount: totalCcp - deviationCount,
              deviationCount,
              complianceRate: totalCcp > 0 ? ((totalCcp - deviationCount) / totalCcp * 100).toFixed(1) : '100.0',
            },
            issues: [],
            // 승인 정보 포함
            approval: {
              status: row.approval_status || null,
              requestedAt: row.requested_at ? String(row.requested_at) : null,
              reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
              approvedAt: row.approved_at ? String(row.approved_at) : null,
            },
          };

          return { id: row.id, reportDate, summary, generatedAt: row.generated_at };
        } catch (err) {
          console.error('[dailyReport.getReportById]', err);
          return null;
        }
      }),

    // 수동으로 생산일보 생성/재생성 (관리자용)
    regenerateReport: tenantRequiredProcedure
      .input(z.object({ date: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import("../../db");
        const { sql } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) throw new Error("DB 연결 실패");
        const tenantId = ctx.tenantId ?? undefined;
        const dateStr = input.date;

        // 배치 기본 정보 + SKU 생산량 + 파이프라인 상태 + 승인 시각 + CCP 기록 시각
        const batchResult = await db.execute(sql`
          SELECT b.id, b.batch_code, b.status, b.planned_quantity, b.actual_quantity,
            b.start_time, b.end_time, b.planned_date,
            COALESCE(p.product_name, p1.product_name) as product_name,
            COALESCE(p.product_code, p1.product_code) as product_code,
            COALESCE(sku.total_kg_sum, 0) as sku_actual_kg,
            COALESCE(pp.actual_quantity, 0) as perf_actual_quantity,
            ps.start_time as prod_start_time,
            ar.status as pipeline_status,
            ar.approved_at as pipeline_approved_at,
            ccp_time.ccp_first_time,
            ccp_time.ccp_last_time
          FROM h_batches b
          LEFT JOIN h_products_v2 p ON p.id = b.product_id AND p.tenant_id = ${tenantId}
          LEFT JOIN h_products p1 ON p1.id = b.product_id
          LEFT JOIN (
            SELECT batch_id, SUM(total_kg) as total_kg_sum
            FROM production_sku_output
            WHERE tenant_id = ${tenantId}
            GROUP BY batch_id
          ) sku ON sku.batch_id = b.id
          LEFT JOIN h_production_performance pp ON pp.batch_id = b.id AND pp.tenant_id = ${tenantId}
          LEFT JOIN h_production_start ps ON ps.batch_id = b.id AND ps.tenant_id = ${tenantId}
          LEFT JOIN h_approval_requests ar
            ON ar.reference_id = b.id
            AND ar.reference_type = 'batch'
            AND ar.request_type = 'batch_production'
            AND ar.tenant_id = ${tenantId}
          LEFT JOIN (
            SELECT fr2.batch_id,
              MIN(r2.measurement_time) as ccp_first_time,
              MAX(r2.measurement_time) as ccp_last_time
            FROM h_ccp_form_records fr2
            JOIN h_ccp_form_rows r2 ON r2.form_record_id = fr2.id AND r2.tenant_id = ${tenantId}
            WHERE fr2.tenant_id = ${tenantId}
              AND r2.measurement_time IS NOT NULL
            GROUP BY fr2.batch_id
          ) ccp_time ON ccp_time.batch_id = b.id
          WHERE b.tenant_id = ${tenantId}
            AND DATE(b.planned_date) = ${dateStr}
          ORDER BY b.batch_order ASC, b.created_at ASC
        `);
        const batches = Array.isArray(batchResult) && Array.isArray(batchResult[0]) ? batchResult[0] : batchResult;

        // 배치가 없으면 생성하지 않음
        if (!(batches as any[]).length) {
          return { success: true, message: `${dateStr}: 배치가 없어 생산일지를 생성하지 않았습니다.` };
        }

        // 배치별 CCP 상세 정보
        const ccpDetailResult = await db.execute(sql`
          SELECT fr.batch_id, fr.ccp_type, fr.status as ccp_status,
            COUNT(r.id) as row_count,
            SUM(CASE WHEN r.is_deviation = 0 THEN 1 ELSE 0 END) as pass_count,
            SUM(CASE WHEN r.is_deviation = 1 THEN 1 ELSE 0 END) as fail_count
          FROM h_ccp_form_records fr
          INNER JOIN h_batches b ON fr.batch_id = b.id
          LEFT JOIN h_ccp_form_rows r ON r.form_record_id = fr.id AND r.tenant_id = ${tenantId}
          WHERE fr.tenant_id = ${tenantId}
            AND DATE(b.planned_date) = ${dateStr}
          GROUP BY fr.batch_id, fr.ccp_type, fr.status
        `);
        const ccpDetails = Array.isArray(ccpDetailResult) && Array.isArray(ccpDetailResult[0]) ? ccpDetailResult[0] : ccpDetailResult;

        const ccpResult = await db.execute(sql`
          SELECT COUNT(fr.id) as total_ccp,
            SUM(CASE WHEN EXISTS (
              SELECT 1 FROM h_ccp_form_rows r WHERE r.form_record_id = fr.id AND r.is_deviation = 1
            ) THEN 1 ELSE 0 END) as deviation_count
          FROM h_ccp_form_records fr
          INNER JOIN h_batches b ON fr.batch_id = b.id
          WHERE fr.tenant_id = ${tenantId}
            AND DATE(b.planned_date) = ${dateStr}
        `);
        const ccpStatsRaw = (ccpResult as any)[0]?.[0] || { total_ccp: 0, deviation_count: 0 };
        const ccpStats = {
          total_ccp: Number(ccpStatsRaw.total_ccp) || 0,
          normal_count: (Number(ccpStatsRaw.total_ccp) || 0) - (Number(ccpStatsRaw.deviation_count) || 0),
          deviation_count: Number(ccpStatsRaw.deviation_count) || 0,
        };

        const issueResult = await db.execute(sql`
          SELECT r.id as row_id, r.is_deviation, r.deviation_note as note, r.measurement_time,
            fr.ccp_type, b.batch_code, p.product_name, fr.work_date
          FROM h_ccp_form_rows r
          INNER JOIN h_ccp_form_records fr ON r.form_record_id = fr.id
          INNER JOIN h_batches b ON fr.batch_id = b.id
          LEFT JOIN h_products_v2 p ON b.product_id = p.id AND p.tenant_id = ${tenantId}
          WHERE r.tenant_id = ${tenantId} AND r.is_deviation = 1
            AND DATE(b.planned_date) = ${dateStr}
          ORDER BY r.measurement_time ASC
        `);
        const issues = Array.isArray(issueResult) && Array.isArray(issueResult[0]) ? issueResult[0] : issueResult;

        const clResult = await db.execute(sql`
          SELECT id, status FROM h_generic_checklist_records
          WHERE form_type = 'daily_log' AND form_date = ${dateStr} AND tenant_id = ${tenantId}
          LIMIT 1
        `);
        const clRows = (clResult as any)[0] || [];
        let checklistInfo: any = null;
        if ((clRows as any[]).length > 0) {
          checklistInfo = { id: (clRows as any[])[0].id, status: (clRows as any[])[0].status };
        }

        // CCP 상세 맵 생성 (batch_id -> ccpDetails)
        const ccpByBatch = new Map<number, any[]>();
        for (const c of (ccpDetails as any[])) {
          const bId = Number(c.batch_id);
          if (!ccpByBatch.has(bId)) ccpByBatch.set(bId, []);
          ccpByBatch.get(bId)!.push({
            ccpType: c.ccp_type, status: c.ccp_status,
            rowCount: Number(c.row_count || 0), passCount: Number(c.pass_count || 0), failCount: Number(c.fail_count || 0),
          });
        }

        // 배치 파이프라인 상태 매핑
        const mapPipelineStatus = (batchStatus: string, pipelineStatus: string | null): string => {
          if (pipelineStatus === 'approved') return 'completed';
          if (pipelineStatus === 'pending_review' || pipelineStatus === 'pending_approval') return 'in_progress';
          if (pipelineStatus === 'rejected') return 'rejected';
          if (batchStatus === 'completed') return 'completed';
          if (batchStatus === 'in_progress') return 'in_progress';
          if (batchStatus === 'approved') return 'in_progress';
          return batchStatus;
        };

        const batchList = (batches as any[]).map((b: any) => {
          const actualQty = parseFloat(b.sku_actual_kg || '0') || parseFloat(b.actual_quantity || '0') || parseFloat(b.perf_actual_quantity || '0') || 0;
          let startTime: string | null = null;
          if (b.ccp_first_time) { startTime = dateStr + ' ' + String(b.ccp_first_time); }
          else if (b.start_time) { startTime = String(b.start_time); }
          else if (b.prod_start_time) { startTime = String(b.prod_start_time); }
          let endTime: string | null = null;
          if (b.ccp_last_time) { endTime = dateStr + ' ' + String(b.ccp_last_time); }
          else if (b.end_time) { endTime = String(b.end_time); }
          else if (b.pipeline_approved_at) { endTime = String(b.pipeline_approved_at); }
          const status = mapPipelineStatus(b.status, b.pipeline_status);
          return {
            batchId: b.id, batchCode: b.batch_code, productName: b.product_name || '미확인',
            productCode: b.product_code || '', plannedQuantity: parseFloat(b.planned_quantity || '0'),
            actualQuantity: actualQty, status, pipelineStatus: b.pipeline_status || null,
            startTime, endTime,
            ccpDetails: ccpByBatch.get(Number(b.id)) || [],
          };
        });
        const totalPlanned = batchList.reduce((s: number, b: any) => s + b.plannedQuantity, 0);
        const totalActual = batchList.reduce((s: number, b: any) => s + b.actualQuantity, 0);

        const reportSummary = {
          date: dateStr, tenantId, autoGenerated: false, generatedAt: new Date().toISOString(),
          production: {
            batches: batchList, totalBatches: batchList.length,
            completedBatches: batchList.filter((b: any) => b.status === 'completed').length,
            activeBatches: batchList.filter((b: any) => b.status === 'in_progress').length,
            totalPlannedQty: totalPlanned, totalActualQty: totalActual,
            achievementRate: totalPlanned > 0 ? Math.round((totalActual / totalPlanned) * 100) : 0,
          },
          ccp: {
            totalRecords: Number(ccpStats.total_ccp) || 0,
            normalCount: ccpStats.normal_count,
            deviationCount: ccpStats.deviation_count,
            complianceRate: ccpStats.total_ccp > 0
              ? ((ccpStats.total_ccp - ccpStats.deviation_count) / ccpStats.total_ccp * 100).toFixed(1)
              : '100.0',
          },
          issues: (issues as any[]).map((i: any) => ({
            rowId: i.row_id, batchCode: i.batch_code, productName: i.product_name,
            ccpType: i.ccp_type, result: i.is_deviation ? 'FAIL' : 'PASS', note: i.note,
            measuredAt: i.measurement_time ? dateStr + ' ' + String(i.measurement_time) : null,
          })),
          checklist: checklistInfo,
        };

        const existing = await db.execute(sql`
          SELECT id FROM h_daily_reports
          WHERE tenant_id = ${tenantId} AND report_date = ${dateStr} AND report_type = 'production_daily'
          LIMIT 1
        `);
        const existRows = (existing as any)[0] || [];
        if ((existRows as any[]).length > 0) {
          await db.execute(sql`
            UPDATE h_daily_reports SET summary = ${JSON.stringify(reportSummary)}, generated_at = NOW()
            WHERE id = ${(existRows as any[])[0].id}
          `);
        } else {
          await db.execute(sql`
            INSERT INTO h_daily_reports (site_id, report_date, report_type, summary, generated_at, tenant_id)
            VALUES (0, ${dateStr}, 'production_daily', ${JSON.stringify(reportSummary)}, NOW(), ${tenantId})
          `);
        }

        return { success: true, message: dateStr + ' 생산일보 생성 완료 (배치 ' + batchList.length + '건)' };
      }),

    // 월별 생산일보 리스트 조회
    listReports: tenantRequiredProcedure
      .input(z.object({ year: z.number(), month: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getDb } = await import("../../db");
        const { sql } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) return [];
        try {
          const startDate = `${input.year}-${String(input.month).padStart(2, '0')}-01`;
          const endMonth = input.month === 12 ? 1 : input.month + 1;
          const endYear = input.month === 12 ? input.year + 1 : input.year;
          const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;
          // 승인 설정 조회 (설정된 작성/검토/승인 담당자)
          const settingResult = await db.execute(sql`
            SELECT das.author_employee_id, das.reviewer_employee_id, das.approver_employee_id,
              e_a.name as cfg_author_name, e_r.name as cfg_reviewer_name, e_p.name as cfg_approver_name
            FROM h_document_approval_settings das
            LEFT JOIN h_employees e_a ON e_a.id = das.author_employee_id AND e_a.tenant_id = ${ctx.tenantId}
            LEFT JOIN h_employees e_r ON e_r.id = das.reviewer_employee_id AND e_r.tenant_id = ${ctx.tenantId}
            LEFT JOIN h_employees e_p ON e_p.id = das.approver_employee_id AND e_p.tenant_id = ${ctx.tenantId}
            WHERE das.tenant_id = ${ctx.tenantId}
              AND das.document_type IN ('production_daily', 'batch_production')
              AND das.is_active = 1
            ORDER BY FIELD(das.document_type, 'production_daily', 'batch_production')
            LIMIT 1
          `);
          const cfgRows = (settingResult as any)[0] || [];
          const cfg = (cfgRows as any[])[0] || {};

          // 기존 생산일보 조회
          const result = await db.execute(sql`
            SELECT dr.id, dr.report_date, dr.summary, dr.generated_at,
              ar.id as approval_id, ar.status as approval_status,
              ar.requested_at, ar.approved_at, ar.approved_by,
              u_req.name as requester_name, u_app.name as approver_name,
              u_rev.name as reviewer_name, ar.reviewed_at,
              ar.requested_by
            FROM h_daily_reports dr
            LEFT JOIN h_approval_requests ar
              ON ar.reference_type = 'daily_report'
              AND ar.reference_id = dr.id
              AND ar.request_type = 'production_daily'
              AND ar.tenant_id = ${ctx.tenantId}
            LEFT JOIN users u_req ON u_req.id = ar.requested_by
            LEFT JOIN users u_app ON u_app.id = ar.approved_by
            LEFT JOIN users u_rev ON u_rev.id = ar.reviewed_by
            WHERE dr.tenant_id = ${ctx.tenantId}
              AND dr.report_type = 'production_daily'
              AND dr.report_date >= ${startDate}
              AND dr.report_date < ${endDate}
            ORDER BY dr.report_date DESC
          `);
          const rows = (result as any)[0] || [];

          // 배치가 있지만 일보가 없는 날짜 조회
          const batchDatesResult = await db.execute(sql`
            SELECT DATE(b.planned_date) as batch_date,
              COUNT(*) as batch_count,
              SUM(COALESCE(b.actual_quantity, b.planned_quantity)) as total_qty,
              SUM(CASE WHEN b.status = 'completed' THEN 1 ELSE 0 END) as completed_count
            FROM h_batches b
            WHERE b.tenant_id = ${ctx.tenantId}
              AND b.planned_date >= ${startDate}
              AND b.planned_date < ${endDate}
            GROUP BY DATE(b.planned_date)
            ORDER BY batch_date DESC
          `);
          const batchDates = (batchDatesResult as any)[0] || [];

          // 날짜별 생산 품목명 조회
          const productNamesResult = await db.execute(sql`
            SELECT DATE(b.planned_date) as batch_date, p.product_name
            FROM h_batches b
            LEFT JOIN h_products_v2 p ON p.id = b.product_id AND p.tenant_id = b.tenant_id
            WHERE b.tenant_id = ${ctx.tenantId}
              AND b.planned_date >= ${startDate}
              AND b.planned_date < ${endDate}
            ORDER BY b.planned_date DESC, b.id
          `);
          const productNamesRows = (productNamesResult as any)[0] || [];
          const productsByDate: Record<string, string[]> = {};
          for (const pn of (productNamesRows as any[])) {
            const dateStr = pn.batch_date instanceof Date
              ? pn.batch_date.toISOString().split('T')[0]
              : String(pn.batch_date || '');
            if (!dateStr) continue;
            if (!productsByDate[dateStr]) productsByDate[dateStr] = [];
            const name = pn.product_name || '';
            if (name && !productsByDate[dateStr].includes(name)) {
              productsByDate[dateStr].push(name);
            }
          }

          // 기존 일보 날짜 Set
          const existingDates = new Set(
            (rows as any[]).map((r: any) => {
              const d = r.report_date instanceof Date ? r.report_date.toISOString().split('T')[0] : String(r.report_date);
              return d;
            })
          );

          const mapped = (rows as any[]).map((row: any) => {
            let summary: any = {};
            try { summary = typeof row.summary === 'string' ? JSON.parse(row.summary) : (row.summary || {}); } catch {}
            const reportDate = row.report_date instanceof Date ? row.report_date.toISOString().split('T')[0] : String(row.report_date);
            return {
              id: row.id,
              reportDate,
              generatedAt: row.generated_at,
              totalBatches: summary?.production?.totalBatches || 0,
              completedBatches: summary?.production?.completedBatches || 0,
              totalPlannedQty: summary?.production?.totalPlannedQty || 0,
              totalActualQty: summary?.production?.totalActualQty || 0,
              achievementRate: summary?.production?.achievementRate || 0,
              ccpTotal: summary?.ccp?.totalRecords || 0,
              ccpDeviation: summary?.ccp?.deviationCount || 0,
              issueCount: summary?.issues?.length || 0,
              approvalId: row.approval_id || null,
              approvalStatus: row.approval_status || null,
              requesterName: cfg.cfg_author_name || row.requester_name || null,
              approverName: cfg.cfg_approver_name || row.approver_name || null,
              reviewerName: cfg.cfg_reviewer_name || row.reviewer_name || null,
              approvedAt: row.approved_at || null,
              reviewedAt: row.reviewed_at || null,
              requestedAt: row.requested_at || null,
              needsGeneration: false,
              productNames: productsByDate[reportDate] || [],
            };
          });

          // 일보 미생성 날짜를 placeholder로 추가
          for (const bd of (batchDates as any[])) {
            const dateStr = bd.batch_date instanceof Date
              ? bd.batch_date.toISOString().split('T')[0]
              : String(bd.batch_date);
            if (!existingDates.has(dateStr)) {
              mapped.push({
                id: 0,
                reportDate: dateStr,
                generatedAt: null,
                totalBatches: Number(bd.batch_count) || 0,
                completedBatches: Number(bd.completed_count) || 0,
                totalPlannedQty: Number(bd.total_qty) || 0,
                totalActualQty: Number(bd.total_qty) || 0,
                achievementRate: 0,
                ccpTotal: 0,
                ccpDeviation: 0,
                issueCount: 0,
                approvalId: null,
                approvalStatus: null,
                requesterName: null,
                approverName: null,
                reviewerName: null,
                approvedAt: null,
                reviewedAt: null,
                requestedAt: null,
                needsGeneration: true,
                productNames: productsByDate[dateStr] || [],
              });
            }
          }

          // 날짜 내림차순 정렬
          mapped.sort((a: any, b: any) => b.reportDate.localeCompare(a.reportDate));
          return mapped;
        } catch (err) {
          console.error('[dailyReport.listReports]', err);
          return [];
        }
      }),

    // 생산일보 승인 요청 (승인함으로 보내기)
    submitForApproval: tenantRequiredProcedure
      .input(z.object({ reportId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { getDb, getRawConnection } = await import("../../db");
        const { sql } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) throw new Error("DB 연결 실패");
        const tenantId = ctx.tenantId ?? undefined;
        const rptResult = await db.execute(sql`
          SELECT id, report_date, summary FROM h_daily_reports
          WHERE id = ${input.reportId} AND tenant_id = ${tenantId} AND report_type = 'production_daily'
          LIMIT 1
        `);
        const rptRows = (rptResult as any)[0] || [];
        if (!(rptRows as any[]).length) throw new Error("생산일보를 찾을 수 없습니다.");
        const rpt = (rptRows as any[])[0];
        let summary: any = {};
        try { summary = typeof rpt.summary === 'string' ? JSON.parse(rpt.summary) : rpt.summary; } catch {}
        const dateStr = rpt.report_date instanceof Date ? rpt.report_date.toISOString().split('T')[0] : String(rpt.report_date);
        const batchCount = summary?.production?.totalBatches || 0;

        // 승인 설정 조회 (production_daily 우선, batch_production fallback)
        // 승인 설정에서 h_employees의 user_id로 매핑
        const settingResult = await db.execute(sql`
          SELECT das.author_employee_id, das.reviewer_employee_id, das.approver_employee_id,
            e_a.user_id as author_user_id, e_r.user_id as reviewer_user_id, e_p.user_id as approver_user_id
          FROM h_document_approval_settings das
          LEFT JOIN h_employees e_a ON e_a.id = das.author_employee_id AND e_a.tenant_id = ${tenantId}
          LEFT JOIN h_employees e_r ON e_r.id = das.reviewer_employee_id AND e_r.tenant_id = ${tenantId}
          LEFT JOIN h_employees e_p ON e_p.id = das.approver_employee_id AND e_p.tenant_id = ${tenantId}
          WHERE das.tenant_id = ${tenantId}
            AND das.document_type IN ('production_daily', 'batch_production')
            AND is_active = 1
          ORDER BY FIELD(das.document_type, 'production_daily', 'batch_production')
          LIMIT 1
        `);
        const settingRows = (settingResult as any)[0] || [];
        const setting = (settingRows as any[])[0] || null;
        const authorId = setting?.author_user_id || ctx.user.id;

        // 기존 승인 요청 확인
        const existResult = await db.execute(sql`
          SELECT id FROM h_approval_requests
          WHERE reference_type = 'daily_report' AND reference_id = ${input.reportId}
            AND request_type = 'production_daily' AND tenant_id = ${tenantId}
          LIMIT 1
        `);
        const existRows = (existResult as any)[0] || [];
        if ((existRows as any[]).length > 0) {
          await db.execute(sql`
            UPDATE h_approval_requests
            SET status = 'pending_review',
                requested_by = ${authorId},
                requested_at = NOW(),
                reviewed_by = NULL, reviewed_at = NULL,
                approved_by = NULL, approved_at = NULL
            WHERE id = ${(existRows as any[])[0].id}
          `);
          return { success: true, message: `${dateStr} 생산일지 승인 재요청 완료` };
        }
        const pool = await getRawConnection();
        await pool.execute(
          `INSERT INTO h_approval_requests
            (site_id, tenant_id, request_type, reference_type, reference_id,
             title, description, status, priority, requested_by)
           VALUES (?, ?, 'production_daily', 'daily_report', ?, ?, ?, 'pending_review', 'medium', ?)`,
          [
            ctx.user.siteId || ctx.tenantId, tenantId, input.reportId,
            `생산일지 - ${dateStr}`,
            `${dateStr} 생산일지\n배치: ${batchCount}건\nCCP: ${summary?.ccp?.totalRecords || 0}건`,
            authorId,
          ]
        );
        return { success: true, message: `${dateStr} 생산일지 승인 요청 완료 (배치 ${batchCount}건)` };
      }),

    // 생산일보 일괄 삭제
    deleteReports: tenantRequiredProcedure
      .input(z.object({ ids: z.array(z.number()) }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import("../../db");
        const { sql } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) throw new Error("DB 연결 실패");
        const tenantId = ctx.tenantId ?? undefined;
        let deleted = 0;
        for (const id of input.ids) {
          await db.execute(sql`
            DELETE FROM h_approval_requests
            WHERE reference_type = 'daily_report' AND reference_id = ${id}
              AND request_type = 'production_daily' AND tenant_id = ${tenantId}
          `);
          await db.execute(sql`
            DELETE FROM h_daily_reports
            WHERE id = ${id} AND tenant_id = ${tenantId} AND report_type = 'production_daily'
          `);
          deleted++;
        }
        return { success: true, message: `${deleted}건 삭제 완료` };
      }),
});

/**
 * 일일일지 (Daily Log) 라우터
 * - h_generic_checklist_records (form_type='daily_log') 기반
 * - 이전 데이터 pre-fill (getPreviousFormData)
 * - 전체 양식 저장 (saveFullForm)  
 * - 승인관리에서 데이터 수정 (updateFormData)
 * - 목록/상세 조회
 */

import { router, tenantRequiredProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "../db";
import { sql } from "drizzle-orm";

export const dailyLogRouter = router({
  // ── 이전 작성 데이터 조회 (pre-fill용) ──
  getPreviousFormData: tenantRequiredProcedure
    .input(z.object({ beforeDate: z.string() }))
    .query(async ({ input, ctx }) => {
      try {
        const db = await getDb();
        if (!db) return null;
        const result = await db.execute(sql`
          SELECT id, form_date, form_data FROM h_generic_checklist_records
          WHERE form_type = 'daily_log'
            AND tenant_id = ${ctx.tenantId}
            AND form_date < ${input.beforeDate}
            AND form_data IS NOT NULL
          ORDER BY form_date DESC
          LIMIT 1
        `);
        const rows = (result as any)[0] || [];
        if (rows.length === 0) return null;
        const row = rows[0];
        let fd: any = {};
        try {
          fd = typeof row.form_data === 'string' ? JSON.parse(row.form_data) : (row.form_data || {});
        } catch { return null; }
        return {
          sourceDate: row.form_date instanceof Date
            ? row.form_date.toISOString().split('T')[0]
            : String(row.form_date),
          formData: fd,
        };
      } catch (e) {
        console.error('[dailyLog.getPreviousFormData]', e);
        return null;
      }
    }),

  // ── 해당 날짜 일일일지 조회 (편집용) ──
  getByDate: tenantRequiredProcedure
    .input(z.object({ logDate: z.string(), siteId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      try {
        const db = await getDb();
        if (!db) return null;
        const result = await db.execute(sql`
          SELECT id, site_id, form_date, title, status, form_data, created_at, updated_at
          FROM h_generic_checklist_records
          WHERE form_type = 'daily_log'
            AND form_date = ${input.logDate}
            AND tenant_id = ${ctx.tenantId}
          ORDER BY created_at DESC LIMIT 1
        `);
        const rows = (result as any)[0] || [];
        if (rows.length === 0) return null;
        const r = rows[0];
        let fd: any = {};
        try {
          fd = typeof r.form_data === 'string' ? JSON.parse(r.form_data) : (r.form_data || {});
        } catch {}
        return {
          id: r.id,
          siteId: r.site_id,
          logDate: r.form_date instanceof Date ? r.form_date.toISOString().split('T')[0] : String(r.form_date),
          title: r.title,
          status: r.status,
          formData: fd,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        };
      } catch (e) {
        console.error('[dailyLog.getByDate]', e);
        return null;
      }
    }),

  // ── 일일일지 저장 (전체 양식 = 위생점검 + 온도 + 이물관리 + 배치) ──
  saveFullForm: tenantRequiredProcedure
    .input(z.object({
      logDate: z.string(),
      formData: z.any(),
      siteId: z.number().optional(),
      status: z.enum(['draft', 'submitted']).default('draft'),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("DB 연결 실패");
        const tenantId = ctx.tenantId ?? undefined;
        const siteId = input.siteId || ctx.user.siteId || ctx.tenantId || 1;

        // 기존 레코드 확인
        const existing = await db.execute(sql`
          SELECT id, form_data FROM h_generic_checklist_records
          WHERE form_type = 'daily_log'
            AND form_date = ${input.logDate}
            AND tenant_id = ${tenantId}
          LIMIT 1
        `);
        const existingRows = (existing as any)[0] || [];

        let recordId: number;
        const title = `일일일지 - ${input.logDate}`;

        if (existingRows.length > 0) {
          // 기존 레코드 업데이트 (배치 데이터 보존, 위생 데이터 덮어씀)
          recordId = existingRows[0].id;
          let oldFd: any = {};
          try {
            oldFd = typeof existingRows[0].form_data === 'string'
              ? JSON.parse(existingRows[0].form_data) : (existingRows[0].form_data || {});
          } catch {}
          const merged = { ...oldFd, ...input.formData };
          // 배치 데이터 보존
          if (oldFd.batches && !input.formData.batches) {
            merged.batches = oldFd.batches;
            merged.totalBatches = oldFd.totalBatches;
            merged.totalPlannedQty = oldFd.totalPlannedQty;
            merged.totalProduction = oldFd.totalProduction;
          }
          merged.lastUpdated = new Date().toISOString();

          await db.execute(sql`
            UPDATE h_generic_checklist_records
            SET form_data = ${JSON.stringify(merged)},
                status = ${input.status},
                title = ${title},
                updated_at = NOW()
            WHERE id = ${recordId}
          `);
        } else {
          // 신규 생성
          const seqR = await db.execute(sql`
            SELECT COALESCE(MAX(tenant_seq), 0) + 1 as ns
            FROM h_generic_checklist_records
            WHERE form_type = 'daily_log' AND tenant_id = ${tenantId} AND YEAR(created_at) = YEAR(NOW())
          `);
          const nextSeq = Number((seqR as any)[0]?.[0]?.ns || 1);
          const formDataStr = JSON.stringify({ ...input.formData, date: input.logDate });

          const ins = await db.execute(sql`
            INSERT INTO h_generic_checklist_records
              (site_id, tenant_id, form_type, tenant_seq, form_date, title, form_data, status, created_by)
            VALUES
              (${siteId}, ${tenantId}, 'daily_log', ${nextSeq}, ${input.logDate}, ${title},
               ${formDataStr}, ${input.status}, ${ctx.user.id})
          `);
          recordId = Number((ins as any)[0]?.insertId || 0);
        }

        // submitted이면 승인요청 생성/업데이트
        if (input.status === 'submitted') {
          const existApproval = await db.execute(sql`
            SELECT id FROM h_approval_requests
            WHERE reference_type = 'checklist' AND reference_id = ${recordId} AND request_type = 'daily_log'
            LIMIT 1
          `);
          const approvalRows = (existApproval as any)[0] || [];
          if (approvalRows.length === 0) {
            await db.execute(sql`
              INSERT INTO h_approval_requests
                (site_id, tenant_id, request_type, reference_type, reference_id,
                 title, description, status, priority, requested_by, created_at)
              VALUES
                (${siteId}, ${tenantId}, 'daily_log', 'checklist', ${recordId},
                 ${`[일일일지] ${input.logDate} 일반위생관리 및 공정점검표`},
                 ${'위생점검 완료 - 승인 요청합니다.'}, 'pending_review', 'medium', ${ctx.user.id}, NOW())
            `);
          } else {
            await db.execute(sql`
              UPDATE h_approval_requests SET status = 'pending_review', updated_at = NOW()
              WHERE id = ${approvalRows[0].id}
            `);
          }
        }

        return { success: true, id: recordId, status: input.status };
      } catch (error) {
        console.error('[dailyLog.saveFullForm]', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : '저장 실패',
        });
      }
    }),

  // ── 승인관리에서 데이터 수정 (온도 등 수정 후 승인) ──
  updateFormData: tenantRequiredProcedure
    .input(z.object({ id: z.number(), formData: z.any() }))
    .mutation(async ({ input, ctx }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("DB 연결 실패");
        // 기존 데이터와 병합 (배치 보존)
        const existing = await db.execute(sql`
          SELECT form_data FROM h_generic_checklist_records
          WHERE id = ${input.id} AND tenant_id = ${ctx.tenantId}
        `);
        const oldRows = (existing as any)[0] || [];
        let oldFd: any = {};
        if (oldRows.length > 0) {
          try { oldFd = typeof oldRows[0].form_data === 'string' ? JSON.parse(oldRows[0].form_data) : oldRows[0].form_data; } catch {}
        }
        const merged = { ...oldFd, ...input.formData, lastUpdated: new Date().toISOString() };
        // 배치 보존
        if (oldFd.batches && !input.formData.batches) {
          merged.batches = oldFd.batches;
          merged.totalBatches = oldFd.totalBatches;
          merged.totalPlannedQty = oldFd.totalPlannedQty;
        }
        await db.execute(sql`
          UPDATE h_generic_checklist_records
          SET form_data = ${JSON.stringify(merged)}, updated_at = NOW()
          WHERE id = ${input.id} AND tenant_id = ${ctx.tenantId}
        `);
        return { success: true };
      } catch (error) {
        console.error('[dailyLog.updateFormData]', error);
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '수정 실패' });
      }
    }),

  // ── 일일일지 목록 조회 ──
  list: tenantRequiredProcedure
    .input(z.object({
      siteId: z.number().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      status: z.string().optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }).optional())
    .query(async ({ input = { limit: 50, offset: 0 }, ctx }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("DB 연결 실패");

        // 문서결재설정에서 작성자 employee 조회
        let authorEmployeeName: string | null = null;
        try {
          const settingResult = await db.execute(sql`
            SELECT e.name AS author_name
            FROM h_document_approval_settings das
            JOIN h_employees e ON e.id = das.author_employee_id AND e.tenant_id = das.tenant_id
            WHERE das.document_type = 'daily_log' AND das.tenant_id = ${ctx.tenantId} AND das.is_active = 1
            LIMIT 1
          `);
          const settingRows = (settingResult as any)[0] || [];
          if (settingRows.length > 0) {
            authorEmployeeName = settingRows[0].author_name || null;
          }
        } catch {}

        const result = await db.execute(sql`
          SELECT
            r.id, r.site_id, r.form_date AS log_date, r.title, r.status, r.form_data,
            r.created_at, r.updated_at, r.created_by,
            u.name AS creator_name,
            ar.id AS approval_request_id, ar.status AS approval_status
          FROM h_generic_checklist_records r
          LEFT JOIN users u ON r.created_by = u.id AND u.tenant_id = ${ctx.tenantId}
          LEFT JOIN h_approval_requests ar ON (
            ar.reference_type = 'checklist' AND ar.reference_id = r.id AND ar.request_type = 'daily_log'
          )
          WHERE r.form_type = 'daily_log'
          AND r.tenant_id = ${ctx.tenantId}
          ${input?.siteId ? sql`AND r.site_id = ${input.siteId}` : sql``}
          ${input?.startDate ? sql`AND r.form_date >= ${input.startDate}` : sql``}
          ${input?.endDate ? sql`AND r.form_date <= ${input.endDate}` : sql``}
          ${input?.status ? sql`AND r.status = ${input.status}` : sql``}
          ORDER BY r.form_date DESC, r.created_at DESC
          LIMIT ${input?.limit ?? 50} OFFSET ${input?.offset ?? 0}
        `);
        const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : ((result as any).rows || result);

        // 해당 기간의 생산 품목 조회 (날짜별 제품명)
        let productsByDate: Record<string, string[]> = {};
        try {
          const startD = input?.startDate || '';
          const endD = input?.endDate || '';
          if (startD && endD) {
            const batchResult = await db.execute(sql`
              SELECT DATE(b.planned_date) as batch_date, p.product_name
              FROM h_batches b
              LEFT JOIN h_products_v2 p ON p.id = b.product_id AND p.tenant_id = b.tenant_id
              WHERE b.tenant_id = ${ctx.tenantId}
                AND b.planned_date >= ${startD}
                AND b.planned_date <= ${endD}
              ORDER BY b.planned_date DESC, b.id
            `);
            const batchRows = (batchResult as any)[0] || [];
            for (const br of (batchRows as any[])) {
              const dateStr = br.batch_date instanceof Date
                ? br.batch_date.toISOString().split('T')[0]
                : String(br.batch_date || '');
              if (!dateStr) continue;
              if (!productsByDate[dateStr]) productsByDate[dateStr] = [];
              const pName = br.product_name || '';
              if (pName && !productsByDate[dateStr].includes(pName)) {
                productsByDate[dateStr].push(pName);
              }
            }
          }
        } catch {}

        return (rows as any[]).map((r: any) => {
          let formData: any = {};
          try { formData = typeof r.form_data === 'string' ? JSON.parse(r.form_data) : (r.form_data || {}); } catch {}
          const hc = formData.hygieneChecks || {};
          const hasHygieneData = typeof hc === 'object' && Object.values(hc).some((v: any) => v !== null && v !== undefined);
          // 위생점검 항목수 카운트
          const hygieneTotal = typeof hc === 'object' ? Object.keys(hc).length : 0;
          const hygieneChecked = typeof hc === 'object' ? Object.values(hc).filter((v: any) => v === '적합' || v === 'Y' || v === true).length : 0;
          // 이물관리 항목수 카운트
          const fc = formData.foreignMaterialChecks || {};
          const foreignTotal = typeof fc === 'object' ? Object.keys(fc).length : 0;
          const foreignChecked = typeof fc === 'object' ? Object.values(fc).filter((v: any) => v === '적합' || v === 'Y' || v === true).length : 0;
          // 온도 기록 여부
          const hasTemp = !!(formData.roomTemperatures || formData.freezerTemperatures || formData.fridgeTemperatures);

          // 작성자: 문서결재설정 작성자 우선, 없으면 같은 테넌트의 users.name
          const displayAuthor = authorEmployeeName || r.creator_name || "-";
          const logDate = r.log_date instanceof Date ? r.log_date.toISOString().split('T')[0] : String(r.log_date || '');
          return {
            id: r.id, siteId: r.site_id,
            log_date: logDate,
            title: r.title, status: r.status, creator_name: displayAuthor,
            approval_request_id: r.approval_request_id, approval_status: r.approval_status,
            hasHygieneData,
            hygieneTotal, hygieneChecked,
            foreignTotal, foreignChecked,
            hasTemp,
            productNames: productsByDate[logDate] || [],
            createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at || ''),
            updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at || ''),
          };
        });
      } catch (error) {
        console.error('[dailyLog.list]', error);
        return [];
      }
    }),

  // ── 일일일지 삭제 ──
  delete: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("DB 연결 실패");
        // 승인완료된 건은 삭제 불가
        const checkResult = await db.execute(sql`
          SELECT status FROM h_generic_checklist_records
          WHERE id = ${input.id} AND tenant_id = ${ctx.tenantId} AND form_type = 'daily_log'
        `);
        const checkRows = (checkResult as any)[0] || [];
        if (checkRows.length === 0) throw new TRPCError({ code: 'NOT_FOUND', message: '일일일지를 찾을 수 없습니다' });
        if (checkRows[0].status === 'approved') throw new TRPCError({ code: 'FORBIDDEN', message: '승인완료된 일지는 삭제할 수 없습니다' });
        // 관련 승인요청 삭제
        await db.execute(sql`
          DELETE FROM h_approval_requests
          WHERE reference_type = 'checklist' AND reference_id = ${input.id}
            AND request_type = 'daily_log' AND tenant_id = ${ctx.tenantId}
        `);
        // 일일일지 삭제
        await db.execute(sql`
          DELETE FROM h_generic_checklist_records
          WHERE id = ${input.id} AND tenant_id = ${ctx.tenantId} AND form_type = 'daily_log'
        `);
        return { success: true, message: '일일일지가 삭제되었습니다' };
      } catch (error: any) {
        if (error.code === 'NOT_FOUND' || error.code === 'FORBIDDEN') throw error;
        console.error('[dailyLog.delete]', error);
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '삭제 실패' });
      }
    }),
});

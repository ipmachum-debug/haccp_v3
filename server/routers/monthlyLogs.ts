/**
 * 월간일지 (Monthly Log) 라우터
 * - h_generic_checklist_records (form_type='monthly_log') 기반
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

import { formatLocalDate } from "../utils/timezone";

export const monthlyLogsRouter = router({
  // ── 이전 작성 데이터 조회 (pre-fill용) ──
  getPreviousFormData: tenantRequiredProcedure
    .input(z.object({ beforeDate: z.string() }))
    .query(async ({ input, ctx }) => {
      try {
        const db = await getDb();
        if (!db) return null;
        const result = await db.execute(sql`
          SELECT id, form_date, form_data FROM h_generic_checklist_records
          WHERE form_type = 'monthly_log'
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
            ? formatLocalDate(row.form_date)
            : String(row.form_date),
          formData: fd,
        };
      } catch (e) {
        console.error('[monthlyLog.getPreviousFormData]', e);
        return null;
      }
    }),

  // ── 해당 날짜 월간일지 조회 (편집용) ──
  getByDate: tenantRequiredProcedure
    .input(z.object({ logDate: z.string(), siteId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      try {
        const db = await getDb();
        if (!db) return null;
        const result = await db.execute(sql`
          SELECT id, site_id, form_date, title, status, form_data, created_at, updated_at
          FROM h_generic_checklist_records
          WHERE form_type = 'monthly_log'
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
          logDate: r.form_date instanceof Date ? formatLocalDate(r.form_date) : String(r.form_date),
          title: r.title,
          status: r.status,
          formData: fd,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        };
      } catch (e) {
        console.error('[monthlyLog.getByDate]', e);
        return null;
      }
    }),

  // ── 월간일지 저장 (전체 양식) ──
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

        const existing = await db.execute(sql`
          SELECT id, form_data FROM h_generic_checklist_records
          WHERE form_type = 'monthly_log'
            AND form_date = ${input.logDate}
            AND tenant_id = ${tenantId}
          LIMIT 1
        `);
        const existingRows = (existing as any)[0] || [];

        let recordId: number;
        const title = `월간일지 - ${input.logDate}`;

        if (existingRows.length > 0) {
          recordId = existingRows[0].id;
          let oldFd: any = {};
          try {
            oldFd = typeof existingRows[0].form_data === 'string'
              ? JSON.parse(existingRows[0].form_data) : (existingRows[0].form_data || {});
          } catch {}
          const merged = { ...oldFd, ...input.formData, lastUpdated: new Date().toISOString() };

          await db.execute(sql`
            UPDATE h_generic_checklist_records
            SET form_data = ${JSON.stringify(merged)},
                status = ${input.status},
                title = ${title},
                updated_at = NOW()
            WHERE id = ${recordId}
          `);
        } else {
          const seqR = await db.execute(sql`
            SELECT COALESCE(MAX(tenant_seq), 0) + 1 as ns
            FROM h_generic_checklist_records
            WHERE form_type = 'monthly_log' AND tenant_id = ${tenantId} AND YEAR(created_at) = YEAR(NOW())
          `);
          const nextSeq = Number((seqR as any)[0]?.[0]?.ns || 1);
          const formDataStr = JSON.stringify({ ...input.formData, date: input.logDate });

          const ins = await db.execute(sql`
            INSERT INTO h_generic_checklist_records
              (site_id, tenant_id, form_type, tenant_seq, form_date, title, form_data, status, created_by)
            VALUES
              (${siteId}, ${tenantId}, 'monthly_log', ${nextSeq}, ${input.logDate}, ${title},
               ${formDataStr}, ${input.status}, ${ctx.user.id})
          `);
          recordId = Number((ins as any)[0]?.insertId || 0);
        }

        // submitted이면 승인요청 생성/업데이트
        if (input.status === 'submitted') {
          const existApproval = await db.execute(sql`
            SELECT id FROM h_approval_requests
            WHERE reference_type = 'checklist' AND reference_id = ${recordId} AND request_type = 'monthly_log'
            LIMIT 1
          `);
          const approvalRows = (existApproval as any)[0] || [];
          if (approvalRows.length === 0) {
            await db.execute(sql`
              INSERT INTO h_approval_requests
                (site_id, tenant_id, request_type, reference_type, reference_id,
                 title, description, status, priority, requested_by, created_at)
              VALUES
                (${siteId}, ${tenantId}, 'monthly_log', 'checklist', ${recordId},
                 ${`[월간일지] ${input.logDate} 일반위생관리 및 CCP 검증점검표`},
                 ${'월간 위생점검/CCP검증 완료 - 승인 요청합니다.'}, 'pending_review', 'medium', ${ctx.user.id}, NOW())
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
        console.error('[monthlyLog.saveFullForm]', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : '저장 실패',
        });
      }
    }),

  // ── 승인관리에서 데이터 수정 ──
  updateFormData: tenantRequiredProcedure
    .input(z.object({ id: z.number(), formData: z.any() }))
    .mutation(async ({ input, ctx }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("DB 연결 실패");
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
        await db.execute(sql`
          UPDATE h_generic_checklist_records
          SET form_data = ${JSON.stringify(merged)}, updated_at = NOW()
          WHERE id = ${input.id} AND tenant_id = ${ctx.tenantId}
        `);
        return { success: true };
      } catch (error) {
        console.error('[monthlyLog.updateFormData]', error);
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '수정 실패' });
      }
    }),

  // ── 월간일지 목록 조회 ──
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
        const result = await db.execute(sql`
          SELECT
            r.id, r.site_id, r.form_date AS log_date, r.title, r.status, r.form_data,
            r.created_at, r.updated_at,
            u.name AS creator_name,
            ar.id AS approval_request_id, ar.status AS approval_status
          FROM h_generic_checklist_records r
          LEFT JOIN users u ON r.created_by = u.id
          LEFT JOIN h_approval_requests ar ON (
            ar.reference_type = 'checklist' AND ar.reference_id = r.id AND ar.request_type = 'monthly_log'
          )
          WHERE r.form_type = 'monthly_log'
          AND r.tenant_id = ${ctx.tenantId}
          ${input?.siteId ? sql`AND r.site_id = ${input.siteId}` : sql``}
          ${input?.startDate ? sql`AND r.form_date >= ${input.startDate}` : sql``}
          ${input?.endDate ? sql`AND r.form_date <= ${input.endDate}` : sql``}
          ${input?.status ? sql`AND r.status = ${input.status}` : sql``}
          ORDER BY r.form_date DESC, r.created_at DESC
          LIMIT ${input?.limit ?? 50} OFFSET ${input?.offset ?? 0}
        `);
        const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : ((result as any).rows || result);
        return (rows as any[]).map((r: any) => {
          let formData: any = {};
          try { formData = typeof r.form_data === 'string' ? JSON.parse(r.form_data) : (r.form_data || {}); } catch {}
          return {
            id: r.id, siteId: r.site_id,
            log_date: r.log_date instanceof Date ? formatLocalDate(r.log_date) : String(r.log_date || ''),
            title: r.title, status: r.status, creator_name: r.creator_name,
            approval_request_id: r.approval_request_id, approval_status: r.approval_status,
            formData,
            createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at || ''),
            updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at || ''),
          };
        });
      } catch (error) {
        console.error('[monthlyLog.list]', error);
        return [];
      }
    }),

  // ── Legacy compat stubs ──
  createHygiene: tenantRequiredProcedure.input(z.any()).mutation(async () => ({ success: true, id: 0 })),
  getHygiene: tenantRequiredProcedure.input(z.any()).query(async () => ({ logs: [] })),
  createCCP: tenantRequiredProcedure.input(z.any()).mutation(async () => ({ success: true, id: 0 })),
  getCCP: tenantRequiredProcedure.input(z.any()).query(async () => ({ logs: [] })),
  deleteCCP: tenantRequiredProcedure.input(z.any()).mutation(async () => ({ success: true })),
  approveCCP: tenantRequiredProcedure.input(z.any()).mutation(async () => ({ success: true })),
  requestCCPApproval: tenantRequiredProcedure.input(z.any()).mutation(async () => ({ success: true })),
  rejectCCP: tenantRequiredProcedure.input(z.any()).mutation(async () => ({ success: true })),
  approveHygiene: tenantRequiredProcedure.input(z.any()).mutation(async () => ({ success: true })),
  requestHygieneApproval: tenantRequiredProcedure.input(z.any()).mutation(async () => ({ success: true })),
});

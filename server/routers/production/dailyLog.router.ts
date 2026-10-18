/**
 * 일일일지 (Daily Log) 라우터
 * - h_generic_checklist_records (form_type='daily_log') 기반
 * - 이전 데이터 pre-fill (getPreviousFormData)
 * - 전체 양식 저장 (saveFullForm)  
 * - 승인관리에서 데이터 수정 (updateFormData)
 * - 목록/상세 조회
 */

import { adminProcedure, router, tenantRequiredProcedure } from "../../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "../../db";
import { sql } from "drizzle-orm";

/** 원본 템플릿을 켠 회사인가 (회사 기능 설정, 기본 꺼짐) — 조회 실패는 오류로 (꺼짐으로 보지 않음) */
async function templateEnabled(tenantId: number): Promise<boolean> {
  const { getRawConnection } = await import("../../db/connection");
  const { isTenantFeatureEnabled } = await import("../../lib/production/massBasisPolicy");
  const { KHACCP_TEMPLATE_FEATURE } = await import("../../../shared/dailyLog/khaccpTemplate");
  return isTenantFeatureEnabled(await getRawConnection(), tenantId, KHACCP_TEMPLATE_FEATURE);
}

/** 화면이 보낸 form_data 에서 서버만 정하는 칸을 뺀다 — templateCode 는 생성 때 서버가 찍고 바꾸지 않는다 */
function stripServerOwned(fd: any): any {
  if (!fd || typeof fd !== "object") return fd;
  const { templateCode: _t, ...rest } = fd;
  return rest;
}

/** 설정 쓰기 전 — 기능 DAILY_LOG_V2 를 켠 회사만 */
async function settingsConn(tenantId: number): Promise<any> {
  const { getRawConnection } = await import("../../db/connection");
  const conn: any = await getRawConnection();
  const { DAILY_LOG_V2_FEATURE } = await import("../../lib/production/dailyLogSettingsStore");
  const { isTenantFeatureEnabled } = await import("../../lib/production/massBasisPolicy");
  if (!(await isTenantFeatureEnabled(conn, tenantId, DAILY_LOG_V2_FEATURE))) {
    throw new TRPCError({ code: 'FORBIDDEN', message: '이 회사는 일지 설정 기능이 켜져 있지 않습니다.' });
  }
  return conn;
}

/** 기록의 data_version (칼럼 생성 전 DB 는 0) */
async function readDataVersion(conn: any, id: number, tenantId: number): Promise<number> {
  try {
    const [r]: any = await conn.execute(`SELECT data_version FROM h_generic_checklist_records WHERE id = ? AND tenant_id = ?`, [id, tenantId]);
    return Number((r as any[])[0]?.data_version ?? 0);
  } catch (e: any) {
    if (e?.code === 'ER_BAD_FIELD_ERROR') return 0;
    throw e;
  }
}

/** v2 를 쓰는 회사면 발행 정의 (기능 DAILY_LOG_V2 켬 + 발행본 있음) */
async function v2DefinitionFor(conn: any, tenantId: number) {
  const { activeDefinition, DAILY_LOG_V2_FEATURE } = await import("../../lib/production/dailyLogSettingsStore");
  const { isTenantFeatureEnabled } = await import("../../lib/production/massBasisPolicy");
  if (!(await isTenantFeatureEnabled(conn, tenantId, DAILY_LOG_V2_FEATURE))) return null;
  return activeDefinition(conn, tenantId, 0);
}

/** 회사 시간대(KST) 기준 지금 */
function nowKstParts(): { date: string; time: string } {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  const p = Object.fromEntries(f.formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour === "24" ? "00" : p.hour}:${p.minute}` };
}

/**
 * v2 저장 — 서버 소유 칸 유지(mergeV2) · 평가 재계산 · 구조 검사 · 버전 잠금 · 제출 시 스냅샷 기준 검사.
 *   작성중·반려만 고칠 수 있다. 승인대기(제출)는 회수·반려 후 재작성, 승인은 거부.
 */
async function saveV2(conn: any, a: { recordId: number; status: string; prev: any; incoming: any; submit: boolean; expectedDataVersion?: number; tenantId: number; siteId: number; userId: number; logDate: string }) {
  const { mergeV2, v2SaveProblems, v2SubmitIssues } = await import("../../../shared/dailyLog/recordV2");
  if (a.status === 'approved') throw new TRPCError({ code: 'FORBIDDEN', message: '승인된 일일일지는 수정할 수 없습니다.' });
  if (a.status === 'submitted') throw new TRPCError({ code: 'FORBIDDEN', message: '제출된 일지입니다 — 반려된 뒤 고칠 수 있습니다.' });
  if (a.expectedDataVersion == null) throw new TRPCError({ code: 'BAD_REQUEST', message: '화면이 읽은 일지 버전이 없습니다 — 새로 고친 뒤 저장하세요.' });
  const merged: any = mergeV2(a.prev, a.incoming);
  const problems = v2SaveProblems(merged);
  if (problems.length) throw new TRPCError({ code: 'BAD_REQUEST', message: `저장할 수 없습니다 — ${problems.slice(0, 5).join(' / ')}` });
  if (a.submit) {
    const issues = v2SubmitIssues(merged, nowKstParts());
    if (issues.length) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: `제출할 수 없습니다 — ${issues.slice(0, 5).join(' / ')}${issues.length > 5 ? ` 외 ${issues.length - 5}건` : ''}` });
    merged.submittedBy = a.userId;
    merged.submittedAt = new Date().toISOString();
    merged.submittedVersion = a.expectedDataVersion + 1;
  }
  merged.lastUpdated = new Date().toISOString();
  const nextStatus = a.submit ? 'submitted' : 'draft';
  let affected = 0;
  try {
    const [res]: any = await conn.execute(
      `UPDATE h_generic_checklist_records SET form_data = ?, status = ?, data_version = data_version + 1, updated_by = ?, updated_at = NOW()
        WHERE id = ? AND tenant_id = ? AND status IN ('draft','rejected') AND data_version = ?`,
      [JSON.stringify(merged), nextStatus, a.userId, a.recordId, a.tenantId, a.expectedDataVersion],
    );
    affected = Number(res?.affectedRows ?? 0);
  } catch (e: any) {
    if (e?.code === 'ER_BAD_FIELD_ERROR') throw new TRPCError({ code: 'PRECONDITION_FAILED', message: '일지 버전 칸(data_version)이 아직 없습니다 — 서버 시작 마이그레이션 후 다시 시도하세요.' });
    throw e;
  }
  if (affected !== 1) throw new TRPCError({ code: 'CONFLICT', message: '다른 곳(PC·태블릿)에서 이 일지를 먼저 고쳤습니다 — 새로 고친 뒤 다시 저장하세요.' });
  if (a.submit) {
    const [ex]: any = await conn.execute(
      `SELECT id FROM h_approval_requests WHERE reference_type = 'checklist' AND reference_id = ? AND request_type = 'daily_log' AND tenant_id = ? AND status IN ('pending','pending_review','pending_approval','rejected') ORDER BY id DESC LIMIT 1`,
      [a.recordId, a.tenantId],
    );
    if ((ex as any[]).length) {
      await conn.execute(`UPDATE h_approval_requests SET status = 'pending_review' WHERE id = ? AND tenant_id = ?`, [(ex as any[])[0].id, a.tenantId]);
    } else {
      await conn.execute(
        `INSERT INTO h_approval_requests (site_id, tenant_id, request_type, reference_type, reference_id, title, description, status, priority, requested_by, created_at)
         VALUES (?, ?, 'daily_log', 'checklist', ?, ?, ?, 'pending_review', 'medium', ?, NOW())`,
        [a.siteId, a.tenantId, a.recordId, `[일일일지] ${a.logDate}`, '일일일지 작성 완료 — 검토 요청합니다.', a.userId],
      );
    }
  }
  return { success: true, id: a.recordId, status: nextStatus, dataVersion: a.expectedDataVersion + 1 };
}

export const dailyLogRouter = router({
  /** 이 회사의 새 일지에 쓸 템플릿 (원본 템플릿을 켠 회사만 코드, 아니면 null) */
  templateInfo: tenantRequiredProcedure.query(async ({ ctx }) => {
    const { KHACCP_TEMPLATE_CODE } = await import("../../../shared/dailyLog/khaccpTemplate");
    return { templateCode: (await templateEnabled(ctx.tenantId)) ? KHACCP_TEMPLATE_CODE : null };
  }),

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
  //   한 날짜 한 건 (dailyLogStore). 조회 실패는 '일지 없음' 이 아니라 오류 — 빈 새 일지로 보이지 않게 (docs/architecture/17 3-1)
  getByDate: tenantRequiredProcedure
    .input(z.object({ logDate: z.string(), siteId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const { getRawConnection } = await import("../../db/connection");
      const conn: any = await getRawConnection();
      const { findDailyLog } = await import("../../lib/production/dailyLogStore");
      const { resolveSiteScope } = await import("../../lib/production/dailyLogSettingsStore");
      try {
        const scope = await resolveSiteScope(conn, ctx.tenantId, input.siteId);
        const found = await findDailyLog(conn, ctx.tenantId, scope, input.logDate);
        if (!found) return null;
        const [rows]: any = await conn.execute(
          `SELECT id, site_id, form_date, title, status, form_data, created_at, updated_at FROM h_generic_checklist_records WHERE id = ? AND tenant_id = ?`,
          [found.id, ctx.tenantId],
        );
        const r = (rows as any[])[0];
        let fd: any = {};
        try { fd = typeof r.form_data === 'string' ? JSON.parse(r.form_data) : (r.form_data || {}); } catch {}
        return {
          id: r.id,
          siteId: r.site_id,
          logDate: String(r.form_date),
          title: r.title,
          status: r.status,
          formData: fd,
          dataVersion: await readDataVersion(conn, Number(r.id), ctx.tenantId),
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        };
      } catch (e: any) {
        console.error('[dailyLog.getByDate]', e);
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `일일일지를 불러오지 못했습니다 — 다시 시도하세요. (${e?.message ?? e})` });
      }
    }),

  /** 이 회사의 일지 방식 — v2 설정 발행(기능 켬) 이면 정의, 아니면 v1 */
  mode: tenantRequiredProcedure.query(async ({ ctx }) => {
    const { getRawConnection } = await import("../../db/connection");
    const conn: any = await getRawConnection();
    const v2 = await v2DefinitionFor(conn, ctx.tenantId);
    return v2 ? { version: 2 as const, settingsVersionId: v2.versionId } : { version: 1 as const, settingsVersionId: null };
  }),

  /** v2 일지 작성 시작 — 사용자가 누를 때만 만든다 (조회만으로 만들지 않음). 이미 있으면 그대로 */
  startV2: tenantRequiredProcedure
    .input(z.object({ logDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
    .mutation(async ({ input, ctx }) => {
      const { getRawConnection } = await import("../../db/connection");
      const conn: any = await getRawConnection();
      const v2 = await v2DefinitionFor(conn, ctx.tenantId);
      if (!v2) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: '발행된 일지 설정이 없습니다 — 관리자가 일지 설정을 발행해야 합니다.' });
      const { ensureDailyLog } = await import("../../lib/production/dailyLogStore");
      const { newRecordV2 } = await import("../../../shared/dailyLog/recordV2");
      const r = await ensureDailyLog(conn, {
        tenantId: ctx.tenantId, siteScope: 0, siteIdColumn: ctx.user.siteId || ctx.tenantId, date: input.logDate,
        title: `일일일지 - ${input.logDate}`, formData: newRecordV2(v2.definition, input.logDate, v2.versionId), status: 'draft', createdBy: ctx.user.id,
      });
      return { id: r.id, created: r.created };
    }),

  // ── 일일일지 저장 (전체 양식 = 위생점검 + 온도 + 이물관리 + 배치) ──
  saveFullForm: tenantRequiredProcedure
    .input(z.object({
      logDate: z.string(),
      formData: z.any(),
      siteId: z.number().optional(),
      status: z.enum(['draft', 'submitted']).default('draft'),
      /** v2 기록: 화면이 읽은 버전 — 다르면 다른 곳(PC·태블릿)에서 고친 것이므로 저장 거부 */
      expectedDataVersion: z.number().int().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("DB 연결 실패");
        const tenantId = ctx.tenantId;
        const siteId = input.siteId || ctx.user.siteId || ctx.tenantId || 1;

        const clientFd = stripServerOwned(input.formData);

        // 기존 레코드 확인 — 한 날짜 한 건 (dailyLogStore)
        const { getRawConnection } = await import("../../db/connection");
        const conn: any = await getRawConnection();
        const { findDailyLog, ensureDailyLog } = await import("../../lib/production/dailyLogStore");
        const { resolveSiteScope } = await import("../../lib/production/dailyLogSettingsStore");
        const siteScope = await resolveSiteScope(conn, tenantId, input.siteId);
        const found = await findDailyLog(conn, tenantId, siteScope, input.logDate);
        const existingRows: any[] = found ? [found] : [];
        const foundFd = (() => { try { return found ? (typeof found.form_data === 'string' ? JSON.parse(found.form_data) : (found.form_data || {})) : null; } catch { return null; } })();

        // v2 기록 (회사 일지 설정) — 별도 경로: 구조 검사·서버 재판정·버전 잠금 (docs/architecture/17 C2)
        const { isV2Record } = await import("../../../shared/dailyLog/recordV2");
        if (isV2Record(foundFd) || clientFd?.schemaVersion === 2) {
          if (!found || !isV2Record(foundFd)) {
            throw new TRPCError({ code: 'PRECONDITION_FAILED', message: '새 일지 방식 기록이 없습니다 — 화면에서 \'작성 시작\' 을 먼저 누르세요.' });
          }
          return saveV2(conn, { recordId: Number(found.id), status: found.status, prev: foundFd, incoming: clientFd, submit: input.status === 'submitted', expectedDataVersion: input.expectedDataVersion, tenantId, siteId, userId: ctx.user.id, logDate: input.logDate });
        }
        if (!found && (await v2DefinitionFor(conn, tenantId))) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: '이 회사는 새 일지 방식(회사 일지 설정)을 씁니다 — 화면을 새로 고친 뒤 작성하세요.' });
        }
        // 승인된 일지는 고치지 않는다 (정정은 별도 절차)
        if (existingRows[0]?.status === 'approved') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '승인된 일일일지는 수정할 수 없습니다.' });
        }
        let existingFd: any = {};
        try {
          existingFd = existingRows.length ? (typeof existingRows[0].form_data === 'string' ? JSON.parse(existingRows[0].form_data) : (existingRows[0].form_data || {})) : {};
        } catch {}
        // 템플릿: 기존 기록은 그 기록의 것 그대로, 새 기록은 회사 설정으로 (화면 값 안 씀)
        const { KHACCP_TEMPLATE_CODE, khaccpSubmitIssues } = await import("../../../shared/dailyLog/khaccpTemplate");
        const templateCode: string | null = existingRows.length
          ? (existingFd.templateCode ?? null)
          : ((await templateEnabled(tenantId)) ? KHACCP_TEMPLATE_CODE : null);

        // 제출(검토 요청) 시 온·습도 실측값·측정시각 필수 — 임시저장(draft)은 빈 값 허용.
        // 측정하지 않은 값이 검토·승인 단계로 넘어가는 것을 막는다 (승인 관문과 같은 검사, 2026-10-15).
        // 원본 템플릿 기록은 운송 온도(숫자 또는 '운송 없음'+사유)도 (PR-A)
        if (input.status === 'submitted') {
          const { findMeasurementIssues, summarizeIssues } = await import("../../../shared/dailyLogMeasurements");
          const issues = findMeasurementIssues(clientFd);
          if (issues.length > 0) {
            throw new TRPCError({
              code: 'PRECONDITION_FAILED',
              message: `측정 기록 미완료 — ${summarizeIssues(issues)}. 실제 측정값과 측정시각을 입력한 뒤 제출하세요.`,
            });
          }
          const tIssues = khaccpSubmitIssues({ ...existingFd, ...clientFd, templateCode });
          if (tIssues.length > 0) {
            throw new TRPCError({ code: 'PRECONDITION_FAILED', message: `제출할 수 없습니다 — ${tIssues.join(' / ')}` });
          }
        }

        let recordId: number;
        const title = `일일일지 - ${input.logDate}`;

        if (existingRows.length > 0) {
          // 기존 레코드 업데이트 (배치 데이터 보존, 위생 데이터 덮어씀)
          recordId = existingRows[0].id;
          const oldFd: any = existingFd;
          const merged: any = { ...oldFd, ...clientFd };
          if (templateCode) merged.templateCode = templateCode; else delete merged.templateCode;
          // 배치 데이터 보존
          if (oldFd.batches && !clientFd.batches) {
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
            WHERE id = ${recordId} AND tenant_id = ${tenantId}
          `);
        } else {
          // 신규 생성 — 한 날짜 한 건 (동시에 다른 경로가 먼저 만들었으면 그 행에 저장)
          const formDataObj = { ...clientFd, date: input.logDate, ...(templateCode ? { templateCode } : {}) };
          const r = await ensureDailyLog(conn, {
            tenantId, siteScope, siteIdColumn: siteId, date: input.logDate, title,
            formData: formDataObj, status: input.status, createdBy: ctx.user.id,
          });
          recordId = r.id;
          if (!r.created) {
            throw new TRPCError({ code: 'CONFLICT', message: '같은 날짜 일지가 방금 다른 곳에서 만들어졌습니다 — 화면을 새로 고친 뒤 다시 저장하세요.' });
          }
        }

        // submitted이면 승인요청 생성/업데이트
        if (input.status === 'submitted') {
          const existApproval = await db.execute(sql`
            SELECT id FROM h_approval_requests
            WHERE reference_type = 'checklist' AND reference_id = ${recordId} AND request_type = 'daily_log'
              AND tenant_id = ${tenantId}
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
              UPDATE h_approval_requests SET status = 'pending_review'
              WHERE id = ${approvalRows[0].id} AND tenant_id = ${tenantId}
            `);
          }
        }

        return { success: true, id: recordId, status: input.status };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
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
          SELECT status, form_data FROM h_generic_checklist_records
          WHERE id = ${input.id} AND tenant_id = ${ctx.tenantId} AND form_type = 'daily_log'
        `);
        const oldRows = (existing as any)[0] || [];
        if (oldRows.length === 0) throw new TRPCError({ code: 'NOT_FOUND', message: '일일일지를 찾을 수 없습니다.' });
        // 승인된 일지는 고치지 않는다 (정정은 별도 절차)
        if (oldRows[0].status === 'approved') throw new TRPCError({ code: 'FORBIDDEN', message: '승인된 일일일지는 수정할 수 없습니다.' });
        let oldFd: any = {};
        try { oldFd = typeof oldRows[0].form_data === 'string' ? JSON.parse(oldRows[0].form_data) : (oldRows[0].form_data || {}); } catch {}
        // v2 기록은 일지 화면(버전 잠금·구조 검사)에서만 고친다
        if (oldFd?.schemaVersion === 2) throw new TRPCError({ code: 'FORBIDDEN', message: '새 일지 방식 기록은 일일일지 화면에서 고칩니다.' });
        const clientFd = stripServerOwned(input.formData);
        const merged: any = { ...oldFd, ...clientFd, lastUpdated: new Date().toISOString() };
        // 템플릿 표시는 그 기록의 것 그대로
        if (oldFd.templateCode) merged.templateCode = oldFd.templateCode; else delete merged.templateCode;
        // 배치 보존
        if (oldFd.batches && !clientFd.batches) {
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
        if (error instanceof TRPCError) throw error;
        console.error('[dailyLog.updateFormData]', error);
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '수정 실패' });
      }
    }),

  // ════════ 일지 설정 (회사별 구역·대상·회차·기준) — 관리자, 기능 DAILY_LOG_V2 켠 회사만 (docs/architecture/17 B2·D1) ════════
  settingsGet: tenantRequiredProcedure.query(async ({ ctx }) => {
    const { getRawConnection } = await import("../../db/connection");
    const conn: any = await getRawConnection();
    const { loadSettings, DAILY_LOG_V2_FEATURE } = await import("../../lib/production/dailyLogSettingsStore");
    const { isTenantFeatureEnabled } = await import("../../lib/production/massBasisPolicy");
    const enabled = await isTenantFeatureEnabled(conn, ctx.tenantId, DAILY_LOG_V2_FEATURE);
    if (!enabled) return { enabled: false as const, rowVersion: 0, draft: null, active: null };
    return { enabled: true as const, ...(await loadSettings(conn, ctx.tenantId, 0)) };
  }),

  /** 참고 템플릿 — 고르면 초안으로 복사 (자동 적용 없음) */
  settingsTemplates: tenantRequiredProcedure.query(async () => {
    const { khaccpDefinition } = await import("../../../shared/dailyLog/khaccpDefinition");
    return [{ code: 'khaccp_daily_v1', title: 'K-HACCP 일일일지 5종 (원재료실 2 · 급속냉동 · 냉동 · 냉장, 오전·오후)', definition: khaccpDefinition() }];
  }),

  settingsSaveDraft: adminProcedure
    .input(z.object({ definition: z.any(), expectedRowVersion: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      const conn = await settingsConn(ctx.tenantId);
      const { saveDraft } = await import("../../lib/production/dailyLogSettingsStore");
      const { definitionProblems } = await import("../../../shared/dailyLog/definition");
      try {
        const rowVersion = await saveDraft(conn, ctx.tenantId, 0, input.definition, input.expectedRowVersion, ctx.user.id);
        return { rowVersion, problems: definitionProblems(input.definition) };
      } catch (e: any) {
        throw new TRPCError({ code: 'CONFLICT', message: e?.message ?? '저장 실패' });
      }
    }),

  /** 미리보기 — 정의 검사·행 수·하루 측정 횟수와 빈 일지 표시 데이터 (아무것도 만들지 않는다) */
  settingsPreview: adminProcedure
    .input(z.object({ definition: z.any() }))
    .mutation(async ({ input, ctx }) => {
      const conn = await settingsConn(ctx.tenantId);
      const { definitionProblems, parseDefinition } = await import("../../../shared/dailyLog/definition");
      const { loadSettings, removedIdProblems } = await import("../../lib/production/dailyLogSettingsStore");
      const problems = definitionProblems(input.definition);
      if (problems.length) return { problems, summary: null, viewModel: null };
      const def = parseDefinition(input.definition);
      const s = await loadSettings(conn, ctx.tenantId, 0);
      const removed = removedIdProblems(s.active?.definition ?? null, def);
      const { newRecordV2, expectedRows, activeQuestions } = await import("../../../shared/dailyLog/recordV2");
      const { buildDailyLogViewModelV2 } = await import("../../../shared/dailyLog/viewModelV2");
      const rows = expectedRows(def);
      const summary = {
        zones: def.zones.filter((z) => z.active).length,
        points: new Set(rows.map((r) => r.point.pointId)).size,
        measurementsPerDay: rows.length,
        questions: activeQuestions(def).length,
        sections: def.enabledSections.length,
      };
      return { problems: removed, summary, viewModel: buildDailyLogViewModelV2(newRecordV2(def, nowKstParts().date, null)) };
    }),

  /** 발행 — 새 버전(불변). 다음에 새로 만드는 일지부터 적용 */
  settingsPublish: adminProcedure
    .input(z.object({ expectedRowVersion: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      const conn = await settingsConn(ctx.tenantId);
      const { publishDraft } = await import("../../lib/production/dailyLogSettingsStore");
      try {
        const r = await publishDraft(conn, ctx.tenantId, 0, input.expectedRowVersion, ctx.user.id);
        const { createAuditLog } = await import("../../db/system/auditApprovalSupplier");
        await createAuditLog({ action: "daily_log_settings.publish", entityType: "daily_log_settings", userId: ctx.user.id, changes: r, description: `일지 설정 v${r.versionNo} 발행` }, ctx.tenantId);
        return r;
      } catch (e: any) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: e?.message ?? '발행 실패' });
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

        return (rows as any[]).map((r: any) => {
          let formData: any = {};
          try { formData = typeof r.form_data === 'string' ? JSON.parse(r.form_data) : (r.form_data || {}); } catch {}
          const hc = formData.hygieneChecks || {};
          const hasHygieneData = typeof hc === 'object' && (Array.isArray(hc) ? hc.length > 0 : Object.values(hc).some((v: any) => v !== null && v !== undefined));
          // 위생점검 항목수 카운트 (배열 또는 객체 모두 지원)
          const isCheckedVal = (v: any) => v === '적합' || v === 'yes' || v === 'Y' || v === 'pass' || v === true;
          const hygieneTotal = Array.isArray(hc) ? hc.length : (typeof hc === 'object' ? Object.keys(hc).length : 0);
          const hygieneChecked = Array.isArray(hc)
            ? hc.filter((item: any) => isCheckedVal(item?.checkResult)).length
            : (typeof hc === 'object' ? Object.values(hc).filter((v: any) => isCheckedVal(v)).length : 0);
          // 이물관리 항목수 카운트 (배열 또는 객체 모두 지원)
          const fc = formData.foreignMaterialChecks || {};
          const foreignTotal = Array.isArray(fc) ? fc.length : (typeof fc === 'object' ? Object.keys(fc).length : 0);
          const foreignChecked = Array.isArray(fc)
            ? fc.filter((item: any) => isCheckedVal(item?.checkResult)).length
            : (typeof fc === 'object' ? Object.values(fc).filter((v: any) => isCheckedVal(v)).length : 0);
          // 온도 기록 여부
          const hasTemp = !!(formData.roomTemperatures || formData.freezerTemperatures || formData.fridgeTemperatures || formData.temperatureHumidity || formData.freezerTemperature || formData.refrigeratorTemperature || formData.temperatureRecords);

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

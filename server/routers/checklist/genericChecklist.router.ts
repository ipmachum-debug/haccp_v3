/**
 * 범용 체크리스트 레코드 (Generic Checklist Records)
 * 전용 테이블이 없는 체크리스트 폼의 데이터를 JSON으로 저장
 */

import { z } from "zod";
import { router, tenantRequiredProcedure } from "../../_core/trpc";
import { getDb } from "../../db";
import { hGenericChecklistRecords } from "../../../drizzle/schema/schema_main";
import { eq, and, desc, gte, lte, lt, sql } from "drizzle-orm";
import { getEffectiveTenantId } from "./_helpers";

import { toKSTDate, todayKST } from "../../utils/timezone";
import { TRPCError } from "@trpc/server";
import { getRawConnection } from "../../db/connection";
import { assertDailyLogGate, checkDailyLogGate } from "../../lib/production/dailyLogApprovalGate";
import { prepareBatchForApproval, completeApprovedBatch, approvalMessage } from "../../lib/production/batchApprovalGate";
import {
  ACTIVE_REQUEST_STATUSES, CHECKLIST_REFERENCE_TYPES, clearReviewStamps, decideDelete, decideSubmit, decideUpdate,
  isChecklistReference, applyApprovalStamp, stampDate, classifySubmitted, type RecordStatus, type StampKind,
} from "../../lib/checklist/recordStatePolicy";

/**
 * 승인 절차가 공통 일지 기록을 바꿀 때는 반드시 여기로 (2026-10-15)
 *  - 요청의 reference_type 이 공통 일지(checklist / generic_checklist)일 때만 — 다른 종류 요청(원료 사용 보고·CCP 기록지 등)을
 *    승인하면서 같은 번호의 일지를 바꾸던 문제 차단 (덤프: 온습도 #94 가 자기 승인 요청 없이 승인완료)
 *  - 검토·승인이면 결재 직인을 일지 본문에 함께 찍는다
 */
async function syncChecklistRecord(
  refId: number | null | undefined, referenceType: unknown, tenantId: number,
  change: { status?: RecordStatus; stamp?: StampKind }, actorName: string,
): Promise<boolean> {
  if (!refId || !isChecklistReference(referenceType)) return false;
  const conn: any = await getRawConnection();
  const [rows]: any = await conn.execute(`SELECT form_data FROM h_generic_checklist_records WHERE id = ? AND tenant_id = ?`, [refId, tenantId]);
  if (!rows?.[0]) return false;
  const sets: string[] = ["updated_at = NOW()"];
  const params: unknown[] = [];
  if (change.status) { sets.push("status = ?"); params.push(change.status); }
  if (change.stamp) {
    const fd = typeof rows[0].form_data === "string" ? safeJson(rows[0].form_data) : rows[0].form_data;
    sets.push("form_data = ?");
    params.push(JSON.stringify(applyApprovalStamp(fd, change.stamp, { name: actorName, date: stampDate() })));
  }
  await conn.execute(`UPDATE h_generic_checklist_records SET ${sets.join(", ")} WHERE id = ? AND tenant_id = ?`, [...params, refId, tenantId]);
  return true;
}

/** 공통 일지 한 건을 잠그고 읽는다 (트랜잭션 안) */
async function lockRecord(conn: any, id: number, tenantId: number) {
  const [rows]: any = await conn.execute(
    `SELECT id, status, form_data FROM h_generic_checklist_records WHERE id = ? AND tenant_id = ? FOR UPDATE`, [id, tenantId]);
  const r = rows?.[0];
  if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "기록을 찾을 수 없습니다." });
  return { status: (r.status ?? "draft") as RecordStatus, formData: typeof r.form_data === "string" ? safeJson(r.form_data) : r.form_data };
}
const safeJson = (v: string) => { try { return JSON.parse(v); } catch { return {}; } };
const activeSql = `SELECT id FROM h_approval_requests
  WHERE tenant_id = ? AND reference_id = ? AND reference_type IN (${CHECKLIST_REFERENCE_TYPES.map(() => "?").join(",")})
    AND status IN (${ACTIVE_REQUEST_STATUSES.map(() => "?").join(",")})`;
const activeParams = (tenantId: number, id: number) => [tenantId, id, ...CHECKLIST_REFERENCE_TYPES, ...ACTIVE_REQUEST_STATUSES];
const approvedSql = `SELECT id FROM h_approval_requests
  WHERE tenant_id = ? AND reference_id = ? AND reference_type IN (${CHECKLIST_REFERENCE_TYPES.map(() => "?").join(",")}) AND status = 'approved'`;
const approvedParams = (tenantId: number, id: number) => [tenantId, id, ...CHECKLIST_REFERENCE_TYPES];

/** 일괄 처리 결과 문구 — 실제 처리 건수와 실패 사유 */
function bulkMessage(verb: string, ok: number, failed: Array<{ approvalRequestId: number; message: string }>): string {
  if (failed.length === 0) return `${ok}건 ${verb} 완료`;
  return `${ok}건 ${verb} 완료, ${failed.length}건 ${verb} 안 됨 — ${failed.slice(0, 3).map((f) => `#${f.approvalRequestId}: ${f.message}`).join(" / ")}${failed.length > 3 ? ` 외 ${failed.length - 3}건` : ""}`;
}

/** 트랜잭션 실행 — 실패하면 되돌린다 */
async function inTx<T>(fn: (conn: any) => Promise<T>): Promise<T> {
  const pool: any = await getRawConnection();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const v = await fn(conn);
    await conn.commit();
    return v;
  } catch (e) {
    await conn.rollback().catch(() => undefined);
    throw e;
  } finally {
    conn.release();
  }
}

export const genericChecklistRouter = router({
  // 같은 formType의 최신 레코드 조회 (이전 작성 내용 자동 불러오기)
  getLatestByDate: tenantRequiredProcedure
    .input(z.object({
      formType: z.string(),
      formDate: z.string(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      const tenantId = getEffectiveTenantId(ctx);
      // ★ 2026-04-13: formDate 와 같은 날짜의 기록은 제외 (자기 자신을 pre-fill 방지)
      //    → 사용자가 오늘 작성한 draft 가 있으면 다른 이전 기록을 불러와야 함
      const records = await db
        .select()
        .from(hGenericChecklistRecords)
        .where(and(
          eq(hGenericChecklistRecords.formType, input.formType),
          eq((hGenericChecklistRecords as any).tenantId, tenantId),
          // 오늘 날짜의 기록은 제외 (같은 날 중복 pre-fill 방지)
          lt(hGenericChecklistRecords.formDate, input.formDate),
        ))
        .orderBy(desc(hGenericChecklistRecords.formDate), desc(hGenericChecklistRecords.createdAt))
        .limit(1);
      return records[0] || null;
    }),
  /**
   * 자동 채움 맥락 (일지 PR 2, 2026-10-15) — 오늘 기록(이어쓰기)·참고 후보·참고 기록을 한 번에.
   * 사업장: 사용자에게 사업장이 있으면 그 사업장만. 선택 로직은 server/lib/checklist/prefillContext.ts
   */
  prefillContext: tenantRequiredProcedure
    .input(z.object({
      formType: z.string(),
      formDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      refId: z.number().int().positive().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");
      const tenantId = getEffectiveTenantId(ctx);
      const { pickPrefill } = await import("../../lib/checklist/prefillContext");
      const base = [
        eq(hGenericChecklistRecords.formType, input.formType),
        eq((hGenericChecklistRecords as any).tenantId, tenantId),
      ];
      const rows = await db
        .select({
          id: hGenericChecklistRecords.id, siteId: hGenericChecklistRecords.siteId, formDate: hGenericChecklistRecords.formDate,
          status: hGenericChecklistRecords.status, title: hGenericChecklistRecords.title, formData: hGenericChecklistRecords.formData,
          createdAt: hGenericChecklistRecords.createdAt,
        })
        .from(hGenericChecklistRecords)
        .where(and(...base, lte(hGenericChecklistRecords.formDate, input.formDate)))
        .orderBy(desc(hGenericChecklistRecords.formDate), desc(hGenericChecklistRecords.createdAt))
        .limit(40);
      // 직접 고른 기록이 최근 40건 밖이면 따로 읽는다 (같은 회사·양식만)
      if (input.refId && !rows.some((r) => r.id === input.refId)) {
        const extra = await db
          .select({
            id: hGenericChecklistRecords.id, siteId: hGenericChecklistRecords.siteId, formDate: hGenericChecklistRecords.formDate,
            status: hGenericChecklistRecords.status, title: hGenericChecklistRecords.title, formData: hGenericChecklistRecords.formData,
            createdAt: hGenericChecklistRecords.createdAt,
          })
          .from(hGenericChecklistRecords)
          .where(and(...base, eq(hGenericChecklistRecords.id, input.refId)))
          .limit(1);
        rows.push(...extra);
      }
      return pickPrefill(rows as any, { formDate: input.formDate, userSiteId: (ctx.user as any)?.siteId ?? null, refId: input.refId ?? null });
    }),

  list: tenantRequiredProcedure
    .input(z.object({
      formType: z.string(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      status: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");
      const tenantId = getEffectiveTenantId(ctx);
      const conditions: any[] = [
        eq(hGenericChecklistRecords.formType, input.formType),
        eq((hGenericChecklistRecords as any).tenantId, tenantId),
      ];
      if (input.startDate) conditions.push(gte(hGenericChecklistRecords.formDate, input.startDate));
      if (input.endDate) conditions.push(lte(hGenericChecklistRecords.formDate, input.endDate));
      if (input.status) conditions.push(eq(hGenericChecklistRecords.status, input.status as any));
      const records = await db
        .select()
        .from(hGenericChecklistRecords)
        .where(and(...conditions))
        .orderBy(desc(hGenericChecklistRecords.createdAt));
      return records;
    }),

  getById: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");
      const tenantId = getEffectiveTenantId(ctx);
      const records = await db
        .select()
        .from(hGenericChecklistRecords)
        .where(and(
          eq(hGenericChecklistRecords.id, input.id),
          eq((hGenericChecklistRecords as any).tenantId, tenantId)
        ));
      return records[0] || null;
    }),

  create: tenantRequiredProcedure
    .input(z.object({
      siteId: z.number().optional(),
      formType: z.string(),
      formDate: z.string(),
      title: z.string().optional(),
      formData: z.any(),
      status: z.enum(["draft", "submitted", "approved", "rejected"]).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");
      const tenantId = getEffectiveTenantId(ctx);
      // site_id 는 NOT NULL 이지만 기본값이 없다. site 미배정 사용자(관리자 등)는
      // input.siteId / ctx.user.siteId 가 모두 undefined 라 Drizzle 이 DEFAULT 를 넣어
      // "Field 'site_id' doesn't have a default value" 로 INSERT 가 실패한다.
      // → 최종 폴백으로 tenantId 사용 (submitForReview 의 site_id 폴백과 동일 패턴).
      const result = await db.insert(hGenericChecklistRecords).values({
        siteId: input.siteId || ctx.user.siteId || tenantId,
        tenantId: tenantId,
        formType: input.formType,
        formDate: input.formDate,
        title: input.title || `${input.formType} - ${input.formDate}`,
        formData: input.formData,
        // 새 기록은 항상 작성중 — 상태는 승인 요청 절차로만 바뀐다 (2026-10-15 상태 정책)
        status: "draft",
        createdBy: ctx.user.id,
        updatedBy: ctx.user.id,
      } as any);
      return { success: true, id: Number((result as any)[0]?.insertId || (result as any).insertId) };
    }),

  /**
   * 내용 저장 (2026-10-15 상태 정책) — 화면이 보낸 status 는 쓰지 않는다.
   * 작성중이 아닌 기록(승인대기·승인완료·반려)을 고치면 재작성: 작성중으로 돌리고, 진행 중 승인 요청 취소, 검토·승인 직인 제거.
   */
  update: tenantRequiredProcedure
    .input(z.object({
      id: z.number(),
      formDate: z.string().optional(),
      title: z.string().optional(),
      formData: z.any().optional(),
      /** 호환용 — 무시한다 (상태는 절차로만 바뀐다) */
      status: z.enum(["draft", "submitted", "approved", "rejected"]).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = getEffectiveTenantId(ctx);
      return inTx(async (conn) => {
        const cur = await lockRecord(conn, input.id, tenantId);
        const { nextStatus, reopen } = decideUpdate(cur.status);
        let formData = input.formData !== undefined ? input.formData : cur.formData;
        if (reopen) formData = clearReviewStamps(formData);
        const sets = ["status = ?", "form_data = ?", "updated_by = ?", "updated_at = NOW()"];
        const params: unknown[] = [nextStatus, JSON.stringify(formData ?? {}), ctx.user.id];
        if (input.formDate) { sets.push("form_date = ?"); params.push(input.formDate); }
        if (input.title !== undefined) { sets.push("title = ?"); params.push(input.title); }
        await conn.execute(`UPDATE h_generic_checklist_records SET ${sets.join(", ")} WHERE id = ? AND tenant_id = ?`, [...params, input.id, tenantId]);
        let cancelled = 0;
        if (reopen) {
          const [res]: any = await conn.execute(
            `UPDATE h_approval_requests SET status = 'cancelled', notes = CONCAT(COALESCE(notes, ''), ?)
              WHERE tenant_id = ? AND reference_id = ? AND reference_type IN (${CHECKLIST_REFERENCE_TYPES.map(() => "?").join(",")})
                AND status IN (${ACTIVE_REQUEST_STATUSES.map(() => "?").join(",")})`,
            [` [재작성으로 취소 ${new Date().toISOString().slice(0, 10)}]`, tenantId, input.id, ...CHECKLIST_REFERENCE_TYPES, ...ACTIVE_REQUEST_STATUSES],
          );
          cancelled = Number(res?.affectedRows ?? 0);
        }
        return { success: true, status: nextStatus, reopened: reopen, previousStatus: cur.status, cancelledRequests: cancelled };
      });
    }),

  /** 삭제 — 작성중만 (화면 정책과 같게 서버에서 강제, 2026-10-15) */
  delete: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = getEffectiveTenantId(ctx);
      return inTx(async (conn) => {
        const cur = await lockRecord(conn, input.id, tenantId);
        const d = decideDelete(cur.status);
        if (!d.ok) throw new TRPCError({ code: "BAD_REQUEST", message: d.message });
        await conn.execute(`DELETE FROM h_generic_checklist_records WHERE id = ? AND tenant_id = ? AND status = 'draft'`, [input.id, tenantId]);
        return { success: true };
      });
    }),

  // 체크리스트 승인 요청 (작성자 → 검토 대기)
  /**
   * 승인 요청 (작성자 → 검토 대기) — 한 트랜잭션 (2026-10-15 상태 정책)
   * 진행 중 요청이 있으면 거부. 요청을 먼저 만들고 그다음 상태를 submitted 로 — 둘 다 되거나 둘 다 안 된다.
   * 승인 요청 없이 '승인대기' 인 기록(이전 오류)은 요청을 다시 만들어 승인관리에 보이게 한다.
   */
  submitForReview: tenantRequiredProcedure
    .input(z.object({
      id: z.number(),
      requestType: z.string(),
      title: z.string(),
      description: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = getEffectiveTenantId(ctx);
      return inTx(async (conn) => {
        const cur = await lockRecord(conn, input.id, tenantId);
        const [active]: any = await conn.execute(`${activeSql} FOR UPDATE`, activeParams(tenantId, input.id));
        const [approvedRows]: any = await conn.execute(approvedSql, approvedParams(tenantId, input.id));
        const d = decideSubmit(cur.status, (active as any[]).map((r) => Number(r.id)), (approvedRows as any[]).map((r) => Number(r.id)));
        if (!d.ok) throw new TRPCError({ code: "CONFLICT", message: d.message });
        const [ins]: any = await conn.execute(
          `INSERT INTO h_approval_requests
             (site_id, request_type, reference_type, reference_id, title, description, status, priority, requested_by, tenant_id)
           VALUES (?, ?, 'checklist', ?, ?, ?, 'pending_review', 'medium', ?, ?)`,
                    // 복구 요청은 화면 설명이 있어도 "누락 복구" 를 남긴다 (이전: 화면 설명이 있으면 복구 표시가 빠졌다)
          [ctx.user.siteId || ctx.tenantId, input.requestType, input.id, input.title,
            [input.description || "", d.recovering ? "[승인 요청 누락 복구 — 이전 오류로 요청 없이 승인대기였던 기록]" : ""].filter(Boolean).join(" "),
            ctx.user.id, tenantId],
        );
        await conn.execute(
          `UPDATE h_generic_checklist_records SET status = 'submitted', updated_by = ?, updated_at = NOW() WHERE id = ? AND tenant_id = ?`,
          [ctx.user.id, input.id, tenantId],
        );
        return {
          success: true,
          requestId: Number(ins?.insertId ?? 0),
          recovered: d.recovering,
          message: d.recovering ? "누락됐던 승인 요청을 다시 만들었습니다. 승인관리에서 보입니다." : "검토 요청이 등록되었습니다.",
        };
      });
    }),

  /** 이 기록에 진행 중인 승인 요청 (화면: 승인 요청 없는 '승인대기' 를 알아보고 다시 요청 버튼을 보여 주기) */
  approvalState: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const tenantId = getEffectiveTenantId(ctx);
      const conn: any = await getRawConnection();
      const [rec]: any = await conn.execute(`SELECT status FROM h_generic_checklist_records WHERE id = ? AND tenant_id = ?`, [input.id, tenantId]);
      if (!rec?.[0]) return null;
      const [active]: any = await conn.execute(activeSql, activeParams(tenantId, input.id));
      const status = (rec[0].status ?? "draft") as RecordStatus;
      const activeRequestIds = (active as any[]).map((r) => Number(r.id));
      const [approvedRows]: any = await conn.execute(approvedSql, approvedParams(tenantId, input.id));
      const approvedRequestIds = (approvedRows as any[]).map((r) => Number(r.id));
      return { status, activeRequestIds, approvedRequestIds, ...classifySubmitted(status, activeRequestIds, approvedRequestIds) };
    }),

  // 체크리스트 검토 (검토자 → 승인 대기)
  reviewChecklist: tenantRequiredProcedure
    .input(z.object({
      approvalRequestId: z.number(),
      action: z.enum(["approve", "reject"]),
      comments: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      if (input.action === "approve") {
        // 일일일지 측정 기록 관문 — 부작용 전에 (2026-10-15)
        await assertDailyLogGate(ctx.tenantId, input.approvalRequestId);
        // 배치 검토 시 h_batches 상태를 under_review로 변경
        // ★ db.execute(sql`...`) 반환값은 MySQL2 tuple [rows, fields]
        //    → 첫 row 접근은 result[0][0] 이어야 함 (기존 result[0].field 는 undefined)
        const reqResult: any = await db.execute(sql`
          SELECT reference_id, request_type, reference_type
          FROM h_approval_requests WHERE id = ${input.approvalRequestId} AND tenant_id = ${ctx.tenantId}
        `);
        const reqRowsArr: any[] = (reqResult as any)?.[0] || [];
        const firstReq = reqRowsArr[0] || {};
        const reqType = firstReq.request_type;
        const refType = firstReq.reference_type;
        const refId = firstReq.reference_id;
        if (reqType === 'batch_production' && refType === 'batch' && refId) {
          await db.execute(sql`
            UPDATE h_batches SET status = 'under_review', updated_at = NOW()
            WHERE id = ${refId} AND tenant_id = ${ctx.tenantId}
          `);
          console.log(`[reviewChecklist] 배치 #${refId} 상태 → under_review`);
        }
        await db.execute(sql`
          UPDATE h_approval_requests
          SET status = 'pending_approval', reviewed_by = ${ctx.user.id}, reviewed_at = NOW(), review_comments = ${input.comments || null}
          WHERE id = ${input.approvalRequestId} AND tenant_id = ${ctx.tenantId}
        `);
        // 검토 직인 (공통 일지 요청일 때만)
        await syncChecklistRecord(refId, refType, getEffectiveTenantId(ctx), { stamp: "review" }, ctx.user.name ?? "");
        return { success: true, message: "검토가 완료되었습니다. 최종 승인 대기 중입니다." };
      } else {
        const rejResult: any = await db.execute(sql`
          SELECT reference_id, request_type, reference_type
          FROM h_approval_requests WHERE id = ${input.approvalRequestId} AND tenant_id = ${ctx.tenantId}
        `);
        const rejRowsArr: any[] = (rejResult as any)?.[0] || [];
        const firstRej = rejRowsArr[0] || {};
        const refId = firstRej.reference_id;
        const reqType = firstRej.request_type;
        const refType = firstRej.reference_type;
        if (refId) {
          if (reqType === 'batch_production' && refType === 'batch') {
            // 배치 반려: planned 상태로 되돌림
            await db.execute(sql`
              UPDATE h_batches SET status = 'planned', updated_at = NOW()
              WHERE id = ${refId} AND tenant_id = ${ctx.tenantId}
            `);
            console.log(`[reviewChecklist] 배치 #${refId} 검토 반려 → planned`);
          } else {
            await syncChecklistRecord(refId, refType, getEffectiveTenantId(ctx), { status: "draft" }, ctx.user.name ?? "");
          }
        }
        await db.execute(sql`
          UPDATE h_approval_requests
          SET status = 'rejected', reviewed_by = ${ctx.user.id}, reviewed_at = NOW(), review_comments = ${input.comments || null},
              rejected_by = ${ctx.user.id}, rejected_at = NOW(), rejection_reason = ${input.comments || null}
          WHERE id = ${input.approvalRequestId} AND tenant_id = ${ctx.tenantId}
        `);
        return { success: true, message: "검토가 반려되었습니다." };
      }
    }),

  // 체크리스트 최종 승인 (승인자)
  approveChecklist: tenantRequiredProcedure
    .input(z.object({
      approvalRequestId: z.number(),
      action: z.enum(["approve", "reject"]),
      comments: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      // ★ CRITICAL FIX: db.execute(sql`...`) 반환값은 [rows, fields] 튜플
      //    기존 코드 rows?.[0]?.reference_id 는 rows 배열에 .reference_id 접근 → 항상 undefined
      //    → 배치 승인 시 h_batches 상태 업데이트가 한 번도 실행되지 않았음
      //    → 캘린더에 '계획(planned)' 으로 유지되는 근본 원인
      const execResult: any = await db.execute(sql`
        SELECT reference_id, request_type, reference_type
        FROM h_approval_requests WHERE id = ${input.approvalRequestId} AND tenant_id = ${ctx.tenantId}
      `);
      const rawRows: any[] = (execResult as any)?.[0] || [];
      const firstRow = rawRows[0] || {};
      let postWarnings: string[] = [];
      const refId = firstRow.reference_id;
      const requestType = firstRow.request_type;
      const referenceType = firstRow.reference_type;

      console.log(
        `[approveChecklist] 시작: approvalRequestId=${input.approvalRequestId}, ` +
          `action=${input.action}, requestType=${requestType}, referenceType=${referenceType}, refId=${refId}`,
      );

      if (input.action === "approve") {
        await assertDailyLogGate(ctx.tenantId, input.approvalRequestId);
        if (refId) {
          if (requestType === 'batch_production' && referenceType === 'batch') {
            // 배치 승인: h_batches 상태를 'completed'로 변경 + 완료일 설정
            // ⚠️ 'approved'는 enum에 없음 → MySQL strict mode 위반이므로 'completed' 사용
            // 승인 기록은 approval_requests 테이블에 별도 보관됨
            // 공통 관문(CCP 기록지·원료 출고) → 완료(실제 처리 시각) → 후속 처리 경고는 응답으로 (지티 QA B01·B03·B04)
            await prepareBatchForApproval(Number(refId), ctx.tenantId, ctx.user.id);
            postWarnings = await completeApprovedBatch(Number(refId), ctx.tenantId, ctx.user.id, "approveChecklist");

            // 배치 승인 시 생산일지 갱신
            try {
              const { autoRegenerateProductionDaily } = await import("../../lib/production/autoProductionDaily");
              const batchExec: any = await db.execute(sql`
                SELECT planned_date FROM h_batches WHERE id = ${refId} AND tenant_id = ${ctx.tenantId}
              `);
              const batchRowsArr: any[] = (batchExec as any)?.[0] || [];
              const bRow = batchRowsArr[0];
              const bDate = bRow?.planned_date
                ? toKSTDate(new Date(bRow.planned_date))
                : todayKST();
              await autoRegenerateProductionDaily(ctx.tenantId, bDate);
            } catch (pdErr) {
              console.error(`[approveChecklist] 생산일지 갱신 실패:`, pdErr);
            }
          } else {
            // 최종 승인 + 승인 직인 (공통 일지 요청일 때만 — 다른 종류 요청은 일지를 건드리지 않는다)
            await syncChecklistRecord(refId, referenceType, getEffectiveTenantId(ctx), { status: "approved", stamp: "approve" }, ctx.user.name ?? "");
          }
        }
        await db.execute(sql`
          UPDATE h_approval_requests
          SET status = 'approved', approved_by = ${ctx.user.id}, approved_at = NOW(), notes = ${input.comments || null}
          WHERE id = ${input.approvalRequestId} AND tenant_id = ${ctx.tenantId}
        `);
        return { success: true, message: approvalMessage("최종 승인이 완료되었습니다.", postWarnings), warnings: postWarnings };
      } else {
        if (refId) {
          if (requestType === 'batch_production' && referenceType === 'batch') {
            // 배치 반려: h_batches 상태를 'cancelled'로 변경
            // ⚠️ 'rejected'는 enum에 없음 → 'cancelled' 사용 (반려/취소 의미)
            await db.execute(sql`
              UPDATE h_batches SET status = 'cancelled', updated_at = NOW()
              WHERE id = ${refId} AND tenant_id = ${ctx.tenantId}
            `);
            console.log(`[approveChecklist] 배치 #${refId} 상태 → cancelled (반려)`);
          } else {
            await syncChecklistRecord(refId, referenceType, getEffectiveTenantId(ctx), { status: "submitted" }, ctx.user.name ?? "");
          }
        }
        await db.execute(sql`
          UPDATE h_approval_requests
          SET status = 'pending_review', rejected_by = ${ctx.user.id}, rejected_at = NOW(), rejection_reason = ${input.comments || null}
          WHERE id = ${input.approvalRequestId} AND tenant_id = ${ctx.tenantId}
        `);
        return { success: true, message: "승인이 반려되었습니다. 재검토가 필요합니다." };
      }
    }),

  // 일괄 검토 (여러 건을 한번에 검토 완료)
  batchReviewChecklists: tenantRequiredProcedure
    .input(z.object({
      approvalRequestIds: z.array(z.number()),
      comments: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");
      let successCount = 0;
      const failed: Array<{ approvalRequestId: number; message: string }> = [];
      for (const id of input.approvalRequestIds) {
        try {
          const gate = await checkDailyLogGate(ctx.tenantId, id);
          if (!gate.ok) { failed.push({ approvalRequestId: id, message: gate.message }); continue; }
          const res: any = await db.execute(sql`
            UPDATE h_approval_requests
            SET status = 'pending_approval', reviewed_by = ${ctx.user.id}, reviewed_at = NOW(), review_comments = ${input.comments || null}
            WHERE id = ${id} AND status IN ('pending_review', 'pending') AND tenant_id = ${ctx.tenantId}
          `);
          // 검토 직인 (실제로 검토 처리된 공통 일지 요청만)
          if (Number(res?.[0]?.affectedRows ?? res?.affectedRows ?? 0) > 0) {
            const refRes: any = await db.execute(sql`SELECT reference_id, reference_type FROM h_approval_requests WHERE id = ${id} AND tenant_id = ${ctx.tenantId}`);
            const ref = (refRes?.[0] || [])[0] || {};
            await syncChecklistRecord(ref.reference_id, ref.reference_type, getEffectiveTenantId(ctx), { stamp: "review" }, ctx.user.name ?? "");
            successCount++;
          } else {
            failed.push({ approvalRequestId: id, message: "검토할 수 있는 상태가 아닙니다 (이미 처리됐거나 없는 요청)" });
          }
        } catch (e: any) {
          console.error(`일괄 검토 실패 (id=${id}):`, e);
          failed.push({ approvalRequestId: id, message: e?.message || "검토 실패" });
        }
      }
      return { success: failed.length === 0, message: bulkMessage("검토", successCount, failed), count: successCount, failed };
    }),
  // 일괄 승인 (여러 건을 한번에 최종 승인)
  batchApproveChecklists: tenantRequiredProcedure
    .input(z.object({
      approvalRequestIds: z.array(z.number()),
      comments: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");
      let successCount = 0;
      const failed: Array<{ approvalRequestId: number; message: string }> = [];
      const postWarnings: string[] = [];
      for (const id of input.approvalRequestIds) {
        try {
          // 승인 요청 정보 조회 (reference_id, request_type, reference_type)
          // ★ CRITICAL FIX: db.execute(sql`...`) 튜플 언랩
          const execResult: any = await db.execute(sql`
            SELECT reference_id, request_type, reference_type, status
            FROM h_approval_requests WHERE id = ${id} AND tenant_id = ${ctx.tenantId}
          `);
          const rawRows: any[] = (execResult as any)?.[0] || [];
          const firstRow = rawRows[0] || {};
          const refId = firstRow.reference_id;
          const requestType = firstRow.request_type;
          const referenceType = firstRow.reference_type;
          const reqStatus = firstRow.status;

          // 일일일지 측정 기록 관문 — 배치·직인 등 부작용 전에 (2026-10-15)
          const gate = await checkDailyLogGate(ctx.tenantId, id);
          if (!gate.ok) { failed.push({ approvalRequestId: id, message: gate.message }); continue; }

          if (refId) {
            if (requestType === 'batch_production' && referenceType === 'batch') {
              // 배치 승인: h_batches 상태를 'completed'로 변경 + 완료일 설정
              // ⚠️ 'approved'는 enum에 없음 → MySQL strict mode 위반이므로 'completed' 사용
              // 공통 관문 → 완료 → 후속 처리 (지티 QA B01·B03·B04). 관문 실패는 이 요청만 실패 목록으로
              await prepareBatchForApproval(Number(refId), ctx.tenantId, ctx.user.id);
              const w = await completeApprovedBatch(Number(refId), ctx.tenantId, ctx.user.id, "batchApproveChecklists");
              if (w.length) postWarnings.push(`#${id}: ${w.slice(0, 2).join(", ")}`);

              // 배치 승인 시 생산일지(production_daily) 자동 갱신
              try {
                const { autoRegenerateProductionDaily } = await import("../../lib/production/autoProductionDaily");
                const batchExec: any = await db.execute(sql`
                  SELECT planned_date, created_at FROM h_batches WHERE id = ${refId} AND tenant_id = ${getEffectiveTenantId(ctx)}
                `);
                const batchRowsArr: any[] = (batchExec as any)?.[0] || [];
                const bRow = batchRowsArr[0];
                const bDate = bRow?.planned_date
                  ? toKSTDate(new Date(bRow.planned_date))
                  : todayKST();
                await autoRegenerateProductionDaily(ctx.tenantId, bDate);
                console.log(`[batchApproveChecklists] 생산일지 갱신 완료 (배치 #${refId})`);
              } catch (pdErr) {
                console.error(`[batchApproveChecklists] 생산일지 갱신 실패:`, pdErr);
              }
            } else {
              // 체크리스트/일일일지 승인 + 직인 (검토 전이면 검토 직인도) — 공통 일지 요청일 때만
              await syncChecklistRecord(refId, referenceType, getEffectiveTenantId(ctx), {
                status: "approved", stamp: reqStatus === "pending_review" || reqStatus === "pending" ? "reviewAndApprove" : "approve",
              }, ctx.user.name ?? "");
            }
          }
          const upd: any = await db.execute(sql`
            UPDATE h_approval_requests
            SET status = 'approved', approved_by = ${ctx.user.id}, approved_at = NOW(), notes = ${input.comments || null}
            WHERE id = ${id} AND status IN ('pending_approval', 'pending_review', 'pending') AND tenant_id = ${ctx.tenantId}
          `);
          if (Number(upd?.[0]?.affectedRows ?? upd?.affectedRows ?? 0) > 0) successCount++;
          else failed.push({ approvalRequestId: id, message: "승인할 수 있는 상태가 아닙니다 (이미 처리됐거나 없는 요청)" });
        } catch (e: any) {
          console.error(`일괄 승인 실패 (id=${id}):`, e);
          failed.push({ approvalRequestId: id, message: e?.message || "승인 실패" });
        }
      }
      return { success: failed.length === 0, message: approvalMessage(bulkMessage("승인", successCount, failed), postWarnings), count: successCount, failed, warnings: postWarnings };
    }),
  // 승인자가 검토+승인 동시 처리 (검토 자동 완료)
  approveWithAutoReview: tenantRequiredProcedure
    .input(z.object({
      approvalRequestId: z.number(),
      comments: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");
      // ★ CRITICAL FIX: db.execute(sql`...`) 반환값은 [rows, fields] 튜플
      //    첫 row 접근은 result[0][0] 이어야 함
      const execResult: any = await db.execute(sql`
        SELECT reference_id, status, request_type, reference_type
        FROM h_approval_requests WHERE id = ${input.approvalRequestId} AND tenant_id = ${ctx.tenantId}
      `);
      const rawRows: any[] = (execResult as any)?.[0] || [];
      const firstRow = rawRows[0] || {};
      let postWarnings: string[] = [];
      const refId = firstRow.reference_id;
      const currentStatus = firstRow.status;
      const requestType = firstRow.request_type;
      const referenceType = firstRow.reference_type;

      console.log(
        `[approveWithAutoReview] 시작: approvalRequestId=${input.approvalRequestId}, ` +
          `requestType=${requestType}, referenceType=${referenceType}, refId=${refId}`,
      );
      await assertDailyLogGate(ctx.tenantId, input.approvalRequestId);

      if (refId) {
        if (requestType === 'batch_production' && referenceType === 'batch') {
          // 배치 승인: h_batches 상태를 'completed'로 변경 + 완료일 설정
          // ⚠️ 'approved'는 enum에 없음 → MySQL strict mode 위반이므로 'completed' 사용
          // 공통 관문(CCP 기록지·원료 출고) → 완료(실제 처리 시각) → 후속 처리 경고는 응답으로 (지티 QA B01·B03·B04)
          await prepareBatchForApproval(Number(refId), ctx.tenantId, ctx.user.id);
          postWarnings = await completeApprovedBatch(Number(refId), ctx.tenantId, ctx.user.id, "approveWithAutoReview");

          // 배치 승인 시 생산일지(production_daily) 자동 갱신
          try {
            const { autoRegenerateProductionDaily } = await import("../../lib/production/autoProductionDaily");
            const batchExec: any = await db.execute(sql`
              SELECT planned_date, created_at FROM h_batches WHERE id = ${refId} AND tenant_id = ${getEffectiveTenantId(ctx)}
            `);
            const batchRowsArr: any[] = (batchExec as any)?.[0] || [];
            const bRow = batchRowsArr[0];
            const bDate = bRow?.planned_date
              ? toKSTDate(new Date(bRow.planned_date))
              : todayKST();
            await autoRegenerateProductionDaily(ctx.tenantId, bDate);
            console.log(`[approveWithAutoReview] 생산일지 갱신 완료 (배치 #${refId})`);
          } catch (pdErr) {
            console.error(`[approveWithAutoReview] 생산일지 갱신 실패:`, pdErr);
          }
        } else {
          // 체크리스트/일일일지: 승인 + 직인 (검토 단계였으면 검토 직인도) — 공통 일지 요청일 때만
          await syncChecklistRecord(refId, referenceType, getEffectiveTenantId(ctx), {
            status: "approved", stamp: currentStatus === "pending_review" || currentStatus === "pending" ? "reviewAndApprove" : "approve",
          }, ctx.user.name ?? "");
        }
      }
      // 검토 단계면 검토도 자동 완료
      if (currentStatus === 'pending_review' || currentStatus === 'pending') {
        await db.execute(sql`
          UPDATE h_approval_requests
          SET status = 'approved',
              reviewed_by = ${ctx.user.id}, reviewed_at = NOW(), review_comments = '승인자 자동 검토',
              approved_by = ${ctx.user.id}, approved_at = NOW(), notes = ${input.comments || null}
          WHERE id = ${input.approvalRequestId} AND tenant_id = ${ctx.tenantId}
        `);
      } else {
        await db.execute(sql`
          UPDATE h_approval_requests
          SET status = 'approved', approved_by = ${ctx.user.id}, approved_at = NOW(), notes = ${input.comments || null}
          WHERE id = ${input.approvalRequestId} AND tenant_id = ${ctx.tenantId}
        `);
      }
      return { success: true, message: approvalMessage("검토 및 승인이 완료되었습니다.", postWarnings), warnings: postWarnings };
    }),

  // ── 생산일지 수동 재생성 (관리자용) ──
  regenerateProductionDaily: tenantRequiredProcedure
    .input(z.object({ date: z.string() }))
    .mutation(async ({ input, ctx }) => {
      try {
        const { autoRegenerateProductionDaily } = await import("../../lib/production/autoProductionDaily");
        await autoRegenerateProductionDaily(ctx.tenantId, input.date);
        return { success: true, message: `${input.date} 생산일지 재생성 완료` };
      } catch (err: any) {
        console.error("[regenerateProductionDaily]", err);
        return { success: false, message: err.message || "재생성 실패" };
      }
    }),

  // ── 승인 완료/대기 문서 재작성 (재수정) ──
  //    승인된(또는 대기중) 문서를 다시 편집 가능한 draft 상태로 되돌린다.
  //    · 레코드 status → draft, form_data.approval 의 검토/승인 직인 제거(작성자 유지)
  //    · 연결된 승인요청(h_approval_requests) supersede → cancelled
  //    편집 후 저장하면 다시 승인요청 → 재검토/재승인 흐름을 탄다.
  reopenForEdit: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");
      const tenantId = getEffectiveTenantId(ctx);

      // 1. 레코드 조회 (테넌트 격리)
      const rows = await db
        .select()
        .from(hGenericChecklistRecords)
        .where(and(
          eq(hGenericChecklistRecords.id, input.id),
          eq((hGenericChecklistRecords as any).tenantId, tenantId),
        ))
        .limit(1);
      const rec = rows[0];
      if (!rec) throw new Error("문서를 찾을 수 없습니다.");

      // 2. form_data.approval 검토/승인 직인 제거 (작성자 직인은 유지)
      const fd: any = (rec as any).formData || {};
      if (fd && fd.approval) {
        fd.approval.reviewerApproved = false;
        fd.approval.approverApproved = false;
        fd.approval.reviewerDate = null;
        fd.approval.approverDate = null;
      }

      // 3. 레코드 → draft
      await db.update(hGenericChecklistRecords).set({
        status: "draft",
        formData: fd,
        updatedBy: ctx.user.id,
        updatedAt: new Date(),
      } as any).where(and(
        eq(hGenericChecklistRecords.id, input.id),
        eq((hGenericChecklistRecords as any).tenantId, tenantId),
      ));

      // 4. 연결된 승인요청 supersede → cancelled (checklist / generic_checklist 양쪽 reference_type)
      await db.execute(sql`
        UPDATE h_approval_requests
        SET status = 'cancelled',
            notes = CONCAT(COALESCE(notes, ''), ' [재작성으로 승인취소]')
        WHERE reference_id = ${input.id}
          AND reference_type IN ('checklist', 'generic_checklist')
          AND tenant_id = ${tenantId}
          -- 완료된 승인('approved')은 이력으로 보존 (2026-10-15 — 건강일지·update 와 같은 정책). 진행 중인 요청만 취소
          AND status IN ('pending_writer', 'pending_review', 'pending_approval', 'pending')
      `);

      return { success: true, message: "재작성 가능 상태로 전환되었습니다." };
    }),

  // ── 증빙 사진/파일 업로드 (S3) ──
  //    form_data 에는 stable 한 storage key 만 저장하고, 표시/인쇄 시
  //    resolvePhotoUrls 로 fresh presigned URL 을 재발급한다 (presigned 는 1시간 만료).
  uploadPhoto: tenantRequiredProcedure
    .input(z.object({
      formType: z.string(),
      file: z.object({
        name: z.string(),
        type: z.string(),
        data: z.string(), // base64 (data: prefix 제외)
      }),
    }))
    .mutation(async ({ input, ctx }) => {
      const { storagePut, StorageNotConfiguredError } = await import("../../storage");
      const { TRPCError } = await import("@trpc/server");
      const tenantId = getEffectiveTenantId(ctx);
      const buffer = Buffer.from(input.file.data, "base64");
      // 한글/영숫자/._- 외 문자는 언더스코어로 치환 (경로 안전)
      const safeName = (input.file.name || "photo").replace(/[^\w.\-가-힣]/g, "_");
      const safeType = (input.formType || "generic").replace(/[^\w\-]/g, "_");
      const fileKey = `tenant-${tenantId}/${safeType}-photos/${Date.now()}-${safeName}`;
      try {
        const { key } = await storagePut(fileKey, buffer, input.file.type || "application/octet-stream");
        // 표시는 클라이언트 로컬 미리보기(object URL) / 재조회 시 resolvePhotoUrls(data URI) 사용
        return { key, name: input.file.name };
      } catch (err: any) {
        if (err instanceof StorageNotConfiguredError) {
          throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: err.userMessage, cause: err });
        }
        throw err;
      }
    }),

  // ── 저장된 storage key 들을 표시/인쇄용 이미지로 해석 (data URI) ──
  //    presigned URL 을 그대로 브라우저 <img> 에 쓰면, 스토리지 엔드포인트가
  //    브라우저에서 직접 접근 불가(내부 엔드포인트/버킷 정책/CORS)일 때 깨진다.
  //    → 서버가 바이트를 읽어 data URI 로 내려주면 어떤 환경에서도 안정적으로 표시/인쇄됨.
  resolvePhotoUrls: tenantRequiredProcedure
    .input(z.object({ keys: z.array(z.string()).max(50) }))
    .query(async ({ input, ctx }) => {
      const { storageGet } = await import("../../storage");
      const tenantId = getEffectiveTenantId(ctx);
      const results: Array<{ key: string; url: string | null }> = [];
      for (const key of input.keys) {
        // 테넌트 격리: 자기 테넌트 prefix 의 key 만 허용
        if (!key || !key.startsWith(`tenant-${tenantId}/`)) {
          results.push({ key, url: null });
          continue;
        }
        try {
          const { url } = await storageGet(key);
          // 서버 → 스토리지 fetch (presigned) → data URI 변환
          const resp = await fetch(url);
          if (!resp.ok) { results.push({ key, url: null }); continue; }
          const buf = Buffer.from(await resp.arrayBuffer());
          const ct = resp.headers.get("content-type") || "image/jpeg";
          results.push({ key, url: `data:${ct};base64,${buf.toString("base64")}` });
        } catch {
          results.push({ key, url: null });
        }
      }
      return results;
    }),
});

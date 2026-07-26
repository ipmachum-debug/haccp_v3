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
        status: input.status || "draft",
        createdBy: ctx.user.id,
        updatedBy: ctx.user.id,
      } as any);
      return { success: true, id: Number((result as any)[0]?.insertId || (result as any).insertId) };
    }),

  update: tenantRequiredProcedure
    .input(z.object({
      id: z.number(),
      formDate: z.string().optional(),
      title: z.string().optional(),
      formData: z.any().optional(),
      status: z.enum(["draft", "submitted", "approved", "rejected"]).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");
      const tenantId = getEffectiveTenantId(ctx);
      const { id, ...data } = input;
      await db.update(hGenericChecklistRecords).set({
        ...data,
        updatedBy: ctx.user.id,
        updatedAt: new Date(),
      } as any).where(and(
        eq(hGenericChecklistRecords.id, id),
        eq((hGenericChecklistRecords as any).tenantId, tenantId)
      ));
      return { success: true };
    }),

  delete: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");
      const tenantId = getEffectiveTenantId(ctx);
      await db.delete(hGenericChecklistRecords).where(and(
        eq(hGenericChecklistRecords.id, input.id),
        eq((hGenericChecklistRecords as any).tenantId, tenantId)
      ));
      return { success: true };
    }),

  // 체크리스트 승인 요청 (작성자 → 검토 대기)
  submitForReview: tenantRequiredProcedure
    .input(z.object({
      id: z.number(),
      requestType: z.string(),
      title: z.string(),
      description: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");
      const tenantId = getEffectiveTenantId(ctx);

      // 1. 체크리스트 상태를 submitted로 변경
      await db.update(hGenericChecklistRecords).set({
        status: "submitted",
        updatedBy: ctx.user.id,
        updatedAt: new Date(),
      } as any).where(and(
        eq(hGenericChecklistRecords.id, input.id),
        eq((hGenericChecklistRecords as any).tenantId, tenantId)
      ));

      // 2. 승인 요청 생성 (pending_review 상태)
      await db.execute(sql`
        INSERT INTO h_approval_requests
        (site_id, request_type, reference_type, reference_id, title, description, status, priority, requested_by, tenant_id)
        VALUES
        (${ctx.user.siteId || ctx.tenantId}, ${input.requestType}, 'checklist', ${input.id}, ${input.title}, ${input.description || ''}, 'pending_review', 'medium', ${ctx.user.id}, ${tenantId})
      `);

      return { success: true, message: "검토 요청이 등록되었습니다." };
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
            await db.update(hGenericChecklistRecords).set({ status: "draft", updatedAt: new Date() } as any)
              .where(and(eq(hGenericChecklistRecords.id, refId), eq((hGenericChecklistRecords as any).tenantId, getEffectiveTenantId(ctx))));
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
      const refId = firstRow.reference_id;
      const requestType = firstRow.request_type;
      const referenceType = firstRow.reference_type;

      console.log(
        `[approveChecklist] 시작: approvalRequestId=${input.approvalRequestId}, ` +
          `action=${input.action}, requestType=${requestType}, referenceType=${referenceType}, refId=${refId}`,
      );

      if (input.action === "approve") {
        if (refId) {
          if (requestType === 'batch_production' && referenceType === 'batch') {
            // 배치 승인: h_batches 상태를 'completed'로 변경 + 완료일 설정
            // ⚠️ 'approved'는 enum에 없음 → MySQL strict mode 위반이므로 'completed' 사용
            // 승인 기록은 approval_requests 테이블에 별도 보관됨
            await db.execute(sql`
              UPDATE h_batches
              SET status = 'completed',
                  end_time = COALESCE(end_time, CONCAT(planned_date, ' 17:00:00')),
                  completed_at = COALESCE(completed_at, CONCAT(planned_date, ' 17:00:00')),
                  updated_at = NOW()
              WHERE id = ${refId} AND tenant_id = ${ctx.tenantId}
            `);
            console.log(`[approveChecklist] 배치 #${refId} 상태 → completed (승인 완료)`);

            // 배치 승인 시 생산일지 갱신
            try {
              const { autoRegenerateProductionDaily } = await import("../../lib/production/autoProductionDaily");
              const batchExec: any = await db.execute(sql`
                SELECT planned_date FROM h_batches WHERE id = ${refId} AND tenant_id = ${tenantId}
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
            await db.update(hGenericChecklistRecords).set({ status: "approved", updatedAt: new Date() } as any)
              .where(and(eq(hGenericChecklistRecords.id, refId), eq((hGenericChecklistRecords as any).tenantId, getEffectiveTenantId(ctx))));
          }
        }
        await db.execute(sql`
          UPDATE h_approval_requests
          SET status = 'approved', approved_by = ${ctx.user.id}, approved_at = NOW(), notes = ${input.comments || null}
          WHERE id = ${input.approvalRequestId} AND tenant_id = ${ctx.tenantId}
        `);
        return { success: true, message: "최종 승인이 완료되었습니다." };
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
            await db.update(hGenericChecklistRecords).set({ status: "submitted", updatedAt: new Date() } as any)
              .where(and(eq(hGenericChecklistRecords.id, refId), eq((hGenericChecklistRecords as any).tenantId, getEffectiveTenantId(ctx))));
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
      for (const id of input.approvalRequestIds) {
        try {
          await db.execute(sql`
            UPDATE h_approval_requests
            SET status = 'pending_approval', reviewed_by = ${ctx.user.id}, reviewed_at = NOW(), review_comments = ${input.comments || null}
            WHERE id = ${id} AND status IN ('pending_review', 'pending') AND tenant_id = ${ctx.tenantId}
          `);
          successCount++;
        } catch (e) {
          console.error(`일괄 검토 실패 (id=${id}):`, e);
        }
      }
      return { success: true, message: `${successCount}건 검토 완료`, count: successCount };
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
      for (const id of input.approvalRequestIds) {
        try {
          // 승인 요청 정보 조회 (reference_id, request_type, reference_type)
          // ★ CRITICAL FIX: db.execute(sql`...`) 튜플 언랩
          const execResult: any = await db.execute(sql`
            SELECT reference_id, request_type, reference_type
            FROM h_approval_requests WHERE id = ${id} AND tenant_id = ${ctx.tenantId}
          `);
          const rawRows: any[] = (execResult as any)?.[0] || [];
          const firstRow = rawRows[0] || {};
          const refId = firstRow.reference_id;
          const requestType = firstRow.request_type;
          const referenceType = firstRow.reference_type;

          if (refId) {
            if (requestType === 'batch_production' && referenceType === 'batch') {
              // 배치 승인: h_batches 상태를 'completed'로 변경 + 완료일 설정
              // ⚠️ 'approved'는 enum에 없음 → MySQL strict mode 위반이므로 'completed' 사용
              await db.execute(sql`
                UPDATE h_batches
                SET status = 'completed',
                    end_time = COALESCE(end_time, CONCAT(planned_date, ' 17:00:00')),
                    completed_at = COALESCE(completed_at, CONCAT(planned_date, ' 17:00:00')),
                    updated_at = NOW()
                WHERE id = ${refId} AND tenant_id = ${ctx.tenantId}
              `);
              console.log(`[batchApproveChecklists] 배치 #${refId} 상태 → completed (승인 완료)`);

              // ★ 2026-07-03: 이 경로(일괄 승인)가 실제 UI 완료 경로인데 완제품 LOT 을
              //   안 만들어(26배치 LOT 0건의 진짜 원인) → #404/#407 과 동일하게 여기서도
              //   완제품 LOT 멱등 생성 + 완료훅 실행. (완료경로 파편화 5번째 = path E 봉인)
              try {
                const { ensureBatchLots } = await import("../../db/production/productOutboundManagement");
                const lotResult = await ensureBatchLots(Number(refId), ctx.tenantId);
                console.log(`[batchApproveChecklists] 배치 #${refId} 완제품 LOT 보강: 생성 ${lotResult?.created?.length ?? 0}건`);
              } catch (lotErr: any) {
                console.error(`[batchApproveChecklists] 배치 #${refId} 완제품 LOT 생성 실패:`, lotErr);
              }
              try {
                const { runBatchCompletionHooks } = await import("../../lib/production/batchCompletionHooks");
                const hookResult = await runBatchCompletionHooks(Number(refId), ctx.tenantId, { source: "manual" });
                if (hookResult.warnings.length > 0) {
                  console.warn(`[batchApproveChecklists] 배치 #${refId} 완료 훅 경고:`, hookResult.warnings);
                }
              } catch (hookErr: any) {
                console.error(`[batchApproveChecklists] 배치 #${refId} 완료 훅 실패:`, hookErr);
              }

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
              // 체크리스트/일일일지 승인: 기존 로직
              await db.update(hGenericChecklistRecords).set({ status: "approved", updatedAt: new Date() } as any)
                .where(and(eq(hGenericChecklistRecords.id, refId), eq((hGenericChecklistRecords as any).tenantId, getEffectiveTenantId(ctx))));
            }
          }
          await db.execute(sql`
            UPDATE h_approval_requests
            SET status = 'approved', approved_by = ${ctx.user.id}, approved_at = NOW(), notes = ${input.comments || null}
            WHERE id = ${id} AND status IN ('pending_approval', 'pending_review', 'pending') AND tenant_id = ${ctx.tenantId}
          `);
          successCount++;
        } catch (e) {
          console.error(`일괄 승인 실패 (id=${id}):`, e);
        }
      }
      return { success: true, message: `${successCount}건 승인 완료`, count: successCount };
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
      const refId = firstRow.reference_id;
      const currentStatus = firstRow.status;
      const requestType = firstRow.request_type;
      const referenceType = firstRow.reference_type;

      console.log(
        `[approveWithAutoReview] 시작: approvalRequestId=${input.approvalRequestId}, ` +
          `requestType=${requestType}, referenceType=${referenceType}, refId=${refId}`,
      );

      if (refId) {
        if (requestType === 'batch_production' && referenceType === 'batch') {
          // 배치 승인: h_batches 상태를 'completed'로 변경 + 완료일 설정
          // ⚠️ 'approved'는 enum에 없음 → MySQL strict mode 위반이므로 'completed' 사용
          await db.execute(sql`
            UPDATE h_batches
            SET status = 'completed',
                end_time = COALESCE(end_time, CONCAT(planned_date, ' 17:00:00')),
                completed_at = COALESCE(completed_at, CONCAT(planned_date, ' 17:00:00')),
                updated_at = NOW()
            WHERE id = ${refId} AND tenant_id = ${ctx.tenantId}
          `);
          console.log(`[approveWithAutoReview] 배치 #${refId} 상태 → completed (승인 완료)`);

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
          // 체크리스트/일일일지: 기존 로직
          await db.update(hGenericChecklistRecords).set({ status: "approved", updatedAt: new Date() } as any)
            .where(and(eq(hGenericChecklistRecords.id, refId), eq((hGenericChecklistRecords as any).tenantId, getEffectiveTenantId(ctx))));
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
      return { success: true, message: "검토 및 승인이 완료되었습니다." };
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
        const { key, url } = await storagePut(fileKey, buffer, input.file.type || "application/octet-stream");
        return { key, url, name: input.file.name };
      } catch (err: any) {
        if (err instanceof StorageNotConfiguredError) {
          throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: err.userMessage, cause: err });
        }
        throw err;
      }
    }),

  // ── 저장된 storage key 들에 대해 fresh presigned URL 재발급 (표시/인쇄용) ──
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
          results.push({ key, url });
        } catch {
          results.push({ key, url: null });
        }
      }
      return results;
    }),
});

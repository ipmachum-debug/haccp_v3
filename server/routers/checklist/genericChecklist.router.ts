/**
 * 범용 체크리스트 레코드 (Generic Checklist Records)
 * 전용 테이블이 없는 체크리스트 폼의 데이터를 JSON으로 저장
 */

import { z } from "zod";
import { router, tenantRequiredProcedure } from "../../_core/trpc";
import { getDb } from "../../db";
import { hGenericChecklistRecords } from "../../../drizzle/schema_main";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import { getEffectiveTenantId } from "./_helpers";

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
      const records = await db
        .select()
        .from(hGenericChecklistRecords)
        .where(and(
          eq(hGenericChecklistRecords.formType, input.formType),
          eq((hGenericChecklistRecords as any).tenantId, tenantId)
        ))
        .orderBy(desc(hGenericChecklistRecords.createdAt))
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
      const result = await db.insert(hGenericChecklistRecords).values({
        siteId: input.siteId || ctx.user.siteId,
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
        const reqRows: any[] = await db.execute(sql`
          SELECT reference_id, request_type, reference_type
          FROM h_approval_requests WHERE id = ${input.approvalRequestId} AND tenant_id = ${ctx.tenantId}
        `) as any;
        const reqType = reqRows?.[0]?.request_type;
        const refType = reqRows?.[0]?.reference_type;
        const refId = reqRows?.[0]?.reference_id;
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
        const rows: any[] = await db.execute(sql`
          SELECT reference_id, request_type, reference_type
          FROM h_approval_requests WHERE id = ${input.approvalRequestId} AND tenant_id = ${ctx.tenantId}
        `) as any;
        const refId = rows?.[0]?.reference_id;
        const reqType = rows?.[0]?.request_type;
        const refType = rows?.[0]?.reference_type;
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

      const rows: any[] = await db.execute(sql`
        SELECT reference_id, request_type, reference_type
        FROM h_approval_requests WHERE id = ${input.approvalRequestId} AND tenant_id = ${ctx.tenantId}
      `) as any;
      const refId = rows?.[0]?.reference_id;
      const requestType = rows?.[0]?.request_type;
      const referenceType = rows?.[0]?.reference_type;

      if (input.action === "approve") {
        if (refId) {
          if (requestType === 'batch_production' && referenceType === 'batch') {
            // 배치 승인: h_batches 상태를 'approved'로 변경
            await db.execute(sql`
              UPDATE h_batches SET status = 'approved', updated_at = NOW()
              WHERE id = ${refId} AND tenant_id = ${ctx.tenantId}
            `);
            console.log(`[approveChecklist] 배치 #${refId} 상태 → approved`);

            // 배치 승인 시 생산일지 갱신
            try {
              const { autoRegenerateProductionDaily } = await import("../../lib/autoProductionDaily");
              const batchResult: any[] = await db.execute(sql`
                SELECT planned_date FROM h_batches WHERE id = ${refId}
              `) as any;
              const bRow = batchResult?.[0];
              const bDate = bRow?.planned_date
                ? new Date(bRow.planned_date).toISOString().split('T')[0]
                : new Date().toISOString().split('T')[0];
              await autoRegenerateProductionDaily(ctx.tenantId ?? undefined, bDate);
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
            // 배치 반려: h_batches 상태를 'rejected'로 변경
            await db.execute(sql`
              UPDATE h_batches SET status = 'rejected', updated_at = NOW()
              WHERE id = ${refId} AND tenant_id = ${ctx.tenantId}
            `);
            console.log(`[approveChecklist] 배치 #${refId} 상태 → rejected`);
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
          const rows: any[] = await db.execute(sql`
            SELECT reference_id, request_type, reference_type
            FROM h_approval_requests WHERE id = ${id} AND tenant_id = ${ctx.tenantId}
          `) as any;
          const refId = rows?.[0]?.reference_id;
          const requestType = rows?.[0]?.request_type;
          const referenceType = rows?.[0]?.reference_type;

          if (refId) {
            if (requestType === 'batch_production' && referenceType === 'batch') {
              // 배치 승인: h_batches 상태를 'approved'로 변경
              await db.execute(sql`
                UPDATE h_batches SET status = 'approved', updated_at = NOW()
                WHERE id = ${refId} AND tenant_id = ${ctx.tenantId}
              `);
              console.log(`[batchApproveChecklists] 배치 #${refId} 상태 → approved`);

              // 배치 승인 시 생산일지(production_daily) 자동 갱신
              try {
                const { autoRegenerateProductionDaily } = await import("../../lib/autoProductionDaily");
                const batchResult: any[] = await db.execute(sql`
                  SELECT planned_date, created_at FROM h_batches WHERE id = ${refId}
                `) as any;
                const bRow = batchResult?.[0];
                const bDate = bRow?.planned_date
                  ? new Date(bRow.planned_date).toISOString().split('T')[0]
                  : new Date().toISOString().split('T')[0];
                await autoRegenerateProductionDaily(ctx.tenantId ?? undefined, bDate);
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
      const rows: any[] = await db.execute(sql`
        SELECT reference_id, status, request_type, reference_type
        FROM h_approval_requests WHERE id = ${input.approvalRequestId} AND tenant_id = ${ctx.tenantId}
      `) as any;
      const refId = rows?.[0]?.reference_id;
      const currentStatus = rows?.[0]?.status;
      const requestType = rows?.[0]?.request_type;
      const referenceType = rows?.[0]?.reference_type;

      if (refId) {
        if (requestType === 'batch_production' && referenceType === 'batch') {
          // 배치 승인: h_batches 상태를 'approved'로 변경
          await db.execute(sql`
            UPDATE h_batches SET status = 'approved', updated_at = NOW()
            WHERE id = ${refId} AND tenant_id = ${ctx.tenantId}
          `);
          console.log(`[approveWithAutoReview] 배치 #${refId} 상태 → approved`);

          // 배치 승인 시 생산일지(production_daily) 자동 갱신
          try {
            const { autoRegenerateProductionDaily } = await import("../../lib/autoProductionDaily");
            const batchResult: any[] = await db.execute(sql`
              SELECT planned_date, created_at FROM h_batches WHERE id = ${refId}
            `) as any;
            const bRow = batchResult?.[0];
            const bDate = bRow?.planned_date
              ? new Date(bRow.planned_date).toISOString().split('T')[0]
              : new Date().toISOString().split('T')[0];
            await autoRegenerateProductionDaily(ctx.tenantId ?? undefined, bDate);
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
});

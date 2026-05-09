// approval 라우터 - routers.ts에서 분리됨
import { adminProcedure, monitorProcedure, tenantRequiredProcedure, router, workerProcedure } from "../../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { or } from "drizzle-orm";
import { getDb } from "../../db";

export const approvalRouter = router({
    // 승인 대시보드 - 전체 승인 대기 항목 조회
    getPendingApprovals: tenantRequiredProcedure.query(async ({ ctx }) => {
      const { getPendingApprovals } = await import("../../db/system/approvalDashboard");
      return await getPendingApprovals(ctx.tenantId);
    }),
    
    // 범용 승인 요청 생성
    createRequest: tenantRequiredProcedure
      .input(
        z.object({
          requestType: z.string(),
          referenceType: z.string().optional(),
          referenceId: z.number().optional(),
          title: z.string(),
          description: z.string().optional(),
          priority: z.enum(["low", "medium", "high", "urgent"]).optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { createApprovalRequest } = await import("../../db");
        const requestId = await createApprovalRequest({
          tenantId: ctx.tenantId,
          siteId: (ctx.user.siteId || ctx.tenantId) as number,
          requestType: input.requestType,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          title: input.title,
          description: input.description,
          priority: input.priority,
          requestedBy: ctx.user.id
        });
        return { success: true, requestId };
      }),

    // 승인 요청 목록 조회
    list: tenantRequiredProcedure
      .input(
        z.object({
          status: z.string().optional(),
          requestType: z.string().optional()
        })
      )
      .query(async ({ input, ctx }) => {
        const { getApprovalRequests } = await import("../../db");
        if (!ctx.tenantId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "tenantId is required" });
        }
        return await getApprovalRequests({ ...input, tenantId: ctx.tenantId });
      }),

    // 여러 ID로 일괄 조회 (인쇄 미리보기 최적화)
    listByIds: tenantRequiredProcedure
      .input(z.object({ ids: z.array(z.number()) }))
      .query(async ({ input, ctx }) => {
        if (!ctx.tenantId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "tenantId is required" });
        }
        if (input.ids.length === 0) return [];
        const { getApprovalRequestsByIds } = await import("../../db");
        return await getApprovalRequestsByIds(input.ids, ctx.tenantId);
      }),

    // 승인 요청 상세 조회
    getById: tenantRequiredProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getApprovalRequestById } = await import("../../db");
        const result = await getApprovalRequestById(input.id);
        // P1: 테넌트 소유권 검증
        if (result && result.tenantId !== (ctx.tenantId) && ctx.user.role !== 'super_admin') {
          throw new TRPCError({ code: "FORBIDDEN", message: "다른 테넌트의 승인 요청을 조회할 수 없습니다." });
        }
        return result;
      }),

    // 배치 승인 요청
    requestBatchApproval: workerProcedure
      .input(
        z.object({
          batchId: z.number(),
          title: z.string(),
          description: z.string().optional(),
          priority: z.enum(["low", "medium", "high", "urgent"]).optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { createApprovalRequest } = await import("../../db");
        const requestId = await createApprovalRequest({
          tenantId: ctx.tenantId,
          siteId: (ctx.user.siteId || ctx.tenantId) as number,
          requestType: "batch_approval",
          referenceType: "batch",
          referenceId: input.batchId,
          title: input.title,
          description: input.description,
          priority: input.priority,
          requestedBy: ctx.user.id
        });
        return { success: true, requestId };
      }),

    // CCP 검토 승인 요청
    requestCcpReview: workerProcedure
      .input(
        z.object({
          ccpInstanceId: z.number(),
          title: z.string(),
          description: z.string().optional(),
          priority: z.enum(["low", "medium", "high", "urgent"]).optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { createApprovalRequest } = await import("../../db");
        const requestId = await createApprovalRequest({
          tenantId: ctx.tenantId,
          siteId: (ctx.user.siteId || ctx.tenantId) as number,
          requestType: "ccp_review",
          referenceType: "ccp_instance",
          referenceId: input.ccpInstanceId,
          title: input.title,
          description: input.description,
          priority: input.priority,
          requestedBy: ctx.user.id
        });
        return { success: true, requestId };
      }),

    // 승인 처리
    approve: monitorProcedure
      .input(
        z.object({
          requestId: z.number(),
          notes: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { approveRequest, getApprovalRequestById, createNotification } = await import("../../db");
        
        // 승인 처리
        const result = await approveRequest(input.requestId, ctx.user.id, input.notes);
        
        // 요청 정보 조회
        const request = await getApprovalRequestById(input.requestId);
        if (request) {
          // 요청자에게 알림 전송
          await createNotification({
            tenantId: ctx.tenantId,
            userId: request.requestedBy,
            notificationType: "approval_completed",
            title: "승인 완료",
            message: `"${request.title}" 요청이 승인되었습니다. 승인자: ${ctx.user.name}${input.notes ? ` (\n코멘트: ${input.notes})` : ""}`,
            referenceType: request.referenceType || undefined,
            referenceId: request.referenceId || undefined
          });
        }
        
        return result;
      }),

    // 일괄 승인 처리
    bulkApprove: monitorProcedure
      .input(
        z.object({
          requestIds: z.array(z.number()),
          notes: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { approveRequest, getApprovalRequestById, createNotification } = await import("../../db");
        
        const results = [];
        const errors = [];
        
        for (const requestId of input.requestIds) {
          try {
            const result = await approveRequest(requestId, ctx.user.id, input.notes);
            results.push({ requestId, success: true, result });
            
            const request = await getApprovalRequestById(requestId);
            if (request) {
              await createNotification({
                tenantId: ctx.tenantId,
            userId: request.requestedBy,
                notificationType: "approval_completed",
                title: "승인 완료",
                message: `"${request.title}" 요청이 승인되었습니다. 승인자: ${ctx.user.name}${input.notes ? ` (코멘트: ${input.notes})` : ""}`,
                referenceType: request.referenceType || undefined,
                referenceId: request.referenceId || undefined
              });
            }
          } catch (error: any) {
            errors.push({ requestId, error: error.message });
            results.push({ requestId, success: false, error: error.message });
          }
        }
        
        return {
          total: input.requestIds.length,
          succeeded: results.filter(r => r.success).length,
          failed: errors.length,
          results,
          errors
        };
      }),

    // 거부 처리
    reject: monitorProcedure
      .input(
        z.object({
          requestId: z.number(),
          rejectionReason: z.string()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { rejectRequest, getApprovalRequestById, createNotification } = await import("../../db");
        
        // 거부 처리
        const result = await rejectRequest(input.requestId, ctx.user.id, input.rejectionReason);
        
        // 요청 정보 조회
        const request = await getApprovalRequestById(input.requestId);
        if (request) {
          // 요청자에게 알림 전송
          await createNotification({
            tenantId: ctx.tenantId,
            userId: request.requestedBy,
            notificationType: "approval_rejected",
            title: "승인 거부",
            message: `"${request.title}" 요청이 거부되었습니다. 거부 사유: ${input.rejectionReason}`,
            referenceType: request.referenceType || undefined,
            referenceId: request.referenceId || undefined
          });
        }
        
        return result;
      }),

    // 승인 이력 조회
    getHistory: tenantRequiredProcedure
      .input(z.object({ requestId: z.number() }))
      .query(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        const { getApprovalHistory } = await import("../../db");
        return await getApprovalHistory(input.requestId, tenantId ?? undefined);
      }),

    // 대기 중인 승인 요청 개수
    getPendingCount: tenantRequiredProcedure.query(async ({ ctx }) => {
      const { getPendingApprovalCount } = await import("../../db");
      return await getPendingApprovalCount(ctx.tenantId);
    }),

    // 재고 조정 승인 요청
    requestInventoryAdjustment: workerProcedure
      .input(
        z.object({
          adjustmentId: z.number(),
          title: z.string(),
          description: z.string().optional(),
          priority: z.enum(["low", "medium", "high", "urgent"]).optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { createApprovalRequest } = await import("../../db");
        const requestId = await createApprovalRequest({
          tenantId: ctx.tenantId,
          siteId: (ctx.user.siteId || ctx.tenantId) as number,
          requestType: "inventory_adjustment",
          referenceType: "inventory_adjustment",
          referenceId: input.adjustmentId,
          title: input.title,
          description: input.description,
          priority: input.priority,
          requestedBy: ctx.user.id
        });
        return { success: true, requestId };
      }),

    // 승인 요청 취소
    cancelRequest: tenantRequiredProcedure
      .input(
        z.object({
          requestId: z.number(),
          reason: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { cancelApprovalRequest } = await import("../../db");
        return await cancelApprovalRequest(input.requestId, ctx.user.id, input.reason);
      }),
    // 승인 요청 삭제 (관리자: 모든 상태, 일반: pending/cancelled만)
    deleteRequest: tenantRequiredProcedure
      .input(
        z.object({
          requestId: z.number()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { getApprovalRequestById } = await import("../../db");
        const db = (await import("../../db")).getDb();
        const dbConn = await db;
        if (!dbConn) throw new Error("DB 연결 실패");

        const request = await getApprovalRequestById(input.requestId);
        if (!request) {
          throw new TRPCError({ code: "NOT_FOUND", message: "승인 요청을 찾을 수 없습니다" });
        }

        // 관리자가 아니면 pending/cancelled 상태만 삭제 가능
        if (ctx.user.role !== 'admin') {
          if (!['pending', 'cancelled', 'rejected'].includes(request.status || "")) {
            throw new TRPCError({ code: "FORBIDDEN", message: "관리자만 승인완료 문서를 삭제할 수 있습니다" });
          }
          if (request.requestedBy !== ctx.user.id) {
            throw new TRPCError({ code: "FORBIDDEN", message: "본인이 작성한 요청만 삭제할 수 있습니다" });
          }
        }

        const { sql: sqlTag } = await import("drizzle-orm");
        // 승인 이력 삭제
        await dbConn.execute(sqlTag`DELETE FROM h_approval_history WHERE request_id = ${input.requestId}`);
        // 승인 요청 삭제
        await dbConn.execute(sqlTag`DELETE FROM h_approval_requests WHERE id = ${input.requestId}`);

        return { success: true, message: "승인 요청이 삭제되었습니다." };
      }),

    // 승인 요청 일괄 삭제 (관리자 전용)
    deleteMultipleRequests: adminProcedure
      .input(
        z.object({
          requestIds: z.array(z.number())
        })
      )
      .mutation(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        const db = (await import("../../db")).getDb();
        const dbConn = await db;
        if (!dbConn) throw new Error("DB 연결 실패");

        if (input.requestIds.length === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "삭제할 항목을 선택해주세요" });
        }

        const { sql: sqlTag } = await import("drizzle-orm");
        const idList = input.requestIds.join(",");
        // 승인 이력 삭제 (tenant_id 필터 적용)
        await dbConn.execute(sqlTag`DELETE FROM h_approval_history WHERE request_id IN (${sqlTag.raw(idList)}) AND request_id IN (SELECT id FROM h_approval_requests WHERE tenant_id = ${tenantId})`);
        // 승인 요청 삭제 (tenant_id 필터 적용)
        await dbConn.execute(sqlTag`DELETE FROM h_approval_requests WHERE id IN (${sqlTag.raw(idList)}) AND tenant_id = ${tenantId}`);

        return { success: true, deletedCount: input.requestIds.length, message: `${input.requestIds.length}건의 승인 요청이 삭제되었습니다.` };
      }),

    // 검토 처리 (검토자 → pending_approval 단계)
    reviewRequest: monitorProcedure
      .input(
        z.object({
          requestId: z.number(),
          comments: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { reviewApprovalRequest } = await import("../../lib/production/autoApprovalRequest");
        const result = await reviewApprovalRequest(input.requestId, ctx.user.id, ctx.tenantId, input.comments);
        return result;
      }),

    // 최종 승인 처리 (승인자 → approved + 재고이동/회계연동 트리거)
    finalApprove: monitorProcedure
      .input(
        z.object({
          requestId: z.number(),
          comments: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { finalApproveRequest } = await import("../../lib/production/autoApprovalRequest");
        const result = await finalApproveRequest(input.requestId, ctx.user.id, ctx.tenantId, input.comments);

        // 승인 완료 알림 발송
        if (result.success) {
          try {
            const { getApprovalRequestById, createNotification } = await import("../../db");
            const request = await getApprovalRequestById(input.requestId);
            if (request) {
              await createNotification({
                tenantId: ctx.tenantId,
            userId: request.requestedBy,
                notificationType: "approval_completed",
                title: "최종 승인 완료",
                message: `"${request.title}" 승인이 완료되었습니다.${result.inventoryTriggered ? " 제품재고 이동 및 회계연동이 처리되었습니다." : ""}`,
                referenceType: request.referenceType || undefined,
                referenceId: request.referenceId || undefined
              });
            }
          } catch (notifyErr) {
            console.error("[finalApprove] 알림 발송 실패:", notifyErr);
          }
        }

        return result;
      }),

    /**
     * 작성자 사전 검토 완료 → 검토자 단계로 제출 — PR #264
     * pending_writer → pending_review 전이.
     * 작성자 본인 (또는 admin) 만 가능.
     */
    submitByWriter: workerProcedure
      .input(
        z.object({
          approvalRequestId: z.number(),
          notes: z.string().optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const { getRawConnection } = await import("../../db/connection");
        const conn = await getRawConnection();

        // 현재 상태 확인
        const [rows]: any = await conn.execute(
          `SELECT id, status, requested_by, tenant_id
           FROM h_approval_requests
           WHERE id = ? AND tenant_id = ? LIMIT 1`,
          [input.approvalRequestId, ctx.tenantId],
        );
        const row = (rows as any[])[0];
        if (!row) {
          throw new TRPCError({ code: "NOT_FOUND", message: "승인 요청을 찾을 수 없습니다" });
        }
        if (row.status !== "pending_writer") {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `현재 상태 (${row.status}) 에서는 작성자 제출이 불가합니다. pending_writer 상태에서만 가능.`,
          });
        }
        // 권한: 작성자 본인 또는 admin
        const isAuthor = Number(row.requested_by) === Number(ctx.user.id);
        const isAdmin = ctx.user.role === "admin" || ctx.user.role === "super_admin";
        if (!isAuthor && !isAdmin) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "작성자 본인 또는 관리자만 제출할 수 있습니다",
          });
        }

        // pending_review 로 전이 (검토자 단계)
        await conn.execute(
          `UPDATE h_approval_requests
           SET status = 'pending_review',
               description = CASE
                 WHEN ? IS NOT NULL AND CHAR_LENGTH(?) > 0
                   THEN CONCAT(IFNULL(description, ''), '\n\n[작성자 메모] ', ?)
                 ELSE description
               END
           WHERE id = ? AND tenant_id = ?`,
          [input.notes ?? null, input.notes ?? "", input.notes ?? "", input.approvalRequestId, ctx.tenantId],
        );

        return { success: true, status: "pending_review" };
      }),

    /**
     * 작성자 사전 검토 완료 → 검토자 단계로 *일괄* 제출 — 2026-05-09 추가
     * pending_writer → pending_review 전이.
     * 작성자 본인 (또는 admin) 만 가능. 권한 없는 항목 / 상태 불일치 항목은 skipped 로 분류.
     */
    bulkSubmitByWriter: workerProcedure
      .input(
        z.object({
          approvalRequestIds: z.array(z.number().int().positive()).min(1).max(500),
          notes: z.string().optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const { getRawConnection } = await import("../../db/connection");
        const conn = await getRawConnection();

        const placeholders = input.approvalRequestIds.map(() => "?").join(",");
        const [rows]: any = await conn.execute(
          `SELECT id, status, requested_by
             FROM h_approval_requests
            WHERE tenant_id = ? AND id IN (${placeholders})`,
          [ctx.tenantId, ...input.approvalRequestIds],
        );
        const list = (rows as any[]) || [];

        const isAdmin = ctx.user.role === "admin" || ctx.user.role === "super_admin";
        const submitted: number[] = [];
        const skipped: { id: number; reason: string }[] = [];

        for (const reqId of input.approvalRequestIds) {
          const row = list.find((r: any) => Number(r.id) === Number(reqId));
          if (!row) {
            skipped.push({ id: reqId, reason: "not_found" });
            continue;
          }
          if (row.status !== "pending_writer") {
            skipped.push({ id: reqId, reason: `invalid_status:${row.status}` });
            continue;
          }
          const isAuthor = Number(row.requested_by) === Number(ctx.user.id);
          if (!isAuthor && !isAdmin) {
            skipped.push({ id: reqId, reason: "forbidden" });
            continue;
          }
          submitted.push(reqId);
        }

        if (submitted.length > 0) {
          const ph = submitted.map(() => "?").join(",");
          await conn.execute(
            `UPDATE h_approval_requests
                SET status = 'pending_review',
                    description = CASE
                      WHEN ? IS NOT NULL AND CHAR_LENGTH(?) > 0
                        THEN CONCAT(IFNULL(description, ''), '\n\n[작성자 메모] ', ?)
                      ELSE description
                    END
              WHERE tenant_id = ? AND id IN (${ph}) AND status = 'pending_writer'`,
            [input.notes ?? null, input.notes ?? "", input.notes ?? "", ctx.tenantId, ...submitted],
          );
        }

        return {
          success: true,
          submittedCount: submitted.length,
          skippedCount: skipped.length,
          submitted,
          skipped,
        };
      }),

    /**
     * 작성자 사전 검토 대기 카운트 — 사이드바 뱃지용
     */
    pendingWriterCount: tenantRequiredProcedure.query(async ({ ctx }) => {
      const { getRawConnection } = await import("../../db/connection");
      const conn = await getRawConnection();
      const [rows]: any = await conn.execute(
        `SELECT COUNT(*) AS cnt
         FROM h_approval_requests
         WHERE tenant_id = ? AND status = 'pending_writer' AND requested_by = ?`,
        [ctx.tenantId, ctx.user.id],
      );
      return Number((rows as any[])[0]?.cnt || 0);
    }),

    /**
     * 첨부 파일 업로드 — PR #265
     * 작성자 사전 검토 단계 (pending_writer) 에서 사진 / 문서 첨부.
     * Base64 → S3 → DB row.
     */
    uploadAttachment: workerProcedure
      .input(
        z.object({
          approvalRequestId: z.number(),
          fileName: z.string().min(1),
          mimeType: z.string().min(1),
          /** Base64 (data: 접두사 제외) */
          fileBase64: z.string().min(1),
          attachmentType: z.enum(["photo", "document", "other"]).default("photo"),
          caption: z.string().optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const { storagePut } = await import("../../storage");
        const { getRawConnection } = await import("../../db/connection");

        // 권한 체크: 승인 요청 작성자 또는 admin
        const conn = await getRawConnection();
        const [rows]: any = await conn.execute(
          `SELECT requested_by, status FROM h_approval_requests WHERE id = ? AND tenant_id = ?`,
          [input.approvalRequestId, ctx.tenantId],
        );
        const row = (rows as any[])[0];
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "승인 요청을 찾을 수 없습니다" });
        const isAuthor = Number(row.requested_by) === Number(ctx.user.id);
        const isAdmin = ctx.user.role === "admin" || ctx.user.role === "super_admin";
        if (!isAuthor && !isAdmin) {
          throw new TRPCError({ code: "FORBIDDEN", message: "작성자 본인 또는 관리자만 첨부 가능" });
        }

        // S3 업로드 — key: tenants/{tenantId}/approval-attachments/{approvalId}/{ts}-{filename}
        const buf = Buffer.from(input.fileBase64, "base64");
        const ts = Date.now();
        const safeName = input.fileName.replace(/[^가-힣a-zA-Z0-9._-]/g, "_");
        const key = `tenants/${ctx.tenantId}/approval-attachments/${input.approvalRequestId}/${ts}-${safeName}`;
        const { url } = await storagePut(key, buf, input.mimeType);

        // DB 저장
        const [insertResult]: any = await conn.execute(
          `INSERT INTO h_approval_attachments
             (tenant_id, approval_request_id, file_url, file_name, file_size, mime_type, attachment_type, caption, uploaded_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            ctx.tenantId,
            input.approvalRequestId,
            url,
            input.fileName,
            buf.length,
            input.mimeType,
            input.attachmentType,
            input.caption ?? null,
            ctx.user.id,
          ],
        );

        return { success: true, id: Number(insertResult.insertId), url };
      }),

    /**
     * 첨부 파일 목록 조회
     */
    listAttachments: tenantRequiredProcedure
      .input(z.object({ approvalRequestId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getRawConnection } = await import("../../db/connection");
        const conn = await getRawConnection();
        const [rows]: any = await conn.execute(
          `SELECT id, file_url, file_name, file_size, mime_type, attachment_type, caption, uploaded_by, uploaded_at
           FROM h_approval_attachments
           WHERE tenant_id = ? AND approval_request_id = ?
           ORDER BY uploaded_at DESC`,
          [ctx.tenantId, input.approvalRequestId],
        );
        return (rows as any[]).map((r) => ({
          id: Number(r.id),
          fileUrl: String(r.file_url),
          fileName: String(r.file_name),
          fileSize: r.file_size ? Number(r.file_size) : null,
          mimeType: r.mime_type ? String(r.mime_type) : null,
          attachmentType: String(r.attachment_type),
          caption: r.caption ? String(r.caption) : null,
          uploadedBy: Number(r.uploaded_by),
          uploadedAt: r.uploaded_at,
        }));
      }),

    /**
     * 첨부 파일 삭제 — 작성자 본인 / admin
     */
    deleteAttachment: workerProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { getRawConnection } = await import("../../db/connection");
        const conn = await getRawConnection();
        const [rows]: any = await conn.execute(
          `SELECT uploaded_by FROM h_approval_attachments WHERE id = ? AND tenant_id = ?`,
          [input.id, ctx.tenantId],
        );
        const row = (rows as any[])[0];
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "첨부 파일을 찾을 수 없습니다" });
        const isUploader = Number(row.uploaded_by) === Number(ctx.user.id);
        const isAdmin = ctx.user.role === "admin" || ctx.user.role === "super_admin";
        if (!isUploader && !isAdmin) {
          throw new TRPCError({ code: "FORBIDDEN", message: "업로더 본인 또는 관리자만 삭제 가능" });
        }
        await conn.execute(
          `DELETE FROM h_approval_attachments WHERE id = ? AND tenant_id = ?`,
          [input.id, ctx.tenantId],
        );
        return { success: true };
      }),

});

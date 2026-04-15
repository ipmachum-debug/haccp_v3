/**
 * 문서 승인 관리 tRPC 라우터
 */
import { z } from "zod";
import { router, tenantRequiredProcedure, adminProcedure } from "../../_core/trpc";
import { getDb } from "../../db";
import { eq, and, desc, gte, lte, inArray, sql } from "drizzle-orm";
import { assertSiteOwned, requireTenantId } from "../../helpers/tenantGuards";

import { todayKST } from "../../utils/timezone";

export const documentApprovalRouter = router({
  // ============================================================================
  // 승인 대기 문서 목록 조회
  // ============================================================================
  getPendingDocuments: tenantRequiredProcedure
    .input(
      z.object({
        siteId: z.number(),
        status: z.enum(['pending_review', 'pending_approval']).optional(),
        documentTypeCode: z.string().optional(),
        workDateFrom: z.string().optional(),
        workDateTo: z.string().optional(),
        page: z.number().default(1),
        limit: z.number().default(20),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");
      const tenantId = requireTenantId(ctx);
      await assertSiteOwned(ctx, input.siteId);

      // 동적 WHERE 조건 구성
      const conditions: any[] = [
        sql`di.tenant_id = ${tenantId}`,
        sql`di.site_id = ${input.siteId}`,
      ];

      if (input.status) {
        conditions.push(sql`di.status = ${input.status}`);
      } else {
        conditions.push(sql`di.status IN ('pending_review', 'pending_approval')`);
      }

      if (input.documentTypeCode) {
        conditions.push(sql`dt.code = ${input.documentTypeCode}`);
      }

      if (input.workDateFrom) {
        conditions.push(sql`di.work_date >= ${input.workDateFrom}`);
      }

      if (input.workDateTo) {
        conditions.push(sql`di.work_date <= ${input.workDateTo}`);
      }

      const whereClause = conditions.length > 0 
        ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
        : sql``;

      // 총 개수 조회
      const countQuery = sql`
        SELECT COUNT(*) as total
        FROM document_instances di
        JOIN document_types dt ON di.document_type_id = dt.id
        ${whereClause}
      `;
      
      const countResult = await db.execute(countQuery);
      const total = (countResult[0] as any).total;

      // 페이지네이션
      const offset = (input.page - 1) * input.limit;

      // 문서 목록 조회
      const query = sql`
        SELECT 
          di.id,
          di.site_id,
          dt.id as document_type_id,
          dt.code as document_type_code,
          dt.name as document_type_name,
          dt.category as document_category,
          di.batch_id,
          di.product_id,
          di.work_date,
          di.status,
          di.created_by,
          di.created_at,
          di.reviewer_id,
          di.reviewed_at,
          di.review_comments,
          di.approver_id,
          di.is_auto_generated,
          di.auto_approval_enabled,
          CASE 
            WHEN di.status = 'pending_review' THEN di.reviewer_id
            WHEN di.status = 'pending_approval' THEN di.approver_id
            ELSE NULL
          END as pending_user_id
        FROM document_instances di
        JOIN document_types dt ON di.document_type_id = dt.id
        ${whereClause}
        ORDER BY di.work_date DESC, di.created_at DESC
        LIMIT ${input.limit} OFFSET ${offset}
      `;

      const documents = await db.execute(query);

      return {
        documents,
        pagination: {
          page: input.page,
          limit: input.limit,
          total,
          totalPages: Math.ceil(total / input.limit),
        },
      };
    }),

  // ============================================================================
  // 문서 검토 (작성자 → 검토자)
  // ============================================================================
  reviewDocument: tenantRequiredProcedure
    .input(
      z.object({
        documentId: z.number(),
        action: z.enum(['approve', 'reject']),
        comments: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");
      const tenantId = requireTenantId(ctx);

      // 문서 조회 (테넌트 격리)
      const documentQuery = sql`
        SELECT * FROM document_instances WHERE id = ${input.documentId} AND tenant_id = ${tenantId}
      `;
      const documentResult = await db.execute(documentQuery);
      const document = (documentResult[0] as any);

      if (!document) {
        throw new Error("문서를 찾을 수 없습니다");
      }

      if (document.status !== 'pending_review') {
        throw new Error("검토 대기 상태가 아닙니다");
      }

      // 검토자 권한 확인
      if (document.reviewer_id && document.reviewer_id !== ctx.user.id) {
        throw new Error("검토 권한이 없습니다");
      }

      const now = new Date().toISOString();

      if (input.action === 'approve') {
        // 검토 승인 → 승인 대기 상태로 변경
        await db.execute(sql`
          UPDATE document_instances
          SET 
            status = 'pending_approval',
            reviewer_id = ${ctx.user.id},
            reviewed_at = ${now},
            review_comments = ${input.comments || null},
            updated_at = ${now}
          WHERE id = ${input.documentId} AND tenant_id = ${tenantId}
        `);

        // 이력 기록
        await db.execute(sql`
          INSERT INTO document_approval_history 
          (tenant_id, document_instance_id, action, actor_id, actor_role, comments, previous_status, new_status, created_at)
          VALUES 
          (${tenantId}, ${input.documentId}, 'reviewed', ${ctx.user.id}, 'reviewer', ${input.comments || null}, 'pending_review', 'pending_approval', ${now})
        `);

        return { success: true, message: "검토가 완료되었습니다. 승인 대기 중입니다." };
      } else {
        // 검토 반려 → 초안 상태로 변경
        await db.execute(sql`
          UPDATE document_instances
          SET 
            status = 'draft',
            reviewer_id = ${ctx.user.id},
            reviewed_at = ${now},
            review_comments = ${input.comments || null},
            rejected_by = ${ctx.user.id},
            rejected_at = ${now},
            rejection_reason = ${input.comments || null},
            updated_at = ${now}
          WHERE id = ${input.documentId} AND tenant_id = ${tenantId}
        `);

        // 이력 기록
        await db.execute(sql`
          INSERT INTO document_approval_history 
          (tenant_id, document_instance_id, action, actor_id, actor_role, comments, previous_status, new_status, created_at)
          VALUES 
          (${tenantId}, ${input.documentId}, 'rejected', ${ctx.user.id}, 'reviewer', ${input.comments || null}, 'pending_review', 'draft', ${now})
        `);

        return { success: true, message: "문서가 반려되었습니다." };
      }
    }),

  // ============================================================================
  // 문서 승인 (검토자 → 승인자)
  // ============================================================================
  approveDocument: tenantRequiredProcedure
    .input(
      z.object({
        documentId: z.number(),
        action: z.enum(['approve', 'reject']),
        comments: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");
      const tenantId = requireTenantId(ctx);

      // 문서 조회 (테넌트 격리)
      const documentQuery = sql`
        SELECT * FROM document_instances WHERE id = ${input.documentId} AND tenant_id = ${tenantId}
      `;
      const documentResult = await db.execute(documentQuery);
      const document = (documentResult[0] as any);

      if (!document) {
        throw new Error("문서를 찾을 수 없습니다");
      }

      if (document.status !== 'pending_approval') {
        throw new Error("승인 대기 상태가 아닙니다");
      }

      // 승인자 권한 확인
      if (document.approver_id && document.approver_id !== ctx.user.id) {
        throw new Error("승인 권한이 없습니다");
      }

      const now = new Date().toISOString();

      if (input.action === 'approve') {
        // 최종 승인
        await db.execute(sql`
          UPDATE document_instances
          SET 
            status = 'approved',
            approver_id = ${ctx.user.id},
            approved_at = ${now},
            approval_comments = ${input.comments || null},
            updated_at = ${now}
          WHERE id = ${input.documentId} AND tenant_id = ${tenantId}
        `);

        // 이력 기록
        await db.execute(sql`
          INSERT INTO document_approval_history 
          (tenant_id, document_instance_id, action, actor_id, actor_role, comments, previous_status, new_status, created_at)
          VALUES 
          (${tenantId}, ${input.documentId}, 'approved', ${ctx.user.id}, 'approver', ${input.comments || null}, 'pending_approval', 'approved', ${now})
        `);

        return { success: true, message: "문서가 최종 승인되었습니다." };
      } else {
        // 승인 반려 → 검토 대기 상태로 변경
        await db.execute(sql`
          UPDATE document_instances
          SET 
            status = 'pending_review',
            approver_id = ${ctx.user.id},
            rejected_by = ${ctx.user.id},
            rejected_at = ${now},
            rejection_reason = ${input.comments || null},
            updated_at = ${now}
          WHERE id = ${input.documentId} AND tenant_id = ${tenantId}
        `);

        // 이력 기록
        await db.execute(sql`
          INSERT INTO document_approval_history 
          (tenant_id, document_instance_id, action, actor_id, actor_role, comments, previous_status, new_status, created_at)
          VALUES 
          (${tenantId}, ${input.documentId}, 'rejected', ${ctx.user.id}, 'approver', ${input.comments || null}, 'pending_approval', 'pending_review', ${now})
        `);

        return { success: true, message: "문서가 반려되었습니다. 재검토가 필요합니다." };
      }
    }),

  // ============================================================================
  // 승인 완료 문서 목록 조회
  // ============================================================================
  getApprovedDocuments: tenantRequiredProcedure
    .input(
      z.object({
        siteId: z.number(),
        documentTypeCode: z.string().optional(),
        category: z.string().optional(),
        workDateFrom: z.string().optional(),
        workDateTo: z.string().optional(),
        page: z.number().default(1),
        limit: z.number().default(20),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");
      const tenantId = requireTenantId(ctx);
      await assertSiteOwned(ctx, input.siteId);

      // 동적 WHERE 조건 구성
      const conditions: any[] = [
        sql`di.tenant_id = ${tenantId}`,
        sql`di.site_id = ${input.siteId}`,
        sql`di.status = 'approved'`,
      ];

      if (input.documentTypeCode) {
        conditions.push(sql`dt.code = ${input.documentTypeCode}`);
      }

      if (input.category) {
        conditions.push(sql`dt.category = ${input.category}`);
      }

      if (input.workDateFrom) {
        conditions.push(sql`di.work_date >= ${input.workDateFrom}`);
      }

      if (input.workDateTo) {
        conditions.push(sql`di.work_date <= ${input.workDateTo}`);
      }

      const whereClause = sql`WHERE ${sql.join(conditions, sql` AND `)}`;

      // 총 개수 조회
      const countQuery = sql`
        SELECT COUNT(*) as total
        FROM document_instances di
        JOIN document_types dt ON di.document_type_id = dt.id
        ${whereClause}
      `;
      
      const countResult = await db.execute(countQuery);
      const total = (countResult[0] as any).total;

      // 페이지네이션
      const offset = (input.page - 1) * input.limit;

      // 문서 목록 조회
      const query = sql`
        SELECT 
          di.id,
          di.site_id,
          dt.id as document_type_id,
          dt.code as document_type_code,
          dt.name as document_type_name,
          dt.category as document_category,
          di.batch_id,
          di.product_id,
          di.work_date,
          di.status,
          di.created_by,
          di.created_at,
          di.reviewer_id,
          di.reviewed_at,
          di.approver_id,
          di.approved_at,
          di.pdf_url,
          di.pdf_generated_at,
          di.is_auto_generated
        FROM document_instances di
        JOIN document_types dt ON di.document_type_id = dt.id
        ${whereClause}
        ORDER BY di.work_date DESC, di.approved_at DESC
        LIMIT ${input.limit} OFFSET ${offset}
      `;

      const documents = await db.execute(query);

      return {
        documents,
        pagination: {
          page: input.page,
          limit: input.limit,
          total,
          totalPages: Math.ceil(total / input.limit),
        },
      };
    }),

  // ============================================================================
  // 문서 승인 이력 조회
  // ============================================================================
  getApprovalHistory: tenantRequiredProcedure
    .input(z.object({ documentId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");
      const tenantId = requireTenantId(ctx);

      // 테넌트 격리: document_approval_history에도 tenant_id 조건 추가
      const query = sql`
        SELECT 
          dah.*,
          u.name as actor_name,
          u.email as actor_email
        FROM document_approval_history dah
        LEFT JOIN users u ON dah.actor_id = u.id
        WHERE dah.document_instance_id = ${input.documentId}
          AND dah.tenant_id = ${tenantId}
        ORDER BY dah.created_at ASC
      `;

      const history = await db.execute(query);

      return { history };
    }),

  // ============================================================================
  // 문서 타입 목록 조회
  // ============================================================================
  getDocumentTypes: tenantRequiredProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("데이터베이스 연결 실패");
    const tenantId = requireTenantId(ctx);

    const query = sql`
      SELECT * FROM document_types
      WHERE is_active = 1
        AND tenant_id = ${tenantId}
      ORDER BY category, name
    `;

    const types = await db.execute(query);

    return { types };
  }),

  // ============================================================================
  // 자동 승인 설정 조회
  // ============================================================================
  getAutoApprovalSettings: adminProcedure
    .input(z.object({ siteId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");
      const tenantId = requireTenantId(ctx);
      await assertSiteOwned(ctx, input.siteId);

      const query = sql`
        SELECT 
          daas.*,
          dt.code as document_type_code,
          dt.name as document_type_name
        FROM document_auto_approval_settings daas
        JOIN document_types dt ON daas.document_type_id = dt.id
        WHERE daas.site_id = ${input.siteId}
          AND daas.tenant_id = ${tenantId}
      `;

      const settings = await db.execute(query);

      return { settings };
    }),

  // ============================================================================
  // 자동 승인 설정 업데이트
  // ============================================================================
  updateAutoApprovalSettings: adminProcedure
    .input(
      z.object({
        siteId: z.number(),
        documentTypeId: z.number(),
        autoApprovalEnabled: z.boolean(),
        autoApprovalDelayMinutes: z.number().default(0),
        defaultReviewerId: z.number().optional(),
        defaultApproverId: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");
      const tenantId = requireTenantId(ctx);
      await assertSiteOwned(ctx, input.siteId);

      const now = new Date().toISOString();

      // UPSERT (tenant_id 포함)
      await db.execute(sql`
        INSERT INTO document_auto_approval_settings 
        (tenant_id, site_id, document_type_id, auto_approval_enabled, auto_approval_delay_minutes, default_reviewer_id, default_approver_id, created_at, updated_at)
        VALUES 
        (${tenantId}, ${input.siteId}, ${input.documentTypeId}, ${input.autoApprovalEnabled ? 1 : 0}, ${input.autoApprovalDelayMinutes}, ${input.defaultReviewerId || null}, ${input.defaultApproverId || null}, ${now}, ${now})
        ON DUPLICATE KEY UPDATE
          auto_approval_enabled = VALUES(auto_approval_enabled),
          auto_approval_delay_minutes = VALUES(auto_approval_delay_minutes),
          default_reviewer_id = VALUES(default_reviewer_id),
          default_approver_id = VALUES(default_approver_id),
          updated_at = VALUES(updated_at)
      `);

      return { success: true, message: "자동 승인 설정이 저장되었습니다." };
    }),

  // ============================================================================
  // 일괄 검토 (단절 5 보강)
  // ============================================================================
  bulkReview: tenantRequiredProcedure
    .input(
      z.object({
        documentIds: z.array(z.number()),
        action: z.enum(['approve', 'reject']),
        comments: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");
      const tenantId = requireTenantId(ctx);
      
      const now = new Date().toISOString();
      const results: { documentId: number; success: boolean; message: string }[] = [];
      
      for (const documentId of input.documentIds) {
        try {
          // 테넌트 격리
          const docResult = await db.execute(sql`
            SELECT * FROM document_instances WHERE id = ${documentId} AND tenant_id = ${tenantId}
          `);
          const doc = (docResult[0] as any);
          
          if (!doc) {
            results.push({ documentId, success: false, message: "문서를 찾을 수 없습니다" });
            continue;
          }
          if (doc.status !== 'pending_review') {
            results.push({ documentId, success: false, message: `상태 불일치: ${doc.status}` });
            continue;
          }
          
          if (input.action === 'approve') {
            await db.execute(sql`
              UPDATE document_instances
              SET status = 'pending_approval', reviewer_id = ${ctx.user.id}, reviewed_at = ${now}, review_comments = ${input.comments || null}, updated_at = ${now}
              WHERE id = ${documentId} AND tenant_id = ${tenantId}
            `);
            await db.execute(sql`
              INSERT INTO document_approval_history (tenant_id, document_instance_id, action, actor_id, actor_role, comments, previous_status, new_status, created_at)
              VALUES (${tenantId}, ${documentId}, 'reviewed', ${ctx.user.id}, 'reviewer', ${input.comments || null}, 'pending_review', 'pending_approval', ${now})
            `);
            results.push({ documentId, success: true, message: "검토 승인" });
          } else {
            await db.execute(sql`
              UPDATE document_instances
              SET status = 'rejected', reviewer_id = ${ctx.user.id}, rejected_by = ${ctx.user.id}, rejected_at = ${now}, rejection_reason = ${input.comments || null}, updated_at = ${now}
              WHERE id = ${documentId} AND tenant_id = ${tenantId}
            `);
            await db.execute(sql`
              INSERT INTO document_approval_history (tenant_id, document_instance_id, action, actor_id, actor_role, comments, previous_status, new_status, created_at)
              VALUES (${tenantId}, ${documentId}, 'rejected', ${ctx.user.id}, 'reviewer', ${input.comments || null}, 'pending_review', 'rejected', ${now})
            `);
            results.push({ documentId, success: true, message: "검토 반려" });
          }
        } catch (err) {
          results.push({ documentId, success: false, message: err instanceof Error ? err.message : "오류 발생" });
        }
      }
      
      const successCount = results.filter(r => r.success).length;
      return {
        success: true,
        message: `${successCount}/${input.documentIds.length}건 일괄 검토 완료`,
        results,
      };
    }),

  // ============================================================================
  // 일괄 승인 (단절 5 보강)
  // ============================================================================
  bulkApprove: tenantRequiredProcedure
    .input(
      z.object({
        documentIds: z.array(z.number()),
        action: z.enum(['approve', 'reject']),
        comments: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");
      const tenantId = requireTenantId(ctx);
      
      const now = new Date().toISOString();
      const results: { documentId: number; success: boolean; message: string }[] = [];
      
      for (const documentId of input.documentIds) {
        try {
          // 테넌트 격리
          const docResult = await db.execute(sql`
            SELECT * FROM document_instances WHERE id = ${documentId} AND tenant_id = ${tenantId}
          `);
          const doc = (docResult[0] as any);
          
          if (!doc) {
            results.push({ documentId, success: false, message: "문서를 찾을 수 없습니다" });
            continue;
          }
          if (doc.status !== 'pending_approval') {
            results.push({ documentId, success: false, message: `상태 불일치: ${doc.status}` });
            continue;
          }
          
          if (input.action === 'approve') {
            await db.execute(sql`
              UPDATE document_instances
              SET status = 'approved', approver_id = ${ctx.user.id}, approved_at = ${now}, approval_comments = ${input.comments || null}, updated_at = ${now}
              WHERE id = ${documentId} AND tenant_id = ${tenantId}
            `);
            await db.execute(sql`
              INSERT INTO document_approval_history (tenant_id, document_instance_id, action, actor_id, actor_role, comments, previous_status, new_status, created_at)
              VALUES (${tenantId}, ${documentId}, 'approved', ${ctx.user.id}, 'approver', ${input.comments || null}, 'pending_approval', 'approved', ${now})
            `);
            results.push({ documentId, success: true, message: "최종 승인" });
          } else {
            await db.execute(sql`
              UPDATE document_instances
              SET status = 'pending_review', approver_id = ${ctx.user.id}, rejected_by = ${ctx.user.id}, rejected_at = ${now}, rejection_reason = ${input.comments || null}, updated_at = ${now}
              WHERE id = ${documentId} AND tenant_id = ${tenantId}
            `);
            await db.execute(sql`
              INSERT INTO document_approval_history (tenant_id, document_instance_id, action, actor_id, actor_role, comments, previous_status, new_status, created_at)
              VALUES (${tenantId}, ${documentId}, 'rejected', ${ctx.user.id}, 'approver', ${input.comments || null}, 'pending_approval', 'pending_review', ${now})
            `);
            results.push({ documentId, success: true, message: "승인 반려" });
          }
        } catch (err) {
          results.push({ documentId, success: false, message: err instanceof Error ? err.message : "오류 발생" });
        }
      }
      
      const successCount = results.filter(r => r.success).length;
      return {
        success: true,
        message: `${successCount}/${input.documentIds.length}건 일괄 승인 처리 완료`,
        results,
      };
    }),

  // ============================================================================
  // 승인 대기 문서 요약 (대시보드용)
  // ============================================================================
  getPendingSummary: tenantRequiredProcedure
    .input(z.object({ siteId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");
      const tenantId = requireTenantId(ctx);
      await assertSiteOwned(ctx, input.siteId);
      
      const query = sql`
        SELECT 
          di.status,
          COUNT(*) as count,
          dt.category
        FROM document_instances di
        JOIN document_types dt ON di.document_type_id = dt.id
        WHERE di.tenant_id = ${tenantId}
          AND di.site_id = ${input.siteId}
          AND di.status IN ('pending_review', 'pending_approval')
        GROUP BY di.status, dt.category
      `;
      const summary = await db.execute(query);
      
      // 오늘 날짜 기준 문서 수 (테넌트 격리)
      const today = todayKST();
      const todayQuery = sql`
        SELECT COUNT(*) as count
        FROM document_instances
        WHERE tenant_id = ${tenantId}
          AND site_id = ${input.siteId}
          AND work_date = ${today}
      `;
      const todayResult = await db.execute(todayQuery);
      
      return {
        pendingByStatus: summary,
        todayDocumentCount: (todayResult[0] as any)?.count || 0,
      };
    }),
});

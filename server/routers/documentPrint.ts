/**
import { generateDocumentPDF, generateBatchPrintPDF } from "../documentPDFGenerator";
 * 문서 출력 관리 tRPC 라우터
 */
import { z } from "zod";
import { router, tenantRequiredProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { assertSiteOwned, requireTenantId } from "../helpers/tenantGuards";

export const documentPrintRouter = router({
  // ============================================================================
  // 출력 가능한 문서 목록 조회 (강력한 필터링)
  // ============================================================================
  getPrintableDocuments: tenantRequiredProcedure
    .input(
      z.object({
        siteId: z.number(),
        // 날짜 필터
        workDateFrom: z.string().optional(),
        workDateTo: z.string().optional(),
        // 카테고리 필터
        category: z.enum(['production', 'ccp', 'inspection', 'training', 'hygiene', 'prerequisite', 'other']).optional(),
        // 문서 타입 필터
        documentTypeCode: z.string().optional(),
        // 배치 필터
        batchId: z.number().optional(),
        // 제품 필터
        productId: z.number().optional(),
        // 검색어
        searchKeyword: z.string().optional(),
        // 정렬
        sortBy: z.enum(['work_date', 'document_type', 'approved_at']).default('work_date'),
        sortOrder: z.enum(['asc', 'desc']).default('desc'),
        // 페이지네이션
        page: z.number().default(1),
        limit: z.number().default(50),
      })
    )
    .query(async ({ ctx, input }) => {
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

      if (input.workDateFrom) {
        conditions.push(sql`di.work_date >= ${input.workDateFrom}`);
      }

      if (input.workDateTo) {
        conditions.push(sql`di.work_date <= ${input.workDateTo}`);
      }

      if (input.category) {
        conditions.push(sql`dt.category = ${input.category}`);
      }

      if (input.documentTypeCode) {
        conditions.push(sql`dt.code = ${input.documentTypeCode}`);
      }

      if (input.batchId) {
        conditions.push(sql`di.batch_id = ${input.batchId}`);
      }

      if (input.productId) {
        conditions.push(sql`di.product_id = ${input.productId}`);
      }

      if (input.searchKeyword) {
        conditions.push(sql`(
          dt.name LIKE ${`%${input.searchKeyword}%`} OR
          dt.code LIKE ${`%${input.searchKeyword}%`}
        )`);
      }

      const whereClause = sql`WHERE ${sql.join(conditions, sql` AND `)}`;

      // 정렬 조건
      let orderByClause = sql`ORDER BY di.work_date DESC, di.approved_at DESC`;
      if (input.sortBy === 'document_type') {
        orderByClause = input.sortOrder === 'asc' 
          ? sql`ORDER BY dt.name ASC, di.work_date DESC`
          : sql`ORDER BY dt.name DESC, di.work_date DESC`;
      } else if (input.sortBy === 'approved_at') {
        orderByClause = input.sortOrder === 'asc'
          ? sql`ORDER BY di.approved_at ASC`
          : sql`ORDER BY di.approved_at DESC`;
      } else {
        orderByClause = input.sortOrder === 'asc'
          ? sql`ORDER BY di.work_date ASC`
          : sql`ORDER BY di.work_date DESC`;
      }

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
          di.is_auto_generated,
          p.name as product_name,
          b.batch_number as batch_number
        FROM document_instances di
        JOIN document_types dt ON di.document_type_id = dt.id
        LEFT JOIN products p ON di.product_id = p.id
        LEFT JOIN batches b ON di.batch_id = b.id
        ${whereClause}
        ${orderByClause}
        LIMIT ${input.limit} OFFSET ${offset}
      `;

      const documents = await db.execute(query);

      // 카테고리별 통계
      const statsQuery = sql`
        SELECT 
          dt.category,
          COUNT(*) as count
        FROM document_instances di
        JOIN document_types dt ON di.document_type_id = dt.id
        ${whereClause}
        GROUP BY dt.category
      `;

      const stats = await db.execute(statsQuery);

      return {
        documents,
        stats,
        pagination: {
          page: input.page,
          limit: input.limit,
          total,
          totalPages: Math.ceil(total / input.limit),
        },
      };
    }),

  // ============================================================================
  // 개별 문서 PDF 생성
  // ============================================================================
  generateDocumentPDF: tenantRequiredProcedure
    .input(z.object({ documentId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");
      const tenantId = requireTenantId(ctx);

      // 문서 조회 (테넌트 격리)
      const documentQuery = sql`
        SELECT 
          di.*,
          dt.code as document_type_code,
          dt.name as document_type_name,
          dt.template_path
        FROM document_instances di
        JOIN document_types dt ON di.document_type_id = dt.id
        WHERE di.id = ${input.documentId} AND di.tenant_id = ${tenantId}
      `;
      const documentResult = await db.execute(documentQuery);
      const document = (documentResult[0] as any);

      if (!document) {
        throw new Error("문서를 찾을 수 없습니다");
      }

      if (document.status !== 'approved') {
        throw new Error("승인된 문서만 출력할 수 있습니다");
      }

      // PDF 생성 미구현 - 가짜 URL을 DB에 저장하지 않음
      // TODO: jsPDF 또는 서버사이드 PDF 생성 구현 후 실제 URL 저장
      return {
        success: false,
        pdfUrl: null,
        message: "PDF 생성 기능이 아직 구현되지 않았습니다. 관리자에게 문의하세요."
      };
    }),

  // ============================================================================
  // 선택 문서 일괄 출력 그룹 생성
  // ============================================================================
  createBatchPrintGroup: tenantRequiredProcedure
    .input(
      z.object({
        siteId: z.number(),
        workDate: z.string(),
        documentIds: z.array(z.number()),
        groupName: z.string().optional(),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");
      const tenantId = requireTenantId(ctx);
      await assertSiteOwned(ctx, input.siteId);

      if (input.documentIds.length === 0) {
        throw new Error("출력할 문서를 선택해주세요");
      }

      const now = new Date().toISOString();
      const groupName = input.groupName || `${input.workDate} 일일 문서`;

      // 출력 그룹 생성 (tenant_id 포함)
      const insertGroupQuery = sql`
        INSERT INTO document_batch_print_groups 
        (tenant_id, site_id, work_date, group_name, description, total_documents, printed_by, printed_at, created_at, updated_at)
        VALUES 
        (${tenantId}, ${input.siteId}, ${input.workDate}, ${groupName}, ${input.description || null}, ${input.documentIds.length}, ${ctx.user.id}, ${now}, ${now}, ${now})
      `;

      const groupResult = await db.execute(insertGroupQuery);
      const groupId = (groupResult as any).insertId;

      // 문서 매핑 추가
      for (let i = 0; i < input.documentIds.length; i++) {
        await db.execute(sql`
          INSERT INTO document_batch_print_items 
          (batch_print_group_id, document_instance_id, sort_order, created_at)
          VALUES 
          (${groupId}, ${input.documentIds[i]}, ${i}, ${now})
        `);
      }

      return { 
        success: true, 
        groupId,
        message: `${input.documentIds.length}개 문서가 출력 그룹에 추가되었습니다.` 
      };
    }),

  // ============================================================================
  // 일괄 출력 그룹 통합 PDF 생성
  // ============================================================================
  generateBatchPDF: tenantRequiredProcedure
    .input(z.object({ groupId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");
      const tenantId = requireTenantId(ctx);

      // 출력 그룹 조회 (테넌트 격리)
      const groupQuery = sql`
        SELECT * FROM document_batch_print_groups WHERE id = ${input.groupId} AND tenant_id = ${tenantId}
      `;
      const groupResult = await db.execute(groupQuery);
      const group = (groupResult[0] as any);

      if (!group) {
        throw new Error("출력 그룹을 찾을 수 없습니다");
      }

      // 그룹에 포함된 문서 목록 조회
      const documentsQuery = sql`
        SELECT 
          di.*,
          dt.code as document_type_code,
          dt.name as document_type_name,
          dt.category as document_category,
          dbpi.sort_order
        FROM document_batch_print_items dbpi
        JOIN document_instances di ON dbpi.document_instance_id = di.id
        JOIN document_types dt ON di.document_type_id = dt.id
        WHERE dbpi.batch_print_group_id = ${input.groupId}
          AND di.tenant_id = ${tenantId}
        ORDER BY dbpi.sort_order ASC
      `;

      const documents = await db.execute(documentsQuery);

      // PDF 생성 미구현 - 가짜 URL을 DB에 저장하지 않음
      // TODO: 통합 PDF 생성 구현 후 실제 URL 저장

      return {
        success: false,
        pdfUrl: null,
        documentCount: (documents[0] as any[])?.length || 0,
        message: "통합 PDF 생성 기능이 아직 구현되지 않았습니다. 관리자에게 문의하세요."
      };
    }),

  // ============================================================================
  // 출력 이력 조회
  // ============================================================================
  getPrintHistory: tenantRequiredProcedure
    .input(
      z.object({
        siteId: z.number(),
        workDateFrom: z.string().optional(),
        workDateTo: z.string().optional(),
        page: z.number().default(1),
        limit: z.number().default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");
      const tenantId = requireTenantId(ctx);
      await assertSiteOwned(ctx, input.siteId);

      // 동적 WHERE 조건 구성
      const conditions: any[] = [
        sql`dbpg.tenant_id = ${tenantId}`,
        sql`dbpg.site_id = ${input.siteId}`,
      ];

      if (input.workDateFrom) {
        conditions.push(sql`dbpg.work_date >= ${input.workDateFrom}`);
      }

      if (input.workDateTo) {
        conditions.push(sql`dbpg.work_date <= ${input.workDateTo}`);
      }

      const whereClause = sql`WHERE ${sql.join(conditions, sql` AND `)}`;

      // 총 개수 조회
      const countQuery = sql`
        SELECT COUNT(*) as total
        FROM document_batch_print_groups dbpg
        ${whereClause}
      `;
      
      const countResult = await db.execute(countQuery);
      const total = (countResult[0] as any).total;

      // 페이지네이션
      const offset = (input.page - 1) * input.limit;

      // 출력 이력 조회
      const query = sql`
        SELECT 
          dbpg.*,
          u.name as printed_by_name,
          u.email as printed_by_email
        FROM document_batch_print_groups dbpg
        LEFT JOIN users u ON dbpg.printed_by = u.id
        ${whereClause}
        ORDER BY dbpg.printed_at DESC
        LIMIT ${input.limit} OFFSET ${offset}
      `;

      const history = await db.execute(query);

      return {
        history,
        pagination: {
          page: input.page,
          limit: input.limit,
          total,
          totalPages: Math.ceil(total / input.limit),
        },
      };
    }),

  // ============================================================================
  // 출력 그룹 상세 조회
  // ============================================================================
  getPrintGroupDetail: tenantRequiredProcedure
    .input(z.object({ groupId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");
      const tenantId = requireTenantId(ctx);

      // 출력 그룹 조회 (테넌트 격리)
      const groupQuery = sql`
        SELECT 
          dbpg.*,
          u.name as printed_by_name,
          u.email as printed_by_email
        FROM document_batch_print_groups dbpg
        LEFT JOIN users u ON dbpg.printed_by = u.id
        WHERE dbpg.id = ${input.groupId} AND dbpg.tenant_id = ${tenantId}
      `;
      const groupResult = await db.execute(groupQuery);
      const group = (groupResult[0] as any);

      if (!group) {
        throw new Error("출력 그룹을 찾을 수 없습니다");
      }

      // 그룹에 포함된 문서 목록 조회 (테넌트 격리)
      const documentsQuery = sql`
        SELECT 
          di.*,
          dt.code as document_type_code,
          dt.name as document_type_name,
          dt.category as document_category,
          dbpi.sort_order
        FROM document_batch_print_items dbpi
        JOIN document_instances di ON dbpi.document_instance_id = di.id
        JOIN document_types dt ON di.document_type_id = dt.id
        WHERE dbpi.batch_print_group_id = ${input.groupId}
          AND di.tenant_id = ${tenantId}
        ORDER BY dbpi.sort_order ASC
      `;

      const documents = await db.execute(documentsQuery);

      return {
        group,
        documents,
      };
    }),

  // ============================================================================
  // 문서 삭제 (권한 있는 경우)
  // ============================================================================
  deleteDocument: tenantRequiredProcedure
    .input(z.object({ documentId: z.number() }))
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

      // 권한 확인 (작성자 또는 관리자만 삭제 가능)
      if (document.created_by !== ctx.user.id && ctx.user.role !== 'admin') {
        throw new Error("삭제 권한이 없습니다");
      }

      // 승인된 문서는 삭제 불가
      if (document.status === 'approved') {
        throw new Error("승인된 문서는 삭제할 수 없습니다");
      }

      // 문서 삭제 (테넌트 조건)
      await db.execute(sql`
        DELETE FROM document_instances WHERE id = ${input.documentId} AND tenant_id = ${tenantId}
      `);

      return { 
        success: true, 
        message: "문서가 삭제되었습니다." 
      };
    }),

  // ============================================================================
  // 출력 그룹 삭제
  // ============================================================================
  deletePrintGroup: tenantRequiredProcedure
    .input(z.object({ groupId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");
      const tenantId = requireTenantId(ctx);

      // 출력 그룹 조회 (테넌트 격리)
      const groupQuery = sql`
        SELECT * FROM document_batch_print_groups WHERE id = ${input.groupId} AND tenant_id = ${tenantId}
      `;
      const groupResult = await db.execute(groupQuery);
      const group = (groupResult[0] as any);

      if (!group) {
        throw new Error("출력 그룹을 찾을 수 없습니다");
      }

      // 권한 확인 (생성자 또는 관리자만 삭제 가능)
      if (group.printed_by !== ctx.user.id && ctx.user.role !== 'admin') {
        throw new Error("삭제 권한이 없습니다");
      }

      // 출력 그룹 삭제 (테넌트 조건, CASCADE로 매핑도 함께 삭제됨)
      await db.execute(sql`
        DELETE FROM document_batch_print_groups WHERE id = ${input.groupId} AND tenant_id = ${tenantId}
      `);

      return { 
        success: true, 
        message: "출력 그룹이 삭제되었습니다." 
      };
    }),

  // ============================================================================
  // 승인 완료 문서 일괄 출력 (단절 6 보강)
  // ============================================================================
  getApprovedDocumentsForPrint: tenantRequiredProcedure
    .input(
      z.object({
        siteId: z.number(),
        workDate: z.string().optional(),
        workDateFrom: z.string().optional(),
        workDateTo: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");
      const tenantId = requireTenantId(ctx);
      await assertSiteOwned(ctx, input.siteId);
      
      const conditions = [
        sql`di.tenant_id = ${tenantId}`,
        sql`di.site_id = ${input.siteId}`,
        sql`di.status = 'approved'`,
      ];
      
      if (input.workDate) {
        conditions.push(sql`di.work_date = ${input.workDate}`);
      }
      if (input.workDateFrom) {
        conditions.push(sql`di.work_date >= ${input.workDateFrom}`);
      }
      if (input.workDateTo) {
        conditions.push(sql`di.work_date <= ${input.workDateTo}`);
      }
      
      const whereClause = sql`WHERE ${sql.join(conditions, sql` AND `)}`;
      
      const query = sql`
        SELECT 
          di.id,
          di.batch_id,
          di.work_date,
          di.status,
          di.pdf_url,
          di.approved_at,
          dt.code as document_type_code,
          dt.name as document_type_name,
          dt.category as document_category,
          -- 이미 출력된 그룹에 포함되었는지 확인
          (SELECT COUNT(*) FROM document_batch_print_items dbpi WHERE dbpi.document_instance_id = di.id) as print_count
        FROM document_instances di
        JOIN document_types dt ON di.document_type_id = dt.id
        ${whereClause}
        ORDER BY di.work_date DESC, dt.category, dt.code
      `;
      
      const documents = await db.execute(query);
      return { documents };
    }),

  // ============================================================================
  // 일일 출력 요약 (대시보드용)
  // ============================================================================
  getDailyPrintSummary: tenantRequiredProcedure
    .input(z.object({ siteId: z.number(), workDate: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");
      const tenantId = requireTenantId(ctx);
      await assertSiteOwned(ctx, input.siteId);
      
      // 해당 날짜의 문서 현황 (테넌트 격리)
      const statusQuery = sql`
        SELECT 
          di.status,
          COUNT(*) as count
        FROM document_instances di
        WHERE di.tenant_id = ${tenantId}
          AND di.site_id = ${input.siteId}
          AND di.work_date = ${input.workDate}
        GROUP BY di.status
      `;
      const statusSummary = await db.execute(statusQuery);
      
      // 해당 날짜의 출력 그룹 (테넌트 격리)
      const printGroupQuery = sql`
        SELECT 
          dbpg.*,
          u.name as printed_by_name
        FROM document_batch_print_groups dbpg
        LEFT JOIN users u ON dbpg.printed_by = u.id
        WHERE dbpg.tenant_id = ${tenantId}
          AND dbpg.site_id = ${input.siteId}
          AND dbpg.work_date = ${input.workDate}
        ORDER BY dbpg.printed_at DESC
      `;
      const printGroups = await db.execute(printGroupQuery);
      
      return {
        statusSummary,
        printGroups,
      };
    }),
});

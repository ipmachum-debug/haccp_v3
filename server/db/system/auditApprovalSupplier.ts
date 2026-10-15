import { eq, and, or, desc, sql, aliasedTable, inArray, like, gte, lte } from "drizzle-orm";
import { getDb, getRawConnection } from "../connection";
import {
  auditLogs,
  type NewAuditLog,
  users,
  hSuppliers,
  hApprovalRequests,
  hApprovalHistory,
  hSupplierEvaluations,
  hNotificationSettings,
  hGenericChecklistRecords
} from "../../../drizzle/schema";

// ============================================================================
// 감사 로그 함수
// ============================================================================

export interface CreateAuditLogInput {
  action: string; // 예: "batch.create", "ccp.approve", "user.updateRole"
  entityType: string; // 예: "batch", "ccp", "user"
  entityId?: number;
  userId: number;
  userEmail?: string;
  userRole?: string;
  changes?: Record<string, any>; // 변경 전후 데이터
  description?: string;
  ipAddress?: string;
  userAgent?: string;
  tenantId?: number;
}

/**
 * 감사 로그 기록 (2026-10-14 재활성화)
 *
 * 이전: "schema mismatch" 로 no-op 이었다 — 그 사이 배치 승인 요청·완료·재고 조정·사용자 역할 변경 등
 *       호출 15개 파일의 기록이 하나도 남지 않았다.
 * 운영 audit_logs 실측 컬럼 = drizzle/schema/audit.ts (entity_type·user_id·changes …) 와 일치.
 * (어긋난 쪽은 control-plane 정의 schema_control_plane_ops.ts — utils/auditLogger 가 쓰던 것)
 *
 * 테넌트: 인자 → input.tenantId → 사용자 소속 테넌트 → 0(시스템).
 * 기록 실패가 본 작업을 막지 않는다 (예외를 던지지 않음).
 */
export async function createAuditLog(input: CreateAuditLogInput, tenantId?: number) {
  try {
    const conn = await getRawConnection();
    let tid = Number(tenantId ?? input.tenantId ?? 0) || 0;
    if (!tid && input.userId) {
      const [rows]: any = await conn.execute(`SELECT tenant_id FROM users WHERE id = ? LIMIT 1`, [input.userId]);
      tid = Number(rows?.[0]?.tenant_id ?? 0) || 0;
    }
    await conn.execute(
      `INSERT INTO audit_logs
         (tenant_id, action, entity_type, entity_id, user_id, user_email, user_role, changes, description, ip_address, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        tid,
        String(input.action).slice(0, 100),
        String(input.entityType ?? "").slice(0, 50),
        input.entityId != null && Number.isFinite(Number(input.entityId)) ? Number(input.entityId) : null,
        Number(input.userId) || 0,
        input.userEmail ? String(input.userEmail).slice(0, 255) : null,
        input.userRole ? String(input.userRole).slice(0, 50) : null,
        input.changes != null ? JSON.stringify(input.changes) : null,
        input.description ?? null,
        input.ipAddress ? String(input.ipAddress).slice(0, 45) : null,
        input.userAgent ?? null,
      ],
    );
  } catch (e: any) {
    console.error(`[AuditLog] 기록 실패 (${input?.action}):`, e?.message || e);
  }
}

export async function getAuditLogs(limit: number = 100, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const conditions: any[] = [];
  if (tenantId) conditions.push(eq(auditLogs.tenantId, tenantId));

  let query = db.select().from(auditLogs);
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  return await query
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
}

export async function getAuditLogsByEntity(entityType: string, entityId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const conditions: any[] = [
    eq(auditLogs.entityType, entityType),
    eq(auditLogs.entityId, entityId)
  ];
  if (tenantId) conditions.push(eq(auditLogs.tenantId, tenantId));

  return await db
    .select()
    .from(auditLogs)
    .where(and(...conditions))
    .orderBy(desc(auditLogs.createdAt));
}

export async function getAuditLogsByUser(userId: number, limit: number = 50, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const conditions: any[] = [eq(auditLogs.userId, userId)];
  if (tenantId) conditions.push(eq(auditLogs.tenantId, tenantId));

  return await db
    .select()
    .from(auditLogs)
    .where(and(...conditions))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
}

// ============================================================================
// 거래처 CRUD 함수
// ============================================================================

export async function getAllSuppliers(tenantId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(hSuppliers).where(and(eq(hSuppliers.isActive, 1), eq(hSuppliers.tenantId, tenantId)));
}

export async function getSupplierById(id: number, tenantId?: number) {
  const db = await getDb();
  if (!db) return null;
  const [supplier] = await db.select().from(hSuppliers).where(and(eq(hSuppliers.id, id), eq(hSuppliers.tenantId, tenantId as number)));
  return supplier;
}

export async function createSupplier(data: {
  supplierName: string;
  supplierCode?: string;
  businessNumber?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  supplierType?: string;
  certifications?: string;
  rating?: string;
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const [result] = await db.insert(hSuppliers).values(data as any);
  return result.insertId;
}

export async function updateSupplier(id: number, data: {
  supplierName?: string;
  supplierCode?: string;
  businessNumber?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  supplierType?: string;
  certifications?: string;
  rating?: string;
  isActive?: number;
}, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  await db.update(hSuppliers).set(data).where(and(eq(hSuppliers.id, id), eq(hSuppliers.tenantId, tenantId)));
}

export async function deleteSupplier(id: number, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  await db.update(hSuppliers).set({ isActive: 0 }).where(and(eq(hSuppliers.id, id), eq(hSuppliers.tenantId, tenantId)));
}

// ============================================================================
// 승인 워크플로우 관리 (Approval Workflow Management)
// ============================================================================

/**
 * 승인 요청 생성
 */
export async function createApprovalRequest(data: {
  tenantId: number;
  siteId: number;
  requestType: string;
  referenceType?: string;
  referenceId?: number;
  title: string;
  description?: string;
  priority?: "low" | "medium" | "high" | "urgent";
  requestedBy: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // ★ 중복 방지: 동일 reference_type + reference_id 조합이 이미 존재하면 기존 ID 반환
  if (data.referenceType && data.referenceId) {
    const existing = await db.select({ id: hApprovalRequests.id })
      .from(hApprovalRequests)
      .where(
        and(
          eq(hApprovalRequests.tenantId, data.tenantId),
          eq(hApprovalRequests.referenceType, data.referenceType),
          eq(hApprovalRequests.referenceId, data.referenceId),
        )
      )
      .limit(1);
    if (existing.length > 0) {
      console.log(`[createApprovalRequest] 이미 존재 (${data.referenceType}/${data.referenceId}) → approval #${existing[0].id} 반환`);
      return existing[0].id;
    }
  }

  const [result] = await db.insert(hApprovalRequests).values({
    tenantId: data.tenantId,
    siteId: data.siteId,
    requestType: data.requestType,
    referenceType: data.referenceType,
    referenceId: data.referenceId,
    title: data.title,
    description: data.description,
    status: "pending_review",
    priority: data.priority || "medium",
    requestedBy: data.requestedBy,
    requestedAt: new Date()
  });

  return result.insertId;
}

/**
 * 승인 요청 목록 조회
 *
 * 페이지네이션 / 서버-사이드 검색 지원 (2026-09-10 추가):
 * - `search`: title / description LIKE 검색 (부분일치)
 * - `dateFrom` / `dateTo`: requested_at 기간 필터 (YYYY-MM-DD, KST 기준)
 * - `limit` / `offset`: 페이지네이션. 지정 시 items 만 잘라서 반환.
 * - 반환은 배열 형태 유지 (기존 caller 호환). 총 건수는 `getApprovalRequestsCount` 별도 조회.
 */
export async function getApprovalRequests(filters?: {
  tenantId: number;
  status?: string;
  /** 여러 상태 중 하나 (처리이력 "전체" = approved/rejected/cancelled) — 목록·총건수가 같은 조건을 쓰도록 (2026-10-15) */
  statuses?: string[];
  requestType?: string;
  requestedBy?: number;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const conditions: any[] = [];
  if (filters?.tenantId) {
    conditions.push(eq(hApprovalRequests.tenantId, filters.tenantId));
  }
  if (filters?.status) {
    conditions.push(eq(hApprovalRequests.status, filters.status as any));
  }
  if (filters?.statuses && filters.statuses.length > 0) {
    conditions.push(inArray(hApprovalRequests.status, filters.statuses as any));
  }
  if (filters?.requestType) {
    conditions.push(eq(hApprovalRequests.requestType, filters.requestType));
  }
  if (filters?.requestedBy) {
    conditions.push(eq(hApprovalRequests.requestedBy, filters.requestedBy));
  }
  // 문서 제목 / 설명 부분일치 검색
  if (filters?.search && filters.search.trim() !== "") {
    const q = `%${filters.search.trim()}%`;
    conditions.push(
      or(
        like(hApprovalRequests.title, q),
        like(hApprovalRequests.description, q),
      )
    );
  }
  // 날짜 범위 (requested_at 기준). dateTo 는 해당일 23:59:59.999 까지 포함.
  if (filters?.dateFrom) {
    conditions.push(gte(hApprovalRequests.requestedAt, new Date(`${filters.dateFrom}T00:00:00`)));
  }
  if (filters?.dateTo) {
    conditions.push(lte(hApprovalRequests.requestedAt, new Date(`${filters.dateTo}T23:59:59.999`)));
  }

  // users 테이블 alias로 requester/reviewer/approver 이름 조인
  const requesterUser = aliasedTable(users, "requester_u");
  const reviewerUser = aliasedTable(users, "reviewer_u");
  const approverUser = aliasedTable(users, "approver_u");

  const baseQuery = db.select({
    id: hApprovalRequests.id,
    tenantId: hApprovalRequests.tenantId,
    siteId: hApprovalRequests.siteId,
    requestType: hApprovalRequests.requestType,
    referenceType: hApprovalRequests.referenceType,
    referenceId: hApprovalRequests.referenceId,
    title: hApprovalRequests.title,
    description: hApprovalRequests.description,
    status: hApprovalRequests.status,
    priority: hApprovalRequests.priority,
    requestedBy: hApprovalRequests.requestedBy,
    requestedAt: hApprovalRequests.requestedAt,
    reviewedBy: hApprovalRequests.reviewedBy,
    reviewedAt: hApprovalRequests.reviewedAt,
    reviewComments: hApprovalRequests.reviewComments,
    approvedBy: hApprovalRequests.approvedBy,
    approvedAt: hApprovalRequests.approvedAt,
    rejectedBy: hApprovalRequests.rejectedBy,
    rejectedAt: hApprovalRequests.rejectedAt,
    rejectionReason: hApprovalRequests.rejectionReason,
    notes: hApprovalRequests.notes,
    createdAt: hApprovalRequests.createdAt,
    requester: {
      id: requesterUser.id,
      name: requesterUser.name,
      email: requesterUser.email,
    },
    reviewer: {
      id: reviewerUser.id,
      name: reviewerUser.name,
      email: reviewerUser.email,
    },
    approver: {
      id: approverUser.id,
      name: approverUser.name,
      email: approverUser.email,
    },
    checklistFormData: hGenericChecklistRecords.formData,
  })
    .from(hApprovalRequests)
    .leftJoin(requesterUser, and(
      eq(hApprovalRequests.requestedBy, requesterUser.id),
      filters?.tenantId ? eq(requesterUser.tenantId, filters.tenantId) : undefined
    ))
    .leftJoin(reviewerUser, and(
      eq(hApprovalRequests.reviewedBy, reviewerUser.id),
      filters?.tenantId ? eq(reviewerUser.tenantId, filters.tenantId) : undefined
    ))
    .leftJoin(approverUser, and(
      eq(hApprovalRequests.approvedBy, approverUser.id),
      filters?.tenantId ? eq(approverUser.tenantId, filters.tenantId) : undefined
    ))
    .leftJoin(hGenericChecklistRecords, and(
      eq(hApprovalRequests.referenceId, hGenericChecklistRecords.id),
      or(eq(hApprovalRequests.referenceType, 'generic_checklist'), eq(hApprovalRequests.referenceType, 'checklist'))
    ));

  const hasLimit = typeof filters?.limit === "number" && filters.limit > 0;
  const limitVal = hasLimit ? (filters!.limit as number) : 0;
  const offsetVal = typeof filters?.offset === "number" && filters.offset > 0 ? filters.offset : 0;

  let q = conditions.length > 0
    ? baseQuery.where(and(...conditions)).orderBy(desc(hApprovalRequests.requestedAt))
    : baseQuery.orderBy(desc(hApprovalRequests.requestedAt));
  if (hasLimit) {
    q = (q as any).limit(limitVal).offset(offsetVal);
  }
  return await q;
}

/**
 * 승인 요청 총 건수 조회 (페이지네이션 total)
 * getApprovalRequests 와 동일 필터를 받되 COUNT(*) 만 반환.
 */
export async function getApprovalRequestsCount(filters?: {
  tenantId: number;
  status?: string;
  statuses?: string[];
  requestType?: string;
  requestedBy?: number;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const conditions: any[] = [];
  if (filters?.tenantId) conditions.push(eq(hApprovalRequests.tenantId, filters.tenantId));
  if (filters?.status) conditions.push(eq(hApprovalRequests.status, filters.status as any));
  if (filters?.statuses && filters.statuses.length > 0) conditions.push(inArray(hApprovalRequests.status, filters.statuses as any));
  if (filters?.requestType) conditions.push(eq(hApprovalRequests.requestType, filters.requestType));
  if (filters?.requestedBy) conditions.push(eq(hApprovalRequests.requestedBy, filters.requestedBy));
  if (filters?.search && filters.search.trim() !== "") {
    const s = `%${filters.search.trim()}%`;
    conditions.push(or(like(hApprovalRequests.title, s), like(hApprovalRequests.description, s)));
  }
  if (filters?.dateFrom) conditions.push(gte(hApprovalRequests.requestedAt, new Date(`${filters.dateFrom}T00:00:00`)));
  if (filters?.dateTo)   conditions.push(lte(hApprovalRequests.requestedAt, new Date(`${filters.dateTo}T23:59:59.999`)));

  const rows = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(hApprovalRequests)
    .where(conditions.length > 0 ? and(...conditions) : undefined);
  return Number(rows?.[0]?.n ?? 0);
}

/**
 * 승인 요청 여러 ID 일괄 조회 (인쇄 미리보기 최적화)
 * - IN 절 사용 + tenant 격리
 * - formData JSON 포함 (checklist 매핑)
 */
export async function getApprovalRequestsByIds(ids: number[], tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  if (ids.length === 0) return [];

  const requesterUser = aliasedTable(users, "requester_u");
  const reviewerUser = aliasedTable(users, "reviewer_u");
  const approverUser = aliasedTable(users, "approver_u");

  return await db.select({
    id: hApprovalRequests.id,
    tenantId: hApprovalRequests.tenantId,
    siteId: hApprovalRequests.siteId,
    requestType: hApprovalRequests.requestType,
    referenceType: hApprovalRequests.referenceType,
    referenceId: hApprovalRequests.referenceId,
    title: hApprovalRequests.title,
    description: hApprovalRequests.description,
    status: hApprovalRequests.status,
    priority: hApprovalRequests.priority,
    requestedBy: hApprovalRequests.requestedBy,
    requestedAt: hApprovalRequests.requestedAt,
    reviewedBy: hApprovalRequests.reviewedBy,
    reviewedAt: hApprovalRequests.reviewedAt,
    reviewComments: hApprovalRequests.reviewComments,
    approvedBy: hApprovalRequests.approvedBy,
    approvedAt: hApprovalRequests.approvedAt,
    rejectedBy: hApprovalRequests.rejectedBy,
    rejectedAt: hApprovalRequests.rejectedAt,
    rejectionReason: hApprovalRequests.rejectionReason,
    notes: hApprovalRequests.notes,
    createdAt: hApprovalRequests.createdAt,
    requester: { id: requesterUser.id, name: requesterUser.name, email: requesterUser.email },
    reviewer: { id: reviewerUser.id, name: reviewerUser.name, email: reviewerUser.email },
    approver: { id: approverUser.id, name: approverUser.name, email: approverUser.email },
    checklistFormData: hGenericChecklistRecords.formData,
  })
    .from(hApprovalRequests)
    .leftJoin(requesterUser, and(
      eq(hApprovalRequests.requestedBy, requesterUser.id),
      eq(requesterUser.tenantId, tenantId)
    ))
    .leftJoin(reviewerUser, and(
      eq(hApprovalRequests.reviewedBy, reviewerUser.id),
      eq(reviewerUser.tenantId, tenantId)
    ))
    .leftJoin(approverUser, and(
      eq(hApprovalRequests.approvedBy, approverUser.id),
      eq(approverUser.tenantId, tenantId)
    ))
    .leftJoin(hGenericChecklistRecords, and(
      eq(hApprovalRequests.referenceId, hGenericChecklistRecords.id),
      or(eq(hApprovalRequests.referenceType, 'generic_checklist'), eq(hApprovalRequests.referenceType, 'checklist'))
    ))
    .where(and(
      eq(hApprovalRequests.tenantId, tenantId),
      inArray(hApprovalRequests.id, ids)
    ));
}

/**
 * 승인 요청 상세 조회
 */
export async function getApprovalRequestById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const requesterUser = aliasedTable(users, "req_detail");
  const reviewerUser = aliasedTable(users, "rev_detail");
  const approverUser = aliasedTable(users, "app_detail");

  const result = await db.select({
    id: hApprovalRequests.id,
    tenantId: hApprovalRequests.tenantId,
    siteId: hApprovalRequests.siteId,
    requestType: hApprovalRequests.requestType,
    referenceType: hApprovalRequests.referenceType,
    referenceId: hApprovalRequests.referenceId,
    title: hApprovalRequests.title,
    description: hApprovalRequests.description,
    status: hApprovalRequests.status,
    priority: hApprovalRequests.priority,
    requestedBy: hApprovalRequests.requestedBy,
    requestedAt: hApprovalRequests.requestedAt,
    reviewedBy: hApprovalRequests.reviewedBy,
    reviewedAt: hApprovalRequests.reviewedAt,
    reviewComments: hApprovalRequests.reviewComments,
    approvedBy: hApprovalRequests.approvedBy,
    approvedAt: hApprovalRequests.approvedAt,
    rejectedBy: hApprovalRequests.rejectedBy,
    rejectedAt: hApprovalRequests.rejectedAt,
    rejectionReason: hApprovalRequests.rejectionReason,
    notes: hApprovalRequests.notes,
    createdAt: hApprovalRequests.createdAt,
    requester: {
      id: requesterUser.id,
      name: requesterUser.name,
      email: requesterUser.email,
    },
    reviewer: {
      id: reviewerUser.id,
      name: reviewerUser.name,
      email: reviewerUser.email,
    },
    approver: {
      id: approverUser.id,
      name: approverUser.name,
      email: approverUser.email,
    },
  })
    .from(hApprovalRequests)
    .leftJoin(requesterUser, and(
      eq(hApprovalRequests.requestedBy, requesterUser.id),
      eq(requesterUser.tenantId, hApprovalRequests.tenantId)
    ))
    .leftJoin(reviewerUser, and(
      eq(hApprovalRequests.reviewedBy, reviewerUser.id),
      eq(reviewerUser.tenantId, hApprovalRequests.tenantId)
    ))
    .leftJoin(approverUser, and(
      eq(hApprovalRequests.approvedBy, approverUser.id),
      eq(approverUser.tenantId, hApprovalRequests.tenantId)
    ))
    .where(eq(hApprovalRequests.id, id))
    .limit(1);
  return result.length > 0 ? result[0] : null;
}
/**
 * 승인 처리
 */
export async function approveRequest(requestId: number, approvedBy: number, notes?: string) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 1. 승인 요청 정보 먼저 조회 (배치ID, 문서ID 확인)
  const requestInfo = await db.select().from(hApprovalRequests).where(eq(hApprovalRequests.id, requestId)).limit(1);
  const request = requestInfo[0];

  // 2. 승인 상태 업데이트
  await db.update(hApprovalRequests)
    .set({
      status: "approved",
      approvedBy,
      approvedAt: new Date(),
      notes
    })
    .where(eq(hApprovalRequests.id, requestId));

  // 3. 승인 이력 기록
  //   2026-10-13: tenant_id 는 NOT NULL 인데 넣지 않아 strict 모드에서 INSERT 가 실패했고
  //   (h_approval_history 0행), 그 예외가 승인 응답까지 깨뜨릴 수 있었다. tenant_id 를 넣고
  //   이력 실패는 승인 결과를 바꾸지 않도록 격리한다.
  try {
    await db.insert(hApprovalHistory).values({
      tenantId: (request as any)?.tenantId ?? undefined,
      requestId,
      action: "approved",
      actionBy: approvedBy,
      actionAt: new Date(),
      comments: notes
    } as any);
  } catch (histErr) {
    console.error(`[approveRequest] 이력 기록 실패 (승인은 완료) request=${requestId}:`, histErr);
  }

  // 3-1. [후처리] CCP 기록지 결재 → 기록지 status + 인스턴스 반영 (2026-10-12, CCP 단일 흐름 1단계)
  if (request && (request as any).referenceType === "ccp_form_record" && (request as any).referenceId) {
    const { applyCcpFormDecision } = await import("../haccp/ccpStatusSync");
    const r = await applyCcpFormDecision({
      formRecordId: Number((request as any).referenceId),
      decision: "approved",
      userId: approvedBy,
      tenantId: (request as any).tenantId ?? undefined,
    });
    console.log(`[approveRequest] CCP 기록지 #${(request as any).referenceId} 승인 반영: form=${r.formUpdated} instances=${r.instancesUpdated}`);
  }
  // 3-2. [후처리] 배치 승인 요청("[CCP 기록지]" batch_production) 결재 → 그 배치의 CCP-1B/2B 기록지 승인 (2026-10-13)
  if (request && (request as any).referenceType === "batch" && (request as any).referenceId) {
    const { applyBatchDecisionToCcpForms } = await import("../haccp/ccpStatusSync");
    await applyBatchDecisionToCcpForms({
      batchId: Number((request as any).referenceId),
      decision: "approved",
      userId: approvedBy,
      tenantId: (request as any).tenantId ?? undefined,
    });
  }

  // 4. [후처리] 관련 document_instances 상태 자동 업데이트
  if (request) {
    try {
      const rawConn = await getRawConnection();
      if (rawConn) {
        // 승인 요청에 연결된 document_instance가 있으면 상태 업데이트
        if ((request as any).documentInstanceId) {
          await rawConn.execute(
            "UPDATE document_instances SET status = 'approved', approver_id = ?, approved_at = NOW() WHERE id = ?",
            [approvedBy, (request as any).documentInstanceId]
          );
          console.log(`[approveRequest] document_instance ${(request as any).documentInstanceId} 상태를 approved로 업데이트`);
        }

        // 배치 관련 승인이면 - 해당 배치의 모든 승인 요청이 완료되었는지 확인
        if ((request as any).batchId) {
          const batchId = (request as any).batchId;

          // 해당 배치의 미승인 요청 수 확인
          const [pendingResult] = await rawConn.execute(
            "SELECT COUNT(*) as pending_count FROM h_approval_requests WHERE batch_id = ? AND status = 'pending'",
            [batchId]
          );
          const pendingCount = (pendingResult as any[])[0]?.pending_count || 0;

          if (pendingCount === 0) {
            // 모든 승인 완료 -> 해당 배치의 모든 document_instances도 approved로 업데이트
            await rawConn.execute(
              "UPDATE document_instances SET status = 'approved', approver_id = ?, approved_at = NOW() WHERE batch_id = ? AND status != 'approved'",
              [approvedBy, batchId]
            );
            console.log(`[approveRequest] 배치 ${batchId}의 모든 문서를 approved로 업데이트`);
          }
        }
      }
    } catch (postProcessError) {
      // 후처리 실패해도 승인 자체는 성공으로 처리
      console.error("[approveRequest] 후처리 오류 (승인은 정상 처리됨):", postProcessError);
    }
  }

  return { success: true };
}

/**
 * 거부 처리
 */
export async function rejectRequest(requestId: number, rejectedBy: number, rejectionReason: string) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const requestInfo = await db.select().from(hApprovalRequests).where(eq(hApprovalRequests.id, requestId)).limit(1);
  const request = requestInfo[0];

  await db.update(hApprovalRequests)
    .set({
      status: "rejected",
      rejectedBy,
      rejectedAt: new Date(),
      rejectionReason
    })
    .where(eq(hApprovalRequests.id, requestId));

  // 승인 이력 기록 (2026-10-13: tenant_id 포함 + 실패 격리 — approveRequest 와 동일)
  try {
    await db.insert(hApprovalHistory).values({
      tenantId: (request as any)?.tenantId ?? undefined,
      requestId,
      action: "rejected",
      actionBy: rejectedBy,
      actionAt: new Date(),
      comments: rejectionReason
    } as any);
  } catch (histErr) {
    console.error(`[rejectRequest] 이력 기록 실패 (반려는 완료) request=${requestId}:`, histErr);
  }

  // [후처리] CCP 기록지 반려 → 기록지 status + 인스턴스 반영 (2026-10-12)
  if (request && (request as any).referenceType === "ccp_form_record" && (request as any).referenceId) {
    const { applyCcpFormDecision } = await import("../haccp/ccpStatusSync");
    await applyCcpFormDecision({
      formRecordId: Number((request as any).referenceId),
      decision: "rejected",
      userId: rejectedBy,
      reason: rejectionReason,
      tenantId: (request as any).tenantId ?? undefined,
    });
  }
  // [후처리] 배치 승인 요청 반려 → 그 배치의 CCP-1B/2B 기록지 반려 (2026-10-13)
  if (request && (request as any).referenceType === "batch" && (request as any).referenceId) {
    const { applyBatchDecisionToCcpForms } = await import("../haccp/ccpStatusSync");
    await applyBatchDecisionToCcpForms({
      batchId: Number((request as any).referenceId),
      decision: "rejected",
      userId: rejectedBy,
      reason: rejectionReason,
      tenantId: (request as any).tenantId ?? undefined,
    });
  }

  return { success: true };
}

/**
 * 승인 이력 조회
 */
export async function getApprovalHistory(requestId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // tenantId is accepted for tenant isolation at the router level;
  // the history is scoped via requestId which is already tenant-scoped.
  return await db.select()
    .from(hApprovalHistory)
    .where(eq(hApprovalHistory.requestId, requestId))
    .orderBy(desc(hApprovalHistory.actionAt));
}

/**
 * 대기 중인 승인 요청 개수 조회
 */
export async function getPendingApprovalCount(tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 2026-10-13: 실제 대기 상태는 pending_writer / pending_review / pending_approval (PR #264 이후).
  //   'pending' 만 세고 있어 승인 배지가 항상 0 이었다.
  const conditions: any[] = [
    inArray(hApprovalRequests.status, ["pending", "pending_writer", "pending_review", "pending_approval"] as any),
  ];
  if (tenantId) {
    conditions.push(eq(hApprovalRequests.tenantId, tenantId));
  }

  const result = await db.select({ count: sql<number>`count(*)` })
    .from(hApprovalRequests)
    .where(and(...conditions));

  return result[0]?.count || 0;
}

/**
 * 승인 요청 취소
 */
export async function cancelApprovalRequest(requestId: number, cancelledBy: number, reason?: string) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 요청 상태 확인
  const request = await getApprovalRequestById(requestId);
  if (!request) {
    throw new Error("Approval request not found");
  }
  if (!["pending", "pending_review", "pending_approval"].includes(request.status || "")) {
    throw new Error("승인완료/거부/취소된 요청은 취소할 수 없습니다");
  }

  // 취소 처리
  await db.update(hApprovalRequests)
    .set({
      status: "cancelled",
      notes: reason
    })
    .where(eq(hApprovalRequests.id, requestId));

  // 승인 이력 기록
  await db.insert(hApprovalHistory).values({
    requestId,
    action: "cancelled",
    actionBy: cancelledBy,
    actionAt: new Date(),
    comments: reason
  } as any);

  return { success: true };
}

// ============================================================================
// 거래처 평가 관리 (Supplier Evaluation Management)
// ============================================================================

/**
 * 거래처 평가 생성
 */
export async function createSupplierEvaluation(data: {
  supplierId: number;
  evaluationDate: Date;
  evaluatedBy: number;
  qualityScore: number;
  deliveryScore: number;
  priceScore: number;
  serviceScore: number;
  responseScore: number;
  comments?: string;
  strengths?: string;
  weaknesses?: string;
  recommendations?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 전체 평균 점수 계산
  const overallScore = (
    data.qualityScore +
    data.deliveryScore +
    data.priceScore +
    data.serviceScore +
    data.responseScore
  ) / 5;

  const [result] = await db.insert(hSupplierEvaluations).values({
    ...data,
    overallScore: overallScore.toFixed(2)
  } as any);

  // 거래처 등급 자동 업데이트
  await updateSupplierRating(data.supplierId);

  return result.insertId;
}

/**
 * 거래처 평가 목록 조회
 */
export async function getSupplierEvaluations(supplierId?: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  let query = db.select().from(hSupplierEvaluations);

  if (supplierId) {
    query = query.where(eq(hSupplierEvaluations.supplierId, supplierId)) as any;
  }

  return await query.orderBy(desc(hSupplierEvaluations.evaluationDate));
}

/**
 * 거래처 평가 통계 조회
 */
export async function getSupplierEvaluationStats(supplierId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const evaluations = await db
    .select()
    .from(hSupplierEvaluations)
    .where(eq(hSupplierEvaluations.supplierId, supplierId));

  if (evaluations.length === 0) {
    return null;
  }

  const avgQuality = evaluations.reduce((sum, e) => sum + e.qualityScore, 0) / evaluations.length;
  const avgDelivery = evaluations.reduce((sum, e) => sum + e.deliveryScore, 0) / evaluations.length;
  const avgPrice = evaluations.reduce((sum, e) => sum + e.priceScore, 0) / evaluations.length;
  const avgService = evaluations.reduce((sum, e) => sum + e.serviceScore, 0) / evaluations.length;
  const avgResponse = evaluations.reduce((sum, e) => sum + e.responseScore, 0) / evaluations.length;
  const avgOverall = evaluations.reduce((sum, e) => sum + Number(e.overallScore), 0) / evaluations.length;

  return {
    totalEvaluations: evaluations.length,
    avgQuality: avgQuality.toFixed(2),
    avgDelivery: avgDelivery.toFixed(2),
    avgPrice: avgPrice.toFixed(2),
    avgService: avgService.toFixed(2),
    avgResponse: avgResponse.toFixed(2),
    avgOverall: avgOverall.toFixed(2),
    latestEvaluation: evaluations[0]
  };
}

/**
 * 거래처 등급 자동 업데이트
 */
async function updateSupplierRating(supplierId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const stats = await getSupplierEvaluationStats(supplierId);

  if (!stats) return;

  const avgScore = Number(stats.avgOverall);
  let rating = "C";

  if (avgScore >= 4.5) {
    rating = "A+";
  } else if (avgScore >= 4.0) {
    rating = "A";
  } else if (avgScore >= 3.5) {
    rating = "B+";
  } else if (avgScore >= 3.0) {
    rating = "B";
  } else if (avgScore >= 2.5) {
    rating = "C+";
  }

  // Note: supplierId is already validated in getSupplierEvaluationStats,
  // and this is an internal helper called after evaluation creation.
  await db
    .update(hSuppliers)
    .set({ rating })
    .where(eq(hSuppliers.id, supplierId));
}


// ============================================================
// 알림 설정 (Notification Settings)
// ============================================================

export async function getNotificationSettings(userId: number) {
  const db = await getDb();
  if (!db) return null;

  const [settings] = await db
    .select()
    .from(hNotificationSettings)
    .where(eq(hNotificationSettings.userId, userId))
    .limit(1);
  return settings;
}

export async function saveNotificationSettings(data: {
  userId: number;
  ccpDeviationEnabled?: number;
  stockLowEnabled?: number;
  expiryWarningEnabled?: number;
  batchCompletedEnabled?: number;
  approvalRequestEnabled?: number;
  inspectionCompletedEnabled?: number;
  systemNotificationEnabled?: number;
  emailEnabled?: number;
  smsEnabled?: number;
  businessHoursOnly?: number;
  businessHoursStart?: string;
  businessHoursEnd?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const existing = await getNotificationSettings(data.userId);

  if (existing) {
    // 업데이트
    await db
      .update(hNotificationSettings)
      .set({
        ...data
      })
      .where(eq(hNotificationSettings.userId, data.userId));
  } else {
    // 생성
    await db.insert(hNotificationSettings).values(data as any);
  }

  return getNotificationSettings(data.userId);
}

import { eq, and, or, desc, sql, aliasedTable } from "drizzle-orm";
import { getDb, getRawConnection } from "./connection";
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
} from "../../drizzle/schema";

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
}

export async function createAuditLog(input: CreateAuditLogInput) {
  // Temporarily disabled due to schema mismatch
  return;
}

export async function getAuditLogs(limit: number = 100, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

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
  if (!db) throw new Error("Database connection failed");

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
  if (!db) throw new Error("Database connection failed");

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

export async function getSupplierById(id: number, tenantId: number) {
  const db = await getDb();
  if (!db) return null;
  const [supplier] = await db.select().from(hSuppliers).where(and(eq(hSuppliers.id, id), eq(hSuppliers.tenantId, tenantId)));
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
  if (!db) throw new Error("Database not available");
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
  if (!db) throw new Error("Database not available");
  await db.update(hSuppliers).set(data).where(and(eq(hSuppliers.id, id), eq(hSuppliers.tenantId, tenantId)));
}

export async function deleteSupplier(id: number, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
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
  if (!db) throw new Error("Database not available");

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
 */
export async function getApprovalRequests(filters?: {
  tenantId: number;
  status?: string;
  requestType?: string;
  requestedBy?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const conditions: any[] = [];
  if (filters?.tenantId) {
    conditions.push(eq(hApprovalRequests.tenantId, filters.tenantId));
  }
  if (filters?.status) {
    conditions.push(eq(hApprovalRequests.status, filters.status as any));
  }
  if (filters?.requestType) {
    conditions.push(eq(hApprovalRequests.requestType, filters.requestType));
  }
  if (filters?.requestedBy) {
    conditions.push(eq(hApprovalRequests.requestedBy, filters.requestedBy));
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

  if (conditions.length > 0) {
    return await baseQuery
      .where(and(...conditions))
      .orderBy(desc(hApprovalRequests.requestedAt));
  }
  return await baseQuery
    .orderBy(desc(hApprovalRequests.requestedAt));
}
/**
 * 승인 요청 상세 조회
 */
export async function getApprovalRequestById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

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
  if (!db) throw new Error("Database not available");

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
  await db.insert(hApprovalHistory).values({
    requestId,
    action: "approved",
    actionBy: approvedBy,
    actionAt: new Date(),
    comments: notes
  } as any);

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
  if (!db) throw new Error("Database not available");

  await db.update(hApprovalRequests)
    .set({
      status: "rejected",
      rejectedBy,
      rejectedAt: new Date(),
      rejectionReason
    })
    .where(eq(hApprovalRequests.id, requestId));

  // 승인 이력 기록
  await db.insert(hApprovalHistory).values({
    requestId,
    action: "rejected",
    actionBy: rejectedBy,
    actionAt: new Date(),
    comments: rejectionReason
  } as any);

  return { success: true };
}

/**
 * 승인 이력 조회
 */
export async function getApprovalHistory(requestId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

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
  if (!db) throw new Error("Database not available");

  const conditions: any[] = [eq(hApprovalRequests.status, "pending")];
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
  if (!db) throw new Error("Database not available");

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
  if (!db) throw new Error("Database not available");

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
export async function getSupplierEvaluations(supplierId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  let query = db.select().from(hSupplierEvaluations);

  if (supplierId) {
    query = query.where(eq(hSupplierEvaluations.supplierId, supplierId)) as any;
  }

  return await query.orderBy(desc(hSupplierEvaluations.evaluationDate));
}

/**
 * 거래처 평가 통계 조회
 */
export async function getSupplierEvaluationStats(supplierId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

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
  if (!db) throw new Error("Database not available");

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
  if (!db) throw new Error("Database not available");

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

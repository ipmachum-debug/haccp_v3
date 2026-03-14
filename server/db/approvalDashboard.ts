/**
 * 승인 워크플로우 대시보드 DB 함수
 */

import { getDb } from "../db";
import { hApprovalRequests, users } from "../../drizzle/schema";
import { eq, inArray, and} from "drizzle-orm";

/**
 * 전체 승인 대기 항목 조회
 */
export async function getPendingApprovals(tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  // 1. 승인 요청 테이블에서 모든 승인 항목 조회
  const requests = await db
    .select({
      id: hApprovalRequests.id,
      requestType: hApprovalRequests.requestType,
      title: hApprovalRequests.title,
      referenceType: hApprovalRequests.referenceType,
      referenceId: hApprovalRequests.referenceId,
      status: hApprovalRequests.status,
      requestedBy: hApprovalRequests.requestedBy,
      createdAt: hApprovalRequests.createdAt
    })
    .from(hApprovalRequests).where(eq(hApprovalRequests.tenantId, tenantId) as any).orderBy(hApprovalRequests.createdAt);

  // 2. 요청자 정보 조회
    const requesterIds = Array.from(new Set(requests.map(r => r.requestedBy)));
  const requesterMap = new Map();
  
  if (requesterIds.length > 0) {
    const requesters = await db
      .select({
        id: users.id,
        name: users.name
      })
      .from(users)
      .where(inArray(users.id, requesterIds));
    
    requesters.forEach(user => {
      requesterMap.set(user.id, user.name);
    });
  }

  // 3. 승인 항목 목록 생성
  const approvals = requests.map(request => {
    let type = "unknown";
    
    // requestType 또는 referenceType에서 유형 결정
    if (request.requestType === "batch_approval" || request.referenceType === "batch") {
      type = "batch";
    } else if (request.requestType === "inventory_adjustment" || request.referenceType === "inventory_adjustment") {
      type = "inventory_adjustment";
    } else if (request.requestType === "ccp_review" || request.referenceType === "ccp_check") {
      type = "ccp_review";
    } else if (request.requestType === "checklist_approval" || request.referenceType === "checklist" || request.referenceType === "generic_checklist") {
      type = "checklist";
    } else if (request.requestType === "document_approval" || request.referenceType === "document") {
      type = "document";
    } else if (request.requestType === "mfr_approval" || request.referenceType === "mfr") {
      type = "mfr";
    }

    return {
      id: request.referenceId || request.id,
      type,
      title: request.title,
      requesterName: requesterMap.get(request.requestedBy) || "알 수 없음",
      status: request.status,
      createdAt: request.createdAt
    };
  });

  return approvals;
}

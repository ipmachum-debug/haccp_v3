/**
 * 배치 승인 현황 — 실제 승인 흐름(h_approval_requests)과 공식 CCP 기록지(h_ccp_form_records) 기준
 * (2026-10-13, CCP 단일 흐름 2단계 첫 PR)
 *
 * 배치 상세의 "배치 승인" 카드는 그동안 h_batch_approvals(0행)·h_ccp_records(1행) 를 읽어
 * 항상 "점검 기록 없음 / 승인 이력 없음" 이었다. 실제 승인은 승인관리의 h_approval_requests
 * (request_type 'batch_production' + 'ccp_form') 에서 돌고 있었다. 이 모듈이 그 둘을 한 화면 값으로 합친다.
 */
import { getRawConnection } from "../connection";

export interface ApprovalRequestView {
  id: number;
  requestType: string;
  referenceType: string | null;
  referenceId: number | null;
  title: string;
  status: string;
  priority: string | null;
  requestedBy: number | null;
  requestedByName: string | null;
  requestedAt: Date | null;
  reviewedBy: number | null;
  reviewedByName: string | null;
  reviewedAt: Date | null;
  reviewComments: string | null;
  approvedBy: number | null;
  approvedByName: string | null;
  approvedAt: Date | null;
  rejectedBy: number | null;
  rejectedByName: string | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;
  notes: string | null;
}

export interface CcpFormView {
  id: number;
  ccpType: string;
  workDate: string | null;
  status: "draft" | "submitted" | "approved" | "rejected";
  rowCount: number;
  deviationCount: number;
  approvalRequestId: number | null;
  approvalStatus: string | null;
  /** 같은 작업일의 일일 통합 기록지(CCP-4P)를 끌어온 경우 */
  isDaily: boolean;
  /** 자기 요청이 없어 배치 승인 요청("[CCP 기록지]" batch_production)의 결재를 따르는 기록지 (CCP-1B/2B) */
  viaBatchRequest: boolean;
}

export interface ApprovalHistoryView {
  id: number;
  requestId: number;
  action: string;
  actionBy: number | null;
  actionByName: string | null;
  actionAt: Date | null;
  comments: string | null;
}

export interface BatchApprovalOverview {
  batchId: number;
  forms: CcpFormView[];
  batchRequest: ApprovalRequestView | null;
  requests: ApprovalRequestView[];
  history: ApprovalHistoryView[];
  /** 배치 승인 요청의 결론 */
  decision: "approved" | "rejected" | "pending" | "none";
  canApprove: boolean;
  blockers: string[];
  /** 공식 CCP 기록지만의 차단 사유 — 승인 경로 공통 관문(batchApprovalGate)이 쓴다 (요청 상태 제외) */
  formBlockers: string[];
}

const PENDING = new Set(["pending_writer", "pending_review", "pending_approval", "pending"]);

const REQUEST_SELECT = `
  ar.id, ar.request_type AS requestType, ar.reference_type AS referenceType, ar.reference_id AS referenceId,
  ar.title, ar.status, ar.priority,
  ar.requested_by AS requestedBy, ru.name AS requestedByName, ar.requested_at AS requestedAt,
  ar.reviewed_by AS reviewedBy, vu.name AS reviewedByName, ar.reviewed_at AS reviewedAt, ar.review_comments AS reviewComments,
  ar.approved_by AS approvedBy, au.name AS approvedByName, ar.approved_at AS approvedAt,
  ar.rejected_by AS rejectedBy, ju.name AS rejectedByName, ar.rejected_at AS rejectedAt, ar.rejection_reason AS rejectionReason,
  ar.notes
  FROM h_approval_requests ar
  LEFT JOIN users ru ON ru.id = ar.requested_by
  LEFT JOIN users vu ON vu.id = ar.reviewed_by
  LEFT JOIN users au ON au.id = ar.approved_by
  LEFT JOIN users ju ON ju.id = ar.rejected_by`;

export async function getBatchApprovalOverview(batchId: number, tenantId: number): Promise<BatchApprovalOverview> {
  const conn = await getRawConnection();

  // 1. 배치 작업일 (CCP-4P 일일 기록지 매칭용)
  const [batchRows] = await conn.execute<any[]>(
    `SELECT DATE_FORMAT(planned_date, '%Y-%m-%d') AS plannedDate FROM h_batches WHERE id = ? AND tenant_id = ? LIMIT 1`,
    [batchId, tenantId],
  );
  const plannedDate: string | null = (batchRows as any[])[0]?.plannedDate ?? null;

  // 2. 공식 기록지 — 이 배치 직결 + 같은 작업일의 CCP-4P 일일 기록지 (직결 4P 가 없을 때만)
  const [formRows] = await conn.execute<any[]>(
    `SELECT f.id, f.ccp_type AS ccpType, DATE_FORMAT(f.work_date, '%Y-%m-%d') AS workDate, f.status,
            f.approval_request_id AS approvalRequestId, f.batch_id AS batchId,
            (SELECT COUNT(*) FROM h_ccp_form_rows r WHERE r.form_record_id = f.id AND r.tenant_id = f.tenant_id) AS rowCount,
            (SELECT COUNT(*) FROM h_ccp_form_rows r WHERE r.form_record_id = f.id AND r.tenant_id = f.tenant_id AND r.is_deviation = 1) AS deviationCount,
            ar.status AS approvalStatus
     FROM h_ccp_form_records f
     LEFT JOIN h_approval_requests ar ON ar.id = f.approval_request_id AND ar.tenant_id = f.tenant_id
     WHERE f.tenant_id = ?
       AND (f.batch_id = ? OR (f.ccp_type = 'CCP-4P' AND ? IS NOT NULL AND f.work_date = ?))
     ORDER BY f.ccp_type, f.id`,
    [tenantId, batchId, plannedDate, plannedDate],
  );
  const direct4p = (formRows as any[]).some((r) => r.ccpType === "CCP-4P" && Number(r.batchId) === batchId);
  const forms: CcpFormView[] = (formRows as any[])
    .filter((r) => !(r.ccpType === "CCP-4P" && Number(r.batchId) !== batchId && direct4p))
    .map((r) => ({
      id: Number(r.id),
      ccpType: String(r.ccpType),
      workDate: r.workDate ?? null,
      status: r.status,
      rowCount: Number(r.rowCount ?? 0),
      deviationCount: Number(r.deviationCount ?? 0),
      approvalRequestId: r.approvalRequestId != null ? Number(r.approvalRequestId) : null,
      approvalStatus: r.approvalStatus ?? null,
      isDaily: r.ccpType === "CCP-4P" && Number(r.batchId) !== batchId,
      viaBatchRequest: false,
    }));

  // 3. 승인 요청 — 배치 직결(reference batch) + 기록지 요청(ccp_form_record)
  const formIds = forms.map((f) => f.id);
  const [reqRows] = await conn.execute<any[]>(
    `SELECT ${REQUEST_SELECT}
     WHERE ar.tenant_id = ?
       AND ( (ar.reference_type = 'batch' AND ar.reference_id = ?)
             ${formIds.length > 0 ? `OR (ar.reference_type = 'ccp_form_record' AND ar.reference_id IN (${formIds.map(() => "?").join(",")}))` : ""} )
     ORDER BY ar.requested_at, ar.id`,
    [tenantId, batchId, ...formIds],
  );
  const requests = (reqRows as any[]).map(mapRequest);
  const batchRequest =
    [...requests].reverse().find((r) => r.requestType === "batch_production" && r.referenceType === "batch") ??
    [...requests].reverse().find((r) => r.referenceType === "batch") ??
    null;

  // 3-1. 자기 요청이 없는 배치별 기록지(CCP-1B/2B)는 배치 승인 요청의 결재를 따른다 (2026-10-13).
  //      "요청 없음" 으로 보이면 결재가 안 된 것처럼 오해하므로 배치 요청 상태를 그대로 보여준다.
  if (batchRequest) {
    for (const f of forms) {
      if (f.approvalRequestId != null || f.ccpType === "CCP-4P") continue;
      f.approvalRequestId = batchRequest.id;
      f.approvalStatus = batchRequest.status;
      f.viaBatchRequest = true;
    }
  }

  // 4. 결재 이력
  let history: ApprovalHistoryView[] = [];
  if (requests.length > 0) {
    const ids = requests.map((r) => r.id);
    const [histRows] = await conn.execute<any[]>(
      `SELECT h.id, h.request_id AS requestId, h.action, h.action_by AS actionBy, u.name AS actionByName,
              h.action_at AS actionAt, h.comments
       FROM h_approval_history h
       LEFT JOIN users u ON u.id = h.action_by
       WHERE h.request_id IN (${ids.map(() => "?").join(",")})
       ORDER BY h.action_at, h.id`,
      ids,
    );
    history = (histRows as any[]).map((h) => ({
      id: Number(h.id),
      requestId: Number(h.requestId),
      action: String(h.action),
      actionBy: h.actionBy != null ? Number(h.actionBy) : null,
      actionByName: h.actionByName ?? null,
      actionAt: h.actionAt ?? null,
      comments: h.comments ?? null,
    }));
  }

  // 5. 승인 가능 판정
  const blockers: string[] = [];
  if (!batchRequest) blockers.push("배치 승인 요청이 없습니다 (배치 생성 시 자동 등록되는 [CCP 기록지] 요청). 승인관리에서 생성하거나 CCP 재생성으로 만들 수 있습니다.");
  else if (!PENDING.has(batchRequest.status)) blockers.push(`배치 승인 요청이 이미 ${labelStatus(batchRequest.status)} 상태입니다.`);
  const formBlockers: string[] = [];
  if (forms.length === 0) formBlockers.push("공식 CCP 기록지가 없습니다.");
  for (const f of forms) {
    if (f.status === "draft") formBlockers.push(`${f.ccpType} 기록지가 작성중입니다 (제출 필요).`);
    if (f.status === "rejected") formBlockers.push(`${f.ccpType} 기록지가 반려 상태입니다.`);
    if (f.rowCount === 0) formBlockers.push(`${f.ccpType} 기록지에 행이 없습니다.`);
    if (f.deviationCount > 0) formBlockers.push(`${f.ccpType} 기록지에 이탈(비적합) ${f.deviationCount}건이 있습니다.`);
  }
  blockers.push(...formBlockers);
  const decision: BatchApprovalOverview["decision"] = !batchRequest
    ? "none"
    : batchRequest.status === "approved"
      ? "approved"
      : batchRequest.status === "rejected"
        ? "rejected"
        : "pending";

  return {
    batchId,
    forms,
    batchRequest,
    requests,
    history,
    decision,
    canApprove: blockers.length === 0,
    blockers,
    formBlockers,
  };
}

function mapRequest(r: any): ApprovalRequestView {
  return {
    id: Number(r.id),
    requestType: String(r.requestType),
    referenceType: r.referenceType ?? null,
    referenceId: r.referenceId != null ? Number(r.referenceId) : null,
    title: String(r.title ?? ""),
    status: String(r.status ?? ""),
    priority: r.priority ?? null,
    requestedBy: r.requestedBy != null ? Number(r.requestedBy) : null,
    requestedByName: r.requestedByName ?? null,
    requestedAt: r.requestedAt ?? null,
    reviewedBy: r.reviewedBy != null ? Number(r.reviewedBy) : null,
    reviewedByName: r.reviewedByName ?? null,
    reviewedAt: r.reviewedAt ?? null,
    reviewComments: r.reviewComments ?? null,
    approvedBy: r.approvedBy != null ? Number(r.approvedBy) : null,
    approvedByName: r.approvedByName ?? null,
    approvedAt: r.approvedAt ?? null,
    rejectedBy: r.rejectedBy != null ? Number(r.rejectedBy) : null,
    rejectedByName: r.rejectedByName ?? null,
    rejectedAt: r.rejectedAt ?? null,
    rejectionReason: r.rejectionReason ?? null,
    notes: r.notes ?? null,
  };
}

export function labelStatus(status: string): string {
  switch (status) {
    case "pending_writer": return "작성자 검토 대기";
    case "pending_review": return "검토 대기";
    case "pending_approval": return "승인 대기";
    case "pending": return "대기";
    case "approved": return "승인 완료";
    case "rejected": return "반려";
    case "cancelled": return "취소";
    default: return status;
  }
}

/** 배치의 batch_production 승인 요청 id (대기 중인 최신 1건). 없으면 null */
export async function findPendingBatchRequestId(batchId: number, tenantId: number): Promise<number | null> {
  const conn = await getRawConnection();
  const [rows] = await conn.execute<any[]>(
    `SELECT id FROM h_approval_requests
     WHERE tenant_id = ? AND reference_type = 'batch' AND reference_id = ?
       AND request_type = 'batch_production'
       AND status IN ('pending_writer','pending_review','pending_approval','pending')
     ORDER BY id DESC LIMIT 1`,
    [tenantId, batchId],
  );
  return (rows as any[])[0]?.id != null ? Number((rows as any[])[0].id) : null;
}

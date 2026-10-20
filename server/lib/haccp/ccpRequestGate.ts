/**
 * 결재 단계 CCP 관문 — 작성자 제출·검토에서도 (2026-10-19, 하루 생산 흐름)
 *
 * 최종 승인에는 이미 CCP 관문이 있다(prepareBatchForApproval·approveCcpFormRecord). 그 앞 단계(작성자 제출 → 검토 → 승인)에서도
 * 기록지가 덜 끝났으면 넘기지 않는다 — 같은 기준(getBatchApprovalOverview.formBlockers / 기록지 확인).
 *   batch_production(batch): 그 생산 건의 기록지 막힘 이유가 없어야
 *   ccp_form(ccp_form_record): 그 기록지가 확인(제출)되고 그 뒤 바뀌지 않았어야
 * 다른 결재(일지 등)는 영향 없음.
 */
import { getRawConnection } from "../../db/connection";

export async function checkCcpRequestGate(tenantId: number, approvalRequestId: number): Promise<{ ok: boolean; message?: string }> {
  const conn = await getRawConnection();
  const [rows]: any = await conn.execute(
    `SELECT request_type, reference_type, reference_id FROM h_approval_requests WHERE id = ? AND tenant_id = ? LIMIT 1`,
    [approvalRequestId, tenantId],
  );
  const r = (rows as any[])[0];
  if (!r || r.reference_id == null) return { ok: true };
  if (r.reference_type === "batch" && r.request_type === "batch_production") {
    const { getBatchApprovalOverview } = await import("../../db/production/batchApprovalOverview");
    const ov = await getBatchApprovalOverview(Number(r.reference_id), tenantId);
    if (ov.formBlockers.length) return { ok: false, message: `CCP 기록지가 끝나지 않았습니다 — ${ov.formBlockers.slice(0, 3).join(" / ")}` };
    return { ok: true };
  }
  if (r.reference_type === "ccp_form_record") {
    const { assertSheetConfirmedForApproval } = await import("./ccpSheetConfirm");
    try { await assertSheetConfirmedForApproval(Number(r.reference_id), tenantId); } catch (e: any) { return { ok: false, message: e?.message }; }
  }
  return { ok: true };
}

export async function assertCcpRequestGate(tenantId: number, approvalRequestId: number): Promise<void> {
  const g = await checkCcpRequestGate(tenantId, approvalRequestId);
  if (!g.ok) {
    const { TRPCError } = await import("@trpc/server");
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: g.message ?? "CCP 기록지가 끝나지 않았습니다." });
  }
}

/**
 * 기록지 확인 제출 = 작성자 단계 (2026-10-20, 대표: 마감에서 기록지를 하나씩 찾아 제출하고 같은 확인을 결재에서 또 하지 않게).
 *   '제출 = 시트 확인' (2026-10-18 CEO) 이 작성자의 확인이므로, 생산 건 실행 때 자동으로 만든 결재 요청의 작성자 단계
 *   (pending_writer) 를 같은 사람의 기록지 확인 제출로 넘긴다 → pending_review(검토·승인 단계).
 *   - 그 기록지의 결재(ccp_form_record), 그 생산 건의 모든 기록지가 확인됐으면 생산 건 결재(batch_production)도.
 *   - 넘기기 전에 위 관문(checkCcpRequestGate)을 같은 기준으로 본다 — 막히면 그대로 둔다 (결재 화면의 작성자 제출과 같은 판단).
 *   - 조건부 UPDATE (status = 'pending_writer' 일 때만) — 이미 넘어간 요청·다른 상태는 건드리지 않는다. 검토·승인 권한은 그대로.
 * 반환: 넘긴 결재 요청 번호들.
 */
export async function advanceWriterStepOnSheetConfirm(tenantId: number, formRecordId: number, userId: number): Promise<number[]> {
  const conn = await getRawConnection();
  const [[f]]: any = await conn.execute(`SELECT batch_id, ccp_type, DATE_FORMAT(work_date, '%Y-%m-%d') AS wd FROM h_ccp_form_records WHERE id = ? AND tenant_id = ?`, [formRecordId, tenantId]);
  if (!f) return [];
  // 생산 건 결재 후보: 가열 기록지면 그 생산 건, 금속검출 하루 기록지면 그날 생산 건들 (금속검출만 하는 제품 포함) — 관문이 다 끝난 것만 넘긴다
  const [reqs]: any = await conn.execute(
    `SELECT ar.id FROM h_approval_requests ar
       LEFT JOIN h_batches b ON ar.reference_type = 'batch' AND b.id = ar.reference_id AND b.tenant_id = ar.tenant_id
      WHERE ar.tenant_id = ? AND ar.status = 'pending_writer'
        AND ((ar.reference_type = 'ccp_form_record' AND ar.reference_id = ?)
          OR (ar.reference_type = 'batch' AND ar.request_type = 'batch_production' AND b.voided_at IS NULL
              AND (${f.ccp_type === "CCP-4P" ? "b.planned_date = ?" : "ar.reference_id = ?"})))`,
    [tenantId, formRecordId, f.ccp_type === "CCP-4P" ? f.wd : (f.batch_id ?? 0)],
  );
  const moved: number[] = [];
  for (const r of reqs as any[]) {
    const g = await checkCcpRequestGate(tenantId, Number(r.id));
    if (!g.ok) continue; // 생산 건의 다른 기록지가 아직이면 생산 건 결재는 그대로
    const [u]: any = await conn.execute(
      `UPDATE h_approval_requests
          SET status = 'pending_review',
              description = CONCAT(IFNULL(description, ''), '\n\n[작성자 제출] 기록지 확인 제출로 (사용자 #', ?, ')')
        WHERE id = ? AND tenant_id = ? AND status = 'pending_writer'`,
      [userId, r.id, tenantId],
    );
    if (Number(u?.affectedRows ?? 0) === 1) moved.push(Number(r.id));
  }
  return moved;
}

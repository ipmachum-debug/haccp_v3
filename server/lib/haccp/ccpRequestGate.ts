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

/**
 * 배치 생산 승인 — 모든 승인 경로 공통 관문·완료 처리 (2026-10-18, 지티 QA B01·B03·B04)
 *
 * 경로: 승인관리 개별 승인(approveChecklist)·바로 승인(approveWithAutoReview)·일괄 승인(batchApproveChecklists)·
 *       최종 승인(finalApprove). 배치 상세 승인(batch.approve)은 같은 CCP 관문(getBatchApprovalOverview)을 이미 쓴다.
 *
 * 이전 문제:
 *   - B03: 배치 상세는 CCP 기록지가 작성중이면 승인을 막는데, 승인관리 경로는 일일일지 관문만 봐서 그대로 승인했다.
 *          배치 요청은 승인됐는데 공식 기록지는 draft/submitted 로 남았다.
 *   - B01: 원료가 출고되지 않은 배치도 completed 로 바꾸고 '승인 완료' 로 답했다. 제품 LOT·원가·분개 보류는 로그에만 있었다.
 *   - B04: 완료시각을 생산일 17:00 으로 채워 승인 시각보다 미래가 됐다.
 *
 * 지금:
 *   1) prepareBatchForApproval — 부작용 전에: CCP 기록지 차단 사유(작성중·반려·행 없음·이탈) 가 있으면 승인하지 않는다.
 *      미출고 원료 줄은 생산완료와 같은 공통 자동출고(autoIssueMaterialsDispatch) 로 출고해 보고, 그래도 남으면 승인하지 않는다.
 *   2) completeApprovedBatch — completed 로 바꾸되 완료시각은 실제 처리 시각(NOW, 이미 있으면 유지). 실제 종료시각(end_time) 은
 *      생산 사실이라 승인으로 채우지 않는다. 공식 CCP 기록지 승인 반영, 제품 LOT·완료 훅을 실행하고 경고를 돌려준다(숨기지 않음).
 */
import { TRPCError } from "@trpc/server";
import { getRawConnection } from "../../db/connection";

export async function prepareBatchForApproval(batchId: number, tenantId: number, userId: number): Promise<void> {
  // 무효 처리된 생산 건(이력 보존형 복구)은 승인하지 않는다
  const { assertBatchNotVoided } = await import("./batchVoidGuard");
  try { await assertBatchNotVoided(await getRawConnection(), batchId, tenantId); } catch (e: any) { throw new TRPCError({ code: "PRECONDITION_FAILED", message: e?.message }); }
  // 필수 준비가 끝나지 않은 생산 건은 승인하지 않는다 (생산계획 생애주기 검토 4)
  try {
    const res: any = await (await getRawConnection()).execute(`SELECT setup_pending FROM h_batches WHERE id = ? AND tenant_id = ?`, [batchId, tenantId]);
    const sp = res?.[0]?.[0];
    if (Number(sp?.setup_pending ?? 0) === 1) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `배치 #${batchId} 승인 불가 — 생산 건 준비(원료 계획·CCP 기록지)가 끝나지 않았습니다.` });
  } catch (e: any) {
    if (e instanceof TRPCError) throw e;
    if (e?.code !== "ER_BAD_FIELD_ERROR") throw e;
  }
  // 예정 생산 건(미래 날짜로 만든 것)은 기록지가 작성중(draft)이라 아래 formBlockers 에서 막힌다 — 그날 확인이 먼저 (현장 1)
  const { getBatchApprovalOverview } = await import("../../db/production/batchApprovalOverview");
  const ov = await getBatchApprovalOverview(batchId, tenantId);
  if (ov.formBlockers.length > 0) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: `배치 #${batchId} 승인 불가 — CCP 기록지 확인 필요: ${ov.formBlockers.join(" / ")}` });
  }
  const { countUnissuedBatchLines } = await import("./issuedBatchLines");
  if ((await countUnissuedBatchLines(batchId, tenantId)) === 0) return;
  const { autoIssueMaterialsDispatch } = await import("./autoMaterialIssueDispatcher");
  const issue = await autoIssueMaterialsDispatch(batchId, userId, tenantId);
  const left = await countUnissuedBatchLines(batchId, tenantId);
  if (left > 0) {
    const why = [...issue.errors, ...issue.warnings].slice(0, 3).join(" / ");
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `배치 #${batchId} 승인 불가 — 원료 ${left}줄이 출고되지 않았습니다${why ? ` (${why})` : ""}. 재고를 확인한 뒤 원료 출고 후 다시 승인하세요.`,
    });
  }
}

/** completed 전환 + 후속 처리. 경고(제품 LOT·원가·분개 보류 등)를 돌려준다 */
export async function completeApprovedBatch(batchId: number, tenantId: number, userId: number, tag: string): Promise<string[]> {
  const warnings: string[] = [];
  const conn = await getRawConnection();
  await conn.execute(
    `UPDATE h_batches SET status = 'completed', completed_at = COALESCE(completed_at, NOW()), updated_at = NOW()
      WHERE id = ? AND tenant_id = ?`,
    [batchId, tenantId],
  );
  try {
    const { applyBatchDecisionToCcpForms } = await import("../../db/haccp/ccpStatusSync");
    await applyBatchDecisionToCcpForms({ batchId, decision: "approved", userId, tenantId });
  } catch (e: any) {
    console.error(`[${tag}] 배치 #${batchId} CCP 기록지 승인 반영 실패:`, e);
    warnings.push(`CCP 기록지 승인 반영 실패: ${e?.message ?? e}`);
  }
  try {
    const { ensureBatchLots } = await import("../../db/production/productOutboundManagement");
    const lot: any = await ensureBatchLots(batchId, tenantId);
    if (lot?.skipped && lot.reason !== "lots_already_exist") warnings.push(`제품 LOT 생성 보류: ${lot.warning ?? lot.reason ?? "사유 미상"}`);
    else if (lot?.warning) warnings.push(lot.warning);
  } catch (e: any) {
    console.error(`[${tag}] 배치 #${batchId} 완제품 LOT 생성 실패:`, e);
    warnings.push(`제품 LOT 생성 실패: ${e?.message ?? e}`);
  }
  try {
    const { runBatchCompletionHooks } = await import("./batchCompletionHooks");
    const hook = await runBatchCompletionHooks(batchId, tenantId, { source: "manual" });
    warnings.push(...hook.warnings);
  } catch (e: any) {
    console.error(`[${tag}] 배치 #${batchId} 완료 훅 실패:`, e);
    warnings.push(`완료 후처리 실패: ${e?.message ?? e}`);
  }
  if (warnings.length) console.warn(`[${tag}] 배치 #${batchId} 승인 후 확인 필요:`, warnings);
  return warnings;
}

/** 승인 응답 문구 — 후속 처리 경고가 있으면 함께 */
export function approvalMessage(base: string, warnings: string[]): string {
  if (!warnings.length) return base;
  return `${base} — 확인 필요: ${warnings.slice(0, 3).join(" / ")}${warnings.length > 3 ? ` 외 ${warnings.length - 3}건` : ""}`;
}

/**
 * 승인은 됐는데 생산 완료·제품 LOT·원가가 빠진 생산 건을 이어서 끝낸다 (2026-10-21, 단지 생산 건 1127 사례).
 *   예전 생산 화면 승인(approval.approve)은 요청만 approved 로 바꾸고 완료 처리를 하지 않았다 — 그때 승인된 건을 위한 길.
 *   - 이 생산 건의 batch_production 요청이 approved 여야 한다 (승인을 새로 만들거나 우회하지 않음)
 *   - 원료를 다시 출고하지 않는다: 출고 안 된 줄이 하나라도 있으면 거부 (줄 확인이 먼저)
 *   - CCP 기록지 차단 사유가 있으면 거부 (승인 관문과 같은 판정)
 *   - 실제 생산량: 비어 있을 때만 확인한 값으로 채운다 (이미 있으면 그대로)
 *   - 완료·후속 처리는 다른 승인 경로와 같은 completeApprovedBatch — 경고는 돌려준다
 */
export async function resumeApprovedBatchCompletion(batchId: number, tenantId: number, userId: number, actualQuantity: number): Promise<{ requestId: number; warnings: string[] }> {
  const conn: any = await getRawConnection();
  const { assertBatchNotVoided } = await import("./batchVoidGuard");
  try { await assertBatchNotVoided(conn, batchId, tenantId); } catch (e: any) { throw new TRPCError({ code: "PRECONDITION_FAILED", message: e?.message }); }
  const [[b]]: any = await conn.execute(`SELECT id, status, actual_quantity FROM h_batches WHERE id = ? AND tenant_id = ?`, [batchId, tenantId]);
  if (!b) throw new TRPCError({ code: "NOT_FOUND", message: "이 회사의 생산 건이 아닙니다." });
  if (["completed", "shipped", "archived", "cancelled"].includes(String(b.status))) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: `생산 건 #${batchId} 은 이미 ${b.status} 상태입니다 — 이어서 끝낼 것이 없습니다.` });
  }
  const [reqs]: any = await conn.execute(
    `SELECT id FROM h_approval_requests
      WHERE tenant_id = ? AND request_type = 'batch_production' AND reference_type = 'batch' AND reference_id = ? AND status = 'approved'
      ORDER BY id DESC LIMIT 1`,
    [tenantId, batchId],
  );
  const requestId = Number((reqs as any[])[0]?.id ?? 0);
  if (!requestId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `생산 건 #${batchId} 의 승인된 생산 승인 요청이 없습니다 — 정상 승인 경로로 승인하세요.` });
  const { countUnissuedBatchLines } = await import("./issuedBatchLines");
  const left = await countUnissuedBatchLines(batchId, tenantId);
  if (left > 0) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: `생산 건 #${batchId}: 원료 ${left}줄이 출고되지 않았습니다 — 이어서 끝내기는 원료를 다시 출고하지 않습니다. 줄 확인을 먼저 하세요.` });
  }
  const { getBatchApprovalOverview } = await import("../../db/production/batchApprovalOverview");
  const ov = await getBatchApprovalOverview(batchId, tenantId);
  if (ov.formBlockers.length > 0) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: `생산 건 #${batchId}: CCP 기록지 확인 필요 — ${ov.formBlockers.join(" / ")}` });
  }
  if (!(Number.isFinite(actualQuantity) && actualQuantity > 0)) throw new TRPCError({ code: "BAD_REQUEST", message: "실제 생산량(kg)을 확인해 주세요." });
  await conn.execute(
    `UPDATE h_batches SET actual_quantity = ?, updated_at = NOW() WHERE id = ? AND tenant_id = ? AND (actual_quantity IS NULL OR actual_quantity = 0)`,
    [actualQuantity, batchId, tenantId],
  );
  const warnings = await completeApprovedBatch(batchId, tenantId, userId, "resumeApprovedCompletion");
  return { requestId, warnings };
}

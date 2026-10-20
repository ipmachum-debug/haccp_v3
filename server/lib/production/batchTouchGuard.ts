/**
 * 생산 건에 실제로 일어난 일 — '손 안 댄 계획' 인지 (2026-10-20, 생산계획 생애주기 검토 2·3·6)
 *
 * 수량·날짜 재계획, 삭제, 예정으로 되돌리기는 손 안 댄 계획에서만 한다. 하나라도 있으면 그 이유를 돌려준다:
 *   - 상태: 계획(planned) 이 아님, 무효 처리됨
 *   - 원료: 출고 거래(사용·되돌림), 차감된 투입 줄, 출고 판정 기록
 *   - 제품: 완제품 LOT
 *   - 결재: 승인 요청
 *   - CCP: 기록지 승인·제출 확인·사람 저장(행 버전), 행 확인·수정, 현장 이력 — 이 생산 건의 금속검출 통과 행 포함
 * 실행된 생산 건은 이력 보존형 경로(무효·정정)로만 다룬다 — 지우거나 다시 쓰지 않는다.
 */

const ignoreMissing = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
  try {
    return await fn();
  } catch (e: any) {
    if (e?.code === "ER_NO_SUCH_TABLE" || e?.code === "ER_BAD_FIELD_ERROR") return fallback;
    throw e;
  }
};

export async function batchHistoryReasons(conn: any, batchId: number, tenantId: number): Promise<string[]> {
  const out: string[] = [];
  const [[b]]: any = await conn.execute(`SELECT id, status, voided_at FROM h_batches WHERE id = ? AND tenant_id = ?`, [batchId, tenantId]);
  if (!b) return ["생산 건이 없습니다"];
  if (b.voided_at) out.push("무효 처리된 생산 건");
  if (String(b.status) !== "planned") out.push(`상태가 '${b.status}'`);
  const n = async (sql: string, p: unknown[]) => ignoreMissing(async () => Number(((await conn.execute(sql, p)) as any)[0][0]?.n ?? 0), 0);
  if (await n(`SELECT COUNT(*) AS n FROM h_inventory_transactions WHERE tenant_id = ? AND ((source_type IN ('BATCH','batch_completion') AND source_id = ?) OR (reference_type = 'batch' AND reference_id = ?))`, [tenantId, batchId, batchId])) out.push("원료 출고 거래");
  if (await n(`SELECT COUNT(*) AS n FROM h_batch_inputs WHERE tenant_id = ? AND batch_id = ? AND inventory_deducted = 1`, [tenantId, batchId])) out.push("차감된 투입 줄");
  if (await n(`SELECT COUNT(*) AS n FROM h_batch_line_issue_decisions d JOIN h_batch_inputs i ON i.id = d.batch_input_id AND i.tenant_id = d.tenant_id WHERE d.tenant_id = ? AND i.batch_id = ?`, [tenantId, batchId])) out.push("원료 출고 판정 기록");
  if (await n(`SELECT COUNT(*) AS n FROM h_inventory_lots WHERE tenant_id = ? AND batch_id = ? AND product_id IS NOT NULL`, [tenantId, batchId])) out.push("완제품 LOT");
  if (await n(`SELECT COUNT(*) AS n FROM h_approval_requests WHERE tenant_id = ? AND reference_type IN ('batch','batch_group') AND reference_id = ?`, [tenantId, batchId])) out.push("승인 요청");
  if (await n(`SELECT COUNT(*) AS n FROM h_ccp_form_records WHERE tenant_id = ? AND batch_id = ? AND ccp_type <> 'CCP-4P' AND (status = 'approved' OR confirmed_at IS NOT NULL OR rows_version > 0)`, [tenantId, batchId])) out.push("CCP 기록지 제출·승인·저장");
  const rowsWhere = `r.tenant_id = ? AND ((f.batch_id = ? AND f.ccp_type <> 'CCP-4P') OR (f.ccp_type = 'CCP-4P' AND r.batch_id = ?))`;
  if (await n(`SELECT COUNT(*) AS n FROM h_ccp_form_rows r JOIN h_ccp_form_records f ON f.id = r.form_record_id AND f.tenant_id = r.tenant_id
                WHERE ${rowsWhere} AND (r.row_confirmed_at IS NOT NULL OR r.row_version > 0 OR r.pass_time_start IS NOT NULL OR r.metal_pass_time IS NOT NULL)`, [tenantId, batchId, batchId])) out.push("CCP 행 확인·수정");
  if (await n(`SELECT COUNT(*) AS n FROM h_ccp_row_events e JOIN h_ccp_form_rows r ON r.id = e.form_row_id AND r.tenant_id = e.tenant_id JOIN h_ccp_form_records f ON f.id = r.form_record_id AND f.tenant_id = r.tenant_id
                WHERE e.tenant_id = ? AND ((f.batch_id = ? AND f.ccp_type <> 'CCP-4P') OR (f.ccp_type = 'CCP-4P' AND r.batch_id = ?))`, [tenantId, batchId, batchId])) out.push("현장 확인 이력");
  return out;
}

/**
 * 그날 남는 생산 건이 없을 때 이 생산 건을 기준으로 잡은 금속검출 하루 기록지 — 사람이 손대지 않았으면 행째 정리,
 * 손댔으면 기준을 그대로 둔다 (기록 보존). 기준 칸(batch_id)은 비울 수 없다.
 */
export async function dropEmptyDailyMetal(c: any, tenantId: number, batchId: number): Promise<void> {
  const [recs]: any = await c.execute(`SELECT id FROM h_ccp_form_records WHERE tenant_id = ? AND ccp_type = 'CCP-4P' AND batch_id = ?`, [tenantId, batchId]);
  for (const r of recs as any[]) {
    if (await dailyMetalTouched(c, Number(r.id), tenantId)) continue;
    await c.execute(`DELETE FROM h_ccp_form_rows WHERE form_record_id = ? AND tenant_id = ?`, [r.id, tenantId]);
    await c.execute(`DELETE FROM h_ccp_form_records WHERE id = ? AND tenant_id = ?`, [r.id, tenantId]);
  }
}


/**
 * 금속검출 하루 기록지에 사람 흔적이 있는가 — 승인·제출 확인·사람이 확인/수정한 행·현장 이력.
 *   (기록지 행 버전은 동기화로도 오르므로 여기서는 보지 않는다)
 */
export async function dailyMetalTouched(c: any, formRecordId: number, tenantId: number): Promise<boolean> {
  const [[f]]: any = await c.execute(`SELECT status, confirmed_at FROM h_ccp_form_records WHERE id = ? AND tenant_id = ?`, [formRecordId, tenantId]);
  if (!f) return false;
  if (String(f.status) === "approved" || f.confirmed_at != null) return true;
  const [[r]]: any = await c.execute(
    `SELECT COUNT(*) AS n FROM h_ccp_form_rows WHERE form_record_id = ? AND tenant_id = ?
        AND (row_confirmed_at IS NOT NULL OR row_version > 0 OR pass_time_start IS NOT NULL OR pass_time_end IS NOT NULL OR metal_pass_time IS NOT NULL)`,
    [formRecordId, tenantId]);
  return Number(r?.n ?? 0) > 0;
}

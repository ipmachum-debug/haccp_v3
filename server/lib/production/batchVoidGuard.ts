/**
 * 무효 생산 건 보호 (이력 보존형 복구, 2026-10-19)
 *
 * 복구로 무효 처리된 생산 건·기록지는 원본으로 남겨 둘 뿐 — 다시 시작·확인·승인·삭제하지 않는다.
 * 상태는 'cancelled' 지만 일반 취소와 달리 되살리면 이미 되돌린 원료가 다시 빠지거나 중복 생산이 되살아난다.
 * 칸이 없는 예전 DB 에서는 검사하지 않는다 (무효 건 없음).
 */

export class VoidedRecordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VoidedRecordError";
  }
}

export async function assertBatchNotVoided(conn: any, batchId: number, tenantId: number): Promise<void> {
  let row: any;
  try {
    [[row]] = await conn.execute(
      `SELECT voided_at, superseded_by_batch_id FROM h_batches WHERE id = ? AND tenant_id = ?`,
      [batchId, tenantId],
    );
  } catch (e: any) {
    if (e?.code === "ER_BAD_FIELD_ERROR") return;
    throw e;
  }
  if (row?.voided_at) {
    const to = row.superseded_by_batch_id != null ? ` — 대체 생산 건 #${row.superseded_by_batch_id}` : "";
    throw new VoidedRecordError(`무효 처리된 생산 건입니다 (이력 보존형 복구${to}). 시작·확인·승인·삭제할 수 없습니다.`);
  }
}

export async function assertFormNotVoided(conn: any, formRecordId: number, tenantId: number): Promise<void> {
  let row: any;
  try {
    [[row]] = await conn.execute(
      `SELECT voided_at FROM h_ccp_form_records WHERE id = ? AND tenant_id = ?`,
      [formRecordId, tenantId],
    );
  } catch (e: any) {
    if (e?.code === "ER_BAD_FIELD_ERROR") return;
    throw e;
  }
  if (row?.voided_at) {
    throw new VoidedRecordError("무효 처리된 생산 건의 기록지입니다 (이력 보존형 복구 — 원본 보존). 확인·수정·승인할 수 없습니다.");
  }
}

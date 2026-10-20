/**
 * 그날 금속검출(CCP-4P) 기록지 고르기 — 한 곳 (2026-10-20, #626 운영 시험: 당일 승인 뒤 추가 생산 준비 미완)
 *
 * 금속검출 기록지는 하루 통합이지만, 승인된 기록지는 바꾸지 않는다 (행·머리글·인쇄 스냅샷 그대로).
 * 그래서 승인 뒤 같은 날 생산 건이 더 생기면 그날 '추가 기록지' 를 하나 새로 연다 — 하루에 기록지가 여럿일 수 있다.
 *   - 열린 기록지 = 승인·무효가 아닌 것 중 가장 앞. 새 생산 건의 통과 행은 여기에 (그날 하나만 열려 있게).
 *   - 생산 건의 기록지 = 그 생산 건의 통과 행이 있는 기록지 (승인본 포함), 없으면 열린 기록지.
 *   - 한 생산 건은 한 기록지에만 — 다른 기록지에 통과 행이 있는 생산 건은 열린 기록지에 넣지 않는다.
 * 준비 검사·현장 화면·동기화·승인 요청이 모두 이 함수로 같은 기록지를 본다 (이전: 각자 '그날 첫 기록지' — 승인본을 골라 행을 못 넣었다).
 */
type Conn = { execute: (sql: string, params?: any[]) => Promise<any> };

export interface DayMetalForm {
  id: number;
  batchId: number | null;
  status: string;
  fieldMode: boolean;
  detectorEquipmentId: number | null;
  approvalRequestId: number | null;
}

const COLS = `id, batch_id, status, field_mode, detector_equipment_id, approval_request_id`;
const toForm = (r: any): DayMetalForm => ({
  id: Number(r.id), batchId: r.batch_id != null ? Number(r.batch_id) : null, status: String(r.status ?? ""),
  fieldMode: Number(r.field_mode ?? 0) === 1, detectorEquipmentId: r.detector_equipment_id != null ? Number(r.detector_equipment_id) : null,
  approvalRequestId: r.approval_request_id != null ? Number(r.approval_request_id) : null,
});

/** 그날 열린(승인·무효 아닌) 금속검출 기록지 — 없으면 null. lock 이면 FOR UPDATE */
export async function openDayMetalForm(conn: Conn, tenantId: number, workDate: string, lock = false): Promise<DayMetalForm | null> {
  const [rows]: any = await conn.execute(
    `SELECT ${COLS} FROM h_ccp_form_records
      WHERE tenant_id = ? AND ccp_type = 'CCP-4P' AND work_date = ? AND voided_at IS NULL AND status <> 'approved'
      ORDER BY id LIMIT 1${lock ? " FOR UPDATE" : ""}`,
    [tenantId, workDate],
  );
  return (rows as any[])[0] ? toForm((rows as any[])[0]) : null;
}

/** 이 생산 건의 금속검출 기록지 — 통과 행이 있는 기록지(승인본 포함), 없으면 그날 열린 기록지, 둘 다 없으면 null */
export async function metalFormForBatch(conn: Conn, tenantId: number, batchId: number, workDate: string): Promise<DayMetalForm | null> {
  const [rows]: any = await conn.execute(
    `SELECT f.id, f.batch_id, f.status, f.field_mode, f.detector_equipment_id, f.approval_request_id
       FROM h_ccp_form_records f
      WHERE f.tenant_id = ? AND f.ccp_type = 'CCP-4P' AND f.work_date = ? AND f.voided_at IS NULL
        AND EXISTS (SELECT 1 FROM h_ccp_form_rows r WHERE r.form_record_id = f.id AND r.tenant_id = f.tenant_id AND r.batch_id = ? AND r.equipment_type = 'passage')
      ORDER BY f.id LIMIT 1`,
    [tenantId, workDate, batchId],
  );
  if ((rows as any[])[0]) return toForm((rows as any[])[0]);
  return openDayMetalForm(conn, tenantId, workDate);
}

/** 그날 다른 금속검출 기록지에 통과 행이 있는 생산 건은 이 기록지에서 뺀다 — SQL 조각 (b = h_batches 별칭, 인자: 이 기록지 id) */
export const NOT_IN_OTHER_METAL_FORM = `NOT EXISTS (
  SELECT 1 FROM h_ccp_form_rows ro JOIN h_ccp_form_records fo ON fo.id = ro.form_record_id AND fo.tenant_id = ro.tenant_id
   WHERE ro.tenant_id = b.tenant_id AND ro.batch_id = b.id AND ro.equipment_type = 'passage'
     AND fo.ccp_type = 'CCP-4P' AND fo.voided_at IS NULL AND fo.id <> ?)`;

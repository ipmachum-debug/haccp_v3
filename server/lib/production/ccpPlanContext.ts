/**
 * CCP 가열공정 계획 입력 — 읽기만 한다 (2026-10-18, PR-B)
 *
 * 미리보기(batch.previewDay)와 실제 생성(ccp-batch)이 같은 함수로 같은 값을 읽는다.
 *   - BOM: 배치가 쓰는 버전 하나(selectBomVersion) — 회차 기준량·공정 투입량·원물 기준 모두 같은 버전 (결함 #11:
 *     이전에는 회차 기준량만 '최신 승인 버전' 에서 따로 읽어 버전이 다르면 회차와 투입량이 어긋났다)
 *   - 원물·공정 기준(수율 기준) 회사면 배치 생성과 같은 prepareBatchMassBasis 결과
 *   - 오늘 이미 저장된 배치의 설비 사용 시각
 */
import { selectBomVersion } from "../identity/itemIdentityService";
import { CCP_BOM_ROWS_SQL, ccpInputKgByGroup, ccpInputKgFromSnapshot } from "./ccpBomInput";
import { BomQtyError, isPlannedInputRow, plannedInputQty } from "./batchInputPlan";
import { toMin, type BusySlot } from "./ccpDayPlanner";

export interface PlanBom {
  versionId: number | null;
  versionNo: string | null;
  approved: boolean;
  /** 1회차 기준 완제품 kg */
  subBatchKg: number | null;
  /** 공정별 1회차 투입량 kg */
  inputByGroup: Record<number, number>;
  massBasis: "legacy" | "basis" | "error";
  /** massBasis = error 이면 배치 생성이 실패하는 이유 */
  error?: string;
  /** BOM 줄 양을 계약대로 계산할 수 없는 이유 (단위 근거 없음 등) — 있으면 배치 생성이 막힌다 (2026-10-20 검토 1) */
  qtyError?: string;
}

/** 배치가 쓰는 BOM 버전 하나 기준의 회차 기준량·공정 투입량 (원물·공정 기준 회사면 그 스냅샷 계산) */
export async function loadPlanBom(conn: any, tenantId: number, productId: number, plannedKg: number): Promise<PlanBom> {
  const pick = await selectBomVersion(productId, tenantId, conn);
  if (!pick) return { versionId: null, versionNo: null, approved: false, subBatchKg: null, inputByGroup: {}, massBasis: "legacy" };
  const [vRows]: any = await conn.execute(`SELECT version_no, batch_target_kg FROM h_mf_report_versions WHERE id = ?`, [pick.versionId]);
  const v = (vRows as any[])[0] ?? {};
  const versionKg = v.batch_target_kg != null && Number(v.batch_target_kg) > 0 ? Number(v.batch_target_kg) : null;
  const base: PlanBom = {
    versionId: pick.versionId, versionNo: v.version_no != null ? String(v.version_no) : null, approved: pick.approved,
    subBatchKg: versionKg, inputByGroup: {}, massBasis: "legacy",
  };

  // 원물·공정 기준 — 배치 생성(createBatch)과 같은 함수 (켜진 회사·버전만)
  const { prepareBatchMassBasis } = await import("../../db/production/batchMassBasis");
  const mb = await prepareBatchMassBasis(tenantId, productId, plannedKg, conn);
  if (mb.mode === "error") return { ...base, massBasis: "error", error: mb.reason };
  if (mb.mode === "basis") {
    const sub = mb.subBatchKg ?? versionKg;
    return { ...base, massBasis: "basis", subBatchKg: sub, inputByGroup: ccpInputKgFromSnapshot(mb.snapshot.rows, new Set(), sub, mb.snapshot.plannedFinishedKg) };
  }

  const [rows]: any = await conn.execute(CCP_BOM_ROWS_SQL, [pick.versionId]);
  const inputByGroup: Record<number, number> = {};
  try {
    for (const [pg, x] of ccpInputKgByGroup(rows as any[], pick.versionId)) inputByGroup[pg] = x.kg;
  } catch (e) {
    if (e instanceof BomQtyError) return { ...base, qtyError: `CCP 공정 투입량 — ${e.message}` };
    throw e;
  }
  const problem = await plannedInputProblem(conn, tenantId, pick.versionId, plannedKg, versionKg);
  return problem ? { ...base, inputByGroup, qtyError: problem } : { ...base, inputByGroup };
}

/**
 * 원료 투입 계획(재고 출고) 줄이 BOM 줄 계약대로 계산되는가 — 배치 생성(insertPlannedBatchInputs)이 같은 함수로 막는 줄을
 * 미리보기·시험 계산에서 먼저 보여 준다. 읽기만 한다.
 */
export async function plannedInputProblem(conn: any, tenantId: number, versionId: number, plannedKg: number, batchTargetKg: number | null): Promise<string | null> {
  const [rows]: any = await conn.execute(
    `SELECT i.material_id, i.is_deductible, i.quantity, i.corrected_quantity, i.unit, i.is_additional, im.base_unit, im.item_name
       FROM h_mf_ingredients i LEFT JOIN item_master im ON im.id = i.material_id AND im.tenant_id = ?
      WHERE i.mf_report_version_id = ? ORDER BY i.line_no, i.id`,
    [tenantId, versionId],
  );
  for (const r of rows as any[]) {
    const row = {
      materialId: r.material_id != null ? Number(r.material_id) : null, isDeductible: r.is_deductible != null ? Number(r.is_deductible) : null,
      quantity: r.quantity, correctedQuantity: r.corrected_quantity, unit: r.unit, isAdditional: r.is_additional != null ? Number(r.is_additional) : null,
    };
    if (!isPlannedInputRow(row)) continue;
    try {
      plannedInputQty(row, plannedKg, batchTargetKg, r.base_unit);
    } catch (e) {
      if (e instanceof BomQtyError) return `원료 투입 계획 — ${r.item_name ?? `원료 #${row.materialId}`}: ${e.message}`;
      throw e;
    }
  }
  return null;
}

/**
 * 오늘 이미 저장된 가열공정 배치가 설비를 쓰는 시각.
 *   계획 스냅샷(h_ccp_rows.planned_start) 이 있으면 그 값, 없는 예전 배치는 기록지 행의 측정시각 + 설비 점유.
 *   취소된 배치는 뺀다.
 */
export async function loadDayBusy(conn: any, tenantId: number, workDate: string, excludeBatchId?: number | null): Promise<BusySlot[]> {
  const out: BusySlot[] = [];
  const planned = new Set<number>(); // 계획 스냅샷이 있는 배치
  try {
    const [rows]: any = await conn.execute(
      `SELECT i.batch_id, i.process_group_id, r.equipment_id, r.planned_start, r.duration_min
         FROM h_ccp_rows r
         JOIN h_ccp_instances i ON i.id = r.instance_id AND i.tenant_id = r.tenant_id
         JOIN h_batches b ON b.id = i.batch_id AND b.tenant_id = i.tenant_id
        WHERE r.tenant_id = ? AND b.planned_date = ? AND b.status <> 'cancelled'
          AND i.ccp_type IN ('CCP-1B', 'CCP-2B') AND r.equipment_id IS NOT NULL AND r.planned_start IS NOT NULL
          ${excludeBatchId ? "AND i.batch_id <> ?" : ""}`,
      excludeBatchId ? [tenantId, workDate, excludeBatchId] : [tenantId, workDate],
    );
    for (const r of rows as any[]) {
      const s = toMin(String(r.planned_start));
      if (!Number.isFinite(s)) continue;
      planned.add(Number(r.batch_id));
      out.push({ equipmentId: Number(r.equipment_id), processGroupId: Number(r.process_group_id), startMin: s, endMin: s + (Number(r.duration_min) || 0) });
    }
  } catch (e: any) {
    if (e?.code !== "ER_BAD_FIELD_ERROR") throw e; // 계획 컬럼 생성 전 DB — 아래 예전 방식만
  }
  const [legacy]: any = await conn.execute(
    `SELECT fr.batch_id, fr.process_group_id, w.equipment_id, w.measurement_time, e.batch_operation_time
       FROM h_ccp_form_rows w
       JOIN h_ccp_form_records fr ON fr.id = w.form_record_id AND fr.tenant_id = w.tenant_id
       JOIN h_batches b ON b.id = fr.batch_id AND b.tenant_id = fr.tenant_id
       LEFT JOIN equipments e ON e.id = w.equipment_id AND e.tenant_id = w.tenant_id
      WHERE w.tenant_id = ? AND b.planned_date = ? AND b.status <> 'cancelled'
        AND fr.ccp_type IN ('CCP-1B', 'CCP-2B') AND fr.process_group_id IS NOT NULL
        AND w.equipment_id IS NOT NULL AND w.measurement_time IS NOT NULL
        ${excludeBatchId ? "AND fr.batch_id <> ?" : ""}`,
    excludeBatchId ? [tenantId, workDate, excludeBatchId] : [tenantId, workDate],
  );
  for (const r of legacy as any[]) {
    if (planned.has(Number(r.batch_id))) continue;
    const s = toMin(String(r.measurement_time));
    if (!Number.isFinite(s)) continue;
    out.push({ equipmentId: Number(r.equipment_id), processGroupId: Number(r.process_group_id), startMin: s, endMin: s + (Number(r.batch_operation_time) || 0) });
  }
  return out;
}

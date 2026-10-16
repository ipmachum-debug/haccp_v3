/**
 * CCP 기록지의 공정별 투입량 (정제수 제외) — 품목제조보고 버전 하나 기준 (2026-10-16)
 *
 * 이전: APPROVED 버전 전부의 원료 행을 합산 → 승인 버전이 2개인 제품(운영 20개)은 공정 투입 kg 두 배
 *   (우유설기 9/14: 버전1 4.55 + 버전2 4.635 = 9.19kg).
 * 고정: 공정 그룹마다 배치가 쓰는 버전(selectBomVersion) 의 행만 쓴다.
 *   그 버전에 해당 공정이 지정된 원료가 하나도 없으면, 그 공정이 지정된 가장 최신 승인 버전의 행을 쓴다.
 *   (운영: 보고서 422·392 는 버전2 에 CCP 공정 지정이 없고 버전1 에만 있다 — 이 경우 기존처럼 버전1 값.
 *    공정 지정은 원료 행에 있는 그대로 읽기만 하고 새로 지정하지 않는다.)
 * 버전끼리 더하는 일은 없다.
 */

export interface CcpBomRow {
  version_id: number | string;
  version_no: number | string;
  approval_status?: string | null;
  process_group_id: number | string | null;
  corrected_quantity?: string | number | null;
  quantity?: string | number | null;
  unit?: string | null;
  adjusted_weight_kg?: string | number | null;
  material_name?: string | null;
  batch_target_kg?: string | number | null;
}

export function isWaterName(name: string | null | undefined): boolean {
  const n = String(name ?? "").toLowerCase();
  return n.includes("정제수") || n.includes("purified water") || n === "water" || n === "물";
}

/** 원료 행 하나의 kg — adjusted_weight_kg > corrected_quantity > quantity, % 는 그 버전의 batch_target_kg 기준 */
export function rowKg(r: CcpBomRow): number {
  if (r.adjusted_weight_kg != null) return parseFloat(String(r.adjusted_weight_kg)) || 0;
  const raw = parseFloat(String(r.corrected_quantity || r.quantity || "0")) || 0;
  const target = parseFloat(String(r.batch_target_kg ?? "")) || 0;
  if (r.unit === "%") return target > 0 ? (raw / 100) * target : 0;
  if (r.unit === "g") return raw / 1000;
  return raw;
}

/**
 * @param rows 같은 보고서의 후보 버전 행 (선택 버전 + 승인 버전들)
 * @param chosenVersionId 배치가 쓰는 버전
 * @returns 공정 그룹 id → { kg, versionId }
 */
export function ccpInputKgByGroup(rows: CcpBomRow[], chosenVersionId: number): Map<number, { kg: number; versionId: number }> {
  const byGroup = new Map<number, Map<number, { versionNo: number; approved: boolean; rows: CcpBomRow[] }>>();
  for (const r of rows) {
    const pg = Number(r.process_group_id);
    if (!pg) continue;
    const vid = Number(r.version_id);
    const versions = byGroup.get(pg) ?? new Map();
    const entry = versions.get(vid) ?? { versionNo: Number(r.version_no) || 0, approved: r.approval_status === "APPROVED", rows: [] };
    entry.rows.push(r);
    versions.set(vid, entry);
    byGroup.set(pg, versions);
  }
  const out = new Map<number, { kg: number; versionId: number }>();
  for (const [pg, versions] of byGroup) {
    let pickId: number | null = versions.has(chosenVersionId) ? chosenVersionId : null;
    if (pickId == null) {
      // 선택 버전에 이 공정 지정이 없을 때만 — 공정이 지정된 가장 최신 승인 버전 하나
      const approved = [...versions.entries()].filter(([, v]) => v.approved).sort((a, b) => b[1].versionNo - a[1].versionNo || b[0] - a[0]);
      pickId = approved[0]?.[0] ?? null;
    }
    if (pickId == null) continue;
    const kg = versions.get(pickId)!.rows.filter((r) => !isWaterName(r.material_name)).reduce((s, r) => s + rowKg(r), 0);
    out.set(pg, { kg, versionId: pickId });
  }
  return out;
}

/** 후보 행 SQL — 선택 버전 + 같은 보고서의 승인 버전. 바인딩: [reportId, chosenVersionId] */
export const CCP_BOM_ROWS_SQL = `
  SELECT v.id AS version_id, v.version_no, v.approval_status, v.batch_target_kg,
         i.process_group_id, i.corrected_quantity, i.quantity, i.unit, i.adjusted_weight_kg,
         i.material_id, i.material_type, im.item_name AS material_name, im.base_unit
    FROM h_mf_report_versions v
    JOIN h_mf_ingredients i ON i.mf_report_version_id = v.id
    LEFT JOIN item_master im ON im.id = i.material_id
   WHERE v.mf_report_id = ? AND (v.approval_status = 'APPROVED' OR v.id = ?)
     AND i.process_group_id IS NOT NULL
     AND i.material_id IS NOT NULL
   ORDER BY v.version_no, i.line_no`;

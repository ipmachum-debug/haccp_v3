/**
 * CCP 기록지의 공정별 투입량 (정제수 제외) — 품목제조보고 버전 하나 기준 (2026-10-16)
 *
 * 이전: APPROVED 버전 전부의 원료 행을 합산 → 승인 버전이 2개인 제품(운영 20개)은 공정 투입 kg 두 배
 *   (우유설기 9/14: 버전1 4.55 + 버전2 4.635 = 9.19kg).
 * 고정: 배치가 쓰는 버전(selectBomVersion) 하나의 행만 쓴다. 다른 버전 값으로 메우지 않는다.
 *   (#534 초안은 배치 버전에 없는 공정을 이전 승인 버전에서 가져왔으나, 보고서 418 처럼 원료를 다른 공정으로
 *    옮긴 경우 옛 공정을 되살리고 기준량(100kg vs 95kg)까지 섞였다 — Codex 배포 검토 P2. 의도적 이동과
 *    지정 소실을 자동으로 구분할 근거가 없으므로 버전 데이터를 그대로 따른다. 소실은 화면에서 다시 지정한다.)
 * 공정 지정은 원료 행에 있는 그대로 읽기만 하고 새로 지정하지 않는다.
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
 * @param rows 버전 행 (다른 버전 행이 섞여 와도 chosenVersionId 행만 쓴다)
 * @param chosenVersionId 배치가 쓰는 버전
 * @returns 공정 그룹 id → { kg, versionId }
 */
export function ccpInputKgByGroup(rows: CcpBomRow[], chosenVersionId: number): Map<number, { kg: number; versionId: number }> {
  const out = new Map<number, { kg: number; versionId: number }>();
  for (const r of rows) {
    if (Number(r.version_id) !== chosenVersionId) continue;
    const pg = Number(r.process_group_id);
    if (!pg || isWaterName(r.material_name)) continue;
    const cur = out.get(pg) ?? { kg: 0, versionId: chosenVersionId };
    cur.kg += rowKg(r);
    out.set(pg, cur);
  }
  return out;
}

/** 버전 하나의 공정 지정 원료 행. 바인딩: [versionId] */
export const CCP_BOM_ROWS_SQL = `
  SELECT v.id AS version_id, v.version_no, v.approval_status, v.batch_target_kg,
         i.process_group_id, i.corrected_quantity, i.quantity, i.unit, i.adjusted_weight_kg,
         i.material_id, i.material_type, im.item_name AS material_name, im.base_unit
    FROM h_mf_report_versions v
    JOIN h_mf_ingredients i ON i.mf_report_version_id = v.id
    LEFT JOIN item_master im ON im.id = i.material_id
   WHERE v.id = ?
     AND i.process_group_id IS NOT NULL
     AND i.material_id IS NOT NULL
   ORDER BY v.version_no, i.line_no`;

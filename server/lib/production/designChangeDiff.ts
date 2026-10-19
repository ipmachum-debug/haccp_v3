/**
 * 생산 설계 변경 기록 — 바꾸기 전·후 비교 (순수 함수, 2026-10-19 설계 18 §13 변경·적용 이력)
 *
 * 품목제조보고 저장은 지금까지 감사 기록이 없었다 (승인·반려만 따로). 저장 전·후를 읽어 바뀐 것만 남긴다.
 * 설비 수정 기록은 받은 값 전체만 남겨 전후를 알 수 없었다 → 바뀐 칸만 { before, after }.
 */

export interface RecipeSnapshot {
  /** 기록 제목용 제품 이름 (비교하지 않음) */
  productName?: string;
  version: Record<string, unknown>;
  ingredients: Array<{
    key: string; name: string; quantity: unknown; unit: unknown; processGroup: string | null; deductible: unknown; additional: unknown;
    /** 계산에 쓰이는 보조 칸 — 원물·공정 환산(기준 원물 kg·전처리 배율)·조정량·보정 수량·들어가는 곳 (#600 검토: 이 칸만 바뀌어도 기록) */
    basisRawKg?: unknown; pretreatmentFactor?: unknown; adjustedWeightKg?: unknown; correctedQuantity?: unknown; entryStage?: unknown;
  }>;
}

const ING_EXTRA: Array<[keyof RecipeSnapshot["ingredients"][number], string]> = [
  ["basisRawKg", "기준 원물(kg)"], ["pretreatmentFactor", "전처리 배율"], ["adjustedWeightKg", "조정량(kg)"],
  ["correctedQuantity", "보정 수량"], ["entryStage", "들어가는 곳"],
];
const ENTRY_STAGE_TEXT: Record<string, string> = { direct: "성형에 바로", late: "나중에 넣음" };

const norm = (v: unknown) => (v == null || v === "" ? null : Number.isFinite(Number(v)) && typeof v !== "boolean" ? Number(v) : String(v));
const same = (a: unknown, b: unknown) => norm(a) === norm(b);

/** 품목제조보고 — 버전 칸 + 원료 줄(같은 원료끼리) 비교. [{ field, before, after }] */
export function diffRecipe(before: RecipeSnapshot, after: RecipeSnapshot): Array<{ field: string; before: unknown; after: unknown }> {
  const out: Array<{ field: string; before: unknown; after: unknown }> = [];
  for (const k of Array.from(new Set([...Object.keys(before.version), ...Object.keys(after.version)]))) {
    if (!same(before.version[k], after.version[k])) out.push({ field: k, before: before.version[k] ?? null, after: after.version[k] ?? null });
  }
  const show = (i: RecipeSnapshot["ingredients"][number]) => `${i.quantity}${i.unit ?? ""}${i.processGroup ? ` · ${i.processGroup}` : ""}`;
  const bMap = new Map(before.ingredients.map((i) => [i.key, i]));
  const aMap = new Map(after.ingredients.map((i) => [i.key, i]));
  for (const [k, a] of aMap) {
    const b = bMap.get(k);
    if (!b) { out.push({ field: `원료 추가: ${a.name}`, before: null, after: show(a) }); continue; }
    if (!same(b.quantity, a.quantity) || !same(b.unit, a.unit)) out.push({ field: `${a.name} 배합`, before: `${b.quantity}${b.unit ?? ""}`, after: `${a.quantity}${a.unit ?? ""}` });
    if ((b.processGroup ?? null) !== (a.processGroup ?? null)) out.push({ field: `${a.name} 공정`, before: b.processGroup ?? "지정 없음", after: a.processGroup ?? "지정 없음" });
    if (!same(b.deductible, a.deductible)) out.push({ field: `${a.name} 재고 차감`, before: Number(b.deductible) ? "차감" : "안 함", after: Number(a.deductible) ? "차감" : "안 함" });
    for (const [k, label] of ING_EXTRA) {
      if (same(b[k], a[k])) continue;
      const txt = (v: unknown) => (v == null || v === "" ? null : k === "entryStage" ? ENTRY_STAGE_TEXT[String(v)] ?? v : v);
      out.push({ field: `${a.name} ${label}`, before: txt(b[k]), after: txt(a[k]) });
    }
  }
  for (const [k, b] of bMap) if (!aMap.has(k)) out.push({ field: `원료 삭제: ${b.name}`, before: show(b), after: null });
  return out;
}

/** 설비 등 한 행 — 받은 값 중 실제로 바뀐 칸만 { field: { before, after } } (없으면 null) */
export function diffFields(before: Record<string, unknown> | null | undefined, updates: Record<string, unknown>): Record<string, { before: unknown; after: unknown }> | null {
  if (!before) return null;
  const out: Record<string, { before: unknown; after: unknown }> = {};
  for (const [k, v] of Object.entries(updates)) {
    if (v === undefined || v === "") continue; // 저장 계약: 빈 값은 '바꾸지 않음'
    if (!same(before[k], v)) out[k] = { before: before[k] ?? null, after: v };
  }
  return Object.keys(out).length ? out : null;
}

/**
 * 품목제조보고 저장 전·후 읽기 — updateMfReport 가 고치는 버전(보고서의 최신 버전)과 그 원료 줄.
 *   원료 비교 키 = 원료(품목) id · 중간재 id · 줄 순서가 같은 원료가 여러 줄이면 그 순번.
 */
export async function snapshotRecipe(conn: any, tenantId: number, mfReportId: number): Promise<RecipeSnapshot | null> {
  const [[rep]]: any = await conn.execute(
    `SELECT r.id, r.report_no, DATE_FORMAT(r.report_date, '%Y-%m-%d') AS report_date, p.item_name AS product_name
       FROM h_mf_reports r LEFT JOIN item_master p ON p.id = r.product_id AND p.tenant_id = r.tenant_id
      WHERE r.id = ? AND r.tenant_id = ?`,
    [mfReportId, tenantId],
  );
  if (!rep) return null;
  const [[v]]: any = await conn.execute(
    `SELECT id, version_no, batch_target_kg, yield_basis, unit_weight_g, mass_basis_enabled, reference_finished_kg, reference_raw_total_kg FROM h_mf_report_versions WHERE mf_report_id = ? ORDER BY version_no DESC, id DESC LIMIT 1`,
    [mfReportId],
  );
  if (!v) return null;
  const [iRows]: any = await conn.execute(
    `SELECT i.material_id, i.intermediate_id, i.quantity, i.unit, i.is_deductible, i.is_additional, g.name AS pg,
            i.basis_raw_kg, i.pretreatment_factor, i.adjusted_weight_kg, i.corrected_quantity, i.entry_stage,
            COALESCE(m.item_name, CONCAT('원료 #', COALESCE(i.material_id, i.intermediate_id))) AS name
       FROM h_mf_ingredients i
       LEFT JOIN item_master m ON m.id = i.material_id AND m.tenant_id = ?
       LEFT JOIN ccp_process_groups g ON g.id = i.process_group_id AND g.tenant_id = ?
      WHERE i.mf_report_version_id = ? ORDER BY i.line_no, i.id`,
    [tenantId, tenantId, Number(v.id)],
  );
  const seen = new Map<string, number>();
  const ingredients = (iRows as any[]).map((r) => {
    const base = `${r.material_id ?? "-"}:${r.intermediate_id ?? "-"}:${Number(r.is_additional) ? "add" : "main"}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return { key: `${base}#${n}`, name: String(r.name), quantity: r.quantity, unit: r.unit, processGroup: r.pg ?? null, deductible: r.is_deductible, additional: r.is_additional,
      basisRawKg: r.basis_raw_kg, pretreatmentFactor: r.pretreatment_factor, adjustedWeightKg: r.adjusted_weight_kg, correctedQuantity: r.corrected_quantity, entryStage: r.entry_stage };
  });
  return {
    productName: rep.product_name ?? undefined,
    version: {
      reportNo: rep.report_no, reportDate: rep.report_date, batchTargetKg: v.batch_target_kg, yieldBasis: v.yield_basis,
      unitWeightG: v.unit_weight_g, massBasisEnabled: Number(v.mass_basis_enabled) === 1 ? "켬" : "끔", referenceFinishedKg: v.reference_finished_kg,
      referenceRawTotalKg: v.reference_raw_total_kg,
    },
    ingredients,
  };
}

/**
 * 금속검출 일일 기록지 — 현장 확인 기록지(field_mode) 행 맞추기 (2026-10-19, 하루 생산 흐름)
 *
 * 무작위 시각을 만들지 않는다. 시각은 현장에서 누를 때 서버 시각으로 채운다.
 *   - 통과 행: 생산 건(·SKU)마다 하나, batch_id 연결. 통과량은 생산량(SKU 실적이 있으면 그 수량·단위). 시작·종료 시각은 비움 → [통과 시작]/[통과 종료]
 *   - 감도점검 행: 제품마다 '품목시작'·'품목종료' — 평상 결과(Fe·SUS 검출 O, 제품 단독 X)를 미리 채우고 점검 시각은 비움 → [확인]
 *     2시간 점검 등은 현장에서 [감도점검 추가] (fieldWork.addSensitivityRow)
 *   - 검출기: 기록지에 정한 검출기(없으면 회사의 첫 활성 금속검출기)를 행에 기록
 * 사람이 손댄 행(행 버전 > 0·시각 있음·확인됨)은 지우거나 덮어쓰지 않는다. 손대지 않은 행만 맞춘다 (생산 건이 빠지면 그 행 삭제, 수량 갱신).
 * 무효 처리된 생산 건(voided_at)·취소 건은 뺀다.
 */

const SENS_NORMAL = { metal_fe_mid: "O", metal_sus_mid: "O", metal_product_only: "X", metal_fe_product: "O", metal_sus_product: "O" };

export async function syncFieldMetalRows(conn: any, p: { formRecordId: number; tenantId: number; workDate: string; detectorId?: number | null }): Promise<number> {
  const { formRecordId, tenantId, workDate } = p;
  let detectorId = p.detectorId != null ? Number(p.detectorId) : null;
  let detectorName: string | null = null;
  if (!detectorId) {
    const [eq]: any = await conn.execute(`SELECT id, name FROM equipments WHERE tenant_id = ? AND ccp_type = 'CCP-4P' AND status = 'active' ORDER BY id LIMIT 1`, [tenantId]);
    if ((eq as any[]).length) {
      detectorId = Number(eq[0].id); detectorName = String(eq[0].name);
      await conn.execute(`UPDATE h_ccp_form_records SET detector_equipment_id = ? WHERE id = ? AND tenant_id = ? AND detector_equipment_id IS NULL`, [detectorId, formRecordId, tenantId]);
    }
  } else {
    const [eq]: any = await conn.execute(`SELECT name FROM equipments WHERE id = ? AND tenant_id = ?`, [detectorId, tenantId]);
    detectorName = (eq as any[])[0]?.name ?? null;
  }

  // 그날 생산 건(무효·취소 제외) + SKU 실적
  const [src]: any = await conn.execute(
    `SELECT b.id AS batch_id, b.planned_quantity, COALESCE(p.product_name, '') AS product_name,
            pso.sku_id, ps.sku_name, ps.sales_unit, COALESCE(pso.quantity, 0) AS sku_quantity
       FROM h_batches b
       LEFT JOIN h_products_v2 p ON p.id = b.product_id AND p.tenant_id = b.tenant_id
       LEFT JOIN production_sku_output pso ON pso.batch_id = b.id AND pso.tenant_id = b.tenant_id
       LEFT JOIN product_skus ps ON ps.id = pso.sku_id AND ps.tenant_id = b.tenant_id
      WHERE b.tenant_id = ? AND b.planned_date = ? AND b.voided_at IS NULL AND b.status <> 'cancelled'
      ORDER BY COALESCE(b.day_batch_group, CONCAT('_', b.id)), b.batch_order, b.id, ps.sku_code`,
    [tenantId, workDate],
  );
  type Want = { batchId: number; name: string; product: string; qty: number; unit: string };
  const wants: Want[] = [];
  const seen = new Set<string>();
  for (const r of src as any[]) {
    const skuQty = Number(r.sku_quantity) || 0;
    const name = r.sku_id && skuQty > 0 ? String(r.sku_name ?? r.product_name) : String(r.product_name);
    const key = `${r.batch_id}|${name}`;
    if (seen.has(key)) {
      if (skuQty > 0) { const w = wants.find((x) => `${x.batchId}|${x.name}` === key); if (w) w.qty += skuQty; }
      continue;
    }
    seen.add(key);
    wants.push({ batchId: Number(r.batch_id), name, product: String(r.product_name), qty: skuQty > 0 ? skuQty : Math.round(Number(r.planned_quantity) || 0), unit: skuQty > 0 ? String(r.sales_unit || "ea") : "kg" });
  }

  const [ex]: any = await conn.execute(
    `SELECT id, batch_seq, equipment_type, product_name, batch_id, note, pass_qty, pass_unit, pass_time_start, pass_time_end, metal_pass_time,
            row_version, row_confirmed_at
       FROM h_ccp_form_rows WHERE form_record_id = ? AND tenant_id = ? ORDER BY batch_seq, id`,
    [formRecordId, tenantId],
  );
  const rows = ex as any[];
  const touched = (r: any) => Number(r.row_version ?? 0) > 0 || r.row_confirmed_at != null || r.pass_time_start != null || r.pass_time_end != null || r.metal_pass_time != null;
  let seq = rows.reduce((m, r) => Math.max(m, Number(r.batch_seq) || 0), 0);
  let changed = 0;

  // 통과 행
  const passRows = rows.filter((r) => r.equipment_type === "passage");
  for (const w of wants) {
    const hit = passRows.find((r) => Number(r.batch_id) === w.batchId && String(r.product_name ?? "") === w.name);
    if (hit) {
      if (!touched(hit) && (Number(hit.pass_qty) !== w.qty || String(hit.pass_unit ?? "") !== w.unit)) {
        await conn.execute(`UPDATE h_ccp_form_rows SET pass_qty = ?, pass_unit = ?, updated_at = NOW() WHERE id = ? AND tenant_id = ?`, [w.qty, w.unit, hit.id, tenantId]);
        changed++;
      }
      continue;
    }
    seq++;
    await conn.execute(
      `INSERT INTO h_ccp_form_rows (tenant_id, form_record_id, batch_seq, equipment_id, equipment_name, equipment_type, product_name, batch_id,
                                    pass_qty, pass_unit, detected_qty, result, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'passage', ?, ?, ?, ?, 0, '적합', NOW(), NOW())`,
      [tenantId, formRecordId, seq, detectorId, detectorName, w.name, w.batchId, w.qty, w.unit],
    );
    changed++;
  }
  for (const r of passRows) {
    const still = wants.some((w) => Number(r.batch_id) === w.batchId && String(r.product_name ?? "") === w.name);
    if (!still && !touched(r)) {
      await conn.execute(`DELETE FROM h_ccp_form_rows WHERE id = ? AND tenant_id = ?`, [r.id, tenantId]);
      changed++;
    }
  }

  // 감도점검 — 제품마다 품목시작·품목종료 (평상 결과 미리 채움, 시각은 확인 때)
  const products = Array.from(new Set(wants.map((w) => w.product)));
  const sensRows = rows.filter((r) => r.equipment_type === "sensitivity");
  for (const prod of products) {
    for (const label of ["품목시작", "품목종료"]) {
      if (sensRows.some((r) => String(r.product_name ?? "") === prod && String(r.note ?? "") === label)) continue;
      seq++;
      await conn.execute(
        `INSERT INTO h_ccp_form_rows (tenant_id, form_record_id, batch_seq, equipment_id, equipment_name, equipment_type, product_name, note,
                                      metal_fe_mid, metal_sus_mid, metal_product_only, metal_fe_product, metal_sus_product, result, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'sensitivity', ?, ?, ?, ?, ?, ?, ?, '적합', NOW(), NOW())`,
        [tenantId, formRecordId, seq, detectorId, detectorName, prod, label,
          SENS_NORMAL.metal_fe_mid, SENS_NORMAL.metal_sus_mid, SENS_NORMAL.metal_product_only, SENS_NORMAL.metal_fe_product, SENS_NORMAL.metal_sus_product],
      );
      changed++;
    }
  }
  for (const r of sensRows) {
    if (!products.includes(String(r.product_name ?? "")) && !touched(r)) {
      await conn.execute(`DELETE FROM h_ccp_form_rows WHERE id = ? AND tenant_id = ?`, [r.id, tenantId]);
      changed++;
    }
  }
  if (changed) {
    const kg = wants.filter((w) => w.unit === "kg").reduce((s, w) => s + w.qty, 0);
    await conn.execute(`UPDATE h_ccp_form_records SET batch_count = ?, planned_qty_kg = ? WHERE id = ? AND tenant_id = ?`,
      [new Set(wants.map((w) => w.batchId)).size, kg, formRecordId, tenantId]);
  }
  return changed;
}

export const SENSITIVITY_NORMAL = SENS_NORMAL;

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
 *
 * 통과 행의 정체성 (2026-10-20, #611 추가 검토 3): 생산 건 + SKU 번호(sku_id) — 이름으로 합치지 않는다.
 *   - 생산 건에 수량 > 0 인 SKU 실적이 하나라도 있으면 SKU 마다 한 줄(그 SKU 판매단위·수량). 수량 0 인 SKU 는 행을 만들지 않는다.
 *   - SKU 실적이 없으면 생산 건 하나에 kg 한 줄 — 계획 kg 를 소수 3자리까지 그대로 (20.286kg 를 20 으로 자르지 않음).
 *   - 서로 다른 SKU 는 이름이 같아도 따로, 단위가 다르면 더하지 않는다.
 *   - 예전에 이름으로 만든 행(sku_id 없음)을 사람이 이미 손댔으면 그 생산 건의 통과 행은 그대로 둔다 (중복 행을 만들지 않음, 다시 쓰지 않음).
 */

const SENS_NORMAL = { metal_fe_mid: "O", metal_sus_mid: "O", metal_product_only: "X", metal_fe_product: "O", metal_sus_product: "O" };

/**
 * 손대지 않은 행만 바꾸는 조건 — 읽은 행 버전 그대로이고 사람 흔적(확인·시각)이 없을 때만 (2026-10-20, #612 추가 검토 2).
 *   읽은 뒤 작업자가 먼저 확인·수정했으면 affectedRows 0 → 사람 기록을 그대로 둔다.
 */
const UNTOUCHED_AT = `row_version = ? AND row_confirmed_at IS NULL AND pass_time_start IS NULL AND pass_time_end IS NULL AND metal_pass_time IS NULL`;

/**
 * 같은 기록지 동기화는 한 번에 하나 (이름 잠금 — 행 잠금 순서와 얽히지 않음). 승인된 기록지는 건드리지 않고,
 * 실제로 바뀌면 기록지 확인(제출)을 무효로 (행 버전↑ — 다시 확인해야 승인).
 */
export async function syncFieldMetalRows(conn: any, p: { formRecordId: number; tenantId: number; workDate: string; detectorId?: number | null }): Promise<number> {
  const own = typeof conn.getConnection === "function" ? await conn.getConnection() : null;
  const c = own ?? conn;
  const lockName = `millio:metal-sync:${p.tenantId}:${p.formRecordId}`;
  try {
    const [[got]]: any = await c.query("SELECT GET_LOCK(?, 15) AS ok", [lockName]);
    if (Number(got?.ok) !== 1) throw new Error("금속검출 기록지 동기화가 다른 요청과 겹쳤습니다 — 잠시 뒤 다시 시도하세요.");
    try {
      return await syncFieldMetalRowsLocked(c, p);
    } finally {
      await c.query("SELECT RELEASE_LOCK(?)", [lockName]).catch(() => undefined);
    }
  } finally {
    if (own) own.release();
  }
}

async function syncFieldMetalRowsLocked(conn: any, p: { formRecordId: number; tenantId: number; workDate: string; detectorId?: number | null }): Promise<number> {
  const { formRecordId, tenantId, workDate } = p;
  const [[rec]]: any = await conn.execute(`SELECT status FROM h_ccp_form_records WHERE id = ? AND tenant_id = ?`, [formRecordId, tenantId]);
  if (!rec || String(rec.status) === "approved") return 0; // 승인된 기록지는 그대로
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
  const wants = passageWants(src as any[]);

  const [ex]: any = await conn.execute(
    `SELECT id, batch_seq, equipment_type, product_name, batch_id, sku_id, note, pass_qty, pass_unit, pass_time_start, pass_time_end, metal_pass_time,
            row_version, row_confirmed_at
       FROM h_ccp_form_rows WHERE form_record_id = ? AND tenant_id = ? ORDER BY batch_seq, id`,
    [formRecordId, tenantId],
  );
  const rows = ex as any[];
  const touched = (r: any) => Number(r.row_version ?? 0) > 0 || r.row_confirmed_at != null || r.pass_time_start != null || r.pass_time_end != null || r.metal_pass_time != null;
  let seq = rows.reduce((m, r) => Math.max(m, Number(r.batch_seq) || 0), 0);
  let changed = 0;

  // 통과 행 — 생산 건 + SKU 번호로 맞춘다
  const passRows = rows.filter((r) => r.equipment_type === "passage");
  const keyOfRow = (r: any) => passageKey(Number(r.batch_id), r.sku_id != null ? Number(r.sku_id) : null, String(r.pass_unit ?? "kg"));
  const wantKeys = new Set(wants.map((w) => passageKey(w.batchId, w.skuId, w.unit)));
  // SKU 번호 없는 예전 행을 사람이 손댔는데 지금 구성과 맞지 않는 생산 건 — 새 행을 만들지 않는다 (중복 방지·재작성 금지)
  const frozenBatches = new Set(passRows.filter((r) => r.sku_id == null && touched(r) && !wantKeys.has(keyOfRow(r))).map((r) => Number(r.batch_id)));
  for (const w of wants) {
    const k = passageKey(w.batchId, w.skuId, w.unit);
    const hit = passRows.find((r) => keyOfRow(r) === k);
    if (hit) {
      if (!touched(hit) && (Math.abs(Number(hit.pass_qty) - w.qty) > 0.0005 || String(hit.pass_unit ?? "") !== w.unit || String(hit.product_name ?? "") !== w.name)) {
        const [u]: any = await conn.execute(`UPDATE h_ccp_form_rows SET pass_qty = ?, pass_unit = ?, product_name = ?, updated_at = NOW() WHERE id = ? AND tenant_id = ? AND ${UNTOUCHED_AT}`,
          [w.qty, w.unit, w.name, hit.id, tenantId, Number(hit.row_version ?? 0)]);
        if (Number(u?.affectedRows ?? 0) === 1) changed++;
      }
      continue;
    }
    if (frozenBatches.has(w.batchId)) continue;
    seq++;
    await conn.execute(
      `INSERT INTO h_ccp_form_rows (tenant_id, form_record_id, batch_seq, equipment_id, equipment_name, equipment_type, product_name, batch_id, sku_id,
                                    pass_qty, pass_unit, detected_qty, result, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'passage', ?, ?, ?, ?, ?, 0, '적합', NOW(), NOW())`,
      [tenantId, formRecordId, seq, detectorId, detectorName, w.name, w.batchId, w.skuId, w.qty, w.unit],
    );
    changed++;
  }
  for (const r of passRows) {
    if (!wantKeys.has(keyOfRow(r)) && !touched(r)) {
      const [d]: any = await conn.execute(`DELETE FROM h_ccp_form_rows WHERE id = ? AND tenant_id = ? AND ${UNTOUCHED_AT}`, [r.id, tenantId, Number(r.row_version ?? 0)]);
      if (Number(d?.affectedRows ?? 0) === 1) changed++;
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
      const [d]: any = await conn.execute(`DELETE FROM h_ccp_form_rows WHERE id = ? AND tenant_id = ? AND ${UNTOUCHED_AT}`, [r.id, tenantId, Number(r.row_version ?? 0)]);
      if (Number(d?.affectedRows ?? 0) === 1) changed++;
    }
  }
  if (changed) {
    const kg = wants.filter((w) => w.unit === "kg").reduce((s, w) => s + w.qty, 0);
    // 기록지 내용이 바뀌었으니 기존 확인(제출)은 무효 — 행 버전↑ (승인된 기록지는 위에서 건너뜀)
    await conn.execute(`UPDATE h_ccp_form_records SET batch_count = ?, planned_qty_kg = ?, rows_version = rows_version + 1 WHERE id = ? AND tenant_id = ? AND status <> 'approved'`,
      [new Set(wants.map((w) => w.batchId)).size, kg, formRecordId, tenantId]);
  }
  return changed;
}

export const SENSITIVITY_NORMAL = SENS_NORMAL;

export type PassageWant = { batchId: number; skuId: number | null; name: string; product: string; qty: number; unit: string };
const r3 = (x: number) => Math.round(x * 1000) / 1000;
export const passageKey = (batchId: number, skuId: number | null, unit: string) => `${batchId}|${skuId ?? "-"}|${skuId == null ? "kg" : unit}`;

/**
 * 그날 생산 건·SKU 실적 → 통과 행 목록 (순수 함수, 순서 = 입력 순서).
 *   생산 건에 수량 > 0 SKU 가 있으면 SKU 번호마다 한 줄(같은 SKU 번호가 여러 실적 행이면 수량 합 — 같은 SKU 는 단위가 하나),
 *   없으면 계획 kg 한 줄(소수 3자리). 이름은 표시용일 뿐 합치는 기준이 아니다.
 */
export function passageWants(src: Array<{ batch_id: unknown; planned_quantity: unknown; product_name: unknown; sku_id: unknown; sku_name: unknown; sales_unit: unknown; sku_quantity: unknown }>): PassageWant[] {
  const order: number[] = [];
  const byBatch = new Map<number, typeof src>();
  for (const r of src) {
    const b = Number(r.batch_id);
    if (!byBatch.has(b)) { byBatch.set(b, []); order.push(b); }
    byBatch.get(b)!.push(r);
  }
  const out: PassageWant[] = [];
  for (const b of order) {
    const rs = byBatch.get(b)!;
    const product = String(rs[0].product_name ?? "");
    const skus = rs.filter((r) => r.sku_id != null && Number(r.sku_quantity) > 0);
    if (skus.length) {
      const bySku = new Map<number, PassageWant>();
      for (const r of skus) {
        const id = Number(r.sku_id);
        const cur = bySku.get(id);
        if (cur) cur.qty += Number(r.sku_quantity);
        else bySku.set(id, { batchId: b, skuId: id, name: String(r.sku_name ?? product), product, qty: Number(r.sku_quantity), unit: String(r.sales_unit || "ea") });
      }
      out.push(...Array.from(bySku.values()));
    } else {
      out.push({ batchId: b, skuId: null, name: product, product, qty: r3(Number(rs[0].planned_quantity) || 0), unit: "kg" });
    }
  }
  return out;
}

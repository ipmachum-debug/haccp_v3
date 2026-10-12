/**
 * 원재료 단가 — 입고가 기준 (2026-10-13, 원가 정합성 1차)
 *
 * 배경 (덤프 10/10 실측, tenant 2)
 *  · 매입 등록(createPurchase) 이 만든 LOT 153건의 unit_price 가 NULL. 입고 거래의 unit_cost 는 "포대당 가격",
 *    quantity 는 kg 로 단위가 어긋남 (예: 찹쌀 50포 × 65,000원 = 3,250,000원 / 1,000kg → kg당 3,250원인데
 *    unit_cost=65,000).
 *  · 그래서 FEFO 할당 unit_cost=0 → h_batch_inputs.unit_price=0 → 원가 화면이 마스터 단가(3월 값 4,000원)로 폴백.
 *    마스터 단가가 0 인 자재(통팥앙금M 등)는 "-" / 0원.
 *
 * 원칙
 *  · LOT 단가는 항상 "LOT 수량 단위당" 가격. 매입에서 파생할 때는 금액 ÷ 기준수량.
 *  · 입고가 들어오면 h_materials.unit_price(현재 단가) 를 그 값으로 갱신하고 h_material_price_history 에 남긴다.
 *    (CEO 요구: 신규 입고 시 자동 업데이트. 수동 고정/일괄 갱신은 단가 관리 화면에서 — 후속 PR)
 */
import type { PoolConnection, Pool } from "mysql2/promise";

type Conn = Pool | PoolConnection;

/** 매입 1건에서 LOT 수량 단위당 단가를 구한다. 금액 ÷ 기준수량 우선, 없으면 단가 ÷ 포장규격 */
export function perUnitPriceFromPurchase(p: {
  unitPrice?: number | null;      // 매입 단가 (포장 단위당)
  packagingSize?: number | null;  // 포장규격 (1포 = N kg)
  amount?: number | null;         // 매입 금액 (공급가)
  totalBaseQty?: number | null;   // LOT 수량 (기준 단위)
}): number {
  const amount = Number(p.amount ?? 0);
  const totalQty = Number(p.totalBaseQty ?? 0);
  if (amount > 0 && totalQty > 0) return round2(amount / totalQty);
  const unitPrice = Number(p.unitPrice ?? 0);
  const pack = Number(p.packagingSize ?? 0) > 0 ? Number(p.packagingSize) : 1;
  if (unitPrice > 0) return round2(unitPrice / pack);
  return 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toDateStr(v: string | Date | null | undefined): string | null {
  if (!v) return null;
  if (typeof v === "string") return v.slice(0, 10);
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface LatestReceiptPrice {
  unitPrice: number;
  source: "lot" | "receipt_tx";
  receiptDate: string | null;
  lotId: number | null;
}

/**
 * 자재의 입고 단가 — 시점 기준.
 *  · asOfDate 를 주면 "그 날짜 이전(포함) 최근 입고가" (과거 배치는 과거 가격으로 — CEO 원칙 2026-10-13).
 *  · 없으면 현재 기준 최근 입고가.
 *  ① unit_price 가 있는 최신 LOT ② 금액이 있는 최신 입고 거래(금액 ÷ 수량). 없으면 null.
 */
export async function getLatestReceiptUnitPrice(
  conn: Conn,
  materialId: number,
  tenantId: number,
  asOfDate?: string | Date | null,
): Promise<LatestReceiptPrice | null> {
  const asOf = toDateStr(asOfDate);
  const [lotRows] = await conn.execute<any[]>(
    `SELECT id, unit_price, DATE_FORMAT(receipt_date, '%Y-%m-%d') AS rd
     FROM h_inventory_lots
     WHERE tenant_id = ? AND material_id = ? AND unit_price IS NOT NULL AND unit_price > 0
       AND lot_number NOT LIKE 'NEG-%' AND lot_number NOT LIKE 'COUNT-%'
       ${asOf ? "AND (receipt_date IS NULL OR receipt_date <= ?)" : ""}
     ORDER BY receipt_date DESC, id DESC LIMIT 1`,
    asOf ? [tenantId, materialId, asOf] : [tenantId, materialId],
  );
  const lot = (lotRows as any[])[0];
  if (lot && Number(lot.unit_price) > 0) {
    return { unitPrice: round2(Number(lot.unit_price)), source: "lot", receiptDate: lot.rd ?? null, lotId: Number(lot.id) };
  }
  const [txRows] = await conn.execute<any[]>(
    `SELECT lot_id, amount, quantity, DATE_FORMAT(transaction_date, '%Y-%m-%d') AS td
     FROM h_inventory_transactions
     WHERE tenant_id = ? AND material_id = ? AND transaction_type = 'receipt'
       AND amount IS NOT NULL AND amount > 0 AND quantity IS NOT NULL AND quantity > 0
       ${asOf ? "AND transaction_date <= ?" : ""}
     ORDER BY transaction_date DESC, id DESC LIMIT 1`,
    asOf ? [tenantId, materialId, asOf] : [tenantId, materialId],
  );
  const tx = (txRows as any[])[0];
  if (tx) {
    const p = Number(tx.amount) / Number(tx.quantity);
    if (p > 0) return { unitPrice: round2(p), source: "receipt_tx", receiptDate: tx.td ?? null, lotId: tx.lot_id != null ? Number(tx.lot_id) : null };
  }
  return null;
}

/**
 * 입고로 확정된 단가를 자재 현재 단가(h_materials.unit_price) 에 반영하고 이력을 남긴다.
 * 같은 값이면 아무것도 하지 않는다. 실패는 호출자를 깨뜨리지 않는다 (입고 자체가 정본).
 */
/**
 * 자재 현재 단가 + 입고 시 자동 갱신 플래그.
 * price_auto_update 컬럼은 2026-10-13 추가 (scripts/migrations-manual/2026-10-13-material-price-auto-update-column.sql).
 * 컬럼이 아직 없으면 자동 갱신 ON 으로 본다 — 배포 순서와 무관하게 안전.
 */
export async function readMaterialPriceRow(conn: Conn, materialId: number, tenantId: number): Promise<{ unitPrice: number | null; autoUpdate: boolean } | null> {
  try {
    const [rows] = await conn.execute<any[]>(
      `SELECT unit_price, price_auto_update FROM h_materials WHERE id = ? AND tenant_id = ? LIMIT 1`,
      [materialId, tenantId],
    );
    const row = (rows as any[])[0];
    if (!row) return null;
    return { unitPrice: row.unit_price != null ? Number(row.unit_price) : null, autoUpdate: row.price_auto_update == null ? true : Number(row.price_auto_update) === 1 };
  } catch (err: any) {
    if (err?.code === "ER_BAD_FIELD_ERROR" || /Unknown column/i.test(String(err?.message))) {
      const [rows] = await conn.execute<any[]>(
        `SELECT unit_price FROM h_materials WHERE id = ? AND tenant_id = ? LIMIT 1`,
        [materialId, tenantId],
      );
      const row = (rows as any[])[0];
      if (!row) return null;
      return { unitPrice: row.unit_price != null ? Number(row.unit_price) : null, autoUpdate: true };
    }
    throw err;
  }
}

async function writeMaterialPrice(conn: Conn, p: {
  materialId: number; tenantId: number; oldPrice: number | null; newPrice: number; changedBy?: number | null; reason: string;
}): Promise<void> {
  await conn.execute(
    `UPDATE h_materials SET unit_price = ?, updated_at = NOW() WHERE id = ? AND tenant_id = ?`,
    [p.newPrice, p.materialId, p.tenantId],
  );
  await conn.execute(
    `INSERT INTO h_material_price_history (tenant_id, material_id, old_price, new_price, changed_by, reason)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [p.tenantId, p.materialId, p.oldPrice, p.newPrice, p.changedBy ?? null, p.reason],
  );
}

/**
 * 입고로 확정된 단가를 자재 현재 단가(h_materials.unit_price) 에 반영하고 이력을 남긴다.
 * 자동 갱신이 꺼진 자재(수동 고정)는 건너뛴다. 같은 값이면 아무것도 하지 않는다.
 * 실패는 호출자를 깨뜨리지 않는다 (입고 자체가 정본).
 */
export async function applyMaterialPriceFromReceipt(conn: Conn, p: {
  materialId: number;
  tenantId: number;
  unitPrice: number;
  changedBy?: number | null;
  reason: string;
}): Promise<{ updated: boolean; oldPrice: number | null; skipped?: "auto_update_off" | "same" | "no_price" | "not_found" }> {
  try {
    if (!(p.unitPrice > 0)) return { updated: false, oldPrice: null, skipped: "no_price" };
    const row = await readMaterialPriceRow(conn, p.materialId, p.tenantId);
    if (!row) return { updated: false, oldPrice: null, skipped: "not_found" };
    if (!row.autoUpdate) return { updated: false, oldPrice: row.unitPrice, skipped: "auto_update_off" };
    const newPrice = round2(p.unitPrice);
    if (row.unitPrice != null && Math.abs(row.unitPrice - newPrice) < 0.005) return { updated: false, oldPrice: row.unitPrice, skipped: "same" };
    await writeMaterialPrice(conn, { materialId: p.materialId, tenantId: p.tenantId, oldPrice: row.unitPrice, newPrice, changedBy: p.changedBy, reason: p.reason });
    return { updated: true, oldPrice: row.unitPrice };
  } catch (err) {
    console.error(`[materialPrice] 현재 단가 갱신 실패 material=${p.materialId} (입고는 완료):`, err);
    return { updated: false, oldPrice: null };
  }
}

// ═══════════════════════════════════════════════════════════════
// 단가 관리 화면 (2026-10-13, CEO 요청) — 목록 / 수동 입력 / 자동 갱신 토글 / 일괄 갱신 / 이력
// ═══════════════════════════════════════════════════════════════

export interface MaterialPriceRow {
  materialId: number;
  materialCode: string;
  materialName: string;
  unit: string | null;
  kind: string | null;
  currentPrice: number;
  autoUpdate: boolean;
  latestReceiptPrice: number | null;
  latestReceiptDate: string | null;
  latestReceiptSource: "lot" | "receipt_tx" | null;
  /** 현재 단가 대비 최근 입고가 차이 (%) — 둘 다 있을 때 */
  diffPct: number | null;
  lastChangeAt: Date | null;
  lastChangeReason: string | null;
  lastChangeNewPrice: number | null;
  /** 현재 단가 0/NULL */
  missing: boolean;
  /** 최근 입고가와 현재 단가가 다름 (자동 갱신 꺼짐이거나 백필 전) */
  stale: boolean;
}

export async function listMaterialPrices(conn: Conn, tenantId: number, opts?: { search?: string; includeInactive?: boolean }): Promise<MaterialPriceRow[]> {
  const search = (opts?.search ?? "").trim();
  let rows: any[];
  const baseSql = (withFlag: boolean) => `
    SELECT m.id, m.material_code AS materialCode, m.material_name AS materialName, m.unit, m.kind,
           m.unit_price AS currentPrice, ${withFlag ? "m.price_auto_update" : "1"} AS autoUpdate,
           lot.unit_price AS lotPrice, DATE_FORMAT(lot.receipt_date, '%Y-%m-%d') AS lotDate,
           tx.p AS txPrice, tx.d AS txDate,
           h.changed_at AS lastChangeAt, h.reason AS lastChangeReason, h.new_price AS lastChangeNewPrice
    FROM h_materials m
    LEFT JOIN h_inventory_lots lot ON lot.id = (
      SELECT l.id FROM h_inventory_lots l
       WHERE l.tenant_id = m.tenant_id AND l.material_id = m.id AND l.unit_price > 0
         AND l.lot_number NOT LIKE 'NEG-%' AND l.lot_number NOT LIKE 'COUNT-%'
       ORDER BY l.receipt_date DESC, l.id DESC LIMIT 1)
    LEFT JOIN (
      SELECT t.tenant_id, t.material_id, ROUND(t.amount / t.quantity, 2) AS p, DATE_FORMAT(t.transaction_date, '%Y-%m-%d') AS d
        FROM h_inventory_transactions t
        JOIN (SELECT tenant_id, material_id, MAX(id) AS mid FROM h_inventory_transactions
               WHERE transaction_type = 'receipt' AND amount > 0 AND quantity > 0
               GROUP BY tenant_id, material_id) x ON x.mid = t.id
    ) tx ON tx.tenant_id = m.tenant_id AND tx.material_id = m.id
    LEFT JOIN h_material_price_history h ON h.id = (
      SELECT h2.id FROM h_material_price_history h2
       WHERE h2.tenant_id = m.tenant_id AND h2.material_id = m.id
       ORDER BY h2.changed_at DESC, h2.id DESC LIMIT 1)
    WHERE m.tenant_id = ?
      ${opts?.includeInactive ? "" : "AND m.is_active = 1"}
      ${search ? "AND (m.material_name LIKE ? OR m.material_code LIKE ?)" : ""}
      AND m.material_name NOT LIKE '%정제수%'
    ORDER BY m.material_name`;
  const params = search ? [tenantId, `%${search}%`, `%${search}%`] : [tenantId];
  try {
    [rows] = await conn.execute<any[]>(baseSql(true), params);
  } catch (err: any) {
    if (err?.code === "ER_BAD_FIELD_ERROR" || /Unknown column/i.test(String(err?.message))) {
      [rows] = await conn.execute<any[]>(baseSql(false), params);
    } else {
      throw err;
    }
  }
  return (rows as any[]).map((r) => {
    const current = r.currentPrice != null ? Number(r.currentPrice) : 0;
    const lotPrice = r.lotPrice != null ? Number(r.lotPrice) : null;
    const txPrice = r.txPrice != null ? Number(r.txPrice) : null;
    const latest = lotPrice && lotPrice > 0 ? lotPrice : txPrice && txPrice > 0 ? txPrice : null;
    const latestDate = lotPrice && lotPrice > 0 ? (r.lotDate ?? null) : txPrice && txPrice > 0 ? (r.txDate ?? null) : null;
    const latestSource: MaterialPriceRow["latestReceiptSource"] = lotPrice && lotPrice > 0 ? "lot" : txPrice && txPrice > 0 ? "receipt_tx" : null;
    const diffPct = latest != null && current > 0 ? round2(((latest - current) / current) * 100) : null;
    return {
      materialId: Number(r.id),
      materialCode: String(r.materialCode ?? ""),
      materialName: String(r.materialName ?? ""),
      unit: r.unit ?? null,
      kind: r.kind ?? null,
      currentPrice: current,
      autoUpdate: r.autoUpdate == null ? true : Number(r.autoUpdate) === 1,
      latestReceiptPrice: latest,
      latestReceiptDate: latestDate,
      latestReceiptSource: latestSource,
      diffPct,
      lastChangeAt: r.lastChangeAt ?? null,
      lastChangeReason: r.lastChangeReason ?? null,
      lastChangeNewPrice: r.lastChangeNewPrice != null ? Number(r.lastChangeNewPrice) : null,
      missing: !(current > 0),
      stale: latest != null && current > 0 && Math.abs(latest - current) >= 0.01,
    };
  });
}

/** 수동 입력 — 샘플·1회성 매입·원가 누락 보강. 사유 필수. autoUpdate 를 함께 바꿀 수 있다 (수동 고정 = false). */
export async function setManualMaterialPrice(conn: Conn, p: {
  materialId: number; tenantId: number; unitPrice: number; reason: string; changedBy?: number | null; autoUpdate?: boolean;
}): Promise<{ updated: boolean; oldPrice: number | null }> {
  if (!(p.unitPrice >= 0)) throw new Error("단가는 0 이상이어야 합니다");
  const row = await readMaterialPriceRow(conn, p.materialId, p.tenantId);
  if (!row) throw new Error("자재를 찾을 수 없습니다");
  const newPrice = round2(p.unitPrice);
  const changed = row.unitPrice == null || Math.abs(row.unitPrice - newPrice) >= 0.005;
  if (changed) {
    await writeMaterialPrice(conn, { materialId: p.materialId, tenantId: p.tenantId, oldPrice: row.unitPrice, newPrice, changedBy: p.changedBy, reason: `수동: ${p.reason}` });
  }
  if (p.autoUpdate !== undefined) {
    await setMaterialPriceAutoUpdate(conn, { materialId: p.materialId, tenantId: p.tenantId, enabled: p.autoUpdate });
  }
  return { updated: changed, oldPrice: row.unitPrice };
}

/** 입고 시 자동 갱신 ON/OFF. 컬럼이 없으면 명확한 오류로 알린다 (ALTER 필요). */
export async function setMaterialPriceAutoUpdate(conn: Conn, p: { materialId: number; tenantId: number; enabled: boolean }): Promise<void> {
  try {
    await conn.execute(
      `UPDATE h_materials SET price_auto_update = ?, updated_at = NOW() WHERE id = ? AND tenant_id = ?`,
      [p.enabled ? 1 : 0, p.materialId, p.tenantId],
    );
  } catch (err: any) {
    if (err?.code === "ER_BAD_FIELD_ERROR" || /Unknown column/i.test(String(err?.message))) {
      throw new Error("price_auto_update 컬럼이 아직 없습니다. scripts/migrations-manual/2026-10-13-material-price-auto-update-column.sql 을 먼저 실행하세요.");
    }
    throw err;
  }
}

/**
 * 현재 단가를 최근 입고가로 일괄 갱신. 자동 갱신이 꺼진 자재(수동 고정)는 건너뛴다.
 * onlyMissing=true 면 현재 단가가 0/NULL 인 자재만.
 */
export async function refreshMaterialPricesFromReceipts(conn: Conn, p: { tenantId: number; changedBy?: number | null; onlyMissing?: boolean }): Promise<{
  total: number; updated: number; skippedFixed: number; skippedSame: number; noReceipt: number; updatedNames: string[];
}> {
  const list = await listMaterialPrices(conn, p.tenantId);
  let updated = 0, skippedFixed = 0, skippedSame = 0, noReceipt = 0;
  const updatedNames: string[] = [];
  for (const m of list) {
    if (p.onlyMissing && !m.missing) continue;
    if (m.latestReceiptPrice == null) { noReceipt++; continue; }
    if (!m.autoUpdate) { skippedFixed++; continue; }
    if (Math.abs(m.latestReceiptPrice - m.currentPrice) < 0.005) { skippedSame++; continue; }
    await writeMaterialPrice(conn, {
      materialId: m.materialId, tenantId: p.tenantId, oldPrice: m.currentPrice > 0 ? m.currentPrice : null,
      newPrice: m.latestReceiptPrice, changedBy: p.changedBy,
      reason: `일괄 갱신: 최근 입고가 (${m.latestReceiptDate ?? "-"})`,
    });
    updated++;
    updatedNames.push(m.materialName);
  }
  return { total: list.length, updated, skippedFixed, skippedSame, noReceipt, updatedNames };
}

export async function getMaterialPriceHistory(conn: Conn, materialId: number, tenantId: number, limit = 20) {
  const [rows] = await conn.execute<any[]>(
    `SELECT h.id, h.old_price AS oldPrice, h.new_price AS newPrice, h.changed_at AS changedAt, h.reason, u.name AS changedByName
     FROM h_material_price_history h
     LEFT JOIN users u ON u.id = h.changed_by
     WHERE h.tenant_id = ? AND h.material_id = ?
     ORDER BY h.changed_at DESC, h.id DESC LIMIT ${Math.max(1, Math.min(200, Math.floor(limit)))}`,
    [tenantId, materialId],
  );
  return (rows as any[]).map((r) => ({
    id: Number(r.id),
    oldPrice: r.oldPrice != null ? Number(r.oldPrice) : null,
    newPrice: Number(r.newPrice),
    changedAt: r.changedAt ?? null,
    reason: r.reason ?? null,
    changedByName: r.changedByName ?? null,
  }));
}

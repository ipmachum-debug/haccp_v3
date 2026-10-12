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
export async function applyMaterialPriceFromReceipt(conn: Conn, p: {
  materialId: number;
  tenantId: number;
  unitPrice: number;
  changedBy?: number | null;
  reason: string;
}): Promise<{ updated: boolean; oldPrice: number | null }> {
  try {
    if (!(p.unitPrice > 0)) return { updated: false, oldPrice: null };
    const [rows] = await conn.execute<any[]>(
      `SELECT unit_price FROM h_materials WHERE id = ? AND tenant_id = ? LIMIT 1`,
      [p.materialId, p.tenantId],
    );
    const row = (rows as any[])[0];
    if (!row) return { updated: false, oldPrice: null };
    const oldPrice = row.unit_price != null ? Number(row.unit_price) : null;
    const newPrice = round2(p.unitPrice);
    if (oldPrice != null && Math.abs(oldPrice - newPrice) < 0.005) return { updated: false, oldPrice };

    await conn.execute(
      `UPDATE h_materials SET unit_price = ?, updated_at = NOW() WHERE id = ? AND tenant_id = ?`,
      [newPrice, p.materialId, p.tenantId],
    );
    await conn.execute(
      `INSERT INTO h_material_price_history (tenant_id, material_id, old_price, new_price, changed_by, reason)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [p.tenantId, p.materialId, oldPrice, newPrice, p.changedBy ?? null, p.reason],
    );
    return { updated: true, oldPrice };
  } catch (err) {
    console.error(`[materialPrice] 현재 단가 갱신 실패 material=${p.materialId} (입고는 완료):`, err);
    return { updated: false, oldPrice: null };
  }
}

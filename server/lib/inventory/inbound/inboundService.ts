/**
 * 입고 확정 서비스 — 원재료 입고의 단일 처리 (2026-10-17, 입고 정본화 PR-2)
 *
 * CEO 확정 흐름:
 *   발주서 작성·승인            → 재고 없음
 *   입고 수량·LOT·기한·검수 입력 → 재고 없음 (입고 문서 draft)
 *   입고 확정 (또는 입고 승인)   → LOT·재고·원장·수불부·발주 입고량에 **한 번** 반영
 *   발주 없이 직접 입고          → 같은 확정 로직
 * 화면 입구는 둘('발주서에서 입고' / '발주 없이 직접 입고'), 내부 처리는 이 파일 하나.
 *
 * 보장:
 *   - 한 트랜잭션 (withInventoryTx): 문서·줄·발주 줄 잠금 → 줄마다 receiveNewLot(inboundLineId) → 줄·수불부·발주 입고량 →
 *     문서 확정 → 이벤트. 하나라도 실패하면 전부 되돌린다 (부분 성공 없음 — 나눠 받으려면 문서를 나눈다).
 *   - 멱등: 문서 생성은 (회사, idempotency_key) UNIQUE, 확정은 문서 잠금 + 확정 상태면 그대로 반환,
 *     줄은 lot_id 가 있으면 건너뜀, 마지막 방어는 LOT (회사, inbound_line_id) UNIQUE.
 *   - 부분 입고: 발주 줄 잔량(ordered − received) 을 넘는 입고는 거부 (초과 입고 허용 여부는 미결정 — 기본 거부).
 *   - 승인 대기: 회사 설정 INBOUND_APPROVAL 이 켜진 회사만 (확정 요청 → pending_approval → 승인 시 확정). 정책 데이터, 코드 분기 아님.
 *   - 검수 불합격(fail) 줄은 확정하지 않는다 (불합격 처리 정책 미결정 — 기본 거부).
 *   - 원료 id 는 이 회사의 h_materials id 로 (item_master id 가 와도 ItemIdentityService 로 변환).
 * 매입전표: 발주서 입고는 확정 때 대기 전표 초안을 입고 줄에 연결해 만든다 (CEO 결정). 전표 확정은 분개만 (재고 재생성 없음).
 */
import { withInventoryTx, receiveNewLot, applyLotDelta, InventoryShortageError } from "../applyInventoryDelta";
import { toInventoryMaterialId } from "../../identity/itemIdentityService";
import { isTenantFeatureEnabled } from "../../production/massBasisPolicy";
import { publishEvent } from "../../../platform/event-bus";

export const INBOUND_APPROVAL_FEATURE = "INBOUND_APPROVAL";
const EPS = 0.0005;

export interface InboundLineInput {
  materialId: number;
  poLineId?: number | null;
  purchaseQuantity: number;
  purchaseUnit: string;
  stockQuantity: number;
  stockUnit: string;
  unitPrice: number;
  lotNumber?: string | null;
  expiryDate?: string | null;
  productionDate?: string | null;
  location?: string | null;
  inspectionResult?: "pending" | "pass" | "fail" | "conditional" | null;
  inspectionJson?: Record<string, unknown> | null;
  notes?: string | null;
}

export interface CreateInboundDraftInput {
  tenantId: number;
  userId: number;
  idempotencyKey: string;
  sourceType: "purchase_order" | "direct";
  poId?: number | null;
  supplierId?: number | null;
  inboundDate: string; // YYYY-MM-DD (업무일자)
  siteId?: number;
  notes?: string | null;
  lines: InboundLineInput[];
}

function requireTenant(tenantId: number): number {
  const t = Number(tenantId);
  if (!Number.isFinite(t) || t <= 0) throw new Error("테넌트 정보가 필요합니다.");
  return t;
}

const normUnit = (u: unknown) => String(u ?? "").trim().toLowerCase();

/**
 * 재고 단위 = 회사 원료 기준 단위 (Codex #558 검증 F1). 환산 근거가 없으므로 다르면 거부 — kg 재고에 g 숫자를 더하지 않는다.
 * 원료 기준 단위가 비어 있거나, 같은 원료의 사용 중 LOT 에 다른 단위가 있으면 역시 거부 (fail-closed).
 */
async function assertStockUnit(conn: any, tenantId: number, materialId: number, stockUnit: string, label: string): Promise<void> {
  const [m]: any = await conn.execute(`SELECT unit FROM h_materials WHERE id = ? AND tenant_id = ? LIMIT 1`, [materialId, tenantId]);
  const base = normUnit((m as any[])[0]?.unit);
  if (!base) throw new Error(`${label}: 원재료 기준 단위가 비어 있어 입고할 수 없습니다 — 원재료 정보에 단위를 먼저 지정하세요.`);
  if (normUnit(stockUnit) !== base) throw new Error(`${label}: 재고 단위(${stockUnit}) 가 원재료 기준 단위(${(m as any[])[0].unit}) 와 다릅니다 — 기준 단위로 환산해 입력하세요.`);
  const [o]: any = await conn.execute(
    `SELECT DISTINCT unit FROM h_inventory_lots WHERE tenant_id = ? AND material_id = ? AND status = 'available' AND LOWER(TRIM(unit)) <> ? LIMIT 3`,
    [tenantId, materialId, base],
  );
  if ((o as any[]).length) throw new Error(`${label}: 이 원재료에 다른 단위(${(o as any[]).map((r) => r.unit).join(", ")}) 의 LOT 이 있어 합산할 수 없습니다 — 재고 단위를 먼저 정리하세요.`);
}

/** 발주 줄 = 요청 원료·단위인지 (Codex #558 검증 F2·F3) — 둘 다 회사 h_materials id 로 바꿔 비교, 단위는 발주 단위와 같아야 */
async function assertPoLine(conn: any, tenantId: number, poId: number, poLineId: number, materialId: number, purchaseUnit: string, label: string, lock = false) {
  const [pl]: any = await conn.execute(
    `SELECT id, po_id, material_id, unit, ordered_qty, received_qty FROM purchase_order_lines WHERE id = ? AND tenant_id = ? LIMIT 1${lock ? " FOR UPDATE" : ""}`,
    [poLineId, tenantId],
  );
  const line = (pl as any[])[0];
  if (!line || Number(line.po_id) !== Number(poId)) throw new Error(`${label}: 이 발주서의 줄이 아닙니다.`);
  if (line.material_id == null) throw new Error(`${label}: 발주 줄이 원재료와 연결되지 않았습니다.`);
  const poMat = (await toInventoryMaterialId(Number(line.material_id), tenantId, conn)).id;
  if (poMat !== Number(materialId)) throw new Error(`${label}: 발주 줄 원료와 입고 원료가 다릅니다.`);
  if (normUnit(line.unit) !== normUnit(purchaseUnit)) throw new Error(`${label}: 매입 단위(${purchaseUnit}) 가 발주 단위(${line.unit}) 와 다릅니다 — 발주 단위로 입력하세요.`);
  return line;
}

const isDup = (e: any) => e?.code === "ER_DUP_ENTRY" || /Duplicate entry/.test(String(e?.message));

/** 입고 문서 (draft) 생성 — 재고는 아직 없음. 같은 키로 다시 부르면 기존 문서를 돌려준다. */
export async function createInboundDraft(p: CreateInboundDraftInput): Promise<{ headerId: number; created: boolean }> {
  const tenantId = requireTenant(p.tenantId);
  const key = String(p.idempotencyKey ?? "").trim();
  if (!key || key.length > 64) throw new Error("idempotencyKey 가 필요합니다 (64자 이하).");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.inboundDate)) throw new Error("입고일(YYYY-MM-DD) 이 필요합니다.");
  if (!p.lines?.length) throw new Error("입고 줄이 하나 이상 필요합니다.");
  if (p.sourceType === "purchase_order" && !p.poId) throw new Error("발주서에서 입고는 발주서가 필요합니다.");

  const existing = await findByKey(tenantId, key);
  if (existing) return { headerId: existing, created: false };

  try {
    return await withInventoryTx(async (conn) => {
      if (p.poId) {
        const [po]: any = await conn.execute(
          `SELECT id, status, partner_id FROM purchase_orders WHERE id = ? AND tenant_id = ? LIMIT 1`, [p.poId, tenantId],
        );
        const row = (po as any[])[0];
        if (!row) throw new Error(`발주서 #${p.poId} 를 찾을 수 없습니다.`);
        if (!["approved", "partial_received"].includes(row.status)) throw new Error(`승인된 발주서만 입고할 수 있습니다 (현재: ${row.status}).`);
      }
      const resolved: Array<InboundLineInput & { canonicalMaterialId: number }> = [];
      for (const [i, l] of p.lines.entries()) {
        if (!(l.purchaseQuantity > 0) || !(l.stockQuantity > 0)) throw new Error(`${i + 1}번 줄: 수량은 0 보다 커야 합니다.`);
        if (!String(l.purchaseUnit ?? "").trim() || !String(l.stockUnit ?? "").trim()) throw new Error(`${i + 1}번 줄: 단위가 필요합니다.`);
        const { id } = await toInventoryMaterialId(Number(l.materialId), tenantId, conn);
        const [m]: any = await conn.execute(`SELECT id FROM h_materials WHERE id = ? AND tenant_id = ? LIMIT 1`, [id, tenantId]);
        if (!(m as any[])[0]) throw new Error(`${i + 1}번 줄: 원재료를 찾을 수 없습니다 (id=${l.materialId}).`);
        await assertStockUnit(conn, tenantId, id, l.stockUnit, `${i + 1}번 줄`);
        // 발주서 입고는 모든 줄이 그 발주의 줄이어야 한다 (Codex #558 검증 F5 — 발주 잔량 검사 우회 방지).
        //   발주에 없는 품목은 직접 입고로 따로.
        if (p.sourceType === "purchase_order" && !l.poLineId) throw new Error(`${i + 1}번 줄: 발주서 입고는 발주 줄을 지정해야 합니다 (발주에 없는 품목은 직접 입고로).`);
        if (l.poLineId) {
          if (!p.poId) throw new Error(`${i + 1}번 줄: 발주 줄은 발주서 입고에서만 지정할 수 있습니다.`);
          await assertPoLine(conn, tenantId, Number(p.poId), Number(l.poLineId), id, l.purchaseUnit, `${i + 1}번 줄`);
        }
        resolved.push({ ...l, canonicalMaterialId: id });
      }
      const ymd = p.inboundDate.replace(/-/g, "");
      const [h]: any = await conn.execute(
        `INSERT INTO h_inbound_headers
           (tenant_id, inbound_number, site_id, supplier_id, inbound_date, status, notes, created_by, source_type, po_id, idempotency_key)
         VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)`,
        [tenantId, `IB-${tenantId}-${ymd}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, p.siteId ?? 1,
         p.supplierId ?? null, p.inboundDate, p.notes ?? null, p.userId, p.sourceType, p.poId ?? null, key],
      );
      const headerId = Number(h.insertId);
      await conn.execute(`UPDATE h_inbound_headers SET inbound_number = ? WHERE id = ? AND tenant_id = ?`, [`IB-${tenantId}-${ymd}-${headerId}`, headerId, tenantId]);
      for (const [i, l] of resolved.entries()) {
        await conn.execute(
          `INSERT INTO h_inbound_lines
             (tenant_id, header_id, line_number, material_id, po_line_id, purchase_quantity, purchase_unit, stock_quantity, stock_unit,
              unit_price, total_price, lot_number, expiry_date, production_date, location, inspection_result, inspection_json, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [tenantId, headerId, i + 1, l.canonicalMaterialId, l.poLineId ?? null, l.purchaseQuantity, l.purchaseUnit, l.stockQuantity, l.stockUnit,
           l.unitPrice, Math.round(l.purchaseQuantity * l.unitPrice * 100) / 100, l.lotNumber ?? null, l.expiryDate ?? null,
           l.productionDate ?? null, l.location ?? null, l.inspectionResult ?? null,
           l.inspectionJson ? JSON.stringify(l.inspectionJson) : null, l.notes ?? null],
        );
      }
      return { headerId, created: true };
    }, "inbound.createDraft");
  } catch (e) {
    // 같은 키로 동시에 들어온 다른 요청이 먼저 만들었으면 그 문서
    if (isDup(e)) {
      const again = await findByKey(tenantId, key);
      if (again) return { headerId: again, created: false };
    }
    throw e;
  }
}

async function findByKey(tenantId: number, key: string): Promise<number | null> {
  const { getRawConnection } = await import("../../../db/connection");
  const [rows]: any = await (await getRawConnection()).execute(
    `SELECT id FROM h_inbound_headers WHERE tenant_id = ? AND idempotency_key = ? LIMIT 1`, [tenantId, key],
  );
  return (rows as any[])[0] ? Number((rows as any[])[0].id) : null;
}

export type ConfirmInboundResult =
  | { status: "confirmed"; alreadyProcessed: boolean; lots: Array<{ lineId: number; lotId: number; lotNumber: string }>; voucherIds: number[] }
  | { status: "pending_approval" };

/**
 * 입고 확정 — 재고 반영은 이 함수 한 곳.
 * 승인 필요 회사에서 approve=false 로 부르면 pending_approval 로 두고 재고는 반영하지 않는다.
 */
export async function confirmInbound(
  headerId: number, tenantIdIn: number, userId: number,
  opts: { approve?: boolean; createVoucherDrafts?: boolean } = {},
): Promise<ConfirmInboundResult> {
  const tenantId = requireTenant(tenantIdIn);
  const { getRawConnection } = await import("../../../db/connection");
  const needsApproval = await isTenantFeatureEnabled(await getRawConnection(), tenantId, INBOUND_APPROVAL_FEATURE);

  return withInventoryTx(async (conn) => {
    const [hRows]: any = await conn.execute(
      `SELECT id, status, DATE_FORMAT(inbound_date, '%Y-%m-%d') AS inbound_date, supplier_id, po_id, source_type
         FROM h_inbound_headers WHERE id = ? AND tenant_id = ? LIMIT 1 FOR UPDATE`,
      [headerId, tenantId],
    );
    const header = (hRows as any[])[0];
    if (!header) throw new Error(`입고 문서 #${headerId} 를 찾을 수 없습니다.`);
    if (header.status === "confirmed") {
      const [done]: any = await conn.execute(
        `SELECT id, lot_id, lot_number FROM h_inbound_lines WHERE header_id = ? AND tenant_id = ? ORDER BY line_number`, [headerId, tenantId],
      );
      const [vs]: any = await conn.execute(
        `SELECT p.id FROM accounting_purchases p JOIN h_inbound_lines l ON l.id = p.inbound_line_id AND l.tenant_id = p.tenant_id
          WHERE l.header_id = ? AND p.tenant_id = ? AND p.status <> 'cancelled' ORDER BY p.id`, [headerId, tenantId],
      );
      return {
        status: "confirmed", alreadyProcessed: true,
        lots: (done as any[]).map((r) => ({ lineId: Number(r.id), lotId: Number(r.lot_id), lotNumber: String(r.lot_number) })),
        voucherIds: (vs as any[]).map((v) => Number(v.id)),
      };
    }
    if (header.status === "cancelled") throw new Error("취소된 입고 문서는 확정할 수 없습니다.");
    if (needsApproval && !opts.approve) {
      if (header.status === "draft") {
        await conn.execute(`UPDATE h_inbound_headers SET status = 'pending_approval' WHERE id = ? AND tenant_id = ?`, [headerId, tenantId]);
      }
      return { status: "pending_approval" };
    }
    if (opts.approve && header.status !== "pending_approval" && needsApproval) {
      throw new Error("승인 대기 상태의 입고만 승인할 수 있습니다.");
    }

    // 발주서 입고는 매입전표 초안(대기, 입고 줄 연결)을 같은 트랜잭션에서 만든다 (CEO 결정 2026-10-17).
    //   전표 확정(postPurchase) 은 연결된 입고의 LOT 을 쓰고 분개만 만든다 — 재고를 다시 만들지 않는다.
    const createVouchers = opts.createVoucherDrafts ?? header.source_type === "purchase_order";
    let poPartnerId: number | null = null;
    if (header.po_id) {
      // 발주 헤더를 잠그고 지금 입고 가능한 상태인지 다시 본다 (Codex #558 검증 F4 — 초안 뒤 취소된 발주)
      //   잠금 순서: 입고 문서 → 발주 헤더 → 발주 줄 (발주 취소는 발주 헤더 하나만 잠근다)
      const [pp]: any = await conn.execute(`SELECT partner_id, status FROM purchase_orders WHERE id = ? AND tenant_id = ? LIMIT 1 FOR UPDATE`, [header.po_id, tenantId]);
      const po = (pp as any[])[0];
      if (!po) throw new Error(`발주서 #${header.po_id} 를 찾을 수 없습니다.`);
      if (!["approved", "partial_received"].includes(po.status)) throw new Error(`입고할 수 없는 발주서 상태입니다 (현재: ${po.status}).`);
      poPartnerId = po.partner_id != null ? Number(po.partner_id) : null;
    }
    const voucherIds: number[] = [];
    let supplierName: string | null = null;
    if (header.supplier_id) {
      const [ps]: any = await conn.execute(`SELECT company_name FROM partners WHERE id = ? AND tenant_id = ? LIMIT 1`, [header.supplier_id, tenantId]);
      supplierName = (ps as any[])[0]?.company_name ?? null;
    }
    const inboundDate = String(header.inbound_date);

    // 날짜 전용 값은 'YYYY-MM-DD' 문자열로 (Codex #558 검증 F6 — Date 객체가 UTC 로 바뀌며 하루 앞당겨짐)
    const [lRows]: any = await conn.execute(
      `SELECT l.*, DATE_FORMAT(l.expiry_date, '%Y-%m-%d') AS expiry_ymd, DATE_FORMAT(l.production_date, '%Y-%m-%d') AS production_ymd
         FROM h_inbound_lines l WHERE l.header_id = ? AND l.tenant_id = ? ORDER BY l.line_number FOR UPDATE`, [headerId, tenantId],
    );
    const lines = lRows as any[];
    if (lines.length === 0) throw new Error("입고 줄이 없습니다.");
    const lots: Array<{ lineId: number; lotId: number; lotNumber: string }> = [];
    for (const line of lines) {
      if (line.lot_id) { lots.push({ lineId: Number(line.id), lotId: Number(line.lot_id), lotNumber: String(line.lot_number) }); continue; }
      if (line.inspection_result === "fail") throw new Error(`${line.line_number}번 줄: 검수 불합격 — 확정할 수 없습니다.`);
      const purchaseQty = Number(line.purchase_quantity);
      const stockQty = Number(line.stock_quantity);
      const label = `${line.line_number}번 줄`;
      await assertStockUnit(conn, tenantId, Number(line.material_id), line.stock_unit, label);
      if (header.source_type === "purchase_order" && !line.po_line_id) throw new Error(`${label}: 발주서 입고는 발주 줄을 지정해야 합니다.`);
      // 발주 줄 잔량 — 줄 소속·원료·단위도 확정 시점에 다시 (발주 단위 수량으로 비교·증가)
      if (line.po_line_id) {
        if (!header.po_id) throw new Error(`${label}: 발주 없는 입고 문서에 발주 줄이 있습니다.`);
        const pol = await assertPoLine(conn, tenantId, Number(header.po_id), Number(line.po_line_id), Number(line.material_id), line.purchase_unit, label, true);
        const remaining = Number(pol.ordered_qty) - Number(pol.received_qty);
        if (purchaseQty > remaining + EPS) {
          throw new Error(`${line.line_number}번 줄: 발주 잔량 ${round3(remaining)} 을 넘습니다 (입고 ${purchaseQty}).`);
        }
      }
      const lotNumber = line.lot_number || `IB${tenantId}-${headerId}-${line.line_number}`;
      const stockUnitPrice = stockQty > 0 ? Math.round((Number(line.total_price) / stockQty) * 100) / 100 : null;
      const r = await receiveNewLot(conn, {
        tenantId,
        subject: { materialId: Number(line.material_id) },
        lotNumber,
        quantity: stockQty,
        unit: line.stock_unit,
        unitPrice: stockUnitPrice,
        receiptDate: inboundDate,
        expiryDate: line.expiry_ymd ?? null,
        productionDate: line.production_ymd ?? null,
        supplierName,
        location: line.location ?? null,
        inboundLineId: Number(line.id),
        reference: { referenceType: "inbound", referenceId: headerId, sourceType: "h_inbound_lines", sourceId: Number(line.id), sourceLineId: Number(line.id), actionType: "INBOUND_CONFIRM" },
        notes: `입고 확정 ${headerId}-${line.line_number}`,
        createdBy: userId,
        transactionType: "receipt",
      });
      const [tx]: any = await conn.execute(
        `SELECT id FROM h_inventory_transactions WHERE tenant_id = ? AND lot_id = ? AND transaction_type = 'receipt' ORDER BY id LIMIT 1`, [tenantId, r.lotId],
      );
      await conn.execute(
        `UPDATE h_inbound_lines SET lot_id = ?, lot_number = ?, receipt_tx_id = ? WHERE id = ? AND tenant_id = ?`,
        [r.lotId, lotNumber, (tx as any[])[0]?.id ?? null, line.id, tenantId],
      );
      await conn.execute(
        `INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, source, notes)
         VALUES (?, ?, ?, ?, 'inbound', ?)
         ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + VALUES(receiving_qty), updated_at = NOW()`,
        [tenantId, line.material_id, inboundDate, stockQty, `입고 ${headerId}-${line.line_number}`],
      );
      let taxRate = 10;
      if (line.po_line_id) {
        await conn.execute(
          `UPDATE purchase_order_lines SET received_qty = received_qty + ? WHERE id = ? AND tenant_id = ?`, [purchaseQty, line.po_line_id, tenantId],
        );
        const [tr]: any = await conn.execute(`SELECT amount, tax_amount FROM purchase_order_lines WHERE id = ? AND tenant_id = ?`, [line.po_line_id, tenantId]);
        const amt = Number((tr as any[])[0]?.amount ?? 0);
        if (amt > 0) taxRate = Math.round((Number((tr as any[])[0]?.tax_amount ?? 0) / amt) * 10000) / 100;
      }
      if (createVouchers) {
        const [ex]: any = await conn.execute(
          `SELECT id FROM accounting_purchases WHERE tenant_id = ? AND inbound_line_id = ? AND status <> 'cancelled' LIMIT 1`, [tenantId, line.id],
        );
        if ((ex as any[])[0]) {
          voucherIds.push(Number((ex as any[])[0].id));
        } else {
          const [mn]: any = await conn.execute(`SELECT material_name FROM h_materials WHERE id = ? AND tenant_id = ?`, [line.material_id, tenantId]);
          const supply = Math.round(Number(line.total_price) * 100) / 100;
          const tax = Math.round(supply * taxRate / 100);
          const [vi]: any = await conn.execute(
            `INSERT INTO accounting_purchases
               (tenant_id, transaction_date, partner_id, item_name, material_id, quantity, unit, unit_price, total_amount, tax_amount, tax_rate,
                status, source_type, source_id, inbound_line_id, notes, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'inbound', ?, ?, ?, ?)`,
            [tenantId, inboundDate, poPartnerId ?? header.supplier_id ?? null, (mn as any[])[0]?.material_name ?? `원재료#${line.material_id}`,
             line.material_id, purchaseQty, line.purchase_unit, Number(line.unit_price), supply, tax, taxRate,
             line.id, line.id, `입고 ${headerId}-${line.line_number} 매입전표 초안`, userId],
          );
          voucherIds.push(Number(vi.insertId));
        }
      }
      lots.push({ lineId: Number(line.id), lotId: r.lotId, lotNumber });
    }
    if (header.po_id) await recomputePoStatus(conn, Number(header.po_id), tenantId);
    await conn.execute(
      `UPDATE h_inbound_headers
          SET status = 'confirmed', confirmed_at = NOW(), confirmed_by = ?,
              approved_by = ?, approved_at = ?
        WHERE id = ? AND tenant_id = ?`,
      [userId, opts.approve ? userId : null, opts.approve ? new Date() : null, headerId, tenantId],
    );
    await publishEvent({
      tenantId, eventType: "inbound.confirmed", aggregateType: "Inbound", aggregateId: headerId,
      payload: { headerId, poId: header.po_id ?? null, lots, voucherIds }, createdBy: userId,
    }, conn);
    return { status: "confirmed", alreadyProcessed: false, lots, voucherIds };
  }, `inbound.confirm:${headerId}`);
}

/** 승인 대기 입고 승인 = 확정 (같은 함수) */
export async function approveInbound(headerId: number, tenantId: number, approverId: number): Promise<ConfirmInboundResult> {
  return confirmInbound(headerId, tenantId, approverId, { approve: true });
}

/**
 * 입고 줄 취소 — 원 입고 LOT 에서 그 줄이 들인 수량(남은 만큼)을 뺀다. 이미 쓴 수량이 있으면 거부 (추정 복원 없음).
 * 연결된 매입전표가 있으면 먼저 전표를 취소해야 한다 (기본 정책 — 분개는 전표가 담당).
 * LOT·줄 연결은 남긴다. 다시 받으면 새 입고 줄 → 새 LOT.
 */
export async function cancelInboundLine(lineId: number, tenantIdIn: number, userId: number, reason?: string): Promise<{ cancelledQty: number }> {
  const tenantId = requireTenant(tenantIdIn);
  return withInventoryTx(async (conn) => {
    const [lRows]: any = await conn.execute(
      `SELECT l.*, h.status AS header_status, h.po_id, DATE_FORMAT(h.inbound_date, '%Y-%m-%d') AS inbound_date
         FROM h_inbound_lines l JOIN h_inbound_headers h ON h.id = l.header_id AND h.tenant_id = l.tenant_id
        WHERE l.id = ? AND l.tenant_id = ? LIMIT 1 FOR UPDATE`,
      [lineId, tenantId],
    );
    const line = (lRows as any[])[0];
    if (!line) throw new Error("입고 줄을 찾을 수 없습니다.");
    const remaining = round3(Number(line.stock_quantity) - Number(line.cancelled_qty));
    if (line.lot_id && !(remaining > EPS)) throw new Error("이미 취소된 입고 줄입니다.");
    if (line.header_status !== "confirmed" || !line.lot_id) throw new Error("확정된 입고 줄만 취소할 수 있습니다.");
    const [pv]: any = await conn.execute(
      `SELECT id FROM accounting_purchases WHERE tenant_id = ? AND inbound_line_id = ? AND status <> 'cancelled' LIMIT 1`, [tenantId, lineId],
    );
    if ((pv as any[])[0]) throw new Error(`연결된 매입전표 #${(pv as any[])[0].id} 를 먼저 취소하세요.`);
    try {
      await applyLotDelta(conn, {
        tenantId, lotId: Number(line.lot_id), subject: { materialId: Number(line.material_id) },
        quantity: remaining, direction: "decrease", transactionType: "usage", unit: line.stock_unit,
        reference: { referenceType: "inbound", referenceId: Number(line.header_id), sourceType: "INBOUND_CANCEL", sourceId: lineId, sourceLineId: lineId, actionType: "INBOUND_CANCEL" },
        notes: `입고 취소 ${line.header_id}-${line.line_number}${reason ? ` — ${reason}` : ""}`,
        createdBy: userId,
        allowNegative: false,
      });
    } catch (e) {
      if (e instanceof InventoryShortageError) throw new Error("이 입고 LOT 은 이미 일부 사용돼 취소할 수 없습니다. 반품·재고 조정으로 처리하세요.");
      throw e;
    }
    const inboundDate = String(line.inbound_date);
    await conn.execute(`UPDATE h_inbound_lines SET cancelled_qty = cancelled_qty + ? WHERE id = ? AND tenant_id = ?`, [remaining, lineId, tenantId]);
    await conn.execute(
      `UPDATE material_ledger_daily SET receiving_qty = receiving_qty - ?, updated_at = NOW() WHERE tenant_id = ? AND material_id = ? AND ledger_date = ?`,
      [remaining, tenantId, line.material_id, inboundDate],
    );
    if (line.po_line_id) {
      // 발주 입고량은 매입 단위 — 줄 비율만큼 (전량 취소면 줄 매입 수량 전부)
      const purchaseBack = round3(Number(line.purchase_quantity) * (remaining / Number(line.stock_quantity)));
      await conn.execute(
        `UPDATE purchase_order_lines SET received_qty = GREATEST(received_qty - ?, 0) WHERE id = ? AND tenant_id = ?`, [purchaseBack, line.po_line_id, tenantId],
      );
      await recomputePoStatus(conn, Number(line.po_id), tenantId);
    }
    const [open]: any = await conn.execute(
      `SELECT COUNT(*) AS n FROM h_inbound_lines WHERE header_id = ? AND tenant_id = ? AND stock_quantity - cancelled_qty > ?`, [line.header_id, tenantId, EPS],
    );
    if (Number((open as any[])[0]?.n ?? 0) === 0) {
      await conn.execute(
        `UPDATE h_inbound_headers SET status = 'cancelled', cancelled_by = ?, cancelled_at = NOW() WHERE id = ? AND tenant_id = ?`, [userId, line.header_id, tenantId],
      );
    }
    await publishEvent({
      tenantId, eventType: "inbound.cancelled", aggregateType: "Inbound", aggregateId: Number(line.header_id),
      payload: { headerId: Number(line.header_id), lineId, lotId: Number(line.lot_id), quantity: remaining, reason: reason ?? null }, createdBy: userId,
    }, conn);
    return { cancelledQty: remaining };
  }, `inbound.cancelLine:${lineId}`);
}

/** 발주 줄 입고 가능 잔량 ('미입고 잔량 전체 채우기' 용) */
export async function getReceivableLines(poId: number, tenantIdIn: number) {
  const tenantId = requireTenant(tenantIdIn);
  const { getRawConnection } = await import("../../../db/connection");
  const [rows]: any = await (await getRawConnection()).execute(
    `SELECT l.id, l.line_number, l.material_id, l.item_name, l.unit, l.unit_price, l.ordered_qty, l.received_qty,
            GREATEST(l.ordered_qty - l.received_qty, 0) AS remaining_qty
       FROM purchase_order_lines l JOIN purchase_orders p ON p.id = l.po_id AND p.tenant_id = l.tenant_id
      WHERE l.po_id = ? AND l.tenant_id = ?
      ORDER BY l.line_number`,
    [poId, tenantId],
  );
  return (rows as any[]).map((r) => ({
    poLineId: Number(r.id), lineNumber: Number(r.line_number), materialId: r.material_id != null ? Number(r.material_id) : null,
    itemName: r.item_name, unit: r.unit, unitPrice: Number(r.unit_price),
    orderedQty: Number(r.ordered_qty), receivedQty: Number(r.received_qty), remainingQty: Number(r.remaining_qty),
  }));
}

async function recomputePoStatus(conn: any, poId: number, tenantId: number): Promise<void> {
  const [rows]: any = await conn.execute(
    `SELECT COUNT(*) AS n, SUM(received_qty >= ordered_qty - ?) AS full, SUM(received_qty > ?) AS any_recv
       FROM purchase_order_lines WHERE po_id = ? AND tenant_id = ?`,
    [EPS, EPS, poId, tenantId],
  );
  const r = (rows as any[])[0] ?? {};
  const n = Number(r.n ?? 0);
  if (n === 0) return;
  const status = Number(r.full) === n ? "received" : Number(r.any_recv) > 0 ? "partial_received" : "approved";
  await conn.execute(
    `UPDATE purchase_orders SET status = ? WHERE id = ? AND tenant_id = ? AND status IN ('approved', 'partial_received', 'received')`,
    [status, poId, tenantId],
  );
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

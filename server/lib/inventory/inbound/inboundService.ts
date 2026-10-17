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
 *   - 검수 불합격(fail) 줄은 가용 재고에 넣지 않는다 (CEO 결정 4): 확정 때 LOT·원장·수불부·전표 없이 '격리' 로 두고
 *     재검수(합격 → 그때 재고·전표 / 불합격 → 이력만) 또는 반품으로 처리. 최초 검수 결과는 줄에 그대로, 이후는 검수 이력에 추가.
 *   - 원료 id 는 이 회사의 h_materials id 로 (item_master id 가 와도 ItemIdentityService 로 변환).
 * 매입전표: 발주서 입고는 확정 때 대기 전표 초안을 입고 줄에 연결해 만든다 (CEO 결정). 전표 확정은 분개만 (재고 재생성 없음).
 */
import { withInventoryTx, receiveNewLot, applyLotDelta, InventoryShortageError } from "../applyInventoryDelta";
import { toInventoryMaterialId } from "../../identity/itemIdentityService";
import { isTenantFeatureEnabled } from "../../production/massBasisPolicy";
import { publishEvent } from "../../../platform/event-bus";
import { resolvePackConversion } from "./packUnits";
import { isInventoryTrackingEnabled } from "../inventoryTrackingPolicy";

export const INBOUND_APPROVAL_FEATURE = "INBOUND_APPROVAL";
const EPS = 0.0005;

export interface InboundLineInput {
  materialId: number;
  poLineId?: number | null;
  purchaseQuantity: number;
  purchaseUnit: string;
  /** 재고 수량·단위 — 생략하면 서버가 포장 단위 환산으로 계산 (기준 단위). 주면 서버 계산과 같아야 한다. */
  stockQuantity?: number | null;
  stockUnit?: string | null;
  unitPrice: number;
  /** 줄 공급가 — 생략하면 수량 × 단가 (매입 입력의 금액이 따로 있을 때) */
  totalPrice?: number | null;
  /** 전표 세율(%) — 생략하면 발주 줄 기준, 없으면 10 */
  taxRate?: number | null;
  /** 명시한 세액 — 있으면 그대로 전표에 (공급가 × 세율로 다시 계산하지 않는다, Codex #567 검증 N3) */
  taxAmount?: number | null;
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
  /** 거래처를 고르지 않은 자유 입력 공급자명 — 원문 그대로 (이름으로 거래처 id 를 추정하지 않는다) */
  supplierName?: string | null;
  /** 확정·승인 때 매입전표 초안을 만들지 — 문서에 보존 (승인 대기 뒤에도 같은 정책). 생략: 발주서 입고만 만든다 */
  createVoucherDrafts?: boolean | null;
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
  // 회계만 사용하는 회사 — 재고 단위·환산 없이 매입 수량만 기록 (CEO 결정 2)
  const tracking = await isInventoryTrackingEnabled(tenantId);

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
      const resolved: Array<InboundLineInput & { canonicalMaterialId: number; stockQuantity: number; stockUnit: string; packConversionId: number | null; packFactor: number | null }> = [];
      for (const [i, l] of p.lines.entries()) {
        if (!(l.purchaseQuantity > 0)) throw new Error(`${i + 1}번 줄: 수량은 0 보다 커야 합니다.`);
        if (!String(l.purchaseUnit ?? "").trim()) throw new Error(`${i + 1}번 줄: 단위가 필요합니다.`);
        const { id } = await toInventoryMaterialId(Number(l.materialId), tenantId, conn);
        const [m]: any = await conn.execute(`SELECT id FROM h_materials WHERE id = ? AND tenant_id = ? LIMIT 1`, [id, tenantId]);
        if (!(m as any[])[0]) throw new Error(`${i + 1}번 줄: 원재료를 찾을 수 없습니다 (id=${l.materialId}).`);
        // 포장 단위 환산 — 재고 수량은 서버가 설정으로 계산한다 (화면 값은 확인용). 회계만 사용 회사는 재고가 없으니 매입 수량 그대로.
        const pack = tracking
          ? await resolvePackConversion(conn, tenantId, id, l.purchaseUnit, l.purchaseQuantity, `${i + 1}번 줄`)
          : { baseUnit: l.purchaseUnit, factor: 1, conversionId: null, stockQuantity: Math.round(l.purchaseQuantity * 1000) / 1000 };
        if (l.stockUnit != null && normUnit(l.stockUnit) !== normUnit(pack.baseUnit)) {
          throw new Error(`${i + 1}번 줄: 재고 단위(${l.stockUnit}) 가 원재료 기준 단위(${pack.baseUnit}) 와 다릅니다 — 기준 단위로 환산해 입력하세요.`);
        }
        if (l.stockQuantity != null && Math.abs(Number(l.stockQuantity) - pack.stockQuantity) > EPS) {
          throw new Error(`${i + 1}번 줄: 재고 수량 ${l.stockQuantity} 이 환산 결과 ${pack.stockQuantity}${pack.baseUnit} 와 다릅니다 (${l.purchaseQuantity}${l.purchaseUnit} × ${pack.factor}).`);
        }
        if (tracking) await assertStockUnit(conn, tenantId, id, pack.baseUnit, `${i + 1}번 줄`);
        // 발주서 입고는 모든 줄이 그 발주의 줄이어야 한다 (Codex #558 검증 F5 — 발주 잔량 검사 우회 방지).
        //   발주에 없는 품목은 직접 입고로 따로.
        if (p.sourceType === "purchase_order" && !l.poLineId) throw new Error(`${i + 1}번 줄: 발주서 입고는 발주 줄을 지정해야 합니다 (발주에 없는 품목은 직접 입고로).`);
        if (l.poLineId) {
          if (!p.poId) throw new Error(`${i + 1}번 줄: 발주 줄은 발주서 입고에서만 지정할 수 있습니다.`);
          await assertPoLine(conn, tenantId, Number(p.poId), Number(l.poLineId), id, l.purchaseUnit, `${i + 1}번 줄`);
        }
        resolved.push({
          ...l, canonicalMaterialId: id, stockQuantity: pack.stockQuantity, stockUnit: pack.baseUnit,
          packConversionId: pack.conversionId, packFactor: pack.conversionId ? pack.factor : null,
        });
      }
      // 거래처는 이 회사 소속만 (Codex #560 검증 N4)
      if (p.supplierId) {
        const [ps]: any = await conn.execute(`SELECT id FROM partners WHERE id = ? AND tenant_id = ? LIMIT 1`, [p.supplierId, tenantId]);
        if (!(ps as any[])[0]) throw new Error("거래처를 찾을 수 없습니다.");
      }
      const ymd = p.inboundDate.replace(/-/g, "");
      const voucherPolicy = p.createVoucherDrafts == null ? null : p.createVoucherDrafts ? 1 : 0;
      const [h]: any = await conn.execute(
        `INSERT INTO h_inbound_headers
           (tenant_id, inbound_number, site_id, supplier_id, inbound_date, status, notes, created_by, source_type, po_id, idempotency_key,
            create_voucher_drafts, supplier_name, inventory_tracking)
         VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [tenantId, `IB-${tenantId}-${ymd}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, p.siteId ?? 1,
         p.supplierId ?? null, p.inboundDate, p.notes ?? null, p.userId, p.sourceType, p.poId ?? null, key,
         voucherPolicy, p.supplierId ? null : (String(p.supplierName ?? "").trim().slice(0, 200) || null), tracking ? 1 : 0],
      );
      const headerId = Number(h.insertId);
      await conn.execute(`UPDATE h_inbound_headers SET inbound_number = ? WHERE id = ? AND tenant_id = ?`, [`IB-${tenantId}-${ymd}-${headerId}`, headerId, tenantId]);
      for (const [i, l] of resolved.entries()) {
        await conn.execute(
          `INSERT INTO h_inbound_lines
             (tenant_id, header_id, line_number, material_id, po_line_id, purchase_quantity, purchase_unit, stock_quantity, stock_unit,
              unit_price, total_price, lot_number, expiry_date, production_date, location, inspection_result, inspection_json, notes,
              pack_conversion_id, pack_factor, tax_rate, tax_amount)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [tenantId, headerId, i + 1, l.canonicalMaterialId, l.poLineId ?? null, l.purchaseQuantity, l.purchaseUnit, l.stockQuantity, l.stockUnit,
           l.unitPrice, l.totalPrice != null ? Math.round(Number(l.totalPrice) * 100) / 100 : Math.round(l.purchaseQuantity * l.unitPrice * 100) / 100,
           l.lotNumber ?? null, l.expiryDate ?? null,
           l.productionDate ?? null, l.location ?? null, l.inspectionResult ?? null,
           l.inspectionJson ? JSON.stringify(l.inspectionJson) : null, l.notes ?? null,
           l.packConversionId, l.packFactor, l.taxRate ?? null, l.taxAmount != null ? Math.round(Number(l.taxAmount) * 100) / 100 : null],
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
  | { status: "confirmed"; alreadyProcessed: boolean; lots: Array<{ lineId: number; lotId: number; lotNumber: string }>; voucherIds: number[]; quarantinedLineIds?: number[]; cancelledLineIds?: number[] }
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
  // 회계만 사용하는 회사: LOT·재고·수불부를 만들지 않고 입고 수량(발주 입고량)·전표 초안만 (CEO 결정 2)
  const trackingNow = await isInventoryTrackingEnabled(tenantId);

  return withInventoryTx(async (conn) => {
    const [hRows]: any = await conn.execute(
      `SELECT id, status, DATE_FORMAT(inbound_date, '%Y-%m-%d') AS inbound_date, supplier_id, po_id, source_type,
              create_voucher_drafts, supplier_name, inventory_tracking
         FROM h_inbound_headers WHERE id = ? AND tenant_id = ? LIMIT 1 FOR UPDATE`,
      [headerId, tenantId],
    );
    const header = (hRows as any[])[0];
    if (!header) throw new Error(`입고 문서 #${headerId} 를 찾을 수 없습니다.`);
    // 문서를 만들 때의 처리 기준으로 확정한다 (Codex #561·562 검증 R6) — 그 사이 설정을 바꿔도 이 문서는 같은 기준.
    //   NULL = 기준 컬럼 이전 문서 → 지금 설정.
    const tracking = header.inventory_tracking == null ? trackingNow : Number(header.inventory_tracking) === 1;
    if (header.status === "confirmed") {
      const [done]: any = await conn.execute(
        `SELECT id, lot_id, lot_number, disposition, cancelled_qty FROM h_inbound_lines WHERE header_id = ? AND tenant_id = ? ORDER BY line_number`, [headerId, tenantId],
      );
      const [vs]: any = await conn.execute(
        `SELECT p.id FROM accounting_purchases p JOIN h_inbound_lines l ON l.id = p.inbound_line_id AND l.tenant_id = p.tenant_id
          WHERE l.header_id = ? AND p.tenant_id = ? AND p.status <> 'cancelled' ORDER BY p.id`, [headerId, tenantId],
      );
      return {
        status: "confirmed", alreadyProcessed: true,
        lots: (done as any[]).map((r) => ({ lineId: Number(r.id), lotId: Number(r.lot_id), lotNumber: String(r.lot_number) })),
        voucherIds: (vs as any[]).map((v) => Number(v.id)),
        // 다시 불러도 줄의 지금 상태를 그대로 (Codex #567 검증 Q2 — 격리 줄이 '확정' 으로 보이던 문제)
        quarantinedLineIds: (done as any[]).filter((r) => r.disposition === "quarantine").map((r) => Number(r.id)),
        cancelledLineIds: (done as any[]).filter((r) => Number(r.cancelled_qty) > EPS).map((r) => Number(r.id)),
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
    //   정책은 문서에 보존된 값 우선 (승인 대기 → 승인에서도 같은 정책, Codex #560 검증 N5)
    const createVouchers = opts.createVoucherDrafts
      ?? (header.create_voucher_drafts != null ? Number(header.create_voucher_drafts) === 1 : header.source_type === "purchase_order");
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
    let supplierName: string | null = header.supplier_name ?? null;
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
    const quarantinedLineIds: number[] = [];
    for (const line of lines) {
      if (line.lot_id) { lots.push({ lineId: Number(line.id), lotId: Number(line.lot_id), lotNumber: String(line.lot_number) }); continue; }
      const failed = line.inspection_result === "fail";
      const purchaseQty = Number(line.purchase_quantity);
      const stockQty = Number(line.stock_quantity);
      const label = `${line.line_number}번 줄`;
      if (tracking) await assertStockUnit(conn, tenantId, Number(line.material_id), line.stock_unit, label);
      // 포장 환산 — 줄에 보존된 배율로 다시 확인 (같은 단위면 수량 동일, 아니면 매입 수량 × 배율)
      {
        const pq = Number(line.purchase_quantity);
        const sq = Number(line.stock_quantity);
        if (line.pack_factor == null) {
          if (normUnit(line.purchase_unit) !== normUnit(line.stock_unit) || Math.abs(pq - sq) > EPS) {
            throw new Error(`${label}: 매입 ${pq}${line.purchase_unit} 과 재고 ${sq}${line.stock_unit} 의 환산 근거가 없습니다.`);
          }
        } else if (Math.abs(round3(pq * Number(line.pack_factor)) - sq) > EPS) {
          throw new Error(`${label}: 재고 수량이 보존된 환산(${pq}${line.purchase_unit} × ${Number(line.pack_factor)}) 과 다릅니다.`);
        }
      }
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
      // 발주 입고량은 실제로 들어온 수량 — 격리돼도 들어왔다 (반품하면 되돌린다)
      if (line.po_line_id) {
        await conn.execute(
          `UPDATE purchase_order_lines SET received_qty = received_qty + ? WHERE id = ? AND tenant_id = ?`, [purchaseQty, line.po_line_id, tenantId],
        );
      }
      // 최초 검수 결과를 이력 1번으로 (이후 재검수는 2번부터 추가 — 덮어쓰지 않는다)
      if (line.inspection_result) {
        await conn.execute(
          `INSERT IGNORE INTO h_inbound_inspections (tenant_id, inbound_line_id, seq, action, result, inspection_json, inspected_by)
           VALUES (?, ?, 1, 'initial', ?, ?, ?)`,
          [tenantId, line.id, line.inspection_result, line.inspection_json != null ? (typeof line.inspection_json === "string" ? line.inspection_json : JSON.stringify(line.inspection_json)) : null, line.inspected_by ?? userId],
        );
      }
      if (failed) {
        // 검수 불합격 — 가용 재고·원장·수불부·전표 없음. 격리로 두고 재검수·반품으로 처리 (CEO 결정 4)
        await conn.execute(`UPDATE h_inbound_lines SET disposition = 'quarantine' WHERE id = ? AND tenant_id = ?`, [line.id, tenantId]);
        quarantinedLineIds.push(Number(line.id));
        lots.push({ lineId: Number(line.id), lotId: 0, lotNumber: "" });
        continue;
      }
      const st = tracking
        ? await stockInLine(conn, { tenantId, headerId, line, supplierName, receiptDate: inboundDate, ledgerDate: inboundDate, userId, actionType: "INBOUND_CONFIRM" })
        : { lotId: 0, lotNumber: "" };
      if (createVouchers) {
        voucherIds.push(await createLineVoucher(conn, { tenantId, line, userId, partnerId: poPartnerId ?? (header.supplier_id != null ? Number(header.supplier_id) : null), duringConfirm: true }));
      }
      lots.push({ lineId: Number(line.id), lotId: st.lotId, lotNumber: st.lotNumber });
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
      payload: { headerId, poId: header.po_id ?? null, lots, voucherIds, quarantinedLineIds }, createdBy: userId,
    }, conn);
    return { status: "confirmed", alreadyProcessed: false, lots, voucherIds, quarantinedLineIds };
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
      `SELECT l.*, h.status AS header_status, h.po_id, DATE_FORMAT(h.inbound_date, '%Y-%m-%d') AS inbound_date,
              DATE_FORMAT(l.ledger_date, '%Y-%m-%d') AS ledger_ymd
         FROM h_inbound_lines l JOIN h_inbound_headers h ON h.id = l.header_id AND h.tenant_id = l.tenant_id
        WHERE l.id = ? AND l.tenant_id = ? LIMIT 1 FOR UPDATE`,
      [lineId, tenantId],
    );
    const line = (lRows as any[])[0];
    if (!line) throw new Error("입고 줄을 찾을 수 없습니다.");
    const remaining = round3(Number(line.stock_quantity) - Number(line.cancelled_qty));
    if (!(remaining > EPS)) throw new Error("이미 취소된 입고 줄입니다.");
    if (line.header_status !== "confirmed") throw new Error("확정된 입고 줄만 취소할 수 있습니다.");
    if (line.disposition === "quarantine") throw new Error("검수 불합격으로 격리 중인 줄입니다 — 재검수 또는 반품으로 처리하세요.");
    const [pv]: any = await conn.execute(
      `SELECT id FROM accounting_purchases WHERE tenant_id = ? AND inbound_line_id = ? AND status <> 'cancelled' LIMIT 1`, [tenantId, lineId],
    );
    if ((pv as any[])[0]) throw new Error(`연결된 매입전표 #${(pv as any[])[0].id} 를 먼저 취소하세요.`);
    // 회계만 사용하는 회사의 입고 줄은 LOT 이 없다 — 수량 기록(발주 입고량)만 되돌린다
    if (line.lot_id) try {
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
    // 수불부는 실제로 넣은 날짜에서 뺀다 (줄에 남긴 날짜, 없으면 이전 문서 — 입고일). 대상 행이 없으면 되돌린다 (Q1)
    const ledgerDate = String(line.ledger_ymd ?? line.inbound_date);
    await conn.execute(`UPDATE h_inbound_lines SET cancelled_qty = cancelled_qty + ? WHERE id = ? AND tenant_id = ?`, [remaining, lineId, tenantId]);
    if (line.lot_id) {
      const [lu]: any = await conn.execute(
        `UPDATE material_ledger_daily SET receiving_qty = receiving_qty - ?, updated_at = NOW() WHERE tenant_id = ? AND material_id = ? AND ledger_date = ?`,
        [remaining, tenantId, line.material_id, ledgerDate],
      );
      if (Number(lu?.affectedRows ?? 0) !== 1) {
        throw new Error(`입고 줄 ${line.header_id}-${line.line_number}: ${ledgerDate} 원료수불부 입고 기록을 찾지 못해 취소하지 않았습니다 — 수불부를 먼저 확인하세요.`);
      }
    }
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
      payload: { headerId: Number(line.header_id), lineId, lotId: line.lot_id != null ? Number(line.lot_id) : null, quantity: remaining, reason: reason ?? null }, createdBy: userId,
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
  const conn = await getRawConnection();
  // 회계만 사용하는 회사는 재고 환산이 필요 없다 — 확정과 같은 정책 (Codex #561·562 검증 R7)
  const inventoryTracking = await isInventoryTrackingEnabled(tenantId);
  const out = [];
  for (const r of rows as any[]) {
    // 재고 환산 미리보기 — 1 발주 단위 = ? 기준 단위 (설정 없으면 null → 화면에서 입고 차단·설정 안내)
    let conversion: { factor: number; baseUnit: string } | null = null;
    let conversionError: string | null = null;
    if (inventoryTracking && r.material_id != null) {
      try {
        const mid = (await toInventoryMaterialId(Number(r.material_id), tenantId, conn)).id;
        const pk = await resolvePackConversion(conn, tenantId, mid, r.unit, 1, `${r.line_number}번 줄`);
        conversion = { factor: pk.factor, baseUnit: pk.baseUnit };
      } catch (e: any) { conversionError = String(e?.message ?? e); }
    }
    out.push({
      poLineId: Number(r.id), lineNumber: Number(r.line_number), materialId: r.material_id != null ? Number(r.material_id) : null,
      itemName: r.item_name, unit: r.unit, unitPrice: Number(r.unit_price),
      orderedQty: Number(r.ordered_qty), receivedQty: Number(r.received_qty), remainingQty: Number(r.remaining_qty),
      conversion, conversionError, inventoryTracking,
    });
  }
  return out;
}

/** 입고 줄을 재고에 넣는다 — LOT(입고 줄 연결)·입고 원장·집계·수불부. 확정과 재검수 합격이 같은 처리. */
async function stockInLine(conn: any, p: {
  tenantId: number; headerId: number; line: any; supplierName: string | null; receiptDate: string; ledgerDate: string; userId: number;
  actionType: "INBOUND_CONFIRM" | "INBOUND_RELEASE";
}): Promise<{ lotId: number; lotNumber: string }> {
  const { tenantId, headerId, line } = p;
  const stockQty = Number(line.stock_quantity);
  const lotNumber = line.lot_number || `IB${tenantId}-${headerId}-${line.line_number}`;
  const stockUnitPrice = stockQty > 0 ? Math.round((Number(line.total_price) / stockQty) * 100) / 100 : null;
  const r = await receiveNewLot(conn, {
    tenantId,
    subject: { materialId: Number(line.material_id) },
    lotNumber,
    quantity: stockQty,
    unit: line.stock_unit,
    unitPrice: stockUnitPrice,
    receiptDate: p.receiptDate,
    expiryDate: line.expiry_ymd ?? null,
    productionDate: line.production_ymd ?? null,
    supplierName: p.supplierName,
    location: line.location ?? null,
    inboundLineId: Number(line.id),
    reference: { referenceType: "inbound", referenceId: headerId, sourceType: "h_inbound_lines", sourceId: Number(line.id), sourceLineId: Number(line.id), actionType: p.actionType },
    notes: `${p.actionType === "INBOUND_RELEASE" ? "재검수 합격 입고" : "입고 확정"} ${headerId}-${line.line_number}`,
    createdBy: p.userId,
    transactionType: "receipt",
  });
  const [tx]: any = await conn.execute(
    `SELECT id FROM h_inventory_transactions WHERE tenant_id = ? AND lot_id = ? AND transaction_type = 'receipt' ORDER BY id LIMIT 1`, [tenantId, r.lotId],
  );
  // 수불부에 넣은 날짜를 줄에 남긴다 — 취소는 이 날짜로 되돌린다 (Codex #567 검증 Q1: 재검수 합격분은 처리일에 들어가는데
  //   취소가 원래 입고일에서 빼려다 대상 없이 '성공' 했다)
  await conn.execute(
    `UPDATE h_inbound_lines SET lot_id = ?, lot_number = ?, receipt_tx_id = ?, ledger_date = ? WHERE id = ? AND tenant_id = ?`,
    [r.lotId, lotNumber, (tx as any[])[0]?.id ?? null, p.ledgerDate, line.id, tenantId],
  );
  await conn.execute(
    `INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, source, notes)
     VALUES (?, ?, ?, ?, 'inbound', ?)
     ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + VALUES(receiving_qty), updated_at = NOW()`,
    [tenantId, line.material_id, p.ledgerDate, stockQty, `입고 ${headerId}-${line.line_number}`],
  );
  return { lotId: r.lotId, lotNumber };
}

/** 입고 줄의 매입전표 초안 — 세율은 발주 줄 기준 (없으면 10%) */
async function createLineVoucher(conn: any, p: { tenantId: number; line: any; userId: number; partnerId: number | null; duringConfirm: boolean }): Promise<number> {
  let taxRate = p.line.tax_rate != null ? Number(p.line.tax_rate) : 10;
  if (p.line.tax_rate == null && p.line.po_line_id) {
    const [tr]: any = await conn.execute(`SELECT amount, tax_amount FROM purchase_order_lines WHERE id = ? AND tenant_id = ?`, [p.line.po_line_id, p.tenantId]);
    const amt = Number((tr as any[])[0]?.amount ?? 0);
    if (amt > 0) taxRate = Math.round((Number((tr as any[])[0]?.tax_amount ?? 0) / amt) * 10000) / 100;
  }
  return ensureInboundLineVoucher(conn, {
    tenantId: p.tenantId, lineId: Number(p.line.id), userId: p.userId, partnerId: p.partnerId, taxRate, duringConfirm: p.duringConfirm,
  });
}

/** 격리 줄 잠금 + 확인 (재검수·반품 공통) */
async function lockQuarantinedLine(conn: any, tenantId: number, lineId: number) {
  const [rows]: any = await conn.execute(
    `SELECT l.*, DATE_FORMAT(l.expiry_date, '%Y-%m-%d') AS expiry_ymd, DATE_FORMAT(l.production_date, '%Y-%m-%d') AS production_ymd,
            h.status AS header_status, h.po_id, h.supplier_id, h.supplier_name, h.create_voucher_drafts, h.source_type, h.inventory_tracking
       FROM h_inbound_lines l JOIN h_inbound_headers h ON h.id = l.header_id AND h.tenant_id = l.tenant_id
      WHERE l.id = ? AND l.tenant_id = ? LIMIT 1 FOR UPDATE`,
    [lineId, tenantId],
  );
  const line = (rows as any[])[0];
  if (!line) throw new Error("입고 줄을 찾을 수 없습니다.");
  if (line.disposition !== "quarantine") throw new Error("격리 중인 입고 줄이 아닙니다.");
  if (line.header_status !== "confirmed") throw new Error("확정된 입고 문서의 줄만 처리할 수 있습니다.");
  const [sq]: any = await conn.execute(`SELECT COALESCE(MAX(seq), 0) AS s FROM h_inbound_inspections WHERE tenant_id = ? AND inbound_line_id = ?`, [tenantId, lineId]);
  return { line, nextSeq: Number((sq as any[])[0]?.s ?? 0) + 1 };
}

const kstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

/**
 * 격리 줄 재검수 (CEO 결정 4). 이력에 추가만 — 최초 불합격(줄의 inspection_result·이력 1번) 은 그대로.
 *   합격: 그때 재고에 넣는다 (LOT·원장·집계, 수불부는 오늘 날짜 — 과거 마감일을 바꾸지 않음) + 문서 정책대로 전표 초안.
 *   불합격: 이력만, 계속 격리.
 */
export async function reinspectInboundLine(lineId: number, tenantIdIn: number, userId: number, p: { result: "pass" | "fail"; notes?: string | null; inspectionJson?: unknown }): Promise<{ disposition: "released" | "quarantine"; lotId: number | null; voucherId: number | null }> {
  const tenantId = requireTenant(tenantIdIn);
  if (p.result !== "pass" && p.result !== "fail") throw new Error("재검수 결과는 합격 또는 불합격입니다.");
  const trackingNow = await isInventoryTrackingEnabled(tenantId);
  return withInventoryTx(async (conn) => {
    const { line, nextSeq } = await lockQuarantinedLine(conn, tenantId, lineId);
    await conn.execute(
      `INSERT INTO h_inbound_inspections (tenant_id, inbound_line_id, seq, action, result, notes, inspection_json, inspected_by)
       VALUES (?, ?, ?, 'reinspect', ?, ?, ?, ?)`,
      [tenantId, lineId, nextSeq, p.result, p.notes ? String(p.notes).slice(0, 500) : null, p.inspectionJson != null ? JSON.stringify(p.inspectionJson) : null, userId],
    );
    if (p.result === "fail") return { disposition: "quarantine" as const, lotId: null, voucherId: null };
    const tracking = line.inventory_tracking == null ? trackingNow : Number(line.inventory_tracking) === 1;
    let lotId: number | null = null;
    if (tracking) {
      await assertStockUnit(conn, tenantId, Number(line.material_id), line.stock_unit, `${line.line_number}번 줄`);
      let supplierName: string | null = line.supplier_name ?? null;
      if (line.supplier_id) {
        const [ps]: any = await conn.execute(`SELECT company_name FROM partners WHERE id = ? AND tenant_id = ? LIMIT 1`, [line.supplier_id, tenantId]);
        supplierName = (ps as any[])[0]?.company_name ?? null;
      }
      const [hd]: any = await conn.execute(`SELECT DATE_FORMAT(inbound_date, '%Y-%m-%d') AS d FROM h_inbound_headers WHERE id = ? AND tenant_id = ?`, [line.header_id, tenantId]);
      const st = await stockInLine(conn, {
        tenantId, headerId: Number(line.header_id), line, supplierName,
        receiptDate: String((hd as any[])[0].d), ledgerDate: kstToday(), userId, actionType: "INBOUND_RELEASE",
      });
      lotId = st.lotId;
    }
    await conn.execute(`UPDATE h_inbound_lines SET disposition = 'released' WHERE id = ? AND tenant_id = ?`, [lineId, tenantId]);
    const createVouchers = line.create_voucher_drafts != null ? Number(line.create_voucher_drafts) === 1 : line.source_type === "purchase_order";
    let voucherId: number | null = null;
    if (createVouchers) {
      let partnerId: number | null = line.supplier_id != null ? Number(line.supplier_id) : null;
      if (line.po_id) {
        const [pp]: any = await conn.execute(`SELECT partner_id FROM purchase_orders WHERE id = ? AND tenant_id = ?`, [line.po_id, tenantId]);
        if ((pp as any[])[0]?.partner_id != null) partnerId = Number((pp as any[])[0].partner_id);
      }
      voucherId = await createLineVoucher(conn, { tenantId, line, userId, partnerId, duringConfirm: false });
    }
    await publishEvent({
      tenantId, eventType: "inbound.released", aggregateType: "Inbound", aggregateId: Number(line.header_id),
      payload: { headerId: Number(line.header_id), lineId, lotId, voucherId }, createdBy: userId,
    }, conn);
    return { disposition: "released" as const, lotId, voucherId };
  }, `inbound.reinspect:${lineId}`);
}

/** 격리 줄 반품 (CEO 결정 4) — 재고에 들어간 적이 없으니 수량 기록만 되돌린다 (발주 입고량·줄 취소 수량), 이력 추가. */
export async function returnInboundLine(lineId: number, tenantIdIn: number, userId: number, reason: string): Promise<{ returnedQty: number }> {
  const tenantId = requireTenant(tenantIdIn);
  const why = String(reason ?? "").trim();
  if (!why) throw new Error("반품 사유가 필요합니다.");
  return withInventoryTx(async (conn) => {
    const { line, nextSeq } = await lockQuarantinedLine(conn, tenantId, lineId);
    const qty = round3(Number(line.stock_quantity) - Number(line.cancelled_qty));
    await conn.execute(
      `INSERT INTO h_inbound_inspections (tenant_id, inbound_line_id, seq, action, result, notes, inspected_by) VALUES (?, ?, ?, 'return', NULL, ?, ?)`,
      [tenantId, lineId, nextSeq, why.slice(0, 500), userId],
    );
    await conn.execute(
      `UPDATE h_inbound_lines SET disposition = 'returned', cancelled_qty = cancelled_qty + ? WHERE id = ? AND tenant_id = ?`, [qty, lineId, tenantId],
    );
    if (line.po_line_id) {
      const purchaseBack = round3(Number(line.purchase_quantity) * (qty / Number(line.stock_quantity)));
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
      tenantId, eventType: "inbound.returned", aggregateType: "Inbound", aggregateId: Number(line.header_id),
      payload: { headerId: Number(line.header_id), lineId, quantity: qty, reason: why }, createdBy: userId,
    }, conn);
    return { returnedQty: qty };
  }, `inbound.return:${lineId}`);
}

/** 격리 중인 입고 줄 목록 + 검수 이력 */
export async function listQuarantinedLines(tenantIdIn: number) {
  const tenantId = requireTenant(tenantIdIn);
  const { getRawConnection } = await import("../../../db/connection");
  const conn = await getRawConnection();
  const [rows]: any = await conn.execute(
    `SELECT l.id, l.header_id, l.line_number, l.material_id, m.material_name, l.purchase_quantity, l.purchase_unit, l.stock_quantity, l.stock_unit,
            l.lot_number, DATE_FORMAT(l.expiry_date, '%Y-%m-%d') AS expiry_date, h.inbound_number, DATE_FORMAT(h.inbound_date, '%Y-%m-%d') AS inbound_date,
            h.po_id, COALESCE(p.company_name, h.supplier_name) AS supplier
       FROM h_inbound_lines l
       JOIN h_inbound_headers h ON h.id = l.header_id AND h.tenant_id = l.tenant_id
       LEFT JOIN h_materials m ON m.id = l.material_id AND m.tenant_id = l.tenant_id
       LEFT JOIN partners p ON p.id = h.supplier_id AND p.tenant_id = h.tenant_id
      WHERE l.tenant_id = ? AND l.disposition = 'quarantine'
      ORDER BY h.inbound_date, l.id`,
    [tenantId],
  );
  const ids = (rows as any[]).map((r) => Number(r.id));
  const hist = ids.length ? await listInspectionHistory(tenantId, ids) : new Map<number, any[]>();
  return (rows as any[]).map((r) => ({
    lineId: Number(r.id), headerId: Number(r.header_id), inboundNumber: r.inbound_number, inboundDate: r.inbound_date, lineNumber: Number(r.line_number),
    materialId: Number(r.material_id), materialName: r.material_name, purchaseQuantity: Number(r.purchase_quantity), purchaseUnit: r.purchase_unit,
    stockQuantity: Number(r.stock_quantity), stockUnit: r.stock_unit, lotNumber: r.lot_number, expiryDate: r.expiry_date,
    poId: r.po_id != null ? Number(r.po_id) : null, supplier: r.supplier, history: hist.get(Number(r.id)) ?? [],
  }));
}

export async function listInspectionHistory(tenantIdIn: number, lineIds: number[]): Promise<Map<number, any[]>> {
  const tenantId = requireTenant(tenantIdIn);
  const out = new Map<number, any[]>();
  if (!lineIds.length) return out;
  const { getRawConnection } = await import("../../../db/connection");
  const [rows]: any = await (await getRawConnection()).query(
    `SELECT inbound_line_id, seq, action, result, notes, inspected_by, inspected_at FROM h_inbound_inspections
      WHERE tenant_id = ? AND inbound_line_id IN (?) ORDER BY inbound_line_id, seq`,
    [tenantId, lineIds],
  );
  for (const r of rows as any[]) {
    const k = Number(r.inbound_line_id);
    if (!out.has(k)) out.set(k, []);
    out.get(k)!.push({ seq: Number(r.seq), action: r.action, result: r.result, notes: r.notes, inspectedBy: Number(r.inspected_by), inspectedAt: r.inspected_at });
  }
  return out;
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

/**
 * 발주 없이 직접 입고 — 원료 한 줄 (2026-10-17, 입고 정본화 PR-4).
 * 입고 탭(lotManagement.createReceivingWithLot)·재고 화면(inventory.createLot / receiveMaterial) 이 이 함수로 —
 * 입고 문서 + 확정(같은 처리) 이라 LOT·원장·집계·수불부가 한 번. 단가가 있으면 대기 매입전표 초안을 입고 줄에 연결해 만든다
 * (이전: LOT 따로 + 연결 없는 대기 전표 → 그 전표를 승인하면 LOT 이 한 벌 더 생겼다).
 */
export async function receiveDirect(p: {
  tenantId: number;
  userId: number;
  idempotencyKey?: string | null;
  materialId: number;
  quantity: number;
  unit: string;
  unitPrice?: number | null;
  supplierId?: number | null;
  receiptDate: string;
  expiryDate?: string | null;
  productionDate?: string | null;
  lotNumber?: string | null;
  location?: string | null;
  notes?: string | null;
  supplierName?: string | null;
  createVoucherDraft: boolean;
}): Promise<{ status: "confirmed" | "pending_approval"; headerId: number; lineId: number; lotId: number; lotNumber: string; voucherIds: number[] }> {
  const key = p.idempotencyKey || `direct-${p.tenantId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const { headerId } = await createInboundDraft({
    tenantId: p.tenantId, userId: p.userId, idempotencyKey: key, sourceType: "direct",
    supplierId: p.supplierId ?? null, supplierName: p.supplierName ?? null, inboundDate: p.receiptDate, notes: p.notes ?? null,
    createVoucherDrafts: p.createVoucherDraft && (p.unitPrice ?? 0) > 0,
    lines: [{
      materialId: p.materialId, purchaseQuantity: p.quantity, purchaseUnit: p.unit,
      unitPrice: p.unitPrice ?? 0, lotNumber: p.lotNumber ?? null, expiryDate: p.expiryDate ?? null,
      productionDate: p.productionDate ?? null, location: p.location ?? null, notes: p.notes ?? null,
    }],
  });
  // 전표 정책은 문서에 보존했다 — 승인 때도 같은 정책 (여기서 옵션으로 덮지 않음)
  const r = await confirmInbound(headerId, p.tenantId, p.userId);
  if (r.status !== "confirmed") {
    return { status: "pending_approval", headerId, lineId: 0, lotId: 0, lotNumber: "", voucherIds: [] }; // 재고·전표는 승인 때
  }
  const lot = r.lots[0];
  return { status: "confirmed", headerId, lineId: lot.lineId, lotId: lot.lotId, lotNumber: lot.lotNumber, voucherIds: r.voucherIds };
}

/**
 * 입고 줄의 살아 있는 매입전표 — 있으면 그 전표, 없으면 대기 초안을 만든다 (Codex #560 검증 N1).
 * 입고 줄을 잠그고 조회·생성을 한 트랜잭션에서 (호출자 conn). DB 도 (회사, 살아 있는 입고 줄) UNIQUE 로 보장 —
 * 동시에 두 요청이 와도 전표는 한 장, 분개도 한 벌. 취소된 전표는 이력으로 남고 새 초안을 만들 수 있다.
 * 금액·원료·수량·일자는 확정된 입고 줄 기준 (이름·번호 추정 없음). 전표일 = 입고일.
 */
export async function ensureInboundLineVoucher(conn: any, p: {
  tenantId: number; lineId: number; userId: number; partnerId?: number | null; taxRate?: number | null;
  /** 입고 때 단가가 없던 줄(0) 에만 쓰는 전표 단가 — 단가가 있던 줄은 입고 단가가 정본 (Codex #560 검증 N3) */
  unitPriceIfUnpriced?: number | null;
  /** 입고 확정 안에서 부를 때만 true — 헤더는 아직 확정 전이다. 밖(재발행) 에서는 확정된 문서만 (Codex #561·562 검증 R2) */
  duringConfirm?: boolean;
}): Promise<number> {
  const [lr]: any = await conn.execute(
    `SELECT l.id, l.line_number, l.header_id, l.material_id, l.purchase_quantity, l.purchase_unit, l.unit_price, l.total_price, l.lot_id,
            l.stock_quantity, l.cancelled_qty, l.valuation_unit_price, l.valuation_amount, l.disposition, l.tax_amount,
            h.status AS header_status, h.supplier_id, DATE_FORMAT(h.inbound_date, '%Y-%m-%d') AS inbound_date
       FROM h_inbound_lines l JOIN h_inbound_headers h ON h.id = l.header_id AND h.tenant_id = l.tenant_id
      WHERE l.id = ? AND l.tenant_id = ? LIMIT 1 FOR UPDATE`,
    [p.lineId, p.tenantId],
  );
  const line = (lr as any[])[0];
  if (!line) throw new Error("입고 줄을 찾을 수 없습니다.");
  // 살아 있는 입고 줄만 (Codex #561·562 검증 R2) — 취소된 줄로 전표를 다시 만들면 재고 없는 원재료 자산이 생긴다.
  //   헤더는 다른 줄 때문에 confirmed 로 남을 수 있으니 줄의 취소 수량을 본다.
  if (Number(line.cancelled_qty) > EPS) throw new Error(`입고 줄 ${line.header_id}-${line.line_number} 은 취소됐습니다 — 전표를 만들 수 없습니다.`);
  if (!p.duringConfirm && line.header_status !== "confirmed") throw new Error("확정된 입고 줄만 전표를 만들 수 있습니다.");
  if (line.disposition === "quarantine") throw new Error(`입고 줄 ${line.header_id}-${line.line_number} 은 검수 불합격으로 격리 중입니다 — 재검수 합격 뒤 전표를 만들 수 있습니다.`);
  const find = async () => {
    const [ex]: any = await conn.execute(
      `SELECT id FROM accounting_purchases WHERE tenant_id = ? AND inbound_line_id = ? AND status <> 'cancelled' LIMIT 1`, [p.tenantId, p.lineId],
    );
    return (ex as any[])[0] ? Number((ex as any[])[0].id) : null;
  };
  const existing = await find();
  if (existing) return existing;
  const [mn]: any = await conn.execute(`SELECT material_name FROM h_materials WHERE id = ? AND tenant_id = ?`, [line.material_id, p.tenantId]);
  const taxRate = p.taxRate ?? 10;
  const unpriced = !(Number(line.total_price) > 0);
  // 무단가 입고가 이미 평가됐으면 그 평가가 정본 (Codex #561·562 검증 R3) — 다른 가격 재발행은 거부 (별도 재평가 절차).
  const valued = unpriced && line.valuation_amount != null;
  if (valued && (p.unitPriceIfUnpriced ?? 0) > 0 && Math.abs(Number(p.unitPriceIfUnpriced) - Number(line.valuation_unit_price)) > 0.005) {
    throw new Error(`이 입고는 단가 ${Number(line.valuation_unit_price)} 로 평가됐습니다 — 다른 단가로 전표를 다시 만들 수 없습니다 (재평가는 별도 절차).`);
  }
  const unitPrice = valued ? Number(line.valuation_unit_price)
    : unpriced && (p.unitPriceIfUnpriced ?? 0) > 0 ? Number(p.unitPriceIfUnpriced) : Number(line.unit_price);
  const supply = valued ? Math.round(Number(line.valuation_amount) * 100) / 100
    : unpriced && (p.unitPriceIfUnpriced ?? 0) > 0
      ? Math.round(Number(line.purchase_quantity) * unitPrice * 100) / 100
      : Math.round(Number(line.total_price) * 100) / 100;
  // 명시한 세액은 그대로 — 입고 줄 공급가 그대로 쓰는 경우만 (무단가 평가·재평가 금액에는 다시 계산)
  const explicitTax = line.tax_amount != null && !unpriced ? Number(line.tax_amount) : null;
  const tax = explicitTax ?? Math.round(supply * taxRate / 100);
  try {
    const [vi]: any = await conn.execute(
      `INSERT INTO accounting_purchases
         (tenant_id, transaction_date, partner_id, item_name, material_id, quantity, unit, unit_price, total_amount, tax_amount, tax_rate,
          status, source_type, source_id, inbound_line_id, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'inbound', ?, ?, ?, ?)`,
      [p.tenantId, line.inbound_date, p.partnerId ?? (line.supplier_id != null ? Number(line.supplier_id) : null),
       (mn as any[])[0]?.material_name ?? `원재료#${line.material_id}`,
       line.material_id, Number(line.purchase_quantity), line.purchase_unit, unitPrice, supply, tax, taxRate,
       line.id, line.id, `입고 ${line.header_id}-${line.line_number} 매입전표 초안`, p.userId],
    );
    return Number(vi.insertId);
  } catch (e) {
    if (isDup(e)) { const again = await find(); if (again) return again; }
    throw e;
  }
}

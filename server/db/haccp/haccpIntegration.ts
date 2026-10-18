import { getDb, getRawConnection, withTransaction } from "../connection";
import { accountingPurchases, accountingSales } from "../../../drizzle/schema";
import { eq, and} from "drizzle-orm";

import { todayKST } from "../../utils/timezone";

/**
 * 매입 거래 직접 생성 (품목 단위)
 * itemMasterId 기준으로 통합 관리: 원재료면 h_materials 자동 연동
 */
export async function createPurchase(params: {
  transactionDate: string;
  partnerId: number;
  itemName: string;
  materialId?: number; // 원재료 ID (레거시 호환)
  itemMasterId?: number; // item_master ID (통합 기준)
  quantity: number;
  packagingSize?: number; // 포장규격
  unitPrice: number;
  amount: number;
  taxAmount: number;
  taxRate?: number; // 세율(%) — 면세 거래면 0, 미지정이면 기본 10%
  memo?: string;
  accountCategoryId?: number;
  expiryDate?: string; // 소비기한
  productionDate?: string; // 생산일자
  unit?: string; // 단위
  packagingUnit?: string; // 포장규격 단위 (원재료 기준 단위여야 함)
  createdBy: number;
  idempotencyKey?: string | null;   // 같은 요청 재시도는 입고·전표 한 번
  savePackUnit?: boolean;           // 포장 환산 설정이 없을 때 이 입력(1 단위 = 포장규격)으로 저장하고 진행 — 사용자 확인 후에만
  inspectionResult?: "pass" | "fail" | null; // 입고 검수 (불합격 → 격리)
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // === itemMasterId → materialId 자동 매핑 ===
  let resolvedMaterialId = params.materialId;
  if (params.itemMasterId && !resolvedMaterialId) {
    // 이 회사의 품목만 (다른 회사 품목 id 로 그 회사 원재료를 잡지 않는다). 조회 실패는 삼키지 않는다.
    const { itemMaster } = await import("../../../drizzle/schema");
    const [masterItem] = await db.select().from(itemMaster).where(and(eq(itemMaster.id, params.itemMasterId), eq(itemMaster.tenantId, tenantId as number)));
    const isMaterial = masterItem && (masterItem.itemType === "raw_material" || masterItem.itemType === "subsidiary");
    if (isMaterial && masterItem.legacyMaterialId) {
      resolvedMaterialId = masterItem.legacyMaterialId;
    } else if (isMaterial) {
      // ★ 2026-10-17 (지티 브라우저 검증 F03): 원재료인데 재고 원료와 연결이 없으면 옛 경로(재고·검수 없는 전표) 로 보내지 않는다
      throw new Error(`품목 '${masterItem.itemName}' 이 재고 원재료와 연결돼 있지 않아 매입 입고를 처리할 수 없습니다 — 품목 마스터 연결을 먼저 확인하세요.`);
    }
  }

  // ★ 2026-10-17 (입고 정본화 — 매입 입력 경유): 원재료 매입은 입고 문서로 — 재고 반영은 입고 확정 한 곳.
  //   이전: 여기서 LOT·원장·집계를 직접 INSERT(관문·잠금·환산 검사 없음, 회계만 회사도 LOT 생성) + 육안검사 기록 + postPurchase.
  //   지금: 입고 문서(직접 입고, 전표 초안 연결) → 확정(재고·수불부 한 번, 불합격은 격리) → 연결 전표 확정(분개만).
  //   포장규격은 회사·원료·포장 단위 설정으로 (CEO 결정 1 — 설정 없으면 차단, 사용자가 확인하면 이 입력으로 저장).
  if (resolvedMaterialId) {
    if (!tenantId) throw new Error("tenantId 필수");
    return createMaterialPurchaseViaInbound({ ...params, materialId: Number(resolvedMaterialId) }, Number(tenantId));
  }

  // ★ 2026-04-15: material_id / account_category_id 컬럼 부재 시 fallback
  //   startupMigrations.ensureAccountingTransactionColumns 에서 자동 ADD 되지만
  //   ensure 실패/타이밍 문제로 여전히 없을 수 있음 → INSERT 실패 시 재시도
  const baseValues: any = {
    tenantId: tenantId,
    transactionDate: params.transactionDate,
    partnerId: params.partnerId,
    itemName: params.itemName,
    quantity: params.quantity.toString(),
    unit: params.unit || "개",
    unitPrice: params.unitPrice.toString(),
    totalAmount: params.amount.toString(),
    taxAmount: params.taxAmount.toString(),
    taxRate: (params.taxRate ?? 10).toFixed(2),
    sourceType: "manual",
    notes: params.memo ?? null,
    // ★ 2026-08-21: 'approved' 직접 지정 → 'pending' 으로 변경
    //   아래에서 postPurchase 를 호출해 정식 경로로 approved 로 전환한다.
    //   예전에는 여기서 바로 approved 로 넣고 postPurchase 를 부르지 않아
    //   화면상 "승인됨" 인데 분개·입고전표·수불부가 하나도 없는 유령 상태가 됐다.
    status: "pending",
    createdBy: params.createdBy,
  };
  // 선택 컬럼 (컬럼 부재 시 fallback 가능)
  if (resolvedMaterialId !== undefined && resolvedMaterialId !== null) {
    baseValues.materialId = resolvedMaterialId;
  }
  if (params.accountCategoryId !== undefined && params.accountCategoryId !== null) {
    baseValues.accountCategoryId = params.accountCategoryId;
  }

  let purchase: any;
  try {
    [purchase] = await db.insert(accountingPurchases).values(baseValues);
  } catch (insertErr: any) {
    const msg = insertErr?.message || String(insertErr);
    // Unknown column 에러 시 해당 컬럼 제거 후 재시도
    if (msg.includes("Unknown column") || insertErr?.code === "ER_BAD_FIELD_ERROR") {
      console.warn(`[createPurchase] INSERT 실패, fallback 재시도: ${msg}`);
      // material_id 문제면 제거
      if (msg.includes("material_id") || msg.includes("materialId")) {
        delete baseValues.materialId;
      }
      // account_category_id 문제면 제거
      if (msg.includes("account_category_id") || msg.includes("accountCategoryId")) {
        delete baseValues.accountCategoryId;
      }
      [purchase] = await db.insert(accountingPurchases).values(baseValues);
      console.warn(`[createPurchase] fallback INSERT 성공 — startupMigrations 재실행 권장`);
    } else {
      throw insertErr;
    }
  }

  // === 원료수불부 입고 연동 ===
  // ★ 2026-10-16: 여기서 더하지 않는다 — 아래 postPurchase (B-3) 가 확정 시 한 번 기록한다.
  //   이전에는 등록 때 onPurchaseCreated 로 한 번, postPurchase 로 또 한 번 더해 수불부 입고가 이중 가산됐다
  //   (10/12 원료 605·635, Codex DB 감사). 확정이 실패한 매입은 승인 버튼으로 확정할 때 기록된다.

  // ── 회계 확정 (postPurchase) ──
  // ★ 2026-08-21 추가
  //   이 함수는 오랫동안 status='approved' 로 직접 INSERT 하면서 postPurchase 를
  //   부르지 않았다. 그래서 매입 등록 화면에서 만든 전표는 "승인됨" 으로 보이지만
  //   회계 분개 · 입고전표 · 수불부가 전혀 없었다 (2026-08-21 실측: approved 211건 중
  //   posting 을 거친 것 120건).
  //
  //   위에서 이미 LOT·재고를 만들었으므로 postPurchase 는 그 재고를 감지해
  //   재고 단계를 건너뛰고 입고전표·수불부·분개만 생성한다 (purchasePost.ts (0-2) 가드).
  //
  //   실패해도 전표 자체는 pending 으로 남는다. 목록의 승인 버튼으로 다시 시도할 수 있다.
  //   여기서 throw 하면 이미 만들어진 전표를 두고 사용자가 재등록해 중복이 생긴다.
  const purchaseId = Number((purchase as any)?.insertId ?? 0);
  let posted = false;
  let postError: string | null = null;
  if (purchaseId > 0) {
    try {
      const { postPurchase } = await import("../../lib/accounting/purchasePost");
      await postPurchase(purchaseId, params.createdBy, tenantId);
      posted = true;
    } catch (e: any) {
      postError = e?.message ?? String(e);
      console.error(`[createPurchase] postPurchase 실패 (전표 ${purchaseId} 은 pending 유지):`, postError);
    }
  }

  return Object.assign(purchase as object, { posted, postError });
}

/** 원재료 매입 = 입고 문서(직접 입고) + 확정 + 연결 전표 확정. createPurchase 에서만 부른다. */
async function createMaterialPurchaseViaInbound(params: {
  transactionDate: string; partnerId: number; itemName: string; materialId: number; quantity: number; packagingSize?: number;
  unitPrice: number; amount: number; taxAmount: number; taxRate?: number; memo?: string; expiryDate?: string; productionDate?: string;
  unit?: string; packagingUnit?: string; createdBy: number; idempotencyKey?: string | null; savePackUnit?: boolean; inspectionResult?: "pass" | "fail" | null;
}, tenantId: number) {
  const raw = await getRawConnection();
  const { toInventoryMaterialId } = await import("../../lib/identity/itemIdentityService");
  const materialId = (await toInventoryMaterialId(params.materialId, tenantId, raw)).id;
  const [mr]: any = await raw.execute(`SELECT id, unit, material_name FROM h_materials WHERE id = ? AND tenant_id = ? LIMIT 1`, [materialId, tenantId]);
  const mat = (mr as any[])[0];
  if (!mat) throw new Error("원재료를 찾을 수 없습니다.");
  const { isInventoryTrackingEnabled } = await import("../../lib/inventory/inventoryTrackingPolicy");
  const tracking = await isInventoryTrackingEnabled(tenantId);
  const purchaseUnit = String(params.unit || "개").trim();
  const norm = (u: unknown) => String(u ?? "").trim().toLowerCase();
  // 포장규격(1 매입 단위 = N 기준 단위) — 재고 수량은 설정으로 계산하고 입력값과 같아야 한다
  let stockQuantity: number | null = null;
  const pack = Number(params.packagingSize ?? 0);
  if (tracking && pack > 0 && params.packagingUnit && norm(params.packagingUnit) !== norm(mat.unit)) {
    throw new Error(`${mat.material_name}: 포장규격 단위(${params.packagingUnit}) 가 원재료 기준 단위(${mat.unit}) 와 다릅니다 — 기준 단위로 입력하세요.`);
  }
  if (tracking && pack > 0 && !(norm(purchaseUnit) === norm(mat.unit) && pack === 1)) {
    stockQuantity = Math.round(params.quantity * pack * 1000) / 1000;
    if (norm(purchaseUnit) !== norm(mat.unit)) {
      const [pu]: any = await raw.execute(
        `SELECT id FROM material_pack_units WHERE tenant_id = ? AND material_id = ? AND LOWER(TRIM(pack_unit)) = ? AND is_active = 1 LIMIT 1`,
        [tenantId, materialId, norm(purchaseUnit)],
      );
      if (!(pu as any[])[0]) {
        if (!params.savePackUnit) {
          throw new Error(`PACK_UNIT_MISSING: ${mat.material_name} — '${purchaseUnit}' → ${mat.unit} 포장 환산 설정이 없습니다 (입력: 1${purchaseUnit} = ${pack}${mat.unit}). 확인 후 저장하면 다음부터 이 설정으로 계산합니다.`);
        }
        const { upsertPackUnit } = await import("../../lib/inventory/inbound/packUnits");
        await upsertPackUnit(raw, { tenantId, userId: params.createdBy, materialId, packUnit: purchaseUnit, baseQty: pack });
      }
    }
  }
  const supply = Math.round(Number(params.amount) * 100) / 100;
  const taxRate = params.taxRate ?? (Number(params.taxAmount) > 0 ? 10 : 0);
  // 세액은 입력값 그대로 보존 (Codex #567 검증 N3) — 공급가 × 세율과 달라도 바꾸지 않는다. 음수·공급가 초과만 거부.
  const taxAmount = Math.round(Number(params.taxAmount ?? 0) * 100) / 100;
  if (!(taxAmount >= 0) || (supply > 0 && taxAmount > supply)) throw new Error(`${mat.material_name}: 세액 ${params.taxAmount} 이 올바르지 않습니다 (0 이상, 공급가 이하).`);
  const key = params.idempotencyKey || `purchase-${tenantId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const { createInboundDraft, confirmInbound } = await import("../../lib/inventory/inbound/inboundService");
  const { headerId } = await createInboundDraft({
    tenantId, userId: params.createdBy, idempotencyKey: key, sourceType: "direct", supplierId: params.partnerId,
    inboundDate: params.transactionDate, notes: params.memo ?? null, createVoucherDrafts: true,
    lines: [{
      materialId, purchaseQuantity: params.quantity, purchaseUnit,
      stockQuantity, stockUnit: stockQuantity != null ? String(mat.unit) : null,
      unitPrice: params.unitPrice, totalPrice: supply, taxRate, taxAmount,
      expiryDate: params.expiryDate || null, productionDate: params.productionDate || null,
      inspectionResult: params.inspectionResult ?? null, notes: params.memo ?? null,
    }],
  });
  // 같은 요청 키로 다시 온 경우 — 문서의 지금 상태로 답한다 (격리·반품·취소된 줄을 '확정' 으로 보고하지 않는다, Codex #567 Q2)
  const [hs]: any = await raw.execute(`SELECT status FROM h_inbound_headers WHERE id = ? AND tenant_id = ?`, [headerId, tenantId]);
  if ((hs as any[])[0]?.status === "cancelled") {
    return { id: 0, insertId: 0, inboundHeaderId: headerId, status: "cancelled", posted: false, postError: null };
  }
  const r = await confirmInbound(headerId, tenantId, params.createdBy);
  if (r.status !== "confirmed") {
    return { id: 0, insertId: 0, inboundHeaderId: headerId, status: "pending_approval", pendingApproval: true, posted: false, postError: null };
  }
  if (r.quarantinedLineIds?.length) {
    return { id: 0, insertId: 0, inboundHeaderId: headerId, status: "quarantined", quarantined: true, posted: false, postError: null };
  }
  if (r.cancelledLineIds?.length) {
    return { id: 0, insertId: 0, inboundHeaderId: headerId, status: "cancelled", posted: false, postError: null };
  }
  const purchaseId = r.voucherIds[0] ?? 0;
  const lot = r.lots[0];
  // 신규 입고가 → 자재 현재 단가 갱신 (재고 단위당, 2026-10-13 CEO 요구) — 재고 회사·LOT 이 있을 때만
  if (lot?.lotId) {
    try {
      const [lp]: any = await raw.execute(`SELECT unit_price FROM h_inventory_lots WHERE id = ? AND tenant_id = ?`, [lot.lotId, tenantId]);
      const per = Number((lp as any[])[0]?.unit_price ?? 0);
      if (per > 0) {
        const { applyMaterialPriceFromReceipt } = await import("../../lib/inventory/materialPrice");
        await applyMaterialPriceFromReceipt(raw, { materialId, tenantId, unitPrice: per, changedBy: params.createdBy, reason: `매입 입고 #${purchaseId} (${lot.lotNumber})` });
      }
    } catch (e: any) {
      console.warn(`[createPurchase] 자재 단가 갱신 실패 (비치명):`, e?.message || e);
    }
  }
  // 매입 입력은 등록 = 확정 (이전 동작 유지). 연결 전표라 분개만 — 재고는 위 입고 확정이 이미 반영했다.
  let posted = false;
  let postError: string | null = null;
  if (purchaseId > 0) {
    try {
      const { dispatchPostPurchase } = await import("../../lib/accounting/postDispatcher");
      await dispatchPostPurchase(purchaseId, params.createdBy, tenantId);
      posted = true;
    } catch (e: any) {
      postError = e?.message ?? String(e);
      console.error(`[createPurchase] 전표 확정 실패 (전표 ${purchaseId} 은 pending 유지):`, postError);
    }
  }
  return { id: purchaseId, insertId: purchaseId, inboundHeaderId: headerId, lotId: lot?.lotId || null, status: "confirmed", posted, postError };
}

/**
 * 매출 거래 직접 생성 (품목 단위)
 *
 * ★ 2026-04-21 (Phase 8+): materialId 파라미터 추가
 *   - productId 또는 materialId 중 하나만 설정 (XOR)
 *   - 완제품 판매 → productId
 *   - 원재료/부자재/외부제품 판매 → materialId
 */
export async function createSale(params: {
  transactionDate: string;
  partnerId: number;
  itemName: string;
  productId?: number;   // 완제품 FK (h_products_v2)
  materialId?: number;  // 원재료/부자재/외부제품 FK (h_materials)
  skuId?: number;       // ★ 2026-10-16: 판매 SKU (product_skus.id) — 제품은 SKU 에서 정한다
  quantity: number;
  unitPrice: number;
  amount: number;
  taxAmount: number;
  taxRate?: number; // 세율(%) — 면세 거래면 0, 미지정이면 기본 10%
  unit?: string;
  memo?: string;
  accountCategoryId?: number;
  accountingExcluded?: boolean;  // ★ 2026-04-22: B2C 전자상거래 (회계 제외, 재고만 차감)
  createdBy: number;
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // XOR 검증
  if (params.productId && params.materialId) {
    throw new Error(
      `createSale: productId(${params.productId})와 materialId(${params.materialId}) 동시 설정 불가 (XOR 제약)`,
    );
  }

  // ★ 2026-10-16 판매 SKU: 이 회사 SKU 인지·제품과 맞는지 확인하고, 제품·단위는 SKU 에서 (saleSku)
  const skuFields = await saleSkuFields(tenantId, { skuId: params.skuId, productId: params.productId, materialId: params.materialId, unit: params.unit });

  const [sale] = await db.insert(accountingSales).values({
    tenantId: tenantId,
    transactionDate: params.transactionDate,
    partnerId: params.partnerId,
    productId: skuFields.productId ?? params.productId ?? null,
    materialId: params.materialId ?? null,
    skuId: skuFields.skuId,
    itemName: params.itemName,
    quantity: params.quantity.toString(),
    unit: skuFields.unit || params.unit || "개",
    unitPrice: params.unitPrice.toString(),
    totalAmount: params.amount.toString(),
    taxAmount: params.taxAmount.toString(),
    taxRate: (params.taxRate ?? 10).toFixed(2),
    sourceType: "manual",
    notes: params.memo ?? null,
    status: "pending",
    accountingExcluded: params.accountingExcluded ? 1 : 0,  // ★ 2026-04-22: B2C 회계 제외 플래그
    createdBy: params.createdBy,
  } as any);

  return sale;
}

/**
 * 재고 입고 거래를 매입 거래로 변환
 */
export async function createPurchaseFromReceipt(params: {
  inventoryTransactionId?: number | null;
  /** 입고 LOT id — 재고거래 id 와 다른 번호 체계라 따로 받는다 (Codex #560 검증 N2) */
  lotId?: number | null;
  inboundLineId?: number | null;
  partnerId?: number;
  materialId?: number; // ★ 2026-04-13 추가: 명시적 FK
  itemName: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  taxRate?: string;
  notes?: string;
  createdBy: number;
}, tenantId?: number) {
  // ★ 2026-10-17 (입고 정본화 PR-4, Codex #560 검증 N1·N2 / #561·562 검증 R1): 입고 확정으로 만든 입고면 그 입고 줄의 전표로.
  //   번호 종류(입고 줄 / LOT / 재고거래) 를 명시적으로 구분해 한 경로로만 찾는다 — 같은 숫자의 우연 일치로 다른 입고를 잡지 않는다.
  //   R1: 모든 조회에 호출자 회사 조건. 명시한 번호가 이 회사의 입고가 아니면(없음·타사·입고 아닌 거래) 바로 거절 —
  //       구형 전표 INSERT 로 빠지지 않는다. 원료도 이 회사 입고 LOT(또는 이 회사 원재료) 에서만.
  //   전표 조회·생성은 입고 줄 잠금 아래 한 트랜잭션 (ensureInboundLineVoucher) + DB UNIQUE — 동시 요청에도 한 장.
  //   원료·수량·금액·일자는 확정된 입고 줄 기준 (전표일 = 입고일).
  if (!tenantId) throw new Error("tenantId 필수");
  const raw = await getRawConnection();
  let resolvedMaterialId: number | null = null;
  let inboundLineId: number | null = null;
  if (params.inboundLineId) {
    const [r]: any = await raw.execute(`SELECT id FROM h_inbound_lines WHERE id = ? AND tenant_id = ? LIMIT 1`, [params.inboundLineId, tenantId]);
    if (!(r as any[])[0]) throw new Error("입고 줄을 찾을 수 없습니다.");
    inboundLineId = Number(params.inboundLineId);
  } else if (params.lotId) {
    const [r]: any = await raw.execute(
      `SELECT id, inbound_line_id, material_id FROM h_inventory_lots WHERE id = ? AND tenant_id = ? AND material_id IS NOT NULL LIMIT 1`,
      [params.lotId, tenantId]);
    const lot = (r as any[])[0];
    if (!lot) throw new Error("입고 LOT 을 찾을 수 없습니다.");
    inboundLineId = lot.inbound_line_id != null ? Number(lot.inbound_line_id) : null;
    resolvedMaterialId = Number(lot.material_id);
  } else if (params.inventoryTransactionId) {
    const [r]: any = await raw.execute(
      `SELECT l.inbound_line_id, l.material_id FROM h_inventory_transactions t
         JOIN h_inventory_lots l ON l.id = t.lot_id AND l.tenant_id = t.tenant_id
        WHERE t.id = ? AND t.tenant_id = ? AND t.transaction_type IN ('receipt', 'inbound') AND l.material_id IS NOT NULL LIMIT 1`,
      [params.inventoryTransactionId, tenantId]);
    const tx = (r as any[])[0];
    if (!tx) throw new Error("이 회사의 입고 거래를 찾을 수 없습니다.");
    inboundLineId = tx.inbound_line_id != null ? Number(tx.inbound_line_id) : null;
    resolvedMaterialId = Number(tx.material_id);
  }
  if (params.materialId) {
    const [m]: any = await raw.execute(`SELECT id FROM h_materials WHERE id = ? AND tenant_id = ? LIMIT 1`, [params.materialId, tenantId]);
    if (!(m as any[])[0]) throw new Error("원재료를 찾을 수 없습니다.");
    if (resolvedMaterialId && resolvedMaterialId !== Number(params.materialId)) throw new Error("입고 원료와 지정한 원재료가 다릅니다.");
    resolvedMaterialId = Number(params.materialId);
  }
  if (params.partnerId) {
    const [ps]: any = await raw.execute(`SELECT id FROM partners WHERE id = ? AND tenant_id = ? LIMIT 1`, [params.partnerId, tenantId]);
    if (!(ps as any[])[0]) throw new Error("거래처를 찾을 수 없습니다.");
  }
  if (inboundLineId) {
    const { ensureInboundLineVoucher } = await import("../../lib/inventory/inbound/inboundService");
    const id = await withTransaction((conn: any) => ensureInboundLineVoucher(conn, {
      tenantId: Number(tenantId), lineId: inboundLineId!, userId: params.createdBy,
      partnerId: params.partnerId ?? null, taxRate: params.taxRate != null ? Number(params.taxRate) : null,
      unitPriceIfUnpriced: params.unitPrice != null ? Number(params.unitPrice) : null,
    }), "createPurchaseFromReceipt");
    const [rows]: any = await raw.execute(`SELECT * FROM accounting_purchases WHERE id = ? AND tenant_id = ?`, [id, tenantId]);
    return (rows as any[])[0];
  }
  // 입고 문서 이전 방식(입고 줄 연결 없음) 의 LOT·거래, 또는 번호 없는 요청 — 전표를 만들지 않는다 (Codex #563 검증 R8).
  //   이 전표는 입고 줄 잠금·'입고 줄당 전표 하나' 키를 거치지 않아 같은 입고로 여러 장이 만들어졌고,
  //   승인하면 재고 경로가 새 LOT 을 만들어 한 번 들어온 재고가 전표 수만큼 늘었다. 이름·번호 추정 연결도 하지 않는다.
  throw new Error(
    params.lotId || params.inventoryTransactionId
      ? "이 입고는 입고 문서 이전 방식이라 매입전표를 자동으로 만들 수 없습니다 (승인 시 재고가 다시 생기는 것을 막기 위해 차단). 회계 처리는 별도 정정 절차로 진행하세요."
      : "입고 번호(입고 줄·LOT·재고거래) 가 필요합니다.",
  );
}

/**
 * 재고 출고 거래를 매출 거래로 변환
 */
export async function createSaleFromUsage(params: {
  inventoryTransactionId?: number;
  partnerId?: number;
  itemName: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  taxRate?: string;
  notes?: string;
  createdBy: number;
}, tenantId?: number) {
  // ★ 2026-10-17 (Codex #564 검증 S1·S2): 재고 출고 → 매출전표 자동 생성은 중단한다.
  //   이 전표(source_type='inventory_usage') 는 출고 번호 검증·연결·'출고당 전표 하나' 가 없어 같은 출고로 여러 장이 생겼고,
  //   승인하면 매출 확정이 일반 판매로 LOT 을 다시 차감했다 (출고 5kg → 승인 후 또 5kg). 타사·없는 번호도 받았다.
  //   매출은 제품 출고(출고와 매출을 한 문서로, 승인 = 회계만) 로 등록한다. 이미 출고한 재고의 매출 연결은 별도 절차.
  void params; void tenantId;
  throw new Error("재고 출고 화면에서 매출전표를 자동으로 만들 수 없습니다 (출고한 재고가 매출 승인 때 다시 빠지는 것을 막기 위해 중단). 판매는 '제품 출고' 에서 등록하세요.");
}

/**
 * 재고 거래 ID로 연결된 회계 거래 조회
 */
export async function getAccountingByInventoryTransaction(inventoryTransactionId: number, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const purchases = await db
    .select()
    .from(accountingPurchases)
    .where(and(eq(accountingPurchases.sourceId, inventoryTransactionId), eq(accountingPurchases.tenantId, tenantId as number)));

  const sales = await db
    .select()
    .from(accountingSales)
    .where(and(eq(accountingSales.sourceId, inventoryTransactionId), eq(accountingSales.tenantId, tenantId as number)));

  return { purchases, sales };
}

/**
 * 매입 거래 목록 조회
 */
export async function getAllPurchases(filters?: {
  startDate?: string;
  endDate?: string;
  partnerId?: number;
  itemName?: string;
  status?: string;
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const { partners } = await import("../../../drizzle/schema");
  const { and, gte, lte, eq, like } = await import("drizzle-orm");

  let query = db
    .select({
      id: accountingPurchases.id,
      transactionDate: accountingPurchases.transactionDate,
      partnerId: accountingPurchases.partnerId,
      partnerName: partners.companyName,
      materialId: accountingPurchases.materialId, // ★ 2026-04-13 추가
      itemName: accountingPurchases.itemName,
      quantity: accountingPurchases.quantity,
      unit: accountingPurchases.unit,
      unitPrice: accountingPurchases.unitPrice,
      amount: accountingPurchases.totalAmount,
      taxAmount: accountingPurchases.taxAmount,
      status: accountingPurchases.status,
      memo: accountingPurchases.notes,
      proofType: accountingPurchases.evidenceType,
      createdAt: accountingPurchases.createdAt
    })
    .from(accountingPurchases)
    .leftJoin(
      partners,
      and(
        eq(accountingPurchases.partnerId, partners.id),
        eq(partners.tenantId, accountingPurchases.tenantId),
      ),
    );

  const conditions = [eq(accountingPurchases.tenantId, tenantId as number)];
  if (filters?.startDate) {
    conditions.push(gte(accountingPurchases.transactionDate, filters.startDate));
  }
  if (filters?.endDate) {
    conditions.push(lte(accountingPurchases.transactionDate, filters.endDate));
  }
  if (filters?.partnerId) {
    conditions.push(eq(accountingPurchases.partnerId, filters.partnerId));
  }
  if (filters?.itemName) {
    conditions.push(like(accountingPurchases.itemName, `%${filters.itemName}%`));
  }
  if (filters?.status) {
    conditions.push(eq(accountingPurchases.status, filters.status as any) );
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  const { desc } = await import("drizzle-orm");
  query = query.orderBy(desc(accountingPurchases.transactionDate), desc(accountingPurchases.id)) as any;

  return await query;
}

/**
 * 매출 거래 목록 조회
 */
export async function getAllSales(filters?: {
  startDate?: string;
  endDate?: string;
  partnerId?: number;
  itemName?: string;
  status?: string;
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const { partners, productSkus } = await import("../../../drizzle/schema");
  const { and, gte, lte, eq, like } = await import("drizzle-orm");

  let query = db
    .select({
      id: accountingSales.id,
      transactionDate: accountingSales.transactionDate,
      partnerId: accountingSales.partnerId,
      partnerName: partners.companyName,
      productId: accountingSales.productId, // ★ 2026-04-14 추가 (Module 2)
      skuId: accountingSales.skuId, // ★ 2026-10-16 판매 SKU
      skuName: productSkus.skuName,
      itemName: accountingSales.itemName,
      quantity: accountingSales.quantity,
      unit: accountingSales.unit,
      unitPrice: accountingSales.unitPrice,
      amount: accountingSales.totalAmount,
      taxAmount: accountingSales.taxAmount,
      status: accountingSales.status,
      memo: accountingSales.notes,
      proofType: accountingSales.evidenceType,
      accountingExcluded: accountingSales.accountingExcluded,  // ★ 2026-04-22: B2C 회계 제외 플래그
      createdAt: accountingSales.createdAt
    })
    .from(accountingSales)
    .leftJoin(
      partners,
      and(
        eq(accountingSales.partnerId, partners.id),
        eq(partners.tenantId, accountingSales.tenantId),
      ),
    )
    .leftJoin(
      productSkus,
      and(
        eq(accountingSales.skuId, productSkus.id),
        eq(productSkus.tenantId, accountingSales.tenantId),
      ),
    );

  const conditions = [eq(accountingSales.tenantId, tenantId as number)];
  if (filters?.startDate) {
    conditions.push(gte(accountingSales.transactionDate, filters.startDate));
  }
  if (filters?.endDate) {
    conditions.push(lte(accountingSales.transactionDate, filters.endDate));
  }
  if (filters?.partnerId) {
    conditions.push(eq(accountingSales.partnerId, filters.partnerId));
  }
  if (filters?.itemName) {
    conditions.push(like(accountingSales.itemName, `%${filters.itemName}%`));
  }
  if (filters?.status) {
    conditions.push(eq(accountingSales.status, filters.status as any) );
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  return await query;
}

/**
 * 매입 거래 상세 조회
 */
export async function getPurchaseById(id: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { partners } = await import("../../../drizzle/schema");

  const purchase = await db
    .select()
    .from(accountingPurchases)
    .leftJoin(
      partners,
      and(
        eq(accountingPurchases.partnerId, partners.id),
        eq(partners.tenantId, accountingPurchases.tenantId),
      ),
    )
    .where(and(eq(accountingPurchases.id, id), eq(accountingPurchases.tenantId, tenantId as number)))
    .limit(1);

  if (purchase.length === 0) {
    throw new Error("매입 거래를 찾을 수 없습니다.");
  }

  return {
    ...purchase[0].accounting_purchases,
    partnerName: purchase[0].partners?.companyName || "알 수 없음",
    ...transactionDetailView(purchase[0].accounting_purchases),
  };
}

/**
 * 매출 거래 상세 조회
 */
export async function getSaleById(id: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { partners } = await import("../../../drizzle/schema");

  const sale = await db
    .select()
    .from(accountingSales)
    .leftJoin(
      partners,
      and(
        eq(accountingSales.partnerId, partners.id),
        eq(partners.tenantId, accountingSales.tenantId),
      ),
    )
    .where(and(eq(accountingSales.id, id), eq(accountingSales.tenantId, tenantId as number)))
    .limit(1);

  if (sale.length === 0) {
    throw new Error("매출 거래를 찾을 수 없습니다.");
  }

  return {
    ...sale[0].accounting_sales,
    partnerName: sale[0].partners?.companyName || "알 수 없음",
    ...transactionDetailView(sale[0].accounting_sales),
  };
}

/**
 * 매출에 차감된 LOT 추적 (사후 조회)
 *
 * 2026-04-27 (이전 세션 미완 작업):
 *   매출 승인 시 productSalePost / productSaleCancel / autoMaterialIssue 등에서
 *   FEFO 차감으로 h_inventory_transactions 에 source_type='SALE', source_id=saleId
 *   기록을 남김. 사후에 어느 LOT 이 차감됐는지 확인하는 화면이 없어 추적이 어려웠음.
 *
 * 반환:
 *   해당 매출 ID 에 차감된 모든 LOT 건별 상세 (LOT 번호, 수량, 단가, 소비기한, 시각).
 *   상품/원재료 모두 지원.
 */
export async function getSaleLotTrace(saleId: number, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { sql } = await import("drizzle-orm");

  // h_inventory_transactions 에서 source_type='SALE' + source_id=saleId 조회
  // LOT / 제품 / 원재료 정보 left join (제품 매출이면 product 매핑, 원재료 매출이면 material 매핑)
  const result: any = await db.execute(sql`
    SELECT
      t.id              AS tx_id,
      t.lot_id          AS lot_id,
      t.material_id     AS material_id,
      t.quantity        AS quantity,
      t.unit            AS unit,
      t.unit_cost       AS unit_cost,
      t.amount          AS amount,
      t.transaction_date AS transaction_date,
      t.notes           AS notes,
      t.created_at      AS created_at,
      l.lot_number      AS lot_number,
      l.expiry_date     AS expiry_date,
      l.production_date AS production_date,
      l.product_id      AS lot_product_id,
      p.product_name    AS product_name,
      p.product_code    AS product_code,
      m.material_name   AS material_name,
      m.material_code   AS material_code
    FROM h_inventory_transactions t
    LEFT JOIN h_inventory_lots l ON l.id = t.lot_id AND t.lot_id > 0
    LEFT JOIN h_products_v2 p ON p.id = l.product_id AND p.tenant_id = t.tenant_id
    LEFT JOIN h_materials m ON m.id = t.material_id AND m.tenant_id = t.tenant_id
    WHERE t.tenant_id = ${tenantId}
      AND t.transaction_type = 'usage'
      AND (t.source_type = 'SALE' OR t.reference_type = 'SALE')
      AND t.source_id = ${saleId}
    ORDER BY t.id ASC
  `);

  const rows = (Array.isArray(result?.[0]) ? result[0] : result) as any[];

  return (rows || []).map((r: any) => ({
    txId: Number(r.tx_id),
    lotId: r.lot_id ? Number(r.lot_id) : null,
    lotNumber: r.lot_number || null,
    productId: r.lot_product_id ? Number(r.lot_product_id) : null,
    productName: r.product_name || null,
    productCode: r.product_code || null,
    materialId: r.material_id ? Number(r.material_id) : null,
    materialName: r.material_name || null,
    materialCode: r.material_code || null,
    quantity: Math.abs(parseFloat(r.quantity || "0")),
    unit: r.unit || "",
    unitCost: parseFloat(r.unit_cost || "0"),
    amount: Math.abs(parseFloat(r.amount || "0")),
    transactionDate: r.transaction_date,
    productionDate: r.production_date,
    expiryDate: r.expiry_date,
    notes: r.notes,
    createdAt: r.created_at,
  }));
}

/**
 * 매입 거래명세서 PDF 생성 (HTML 형식)
 */
export async function generatePurchasePdf(id: number, tenantId: number): Promise<string> {
  const purchase = await getPurchaseById(id, tenantId);
  const { storagePut } = await import("../../storage");

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>매입 거래명세서</title>
  <style>
    body { font-family: 'Malgun Gothic', sans-serif; padding: 40px; }
    h1 { text-align: center; margin-bottom: 30px; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; }
    .text-right { text-align: right; }
    .total-row { font-weight: bold; background-color: #f9f9f9; }
  </style>
</head>
<body>
  <h1>매입 거래명세서</h1>
  <table>
    <tr>
      <th>거래일자</th>
      <td>${purchase.transactionDate}</td>
      <th>공급업체</th>
      <td>${purchase.partnerName}</td>
    </tr>
    <tr>
      <th>품목명</th>
      <td>${purchase.itemName}</td>
      <th>수량</th>
      <td>${purchase.quantity} ${purchase.unit}</td>
    </tr>
    <tr>
      <th>단가</th>
      <td>${parseFloat(purchase.unitPrice).toLocaleString()}원</td>
      <th>금액</th>
      <td>${parseFloat(purchase.totalAmount).toLocaleString()}원</td>
    </tr>
    <tr>
      <th>세액 (${purchase.taxRate}%)</th>
      <td>${parseFloat(purchase.taxAmount || '0').toLocaleString()}원</td>
      <th>총 합계</th>
      <td class="total-row">${(parseFloat(purchase.totalAmount) + parseFloat(purchase.taxAmount || '0')).toLocaleString()}원</td>
    </tr>
  </table>
  ${purchase.notes ? `<p><strong>메모:</strong> ${purchase.notes}</p>` : ""}
</body>
</html>
  `;

  const pdfBuffer = Buffer.from(html, "utf-8");
  const fileName = `purchase_${id}_${Date.now()}.html`;
  const tenantPrefix = `tenant-${tenantId}/`;
  const { url } = await storagePut(`${tenantPrefix}pdfs/${fileName}`, pdfBuffer, "text/html");

  return url;
}

/**
 * 매출 거래명세서 PDF 생성 (HTML 형식)
 */
export async function generateSalePdf(id: number, tenantId: number): Promise<string> {
  const sale = await getSaleById(id, tenantId);
  const { storagePut } = await import("../../storage");

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>매출 거래명세서</title>
  <style>
    body { font-family: 'Malgun Gothic', sans-serif; padding: 40px; }
    h1 { text-align: center; margin-bottom: 30px; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; }
    .text-right { text-align: right; }
    .total-row { font-weight: bold; background-color: #f9f9f9; }
  </style>
</head>
<body>
  <h1>매출 거래명세서</h1>
  <table>
    <tr>
      <th>거래일자</th>
      <td>${sale.transactionDate}</td>
      <th>고객사</th>
      <td>${sale.partnerName}</td>
    </tr>
    <tr>
      <th>품목명</th>
      <td>${sale.itemName}</td>
      <th>수량</th>
      <td>${sale.quantity} ${sale.unit}</td>
    </tr>
    <tr>
      <th>단가</th>
      <td>${parseFloat(sale.unitPrice).toLocaleString()}원</td>
      <th>금액</th>
      <td>${parseFloat(sale.totalAmount).toLocaleString()}원</td>
    </tr>
    <tr>
      <th>세액 (${sale.taxRate}%)</th>
      <td>${parseFloat(sale.taxAmount || '0').toLocaleString()}원</td>
      <th>총 합계</th>
      <td class="total-row">${(parseFloat(sale.totalAmount) + parseFloat(sale.taxAmount || '0')).toLocaleString()}원</td>
    </tr>
  </table>
  ${sale.notes ? `<p><strong>메모:</strong> ${sale.notes}</p>` : ""}
</body>
</html>
  `;

  const pdfBuffer = Buffer.from(html, "utf-8");
  const fileName = `sale_${id}_${Date.now()}.html`;
  const tenantPrefix = `tenant-${tenantId}/`;
  const { url } = await storagePut(`${tenantPrefix}pdfs/${fileName}`, pdfBuffer, "text/html");

  return url;
}

/**
 * 매입 거래 수정
 */
export async function updatePurchase(
  id: number,
  data: {
    transactionDate?: string;
    partnerId?: number;
    materialId?: number; // ★ 2026-04-13 추가: h_materials FK
    itemName?: string;
    category?: string;
    quantity?: number;
    unit?: string;
    unitPrice?: number;
    totalAmount?: number;
    taxAmount?: number;
    status?: string;
    notes?: string;
    accountCategoryId?: number;
  }, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // category 필드는 accounting_purchases 에 없음 → 제거
  const { category: _category, ...rest } = data;
  // ★ 2026-10-17 (입고 정본화 PR-0): 상태는 확정·취소 경로로만 바꾼다 (여기서 approved 로 바꾸면 분개·재고 없는 '유령 확정').
  //   재고나 분개가 이미 생긴 매입은 메모·계정 분류만 고칠 수 있다 — 수량·단가·품목을 바꿔도 LOT·원장·분개는 그대로라 어긋난다.
  //   화면은 모든 칸을 보내므로 **실제로 바뀌는 값** 만 본다.
  const [cur] = await db.select().from(accountingPurchases)
    .where(and(eq(accountingPurchases.id, id), eq(accountingPurchases.tenantId, tenantId as number))).limit(1);
  if (!cur) throw new Error("매입 거래를 찾을 수 없습니다");
  const norm = (v: unknown) => {
    if (v == null || String(v).trim() === "") return null;
    const t = String(v).trim();
    return Number.isFinite(Number(t)) ? Number(t) : t;
  };
  const curValue = (k: string) => {
    const v = (cur as any)[k];
    if (k !== "transactionDate") return v;
    if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
    return v == null ? v : String(v).slice(0, 10);
  };
  const differs = (k: string) => (rest as any)[k] !== undefined && norm((rest as any)[k]) !== norm(curValue(k));
  if (differs("status")) {
    throw new Error("매입 상태는 확정·취소 기능으로만 바꿀 수 있습니다.");
  }
  delete (rest as any).status;
  const stockKeys = ["transactionDate", "partnerId", "materialId", "itemName", "quantity", "unit", "unitPrice", "totalAmount", "taxAmount"];
  if (stockKeys.some(differs) && tenantId != null && (await purchaseHasFootprint(Number(tenantId), id))) {
    throw new Error("재고 또는 분개가 이미 생긴 매입은 수량·단가·품목·거래처·일자를 고칠 수 없습니다. 취소 후 다시 등록하세요.");
  }
  const updateData: any = { ...rest, updatedAt: new Date() };
  if (updateData.quantity !== undefined) updateData.quantity = updateData.quantity.toString();
  if (updateData.unitPrice !== undefined) updateData.unitPrice = updateData.unitPrice.toString();
  if (updateData.totalAmount !== undefined) updateData.totalAmount = updateData.totalAmount.toString();
  if (updateData.taxAmount !== undefined) updateData.taxAmount = updateData.taxAmount.toString();

  await db
    .update(accountingPurchases)
    .set(updateData)
    .where(and(eq(accountingPurchases.id, id), eq(accountingPurchases.tenantId, tenantId as number)));

  return { success: true };
}

/**
 * 매입이 재고·분개를 남겼는가 — 등록 시 LOT(reference accounting_purchase), 확정 시 LOT(source accounting_purchases),
 * 분개([매입] PURCHASE-id), 또는 대기 외 상태.
 */
async function purchaseHasFootprint(tenantId: number, purchaseId: number): Promise<boolean> {
  const conn = await getRawConnection();
  const [rows]: any = await conn.execute(
    `SELECT
       (SELECT status FROM accounting_purchases WHERE id = ? AND tenant_id = ?) AS st,
       EXISTS(SELECT 1 FROM h_inventory_transactions WHERE tenant_id = ?
               AND ((reference_type = 'accounting_purchase' AND reference_id = ?) OR (source_type = 'accounting_purchases' AND source_id = ?))) AS has_stock,
       EXISTS(SELECT 1 FROM expense_journal_entries WHERE tenant_id = ? AND voucher_id = ?
               AND (description = ? OR description LIKE ?)) AS has_journal`,
    [purchaseId, tenantId, tenantId, purchaseId, purchaseId, tenantId, purchaseId, `[매입] PURCHASE-${purchaseId}`, `[매입] PURCHASE-${purchaseId} %`],
  );
  const r = (rows as any[])[0] ?? {};
  return (r.st != null && r.st !== "pending" && r.st !== "cancelled") || Number(r.has_stock) === 1 || Number(r.has_journal) === 1;
}

/**
 * 매입 거래 삭제
 */
export async function deletePurchase(id: number, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  // ★ 2026-10-17 (입고 정본화 PR-0): 재고·분개가 생긴 매입은 지우지 않는다 (지우면 LOT·원장·분개만 남는다) — 취소로.
  if (await purchaseHasFootprint(tenantId, id)) {
    throw new Error("재고 또는 분개가 이미 생긴 매입은 삭제할 수 없습니다. 매입 취소를 사용하세요.");
  }

  await db
    .delete(accountingPurchases)
    .where(and(eq(accountingPurchases.id, id), eq(accountingPurchases.tenantId, tenantId as number)));

  return { success: true };
}

/**
 * 매출 거래 수정
 */
export async function updateSale(
  id: number,
  data: {
    transactionDate?: string;
    partnerId?: number;
    productId?: number; // ★ 2026-04-14: h_products FK (Module 2)
    skuId?: number | null; // ★ 2026-10-16: 판매 SKU — 대기(pending) 매출에서만 바꿀 수 있다
    itemName?: string;
    category?: string;
    quantity?: number;
    unit?: string;
    unitPrice?: number;
    totalAmount?: number;
    taxAmount?: number;
    status?: string;
    notes?: string;
    accountCategoryId?: number;
  }, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // ★ 2026-10-16 상태는 승인·수금·취소 버튼으로만 바꾼다 — 수정으로 'approved' 를 넣으면 재고 차감·분개 없이
  //   승인된 것처럼 보인다 (CLAUDE.md "유령 상태"). 같은 상태를 다시 보내는 것은 허용 (수정 화면이 그대로 보냄).
  // ★ 2026-10-16 판매 SKU 변경 — 확정 뒤에는 이미 그 LOT 에서 빠졌으므로 바꾸지 않는다
  if (data.skuId !== undefined || data.status !== undefined) {
    const conn: any = await getRawConnection();
    const [cur]: any = await conn.execute(`SELECT status, product_id, material_id, sku_id FROM accounting_sales WHERE id = ? AND tenant_id = ?`, [id, tenantId]);
    const row = cur?.[0];
    if (!row) throw new Error(`매출 #${id} 를 찾을 수 없습니다.`);
    if (data.status !== undefined && data.status !== row.status) {
      throw new Error(`매출 상태는 수정으로 바꿀 수 없습니다 (${row.status} → ${data.status}). 승인·수금·취소 버튼을 쓰세요.`);
    }
  }
  if (data.skuId !== undefined) {
    const conn: any = await getRawConnection();
    const [cur]: any = await conn.execute(`SELECT status, product_id, material_id, sku_id FROM accounting_sales WHERE id = ? AND tenant_id = ?`, [id, tenantId]);
    const row = cur?.[0];
    if (!row) throw new Error(`매출 #${id} 를 찾을 수 없습니다.`);
    const same = (row.sku_id == null && data.skuId == null) || Number(row.sku_id) === Number(data.skuId);
    if (!same) {
      if (row.status !== "pending") throw new Error(`확정된 매출의 SKU 는 바꿀 수 없습니다 (현재: ${row.status}). 취소 후 다시 등록하세요.`);
      if (data.skuId != null) {
        const f = await saleSkuFields(tenantId, { skuId: data.skuId, productId: data.productId ?? (row.product_id != null ? Number(row.product_id) : undefined), materialId: row.material_id != null ? Number(row.material_id) : undefined, unit: data.unit });
        (data as any).productId = f.productId ?? data.productId;
        if (!data.unit && f.unit) data.unit = f.unit;
      }
    }
  }

  // category 는 accounting_sales 에 없는 컬럼 → 제거
  const { category: _category, ...rest } = data;
  const updateData: any = { ...rest, updatedAt: new Date() };
  if (updateData.quantity !== undefined) updateData.quantity = updateData.quantity.toString();
  if (updateData.unitPrice !== undefined) updateData.unitPrice = updateData.unitPrice.toString();
  if (updateData.totalAmount !== undefined) updateData.totalAmount = updateData.totalAmount.toString();
  if (updateData.taxAmount !== undefined) updateData.taxAmount = updateData.taxAmount.toString();

  await db
    .update(accountingSales)
    .set(updateData)
    .where(and(eq(accountingSales.id, id), eq(accountingSales.tenantId, tenantId as number)));

  return { success: true };
}

/**
 * 매출 거래 삭제
 */
export async function deleteSale(id: number, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  await db
    .delete(accountingSales)
    .where(and(eq(accountingSales.id, id), eq(accountingSales.tenantId, tenantId as number)));

  return { success: true };
}


/**
 * 매출 SKU 필드 (2026-10-16) — createSale·updateSale 공통.
 * SKU 가 있으면 이 회사 SKU 인지·제품과 맞는지 확인하고 제품(legacy_product_id)·판매단위를 돌려준다.
 */
async function saleSkuFields(
  tenantId: number | undefined,
  p: { skuId?: number | null; productId?: number | null; materialId?: number | null; unit?: string | null },
): Promise<{ skuId: number | null; productId: number | null; unit: string | null }> {
  if (!p.skuId) return { skuId: null, productId: null, unit: null };
  if (!tenantId) throw new Error("[보안] tenantId 필수");
  if (p.materialId) throw new Error(`판매 SKU(#${p.skuId}) 는 제품 매출에만 지정할 수 있습니다 (원재료·부자재 매출 #material ${p.materialId}).`);
  const { resolveSaleSku } = await import("../../lib/accounting/saleSku");
  const r = await resolveSaleSku(await getRawConnection() as any, tenantId, { skuId: p.skuId, productId: p.productId ?? null });
  if (r.kind !== "sku") throw new Error(`SKU #${p.skuId} 를 확인하지 못했습니다.`);
  return { skuId: r.sku.skuId, productId: r.sku.productId, unit: r.sku.salesUnit };
}

/**
 * 매입·매출 상세 화면용 값 (2026-10-17, 지티 브라우저 검증 F07 — 상세 화면이 items·totalTax·grandTotal 을 기대해 전체 화면 오류).
 * 한 전표 = 한 품목 줄. 금액 계약(amountContract): total_amount = 공급가, tax_amount = 세액, 합계 = 공급가 + 세액.
 * 기존 필드(totalAmount 등 문자열) 는 그대로 두고 숫자 값을 더한다 (PDF 등 다른 사용처 보존).
 */
function transactionDetailView(r: any) {
  const n = (v: unknown) => (v == null || v === "" ? 0 : Number(v) || 0);
  const supply = n(r?.totalAmount);
  const tax = n(r?.taxAmount);
  return {
    supplyAmount: supply,
    totalTax: tax,
    grandTotal: supply + tax,
    items: [{ itemName: r?.itemName ?? "", quantity: n(r?.quantity), unit: r?.unit ?? null, unitPrice: n(r?.unitPrice), amount: supply, tax, total: supply + tax }],
  };
}

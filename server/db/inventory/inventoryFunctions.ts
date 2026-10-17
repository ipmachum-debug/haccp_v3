import { eq, and, or, lte, gte, gt, isNull, desc, asc, sql, lt, inArray, sum, like } from "drizzle-orm";
import { hInventoryLots, hInventory, hInventoryTransactions, hMaterials, hBatchInputs, hMaterialPriceHistory, itemMaster } from "../../../drizzle/schema";
import { getDb, getRawConnection } from "../connection";

import { toKSTDate, todayKST } from "../../utils/timezone";

// ============================================================================
// Inventory Lots
// ============================================================================

export async function getAllInventoryLotsWithDetails(tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const { hInventoryLots, hMaterials } = await import("../../../drizzle/schema.js");
  const { desc, eq, sql } = await import("drizzle-orm");

  // 원재료 정보 조회 (tenantId 필터)
  const materials = tenantId
    ? await db.select().from(hMaterials).where(eq(hMaterials.tenantId, tenantId as number))
    : await db.select().from(hMaterials);
  const materialMap = new Map(materials.map(m => [m.id, m]));

  // item_master 품목 정보 조회 (부자재/외주제품 이름 해소용)
  let itemMasterMap = new Map<number, { itemName: string; itemCode: string; itemType: string }>();
  try {
    const imResult: any = await db.execute(sql`
      SELECT id, item_name, item_code, item_type FROM item_master
      WHERE ${tenantId ? sql`tenant_id = ${tenantId}` : sql`1=1`}
    `);
    const imRows: any[] = (imResult as any)?.[0] || [];
    for (const row of imRows) {
      itemMasterMap.set(Number(row.id), {
        itemName: row.item_name,
        itemCode: row.item_code,
        itemType: row.item_type,
      });
    }
  } catch (_) { /* item_master 없으면 무시 */ }

  // LOT 목록 조회 (tenantId 직접 필터)
  const lots = tenantId
    ? await db.select().from(hInventoryLots).where(eq(hInventoryLots.tenantId, tenantId as number)).orderBy(desc(hInventoryLots.receiptDate), desc(hInventoryLots.id))
    : await db.select().from(hInventoryLots).orderBy(desc(hInventoryLots.receiptDate), desc(hInventoryLots.id));

  return lots.map(lot => {
    const mat = lot.materialId ? materialMap.get(lot.materialId) : null;
    const im = lot.materialId ? itemMasterMap.get(lot.materialId) : null;
    return {
      ...lot,
      materialName: mat?.materialName || im?.itemName || "Unknown",
      materialCode: mat?.materialCode || im?.itemCode || "",
      itemType: im?.itemType || (mat ? "raw_material" : "unknown"),
    };
  });
}

/**
 * 모든 재고 LOT 조회
 */
export async function getAllInventoryLots(filters?: {
  startDate?: string;
  endDate?: string;
  materialId?: number;
  supplierId?: number;
  search?: string;
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const { hInventoryLots, hMaterials } = await import("../../../drizzle/schema.js");
  const { eq, desc, and, gte, lte, like, or } = await import("drizzle-orm");

  // 필터 조건 구성
  const conditions = [];
  // hInventoryLots.tenant_id로 직접 필터링
  if (filters?.startDate) {
    conditions.push(gte(hInventoryLots.receiptDate, filters.startDate as any));
  }
  if (filters?.endDate) {
    conditions.push(lte(hInventoryLots.receiptDate, filters.endDate as any));
  }
  if (filters?.materialId) {
    conditions.push(eq(hInventoryLots.materialId, filters.materialId));
  }
   // supplierId 필터는 supplierName으로 대체 (클라이언트 측에서 처리) }

  // tenantId 직접 필터링 (hInventoryLots에 tenant_id 컬럼 있음)
  if (filters?.tenantId) {
    conditions.push(eq(hInventoryLots.tenantId, filters.tenantId));
  }

  // 기본 조회
  let query = db.select().from(hInventoryLots);
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }
  const lots = await query.orderBy(desc(hInventoryLots.receiptDate), desc(hInventoryLots.id));

  // 원재료 정보 병합 (tenantId 필터 포함)
  const materials = filters?.tenantId
    ? await db.select().from(hMaterials).where(eq(hMaterials.tenantId, filters.tenantId))
    : await db.select().from(hMaterials);
  const materialMap = new Map(materials.map(m => [m.id, m]));

  let filteredLots = lots;

  let results = filteredLots.map(lot => ({
    ...lot,
    materialName: lot.materialId ? (materialMap.get(lot.materialId)?.materialName || "Unknown") : "Unknown",
    materialCode: lot.materialId ? (materialMap.get(lot.materialId)?.materialCode || "") : ""
  }));

  // 검색어 필터 (클라이언트 측에서 처리)
  if (filters?.search) {
    const searchLower = filters.search.toLowerCase();
    results = results.filter(lot =>
      lot.lotNumber?.toLowerCase().includes(searchLower) ||
      lot.materialName?.toLowerCase().includes(searchLower) ||
      lot.materialCode?.toLowerCase().includes(searchLower)
    );
  }

  return results;
}

/**
 * 재고 입고 (LOT 생성)
 * ★ 2026-10-17 (재고 쓰기 경로 정리 PR-1): 재고 관문 receiveNewLot 경유 — 회사(tenant_id)·현재수량·입고 원장·집계를 한 트랜잭션으로.
 *   이전: tenant_id 없이 LOT INSERT, 집계 미갱신, 트랜잭션 없음, 공급처명 가짜값("Supplier N").
 */
export async function createInventoryLot(data: {
  materialId: number;
  lotNumber: string;
  quantity: string;
  unit: string;
  expiryDate?: Date;
  supplierId?: number;
  receiptDate?: Date;
  userId: number;
  tenantId?: number;
}) {
  const tenantId = requireTenantId(data.tenantId);
  const qty = parsePositiveQty(data.quantity);
  const { withInventoryTx, receiveNewLot } = await import("../../lib/inventory/applyInventoryDelta");
  const { toInventoryMaterialId } = await import("../../lib/identity/itemIdentityService");
  const { lotId } = await withInventoryTx(async (conn) => {
    const materialId = await canonicalMaterialInTenant(conn, data.materialId, tenantId, toInventoryMaterialId);
    return receiveNewLot(conn, {
      tenantId,
      subject: { materialId },
      lotNumber: data.lotNumber,
      quantity: qty,
      unit: data.unit,
      receiptDate: data.receiptDate ?? new Date(),
      expiryDate: data.expiryDate ?? null,
      reference: { referenceType: "supplier", referenceId: data.supplierId ?? null, sourceType: "MANUAL_RECEIPT", actionType: "MANUAL_RECEIPT" },
      notes: `재고 입고 - LOT ${data.lotNumber}`,
      createdBy: data.userId,
    });
  }, "inventory.createLot");

  return {
    success: true,
    message: "재고가 입고되었습니다",
    lotId
  };
}

/** 재고 쓰기 경로는 회사가 정해져야 한다 (workerProcedure/adminProcedure 는 tenantId 를 보장하지 않는다) */
function requireTenantId(tenantId: number | null | undefined): number {
  const t = Number(tenantId);
  if (!Number.isFinite(t) || t <= 0) throw new Error("테넌트 정보가 필요합니다. 회사를 선택한 뒤 다시 시도하세요.");
  return t;
}

function parsePositiveQty(v: string | number): number {
  const q = typeof v === "number" ? v : parseFloat(v);
  if (!Number.isFinite(q) || q <= 0) throw new Error(`수량이 올바르지 않습니다: ${v}`);
  return q;
}

/** 입력 자재 id → 이 회사의 h_materials.id. 다른 회사 자재·없는 자재는 거부. */
async function canonicalMaterialInTenant(
  conn: any,
  anyMaterialId: number,
  tenantId: number,
  toInventoryMaterialId: (id: number, t: number, c?: any) => Promise<{ id: number }>,
): Promise<number> {
  const { id } = await toInventoryMaterialId(anyMaterialId, tenantId, conn);
  const [rows]: any = await conn.execute(`SELECT id FROM h_materials WHERE id = ? AND tenant_id = ? LIMIT 1`, [id, tenantId]);
  if (!(rows as any[])[0]) throw new Error(`원재료를 찾을 수 없습니다 (id=${anyMaterialId})`);
  return id;
}
/**
 * 재고 LOT 조회 (FEFO 원칙 적용 - 유통기한 가까운 순)
 */
export async function getInventoryLotsByMaterialId(materialId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const { hInventoryLots } = await import("../../../drizzle/schema.js");
  const { eq, and, asc } = await import("drizzle-orm");

  const conditions: any[] = [
    eq(hInventoryLots.materialId, materialId),
    eq(hInventoryLots.status, "available")
  ];
  if (tenantId) conditions.push(eq(hInventoryLots.tenantId, tenantId as any));

  return await db
    .select()
    .from(hInventoryLots)
    .where(and(...conditions))
    .orderBy(asc(hInventoryLots.expiryDate)); // FEFO: 유통기한 가까운 순
}

// ============================================================================
// Material Input to Batch
// ============================================================================

/**
 * 원재료 투입 (재고 차감 및 거래 내역 생성)
 * ★ 2026-10-17 (재고 쓰기 경로 정리 PR-1): 회사 격리 + 재고 관문 applyLotDelta 경유, 한 트랜잭션.
 *   이전: LOT 을 id 로만 조회·차감(다른 회사 LOT 차감 가능), 투입·원장에 tenant_id 없음, 집계 미갱신, 잠금 없음.
 *   원장에 투입 줄 id(source_line_id) 를 남겨 투입 삭제 시 그 LOT·수량으로 되돌린다.
 */
export async function addMaterialInputToBatch(data: {
  batchId: number;
  materialId: number;
  lotId: number;
  quantity: string;
  unit: string;
  userId: number;
  tenantId?: number;
}) {
  const tenantId = requireTenantId(data.tenantId);
  const qty = parsePositiveQty(data.quantity);
  const { withInventoryTx, applyLotDelta } = await import("../../lib/inventory/applyInventoryDelta");
  const { toInventoryMaterialId } = await import("../../lib/identity/itemIdentityService");

  const remaining = await withInventoryTx(async (conn) => {
    const [bRows]: any = await conn.execute(
      `SELECT id FROM h_batches WHERE id = ? AND tenant_id = ? LIMIT 1 FOR UPDATE`, [data.batchId, tenantId],
    );
    if (!(bRows as any[])[0]) throw new Error("배치를 찾을 수 없습니다");
    const materialId = await canonicalMaterialInTenant(conn, data.materialId, tenantId, toInventoryMaterialId);
    const [lRows]: any = await conn.execute(
      `SELECT id, unit, material_id FROM h_inventory_lots WHERE id = ? AND tenant_id = ? LIMIT 1`, [data.lotId, tenantId],
    );
    const lot = (lRows as any[])[0];
    if (!lot) throw new Error("재고 LOT를 찾을 수 없습니다");
    if (String(lot.unit ?? "").trim() !== String(data.unit ?? "").trim()) {
      throw new Error(`단위가 다릅니다: LOT ${lot.unit}, 투입 ${data.unit} — 같은 단위로 입력하세요`);
    }

    const [ins]: any = await conn.execute(
      `INSERT INTO h_batch_inputs
         (tenant_id, batch_id, material_id, lot_id, planned_quantity, actual_quantity, unit, input_time, input_by, inventory_deducted)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?, 1)`,
      [tenantId, data.batchId, materialId, data.lotId, qty, qty, data.unit, data.userId],
    );
    const inputId = Number(ins.insertId);

    const r = await applyLotDelta(conn, {
      tenantId,
      lotId: data.lotId,
      subject: { materialId },
      quantity: qty,
      direction: "decrease",
      transactionType: "usage",
      unit: data.unit,
      reference: { referenceType: "batch", referenceId: data.batchId, sourceType: "BATCH", sourceId: data.batchId, sourceLineId: inputId, actionType: "MANUAL_INPUT" },
      notes: `배치 ${data.batchId}에 원재료 투입`,
      createdBy: data.userId,
    });
    return r.remaining;
  }, "inventory.addMaterialInput");

  return {
    success: true,
    message: "원재료가 투입되었습니다",
    remainingQuantity: remaining.toFixed(3)
  };
}

/**
 * 원재료 투입 수정 — 같은 회사 투입 행만 (2026-10-17 PR-1: 이전엔 id 로만 갱신, 없는 컬럼 quantity 를 쓰려 함)
 * 재고 수량은 바꾸지 않는다 (투입 기록만). 실투입 정정은 재고 조정으로.
 */
export async function updateMaterialInput(
  inputId: number,
  data: {
    quantity?: string;
    lotId?: number;
  },
  tenantId?: number
) {
  const t = requireTenantId(tenantId);
  const conn = await getRawConnection();
  const [rows]: any = await conn.execute(`SELECT id FROM h_batch_inputs WHERE id = ? AND tenant_id = ? LIMIT 1`, [inputId, t]);
  if (!(rows as any[])[0]) throw new Error("투입 내역을 찾을 수 없습니다");
  if (data.lotId !== undefined) {
    const [l]: any = await conn.execute(`SELECT id FROM h_inventory_lots WHERE id = ? AND tenant_id = ? LIMIT 1`, [data.lotId, t]);
    if (!(l as any[])[0]) throw new Error("재고 LOT를 찾을 수 없습니다");
  }
  const sets: string[] = [];
  const args: any[] = [];
  if (data.quantity !== undefined) { sets.push("actual_quantity = ?"); args.push(parsePositiveQty(data.quantity)); }
  if (data.lotId !== undefined) { sets.push("lot_id = ?"); args.push(data.lotId); }
  if (sets.length === 0) return;
  await conn.execute(`UPDATE h_batch_inputs SET ${sets.join(", ")} WHERE id = ? AND tenant_id = ?`, [...args, inputId, t]);
}

/**
 * 원재료 투입 삭제 — 그 투입이 실제로 뺀 LOT·수량(원장)을 추적해 되돌린다 (2026-10-17 PR-1).
 *   이전: 투입·LOT 을 id 로만 조회(다른 회사 데이터 삭제·복원 가능), 원장 없이 input.lot_id 하나에 수량을 더함
 *         (자동출고가 여러 LOT 에서 뺐어도 한 LOT 으로, LOT 없는 투입은 복원 안 함).
 *   지금: 원장 usage (source BATCH / source_line_id = 투입 id) − 이미 되돌린 return 을 LOT 별로 applyLotDelta(increase, 'return').
 *         재고를 뺐다고 표시된 투입(inventory_deducted=1)인데 그 원장을 찾을 수 없으면(생산완료 일괄차감 등) 거부 — 재고 조정으로 처리.
 */
export async function deleteMaterialInput(inputId: number, tenantId?: number, userId?: number) {
  const t = requireTenantId(tenantId);
  const { withInventoryTx, applyLotDelta } = await import("../../lib/inventory/applyInventoryDelta");
  return withInventoryTx(async (conn) => {
    const [iRows]: any = await conn.execute(
      `SELECT id, batch_id, material_id, inventory_deducted FROM h_batch_inputs WHERE id = ? AND tenant_id = ? LIMIT 1 FOR UPDATE`,
      [inputId, t],
    );
    const input = (iRows as any[])[0];
    if (!input) throw new Error("투입 내역을 찾을 수 없습니다");

    const [txRows]: any = await conn.execute(
      `SELECT lot_id, material_id, unit,
              SUM(CASE WHEN transaction_type = 'usage' AND source_type = 'BATCH' THEN quantity ELSE 0 END)
            - SUM(CASE WHEN transaction_type = 'return' AND source_type = 'BATCH_INPUT_CANCEL' THEN quantity ELSE 0 END) AS net,
              COUNT(*) AS n
         FROM h_inventory_transactions
        WHERE tenant_id = ? AND source_line_id = ?
          AND ((transaction_type = 'usage' AND source_type = 'BATCH' AND source_id = ?)
            OR (transaction_type = 'return' AND source_type = 'BATCH_INPUT_CANCEL'))
        GROUP BY lot_id, material_id, unit`,
      [t, inputId, Number(input.batch_id)],
    );
    const groups = txRows as any[];
    if (Number(input.inventory_deducted) === 1 && groups.length === 0) {
      throw new Error("이 투입의 재고 출고 기록을 찾을 수 없어 자동으로 되돌릴 수 없습니다. 재고 조정으로 처리하세요.");
    }
    let restored = 0;
    for (const g of groups) {
      const net = parseFloat(g.net) || 0;
      if (g.lot_id == null || net <= 0.0005) continue; // LOT 없는 과거 출고 기록은 되돌릴 LOT 이 없다
      await applyLotDelta(conn, {
        tenantId: t,
        lotId: Number(g.lot_id),
        subject: { materialId: g.material_id != null ? Number(g.material_id) : Number(input.material_id) },
        quantity: net,
        direction: "increase",
        transactionType: "return",
        unit: g.unit,
        reference: { referenceType: "batch", referenceId: Number(input.batch_id), sourceType: "BATCH_INPUT_CANCEL", sourceId: Number(input.batch_id), sourceLineId: inputId, actionType: "INPUT_CANCEL" },
        notes: `배치 ${input.batch_id} 원재료 투입 #${inputId} 삭제 — 재고 복원`,
        createdBy: userId ?? 0,
      });
      restored++;
    }
    await conn.execute(`DELETE FROM h_batch_inputs WHERE id = ? AND tenant_id = ?`, [inputId, t]);
    return { restoredLots: restored };
  }, "inventory.deleteMaterialInput");
}
export async function getBatchMaterialInputs(batchId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const { hBatchInputs } = await import("../../../drizzle/schema.js");
  const { hMaterials } = await import("../../../drizzle/schema/schema_main_products.js");
  const { itemMaster } = await import("../../../drizzle/schema/schema_dual_unit.js");
  const { eq, sql } = await import("drizzle-orm");

  // ★ 2026-06-03 FIX: 배치 상세 페이지에서 원재료명이 "원재료 #ID"로 표시되던 버그 수정
  // - h_batch_inputs.material_id 는 h_materials.id 를 가리키는 외래키
  // - 기존 코드는 item_master 와 JOIN 했으나 ID 체계가 달라 매칭 실패 → fallback 발동
  // - 1차 JOIN: h_materials (정본), 2차 JOIN: item_master (통합 마스터 호환)
  // - COALESCE 우선순위: h_materials.material_name → item_master.item_name → 'h_materials.id에 대한 fallback'
  const inputs = await db.select({
    id: hBatchInputs.id,
    batchId: hBatchInputs.batchId,
    materialId: hBatchInputs.materialId,
    materialName: sql`COALESCE(${hMaterials.materialName}, ${itemMaster.itemName}, CONCAT('원재료 #', ${hBatchInputs.materialId}))`.as("materialName"),
    materialCode: sql`COALESCE(${hMaterials.materialCode}, ${itemMaster.itemCode})`.as("materialCode"),
    lotId: hBatchInputs.lotId,
    plannedQuantity: hBatchInputs.plannedQuantity,
    actualQuantity: hBatchInputs.actualQuantity,
    unit: hBatchInputs.unit,
    inputTime: hBatchInputs.inputTime,
    inputBy: hBatchInputs.inputBy,
    createdAt: hBatchInputs.createdAt
  })
  .from(hBatchInputs)
  .leftJoin(hMaterials, eq(hBatchInputs.materialId, hMaterials.id))
  .leftJoin(itemMaster, eq(hBatchInputs.materialId, itemMaster.id))
  .where(eq(hBatchInputs.batchId, batchId));

  // ── 투입별 실제 소비 LOT (2026-10-12) ──
  // h_batch_inputs.lot_id 는 설계상 거의 비어 있다 (FEFO 가 한 투입을 여러 LOT 에서 차감하므로 한 칸에 못 담음).
  // 실제 차감 내역은 h_inventory_transactions (source_type='BATCH', source_line_id = 투입 id) 에 LOT 단위로 있다.
  // 배치 화면 "LOT" 칸이 항상 "-" 였던 이유. 거래에서 역조회해서 붙인다.
  type ConsumedLot = { lotId: number | null; lotNumber: string | null; quantity: number; negative: boolean };
  const lotsByInput = new Map<number, ConsumedLot[]>();
  if (inputs.length > 0) {
    try {
      const conn = await getRawConnection();
      const [txRows] = await conn.execute<any[]>(
        `SELECT t.source_line_id AS inputId, t.lot_id AS lotId, l.lot_number AS lotNumber,
                t.quantity, t.notes
         FROM h_inventory_transactions t
         LEFT JOIN h_inventory_lots l ON l.id = t.lot_id
         WHERE t.source_type = 'BATCH' AND t.source_id = ? AND t.transaction_type = 'usage'
           ${tenantId ? "AND t.tenant_id = ?" : ""}
         ORDER BY t.source_line_id, t.id`,
        tenantId ? [batchId, tenantId] : [batchId],
      );
      for (const r of txRows as any[]) {
        const key = Number(r.inputId);
        if (!key) continue;
        const list = lotsByInput.get(key) ?? [];
        list.push({
          lotId: r.lotId != null ? Number(r.lotId) : null,
          lotNumber: r.lotNumber ?? null,
          quantity: parseFloat(String(r.quantity ?? 0)),
          negative: String(r.lotNumber ?? "").startsWith("NEG-") || /음수 차감/.test(String(r.notes ?? "")),
        });
        lotsByInput.set(key, list);
      }
    } catch (err) {
      console.warn(`[getBatchMaterialInputs] 소비 LOT 조회 실패 batch=${batchId} (LOT 칸 비움):`, err);
    }
  }

  // 수동 투입(h_batch_inputs.lot_id 직접 지정)이고 거래 역조회가 비면 그 LOT 번호라도 보여준다
  const manualLotIds = inputs.filter(i => i.lotId && !lotsByInput.has(i.id)).map(i => Number(i.lotId));
  const manualLotNames = new Map<number, string>();
  if (manualLotIds.length > 0) {
    try {
      const conn = await getRawConnection();
      const [lotRows] = await conn.execute<any[]>(
        `SELECT id, lot_number FROM h_inventory_lots WHERE id IN (${manualLotIds.map(() => "?").join(",")})`,
        manualLotIds,
      );
      for (const r of lotRows as any[]) manualLotNames.set(Number(r.id), String(r.lot_number ?? ""));
    } catch { /* 표시용 — 실패해도 무시 */ }
  }

  return inputs.map(i => {
    const consumed = lotsByInput.get(i.id);
    const lots: ConsumedLot[] = consumed && consumed.length > 0
      ? consumed
      : i.lotId
        ? [{ lotId: Number(i.lotId), lotNumber: manualLotNames.get(Number(i.lotId)) ?? `#${i.lotId}`, quantity: parseFloat(String(i.actualQuantity ?? i.plannedQuantity ?? 0)), negative: false }]
        : [];
    return { ...i, lots };
  });
}

// ============================================================================
// Materials
// ============================================================================

/**
 * 모든 구매 가능 품목 조회 (원재료 + 부재료 + 외주제품)
 */
export async function getAllMaterials(tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const { itemMaster } = await import("../../../drizzle/schema.js");
  const { eq, and, desc, inArray } = await import("drizzle-orm");
  // ✅ FIX: raw_material 뿐 아니라 subsidiary, external_product 도 포함
  const conditions: any[] = [
    inArray(itemMaster.itemType, ["raw_material", "subsidiary", "external_product"]),
  ];
  if (tenantId) conditions.push(eq(itemMaster.tenantId, tenantId as number));
  return await db.select({
    id: itemMaster.id,
    materialName: itemMaster.itemName,
    materialCode: itemMaster.itemCode,
    unit: itemMaster.baseUnit,
    tenantId: itemMaster.tenantId,
    isActive: itemMaster.isActive
  }).from(itemMaster).where(and(...conditions)).orderBy(desc(itemMaster.id));
}

/**
 * 원재료 ID로 조회
 */
export async function getMaterialById(id: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const { hMaterials } = await import("../../../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");

  const [material] = await db.select().from(hMaterials).where(eq(hMaterials.id, id));
  return material || null;
}

/**
 * 재고 부족 원재료 조회
 */
export async function getLowStockMaterials(tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const { hMaterials, hInventoryLots } = await import("../../../drizzle/schema.js");
  const { eq, and, sum, sql } = await import("drizzle-orm");

  // 테넌트 필터 적용
  const materialWhere = tenantId
    ? and(eq(hMaterials.isActive, 1), eq(hMaterials.tenantId, tenantId as number))
    : eq(hMaterials.isActive, 1);
  const materials = await db.select().from(hMaterials).where(materialWhere);

  const lowStockMaterials = [];

  for (const material of materials) {
    // 해당 원재료의 총 가용 재고 계산 (테넌트 격리)
    const lotWhere = tenantId
      ? and(eq(hInventoryLots.materialId, material.id), eq(hInventoryLots.tenantId, tenantId as number))
      : eq(hInventoryLots.materialId, material.id);
    const stockResult = await db
      .select({
        totalStock: sum(hInventoryLots.availableQuantity)
      })
      .from(hInventoryLots)
      .where(lotWhere);

    const totalStock = parseFloat(stockResult[0]?.totalStock || "0");
    const safetyLevel = parseFloat(material.safetyStockLevel || "0");

    // 안전 재고 수준 이하인 경우
    if (totalStock < safetyLevel) {
      lowStockMaterials.push({
        ...material,
        currentStock: totalStock,
        shortage: safetyLevel - totalStock
      });
    }
  }

  return lowStockMaterials;
}

/**
 * 재고 부족 알림 발송
 */
export async function notifyLowStock(materialId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const { hMaterials, hInventoryLots } = await import("../../../drizzle/schema.js");
  const { eq, sum } = await import("drizzle-orm");

  // 원재료 정보 조회
  // ★ 2026-10-17 PR-1: 같은 회사 자재·LOT 만 (이전엔 id 로만 조회 → 다른 회사 재고까지 합산)
  const t = requireTenantId(tenantId);
  const { and: andOp } = await import("drizzle-orm");
  const [material] = await db.select().from(hMaterials).where(andOp(eq(hMaterials.id, materialId), eq(hMaterials.tenantId, t as any)));
  if (!material) throw new Error("원재료를 찾을 수 없습니다");

  // 현재 재고 조회
  const stockResult = await db
    .select({
      totalStock: sum(hInventoryLots.availableQuantity)
    })
    .from(hInventoryLots)
    .where(andOp(eq(hInventoryLots.materialId, materialId), eq(hInventoryLots.tenantId, t as any), eq(hInventoryLots.status, "available")));

  const totalStock = parseFloat(stockResult[0]?.totalStock || "0");
  const safetyLevel = parseFloat(material.safetyStockLevel || "0");

  if (totalStock < safetyLevel) {
    // 알림 발송 (notifyOwner 사용)
    const { notifyOwner } = await import("../../_core/notification.js");
    await notifyOwner({
      title: "재고 부족 알림",
      content: `원재료 "${material.materialName}"의 재고가 부족합니다.\n현재 재고: ${totalStock} ${material.unit}\n안전 재고: ${safetyLevel} ${material.unit}\n부족량: ${safetyLevel - totalStock} ${material.unit}`
    });

    return true;
  }

  return false;
}

// ============================================================================
// Material Unit Price
// ============================================================================

// 원재료 단가 업데이트 (이력 자동 저장)
export async function updateMaterialPrice(id: number, unitPrice: number, changedBy?: number, reason?: string, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { hMaterials, hMaterialPriceHistory } = await import("../../../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");

  // 기존 단가 조회
  const [material] = await db
    .select({ unitPrice: hMaterials.unitPrice })
    .from(hMaterials)
    .where(eq(hMaterials.id, id));

  const oldPrice = material?.unitPrice ? parseFloat(material.unitPrice) : null;

  // 단가 업데이트
  await db
    .update(hMaterials)
    .set({ unitPrice: unitPrice.toString() })
    .where(eq(hMaterials.id, id));

  // 이력 저장
  await db.insert(hMaterialPriceHistory).values({
    materialId: id,
    oldPrice: oldPrice?.toString(),
    newPrice: unitPrice.toString(),
    changedBy: changedBy || null,
    reason: reason || null
  });

  return { success: true };
}

// ============================================================================
// Batch Update Expiry Warning Days
// ============================================================================

export async function batchUpdateExpiryWarningDays(expiryWarningDays: number, tenantId?: number): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const result = await db
    .update(hMaterials)
    .set({ expiryWarningDays })
    .where(eq(hMaterials.expiryWarningDays, 7)); // 기본값 7일인 원재료만 업데이트

  return result[0].affectedRows || 0;
}

// ============================================================================
// Delete Inventory Lot
// ============================================================================

// 재고 LOT 삭제 — 같은 회사, 거래 이력 없는 LOT 만 (2026-10-17 PR-1: 이전엔 id 로만 삭제, 집계 미갱신)
export async function deleteInventoryLot(lotId: number, tenantId?: number) {
  const t = requireTenantId(tenantId);
  const { withInventoryTx, recomputeAggregateFromLots } = await import("../../lib/inventory/applyInventoryDelta");
  return withInventoryTx(async (conn) => {
    const [rows]: any = await conn.execute(
      `SELECT id, material_id, product_id, unit FROM h_inventory_lots WHERE id = ? AND tenant_id = ? LIMIT 1 FOR UPDATE`, [lotId, t],
    );
    const lot = (rows as any[])[0];
    if (!lot) throw new Error("재고 LOT를 찾을 수 없습니다");
    const [tx]: any = await conn.execute(`SELECT COUNT(*) AS n FROM h_inventory_transactions WHERE lot_id = ? AND tenant_id = ?`, [lotId, t]);
    if (Number((tx as any[])[0]?.n ?? 0) > 0) throw new Error("거래 이력이 있는 LOT 는 삭제할 수 없습니다. 재고 조정으로 처리하세요.");
    await conn.execute(`DELETE FROM h_inventory_lots WHERE id = ? AND tenant_id = ?`, [lotId, t]);
    const subject = lot.material_id != null ? { materialId: Number(lot.material_id) } : { productId: Number(lot.product_id) };
    if (lot.material_id != null || lot.product_id != null) await recomputeAggregateFromLots(conn, { tenantId: t, subject, unit: lot.unit });
    return { success: true };
  }, "inventory.deleteLot");
}
// ============================================================================
// 원재료 입고/LOT 관리 API
// ============================================================================

/**
 * 원재료 입고 등록 (LOT 생성)
 * ★ 2026-10-17 (재고 쓰기 경로 정리 PR-1): 재고 관문 receiveNewLot 경유 — 회사·현재수량·입고 원장(입고일)·집계를 한 트랜잭션으로.
 *   이전: tenant_id 없이 LOT INSERT, 집계 생략, created_by=0.
 */
export async function receiveMaterial(params: {
  materialId: number;
  quantity: number;
  unit: string;
  receiptDate: string;
  expiryDate?: string;
  lotNumber?: string;
  location?: string;
  tenantId?: number;
  userId?: number;
}) {
  const tenantId = requireTenantId(params.tenantId);
  const qty = parsePositiveQty(params.quantity);
  // LOT 번호 자동 생성 (제공되지 않은 경우)
  const lotNumber = params.lotNumber || `LOT-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
  const { withInventoryTx, receiveNewLot } = await import("../../lib/inventory/applyInventoryDelta");
  const { toInventoryMaterialId } = await import("../../lib/identity/itemIdentityService");
  return withInventoryTx(async (conn) => {
    const materialId = await canonicalMaterialInTenant(conn, params.materialId, tenantId, toInventoryMaterialId);
    return receiveNewLot(conn, {
      tenantId,
      subject: { materialId },
      lotNumber,
      quantity: qty,
      unit: params.unit,
      receiptDate: params.receiptDate,
      expiryDate: params.expiryDate || null,
      location: params.location || null,
      reference: { referenceType: "material_receipt", sourceType: "MANUAL_RECEIPT", actionType: "MANUAL_RECEIPT" },
      notes: null,
      createdBy: params.userId ?? 0,
    });
  }, "inventory.receiveMaterial");
}
/**
 * FEFO 방식 LOT 조회 (유통기한 가까운 순)
 */
export async function getLotsByMaterialFefo(params: {
  materialId: number;
  siteId?: number;
  tenantId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const conditions = [
    eq(hInventoryLots.materialId, params.materialId),
    eq(hInventoryLots.status, "available"),
    gt(hInventoryLots.availableQuantity, "0"),
  ];

  if (params.siteId) {
    // siteId는 hInventory를 통해 조인 필요
  }

  const lots = await db
    .select()
    .from(hInventoryLots)
    .where(and(...conditions))
    .orderBy(asc(hInventoryLots.expiryDate)); // FEFO: 유통기한 가까운 순

  return lots;
}

/**
 * LOT 재고 차감 (배치 투입 시)
 */
export async function deductLotQuantity(params: {
  lotId: number;
  quantity: number;
  batchId: number;
  performedBy: number;
  notes?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  return await db.transaction(async (tx) => {
    // 1. LOT 정보 조회
    const [lot] = await tx
      .select()
      .from(hInventoryLots)
      .where(eq(hInventoryLots.id, params.lotId));

    if (!lot) {
      throw new Error("LOT를 찾을 수 없습니다.");
    }

    const availableQty = parseFloat(lot.availableQuantity);
    if (availableQty < params.quantity) {
      throw new Error(`재고 부족: 가용 수량 ${availableQty}, 요청 수량 ${params.quantity}`);
    }

    // 2. LOT 가용 수량 차감
    const newAvailableQty = availableQty - params.quantity;
    await tx
      .update(hInventoryLots)
      .set({
        availableQuantity: newAvailableQty.toString(),
        status: newAvailableQty === 0 ? "used" : "available"
      })
      .where(eq(hInventoryLots.id, params.lotId));

    // 3. 수불 거래 생성 (사용)
    // PR-§5.2-2: material_id 직접 작성 (LOT 의 material_id 승계)
    await tx.insert(hInventoryTransactions).values({
      lotId: params.lotId,
      materialId: lot.materialId,
      transactionType: "usage",
      quantity: params.quantity.toString(),
      unit: lot.unit,
      // transactionDate 필드 없음 (createdAt 자동 생성)
      referenceType: "batch",
      referenceId: params.batchId,
      createdBy: params.performedBy,
      notes: params.notes || `배치 ${params.batchId}에 투입`
    } as any);

    // 4. hInventory 총 재고 업데이트
    if (lot.materialId) {
      const [inventory] = await tx
        .select()
        .from(hInventory)
        .where(eq(hInventory.materialId, lot.materialId));

      if (inventory) {
        const newTotal = parseFloat(inventory.totalQuantity) - params.quantity;
        const newAvailable = parseFloat(inventory.availableQuantity) - params.quantity;
        await tx
          .update(hInventory)
          .set({
            totalQuantity: newTotal.toString(),
            availableQuantity: newAvailable.toString()
          })
          .where(eq(hInventory.id, inventory.id));
      }
    }

    return { success: true, newAvailableQty };
  });
}

/**
 * 수불 거래 내역 조회
 */
export async function getInventoryTransactions(params: {
  lotId?: number;
  materialId?: number;
  startDate?: string;
  endDate?: string;
  transactionType?: string;
  limit?: number;
  offset?: number;
  tenantId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const conditions = [];

  if (params.lotId) {
    conditions.push(eq(hInventoryTransactions.lotId, params.lotId));
  }

  if (params.startDate) {
    conditions.push(sql`${hInventoryTransactions.createdAt} >= ${params.startDate}`);
  }

  if (params.endDate) {
    conditions.push(sql`${hInventoryTransactions.createdAt} <= ${params.endDate}`);
  }

  if (params.transactionType) {
    conditions.push(eq(hInventoryTransactions.transactionType, params.transactionType as any));
  }

  let query = db
    .select()
    .from(hInventoryTransactions)
    .orderBy(desc(hInventoryTransactions.createdAt));

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  if (params.limit) {
    query = query.limit(params.limit) as any;
  }

  if (params.offset) {
    query = query.offset(params.offset) as any;
  }

  return await query;
}

// ============================================================================
// 재고 현황 대시보드 (Inventory Dashboard)
// ============================================================================

/**
 * 실시간 재고 현황 조회
 */
export async function getInventoryDashboard(tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { hInventoryLots, hMaterials } = await import("../../../drizzle/schema");
  const { sql, eq, and } = await import("drizzle-orm");

  // 1. 전체 재고 통계 (활성 원재료만 - materialStocks와 동일 기준)
  const [stockStats] = await db
    .select({
      totalLots: sql<number>`COUNT(*)`,
      totalValue: sql<number>`SUM(GREATEST(${hInventoryLots.availableQuantity}, 0) * COALESCE(CAST(${hInventoryLots.unitPrice} AS DECIMAL(10,2)), CAST(${hMaterials.unitPrice} AS DECIMAL(10,2)), 0))`,
      availableLots: sql<number>`SUM(CASE WHEN ${hInventoryLots.status} = 'available' THEN 1 ELSE 0 END)`,
      expiringSoonLots: sql<number>`SUM(CASE WHEN ${hInventoryLots.status} = 'available' AND ${hInventoryLots.expiryDate} <= DATE_ADD(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END)`
    })
    .from(hInventoryLots)
    .innerJoin(hMaterials, eq(hInventoryLots.materialId, hMaterials.id))
    .where(and(
      eq(hMaterials.isActive, 1),
      tenantId ? eq(hMaterials.tenantId, tenantId as number) : undefined,
      tenantId ? eq(hInventoryLots.tenantId, tenantId as number) : undefined
    ));

  // 2. 원재료별 재고 현황 (hMaterials 기준 LEFT JOIN → 재고 0인 원재료도 표시)
  const materialStocks = await db
    .select({
      materialId: hMaterials.id,
      materialName: hMaterials.materialName,
      materialCode: hMaterials.materialCode,
      totalQuantity: sql<number>`ROUND(GREATEST(COALESCE(SUM(CASE WHEN ${hInventoryLots.status} = 'available' THEN GREATEST(${hInventoryLots.availableQuantity}, 0) ELSE 0 END), 0), 0), 1)`,
      lotCount: sql<number>`COALESCE(SUM(CASE WHEN ${hInventoryLots.status} = 'available' THEN 1 ELSE 0 END), 0)`,
      unit: hMaterials.unit,
      masterUnitPrice: hMaterials.unitPrice,
      // LOT 가중평균 단가: SUM(가용수량 × LOT단가) / SUM(가용수량) - 재고 있는 LOT만
      lotWeightedAvgPrice: sql<number>`CASE
        WHEN COALESCE(SUM(CASE WHEN ${hInventoryLots.status} = 'available' AND ${hInventoryLots.unitPrice} IS NOT NULL THEN ${hInventoryLots.availableQuantity} ELSE 0 END), 0) > 0
        THEN SUM(CASE WHEN ${hInventoryLots.status} = 'available' AND ${hInventoryLots.unitPrice} IS NOT NULL THEN ${hInventoryLots.availableQuantity} * ${hInventoryLots.unitPrice} ELSE 0 END)
           / SUM(CASE WHEN ${hInventoryLots.status} = 'available' AND ${hInventoryLots.unitPrice} IS NOT NULL THEN ${hInventoryLots.availableQuantity} ELSE 0 END)
        ELSE NULL
      END`,
      safetyStockLevel: hMaterials.safetyStockLevel,
      expiryWarningDays: hMaterials.expiryWarningDays
    })
    .from(hMaterials)
    .leftJoin(hInventoryLots, and(
      eq(hMaterials.id, hInventoryLots.materialId),
      tenantId ? eq(hInventoryLots.tenantId, tenantId as number) : undefined
    ))
    .where(and(
      eq(hMaterials.isActive, 1),
      tenantId ? eq(hMaterials.tenantId, tenantId as number) : undefined
    ))
    .groupBy(hMaterials.id, hMaterials.materialName, hMaterials.materialCode, hMaterials.unit, hMaterials.unitPrice, hMaterials.safetyStockLevel, hMaterials.expiryWarningDays);

  // 3. 재고 부족 원재료 (safetyStockLevel 이하)
  const lowStockMaterials = materialStocks.filter((m) => {
    const safetyStock = parseFloat(m.safetyStockLevel || "0");
    return safetyStock > 0 && m.totalQuantity < safetyStock;
  });

  // 4. 유통기한 임박 LOT (expiryWarningDays 이내)
  const expiringLots = await db
    .select({
      lot: hInventoryLots,
      material: hMaterials
    })
    .from(hInventoryLots)
    .innerJoin(hMaterials, eq(hInventoryLots.materialId, hMaterials.id))
    .where(and(
      eq(hInventoryLots.status, "available"),
      eq(hMaterials.isActive, 1),
      sql`${hInventoryLots.expiryDate} IS NOT NULL`,
      sql`${hInventoryLots.expiryDate} <= DATE_ADD(NOW(), INTERVAL COALESCE(${hMaterials.expiryWarningDays}, 7) DAY)`,
      tenantId ? eq(hInventoryLots.tenantId, tenantId as number) : undefined,
      tenantId ? eq(hMaterials.tenantId, tenantId as number) : undefined
    ))
    .orderBy(hInventoryLots.expiryDate);

  return {
    stats: {
      totalLots: Number(stockStats.totalLots) || 0,
      totalValue: parseFloat(stockStats.totalValue?.toString() || "0"),
      availableLots: Number(stockStats.availableLots) || 0,
      expiringSoonLots: Number(stockStats.expiringSoonLots) || 0,
      lowStockCount: lowStockMaterials.length
    },
    materialStocks: materialStocks.map((m) => {
      // 단가 우선순위: LOT 가중평균 단가 → 마스터 단가
      const lotAvg = m.lotWeightedAvgPrice ? parseFloat(String(m.lotWeightedAvgPrice)) : null;
      const masterPrice = m.masterUnitPrice ? parseFloat(String(m.masterUnitPrice)) : 0;
      const effectivePrice = lotAvg ?? masterPrice;
      return {
        ...m,
        unitPrice: effectivePrice > 0 ? effectivePrice.toFixed(2) : (m.masterUnitPrice || "0"),
        totalValue: m.totalQuantity * effectivePrice,
        priceSource: lotAvg !== null ? "lot" : "master",
        isLowStock: parseFloat(m.safetyStockLevel || "0") > 0 && m.totalQuantity < parseFloat(m.safetyStockLevel || "0")
      };
    }),
    lowStockMaterials,
    expiringLots: expiringLots.map((row) => ({
      ...row.lot,
      materialName: row.material?.materialName || "알 수 없음",
      materialCode: row.material?.materialCode || "",
      expiryWarningDays: row.material?.expiryWarningDays || 7,
      daysUntilExpiry: row.lot.expiryDate
        ? Math.ceil((new Date(row.lot.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : null
    }))
  };
}

/**
 * 재고 이동 추이 (일별)
 */
export async function getInventoryTrend(params: {
  startDate?: string;
  endDate?: string;
  siteId?: number;
  materialId?: number;
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const endDate = params.endDate || todayKST();
  const startDate = params.startDate || toKSTDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

  const { hInventoryTransactions } = await import("../../../drizzle/schema");
  const { sql, and, eq } = await import("drizzle-orm");

  // KST 변환: created_at 은 UTC timestamp 라 GROUP BY 시 -1일 어긋남.
  //   DATE(CONVERT_TZ(..., '+00:00', '+09:00')) 로 KST 자정 기준 그룹핑.
  //   transaction_date (date 타입) 는 자정이라 영향 무시할 수 있지만 일관성 위해 함께 적용.
  const dateExpr = sql`DATE(CONVERT_TZ(COALESCE(${hInventoryTransactions.transactionDate}, ${hInventoryTransactions.createdAt}), '+00:00', '+09:00'))`;

  // 2026-04-27 (§5.2 후속): 기존엔 LEFT JOIN h_inventory_lots 후 lots.material_id IS NOT NULL
  // 로 원재료 트랜잭션을 식별했으나, lot_id=0 (재고미등록 자동출고) 트랜잭션이 JOIN 매칭
  // 실패로 추이에서 제외되는 문제 발생.
  // §5.2-2 (PR #89) 이후 t.material_id 가 직접 채워지므로 JOIN 의존성 제거 가능.
  // product 트랜잭션은 t.material_id IS NULL 이라 자연 제외됨.
  const conditions = [
    sql`${dateExpr} >= ${startDate}`,
    sql`${dateExpr} <= ${endDate}`,
    eq(hInventoryTransactions.tenantId, params.tenantId),
    // 원재료 트랜잭션만 — material_id 직접 매칭 (canonical h_materials.id)
    sql`${hInventoryTransactions.materialId} IS NOT NULL`,
    // SALE 매출 차감 명시 제외 (PR-K 호환)
    sql`(${hInventoryTransactions.referenceType} IS NULL OR ${hInventoryTransactions.referenceType} != 'SALE')`,
  ];

  if (params.materialId) {
    conditions.push(eq(hInventoryTransactions.materialId, params.materialId));
  }

  const trend = await db
    .select({
      date: sql<string>`${dateExpr}`,
      receiptQuantity: sql<number>`SUM(CASE WHEN ${hInventoryTransactions.transactionType} = 'receipt' THEN ABS(${hInventoryTransactions.quantity}) ELSE 0 END)`,
      usageQuantity: sql<number>`SUM(CASE WHEN ${hInventoryTransactions.transactionType} = 'usage' THEN ABS(${hInventoryTransactions.quantity}) ELSE 0 END)`,
      adjustmentQuantity: sql<number>`SUM(CASE WHEN ${hInventoryTransactions.transactionType} = 'adjustment' THEN ${hInventoryTransactions.quantity} ELSE 0 END)`,
      transactionCount: sql<number>`COUNT(*)`
    })
    .from(hInventoryTransactions)
    .where(and(...conditions))
    .groupBy(dateExpr)
    .orderBy(dateExpr);

  return trend.map((row) => {
    const receipt = Number(row.receiptQuantity) || 0;
    const usage = Number(row.usageQuantity) || 0;
    const adjustment = Number(row.adjustmentQuantity) || 0;
    return {
      date: (row as any).date instanceof Date ? (row as any).date.toISOString().slice(0, 10) : String((row as any).date || ""),
      receiptQuantity: receipt,
      usageQuantity: usage,
      adjustmentQuantity: adjustment,
      netChange: receipt - usage + adjustment,
      transactionCount: Number(row.transactionCount) || 0
    };
  });
}

/**
 * 원재료별 재고 회전율 분석
 */
export async function getInventoryTurnoverAnalysis(params: {
  startDate?: string;
  endDate?: string;
  siteId?: number;
  materialId?: number;
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 기본값 설정 (최근 30일)
  const endDate = params.endDate || todayKST();
  const startDate = params.startDate || toKSTDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

  const { hInventoryTransactions, hMaterials, hInventoryLots } = await import("../../../drizzle/schema");
  const { sql, and, eq } = await import("drizzle-orm");

  // 1. 기간 내 사용량 조회 - tenant_id + KST 변환 + ABS
  // KST 변환: created_at(UTC timestamp) 가 UTC 자정 부근일 때 -1일 어긋남 방지 (PR-G)
  const dateExpr = sql`DATE(CONVERT_TZ(COALESCE(${hInventoryTransactions.transactionDate}, ${hInventoryTransactions.createdAt}), '+00:00', '+09:00'))`;
  const usageData = await db
    .select({
      materialId: hInventoryLots.materialId,
      totalUsage: sql<number>`SUM(ABS(${hInventoryTransactions.quantity}))`
    })
    .from(hInventoryTransactions)
    .leftJoin(hInventoryLots, eq(hInventoryTransactions.lotId, hInventoryLots.id))
    .where(and(
      eq(hInventoryTransactions.transactionType, "usage"),
      eq(hInventoryTransactions.tenantId, params.tenantId),
      sql`${dateExpr} >= ${startDate}`,
      sql`${dateExpr} <= ${endDate}`,
      // 진짜 원재료 LOT 만 (PR-H): dirty data (product_id+material_id 동시 채워진 LOT) 제외
      sql`${hInventoryLots.materialId} IS NOT NULL`,
      sql`${hInventoryLots.productId} IS NULL`,
      // PR-K: SALE 매출 차감 명시적 제외 (lot 데이터 무관, backfill tx 도 차단)
      sql`(${hInventoryTransactions.referenceType} IS NULL OR ${hInventoryTransactions.referenceType} != 'SALE')`,
    ))
    .groupBy(hInventoryLots.materialId);

  // 2. 현재 재고 조회 - tenant_id 직접 필터
  const currentStock = await db
    .select({
      materialId: hInventoryLots.materialId,
      totalStock: sql<number>`SUM(${hInventoryLots.availableQuantity})`
    })
    .from(hInventoryLots)
    .where(and(
      eq(hInventoryLots.status, "available"),
      eq(hInventoryLots.tenantId, params.tenantId),
    ))
    .groupBy(hInventoryLots.materialId);

  // 3. 원재료 정보와 결합 (tenantId 필터 포함)
  const materials = await db.select().from(hMaterials).where(
    params.tenantId ? eq(hMaterials.tenantId, params.tenantId) : undefined
  );

  // 4. 회전율 계산
  const turnoverRates = materials.map((material) => {
    const usage = usageData.find((u) => u.materialId === material.id);
    const stock = currentStock.find((s) => s.materialId === material.id);

    const totalUsage = usage?.totalUsage || 0;
    const totalStock = stock?.totalStock || 0;

    // 회전율 = 사용량 / 평균 재고 (간단히 현재 재고로 근사)
    const turnoverRate = totalStock > 0 ? totalUsage / totalStock : 0;

    // 재고 일수 = 재고 / (일평균 사용량)
    const daysDiff = Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24));
    const avgDailyUsage = daysDiff > 0 ? totalUsage / daysDiff : 0;
    const daysOfStock = avgDailyUsage > 0 ? totalStock / avgDailyUsage : 0;

    return {
      materialId: material.id,
      materialName: material.materialName,
      materialCode: material.materialCode,
      totalUsage,
      totalStock,
      turnoverRate: turnoverRate.toFixed(2),
      daysOfStock: Math.ceil(daysOfStock),
      avgDailyUsage: avgDailyUsage.toFixed(2)
    };
  });

  return turnoverRates.sort((a, b) => parseFloat(b.turnoverRate) - parseFloat(a.turnoverRate));
}

// ============================================================================
// Release Inventory Stock
// ============================================================================


// ============================================================================
// Inventory Receipt History
// ============================================================================

/**
 * 입고 내역 조회
 */
export async function getInventoryReceiptHistory() {
  const db = await getDb();

  const { hInventoryLots, hMaterials } = await import("../../../drizzle/schema/schema_main");
  const { desc, eq } = await import("drizzle-orm");

  const receipts = await db
    .select({
      id: hInventoryLots.id,
      lotNumber: hInventoryLots.lotNumber,
      materialId: hInventoryLots.materialId,
      materialName: hMaterials.materialName,
      quantity: hInventoryLots.quantity,
      unit: hInventoryLots.unit,
      receiptDate: hInventoryLots.receiptDate,
      expiryDate: hInventoryLots.expiryDate
    })
    .from(hInventoryLots)
    .leftJoin(hMaterials, eq(hInventoryLots.materialId, hMaterials.id))
    .orderBy(desc(hInventoryLots.receiptDate))
    .limit(100);

  return receipts;
}

// ============================================================================
// Adjust Inventory Stock
// ============================================================================

// releaseInventoryStock / adjustInventoryStock 는 2026-10-12 제거 (v3 5단계 5차).
//   호출자 0, 비표준 transaction_type 으로 LOT+원장만 쓰고 집계 미반영이던 경로.
//   출고·조정은 server/lib/inventory/{applyInventoryDelta,stockAdjustment}.ts 관문으로.

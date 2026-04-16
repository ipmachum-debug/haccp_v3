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
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const { hInventoryLots, hInventoryTransactions } = await import("../../../drizzle/schema.js");

  // 1. 재고 LOT 생성
  const [result] = await db.insert(hInventoryLots).values({
    materialId: data.materialId,
    lotNumber: data.lotNumber,
    quantity: data.quantity,
    availableQuantity: data.quantity,
    unit: data.unit,
    expiryDate: data.expiryDate || null,
    receiptDate: data.receiptDate || new Date(),
    supplierName: data.supplierId ? `Supplier ${data.supplierId}` : null,
    status: "available"
  } as any);

  const lotId = result.insertId;

  // 2. 재고 거래 내역 생성 (receipt)
  await db.insert(hInventoryTransactions).values({
    lotId: Number(lotId),
    transactionType: "receipt",
    quantity: data.quantity,
    unit: data.unit,
    referenceType: "supplier",
    referenceId: data.supplierId || null,
    notes: `재고 입고 - LOT ${data.lotNumber}`,
    createdBy: data.userId
  } as any);

  return {
    success: true,
    message: "재고가 입고되었습니다",
    lotId
  };
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
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const { hInventoryLots, hInventoryTransactions, hBatchInputs } = await import("../../../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");

  // 1. 재고 LOT 조회
  const [lot] = await db.select().from(hInventoryLots).where(eq(hInventoryLots.id, data.lotId));
  if (!lot) throw new Error("재고 LOT를 찾을 수 없습니다");

  // 2. 가용 수량 확인
  const requestedQty = parseFloat(data.quantity);
  const availableQty = parseFloat(lot.availableQuantity);
  if (requestedQty > availableQty) {
    throw new Error(`재고 부족: 요청 ${requestedQty}${data.unit}, 가용 ${availableQty}${data.unit}`);
  }

  // 3. 재고 차감
  const newAvailableQty = (availableQty - requestedQty).toFixed(3);
  await db.update(hInventoryLots)
    .set({ availableQuantity: newAvailableQty })
    .where(eq(hInventoryLots.id, data.lotId));

  // 4. 재고 거래 내역 생성
  await db.insert(hInventoryTransactions).values({
    lotId: data.lotId,
    transactionType: "usage",
    quantity: data.quantity,
    unit: data.unit,
    referenceType: "batch",
    referenceId: data.batchId,
    notes: `배치 ${data.batchId}에 원재료 투입`,
    createdBy: data.userId
  } as any);

  // 5. 배치 원재료 투입 기록 생성
  await db.insert(hBatchInputs).values({
    batchId: data.batchId,
    materialId: data.materialId,
    lotId: data.lotId,
    plannedQuantity: data.quantity,
    actualQuantity: data.quantity,
    unit: data.unit,
    inputTime: new Date(),
    inputBy: data.userId
  });

  return {
    success: true,
    message: "원재료가 투입되었습니다",
    remainingQuantity: newAvailableQty
  };
}

/**
 * 배치별 원재료 투입 내역 조회
 */
export async function updateMaterialInput(
  inputId: number,
  data: {
    quantity?: string;
    lotId?: number;
  },
  tenantId?: number
) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { hBatchInputs } = await import("../../../drizzle/schema");

  const updateData: any = {};
  if (data.quantity !== undefined) updateData.quantity = data.quantity;
  if (data.lotId !== undefined) updateData.lotId = data.lotId;

  await db
    .update(hBatchInputs)
    .set(updateData)
    .where(eq(hBatchInputs.id, inputId));
}

export async function deleteMaterialInput(inputId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { hBatchInputs, hInventoryLots } = await import("../../../drizzle/schema");
  const { eq: eqOp } = await import("drizzle-orm");

  // 1. 투입 내역 조회
  const input = await db
    .select()
    .from(hBatchInputs)
    .where(eqOp(hBatchInputs.id, inputId))
    .limit(1);

  if (input.length === 0) {
    throw new Error("투입 내역을 찾을 수 없습니다");
  }

  const inputData = input[0];

  // 2. 재고 복구 (투입한 수량을 다시 돌려줌)
  const [lot] = await db.select().from(hInventoryLots).where(eqOp(hInventoryLots.id, Number(inputData.lotId)));
  if (lot) {
    const currentQty = parseFloat(lot.availableQuantity);
    const returnQty = parseFloat(inputData.actualQuantity || inputData.plannedQuantity);
    const newQty = (currentQty + returnQty).toFixed(3);
    await db.update(hInventoryLots)
      .set({ availableQuantity: newQty })
      .where(eqOp(hInventoryLots.id, Number(inputData.lotId)));
  }

  // 3. 재고 거래 내역 삭제 (해당 투입과 관련된 거래만 삭제)
  // 주의: 정확한 매칭을 위해서는 hInventoryTransactions에 inputId 참조가 필요하지만
  // 현재 스키마에는 없으므로 재고 복구만 수행

  // 4. 투입 내역 삭제
  await db
    .delete(hBatchInputs)
    .where(eqOp(hBatchInputs.id, inputId));
}

export async function getBatchMaterialInputs(batchId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const { hBatchInputs } = await import("../../../drizzle/schema.js");
  const { itemMaster } = await import("../../../drizzle/schema/schema_dual_unit.js");
  const { eq, sql } = await import("drizzle-orm");

  return await db.select({
    id: hBatchInputs.id,
    batchId: hBatchInputs.batchId,
    materialId: hBatchInputs.materialId,
    materialName: sql`COALESCE(${itemMaster.itemName}, CONCAT('원재료 #', ${hBatchInputs.materialId}))`.as("materialName"),
    materialCode: itemMaster.itemCode,
    lotId: hBatchInputs.lotId,
    plannedQuantity: hBatchInputs.plannedQuantity,
    actualQuantity: hBatchInputs.actualQuantity,
    unit: hBatchInputs.unit,
    inputTime: hBatchInputs.inputTime,
    inputBy: hBatchInputs.inputBy,
    createdAt: hBatchInputs.createdAt
  })
  .from(hBatchInputs)
  .leftJoin(itemMaster, eq(hBatchInputs.materialId, itemMaster.id))
  .where(eq(hBatchInputs.batchId, batchId));
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
 * 레시피 기반 원재료 목록 조회
 */
export async function getMaterialsByRecipeId(recipeId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const { hRecipeLines, hMaterials } = await import("../../../drizzle/schema.js");
  const { eq, isNotNull } = await import("drizzle-orm");

  // 레시피 라인 정보 조회 (원재료만)
  const recipeDetails = await db
    .select()
    .from(hRecipeLines)
    .where(
      eq(hRecipeLines.recipeId, recipeId)
    );

  // 원재료 정보와 함께 반환
  const materialsWithQuantity = [];
  for (const detail of recipeDetails) {
    // materialId가 null이 아닌 경우만 조회
    if (detail.materialId) {
      const [material] = await db
        .select()
        .from(hMaterials)
        .where(eq(hMaterials.id, detail.materialId));

      if (material) {
        materialsWithQuantity.push({
          ...material,
          requiredQuantity: detail.quantity,
          requiredUnit: detail.unit
        });
      }
    }
  }

  return materialsWithQuantity;
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
  const [material] = await db.select().from(hMaterials).where(eq(hMaterials.id, materialId));
  if (!material) throw new Error("원재료를 찾을 수 없습니다");

  // 현재 재고 조회
  const stockResult = await db
    .select({
      totalStock: sum(hInventoryLots.availableQuantity)
    })
    .from(hInventoryLots)
    .where(eq(hInventoryLots.materialId, materialId));

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

// 재고 LOT 삭제
export async function deleteInventoryLot(lotId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  await db.delete(hInventoryLots).where(eq(hInventoryLots.id, lotId));
  return { success: true };
}

// ============================================================================
// 원재료 입고/LOT 관리 API
// ============================================================================

/**
 * 원재료 입고 등록 (LOT 생성)
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
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // LOT 번호 자동 생성 (제공되지 않은 경우)
  const lotNumber = params.lotNumber || `LOT-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

  // 트랜잭션 시작
  return await db.transaction(async (tx) => {
    // 1. hInventoryLots에 LOT 생성
    const [lot] = await tx.insert(hInventoryLots).values({
      materialId: params.materialId,
      productId: null,
      lotNumber,
      quantity: params.quantity.toString(),
      availableQuantity: params.quantity.toString(),
      unit: params.unit,
      receiptDate: params.receiptDate,
      expiryDate: params.expiryDate || null,
      supplierName: "", // supplierId로부터 조회 필요
      location: params.location || "",
      status: "available"
    } as any);

    const lotId = lot.insertId;

    // 2. hInventoryTransactions에 입고 거래 생성
    await tx.insert(hInventoryTransactions).values({
      lotId,
      transactionType: "receipt",
      quantity: params.quantity.toString(),
      unit: params.unit,
      // transactionDate 필드 없음 (createdAt 자동 생성)
      referenceType: "material_receipt",
      referenceId: null,
      createdBy: 0, // 시스템 자동 입고
      notes: ""
    } as any);

    // 3. hMaterialReceipts 대신 hInventoryLots의 notes에 입고 정보 기록
    // (hMaterialReceipts 테이블이 스키마에 없으므로 생략)

    // 4. hInventory 총 재고 업데이트 (생략 - hInventoryLots만 사용)

    return { lotId, lotNumber };
  });
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
    await tx.insert(hInventoryTransactions).values({
      lotId: params.lotId,
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

  const { hInventoryTransactions, hInventoryLots } = await import("../../../drizzle/schema");
  const { sql, and, eq } = await import("drizzle-orm");

  const conditions = [
    sql`DATE(COALESCE(${hInventoryTransactions.transactionDate}, ${hInventoryTransactions.createdAt})) >= ${startDate}`,
    sql`DATE(COALESCE(${hInventoryTransactions.transactionDate}, ${hInventoryTransactions.createdAt})) <= ${endDate}`,
    eq(hInventoryTransactions.tenantId, params.tenantId),
  ];

  if (params.materialId) {
    conditions.push(eq(hInventoryLots.materialId, params.materialId));
  }

  const trend = await db
    .select({
      date: sql<string>`DATE(COALESCE(${hInventoryTransactions.transactionDate}, ${hInventoryTransactions.createdAt}))`,
      receiptQuantity: sql<number>`SUM(CASE WHEN ${hInventoryTransactions.transactionType} = 'receipt' THEN ABS(${hInventoryTransactions.quantity}) ELSE 0 END)`,
      usageQuantity: sql<number>`SUM(CASE WHEN ${hInventoryTransactions.transactionType} = 'usage' THEN ABS(${hInventoryTransactions.quantity}) ELSE 0 END)`,
      adjustmentQuantity: sql<number>`SUM(CASE WHEN ${hInventoryTransactions.transactionType} = 'adjustment' THEN ${hInventoryTransactions.quantity} ELSE 0 END)`,
      transactionCount: sql<number>`COUNT(*)`
    })
    .from(hInventoryTransactions)
    .leftJoin(hInventoryLots, eq(hInventoryTransactions.lotId, hInventoryLots.id))
    .where(and(...conditions))
    .groupBy(sql`DATE(COALESCE(${hInventoryTransactions.transactionDate}, ${hInventoryTransactions.createdAt}))`)
    .orderBy(sql`DATE(COALESCE(${hInventoryTransactions.transactionDate}, ${hInventoryTransactions.createdAt}))`);

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

  // 1. 기간 내 사용량 조회 - tenant_id 직접 필터 + transaction_date 기준 + ABS
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
      sql`DATE(COALESCE(${hInventoryTransactions.transactionDate}, ${hInventoryTransactions.createdAt})) >= ${startDate}`,
      sql`DATE(COALESCE(${hInventoryTransactions.transactionDate}, ${hInventoryTransactions.createdAt})) <= ${endDate}`,
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

export async function releaseInventoryStock(params: {
  lotId: number;
  quantity: number;
  reason?: string;
  userId: number;
}) {
  const db = await getDb();

  const { hInventoryLots, hInventoryTransactions } = await import("../../../drizzle/schema/schema_main");
  const { eq } = await import("drizzle-orm");

  // LOT 조회
  const lot = await db.select().from(hInventoryLots).where(eq(hInventoryLots.id, params.lotId)).limit(1);
  if (!lot || lot.length === 0) {
    throw new Error("LOT를 찾을 수 없습니다");
  }

  const currentLot = lot[0];
  const availableQty = parseFloat(currentLot.availableQuantity);

  if (availableQty < params.quantity) {
    throw new Error(`가용 수량이 부족합니다 (가용: ${availableQty}, 요청: ${params.quantity})`);
  }

  // 가용 수량 감소
  await db.update(hInventoryLots)
    .set({
      availableQuantity: (availableQty - params.quantity).toString()
    })
    .where(eq(hInventoryLots.id, params.lotId));

  // 거래 기록 생성
  await db.insert(hInventoryTransactions).values({
    lotId: params.lotId,
    materialId: currentLot.materialId,
    transactionType: "release",
    quantity: params.quantity.toString(),
    unit: currentLot.unit,
    transactionDate: new Date(),
    reason: params.reason || "재고 출고",
    userId: params.userId
  } as any);

  return { success: true, message: "재고 출고가 완료되었습니다" };
}

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

/**
 * 재고 조정
 */
export async function adjustInventoryStock(params: {
  lotId: number;
  quantityChange: number;
  reason: string;
  userId: number;
}) {
  const db = await getDb();

  const { hInventoryLots, hInventoryTransactions } = await import("../../../drizzle/schema/schema_main");
  const { eq } = await import("drizzle-orm");

  // LOT 조회
  const lot = await db.select().from(hInventoryLots).where(eq(hInventoryLots.id, params.lotId)).limit(1);
  if (!lot || lot.length === 0) {
    throw new Error("LOT를 찾을 수 없습니다");
  }

  const currentLot = lot[0];
  const currentQty = parseFloat(currentLot.quantity);
  const currentAvailableQty = parseFloat(currentLot.availableQuantity);
  const newQty = currentQty + params.quantityChange;
  const newAvailableQty = currentAvailableQty + params.quantityChange;

  if (newQty < 0 || newAvailableQty < 0) {
    throw new Error("조정 후 수량이 음수가 될 수 없습니다");
  }

  // 수량 조정
  await db.update(hInventoryLots)
    .set({
      quantity: newQty.toString(),
      availableQuantity: newAvailableQty.toString()
    })
    .where(eq(hInventoryLots.id, params.lotId));

  // 거래 기록 생성
  await db.insert(hInventoryTransactions).values({
    lotId: params.lotId,
    materialId: currentLot.materialId,
    transactionType: params.quantityChange > 0 ? "adjustment_increase" : "adjustment_decrease",
    quantity: Math.abs(params.quantityChange).toString(),
    unit: currentLot.unit,
    transactionDate: new Date(),
    reason: params.reason,
    userId: params.userId
  } as any);

  return { success: true, message: "재고 조정이 완료되었습니다" };
}

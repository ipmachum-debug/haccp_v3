/**
 * 입고 관리 데이터베이스 로직
 * h_inventory_lots와 h_inventory_transactions 테이블을 활용한 입고 관리
 */

import { getDb } from "../db";
import { hInventoryLots, hInventoryTransactions, hMaterials, hInventory } from "../../drizzle/schema";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";

/**
 * h_inventory 테이블 재고량 업데이트
 * 입고/출고 시 총 재고량과 가용 재고량 증가/감소
 */
async function updateInventoryQuantity(params: {
  db: any;
  materialId: number;
  quantityChange: number;
  unit: string;
  tenantId?: number;
}) {
  // 기존 재고 레코드 조회
  const conditions: any[] = [eq(hInventory.materialId, params.materialId)];
  if (params.tenantId) conditions.push(eq(hInventory.tenantId, params.tenantId));
  const [existingInventory] = await params.db
    .select()
    .from(hInventory)
    .where(and(...conditions));
  if (existingInventory) {
    // 기존 레코드 업데이트 (수량 증가)
    const newTotalQuantity = parseFloat(existingInventory.totalQuantity) + params.quantityChange;
    const newAvailableQuantity = parseFloat(existingInventory.availableQuantity) + params.quantityChange;

    await params.db
      .update(hInventory)
      .set({
        totalQuantity: newTotalQuantity.toString(),
        availableQuantity: newAvailableQuantity.toString(),
        lastUpdated: new Date()
      })
      .where(eq(hInventory.id, existingInventory.id));
  } else {
    // 신규 레코드 생성
    await params.db.insert(hInventory).values({
      tenantId: params.tenantId || 1,
      materialId: params.materialId,
      totalQuantity: params.quantityChange.toString(),
      availableQuantity: params.quantityChange.toString(),
      reservedQuantity: "0.000",
      unit: params.unit
    } as any);
  }
}

/**
 * LOT 번호 자동 생성
 * 형식: MAT-원재료코드-YYYYMMDD-순번
 */
export async function generateLotNumber(materialCode: string, tenantId?: number): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, ""); // YYYYMMDD

  // 오늘 날짜로 생성된 LOT 번호 중 가장 큰 순번 조회
  const prefix = `MAT-${materialCode}-${dateStr}`;
  const existingLots = await db
    .select()
    .from(hInventoryLots)
    .where(sql`${hInventoryLots.lotNumber} LIKE ${prefix + "%"}`)
    .orderBy(desc(hInventoryLots.lotNumber));

  let nextSeq = 1;
  if (existingLots.length > 0) {
    const lastLot = existingLots[0].lotNumber;
    const lastSeq = parseInt(lastLot.split("-").pop() || "0", 10);
    nextSeq = lastSeq + 1;
  }

  return `${prefix}-${String(nextSeq).padStart(3, "0")}`;
}

/**
 * 입고 등록
 * 새로운 LOT를 생성하고 재고 거래 내역에 기록
 */
export async function createInboundReceipt(params: {
  materialId: number;
  quantity: number;
  unit: string;
  unitPrice?: number;
  supplierName?: string;
  manufacturerName?: string;
  expiryDate?: Date;
  receiptDate?: Date;
  location?: string;
  notes?: string;
  createdBy: number;
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 원재료 정보 조회
  const [material] = await db
    .select()
    .from(hMaterials)
    .where(and(
      ...(tenantId ? [eq(hMaterials.tenantId, tenantId)] : []),
      eq(hMaterials.id, params.materialId)
    ));
  if (!material) {
    throw new Error(`Material not found: ${params.materialId}`);
  }

  // LOT 번호 자동 생성
  const lotNumber = await generateLotNumber(material.materialCode);

  // 입고일 기본값 설정
  const receiptDate = params.receiptDate || new Date();

  // 유통기한 자동 계산 (입고일 + shelfLifeDays)
  let expiryDate = params.expiryDate;
  if (!expiryDate && material.shelfLifeDays) {
    expiryDate = new Date(receiptDate);
    expiryDate.setDate(expiryDate.getDate() + material.shelfLifeDays);
  }

  // LOT 생성
  const insertResult = await db.insert(hInventoryLots).values({
    lotNumber,
    materialId: params.materialId,
    quantity: params.quantity.toString(),
    availableQuantity: params.quantity.toString(),
    unit: params.unit,
    unitPrice: params.unitPrice?.toString() || null,
    receiptDate: receiptDate.toISOString().slice(0, 10),
    expiryDate: expiryDate ? expiryDate.toISOString().slice(0, 10) : null,
    supplierName: params.supplierName || null,
    manufacturerName: params.manufacturerName || null,
    location: params.location || null,
    status: "available"
  } as any);

  const lotId = (insertResult as any).insertId;

  // 재고 거래 내역 기록
  await db.insert(hInventoryTransactions).values({
    lotId: lotId,
    transactionType: "receipt",
    quantity: params.quantity.toString(),
    unit: params.unit,
    referenceType: "inbound_receipt",
    referenceId: lotId,
    notes: params.notes || null,
    createdBy: params.createdBy
  });

  // h_inventory 테이블 업데이트 (총 재고량 증가)
  await updateInventoryQuantity({
    db,
    materialId: params.materialId,
    quantityChange: params.quantity,
    unit: params.unit,
    tenantId
  });

  return {
    lotId,
    lotNumber,
    materialName: material.materialName,
    quantity: params.quantity,
    unit: params.unit,
    receiptDate,
    expiryDate
  };
}

/**
 * 입고 이력 조회
 * 최근 입고 내역을 조회 (h_inventory_transactions의 receipt 타입)
 */
export async function getInboundHistory(params: {
  limit?: number;
  materialId?: number;
  supplierId?: number;
  startDate?: Date;
  endDate?: Date;
  search?: string;
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const limit = params.limit || 50;

  // 입고 거래 내역 조회 (receipt 타입만)
  // 필터 조건 구성
  const conditions: any[] = [eq(hInventoryTransactions.transactionType, "receipt")];
  // tenantId 필터: hInventoryTransactions에 tenant_id 없음 → hMaterials.tenantId 사용
  if (tenantId) {
    conditions.push(eq(hMaterials.tenantId, tenantId));
  }
  
  if (params.materialId) {
    conditions.push(eq(hInventoryLots.materialId, params.materialId));
  }
  
  if (params.startDate) {
    conditions.push(gte(hInventoryTransactions.createdAt, params.startDate));
  }
  
  if (params.endDate) {
    conditions.push(lte(hInventoryTransactions.createdAt, params.endDate));
  }
  
  // supplierId 필터는 supplierName으로 대체 (클라이언트 측에서 처리)

  const query = db
    .select({
      id: hInventoryTransactions.id,
      lotId: hInventoryTransactions.lotId,
      quantity: hInventoryTransactions.quantity,
      unit: hInventoryTransactions.unit,
      notes: hInventoryTransactions.notes,
      createdAt: hInventoryTransactions.createdAt,
      lotNumber: hInventoryLots.lotNumber,
      materialId: hInventoryLots.materialId,
      expiryDate: hInventoryLots.expiryDate,
      supplierName: hInventoryLots.supplierName,
      manufacturerName: hInventoryLots.manufacturerName,
      location: hInventoryLots.location,
      materialName: hMaterials.materialName,
      materialCode: hMaterials.materialCode
    })
    .from(hInventoryTransactions)
    .innerJoin(hInventoryLots, eq(hInventoryTransactions.lotId, hInventoryLots.id))
    .innerJoin(hMaterials, eq(hInventoryLots.materialId, hMaterials.id))
    .where(conditions.length > 1 ? and(...conditions) : conditions[0])
    .orderBy(desc(hInventoryTransactions.createdAt))
    .limit(limit);

  let results = await query;

  // 검색어 필터 (클라이언트 측에서 처리)
  if (params.search) {
    const searchLower = params.search.toLowerCase();
    results = results.filter(row => 
      row.lotNumber?.toLowerCase().includes(searchLower) ||
      row.materialName?.toLowerCase().includes(searchLower) ||
      row.materialCode?.toLowerCase().includes(searchLower) ||
      row.supplierName?.toLowerCase().includes(searchLower)
    );
  }

  return results.map((row) => ({
    id: row.id,
    lotId: row.lotId,
    lotNumber: row.lotNumber,
    materialId: row.materialId,
    materialName: row.materialName,
    materialCode: row.materialCode,
    quantity: parseFloat(row.quantity),
    unit: row.unit,
    expiryDate: row.expiryDate,
    supplierName: row.supplierName,
    manufacturerName: row.manufacturerName,
    location: row.location,
    notes: row.notes,
    createdAt: row.createdAt
  }));
}

import { getDb } from "../db";

import { hInventoryLots } from "../../drizzle/schema/part2";
import { and, eq, gte, sql } from "drizzle-orm";

/**
 * FEFO (First Expired, First Out) 로트 할당 함수
 * 
 * 출고 시 유통기한이 가장 빠른 LOT부터 자동 할당
 * 
 * @param inventoryId 재고 ID
 * @param requestedQuantity 요청 수량
 * @param unit 단위
 * @returns 할당된 LOT 목록 [{ lotId, quantity, unitCost }]
 */
export async function allocateLotsFEFO(
  inventoryId: number,
  requestedQuantity: number,
  unit: string
): Promise<Array<{ lotId: number; quantity: number; unitCost: number; expiryDate: string | null }>> {
  const db = await getDb();
  if (!db) throw new Error("Database connection not available");

  // 1. 유통기한 순으로 사용 가능한 LOT 조회 (재고 > 0, 유통기한 빠른 순)
  const availableLots = await db
    .select({
      id: hInventoryLots.id,
      availableQuantity: hInventoryLots.availableQuantity,
      unitPrice: hInventoryLots.unitPrice,
      expiryDate: hInventoryLots.expiryDate
    })
    .from(hInventoryLots)
    .where(
      and(
        eq(hInventoryLots.inventoryId, inventoryId),
        gte(hInventoryLots.availableQuantity, 0.001) as any // 재고 > 0
      )
    )
    .orderBy(
      sql`COALESCE(${hInventoryLots.expiryDate}, '9999-12-31') ASC`, // 유통기한 없으면 맨 뒤로
      hInventoryLots.id // 동일 유통기한이면 LOT ID 순
    );

  if (availableLots.length === 0) {
    throw new Error(`재고 ID ${inventoryId}에 사용 가능한 LOT가 없습니다.`);
  }

  // 2. FEFO 할당
  const allocations: Array<{ lotId: number; quantity: number; unitCost: number; expiryDate: string | null }> = [];
  let remaining = requestedQuantity;

  for (const lot of availableLots) {
    if (remaining <= 0) break;

    const allocateQty = Math.min(remaining, Number(lot.availableQuantity));
    allocations.push({
      lotId: lot.id,
      quantity: allocateQty,
      unitCost: Number(lot.unitPrice || 0),
      expiryDate: lot.expiryDate ? lot.expiryDate.toString() : null
    });

    remaining -= allocateQty;
  }

  // 3. 재고 부족 체크
  if (remaining > 0.001) {
    const totalAvailable = availableLots.reduce((sum, lot) => sum + Number(lot.availableQuantity), 0);
    throw new Error(
      `재고 부족: 요청 ${requestedQuantity}${unit}, 가용 ${totalAvailable.toFixed(3)}${unit}`
    );
  }

  return allocations;
}

/**
 * LOT 할당 결과를 doc_line_lots 테이블에 저장
 * 
 * @param docType 문서 타입 (PURCHASE, SALE, MATERIAL_ISSUE, BATCH, OTHER)
 * @param docId 문서 ID
 * @param docLineId 문서 라인 ID
 * @param allocations FEFO 할당 결과
 * @param unit 단위
 * @param createdBy 생성자 ID
 */
export async function saveLotAllocations(
  docType: "PURCHASE" | "SALE" | "MATERIAL_ISSUE" | "BATCH" | "OTHER",
  docId: string,
  docLineId: string,
  allocations: Array<{ lotId: number; quantity: number; unitCost: number }>,
  unit: string,
  createdBy: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection not available");

  const { docLineLots } = await import("../../drizzle/schema_inventory_accounting");

  // doc_line_lots 테이블에 삽입
  for (const alloc of allocations) {
    await db.insert(docLineLots).values({
      docType,
      docId,
      docLineId,
      lotId: alloc.lotId,
      quantity: alloc.quantity.toString(),
      unit,
      unitCost: alloc.unitCost.toString(),
      amount: (alloc.quantity * alloc.unitCost).toFixed(2),
      createdBy
    });
  }
}

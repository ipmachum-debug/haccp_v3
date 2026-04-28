import type { PoolConnection } from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { getDb } from "../../db";

import { hInventoryLots } from "../../../drizzle/schema/part2";
import { and, eq, gte, sql } from "drizzle-orm";

/**
 * Drizzle 인스턴스 해석 — 같은 트랜잭션에서 사용하려면 conn 전달.
 *
 * - conn 제공: PoolConnection 위에 Drizzle wrap → 같은 트랜잭션 안에서 쿼리
 * - conn 미제공: 기존 동작 (별도 connection)
 *
 * 트리거: PR #117 F-2 단일 트랜잭션 엔진 / PR #124 TransactionContext
 */
async function resolveDrizzle(conn?: PoolConnection) {
  if (conn) {
    return drizzle(conn) as any;
  }
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  return db;
}

/**
 * FEFO (First Expired, First Out) 로트 할당 함수
 *
 * 출고 시 유통기한이 가장 빠른 LOT부터 자동 할당
 *
 * @param inventoryId 재고 ID
 * @param requestedQuantity 요청 수량
 * @param unit 단위
 * @param tenantId 테넌트 ID (보안: 크로스 테넌트 접근 방지)
 * @param materialId 원재료 ID (inventoryId로 LOT를 못 찾을 때 폴백용)
 * @param conn (선택) PoolConnection — 단일 트랜잭션 안에서 호출 시 전달.
 *             postWithinTransaction 의 ctx.conn 을 그대로 넘김.
 *             미제공 시 기존 동작 (별도 connection — 트랜잭션 보장 X).
 *             F-2 단일 트랜잭션 엔진 (PR #124) 통합용.
 * @returns 할당된 LOT 목록 [{ lotId, quantity, unitCost }]
 */
export async function allocateLotsFEFO(
  inventoryId: number,
  requestedQuantity: number,
  unit: string,
  tenantId: number,
  materialId?: number,
  conn?: PoolConnection,
): Promise<Array<{ lotId: number; quantity: number; unitCost: number; expiryDate: string | null }>> {
  const db = await resolveDrizzle(conn);

  // 1. 유통기한 순으로 사용 가능한 LOT 조회 (tenant_id 필터 적용)
  let availableLots = await db
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
        eq(hInventoryLots.tenantId, tenantId),
        gte(hInventoryLots.availableQuantity, 0.001 as any)  // 재고 > 0
      )
    )
    .orderBy(
      sql`COALESCE(${hInventoryLots.expiryDate}, '9999-12-31') ASC`, // 유통기한 없으면 맨 뒤로
      hInventoryLots.id // 동일 유통기한이면 LOT ID 순
    );

  // 폴백: inventory_id로 LOT를 못 찾으면 material_id로 재검색 (기존 LOT에 inventory_id 미설정 대응)
  if (availableLots.length === 0 && materialId) {
    availableLots = await db
      .select({
        id: hInventoryLots.id,
        availableQuantity: hInventoryLots.availableQuantity,
        unitPrice: hInventoryLots.unitPrice,
        expiryDate: hInventoryLots.expiryDate
      })
      .from(hInventoryLots)
      .where(
        and(
          eq(hInventoryLots.materialId, materialId),
          eq(hInventoryLots.tenantId, tenantId),
          gte(hInventoryLots.availableQuantity, 0.001 as any)
        )
      )
      .orderBy(
        sql`COALESCE(${hInventoryLots.expiryDate}, '9999-12-31') ASC`,
        hInventoryLots.id
      );

    // 찾은 LOT들의 inventory_id를 자동 수정 (향후 정상 동작하도록)
    if (availableLots.length > 0) {
      console.warn(
        `[lot0-trace] fefo_inventory_id_recovery material=${materialId} inventory=${inventoryId} ` +
        `tenant=${tenantId} recovered_lots=${availableLots.length}`
      );
      await db.execute(sql`
        UPDATE h_inventory_lots
        SET inventory_id = ${inventoryId}
        WHERE material_id = ${materialId} AND tenant_id = ${tenantId}
          AND (inventory_id IS NULL OR inventory_id = 0)
      `);
    }
  }

  if (availableLots.length === 0) {
    console.warn(
      `[lot0-trace] fefo_no_lots inventory=${inventoryId} material=${materialId ?? "n/a"} ` +
      `tenant=${tenantId} requested=${requestedQuantity}${unit}`
    );
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
    console.warn(
      `[lot0-trace] fefo_short inventory=${inventoryId} material=${materialId ?? "n/a"} ` +
      `tenant=${tenantId} requested=${requestedQuantity}${unit} lot_total=${totalAvailable.toFixed(3)}${unit} ` +
      `lot_count=${availableLots.length}`
    );
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
 * @param tenantId 테넌트 ID (보안: 크로스 테넌트 접근 방지)
 * @param conn (선택) PoolConnection — 단일 트랜잭션 통합용 (F-2)
 */
export async function saveLotAllocations(
  docType: "PURCHASE" | "SALE" | "MATERIAL_ISSUE" | "BATCH" | "OTHER",
  docId: string,
  docLineId: string,
  allocations: Array<{ lotId: number; quantity: number; unitCost: number }>,
  unit: string,
  createdBy: number,
  tenantId: number,
  conn?: PoolConnection,
): Promise<void> {
  const db = await resolveDrizzle(conn);

  const { docLineLots } = await import("../../../drizzle/schema/schema_inventory_accounting");

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

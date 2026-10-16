import type { PoolConnection } from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { getDb } from "../../db";

import { hInventoryLots } from "../../../drizzle/schema/part2";
import { and, eq, gte, sql, desc, or, isNull, lte } from "drizzle-orm";
import { todayKST } from "../../utils/timezone";

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
export interface FefoLotRow {
  id: number;
  availableQuantity: number | string | null;
  unitPrice?: number | string | null;
  expiryDate?: Date | string | null;
}

export interface FefoAllocation {
  lotId: number;
  quantity: number;
  unitCost: number;
  expiryDate: string | null;
  /** 음수 허용 모드에서 부족분을 떠안은 LOT (가용량을 넘겨 차감됨) */
  negative?: boolean;
}

export interface FefoOptions {
  /**
   * 음수 재고 허용 (2026-10-08, negativeStockPolicy).
   * 가용 LOT 를 FEFO 로 다 쓰고도 모자라면 throw 하지 않고, 부족분을 `sinkLot`
   * (기본: 해당 자재의 가장 최근 LOT) 에 몰아서 음수로 차감한다.
   */
  allowNegative?: boolean;
  /**
   * 시점 기준 할당 (2026-10-13, 업무일자 원칙 #457 의 재고 쪽 적용).
   * 'YYYY-MM-DD' 를 주면 그 날짜 이후에 입고된 LOT 는 후보에서 제외한다 — 과거 생산을 나중에 입력해도
   * "그때 창고에 있던 LOT" 에서만 빠진다. receipt_date 가 NULL 인 LOT 는 제외하지 않는다.
   * 부족분은 allowNegative 규칙대로 sink LOT(그 날짜 이전 최신 LOT) 에 음수로.
   */
  asOfDate?: string | null;
}

/** 음수 허용 모드인데 자재에 LOT 가 하나도 없을 때 — 호출측이 자리표시 LOT 를 만들어야 한다 */
export class NoLotsForNegativeError extends Error {
  constructor(public readonly inventoryId: number, public readonly materialId: number | undefined, public readonly requested: number) {
    super(`재고 ID ${inventoryId}에 LOT 가 없어 음수 차감할 LOT 를 정할 수 없습니다.`);
    this.name = "NoLotsForNegativeError";
  }
}

/**
 * 순수 FEFO 배분 계산 (DB 접근 없음, 단위 테스트 대상).
 *
 * @param lots      FEFO 순으로 정렬된 가용 LOT (availableQuantity > 0)
 * @param requested 요청 수량
 * @param sinkLot   allowNegative 일 때 부족분을 떠안을 LOT (없으면 null)
 */
export function planFefoAllocation(
  lots: FefoLotRow[],
  requested: number,
  opts: FefoOptions & { sinkLot?: FefoLotRow | null } = {},
): { allocations: FefoAllocation[]; remaining: number } {
  const allocations: FefoAllocation[] = [];
  let remaining = requested;

  for (const lot of lots) {
    if (remaining <= 0.001) break;
    const avail = Number(lot.availableQuantity || 0);
    if (avail <= 0) continue;
    const allocateQty = Math.min(remaining, avail);
    allocations.push({
      lotId: lot.id,
      quantity: allocateQty,
      unitCost: Number(lot.unitPrice || 0),
      expiryDate: lot.expiryDate ? lot.expiryDate.toString() : null,
    });
    remaining -= allocateQty;
  }

  if (remaining > 0.001 && opts.allowNegative && opts.sinkLot) {
    const sink = opts.sinkLot;
    const existing = allocations.find((a) => a.lotId === sink.id);
    if (existing) {
      existing.quantity += remaining;
      existing.negative = true;
    } else {
      allocations.push({
        lotId: sink.id,
        quantity: remaining,
        unitCost: Number(sink.unitPrice || 0),
        expiryDate: sink.expiryDate ? sink.expiryDate.toString() : null,
        negative: true,
      });
    }
    remaining = 0;
  }

  return { allocations, remaining };
}

/**
 * 기준일(YYYY-MM-DD) 에 출고 가능한 LOT — 폐기·보류·만료 상태가 아니고, 소비기한이 없거나 기준일 이후(당일 포함).
 * 'used' 는 막지 않는다: 과거 상태 판정 버그(#526)로 재고가 남았는데 'used' 가 된 LOT 이 운영에 있어서
 * (2026-10-16 실측: 원료 21개 720kg) 막으면 실제 재고가 안 보인다. 소진 여부는 수량으로 판단한다.
 */
export function lotUsableOnSql(refDate: string) {
  return sql`(${hInventoryLots.status} IS NULL OR ${hInventoryLots.status} NOT IN ('expired', 'disposed', 'reserved'))
    AND (${hInventoryLots.expiryDate} IS NULL OR ${hInventoryLots.expiryDate} >= ${refDate})`;
}

/** 음수 sink 후보 — 재고가 없거나(0 이하), 남은 재고가 쓸 수 있는 LOT */
export function lotSinkableOnSql(refDate: string) {
  return sql`(${hInventoryLots.availableQuantity} <= 0.001 OR (${lotUsableOnSql(refDate)}))`;
}

export async function allocateLotsFEFO(
  inventoryId: number,
  requestedQuantity: number,
  unit: string,
  tenantId: number,
  materialId?: number,
  conn?: PoolConnection,
  options: FefoOptions = {},
): Promise<FefoAllocation[]> {
  const db = await resolveDrizzle(conn);

  // 시점 필터: asOfDate 가 있으면 그 날짜 이후 입고 LOT 제외 (receipt_date NULL 은 포함)
  const asOf = options.asOfDate ? String(options.asOfDate).slice(0, 10) : null;
  const asOfCond = asOf
    ? or(isNull(hInventoryLots.receiptDate), lte(hInventoryLots.receiptDate, asOf as any))
    : undefined;
  // 사용 가능 조건 (2026-10-16, Codex DB 감사: 기한 지난 LOT 6건 실사용):
  //   기준일(asOfDate, 없으면 오늘 KST) 에 소비기한이 지났거나, 폐기·보류·만료 상태인 LOT 은 쓰지 않는다.
  const refDate = asOf ?? todayKST();
  const eligibleCond = lotUsableOnSql(refDate);
  const sinkCond = lotSinkableOnSql(refDate);

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
        gte(hInventoryLots.availableQuantity, 0.001 as any),  // 재고 > 0
        eligibleCond,
        asOfCond
      )
    )
    .orderBy(
      sql`COALESCE(${hInventoryLots.expiryDate}, '9999-12-31') ASC`, // 유통기한 없으면 맨 뒤로
      hInventoryLots.id // 동일 유통기한이면 LOT ID 순
    );

  // 폴백: inventory_id 로 찾은 재고가 요청량에 '부족'하면 material_id 로 재검색.
  //   ★ 2026-07-03 근본수정 (단절2 유령 차감):
  //   기존 조건은 length===0(0건)일 때만 폴백 → inventory_id 에 소량 잔여 LOT 이
  //   1건이라도(예: 0.055kg) 있으면 폴백이 안 떠서, inventory_id=NULL/구값 LOT 에
  //   대기 중인 실제 재고(수백 kg)를 못 보고 "재고 부족" 유령 차감이 발생했다.
  //   조건을 "가용 합계가 요청량보다 부족하면"으로 완화. material_id 조회는
  //   모든 inventory_id(NULL/구값 포함)를 커버하므로 숨은 재고를 찾는다.
  const firstTotal = (availableLots as any[]).reduce((s: number, l: any) => s + Number(l.availableQuantity || 0), 0);
  if (firstTotal + 0.001 < requestedQuantity && materialId) {
    const byMaterial = await db
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
          gte(hInventoryLots.availableQuantity, 0.001 as any),
          eligibleCond,
          asOfCond
        )
      )
      .orderBy(
        sql`COALESCE(${hInventoryLots.expiryDate}, '9999-12-31') ASC`,
        hInventoryLots.id
      );

    const materialTotal = (byMaterial as any[]).reduce((s: number, l: any) => s + Number(l.availableQuantity || 0), 0);
    // material_id 조회가 inventory_id 조회보다 재고를 더 찾았을 때만 채택
    // (= inventory_id 밖 NULL/구값 LOT 에 숨은 재고 존재). 같거나 적으면 진짜 부족.
    if (byMaterial.length > 0 && materialTotal > firstTotal + 0.001) {
      availableLots = byMaterial;
      console.warn(
        `[lot0-trace] fefo_material_fallback material=${materialId} inventory=${inventoryId} ` +
        `tenant=${tenantId} first_total=${firstTotal.toFixed(3)} material_total=${materialTotal.toFixed(3)} ` +
        `lots=${byMaterial.length} requested=${requestedQuantity}`
      );
      // NULL/0 inventory_id 자동 복구 (향후 첫 쿼리에서 바로 잡히도록)
      await db.execute(sql`
        UPDATE h_inventory_lots
        SET inventory_id = ${inventoryId}
        WHERE material_id = ${materialId} AND tenant_id = ${tenantId}
          AND (inventory_id IS NULL OR inventory_id = 0)
      `);
    }
  }

  // 음수 허용 모드: 부족분을 떠안을 sink LOT = 해당 자재의 가장 최근 LOT (수량 무관, 음수 LOT 포함).
  //   같은 LOT 에 계속 쌓이게 해서 음수가 여러 LOT 로 흩어지지 않게 한다.
  //   단 재고가 남은 쓸 수 없는 LOT (기한 경과·폐기·보류) 은 sink 로 고르지 않는다 — 고르면 남은 기한 경과
  //   재고부터 빠져나가 FEFO 제외가 무력화된다. 재고 0 이하 LOT 은 상태·기한과 무관하게 sink 가능.
  let sinkLot: FefoLotRow | null = null;
  if (options.allowNegative) {
    const totalNow = (availableLots as any[]).reduce((s: number, l: any) => s + Number(l.availableQuantity || 0), 0);
    if (totalNow + 0.001 < requestedQuantity) {
      const sinkRows = await db
        .select({
          id: hInventoryLots.id,
          availableQuantity: hInventoryLots.availableQuantity,
          unitPrice: hInventoryLots.unitPrice,
          expiryDate: hInventoryLots.expiryDate
        })
        .from(hInventoryLots)
        .where(
          materialId
            ? and(eq(hInventoryLots.materialId, materialId), eq(hInventoryLots.tenantId, tenantId), sinkCond, asOfCond)
            : and(eq(hInventoryLots.inventoryId, inventoryId), eq(hInventoryLots.tenantId, tenantId), sinkCond, asOfCond)
        )
        .orderBy(sql`(${hInventoryLots.availableQuantity} < 0) DESC`, desc(hInventoryLots.id))
        .limit(1);
      sinkLot = (sinkRows as any[])[0] ?? null;
      if (!sinkLot) {
        throw new NoLotsForNegativeError(inventoryId, materialId, requestedQuantity);
      }
    }
  }

  if (availableLots.length === 0 && !sinkLot) {
    console.warn(
      `[lot0-trace] fefo_no_lots inventory=${inventoryId} material=${materialId ?? "n/a"} ` +
      `tenant=${tenantId} requested=${requestedQuantity}${unit}`
    );
    throw new Error(`재고 ID ${inventoryId}에 사용 가능한 LOT가 없습니다.`);
  }

  // 2. FEFO 할당 (+ 음수 허용 시 부족분 sink)
  const { allocations, remaining } = planFefoAllocation(availableLots as FefoLotRow[], requestedQuantity, {
    allowNegative: options.allowNegative,
    sinkLot,
  });

  if (sinkLot && allocations.some((a) => a.negative)) {
    const neg = allocations.find((a) => a.negative)!;
    console.warn(
      `[negative-stock] fefo_sink inventory=${inventoryId} material=${materialId ?? "n/a"} ` +
      `tenant=${tenantId} requested=${requestedQuantity}${unit} sink_lot=${neg.lotId} short=${neg.quantity.toFixed(3)}${unit}`
    );
  }

  // 3. 재고 부족 체크 (음수 비허용 모드)
  if (remaining > 0.001) {
    const totalAvailable = (availableLots as any[]).reduce((sum: number, lot: any) => sum + Number(lot.availableQuantity), 0);
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

// saveLotAllocations / doc_line_lots 는 2026-10-12 제거 — 운영 DB 에 테이블이 없었고 호출자 0 (#452 로 마지막 호출자 소멸).

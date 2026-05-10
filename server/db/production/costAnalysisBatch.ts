/**
 * 배치 원가 + 수익성
 */
// ═══════════════════════════════════════════════════════════════
// costAnalysis.ts - 원가 분석 DB 함수
// 배치 원가, 수익성, 재고 회전율, 단가 이력,
// 수익성 예측(지수 평활법), 재고 소진 예측, 발주 알림
// ═══════════════════════════════════════════════════════════════
import { getDb } from "../connection";
import { eq, and, or, lte, gte, gt, desc, asc, sql, lt, inArray, count, isNotNull, sum } from "drizzle-orm";
import { toKSTDate, todayKST, formatLocalDate } from "../../utils/timezone";
import { createNotification } from "../system/notificationFunctions";

import {
  hBatches,
  hBatchInputs,
  hMaterials,
  hInventoryLots,
  hInventoryTransactions,
  hProductsV2,
  hMaterialPriceHistory,
} from "../../../drizzle/schema";

// ═══════════════════════════════════════════════════════════════
// 배치 원가 계산
// ═══════════════════════════════════════════════════════════════

/** 정제수(purified water) 여부 판별 - 가격/재고 계산에서 제외 대상 */
function isWaterMaterial(materialName: string | null | undefined): boolean {
  if (!materialName) return false;
  const name = materialName.toLowerCase();
  return name.includes("정제수") || name.includes("purified water");
}

/**
 * 배치별 원재료 투입 비용 계산
 * 정제수는 투입량 표시는 하되 가격 계산에서 제외
 */

export async function getBatchCost(batchId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { hBatchInputs, hMaterials } = await import("../../../drizzle/schema.js");
  const { eq, sql } = await import("drizzle-orm");

  // 배치 원재료 투입 내역 조회 (원재료 정보 포함)
  const inputs = await db
    .select({
      input: hBatchInputs,
      material: hMaterials
    })
    .from(hBatchInputs)
    .leftJoin(hMaterials, eq(hBatchInputs.materialId, hMaterials.id))
    .where(eq(hBatchInputs.batchId, batchId));

  // 각 원재료별 비용 계산
  // 우선순위: ① h_batch_inputs.unitPrice (FEFO LOT 실제단가) → ② h_materials.unitPrice (마스터 단가)
  // 정제수는 비용 0으로 처리
  const materialCosts = inputs.map((item) => {
    const quantity = parseFloat(String(item.input.actualQuantity || item.input.plannedQuantity));
    const water = isWaterMaterial(item.material?.materialName);

    // h_batch_inputs에 FEFO 할당 시 저장된 실제단가 우선 사용
    // ★ 2026-05-10 (PR #297): 0 도 폴백 트리거 (4/13 이후 unit_price=0 대량 발생 대응)
    const rawBatchInputPrice = item.input.unitPrice ? parseFloat(String(item.input.unitPrice)) : 0;
    const batchInputUnitPrice = rawBatchInputPrice > 0 ? rawBatchInputPrice : null;
    const masterUnitPrice = item.material?.unitPrice ? parseFloat(String(item.material.unitPrice)) : 0;
    const unitPrice = water ? 0 : (batchInputUnitPrice ?? masterUnitPrice);

    // total_price가 있으면 직접 사용 (FEFO 가중평균 기반), 없으면 수량×단가
    // ★ 2026-05-10 (PR #297): 0 도 폴백 트리거 (NULL/0 모두 폴백)
    const rawBatchInputTotalPrice = item.input.totalPrice ? parseFloat(String(item.input.totalPrice)) : 0;
    const batchInputTotalPrice = rawBatchInputTotalPrice > 0 ? rawBatchInputTotalPrice : null;
    const cost = water ? 0 : (batchInputTotalPrice ?? quantity * unitPrice);

    return {
      materialId: item.input.materialId,
      materialName: item.material?.materialName || "Unknown",
      quantity,
      unit: item.input.unit,
      unitPrice,
      totalCost: cost,
      isWater: water,
      priceSource: water ? "excluded" : (batchInputUnitPrice !== null ? "lot" : "master")
    };
  });

  // 총 비용 계산 (정제수 제외)
  const totalCost = materialCosts.reduce((sum, item) => sum + item.totalCost, 0);

  return {
    batchId,
    materialCosts,
    totalCost
  };
}

/**
 * 여러 배치의 비용 조회 (배치 목록 페이지용)
 *
 * ★ 2026-05-10 (PR #297, hotfix/batch-cost-coalesce-zero):
 *   기존 버그 — h_batch_inputs.unit_price/total_price 가 0(NOT NULL) 으로
 *   기록된 행이 4/13 이후 대량 발생. SQL `COALESCE(unit_price, m.unit_price, 0)`
 *   는 NULL 만 건너뛰고 0 은 유효값으로 취급해 마스터 단가 폴백 실패 → SUM=0 → '-' 표시.
 *
 *   추가 버그 — `LEFT JOIN h_materials` + WHERE `m.material_name NOT LIKE '%정제수%'`
 *   는 JOIN 미매칭(NULL) 행을 제외 (NULL NOT LIKE → NULL → 필터 탈락).
 *   item_master 로만 등록된 원재료 투입이 통째로 빠짐.
 *
 *   수정 —
 *   ① NULLIF(col, 0) 으로 0 도 NULL 처리 → 폴백 체인 정상 작동
 *   ② item_master 듀얼 lookup 추가 (m.unit_price 없으면 im.default_unit_price)
 *   ③ 정제수 필터를 `(name IS NULL OR name NOT LIKE ...)` 로 NULL 안전화
 *
 * 단가 우선순위: ① bi.total_price > 0 (FEFO LOT 실제원가)
 *               → ② actual_qty × bi.unit_price > 0 (LOT 가중평균)
 *               → ③ actual_qty × m.unit_price (h_materials 마스터)
 *               → ④ actual_qty × im.default_unit_price (item_master 마스터)
 *               → ⑤ 0
 * 정제수는 비용 합계에서 제외 (LEFT JOIN 결과 NULL 행은 제외 안 함).
 */
export async function getBatchCostSummary(batchIds: number[], tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { getRawConnection } = await import("../connection");

  if (batchIds.length === 0) return [];

  const conn = await getRawConnection();

  // 듀얼 lookup + NULLIF(0) 폴백 + 이름 기반 cross-namespace 폴백 — Drizzle 표현이 복잡하므로 raw SQL 사용
  // ★ 2026-05-10 (PR #298 Option B):
  //   bi.material_id 가 item_master.id namespace 인 케이스를 위해 이름 기반 폴백 추가:
  //     m_byname: im.item_name → h_materials.material_name JOIN (h_materials 단가 폴백)
  //     im_byname: m.material_name → item_master.item_name JOIN (item_master 단가 폴백)
  //   기존 m/im 직접 JOIN 폴백 후에도 단가가 0 인 경우 cross-namespace 매칭 시도.
  const placeholders = batchIds.map(() => "?").join(",");
  const [rows]: any = await conn.execute(
    `SELECT
       bi.batch_id AS batchId,
       SUM(
         COALESCE(
           NULLIF(bi.total_price, 0),
           COALESCE(bi.actual_quantity, bi.planned_quantity, 0)
             * COALESCE(
                 NULLIF(bi.unit_price, 0),
                 NULLIF(m.unit_price, 0),
                 NULLIF(im.default_unit_price, 0),
                 NULLIF(m_byname.unit_price, 0),
                 NULLIF(im_byname.default_unit_price, 0),
                 0
               )
         )
       ) AS totalCost
     FROM h_batch_inputs bi
     LEFT JOIN h_materials m
       ON m.id = bi.material_id AND m.tenant_id = bi.tenant_id
     LEFT JOIN item_master im
       ON im.id = bi.material_id AND im.tenant_id = bi.tenant_id
        AND im.item_type = 'raw_material'
     /* 이름 기반 cross-namespace 폴백 */
     LEFT JOIN h_materials m_byname
       ON m.id IS NULL
      AND m_byname.tenant_id = bi.tenant_id
      AND TRIM(m_byname.material_name) = TRIM(im.item_name)
     LEFT JOIN item_master im_byname
       ON im.id IS NULL
      AND im_byname.tenant_id = bi.tenant_id
      AND im_byname.item_type = 'raw_material'
      AND TRIM(im_byname.item_name) = TRIM(m.material_name)
     WHERE bi.batch_id IN (${placeholders})
       AND (
         COALESCE(m.material_name, im.item_name, m_byname.material_name, im_byname.item_name) IS NULL
         OR COALESCE(m.material_name, im.item_name, m_byname.material_name, im_byname.item_name) NOT LIKE '%정제수%'
       )
     GROUP BY bi.batch_id`,
    batchIds,
  );

  return ((rows as any[]) || []).map((r) => ({
    batchId: Number(r.batchId),
    totalCost: parseFloat(r.totalCost || "0"),
  }));
}


// ═══════════════════════════════════════════════════════════════
// 배치 수익성 분석 (매출, 비용, 수익률)
// ═══════════════════════════════════════════════════════════════

/**
 * 배치 수익성 조회 (원가, 매출, 수익률)
 */
export async function getBatchProfitability(batchId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { hBatches } = await import("../../../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");

  // 배치 정보 조회
  const batch = await db.select().from(hBatches).where(eq(hBatches.id, batchId)).limit(1);
  if (batch.length === 0) {
    return null;
  }

  // 배치 비용 조회
  const costResult = await getBatchCost(batchId);
  if (!costResult) {
    return null;
  }

  const revenue = batch[0].revenue ? parseFloat(batch[0].revenue) : 0;
  const cost = costResult.totalCost;
  const profit = revenue - cost;
  const profitMargin = revenue > 0 ? (profit / revenue) * 100 : 0;

  return {
    batchId,
    batchCode: batch[0].batchCode,
    productId: batch[0].productId,
    revenue,
    cost,
    profit,
    profitMargin,
    materialCosts: costResult.materialCosts
  };
}

/**
 * 제품별 수익성 통계 조회
 */
export async function getProfitabilityByProduct(filters?: {
  startDate?: Date;
  endDate?: Date;
  tenantId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { hBatches, hProductsV2 } = await import("../../../drizzle/schema.js");
  const { and, gte, lte, eq, sql, isNotNull } = await import("drizzle-orm");

  const conditions: any[] = [isNotNull(hBatches.revenue)];
  if (filters?.tenantId) {
    conditions.push(eq(hBatches.tenantId, filters.tenantId));
  }
  if (filters?.startDate) {
    conditions.push(gte(hBatches.plannedDate, filters.startDate));
  }
  if (filters?.endDate) {
    conditions.push(lte(hBatches.plannedDate, filters.endDate));
  }

  const stats = await db
    .select({
      productId: hBatches.productId,
      productName: hProductsV2.productName,
      batchCount: sql<number>`COUNT(*)`,
      totalRevenue: sql<number>`SUM(${hBatches.revenue})`,
      avgRevenue: sql<number>`AVG(${hBatches.revenue})`
    })
    .from(hBatches)
    .leftJoin(hProductsV2, eq(hBatches.productId, hProductsV2.id))
    .where(and(...conditions))
    .groupBy(hBatches.productId, hProductsV2.productName)
    .orderBy(sql`SUM(${hBatches.revenue}) DESC`);

  // 각 제품의 평균 비용 계산
  const result = [];
  for (const stat of stats) {
    // 해당 제품의 모든 배치 비용 조회
    const batchConditions: any[] = [
      eq(hBatches.productId, stat.productId),
      isNotNull(hBatches.revenue),
    ];
    if (filters?.tenantId) {
      batchConditions.push(eq(hBatches.tenantId, filters.tenantId));
    }
    if (filters?.startDate) {
      batchConditions.push(gte(hBatches.plannedDate, filters.startDate));
    }
    if (filters?.endDate) {
      batchConditions.push(lte(hBatches.plannedDate, filters.endDate));
    }

    const batches = await db
      .select({ id: hBatches.id })
      .from(hBatches)
      .where(and(...batchConditions));

    let totalCost = 0;
    for (const batch of batches) {
      const costResult = await getBatchCost(batch.id);
      if (costResult) {
        totalCost += costResult.totalCost;
      }
    }

    const avgCost = batches.length > 0 ? totalCost / batches.length : 0;
    const totalProfit = stat.totalRevenue - totalCost;
    const avgProfit = stat.avgRevenue - avgCost;
    const profitMargin = stat.avgRevenue > 0 ? (avgProfit / stat.avgRevenue) * 100 : 0;

    result.push({
      productId: stat.productId,
      productName: stat.productName,
      batchCount: stat.batchCount,
      totalRevenue: stat.totalRevenue,
      avgRevenue: stat.avgRevenue,
      avgCost,
      avgProfit,
      profitMargin,
      totalProfit
    });
  }

  return result;
}

/**
 * 배치 매출액 업데이트
 */
export async function updateBatchRevenue(batchId: number, revenue: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { hBatches } = await import("../../../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");

  await db
    .update(hBatches)
    .set({ revenue: revenue.toString() })
    .where(eq(hBatches.id, batchId));

  return true;
}


/**
 * 원재료별 원가 비중 집계
 */
export async function getMaterialCostBreakdown(params: {
  siteId: number;
  startDate?: Date;
  endDate?: Date;
  productId?: number;
  status?: string;
}) {
  const { siteId, startDate, endDate, productId, status } = params;

  // 배치 필터 조건 구성
  const batchConditions = [eq(hBatches.siteId, siteId)];

  if (startDate) {
    batchConditions.push(gte(hBatches.plannedDate, startDate));
  }

  if (endDate) {
    batchConditions.push(lte(hBatches.plannedDate, endDate));
  }

  if (productId) {
    batchConditions.push(eq(hBatches.productId, productId));
  }

  if (status) {
    batchConditions.push(eq(hBatches.status, status as any));
  }

  // 배치 목록 조회
  const db = await getDb();
  if (!db) {
    throw new Error("데이터베이스 연결에 실패했습니다.");
  }

  const batches = await db
    .select({ id: hBatches.id })
    .from(hBatches)
    .where(and(...batchConditions));

  if (batches.length === 0) {
    return [];
  }

  const batchIds = batches.map((b: any) => b.id);

  // 원재료별 원가 집계 (정제수 제외)
  const result = await db
    .select({
      materialId: hBatchInputs.materialId,
      materialName: hMaterials.materialName,
      totalCost: sql<number>`SUM(${hBatchInputs.totalPrice})`.as('total_cost'),
      count: sql<number>`COUNT(*)`.as('count')
    })
    .from(hBatchInputs)
    .innerJoin(hMaterials, eq(hBatchInputs.materialId, hMaterials.id))
    .where(and(
      sql`${hBatchInputs.batchId} IN (${sql.join(batchIds.map((id: any) => sql`${id}`), sql`, `)})`,
      sql`${hMaterials.materialName} NOT LIKE '%정제수%'`
    ))
    .groupBy(hBatchInputs.materialId, hMaterials.materialName)
    .orderBy(desc(sql`SUM(${hBatchInputs.totalPrice})`));

  return result;
}

// ═══════════════════════════════════════════════════════════════
// 원재료 단가 관리 및 이력
// ═══════════════════════════════════════════════════════════════

/** 원재료 단가 업데이트 (이전 단가 → 이력 자동 저장) */
async function updateMaterialPrice(id: number, unitPrice: number, changedBy?: number, reason?: string, tenantId?: number) {
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

// ═══════════════════════════════════════════════════════════════
// 수익률 추이 (월별/분기별)
// ═══════════════════════════════════════════════════════════════

/** 월별 수익률 추이 조회 */

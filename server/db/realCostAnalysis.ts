/**
 * 실질 원가 분석 모듈
 * - 입고 단가(h_inventory_lots.unit_price) 또는 마스터 단가(h_materials.unit_price)를 기반으로
 *   배치별/제품별 재료원가를 산출
 * - 인건비, 간접비 등 산출 불가능한 항목은 제외
 */

import { getDb, getRawConnection } from "../db";

// ── 타입 ──────────────────────────────────────────────
export interface BatchMaterialCost {
  batchId: number;
  batchCode: string;
  productId: number;
  productName: string;
  plannedDate: string;
  plannedQuantity: number;          // kg
  materialCost: number;             // 원
  costPerKg: number;                // 원/kg
  materialCount: number;            // 원재료 종류 수
  pricedMaterialCount: number;      // 단가 있는 원재료 수
  priceCoverage: number;            // 단가 커버리지 (0~100%)
}

export interface ProductCostSummary {
  productId: number;
  productName: string;
  batchCount: number;
  totalQuantityKg: number;
  totalMaterialCost: number;
  avgCostPerKg: number;
  minCostPerKg: number;
  maxCostPerKg: number;
  avgPriceCoverage: number;
}

export interface MaterialUsageSummary {
  materialId: number;
  materialName: string;
  unitPrice: number;
  unit: string;
  totalQuantity: number;
  totalCost: number;
  batchCount: number;
  costShare: number; // 전체 원가 대비 비중 (%)
}

export interface CostTrendPoint {
  month: string;        // YYYY-MM
  batchCount: number;
  totalQuantityKg: number;
  totalMaterialCost: number;
  avgCostPerKg: number;
}

// ── Helper: 원재료 최적 단가 조회 (마스터 > 최신 LOT) ──
async function getMaterialBestPrices(tenantId: number): Promise<Map<number, number>> {
  const conn = await getRawConnection();
  if (!conn) return new Map();

  const [rows] = await conn.execute<any[]>(`
    SELECT m.id as material_id,
      COALESCE(
        NULLIF(m.unit_price, 0),
        (SELECT l.unit_price FROM h_inventory_lots l 
         WHERE l.material_id = m.id AND l.unit_price > 0 
         ORDER BY l.receipt_date DESC LIMIT 1),
        0
      ) as best_price
    FROM h_materials m
    WHERE m.tenant_id = ? AND m.is_active = 1
  `, [tenantId]);

  const priceMap = new Map<number, number>();
  for (const row of rows as any[]) {
    priceMap.set(row.material_id, parseFloat(row.best_price || '0'));
  }
  return priceMap;
}

// ── 1) 배치별 재료원가 목록 ──────────────────────────
export async function getBatchMaterialCosts(params: {
  tenantId: number;
  startDate?: string;
  endDate?: string;
  productId?: number;
  limit?: number;
}): Promise<BatchMaterialCost[]> {
  const conn = await getRawConnection();
  if (!conn) return [];

  const { tenantId, startDate, endDate, productId, limit = 100 } = params;

  // 단가 맵 조회
  const priceMap = await getMaterialBestPrices(tenantId);

  // 배치 + 투입 데이터 조회
  let sql = `
    SELECT b.id as batch_id, b.batch_code, b.product_id, p.product_name,
           DATE_FORMAT(b.planned_date, '%Y-%m-%d') as planned_date,
           b.planned_quantity,
           bi.material_id,
           COALESCE(bi.actual_quantity, bi.planned_quantity) as qty
    FROM h_batches b
    JOIN h_products_v2 p ON b.product_id = p.id AND p.tenant_id = b.tenant_id
    LEFT JOIN h_batch_inputs bi ON bi.batch_id = b.id
    WHERE b.tenant_id = ?
  `;
  const binds: any[] = [tenantId];

  if (startDate) { sql += ` AND b.planned_date >= ?`; binds.push(startDate); }
  if (endDate) { sql += ` AND b.planned_date <= ?`; binds.push(endDate); }
  if (productId) { sql += ` AND b.product_id = ?`; binds.push(productId); }

  sql += ` ORDER BY b.planned_date DESC, b.id DESC`;

  const [rows] = await conn.execute<any[]>(sql, binds);

  // 배치별 집계
  const batchMap = new Map<number, {
    batchCode: string; productId: number; productName: string;
    plannedDate: string; plannedQuantity: number;
    materials: { materialId: number; qty: number }[];
  }>();

  for (const row of rows as any[]) {
    if (!batchMap.has(row.batch_id)) {
      batchMap.set(row.batch_id, {
        batchCode: row.batch_code,
        productId: row.product_id,
        productName: row.product_name,
        plannedDate: row.planned_date,
        plannedQuantity: parseFloat(row.planned_quantity || '0'),
        materials: []
      });
    }
    if (row.material_id) {
      batchMap.get(row.batch_id)!.materials.push({
        materialId: row.material_id,
        qty: parseFloat(row.qty || '0')
      });
    }
  }

  // 원가 계산
  const result: BatchMaterialCost[] = [];
  for (const [batchId, batch] of batchMap) {
    let materialCost = 0;
    let pricedCount = 0;
    for (const mat of batch.materials) {
      const price = priceMap.get(mat.materialId) || 0;
      materialCost += mat.qty * price;
      if (price > 0) pricedCount++;
    }
    const totalCount = batch.materials.length;
    const costPerKg = batch.plannedQuantity > 0 ? materialCost / batch.plannedQuantity : 0;
    const priceCoverage = totalCount > 0 ? (pricedCount / totalCount) * 100 : 0;

    result.push({
      batchId,
      batchCode: batch.batchCode,
      productId: batch.productId,
      productName: batch.productName,
      plannedDate: batch.plannedDate,
      plannedQuantity: batch.plannedQuantity,
      materialCost: Math.round(materialCost),
      costPerKg: Math.round(costPerKg),
      materialCount: totalCount,
      pricedMaterialCount: pricedCount,
      priceCoverage: Math.round(priceCoverage)
    });

    if (result.length >= limit) break;
  }

  return result;
}

// ── 2) 제품별 원가 요약 ─────────────────────────────
export async function getProductCostSummary(params: {
  tenantId: number;
  startDate?: string;
  endDate?: string;
}): Promise<ProductCostSummary[]> {
  const batches = await getBatchMaterialCosts({
    ...params,
    limit: 9999
  });

  const productMap = new Map<number, {
    productName: string;
    batches: { qty: number; cost: number; costPerKg: number; coverage: number }[];
  }>();

  for (const b of batches) {
    if (!productMap.has(b.productId)) {
      productMap.set(b.productId, { productName: b.productName, batches: [] });
    }
    productMap.get(b.productId)!.batches.push({
      qty: b.plannedQuantity,
      cost: b.materialCost,
      costPerKg: b.costPerKg,
      coverage: b.priceCoverage
    });
  }

  const result: ProductCostSummary[] = [];
  for (const [productId, data] of productMap) {
    const batchCount = data.batches.length;
    const totalQuantityKg = data.batches.reduce((s, b) => s + b.qty, 0);
    const totalMaterialCost = data.batches.reduce((s, b) => s + b.cost, 0);
    const costPerKgs = data.batches.filter(b => b.costPerKg > 0).map(b => b.costPerKg);
    const avgCostPerKg = totalQuantityKg > 0 ? totalMaterialCost / totalQuantityKg : 0;
    const avgPriceCoverage = data.batches.reduce((s, b) => s + b.coverage, 0) / batchCount;

    result.push({
      productId,
      productName: data.productName,
      batchCount,
      totalQuantityKg: Math.round(totalQuantityKg),
      totalMaterialCost: Math.round(totalMaterialCost),
      avgCostPerKg: Math.round(avgCostPerKg),
      minCostPerKg: costPerKgs.length > 0 ? Math.round(Math.min(...costPerKgs)) : 0,
      maxCostPerKg: costPerKgs.length > 0 ? Math.round(Math.max(...costPerKgs)) : 0,
      avgPriceCoverage: Math.round(avgPriceCoverage)
    });
  }

  return result.sort((a, b) => b.totalMaterialCost - a.totalMaterialCost);
}

// ── 3) 원재료별 사용량/비용 순위 ────────────────────
export async function getMaterialUsageRanking(params: {
  tenantId: number;
  startDate?: string;
  endDate?: string;
  limit?: number;
}): Promise<MaterialUsageSummary[]> {
  const conn = await getRawConnection();
  if (!conn) return [];

  const { tenantId, startDate, endDate, limit = 20 } = params;
  const priceMap = await getMaterialBestPrices(tenantId);

  let sql = `
    SELECT bi.material_id, m.material_name, m.unit,
           SUM(COALESCE(bi.actual_quantity, bi.planned_quantity)) as total_qty,
           COUNT(DISTINCT bi.batch_id) as batch_count
    FROM h_batch_inputs bi
    JOIN h_batches b ON bi.batch_id = b.id
    JOIN h_materials m ON bi.material_id = m.id
    WHERE b.tenant_id = ?
  `;
  const binds: any[] = [tenantId];

  if (startDate) { sql += ` AND b.planned_date >= ?`; binds.push(startDate); }
  if (endDate) { sql += ` AND b.planned_date <= ?`; binds.push(endDate); }

  sql += ` GROUP BY bi.material_id, m.material_name, m.unit
           ORDER BY total_qty DESC`;

  const [rows] = await conn.execute<any[]>(sql, binds);

  let grandTotalCost = 0;
  const items: MaterialUsageSummary[] = [];

  for (const row of rows as any[]) {
    const qty = parseFloat(row.total_qty || '0');
    const price = priceMap.get(row.material_id) || 0;
    const totalCost = qty * price;
    grandTotalCost += totalCost;

    items.push({
      materialId: row.material_id,
      materialName: row.material_name,
      unitPrice: price,
      unit: row.unit || 'kg',
      totalQuantity: Math.round(qty * 10) / 10,
      totalCost: Math.round(totalCost),
      batchCount: row.batch_count,
      costShare: 0  // 아래에서 계산
    });
  }

  // 비용 비중 계산
  for (const item of items) {
    item.costShare = grandTotalCost > 0
      ? Math.round((item.totalCost / grandTotalCost) * 1000) / 10
      : 0;
  }

  // 비용 기준 정렬
  items.sort((a, b) => b.totalCost - a.totalCost);

  return items.slice(0, limit);
}

// ── 4) 월별 원가 추이 ───────────────────────────────
export async function getCostTrend(params: {
  tenantId: number;
  months?: number;
}): Promise<CostTrendPoint[]> {
  const conn = await getRawConnection();
  if (!conn) return [];

  const { tenantId, months = 6 } = params;
  const priceMap = await getMaterialBestPrices(tenantId);

  const [rows] = await conn.execute<any[]>(`
    SELECT DATE_FORMAT(b.planned_date, '%Y-%m') as month,
           b.id as batch_id, b.planned_quantity,
           bi.material_id,
           COALESCE(bi.actual_quantity, bi.planned_quantity) as qty
    FROM h_batches b
    LEFT JOIN h_batch_inputs bi ON bi.batch_id = b.id
    WHERE b.tenant_id = ?
      AND b.planned_date >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
    ORDER BY month
  `, [tenantId, months]);

  // 월별 + 배치별 집계
  const monthMap = new Map<string, Map<number, { qty: number; cost: number }>>();

  for (const row of rows as any[]) {
    const month = row.month;
    if (!monthMap.has(month)) monthMap.set(month, new Map());
    const batchMap = monthMap.get(month)!;
    if (!batchMap.has(row.batch_id)) {
      batchMap.set(row.batch_id, { qty: parseFloat(row.planned_quantity || '0'), cost: 0 });
    }
    if (row.material_id) {
      const price = priceMap.get(row.material_id) || 0;
      batchMap.get(row.batch_id)!.cost += parseFloat(row.qty || '0') * price;
    }
  }

  const result: CostTrendPoint[] = [];
  for (const [month, batchMap] of [...monthMap].sort()) {
    let totalQty = 0, totalCost = 0;
    for (const [, b] of batchMap) {
      totalQty += b.qty;
      totalCost += b.cost;
    }
    result.push({
      month,
      batchCount: batchMap.size,
      totalQuantityKg: Math.round(totalQty),
      totalMaterialCost: Math.round(totalCost),
      avgCostPerKg: totalQty > 0 ? Math.round(totalCost / totalQty) : 0
    });
  }

  return result;
}

// ── 5) 단일 배치 상세 원재료 내역 ───────────────────
export async function getBatchMaterialDetail(params: {
  tenantId: number;
  batchId: number;
}): Promise<{
  batchInfo: { batchId: number; batchCode: string; productName: string; plannedQuantity: number; plannedDate: string };
  materials: { materialId: number; materialName: string; quantity: number; unit: string; unitPrice: number; cost: number; costShare: number }[];
  totalCost: number;
  costPerKg: number;
}> {
  const conn = await getRawConnection();
  if (!conn) throw new Error("DB not available");

  const { tenantId, batchId } = params;
  const priceMap = await getMaterialBestPrices(tenantId);

  const [batchRows] = await conn.execute<any[]>(`
    SELECT b.id, b.batch_code, p.product_name, b.planned_quantity,
           DATE_FORMAT(b.planned_date, '%Y-%m-%d') as planned_date
    FROM h_batches b
    JOIN h_products_v2 p ON b.product_id = p.id AND p.tenant_id = b.tenant_id
    WHERE b.id = ? AND b.tenant_id = ?
  `, [batchId, tenantId]);

  if ((batchRows as any[]).length === 0) throw new Error("Batch not found");
  const batch = (batchRows as any[])[0];

  const [inputRows] = await conn.execute<any[]>(`
    SELECT bi.material_id, m.material_name, m.unit,
           COALESCE(bi.actual_quantity, bi.planned_quantity) as qty
    FROM h_batch_inputs bi
    JOIN h_materials m ON bi.material_id = m.id
    WHERE bi.batch_id = ?
    ORDER BY COALESCE(bi.actual_quantity, bi.planned_quantity) DESC
  `, [batchId]);

  let totalCost = 0;
  const materials = (inputRows as any[]).map(row => {
    const qty = parseFloat(row.qty || '0');
    const price = priceMap.get(row.material_id) || 0;
    const cost = qty * price;
    totalCost += cost;
    return {
      materialId: row.material_id,
      materialName: row.material_name,
      quantity: Math.round(qty * 10) / 10,
      unit: row.unit || 'kg',
      unitPrice: price,
      cost: Math.round(cost),
      costShare: 0
    };
  });

  // 비중 계산
  for (const mat of materials) {
    mat.costShare = totalCost > 0 ? Math.round((mat.cost / totalCost) * 1000) / 10 : 0;
  }

  const plannedQty = parseFloat(batch.planned_quantity || '0');

  return {
    batchInfo: {
      batchId: batch.id,
      batchCode: batch.batch_code,
      productName: batch.product_name,
      plannedQuantity: plannedQty,
      plannedDate: batch.planned_date
    },
    materials,
    totalCost: Math.round(totalCost),
    costPerKg: plannedQty > 0 ? Math.round(totalCost / plannedQty) : 0
  };
}

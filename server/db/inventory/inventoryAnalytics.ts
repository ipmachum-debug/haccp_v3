import { getDb } from "../connection";
import { sql } from "drizzle-orm";

export interface InventoryTurnoverResult {
  materialId: number;
  materialCode: string;
  materialName: string;
  turnoverRate: number;
  averageHoldingPeriod: number;
  usageQuantity: number;
  averageInventory: number;
  efficiency: "high" | "medium" | "low";
}

/**
 * 재고 회전율 계산
 * @param materialId 원재료 ID (선택)
 * @param startDate 시작 날짜
 * @param endDate 종료 날짜
 * @param tenantId 테넌트 ID (멀티테넌트 격리)
 * @returns 재고 회전율 결과
 */
export async function calculateInventoryTurnover(
  materialId: number | undefined,
  startDate: Date | undefined,
  endDate: Date | undefined,
  tenantId: number
): Promise<InventoryTurnoverResult[]> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const start = startDate || new Date(new Date().getFullYear(), 0, 1);
  const end = endDate || new Date();

  // WHERE 조건 구성 (materialId + tenantId 필터)
  const whereConditions: string[] = [];
  if (materialId) {
    whereConditions.push(`m.id = ${Number(materialId)}`);
  }
  whereConditions.push(`m.tenant_id = ${Number(tenantId)}`);
  const whereClause = sql`WHERE ${sql.raw(whereConditions.join(' AND '))}`;
  
  // 기간 내 원재료 사용량 조회 (배치 투입 + inventory_transactions 통합)
  const usageQuery = sql`
    SELECT
      m.id as material_id,
      m.material_code,
      m.material_name,
      COALESCE(batch_usage.total_qty, 0) + COALESCE(txn_usage.total_qty, 0) as usage_quantity,
      COALESCE(lot_stock.total_qty, 1) as avg_inventory
    FROM h_materials m
    LEFT JOIN (
      SELECT material_id, SUM(ABS(COALESCE(actual_quantity, planned_quantity))) as total_qty
      FROM h_batch_inputs
      WHERE tenant_id = ${Number(tenantId)}
        AND COALESCE(input_time, created_at) >= ${start}
        AND COALESCE(input_time, created_at) <= ${end}
        AND inventory_deducted = 1
      GROUP BY material_id
    ) batch_usage ON m.id = batch_usage.material_id
    LEFT JOIN (
      -- 2026-04-27 (§5.2 후속): JOIN h_inventory_lots 의존성 제거.
      -- t.material_id 가 직접 채워진 후 (PR #89), lot_id=0 트랜잭션도 포함되어 회전율 계산 정확도 향상.
      -- product 트랜잭션은 t.material_id IS NULL 이라 자연 제외됨.
      SELECT t.material_id, SUM(ABS(t.quantity)) as total_qty
      FROM h_inventory_transactions t
      WHERE t.tenant_id = ${Number(tenantId)}
        AND t.transaction_type = 'usage'
        AND t.material_id IS NOT NULL
        AND (t.reference_type IS NULL OR t.reference_type != 'SALE')
        AND COALESCE(t.transaction_date, t.created_at) >= ${start}
        AND COALESCE(t.transaction_date, t.created_at) <= ${end}
      GROUP BY t.material_id
    ) txn_usage ON m.id = txn_usage.material_id
    LEFT JOIN (
      SELECT material_id, SUM(available_quantity) as total_qty
      FROM h_inventory_lots
      WHERE tenant_id = ${Number(tenantId)} AND status = 'available'
      GROUP BY material_id
    ) lot_stock ON m.id = lot_stock.material_id
    ${whereClause}
    GROUP BY m.id, m.material_code, m.material_name,
             batch_usage.total_qty, txn_usage.total_qty, lot_stock.total_qty
  `;
  
  const results: any = await db.execute(usageQuery);
  const rows = Array.isArray(results) && Array.isArray(results[0]) ? results[0] : results;

  return (rows as any[]).map((row: any) => {
    const usageQuantity = Number(row.usage_quantity) || 0;
    const avgInventory = Number(row.avg_inventory) || 1;
    const turnoverRate = usageQuantity / avgInventory;
    const averageHoldingPeriod = turnoverRate > 0 ? 365 / turnoverRate : 0;
    
    let efficiency: "high" | "medium" | "low" = "low";
    if (turnoverRate >= 12) efficiency = "high";
    else if (turnoverRate >= 6) efficiency = "medium";
    
    return {
      materialId: Number(row.material_id),
      materialCode: String(row.material_code),
      materialName: String(row.material_name),
      turnoverRate,
      averageHoldingPeriod,
      usageQuantity,
      averageInventory: avgInventory,
      efficiency
    };
  });
}

/**
 * 재고 효율성 지표 계산
 * @param startDate 시작 날짜
 * @param endDate 종료 날짜
 * @param tenantId 테넌트 ID (멀티테넌트 격리)
 * @returns 재고 효율성 지표
 */
export async function calculateEfficiencyMetrics(
  startDate: Date | undefined,
  endDate: Date | undefined,
  tenantId: number
): Promise<{
  averageTurnoverRate: number;
  averageHoldingPeriod: number;
  highEfficiencyCount: number;
  mediumEfficiencyCount: number;
  lowEfficiencyCount: number;
  totalMaterials: number;
}> {
  const turnoverResults = await calculateInventoryTurnover(undefined, startDate, endDate, tenantId);
  const totalMaterials = turnoverResults.length;
  const highEfficiencyCount = turnoverResults.filter((r) => r.efficiency === "high").length;
  const mediumEfficiencyCount = turnoverResults.filter((r) => r.efficiency === "medium").length;
  const lowEfficiencyCount = turnoverResults.filter((r) => r.efficiency === "low").length;
  const averageTurnoverRate =
    totalMaterials > 0
      ? turnoverResults.reduce((sum, r) => sum + r.turnoverRate, 0) / totalMaterials
      : 0;
  const averageHoldingPeriod =
    averageTurnoverRate > 0 ? 365 / averageTurnoverRate : 0;

  return {
    averageTurnoverRate,
    averageHoldingPeriod,
    highEfficiencyCount,
    mediumEfficiencyCount,
    lowEfficiencyCount,
    totalMaterials
  };
}

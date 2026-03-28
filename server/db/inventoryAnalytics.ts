import { getDb } from "../db";
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
  
  // 기간 내 원재료 사용량 조회 (배치 투입 기준)
  const usageQuery = sql`
    SELECT 
      m.id as material_id,
      m.material_code,
      m.material_name,
      COALESCE(SUM(bi.quantity), 0) as usage_quantity,
      AVG(inv.total_quantity) as avg_inventory
    FROM h_materials m
    LEFT JOIN h_batch_inputs bi ON m.id = bi.material_id 
      AND bi.created_at >= ${start} AND bi.created_at <= ${end}
    LEFT JOIN h_inventory inv ON m.id = inv.material_id
    ${whereClause}
    GROUP BY m.id, m.material_code, m.material_name
  `;
  
  const results: any = await db.execute(usageQuery);
  
  return (results as any[]).map((row: any) => {
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

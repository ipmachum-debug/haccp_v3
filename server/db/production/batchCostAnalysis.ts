import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { getDb } from "../connection";
import { hBatches, hBatchInputs, hMaterials } from "../../../drizzle/schema";

import { formatLocalDate } from "../../utils/timezone";

/** 정제수(purified water) 여부 판별 - 가격 계산에서 제외 대상 */
function isWaterMaterial(materialName: string | null | undefined): boolean {
  if (!materialName) return false;
  const name = materialName.toLowerCase();
  return name.includes("정제수") || name.includes("purified water");
}

/**
 * 배치 생산 비용 분석
 */

export interface BatchCostSummary {
  batchId: number;
  batchCode: string;
  productId: number;
  plannedDate: Date;
  plannedCost: number;
  actualCost: number;
  costDifference: number;
  costDifferencePercent: number;
  status: "under_budget" | "on_budget" | "over_budget";
}

export interface MaterialCostBreakdown {
  materialId: number;
  materialName: string;
  plannedQuantity: number;
  actualQuantity: number;
  unitPrice: number;
  plannedCost: number;
  actualCost: number;
  costDifference: number;
}

export interface CostAnalysisPeriodSummary {
  period: string; // "2024-01" 형식
  totalBatches: number;
  totalPlannedCost: number;
  totalActualCost: number;
  totalCostDifference: number;
  avgCostDifferencePercent: number;
  underBudgetCount: number;
  onBudgetCount: number;
  overBudgetCount: number;
}

/**
 * 배치별 비용 분석 조회
 */
export async function getBatchCostAnalysis(params: {
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}, tenantId: number): Promise<BatchCostSummary[]> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { startDate, endDate, limit = 100 } = params;

  // 배치 조회 조건
  const conditions = [];
  conditions.push(eq(hBatches.tenantId, tenantId));
  if (startDate) {
    conditions.push(gte(hBatches.plannedDate, startDate));
  }
  if (endDate) {
    conditions.push(lte(hBatches.plannedDate, endDate));
  }

  const batches = await db
    .select({
      batchId: hBatches.id,
      batchCode: hBatches.batchCode,
      productId: hBatches.productId,
      plannedDate: hBatches.plannedDate,
      plannedCost: hBatches.plannedCost,
      actualCost: hBatches.actualCost
    })
    .from(hBatches)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(hBatches.plannedDate))
    .limit(limit);

  return batches.map((batch) => {
    const plannedCost = Number(batch.plannedCost || 0);
    const actualCost = Number(batch.actualCost || 0);
    const costDifference = actualCost - plannedCost;
    const costDifferencePercent =
      plannedCost > 0 ? (costDifference / plannedCost) * 100 : 0;

    let status: "under_budget" | "on_budget" | "over_budget" = "on_budget";
    if (costDifferencePercent < -5) {
      status = "under_budget";
    } else if (costDifferencePercent > 5) {
      status = "over_budget";
    }

    return {
      batchId: batch.batchId,
      batchCode: batch.batchCode,
      productId: batch.productId,
      plannedDate: new Date(batch.plannedDate),
      plannedCost,
      actualCost,
      costDifference,
      costDifferencePercent: Math.round(costDifferencePercent * 100) / 100,
      status
    };
  });
}

/**
 * 특정 배치의 원재료별 비용 분석
 */
export async function getBatchMaterialCostBreakdown(
  batchId: number, tenantId: number): Promise<MaterialCostBreakdown[]> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // h_batch_inputs.unitPrice (FEFO LOT 실제단가) 우선, 없으면 h_materials.unitPrice (마스터 단가) 폴백
  const batchInputs = await db
    .select({
      materialId: hBatchInputs.materialId,
      materialName: hMaterials.materialName,
      plannedQuantity: hBatchInputs.plannedQuantity,
      actualQuantity: hBatchInputs.actualQuantity,
      lotUnitPrice: hBatchInputs.unitPrice,       // FEFO LOT 실제단가
      lotTotalPrice: hBatchInputs.totalPrice,      // FEFO LOT 실제원가
      masterUnitPrice: hMaterials.unitPrice         // 마스터 단가 (폴백)
    })
    .from(hBatchInputs)
    .leftJoin(hMaterials, eq(hBatchInputs.materialId, hMaterials.id))
    .where(eq(hBatchInputs.batchId, batchId));

  return batchInputs.map((input) => {
    const plannedQuantity = Number(input.plannedQuantity || 0);
    const actualQuantity = Number(input.actualQuantity || 0);
    const water = isWaterMaterial(input.materialName);

    // 단가 우선순위: LOT 실제단가 → 마스터 단가
    const lotPrice = input.lotUnitPrice ? Number(input.lotUnitPrice) : null;
    const masterPrice = input.masterUnitPrice ? Number(input.masterUnitPrice) : 0;
    const unitPrice = water ? 0 : (lotPrice ?? masterPrice);
    const priceSource = water ? "excluded" : (lotPrice !== null ? "lot" : "master");

    const plannedCost = plannedQuantity * unitPrice;
    // 실제원가: LOT total_price가 있으면 직접 사용 (FEFO 가중평균)
    const lotTotal = input.lotTotalPrice ? Number(input.lotTotalPrice) : null;
    const actualCost = water ? 0 : (lotTotal ?? actualQuantity * unitPrice);
    const costDifference = actualCost - plannedCost;

    return {
      materialId: input.materialId,
      materialName: input.materialName || "Unknown",
      plannedQuantity,
      actualQuantity,
      unitPrice,
      plannedCost: Math.round(plannedCost * 100) / 100,
      actualCost: Math.round(actualCost * 100) / 100,
      costDifference: Math.round(costDifference * 100) / 100,
      isWater: water,
      priceSource  // "lot" | "master" | "excluded"
    };
  });
}

/**
 * 기간별 비용 분석 집계
 */
export async function getCostAnalysisPeriodSummary(params: {
  startDate: Date;
  endDate: Date;
  groupBy: "month" | "week" | "day";
}, tenantId: number): Promise<CostAnalysisPeriodSummary[]> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { startDate, endDate, groupBy } = params;

  // 배치 조회
  const batches = await db
    .select({
      plannedDate: hBatches.plannedDate,
      plannedCost: hBatches.plannedCost,
      actualCost: hBatches.actualCost
    })
    .from(hBatches)
    .where(
      and(eq(hBatches.tenantId, tenantId as any) , 
        gte(hBatches.plannedDate, startDate),
        lte(hBatches.plannedDate, endDate)
      ) as any
    );

  // 기간별 그룹화
  const periodMap: { [period: string]: BatchCostSummary[] } = {};

  batches.forEach((batch) => {
    const date = new Date(batch.plannedDate);
    let period: string;

    if (groupBy === "month") {
      period = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    } else if (groupBy === "week") {
      const weekNumber = getWeekNumber(date);
      period = `${date.getFullYear()}-W${String(weekNumber).padStart(2, "0")}`;
    } else {
      period = formatLocalDate(date);
    }

    if (!periodMap[period]) {
      periodMap[period] = [];
    }

    const plannedCost = Number(batch.plannedCost || 0);
    const actualCost = Number(batch.actualCost || 0);
    const costDifference = actualCost - plannedCost;
    const costDifferencePercent =
      plannedCost > 0 ? (costDifference / plannedCost) * 100 : 0;

    let status: "under_budget" | "on_budget" | "over_budget" = "on_budget";
    if (costDifferencePercent < -5) {
      status = "under_budget";
    } else if (costDifferencePercent > 5) {
      status = "over_budget";
    }

    periodMap[period].push({
      batchId: 0,
      batchCode: "",
      productId: 0,
      plannedDate: date,
      plannedCost,
      actualCost,
      costDifference,
      costDifferencePercent,
      status
    });
  });

  // 기간별 집계
  const summaries: CostAnalysisPeriodSummary[] = [];

  Object.keys(periodMap)
    .sort()
    .forEach((period) => {
      const periodBatches = periodMap[period];
      const totalBatches = periodBatches.length;
      const totalPlannedCost = periodBatches.reduce(
        (sum, b) => sum + b.plannedCost,
        0
      );
      const totalActualCost = periodBatches.reduce(
        (sum, b) => sum + b.actualCost,
        0
      );
      const totalCostDifference = totalActualCost - totalPlannedCost;
      const avgCostDifferencePercent =
        totalPlannedCost > 0
          ? (totalCostDifference / totalPlannedCost) * 100
          : 0;

      const underBudgetCount = periodBatches.filter(
        (b) => b.status === "under_budget"
      ).length;
      const onBudgetCount = periodBatches.filter(
        (b) => b.status === "on_budget"
      ).length;
      const overBudgetCount = periodBatches.filter(
        (b) => b.status === "over_budget"
      ).length;

      summaries.push({
        period,
        totalBatches,
        totalPlannedCost: Math.round(totalPlannedCost * 100) / 100,
        totalActualCost: Math.round(totalActualCost * 100) / 100,
        totalCostDifference: Math.round(totalCostDifference * 100) / 100,
        avgCostDifferencePercent:
          Math.round(avgCostDifferencePercent * 100) / 100,
        underBudgetCount,
        onBudgetCount,
        overBudgetCount
      });
    });

  return summaries;
}

/**
 * 원재료별 비용 분석 (모든 배치 통합)
 */
export async function getMaterialCostAnalysis(params: {
  startDate?: Date;
  endDate?: Date;
}, tenantId: number): Promise<{
  materialId: number;
  materialName: string;
  totalBatches: number;
  totalPlannedQuantity: number;
  totalActualQuantity: number;
  avgUnitPrice: number;
  totalPlannedCost: number;
  totalActualCost: number;
  totalCostDifference: number;
}[]> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { startDate, endDate } = params;

  // 배치 조건
  const batchConditions = [];
  batchConditions.push(eq(hBatches.tenantId, tenantId));
  if (startDate) {
    batchConditions.push(gte(hBatches.plannedDate, startDate));
  }
  if (endDate) {
    batchConditions.push(lte(hBatches.plannedDate, endDate));
  }

  // 배치 입력 데이터 조회
  const batchInputs = await db
    .select({
      batchId: hBatchInputs.batchId,
      materialId: hBatchInputs.materialId,
      materialName: hMaterials.materialName,
      plannedQuantity: hBatchInputs.plannedQuantity,
      actualQuantity: hBatchInputs.actualQuantity,
      unitPrice: hMaterials.unitPrice,
      plannedDate: hBatches.plannedDate
    })
    .from(hBatchInputs)
    .leftJoin(hMaterials, eq(hBatchInputs.materialId, hMaterials.id))
    .leftJoin(hBatches, eq(hBatchInputs.batchId, hBatches.id))
    .where(
      batchConditions.length > 0 ? and(...batchConditions) : undefined
    );

  // 원재료별 집계
  const materialMap: {
    [materialId: number]: {
      materialName: string;
      batches: Set<number>;
      totalPlannedQuantity: number;
      totalActualQuantity: number;
      unitPrices: number[];
      totalPlannedCost: number;
      totalActualCost: number;
    };
  } = {};

  batchInputs.forEach((input) => {
    const materialId = input.materialId;
    const plannedQuantity = Number(input.plannedQuantity || 0);
    const actualQuantity = Number(input.actualQuantity || 0);
    // 정제수는 가격 계산에서 제외
    const unitPrice = isWaterMaterial(input.materialName) ? 0 : Number(input.unitPrice || 0);

    if (!materialMap[materialId]) {
      materialMap[materialId] = {
        materialName: input.materialName || "Unknown",
        batches: new Set(),
        totalPlannedQuantity: 0,
        totalActualQuantity: 0,
        unitPrices: [],
        totalPlannedCost: 0,
        totalActualCost: 0
      };
    }

    materialMap[materialId].batches.add(input.batchId);
    materialMap[materialId].totalPlannedQuantity += plannedQuantity;
    materialMap[materialId].totalActualQuantity += actualQuantity;
    materialMap[materialId].unitPrices.push(unitPrice);
    materialMap[materialId].totalPlannedCost += plannedQuantity * unitPrice;
    materialMap[materialId].totalActualCost += actualQuantity * unitPrice;
  });

  // 결과 변환
  return Object.keys(materialMap).map((materialId) => {
    const material = materialMap[Number(materialId)];
    const avgUnitPrice =
      material.unitPrices.reduce((sum, p) => sum + p, 0) /
      material.unitPrices.length;

    return {
      materialId: Number(materialId),
      materialName: material.materialName,
      totalBatches: material.batches.size,
      totalPlannedQuantity: Math.round(material.totalPlannedQuantity * 100) / 100,
      totalActualQuantity: Math.round(material.totalActualQuantity * 100) / 100,
      avgUnitPrice: Math.round(avgUnitPrice * 100) / 100,
      totalPlannedCost: Math.round(material.totalPlannedCost * 100) / 100,
      totalActualCost: Math.round(material.totalActualCost * 100) / 100,
      totalCostDifference:
        Math.round((material.totalActualCost - material.totalPlannedCost) * 100) / 100
    };
  });
}

/**
 * 주차 계산 헬퍼 함수
 */
function getWeekNumber(date: Date): number {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

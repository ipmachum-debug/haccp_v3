/**
 * 레시피(BOM) 기반 배치 원가 계산
 *
 * 기존 h_recipes/recipe_lines 대신 h_mf_reports/h_mf_report_versions/h_mf_ingredients 사용.
 * API 시그니처는 기존과 동일하게 유지 (recipeId = mfReportId).
 */
import { getDb } from "../connection";
import {
  hMfReports,
  hMfReportVersions,
  hMfIngredients,
  itemMaster,
} from "../../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";

/** 정제수(purified water) 여부 판별 - 가격 계산에서 제외 대상 */
function isWaterMaterial(materialName: string | null | undefined): boolean {
  if (!materialName) return false;
  const name = materialName.toLowerCase();
  return name.includes("정제수") || name.includes("purified water");
}

// ─────────────────────────────────────────────────────────────
// 내부 헬퍼
// ─────────────────────────────────────────────────────────────

async function getLatestVersion(db: any, mfReportId: number) {
  const versions = await db
    .select()
    .from(hMfReportVersions)
    .where(eq(hMfReportVersions.mfReportId, mfReportId))
    .orderBy(desc(hMfReportVersions.versionNo))
    .limit(1);
  return versions.length > 0 ? versions[0] : null;
}

// ═══════════════════════════════════════════════════════════════
// 공개 API
// ═══════════════════════════════════════════════════════════════

/**
 * 레시피(BOM) 기반 배치 원가 계산
 * recipeId는 실제로 h_mf_reports.id 를 가리킵니다.
 */
export async function calculateRecipeCost(recipeId: number, _tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 최신 버전 조회
  const version = await getLatestVersion(db, recipeId);
  if (!version) {
    return {
      materialCost: 0,
      laborCost: 0,
      overheadCost: 0,
      totalCost: 0,
    };
  }

  // BOM 원재료 구성 조회 (itemMaster와 JOIN하여 가격 정보 포함)
  const ingredients = await db
    .select({
      materialId: hMfIngredients.materialId,
      quantity: hMfIngredients.correctedQuantity,
      rawQuantity: hMfIngredients.quantity,
      unit: hMfIngredients.unit,
      adjustedWeightKg: hMfIngredients.adjustedWeightKg,
      materialName: itemMaster.itemName,
      materialPrice: itemMaster.defaultUnitPrice,
    })
    .from(hMfIngredients)
    .leftJoin(itemMaster, eq(hMfIngredients.materialId, itemMaster.id))
    .where(eq(hMfIngredients.mfReportVersionId, version.id));

  // 원재료비 계산 (정제수 제외)
  let totalMaterialCost = 0;
  for (const ing of ingredients) {
    if (isWaterMaterial(ing.materialName)) continue;

    // correctedQuantity 우선, 없으면 adjustedWeightKg, 없으면 quantity
    const qty = parseFloat(ing.quantity || ing.adjustedWeightKg || ing.rawQuantity || "0");
    const unitPrice = parseFloat(ing.materialPrice || "0");
    totalMaterialCost += qty * unitPrice;
  }

  // 인건비 추정 (BOM에는 시간 정보가 없으므로 고정 비율 사용)
  // batchTargetKg 기준으로 추정: 10kg당 1시간
  const batchKg = parseFloat(version.batchTargetKg || "0");
  const estimatedHours = Math.max(batchKg / 10, 0.5);
  const laborCostPerHour = 15000;
  const laborCost = estimatedHours * laborCostPerHour;

  // 간접비 추정 (원재료비의 20%)
  const overheadCost = totalMaterialCost * 0.2;

  return {
    materialCost: Math.round(totalMaterialCost),
    laborCost: Math.round(laborCost),
    overheadCost: Math.round(overheadCost),
    totalCost: Math.round(totalMaterialCost + laborCost + overheadCost),
  };
}

/**
 * 제품별 원가 통계 계산
 * BOM(h_mf_reports) 기반으로 활성 보고서의 원가 집계
 */
export async function calculateProductCostStats(productId?: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 활성 BOM 목록 조회
  const conditions: any[] = [eq(hMfReports.status, "ACTIVE")];
  if (tenantId) {
    conditions.push(eq(hMfReports.tenantId, tenantId));
  }
  if (productId) {
    conditions.push(eq(hMfReports.productId, productId));
  }

  const reportList = await db
    .select()
    .from(hMfReports)
    .where(and(...conditions));

  if (reportList.length === 0) {
    return {
      totalRecipes: 0,
      avgMaterialCost: 0,
      avgLaborCost: 0,
      avgOverheadCost: 0,
      avgTotalCost: 0,
      costByRecipe: [],
    };
  }

  // 각 BOM별 원가 계산
  const costByRecipe = [];
  let totalMaterialCost = 0;
  let totalLaborCost = 0;
  let totalOverheadCost = 0;

  for (const report of reportList) {
    const cost = await calculateRecipeCost(report.id, tenantId);
    costByRecipe.push({
      recipeId: report.id,
      recipeName: report.reportNo || `BOM-${report.id}`,
      ...cost,
    });

    totalMaterialCost += cost.materialCost;
    totalLaborCost += cost.laborCost;
    totalOverheadCost += cost.overheadCost;
  }

  const count = reportList.length;

  return {
    totalRecipes: count,
    avgMaterialCost: Math.round(totalMaterialCost / count),
    avgLaborCost: Math.round(totalLaborCost / count),
    avgOverheadCost: Math.round(totalOverheadCost / count),
    avgTotalCost: Math.round(
      (totalMaterialCost + totalLaborCost + totalOverheadCost) / count,
    ),
    costByRecipe,
  };
}

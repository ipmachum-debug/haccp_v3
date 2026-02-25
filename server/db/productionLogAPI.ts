import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { hProductionLog, hInventoryDeductionLog } from "../../drizzle/schema_recipe_new";

/**
 * 품목제조보고 버전별 생산 이력 조회
 */
export async function getProductionLogsByVersionId(versionId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const logs = await db
    .select()
    .from(hProductionLog)
    .where(eq(hProductionLog.mfReportVersionId, versionId))
    .orderBy(hProductionLog.createdAt);

  return logs;
}

/**
 * 생산 이력별 재고 차감 이력 조회
 */
export async function getInventoryDeductionLogsByProductionId(productionLogId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const logs = await db
    .select()
    .from(hInventoryDeductionLog)
    .where(eq(hInventoryDeductionLog.productionLogId, productionLogId))
    .orderBy(hInventoryDeductionLog.deductionDate);

  return logs;
}

/**
 * 품목제조보고 버전별 모든 재고 차감 이력 조회 (생산 이력 포함)
 */
export async function getAllInventoryDeductionLogsByVersionId(versionId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  // 1. 생산 이력 조회
  const productionLogs = await getProductionLogsByVersionId(versionId);

  // 2. 각 생산 이력별 재고 차감 이력 조회
  const allDeductionLogs = [];
  for (const productionLog of productionLogs) {
    const deductionLogs = await getInventoryDeductionLogsByProductionId(productionLog.id);
    allDeductionLogs.push(...deductionLogs.map((log: any) => ({
      ...log,
      productionDate: productionLog.productionDate,
      batchSizeKg: productionLog.batchSizeKg
    })));
  }

  return allDeductionLogs;
}

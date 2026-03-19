import { eq, and } from "drizzle-orm";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { hProductionLog, hInventoryDeductionLog } from "../../drizzle/schema_recipe_new";

/**
 * 품목제조보고 버전별 생산 이력 조회 (tenant 격리)
 */
export async function getProductionLogsByVersionId(tenantId: number, versionId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  // hProductionLog에는 tenant_id가 없으므로 hMfReportVersions -> hMfReports를 통해 tenant 격리
  const logs = await db.execute(sql`
    SELECT pl.*
    FROM h_production_log pl
    INNER JOIN h_mf_report_versions rv ON pl.mf_report_version_id = rv.id
    INNER JOIN h_mf_reports r ON rv.mf_report_id = r.id
    WHERE pl.mf_report_version_id = ${versionId}
      AND r.tenant_id = ${tenantId}
    ORDER BY pl.created_at ASC
  `);

  return logs;
}

/**
 * 생산 이력별 재고 차감 이력 조회 (tenant 격리)
 */
export async function getInventoryDeductionLogsByProductionId(tenantId: number, productionLogId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  // hInventoryDeductionLog -> hProductionLog -> hMfReportVersions -> hMfReports를 통해 tenant 격리
  const logs = await db.execute(sql`
    SELECT idl.*
    FROM h_inventory_deduction_log idl
    INNER JOIN h_production_log pl ON idl.production_log_id = pl.id
    INNER JOIN h_mf_report_versions rv ON pl.mf_report_version_id = rv.id
    INNER JOIN h_mf_reports r ON rv.mf_report_id = r.id
    WHERE idl.production_log_id = ${productionLogId}
      AND r.tenant_id = ${tenantId}
    ORDER BY idl.deduction_date ASC
  `);

  return logs;
}

/**
 * 품목제조보고 버전별 모든 재고 차감 이력 조회 (생산 이력 포함, tenant 격리)
 */
export async function getAllInventoryDeductionLogsByVersionId(tenantId: number, versionId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  // 1. 생산 이력 조회 (tenant 격리 적용)
  const productionLogs = await getProductionLogsByVersionId(tenantId, versionId) as any[];

  // 2. 각 생산 이력별 재고 차감 이력 조회 (tenant 격리 적용)
  const allDeductionLogs = [];
  for (const productionLog of productionLogs) {
    const deductionLogs = await getInventoryDeductionLogsByProductionId(tenantId, productionLog.id) as any[];
    allDeductionLogs.push(...deductionLogs.map((log: any) => ({
      ...log,
      productionDate: productionLog.production_date,
      batchSizeKg: productionLog.batch_size_kg
    })));
  }

  return allDeductionLogs;
}

/**
 * 마이그레이션: mfReport 혼합 type 지원 — PR #299
 *
 * 1. h_mf_reports 에 report_type ENUM('BASIC','MIXED') 추가
 * 2. h_mf_ingredients 에 child_sku_id, piece_count, piece_weight_g 추가
 *
 * 멱등 (INFORMATION_SCHEMA 체크).
 *
 * 실행:
 *   npx tsx scripts/migrate-mfreport-mixed-type.ts
 */

import mysql from "mysql2/promise";
import { getDbConfigFromEnv } from "./_lib/db-env.js";

async function migrate() {
  const conn = await mysql.createConnection(getDbConfigFromEnv(process.env));
  console.log("=== 마이그레이션 시작: mfReport 혼합 type (PR #299) ===\n");

  const checkCol = async (table: string, col: string) => {
    const [rows]: any = await conn.execute(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, col],
    );
    return (rows as any[]).length > 0;
  };

  // ─────────────────────────────────────────────────────
  // 1. h_mf_reports.report_type
  // ─────────────────────────────────────────────────────
  if (await checkCol("h_mf_reports", "report_type")) {
    console.log("✅ h_mf_reports.report_type 이미 존재 — 스킵");
  } else {
    console.log("→ h_mf_reports.report_type 컬럼 추가 중...");
    await conn.execute(
      `ALTER TABLE h_mf_reports
         ADD COLUMN report_type VARCHAR(20) NOT NULL DEFAULT 'BASIC' AFTER status,
         ADD INDEX idx_mfr_report_type (tenant_id, report_type)`,
    );
    console.log("✅ h_mf_reports.report_type 추가 완료 (기존 보고서는 BASIC 으로 분류)");
  }

  // ─────────────────────────────────────────────────────
  // 2. h_mf_ingredients 의 child SKU 컬럼들
  // ─────────────────────────────────────────────────────
  if (await checkCol("h_mf_ingredients", "child_sku_id")) {
    console.log("✅ h_mf_ingredients.child_sku_id 이미 존재 — 스킵");
  } else {
    console.log("→ h_mf_ingredients child SKU 컬럼들 추가 중...");
    await conn.execute(
      `ALTER TABLE h_mf_ingredients
         ADD COLUMN child_sku_id BIGINT NULL AFTER intermediate_id,
         ADD COLUMN piece_count INT NULL AFTER child_sku_id,
         ADD COLUMN piece_weight_g DECIMAL(10,2) NULL AFTER piece_count,
         ADD INDEX idx_mfi_child_sku (child_sku_id)`,
    );
    console.log("✅ h_mf_ingredients child_sku_id + piece_count + piece_weight_g 추가 완료");
  }

  console.log("\n=== 마이그레이션 완료 ===");
  await conn.end();
}

migrate().catch((err) => {
  console.error("치명 오류:", err);
  process.exit(1);
});

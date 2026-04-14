/**
 * Phase B-1: partners 확장 + partner_prices 테이블 생성
 * ═══════════════════════════════════════════════════════════════
 * 실행:
 *   npx tsx scripts/migrate-phase-b-partner-prices.ts
 *
 * Dry run:
 *   DRY_RUN=1 npx tsx scripts/migrate-phase-b-partner-prices.ts
 * ═══════════════════════════════════════════════════════════════
 */

import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) dotenv.config({ path: envPath });

const DRY_RUN = process.env.DRY_RUN === "1";

async function columnExists(
  conn: mysql.Connection,
  table: string,
  col: string,
): Promise<boolean> {
  const [rows]: any = await conn.execute(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, col],
  );
  return (rows as any[]).length > 0;
}

async function tableExists(conn: mysql.Connection, table: string): Promise<boolean> {
  const [rows]: any = await conn.execute(
    `SELECT TABLE_NAME FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table],
  );
  return (rows as any[]).length > 0;
}

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "3306"),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "haccp_tenant_db",
  });

  console.log(`🔗 DB 연결 완료 ${DRY_RUN ? "(DRY RUN)" : ""}`);

  try {
    // ─────────────────────────────────────────────────────
    // Step 1. partners 테이블 확장 (4개 컬럼 추가)
    // ─────────────────────────────────────────────────────
    console.log("\n📋 Step 1: partners 컬럼 확장");
    const newCols = [
      { name: "grade", def: "VARCHAR(20) NULL", after: "bank_account" },
      { name: "payment_terms_days", def: "INT NULL", after: "grade" },
      { name: "credit_limit", def: "DECIMAL(15,2) NULL", after: "payment_terms_days" },
      { name: "default_discount_rate", def: "DECIMAL(5,2) NULL", after: "credit_limit" },
    ];

    for (const col of newCols) {
      const exists = await columnExists(conn, "partners", col.name);
      if (exists) {
        console.log(`  · partners.${col.name}: 이미 존재`);
        continue;
      }
      if (DRY_RUN) {
        console.log(`  · [DRY] partners.${col.name} ADD ${col.def}`);
      } else {
        await conn.execute(
          `ALTER TABLE partners ADD COLUMN \`${col.name}\` ${col.def} AFTER \`${col.after}\``,
        );
        console.log(`  ✓ partners.${col.name} 추가 완료`);
      }
    }

    // ─────────────────────────────────────────────────────
    // Step 1-b. ap_ledger.due_date 추가 (AR 는 이미 존재)
    // ─────────────────────────────────────────────────────
    console.log("\n📋 Step 1-b: ap_ledger.due_date 추가");
    const apDueExists = await columnExists(conn, "ap_ledger", "due_date");
    if (apDueExists) {
      console.log("  · ap_ledger.due_date: 이미 존재");
    } else if (DRY_RUN) {
      console.log("  · [DRY] ap_ledger.due_date ADD DATE NULL");
    } else {
      await conn.execute(
        `ALTER TABLE ap_ledger ADD COLUMN \`due_date\` DATE NULL AFTER \`amount\``,
      );
      console.log("  ✓ ap_ledger.due_date 추가 완료");
    }

    // ─────────────────────────────────────────────────────
    // Step 2. partner_prices 테이블 생성
    // ─────────────────────────────────────────────────────
    console.log("\n📋 Step 2: partner_prices 테이블 생성");
    const ppExists = await tableExists(conn, "partner_prices");

    if (ppExists) {
      console.log("  · partner_prices 이미 존재");
    } else if (DRY_RUN) {
      console.log("  · [DRY] CREATE TABLE partner_prices ...");
    } else {
      await conn.execute(`
        CREATE TABLE partner_prices (
          id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          tenant_id INT NOT NULL DEFAULT 1,
          partner_id BIGINT NOT NULL,
          target_type ENUM('material','product') NOT NULL,
          material_id BIGINT NULL,
          product_id BIGINT NULL,
          item_name VARCHAR(255) NOT NULL,
          item_code VARCHAR(100) NULL,
          unit_price DECIMAL(15, 2) NOT NULL,
          currency VARCHAR(3) NOT NULL DEFAULT 'KRW',
          discount_rate DECIMAL(5, 2) NULL DEFAULT '0.00',
          effective_from DATE NOT NULL,
          effective_to DATE NULL,
          notes TEXT NULL,
          is_active TINYINT NOT NULL DEFAULT 1,
          created_by BIGINT NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_pp_partner_material (tenant_id, partner_id, material_id, effective_from),
          UNIQUE KEY uq_pp_partner_product (tenant_id, partner_id, product_id, effective_from),
          INDEX idx_pp_tenant_partner (tenant_id, partner_id),
          INDEX idx_pp_material (material_id),
          INDEX idx_pp_product (product_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      console.log("  ✓ partner_prices 생성 완료");
    }

    console.log("\n🎉 마이그레이션 완료!");
  } catch (err) {
    console.error("\n❌ 마이그레이션 실패:", err);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

main();

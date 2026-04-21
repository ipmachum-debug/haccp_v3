/**
 * Phase C-1: quotations + quotation_lines 테이블 생성
 * ═══════════════════════════════════════════════════════════════
 * 실행:
 *   npx tsx scripts/migrate-phase-c-quotations.ts
 *
 * Dry run:
 *   DRY_RUN=1 npx tsx scripts/migrate-phase-c-quotations.ts
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
    // Step 1. quotations 테이블
    // ─────────────────────────────────────────────────────
    console.log("\n📋 Step 1: quotations 테이블 생성");
    if (await tableExists(conn, "quotations")) {
      console.log("  · quotations 이미 존재");
    } else if (DRY_RUN) {
      console.log("  · [DRY] CREATE TABLE quotations ...");
    } else {
      await conn.execute(`
        CREATE TABLE quotations (
          id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          tenant_id INT NOT NULL DEFAULT 1,
          quotation_number VARCHAR(50) NOT NULL,
          partner_id BIGINT NOT NULL,
          quote_date VARCHAR(10) NOT NULL,
          valid_until VARCHAR(10) NULL,
          title VARCHAR(255) NULL,
          total_amount DECIMAL(15, 2) NOT NULL DEFAULT '0.00',
          tax_amount DECIMAL(15, 2) NOT NULL DEFAULT '0.00',
          grand_total DECIMAL(15, 2) NOT NULL DEFAULT '0.00',
          discount_amount DECIMAL(15, 2) NULL DEFAULT '0.00',
          status ENUM('draft','sent','accepted','rejected','expired','converted','cancelled')
            NOT NULL DEFAULT 'draft',
          converted_sale_id BIGINT NULL,
          converted_po_id BIGINT NULL,
          converted_at TIMESTAMP NULL,
          sent_at TIMESTAMP NULL,
          sent_by BIGINT NULL,
          accepted_at TIMESTAMP NULL,
          rejected_at TIMESTAMP NULL,
          reject_reason TEXT NULL,
          payment_terms VARCHAR(255) NULL,
          delivery_terms VARCHAR(255) NULL,
          notes TEXT NULL,
          created_by BIGINT NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_quo_tenant_number (tenant_id, quotation_number),
          INDEX idx_quo_tenant_status (tenant_id, status),
          INDEX idx_quo_partner (partner_id),
          INDEX idx_quo_quote_date (quote_date)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      console.log("  ✓ quotations 생성 완료");
    }

    // ─────────────────────────────────────────────────────
    // Step 2. quotation_lines 테이블
    // ─────────────────────────────────────────────────────
    console.log("\n📋 Step 2: quotation_lines 테이블 생성");
    if (await tableExists(conn, "quotation_lines")) {
      console.log("  · quotation_lines 이미 존재");
    } else if (DRY_RUN) {
      console.log("  · [DRY] CREATE TABLE quotation_lines ...");
    } else {
      await conn.execute(`
        CREATE TABLE quotation_lines (
          id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          tenant_id INT NOT NULL DEFAULT 1,
          quotation_id BIGINT NOT NULL,
          line_number INT NOT NULL,
          target_type ENUM('material','product','service') NOT NULL DEFAULT 'product',
          material_id BIGINT NULL,
          product_id BIGINT NULL,
          item_name VARCHAR(255) NOT NULL,
          item_code VARCHAR(100) NULL,
          description TEXT NULL,
          quantity DECIMAL(10, 3) NOT NULL,
          unit VARCHAR(20) NOT NULL DEFAULT 'EA',
          unit_price DECIMAL(15, 2) NOT NULL,
          discount_rate DECIMAL(5, 2) NULL DEFAULT '0.00',
          amount DECIMAL(15, 2) NOT NULL,
          tax_amount DECIMAL(15, 2) NULL DEFAULT '0.00',
          notes TEXT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_quo_line (quotation_id, line_number),
          INDEX idx_qol_product (product_id),
          INDEX idx_qol_material (material_id),
          INDEX idx_qol_tenant_quo (tenant_id, quotation_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      console.log("  ✓ quotation_lines 생성 완료");
    }

    console.log("\n🎉 Phase C-1 마이그레이션 완료!");
  } catch (err) {
    console.error("\n❌ 마이그레이션 실패:", err);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

main();

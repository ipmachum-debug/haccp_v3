/**
 * Phase C-2: tax_invoices + tax_invoice_lines + popbill_settings 테이블 생성
 * ═══════════════════════════════════════════════════════════════
 * 실행:
 *   npx tsx scripts/migrate-phase-c-tax-invoices.ts
 *
 * Dry run:
 *   DRY_RUN=1 npx tsx scripts/migrate-phase-c-tax-invoices.ts
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
    // Step 1. tax_invoices
    // ─────────────────────────────────────────────────────
    console.log("\n📋 Step 1: tax_invoices 테이블 생성");
    if (await tableExists(conn, "tax_invoices")) {
      console.log("  · tax_invoices 이미 존재");
    } else if (DRY_RUN) {
      console.log("  · [DRY] CREATE TABLE tax_invoices ...");
    } else {
      await conn.execute(`
        CREATE TABLE tax_invoices (
          id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          tenant_id INT NOT NULL DEFAULT 1,
          invoice_number VARCHAR(50) NOT NULL,
          invoice_type ENUM('sales','purchase') NOT NULL,
          tax_category ENUM('taxed','zero_rated','tax_free') NOT NULL DEFAULT 'taxed',
          receipt_type ENUM('invoice','receipt') NOT NULL DEFAULT 'invoice',
          partner_id BIGINT NOT NULL,
          partner_biz_no VARCHAR(13) NULL,
          partner_name VARCHAR(255) NULL,
          partner_ceo VARCHAR(100) NULL,
          partner_address VARCHAR(500) NULL,
          issuer_biz_no VARCHAR(13) NULL,
          issuer_name VARCHAR(255) NULL,
          issue_date VARCHAR(10) NOT NULL,
          supply_date VARCHAR(10) NULL,
          supply_amount DECIMAL(15, 2) NOT NULL DEFAULT '0.00',
          tax_amount DECIMAL(15, 2) NOT NULL DEFAULT '0.00',
          total_amount DECIMAL(15, 2) NOT NULL DEFAULT '0.00',
          status ENUM('draft','issued','sent_to_popbill','approved','rejected','cancelled')
            NOT NULL DEFAULT 'draft',
          source_type ENUM('sale','quotation','purchase','manual') NULL,
          source_id BIGINT NULL,
          popbill_mgt_key VARCHAR(100) NULL,
          popbill_issue_id VARCHAR(100) NULL,
          popbill_response JSON NULL,
          notes TEXT NULL,
          remark1 VARCHAR(100) NULL,
          remark2 VARCHAR(100) NULL,
          remark3 VARCHAR(100) NULL,
          is_printed TINYINT NOT NULL DEFAULT 0,
          issued_by BIGINT NULL,
          issued_at TIMESTAMP NULL,
          cancelled_at TIMESTAMP NULL,
          cancel_reason TEXT NULL,
          created_by BIGINT NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_ti_tenant_number (tenant_id, invoice_number),
          INDEX idx_ti_tenant_type_status (tenant_id, invoice_type, status),
          INDEX idx_ti_partner (partner_id),
          INDEX idx_ti_issue_date (issue_date),
          INDEX idx_ti_popbill_mgt_key (popbill_mgt_key)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      console.log("  ✓ tax_invoices 생성 완료");
    }

    // ─────────────────────────────────────────────────────
    // Step 2. tax_invoice_lines
    // ─────────────────────────────────────────────────────
    console.log("\n📋 Step 2: tax_invoice_lines 테이블 생성");
    if (await tableExists(conn, "tax_invoice_lines")) {
      console.log("  · tax_invoice_lines 이미 존재");
    } else if (DRY_RUN) {
      console.log("  · [DRY] CREATE TABLE tax_invoice_lines ...");
    } else {
      await conn.execute(`
        CREATE TABLE tax_invoice_lines (
          id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          tenant_id INT NOT NULL DEFAULT 1,
          tax_invoice_id BIGINT NOT NULL,
          line_number INT NOT NULL,
          item_name VARCHAR(255) NOT NULL,
          item_spec VARCHAR(100) NULL,
          quantity DECIMAL(10, 3) NULL,
          unit VARCHAR(20) NULL,
          unit_price DECIMAL(15, 2) NULL,
          supply_amount DECIMAL(15, 2) NOT NULL,
          tax_amount DECIMAL(15, 2) NULL DEFAULT '0.00',
          notes TEXT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uq_til_line (tax_invoice_id, line_number),
          INDEX idx_til_tenant_invoice (tenant_id, tax_invoice_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      console.log("  ✓ tax_invoice_lines 생성 완료");
    }

    // ─────────────────────────────────────────────────────
    // Step 3. popbill_settings
    // ─────────────────────────────────────────────────────
    console.log("\n📋 Step 3: popbill_settings 테이블 생성");
    if (await tableExists(conn, "popbill_settings")) {
      console.log("  · popbill_settings 이미 존재");
    } else if (DRY_RUN) {
      console.log("  · [DRY] CREATE TABLE popbill_settings ...");
    } else {
      await conn.execute(`
        CREATE TABLE popbill_settings (
          tenant_id INT NOT NULL PRIMARY KEY,
          corp_num VARCHAR(13) NOT NULL,
          user_id VARCHAR(50) NULL,
          is_enabled TINYINT NOT NULL DEFAULT 0,
          is_test_mode TINYINT NOT NULL DEFAULT 1,
          contact_name VARCHAR(100) NULL,
          contact_email VARCHAR(100) NULL,
          contact_phone VARCHAR(50) NULL,
          balance_cached DECIMAL(12, 2) NULL DEFAULT '0.00',
          last_balance_check TIMESTAMP NULL,
          is_member TINYINT NOT NULL DEFAULT 0,
          last_sync_at TIMESTAMP NULL,
          notes TEXT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      console.log("  ✓ popbill_settings 생성 완료");
    }

    console.log("\n🎉 Phase C-2 마이그레이션 완료!");
  } catch (err) {
    console.error("\n❌ 마이그레이션 실패:", err);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

main();

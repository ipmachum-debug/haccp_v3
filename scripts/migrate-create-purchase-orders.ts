/**
 * Phase A-1: purchase_orders + purchase_order_lines 테이블 생성
 * ═══════════════════════════════════════════════════════════════
 * 실행:
 *   npx tsx scripts/migrate-create-purchase-orders.ts
 *
 * Dry run:
 *   DRY_RUN=1 npx tsx scripts/migrate-create-purchase-orders.ts
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
    // 1. purchase_orders 테이블 생성
    const [poRows]: any = await conn.execute(`
      SELECT TABLE_NAME FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'purchase_orders'
    `);
    const poExists = (poRows as any[]).length > 0;
    console.log(`purchase_orders: ${poExists ? "존재" : "없음 → 생성"}`);

    if (!poExists) {
      if (DRY_RUN) {
        console.log("  [DRY RUN] CREATE TABLE purchase_orders 스킵");
      } else {
        await conn.execute(`
          CREATE TABLE purchase_orders (
            id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            tenant_id INT NOT NULL DEFAULT 1,
            po_number VARCHAR(50) NOT NULL,
            partner_id BIGINT NOT NULL,
            order_date VARCHAR(10) NOT NULL,
            expected_delivery_date VARCHAR(10) NULL,
            delivery_address VARCHAR(500) NULL,
            total_amount DECIMAL(15, 2) NOT NULL DEFAULT '0.00',
            tax_amount DECIMAL(15, 2) NOT NULL DEFAULT '0.00',
            grand_total DECIMAL(15, 2) NOT NULL DEFAULT '0.00',
            status ENUM('draft','approved','partial_received','received','cancelled') NOT NULL DEFAULT 'draft',
            approved_by BIGINT NULL,
            approved_at TIMESTAMP NULL,
            cancelled_by BIGINT NULL,
            cancelled_at TIMESTAMP NULL,
            cancel_reason TEXT NULL,
            notes TEXT NULL,
            created_by BIGINT NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_po_tenant_number (tenant_id, po_number),
            INDEX idx_po_tenant_status (tenant_id, status),
            INDEX idx_po_partner (partner_id),
            INDEX idx_po_order_date (order_date)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        console.log("  ✓ purchase_orders 생성 완료");
      }
    }

    // 2. purchase_order_lines 테이블 생성
    const [polRows]: any = await conn.execute(`
      SELECT TABLE_NAME FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'purchase_order_lines'
    `);
    const polExists = (polRows as any[]).length > 0;
    console.log(`purchase_order_lines: ${polExists ? "존재" : "없음 → 생성"}`);

    if (!polExists) {
      if (DRY_RUN) {
        console.log("  [DRY RUN] CREATE TABLE purchase_order_lines 스킵");
      } else {
        await conn.execute(`
          CREATE TABLE purchase_order_lines (
            id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            tenant_id INT NOT NULL DEFAULT 1,
            po_id BIGINT NOT NULL,
            line_number INT NOT NULL,
            material_id BIGINT NULL,
            item_name VARCHAR(255) NOT NULL,
            item_code VARCHAR(100) NULL,
            ordered_qty DECIMAL(10, 3) NOT NULL,
            received_qty DECIMAL(10, 3) NOT NULL DEFAULT '0.000',
            unit VARCHAR(20) NOT NULL,
            unit_price DECIMAL(15, 2) NOT NULL,
            amount DECIMAL(15, 2) NOT NULL,
            tax_amount DECIMAL(15, 2) NULL DEFAULT '0.00',
            expected_delivery_date VARCHAR(10) NULL,
            notes TEXT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_po_line (po_id, line_number),
            INDEX idx_pol_material (material_id),
            INDEX idx_pol_tenant_po (tenant_id, po_id)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        console.log("  ✓ purchase_order_lines 생성 완료");
      }
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

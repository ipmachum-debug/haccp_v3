/**
 * accounting_sales 테이블에 material_id FK 컬럼 추가 (Phase 8+)
 * ═══════════════════════════════════════════════════════════════
 * 목적:
 *   자사제품(product_id) 뿐 아니라 원재료/부자재/외부제품 매출도
 *   재고 차감 + COGS 분개에 연동하기 위해 accounting_sales 에
 *   material_id FK 컬럼을 추가한다.
 *
 *   XOR 관계: 매출 1건에 product_id 또는 material_id 중 하나만 설정
 *   (완제품 매출 = product_id, 원재료/부자재/외부제품 매출 = material_id)
 *
 * 마이그레이션 내용:
 *   1. accounting_sales.material_id 컬럼 추가 (BIGINT NULL)
 *   2. idx_sales_material_id 인덱스 추가
 *   (기존 매출은 전부 완제품 가정 — 백필 불필요, 추후 원재료 매출 발생시부터 사용)
 *
 * 실행:
 *   npx tsx scripts/migrate-add-material-id-to-sales.ts
 *
 * Dry run:
 *   DRY_RUN=1 npx tsx scripts/migrate-add-material-id-to-sales.ts
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
    // Step 1: 컬럼 존재 확인
    console.log("\n📋 Step 1: accounting_sales.material_id 컬럼 확인");
    const [colRows]: any = await conn.execute(`
      SELECT COLUMN_NAME
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'accounting_sales'
        AND COLUMN_NAME = 'material_id'
    `);
    const colExists = (colRows as any[]).length > 0;
    console.log(`  material_id 컬럼: ${colExists ? "이미 존재" : "없음 (추가 필요)"}`);

    if (!colExists) {
      if (DRY_RUN) {
        console.log("  ⚠️  DRY RUN: ALTER TABLE 스킵");
      } else {
        console.log("  ➕ ALTER TABLE 실행 중...");
        await conn.execute(`
          ALTER TABLE accounting_sales
          ADD COLUMN material_id BIGINT NULL AFTER product_id,
          ADD INDEX idx_sales_material_id (material_id)
        `);
        console.log("  ✓ material_id 컬럼 + 인덱스 추가 완료");
      }
    }

    // Step 2: 상태 확인
    console.log("\n📋 Step 2: accounting_sales 현재 상태");
    const [statRows]: any = await conn.execute(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN product_id IS NOT NULL THEN 1 ELSE 0 END) AS with_product,
        SUM(CASE WHEN material_id IS NOT NULL THEN 1 ELSE 0 END) AS with_material,
        SUM(CASE WHEN product_id IS NULL AND material_id IS NULL THEN 1 ELSE 0 END) AS orphan
      FROM accounting_sales
    `);
    const stat: any = statRows[0] || {};
    console.log(`  총 매출 전표: ${stat.total || 0} 건`);
    console.log(`  product_id 연결: ${stat.with_product || 0} 건`);
    console.log(`  material_id 연결: ${stat.with_material || 0} 건`);
    console.log(`  미연결 (legacy): ${stat.orphan || 0} 건`);

    console.log("\n═══════════════════════════════════════════");
    console.log("🎉 마이그레이션 완료!");
    console.log("═══════════════════════════════════════════");
    console.log(`  컬럼 추가: ${colExists ? "기존 (변경 없음)" : "신규"}`);
    console.log("  ※ 기존 매출은 완제품 가정 — 백필 불필요");
    console.log("  ※ 앞으로 원재료/부자재/외부제품 매출 발생 시부터");
    console.log("     accountingSales.create 가 material_id 를 설정하면 자동 차감됩니다.");
    console.log("═══════════════════════════════════════════");
  } catch (err) {
    console.error("\n❌ 마이그레이션 실패:", err);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

main();

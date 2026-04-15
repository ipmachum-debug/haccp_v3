/**
 * accounting_purchases 테이블에 material_id FK 컬럼 추가
 * ═══════════════════════════════════════════════════════════════
 * 목적:
 *   매입 → 재고/수불/육안검사 양방향 단일 소스 오브 트루스 연동을 위해
 *   accounting_purchases 에 material_id FK 컬럼을 추가한다.
 *
 * 마이그레이션 내용:
 *   1. accounting_purchases.material_id 컬럼 추가 (BIGINT NULL)
 *   2. idx_purchases_material_id 인덱스 추가
 *   3. 기존 데이터 백필: item_name → h_materials 매칭으로 material_id 채움
 *
 * 실행:
 *   npx tsx scripts/migrate-add-material-id-to-purchases.ts
 *
 * Dry run:
 *   DRY_RUN=1 npx tsx scripts/migrate-add-material-id-to-purchases.ts
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
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

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
    // ─── Step 1: 컬럼 존재 확인 ───
    console.log("\n📋 Step 1: accounting_purchases.material_id 컬럼 확인");
    const [colRows]: any = await conn.execute(`
      SELECT COLUMN_NAME
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'accounting_purchases'
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
          ALTER TABLE accounting_purchases
          ADD COLUMN material_id BIGINT NULL AFTER item_name,
          ADD INDEX idx_purchases_material_id (material_id)
        `);
        console.log("  ✓ material_id 컬럼 + 인덱스 추가 완료");
      }
    }

    // ─── Step 2: 백필 대상 조회 ───
    console.log("\n📋 Step 2: 백필 대상 (material_id NULL) 조회");
    const [targetRows]: any = await conn.execute(`
      SELECT id, tenant_id, item_name
      FROM accounting_purchases
      WHERE material_id IS NULL
      ORDER BY id DESC
    `);
    const targets: any[] = targetRows;
    console.log(`  → ${targets.length} 건 대상`);

    if (targets.length === 0) {
      console.log("\n🎉 백필할 데이터가 없습니다.");
      return;
    }

    // ─── Step 3: item_name → material_id 해결 ───
    console.log("\n📋 Step 3: item_name 으로 h_materials 매칭");
    let resolvedCount = 0;
    let unresolvedCount = 0;
    const resolvedMap = new Map<number, number>(); // purchase_id → material_id
    const unresolvedNames = new Set<string>();

    for (const r of targets) {
      const itemName = String(r.item_name || "").trim();
      if (!itemName) {
        unresolvedCount++;
        continue;
      }
      const [matRows]: any = await conn.execute(
        `SELECT id FROM h_materials
         WHERE tenant_id = ? AND is_active = 1
           AND (material_name = ? OR material_name LIKE ?)
         ORDER BY (material_name = ?) DESC, id ASC
         LIMIT 1`,
        [r.tenant_id, itemName, `%${itemName}%`, itemName],
      );
      const matArr: any[] = matRows;
      if (matArr[0]?.id) {
        resolvedMap.set(Number(r.id), Number(matArr[0].id));
        resolvedCount++;
      } else {
        unresolvedCount++;
        unresolvedNames.add(itemName);
      }
    }
    console.log(`  ✓ 해결: ${resolvedCount} 건`);
    console.log(`  ✗ 미해결: ${unresolvedCount} 건`);

    if (unresolvedNames.size > 0) {
      console.log("\n  미해결 item_name 목록 (최대 20):");
      Array.from(unresolvedNames)
        .slice(0, 20)
        .forEach((n) => console.log(`    - ${n}`));
    }

    // ─── Step 4: UPDATE ───
    if (DRY_RUN) {
      console.log("\n⚠️  DRY RUN 모드 — UPDATE 스킵");
      return;
    }

    console.log("\n📋 Step 4: accounting_purchases.material_id UPDATE");
    let updatedCount = 0;
    for (const [purchaseId, materialId] of Array.from(resolvedMap.entries())) {
      await conn.execute(
        `UPDATE accounting_purchases SET material_id = ? WHERE id = ?`,
        [materialId, purchaseId],
      );
      updatedCount++;
    }
    console.log(`  ✓ ${updatedCount} 건 업데이트 완료`);

    // ─── 결과 요약 ───
    console.log("\n═══════════════════════════════════════════");
    console.log("🎉 마이그레이션 완료!");
    console.log("═══════════════════════════════════════════");
    console.log(`  컬럼 추가:         ${colExists ? "기존" : "신규"}`);
    console.log(`  대상 매입전표:      ${targets.length}`);
    console.log(`  material_id 해결:  ${resolvedCount}`);
    console.log(`  업데이트 완료:      ${updatedCount}`);
    console.log(`  미해결 (수동 필요): ${unresolvedCount}`);
    console.log("═══════════════════════════════════════════");

    if (unresolvedCount > 0) {
      console.log("\n⚠️  미해결 항목은 h_materials 에 원재료를 추가한 후 재실행하세요.");
    }
  } catch (err) {
    console.error("\n❌ 마이그레이션 실패:", err);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

main();

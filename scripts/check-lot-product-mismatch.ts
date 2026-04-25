/**
 * LOT ↔ Batch product_id 정합성 검증 스크립트
 * ═══════════════════════════════════════════════════════════════
 * 배경:
 *   2026-04-25 운영DB(tenant 2) 에서 82건 LOT 의 product_id 가 batch.product_id 와
 *   불일치하는 historical bug 발견 (옵션 A 일괄 UPDATE 로 정정).
 *
 *   원인 — 임포트 스크립트들이 hardcoded ID 또는 잘못된 테이블 사용:
 *     - scripts/import_production_0320_0403.py: h_products (구 테이블) + 가정 ID
 *     - simplifiedDataProcessor (수정 전): h_item_master 사용 (h_products_v2 와 ID 체계 다름)
 *
 *   재발 방지를 위해 정기 검증 스크립트 추가. cron 또는 admin UI 에서 실행.
 *
 * 검증 항목:
 *   1. lot.product_id != batch.product_id (제품 LOT)
 *   2. lot.material_id 가 h_materials.id 또는 item_master 의 legacy_material_id 매칭 안 됨
 *   3. lot.product_id 가 h_products_v2.id 매칭 안 됨 (고아 ID)
 *
 * 실행:
 *   전체 tenant 검사:
 *     npx tsx scripts/check-lot-product-mismatch.ts
 *   특정 tenant:
 *     npx tsx scripts/check-lot-product-mismatch.ts --tenant 2
 *   불일치 1건이라도 있으면 exit code 1 (cron 알림용).
 * ═══════════════════════════════════════════════════════════════
 */

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

function parseArgs(argv: string[]) {
  const args: { tenant?: number } = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--tenant" || a === "-t") args.tenant = parseInt(argv[++i] || "0", 10);
    else if (a === "--help" || a === "-h") {
      console.log("Usage: tsx scripts/check-lot-product-mismatch.ts [--tenant <id>]");
      process.exit(0);
    }
  }
  return args;
}

async function main() {
  const { tenant } = parseArgs(process.argv);

  const { getRawConnection } = await import("../server/db/connection");
  const conn = await getRawConnection();

  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`LOT ↔ Batch product_id 정합성 검증 ${tenant ? `(tenant=${tenant})` : "(전체)"}`);
  console.log("═══════════════════════════════════════════════════════════════");

  const tenantFilter = tenant ? `AND l.tenant_id = ${Number(tenant)}` : "";
  let totalIssues = 0;

  // 1. lot.product_id ≠ batch.product_id
  const [mismatchRows]: any = await conn.execute(
    `SELECT l.tenant_id, COUNT(*) AS cnt
       FROM h_inventory_lots l
       JOIN h_batches b ON l.batch_id = b.id AND l.tenant_id = b.tenant_id
      WHERE l.product_id IS NOT NULL
        AND l.product_id <> b.product_id
        ${tenantFilter}
      GROUP BY l.tenant_id`,
  );
  console.log("\n[1] lot.product_id ≠ batch.product_id (정합성 핵심)");
  if ((mismatchRows as any[]).length === 0) {
    console.log("  ✓ 0건");
  } else {
    for (const r of mismatchRows as any[]) {
      console.log(`  ⚠ tenant=${r.tenant_id}: ${r.cnt}건`);
      totalIssues += Number(r.cnt);
    }
  }

  // 2. lot.product_id 가 h_products_v2 에 없음 (고아 ID)
  const [orphanProdRows]: any = await conn.execute(
    `SELECT l.tenant_id, COUNT(*) AS cnt
       FROM h_inventory_lots l
      WHERE l.product_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM h_products_v2 p
           WHERE p.id = l.product_id AND p.tenant_id = l.tenant_id
        )
        ${tenantFilter}
      GROUP BY l.tenant_id`,
  );
  console.log("\n[2] lot.product_id 가 h_products_v2 에 없음 (고아 ID)");
  if ((orphanProdRows as any[]).length === 0) {
    console.log("  ✓ 0건");
  } else {
    for (const r of orphanProdRows as any[]) {
      console.log(`  ⚠ tenant=${r.tenant_id}: ${r.cnt}건`);
      totalIssues += Number(r.cnt);
    }
  }

  // 3. lot.material_id 가 h_materials/item_master 어디에도 매칭 안 됨
  const [orphanMatRows]: any = await conn.execute(
    `SELECT l.tenant_id, COUNT(*) AS cnt
       FROM h_inventory_lots l
      WHERE l.material_id IS NOT NULL
        AND l.product_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM h_materials m
           WHERE m.id = l.material_id AND m.tenant_id = l.tenant_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM item_master im
           WHERE im.tenant_id = l.tenant_id
             AND (im.id = l.material_id OR im.legacy_material_id = l.material_id)
        )
        ${tenantFilter}
      GROUP BY l.tenant_id`,
  );
  console.log("\n[3] lot.material_id 가 h_materials/item_master 어디에도 없음 (고아)");
  if ((orphanMatRows as any[]).length === 0) {
    console.log("  ✓ 0건");
  } else {
    for (const r of orphanMatRows as any[]) {
      console.log(`  ⚠ tenant=${r.tenant_id}: ${r.cnt}건`);
      totalIssues += Number(r.cnt);
    }
  }

  console.log("\n═══════════════════════════════════════════════════════════════");
  if (totalIssues === 0) {
    console.log("✓ 정합성 OK");
  } else {
    console.log(`⚠ 총 ${totalIssues}건 정합성 이슈 — 운영팀 확인 필요`);
    console.log("\n복구 방법:");
    console.log("  [1] UPDATE h_inventory_lots l JOIN h_batches b ...");
    console.log("      → tenant 별로 옵션 A SQL 적용 (백업 테이블 먼저 만들 것)");
    console.log("  [2] product_id 가 v2 에 없는 LOT → 운영팀이 batch 매핑 확인 후 수정");
    console.log("  [3] material_id 고아 → 마스터 데이터 재등록 후 매핑");
  }
  console.log("═══════════════════════════════════════════════════════════════");

  process.exit(totalIssues > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});

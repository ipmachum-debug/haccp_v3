/**
 * Canonical Tables Backfill — 1회성
 *
 * docs/architecture/07-canonical-tables.md 의 정책 적용을 위한 기존 데이터 정리.
 *
 * 처리:
 *   1. item_master 에 own_product 로 등록되어 있는데 h_products_v2 에 같은 id 가 없는 row → INSERT
 *   2. h_products_v2 에 등록되어 있는데 item_master 에 같은 id (own_product) 가 없는 row → INSERT
 *
 * id 공간을 일치시켜 PR #266 의 듀얼 lookup 이 양쪽 다 매칭되도록 함.
 *
 * UNIQUE 충돌 (product_code, item_code) 발생 시 SKIP 후 리포트.
 *
 * 실행:
 *   npx tsx scripts/backfill-product-canonical-sync.ts             # dry-run (점검만)
 *   npx tsx scripts/backfill-product-canonical-sync.ts --apply     # 실제 INSERT
 */

import { getDb } from "../server/db/connection";
import { sql } from "drizzle-orm";

const APPLY = process.argv.includes("--apply");

async function main() {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  console.log("=".repeat(70));
  console.log("  Canonical Tables Backfill");
  console.log("  모드:", APPLY ? "🔧 적용 (--apply)" : "🔍 dry-run (점검만)");
  console.log("=".repeat(70));
  console.log();

  // ─────────────────────────────────────────────────────
  // 1. item_master(own_product) → h_products_v2 누락
  // ─────────────────────────────────────────────────────
  console.log("━━━ 1. item_master 에는 있는데 h_products_v2 에 없는 own_product ━━━");
  const result1: any = await db.execute(sql`
    SELECT
      im.id, im.tenant_id, im.item_code, im.item_name,
      im.category, im.base_unit, im.shelf_life_days, im.description, im.is_active
    FROM item_master im
    LEFT JOIN h_products_v2 p ON p.id = im.id AND p.tenant_id = im.tenant_id
    WHERE im.item_type = 'own_product'
      AND im.is_active = 1
      AND p.id IS NULL
    ORDER BY im.tenant_id, im.id
  `);
  const rows1 = (((result1 as any)?.[0] ?? []) as any[]);
  console.log(`  대상: ${rows1.length} 건\n`);

  let inserted1 = 0;
  let skipped1 = 0;
  for (const r of rows1) {
    // product_code UNIQUE 충돌 사전 체크
    const codeCheck: any = await db.execute(sql`
      SELECT id FROM h_products_v2 WHERE product_code = ${r.item_code} AND tenant_id = ${r.tenant_id} LIMIT 1
    `);
    const codeRows = (((codeCheck as any)?.[0] ?? []) as any[]);
    if (codeRows.length > 0) {
      console.log(`  ⏭️  SKIP id=${r.id} code=${r.item_code} (다른 row 가 같은 code 점유: id=${codeRows[0].id})`);
      skipped1++;
      continue;
    }

    if (APPLY) {
      try {
        await db.execute(sql`
          INSERT INTO h_products_v2 (id, tenant_id, product_code, product_name, version, category, unit, shelf_life_days, description, is_active)
          VALUES (${r.id}, ${r.tenant_id}, ${r.item_code}, ${r.item_name}, 1,
                  ${r.category ?? null}, ${r.base_unit || 'kg'}, ${r.shelf_life_days ?? null},
                  ${r.description ?? null}, ${r.is_active ?? 1})
        `);
        console.log(`  ✅ INSERT id=${r.id} code=${r.item_code} name=${r.item_name}`);
        inserted1++;
      } catch (e: any) {
        console.log(`  ❌ ERROR id=${r.id} ${e?.message ?? e}`);
        skipped1++;
      }
    } else {
      console.log(`  [DRY] id=${r.id} code=${r.item_code} name=${r.item_name}`);
    }
  }
  console.log();

  // ─────────────────────────────────────────────────────
  // 2. h_products_v2 → item_master 누락
  // ─────────────────────────────────────────────────────
  console.log("━━━ 2. h_products_v2 에는 있는데 item_master 에 없는 own_product ━━━");
  const result2: any = await db.execute(sql`
    SELECT
      p.id, p.tenant_id, p.product_code, p.product_name,
      p.category, p.unit, p.shelf_life_days, p.description, p.is_active
    FROM h_products_v2 p
    LEFT JOIN item_master im
      ON im.id = p.id AND im.tenant_id = p.tenant_id AND im.item_type = 'own_product'
    WHERE p.is_active = 1
      AND im.id IS NULL
    ORDER BY p.tenant_id, p.id
  `);
  const rows2 = (((result2 as any)?.[0] ?? []) as any[]);
  console.log(`  대상: ${rows2.length} 건\n`);

  let inserted2 = 0;
  let skipped2 = 0;
  for (const r of rows2) {
    // item_code UNIQUE 충돌 사전 체크 (item_master 도 (tenant_id, item_code) 유니크일 수 있음)
    const codeCheck: any = await db.execute(sql`
      SELECT id FROM item_master WHERE item_code = ${r.product_code} AND tenant_id = ${r.tenant_id} LIMIT 1
    `);
    const codeRows = (((codeCheck as any)?.[0] ?? []) as any[]);
    if (codeRows.length > 0) {
      console.log(`  ⏭️  SKIP id=${r.id} code=${r.product_code} (item_master 에 같은 code: id=${codeRows[0].id})`);
      skipped2++;
      continue;
    }

    if (APPLY) {
      try {
        await db.execute(sql`
          INSERT INTO item_master (id, tenant_id, item_code, item_name, item_type, category, base_unit, shelf_life_days, description, legacy_product_id, is_active)
          VALUES (${r.id}, ${r.tenant_id}, ${r.product_code}, ${r.product_name}, 'own_product',
                  ${r.category ?? null}, ${r.unit || 'kg'}, ${r.shelf_life_days ?? null},
                  ${r.description ?? null}, ${r.id}, ${r.is_active ?? 1})
        `);
        console.log(`  ✅ INSERT id=${r.id} code=${r.product_code} name=${r.product_name}`);
        inserted2++;
      } catch (e: any) {
        console.log(`  ❌ ERROR id=${r.id} ${e?.message ?? e}`);
        skipped2++;
      }
    } else {
      console.log(`  [DRY] id=${r.id} code=${r.product_code} name=${r.product_name}`);
    }
  }
  console.log();

  // ─────────────────────────────────────────────────────
  // 요약
  // ─────────────────────────────────────────────────────
  console.log("=".repeat(70));
  console.log("  요약");
  console.log("=".repeat(70));
  console.log(`  1. item_master → h_products_v2: 대상 ${rows1.length}, 적용 ${inserted1}, SKIP ${skipped1}`);
  console.log(`  2. h_products_v2 → item_master: 대상 ${rows2.length}, 적용 ${inserted2}, SKIP ${skipped2}`);
  if (!APPLY) {
    console.log();
    console.log("  💡 실제 적용은 --apply 옵션으로 재실행:");
    console.log("     npx tsx scripts/backfill-product-canonical-sync.ts --apply");
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("[backfill] 실행 실패:", e);
  process.exit(1);
});

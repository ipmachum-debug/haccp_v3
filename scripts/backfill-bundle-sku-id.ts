/**
 * Backfill: production_sku_output.bundle_sku_id 일괄 채움 — PR #281
 *
 * sku_bundles 정의를 따라 기존 행들에 bundle_sku_id 채워 넣음.
 * 신규 등록은 INSERT 시 자동 매칭 (PR #281).
 *
 * 실행:
 *   npx tsx scripts/backfill-bundle-sku-id.ts            # dry-run
 *   npx tsx scripts/backfill-bundle-sku-id.ts --apply    # 실제 적용
 */

import mysql from "mysql2/promise";
import { getDbConfigFromEnv } from "./_lib/db-env.js";

const APPLY = process.argv.includes("--apply");

async function main() {
  const conn = await mysql.createConnection(getDbConfigFromEnv(process.env));
  console.log("=== Backfill: production_sku_output.bundle_sku_id (PR #281) ===");
  console.log(`모드: ${APPLY ? "🔧 적용 (--apply)" : "🔍 dry-run"}\n`);

  // 매칭 가능한 행 식별
  const [rows]: any = await conn.execute(`
    SELECT pso.id, pso.tenant_id, pso.batch_id, pso.sku_id, sb.parent_sku_id
    FROM production_sku_output pso
    JOIN sku_bundles sb
      ON sb.tenant_id = pso.tenant_id
     AND sb.child_sku_id = pso.sku_id
    WHERE pso.bundle_sku_id IS NULL
    ORDER BY pso.tenant_id, pso.batch_id
  `);

  const targets = rows as any[];
  console.log(`대상 행: ${targets.length}건\n`);

  if (targets.length === 0) {
    console.log("✅ 처리할 행 없음 (이미 매칭 완료 또는 sku_bundles 미정의)");
    process.exit(0);
  }

  // 각 row 별 처리 (parent SKU 가 여러 개면 가장 첫 매칭)
  const seen = new Set<number>();
  let updated = 0;
  for (const r of targets) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);

    if (APPLY) {
      try {
        await conn.execute(
          `UPDATE production_sku_output SET bundle_sku_id = ? WHERE id = ?`,
          [r.parent_sku_id, r.id],
        );
        console.log(
          `  ✅ pso#${r.id} batch=${r.batch_id} sku=${r.sku_id} → bundle=${r.parent_sku_id}`,
        );
        updated++;
      } catch (e: any) {
        console.log(`  ❌ pso#${r.id} 실패: ${e?.message ?? e}`);
      }
    } else {
      console.log(
        `  [DRY] pso#${r.id} batch=${r.batch_id} sku=${r.sku_id} → bundle=${r.parent_sku_id}`,
      );
    }
  }

  console.log("\n=".repeat(70));
  console.log("  요약");
  console.log("=".repeat(70));
  console.log(`  대상: ${targets.length}, ${APPLY ? "적용" : "예정"}: ${APPLY ? updated : targets.length}`);
  if (!APPLY) {
    console.log("\n  💡 실제 적용:");
    console.log("     npx tsx scripts/backfill-bundle-sku-id.ts --apply");
  }

  await conn.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("치명 오류:", err);
  process.exit(1);
});

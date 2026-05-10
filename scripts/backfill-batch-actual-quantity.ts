/**
 * Backfill: completed 배치의 NULL actual_quantity 자동 갱신 — PR #274
 *
 * 배경:
 *   - autoApprovalRequest.ts:281 등이 status='completed' 로 직접 UPDATE 하면서
 *     actual_quantity 를 NULL 로 둠 (4/2, 4/17, 4/20, 4/22, 4/27 패턴)
 *   - production_sku_output 에는 SKU 실적이 정상 저장돼 있으나 h_batches 만 NULL
 *
 * 처치:
 *   - completed 인데 actual_quantity NULL 또는 0 인 배치 전수조사
 *   - production_sku_output SUM(total_kg) 으로 자동 채움
 *   - 동시에 h_daily_reports 캐시 무효화
 *
 * 실행:
 *   npx tsx scripts/backfill-batch-actual-quantity.ts            # dry-run
 *   npx tsx scripts/backfill-batch-actual-quantity.ts --apply    # 실제 적용
 */

import mysql from "mysql2/promise";
import { getDbConfigFromEnv } from "./_lib/db-env.js";

const APPLY = process.argv.includes("--apply");

async function main() {
  const conn = await mysql.createConnection(getDbConfigFromEnv(process.env));
  console.log("=== Backfill: 배치 actual_quantity 자동 갱신 (PR #274) ===");
  console.log(`모드: ${APPLY ? "🔧 적용 (--apply)" : "🔍 dry-run (점검만)"}\n`);

  // ─────────────────────────────────────────────────────
  // 1. 대상 배치 식별
  //    - status='completed' 이거나 'shipped'
  //    - actual_quantity 가 NULL 또는 0
  //    - production_sku_output 에 합계 > 0
  // ─────────────────────────────────────────────────────
  const [rows]: any = await conn.execute(`
    SELECT
      b.id, b.tenant_id, b.batch_code, b.planned_date,
      b.planned_quantity, b.actual_quantity, b.status,
      COALESCE(SUM(pso.total_kg), 0) AS sku_total,
      COUNT(pso.id) AS sku_count
    FROM h_batches b
    LEFT JOIN production_sku_output pso
      ON pso.batch_id = b.id AND pso.tenant_id = b.tenant_id
    WHERE b.status IN ('completed', 'shipped')
      AND (b.actual_quantity IS NULL OR b.actual_quantity = 0)
    GROUP BY b.id
    HAVING sku_total > 0
    ORDER BY b.tenant_id, b.planned_date DESC, b.id ASC
  `);

  const targets = rows as any[];
  console.log(`대상 배치: ${targets.length}건\n`);

  if (targets.length === 0) {
    console.log("✅ 처리할 배치 없음 (모든 completed 배치가 정상)");
    process.exit(0);
  }

  // ─────────────────────────────────────────────────────
  // 2. 각 배치 처리
  // ─────────────────────────────────────────────────────
  let updated = 0;
  let invalidatedReports = 0;
  const datesToInvalidate = new Set<string>();

  for (const r of targets) {
    const planned = Number(r.planned_quantity || 0);
    const skuTotal = Number(r.sku_total);
    const yieldPct = planned > 0 ? Math.round((skuTotal / planned) * 10000) / 100 : null;

    const dateStr =
      r.planned_date instanceof Date
        ? r.planned_date.toISOString().slice(0, 10)
        : String(r.planned_date).slice(0, 10);
    datesToInvalidate.add(`${r.tenant_id}|${dateStr}`);

    if (APPLY) {
      try {
        await conn.execute(
          `UPDATE h_batches
              SET actual_quantity = ?, actual_yield = ?
            WHERE id = ? AND tenant_id = ?
              AND (actual_quantity IS NULL OR actual_quantity = 0)`,
          [skuTotal, yieldPct, r.id, r.tenant_id],
        );
        console.log(
          `  ✅ batch#${r.id} (${r.batch_code}) ${dateStr}: ${skuTotal}kg, yield ${yieldPct}% (${r.sku_count} SKU)`,
        );
        updated++;
      } catch (e: any) {
        console.log(`  ❌ batch#${r.id} 실패: ${e?.message ?? e}`);
      }
    } else {
      console.log(
        `  [DRY] batch#${r.id} (${r.batch_code}) ${dateStr}: planned=${planned}kg → actual=${skuTotal}kg, yield=${yieldPct}%`,
      );
    }
  }

  console.log();

  // ─────────────────────────────────────────────────────
  // 3. h_daily_reports 캐시 무효화
  // ─────────────────────────────────────────────────────
  if (APPLY && datesToInvalidate.size > 0) {
    console.log(`→ h_daily_reports 캐시 무효화 (${datesToInvalidate.size} 날짜)`);
    for (const key of datesToInvalidate) {
      const [tenantStr, dateStr] = key.split("|");
      const tenantId = Number(tenantStr);
      try {
        const [delResult]: any = await conn.execute(
          `DELETE FROM h_daily_reports
            WHERE tenant_id = ? AND report_date = ?
              AND report_type IN ('production_daily', 'production')`,
          [tenantId, dateStr],
        );
        const affected = Number((delResult as any)?.affectedRows ?? 0);
        invalidatedReports += affected;
        if (affected > 0) {
          console.log(`   ✅ tenant=${tenantId} ${dateStr}: ${affected}행 무효화`);
        }
      } catch (e: any) {
        console.log(`   ⚠️ tenant=${tenantStr} ${dateStr}: ${e?.message ?? e}`);
      }
    }
  }

  // ─────────────────────────────────────────────────────
  // 4. 요약
  // ─────────────────────────────────────────────────────
  console.log("\n=".repeat(70));
  console.log("  요약");
  console.log("=".repeat(70));
  console.log(`  대상 배치: ${targets.length}`);
  console.log(`  ${APPLY ? "갱신 완료" : "갱신 예정"}: ${APPLY ? updated : targets.length}`);
  console.log(`  영향 날짜: ${datesToInvalidate.size}`);
  if (APPLY) {
    console.log(`  무효화된 daily_reports: ${invalidatedReports}`);
  } else {
    console.log("\n  💡 실제 적용은 --apply 로 재실행:");
    console.log("     npx tsx scripts/backfill-batch-actual-quantity.ts --apply");
  }

  await conn.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("치명 오류:", err);
  process.exit(1);
});

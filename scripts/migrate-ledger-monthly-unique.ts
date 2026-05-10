/**
 * 마이그레이션: material_ledger_monthly UNIQUE 제약 추가 — PR #273
 *
 * 문제:
 *   - aggregateMonthlyLedger() 가 "INSERT INTO ... ON DUPLICATE KEY UPDATE" 사용 중인데
 *     (tenant_id, material_id, year_month) UNIQUE 제약이 없어서 ODKU 가 무효
 *   - 매일 cron 23:30 마다 INSERT 만 누적 → 2026-04 에 21배 중복 사고
 *
 * 처치 (멱등 ALTER):
 *   1. 기존 중복 정리 — 각 (tenant_id, material_id, year_month) 그룹에서 MAX(id) 만 보존
 *   2. UNIQUE 인덱스 생성 — uq_mlm_tenant_material_year_month
 *
 * 실행:
 *   npx tsx scripts/migrate-ledger-monthly-unique.ts          # dry-run (점검)
 *   npx tsx scripts/migrate-ledger-monthly-unique.ts --apply  # 실제 적용
 */

import mysql from "mysql2/promise";
import { getDbConfigFromEnv } from "./_lib/db-env.js";

const APPLY = process.argv.includes("--apply");

async function migrate() {
  const conn = await mysql.createConnection(getDbConfigFromEnv(process.env));
  console.log("=== 마이그레이션 시작: material_ledger_monthly UNIQUE 제약 (PR #273) ===");
  console.log(`모드: ${APPLY ? "🔧 적용 (--apply)" : "🔍 dry-run (점검만)"}\n`);

  // ─────────────────────────────────────────────────────
  // 1. 기존 중복 점검
  // ─────────────────────────────────────────────────────
  const [dupRows]: any = await conn.execute(`
    SELECT tenant_id, material_id, \`year_month\`, COUNT(*) AS dup_count
    FROM material_ledger_monthly
    GROUP BY tenant_id, material_id, \`year_month\`
    HAVING COUNT(*) > 1
    ORDER BY dup_count DESC
    LIMIT 50
  `);

  const totalDupGroups = (dupRows as any[]).length;
  if (totalDupGroups === 0) {
    console.log("✅ 중복 그룹 없음 — UNIQUE 제약 추가 안전");
  } else {
    const totalDupRows = (dupRows as any[]).reduce((s, r: any) => s + Number(r.dup_count), 0);
    console.log(`⚠️ 중복 그룹 ${totalDupGroups}개 발견, 총 ${totalDupRows} 행`);
    console.log("   상위 10개 (가장 많이 중복된 페어):");
    for (const r of (dupRows as any[]).slice(0, 10)) {
      console.log(
        `   tenant=${r.tenant_id} material=${r.material_id} ym=${r.year_month} → ${r.dup_count}배`,
      );
    }
    console.log();

    if (!APPLY) {
      console.log("   💡 --apply 시 각 그룹에서 MAX(id)만 보존하고 나머지 삭제됩니다.");
    } else {
      console.log("→ 중복 행 정리 중 (각 그룹에서 MAX(id)만 보존)...");
      const [delResult]: any = await conn.execute(`
        DELETE lm FROM material_ledger_monthly lm
        JOIN (
          SELECT tenant_id, material_id, \`year_month\`, MAX(id) AS keep_id
          FROM material_ledger_monthly
          GROUP BY tenant_id, material_id, \`year_month\`
          HAVING COUNT(*) > 1
        ) keepers
          ON keepers.tenant_id = lm.tenant_id
         AND keepers.material_id = lm.material_id
         AND keepers.\`year_month\` = lm.\`year_month\`
        WHERE lm.id <> keepers.keep_id
      `);
      console.log(`   ✅ ${delResult.affectedRows ?? 0} 행 삭제 완료\n`);
    }
  }

  // ─────────────────────────────────────────────────────
  // 2. UNIQUE 인덱스 존재 여부 확인 + 생성
  // ─────────────────────────────────────────────────────
  const indexName = "uq_mlm_tenant_material_year_month";
  const [idxRows]: any = await conn.execute(
    `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'material_ledger_monthly'
       AND INDEX_NAME = ?`,
    [indexName],
  );

  if ((idxRows as any[]).length > 0) {
    console.log(`✅ UNIQUE 인덱스 ${indexName} 이미 존재 — 스킵`);
  } else if (!APPLY) {
    console.log(`💡 --apply 시 UNIQUE 인덱스 생성 예정: ${indexName}`);
    console.log("    ON material_ledger_monthly (tenant_id, material_id, year_month)");
  } else {
    console.log(`→ UNIQUE 인덱스 생성: ${indexName}`);
    try {
      await conn.execute(
        `CREATE UNIQUE INDEX ${indexName}
         ON material_ledger_monthly (tenant_id, material_id, \`year_month\`)`,
      );
      console.log(`✅ UNIQUE 인덱스 ${indexName} 생성 완료`);
    } catch (e: any) {
      if (e?.code === "ER_DUP_ENTRY" || /Duplicate entry/i.test(String(e?.message))) {
        console.error(
          `❌ 중복이 남아있어 UNIQUE 인덱스 생성 실패. 1단계 중복 정리가 완료됐는지 확인하세요.`,
        );
        console.error(`   상세: ${e?.message ?? e}`);
        process.exit(2);
      }
      throw e;
    }
  }

  console.log("\n=== 마이그레이션 완료 ===");
  await conn.end();
}

migrate().catch((err) => {
  console.error("치명 오류:", err);
  process.exit(1);
});

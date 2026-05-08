/**
 * Canonical Tables Drift 감시 — 일일 cron 친화 요약 스크립트
 *
 * docs/architecture/07-canonical-tables.md 의 정책 위반을 감시:
 *   - 옛 테이블에 없는데 canonical(item_master / accounting_accounts) 에는 있는 row 수
 *   - 양쪽 다 있지만 이름/코드 다른 row 수
 *
 * 출력은 한 줄 요약 (cron / Slack 친화) + 임계치 초과 시 exit code 1.
 *
 * 실행:
 *   npx tsx scripts/check-table-drift.ts          # 점검만
 *   npx tsx scripts/check-table-drift.ts --json   # JSON 출력 (Slack 등)
 *
 * cron 등록 예시 (매일 03:30 KST):
 *   30 3 * * * cd /root/haccpone-v2 && npx tsx scripts/check-table-drift.ts >> /var/log/haccp-drift.log 2>&1
 */

import { getDb } from "../server/db/connection";
import { sql } from "drizzle-orm";

const JSON_MODE = process.argv.includes("--json");
const ALERT_THRESHOLD = Number(process.env.DRIFT_ALERT_THRESHOLD ?? 5);

interface DriftReport {
  pair: string;
  orphansInCanonical: number; // canonical 에만 있는 row
  orphansInLegacy: number; // legacy 에만 있는 row
  nameMismatch: number; // 양쪽 다 있지만 이름 다름
}

async function main() {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const reports: DriftReport[] = [];

  // ─────────────────────────────────────────────────────
  // Pair 1: item_master(own_product) ↔ h_products_v2
  // ─────────────────────────────────────────────────────
  const productOrphansCanonical: any = await db.execute(sql`
    SELECT COUNT(*) AS cnt
    FROM item_master im
    LEFT JOIN h_products_v2 p ON p.id = im.id AND p.tenant_id = im.tenant_id
    WHERE im.item_type = 'own_product'
      AND im.is_active = 1
      AND p.id IS NULL
  `);
  const productOrphansLegacy: any = await db.execute(sql`
    SELECT COUNT(*) AS cnt
    FROM h_products_v2 p
    LEFT JOIN item_master im ON im.id = p.id AND im.tenant_id = p.tenant_id AND im.item_type = 'own_product'
    WHERE p.is_active = 1
      AND im.id IS NULL
  `);
  const productNameMismatch: any = await db.execute(sql`
    SELECT COUNT(*) AS cnt
    FROM h_products_v2 p
    JOIN item_master im ON im.id = p.id AND im.tenant_id = p.tenant_id AND im.item_type = 'own_product'
    WHERE p.is_active = 1 AND im.is_active = 1
      AND p.product_name <> im.item_name
  `);
  reports.push({
    pair: "item_master(own_product) ↔ h_products_v2",
    orphansInCanonical: getCount(productOrphansCanonical),
    orphansInLegacy: getCount(productOrphansLegacy),
    nameMismatch: getCount(productNameMismatch),
  });

  // ─────────────────────────────────────────────────────
  // Pair 2: item_master(raw_material) ↔ h_materials
  // ─────────────────────────────────────────────────────
  const materialOrphansCanonical: any = await db.execute(sql`
    SELECT COUNT(*) AS cnt
    FROM item_master im
    LEFT JOIN h_materials m ON m.id = im.id AND m.tenant_id = im.tenant_id
    WHERE im.item_type = 'raw_material'
      AND im.is_active = 1
      AND m.id IS NULL
  `);
  const materialOrphansLegacy: any = await db.execute(sql`
    SELECT COUNT(*) AS cnt
    FROM h_materials m
    LEFT JOIN item_master im ON im.id = m.id AND im.tenant_id = m.tenant_id AND im.item_type = 'raw_material'
    WHERE im.id IS NULL
  `);
  reports.push({
    pair: "item_master(raw_material) ↔ h_materials",
    orphansInCanonical: getCount(materialOrphansCanonical),
    orphansInLegacy: getCount(materialOrphansLegacy),
    nameMismatch: 0, // h_materials 는 컬럼 구조 달라 비교 생략
  });

  // ─────────────────────────────────────────────────────
  // Pair 3: accounting_accounts ↔ accounting_accounts_v2 (deprecated)
  // ─────────────────────────────────────────────────────
  try {
    const accV2Count: any = await db.execute(sql`
      SELECT COUNT(*) AS cnt FROM accounting_accounts_v2
    `);
    if (getCount(accV2Count) > 0) {
      reports.push({
        pair: "accounting_accounts ↔ accounting_accounts_v2 (deprecated)",
        orphansInCanonical: 0,
        orphansInLegacy: getCount(accV2Count),
        nameMismatch: 0,
      });
    }
  } catch {
    // accounting_accounts_v2 가 이미 DROP 됐으면 정상
  }

  // ─────────────────────────────────────────────────────
  // 출력
  // ─────────────────────────────────────────────────────
  const total = reports.reduce(
    (acc, r) => acc + r.orphansInCanonical + r.orphansInLegacy + r.nameMismatch,
    0,
  );

  if (JSON_MODE) {
    console.log(
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          totalDrift: total,
          threshold: ALERT_THRESHOLD,
          alert: total > ALERT_THRESHOLD,
          reports,
        },
        null,
        2,
      ),
    );
  } else {
    const ts = new Date().toISOString();
    console.log(`[${ts}] Canonical Tables Drift Report (threshold=${ALERT_THRESHOLD})`);
    console.log("=".repeat(70));
    for (const r of reports) {
      const sub = r.orphansInCanonical + r.orphansInLegacy + r.nameMismatch;
      const flag = sub === 0 ? "✅" : sub > ALERT_THRESHOLD ? "🔴" : "⚠️";
      console.log(`${flag} ${r.pair}`);
      console.log(`     canonical-only: ${r.orphansInCanonical}, legacy-only: ${r.orphansInLegacy}, name-diff: ${r.nameMismatch}`);
    }
    console.log("=".repeat(70));
    console.log(`TOTAL DRIFT: ${total} (threshold=${ALERT_THRESHOLD})`);
  }

  process.exit(total > ALERT_THRESHOLD ? 1 : 0);
}

function getCount(result: any): number {
  const rows = (result as any)?.[0] ?? result;
  if (!Array.isArray(rows)) return 0;
  return Number(rows[0]?.cnt ?? 0);
}

main().catch((e) => {
  console.error("[check-table-drift] 실행 실패:", e);
  process.exit(2);
});

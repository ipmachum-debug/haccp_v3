/**
 * Intermediate ↔ Material linking — PR #252
 *
 * 1. h_intermediates.linked_material_id 컬럼 추가 (idempotent)
 * 2. 자동 매칭: tenant 내, h_materials.kind='MIXED' AND material_name = intermediate_name
 *    → linked_material_id 자동 채움 (1:1 정확 일치만)
 * 3. 매칭 결과 리포트
 *
 * 실행:
 *   npx tsx scripts/migrate-intermediate-link.ts
 */

import { getDb } from "../server/db/connection";
import { sql } from "drizzle-orm";

async function addColumnIfMissing(
  db: any,
  table: string,
  column: string,
  type: string,
): Promise<void> {
  try {
    await db.execute(sql.raw(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`));
    console.log(`    + ${table}.${column} 추가됨`);
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    if (msg.includes("Duplicate column") || msg.includes("already exists")) {
      console.log(`    = ${table}.${column} 이미 존재 — skip`);
    } else throw e;
  }
}

async function addIndexIfMissing(
  db: any,
  table: string,
  indexName: string,
  columns: string,
): Promise<void> {
  try {
    await db.execute(sql.raw(`ALTER TABLE ${table} ADD INDEX ${indexName} (${columns})`));
    console.log(`    + ${table}.${indexName} 인덱스 추가됨`);
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    if (msg.includes("Duplicate key") || msg.includes("already exists")) {
      console.log(`    = ${table}.${indexName} 이미 존재 — skip`);
    } else throw e;
  }
}

async function main() {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  console.log("=== Intermediate ↔ Material linking 마이그레이션 ===\n");

  // 1. 컬럼 추가
  console.log("[1/3] linked_material_id 컬럼 추가...");
  await addColumnIfMissing(db, "h_intermediates", "linked_material_id", "BIGINT NULL");
  await addIndexIfMissing(db, "h_intermediates", "idx_intermediate_linked", "linked_material_id");

  // 2. 자동 이름 매칭
  console.log("\n[2/3] 자동 이름 매칭 (h_materials.kind='MIXED' ↔ h_intermediates)...");
  const beforeRes: any = await db.execute(sql`
    SELECT COUNT(*) AS cnt FROM h_intermediates WHERE linked_material_id IS NULL
  `);
  const beforeCount = Number(((beforeRes as any)?.[0] ?? [])[0]?.cnt || 0);

  await db.execute(sql`
    UPDATE h_intermediates i
    JOIN h_materials m
      ON m.tenant_id = i.tenant_id
     AND m.kind = 'MIXED'
     AND m.material_name = i.intermediate_name
    SET i.linked_material_id = m.id
    WHERE i.linked_material_id IS NULL
  `);

  const afterRes: any = await db.execute(sql`
    SELECT COUNT(*) AS cnt FROM h_intermediates WHERE linked_material_id IS NULL
  `);
  const afterCount = Number(((afterRes as any)?.[0] ?? [])[0]?.cnt || 0);
  const matched = beforeCount - afterCount;
  console.log(`    → ${matched} 건 자동 매칭 / ${afterCount} 건 미매칭 (수동 매칭 필요)`);

  // 3. 매칭 리포트
  console.log("\n[3/3] 매칭 리포트:");
  const reportRes: any = await db.execute(sql`
    SELECT
      i.id AS intermediate_id,
      i.intermediate_code,
      i.intermediate_name,
      i.linked_material_id,
      m.material_code AS linked_material_code,
      m.material_name AS linked_material_name
    FROM h_intermediates i
    LEFT JOIN h_materials m ON m.id = i.linked_material_id
    ORDER BY i.tenant_id, i.intermediate_code
  `);
  const rows = ((reportRes as any)?.[0] ?? []) as any[];
  for (const r of rows) {
    if (r.linked_material_id) {
      console.log(
        `    ✓ ${r.intermediate_code} ${r.intermediate_name} → ${r.linked_material_code} ${r.linked_material_name}`,
      );
    } else {
      console.log(`    × ${r.intermediate_code} ${r.intermediate_name} (미매칭 — UI 에서 수동)`);
    }
  }

  console.log("\n✅ 마이그레이션 완료\n");
  process.exit(0);
}

main().catch((e) => {
  console.error("❌ 마이그레이션 실패:", e);
  process.exit(1);
});

/**
 * h_products (v1) → h_products_v2 통합 마이그레이션 스크립트
 *
 * 목적: h_batches, h_mf_reports, h_ccp_instances 등의 product_id를
 *       h_products.id → h_products_v2.id로 변환하여 v1 테이블 퇴출
 *
 * 전략: h_products.product_name = h_products_v2.product_name 매칭
 *
 * 실행 전 반드시 DB 백업! → mysqldump haccp_tenant_db > backup_$(date +%Y%m%d).sql
 *
 * 사용법:
 *   DRY_RUN=true npx tsx scripts/migrate-products-v1-to-v2.ts  (시뮬레이션)
 *   npx tsx scripts/migrate-products-v1-to-v2.ts                (실행)
 */

import mysql from "mysql2/promise";

const DRY_RUN = process.env.DRY_RUN === "true";
const TENANT_ID = parseInt(process.env.TENANT_ID || "2");

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASS || "",
    database: process.env.DB_NAME || "haccp_tenant_db",
  });
  await conn.query("SET time_zone = '+09:00'");

  console.log(`\n=== h_products v1 → v2 통합 마이그레이션 ===`);
  console.log(`모드: ${DRY_RUN ? "DRY RUN (시뮬레이션)" : "⚠️  실행 모드"}`);
  console.log(`테넌트: ${TENANT_ID}\n`);

  // 1. 매핑 테이블 생성: h_products.id → h_products_v2.id (이름 기반)
  const [v1Products] = await conn.execute<any[]>(
    "SELECT id, product_name, product_code FROM h_products WHERE tenant_id = ?",
    [TENANT_ID]
  );
  const [v2Products] = await conn.execute<any[]>(
    "SELECT id, product_name, product_code FROM h_products_v2 WHERE tenant_id = ?",
    [TENANT_ID]
  );

  console.log(`h_products (v1): ${v1Products.length}개`);
  console.log(`h_products_v2 (v2): ${v2Products.length}개\n`);

  // 이름 기반 매핑
  const v1ToV2Map = new Map<number, { v2Id: number; name: string }>();
  const unmapped: any[] = [];

  for (const v1 of v1Products) {
    const v2Match = v2Products.find(
      (v2: any) => v2.product_name.trim() === v1.product_name.trim()
    );
    if (v2Match) {
      v1ToV2Map.set(v1.id, { v2Id: v2Match.id, name: v1.product_name });
    } else {
      unmapped.push(v1);
    }
  }

  console.log(`매핑 성공: ${v1ToV2Map.size}개`);
  if (unmapped.length > 0) {
    console.log(`매핑 실패: ${unmapped.length}개`);
    for (const u of unmapped) {
      console.log(`  ❌ v1.id=${u.id}, name="${u.product_name}" → v2에 해당 이름 없음`);
    }
  }
  console.log("\n매핑 상세:");
  for (const [v1Id, { v2Id, name }] of v1ToV2Map) {
    console.log(`  v1.id=${v1Id} → v2.id=${v2Id} (${name})`);
  }

  // 2. 변환 대상 테이블들
  const tables = [
    { table: "h_batches", column: "product_id" },
    { table: "h_mf_reports", column: "product_id" },
    { table: "h_ccp_instances", column: "product_id" },
    { table: "h_ccp_form_records", column: "product_id" },
    { table: "h_recipe_headers", column: "product_id" },
    { table: "h_batch_schedules", column: "product_id" },
    { table: "h_inventory_lots", column: "product_id" },
    { table: "h_product_outbound", column: "product_id" },
    { table: "ccp_process_group_products", column: "product_id" },
  ];

  console.log(`\n=== 테이블별 변환 ===\n`);

  let totalUpdated = 0;

  for (const { table, column } of tables) {
    // 해당 테이블에 v1 ID가 존재하는지 확인
    try {
      const [rows] = await conn.execute<any[]>(
        `SELECT ${column}, COUNT(*) as cnt FROM ${table}
         WHERE tenant_id = ? AND ${column} IN (${[...v1ToV2Map.keys()].join(",") || "0"})
         GROUP BY ${column}`,
        [TENANT_ID]
      );

      if (rows.length === 0) {
        console.log(`${table}.${column}: 변환 대상 없음`);
        continue;
      }

      let tableUpdated = 0;
      for (const row of rows) {
        const v1Id = row[column];
        const mapping = v1ToV2Map.get(v1Id);
        if (!mapping) continue;

        console.log(`  ${table}: ${column}=${v1Id} → ${mapping.v2Id} (${mapping.name}) [${row.cnt}건]`);

        if (!DRY_RUN) {
          await conn.execute(
            `UPDATE ${table} SET ${column} = ? WHERE tenant_id = ? AND ${column} = ?`,
            [mapping.v2Id, TENANT_ID, v1Id]
          );
        }
        tableUpdated += row.cnt;
      }

      console.log(`${table}: ${tableUpdated}건 ${DRY_RUN ? "(예정)" : "변환 완료"}`);
      totalUpdated += tableUpdated;
    } catch (err: any) {
      // 테이블이 없거나 컬럼이 없는 경우
      if (err.code === "ER_NO_SUCH_TABLE" || err.code === "ER_BAD_FIELD_ERROR") {
        console.log(`${table}.${column}: 테이블/컬럼 없음 (건너뜀)`);
      } else {
        console.error(`${table} 처리 오류:`, err.message);
      }
    }
  }

  console.log(`\n=== 결과 ===`);
  console.log(`총 ${totalUpdated}건 ${DRY_RUN ? "변환 예정" : "변환 완료"}`);

  if (unmapped.length > 0) {
    console.log(`\n⚠️  매핑 실패 ${unmapped.length}개 제품은 수동 확인 필요:`);
    for (const u of unmapped) {
      console.log(`  v1.id=${u.id}: "${u.product_name}"`);
    }
  }

  if (DRY_RUN) {
    console.log(`\n✅ DRY RUN 완료. 실제 실행: DRY_RUN 없이 다시 실행`);
  } else {
    console.log(`\n✅ 마이그레이션 완료! resolveToHProductId() 제거 후 코드 배포 가능`);
  }

  await conn.end();
}

main().catch((err) => {
  console.error("마이그레이션 실패:", err);
  process.exit(1);
});

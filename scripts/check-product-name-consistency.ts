/**
 * 제품명 일관성 점검 및 동기화 스크립트
 *
 * 점검 항목:
 * 1. h_products_v2 ↔ item_master 제품명 불일치
 * 2. h_products ↔ h_products_v2 제품명 불일치
 * 3. CCP 비정규화 제품명 불일치 (h_ccp_instances, h_ccp_form_records)
 * 4. item_master에 없는 h_products_v2 제품
 * 5. h_products_v2에 없는 item_master 자체제품
 *
 * 실행: npx tsx scripts/check-product-name-consistency.ts [--fix]
 */

import mysql from "mysql2/promise";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../webapp/.env") });

const FIX_MODE = process.argv.includes("--fix");

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "haccpone",
  });

  console.log("=".repeat(70));
  console.log("  제품명 일관성 점검 스크립트");
  console.log("  모드:", FIX_MODE ? "🔧 수정 모드 (--fix)" : "🔍 점검 모드 (읽기 전용)");
  console.log("=".repeat(70));
  console.log();

  let totalIssues = 0;
  let totalFixed = 0;

  // ─────────────────────────────────────────────────────
  // 1. h_products_v2 ↔ item_master 제품명 불일치
  // ─────────────────────────────────────────────────────
  console.log("━━━ 점검 1: h_products_v2 ↔ item_master 제품명 불일치 ━━━");
  const [mismatch1] = await connection.execute(`
    SELECT
      p.id as product_id, p.product_name, p.product_code, p.tenant_id,
      im.id as item_master_id, im.item_name, im.item_code
    FROM h_products_v2 p
    JOIN item_master im
      ON im.legacy_product_id = p.id
      AND im.item_type = 'own_product'
      AND im.tenant_id = p.tenant_id
    WHERE p.product_name != im.item_name
      AND p.is_active = 1
    ORDER BY p.tenant_id, p.id
  `);
  const m1 = mismatch1 as any[];
  if (m1.length === 0) {
    console.log("  ✅ 불일치 없음\n");
  } else {
    console.log(`  ⚠️  ${m1.length}건 불일치 발견:`);
    for (const r of m1) {
      console.log(`    제품#${r.product_id} [${r.product_code}]:`);
      console.log(`      h_products_v2: "${r.product_name}"`);
      console.log(`      item_master:   "${r.item_name}"`);
      totalIssues++;
      if (FIX_MODE) {
        // h_products_v2를 기준으로 item_master 동기화
        await connection.execute(
          `UPDATE item_master SET item_name = ? WHERE id = ?`,
          [r.product_name, r.item_master_id]
        );
        console.log(`      → 수정됨: item_master.item_name = "${r.product_name}"`);
        totalFixed++;
      }
    }
    console.log();
  }

  // ─────────────────────────────────────────────────────
  // 2. h_products ↔ h_products_v2 제품명 불일치
  // ─────────────────────────────────────────────────────
  console.log("━━━ 점검 2: h_products ↔ h_products_v2 제품명 불일치 ━━━");
  const [mismatch2] = await connection.execute(`
    SELECT
      p1.id, p1.product_name as v1_name, p1.tenant_id,
      p2.id as v2_id, p2.product_name as v2_name, p2.product_code
    FROM h_products p1
    JOIN h_products_v2 p2 ON p1.id = p2.id AND p1.tenant_id = p2.tenant_id
    WHERE p1.product_name != p2.product_name
      AND p1.is_active = 1 AND p2.is_active = 1
    ORDER BY p1.tenant_id, p1.id
  `);
  const m2 = mismatch2 as any[];
  if (m2.length === 0) {
    console.log("  ✅ 불일치 없음\n");
  } else {
    console.log(`  ⚠️  ${m2.length}건 불일치 발견:`);
    for (const r of m2) {
      console.log(`    제품#${r.id} [${r.product_code}]:`);
      console.log(`      h_products:    "${r.v1_name}"`);
      console.log(`      h_products_v2: "${r.v2_name}"`);
      totalIssues++;
      if (FIX_MODE) {
        // h_products_v2를 기준으로 h_products 동기화
        await connection.execute(
          `UPDATE h_products SET product_name = ? WHERE id = ? AND tenant_id = ?`,
          [r.v2_name, r.id, r.tenant_id]
        );
        console.log(`      → 수정됨: h_products.product_name = "${r.v2_name}"`);
        totalFixed++;
      }
    }
    console.log();
  }

  // ─────────────────────────────────────────────────────
  // 3. CCP 비정규화 제품명 불일치
  // ─────────────────────────────────────────────────────
  console.log("━━━ 점검 3: CCP 비정규화 제품명 불일치 ━━━");
  const [mismatch3] = await connection.execute(`
    SELECT
      ci.id as ccp_instance_id, ci.batch_id, ci.product_name as ccp_product_name,
      p.product_name as correct_name, p.id as product_id
    FROM h_ccp_instances ci
    JOIN h_batches b ON ci.batch_id = b.id
    JOIN h_products_v2 p ON b.product_id = p.id AND b.tenant_id = p.tenant_id
    WHERE ci.product_name != p.product_name
    ORDER BY ci.id DESC
    LIMIT 50
  `);
  const m3 = mismatch3 as any[];
  if (m3.length === 0) {
    console.log("  ✅ 불일치 없음\n");
  } else {
    console.log(`  ⚠️  ${m3.length}건 불일치 발견 (최근 50건):`);
    for (const r of m3) {
      console.log(`    CCP Instance#${r.ccp_instance_id} (배치#${r.batch_id}):`);
      console.log(`      CCP:          "${r.ccp_product_name}"`);
      console.log(`      h_products_v2: "${r.correct_name}"`);
      totalIssues++;
      if (FIX_MODE) {
        await connection.execute(
          `UPDATE h_ccp_instances SET product_name = ? WHERE id = ?`,
          [r.correct_name, r.ccp_instance_id]
        );
        console.log(`      → 수정됨`);
        totalFixed++;
      }
    }
    console.log();
  }

  // CCP 폼 레코드 제품명 불일치
  console.log("━━━ 점검 3-1: CCP 폼 레코드 제품명 불일치 ━━━");
  const [mismatch3b] = await connection.execute(`
    SELECT
      cfr.id as form_record_id, cfr.batch_id, cfr.product_name as form_product_name,
      p.product_name as correct_name
    FROM h_ccp_form_records cfr
    JOIN h_batches b ON cfr.batch_id = b.id
    JOIN h_products_v2 p ON b.product_id = p.id AND b.tenant_id = p.tenant_id
    WHERE cfr.product_name != p.product_name
    ORDER BY cfr.id DESC
    LIMIT 50
  `);
  const m3b = mismatch3b as any[];
  if (m3b.length === 0) {
    console.log("  ✅ 불일치 없음\n");
  } else {
    console.log(`  ⚠️  ${m3b.length}건 불일치 발견 (최근 50건):`);
    for (const r of m3b) {
      console.log(`    CCP Form#${r.form_record_id} (배치#${r.batch_id}): "${r.form_product_name}" → "${r.correct_name}"`);
      totalIssues++;
      if (FIX_MODE) {
        await connection.execute(
          `UPDATE h_ccp_form_records SET product_name = ? WHERE id = ?`,
          [r.correct_name, r.form_record_id]
        );
        // h_ccp_form_rows도 동시 업데이트
        await connection.execute(
          `UPDATE h_ccp_form_rows SET product_name = ? WHERE form_record_id = ?`,
          [r.correct_name, r.form_record_id]
        );
        console.log(`      → 수정됨 (form_records + form_rows)`);
        totalFixed++;
      }
    }
    console.log();
  }

  // ─────────────────────────────────────────────────────
  // 4. item_master에 없는 h_products_v2 제품
  // ─────────────────────────────────────────────────────
  console.log("━━━ 점검 4: item_master에 없는 h_products_v2 제품 ━━━");
  const [missing4] = await connection.execute(`
    SELECT p.id, p.product_name, p.product_code, p.tenant_id
    FROM h_products_v2 p
    LEFT JOIN item_master im
      ON im.legacy_product_id = p.id
      AND im.item_type = 'own_product'
      AND im.tenant_id = p.tenant_id
    WHERE im.id IS NULL AND p.is_active = 1
    ORDER BY p.tenant_id, p.id
  `);
  const m4 = missing4 as any[];
  if (m4.length === 0) {
    console.log("  ✅ 모든 h_products_v2 제품이 item_master에 존재\n");
  } else {
    console.log(`  ⚠️  ${m4.length}건 - item_master에 누락된 제품:`);
    for (const r of m4) {
      console.log(`    제품#${r.id} [${r.product_code}] "${r.product_name}" (tenant ${r.tenant_id})`);
      totalIssues++;
      if (FIX_MODE) {
        // item_master에 자동 생성
        const itemCode = `OWN-${r.product_code || r.id}`;
        await connection.execute(
          `INSERT INTO item_master (tenant_id, item_code, item_name, item_type, base_unit, legacy_product_id, is_active)
           VALUES (?, ?, ?, 'own_product', 'kg', ?, 1)
           ON DUPLICATE KEY UPDATE item_name = VALUES(item_name), legacy_product_id = VALUES(legacy_product_id)`,
          [r.tenant_id, itemCode, r.product_name, r.id]
        );
        console.log(`      → item_master에 생성됨 (item_code: ${itemCode})`);
        totalFixed++;
      }
    }
    console.log();
  }

  // ─────────────────────────────────────────────────────
  // 5. h_products_v2에 없는 배치 참조 제품
  // ─────────────────────────────────────────────────────
  console.log("━━━ 점검 5: h_products_v2에 없는 배치 참조 제품 ━━━");
  const [missing5] = await connection.execute(`
    SELECT DISTINCT b.product_id, b.tenant_id,
      COUNT(*) as batch_count,
      MAX(b.planned_date) as last_batch_date
    FROM h_batches b
    LEFT JOIN h_products_v2 p ON b.product_id = p.id AND b.tenant_id = p.tenant_id
    WHERE p.id IS NULL
    GROUP BY b.product_id, b.tenant_id
    ORDER BY batch_count DESC
  `);
  const m5 = missing5 as any[];
  if (m5.length === 0) {
    console.log("  ✅ 모든 배치가 유효한 제품을 참조\n");
  } else {
    console.log(`  ❌ ${m5.length}건 - 배치가 존재하지 않는 제품을 참조:`);
    for (const r of m5) {
      console.log(`    product_id=${r.product_id} (tenant ${r.tenant_id}): ${r.batch_count}건 배치, 최근 ${r.last_batch_date}`);
      totalIssues++;
    }
    console.log();
  }

  // ─────────────────────────────────────────────────────
  // 6. 생산일보 summary JSON 내 제품명 불일치
  // ─────────────────────────────────────────────────────
  console.log("━━━ 점검 6: 생산일보 summary JSON 내 제품명 ━━━");
  const [reports] = await connection.execute(`
    SELECT dr.id, dr.report_date, dr.summary, dr.tenant_id
    FROM h_daily_reports dr
    WHERE dr.report_type = 'production_daily'
      AND dr.summary IS NOT NULL
    ORDER BY dr.report_date DESC
    LIMIT 30
  `);
  let jsonMismatchCount = 0;
  for (const rpt of (reports as any[])) {
    let summary: any = {};
    try { summary = typeof rpt.summary === 'string' ? JSON.parse(rpt.summary) : (rpt.summary || {}); } catch { continue; }
    const batches = summary?.production?.batches || [];
    for (const b of batches) {
      if (!b.productName || !b.productId) continue;
      const [pRows] = await connection.execute(
        `SELECT product_name FROM h_products_v2 WHERE id = ? AND tenant_id = ?`,
        [b.productId, rpt.tenant_id]
      );
      const pr = (pRows as any[])[0];
      if (pr && pr.product_name !== b.productName) {
        if (jsonMismatchCount === 0) console.log(`  ⚠️  생산일보 JSON 내 제품명 불일치:`);
        console.log(`    일보#${rpt.id} (${rpt.report_date}): 배치 "${b.batchCode}"`);
        console.log(`      JSON:         "${b.productName}"`);
        console.log(`      h_products_v2: "${pr.product_name}"`);
        jsonMismatchCount++;
        totalIssues++;
      }
    }
  }
  if (jsonMismatchCount === 0) {
    console.log("  ✅ 최근 30건 생산일보 JSON 내 제품명 정상\n");
  } else {
    console.log(`  ※ JSON 내 제품명은 일보 갱신 시 자동 수정됩니다.\n`);
  }

  // ─────────────────────────────────────────────────────
  // 요약
  // ─────────────────────────────────────────────────────
  console.log("=".repeat(70));
  console.log(`  점검 완료: 총 ${totalIssues}건 불일치 발견`);
  if (FIX_MODE) {
    console.log(`  수정 완료: ${totalFixed}건`);
  } else if (totalIssues > 0) {
    console.log(`  수정하려면: npx tsx scripts/check-product-name-consistency.ts --fix`);
  }
  console.log("=".repeat(70));

  await connection.end();
}

main().catch((err) => {
  console.error("오류:", err);
  process.exit(1);
});

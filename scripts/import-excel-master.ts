/**
 * 엑셀 기초데이터 임포트 - Step 1: 마스터 데이터
 *
 * 📋 사용 안내 시트 기반 → 거래처, 원료, 제품 마스터 생성
 *
 * 실행: npx tsx scripts/import-excel-master.ts [엑셀파일경로]
 */

import mysql from "mysql2/promise";
import ExcelJS from "exceljs";
import path from "path";

const TENANT_ID = 2;
const SITE_ID = 1;
const CREATED_BY = 4; // admin

// ─── DB 접속 ───
async function getConnection() {
  return mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "G0ld3n!T1004#Sec",
    database: "haccp_tenant_db",
  });
}

// ─── 1. 거래처 임포트 ───
async function importPartners(conn: mysql.Connection, wb: ExcelJS.Workbook) {
  const ws = wb.getWorksheet("🏢 거래처 관리");
  if (!ws) throw new Error("거래처 관리 시트 없음");

  console.log("\n=== 1. 거래처 임포트 ===");

  const partners: Array<{
    name: string;
    type: string | null;
    contact: string | null;
    phone: string | null;
    note: string | null;
  }> = [];

  ws.eachRow((row, rowNumber) => {
    if (rowNumber < 4) return;
    const name = row.getCell(2).value?.toString()?.trim();
    if (!name) return;
    partners.push({
      name,
      type: row.getCell(3).value?.toString()?.trim() || null,
      contact: row.getCell(4).value?.toString()?.trim() || null,
      phone: row.getCell(5).value?.toString()?.trim() || null,
      note: row.getCell(7).value?.toString()?.trim() || null,
    });
  });

  // 중복 제거 (이름 기준)
  const uniquePartners = [...new Map(partners.map((p) => [p.name, p])).values()];

  let created = 0;
  let skipped = 0;
  const partnerIdMap: Record<string, number> = {};

  for (const p of uniquePartners) {
    // 기존 거래처 확인
    const [existing] = (await conn.execute(
      `SELECT id FROM partners WHERE tenant_id = ? AND company_name = ?`,
      [TENANT_ID, p.name]
    )) as any[];

    if (existing.length > 0) {
      partnerIdMap[p.name] = existing[0].id;
      skipped++;
      continue;
    }

    // 거래유형 결정
    let partnerType = "customer";
    if (p.note?.includes("공급") || p.note?.includes("위탁")) {
      partnerType = "supplier";
    }

    const [result] = (await conn.execute(
      `INSERT INTO partners (tenant_id, partner_type, company_name, contact_person, email, phone, address, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [TENANT_ID, partnerType, p.name, p.contact, p.phone, null, null]
    )) as any[];

    partnerIdMap[p.name] = result.insertId;
    created++;
  }

  // 엑셀의 공급처(입고 시트에만 등장)도 추가
  const purchaseWs = wb.getWorksheet("📥 원재료 입고");
  if (purchaseWs) {
    const supplierNames = new Set<string>();
    purchaseWs.eachRow((row, rowNumber) => {
      if (rowNumber < 6) return;
      const supplier = row.getCell(3).value?.toString()?.trim();
      if (supplier && !partnerIdMap[supplier]) supplierNames.add(supplier);
    });

    for (const name of supplierNames) {
      const [existing] = (await conn.execute(
        `SELECT id FROM partners WHERE tenant_id = ? AND company_name = ?`,
        [TENANT_ID, name]
      )) as any[];

      if (existing.length > 0) {
        partnerIdMap[name] = existing[0].id;
        continue;
      }

      const [result] = (await conn.execute(
        `INSERT INTO partners (tenant_id, partner_type, company_name, is_active)
         VALUES (?, 'supplier', ?, 1)`,
        [TENANT_ID, name]
      )) as any[];

      partnerIdMap[name] = result.insertId;
      created++;
    }
  }

  console.log(`  생성: ${created}건, 기존: ${skipped}건`);
  return partnerIdMap;
}

// ─── 2. 원료 마스터 임포트 ───
async function importMaterials(conn: mysql.Connection, wb: ExcelJS.Workbook) {
  const ws = wb.getWorksheet("🏭 원료 마스터");
  if (!ws) throw new Error("원료 마스터 시트 없음");

  console.log("\n=== 2. 원료 마스터 임포트 ===");

  const materials: Array<{
    name: string;
    unit: string;
  }> = [];

  ws.eachRow((row, rowNumber) => {
    if (rowNumber < 4) return;
    const name = row.getCell(2).value?.toString()?.trim();
    if (!name) return;
    const unit = row.getCell(4).value?.toString()?.trim() || "kg";
    materials.push({ name, unit });
  });

  let created = 0;
  let skipped = 0;
  const materialIdMap: Record<string, number> = {};

  for (let i = 0; i < materials.length; i++) {
    const m = materials[i];

    // 기존 원재료 확인 (h_item_master)
    const [existing] = (await conn.execute(
      `SELECT id FROM h_item_master WHERE tenant_id = ? AND item_name = ? AND item_type = 'raw_material'`,
      [TENANT_ID, m.name]
    )) as any[];

    if (existing.length > 0) {
      materialIdMap[m.name] = existing[0].id;
      skipped++;
      continue;
    }

    // h_item_master에 삽입
    const itemCode = `RM-${String(i + 1).padStart(4, "0")}`;
    const [result] = (await conn.execute(
      `INSERT INTO h_item_master (tenant_id, item_code, item_name, item_type, base_unit, category, is_active)
       VALUES (?, ?, ?, 'raw_material', ?, '원재료', 1)`,
      [TENANT_ID, itemCode, m.name, m.unit]
    )) as any[];

    materialIdMap[m.name] = result.insertId;
    created++;
  }

  console.log(`  생성: ${created}건, 기존: ${skipped}건 (총 ${materials.length}개 원료)`);
  return materialIdMap;
}

// ─── 3. 제품 마스터 임포트 ───
async function importProducts(conn: mysql.Connection, wb: ExcelJS.Workbook) {
  const ws = wb.getWorksheet("🔖 배합비 참조");
  if (!ws) throw new Error("배합비 참조 시트 없음");

  console.log("\n=== 3. 제품 마스터 임포트 ===");

  // 행1에서 제품명 수집
  const products: string[] = [];
  const headerRow = ws.getRow(1);
  for (let c = 2; c <= ws.columnCount; c++) {
    const name = headerRow.getCell(c).value?.toString()?.trim();
    if (name) products.push(name);
  }

  // 원가분석에서 품목제조보고번호 가져오기
  const costWs = wb.getWorksheet("💰 원가 분석");
  const reportNoMap: Record<string, string> = {};
  if (costWs) {
    costWs.eachRow((row, rowNumber) => {
      if (rowNumber < 5) return;
      const name = row.getCell(2).value?.toString()?.trim();
      const reportNo = row.getCell(3).value?.toString()?.trim();
      if (name && reportNo) reportNoMap[name] = reportNo;
    });
  }

  let created = 0;
  let skipped = 0;
  const productIdMap: Record<string, number> = {};

  for (let i = 0; i < products.length; i++) {
    const name = products[i];

    // 기존 제품 확인 (h_item_master)
    const [existing] = (await conn.execute(
      `SELECT id FROM h_item_master WHERE tenant_id = ? AND item_name = ? AND item_type = 'own_product'`,
      [TENANT_ID, name]
    )) as any[];

    if (existing.length > 0) {
      productIdMap[name] = existing[0].id;
      skipped++;
      continue;
    }

    // h_products_v2 확인 (배치에서 사용)
    const [existingV2] = (await conn.execute(
      `SELECT id FROM h_products_v2 WHERE tenant_id = ? AND product_name = ?`,
      [TENANT_ID, name]
    )) as any[];

    if (existingV2.length > 0) {
      productIdMap[name] = existingV2[0].id;
      skipped++;
      continue;
    }

    const itemCode = `FP-${String(i + 1).padStart(4, "0")}`;
    const reportNo = reportNoMap[name] || null;

    // h_item_master에 삽입
    const [result] = (await conn.execute(
      `INSERT INTO h_item_master (tenant_id, item_code, item_name, item_type, base_unit, category, product_report_no, is_active)
       VALUES (?, ?, ?, 'own_product', 'kg', '완제품', ?, 1)`,
      [TENANT_ID, itemCode, name, reportNo]
    )) as any[];

    const itemMasterId = result.insertId;

    // h_products_v2에도 삽입 (배치 생성에 필요)
    const [prodResult] = (await conn.execute(
      `INSERT INTO h_products_v2 (tenant_id, site_id, product_name, product_code, item_master_id, is_active)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [TENANT_ID, SITE_ID, name, itemCode, itemMasterId]
    )) as any[];

    productIdMap[name] = prodResult.insertId;
    created++;
  }

  console.log(`  생성: ${created}건, 기존: ${skipped}건 (총 ${products.length}개 제품)`);
  return productIdMap;
}

// ─── 메인 실행 ───
async function main() {
  const excelPath = process.argv[2] || path.resolve(__dirname, "../HACCP_원료수불부_원가관리0320.xlsx");
  console.log(`📂 엑셀 파일: ${excelPath}`);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(excelPath);
  console.log(`📊 시트 수: ${wb.worksheets.length}`);

  const conn = await getConnection();

  try {
    console.log("\n========================================");
    console.log("  HACCP-ONE 마스터 데이터 임포트");
    console.log("========================================");

    const partnerIdMap = await importPartners(conn, wb);
    const materialIdMap = await importMaterials(conn, wb);
    const productIdMap = await importProducts(conn, wb);

    // ID 맵 저장 (후속 스크립트에서 사용)
    const idMapPath = path.resolve(__dirname, "../.import-id-map.json");
    const fs = await import("fs");
    fs.writeFileSync(
      idMapPath,
      JSON.stringify({ partnerIdMap, materialIdMap, productIdMap }, null, 2),
      "utf8"
    );
    console.log(`\n💾 ID 맵 저장: ${idMapPath}`);

    console.log("\n========================================");
    console.log("  ✅ 마스터 데이터 임포트 완료!");
    console.log("========================================");
    console.log(`  거래처: ${Object.keys(partnerIdMap).length}개`);
    console.log(`  원재료: ${Object.keys(materialIdMap).length}개`);
    console.log(`  제품:   ${Object.keys(productIdMap).length}개`);
    console.log(`\n▶ 다음 단계: npx tsx scripts/import-excel-bom.ts`);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("❌ 오류:", err);
  process.exit(1);
});

/**
 * 엑셀 기초데이터 임포트 - Step 2: 배합비(BOM) 데이터
 *
 * 🔖 배합비 참조 시트 → h_mf_reports + h_mf_report_versions + h_mf_ingredients
 * 💰 원가 분석 시트 → 품목제조보고번호 참조
 *
 * 실행: npx tsx scripts/import-excel-bom.ts [엑셀파일경로]
 */

import mysql from "mysql2/promise";
import ExcelJS from "exceljs";
import path from "path";
import fs from "fs";

const TENANT_ID = 2;
const SITE_ID = 1;
const CREATED_BY = 4;

async function getConnection() {
  return mysql.createConnection({
    host: "localhost",
    user: "root",
    password: process.env.DB_PASSWORD || "",
    database: "haccp_tenant_db",
  });
}

// ─── ID 맵 로드 ───
function loadIdMap(): {
  partnerIdMap: Record<string, number>;
  materialIdMap: Record<string, number>;
  productIdMap: Record<string, number>;
} {
  const mapPath = path.resolve(__dirname, "../.import-id-map.json");
  if (!fs.existsSync(mapPath)) {
    throw new Error("ID 맵 파일 없음. 먼저 import-excel-master.ts 실행 필요");
  }
  return JSON.parse(fs.readFileSync(mapPath, "utf8"));
}

// ─── 배합비 임포트 ───
async function importBOM(conn: mysql.Connection, wb: ExcelJS.Workbook) {
  const ws = wb.getWorksheet("🔖 배합비 참조");
  if (!ws) throw new Error("배합비 참조 시트 없음");

  const { materialIdMap, productIdMap } = loadIdMap();

  console.log("\n=== 배합비(BOM) 임포트 ===");

  // 제품명 목록 (행1, B열~)
  const products: Array<{ col: number; name: string }> = [];
  const headerRow = ws.getRow(1);
  for (let c = 2; c <= ws.columnCount; c++) {
    const name = headerRow.getCell(c).value?.toString()?.trim();
    if (name) products.push({ col: c, name });
  }

  // 원료명 목록 (A열, 행2~)
  const materials: Array<{ row: number; name: string }> = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber < 2) return;
    const name = row.getCell(1).value?.toString()?.trim();
    if (name) materials.push({ row: rowNumber, name });
  });

  // 원가분석에서 품목제조보고번호
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

  let mfReportCount = 0;
  let ingredientCount = 0;

  for (const product of products) {
    const productId = productIdMap[product.name];
    if (!productId) {
      console.warn(`  ⚠️ 제품 ID 없음: ${product.name}`);
      continue;
    }

    // 이 제품의 배합비 수집
    const ingredients: Array<{
      materialName: string;
      materialId: number;
      ratio: number;
    }> = [];

    for (const mat of materials) {
      const cellValue = ws.getRow(mat.row).getCell(product.col).value;
      const ratio = typeof cellValue === "number" ? cellValue : parseFloat(String(cellValue || "0"));
      if (ratio > 0) {
        const materialId = materialIdMap[mat.name];
        if (materialId) {
          ingredients.push({ materialName: mat.name, materialId, ratio });
        }
      }
    }

    if (ingredients.length === 0) continue;

    // 기존 MF Report 확인
    const reportNo = reportNoMap[product.name] || `MF-AUTO-${String(mfReportCount + 1).padStart(4, "0")}`;

    const [existingReport] = (await conn.execute(
      `SELECT id FROM h_mf_reports WHERE tenant_id = ? AND product_id = ?`,
      [TENANT_ID, productId]
    )) as any[];

    let mfReportId: number;

    if (existingReport.length > 0) {
      mfReportId = existingReport[0].id;
    } else {
      // h_mf_reports 생성
      const [result] = (await conn.execute(
        `INSERT INTO h_mf_reports (product_id, report_no, report_date, status, tenant_id)
         VALUES (?, ?, CURDATE(), 'ACTIVE', ?)`,
        [productId, reportNo, TENANT_ID]
      )) as any[];
      mfReportId = result.insertId;
      mfReportCount++;
    }

    // 기존 버전 확인
    const [existingVersion] = (await conn.execute(
      `SELECT id FROM h_mf_report_versions WHERE mf_report_id = ? AND tenant_id = ?`,
      [mfReportId, TENANT_ID]
    )) as any[];

    let versionId: number;

    if (existingVersion.length > 0) {
      versionId = existingVersion[0].id;
      // 기존 재료 삭제 후 재삽입
      await conn.execute(
        `DELETE FROM h_mf_ingredients WHERE mf_report_version_id = ?`,
        [versionId]
      );
    } else {
      // 배합비 합계 계산
      const totalRatio = ingredients.reduce((sum, ig) => sum + ig.ratio, 0);

      // h_mf_report_versions 생성
      const [verResult] = (await conn.execute(
        `INSERT INTO h_mf_report_versions
         (mf_report_id, version_no, effective_from, change_reason, approval_status,
          composition_total_rule, yield_basis, batch_target_kg, tenant_id, created_by)
         VALUES (?, 1, CURDATE(), '엑셀 데이터 임포트', 'APPROVED',
                 '100%', 'PER_BATCH_KG', 70, ?, ?)`,
        [mfReportId, TENANT_ID, CREATED_BY]
      )) as any[];
      versionId = verResult.insertId;
    }

    // h_mf_ingredients 삽입
    for (let i = 0; i < ingredients.length; i++) {
      const ig = ingredients[i];

      // 정제수 여부 확인 (정제수는 차감 제외)
      const isDeductible = ig.materialName === "정제수" ? 0 : 1;

      await conn.execute(
        `INSERT INTO h_mf_ingredients
         (mf_report_version_id, line_no, material_id, quantity, unit, is_deductible, material_type)
         VALUES (?, ?, ?, ?, '%', ?, 'RAW')`,
        [versionId, i + 1, ig.materialId, String(ig.ratio), isDeductible]
      );
      ingredientCount++;
    }
  }

  console.log(`  MF Report 생성: ${mfReportCount}건`);
  console.log(`  배합비 항목: ${ingredientCount}건`);
}

// ─── 메인 ───
async function main() {
  const excelPath = process.argv[2] || path.resolve(__dirname, "../HACCP_원료수불부_원가관리0320.xlsx");
  console.log(`📂 엑셀 파일: ${excelPath}`);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(excelPath);

  const conn = await getConnection();

  try {
    console.log("\n========================================");
    console.log("  HACCP-ONE 배합비(BOM) 임포트");
    console.log("========================================");

    await importBOM(conn, wb);

    console.log("\n========================================");
    console.log("  ✅ 배합비 임포트 완료!");
    console.log("========================================");
    console.log(`\n▶ 다음 단계: npx tsx scripts/import-excel-operations.ts`);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("❌ 오류:", err);
  process.exit(1);
});

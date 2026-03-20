/**
 * 엑셀 기초데이터 임포트 - Step 3: 운영 데이터
 *
 * 📥 원재료 입고 → accounting_purchases + h_inventory + h_inventory_lots
 * 📦 일일 생산 입력 → h_batches + h_batch_inputs (자동로직 트리거)
 * 📤 납품 출고 → accounting_sales
 * 📊 월별 원료수불부 → material_ledger_daily (전월재고 기반)
 * 📋 육안검사일지 → h_generic_checklist_records
 *
 * 실행: npx tsx scripts/import-excel-operations.ts [엑셀파일경로]
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
    password: "G0ld3n!T1004#Sec",
    database: "haccp_tenant_db",
  });
}

function loadIdMap() {
  const mapPath = path.resolve(__dirname, "../.import-id-map.json");
  if (!fs.existsSync(mapPath)) {
    throw new Error("ID 맵 파일 없음. 먼저 import-excel-master.ts 실행 필요");
  }
  return JSON.parse(fs.readFileSync(mapPath, "utf8")) as {
    partnerIdMap: Record<string, number>;
    materialIdMap: Record<string, number>;
    productIdMap: Record<string, number>;
  };
}

function formatDate(val: any): string {
  if (!val) return "";
  if (val instanceof Date) {
    return val.toISOString().slice(0, 10);
  }
  const s = String(val).trim();
  // "2025년산" 같은 비표준 날짜 처리
  if (s.includes("년산")) return "";
  // YYYY-MM-DD 패턴 추출
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return "";
}

// ─── 1. 원재료 입고 임포트 ───
async function importPurchases(conn: mysql.Connection, wb: ExcelJS.Workbook, idMap: ReturnType<typeof loadIdMap>) {
  const ws = wb.getWorksheet("📥 원재료 입고");
  if (!ws) { console.warn("⚠️ 원재료 입고 시트 없음"); return; }

  console.log("\n=== 1. 원재료 입고 임포트 ===");

  let created = 0;
  const seenKeys = new Set<string>(); // 중복 제거

  ws.eachRow((row, rowNumber) => {
    if (rowNumber < 6) return;
    const dateVal = row.getCell(1).value;
    const materialName = row.getCell(2).value?.toString()?.trim();
    if (!dateVal || !materialName) return;

    const date = formatDate(dateVal);
    if (!date) return;

    // 중복 체크 (같은 날짜+원료+수량)
    const qty = parseFloat(String(row.getCell(5).value || "0"));
    const key = `${date}|${materialName}|${qty}`;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);

    const supplier = row.getCell(3).value?.toString()?.trim() || "";
    const purchaseType = row.getCell(4).value?.toString()?.trim() || "자체구매";
    const unitPrice = parseFloat(String(row.getCell(6).value || "0"));
    const expiryDate = formatDate(row.getCell(9).value);
    const note = row.getCell(10).value?.toString()?.trim() || "";

    // 큐에 추가 (async 처리를 위해)
    purchaseQueue.push({
      date, materialName, supplier, purchaseType,
      qty, unitPrice, expiryDate, note,
    });
  });

  // 비동기 처리
  for (const p of purchaseQueue) {
    const partnerId = idMap.partnerIdMap[p.supplier] || null;
    const materialId = idMap.materialIdMap[p.materialName] || null;
    const totalAmount = Math.round(p.qty * p.unitPrice);

    // accounting_purchases 삽입
    const [result] = (await conn.execute(
      `INSERT INTO accounting_purchases
       (tenant_id, transaction_date, partner_id, item_name, quantity, unit, unit_price,
        total_amount, evidence_type, notes, status, created_by)
       VALUES (?, ?, ?, ?, ?, 'kg', ?, ?, 'none', ?, 'approved', ?)`,
      [TENANT_ID, p.date, partnerId, p.materialName, p.qty, p.unitPrice,
       totalAmount, `${p.purchaseType}${p.note ? " / " + p.note : ""}`, CREATED_BY]
    )) as any[];

    const purchaseId = result.insertId;

    // h_inventory 업데이트 (재고 추가)
    if (materialId) {
      // 재고 마스터 upsert
      const [existingInv] = (await conn.execute(
        `SELECT id, total_quantity FROM h_inventory
         WHERE tenant_id = ? AND material_id = ?`,
        [TENANT_ID, materialId]
      )) as any[];

      let inventoryId: number;
      if (existingInv.length > 0) {
        inventoryId = existingInv[0].id;
        await conn.execute(
          `UPDATE h_inventory SET total_quantity = total_quantity + ?,
           available_quantity = available_quantity + ?, last_updated = NOW()
           WHERE id = ?`,
          [p.qty, p.qty, inventoryId]
        );
      } else {
        const [invResult] = (await conn.execute(
          `INSERT INTO h_inventory
           (tenant_id, site_id, material_id, item_name, total_quantity, available_quantity, unit)
           VALUES (?, ?, ?, ?, ?, ?, 'kg')`,
          [TENANT_ID, SITE_ID, materialId, p.materialName, p.qty, p.qty]
        )) as any[];
        inventoryId = invResult.insertId;
      }

      // h_inventory_lots 삽입 (LOT 단위 관리)
      const lotNumber = `LOT-${p.date.replace(/-/g, "")}-${String(created + 1).padStart(3, "0")}`;
      await conn.execute(
        `INSERT INTO h_inventory_lots
         (tenant_id, inventory_id, lot_number, material_id, quantity, current_quantity,
          available_quantity, unit, unit_price, receipt_date, expiry_date,
          supplier_name, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'kg', ?, ?, ?, ?, 'available')`,
        [TENANT_ID, inventoryId, lotNumber, materialId, p.qty, p.qty,
         p.qty, p.unitPrice, p.date, p.expiryDate || null, p.supplier]
      );
    }

    created++;
  }

  console.log(`  입고 생성: ${created}건`);
}

const purchaseQueue: Array<{
  date: string; materialName: string; supplier: string; purchaseType: string;
  qty: number; unitPrice: number; expiryDate: string; note: string;
}> = [];

// ─── 2. 전월재고(이월재고) 설정 ───
async function importOpeningStock(conn: mysql.Connection, wb: ExcelJS.Workbook, idMap: ReturnType<typeof loadIdMap>) {
  const ws = wb.getWorksheet("📊 월별 원료수불부");
  if (!ws) { console.warn("⚠️ 월별 원료수불부 시트 없음"); return; }

  console.log("\n=== 2. 전월재고(이월재고) 설정 ===");

  let count = 0;
  // 이월 기준일: 2025-12-31 (2026-01 전월재고)
  const carryoverDate = "2025-12-31";

  ws.eachRow((row, rowNumber) => {
    if (rowNumber < 5) return;
    const name = row.getCell(2).value?.toString()?.trim();
    const stock = parseFloat(String(row.getCell(3).value || "0"));
    if (!name || stock <= 0) return;

    openingStockQueue.push({ name, stock });
  });

  for (const item of openingStockQueue) {
    const materialId = idMap.materialIdMap[item.name];
    if (!materialId) continue;

    // material_ledger_daily에 이월재고 기록
    const [existing] = (await conn.execute(
      `SELECT id FROM material_ledger_daily
       WHERE tenant_id = ? AND material_id = ? AND ledger_date = ?`,
      [TENANT_ID, materialId, carryoverDate]
    )) as any[];

    if (existing.length > 0) {
      await conn.execute(
        `UPDATE material_ledger_daily SET running_stock = ?, notes = '전월이월', source = 'excel_import'
         WHERE id = ?`,
        [item.stock, existing[0].id]
      );
    } else {
      await conn.execute(
        `INSERT INTO material_ledger_daily
         (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty,
          running_stock, notes, source)
         VALUES (?, ?, ?, 0, 0, ?, ?, '전월이월(엑셀)', 'excel_import')`,
        [TENANT_ID, materialId, carryoverDate, item.stock, item.stock]
      );
    }
    count++;
  }

  console.log(`  이월재고 설정: ${count}건`);
}

const openingStockQueue: Array<{ name: string; stock: number }> = [];

// ─── 3. 일일 생산 실적 → 배치 생성 ───
async function importProduction(conn: mysql.Connection, wb: ExcelJS.Workbook, idMap: ReturnType<typeof loadIdMap>) {
  const ws = wb.getWorksheet("📦 일일 생산 입력");
  if (!ws) { console.warn("⚠️ 일일 생산 입력 시트 없음"); return; }

  // 배합비 매트릭스 로드 (원료사용량 계산용)
  const bomWs = wb.getWorksheet("🔖 배합비 참조");
  const bomMatrix: Record<string, Record<string, number>> = {}; // product → { material → ratio }

  if (bomWs) {
    const products: Array<{ col: number; name: string }> = [];
    const bomHeaderRow = bomWs.getRow(1);
    for (let c = 2; c <= bomWs.columnCount; c++) {
      const name = bomHeaderRow.getCell(c).value?.toString()?.trim();
      if (name) products.push({ col: c, name });
    }

    bomWs.eachRow((row, rowNumber) => {
      if (rowNumber < 2) return;
      const matName = row.getCell(1).value?.toString()?.trim();
      if (!matName) return;

      for (const prod of products) {
        const val = row.getCell(prod.col).value;
        const ratio = typeof val === "number" ? val : parseFloat(String(val || "0"));
        if (ratio > 0) {
          if (!bomMatrix[prod.name]) bomMatrix[prod.name] = {};
          bomMatrix[prod.name][matName] = ratio;
        }
      }
    });
  }

  console.log("\n=== 3. 일일 생산 실적 → 배치 생성 ===");

  // 날짜별 배치 그룹 카운터
  const dayBatchCounter: Record<string, number> = {};
  let batchCount = 0;
  let inputCount = 0;

  ws.eachRow((row, rowNumber) => {
    if (rowNumber < 5) return;
    const dateVal = row.getCell(2).value;
    const productName = row.getCell(3).value?.toString()?.trim();
    const qty = parseFloat(String(row.getCell(4).value || "0"));
    if (!dateVal || !productName || qty <= 0) return;

    const date = formatDate(dateVal);
    if (!date) return;

    productionQueue.push({ date, productName, qty });
  });

  for (const p of productionQueue) {
    const productId = idMap.productIdMap[p.productName];
    if (!productId) {
      console.warn(`  ⚠️ 제품 ID 없음: ${p.productName}`);
      continue;
    }

    // 배치 코드 생성: BATCH-YYYYMMDD-NNN
    const dateKey = p.date.replace(/-/g, "");
    if (!dayBatchCounter[dateKey]) dayBatchCounter[dateKey] = 0;
    dayBatchCounter[dateKey]++;
    const batchCode = `BATCH-${dateKey}-${String(dayBatchCounter[dateKey]).padStart(3, "0")}`;
    const dayBatchGroup = `DAY-${dateKey}`;

    // LOT 번호 생성: YYYYMMDD
    const lotNumber = dateKey;

    // 배치 생성 (created_at을 planned_date로 설정하여 과거 데이터 정확히 반영)
    const [batchResult] = (await conn.execute(
      `INSERT INTO h_batches
       (tenant_id, site_id, batch_code, day_batch_group, batch_order, product_id,
        planned_quantity, actual_quantity, planned_date, status, mode,
        lot_number, notes, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', 'auto', ?, '엑셀 임포트', ?, ?, ?)`,
      [TENANT_ID, SITE_ID, batchCode, dayBatchGroup, dayBatchCounter[dateKey],
       productId, p.qty, p.qty, p.date, lotNumber, CREATED_BY, p.date, p.date]
    )) as any[];

    const batchId = batchResult.insertId;
    batchCount++;

    // 배합비 기반 원료 투입량 계산 → h_batch_inputs
    const bom = bomMatrix[p.productName];
    if (bom) {
      for (const [matName, ratio] of Object.entries(bom)) {
        if (matName === "정제수") continue; // 정제수 제외

        const materialId = idMap.materialIdMap[matName];
        if (!materialId) continue;

        // 핵심 수식: 생산량(kg) × 배합비(%) / 100 = 원료사용량(kg)
        const usedQty = Math.round((p.qty * ratio / 100) * 1000) / 1000;
        if (usedQty <= 0) continue;

        await conn.execute(
          `INSERT INTO h_batch_inputs
           (tenant_id, batch_id, material_id, planned_quantity, actual_quantity,
            unit, inventory_deducted)
           VALUES (?, ?, ?, ?, ?, 'kg', 1)`,
          [TENANT_ID, batchId, materialId, usedQty, usedQty]
        );
        inputCount++;
      }
    }

    // material_ledger_daily 업데이트 (원료 사용 기록)
    if (bom) {
      for (const [matName, ratio] of Object.entries(bom)) {
        if (matName === "정제수") continue;
        const materialId = idMap.materialIdMap[matName];
        if (!materialId) continue;

        const usedQty = Math.round((p.qty * ratio / 100) * 1000) / 1000;
        if (usedQty <= 0) continue;

        // 수불부 upsert
        const [existing] = (await conn.execute(
          `SELECT id, usage_qty FROM material_ledger_daily
           WHERE tenant_id = ? AND material_id = ? AND ledger_date = ?`,
          [TENANT_ID, materialId, p.date]
        )) as any[];

        if (existing.length > 0) {
          await conn.execute(
            `UPDATE material_ledger_daily SET usage_qty = usage_qty + ?, source = 'excel_batch'
             WHERE id = ?`,
            [usedQty, existing[0].id]
          );
        } else {
          await conn.execute(
            `INSERT INTO material_ledger_daily
             (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, running_stock, source)
             VALUES (?, ?, ?, 0, ?, 0, 'excel_batch')`,
            [TENANT_ID, materialId, p.date, usedQty]
          );
        }
      }
    }
  }

  console.log(`  배치 생성: ${batchCount}건`);
  console.log(`  원료투입: ${inputCount}건`);

  // running_stock 재계산
  await recalculateRunningStock(conn, idMap);
}

const productionQueue: Array<{ date: string; productName: string; qty: number }> = [];

// ─── 수불부 running_stock 재계산 ───
async function recalculateRunningStock(conn: mysql.Connection, idMap: ReturnType<typeof loadIdMap>) {
  console.log("\n=== 수불부 잔고 재계산 ===");

  // 모든 원료별로 날짜순 정렬하여 누적 계산
  const materialIds = [...new Set(Object.values(idMap.materialIdMap))];

  for (const materialId of materialIds) {
    const [rows] = (await conn.execute(
      `SELECT id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock
       FROM material_ledger_daily
       WHERE tenant_id = ? AND material_id = ?
       ORDER BY ledger_date ASC`,
      [TENANT_ID, materialId]
    )) as any[];

    let runningStock = 0;

    for (const row of rows) {
      // 첫 행이 이월재고인 경우
      if (row.notes === "전월이월(엑셀)") {
        runningStock = parseFloat(row.running_stock);
        continue;
      }

      runningStock += parseFloat(row.receiving_qty || 0);
      runningStock -= parseFloat(row.usage_qty || 0);
      runningStock += parseFloat(row.adjustment_qty || 0);

      await conn.execute(
        `UPDATE material_ledger_daily SET running_stock = ? WHERE id = ?`,
        [Math.max(runningStock, 0), row.id]
      );
    }
  }
  console.log("  ✅ 잔고 재계산 완료");
}

// ─── 4. 납품 출고 임포트 ───
async function importSales(conn: mysql.Connection, wb: ExcelJS.Workbook, idMap: ReturnType<typeof loadIdMap>) {
  const ws = wb.getWorksheet("📤 납품 출고");
  if (!ws) { console.warn("⚠️ 납품 출고 시트 없음"); return; }

  console.log("\n=== 4. 납품 출고 임포트 ===");

  let created = 0;

  ws.eachRow(async (row, rowNumber) => {
    if (rowNumber < 4) return;
    const dateVal = row.getCell(1).value;
    const partnerName = row.getCell(2).value?.toString()?.trim();
    const productName = row.getCell(4).value?.toString()?.trim();
    if (!dateVal || !partnerName || !productName) return;

    const date = formatDate(dateVal);
    if (!date) return;

    const saleType = row.getCell(3).value?.toString()?.trim() || "B2B";
    const saleQty = parseFloat(String(row.getCell(5).value || "0"));
    const unitWeightG = parseFloat(String(row.getCell(6).value || "0"));
    const totalWeightKg = parseFloat(String(row.getCell(7).value || "0"));
    const note = row.getCell(9).value?.toString()?.trim() || "";

    salesQueue.push({
      date, partnerName, saleType, productName,
      saleQty, unitWeightG, totalWeightKg, note,
    });
  });

  for (const s of salesQueue) {
    const partnerId = idMap.partnerIdMap[s.partnerName] || null;

    await conn.execute(
      `INSERT INTO accounting_sales
       (tenant_id, transaction_date, partner_id, item_name, quantity, unit, unit_price,
        total_amount, evidence_type, notes, status, created_by)
       VALUES (?, ?, ?, ?, ?, 'kg', 0, 0, 'none', ?, 'approved', ?)`,
      [TENANT_ID, s.date, partnerId, s.productName, s.totalWeightKg || s.saleQty,
       `${s.saleType} / 수량:${s.saleQty}개 단위중량:${s.unitWeightG}g${s.note ? " / " + s.note : ""}`,
       CREATED_BY]
    );
    created++;
  }

  console.log(`  납품 출고: ${created}건`);
}

const salesQueue: Array<{
  date: string; partnerName: string; saleType: string; productName: string;
  saleQty: number; unitWeightG: number; totalWeightKg: number; note: string;
}> = [];

// ─── 5. 육안검사일지 임포트 ───
async function importInspections(conn: mysql.Connection, wb: ExcelJS.Workbook) {
  const ws = wb.getWorksheet("📋 육안검사일지");
  if (!ws) { console.warn("⚠️ 육안검사일지 시트 없음"); return; }

  console.log("\n=== 5. 육안검사일지 임포트 ===");

  let created = 0;

  // 날짜별로 그룹핑
  const inspByDate: Record<string, Array<Record<string, any>>> = {};

  ws.eachRow((row, rowNumber) => {
    if (rowNumber < 4) return;
    const dateVal = row.getCell(1).value;
    if (!dateVal) return;

    const date = formatDate(dateVal);
    if (!date) return;

    const record = {
      itemName: row.getCell(2).value?.toString()?.trim() || "",
      origin: row.getCell(3).value?.toString()?.trim() || "",
      hasCert: row.getCell(4).value?.toString()?.trim() || "",
      expiryDate: formatDate(row.getCell(5).value),
      vehicleTemp: row.getCell(6).value?.toString()?.trim() || "",
      vehicleCondition: row.getCell(7).value?.toString()?.trim() || "",
      palletCondition: row.getCell(8).value?.toString()?.trim() || "",
      appearance: row.getCell(9).value?.toString()?.trim() || "",
      foreignMatter: row.getCell(10).value?.toString()?.trim() || "",
      labelCheck: row.getCell(11).value?.toString()?.trim() || "",
      passStatus: row.getCell(12).value?.toString()?.trim() || "",
      action: row.getCell(13).value?.toString()?.trim() || "",
    };

    if (!inspByDate[date]) inspByDate[date] = [];
    inspByDate[date].push(record);
  });

  for (const [date, records] of Object.entries(inspByDate)) {
    const formData = {
      inspectionDate: date,
      items: records,
      inspector: "관리자",
      approver: "관리자",
    };

    await conn.execute(
      `INSERT INTO h_generic_checklist_records
       (site_id, tenant_id, form_type, form_date, title, form_data, status, created_by)
       VALUES (?, ?, 'visual_inspection', ?, ?, ?, 'approved', ?)`,
      [SITE_ID, TENANT_ID, date,
       `육안검사일지 ${date}`,
       JSON.stringify(formData),
       CREATED_BY]
    );
    created++;
  }

  console.log(`  육안검사일지: ${created}건 (날짜별 그룹)`);
}

// ─── 메인 ───
async function main() {
  const excelPath = process.argv[2] || path.resolve(__dirname, "../HACCP_원료수불부_원가관리0320.xlsx");
  console.log(`📂 엑셀 파일: ${excelPath}`);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(excelPath);

  const conn = await getConnection();
  const idMap = loadIdMap();

  try {
    console.log("\n========================================");
    console.log("  HACCP-ONE 운영 데이터 임포트");
    console.log("========================================");

    await importOpeningStock(conn, wb, idMap);
    await importPurchases(conn, wb, idMap);
    await importProduction(conn, wb, idMap);
    await importSales(conn, wb, idMap);
    await importInspections(conn, wb);

    console.log("\n========================================");
    console.log("  ✅ 운영 데이터 임포트 완료!");
    console.log("========================================");
    console.log("\n▶ 다음 단계: npx tsx scripts/import-excel-documents.ts");
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("❌ 오류:", err);
  process.exit(1);
});

/**
 * 엑셀 기초데이터 임포트 API 라우터
 *
 * 프론트엔드에서 엑셀 파일 업로드 → 서버에서 파싱 → DB 임포트
 * 4단계 파이프라인: 마스터 → BOM → 운영데이터 → 문서생성
 */

import { tenantRequiredProcedure, router } from "../../_core/trpc";
import { z } from "zod";
import mysql from "mysql2/promise";
import ExcelJS from "exceljs";
import { getEffectiveTenantId } from "../../_core/multiTenant";

// ─── DB 연결 ───
async function getDbConnection() {
  return mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "G0ld3n!T1004#Sec",
    database: "haccp_tenant_db",
  });
}

function formatDate(val: any): string {
  if (!val) return "";
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  const s = String(val).trim();
  if (s.includes("년산")) return "";
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
}

export const excelImportRouter = router({
  // ─── 엑셀 미리보기 (파싱만, DB 변경 없음) ───
  preview: tenantRequiredProcedure
    .input(z.object({
      fileBase64: z.string(),
    }))
    .mutation(async ({ input }) => {
      const buffer = Buffer.from(input.fileBase64, "base64");
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer);

      const sheets: Record<string, { rows: number; cols: number; sample: any[] }> = {};
      for (const ws of wb.worksheets) {
        const sample: any[] = [];
        ws.eachRow((row, rowNumber) => {
          if (rowNumber <= 5) {
            const cells: Record<string, any> = {};
            row.eachCell((cell, colNumber) => {
              cells[`col${colNumber}`] = cell.value?.toString()?.substring(0, 50) || "";
            });
            sample.push(cells);
          }
        });
        sheets[ws.name] = { rows: ws.rowCount, cols: ws.columnCount, sample };
      }

      // 데이터 카운트 요약
      const summary = {
        materials: 0,
        products: 0,
        partners: 0,
        purchases: 0,
        production: 0,
        sales: 0,
        inspections: 0,
      };

      const matWs = wb.getWorksheet("🏭 원료 마스터");
      if (matWs) matWs.eachRow((_, r) => { if (r >= 4) summary.materials++; });

      const bomWs = wb.getWorksheet("🔖 배합비 참조");
      if (bomWs) {
        const headerRow = bomWs.getRow(1);
        for (let c = 2; c <= bomWs.columnCount; c++) {
          if (headerRow.getCell(c).value) summary.products++;
        }
      }

      const partWs = wb.getWorksheet("🏢 거래처 관리");
      if (partWs) partWs.eachRow((_, r) => { if (r >= 4) summary.partners++; });

      const purWs = wb.getWorksheet("📥 원재료 입고");
      if (purWs) purWs.eachRow((row, r) => { if (r >= 6 && row.getCell(1).value) summary.purchases++; });

      const prodWs = wb.getWorksheet("📦 일일 생산 입력");
      if (prodWs) prodWs.eachRow((row, r) => { if (r >= 5 && row.getCell(2).value && row.getCell(3).value) summary.production++; });

      const salesWs = wb.getWorksheet("📤 납품 출고");
      if (salesWs) salesWs.eachRow((row, r) => { if (r >= 4 && row.getCell(1).value) summary.sales++; });

      const inspWs = wb.getWorksheet("📋 육안검사일지");
      if (inspWs) inspWs.eachRow((row, r) => { if (r >= 4 && row.getCell(1).value) summary.inspections++; });

      return { sheets, summary };
    }),

  // ─── 전체 임포트 실행 ───
  importAll: tenantRequiredProcedure
    .input(z.object({
      fileBase64: z.string(),
      options: z.object({
        skipExisting: z.boolean().default(true),
        generateDocuments: z.boolean().default(true),
      }).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = getEffectiveTenantId(ctx);
      const buffer = Buffer.from(input.fileBase64, "base64");
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer);
      const conn = await getDbConnection();

      const results = {
        step1: { partners: 0, materials: 0, products: 0 },
        step2: { mfReports: 0, ingredients: 0 },
        step3: { purchases: 0, batches: 0, batchInputs: 0, sales: 0, inspections: 0, openingStock: 0 },
        step4: { ccpInstances: 0, approvals: 0, dailyReports: 0, weeklyReports: 0, costAnalysis: 0 },
        errors: [] as string[],
      };

      try {
        // ═══ Step 1: 마스터 ═══
        const idMap = await importMasterData(conn, wb, tenantId, results);

        // ═══ Step 2: BOM ═══
        await importBomData(conn, wb, tenantId, idMap, results);

        // ═══ Step 3: 운영 데이터 ═══
        await importOperationsData(conn, wb, tenantId, idMap, results);

        // ═══ Step 4: 문서 생성 ═══
        if (input.options?.generateDocuments !== false) {
          await generateDocuments(conn, tenantId, results);
        }

      } catch (err: any) {
        results.errors.push(err.message);
      } finally {
        await conn.end();
      }

      return results;
    }),

  // ─── 임포트 상태 조회 ───
  status: tenantRequiredProcedure
    .query(async ({ ctx }) => {
      const tenantId = getEffectiveTenantId(ctx);
      const conn = await getDbConnection();

      try {
        const [batches] = (await conn.execute(
          `SELECT COUNT(*) as c FROM h_batches WHERE tenant_id = ? AND notes = '엑셀 임포트'`,
          [tenantId]
        )) as any[];

        const [materials] = (await conn.execute(
          `SELECT COUNT(*) as c FROM h_item_master WHERE tenant_id = ? AND item_type = 'raw_material'`,
          [tenantId]
        )) as any[];

        const [products] = (await conn.execute(
          `SELECT COUNT(*) as c FROM h_item_master WHERE tenant_id = ? AND item_type = 'own_product'`,
          [tenantId]
        )) as any[];

        const [partners] = (await conn.execute(
          `SELECT COUNT(*) as c FROM partners WHERE tenant_id = ?`,
          [tenantId]
        )) as any[];

        return {
          batches: batches[0].c,
          materials: materials[0].c,
          products: products[0].c,
          partners: partners[0].c,
        };
      } finally {
        await conn.end();
      }
    }),
});

// ═══════════════════════════════════════
// 내부 함수들
// ═══════════════════════════════════════

async function importMasterData(
  conn: mysql.Connection, wb: ExcelJS.Workbook, tenantId: number,
  results: any
) {
  const partnerIdMap: Record<string, number> = {};
  const materialIdMap: Record<string, number> = {};
  const productIdMap: Record<string, number> = {};

  // ── 거래처 ──
  const partWs = wb.getWorksheet("🏢 거래처 관리");
  if (partWs) {
    const names = new Set<string>();
    partWs.eachRow((row, r) => {
      if (r < 4) return;
      const name = row.getCell(2).value?.toString()?.trim();
      if (name) names.add(name);
    });

    // 입고 시트에서 공급처도 수집
    const purWs = wb.getWorksheet("📥 원재료 입고");
    if (purWs) {
      purWs.eachRow((row, r) => {
        if (r < 6) return;
        const name = row.getCell(3).value?.toString()?.trim();
        if (name) names.add(name);
      });
    }

    for (const name of names) {
      const [existing] = (await conn.execute(
        `SELECT id FROM partners WHERE tenant_id = ? AND company_name = ?`,
        [tenantId, name]
      )) as any[];

      if (existing.length > 0) {
        partnerIdMap[name] = existing[0].id;
      } else {
        const [res] = (await conn.execute(
          `INSERT INTO partners (tenant_id, partner_type, company_name, is_active) VALUES (?, 'supplier', ?, 1)`,
          [tenantId, name]
        )) as any[];
        partnerIdMap[name] = res.insertId;
        results.step1.partners++;
      }
    }
  }

  // ── 원료 ──
  const matWs = wb.getWorksheet("🏭 원료 마스터");
  if (matWs) {
    let idx = 0;
    matWs.eachRow((row, r) => {
      if (r < 4) return;
      const name = row.getCell(2).value?.toString()?.trim();
      if (name) materialQueue.push({ name, unit: row.getCell(4).value?.toString()?.trim() || "kg", idx: idx++ });
    });

    for (const m of materialQueue) {
      const [existing] = (await conn.execute(
        `SELECT id FROM h_item_master WHERE tenant_id = ? AND item_name = ? AND item_type = 'raw_material'`,
        [tenantId, m.name]
      )) as any[];

      if (existing.length > 0) {
        materialIdMap[m.name] = existing[0].id;
      } else {
        const code = `RM-${String(m.idx + 1).padStart(4, "0")}`;
        const [res] = (await conn.execute(
          `INSERT INTO h_item_master (tenant_id, item_code, item_name, item_type, base_unit, category, is_active) VALUES (?, ?, ?, 'raw_material', ?, '원재료', 1)`,
          [tenantId, code, m.name, m.unit]
        )) as any[];
        materialIdMap[m.name] = res.insertId;
        results.step1.materials++;
      }
    }
  }

  // ── 제품 ──
  const bomWs = wb.getWorksheet("🔖 배합비 참조");
  if (bomWs) {
    const headerRow = bomWs.getRow(1);
    let idx = 0;
    for (let c = 2; c <= bomWs.columnCount; c++) {
      const name = headerRow.getCell(c).value?.toString()?.trim();
      if (!name) continue;

      const [existing] = (await conn.execute(
        `SELECT id FROM h_products_v2 WHERE tenant_id = ? AND product_name = ?`,
        [tenantId, name]
      )) as any[];

      if (existing.length > 0) {
        productIdMap[name] = existing[0].id;
      } else {
        const code = `FP-${String(idx + 1).padStart(4, "0")}`;
        const [itemRes] = (await conn.execute(
          `INSERT INTO h_item_master (tenant_id, item_code, item_name, item_type, base_unit, category, is_active) VALUES (?, ?, ?, 'own_product', 'kg', '완제품', 1)`,
          [tenantId, code, name]
        )) as any[];

        const [prodRes] = (await conn.execute(
          `INSERT INTO h_products_v2 (tenant_id, site_id, product_name, product_code, item_master_id, is_active) VALUES (?, 1, ?, ?, ?, 1)`,
          [tenantId, name, code, itemRes.insertId]
        )) as any[];
        productIdMap[name] = prodRes.insertId;
        results.step1.products++;
      }
      idx++;
    }
  }

  return { partnerIdMap, materialIdMap, productIdMap };
}

const materialQueue: Array<{ name: string; unit: string; idx: number }> = [];

async function importBomData(
  conn: mysql.Connection, wb: ExcelJS.Workbook, tenantId: number,
  idMap: ReturnType<Awaited<typeof importMasterData>>,
  results: any
) {
  const ws = wb.getWorksheet("🔖 배합비 참조");
  if (!ws) return;

  const products: Array<{ col: number; name: string }> = [];
  const headerRow = ws.getRow(1);
  for (let c = 2; c <= ws.columnCount; c++) {
    const name = headerRow.getCell(c).value?.toString()?.trim();
    if (name) products.push({ col: c, name });
  }

  const materials: Array<{ row: number; name: string }> = [];
  ws.eachRow((row, r) => {
    if (r < 2) return;
    const name = row.getCell(1).value?.toString()?.trim();
    if (name) materials.push({ row: r, name });
  });

  for (const product of products) {
    const productId = idMap.productIdMap[product.name];
    if (!productId) continue;

    const ingredients: Array<{ matName: string; matId: number; ratio: number }> = [];
    for (const mat of materials) {
      const val = ws.getRow(mat.row).getCell(product.col).value;
      const ratio = typeof val === "number" ? val : parseFloat(String(val || "0"));
      if (ratio > 0 && idMap.materialIdMap[mat.name]) {
        ingredients.push({ matName: mat.name, matId: idMap.materialIdMap[mat.name], ratio });
      }
    }

    if (ingredients.length === 0) continue;

    const [existingReport] = (await conn.execute(
      `SELECT id FROM h_mf_reports WHERE tenant_id = ? AND product_id = ?`,
      [tenantId, productId]
    )) as any[];

    let mfReportId: number;
    if (existingReport.length > 0) {
      mfReportId = existingReport[0].id;
    } else {
      const [res] = (await conn.execute(
        `INSERT INTO h_mf_reports (product_id, report_no, report_date, status, tenant_id) VALUES (?, ?, CURDATE(), 'ACTIVE', ?)`,
        [productId, `MF-${String(results.step2.mfReports + 1).padStart(4, "0")}`, tenantId]
      )) as any[];
      mfReportId = res.insertId;
      results.step2.mfReports++;
    }

    const [existingVer] = (await conn.execute(
      `SELECT id FROM h_mf_report_versions WHERE mf_report_id = ? AND tenant_id = ?`,
      [mfReportId, tenantId]
    )) as any[];

    let versionId: number;
    if (existingVer.length > 0) {
      versionId = existingVer[0].id;
      await conn.execute(`DELETE FROM h_mf_ingredients WHERE mf_report_version_id = ?`, [versionId]);
    } else {
      const [verRes] = (await conn.execute(
        `INSERT INTO h_mf_report_versions (mf_report_id, version_no, effective_from, change_reason, approval_status, composition_total_rule, yield_basis, batch_target_kg, tenant_id, created_by) VALUES (?, 1, CURDATE(), '엑셀임포트', 'APPROVED', '100%', 'PER_BATCH_KG', 70, ?, ?)`,
        [mfReportId, tenantId, 4]
      )) as any[];
      versionId = verRes.insertId;
    }

    for (let i = 0; i < ingredients.length; i++) {
      const ig = ingredients[i];
      const isDeductible = ig.matName === "정제수" ? 0 : 1;
      await conn.execute(
        `INSERT INTO h_mf_ingredients (mf_report_version_id, line_no, material_id, quantity, unit, is_deductible, material_type) VALUES (?, ?, ?, ?, '%', ?, 'RAW')`,
        [versionId, i + 1, ig.matId, String(ig.ratio), isDeductible]
      );
      results.step2.ingredients++;
    }
  }
}

async function importOperationsData(
  conn: mysql.Connection, wb: ExcelJS.Workbook, tenantId: number,
  idMap: ReturnType<Awaited<typeof importMasterData>>,
  results: any
) {
  // ── 이월재고 ──
  const ledgerWs = wb.getWorksheet("📊 월별 원료수불부");
  if (ledgerWs) {
    ledgerWs.eachRow(async (row, r) => {
      if (r < 5) return;
      const name = row.getCell(2).value?.toString()?.trim();
      const stock = parseFloat(String(row.getCell(3).value || "0"));
      if (!name || stock <= 0) return;
      const materialId = idMap.materialIdMap[name];
      if (!materialId) return;

      const [existing] = (await conn.execute(
        `SELECT id FROM material_ledger_daily WHERE tenant_id = ? AND material_id = ? AND ledger_date = '2025-12-31'`,
        [tenantId, materialId]
      )) as any[];

      if (existing.length === 0) {
        await conn.execute(
          `INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source) VALUES (?, ?, '2025-12-31', 0, 0, ?, ?, '전월이월(엑셀)', 'excel_import')`,
          [tenantId, materialId, stock, stock]
        );
        results.step3.openingStock++;
      }
    });
  }

  // ── 입고 ──
  const purWs = wb.getWorksheet("📥 원재료 입고");
  if (purWs) {
    const seenKeys = new Set<string>();
    purWs.eachRow((row, r) => {
      if (r < 6) return;
      const dateVal = row.getCell(1).value;
      const matName = row.getCell(2).value?.toString()?.trim();
      if (!dateVal || !matName) return;
      const date = formatDate(dateVal);
      if (!date) return;
      const qty = parseFloat(String(row.getCell(5).value || "0"));
      const key = `${date}|${matName}|${qty}`;
      if (seenKeys.has(key)) return;
      seenKeys.add(key);

      purchaseRows.push({
        date, matName,
        supplier: row.getCell(3).value?.toString()?.trim() || "",
        type: row.getCell(4).value?.toString()?.trim() || "자체구매",
        qty, unitPrice: parseFloat(String(row.getCell(6).value || "0")),
        expiry: formatDate(row.getCell(9).value),
        note: row.getCell(10).value?.toString()?.trim() || "",
      });
    });

    for (const p of purchaseRows) {
      const partnerId = idMap.partnerIdMap[p.supplier] || null;
      await conn.execute(
        `INSERT INTO accounting_purchases (tenant_id, transaction_date, partner_id, item_name, quantity, unit, unit_price, total_amount, evidence_type, notes, status, created_by) VALUES (?, ?, ?, ?, ?, 'kg', ?, ?, 'none', ?, 'approved', ?)`,
        [tenantId, p.date, partnerId, p.matName, p.qty, p.unitPrice, Math.round(p.qty * p.unitPrice), `${p.type} ${p.note}`, 4]
      );
      results.step3.purchases++;
    }
  }

  // ── 배합비 매트릭스 로드 ──
  const bomMatrix: Record<string, Record<string, number>> = {};
  const bomWs = wb.getWorksheet("🔖 배합비 참조");
  if (bomWs) {
    const prods: Array<{ col: number; name: string }> = [];
    const hRow = bomWs.getRow(1);
    for (let c = 2; c <= bomWs.columnCount; c++) {
      const n = hRow.getCell(c).value?.toString()?.trim();
      if (n) prods.push({ col: c, name: n });
    }
    bomWs.eachRow((row, r) => {
      if (r < 2) return;
      const matName = row.getCell(1).value?.toString()?.trim();
      if (!matName) return;
      for (const prod of prods) {
        const val = row.getCell(prod.col).value;
        const ratio = typeof val === "number" ? val : parseFloat(String(val || "0"));
        if (ratio > 0) {
          if (!bomMatrix[prod.name]) bomMatrix[prod.name] = {};
          bomMatrix[prod.name][matName] = ratio;
        }
      }
    });
  }

  // ── 생산 → 배치 ──
  const prodWs = wb.getWorksheet("📦 일일 생산 입력");
  if (prodWs) {
    const dayCounter: Record<string, number> = {};

    prodWs.eachRow((row, r) => {
      if (r < 5) return;
      const dateVal = row.getCell(2).value;
      const productName = row.getCell(3).value?.toString()?.trim();
      const qty = parseFloat(String(row.getCell(4).value || "0"));
      if (!dateVal || !productName || qty <= 0) return;
      const date = formatDate(dateVal);
      if (!date) return;

      batchRows.push({ date, productName, qty });
    });

    for (const b of batchRows) {
      const productId = idMap.productIdMap[b.productName];
      if (!productId) continue;

      const dateKey = b.date.replace(/-/g, "");
      if (!dayCounter[dateKey]) dayCounter[dateKey] = 0;
      dayCounter[dateKey]++;
      const batchCode = `BATCH-${dateKey}-${String(dayCounter[dateKey]).padStart(3, "0")}`;

      const [batchRes] = (await conn.execute(
        `INSERT INTO h_batches (tenant_id, site_id, batch_code, day_batch_group, batch_order, product_id, planned_quantity, actual_quantity, planned_date, status, mode, lot_number, notes, created_by) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, 'completed', 'auto', ?, '엑셀 임포트', ?)`,
        [tenantId, batchCode, `DAY-${dateKey}`, dayCounter[dateKey], productId, b.qty, b.qty, b.date, dateKey, 4]
      )) as any[];

      const batchId = batchRes.insertId;
      results.step3.batches++;

      // 원료 투입
      const bom = bomMatrix[b.productName];
      if (bom) {
        for (const [matName, ratio] of Object.entries(bom)) {
          if (matName === "정제수") continue;
          const materialId = idMap.materialIdMap[matName];
          if (!materialId) continue;
          const usedQty = Math.round((b.qty * ratio / 100) * 1000) / 1000;
          if (usedQty <= 0) continue;

          await conn.execute(
            `INSERT INTO h_batch_inputs (tenant_id, batch_id, material_id, planned_quantity, actual_quantity, unit, inventory_deducted) VALUES (?, ?, ?, ?, ?, 'kg', 1)`,
            [tenantId, batchId, materialId, usedQty, usedQty]
          );
          results.step3.batchInputs++;
        }
      }
    }
  }

  // ── 납품 ──
  const salesWs = wb.getWorksheet("📤 납품 출고");
  if (salesWs) {
    salesWs.eachRow(async (row, r) => {
      if (r < 4) return;
      const dateVal = row.getCell(1).value;
      const partnerName = row.getCell(2).value?.toString()?.trim();
      const productName = row.getCell(4).value?.toString()?.trim();
      if (!dateVal || !partnerName || !productName) return;
      const date = formatDate(dateVal);
      if (!date) return;

      const totalWeightKg = parseFloat(String(row.getCell(7).value || "0"));
      const partnerId = idMap.partnerIdMap[partnerName] || null;

      await conn.execute(
        `INSERT INTO accounting_sales (tenant_id, transaction_date, partner_id, item_name, quantity, unit, unit_price, total_amount, evidence_type, status, created_by) VALUES (?, ?, ?, ?, ?, 'kg', 0, 0, 'none', 'approved', ?)`,
        [tenantId, date, partnerId, productName, totalWeightKg, 4]
      );
      results.step3.sales++;
    });
  }

  // ── 육안검사 ──
  const inspWs = wb.getWorksheet("📋 육안검사일지");
  if (inspWs) {
    const inspByDate: Record<string, any[]> = {};
    inspWs.eachRow((row, r) => {
      if (r < 4) return;
      const dateVal = row.getCell(1).value;
      if (!dateVal) return;
      const date = formatDate(dateVal);
      if (!date) return;

      if (!inspByDate[date]) inspByDate[date] = [];
      inspByDate[date].push({
        itemName: row.getCell(2).value?.toString()?.trim() || "",
        origin: row.getCell(3).value?.toString()?.trim() || "",
        passStatus: row.getCell(12).value?.toString()?.trim() || "",
      });
    });

    for (const [date, items] of Object.entries(inspByDate)) {
      await conn.execute(
        `INSERT INTO h_generic_checklist_records (site_id, tenant_id, form_type, form_date, title, form_data, status, created_by) VALUES (1, ?, 'visual_inspection', ?, ?, ?, 'approved', ?)`,
        [tenantId, date, `육안검사일지 ${date}`, JSON.stringify({ inspectionDate: date, items }), 4]
      );
      results.step3.inspections++;
    }
  }
}

const purchaseRows: any[] = [];
const batchRows: any[] = [];

async function generateDocuments(conn: mysql.Connection, tenantId: number, results: any) {
  // ── 승인 요청 ──
  const [batches] = (await conn.execute(
    `SELECT b.id, b.batch_code FROM h_batches b LEFT JOIN h_approval_requests ar ON ar.reference_id = b.id AND ar.reference_type = 'batch' AND ar.tenant_id = b.tenant_id WHERE b.tenant_id = ? AND b.notes = '엑셀 임포트' AND ar.id IS NULL`,
    [tenantId]
  )) as any[];

  for (const batch of batches) {
    await conn.execute(
      `INSERT INTO h_approval_requests (tenant_id, site_id, request_type, reference_type, reference_id, title, status, priority, requested_by) VALUES (?, 1, 'batch_production', 'batch', ?, ?, 'approved', 'normal', ?)`,
      [tenantId, batch.id, `[엑셀] ${batch.batch_code}`, 4]
    );
    results.step4.approvals++;
  }

  // ── 생산일보 ──
  const [dailyData] = (await conn.execute(
    `SELECT DATE(planned_date) as work_date, COUNT(*) as cnt, SUM(actual_quantity) as total_qty FROM h_batches WHERE tenant_id = ? AND notes = '엑셀 임포트' GROUP BY DATE(planned_date)`,
    [tenantId]
  )) as any[];

  for (const day of dailyData) {
    const dateStr = day.work_date instanceof Date ? day.work_date.toISOString().slice(0, 10) : String(day.work_date);
    const [existing] = (await conn.execute(
      `SELECT id FROM h_generic_checklist_records WHERE tenant_id = ? AND form_type = 'daily_log' AND form_date = ?`,
      [tenantId, dateStr]
    )) as any[];

    if (existing.length === 0) {
      await conn.execute(
        `INSERT INTO h_generic_checklist_records (site_id, tenant_id, form_type, form_date, title, form_data, status, created_by) VALUES (1, ?, 'daily_log', ?, ?, ?, 'approved', ?)`,
        [tenantId, dateStr, `생산일보 ${dateStr}`, JSON.stringify({ workDate: dateStr, batchCount: day.cnt, totalProductionKg: parseFloat(day.total_qty || 0) }), 4]
      );
      results.step4.dailyReports++;
    }
  }

  // ── 원가 ──
  const [costBatches] = (await conn.execute(
    `SELECT id, actual_quantity FROM h_batches WHERE tenant_id = ? AND notes = '엑셀 임포트' AND material_cost IS NULL`,
    [tenantId]
  )) as any[];

  for (const batch of costBatches) {
    const [inputs] = (await conn.execute(
      `SELECT bi.actual_quantity, COALESCE((SELECT AVG(il.unit_price) FROM h_inventory_lots il WHERE il.material_id = bi.material_id AND il.tenant_id = ? AND il.unit_price > 0), 0) as avg_price FROM h_batch_inputs bi WHERE bi.batch_id = ? AND bi.tenant_id = ?`,
      [tenantId, batch.id, tenantId]
    )) as any[];

    let cost = 0;
    for (const inp of inputs) cost += parseFloat(inp.actual_quantity || 0) * parseFloat(inp.avg_price || 0);

    const actualQty = parseFloat(batch.actual_quantity || 1);
    await conn.execute(
      `UPDATE h_batches SET material_cost = ?, total_cost = ?, unit_cost = ? WHERE id = ?`,
      [Math.round(cost), Math.round(cost), actualQty > 0 ? Math.round(cost / actualQty) : 0, batch.id]
    );
    results.step4.costAnalysis++;
  }
}

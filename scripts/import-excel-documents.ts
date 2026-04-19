/**
 * 엑셀 기초데이터 임포트 - Step 4: 문서 생성 + 자동로직 트리거
 *
 * 배치 데이터 기반으로:
 * 1. CCP 인스턴스 + CCP 기록지 자동 생성
 * 2. 승인 요청 자동 생성
 * 3. 생산일보(일일일지) 자동 생성
 * 4. 주간 원재료 사용 리포트 생성
 * 5. 원가 분석 데이터 생성
 *
 * 실행: npx tsx scripts/import-excel-documents.ts
 */

import mysql from "mysql2/promise";
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

function loadIdMap() {
  const mapPath = path.resolve(__dirname, "../.import-id-map.json");
  return JSON.parse(fs.readFileSync(mapPath, "utf8")) as {
    partnerIdMap: Record<string, number>;
    materialIdMap: Record<string, number>;
    productIdMap: Record<string, number>;
  };
}

// ─── 1. CCP 인스턴스 + 기록지 생성 ───
async function generateCcpRecords(conn: mysql.Connection) {
  console.log("\n=== 1. CCP 인스턴스 + 기록지 생성 ===");

  // CCP 생성이 안 된 배치 조회
  const [batches] = (await conn.execute(
    `SELECT b.id, b.batch_code, b.product_id, b.planned_quantity, b.planned_date, b.lot_number
     FROM h_batches b
     LEFT JOIN h_ccp_instances ci ON ci.batch_id = b.id AND ci.tenant_id = b.tenant_id
     WHERE b.tenant_id = ? AND b.notes = '엑셀 임포트' AND ci.id IS NULL
     ORDER BY b.planned_date, b.id`,
    [TENANT_ID]
  )) as any[];

  console.log(`  CCP 미생성 배치: ${batches.length}건`);

  // 공정 그룹 조회 (CCP 유형)
  const [processGroups] = (await conn.execute(
    `SELECT pg.id, pg.group_name, pg.ccp_type, pg.temperature_min, pg.temperature_max,
            pg.pressure_min, pg.pressure_max, pg.time_min, pg.time_max,
            pg.equip_group_mode, pg.measurement_interval
     FROM h_process_groups pg
     WHERE pg.tenant_id = ? AND pg.is_active = 1
     ORDER BY pg.id`,
    [TENANT_ID]
  )) as any[];

  let ccpInstanceCount = 0;
  let ccpFormCount = 0;

  for (const batch of batches) {
    // 제품의 MF Report에서 공정그룹 참조
    const [mfIngredients] = (await conn.execute(
      `SELECT DISTINCT mi.process_group_id
       FROM h_mf_ingredients mi
       JOIN h_mf_report_versions rv ON mi.mf_report_version_id = rv.id
       JOIN h_mf_reports mr ON rv.mf_report_id = mr.id
       WHERE mr.product_id = ? AND mr.tenant_id = ? AND mi.process_group_id IS NOT NULL`,
      [batch.product_id, TENANT_ID]
    )) as any[];

    // 공정그룹이 없으면 기본 CCP 생성 (증자/냉각)
    const pgIds = mfIngredients.length > 0
      ? mfIngredients.map((r: any) => r.process_group_id)
      : processGroups.slice(0, 2).map((pg: any) => pg.id); // 기본 2개

    if (pgIds.length === 0 && processGroups.length > 0) {
      pgIds.push(processGroups[0].id);
    }

    for (const pgId of pgIds) {
      const pg = processGroups.find((p: any) => p.id === pgId);
      if (!pg) continue;

      // CCP 인스턴스 생성
      const [instanceResult] = (await conn.execute(
        `INSERT INTO h_ccp_instances
         (tenant_id, site_id, batch_id, process_group_id, ccp_type, status)
         VALUES (?, ?, ?, ?, ?, 'completed')`,
        [TENANT_ID, SITE_ID, batch.id, pgId, pg.ccp_type || 'CCP-1B']
      )) as any[];
      ccpInstanceCount++;

      // CCP 기록지 생성
      const batchTargetKg = 70; // 기본
      const batchCountCalc = Math.ceil(parseFloat(batch.planned_quantity) / batchTargetKg);

      const formData = {
        batchId: batch.id,
        batchCode: batch.batch_code,
        processGroupId: pgId,
        processGroupName: pg.group_name,
        ccpType: pg.ccp_type || 'CCP-1B',
        temperatureRange: pg.temperature_min && pg.temperature_max
          ? `${pg.temperature_min}~${pg.temperature_max}℃` : null,
        batchTargetKg,
        batchCount: batchCountCalc,
        lotNumber: batch.lot_number,
        status: 'completed',
        measurements: [],
      };

      await conn.execute(
        `INSERT INTO h_ccp_form_records
         (tenant_id, site_id, batch_id, process_group_id, bom_batch_kg, batch_count,
          equip_group_mode, measurement_interval, form_data, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed')`,
        [TENANT_ID, SITE_ID, batch.id, pgId, batchTargetKg, batchCountCalc,
         pg.equip_group_mode || 'single', pg.measurement_interval || 30,
         JSON.stringify(formData)]
      );
      ccpFormCount++;
    }
  }

  console.log(`  CCP 인스턴스: ${ccpInstanceCount}건`);
  console.log(`  CCP 기록지: ${ccpFormCount}건`);
}

// ─── 2. 승인 요청 자동 생성 ───
async function generateApprovalRequests(conn: mysql.Connection) {
  console.log("\n=== 2. 승인 요청 생성 ===");

  // 승인요청 없는 배치 조회
  const [batches] = (await conn.execute(
    `SELECT b.id, b.batch_code, b.planned_date, b.mode
     FROM h_batches b
     LEFT JOIN h_approval_requests ar ON ar.reference_id = b.id
       AND ar.reference_type = 'batch' AND ar.tenant_id = b.tenant_id
     WHERE b.tenant_id = ? AND b.notes = '엑셀 임포트' AND ar.id IS NULL`,
    [TENANT_ID]
  )) as any[];

  for (const batch of batches) {
    await conn.execute(
      `INSERT INTO h_approval_requests
       (tenant_id, site_id, request_type, reference_type, reference_id,
        title, status, priority, requested_by)
       VALUES (?, ?, 'batch_production', 'batch', ?,
               ?, 'approved', 'normal', ?)`,
      [TENANT_ID, SITE_ID, batch.id,
       `[엑셀] 배치 CCP 승인 - ${batch.batch_code}`, CREATED_BY]
    );
  }

  console.log(`  승인 요청: ${batches.length}건`);
}

// ─── 3. 생산일보(일일일지) 생성 ───
async function generateDailyReports(conn: mysql.Connection) {
  console.log("\n=== 3. 생산일보 생성 ===");

  // 날짜별 배치 집계
  const [dailyData] = (await conn.execute(
    `SELECT DATE(b.planned_date) as work_date,
            COUNT(*) as batch_count,
            GROUP_CONCAT(b.batch_code) as batch_codes,
            SUM(b.actual_quantity) as total_qty
     FROM h_batches b
     WHERE b.tenant_id = ? AND b.notes = '엑셀 임포트'
     GROUP BY DATE(b.planned_date)
     ORDER BY work_date`,
    [TENANT_ID]
  )) as any[];

  let created = 0;

  for (const day of dailyData) {
    const dateStr = day.work_date instanceof Date
      ? day.work_date.toISOString().slice(0, 10)
      : String(day.work_date);

    // 이미 생산일보가 있는지 확인
    const [existing] = (await conn.execute(
      `SELECT id FROM h_generic_checklist_records
       WHERE tenant_id = ? AND form_type = 'daily_log' AND form_date = ?`,
      [TENANT_ID, dateStr]
    )) as any[];

    if (existing.length > 0) continue;

    // CCP 요약 조회
    const [ccpSummary] = (await conn.execute(
      `SELECT COUNT(*) as total_ccp,
              SUM(CASE WHEN cfr.status = 'completed' THEN 1 ELSE 0 END) as completed_ccp
       FROM h_ccp_form_records cfr
       JOIN h_batches b ON cfr.batch_id = b.id
       WHERE b.tenant_id = ? AND DATE(b.planned_date) = ?`,
      [TENANT_ID, dateStr]
    )) as any[];

    const formData = {
      workDate: dateStr,
      batchCount: day.batch_count,
      totalProductionKg: parseFloat(day.total_qty || 0),
      batches: (day.batch_codes || "").split(",").map((code: string) => ({
        batchCode: code.trim(),
      })),
      ccpSummary: {
        total: ccpSummary[0]?.total_ccp || 0,
        completed: ccpSummary[0]?.completed_ccp || 0,
        deviations: 0,
      },
      notes: "엑셀 데이터 기반 자동 생성",
    };

    await conn.execute(
      `INSERT INTO h_generic_checklist_records
       (site_id, tenant_id, form_type, form_date, title, form_data, status, created_by)
       VALUES (?, ?, 'daily_log', ?, ?, ?, 'approved', ?)`,
      [SITE_ID, TENANT_ID, dateStr,
       `생산일보 ${dateStr}`,
       JSON.stringify(formData), CREATED_BY]
    );
    created++;
  }

  console.log(`  생산일보: ${created}건`);
}

// ─── 4. 주간 원재료 사용 리포트 생성 ───
async function generateWeeklyMaterialReports(conn: mysql.Connection) {
  console.log("\n=== 4. 주간 원재료 사용 리포트 생성 ===");

  // 주별 원재료 사용량 집계
  const [weeklyData] = (await conn.execute(
    `SELECT
       YEARWEEK(ledger_date, 1) as yw,
       MIN(ledger_date) as week_start,
       MAX(ledger_date) as week_end,
       material_id,
       SUM(usage_qty) as total_usage
     FROM material_ledger_daily
     WHERE tenant_id = ? AND usage_qty > 0 AND source = 'excel_batch'
     GROUP BY YEARWEEK(ledger_date, 1), material_id
     ORDER BY yw, total_usage DESC`,
    [TENANT_ID]
  )) as any[];

  // 주별 그룹핑
  const weekGroups: Record<string, Array<{ materialId: number; totalUsage: number; weekStart: string; weekEnd: string }>> = {};
  for (const row of weeklyData) {
    const key = String(row.yw);
    if (!weekGroups[key]) weekGroups[key] = [];
    weekGroups[key].push({
      materialId: row.material_id,
      totalUsage: parseFloat(row.total_usage),
      weekStart: String(row.week_start),
      weekEnd: String(row.week_end),
    });
  }

  // 원료명 조회
  const [materialNames] = (await conn.execute(
    `SELECT id, item_name FROM h_item_master WHERE tenant_id = ?`,
    [TENANT_ID]
  )) as any[];
  const matNameMap: Record<number, string> = {};
  for (const m of materialNames) matNameMap[m.id] = m.item_name;

  let created = 0;

  for (const [yw, items] of Object.entries(weekGroups)) {
    const weekStart = items[0].weekStart;
    const weekEnd = items[0].weekEnd;

    const formData = {
      yearWeek: yw,
      periodStart: weekStart,
      periodEnd: weekEnd,
      materialCount: items.length,
      totalUsageKg: items.reduce((s, i) => s + i.totalUsage, 0),
      materials: items
        .sort((a, b) => b.totalUsage - a.totalUsage)
        .map((item, idx) => ({
          rank: idx + 1,
          materialName: matNameMap[item.materialId] || `ID:${item.materialId}`,
          usageKg: item.totalUsage,
        })),
    };

    await conn.execute(
      `INSERT INTO h_generic_checklist_records
       (site_id, tenant_id, form_type, form_date, title, form_data, status, created_by)
       VALUES (?, ?, 'weekly_material_usage', ?, ?, ?, 'approved', ?)`,
      [SITE_ID, TENANT_ID, weekStart,
       `주간 원재료 사용 ${weekStart}~${weekEnd}`,
       JSON.stringify(formData), CREATED_BY]
    );
    created++;
  }

  console.log(`  주간 리포트: ${created}건`);
}

// ─── 5. 원가 분석 데이터 생성 ───
async function generateCostAnalysis(conn: mysql.Connection) {
  console.log("\n=== 5. 배치 원가 분석 ===");

  // 배치별 원가 계산 (batch_inputs 기반)
  const [batches] = (await conn.execute(
    `SELECT b.id, b.batch_code, b.actual_quantity
     FROM h_batches b
     WHERE b.tenant_id = ? AND b.notes = '엑셀 임포트' AND b.material_cost IS NULL`,
    [TENANT_ID]
  )) as any[];

  let updated = 0;

  for (const batch of batches) {
    // 이 배치의 원료투입 합계 (가중평균 단가 적용)
    const [inputs] = (await conn.execute(
      `SELECT bi.material_id, bi.actual_quantity,
              COALESCE(
                (SELECT AVG(il.unit_price) FROM h_inventory_lots il
                 WHERE il.material_id = bi.material_id AND il.tenant_id = ? AND il.unit_price > 0),
                0
              ) as avg_price
       FROM h_batch_inputs bi
       WHERE bi.batch_id = ? AND bi.tenant_id = ?`,
      [TENANT_ID, batch.id, TENANT_ID]
    )) as any[];

    let materialCost = 0;
    for (const inp of inputs) {
      const qty = parseFloat(inp.actual_quantity || 0);
      const price = parseFloat(inp.avg_price || 0);
      materialCost += qty * price;
    }

    const actualQty = parseFloat(batch.actual_quantity || 1);
    const unitCost = actualQty > 0 ? Math.round(materialCost / actualQty) : 0;

    await conn.execute(
      `UPDATE h_batches SET material_cost = ?, total_cost = ?, unit_cost = ?
       WHERE id = ?`,
      [Math.round(materialCost), Math.round(materialCost), unitCost, batch.id]
    );
    updated++;
  }

  console.log(`  원가 계산: ${updated}건`);
}

// ─── 메인 ───
async function main() {
  const conn = await getConnection();

  try {
    console.log("\n========================================");
    console.log("  HACCP-ONE 문서 생성 + 자동로직");
    console.log("========================================");

    await generateCcpRecords(conn);
    await generateApprovalRequests(conn);
    await generateDailyReports(conn);
    await generateWeeklyMaterialReports(conn);
    await generateCostAnalysis(conn);

    console.log("\n========================================");
    console.log("  ✅ 문서 생성 + 자동로직 완료!");
    console.log("========================================");
    console.log("\n📋 생성된 문서:");
    console.log("  - CCP 기록지 (배치별)");
    console.log("  - 승인 요청 (배치별)");
    console.log("  - 생산일보 (날짜별)");
    console.log("  - 주간 원재료 사용 리포트 (주별)");
    console.log("  - 배치 원가 분석");
    console.log("\n💡 전체 파이프라인 실행 순서:");
    console.log("  1. npx tsx scripts/import-excel-master.ts");
    console.log("  2. npx tsx scripts/import-excel-bom.ts");
    console.log("  3. npx tsx scripts/import-excel-operations.ts");
    console.log("  4. npx tsx scripts/import-excel-documents.ts");
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("❌ 오류:", err);
  process.exit(1);
});

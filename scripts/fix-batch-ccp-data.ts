/**
 * 기존 임포트 배치 데이터 보정 스크립트
 *
 * 1. created_at → planned_date로 수정 (현재 날짜로 잘못 들어간 것)
 * 2. start_time 설정 (planned_date 09:00)
 * 3. CCP 인스턴스가 없는 배치에 CCP 자동 생성
 *
 * 실행: npx tsx scripts/fix-batch-ccp-data.ts
 */

import mysql from "mysql2/promise";

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

async function main() {
  const conn = await getConnection();

  try {
    console.log("\n========================================");
    console.log("  기존 배치 데이터 보정");
    console.log("========================================");

    // ── 1. created_at 보정
    console.log("\n=== 1. created_at 보정 ===");
    const [fixCreated] = (await conn.execute(
      `UPDATE h_batches
       SET created_at = planned_date,
           updated_at = planned_date
       WHERE tenant_id = ? AND mode = 'auto'
         AND DATE(created_at) != DATE(planned_date)`,
      [TENANT_ID]
    )) as any[];
    console.log(`  created_at 보정: ${fixCreated.affectedRows ?? 0}건`);

    // ── 2. start_time 보정
    console.log("\n=== 2. start_time 보정 ===");
    const [fixStart] = (await conn.execute(
      `UPDATE h_batches
       SET start_time = CONCAT(planned_date, ' 09:00:00')
       WHERE tenant_id = ? AND mode = 'auto'
         AND start_time IS NULL`,
      [TENANT_ID]
    )) as any[];
    console.log(`  start_time 보정: ${fixStart.affectedRows ?? 0}건`);

    // ── 3. CCP 인스턴스 보정
    console.log("\n=== 3. CCP 인스턴스 보정 ===");
    const [batchesWithoutCcp] = (await conn.execute(
      `SELECT b.id, b.product_id, p.product_name, b.planned_date, b.planned_quantity
       FROM h_batches b
       LEFT JOIN h_products_v2 p ON p.id = b.product_id
       LEFT JOIN h_ccp_instances c ON c.batch_id = b.id AND c.tenant_id = b.tenant_id
       WHERE b.tenant_id = ? AND b.mode = 'auto'
         AND c.id IS NULL
       ORDER BY b.planned_date, b.id`,
      [TENANT_ID]
    )) as any[];

    console.log(`  CCP 없는 배치: ${(batchesWithoutCcp as any[]).length}건`);

    let ccpFixed = 0;
    let ccpInstanceTotal = 0;

    for (const batch of (batchesWithoutCcp as any[])) {
      if (!batch.product_id) {
        console.log(`  ⚠️ 배치 #${batch.id}: product_id 없음, 건너뜀`);
        continue;
      }

      const date = batch.planned_date instanceof Date
        ? batch.planned_date.toISOString().slice(0, 10)
        : String(batch.planned_date).slice(0, 10);
      const qty = batch.planned_quantity ? Number(batch.planned_quantity) : 0;
      const productName = batch.product_name || `제품#${batch.product_id}`;

      const count = await generateCcpForBatch(
        conn, batch.id, batch.product_id, productName, date, qty
      );

      if (count > 0) {
        ccpFixed++;
        ccpInstanceTotal += count;
        console.log(`  ✓ 배치 #${batch.id} (${productName}, ${date}): CCP ${count}건 생성`);
      }
    }

    // ── 4. h_ccp_instances의 created_at도 보정
    console.log("\n=== 4. CCP 인스턴스 created_at 보정 ===");
    const [fixCcpCreated] = (await conn.execute(
      `UPDATE h_ccp_instances ci
       JOIN h_batches b ON b.id = ci.batch_id AND b.tenant_id = ci.tenant_id
       SET ci.created_at = b.planned_date
       WHERE ci.tenant_id = ?
         AND DATE(ci.created_at) != DATE(b.planned_date)`,
      [TENANT_ID]
    )) as any[];
    console.log(`  CCP created_at 보정: ${fixCcpCreated.affectedRows ?? 0}건`);

    console.log("\n========================================");
    console.log(`  ✅ 보정 완료!`);
    console.log(`  - created_at 보정: ${fixCreated.affectedRows ?? 0}건`);
    console.log(`  - start_time 보정: ${fixStart.affectedRows ?? 0}건`);
    console.log(`  - CCP 생성: ${ccpFixed}건 배치 → ${ccpInstanceTotal}건 인스턴스`);
    console.log("========================================");

  } finally {
    await conn.end();
  }
}

/**
 * 배치에 대한 CCP 인스턴스 + rows + 모니터링 기록지 생성
 * Returns: 생성된 CCP 인스턴스 수
 */
async function generateCcpForBatch(
  conn: mysql.Connection,
  batchId: number,
  productId: number,
  productName: string,
  workDate: string,
  plannedQtyKg: number,
): Promise<number> {
  // ── 1. BOM 기반 공정그룹
  const [bomGroups] = (await conn.execute(
    `SELECT DISTINCT
       g.id, g.name, g.ccp_type,
       g.temperature_min, g.temperature_max,
       g.time_min, g.time_max,
       g.pressure_min, g.pressure_max
     FROM h_mf_reports r
     JOIN h_mf_report_versions v ON v.mf_report_id = r.id AND v.approval_status = 'APPROVED'
     JOIN h_mf_ingredients i ON i.mf_report_version_id = v.id AND i.process_group_id IS NOT NULL
     JOIN ccp_process_groups g ON g.id = i.process_group_id AND g.tenant_id = ? AND g.status = 'active' AND g.ccp_type != 'CCP-4P'
     WHERE r.product_id = ? AND r.tenant_id = ?
     GROUP BY g.id`,
    [TENANT_ID, productId, TENANT_ID]
  )) as any[];

  // ── 2. 수동 매핑
  const bomIds = new Set((bomGroups as any[]).map((r: any) => Number(r.id)));
  const [manualGroups] = (await conn.execute(
    `SELECT g.id, g.name, g.ccp_type,
       g.temperature_min, g.temperature_max, g.time_min, g.time_max,
       g.pressure_min, g.pressure_max
     FROM ccp_process_group_products gp
     JOIN ccp_process_groups g ON g.id = gp.process_group_id AND g.tenant_id = ? AND g.status = 'active' AND g.ccp_type != 'CCP-4P'
     WHERE gp.product_id = ? AND gp.tenant_id = ?`,
    [TENANT_ID, productId, TENANT_ID]
  )) as any[];

  // ── 3. CCP-4P 항상 포함
  const [metalGroups] = (await conn.execute(
    `SELECT g.id, g.name, g.ccp_type,
       g.temperature_min, g.temperature_max, g.time_min, g.time_max,
       g.pressure_min, g.pressure_max
     FROM ccp_process_groups g
     WHERE g.tenant_id = ? AND g.ccp_type = 'CCP-4P' AND g.status = 'active'`,
    [TENANT_ID]
  )) as any[];

  // dedup
  const allGroups: any[] = [...(bomGroups as any[])];
  for (const g of (manualGroups as any[])) {
    if (!bomIds.has(Number(g.id))) {
      allGroups.push(g);
      bomIds.add(Number(g.id));
    }
  }
  for (const g of (metalGroups as any[])) {
    if (!bomIds.has(Number(g.id))) {
      allGroups.push(g);
    }
  }

  if (allGroups.length === 0) return 0;

  let count = 0;

  for (const group of allGroups) {
    const groupId = Number(group.id);
    const ccpType = group.ccp_type;
    const heatingMin = group.time_min != null ? Number(group.time_min) : 10;
    const tempMin = group.temperature_min != null ? Number(group.temperature_min) : null;
    const pressureMinMpa = group.pressure_min != null ? Number(group.pressure_min) : null;

    // CCP 인스턴스 생성
    const [insResult] = (await conn.execute(
      `INSERT INTO h_ccp_instances
         (site_id, work_date, ccp_type, process_group_id,
          product_name, product_id, batch_id,
          status, created_by, tenant_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
      [SITE_ID, workDate, ccpType, groupId,
       productName, productId, batchId,
       CREATED_BY, TENANT_ID, workDate]
    )) as any[];
    const instanceId = insResult.insertId;

    // CCP rows 생성
    if (ccpType === "CCP-4P") {
      await conn.execute(
        `INSERT INTO h_ccp_rows (instance_id, sort_order, row_type, result, note, auto_generated, tenant_id, created_at)
         VALUES (?, 1, 'measurement', 'PASS', 'Fe (철) 기준 시편 검출 테스트', 1, ?, ?),
                (?, 2, 'measurement', 'PASS', 'SUS (스테인리스) 기준 시편 검출 테스트', 1, ?, ?)`,
        [instanceId, TENANT_ID, workDate, instanceId, TENANT_ID, workDate]
      );
    } else {
      const [equipRows] = (await conn.execute(
        `SELECT ge.equipment_id, ge.sort_order, eq.name AS equipment_name,
           eq.default_temperature, eq.default_pressure, eq.batch_operation_time, eq.default_time
         FROM ccp_process_group_equipments ge
         JOIN equipments eq ON eq.id = ge.equipment_id AND eq.tenant_id = ge.tenant_id AND eq.status = 'active'
         WHERE ge.process_group_id = ? AND ge.tenant_id = ?
         ORDER BY ge.sort_order, ge.equipment_id`,
        [groupId, TENANT_ID]
      )) as any[];

      if ((equipRows as any[]).length === 0) {
        const tempC = tempMin?.toString() ?? null;
        const pressureBar = pressureMinMpa != null ? (pressureMinMpa * 10).toFixed(2) : null;
        for (let i = 1; i <= 3; i++) {
          await conn.execute(
            `INSERT INTO h_ccp_rows
               (instance_id, sort_order, row_type, temp_c, duration_min, heating_min, pressure_bar,
                result, auto_generated, tenant_id, created_at)
             VALUES (?, ?, 'measurement', ?, ?, ?, ?, 'PASS', 1, ?, ?)`,
            [instanceId, i, tempC, heatingMin, heatingMin, pressureBar, TENANT_ID, workDate]
          );
        }
      } else {
        for (let idx = 0; idx < (equipRows as any[]).length; idx++) {
          const eq = (equipRows as any[])[idx];
          const eqTemp = eq.default_temperature != null ? Number(eq.default_temperature) : tempMin;
          const eqPressureMpa = eq.default_pressure != null ? Number(eq.default_pressure) : pressureMinMpa;
          const pressureBar = eqPressureMpa != null ? (eqPressureMpa * 10).toFixed(2) : null;
          const eqDefaultTime = eq.default_time != null ? Number(eq.default_time) : heatingMin;
          const cycleTotalMin = eq.batch_operation_time != null ? Number(eq.batch_operation_time) : null;
          const durationMin = cycleTotalMin != null
            ? cycleTotalMin + (heatingMin - eqDefaultTime)
            : heatingMin;

          await conn.execute(
            `INSERT INTO h_ccp_rows
               (instance_id, equipment_id, equipment_name, sort_order,
                row_type, temp_c, duration_min, heating_min, cycle_total_min,
                pressure_bar, result, auto_generated, tenant_id, created_at)
             VALUES (?, ?, ?, ?, 'measurement', ?, ?, ?, ?, ?, 'PASS', 1, ?, ?)`,
            [instanceId, eq.equipment_id, eq.equipment_name, idx + 1,
             eqTemp?.toString() ?? null, durationMin, heatingMin, cycleTotalMin,
             pressureBar, TENANT_ID, workDate]
          );
        }
      }
    }

    // CCP 모니터링 기록지 생성
    let bomBatchKg: number | null = null;
    const [bomInfo] = (await conn.execute(
      `SELECT v.batch_size_kg
       FROM h_mf_reports r
       JOIN h_mf_report_versions v ON v.mf_report_id = r.id AND v.approval_status = 'APPROVED'
       WHERE r.product_id = ? AND r.tenant_id = ?
       ORDER BY v.id DESC LIMIT 1`,
      [productId, TENANT_ID]
    )) as any[];
    if ((bomInfo as any[]).length > 0 && (bomInfo as any[])[0].batch_size_kg) {
      bomBatchKg = Number((bomInfo as any[])[0].batch_size_kg);
    }

    const batchCount = bomBatchKg && bomBatchKg > 0 ? Math.ceil(plannedQtyKg / bomBatchKg) : 1;

    const [clInfo] = (await conn.execute(
      `SELECT min_temp_c, max_temp_c, min_duration_min, max_duration_min,
              min_pressure_bar, max_pressure_bar, fe_sensitivity, sus_sensitivity
       FROM product_ccp_specs
       WHERE tenant_id = ? AND product_id = ? AND ccp_type = ? AND is_active = 1
       LIMIT 1`,
      [TENANT_ID, productId, ccpType]
    )) as any[];

    const cl = (clInfo as any[]).length > 0 ? (clInfo as any[])[0] : {};

    await conn.execute(
      `INSERT INTO h_ccp_form_records
         (tenant_id, site_id, batch_id, ccp_type, work_date,
          product_id, product_name, process_group_id, process_group_name,
          bom_batch_kg, planned_qty_kg, batch_count,
          equip_group_mode, equip_interval_min,
          cl_heat_time_min_lo, cl_heat_time_min_hi, cl_heat_temp_lo,
          cl_pressure_mpa_lo, cl_product_temp_lo,
          cl_metal_sensitivity, cl_fe_mm, cl_sus_mm,
          writer_id, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'sequential', 10,
               ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`,
      [TENANT_ID, SITE_ID, batchId, ccpType, workDate,
       productId, productName, groupId, group.name,
       bomBatchKg, plannedQtyKg, batchCount,
       cl.min_duration_min ?? null, cl.max_duration_min ?? null, cl.min_temp_c ?? null,
       cl.min_pressure_bar != null ? (Number(cl.min_pressure_bar) / 10).toFixed(3) : null,
       cl.min_temp_c ?? null,
       cl.fe_sensitivity ?? 130, cl.cl_fe_mm ?? "2.0", cl.cl_sus_mm ?? "3.0",
       CREATED_BY, workDate]
    );

    count++;
  }

  return count;
}

main().catch((err) => {
  console.error("❌ 오류:", err);
  process.exit(1);
});

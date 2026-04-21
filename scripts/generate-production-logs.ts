/**
 * 생산일지 + 일일일지 + CCP 승인 + 인쇄관리 일괄 생성 스크립트
 * 
 * 1. 일일일지 (daily_log) - 각 생산일자별 h_generic_checklist_records 생성
 * 2. CCP 기록지 승인 (작성자→검토→승인)
 * 3. 주간/월간 로그 생성
 * 4. 인쇄관리 그룹 생성
 * 
 * 날짜: created_at, form_date 모두 해당 생산일에 맞춤 (중요!)
 */

import mysql from 'mysql2/promise';

const DB_CONFIG = {
  host: 'localhost',
  user: 'root',
  password: process.env.DB_PASSWORD || '',
  database: 'haccp_tenant_db',
  charset: 'utf8mb4',
};

const TENANT_ID = 2;
const SITE_ID = 2;

// 문서결재설정: author=6(이준석), reviewer=5(이정언), approver=8(한상갑)
const AUTHOR_EMPLOYEE_ID = 6;
const REVIEWER_EMPLOYEE_ID = 5;
const APPROVER_EMPLOYEE_ID = 8;
// users 테이블 매핑
const AUTHOR_USER_ID = 24;  // 이준석
const REVIEWER_USER_ID = 12; // 이정언  
const APPROVER_USER_ID = 4;  // 한상갑

// 위생점검 항목 템플릿 (실제 데이터에서 추출)
const HYGIENE_CHECKS_TEMPLATE = [
  { category: "작업전", itemText: "위생복장과 외출 복장이 구분하여 보관되고 있는가?", itemOrder: 1, subcategory: "개인위생" },
  { category: "작업전", itemText: "종사자의 건강상태가 양호하고 개인 장신구 등을 소지하지 않으며, 청결한 위생복장을 착용하고 작업하고 있는가?", itemOrder: 2, subcategory: "개인위생" },
  { category: "작업전", itemText: "위생설비(손 세척기 등) 중 이상이 있는 것이 없으며, 종사자는 위생처리를 하고 입실하는가?", itemOrder: 3, subcategory: "개인위생" },
  { category: "작업전", itemText: "작업장은 밀폐가 잘 이루어지고 있으며, 방충시설(방충망 파손 등)에는 이상이 없는가?", itemOrder: 4, subcategory: "방충방서" },
  { category: "작업전", itemText: "파손되거나 고장 난 제조설비가 없는가?", itemOrder: 5, subcategory: "설비" },
  { category: "작업전", itemText: "입고 보관냉장/냉동창고의 온도는 적절히 관리되고 있는가? (냉장창고 : 0~10℃, 냉동창고 : -18℃이하)", itemOrder: 6, subcategory: "입고보관" },
  { category: "출하시", itemText: "완제품을 운송하는 중 온도기준을 준수하였는가?(자동온도기록지 별도관리)", itemOrder: 7, subcategory: "운송" },
  { category: "작업중", itemText: "청결구역작업과 일반구역작업이 분리되어 있으며 오염되지 않도록 관리되고 있는가?", itemOrder: 8, subcategory: "공정관리" },
  { category: "작업중", itemText: "가열후 식힘 공정이 적절히 관리되고 있는가?", itemOrder: 9, subcategory: "공정관리" },
  { category: "작업중", itemText: "완제품의 포장 상태는 양호한가?", itemOrder: 10, subcategory: "공정관리" },
  { category: "작업중", itemText: "모니터링장비(탐침온도계 등)는 사용전후 세척·소독을 실시하고 있는가?", itemOrder: 11, subcategory: "공정관리" },
  { category: "작업후", itemText: "작업장 주변의 음식물 폐기물은 잘 정리되어 보관되어지고 있고, 주기적으로 반출되고 있는가?", itemOrder: 12, subcategory: "방충방서" },
  { category: "작업후", itemText: "작업장 바닥, 배수로, 위생시설, 제조설비(식품과 직접 닿는 부분)의 청소·소독 상태는 양호한가?", itemOrder: 13, subcategory: "세척소독" },
];

// 이물관리 점검항목 템플릿
const FOREIGN_MATERIAL_CHECKS_TEMPLATE = [
  { category: "원재료", itemText: "원재료 입고시 이물 혼입 여부를 확인하였는가?", itemOrder: 1 },
  { category: "원재료", itemText: "원재료 보관 용기 및 포장 상태는 양호한가?", itemOrder: 2 },
  { category: "공정", itemText: "제조 공정 중 이물 혼입 방지 조치가 적절한가?", itemOrder: 3 },
  { category: "공정", itemText: "금속검출기 작동 상태는 정상인가?", itemOrder: 4 },
  { category: "공정", itemText: "체, 자석 등 이물 제거 장치가 정상 작동하는가?", itemOrder: 5 },
  { category: "설비", itemText: "설비 파손 부위가 없으며, 볼트 너트 등이 이완되지 않았는가?", itemOrder: 6 },
  { category: "환경", itemText: "작업장 천장, 벽면, 조명 등에서 이물이 떨어질 위험은 없는가?", itemOrder: 7 },
  { category: "환경", itemText: "유리, 깨지기 쉬운 재질의 물건이 작업장 내에 있지 않은가?", itemOrder: 8 },
];

// 온도기록 구역
const TEMP_ROOMS = [
  { name: "원재료실", baseTemp: 3.0, baseHumid: 55 },
  { name: "냉동창고", baseTemp: -20.0, baseHumid: 40 },
  { name: "냉장창고", baseTemp: 4.0, baseHumid: 50 },
  { name: "작업장", baseTemp: 18.0, baseHumid: 55 },
  { name: "완제품창고", baseTemp: -18.0, baseHumid: 45 },
];

// ──── 유틸리티 ────
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function formatTime(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

function addMinuteVariance(baseHour: number, baseMin: number, rand: () => number, maxVariance: number = 5): string {
  const variance = Math.round((rand() - 0.5) * 2 * maxVariance);
  let totalMin = baseHour * 60 + baseMin + variance;
  if (totalMin < 0) totalMin = 0;
  const h = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  return formatTime(h, m);
}

function addTempVariance(baseTemp: number, rand: () => number, maxVariance: number = 0.5): number {
  const variance = (rand() - 0.5) * 2 * maxVariance;
  return Math.round((baseTemp + variance) * 10) / 10;
}

function dateToString(d: Date | string): string {
  if (d instanceof Date) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }
  return String(d);
}

function dateToSqlTimestamp(dateStr: string, hour: number = 9, min: number = 0): string {
  return `${dateStr} ${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:00`;
}

function getISOWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

async function main() {
  const pool = await mysql.createPool(DB_CONFIG);
  
  try {
    console.log('=== 생산일지/일일일지/CCP 승인 일괄 생성 시작 ===\n');

    // ────────────────────────────────────────
    // Step 0: 기존 일일일지 (daily_log) 삭제 (재생성)
    // ────────────────────────────────────────
    console.log('[Step 0] 기존 daily_log 데이터 정리...');
    await pool.execute(`DELETE FROM h_approval_requests WHERE tenant_id=? AND request_type='daily_log'`, [TENANT_ID]);
    await pool.execute(`DELETE FROM h_generic_checklist_records WHERE tenant_id=? AND form_type='daily_log'`, [TENANT_ID]);
    // 기존 production_daily 타입 daily reports도 삭제
    await pool.execute(`DELETE FROM h_daily_reports WHERE tenant_id=? AND report_type='production_daily'`, [TENANT_ID]);
    console.log('  기존 데이터 삭제 완료\n');

    // ────────────────────────────────────────
    // Step 1: 모든 생산일자와 배치 정보 가져오기
    // ────────────────────────────────────────
    console.log('[Step 1] 배치 데이터 수집...');
    const [batchRows] = await pool.execute<any[]>(`
      SELECT b.id, b.planned_date, b.batch_code, b.product_id, 
             COALESCE(p.product_name, b.batch_code) as product_name,
             b.planned_quantity, b.actual_quantity, b.status
      FROM h_batches b
      LEFT JOIN h_products p ON b.product_id = p.id
      WHERE b.tenant_id=? AND b.status='completed'
      ORDER BY b.planned_date, b.id
    `, [TENANT_ID]);
    
    // 날짜별 그룹핑
    const dateMap = new Map<string, any[]>();
    for (const batch of batchRows) {
      // Fix timezone issue: MySQL DATE -> JS Date has UTC offset
      let d: string;
      if (batch.planned_date instanceof Date) {
        // Use UTC date to avoid timezone shift
        const y = batch.planned_date.getUTCFullYear();
        const m = String(batch.planned_date.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(batch.planned_date.getUTCDate()).padStart(2, '0');
        d = `${y}-${m}-${dd}`;
      } else {
        d = String(batch.planned_date);
      }
      // Validate: check if the date part matches batch_code pattern (YYYYMMDD)
      if (batch.batch_code) {
        const bcDate = batch.batch_code.split('-')[0]; // "20251010"
        if (bcDate && bcDate.length === 8) {
          const expected = `${bcDate.substring(0,4)}-${bcDate.substring(4,6)}-${bcDate.substring(6,8)}`;
          if (expected !== d) {
            d = expected; // Use batch_code date as authoritative
          }
        }
      }
      if (!dateMap.has(d)) dateMap.set(d, []);
      dateMap.get(d)!.push(batch);
    }
    
    const productionDates = Array.from(dateMap.keys()).sort();
    console.log(`  ${batchRows.length}개 배치, ${productionDates.length}개 생산일자\n`);

    // ────────────────────────────────────────
    // Step 2: 각 생산일자별 일일일지(daily_log) 생성
    // ────────────────────────────────────────
    console.log('[Step 2] 일일일지 생성 (h_generic_checklist_records)...');
    let dailyLogSeq = 0;
    const dailyLogIds: { date: string; recordId: number }[] = [];

    for (const dateStr of productionDates) {
      dailyLogSeq++;
      const batches = dateMap.get(dateStr)!;
      const rand = seededRandom(parseInt(dateStr.replace(/-/g, ''), 10));

      // 위생점검 데이터 (모든 항목 적합)
      const hygieneChecks = HYGIENE_CHECKS_TEMPLATE.map(item => ({
        ...item,
        checkResult: "yes",
      }));

      // 이물관리 데이터 (모든 항목 적합)
      const foreignMaterialChecks = FOREIGN_MATERIAL_CHECKS_TEMPLATE.map(item => ({
        ...item,
        checkResult: "적합",
      }));

      // 온도 기록 (오전/오후 각 1회)
      const tempRecords = [];
      for (const room of TEMP_ROOMS) {
        // 오전
        tempRecords.push({
          roomName: room.name,
          timePeriod: "오전",
          checkTime: addMinuteVariance(9, 0, rand),
          temperature: addTempVariance(room.baseTemp, rand),
          humidity: addTempVariance(room.baseHumid, rand, 3),
          evaluation: "적합",
        });
        // 오후
        tempRecords.push({
          roomName: room.name,
          timePeriod: "오후",
          checkTime: addMinuteVariance(14, 0, rand),
          temperature: addTempVariance(room.baseTemp, rand),
          humidity: addTempVariance(room.baseHumid, rand, 3),
          evaluation: "적합",
        });
      }

      // 배치 정보
      const batchData = batches.map(b => ({
        batchId: b.id,
        batchCode: b.batch_code,
        productName: b.product_name,
        productId: b.product_id,
        plannedQuantity: parseFloat(b.planned_quantity),
        actualQuantity: parseFloat(b.actual_quantity || b.planned_quantity),
        status: b.status,
      }));

      const formData = {
        date: dateStr,
        hygieneChecks,
        foreignMaterialChecks,
        temperatureRecords: tempRecords,
        hygieneNotes: { actionBy: "", confirmedBy: "", specialNotes: "", improvementAction: "" },
        freezerIssues: { actionBy: "", actionTaken: "", confirmedBy: "", completionDate: "", issueDescription: "" },
        batches: batchData,
        totalBatches: batchData.length,
        totalPlannedQty: batchData.reduce((s, b) => s + b.plannedQuantity, 0),
        totalProduction: batchData.reduce((s, b) => s + b.actualQuantity, 0),
        lastUpdated: `${dateStr}T17:00:00.000Z`,
      };

      const title = `일일일지 - ${dateStr}`;
      const createdAt = dateToSqlTimestamp(dateStr, 8, 30);

      const [ins] = await pool.execute(`
        INSERT INTO h_generic_checklist_records
          (site_id, tenant_id, form_type, tenant_seq, form_date, title, form_data, status, created_by, created_at, updated_at)
        VALUES (?, ?, 'daily_log', ?, ?, ?, ?, 'approved', ?, ?, ?)
      `, [SITE_ID, TENANT_ID, dailyLogSeq, dateStr, title, JSON.stringify(formData), AUTHOR_USER_ID, createdAt, createdAt]);

      const recordId = (ins as any).insertId;
      dailyLogIds.push({ date: dateStr, recordId });
    }
    console.log(`  ${dailyLogIds.length}개 일일일지 생성 완료\n`);

    // ────────────────────────────────────────
    // Step 3: 일일일지 승인요청 생성 (모두 승인완료 상태)
    // ────────────────────────────────────────
    console.log('[Step 3] 일일일지 승인 처리...');
    for (const { date, recordId } of dailyLogIds) {
      const requestedAt = dateToSqlTimestamp(date, 17, 0);
      const reviewedAt = dateToSqlTimestamp(date, 17, 10);
      const approvedAt = dateToSqlTimestamp(date, 17, 20);

      await pool.execute(`
        INSERT INTO h_approval_requests
          (site_id, tenant_id, request_type, reference_type, reference_id,
           title, description, status, priority,
           requested_by, requested_at,
           reviewed_by, reviewed_at, review_comments,
           approved_by, approved_at,
           created_at)
        VALUES (?, ?, 'daily_log', 'checklist', ?,
                ?, '일일일지 작성 완료 - 자동 승인', 'approved', 'medium',
                ?, ?,
                ?, ?, '검토 완료',
                ?, ?,
                ?)
      `, [
        SITE_ID, TENANT_ID, recordId,
        `[일일일지] ${date} 일반위생관리 및 공정점검표`,
        AUTHOR_USER_ID, requestedAt,
        REVIEWER_USER_ID, reviewedAt,
        APPROVER_USER_ID, approvedAt,
        requestedAt,
      ]);
    }
    console.log(`  ${dailyLogIds.length}개 승인요청 생성 (모두 approved)\n`);

    // ────────────────────────────────────────
    // Step 4: h_daily_reports (생산일지) 생성
    // ────────────────────────────────────────
    console.log('[Step 4] 생산일지 (h_daily_reports) 생성...');
    for (const dateStr of productionDates) {
      const batches = dateMap.get(dateStr)!;
      const rand = seededRandom(parseInt(dateStr.replace(/-/g, ''), 10) + 1000);

      const batchDetails = batches.map(b => ({
        batchId: b.id,
        batchCode: b.batch_code,
        productName: b.product_name,
        productCode: '',
        plannedQuantity: parseFloat(b.planned_quantity),
        actualQuantity: parseFloat(b.actual_quantity || b.planned_quantity),
        status: b.status,
        pipelineStatus: null,
        startTime: addMinuteVariance(5, 0, rand),
        endTime: addMinuteVariance(17, 0, rand),
        ccpDetails: [],
      }));

      const summary = {
        date: dateStr,
        tenantId: TENANT_ID,
        autoGenerated: true,
        generatedAt: `${dateStr}T08:00:00.000Z`,
        production: {
          batches: batchDetails,
          totalBatches: batchDetails.length,
          completedBatches: batchDetails.length,
          activeBatches: 0,
          totalPlannedQty: batchDetails.reduce((s, b) => s + b.plannedQuantity, 0),
          totalActualQty: batchDetails.reduce((s, b) => s + b.actualQuantity, 0),
          achievementRate: 100,
        },
        ccp: { totalRecords: 0, normalCount: 0, deviationCount: 0, complianceRate: "100.0" },
        issues: [],
        checklist: null,
      };

      const genAt = dateToSqlTimestamp(dateStr, 18, 0);
      await pool.execute(`
        INSERT INTO h_daily_reports (site_id, report_date, report_type, summary, tenant_id, generated_at)
        VALUES (?, ?, 'production_daily', ?, ?, ?)
      `, [0, dateStr, JSON.stringify(summary), TENANT_ID, genAt]);
    }
    console.log(`  ${productionDates.length}개 생산일지 생성 완료\n`);

    // ────────────────────────────────────────
    // Step 5: CCP 기록지 (h_ccp_form_records) 행 채우기 + 승인
    // ────────────────────────────────────────
    console.log('[Step 5] CCP 기록지 행 채우기 + 승인...');

    // 5a: CCP form rows가 없는 form_records에 행 채우기
    const [emptyFormRecords] = await pool.execute<any[]>(`
      SELECT fr.id, fr.batch_id, fr.ccp_type, fr.work_date, fr.product_name,
             fr.process_group_id, fr.batch_count, fr.planned_qty_kg,
             fr.cl_heat_time_min_lo, fr.cl_heat_temp_lo, fr.cl_pressure_mpa_lo
      FROM h_ccp_form_records fr
      LEFT JOIN h_ccp_form_rows frow ON frow.form_record_id = fr.id AND frow.tenant_id = ?
      WHERE fr.tenant_id = ? AND frow.id IS NULL
      ORDER BY fr.work_date, fr.batch_id
    `, [TENANT_ID, TENANT_ID]);

    console.log(`  ${emptyFormRecords.length}개 빈 CCP form records에 행 채우기...`);

    // 설비 정보 가져오기
    const [equipments] = await pool.execute<any[]>(`
      SELECT e.id, e.name, e.type, e.default_temperature, e.default_pressure,
             e.batch_operation_time, e.default_time,
             pge.process_group_id, pge.sort_order
      FROM ccp_process_group_equipments pge
      JOIN equipments e ON pge.equipment_id = e.id AND e.tenant_id = ?
      WHERE pge.tenant_id = ? AND e.status = 'active'
      ORDER BY pge.process_group_id, pge.sort_order
    `, [TENANT_ID, TENANT_ID]);

    const equipByGroup = new Map<number, any[]>();
    for (const eq of equipments) {
      if (!equipByGroup.has(eq.process_group_id)) equipByGroup.set(eq.process_group_id, []);
      equipByGroup.get(eq.process_group_id)!.push(eq);
    }

    let filledRows = 0;
    for (const fr of emptyFormRecords) {
      const wdStr = dateToString(fr.work_date);
      const rand = seededRandom(fr.id * 31 + parseInt(wdStr.replace(/-/g, ''), 10));
      const batchCount = fr.batch_count || 1;

      if (fr.ccp_type === 'CCP-4P') {
        // 금속검출: 3개 감도검사 행 (작업시작, 점심식사후, 작업종료) + 마지막에 통과수량 행
        const metalTimes = [
          { h: 9, m: 0, note: '작업시작' },
          { h: 13, m: 0, note: '점심식사후' },
          { h: 16, m: 25, note: '작업종료' },
        ];
        for (let i = 0; i < metalTimes.length; i++) {
          const mt = metalTimes[i];
          const passTime = addMinuteVariance(mt.h, mt.m, rand);
          const createdAt = dateToSqlTimestamp(wdStr, mt.h, mt.m);
          await pool.execute(`
            INSERT INTO h_ccp_form_rows
              (tenant_id, form_record_id, batch_seq, equipment_type, product_name,
               result, metal_pass_time, metal_fe_mid, metal_sus_mid,
               metal_product_only, metal_fe_product, metal_sus_product,
               note, created_at, updated_at)
            VALUES (?, ?, ?, 'sensitivity', ?, '적합', ?, 'O', 'O', 'X', 'O', 'O', ?, ?, ?)
          `, [TENANT_ID, fr.id, i + 1, fr.product_name, passTime, mt.note, createdAt, createdAt]);
          filledRows++;
        }
        // 마지막 행: 통과 수량
        const qty = Math.round(parseFloat(fr.planned_qty_kg || 70));
        const lastCreatedAt = dateToSqlTimestamp(wdStr, 16, 30);
        await pool.execute(`
          INSERT INTO h_ccp_form_rows
            (tenant_id, form_record_id, batch_seq, equipment_type, product_name,
             result, pass_qty, detected_qty, note, created_at, updated_at)
          VALUES (?, ?, ?, 'pass_result', ?, '적합', ?, 0, '금속검출 완료', ?, ?)
        `, [TENANT_ID, fr.id, metalTimes.length + 1, fr.product_name, qty, lastCreatedAt, lastCreatedAt]);
        filledRows++;

      } else if (fr.ccp_type === 'CCP-1B') {
        // 가열(증숙/교반): 설비별 배치별 행
        const groupEquips = equipByGroup.get(fr.process_group_id) || [];
        const baseTemp = parseFloat(fr.cl_heat_temp_lo || 90);
        const baseTime = parseInt(fr.cl_heat_time_min_lo || 10);
        const basePressure = parseFloat(fr.cl_pressure_mpa_lo || 0.18);
        let baseHour = 5;
        let baseMinute = 0;

        for (let seq = 0; seq < batchCount; seq++) {
          const equip = groupEquips[seq % groupEquips.length] || { id: null, name: `설비${seq + 1}` };
          const mTime = addMinuteVariance(baseHour, baseMinute, rand);
          const temp = addTempVariance(99, rand);
          const pressure = addTempVariance(basePressure, rand, 0.02);
          const createdAt = dateToSqlTimestamp(wdStr, baseHour, baseMinute);

          await pool.execute(`
            INSERT INTO h_ccp_form_rows
              (tenant_id, form_record_id, batch_seq, equipment_id, equipment_name,
               product_name, measurement_time, input_qty_kg, result,
               heat_time_min, heat_temp_c, pressure_mpa, temp_edge_c, temp_center_c,
               created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, '적합', ?, ?, ?, ?, ?, ?, ?)
          `, [
            TENANT_ID, fr.id, seq + 1, equip.id, equip.name,
            fr.product_name, mTime,
            Math.round(parseFloat(fr.planned_qty_kg || 70) / batchCount),
            baseTime, temp, pressure, temp, temp,
            createdAt, createdAt,
          ]);
          filledRows++;
          baseMinute += 17; // interval between batches
          if (baseMinute >= 60) { baseHour++; baseMinute -= 60; }
        }

      } else if (fr.ccp_type === 'CCP-2B') {
        // 오븐-굽기: 오븐기 사용
        const groupEquips = equipByGroup.get(fr.process_group_id) || [];
        let baseHour = 9;
        let baseMinute = 0;

        for (let seq = 0; seq < batchCount; seq++) {
          const equip = groupEquips[seq % groupEquips.length] || { id: 10, name: '오븐기' };
          const mTime = addMinuteVariance(baseHour, baseMinute, rand);
          const temp = addTempVariance(175, rand);
          const createdAt = dateToSqlTimestamp(wdStr, baseHour, baseMinute);

          await pool.execute(`
            INSERT INTO h_ccp_form_rows
              (tenant_id, form_record_id, batch_seq, equipment_id, equipment_name,
               product_name, measurement_time, input_qty_kg, result,
               heat_time_min, heat_temp_c, temp_edge_c, temp_center_c,
               created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, '적합', 10, ?, ?, ?, ?, ?)
          `, [
            TENANT_ID, fr.id, seq + 1, equip.id, equip.name,
            fr.product_name, mTime,
            Math.round(parseFloat(fr.planned_qty_kg || 70) / batchCount),
            temp, temp, temp,
            createdAt, createdAt,
          ]);
          filledRows++;
          baseMinute += 20;
          if (baseMinute >= 60) { baseHour++; baseMinute -= 60; }
        }
      }
    }
    console.log(`  ${filledRows}개 CCP form rows 생성\n`);

    // 5b: 모든 CCP form records 승인 처리
    console.log('[Step 5b] CCP form records 승인 처리...');
    const [allFormRecords] = await pool.execute<any[]>(`
      SELECT id, batch_id, ccp_type, work_date, product_name, status
      FROM h_ccp_form_records WHERE tenant_id=? AND status='draft'
    `, [TENANT_ID]);

    let ccpApproved = 0;
    for (const fr of allFormRecords) {
      const wdStr = dateToString(fr.work_date);
      
      const submittedAt = dateToSqlTimestamp(wdStr, 17, 0);
      const approvedAt = dateToSqlTimestamp(wdStr, 17, 30);

      // CCP form record를 approved로
      await pool.execute(`
        UPDATE h_ccp_form_records 
        SET status='approved', writer_id=?, approver_id=?,
            submitted_at=?, approved_at=?,
            created_at=COALESCE(
              (SELECT MIN(r.created_at) FROM h_ccp_form_rows r WHERE r.form_record_id=h_ccp_form_records.id),
              ?
            ),
            updated_at=?
        WHERE id=? AND tenant_id=?
      `, [
        AUTHOR_USER_ID, APPROVER_USER_ID,
        submittedAt, approvedAt,
        dateToSqlTimestamp(wdStr, 8, 0),
        approvedAt,
        fr.id, TENANT_ID,
      ]);

      // 승인요청 생성
      await pool.execute(`
        INSERT INTO h_approval_requests
          (site_id, tenant_id, request_type, reference_type, reference_id,
           title, description, status, priority,
           requested_by, requested_at,
           reviewed_by, reviewed_at, review_comments,
           approved_by, approved_at,
           created_at)
        VALUES (?, ?, 'ccp_form', 'ccp_form_record', ?,
                ?, 'CCP 기록지 작성 완료', 'approved', 'medium',
                ?, ?,
                ?, ?, '검토 완료',
                ?, ?,
                ?)
      `, [
        SITE_ID, TENANT_ID, fr.id,
        `[CCP-${fr.ccp_type}] ${wdStr} ${fr.product_name}`,
        AUTHOR_USER_ID, submittedAt,
        REVIEWER_USER_ID, submittedAt,
        APPROVER_USER_ID, approvedAt,
        submittedAt,
      ]);

      ccpApproved++;
    }
    console.log(`  ${ccpApproved}개 CCP form records 승인 완료\n`);

    // 5c: h_ccp_instances도 승인
    console.log('[Step 5c] CCP instances 승인 처리...');
    const [draftInstances] = await pool.execute<any[]>(`
      SELECT id, work_date FROM h_ccp_instances WHERE tenant_id=? AND status='draft'
    `, [TENANT_ID]);
    
    for (const inst of draftInstances) {
      const wdStr = dateToString(inst.work_date);
      const approvedAt = dateToSqlTimestamp(wdStr, 17, 30);
      
      await pool.execute(`
        UPDATE h_ccp_instances 
        SET status='approved', 
            submitted_by=?, submitted_at=?,
            approved_by=?, approved_at=?,
            created_by=COALESCE(created_by, ?),
            created_at=IF(created_at > ?, ?, created_at)
        WHERE id=? AND tenant_id=?
      `, [
        AUTHOR_USER_ID, dateToSqlTimestamp(wdStr, 17, 0),
        APPROVER_USER_ID, approvedAt,
        AUTHOR_USER_ID,
        `${wdStr} 23:59:59`, dateToSqlTimestamp(wdStr, 8, 0),
        inst.id, TENANT_ID,
      ]);
    }
    console.log(`  ${draftInstances.length}개 CCP instances 승인 완료\n`);

    // ────────────────────────────────────────
    // Step 6: 주간 위생 로그 생성
    // ────────────────────────────────────────
    console.log('[Step 6] 주간 위생 로그 생성...');
    
    // 기존 자동생성 주간로그 삭제
    await pool.execute(`DELETE FROM weekly_hygiene_logs WHERE tenant_id=?`, [TENANT_ID]);
    
    // 주 단위 그룹핑 (금요일 기준)
    const weekSet = new Set<string>();
    for (const dateStr of productionDates) {
      const d = new Date(dateStr);
      // 해당 주의 금요일 구하기
      const day = d.getDay();
      const diff = 5 - day; // 5 = Friday
      const friday = new Date(d);
      friday.setDate(d.getDate() + (diff >= 0 ? diff : diff + 7));
      const fridayStr = dateToString(friday);
      weekSet.add(fridayStr);
    }

    const weeks = Array.from(weekSet).sort();
    let weeklyCount = 0;
    for (const fridayStr of weeks) {
      const createdAt = dateToSqlTimestamp(fridayStr, 17, 0);
      // Use raw SQL to handle Korean enum values properly
      await pool.query(`
        INSERT INTO weekly_hygiene_logs
          (tenant_id, check_date, checker_name,
           cold_storage_clean, facility_clean, uniform_wash,
           special_notes, improvement_action, confirmation,
           status,
           approved_by, approved_at, created_at, updated_at)
        VALUES (${TENANT_ID}, '${fridayStr}', '이준석',
                1, 1, 1,
                '주간 위생점검 완료 - 이상없음', '해당없음', '확인완료',
                3,
                '한상갑', '${createdAt}', '${createdAt}', '${createdAt}')
      `);
      weeklyCount++;
    }
    console.log(`  ${weeklyCount}개 주간 위생 로그 생성 완료\n`);

    // ────────────────────────────────────────
    // Step 7: 월간 CCP 로그 생성
    // ────────────────────────────────────────
    console.log('[Step 7] 월간 CCP 로그 생성...');
    
    // 기존 월간 로그 삭제
    await pool.execute(`DELETE FROM monthly_ccp_logs WHERE tenant_id=?`, [TENANT_ID]);
    
    const monthSet = new Set<string>();
    for (const dateStr of productionDates) {
      monthSet.add(dateStr.substring(0, 7)); // YYYY-MM
    }
    
    const months = Array.from(monthSet).sort();
    let monthlyCount = 0;
    for (const month of months) {
      const lastDay = new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0).getDate();
      const checkDate = `${month}-${String(lastDay).padStart(2, '0')}`;
      const createdAt = dateToSqlTimestamp(checkDate, 17, 0);
      
      // monthly_ccp_logs status is varchar(20), not enum - safe to use string
      await pool.query(`
        INSERT INTO monthly_ccp_logs
          (tenant_id, check_date, checker_name, confirmer_name, confirm_date,
           heating_temp_time_check, heating_equipment_calibration, heating_temp_method,
           heating_time_method, heating_core_temp_method, heating_corrective_action_knowledge,
           metal_detector_test, metal_detector_calibration, metal_detector_method,
           metal_corrective_action_knowledge,
           deviation_details, status, approved_by, approved_at, created_at, updated_at)
        VALUES (${TENANT_ID}, '${checkDate}', '이준석', '한상갑', '${checkDate}',
                '적합', '적합', '적합', '적합', '적합', '적합',
                '적합', '적합', '적합', '적합',
                '이상없음', '승인완료', '한상갑', '${createdAt}', '${createdAt}', '${createdAt}')
      `);
      monthlyCount++;
    }
    console.log(`  ${monthlyCount}개 월간 CCP 로그 생성 완료\n`);

    // ────────────────────────────────────────
    // Step 8: CCP form records created_at을 work_date에 맞춤 (중요!)
    // ────────────────────────────────────────
    console.log('[Step 8] CCP form records/rows created_at을 work_date에 맞춤...');
    
    // form_records created_at이 work_date 범위를 벗어나면 보정
    await pool.execute(`
      UPDATE h_ccp_form_records 
      SET created_at = CONCAT(work_date, ' 08:00:00')
      WHERE tenant_id = ? AND DATE(created_at) != work_date
    `, [TENANT_ID]);

    // form_rows created_at도 해당 날짜에 맞춤
    await pool.execute(`
      UPDATE h_ccp_form_rows fr
      JOIN h_ccp_form_records frec ON fr.form_record_id = frec.id
      SET fr.created_at = CONCAT(frec.work_date, ' ', COALESCE(TIME(fr.measurement_time), TIME(fr.metal_pass_time), '08:00:00')),
          fr.updated_at = CONCAT(frec.work_date, ' ', COALESCE(TIME(fr.measurement_time), TIME(fr.metal_pass_time), '08:00:00'))
      WHERE fr.tenant_id = ? AND DATE(fr.created_at) != frec.work_date
    `, [TENANT_ID]);
    
    console.log('  날짜 보정 완료\n');

    // ────────────────────────────────────────
    // Step 9: daily_logs 테이블도 생성 (구 테이블)
    // ────────────────────────────────────────
    console.log('[Step 9] daily_logs 테이블 생성 (구 테이블)...');
    
    // 기존 데이터 삭제
    const [oldDailyLogIds] = await pool.execute<any[]>(`SELECT id FROM daily_logs WHERE tenant_id=?`, [TENANT_ID]);
    for (const dl of oldDailyLogIds) {
      await pool.execute(`DELETE FROM daily_log_temperature_humidity WHERE daily_log_id=? AND tenant_id=?`, [dl.id, TENANT_ID]);
      await pool.execute(`DELETE FROM daily_log_hygiene_checks WHERE daily_log_id=? AND tenant_id=?`, [dl.id, TENANT_ID]);
      await pool.execute(`DELETE FROM daily_log_foreign_material_checks WHERE daily_log_id=? AND tenant_id=?`, [dl.id, TENANT_ID]);
    }
    await pool.execute(`DELETE FROM daily_logs WHERE tenant_id=?`, [TENANT_ID]);

    for (const dateStr of productionDates) {
      const rand = seededRandom(parseInt(dateStr.replace(/-/g, ''), 10) + 2000);
      const createdAt = dateToSqlTimestamp(dateStr, 8, 30);
      const submittedAt = dateToSqlTimestamp(dateStr, 17, 0);
      const reviewedAt = dateToSqlTimestamp(dateStr, 17, 10);
      const approvedAt = dateToSqlTimestamp(dateStr, 17, 20);

      const [dlIns] = await pool.execute(`
        INSERT INTO daily_logs (tenant_id, log_date, status, writer_id, reviewer_id, approver_id,
                                created_at, updated_at, submitted_at, reviewed_at, approved_at)
        VALUES (?, ?, 'approved', ?, ?, ?, ?, ?, ?, ?, ?)
      `, [TENANT_ID, dateStr, AUTHOR_USER_ID, REVIEWER_USER_ID, APPROVER_USER_ID,
          createdAt, approvedAt, submittedAt, reviewedAt, approvedAt]);
      
      const dlId = (dlIns as any).insertId;

      // 온도 기록 - time_period is enum('오전','오후'), evaluation is enum('적합','부적합')
      // Use numeric index: 1 = 오전, 2 = 오후; evaluation 1 = 적합
      for (const room of TEMP_ROOMS) {
        for (const periodIdx of [1, 2]) {
          const baseH = periodIdx === 1 ? 9 : 14;
          const checkTime = addMinuteVariance(baseH, 0, rand);
          const temp = addTempVariance(room.baseTemp, rand);
          const humid = addTempVariance(room.baseHumid, rand, 3);
          await pool.query(`
            INSERT INTO daily_log_temperature_humidity
              (daily_log_id, room_name, time_period, check_time, temperature, humidity, evaluation, tenant_id)
            VALUES (${dlId}, '${room.name}', ${periodIdx}, '${checkTime}', ${temp}, ${humid}, 1, ${TENANT_ID})
          `);
        }
      }

      // 위생점검
      for (const item of HYGIENE_CHECKS_TEMPLATE) {
        await pool.execute(`
          INSERT INTO daily_log_hygiene_checks
            (daily_log_id, category, subcategory, item_order, item_text, check_result, tenant_id)
          VALUES (?, ?, ?, ?, ?, 'yes', ?)
        `, [dlId, item.category, item.subcategory, item.itemOrder, item.itemText, TENANT_ID]);
      }

      // 이물관리 - check_result is enum('적합','부적합','na'), use index 1 = 적합
      for (const item of FOREIGN_MATERIAL_CHECKS_TEMPLATE) {
        await pool.query(`
          INSERT INTO daily_log_foreign_material_checks
            (daily_log_id, category, item_order, item_text, check_result, tenant_id)
          VALUES (${dlId}, '${item.category}', ${item.itemOrder}, '${item.itemText.replace(/'/g, "\\'")}', 1, ${TENANT_ID})
        `);
      }
    }
    console.log(`  ${productionDates.length}개 daily_logs (구 테이블) 생성 완료\n`);

    // ────────────────────────────────────────
    // Step 10: 인쇄관리 (document_batch_print_groups) 생성
    // ────────────────────────────────────────
    console.log('[Step 10] 인쇄관리 그룹 생성...');
    
    // 기존 삭제
    await pool.execute(`DELETE FROM document_batch_print_items WHERE tenant_id=?`, [TENANT_ID]);
    await pool.execute(`DELETE FROM document_batch_print_groups WHERE tenant_id=?`, [TENANT_ID]);

    // document_type 찾기 (또는 생성)
    let docTypeId: number;
    const [dtRows] = await pool.execute<any[]>(
      `SELECT id FROM document_types WHERE tenant_id=? AND code='ccp_form' LIMIT 1`,
      [TENANT_ID]
    );
    if ((dtRows as any[]).length > 0) {
      docTypeId = dtRows[0].id;
    } else {
      const [dtIns] = await pool.execute(`
        INSERT INTO document_types (code, name, category, is_active, auto_generate_on_batch, requires_approval, tenant_id)
        VALUES ('ccp_form', 'CCP 기록지', 'ccp', 1, 0, 1, ?)
      `, [TENANT_ID]);
      docTypeId = (dtIns as any).insertId;
    }

    // 기존 자동생성 document_instances 정리 (CCP 관련)
    await pool.execute(`DELETE FROM document_instances WHERE tenant_id=? AND document_type_id=? AND is_auto_generated=1`, [TENANT_ID, docTypeId]);

    // 각 배치별 document_instance 생성 → 인쇄 그룹에 추가
    console.log('  배치별 document_instances 생성...');
    const batchDocInstances = new Map<string, number[]>(); // month -> [instance_ids]

    for (const dateStr of productionDates) {
      const batches = dateMap.get(dateStr)!;
      const month = dateStr.substring(0, 7);
      if (!batchDocInstances.has(month)) batchDocInstances.set(month, []);

      for (const batch of batches) {
        const createdAt = dateToSqlTimestamp(dateStr, 8, 0);
        const approvedAt = dateToSqlTimestamp(dateStr, 17, 30);
        const docData = {
          batchId: batch.id,
          batchCode: batch.batch_code,
          productName: batch.product_name,
          plannedQuantity: parseFloat(batch.planned_quantity),
          actualQuantity: parseFloat(batch.actual_quantity || batch.planned_quantity),
          ccpRecords: true,
        };

        const [diIns] = await pool.execute(`
          INSERT INTO document_instances
            (site_id, document_type_id, batch_id, product_id, work_date, status,
             created_by, created_at, reviewer_id, reviewed_at, approver_id, approved_at,
             is_auto_generated, auto_approval_enabled, document_data, tenant_id, updated_at)
          VALUES (?, ?, ?, ?, ?, 'approved',
                  ?, ?, ?, ?, ?, ?,
                  1, 0, ?, ?, ?)
        `, [
          SITE_ID, docTypeId, batch.id, batch.product_id, dateStr,
          AUTHOR_USER_ID, createdAt,
          REVIEWER_USER_ID, createdAt,
          APPROVER_USER_ID, approvedAt,
          JSON.stringify(docData), TENANT_ID, approvedAt,
        ]);
        batchDocInstances.get(month)!.push((diIns as any).insertId);
      }
    }
    console.log(`  ${productionDates.length}일, ${batchRows.length}개 배치 document_instances 생성`);

    // 월별 인쇄 그룹 생성
    let printGroupCount = 0;
    for (const month of months) {
      const lastDay = new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0).getDate();
      const workDate = `${month}-${String(lastDay).padStart(2, '0')}`;
      
      const [pgIns] = await pool.execute(`
        INSERT INTO document_batch_print_groups
          (site_id, work_date, group_name, description, total_documents, tenant_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, 0, ?, ?, ?)
      `, [
        SITE_ID, workDate,
        `${month} CCP 기록지 + 일일일지`,
        `${month}월 생산 관련 전체 문서 (CCP 기록지, 일일일지, 위생점검)`,
        TENANT_ID,
        dateToSqlTimestamp(workDate, 18, 0),
        dateToSqlTimestamp(workDate, 18, 0),
      ]);
      const pgId = (pgIns as any).insertId;

      const monthInstances = batchDocInstances.get(month) || [];
      let sortOrder = 0;
      for (const instId of monthInstances) {
        await pool.execute(`
          INSERT INTO document_batch_print_items
            (batch_print_group_id, document_instance_id, sort_order, tenant_id)
          VALUES (?, ?, ?, ?)
        `, [pgId, instId, sortOrder++, TENANT_ID]);
      }

      await pool.execute(`
        UPDATE document_batch_print_groups SET total_documents=? WHERE id=?
      `, [sortOrder, pgId]);

      printGroupCount++;
    }
    console.log(`  ${printGroupCount}개 인쇄 그룹 생성 완료\n`);

    // ────────────────────────────────────────
    // Step 11: 주간/월간 일지 (h_generic_checklist_records) 생성
    // ────────────────────────────────────────
    console.log('[Step 11] 주간/월간 일지 (generic checklist) 생성...');
    
    // 기존 삭제
    await pool.execute(`DELETE FROM h_generic_checklist_records WHERE tenant_id=? AND form_type IN ('weekly_log', 'monthly_log')`, [TENANT_ID]);
    
    let weekLogSeq = 0;
    for (const fridayStr of weeks) {
      weekLogSeq++;
      const formData = {
        date: fridayStr,
        weeklyHygiene: {
          coldStorageClean: true,
          facilityClean: true,
          uniformWash: true,
          specialNotes: "주간 위생점검 이상 없음",
        },
        lastUpdated: `${fridayStr}T17:00:00.000Z`,
      };
      const createdAt = dateToSqlTimestamp(fridayStr, 17, 0);
      await pool.execute(`
        INSERT INTO h_generic_checklist_records
          (site_id, tenant_id, form_type, tenant_seq, form_date, title, form_data, status, created_by, created_at, updated_at)
        VALUES (?, ?, 'weekly_log', ?, ?, ?, ?, 'approved', ?, ?, ?)
      `, [SITE_ID, TENANT_ID, weekLogSeq, fridayStr, `주간위생일지 - ${fridayStr}`, JSON.stringify(formData), AUTHOR_USER_ID, createdAt, createdAt]);
    }

    let monthLogSeq = 0;
    for (const month of months) {
      monthLogSeq++;
      const lastDay = new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0).getDate();
      const dateStr = `${month}-${String(lastDay).padStart(2, '0')}`;
      const formData = {
        date: dateStr,
        month: month,
        ccpVerification: {
          heatingCheck: "적합",
          metalDetectorCheck: "적합",
          calibrationCheck: "적합",
          deviations: "없음",
        },
        lastUpdated: `${dateStr}T17:00:00.000Z`,
      };
      const createdAt = dateToSqlTimestamp(dateStr, 17, 0);
      await pool.execute(`
        INSERT INTO h_generic_checklist_records
          (site_id, tenant_id, form_type, tenant_seq, form_date, title, form_data, status, created_by, created_at, updated_at)
        VALUES (?, ?, 'monthly_log', ?, ?, ?, ?, 'approved', ?, ?, ?)
      `, [SITE_ID, TENANT_ID, monthLogSeq, dateStr, `월간CCP검증일지 - ${month}`, JSON.stringify(formData), AUTHOR_USER_ID, createdAt, createdAt]);
    }
    console.log(`  주간 ${weekLogSeq}개, 월간 ${monthLogSeq}개 생성 완료\n`);

    // ────────────────────────────────────────
    // 최종 검증
    // ────────────────────────────────────────
    console.log('=== 최종 검증 ===');
    
    const [[dailyLogCount]] = await pool.execute<any[]>(
      `SELECT COUNT(*) as cnt FROM h_generic_checklist_records WHERE tenant_id=? AND form_type='daily_log'`, [TENANT_ID]
    );
    const [[approvedDailyCount]] = await pool.execute<any[]>(
      `SELECT COUNT(*) as cnt FROM h_generic_checklist_records WHERE tenant_id=? AND form_type='daily_log' AND status='approved'`, [TENANT_ID]
    );
    const [[ccpFormCount]] = await pool.execute<any[]>(
      `SELECT COUNT(*) as cnt, SUM(status='approved') as approved FROM h_ccp_form_records WHERE tenant_id=?`, [TENANT_ID]
    );
    const [[ccpRowCount]] = await pool.execute<any[]>(
      `SELECT COUNT(*) as cnt FROM h_ccp_form_rows WHERE tenant_id=?`, [TENANT_ID]
    );
    const [[ccpInstanceCount]] = await pool.execute<any[]>(
      `SELECT COUNT(*) as cnt, SUM(status='approved') as approved FROM h_ccp_instances WHERE tenant_id=?`, [TENANT_ID]
    );
    const [[approvalCount]] = await pool.execute<any[]>(
      `SELECT COUNT(*) as cnt, SUM(status='approved') as approved FROM h_approval_requests WHERE tenant_id=?`, [TENANT_ID]
    );
    const [[weeklyCount2]] = await pool.execute<any[]>(
      `SELECT COUNT(*) as cnt FROM weekly_hygiene_logs WHERE tenant_id=?`, [TENANT_ID]
    );
    const [[monthlyCount2]] = await pool.execute<any[]>(
      `SELECT COUNT(*) as cnt FROM monthly_ccp_logs WHERE tenant_id=?`, [TENANT_ID]
    );
    const [[printGroupCount2]] = await pool.execute<any[]>(
      `SELECT COUNT(*) as cnt FROM document_batch_print_groups WHERE tenant_id=?`, [TENANT_ID]
    );
    const [[printItemCount]] = await pool.execute<any[]>(
      `SELECT COUNT(*) as cnt FROM document_batch_print_items WHERE tenant_id=?`, [TENANT_ID]
    );
    const [[dailyLogOldCount]] = await pool.execute<any[]>(
      `SELECT COUNT(*) as cnt FROM daily_logs WHERE tenant_id=?`, [TENANT_ID]
    );
    const [[reportCount]] = await pool.execute<any[]>(
      `SELECT COUNT(*) as cnt FROM h_daily_reports WHERE tenant_id=? AND report_type='production_daily'`, [TENANT_ID]
    );
    // CCP form records의 created_at이 work_date과 일치하는지 검증
    const [[ccpDateMismatch]] = await pool.execute<any[]>(
      `SELECT COUNT(*) as cnt FROM h_ccp_form_records WHERE tenant_id=? AND DATE(created_at) != work_date`, [TENANT_ID]
    );

    console.log(`  일일일지 (generic): ${dailyLogCount.cnt}개 (승인: ${approvedDailyCount.cnt})`);
    console.log(`  일일일지 (구 테이블): ${dailyLogOldCount.cnt}개`);
    console.log(`  생산일지 (h_daily_reports): ${reportCount.cnt}개`);
    console.log(`  CCP form records: ${ccpFormCount.cnt}개 (승인: ${ccpFormCount.approved})`);
    console.log(`  CCP form rows: ${ccpRowCount.cnt}개`);
    console.log(`  CCP instances: ${ccpInstanceCount.cnt}개 (승인: ${ccpInstanceCount.approved})`);
    console.log(`  승인요청: ${approvalCount.cnt}개 (승인: ${approvalCount.approved})`);
    console.log(`  주간 위생 로그: ${weeklyCount2.cnt}개`);
    console.log(`  월간 CCP 로그: ${monthlyCount2.cnt}개`);
    console.log(`  인쇄 그룹: ${printGroupCount2.cnt}개`);
    console.log(`  인쇄 항목: ${printItemCount.cnt}개`);
    console.log(`  CCP created_at ≠ work_date: ${ccpDateMismatch.cnt}개`);
    console.log('\n=== 완료 ===');

  } catch (error) {
    console.error('Error:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

main().catch(console.error);

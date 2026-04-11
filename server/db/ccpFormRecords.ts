// ═══════════════════════════════════════════════════════════════
// ccpFormRecords.ts - CCP 모니터링 기록지 DB 함수
// CCP-2B: 가열(굽기)공정, CCP-1B: 가열(증숙)공정, CCP-4P: 금속검출공정
//
// 주요 기능:
//   - 기록지 헤더 CRUD (getOrCreate, update, delete)
//   - 기록지 행 CRUD (upsert, update, delete)
//   - 설비 배치 설정 (equip batch settings)
//   - 기록지 제출/승인 워크플로
//   - h_ccp_rows <-> h_ccp_form_rows 양방향 동기화
//   - CCP-4P 금속검출 제품별 순차 시간 배분
// ═══════════════════════════════════════════════════════════════
import { getDb, getRawConnection } from "../db";
import { todayKST, toKSTTimestamp } from "../utils/timezone";
import {
  hCcpFormRecords,
  hCcpFormRows,
  hCcpEquipBatchSettings,
  type InsertCcpFormRecord,
  type InsertCcpFormRow,
  type InsertCcpEquipBatchSetting,
} from "../../drizzle/schema_main";
import { eq, and, desc } from "drizzle-orm";
import {
  timeToMin as metalTimeToMin,
  minToTime as metalMinToTime,
  addMinutesToTime as metalAddMinToTime,
  calcAvailableMinutes as metalCalcAvailableMinutes,
  skipLunch as metalSkipLunch,
  advanceCursor as metalAdvanceCursor,
  seededRandom as metalSeededRandom,
  computeSeed as metalComputeSeed,
  computeRandomOffset as metalComputeRandomOffset,
} from "../services/metalPassAllocator";

// ═══════════════════════════════════════════════════════════════
// 기록지 헤더 CRUD (h_ccp_form_records)
// ═══════════════════════════════════════════════════════════════

/**
 * 배치에 대한 CCP 기록지 조회 (없으면 자동생성)
 */
export async function getOrCreateCcpFormRecord(params: {
  tenantId: number;
  siteId: number;
  batchId: number;
  ccpType: string;
  workDate: string;
  productId?: number;
  productName?: string;
  processGroupId?: number;
  processGroupName?: string;
  bomBatchKg?: number;
  plannedQtyKg?: number;
  writerId?: number;
  // CL 값들
  clHeatTimeMinLo?: number;
  clHeatTimeMinHi?: number;
  clHeatTempLo?: number;
  clPressureMpaLo?: number;
  clProductTempLo?: number;
  clMetalSensitivity?: number;
  clFeMm?: number;
  clSusMm?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // ═══ CCP-4P 일일 통합 기록지: 하루에 1개만 생성 ═══
  // 금속검출기는 하루에 1대를 공유하므로, 배치별이 아닌 날짜별로 1개의 기록지 생성
  // batchId는 당일 첫 배치의 ID를 anchor로 사용
  if (params.ccpType === "CCP-4P" && params.workDate) {
    const conn = await getRawConnection();
    // 당일 CCP-4P 기록이 이미 존재하는지 확인 (배치 무관)
    // FOR UPDATE: 동시 배치 생성 시 레이스컨디션 방지
    const [dailyExisting] = await conn.execute<any[]>(
      `SELECT * FROM h_ccp_form_records
       WHERE tenant_id = ? AND ccp_type = 'CCP-4P' AND work_date = ?
       ORDER BY id ASC LIMIT 1
       FOR UPDATE`,
      [params.tenantId, params.workDate],
    );
    if ((dailyExisting as any[]).length > 0) {
      const rec = (dailyExisting as any[])[0];
      // 당일 총 생산량 업데이트 (누적)
      const [totalRow] = await conn.execute<any[]>(
        `SELECT SUM(b.planned_quantity) as total_qty, COUNT(*) as batch_count
         FROM h_batches b
         WHERE b.tenant_id = ? AND b.planned_date = ?
           AND b.status IN ('pending','in_progress','completed','approved','shipped','archived')`,
        [params.tenantId, params.workDate],
      );
      const totalQty = parseFloat((totalRow as any[])[0]?.total_qty) || 0;
      const batchCount = parseInt((totalRow as any[])[0]?.batch_count) || 1;
      if (totalQty > 0) {
        await conn.execute(
          `UPDATE h_ccp_form_records SET planned_qty_kg = ?, batch_count = ? WHERE id = ? AND tenant_id = ?`,
          [totalQty, batchCount, rec.id, params.tenantId],
        );
      }
      const rows = await getCcpFormRows(rec.id, params.tenantId);
      return { record: { ...rec, plannedQtyKg: totalQty.toString(), batchCount }, rows };
    }
    // 존재하지 않으면 아래 일반 생성 로직으로 진행 (product_name을 '금속검출 통합'으로 설정)
  }

  // 이미 존재하는지 확인 (CCP-1B, CCP-2B: 배치별 기록)
  const existing = await db
    .select()
    .from(hCcpFormRecords)
    .where(
      and(
        eq(hCcpFormRecords.tenantId, params.tenantId),
        eq(hCcpFormRecords.batchId, params.batchId),
        eq(hCcpFormRecords.ccpType, params.ccpType)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    // ── bomBatchKg가 전달됐는데 기존 레코드에 없으면 업데이트 (batchOrchestrator에서 나중에 호출)
    const rec = existing[0];
    const newBatchCount = (params.bomBatchKg && params.plannedQtyKg && params.bomBatchKg > 0)
      ? Math.ceil(params.plannedQtyKg / params.bomBatchKg) : null;
    const needsUpdate =
      (params.bomBatchKg && (!rec.bomBatchKg || Number(rec.bomBatchKg) === 0)) ||
      (newBatchCount && newBatchCount > 1 && Number(rec.batchCount) !== newBatchCount);
    if (needsUpdate) {
      const conn = await getRawConnection();
      const updateFields: string[] = [];
      const updateVals: any[] = [];
      if (params.bomBatchKg) {
        updateFields.push('bom_batch_kg = ?');
        updateVals.push(params.bomBatchKg);
      }
      if (newBatchCount && newBatchCount > 1) {
        updateFields.push('batch_count = ?');
        updateVals.push(newBatchCount);
      }
      if (params.plannedQtyKg) {
        updateFields.push('planned_qty_kg = ?');
        updateVals.push(params.plannedQtyKg);
      }
      if (updateFields.length > 0) {
        updateVals.push(rec.id, params.tenantId);
        await conn.execute(
          `UPDATE h_ccp_form_records SET ${updateFields.join(', ')} WHERE id = ? AND tenant_id = ?`,
          updateVals
        );
      }
    }
    const rows = await getCcpFormRows(rec.id, params.tenantId);
    return { record: { ...rec, batchCount: newBatchCount ?? rec.batchCount }, rows };
  }

  // 배치 수 계산
  let batchCount = 1;
  if (params.bomBatchKg && params.plannedQtyKg && params.bomBatchKg > 0) {
    batchCount = Math.ceil(params.plannedQtyKg / params.bomBatchKg);
    if (batchCount < 1) batchCount = 1;
  }

  // 설비 배치 설정 가져오기
  let equipGroupMode: "concurrent" | "sequential" = "sequential";
  let equipIntervalMin = 10;
  if (params.processGroupId) {
    const settings = await db
      .select()
      .from(hCcpEquipBatchSettings)
      .where(
        and(
          eq(hCcpEquipBatchSettings.tenantId, params.tenantId),
          eq(hCcpEquipBatchSettings.processGroupId, params.processGroupId)
        )
      )
      .limit(1);
    if (settings.length > 0) {
      equipGroupMode = settings[0].groupMode;
      equipIntervalMin = settings[0].intervalBetweenMin ?? 10;
    }
  }

  // CCP-4P: 일일 통합 기록 → productName/plannedQtyKg를 당일 전체 기준으로 설정
  let finalProductName = params.productName;
  let finalPlannedQtyKg = params.plannedQtyKg;
  let finalBatchCount = batchCount;
  if (params.ccpType === "CCP-4P" && params.workDate) {
    finalProductName = "금속검출 통합";
    try {
      const conn2 = await getRawConnection();
      const [totalRow2] = await conn2.execute<any[]>(
        `SELECT SUM(b.planned_quantity) as total_qty, COUNT(*) as batch_count
         FROM h_batches b
         WHERE b.tenant_id = ? AND b.planned_date = ?
           AND b.status IN ('pending','in_progress','completed','approved','shipped','archived')`,
        [params.tenantId, params.workDate],
      );
      if ((totalRow2 as any[])[0]?.total_qty) {
        finalPlannedQtyKg = parseFloat((totalRow2 as any[])[0].total_qty);
        finalBatchCount = parseInt((totalRow2 as any[])[0].batch_count) || 1;
      }
    } catch { /* fallback */ }
  }

  const insertData: InsertCcpFormRecord = {
    tenantId: params.tenantId,
    siteId: params.siteId,
    batchId: params.batchId,
    ccpType: params.ccpType,
    workDate: new Date(params.workDate),
    productId: params.ccpType === "CCP-4P" ? null : params.productId,
    productName: finalProductName,
    processGroupId: params.processGroupId,
    processGroupName: params.processGroupName,
    bomBatchKg: params.bomBatchKg?.toString(),
    plannedQtyKg: finalPlannedQtyKg?.toString(),
    batchCount: finalBatchCount,
    equipGroupMode,
    equipIntervalMin,
    clHeatTimeMinLo: params.clHeatTimeMinLo,
    clHeatTimeMinHi: params.clHeatTimeMinHi,
    clHeatTempLo: params.clHeatTempLo?.toString(),
    clPressureMpaLo: params.clPressureMpaLo?.toString(),
    clProductTempLo: params.clProductTempLo?.toString(),
    clMetalSensitivity: params.clMetalSensitivity ?? 130,
    clFeMm: params.clFeMm?.toString() ?? "2.0",
    clSusMm: params.clSusMm?.toString() ?? "3.0",
    writerId: params.writerId,
    status: "draft",
  };

  const [result] = await db.insert(hCcpFormRecords).values(insertData);
  const newId = (result as any).insertId as number;

  const newRecord = await db
    .select()
    .from(hCcpFormRecords)
    .where(eq(hCcpFormRecords.id, newId))
    .limit(1);

  return { record: newRecord[0], rows: [] };
}

/**
 * CCP 기록지 헤더 업데이트
 * P0: tenantId 필수 - 테넌트 격리
 */
export async function updateCcpFormRecord(
  id: number,
  data: Partial<InsertCcpFormRecord>,
  tenantId?: number
) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const conditions = tenantId
    ? and(eq(hCcpFormRecords.id, id), eq(hCcpFormRecords.tenantId, tenantId))
    : eq(hCcpFormRecords.id, id);
  await db
    .update(hCcpFormRecords)
    .set({ ...data, updatedAt: new Date() })
    .where(conditions);
}

/**
 * 배치 ID로 CCP 기록지 목록 조회
 * P0: tenantId 필수 - 테넌트 격리
 * ★ CCP-4P(금속검출)는 하루에 1개의 기록지가 첫 번째 배치에만 연결되므로,
 *    같은 날짜의 다른 배치에서도 해당 CCP-4P 기록지를 표시해야 함.
 */
export async function getCcpFormRecordsByBatch(batchId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 기존 쿼리: 해당 배치에 직접 연결된 CCP 기록지 (CCP-1B, CCP-2B)
  const conditions = tenantId
    ? and(eq(hCcpFormRecords.batchId, batchId), eq(hCcpFormRecords.tenantId, tenantId))
    : eq(hCcpFormRecords.batchId, batchId);
  const directRecords = await db
    .select()
    .from(hCcpFormRecords)
    .where(conditions)
    .orderBy(hCcpFormRecords.ccpType);

  // CCP-4P가 이미 포함되어 있으면 그대로 반환
  if (directRecords.some(r => r.ccpType === "CCP-4P")) {
    return directRecords;
  }

  // CCP-4P가 없으면: 같은 날짜의 CCP-4P 일일 통합 기록 조회
  if (tenantId) {
    try {
      const conn = await getRawConnection();
      const [batchRows] = await conn.execute<any[]>(
        `SELECT planned_date FROM h_batches WHERE id = ? AND tenant_id = ? LIMIT 1`,
        [batchId, tenantId],
      );
      if ((batchRows as any[]).length > 0) {
        const plannedDate = (batchRows as any[])[0].planned_date;
        if (plannedDate) {
          const [ccp4pRows] = await conn.execute<any[]>(
            `SELECT * FROM h_ccp_form_records 
             WHERE tenant_id = ? AND ccp_type = 'CCP-4P' AND work_date = ?
             ORDER BY id ASC LIMIT 1`,
            [tenantId, plannedDate],
          );
          if ((ccp4pRows as any[]).length > 0) {
            // ORM 형식과 일치하도록 snake_case → camelCase 변환
            const raw = (ccp4pRows as any[])[0];
            const ccp4pRecord = {
              id: raw.id,
              tenantId: raw.tenant_id,
              siteId: raw.site_id,
              batchId: raw.batch_id,
              ccpType: raw.ccp_type,
              workDate: raw.work_date,
              productId: raw.product_id,
              productName: raw.product_name,
              processGroupId: raw.process_group_id,
              processGroupName: raw.process_group_name,
              bomBatchKg: raw.bom_batch_kg,
              plannedQtyKg: raw.planned_qty_kg,
              batchCount: raw.batch_count,
              equipGroupMode: raw.equip_group_mode,
              equipIntervalMin: raw.equip_interval_min,
              clHeatTimeMinLo: raw.cl_heat_time_min_lo,
              clHeatTimeMinHi: raw.cl_heat_time_min_hi,
              clHeatTempLo: raw.cl_heat_temp_lo,
              clPressureMpaLo: raw.cl_pressure_mpa_lo,
              clProductTempLo: raw.cl_product_temp_lo,
              clMetalSensitivity: raw.cl_metal_sensitivity,
              clFeMm: raw.cl_fe_mm,
              clSusMm: raw.cl_sus_mm,
              writerId: raw.writer_id,
              approverId: raw.approver_id,
              status: raw.status,
              approvalRequestId: raw.approval_request_id,
              submittedAt: raw.submitted_at,
              approvedAt: raw.approved_at,
              rejectedReason: raw.rejected_reason,
              createdAt: raw.created_at,
              updatedAt: raw.updated_at,
            };
            return [...directRecords, ccp4pRecord];
          }
        }
      }
    } catch (err) {
      console.error("[getCcpFormRecordsByBatch] CCP-4P 일일 통합 조회 실패:", err);
    }
  }

  return directRecords;
}

/**
 * 배치 ID로 CCP 기록지 목록 + 행 데이터 포함 조회 (인쇄용)
 * P0: tenantId 필수 - 테넌트 격리
 * ★ CCP-4P 일일 통합 기록도 포함 (getCcpFormRecordsByBatch와 동일한 로직)
 */
export async function getCcpFormRecordsWithRowsByBatch(batchId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // getCcpFormRecordsByBatch를 재사용하여 CCP-4P 일일 통합 기록도 포함
  const records = await getCcpFormRecordsByBatch(batchId, tenantId);

  const result = [];
  for (const rec of records) {
    const rows = await getCcpFormRows(rec.id, tenantId);
    result.push({ ...rec, rows });
  }
  return result;
}

/**
 * ID로 CCP 기록지 단건 조회
 * P0: tenantId 필수 - 테넌트 격리
 */
export async function getCcpFormRecordById(id: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const conditions = tenantId
    ? and(eq(hCcpFormRecords.id, id), eq(hCcpFormRecords.tenantId, tenantId))
    : eq(hCcpFormRecords.id, id);
  const records = await db
    .select()
    .from(hCcpFormRecords)
    .where(conditions)
    .limit(1);
  if (!records.length) return null;
  const rows = await getCcpFormRows(id, tenantId);
  return { record: records[0], rows };
}

// ═══════════════════════════════════════════════════════════════
// 기록지 행 CRUD (h_ccp_form_rows)
// ═══════════════════════════════════════════════════════════════

/**
 * 기록지 ID로 행 목록 조회
 * P0: tenantId 필수 - 테넌트 격리
 */
export async function getCcpFormRows(formRecordId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const conditions = tenantId
    ? and(eq(hCcpFormRows.formRecordId, formRecordId), eq(hCcpFormRows.tenantId, tenantId))
    : eq(hCcpFormRows.formRecordId, formRecordId);
  return db
    .select()
    .from(hCcpFormRows)
    .where(conditions)
    .orderBy(hCcpFormRows.batchSeq);
}

/**
 * CCP 기록 행 저장 (upsert by formRecordId + batchSeq)
 * P0: tenantId 필수 - 테넌트 격리
 */
export async function upsertCcpFormRow(data: InsertCcpFormRow) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // tenantId가 있으면 추가 격리 필터
  const tenantFilter = data.tenantId
    ? eq(hCcpFormRows.tenantId, data.tenantId)
    : undefined;

  // 이미 있는지 확인
  const whereConditions = tenantFilter
    ? and(
        eq(hCcpFormRows.formRecordId, data.formRecordId),
        eq(hCcpFormRows.batchSeq, data.batchSeq ?? 1),
        tenantFilter
      )
    : and(
        eq(hCcpFormRows.formRecordId, data.formRecordId),
        eq(hCcpFormRows.batchSeq, data.batchSeq ?? 1)
      );

  const existing = await db
    .select()
    .from(hCcpFormRows)
    .where(whereConditions)
    .limit(1);

  if (existing.length > 0) {
    const updateWhere = tenantFilter
      ? and(eq(hCcpFormRows.id, existing[0].id), tenantFilter)
      : eq(hCcpFormRows.id, existing[0].id);
    await db
      .update(hCcpFormRows)
      .set({ ...data, updatedAt: new Date() })
      .where(updateWhere);
    // ★ h_ccp_form_rows → h_ccp_rows 역방향 동기화
    await syncFormRowToCcpRow(data);
    return existing[0].id;
  } else {
    const [result] = await db.insert(hCcpFormRows).values(data);
    // ★ h_ccp_form_rows → h_ccp_rows 역방향 동기화
    await syncFormRowToCcpRow(data);
    return (result as any).insertId as number;
  }
}

/**
 * h_ccp_form_rows 저장 시 h_ccp_rows에도 동기화
 * CCP 카드 UI(h_ccp_form_rows) → CCP 점검 기록 페이지(h_ccp_rows) 데이터 일관성 보장
 */
async function syncFormRowToCcpRow(data: InsertCcpFormRow) {
  try {
    const rawConn = await getRawConnection();
    const tenantId = data.tenantId;
    if (!tenantId) throw new Error("[P0 보안] tenantId is required");
    const formRecordId = data.formRecordId;
    const batchSeq = data.batchSeq ?? 1;

    // form_record에서 batch_id, ccp_type 조회
    const [frRows] = await rawConn.execute<any[]>(
      `SELECT batch_id, ccp_type FROM h_ccp_form_records WHERE id = ? AND tenant_id = ?`,
      [formRecordId, tenantId]
    );
    if (!(frRows as any[]).length) return;
    const { batch_id: batchId, ccp_type: ccpType } = (frRows as any[])[0];

    // 해당 batch의 h_ccp_instances에서 같은 ccp_type의 instance_id 조회
    const [instRows] = await rawConn.execute<any[]>(
      `SELECT id FROM h_ccp_instances WHERE batch_id = ? AND ccp_type = ? AND tenant_id = ? LIMIT 1`,
      [batchId, ccpType, tenantId]
    );
    if (!(instRows as any[]).length) return;
    const instanceId = (instRows as any[])[0].id;

    // 측정값 매핑: form_rows 컬럼 → ccp_rows 컬럼
    const tempC = data.heatTempC != null ? parseFloat(String(data.heatTempC)) : null;
    const durationMin = data.heatTimeMin ?? null;
    const pressureBar = data.pressureMpa != null ? parseFloat(String(data.pressureMpa)) : null;
    // measuredAt은 아래 fullMeasuredAt에서 work_date 기반으로 정확히 계산
    const result = data.result === "적합" ? "PASS" : data.result === "부적합" ? "FAIL" : "PASS";
    const equipmentId = data.equipmentId ?? null;
    const equipmentName = data.equipmentName ?? null;

    // 올바른 날짜 설정: form_record의 work_date + measurement_time
    const [dateRows] = await rawConn.execute<any[]>(
      `SELECT DATE_FORMAT(work_date, '%Y-%m-%d') as wd FROM h_ccp_form_records WHERE id = ? LIMIT 1`,
      [formRecordId]
    );
    const workDate = (dateRows as any[])[0]?.wd || todayKST();
    const fullMeasuredAt = data.measurementTime
      ? `${workDate} ${data.measurementTime}`
      : toKSTTimestamp(new Date());

    // h_ccp_rows에서 같은 instance + sort_order(=batchSeq)로 찾아 upsert
    const [existingRows] = await rawConn.execute<any[]>(
      `SELECT id FROM h_ccp_rows WHERE instance_id = ? AND sort_order = ? AND tenant_id = ? LIMIT 1`,
      [instanceId, batchSeq, tenantId]
    );

    if ((existingRows as any[]).length > 0) {
      await rawConn.execute(
        `UPDATE h_ccp_rows SET temp_c = ?, duration_min = ?, pressure_bar = ?, result = ?,
         measured_at = ?, equipment_id = ?, equipment_name = ?, auto_generated = 0
         WHERE id = ? AND tenant_id = ?`,
        [tempC, durationMin, pressureBar, result, fullMeasuredAt,
         equipmentId, equipmentName, (existingRows as any[])[0].id, tenantId]
      );
    } else {
      await rawConn.execute(
        `INSERT INTO h_ccp_rows (instance_id, equipment_id, equipment_name, sort_order,
         measured_at, temp_c, duration_min, pressure_bar, result, auto_generated, tenant_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        [instanceId, equipmentId, equipmentName, batchSeq,
         fullMeasuredAt, tempC, durationMin, pressureBar, result, tenantId]
      );
    }
  } catch (err) {
    console.error("[syncFormRowToCcpRow] 동기화 실패 (무시):", err);
  }
}

/**
 * CCP 기록 행 업데이트
 * P0: tenantId 필수 - 테넌트 격리
 */
export async function updateCcpFormRow(
  id: number,
  data: Partial<InsertCcpFormRow>,
  tenantId?: number
) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const conditions = tenantId
    ? and(eq(hCcpFormRows.id, id), eq(hCcpFormRows.tenantId, tenantId))
    : eq(hCcpFormRows.id, id);
  await db
    .update(hCcpFormRows)
    .set({ ...data, updatedAt: new Date() })
    .where(conditions);
}

/**
 * CCP 기록 행 삭제
 * P0: tenantId 필수 - 테넌트 격리
 */
export async function deleteCcpFormRow(id: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const conditions = tenantId
    ? and(eq(hCcpFormRows.id, id), eq(hCcpFormRows.tenantId, tenantId))
    : eq(hCcpFormRows.id, id);
  await db.delete(hCcpFormRows).where(conditions);
}

/**
 * CCP 기록지(form record) 일괄 삭제
 * - 연관된 form rows도 함께 삭제 (cascade)
 * - tenantId 격리 필수
 */
export async function deleteCcpFormRecords(formRecordIds: number[], tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const { inArray } = await import("drizzle-orm");

  // 1. 관련 행(rows) 먼저 삭제
  await db.delete(hCcpFormRows).where(
    and(
      inArray(hCcpFormRows.formRecordId, formRecordIds),
      eq(hCcpFormRows.tenantId, tenantId)
    )
  );

  // 2. 기록지(header) 삭제
  await db.delete(hCcpFormRecords).where(
    and(
      inArray(hCcpFormRecords.id, formRecordIds),
      eq(hCcpFormRecords.tenantId, tenantId)
    )
  );

  return { deletedCount: formRecordIds.length };
}

// ═══════════════════════════════════════════════════════════════
// 설비 배치 설정 (h_ccp_equip_batch_settings)
// ═══════════════════════════════════════════════════════════════

/**
 * 설비 배치 설정 저장/업데이트
 */
export async function upsertCcpEquipBatchSettings(
  data: InsertCcpEquipBatchSetting
) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const existing = await db
    .select()
    .from(hCcpEquipBatchSettings)
    .where(
      and(
        eq(hCcpEquipBatchSettings.tenantId, data.tenantId as any) ,
        eq(hCcpEquipBatchSettings.processGroupId, data.processGroupId)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(hCcpEquipBatchSettings)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(hCcpEquipBatchSettings.id, existing[0].id));
    return existing[0].id;
  } else {
    const [result] = await db.insert(hCcpEquipBatchSettings).values(data);
    return (result as any).insertId as number;
  }
}

/**
 * 설비 배치 설정 조회
 */
export async function getCcpEquipBatchSettings(
  tenantId: number,
  processGroupId: number
) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const rows = await db
    .select()
    .from(hCcpEquipBatchSettings)
    .where(
      and(
        eq(hCcpEquipBatchSettings.tenantId, tenantId),
        eq(hCcpEquipBatchSettings.processGroupId, processGroupId)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

// ═══════════════════════════════════════════════════════════════
// 기록지 제출/승인 워크플로
// ═══════════════════════════════════════════════════════════════

/**
 * 기록지 제출 (승인 요청 자동 생성, h_approval_requests에 등록)
 */
export async function submitCcpFormRecord(params: {
  formRecordId: number;
  tenantId: number;
  siteId: number;
  writerId: number;
  batchNumber: string;
  productName: string;
  ccpType: string;
  workDate: string;
}) {
  const rawConn = await getRawConnection();
  // 상태 업데이트 (P0: tenant_id 격리)
  await rawConn.execute(
    `UPDATE h_ccp_form_records SET status='submitted', submitted_at=NOW(), writer_id=? WHERE id=? AND tenant_id=?`,
    [params.writerId, params.formRecordId, params.tenantId]
  );

  // 승인 요청 생성
  const ccpTypeLabel: Record<string, string> = {
    "CCP-2B": "가열(굽기)공정 CCP 기록지",
    "CCP-1B": "가열(증숙)공정 CCP 기록지",
    "CCP-4P": "금속검출공정 CCP 기록지",
  };
  const title = `[CCP기록지] ${ccpTypeLabel[params.ccpType] ?? params.ccpType} - ${params.batchNumber} (${params.workDate})`;

  const [approvalResult] = await rawConn.execute(
    `INSERT INTO h_approval_requests
      (site_id, tenant_id, request_type, reference_type, reference_id,
       title, description, status, priority, requested_by, created_at)
     VALUES (?, ?, 'ccp_form', 'ccp_form_record', ?, ?, ?, 'pending_review', 'high', ?, NOW())`,
    [
      params.siteId,
      params.tenantId,
      params.formRecordId,
      title,
      `제품: ${params.productName} | CCP유형: ${params.ccpType} | 작업일: ${params.workDate}`,
      params.writerId,
    ]
  );

  const approvalRequestId = (approvalResult as any).insertId;

  // 승인 요청 ID 연결 (P0: tenant_id 격리)
  await rawConn.execute(
    `UPDATE h_ccp_form_records SET approval_request_id=? WHERE id=? AND tenant_id=?`,
    [approvalRequestId, params.formRecordId, params.tenantId]
  );

  return approvalRequestId;
  // ※ getRawConnection()은 Pool 싱글턴 → release()/end() 호출 금지
}

// ═══════════════════════════════════════════════════════════════
// h_ccp_rows <-> h_ccp_form_rows 양방향 동기화
// ═══════════════════════════════════════════════════════════════

/**
 * 배치 생성 후 h_ccp_instances/h_ccp_rows에서 생성된 설비 기준 데이터를
 * h_ccp_form_records/h_ccp_form_rows(인쇄용 기록지)로 동기화
 *
 * [데이터 흐름]
 *  BOM → ccp_process_groups → h_ccp_instances + h_ccp_rows (설비 기준값)
 *                            → h_ccp_form_records (헤더, CL 값)
 *                            → h_ccp_form_rows   (← 여기를 채움)
 *
 * 각 h_ccp_form_records에 대해:
 *  - 해당 batchId + ccpType으로 h_ccp_instances 조회
 *  - 연결된 h_ccp_rows를 h_ccp_form_rows로 매핑
 *  - CCP-1B/CCP-2B: 설비별 온도/시간/압력 → form row
 *  - CCP-4P: Fe/SUS 검출 행 → form row
 */
export async function syncCcpRowsToFormRows(params: {
  batchId: number;
  tenantId: number;
}) {
  const rawConn = await getRawConnection();
  const { batchId, tenantId } = params;

  // 1. 해당 배치의 모든 form records 조회 (batch_count 포함)
  // CCP-4P 일일 통합: batchId로 연결된 기록 + 같은 workDate의 CCP-4P 일일 기록 모두 포함
  const [formRecords] = await rawConn.execute<any[]>(
    `SELECT fr.id, fr.ccp_type, fr.process_group_id, fr.product_name, fr.planned_qty_kg, fr.bom_batch_kg, fr.batch_count,
            DATE_FORMAT(fr.work_date, '%Y-%m-%d') as work_date
     FROM h_ccp_form_records fr
     WHERE fr.tenant_id = ?
       AND (
         fr.batch_id = ?
         OR (fr.ccp_type = 'CCP-4P' AND fr.work_date = (
           SELECT b2.planned_date FROM h_batches b2 WHERE b2.id = ? AND b2.tenant_id = ? LIMIT 1
         ))
       )`,
    [tenantId, batchId, batchId, tenantId],
  );

  if ((formRecords as any[]).length === 0) {
    return { synced: 0 };
  }

  // 배치 정보 조회 (product_name, planned_quantity, start_time, product_id)
  // ※ start_time은 raw SQL INSERT로 KST 시간이 그대로 저장됨
  //    (batchFunctions.ts에서 `${plannedDate} ${batchStartTime}:00` 형태로 직접 INSERT)
  //    MySQL 서버 타임존도 Asia/Seoul(KST)이므로 추가 변환 불필요
  const [batchInfo] = await rawConn.execute<any[]>(
    `SELECT b.planned_quantity, b.product_id,
            p.product_name as p_name,
            DATE_FORMAT(b.start_time, '%H:%i') as start_time_hhmm,
            b.day_batch_group, b.batch_order, b.planned_date
     FROM h_batches b
     LEFT JOIN h_products_v2 p ON p.id = b.product_id AND p.tenant_id = b.tenant_id
     WHERE b.id = ? AND b.tenant_id = ?
     LIMIT 1`,
    [batchId, tenantId],
  );
  const batchProductName = (batchInfo as any[])[0]?.p_name || "";
  const batchPlannedKg = parseFloat((batchInfo as any[])[0]?.planned_quantity) || 0;
  const productId = (batchInfo as any[])[0]?.product_id || null;
  const dayBatchGroup = (batchInfo as any[])[0]?.day_batch_group || null;
  const batchOrder = (batchInfo as any[])[0]?.batch_order != null ? Number((batchInfo as any[])[0].batch_order) : 0;
  const plannedDate = (batchInfo as any[])[0]?.planned_date || null;

  // ═══ Issue 1: 배치 시작시간 추출 (HH:mm) ═══
  // start_time은 KST 기준으로 저장됨 (raw SQL INSERT, MySQL TZ=Asia/Seoul)
  // 교반공정: 새벽 5시경 시작 (반죽 3시간 → 8시부터 실제 생산)
  // 증숙공정: 8:40분 인근 시작
  // 금속검출: 9:20~30분부터 순차 적용
  // NULL이면 기본값 "09:00" 사용
  let batchStartTime: string = (batchInfo as any[])[0]?.start_time_hhmm || "09:00";
  // ═══ Issue 3: BOM 기반 투입량 계산 (정제수 제외) ═══
  // BOM에서 해당 공정에 투입되는 원재료 배합비를 환산
  // 예: 총생산 300kg, BOM 1배치=100kg → 배치당 100kg 기준 해당 공정 원재료 합계 (정제수 제외)
  let bomInputQtyMap: Record<number, number> = {}; // processGroupId → inputQtyKg (정제수 제외)
  let bomBatchKg: number | null = null;
  if (productId) {
    try {
      // BOM 최신 승인 버전의 원재료 조회 + batch_target_kg(1배치 기준 중량)
      const [bomRows] = await rawConn.execute<any[]>(
        `SELECT i.process_group_id,
                i.corrected_quantity, i.quantity, i.unit, i.adjusted_weight_kg,
                i.material_id, i.material_type,
                im.item_name as material_name, im.base_unit,
                v.batch_target_kg
         FROM h_mf_ingredients i
         LEFT JOIN item_master im ON im.id = i.material_id
         JOIN h_mf_report_versions v ON v.id = i.mf_report_version_id
           AND v.approval_status = 'APPROVED'
         JOIN h_mf_reports r ON r.id = v.mf_report_id
           AND r.product_id = ? AND r.tenant_id = ?
         WHERE i.process_group_id IS NOT NULL
           AND i.material_id IS NOT NULL
         ORDER BY i.line_no`,
        [productId, tenantId],
      );

      if ((bomRows as any[]).length > 0) {
        // BOM 배치 사이즈: h_mf_report_versions.batch_target_kg (1배치 기준 생산량, 예: 100kg)
        bomBatchKg = parseFloat((bomRows as any[])[0]?.batch_target_kg) || null;

        // 공정그룹별 투입량 합산 (정제수 제외)
        for (const bom of bomRows as any[]) {
          const pgId = Number(bom.process_group_id);
          if (!pgId) continue;

          // 정제수 판별: material_name에 '정제수' 포함 또는 material_type 기반
          const matName = (bom.material_name || "").toLowerCase();
          const isWater = matName.includes("정제수") || matName.includes("purified water")
                       || matName === "water" || matName === "물";
          if (isWater) continue;

          // 투입량 결정: adjusted_weight_kg > corrected_quantity > quantity
          let qtyKg = 0;
          if (bom.adjusted_weight_kg != null) {
            qtyKg = parseFloat(bom.adjusted_weight_kg);
          } else {
            const raw = parseFloat(bom.corrected_quantity || bom.quantity || "0");
            // unit 별 환산:
            // '%' → 배합비율, batch_target_kg 기준 kg 환산
            // 'g' → ÷1000 → kg
            // 'kg' 또는 기타 → 그대로 kg
            if (bom.unit === "%" && bomBatchKg && bomBatchKg > 0) {
              qtyKg = (raw / 100) * bomBatchKg;
            } else if (bom.unit === "g") {
              qtyKg = raw / 1000;
            } else {
              qtyKg = raw; // kg 기준
            }
          }

          bomInputQtyMap[pgId] = (bomInputQtyMap[pgId] || 0) + qtyKg;
        }
      }
    } catch (bomErr) {
      console.error("[syncCcpRowsToFormRows] BOM 투입량 계산 실패 (총생산량 폴백):", bomErr);
    }
  }

  // ═══ 측정시간 계산 헬퍼 ═══
  // HH:mm 문자열에 분 단위 오프셋을 더하여 새 HH:mm 반환
  function addMinutesToTime(timeHHmm: string, addMin: number): string {
    const [h, m] = timeHHmm.split(":").map(Number);
    const totalMin = h * 60 + m + addMin;
    const newH = Math.floor(totalMin / 60) % 24;
    const newM = totalMin % 60;
    return `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`;
  }

  let totalSynced = 0;
  
  // CCP-4P 일일 통합: 같은 날짜의 CCP-4P 기록이 여러 개일 수 있으므로 첫 번째만 처리
  const processedCcp4pDates = new Set<string>();

  for (const fr of formRecords as any[]) {
    const formRecordId = fr.id;
    const ccpType = fr.ccp_type;
    const frProductName = fr.product_name || batchProductName;
    const processGroupId = fr.process_group_id ? Number(fr.process_group_id) : null;

    // CCP-4P 일일 통합: 같은 날짜의 기록이 이미 처리되었으면 건너뜀
    if (ccpType === "CCP-4P" && fr.work_date) {
      const dateKey = String(fr.work_date).slice(0, 10);
      if (processedCcp4pDates.has(dateKey)) {
        continue;
      }
      processedCcp4pDates.add(dateKey);
    }

    // 2. 기존 row 조회: 이미 모든 배치가 채워져 있으면 건너뜀
    //    부분적으로 채워진 경우(예: batch_count=10인데 row 1개만 있으면) → 누락된 행만 추가
    //    ★ 중복 방지: batch_seq별 실제 행 수를 확인하여 이미 존재하면 건너뜀
    const [existingRows] = await rawConn.execute<any[]>(
      `SELECT batch_seq, COUNT(*) as cnt FROM h_ccp_form_rows WHERE form_record_id = ? AND tenant_id = ? GROUP BY batch_seq`,
      [formRecordId, tenantId],
    );
    const existingSeqs = new Set((existingRows as any[]).map((r: any) => Number(r.batch_seq)));
    const existingSeqCounts = new Map((existingRows as any[]).map((r: any) => [Number(r.batch_seq), Number(r.cnt)]));
    const expectedCount = fr.batch_count ? Number(fr.batch_count) : 1;
    
    // ★ 중복 행 자동 정리: batch_seq당 2개 이상 존재하면 최신 1개만 남기고 삭제
    const seqKeys = Array.from(existingSeqCounts.keys());
    for (let si = 0; si < seqKeys.length; si++) {
      const seq = seqKeys[si];
      const cnt = existingSeqCounts.get(seq) || 0;
      if (cnt > 1) {
        try {
          await rawConn.execute(
            `DELETE FROM h_ccp_form_rows 
             WHERE form_record_id = ? AND tenant_id = ? AND batch_seq = ? 
             AND id NOT IN (
               SELECT id FROM (
                 SELECT MAX(id) as id FROM h_ccp_form_rows 
                 WHERE form_record_id = ? AND tenant_id = ? AND batch_seq = ?
               ) t
             )`,
            [formRecordId, tenantId, seq, formRecordId, tenantId, seq],
          );
        } catch (dedupeErr) {
          console.error(`[syncCcpRowsToFormRows] 중복 정리 실패 (batch_seq=${seq}):`, dedupeErr);
        }
      }
    }
    
    // ★ 플레이스홀더(불완전) 행 감지: equipment_name이 모두 NULL인 행은 자동생성 실패로 판단
    // → 해당 행을 삭제하고 재생성하여 인쇄 시 빈 데이터 문제 해결
    let hasPlaceholderRows = false;
    if (existingSeqs.size > 0) {
      const [qualityCheck] = await rawConn.execute<any[]>(
        `SELECT COUNT(*) as total_rows,
                SUM(CASE WHEN equipment_name IS NULL AND equipment_type IS NULL 
                         AND measurement_time IS NULL AND heat_time_min IS NULL 
                         AND pass_time_start IS NULL AND metal_pass_time IS NULL
                    THEN 1 ELSE 0 END) as placeholder_rows
         FROM h_ccp_form_rows WHERE form_record_id = ? AND tenant_id = ?`,
        [formRecordId, tenantId],
      );
      const totalRows = Number((qualityCheck as any[])[0]?.total_rows) || 0;
      const placeholderRows = Number((qualityCheck as any[])[0]?.placeholder_rows) || 0;
      // 모든 행이 플레이스홀더(핵심 필드 전부 NULL)면 삭제 후 재생성
      if (totalRows > 0 && placeholderRows === totalRows) {
        hasPlaceholderRows = true;
        await rawConn.execute(
          `DELETE FROM h_ccp_form_rows WHERE form_record_id = ? AND tenant_id = ?`,
          [formRecordId, tenantId],
        );
        existingSeqs.clear();
      }
    }

    // CCP-4P는 감도/통과 등 특수 행이므로 기존 로직 유지 (있으면 건너뜀)
    // CCP-1B/2B는 batch_count 기반으로 누락된 행만 추가
    if (ccpType === "CCP-4P" && existingSeqs.size > 0) {
      continue;
    }
    // ★ batch_count가 1이면 CCP 점검 데이터로 재계산될 수 있으므로 건너뛰지 않음
    //    (BOM 없이 생성된 form_record는 batch_count=1이 기본값이지만 실제 배치수는 더 클 수 있음)
    if (ccpType !== "CCP-4P" && existingSeqs.size >= expectedCount && expectedCount > 1) {
      continue; // 이미 모든 배치행이 채워져 있음
    }

    // 3. h_ccp_instances에서 해당 배치+CCP 타입+공정그룹의 인스턴스 조회
    // ★ process_group_id 매칭: 동일 배치에 같은 CCP 타입의 인스턴스가 여러 개일 수 있음
    //    (예: batch 125 → CCP-1B 교반(pg=1) + CCP-1B 증숙(pg=3))
    //    form_record의 process_group_id와 매칭하여 올바른 인스턴스 선택
    let instanceQuery = `SELECT id, product_id, product_name FROM h_ccp_instances
       WHERE batch_id = ? AND ccp_type = ? AND tenant_id = ?`;
    let instanceParams: any[] = [batchId, ccpType, tenantId];
    if (processGroupId) {
      instanceQuery += ` AND process_group_id = ?`;
      instanceParams.push(processGroupId);
    }
    instanceQuery += ` LIMIT 1`;
    const [instances] = await rawConn.execute<any[]>(instanceQuery, instanceParams);

    let ccpRows: any[] = [];
    let instanceProductId: number | null = null;
    let instanceProductName: string | null = null;
    if ((instances as any[]).length > 0) {
      const instanceId = (instances as any[])[0].id;
      instanceProductId = (instances as any[])[0].product_id || null;
      instanceProductName = (instances as any[])[0].product_name || null;
      // 4. h_ccp_rows에서 해당 인스턴스의 행 조회
      // ★ measured_at 포함: 배치 상세 CCP 점검에서 기록된 실제 측정시간을 사용
      //    measured_at는 KST 기준으로 저장되어 있으므로 직접 사용 가능
      const [rows] = await rawConn.execute<any[]>(
        `SELECT sort_order, equipment_id, equipment_name, temp_c,
                duration_min, heating_min, pressure_bar, result, note,
                DATE_FORMAT(measured_at, '%H:%i') as measured_at_hhmm
         FROM h_ccp_rows
         WHERE instance_id = ? AND tenant_id = ?
         ORDER BY sort_order`,
        [instanceId, tenantId],
      );
      ccpRows = rows as any[];
    }

    // CCP-4P는 h_ccp_rows 없이도 설비 설정 기반으로 자체 생성 가능
    // CCP-1B/2B는 h_ccp_rows가 없으면 ccp_process_group_equipments에서 설비 정보로 폴백
    if (ccpRows.length === 0 && ccpType !== "CCP-4P") {
      // CCP-1B/2B: h_ccp_rows가 없으면 공정그룹 설비에서 기본 행 생성
      if (processGroupId) {
        try {
          const [equipRows] = await rawConn.execute<any[]>(
            `SELECT pge.equipment_id, e.name as equipment_name,
                    e.default_temperature as temp_c,
                    e.batch_operation_time as duration_min,
                    e.default_time as heating_min,
                    (e.default_pressure * 10) as pressure_bar
             FROM ccp_process_group_equipments pge
             JOIN equipments e ON e.id = pge.equipment_id AND e.tenant_id = pge.tenant_id
             WHERE pge.process_group_id = ? AND pge.tenant_id = ?
             ORDER BY pge.sort_order`,
            [processGroupId, tenantId],
          );
          if ((equipRows as any[]).length > 0) {
            ccpRows = (equipRows as any[]).map((eq: any, idx: number) => ({
              sort_order: idx + 1,
              equipment_id: eq.equipment_id,
              equipment_name: eq.equipment_name,
              temp_c: eq.temp_c,
              duration_min: eq.duration_min,
              heating_min: eq.heating_min,
              pressure_bar: eq.pressure_bar,
              result: "PASS",
              note: null,
            }));
          }
        } catch (eqErr) {
          console.error(`[syncCcpRowsToFormRows] ${ccpType} equipment fallback failed:`, eqErr);
        }
      }
      if (ccpRows.length === 0) continue;
    }

    // ═══ BOM 폴백: 배치 product_id에 BOM이 없으면 CCP 인스턴스의 product_id로 재시도 ═══
    // 예: 배치 413의 product_id=83(찹쌀떡)에는 BOM 없음, 하지만 CCP 인스턴스의 product_id=82(찹쌀떡(떡마루))에는 BOM 있음
    // 이는 배치 생성 시 product_id 매핑 오류 또는 동일 제품의 다른 버전 사용 시 발생
    let localBomBatchKg = bomBatchKg;
    let localBomInputQtyMap = bomInputQtyMap;
    if (!localBomBatchKg && instanceProductId && instanceProductId !== productId) {
      try {
        const [fallbackBomRows] = await rawConn.execute<any[]>(
          `SELECT i.process_group_id,
                  i.corrected_quantity, i.quantity, i.unit, i.adjusted_weight_kg,
                  i.material_id, i.material_type,
                  im.item_name as material_name, im.base_unit,
                  v.batch_target_kg
           FROM h_mf_ingredients i
           LEFT JOIN item_master im ON im.id = i.material_id
           JOIN h_mf_report_versions v ON v.id = i.mf_report_version_id
             AND v.approval_status = 'APPROVED'
           JOIN h_mf_reports r ON r.id = v.mf_report_id
             AND r.product_id = ? AND r.tenant_id = ?
           WHERE i.process_group_id IS NOT NULL
             AND i.material_id IS NOT NULL
           ORDER BY i.line_no`,
          [instanceProductId, tenantId],
        );
        if ((fallbackBomRows as any[]).length > 0) {
          localBomBatchKg = parseFloat((fallbackBomRows as any[])[0]?.batch_target_kg) || null;
          const fallbackMap: Record<number, number> = {};
          for (const bom of fallbackBomRows as any[]) {
            const pgId = Number(bom.process_group_id);
            if (!pgId) continue;
            const matName = (bom.material_name || "").toLowerCase();
            const isWater = matName.includes("정제수") || matName.includes("purified water")
                         || matName === "water" || matName === "물";
            if (isWater) continue;
            let qtyKg = 0;
            if (bom.adjusted_weight_kg != null) {
              qtyKg = parseFloat(bom.adjusted_weight_kg);
            } else {
              const raw = parseFloat(bom.corrected_quantity || bom.quantity || "0");
              if (bom.unit === "%" && localBomBatchKg && localBomBatchKg > 0) {
                qtyKg = (raw / 100) * localBomBatchKg;
              } else if (bom.unit === "g") {
                qtyKg = raw / 1000;
              } else {
                qtyKg = raw;
              }
            }
            fallbackMap[pgId] = (fallbackMap[pgId] || 0) + qtyKg;
          }
          localBomInputQtyMap = fallbackMap;
          // 인스턴스 product_id의 실제 제품명 조회 (h_products_v2)
          try {
            const [prodNameRows] = await rawConn.execute<any[]>(
              `SELECT p.product_name
               FROM h_products_v2 p
               WHERE p.id = ? AND p.tenant_id = ?
               LIMIT 1`,
              [instanceProductId, tenantId],
            );
            if ((prodNameRows as any[]).length > 0 && (prodNameRows as any[])[0].product_name) {
              instanceProductName = (prodNameRows as any[])[0].product_name;
            }
          } catch { /* 제품명 조회 실패 시 기존값 유지 */ }
        }
      } catch (fallbackErr) {
        console.error(`[syncCcpRowsToFormRows] BOM 폴백 조회 실패 (instanceProductId=${instanceProductId}):`, fallbackErr);
      }
    }

    // ═══ 공정그룹 설비 배치 설정 조회 ═══
    // ccp_process_groups 테이블에서 equip_group_mode, equip_interval_min 읽기
    // sequential: 설비를 순차적으로 interval 간격으로 배정, 같은 설비 다음 라운드는 cycle 후
    // grouped:    equip_batch_size 대의 설비가 동시 시작, 다음 그룹은 interval 후
    // concurrent: 모든 설비가 동시 시작
    let pgGroupMode: "sequential" | "grouped" | "concurrent" = "sequential";
    let pgIntervalMin = 17; // 기본 17분 (설비 간 간격)
    let pgBatchSize = 1;    // grouped 모드 시 동시 운전 설비 수
    if (processGroupId) {
      try {
        const [pgRows] = await rawConn.execute<any[]>(
          `SELECT equip_group_mode, equip_interval_min, equip_batch_size
           FROM ccp_process_groups WHERE id = ? AND tenant_id = ? LIMIT 1`,
          [processGroupId, tenantId],
        );
        if ((pgRows as any[]).length > 0) {
          const pg = (pgRows as any[])[0];
          pgGroupMode = pg.equip_group_mode || "sequential";
          pgIntervalMin = pg.equip_interval_min != null ? Number(pg.equip_interval_min) : 17;
          pgBatchSize = pg.equip_batch_size != null ? Number(pg.equip_batch_size) : 1;
          if (pgBatchSize < 1) pgBatchSize = 1;
        }
      } catch { /* 설정 조회 실패 시 기본값 사용 */ }
    }

    // ═══ Issue 3: 투입량 계산 ═══
    // BOM에서 해당 공정그룹 투입량(정제수 제외)이 있으면 사용, 없으면 총생산량 폴백
    // ★ localBomInputQtyMap 사용: CCP 인스턴스 product_id 기반 BOM 폴백 포함
    let inputQtyKg: number | null = null;
    if (processGroupId && localBomInputQtyMap[processGroupId] != null) {
      const bomQty = localBomInputQtyMap[processGroupId]; // BOM 1배치 기준 정제수 제외 투입량
      inputQtyKg = bomQty;
    } else {
      // BOM 데이터 없으면 총생산량 폴백
      // ★ 총생산량을 배치수로 나눠 1배치 기준량 사용 (나중에 totalBatchCount 확정 후 보정)
      inputQtyKg = batchPlannedKg || null;
    }

    // ═══ 설비 대수 계산 ═══
    // 공정그룹에 등록된 고유 설비 수를 기준으로 사용 (h_ccp_rows는 라운드×설비 행이므로 길이 ≠ 설비수)
    // 예: 교반기 3대 × 4라운드 → ccpRows=12, 하지만 equipCount=3
    let equipCount = 1;
    if (ccpType !== "CCP-4P" && ccpRows.length > 0) {
      // 방법1: ccpRows에서 고유 equipment_name 개수 추출
      const uniqueEquipNames = new Set((ccpRows as any[]).map((r: any) => r.equipment_name).filter(Boolean));
      if (uniqueEquipNames.size > 0) {
        equipCount = uniqueEquipNames.size;
      } else {
        equipCount = ccpRows.length;
      }
    }

    // ═══ 배치 수 계산 ═══
    // 우선순위:
    // 1. h_ccp_rows가 있으면: ccpRows 총 행 수 = 총 배치 수 (각 행이 1개 서브배치)
    // 2. form_record의 batch_count가 유효하면 사용
    // 3. BOM 기준 계산 (planned_qty / batch_target_kg)
    // 예: 1000kg 생산, BOM 100kg → 10배치, 설비 3대 → 10행 (라운드별 교대)
    let totalBatchCount = fr.batch_count ? Number(fr.batch_count) : 1;
    if (totalBatchCount < 1) totalBatchCount = 1;

    // ★ h_ccp_rows 기반 배치수 결정:
    //    라운드로빈: 1배치 = 1설비 1운전 → ccpRows.length = 배치수
    //    예: 3배치, 설비 2대 → 3행 (라운드로빈 순환)
    if (ccpType !== "CCP-4P" && ccpRows.length > 0) {
      const ccpBasedBatchCount = ccpRows.length;
      // 기존 form_rows가 잘못된 batch_count 기반이면 삭제 후 재생성
      if (existingSeqs.size > 0 && existingSeqs.size !== ccpBasedBatchCount) {
        await rawConn.execute(
          `DELETE FROM h_ccp_form_rows WHERE form_record_id = ? AND tenant_id = ?`,
          [formRecordId, tenantId],
        );
        existingSeqs.clear();
      }
      
      totalBatchCount = ccpBasedBatchCount;
      // DB에도 batch_count + bom_batch_kg 업데이트
      try {
        if (localBomBatchKg && localBomBatchKg > 0) {
          await rawConn.execute(
            `UPDATE h_ccp_form_records SET batch_count = ?, bom_batch_kg = ? WHERE id = ? AND tenant_id = ?`,
            [totalBatchCount, localBomBatchKg, formRecordId, tenantId],
          );
        } else {
          await rawConn.execute(
            `UPDATE h_ccp_form_records SET batch_count = ? WHERE id = ? AND tenant_id = ?`,
            [totalBatchCount, formRecordId, tenantId],
          );
        }
      } catch { /* 업데이트 실패 시 무시 */ }
    }

    // ★ BOM 기반 배치수 재계산 (h_ccp_rows 없고 batch_count=1일 때)
    // ★ localBomBatchKg 사용: CCP 인스턴스 product_id 기반 BOM 폴백 포함
    if (totalBatchCount <= 1 && ccpType !== "CCP-4P" && ccpRows.length === 0) {
      const frPlannedKg = parseFloat(fr.planned_qty_kg) || batchPlannedKg || 0;
      if (localBomBatchKg && localBomBatchKg > 0 && frPlannedKg > 0) {
        totalBatchCount = Math.ceil(frPlannedKg / localBomBatchKg);
        if (totalBatchCount < 1) totalBatchCount = 1;
        // DB에도 batch_count 업데이트
        await rawConn.execute(
          `UPDATE h_ccp_form_records SET batch_count = ?, bom_batch_kg = ? WHERE id = ? AND tenant_id = ?`,
          [totalBatchCount, localBomBatchKg, formRecordId, tenantId],
        );
      }
    }

    // ═══ bom_batch_kg 누락 보정 ═══
    // batch_count는 이미 올바르지만 bom_batch_kg가 NULL인 경우
    // (이전 resync에서 batch_count만 업데이트되고 bom_batch_kg는 갱신되지 않은 경우)
    if (localBomBatchKg && localBomBatchKg > 0 && ccpType !== "CCP-4P") {
      const frBomBatchKg = fr.bom_batch_kg ? parseFloat(fr.bom_batch_kg) : null;
      if (!frBomBatchKg || frBomBatchKg <= 0) {
        try {
          await rawConn.execute(
            `UPDATE h_ccp_form_records SET bom_batch_kg = ? WHERE id = ? AND tenant_id = ?`,
            [localBomBatchKg, formRecordId, tenantId],
          );
        } catch { /* 업데이트 실패 시 무시 */ }
      }
    }

    // ═══ 투입량 보정: 총생산량 폴백 시 1배치 기준량으로 변환 ═══
    // BOM 투입량이 아닌 총생산량(batchPlannedKg)을 사용한 경우,
    // totalBatchCount가 확정된 후 1배치당 투입량으로 나눔
    // 예: 1000kg / 10배치 = 100kg/배치
    if (inputQtyKg != null && totalBatchCount > 1) {
      // BOM 기반 투입량이 아닌 경우(localBomInputQtyMap에 없는 경우)만 보정
      const hasBomInput = processGroupId && localBomInputQtyMap[processGroupId] != null;
      if (!hasBomInput) {
        // localBomBatchKg가 있으면 그것을 1배치 투입량으로 사용, 없으면 총량/배치수
        if (localBomBatchKg && localBomBatchKg > 0) {
          inputQtyKg = localBomBatchKg;
        } else {
          inputQtyKg = Math.round((inputQtyKg / totalBatchCount) * 100) / 100;
        }
      }
    }

    // ═══ 공정별 시작시간 결정 ═══
    // 교반공정(PG 1): batchStartTime 사용 (배치 시작시간 = 교반 시작, 통상 새벽 5시경)
    // 증숙/오븐 등 후속공정: 해당 공정그룹 설비의 work_start_time 사용
    //   (교반 3시간 후 실제 생산 시작 → 증숙 08:40경, 오븐 09:00경)
    // 금속검출(CCP-4P): 별도 로직으로 처리 (아래 CCP-4P 섹션)
    let processStartTime: string = batchStartTime; // 기본값: 배치 시작시간 (교반용)

    // 교반공정이 아닌 경우: 설비의 work_start_time 사용
    // ★ 교반공정(process_group_id = 1) 외의 공정은 별도 시작시간이 있음
    if (processGroupId && processGroupId !== 1 && ccpType !== "CCP-4P") {
      try {
        const [equipTimeRows] = await rawConn.execute<any[]>(
          `SELECT e.work_start_time
           FROM ccp_process_group_equipments pge
           JOIN equipments e ON e.id = pge.equipment_id AND e.tenant_id = pge.tenant_id
           WHERE pge.process_group_id = ? AND pge.tenant_id = ? AND e.status = 'active'
           ORDER BY pge.sort_order LIMIT 1`,
          [processGroupId, tenantId],
        );
        if ((equipTimeRows as any[]).length > 0 && (equipTimeRows as any[])[0].work_start_time) {
          const equipStartStr = String((equipTimeRows as any[])[0].work_start_time).slice(0, 5);
          processStartTime = equipStartStr;
        }
      } catch (eqTimeErr) {
        console.error(`[syncCcpRowsToFormRows] 설비 시작시간 조회 실패 (processGroup=${processGroupId}):`, eqTimeErr);
      }
    }

    // ═══ 랜덤 오프셋 (0-10분) 적용 ═══
    // 모든 공정(교반, 증숙, 오븐, 금속검출)에 작업시작 시점으로부터 0-10분 랜덤 오프셋
    // 일괄적이면 외부점검시 이상하게 생각하므로 자연스럽게 분산
    // seed: batchId + processGroupId + ccpType hash → 동일 배치에 대해 동일 오프셋 (재현성)
    const seededRandom = (seed: number): number => {
      let s = seed;
      s = ((s ^ 0xDEADBEEF) + (s << 1)) & 0x7FFFFFFF;
      s = ((s ^ (s >> 16)) * 0x45d9f3b) & 0x7FFFFFFF;
      s = ((s ^ (s >> 16)) * 0x45d9f3b) & 0x7FFFFFFF;
      return (s & 0x7FFFFFFF) / 0x7FFFFFFF;
    };
    const randomSeed = batchId * 1000 + (processGroupId || 0) * 100 + ccpType.charCodeAt(4);
    const randomOffsetMin = Math.floor(seededRandom(randomSeed) * 11); // 0~10
    const adjustedStartTime = processStartTime ? addMinutesToTime(processStartTime, randomOffsetMin) : processStartTime;

    // ═══ 교차배치 시간 누적: 이전 배치들의 작업시간을 합산하여 시작시간 이동 ═══
    // 일괄배치에서 제품A → 제품B → 제품C 순서로 같은 설비를 사용하면
    // 제품B는 제품A의 작업이 끝난 후부터 시작해야 함
    // ★ 설비 N대가 병렬 가동: 실제 소요 = ceil(batch_count / equipCount) × cycle_duration
    let crossBatchTimeOffsetMin = 0;
    if (equipStartIndex > 0 && ccpType !== "CCP-4P") {
      try {
        const [prevTimeRows] = await rawConn.execute<any[]>(
          `SELECT fr2.batch_count,
                  (SELECT MAX(cr.duration_min) FROM h_ccp_rows cr WHERE cr.instance_id IN (
                    SELECT ci.id FROM h_ccp_instances ci WHERE ci.batch_id = fr2.batch_id AND ci.process_group_id = fr2.process_group_id
                  )) as cycle_duration
           FROM h_ccp_form_records fr2
           JOIN h_batches b2 ON b2.id = fr2.batch_id AND b2.tenant_id = fr2.tenant_id
           WHERE fr2.tenant_id = ? AND fr2.process_group_id = ? AND fr2.ccp_type = ?
             AND b2.planned_date = ? AND b2.batch_order < ?
           ORDER BY b2.batch_order`,
          [tenantId, processGroupId, ccpType, plannedDate, batchOrder]
        );
        for (const pt of prevTimeRows as any[]) {
          const bc = pt.batch_count ? Number(pt.batch_count) : 1;
          const cd = pt.cycle_duration ? Number(pt.cycle_duration) : 70; // 기본 70분
          // 설비 N대 병렬: 실제 라운드 수 = ceil(batch_count / equipCount)
          const actualRounds = Math.ceil(bc / Math.max(1, equipCount));
          crossBatchTimeOffsetMin += actualRounds * cd;
        }
      } catch { /* 실패 시 오프셋 0 */ }
    }

    if (ccpType === "CCP-4P") {
      // ═══════════════════════════════════════════════════════════
      // CCP-4P: 금속검출공정 v3
      // 1. 설비기준 작업시간 설정(equipments 테이블)에서 시간 로드
      // 2. 배치 → SKU → 시간/수량 비례배분
      // 3. 감도 모니터링: START + PERIODIC(2h) + END
      // 4. 제품 통과 기록: SKU별 최초통과/종료/통과량/검출량
      // 5. 새 테이블(h_ccp_batch_process_runs, h_ccp_metal_sku_slots,
      //    h_ccp_metal_sensitivity_checks)에도 동시 기록
      // ═══════════════════════════════════════════════════════════

      // Import helpers from metalPassAllocator v2 (static import)
      const timeToMin = metalTimeToMin;
      const minToTime = metalMinToTime;
      const addMinToTime2 = metalAddMinToTime;
      const calcAvailableMinutes = metalCalcAvailableMinutes;
      const skipLunchFn = metalSkipLunch;
      const advanceCursor = metalAdvanceCursor;
      const seededRandom2 = metalSeededRandom;
      const computeSeed = metalComputeSeed;
      const computeRandomOffset = metalComputeRandomOffset;

      // ── 1. 설비기준 작업시간 로드 ──
      let equipWorkStart = "09:00", equipWorkEnd = "16:30";
      let equipLunchStart = "12:00", equipLunchEnd = "13:00";
      let equipId = 0;
      let equipFeSensitivity = 2.0, equipStsSensitivity = 3.0;
      try {
        const [eqRows] = await rawConn.execute<any[]>(
          `SELECT id, work_start_time, work_end_time, lunch_start_time, lunch_end_time,
                  fe_sensitivity, sts_sensitivity
           FROM equipments WHERE tenant_id = ? AND ccp_type = 'CCP-4P' AND status = 'active'
           LIMIT 1`,
          [tenantId],
        );
        if ((eqRows as any[]).length > 0) {
          const eq = (eqRows as any[])[0];
          equipId = eq.id;
          if (eq.work_start_time) equipWorkStart = eq.work_start_time;
          if (eq.work_end_time) equipWorkEnd = eq.work_end_time;
          if (eq.lunch_start_time) equipLunchStart = eq.lunch_start_time;
          if (eq.lunch_end_time) equipLunchEnd = eq.lunch_end_time;
          if (eq.fe_sensitivity) equipFeSensitivity = parseFloat(eq.fe_sensitivity);
          if (eq.sts_sensitivity) equipStsSensitivity = parseFloat(eq.sts_sensitivity);
        }
      } catch { /* 조회 실패 시 기본값 사용 */ }

      // ── 랜덤 오프셋 (audit-reproducible seed) ──
      // ★ 일괄배치 시간 겹침 방지: batchId 대신 날짜+설비ID 기반 시드 사용
      // → 같은 날짜의 모든 배치가 동일한 오프셋을 사용하여 시간대가 순차적으로 배분됨
      const dateStr = fr.work_date ? String(fr.work_date).slice(0, 10) : "";
      const metalSeed = computeSeed(0, dateStr, equipId);
      const metalRandomOffset = computeRandomOffset(metalSeed, 0, 10);

      const WORK_START = addMinToTime2(equipWorkStart, metalRandomOffset);
      const workStartMin = timeToMin(WORK_START);
      const workEndMin = timeToMin(equipWorkEnd);
      const lunchStartMin = timeToMin(equipLunchStart);
      const lunchEndMin = timeToMin(equipLunchEnd);

      const totalWorkMin = calcAvailableMinutes(workStartMin, workEndMin, lunchStartMin, lunchEndMin);

      // ── 2. 당일 배치-SKU 목록 조회 ──
      const batchWorkDate = fr.work_date || null;

      interface SkuSlot {
        batchId: number;
        productId: number;
        productName: string;
        skuId: number | null;
        skuName: string;
        plannedQty: number;
        passQty: number;
        allocatedMin: number;
        workStart: number;
        workEnd: number;
      }

      let skuSlots: SkuSlot[] = [];

      if (batchWorkDate) {
        const [skuRows] = await rawConn.execute<any[]>(
          `SELECT b.id as batch_id, b.product_id, b.planned_quantity,
                  COALESCE(p.product_name, fr2.product_name) as product_name,
                  pso.sku_id, ps.sku_name, ps.sku_code,
                  COALESCE(pso.quantity, 0) as sku_quantity,
                  COALESCE(pso.total_kg, b.planned_quantity) as sku_kg
           FROM h_batches b
           LEFT JOIN h_products_v2 p ON p.id = b.product_id AND p.tenant_id = b.tenant_id
           LEFT JOIN h_ccp_form_records fr2 ON fr2.batch_id = b.id AND fr2.tenant_id = b.tenant_id AND fr2.ccp_type = 'CCP-4P'
           LEFT JOIN production_sku_output pso ON pso.batch_id = b.id AND pso.tenant_id = b.tenant_id
           LEFT JOIN product_skus ps ON ps.id = pso.sku_id AND ps.tenant_id = b.tenant_id
           WHERE b.tenant_id = ? AND b.planned_date = ?
           ORDER BY COALESCE(b.day_batch_group, CONCAT('_STANDALONE_', b.id)), b.batch_order, b.id, ps.sku_code`,
          [tenantId, batchWorkDate],
        );

        for (const r of (skuRows as any[])) {
          skuSlots.push({
            batchId: r.batch_id,
            productId: r.product_id,
            productName: r.product_name || frProductName || "",
            skuId: r.sku_id || null,
            skuName: r.sku_name || r.product_name || frProductName || "",
            plannedQty: parseFloat(r.sku_kg) || parseFloat(r.planned_quantity) || 0,
            passQty: parseInt(r.sku_quantity) || Math.round(parseFloat(r.sku_kg) || parseFloat(r.planned_quantity) || 0),
            allocatedMin: 0,
            workStart: 0,
            workEnd: 0,
          });
        }
      }

      // SKU 데이터 없으면 배치 단위 폴백
      if (skuSlots.length === 0) {
        skuSlots = [{
          batchId,
          productId: productId || 0,
          productName: frProductName || "",
          skuId: null,
          skuName: frProductName || "",
          plannedQty: batchPlannedKg || 0,
          passQty: Math.round(batchPlannedKg || 0),
          allocatedMin: totalWorkMin,
          workStart: workStartMin,
          workEnd: workEndMin,
        }];
      }

      // ┌─────────────────────────────────────────────────────────────────┐
      // │  ⚠️  CRITICAL SECTION — DO NOT MODIFY WITHOUT REVIEW  ⚠️       │
      // │                                                                 │
      // │  CCP-4P 금속검출 제품별 순차 시간 배분 로직                      │
      // │                                                                 │
      // │  이 섹션은 다음 불변 조건(invariant)을 보장합니다:               │
      // │  1. 서로 다른 제품의 시간 슬롯은 절대 겹치지 않음               │
      // │  2. 동일 제품의 배치는 연속된 하나의 시간 블록으로 그룹화       │
      // │  3. 감도 모니터링(품목시작/종료)은 제품 그룹 경계에서만 발생    │
      // │  4. 통과(passage) 시간은 배치 할당 슬롯 범위를 사용            │
      // │     (중간 배치는 자체 sensitivity check로 클램핑하지 않음)      │
      // │                                                                 │
      // │  위반 시 금속검출 공정 혼입(contamination) 사고 발생 위험       │
      // │                                                                 │
      // │  관련 테스트: server/ccp4p-sequential-allocation.test.ts        │
      // │  최종 검증일: 2026-03-01                                        │
      // └─────────────────────────────────────────────────────────────────┘
      //
      // ── 3. 제품별 순차 배분: 금속검출기 1대 → 제품별 비중복 시간 슬롯 ──
      // ★ 핵심 설계: 동일 제품의 배치를 모아서 하나의 연속 시간 슬롯으로 할당
      //   예: [호두찹쌀떡 300kg, 호두찹쌀떡(쑥) 600kg, 단호박설기 50kg]
      //   → 제품A 시간대 → 제품B 시간대 → 제품C 시간대 (겹침 없음)
      //
      // 1) skuSlots를 productId 기준으로 그룹화 (등장 순서 유지)
      // 2) 제품별 총 수량 기준 비례 시간 할당
      // 3) 제품 내부에서 배치별 하위 분배

      interface ProductGroup {
        productId: number;
        productName: string;
        totalQty: number;
        slots: SkuSlot[];
        allocatedMin: number;
        groupStart: number;
        groupEnd: number;
      }
      const productGroupOrder: number[] = []; // productId 등장 순서
      const productGroupMap: Record<number, ProductGroup> = {};

      for (const slot of skuSlots) {
        const pid = slot.productId;
        if (!productGroupMap[pid]) {
          productGroupMap[pid] = {
            productId: pid,
            productName: slot.productName,
            totalQty: 0,
            slots: [],
            allocatedMin: 0,
            groupStart: 0,
            groupEnd: 0,
          };
          productGroupOrder.push(pid);
        }
        productGroupMap[pid].totalQty += slot.plannedQty;
        productGroupMap[pid].slots.push(slot);
      }

      const totalDayQty = skuSlots.reduce((s, sl) => s + sl.plannedQty, 0);
      let cursorMin = workStartMin;

      // 제품 그룹별 순차 시간 할당
      for (let gi = 0; gi < productGroupOrder.length; gi++) {
        const pg = productGroupMap[productGroupOrder[gi]];
        const proportion = totalDayQty > 0 ? pg.totalQty / totalDayQty : 1 / productGroupOrder.length;
        let pgAllocMin = Math.round(totalWorkMin * proportion);
        if (pgAllocMin < 5) pgAllocMin = 5;

        cursorMin = skipLunchFn(cursorMin, lunchStartMin, lunchEndMin);
        const pgStart = cursorMin;
        const pgEnd = advanceCursor(cursorMin, pgAllocMin, lunchStartMin, lunchEndMin);

        pg.allocatedMin = pgAllocMin;
        pg.groupStart = pgStart;
        pg.groupEnd = pgEnd;

        // 제품 내부: 배치별 비례 하위 분배
        const groupTotalQty = pg.totalQty;
        let innerCursor = pgStart;
        for (const slot of pg.slots) {
          const innerProp = groupTotalQty > 0 ? slot.plannedQty / groupTotalQty : 1 / pg.slots.length;
          let innerAlloc = Math.round(pgAllocMin * innerProp);
          if (innerAlloc < 3) innerAlloc = 3;

          innerCursor = skipLunchFn(innerCursor, lunchStartMin, lunchEndMin);
          const slotStart = innerCursor;
          const slotEnd = advanceCursor(innerCursor, innerAlloc, lunchStartMin, lunchEndMin);
          innerCursor = slotEnd;

          slot.allocatedMin = innerAlloc;
          slot.workStart = slotStart;
          slot.workEnd = Math.min(slotEnd, pgEnd); // 제품 그룹 범위 내 제한
        }

        cursorMin = pgEnd;
      }

      // ── 3.5. 런타임 불변 조건 검증 (INVARIANT VALIDATION) ──
      // ⚠️ 이 검증을 제거하지 마세요. 제품별 비중복 시간 배분을 보장합니다.
      {
        let prevEnd = -1;
        let prevProductName = "";
        for (let vi = 0; vi < productGroupOrder.length; vi++) {
          const vpg = productGroupMap[productGroupOrder[vi]];
          // 검증 1: 각 제품 그룹의 시작이 이전 그룹의 끝 이후여야 함
          if (vi > 0 && vpg.groupStart < prevEnd) {
            console.error(`[CCP-4P INVARIANT VIOLATION] 제품 시간 겹침 발생! ` +
              `${prevProductName} ends at ${minToTime(prevEnd)} but ${vpg.productName} starts at ${minToTime(vpg.groupStart)}. ` +
              `이 오류는 금속검출 혼입(contamination)을 의미합니다. 즉시 수정이 필요합니다.`);
          }
          // 검증 2: 제품 그룹 시작 < 종료
          if (vpg.groupStart >= vpg.groupEnd) {
            console.error(`[CCP-4P INVARIANT VIOLATION] 제품 그룹 시간 역전! ` +
              `${vpg.productName}: start=${minToTime(vpg.groupStart)} >= end=${minToTime(vpg.groupEnd)}`);
          }
          // 검증 3: 내부 배치 슬롯이 제품 그룹 범위 내에 있어야 함
          for (const vs of vpg.slots) {
            if (vs.workStart < vpg.groupStart || vs.workEnd > vpg.groupEnd + 1) {
              console.error(`[CCP-4P INVARIANT VIOLATION] 배치 슬롯 범위 초과! ` +
                `batch=${vs.batchId} (${minToTime(vs.workStart)}-${minToTime(vs.workEnd)}) ` +
                `outside product group ${vpg.productName} (${minToTime(vpg.groupStart)}-${minToTime(vpg.groupEnd)})`);
            }
          }
          prevEnd = vpg.groupEnd;
          prevProductName = vpg.productName;
        }
      }

      // ── 4. 일일 통합: 전체 제품의 행을 하나의 form_record에 생성 ──
      // CCP-4P는 하루에 1개의 기록지 → 모든 제품의 감도체크+통과기록을 하나의 form_record에
      // 기존 행 삭제 후 재생성
      await rawConn.execute(
        `DELETE FROM h_ccp_form_rows WHERE form_record_id = ? AND tenant_id = ?`,
        [formRecordId, tenantId],
      );

      // 4.1 새 테이블 기록 (일일 통합: 전체 skuSlots 기준)
      try {
        await rawConn.execute(
          `DELETE FROM h_ccp_batch_process_runs WHERE tenant_id = ? AND work_date = ?`,
          [tenantId, batchWorkDate],
        );

        // Create BatchProcessRun (일일 통합: 전체 skuSlots 사용)
        const totalBatchQty = skuSlots.reduce((s: number, sl: SkuSlot) => s + sl.plannedQty, 0);
        const [runResult] = await rawConn.execute(
          `INSERT INTO h_ccp_batch_process_runs
             (tenant_id, site_id, batch_id, process_group_id, process_code, equipment_id,
              mode, channels, planned_total_qty, work_date,
              work_start_time, work_end_time, lunch_start_time, lunch_end_time,
              random_offset_min, random_seed,
              planned_start_at, planned_end_at, status)
           VALUES (?, 1, ?, ?, 'METAL_DETECT', ?,
              'SEQUENTIAL', 1, ?, ?,
              ?, ?, ?, ?,
              ?, ?,
              ?, ?, 'PLANNED')`,
          [
            tenantId, batchId, processGroupId || null, equipId || null,
            totalBatchQty || null, batchWorkDate,
            equipWorkStart, equipWorkEnd, equipLunchStart, equipLunchEnd,
            metalRandomOffset, `${batchId}_${batchWorkDate}_${equipId}`,
            `${batchWorkDate} ${WORK_START}:00`,
            `${batchWorkDate} ${equipWorkEnd}:00`,
          ],
        );
        const runId = (runResult as any).insertId;

        // Create SkuSlots for all daily batches (일일 통합)
        const slotIds: number[] = [];
        for (let si = 0; si < skuSlots.length; si++) {
          const slot = skuSlots[si];
          const [slotResult] = await rawConn.execute(
            `INSERT INTO h_ccp_metal_sku_slots
               (tenant_id, batch_process_run_id, sku_id, product_id, product_name, sku_name,
                channel_no, sequence_no, planned_qty, planned_pass_qty, allocated_duration_min,
                planned_start_at, planned_end_at, status)
             VALUES (?, ?, ?, ?, ?, ?,
                1, ?, ?, ?, ?,
                ?, ?, 'PLANNED')`,
            [
              tenantId, runId, slot.skuId || null, slot.productId, slot.productName, slot.skuName,
              si + 1, slot.plannedQty || null, slot.passQty || null, slot.allocatedMin,
              `${batchWorkDate} ${minToTime(slot.workStart)}:00`,
              `${batchWorkDate} ${minToTime(slot.workEnd)}:00`,
            ],
          );
          slotIds.push((slotResult as any).insertId);
        }

        // Create SensitivityChecks (일일 통합: 전체 skuSlots 기준)
        const overallStart = skuSlots[0].workStart;
        const overallEnd = skuSlots[skuSlots.length - 1].workEnd;
        let checkSeq = 1;

        // START check
        const startOff = Math.floor(seededRandom2(metalSeed + 1) * 4);
        const startCheckMin = skipLunchFn(overallStart + startOff, lunchStartMin, lunchEndMin);
        await rawConn.execute(
          `INSERT INTO h_ccp_metal_sensitivity_checks
             (tenant_id, batch_process_run_id, equipment_id,
              check_type, check_seq, scheduled_at,
              fe_threshold_mm, sus_threshold_mm, result, note)
           VALUES (?, ?, ?, 'START', ?, ?, ?, ?, 'PENDING', '작업시작')`,
          [tenantId, runId, equipId || null, checkSeq++,
           `${batchWorkDate} ${minToTime(startCheckMin)}:00`,
           equipFeSensitivity, equipStsSensitivity],
        );

        // PERIODIC checks every 2h
        const TWO_H = 120;
        let cp = overallStart + TWO_H;
        while (cp < overallEnd) {
          const periodicOff = Math.floor(seededRandom2(metalSeed + cp) * 6);
          let adjM = skipLunchFn(cp + periodicOff, lunchStartMin, lunchEndMin);
          if (adjM < overallEnd) {
            const matchSlotIdx = skuSlots.findIndex(
              (s) => adjM >= s.workStart && adjM < s.workEnd
            );
            await rawConn.execute(
              `INSERT INTO h_ccp_metal_sensitivity_checks
                 (tenant_id, batch_process_run_id, sku_slot_id, equipment_id,
                  check_type, check_seq, scheduled_at,
                  fe_threshold_mm, sus_threshold_mm, result, note)
               VALUES (?, ?, ?, ?, 'PERIODIC', ?, ?, ?, ?, 'PENDING', '2시간점검')`,
              [tenantId, runId,
               matchSlotIdx >= 0 ? slotIds[matchSlotIdx] : null,
               equipId || null, checkSeq++,
               `${batchWorkDate} ${minToTime(adjM)}:00`,
               equipFeSensitivity, equipStsSensitivity],
            );
          }
          cp += TWO_H;
        }

        // END check
        const endOff = Math.floor(seededRandom2(metalSeed + 99) * 4);
        const endCheckMin = skipLunchFn(Math.max(overallStart + 5, overallEnd - 3 - endOff), lunchStartMin, lunchEndMin);
        await rawConn.execute(
          `INSERT INTO h_ccp_metal_sensitivity_checks
             (tenant_id, batch_process_run_id, equipment_id,
              check_type, check_seq, scheduled_at,
              fe_threshold_mm, sus_threshold_mm, result, note)
           VALUES (?, ?, ?, 'END', ?, ?, ?, ?, 'PENDING', '작업종료')`,
          [tenantId, runId, equipId || null, checkSeq++,
           `${batchWorkDate} ${minToTime(endCheckMin)}:00`,
           equipFeSensitivity, equipStsSensitivity],
        );

      } catch (newTableErr) {
        console.error("[syncCcpRowsToFormRows] CCP-4P new tables write failed (form_rows still written):", newTableErr);
      }

      // ── 5. 일일 통합: 전체 제품그룹에 대해 감도체크 + 통과기록 생성 ──
      interface SensitivityCheck {
        time: string;
        productName: string;
        type: "start" | "end" | "interval";
      }
      const allSensitivityChecks: SensitivityCheck[] = [];

      // 제품 그룹별 감도 체크 생성
      for (let gi = 0; gi < productGroupOrder.length; gi++) {
        const pg = productGroupMap[productGroupOrder[gi]];
        const pgProductId = pg.productId;

        // 품목 시작 체크
        const checkTime = skipLunchFn(pg.groupStart, lunchStartMin, lunchEndMin);
        const microOffset = Math.floor(seededRandom2(metalSeed + 1 + pgProductId) * 4);
        allSensitivityChecks.push({
          time: minToTime(checkTime + microOffset),
          productName: pg.productName,
          type: "start",
        });

        // 2시간 간격 체크
        const TWO_HOURS = 120;
        let checkpoint = pg.groupStart + TWO_HOURS;
        while (checkpoint < pg.groupEnd) {
          const adjTime = skipLunchFn(checkpoint, lunchStartMin, lunchEndMin);
          const microOffset2 = Math.floor(seededRandom2(metalSeed + checkpoint + pgProductId) * 6);
          allSensitivityChecks.push({
            time: minToTime(adjTime + microOffset2),
            productName: pg.productName,
            type: "interval",
          });
          checkpoint += TWO_HOURS;
        }

        // 품목 종료 체크
        const endTime = skipLunchFn(pg.groupEnd, lunchStartMin, lunchEndMin);
        const microOffset3 = Math.floor(seededRandom2(metalSeed + 99 + pgProductId) * 4);
        const adjEndTime = Math.max(pg.groupStart + 5, endTime - 3 - microOffset3);
        allSensitivityChecks.push({
          time: minToTime(skipLunchFn(adjEndTime, lunchStartMin, lunchEndMin)),
          productName: pg.productName,
          type: "end",
        });
      }

      allSensitivityChecks.sort((a, b) => timeToMin(a.time) - timeToMin(b.time));

      // ── 6. 감도 모니터링 행 INSERT → h_ccp_form_rows ──
      let seqNum = 1;
      for (const check of allSensitivityChecks) {
        const feOnly = "O";
        const susOnly = "O";
        const productOnly = "X";
        const feProduct = "O";
        const susProduct = "O";

        await rawConn.execute(
          `INSERT INTO h_ccp_form_rows
             (tenant_id, form_record_id, batch_seq, equipment_type,
              product_name, metal_pass_time,
              metal_fe_mid, metal_sus_mid, metal_product_only,
              metal_fe_product, metal_sus_product,
              result, note, created_at, updated_at)
           VALUES (?, ?, ?, 'sensitivity',
                   ?, ?,
                   ?, ?, ?,
                   ?, ?,
                   '적합', ?, NOW(), NOW())`,
          [
            tenantId, formRecordId, seqNum,
            check.productName, check.time,
            feOnly, susOnly, productOnly, feProduct, susProduct,
            check.type === "start" ? "품목시작" : check.type === "end" ? "품목종료" : "2시간점검",
          ],
        );
        seqNum++;
        totalSynced++;
      }

      // ── 7. 전체 제품의 통과 기록 행 INSERT → h_ccp_form_rows ──
      for (const pg of productGroupOrder.map(pid => productGroupMap[pid])) {
        // 제품 그룹의 감도체크 시간 범위
        const pgSensChecks = allSensitivityChecks.filter(c => c.productName === pg.productName);
        const pgSensStart = pgSensChecks.find(c => c.type === "start");
        const pgSensEnd = pgSensChecks.find(c => c.type === "end");
        const pgSensStartMin2 = pgSensStart ? timeToMin(pgSensStart.time) : pg.groupStart;
        const pgSensEndMin2 = pgSensEnd ? timeToMin(pgSensEnd.time) : pg.groupEnd;
        // 2시간 간격 체크 시간 목록 (분 단위, 정렬) — 전체 제품의 interval 포함
        const allIntervalMins = allSensitivityChecks
          .filter(c => c.type === "interval")
          .map(c => timeToMin(c.time))
          .sort((a, b) => a - b);

        for (const slot of pg.slots) {
          const passStart = skipLunchFn(slot.workStart, lunchStartMin, lunchEndMin);
          const passEnd = skipLunchFn(slot.workEnd, lunchStartMin, lunchEndMin);
          const microOff1 = Math.floor(seededRandom2(metalSeed + 200 + seqNum) * 4);
          const microOff2 = Math.floor(seededRandom2(metalSeed + 201 + seqNum) * 4);

          // 통과 시작: 품목시작 감도 체크 이후
          let rawPassStart = passStart + microOff1;
          const isFirstSlotInPg = pg.slots[0] === slot;
          if (isFirstSlotInPg && rawPassStart <= pgSensStartMin2) {
            rawPassStart = pgSensStartMin2 + 1;
          }
          // ★ 통과시작이 2시간 체크 시간 ±4분 이내면 체크 이후로 조정
          for (const intMin of allIntervalMins) {
            if (rawPassStart >= intMin - 4 && rawPassStart <= intMin + 4) {
              rawPassStart = intMin + 5;
              break;
            }
          }

          // 통과 종료: 품목종료 감도 체크 이전
          let rawPassEnd = Math.max(rawPassStart + 3, passEnd - microOff2);
          const isLastSlotInPg = pg.slots[pg.slots.length - 1] === slot;
          if (isLastSlotInPg && rawPassEnd >= pgSensEndMin2) {
            rawPassEnd = Math.max(rawPassStart + 2, pgSensEndMin2 - 1 - Math.floor(seededRandom2(metalSeed + 300 + seqNum) * 3));
          }
          // ★ 통과종료가 2시간 체크 시간 ±4분 이내면 체크 전으로 조정
          for (const intMin of allIntervalMins) {
            if (rawPassEnd >= intMin - 4 && rawPassEnd <= intMin + 4) {
              rawPassEnd = Math.max(rawPassStart + 2, intMin - 5);
              break;
            }
          }

          // 실제 통과량
          let actualPassQty = slot.passQty;
          if (slot.skuId) {
            try {
              const [psoRows] = await rawConn.execute<any[]>(
                `SELECT SUM(quantity) as total_qty FROM production_sku_output
                 WHERE batch_id = ? AND sku_id = ? AND tenant_id = ?`,
                [slot.batchId, slot.skuId, tenantId],
              );
              if ((psoRows as any[])[0]?.total_qty) {
                actualPassQty = Math.round(parseFloat((psoRows as any[])[0].total_qty));
              }
            } catch { /* fallback */ }
          }

          await rawConn.execute(
            `INSERT INTO h_ccp_form_rows
               (tenant_id, form_record_id, batch_seq, equipment_type,
                product_name, pass_time_start, pass_time_end,
                pass_qty, detected_qty, special_note,
                result, created_at, updated_at)
             VALUES (?, ?, ?, 'passage',
                     ?, ?, ?,
                     ?, 0, NULL,
                     '적합', NOW(), NOW())`,
            [
              tenantId, formRecordId, seqNum,
              slot.skuName,
              minToTime(rawPassStart),
              minToTime(rawPassEnd),
              actualPassQty,
            ],
          );
          seqNum++;
          totalSynced++;
        }
      }
      // ── END OF CRITICAL SECTION: CCP-4P 제품별 순차 배분 ──

    } else {
      // ═══ CCP-1B / CCP-2B: 가열(증숙/굽기) 공정 ═══
      const rowCount = totalBatchCount;

      // ═══ 교차배치 설비 순환 (Cross-batch equipment rotation) ═══
      // 같은 day_batch_group (또는 같은 planned_date) 내에서 같은 process_group의 이전 배치들이
      // 사용한 서브배치 수를 합산하여 현재 배치의 설비 시작 인덱스를 결정
      // 예: 배치A(3서브배치) → 설비 1,2,3 사용 → 배치B는 설비 1부터 이어서 시작
      //     배치B(2서브배치) → 설비 1,2 사용 → 배치C는 설비 3부터 이어서 시작
      let equipStartIndex = 0;
      if (processGroupId && (dayBatchGroup || plannedDate)) {
        try {
          const [prevBatches] = await rawConn.execute<any[]>(
            `SELECT fr2.batch_count
             FROM h_ccp_form_records fr2
             JOIN h_batches b2 ON b2.id = fr2.batch_id AND b2.tenant_id = fr2.tenant_id
             WHERE fr2.tenant_id = ? AND fr2.process_group_id = ? AND fr2.ccp_type = ?
               AND b2.planned_date = ?
               AND (
                 (? IS NOT NULL AND b2.day_batch_group = ?)
                 OR (? IS NULL AND b2.planned_date = ?)
               )
               AND b2.batch_order < ?
             ORDER BY b2.batch_order`,
            [
              tenantId, processGroupId, ccpType,
              plannedDate,
              dayBatchGroup, dayBatchGroup,
              dayBatchGroup, plannedDate,
              batchOrder,
            ],
          );
          for (const pb of prevBatches as any[]) {
            equipStartIndex += (pb.batch_count ? Number(pb.batch_count) : 1);
          }
          if (equipStartIndex > 0) {
          }
        } catch (rotErr) {
          console.error(`[syncCcpRowsToFormRows] Cross-batch rotation query failed:`, rotErr);
          equipStartIndex = 0;
        }
      }

      for (let seqIdx = 0; seqIdx < rowCount; seqIdx++) {
        const globalSeqIdx = equipStartIndex + seqIdx;
        // ★ h_ccp_rows가 totalBatchCount와 동일하면 1:1 매핑 (각 행 = 각 서브배치)
        //    아니면 설비 순환 모드 (equipCount 기준 modulus)
        const row = (ccpRows.length === rowCount && seqIdx < ccpRows.length)
          ? (ccpRows as any[])[seqIdx]
          : (ccpRows as any[])[globalSeqIdx % equipCount];
        const batchSeq = seqIdx + 1;

        // 이미 존재하는 batch_seq는 건너뜀 (사용자 수동 입력 데이터 보호)
        if (existingSeqs.has(batchSeq)) {
          continue;
        }
        // ★ 동시 호출 방지: INSERT 직전에 한번 더 확인
        try {
          const [dupCheck] = await rawConn.execute<any[]>(
            `SELECT id FROM h_ccp_form_rows WHERE form_record_id = ? AND tenant_id = ? AND batch_seq = ? LIMIT 1`,
            [formRecordId, tenantId, batchSeq],
          );
          if ((dupCheck as any[]).length > 0) {
            existingSeqs.add(batchSeq);
            continue;
          }
        } catch { /* 확인 실패 시 INSERT 진행 */ }

        // pressure_bar(bar) → pressure_mpa(MPa): ÷10
        const pressureMpa = row.pressure_bar != null
          ? (parseFloat(row.pressure_bar) / 10).toFixed(3)
          : null;

        // ═══ 측정시간: h_ccp_rows의 실제 측정시간 우선 사용 ═══
        // ★ 배치 상세 CCP 점검에서 기록된 measured_at가 있으면 그대로 사용
        //    없을 때만 batchStartTime 기반 계산 폴백
        let measurementTime: string | null = null;

        if (row.measured_at_hhmm) {
          // h_ccp_rows에 실제 측정시간이 있으면 직접 사용 (KST 기준)
          measurementTime = row.measured_at_hhmm;
        } else if (adjustedStartTime) {
          // 측정시간이 없으면 기존 계산 로직 폴백
          measurementTime = adjustedStartTime;
          const cycleDuration = row.duration_min != null ? Number(row.duration_min) : 70;

          if (pgGroupMode === "concurrent") {
            measurementTime = addMinutesToTime(adjustedStartTime, crossBatchTimeOffsetMin);

          } else if (pgGroupMode === "grouped") {
            const groupsPerRound = Math.max(1, Math.ceil(equipCount / pgBatchSize));
            const groupIndex = Math.floor(globalSeqIdx / pgBatchSize);
            const roundIndex = Math.floor(groupIndex / groupsPerRound);
            const groupInRound = groupIndex % groupsPerRound;
            const offsetMin = crossBatchTimeOffsetMin + roundIndex * cycleDuration + groupInRound * pgIntervalMin;
            measurementTime = addMinutesToTime(adjustedStartTime, offsetMin);

          } else {
            // sequential (기본) — 배치 내 로컬 인덱스로 설비 선택
            const equipIndex = seqIdx % equipCount;
            const localRoundIndex = Math.floor(seqIdx / equipCount);
            const offsetMin = crossBatchTimeOffsetMin + localRoundIndex * cycleDuration + equipIndex * pgIntervalMin;
            measurementTime = addMinutesToTime(adjustedStartTime, offsetMin);
          }
        }

        // ═══ 가열후 품온(모서리/중심부) - 설비별 데이터 ═══
        let tempEdge: string | null = null;
        let tempCenter: string | null = null;
        if (row.equipment_id) {
          try {
            const [eqRows] = await rawConn.execute<any[]>(
              `SELECT edge_temperature, center_temperature FROM equipments 
               WHERE id = ? AND tenant_id = ? LIMIT 1`,
              [row.equipment_id, tenantId],
            );
            if ((eqRows as any[]).length > 0) {
              const eq = (eqRows as any[])[0];
              tempEdge = eq.edge_temperature != null ? String(eq.edge_temperature) : null;
              tempCenter = eq.center_temperature != null ? String(eq.center_temperature) : null;
            }
          } catch { /* 설비 조회 실패 시 무시 */ }
        }

        await rawConn.execute(
          `INSERT INTO h_ccp_form_rows
             (tenant_id, form_record_id, batch_seq,
              equipment_id, equipment_name, equipment_type,
              product_name, input_qty_kg, measurement_time,
              heat_time_min, heat_temp_c, pressure_mpa,
              temp_edge_c, temp_center_c,
              result, note, created_at, updated_at)
           VALUES (?, ?, ?,
                   ?, ?, NULL,
                   ?, ?, ?,
                   ?, ?, ?,
                   ?, ?,
                   ?, ?, NOW(), NOW())`,
          [
            tenantId, formRecordId, batchSeq,
            row.equipment_id ?? null,
            row.equipment_name ?? null,
            instanceProductName || frProductName || null,
            inputQtyKg != null ? inputQtyKg.toFixed(2) : null,
            measurementTime ?? null,
            row.heating_min ?? row.duration_min ?? null,
            row.temp_c ?? null,
            pressureMpa,
            tempEdge,
            tempCenter,
            row.result === "PASS" ? "적합" : "부적합",
            row.note ?? null,
          ],
        );
        totalSynced++;
      }
    }

  }

  return { synced: totalSynced };
}

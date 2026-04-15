/**
 * CCP 기록지 CRUD (생성/조회/수정/삭제)
 * ccpFormRecords.ts에서 분할
 */
// ═══════════════════════════════════════════════════════════════
import { getCcpFormRows } from "./ccpFormRowsOps";
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
import { getDb, getRawConnection } from "../connection";
import { todayKST, toKSTTimestamp } from "../../utils/timezone";
import {
  hCcpFormRecords,
  hCcpFormRows,
  hCcpEquipBatchSettings,
  type InsertCcpFormRecord,
  type InsertCcpFormRow,
  type InsertCcpEquipBatchSetting,
} from "../../../drizzle/schema/schema_main";
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
} from "../../services/metalPassAllocator";

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
      equipGroupMode = (settings[0] as any).groupMode;
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

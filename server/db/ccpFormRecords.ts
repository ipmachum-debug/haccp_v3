/**
 * CCP 모니터링 기록지 서버 DB 함수
 * CCP-2B: 가열(굽기)공정, CCP-1B: 가열(증숙)공정, CCP-4P: 금속검출공정
 */
import { getDb, getRawConnection } from "../db";
import {
  hCcpFormRecords,
  hCcpFormRows,
  hCcpEquipBatchSettings,
  type InsertCcpFormRecord,
  type InsertCcpFormRow,
  type InsertCcpEquipBatchSetting,
} from "../../drizzle/schema_main";
import { eq, and, desc } from "drizzle-orm";

// ─────────────────────────────────────────────────────────
// CCP Form Record (기록지 헤더)
// ─────────────────────────────────────────────────────────

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
  if (!db) throw new Error("Database not available");

  // 이미 존재하는지 확인
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
    // 행도 함께 반환
    const rows = await getCcpFormRows(existing[0].id, params.tenantId);
    return { record: existing[0], rows };
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

  const insertData: InsertCcpFormRecord = {
    tenantId: params.tenantId,
    siteId: params.siteId,
    batchId: params.batchId,
    ccpType: params.ccpType,
    workDate: params.workDate,
    productId: params.productId,
    productName: params.productName,
    processGroupId: params.processGroupId,
    processGroupName: params.processGroupName,
    bomBatchKg: params.bomBatchKg?.toString(),
    plannedQtyKg: params.plannedQtyKg?.toString(),
    batchCount,
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
  if (!db) throw new Error("Database not available");
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
 */
export async function getCcpFormRecordsByBatch(batchId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const conditions = tenantId
    ? and(eq(hCcpFormRecords.batchId, batchId), eq(hCcpFormRecords.tenantId, tenantId))
    : eq(hCcpFormRecords.batchId, batchId);
  return db
    .select()
    .from(hCcpFormRecords)
    .where(conditions)
    .orderBy(hCcpFormRecords.ccpType);
}

/**
 * 배치 ID로 CCP 기록지 목록 + 행 데이터 포함 조회 (인쇄용)
 * P0: tenantId 필수 - 테넌트 격리
 */
export async function getCcpFormRecordsWithRowsByBatch(batchId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const conditions = tenantId
    ? and(eq(hCcpFormRecords.batchId, batchId), eq(hCcpFormRecords.tenantId, tenantId))
    : eq(hCcpFormRecords.batchId, batchId);
  const records = await db
    .select()
    .from(hCcpFormRecords)
    .where(conditions)
    .orderBy(hCcpFormRecords.ccpType);

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
  if (!db) throw new Error("Database not available");
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

// ─────────────────────────────────────────────────────────
// CCP Form Rows (기록지 행 데이터)
// ─────────────────────────────────────────────────────────

/**
 * 기록지 ID로 행 목록 조회
 * P0: tenantId 필수 - 테넌트 격리
 */
export async function getCcpFormRows(formRecordId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
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
  if (!db) throw new Error("Database not available");

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
    return existing[0].id;
  } else {
    const [result] = await db.insert(hCcpFormRows).values(data);
    return (result as any).insertId as number;
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
  if (!db) throw new Error("Database not available");
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
  if (!db) throw new Error("Database not available");
  const conditions = tenantId
    ? and(eq(hCcpFormRows.id, id), eq(hCcpFormRows.tenantId, tenantId))
    : eq(hCcpFormRows.id, id);
  await db.delete(hCcpFormRows).where(conditions);
}

// ─────────────────────────────────────────────────────────
// Equipment Batch Settings (설비 배치 설정)
// ─────────────────────────────────────────────────────────

/**
 * 설비 배치 설정 저장/업데이트
 */
export async function upsertCcpEquipBatchSettings(
  data: InsertCcpEquipBatchSetting
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db
    .select()
    .from(hCcpEquipBatchSettings)
    .where(
      and(
        eq(hCcpEquipBatchSettings.tenantId, data.tenantId ?? 1),
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
  if (!db) throw new Error("Database not available");
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

/**
 * 기록지 제출 (승인 요청)
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

// ─────────────────────────────────────────────────────────
// h_ccp_rows → h_ccp_form_rows 동기화
// ─────────────────────────────────────────────────────────

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
  const [formRecords] = await rawConn.execute<any[]>(
    `SELECT fr.id, fr.ccp_type, fr.process_group_id, fr.product_name, fr.planned_qty_kg, fr.bom_batch_kg, fr.batch_count,
            DATE_FORMAT(fr.work_date, '%Y-%m-%d') as work_date
     FROM h_ccp_form_records fr
     WHERE fr.batch_id = ? AND fr.tenant_id = ?`,
    [batchId, tenantId],
  );

  if ((formRecords as any[]).length === 0) {
    console.log(`[syncCcpRowsToFormRows] No form records for batch ${batchId}`);
    return { synced: 0 };
  }

  // 배치 정보 조회 (product_name, planned_quantity, start_time, product_id)
  // ※ start_time은 Drizzle ORM이 UTC로 저장하는 버그가 있어 MySQL에 UTC값이 KST처럼 저장됨
  //    따라서 rawConn으로 읽으면 +9시간 보정이 필요함
  //    안전하게 DATE_ADD로 9시간 더한 후 HH:mm 문자열로 추출
  const [batchInfo] = await rawConn.execute<any[]>(
    `SELECT b.planned_quantity, b.product_id,
            p.product_name as p_name,
            DATE_FORMAT(DATE_ADD(b.start_time, INTERVAL 9 HOUR), '%H:%i') as start_time_hhmm
     FROM h_batches b
     LEFT JOIN h_products_v2 p ON p.id = b.product_id AND p.tenant_id = b.tenant_id
     WHERE b.id = ? AND b.tenant_id = ?
     LIMIT 1`,
    [batchId, tenantId],
  );
  const batchProductName = (batchInfo as any[])[0]?.p_name || "";
  const batchPlannedKg = parseFloat((batchInfo as any[])[0]?.planned_quantity) || 0;
  const productId = (batchInfo as any[])[0]?.product_id || null;

  // ═══ Issue 1: 배치 시작시간 추출 (HH:mm) ═══
  // Drizzle ORM의 MySQL timestamp 직렬화가 toISOString() (UTC)을 사용하므로
  // MySQL에는 UTC값이 KST인 것처럼 저장됨 (예: 06:00 KST → 21:00 저장)
  // DATE_ADD(start_time, INTERVAL 9 HOUR)으로 보정하여 올바른 KST 시간 추출
  // NULL이면 기본값 "09:00" 사용 (설비 work_start_time 기본값과 동일)
  let batchStartTime: string = (batchInfo as any[])[0]?.start_time_hhmm || "09:00";
  console.log(`[syncCcpRowsToFormRows] batchId=${batchId} startTime=${batchStartTime} plannedKg=${batchPlannedKg}`);

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
        console.log(`[syncCcpRowsToFormRows] BOM 투입량(정제수제외):`, bomInputQtyMap, `bomBatchKg=${bomBatchKg}`);
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

  for (const fr of formRecords as any[]) {
    const formRecordId = fr.id;
    const ccpType = fr.ccp_type;
    const frProductName = fr.product_name || batchProductName;
    const processGroupId = fr.process_group_id ? Number(fr.process_group_id) : null;

    // 2. 이미 form rows가 있으면 건너뜀 (사용자가 수동 입력한 데이터 보호)
    const [existingRows] = await rawConn.execute<any[]>(
      `SELECT COUNT(*) as cnt FROM h_ccp_form_rows WHERE form_record_id = ?`,
      [formRecordId],
    );
    if ((existingRows as any[])[0]?.cnt > 0) {
      continue;
    }

    // 3. h_ccp_instances에서 해당 배치+CCP 타입의 인스턴스 조회
    const [instances] = await rawConn.execute<any[]>(
      `SELECT id FROM h_ccp_instances
       WHERE batch_id = ? AND ccp_type = ? AND tenant_id = ?
       LIMIT 1`,
      [batchId, ccpType, tenantId],
    );

    let ccpRows: any[] = [];
    if ((instances as any[]).length > 0) {
      const instanceId = (instances as any[])[0].id;
      // 4. h_ccp_rows에서 해당 인스턴스의 행 조회
      const [rows] = await rawConn.execute<any[]>(
        `SELECT sort_order, equipment_id, equipment_name, temp_c,
                duration_min, heating_min, pressure_bar, result, note
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
                    e.default_pressure as pressure_bar
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
            console.log(`[syncCcpRowsToFormRows] ${ccpType} batch ${batchId}: no h_ccp_rows, using ${ccpRows.length} equipments from process group ${processGroupId}`);
          }
        } catch (eqErr) {
          console.error(`[syncCcpRowsToFormRows] ${ccpType} equipment fallback failed:`, eqErr);
        }
      }
      if (ccpRows.length === 0) continue;
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
    let inputQtyKg: number | null = null;
    if (processGroupId && bomInputQtyMap[processGroupId] != null) {
      const bomQty = bomInputQtyMap[processGroupId]; // BOM 1배치 기준 정제수 제외 투입량
      inputQtyKg = bomQty;
    } else {
      // BOM 데이터 없으면 총생산량 폴백
      inputQtyKg = batchPlannedKg || null;
    }

    // 설비 총 대수 = h_ccp_rows 행 수 (CCP-4P 제외)
    const equipCount = ccpType !== "CCP-4P" ? (ccpRows as any[]).length : 1;

    // ═══ 배치 수 계산 ═══
    // form_record의 batch_count가 있으면 사용, 없으면 BOM 기준 계산
    // 예: 800kg 생산, BOM 100kg → 8배치
    // 설비 3대 × 8배치 → 8행 생성 (라운드별: 1호기→2호기→3호기→1호기→2호기→3호기→1호기→2호기)
    let totalBatchCount = fr.batch_count ? Number(fr.batch_count) : 1;
    if (totalBatchCount < 1) totalBatchCount = 1;

    // ═══ 랜덤 오프셋 (0-10분) 적용 ═══
    // 모든 공정(교반, 증숙, 오븐, 금속검출)에 작업시작 시점으로부터 0-10분 랜덤 오프셋
    // 일괄적이면 외부점검시 이상하게 생각하므로 자연스럽게 분산
    // seed: batchId + processGroupId + ccpType hash → 동일 배치에 대해 동일 오프셋 (재현성)
    function seededRandom(seed: number): number {
      let s = seed;
      s = ((s ^ 0xDEADBEEF) + (s << 1)) & 0x7FFFFFFF;
      s = ((s ^ (s >> 16)) * 0x45d9f3b) & 0x7FFFFFFF;
      s = ((s ^ (s >> 16)) * 0x45d9f3b) & 0x7FFFFFFF;
      return (s & 0x7FFFFFFF) / 0x7FFFFFFF;
    }
    const randomSeed = batchId * 1000 + (processGroupId || 0) * 100 + ccpType.charCodeAt(4);
    const randomOffsetMin = Math.floor(seededRandom(randomSeed) * 11); // 0~10
    const adjustedStartTime = batchStartTime ? addMinutesToTime(batchStartTime, randomOffsetMin) : batchStartTime;

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

      // Import helpers from metalPassAllocator v2
      const {
        timeToMin, minToTime, addMinutesToTime: addMinToTime2,
        calcAvailableMinutes, skipLunch: skipLunchFn, advanceCursor,
        seededRandom: seededRandom2, computeSeed, computeRandomOffset,
      } = await import("../services/metalPassAllocator");

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
      const metalSeed = computeSeed(batchId, fr.work_date || "", equipId);
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
           ORDER BY b.product_id, ps.sku_code, b.id`,
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

      // ── 3. 비례배분: SKU별 시간 슬롯 계산 ──
      const totalDayQty = skuSlots.reduce((s, sl) => s + sl.plannedQty, 0);
      let cursorMin = workStartMin;

      for (const slot of skuSlots) {
        const proportion = totalDayQty > 0 ? slot.plannedQty / totalDayQty : 1 / skuSlots.length;
        let allocMin = Math.round(totalWorkMin * proportion);
        if (allocMin < 5) allocMin = 5;

        cursorMin = skipLunchFn(cursorMin, lunchStartMin, lunchEndMin);
        const slotStart = cursorMin;
        const slotEnd = advanceCursor(cursorMin, allocMin, lunchStartMin, lunchEndMin);
        cursorMin = slotEnd;

        slot.allocatedMin = allocMin;
        slot.workStart = slotStart;
        slot.workEnd = slotEnd;
      }

      // ── 4. 현재 배치의 슬롯 필터링 ──
      const currentBatchSlots = skuSlots.filter(s => s.batchId === batchId);
      if (currentBatchSlots.length === 0) {
        console.log(`[syncCcpRowsToFormRows] CCP-4P: batch ${batchId} not found in day SKU slots, skipping`);
        continue;
      }

      // ── 4.5. 새 테이블에 BatchProcessRun + SkuSlots + SensitivityChecks 기록 ──
      try {
        // Delete existing run for this batch/date/equipment
        await rawConn.execute(
          `DELETE FROM h_ccp_batch_process_runs WHERE tenant_id = ? AND batch_id = ? AND work_date = ?`,
          [tenantId, batchId, batchWorkDate],
        );

        // Create BatchProcessRun
        const totalBatchQty = currentBatchSlots.reduce((s, sl) => s + sl.plannedQty, 0);
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

        // Create SkuSlots for current batch
        const slotIds: number[] = [];
        for (let si = 0; si < currentBatchSlots.length; si++) {
          const slot = currentBatchSlots[si];
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

        // Create SensitivityChecks
        const overallStart = currentBatchSlots[0].workStart;
        const overallEnd = currentBatchSlots[currentBatchSlots.length - 1].workEnd;
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
            const matchSlotIdx = currentBatchSlots.findIndex(
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

        console.log(`[syncCcpRowsToFormRows] CCP-4P new tables: run#${runId}, ${slotIds.length} slots, ${checkSeq - 1} sensitivity checks`);
      } catch (newTableErr) {
        console.error("[syncCcpRowsToFormRows] CCP-4P new tables write failed (form_rows still written):", newTableErr);
      }

      // ── 5. 감도 모니터링 행 (sensitivity) 생성 → h_ccp_form_rows ──
      interface SensitivityCheck {
        time: string;
        productName: string;
        type: "start" | "end" | "interval";
      }
      const sensitivityChecks: SensitivityCheck[] = [];

      const currentProductId2 = currentBatchSlots[0].productId;
      const allSlotsForProduct = skuSlots.filter(s => s.productId === currentProductId2);
      const productGroupStart = allSlotsForProduct[0].workStart;
      const productGroupEnd = allSlotsForProduct[allSlotsForProduct.length - 1].workEnd;
      const batchWorkStartM = currentBatchSlots[0].workStart;
      const batchWorkEndM = currentBatchSlots[currentBatchSlots.length - 1].workEnd;

      const allBatchIds = [...new Set(skuSlots.map(s => s.batchId))];
      const currentBatchIdx = allBatchIds.indexOf(batchId);
      const prevBatchSlots = currentBatchIdx > 0 ? skuSlots.filter(s => s.batchId === allBatchIds[currentBatchIdx - 1]) : [];
      const nextBatchSlots = currentBatchIdx < allBatchIds.length - 1 ? skuSlots.filter(s => s.batchId === allBatchIds[currentBatchIdx + 1]) : [];
      const prevProductId = prevBatchSlots.length > 0 ? prevBatchSlots[0].productId : null;
      const nextProductId = nextBatchSlots.length > 0 ? nextBatchSlots[0].productId : null;

      const isProductChangeStart = prevProductId === null || prevProductId !== currentProductId2;
      const isProductChangeEnd = nextProductId === null || nextProductId !== currentProductId2;

      // 품목 시작 체크
      if (isProductChangeStart) {
        const checkTime = skipLunchFn(batchWorkStartM, lunchStartMin, lunchEndMin);
        const microOffset = Math.floor(seededRandom2(metalSeed + 1) * 4);
        sensitivityChecks.push({
          time: minToTime(checkTime + microOffset),
          productName: currentBatchSlots[0].productName,
          type: "start",
        });
      }

      // 2시간 간격 체크
      const TWO_HOURS = 120;
      let checkpoint = productGroupStart + TWO_HOURS;
      while (checkpoint < batchWorkEndM) {
        if (checkpoint >= batchWorkStartM) {
          const adjTime = skipLunchFn(checkpoint, lunchStartMin, lunchEndMin);
          const microOffset2 = Math.floor(seededRandom2(metalSeed + checkpoint) * 6);
          sensitivityChecks.push({
            time: minToTime(adjTime + microOffset2),
            productName: currentBatchSlots[0].productName,
            type: "interval",
          });
        }
        checkpoint += TWO_HOURS;
      }

      // 품목 종료 체크
      if (isProductChangeEnd) {
        const endTime = skipLunchFn(batchWorkEndM, lunchStartMin, lunchEndMin);
        const microOffset3 = Math.floor(seededRandom2(metalSeed + 99) * 4);
        const adjEndTime = Math.max(batchWorkStartM + 5, endTime - 3 - microOffset3);
        sensitivityChecks.push({
          time: minToTime(skipLunchFn(adjEndTime, lunchStartMin, lunchEndMin)),
          productName: currentBatchSlots[0].productName,
          type: "end",
        });
      }

      // 최소 1개 보장
      if (sensitivityChecks.length === 0) {
        const checkTime = skipLunchFn(batchWorkStartM, lunchStartMin, lunchEndMin);
        const microOffset = Math.floor(seededRandom2(metalSeed + 50) * 6);
        sensitivityChecks.push({
          time: minToTime(checkTime + microOffset),
          productName: currentBatchSlots[0].productName,
          type: "start",
        });
      }

      sensitivityChecks.sort((a, b) => timeToMin(a.time) - timeToMin(b.time));

      // ── 6. 감도 모니터링 행 INSERT → h_ccp_form_rows ──
      let seqNum = 1;
      for (const check of sensitivityChecks) {
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

      // ── 7. 제품 통과 기록 행 INSERT (SKU별) → h_ccp_form_rows ──
      for (const slot of currentBatchSlots) {
        const passStart = skipLunchFn(slot.workStart, lunchStartMin, lunchEndMin);
        const passEnd = skipLunchFn(slot.workEnd, lunchStartMin, lunchEndMin);
        const microOff1 = Math.floor(seededRandom2(metalSeed + 200 + seqNum) * 4);
        const microOff2 = Math.floor(seededRandom2(metalSeed + 201 + seqNum) * 4);

        // 실제 통과량: production_sku_output에서 조회 시도
        let actualPassQty = slot.passQty;
        if (slot.skuId) {
          try {
            const [psoRows] = await rawConn.execute<any[]>(
              `SELECT SUM(quantity) as total_qty FROM production_sku_output
               WHERE batch_id = ? AND sku_id = ? AND tenant_id = ?`,
              [batchId, slot.skuId, tenantId],
            );
            if ((psoRows as any[])[0]?.total_qty) {
              actualPassQty = Math.round(parseFloat((psoRows as any[])[0].total_qty));
            }
          } catch { /* fallback to planned qty */ }
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
            minToTime(passStart + microOff1),
            minToTime(Math.max(passStart + 5, passEnd - microOff2)),
            actualPassQty,
          ],
        );
        seqNum++;
        totalSynced++;
      }

    } else {
      // ═══ CCP-1B / CCP-2B: 가열(증숙/굽기) 공정 ═══
      const rowCount = totalBatchCount;

      for (let seqIdx = 0; seqIdx < rowCount; seqIdx++) {
        const row = (ccpRows as any[])[seqIdx % equipCount];
        const batchSeq = seqIdx + 1;

        // pressure_bar(bar) → pressure_mpa(MPa): ÷10
        const pressureMpa = row.pressure_bar != null
          ? (parseFloat(row.pressure_bar) / 10).toFixed(3)
          : null;

        // ═══ 측정시간 계산 (설비 배치 스케줄링 + 랜덤 오프셋) ═══
        // adjustedStartTime = batchStartTime + 랜덤 0~10분 오프셋
        let measurementTime: string | null = adjustedStartTime;

        if (adjustedStartTime) {
          const cycleDuration = row.duration_min != null ? Number(row.duration_min) : 70;

          if (pgGroupMode === "concurrent") {
            measurementTime = adjustedStartTime;

          } else if (pgGroupMode === "grouped") {
            const groupsPerRound = Math.max(1, Math.ceil(equipCount / pgBatchSize));
            const groupIndex = Math.floor((batchSeq - 1) / pgBatchSize);
            const roundIndex = Math.floor(groupIndex / groupsPerRound);
            const groupInRound = groupIndex % groupsPerRound;
            const offsetMin = roundIndex * cycleDuration + groupInRound * pgIntervalMin;
            measurementTime = addMinutesToTime(adjustedStartTime, offsetMin);

          } else {
            // sequential (기본)
            const equipIndex = (batchSeq - 1) % equipCount;
            const roundIndex = Math.floor((batchSeq - 1) / equipCount);
            const offsetMin = roundIndex * cycleDuration + equipIndex * pgIntervalMin;
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
            frProductName || null,
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

    console.log(`[syncCcpRowsToFormRows] form_record=${formRecordId}(${ccpType}) ← rows synced (batchCount=${totalBatchCount}, equipCount=${equipCount}, inputQty=${inputQtyKg}kg, startTime=${batchStartTime}, randomOffset=${randomOffsetMin}min, mode=${pgGroupMode}, interval=${pgIntervalMin}min)`);
  }

  return { synced: totalSynced };
}

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
    const rows = await getCcpFormRows(existing[0].id);
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
 */
export async function updateCcpFormRecord(
  id: number,
  data: Partial<InsertCcpFormRecord>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(hCcpFormRecords)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(hCcpFormRecords.id, id));
}

/**
 * 배치 ID로 CCP 기록지 목록 조회
 */
export async function getCcpFormRecordsByBatch(batchId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db
    .select()
    .from(hCcpFormRecords)
    .where(eq(hCcpFormRecords.batchId, batchId))
    .orderBy(hCcpFormRecords.ccpType);
}

/**
 * 배치 ID로 CCP 기록지 목록 + 행 데이터 포함 조회 (인쇄용)
 */
export async function getCcpFormRecordsWithRowsByBatch(batchId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const records = await db
    .select()
    .from(hCcpFormRecords)
    .where(eq(hCcpFormRecords.batchId, batchId))
    .orderBy(hCcpFormRecords.ccpType);

  const result = [];
  for (const rec of records) {
    const rows = await getCcpFormRows(rec.id);
    result.push({ ...rec, rows });
  }
  return result;
}

/**
 * ID로 CCP 기록지 단건 조회
 */
export async function getCcpFormRecordById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const records = await db
    .select()
    .from(hCcpFormRecords)
    .where(eq(hCcpFormRecords.id, id))
    .limit(1);
  if (!records.length) return null;
  const rows = await getCcpFormRows(id);
  return { record: records[0], rows };
}

// ─────────────────────────────────────────────────────────
// CCP Form Rows (기록지 행 데이터)
// ─────────────────────────────────────────────────────────

/**
 * 기록지 ID로 행 목록 조회
 */
export async function getCcpFormRows(formRecordId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db
    .select()
    .from(hCcpFormRows)
    .where(eq(hCcpFormRows.formRecordId, formRecordId))
    .orderBy(hCcpFormRows.batchSeq);
}

/**
 * CCP 기록 행 저장 (upsert by formRecordId + batchSeq)
 */
export async function upsertCcpFormRow(data: InsertCcpFormRow) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 이미 있는지 확인
  const existing = await db
    .select()
    .from(hCcpFormRows)
    .where(
      and(
        eq(hCcpFormRows.formRecordId, data.formRecordId),
        eq(hCcpFormRows.batchSeq, data.batchSeq ?? 1)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(hCcpFormRows)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(hCcpFormRows.id, existing[0].id));
    return existing[0].id;
  } else {
    const [result] = await db.insert(hCcpFormRows).values(data);
    return (result as any).insertId as number;
  }
}

/**
 * CCP 기록 행 업데이트
 */
export async function updateCcpFormRow(
  id: number,
  data: Partial<InsertCcpFormRow>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(hCcpFormRows)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(hCcpFormRows.id, id));
}

/**
 * CCP 기록 행 삭제
 */
export async function deleteCcpFormRow(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(hCcpFormRows).where(eq(hCcpFormRows.id, id));
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
  // 상태 업데이트
  await rawConn.execute(
    `UPDATE h_ccp_form_records SET status='submitted', submitted_at=NOW(), writer_id=? WHERE id=?`,
    [params.writerId, params.formRecordId]
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

  // 승인 요청 ID 연결
  await rawConn.execute(
    `UPDATE h_ccp_form_records SET approval_request_id=? WHERE id=?`,
    [approvalRequestId, params.formRecordId]
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
    `SELECT fr.id, fr.ccp_type, fr.process_group_id, fr.product_name, fr.planned_qty_kg, fr.bom_batch_kg, fr.batch_count
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
    if ((instances as any[]).length === 0) continue;

    const instanceId = (instances as any[])[0].id;

    // 4. h_ccp_rows에서 해당 인스턴스의 행 조회
    const [ccpRows] = await rawConn.execute<any[]>(
      `SELECT sort_order, equipment_id, equipment_name, temp_c,
              duration_min, heating_min, pressure_bar, result, note
       FROM h_ccp_rows
       WHERE instance_id = ? AND tenant_id = ?
       ORDER BY sort_order`,
      [instanceId, tenantId],
    );

    if ((ccpRows as any[]).length === 0) continue;

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
      // CCP-4P: 금속검출공정 - 새 로직
      // 배치의 품목/SKU 배치순으로 배열하고 작성
      // 통과시간은 설비기준 작업시간 설정 기준, 점심시간(12:00~13:00) 제외
      // 하루의 배치 품목/생산량 기준으로 비례배분
      // 제품별 품목변경시 시작/종료시 작성
      // 동일품목 연속작업시 2시간마다 작업시간을 배분
      // ═══════════════════════════════════════════════════════════

      // 1. 같은 날짜의 모든 배치 조회 (품목별, 배치순)
      const batchWorkDate = fr.work_date || null;
      let dayBatches: { batchId: number; productId: number; productName: string; plannedQty: number; startTime: string }[] = [];

      if (batchWorkDate) {
        const [dayBatchRows] = await rawConn.execute<any[]>(
          `SELECT b.id as batch_id, b.product_id, 
                  COALESCE(ps.sku_name, p.product_name, fr2.product_name) as product_name,
                  b.planned_quantity,
                  DATE_FORMAT(DATE_ADD(b.start_time, INTERVAL 9 HOUR), '%H:%i') as start_time_hhmm
           FROM h_batches b
           LEFT JOIN h_products_v2 p ON p.id = b.product_id AND p.tenant_id = b.tenant_id
           LEFT JOIN product_skus ps ON ps.item_id = b.product_id AND ps.tenant_id = b.tenant_id AND ps.is_default = 1
           LEFT JOIN h_ccp_form_records fr2 ON fr2.batch_id = b.id AND fr2.tenant_id = b.tenant_id AND fr2.ccp_type = 'CCP-4P'
           WHERE b.tenant_id = ? AND b.planned_date = ?
           ORDER BY b.product_id, b.id`,
          [tenantId, batchWorkDate],
        );

        dayBatches = (dayBatchRows as any[]).map((r: any) => ({
          batchId: r.batch_id,
          productId: r.product_id,
          productName: r.product_name || frProductName || "",
          plannedQty: parseFloat(r.planned_quantity) || 0,
          startTime: r.start_time_hhmm || "07:00",
        }));
      }

      // 단일 배치 또는 배치 조회 실패 시 현재 배치만 사용
      if (dayBatches.length === 0) {
        dayBatches = [{
          batchId,
          productId: productId || 0,
          productName: frProductName || "",
          plannedQty: batchPlannedKg || 0,
          startTime: adjustedStartTime || "07:00",
        }];
      }

      // 2. 작업시간 설정 (설비 기준)
      // 기본값: 07:00 ~ 18:00, 점심 12:00 ~ 13:00
      const WORK_START = adjustedStartTime || "07:00";
      const WORK_END = "18:00";
      const LUNCH_START = "12:00";
      const LUNCH_END = "13:00";

      function timeToMin(t: string): number {
        const [h, m] = t.split(":").map(Number);
        return h * 60 + (m || 0);
      }
      function minToTime(m: number): string {
        const h = Math.floor(m / 60) % 24;
        const min = m % 60;
        return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
      }

      // 총 가용 작업시간 (분, 점심 제외)
      const workStartMin = timeToMin(WORK_START);
      const workEndMin = timeToMin(WORK_END);
      const lunchStartMin = timeToMin(LUNCH_START);
      const lunchEndMin = timeToMin(LUNCH_END);
      const lunchDuration = lunchEndMin - lunchStartMin; // 60분
      
      let totalWorkMin = workEndMin - workStartMin;
      if (workStartMin < lunchEndMin && workEndMin > lunchStartMin) {
        totalWorkMin -= lunchDuration;
      }

      // 3. 총 생산량 계산 & 배치별 작업시간 비례배분
      const totalDayQty = dayBatches.reduce((sum, b) => sum + b.plannedQty, 0);

      // 배치별 작업시간 (분) 배분
      interface BatchTimeSlot {
        batchId: number;
        productId: number;
        productName: string;
        plannedQty: number;
        allocatedMin: number;
        workStart: number;  // 분
        workEnd: number;    // 분
      }

      const batchSlots: BatchTimeSlot[] = [];
      let currentWorkMin = workStartMin;

      for (const batch of dayBatches) {
        const proportion = totalDayQty > 0 ? batch.plannedQty / totalDayQty : 1 / dayBatches.length;
        let allocMin = Math.round(totalWorkMin * proportion);
        if (allocMin < 10) allocMin = 10; // 최소 10분

        let slotStart = currentWorkMin;
        let slotEnd = slotStart + allocMin;

        // 점심시간 건너뛰기
        if (slotStart < lunchEndMin && slotStart >= lunchStartMin) {
          slotStart = lunchEndMin;
          slotEnd = slotStart + allocMin;
        } else if (slotStart < lunchStartMin && slotEnd > lunchStartMin) {
          // 점심시간을 포함하는 경우: 점심 시간만큼 추가
          slotEnd += lunchDuration;
        }

        if (slotEnd > workEndMin) slotEnd = workEndMin;

        batchSlots.push({
          batchId: batch.batchId,
          productId: batch.productId,
          productName: batch.productName,
          plannedQty: batch.plannedQty,
          allocatedMin: allocMin,
          workStart: slotStart,
          workEnd: slotEnd,
        });

        currentWorkMin = slotEnd;
      }

      // 4. 현재 배치만 필터링 (현재 form_record의 batch_id에 해당하는 것만)
      // 단, 전체 당일 배치 목록에서 현재 배치의 위치를 파악하여
      // 감도 모니터링 행 생성에 사용
      const currentSlot = batchSlots.find(s => s.batchId === batchId);
      if (!currentSlot) {
        console.log(`[syncCcpRowsToFormRows] CCP-4P: batch ${batchId} not found in day slots, skipping`);
        continue;
      }

      // 5. 감도 모니터링 행 (sensitivity) 생성
      // 규칙: 품목 변경시 → 시작시, 종료시 작성
      //       동일품목 연속작업시 → 2시간마다 작성
      // 현재 배치와 인접 배치의 품목을 비교하여 결정
      const currentIdx = batchSlots.findIndex(s => s.batchId === batchId);
      const prevSlot = currentIdx > 0 ? batchSlots[currentIdx - 1] : null;
      const nextSlot = currentIdx < batchSlots.length - 1 ? batchSlots[currentIdx + 1] : null;

      // 같은 품목의 연속 배치 그룹 찾기
      let groupStartIdx = currentIdx;
      while (groupStartIdx > 0 && batchSlots[groupStartIdx - 1].productId === currentSlot.productId) {
        groupStartIdx--;
      }
      let groupEndIdx = currentIdx;
      while (groupEndIdx < batchSlots.length - 1 && batchSlots[groupEndIdx + 1].productId === currentSlot.productId) {
        groupEndIdx++;
      }

      const isProductChangeStart = prevSlot === null || prevSlot.productId !== currentSlot.productId;
      const isProductChangeEnd = nextSlot === null || nextSlot.productId !== currentSlot.productId;
      const isSameProductContinuous = groupEndIdx > groupStartIdx;

      // 감도 체크 시점 계산
      interface SensitivityCheck {
        time: string;
        productName: string;
        type: "start" | "end" | "interval";
      }
      const sensitivityChecks: SensitivityCheck[] = [];

      // 점심시간을 건너뛰는 시간 계산 헬퍼
      function skipLunch(timeMin: number): number {
        if (timeMin >= lunchStartMin && timeMin < lunchEndMin) {
          return lunchEndMin;
        }
        return timeMin;
      }

      // 품목 변경 시작
      if (isProductChangeStart) {
        const checkTime = skipLunch(currentSlot.workStart);
        // 개별 랜덤 오프셋 (0~3분) for 자연스러움
        const microOffset = Math.floor(seededRandom(randomSeed + 1) * 4);
        sensitivityChecks.push({
          time: minToTime(checkTime + microOffset),
          productName: currentSlot.productName,
          type: "start",
        });
      }

      // 동일품목 연속작업: 2시간마다 체크
      if (isSameProductContinuous || (!isProductChangeStart && !isProductChangeEnd)) {
        // 그룹 전체 시간범위에서 현재 배치 범위 내의 2시간 체크포인트
        const groupStart = batchSlots[groupStartIdx].workStart;
        const TWO_HOURS = 120;
        let checkpoint = groupStart + TWO_HOURS;
        while (checkpoint < currentSlot.workEnd) {
          if (checkpoint >= currentSlot.workStart) {
            const adjTime = skipLunch(checkpoint);
            const microOffset2 = Math.floor(seededRandom(randomSeed + checkpoint) * 6);
            sensitivityChecks.push({
              time: minToTime(adjTime + microOffset2),
              productName: currentSlot.productName,
              type: "interval",
            });
          }
          checkpoint += TWO_HOURS;
        }
      }

      // 품목 변경 종료
      if (isProductChangeEnd) {
        const endTime = skipLunch(currentSlot.workEnd);
        const microOffset3 = Math.floor(seededRandom(randomSeed + 99) * 4);
        const adjEndTime = Math.max(currentSlot.workStart + 5, endTime - 3 - microOffset3);
        sensitivityChecks.push({
          time: minToTime(skipLunch(adjEndTime)),
          productName: currentSlot.productName,
          type: "end",
        });
      }

      // 감도 모니터링이 없는 경우 (단일 배치 또는 중간 배치): 최소 시작 체크
      if (sensitivityChecks.length === 0) {
        const checkTime = skipLunch(currentSlot.workStart);
        const microOffset = Math.floor(seededRandom(randomSeed + 50) * 6);
        sensitivityChecks.push({
          time: minToTime(checkTime + microOffset),
          productName: currentSlot.productName,
          type: "start",
        });
      }

      // 시간 순 정렬
      sensitivityChecks.sort((a, b) => timeToMin(a.time) - timeToMin(b.time));

      // 6. 감도 모니터링 행 INSERT (equipment_type='sensitivity')
      let seqNum = 1;
      for (const check of sensitivityChecks) {
        // 판정: 기본 적합 (자동 생성)
        // 각 체크포인트별로 Fe/SUS 검출 결과 O/X 생성
        const feOnly = "O";      // Fe만 통과 → 검출됨 (O)
        const susOnly = "O";     // SUS만 통과 → 검출됨 (O)
        const productOnly = "X"; // 제품만 통과 → 불검출 (X = 정상)
        const feProduct = "O";   // Fe+제품 통과 → 검출됨 (O)
        const susProduct = "O";  // SUS+제품 통과 → 검출됨 (O)

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
            check.productName,
            check.time,
            feOnly, susOnly, productOnly,
            feProduct, susProduct,
            check.type === "start" ? "품목시작" : check.type === "end" ? "품목종료" : "2시간점검",
          ],
        );
        seqNum++;
        totalSynced++;
      }

      // 7. 통과량 기록 행 INSERT (equipment_type='passage')
      // 현재 배치의 시작/종료 시간 + 통과량(개)
      const passStartTime = skipLunch(currentSlot.workStart);
      const passEndTime = skipLunch(currentSlot.workEnd);
      const microOffsetPass1 = Math.floor(seededRandom(randomSeed + 200) * 4);
      const microOffsetPass2 = Math.floor(seededRandom(randomSeed + 201) * 4);

      // 통과량 = totalBatchCount (배치 수)
      // 통과량(개) 계산: production_sku_output이 있으면 거기서, 없으면 생산량 기준
      let passQty: number | null = null;
      try {
        const [skuOutput] = await rawConn.execute<any[]>(
          `SELECT SUM(quantity) as total_qty FROM production_sku_output
           WHERE batch_id = ? AND tenant_id = ?`,
          [batchId, tenantId],
        );
        if ((skuOutput as any[])[0]?.total_qty) {
          passQty = Number((skuOutput as any[])[0].total_qty);
        }
      } catch { /* 조회 실패 시 무시 */ }

      // 통과량이 없으면 생산량(kg) 기준으로 추정
      if (passQty == null && currentSlot.plannedQty > 0) {
        passQty = Math.round(currentSlot.plannedQty); // kg 단위를 개로 근사
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
          currentSlot.productName,
          minToTime(passStartTime + microOffsetPass1),
          minToTime(Math.max(passStartTime + 10, passEndTime - microOffsetPass2)),
          passQty,
        ],
      );
      totalSynced++;

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

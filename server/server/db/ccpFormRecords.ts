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

  // 1. 해당 배치의 모든 form records 조회
  const [formRecords] = await rawConn.execute<any[]>(
    `SELECT fr.id, fr.ccp_type, fr.process_group_id, fr.product_name, fr.planned_qty_kg
     FROM h_ccp_form_records fr
     WHERE fr.batch_id = ? AND fr.tenant_id = ?`,
    [batchId, tenantId],
  );

  if ((formRecords as any[]).length === 0) {
    console.log(`[syncCcpRowsToFormRows] No form records for batch ${batchId}`);
    return { synced: 0 };
  }

  // 배치 정보 조회 (product_name, planned_quantity)
  const [batchInfo] = await rawConn.execute<any[]>(
    `SELECT b.planned_quantity, p.product_name as p_name
     FROM h_batches b
     LEFT JOIN h_products_v2 p ON p.id = b.product_id AND p.tenant_id = b.tenant_id
     WHERE b.id = ? AND b.tenant_id = ?
     LIMIT 1`,
    [batchId, tenantId],
  );
  const batchProductName = (batchInfo as any[])[0]?.p_name || "";
  const batchPlannedKg = (batchInfo as any[])[0]?.planned_quantity || null;

  let totalSynced = 0;

  for (const fr of formRecords as any[]) {
    const formRecordId = fr.id;
    const ccpType = fr.ccp_type;
    const frProductName = fr.product_name || batchProductName;

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

    // 5. h_ccp_form_rows에 삽입
    for (const row of ccpRows as any[]) {
      const batchSeq = row.sort_order || 1;

      if (ccpType === "CCP-4P") {
        // 금속검출: Fe/SUS 행
        const isFe = row.note?.includes("Fe") || row.sort_order === 1;
        await rawConn.execute(
          `INSERT INTO h_ccp_form_rows
             (tenant_id, form_record_id, batch_seq, equipment_id, equipment_name,
              product_name, result, note, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [
            tenantId, formRecordId, batchSeq,
            row.equipment_id ?? null,
            row.equipment_name ?? (isFe ? "Fe 검출" : "SUS 검출"),
            frProductName || null,
            row.result === "PASS" ? "적합" : "부적합",
            row.note ?? null,
          ],
        );
      } else {
        // CCP-1B / CCP-2B: 온도/시간/압력
        // pressure_bar(bar) → pressure_mpa(MPa): ÷10
        const pressureMpa = row.pressure_bar != null
          ? (parseFloat(row.pressure_bar) / 10).toFixed(3)
          : null;

        await rawConn.execute(
          `INSERT INTO h_ccp_form_rows
             (tenant_id, form_record_id, batch_seq,
              equipment_id, equipment_name, equipment_type,
              product_name, input_qty_kg,
              heat_time_min, heat_temp_c, pressure_mpa,
              result, note, created_at, updated_at)
           VALUES (?, ?, ?,
                   ?, ?, NULL,
                   ?, ?,
                   ?, ?, ?,
                   ?, ?, NOW(), NOW())`,
          [
            tenantId, formRecordId, batchSeq,
            row.equipment_id ?? null,
            row.equipment_name ?? null,
            frProductName || null,
            batchPlannedKg ?? null,
            row.heating_min ?? row.duration_min ?? null,
            row.temp_c ?? null,
            pressureMpa,
            row.result === "PASS" ? "적합" : "부적합",
            row.note ?? null,
          ],
        );
      }
      totalSynced++;
    }

    console.log(`[syncCcpRowsToFormRows] form_record=${formRecordId}(${ccpType}) ← ${(ccpRows as any[]).length} rows synced`);
  }

  return { synced: totalSynced };
}

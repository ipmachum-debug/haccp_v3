/**
 * CCP 기록 행 CRUD + 동기화
 * ccpFormRecords.ts에서 분할
 */
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
import { getDb, getRawConnection } from "../connection";
import { todayKST, toKSTTimestamp } from "../../utils/timezone";
import {
  hCcpFormRecords,
  hCcpFormRows,
  type InsertCcpFormRecord,
  type InsertCcpFormRow,
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

export async function getCcpFormRows(formRecordId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const conditions = tenantId
    ? and(eq(hCcpFormRows.formRecordId, formRecordId), eq(hCcpFormRows.tenantId, tenantId))
    : eq(hCcpFormRows.formRecordId, formRecordId);
  const rows = await db
    .select()
    .from(hCcpFormRows)
    .where(conditions)
    .orderBy(hCcpFormRows.batchSeq);
  // 통과량 단위(pass_unit) — Drizzle 스키마 밖 컬럼이라 따로 읽는다 (마이그레이션 전 DB 에서도 깨지지 않게, 2026-10-18)
  try {
    const conn = await getRawConnection();
    const [u]: any = await conn.execute(
      `SELECT id, pass_unit FROM h_ccp_form_rows WHERE form_record_id = ?${tenantId ? " AND tenant_id = ?" : ""} AND pass_unit IS NOT NULL`,
      tenantId ? [formRecordId, tenantId] : [formRecordId],
    );
    const unit = new Map((u as any[]).map((r) => [Number(r.id), String(r.pass_unit)]));
    if (unit.size) return rows.map((r: any) => ({ ...r, passUnit: unit.get(Number(r.id)) ?? null }));
  } catch (e: any) {
    if (e?.code !== "ER_BAD_FIELD_ERROR") throw e;
  }
  return rows;
}

/**
 * CCP 기록 행 저장 (upsert by formRecordId + batchSeq)
 * P0: tenantId 필수 - 테넌트 격리
 */
export async function upsertCcpFormRow(data: InsertCcpFormRow) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  // 승인된 기록지는 수정 거부, 그 밖에는 행 버전을 올려 기존 확인(제출)을 무효화 (2026-10-18)
  if (data.tenantId && data.formRecordId) {
    const { bumpSheetVersion } = await import("../../lib/haccp/ccpSheetConfirm");
    await bumpSheetVersion(await getRawConnection(), Number(data.formRecordId), Number(data.tenantId));
  }

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

    // form_record에서 batch_id, ccp_type, 공정 조회
    const [frRows] = await rawConn.execute<any[]>(
      `SELECT batch_id, ccp_type, process_group_id, DATE_FORMAT(work_date, '%Y-%m-%d') AS wd FROM h_ccp_form_records WHERE id = ? AND tenant_id = ?`,
      [formRecordId, tenantId]
    );
    if (!(frRows as any[]).length) return;
    const { batch_id: batchId, ccp_type: ccpType, process_group_id: processGroupId, wd } = (frRows as any[])[0];

    // 같은 공정의 인스턴스 — 같은 CCP 유형 공정이 둘(교반 + 증숙)이면 유형만으로는 엉뚱한 공정에 쓴다 (2026-10-18)
    const [instRows] = await rawConn.execute<any[]>(
      `SELECT id FROM h_ccp_instances WHERE batch_id = ? AND ccp_type = ? AND tenant_id = ?${processGroupId ? " AND process_group_id = ?" : ""} LIMIT 1`,
      processGroupId ? [batchId, ccpType, tenantId, processGroupId] : [batchId, ccpType, tenantId]
    );
    if (!(instRows as any[]).length) return;
    const instanceId = (instRows as any[])[0].id;

    // 측정값 매핑: form_rows 컬럼 → ccp_rows 컬럼
    // 단위·의미 (2026-10-18): 기록지 압력은 MPa, h_ccp_rows 는 bar → ×10 (이전엔 그대로 복사해 1/10 값).
    //   기록지 가열시간은 가열 운전시간 → heating_min (이전엔 설비 점유시간 duration_min 에 썼다).
    const tempC = data.heatTempC != null ? parseFloat(String(data.heatTempC)) : null;
    const heatingMin = data.heatTimeMin ?? null;
    const pressureBar = data.pressureMpa != null ? Math.round(parseFloat(String(data.pressureMpa)) * 10 * 1000) / 1000 : null;
    // measuredAt은 아래 fullMeasuredAt에서 work_date 기반으로 정확히 계산
    const result = data.result === "적합" ? "PASS" : data.result === "부적합" ? "FAIL" : "PASS";
    const equipmentId = data.equipmentId ?? null;
    const equipmentName = data.equipmentName ?? null;

    // 올바른 날짜 설정: form_record의 work_date + measurement_time
    const workDate = wd || todayKST();
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
        `UPDATE h_ccp_rows SET temp_c = ?, heating_min = ?, pressure_bar = ?, result = ?,
         measured_at = ?, equipment_id = ?, equipment_name = ?, auto_generated = 0
         WHERE id = ? AND tenant_id = ?`,
        [tempC, heatingMin, pressureBar, result, fullMeasuredAt,
         equipmentId, equipmentName, (existingRows as any[])[0].id, tenantId]
      );
    } else {
      await rawConn.execute(
        `INSERT INTO h_ccp_rows (instance_id, equipment_id, equipment_name, sort_order,
         measured_at, temp_c, heating_min, pressure_bar, result, auto_generated, tenant_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        [instanceId, equipmentId, equipmentName, batchSeq,
         fullMeasuredAt, tempC, heatingMin, pressureBar, result, tenantId]
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
  if (tenantId) {
    const conn = await getRawConnection();
    const [fr]: any = await conn.execute(`SELECT form_record_id FROM h_ccp_form_rows WHERE id = ? AND tenant_id = ? LIMIT 1`, [id, tenantId]);
    const formRecordId = (fr as any[])[0]?.form_record_id;
    if (formRecordId) {
      const { bumpSheetVersion } = await import("../../lib/haccp/ccpSheetConfirm");
      await bumpSheetVersion(conn, Number(formRecordId), Number(tenantId));
    }
  }
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

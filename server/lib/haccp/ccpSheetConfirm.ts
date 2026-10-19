/**
 * CCP 기록지 '제출 = 시트 확인' (2026-10-18, CEO 결정)
 *
 * - 미리 채운 적합값은 사람이 제출(확인)하기 전까지 미확정 초안이다.
 * - 사람이 직접 누른 제출만 확인 이력으로 인정 — 확인자·서버 시각·확인한 기록 버전(rows_version)을 남긴다.
 *   배치 생성 때 자동으로 submitted 가 된 기록지는 확인되지 않은 상태다.
 * - 서버에서 막는 것: 필수값 누락 · 한계기준 이탈인데 '적합' · 이탈(부적합)인데 이탈내용·개선조치 없음 · 아직 시점이 오지 않은 점검.
 * - 진행 저장은 허용 (행 저장은 막지 않음). 최종 제출만 막는다.
 * - 제출 뒤 측정값을 바꾸면 rows_version 이 올라가 기존 확인이 무효가 된다 → 다시 제출해야 승인 가능.
 * - 승인된 기록지는 행을 수정할 수 없다 (반려 후 수정).
 * 제출은 확인 행위의 기록이지 실제 측정을 대신하지 않는다.
 */
import { getRawConnection } from "../../db/connection";
import { todayKST, nowKST } from "../../utils/timezone";

export interface SheetRecord {
  id: number;
  ccpType: string;
  workDate: string; // YYYY-MM-DD
  status: string;
  clHeatTimeMinLo: number | null;
  clHeatTimeMinHi: number | null;
  clHeatTempLo: number | null;
  clPressureMpaLo: number | null;
  clProductTempLo: number | null;
  /** 현장 확인 기록지 — 행마다 사람이 확인해야 제출 (2026-10-19) */
  fieldMode?: boolean;
}
export interface SheetRow {
  batchSeq: number;
  equipmentType: string | null;
  measurementTime: string | null;
  heatTimeMin: number | null;
  heatTempC: number | null;
  pressureMpa: number | null;
  tempEdgeC: number | null;
  tempCenterC: number | null;
  result: string | null;
  isDeviation: number | null;
  deviationNote: string | null;
  correctiveAction: string | null;
  metalPassTime: string | null;
  metalFeMid: string | null;
  metalSusMid: string | null;
  metalProductOnly: string | null;
  metalFeProduct: string | null;
  metalSusProduct: string | null;
  passTimeStart: string | null;
  passTimeEnd: string | null;
  passQty: number | null;
  /** 행 확인이 있고 그 뒤 바뀌지 않았는가 (현장 확인 기록지) */
  rowConfirmed?: boolean;
}

const hhmm = (v: string | null) => (v ? String(v).slice(0, 5) : null);
const has = (v: unknown) => v != null && String(v).trim() !== "";

/** 순수 검사 — 막을 이유 목록 (빈 배열이면 제출 가능) */
export function validateSheetForConfirm(rec: SheetRecord, rows: SheetRow[], now: { date: string; time: string }): string[] {
  const problems: string[] = [];
  if (rec.status === "approved") return ["이미 승인된 기록지입니다."];
  if (rows.length === 0) return ["기록 행이 없습니다."];
  if (rec.workDate > now.date) return [`작업일(${rec.workDate})이 아직 오지 않았습니다 — 미래 점검은 확인할 수 없습니다.`];
  const today = rec.workDate === now.date;
  const nowHm = now.time.slice(0, 5);
  const label = (r: SheetRow) => `${r.batchSeq}번 행`;

  for (const r of rows) {
    // 현장 확인 기록지: 행마다 사람의 확인이 있어야 한다 (확인 뒤 고치면 그 확인은 무효 — 다시 확인)
    if (rec.fieldMode && !r.rowConfirmed) { problems.push(`${label(r)}: 현장 확인 전입니다.`); continue; }
    const kind = rec.ccpType === "CCP-4P" ? (has(r.passTimeStart) || has(r.passQty) || r.equipmentType === "passage" ? "passage" : "sensitivity") : "heat";
    const due = kind === "passage" ? hhmm(r.passTimeEnd) : kind === "sensitivity" ? hhmm(r.metalPassTime) : hhmm(r.measurementTime);
    if (today && due && due > nowHm) { problems.push(`${label(r)}: 예정 시각 ${due} 이 아직 오지 않았습니다.`); continue; }
    if (!has(r.result)) problems.push(`${label(r)}: 판정이 없습니다.`);

    if (kind === "heat") {
      // 필수 실측값 — 기준(CL)이 정해진 항목은 값이 있어야 한다. 0 은 값, 빈칸(NULL)은 없음. '적합' 판정 글자는 실측을 대신하지 않는다 (Codex #590 R590-03)
      if (!has(r.measurementTime)) problems.push(`${label(r)}: 측정시각이 없습니다.`);
      if (r.heatTimeMin == null) problems.push(`${label(r)}: 가열시간이 없습니다.`);
      const prodLo = rec.ccpType === "CCP-1B" ? (rec.clProductTempLo ?? rec.clHeatTempLo) : null;
      if (prodLo != null) {
        if (r.tempCenterC == null) problems.push(`${label(r)}: 중심 품온이 없습니다.`);
        if (r.tempEdgeC == null) problems.push(`${label(r)}: 모서리 품온이 없습니다.`);
      }
      if (rec.ccpType === "CCP-1B" && rec.clPressureMpaLo != null && r.pressureMpa == null) problems.push(`${label(r)}: 압력이 없습니다.`);
      if (rec.ccpType === "CCP-2B" && rec.clHeatTempLo != null && r.heatTempC == null) problems.push(`${label(r)}: 가열온도가 없습니다.`);
      // 한계기준 이탈 판정 — 정한 기준만 본다
      const out: string[] = [];
      if (r.heatTimeMin != null && rec.clHeatTimeMinLo != null && r.heatTimeMin < rec.clHeatTimeMinLo) out.push(`가열시간 ${r.heatTimeMin} < ${rec.clHeatTimeMinLo}분`);
      if (r.heatTimeMin != null && rec.clHeatTimeMinHi != null && r.heatTimeMin > rec.clHeatTimeMinHi) out.push(`가열시간 ${r.heatTimeMin} > ${rec.clHeatTimeMinHi}분`);
      if (r.pressureMpa != null && rec.clPressureMpaLo != null && r.pressureMpa < rec.clPressureMpaLo) out.push(`압력 ${r.pressureMpa} < ${rec.clPressureMpaLo}MPa`);
      if (prodLo != null) {
        for (const [nm, v] of [["중심 품온", r.tempCenterC], ["모서리 품온", r.tempEdgeC]] as const) if (v != null && v < prodLo) out.push(`${nm} ${v} < ${prodLo}℃`);
      }
      if (rec.ccpType === "CCP-2B" && r.heatTempC != null && rec.clHeatTempLo != null && r.heatTempC < rec.clHeatTempLo) out.push(`가열온도 ${r.heatTempC} < ${rec.clHeatTempLo}℃`);
      if (out.length && r.result === "적합") problems.push(`${label(r)}: 한계기준 이탈(${out.join(", ")})인데 '적합' 입니다.`);
    }
    if (kind === "sensitivity") {
      if (!has(r.metalPassTime)) problems.push(`${label(r)}: 점검 시각이 없습니다.`);
      const expect = { metalFeMid: "O", metalSusMid: "O", metalProductOnly: "X", metalFeProduct: "O", metalSusProduct: "O" } as const;
      const SENS_LABEL = { metalFeMid: "Fe 단독", metalSusMid: "SUS 단독", metalProductOnly: "제품 단독", metalFeProduct: "Fe+제품", metalSusProduct: "SUS+제품" } as const;
      const keys = Object.keys(expect) as Array<keyof typeof expect>;
      const blank = keys.filter((k) => !has(r[k]));
      if (blank.length) problems.push(`${label(r)}: 감도 점검 결과(${blank.map((k) => SENS_LABEL[k]).join("·")})가 없습니다.`);
      const bad = keys.filter((k) => has(r[k]) && String(r[k]).toUpperCase() !== expect[k]);
      if (bad.length && r.result === "적합") problems.push(`${label(r)}: 감도 점검 결과가 기준과 다른데 '적합' 입니다.`);
    }
    if (kind === "passage") {
      if (!has(r.passTimeStart) || !has(r.passTimeEnd)) problems.push(`${label(r)}: 통과 시작·종료 시각이 없습니다.`);
      if (r.passQty == null) problems.push(`${label(r)}: 통과량이 없습니다.`);
    }
    // 부적합(이탈)은 이탈내용과 개선조치 둘 다 있어야 한다 (Codex #590 R590-04)
    if (r.result === "부적합" || r.isDeviation === 1) {
      if (!has(r.deviationNote)) problems.push(`${label(r)}: 부적합인데 이탈내용이 없습니다.`);
      if (!has(r.correctiveAction)) problems.push(`${label(r)}: 부적합인데 개선조치가 없습니다.`);
    }
  }
  return problems;
}

const num = (v: unknown) => (v == null || v === "" ? null : Number(v));

/** 기록지·행을 읽어 검사 */
export async function checkSheet(formRecordId: number, tenantId: number): Promise<{ record: SheetRecord & { rowsVersion: number }; problems: string[] }> {
  const conn = await getRawConnection();
  const [rs]: any = await conn.execute(
    `SELECT id, ccp_type, DATE_FORMAT(work_date, '%Y-%m-%d') AS wd, status, rows_version, field_mode,
            cl_heat_time_min_lo, cl_heat_time_min_hi, cl_heat_temp_lo, cl_pressure_mpa_lo, cl_product_temp_lo
       FROM h_ccp_form_records WHERE id = ? AND tenant_id = ? LIMIT 1`,
    [formRecordId, tenantId],
  );
  const r = (rs as any[])[0];
  if (!r) throw new Error("기록지를 찾을 수 없습니다.");
  const record = {
    id: Number(r.id), ccpType: String(r.ccp_type), workDate: String(r.wd), status: String(r.status), rowsVersion: Number(r.rows_version ?? 0),
    clHeatTimeMinLo: num(r.cl_heat_time_min_lo), clHeatTimeMinHi: num(r.cl_heat_time_min_hi), clHeatTempLo: num(r.cl_heat_temp_lo),
    clPressureMpaLo: num(r.cl_pressure_mpa_lo), clProductTempLo: num(r.cl_product_temp_lo), fieldMode: Number(r.field_mode ?? 0) === 1,
  };
  const [rws]: any = await conn.execute(
    `SELECT batch_seq, equipment_type, measurement_time, heat_time_min, heat_temp_c, pressure_mpa, temp_edge_c, temp_center_c,
            result, is_deviation, deviation_note, corrective_action,
            metal_pass_time, metal_fe_mid, metal_sus_mid, metal_product_only, metal_fe_product, metal_sus_product,
            pass_time_start, pass_time_end, pass_qty, row_version, row_confirmed_at, row_confirmed_version
       FROM h_ccp_form_rows WHERE form_record_id = ? AND tenant_id = ? ORDER BY batch_seq`,
    [formRecordId, tenantId],
  );
  const rows: SheetRow[] = (rws as any[]).map((x) => ({
    batchSeq: Number(x.batch_seq), equipmentType: x.equipment_type ?? null, measurementTime: x.measurement_time ?? null,
    heatTimeMin: num(x.heat_time_min), heatTempC: num(x.heat_temp_c), pressureMpa: num(x.pressure_mpa),
    tempEdgeC: num(x.temp_edge_c), tempCenterC: num(x.temp_center_c), result: x.result ?? null, isDeviation: num(x.is_deviation),
    deviationNote: x.deviation_note ?? null, correctiveAction: x.corrective_action ?? null,
    metalPassTime: x.metal_pass_time ?? null, metalFeMid: x.metal_fe_mid ?? null, metalSusMid: x.metal_sus_mid ?? null,
    metalProductOnly: x.metal_product_only ?? null, metalFeProduct: x.metal_fe_product ?? null, metalSusProduct: x.metal_sus_product ?? null,
    passTimeStart: x.pass_time_start ?? null, passTimeEnd: x.pass_time_end ?? null, passQty: num(x.pass_qty),
    rowConfirmed: x.row_confirmed_at != null && Number(x.row_confirmed_version) === Number(x.row_version ?? 0),
  }));
  return { record, problems: validateSheetForConfirm(record, rows, { date: todayKST(), time: nowKST() }) };
}

/** 사람이 누른 제출 — 검사 통과 시 확인 이력 저장. 막히면 이유와 함께 오류 */
export async function confirmSheet(formRecordId: number, tenantId: number, userId: number): Promise<{ rowsVersion: number }> {
  const { record, problems } = await checkSheet(formRecordId, tenantId);
  if (problems.length) {
    const head = problems.slice(0, 5).join(" / ");
    throw new Error(`제출할 수 없습니다 — ${head}${problems.length > 5 ? ` 외 ${problems.length - 5}건` : ""}`);
  }
  const conn = await getRawConnection();
  await conn.execute(
    `UPDATE h_ccp_form_records SET confirmed_by = ?, confirmed_at = NOW(), confirmed_rows_version = ? WHERE id = ? AND tenant_id = ? AND rows_version = ?`,
    [userId, record.rowsVersion, formRecordId, tenantId, record.rowsVersion],
  );
  return { rowsVersion: record.rowsVersion };
}

/** 행이 바뀔 때 — 승인된 기록지는 거부, 그 밖에는 버전을 올려 기존 확인을 무효화 */
export async function bumpSheetVersion(conn: any, formRecordId: number, tenantId: number): Promise<void> {
  const [rs]: any = await conn.execute(`SELECT status FROM h_ccp_form_records WHERE id = ? AND tenant_id = ? LIMIT 1`, [formRecordId, tenantId]);
  const st = (rs as any[])[0]?.status;
  if (st === "approved") throw new Error("승인된 기록지는 수정할 수 없습니다 — 반려 후 수정하세요.");
  try {
    await conn.execute(`UPDATE h_ccp_form_records SET rows_version = rows_version + 1 WHERE id = ? AND tenant_id = ?`, [formRecordId, tenantId]);
  } catch (e: any) {
    if (e?.code !== "ER_BAD_FIELD_ERROR") throw e; // 컬럼 생성 전 DB
  }
}

/** 승인 관문용 — 사람 확인이 있고 그 뒤 바뀌지 않았는가 */
export function isConfirmed(f: { confirmedAt: unknown; confirmedRowsVersion: unknown; rowsVersion: unknown }): boolean {
  return f.confirmedAt != null && f.confirmedRowsVersion != null && Number(f.confirmedRowsVersion) === Number(f.rowsVersion ?? 0);
}

/** 기록지 단독 승인(ccp_form_record 요청) 전 — 사람 확인이 없거나 확인 뒤 바뀌었으면 거부 */
export async function assertSheetConfirmedForApproval(formRecordId: number, tenantId: number): Promise<void> {
  const conn = await getRawConnection();
  let rs: any;
  try {
    [rs] = await conn.execute(
      `SELECT rows_version, confirmed_at, confirmed_rows_version FROM h_ccp_form_records WHERE id = ? AND tenant_id = ? LIMIT 1`,
      [formRecordId, tenantId],
    );
  } catch (e: any) {
    if (e?.code === "ER_BAD_FIELD_ERROR") return; // 컬럼 생성 전 DB — 이전 동작
    throw e;
  }
  const r = (rs as any[])[0];
  if (!r) return;
  if (!isConfirmed({ confirmedAt: r.confirmed_at, confirmedRowsVersion: r.confirmed_rows_version, rowsVersion: r.rows_version })) {
    throw new Error("CCP 기록지가 작업자 제출(시트 확인) 전이거나 확인 뒤 수정됐습니다 — 기록지에서 제출한 뒤 승인하세요.");
  }
}

/**
 * CCP 기록지 단독 요청(ccp_form_record) 승인 — 모든 승인 경로 공통 (2026-10-18, Codex #590 R590-02)
 *   개별·바로·일괄 승인(genericChecklist)·최종 승인(finalApproveRequest)·approveRequest 가 요청 상태를 바꾸기 **전에** 부른다.
 *   확인 관문 → 기록지 approved(+ 인쇄 문구 고정) → 실제로 approved 가 됐는지 다시 읽어 확인. 실패하면 오류 → 요청도 승인되지 않는다.
 *   (이전: 바로 승인이 요청만 approved 로 바꾸고 기록지는 submitted·미확인 그대로 — 요청 3644 / 기록지 1847)
 */
export async function approveCcpFormRecord(formRecordId: number, tenantId: number, userId: number): Promise<void> {
  await assertSheetConfirmedForApproval(formRecordId, tenantId);
  const { applyCcpFormDecision } = await import("../../db/haccp/ccpStatusSync");
  await applyCcpFormDecision({ formRecordId, decision: "approved", userId, tenantId });
  const conn = await getRawConnection();
  const [rs]: any = await conn.execute(`SELECT status FROM h_ccp_form_records WHERE id = ? AND tenant_id = ? LIMIT 1`, [formRecordId, tenantId]);
  if ((rs as any[])[0]?.status !== "approved") throw new Error(`CCP 기록지 #${formRecordId} 승인 반영에 실패했습니다 — 요청을 승인하지 않았습니다.`);
}

/** CCP 기록지 단독 요청 반려 — 기록지도 반려(고정 문구 해제) */
export async function rejectCcpFormRecord(formRecordId: number, tenantId: number, userId: number, reason?: string): Promise<void> {
  const { applyCcpFormDecision } = await import("../../db/haccp/ccpStatusSync");
  await applyCcpFormDecision({ formRecordId, decision: "rejected", userId, tenantId, reason });
}

/**
 * 승인관리 목록용 — CCP 기록지 단독 요청에 작업자 시트 확인 여부를 붙인다 (Codex #590 UX: '검토중'과 '미확인' 구분)
 *   ccpSheetConfirmed: true(확인됨) / false(미확인) / 없음(CCP 기록지 요청이 아니거나 확인 컬럼 생성 전 DB)
 */
export async function attachCcpSheetConfirmState<T extends { referenceType?: unknown; referenceId?: unknown }>(
  items: T[],
  tenantId: number,
): Promise<Array<T & { ccpSheetConfirmed?: boolean }>> {
  const ids = Array.from(new Set(
    items.filter((it) => it.referenceType === "ccp_form_record").map((it) => Number(it.referenceId)).filter((n) => Number.isSafeInteger(n) && n > 0),
  ));
  if (!ids.length) return items;
  const state = new Map<number, boolean>();
  try {
    const conn = await getRawConnection();
    for (let i = 0; i < ids.length; i += 500) {
      const [rs]: any = await conn.query(
        `SELECT id, rows_version, confirmed_at, confirmed_rows_version FROM h_ccp_form_records WHERE tenant_id = ? AND id IN (?)`,
        [tenantId, ids.slice(i, i + 500)],
      );
      for (const r of rs as any[]) state.set(Number(r.id), isConfirmed({ confirmedAt: r.confirmed_at, confirmedRowsVersion: r.confirmed_rows_version, rowsVersion: r.rows_version }));
    }
  } catch (e: any) {
    if (e?.code === "ER_BAD_FIELD_ERROR") return items;
    throw e;
  }
  return items.map((it) => (it.referenceType === "ccp_form_record" && state.has(Number(it.referenceId)) ? { ...it, ccpSheetConfirmed: state.get(Number(it.referenceId)) } : it));
}

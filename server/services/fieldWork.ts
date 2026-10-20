/**
 * 현장 확인 — 하루 생산 흐름 (2026-10-19, CEO 확정 정책)
 *
 * 화면 하나에서: 내 설비의 오늘 일 → 평상값이 맞으면 [확인], 다르면 그 자리에서 고쳐 확인 → 남은 일 → 기록지 제출.
 *   - 가열·증숙·굽기 행: 확인한 시각 = CCP 확인 시각 (따로 시작·종료 없음). 예정 시각은 planned_time 에 따로.
 *   - 금속검출: 통과 행 [통과 시작]/[통과 종료](종료 = 그 행 확인), 감도점검 행 [확인](점검 시각 = 확인 시각). 실제 검출기를 행에 기록.
 *   - 원료: 예정 생산 건(plan_only)은 그날 첫 확인에서 한 번만 출고 — 가열 행 확인, 또는 금속검출만 하는 제품은 '통과 시작'.
 *     출고·예정 해제·행 확인·이력은 한 트랜잭션 (2026-10-20, #611 검토 P1) — 하나라도 실패하면 모두 없던 일.
 *     같은 생산 건의 다른 첫 확인은 생산 건 행 잠금에서 기다렸다가 이미 실행된 것을 보고 출고 없이 확인만.
 *   - 확인 뒤 고치면 그 확인은 무효 (행 버전↑) → 다시 확인. 기록지 확인(제출)도 행 버전이 바뀌어 무효.
 *   - 이력: 확인·수정·통과 시작/종료·무효 — 사람(개인 계정)·서버 시각·값·전/후·기기·세션·요청 키를 추가만 (h_ccp_row_events).
 *   - 같은 요청 키(중복 클릭·통신 재시도)는 한 번만 — 두 번째는 처음 결과를 그대로 돌려준다.
 *   - 다른 사람이 먼저 바꿨으면(행 버전 다름) 거부 — 화면이 새 값으로 다시 보여 준다.
 * 현장 확인 기록지(field_mode = 1)만. 예전 기록지는 예전 화면·규칙 그대로.
 */
import { getRawConnection } from "../db/connection";
import { todayKST, nowKST } from "../utils/timezone";
import { validateSheetForConfirm, bumpSheetVersion, quantityProblems, passCrossedMidnightRows, type SheetRecord, type SheetRow } from "../lib/haccp/ccpSheetConfirm";
import { activateBatchInTx, finishBatchActivation, resumeBatchActivation, type BatchActivation } from "./batchOrchestrator";

export interface ClientMeta { deviceId?: string | null; sessionId?: string | null; ip?: string | null; userAgent?: string | null }

export class FieldConflictError extends Error {
  constructor(message: string) { super(message); this.name = "FieldConflictError"; }
}
export class FieldRejectedError extends Error {
  constructor(public readonly problems: string[]) { super(problems.join(" / ")); this.name = "FieldRejectedError"; }
}

/** 고칠 수 있는 칸 — 화면 이름 → DB 칸 */
const EDITABLE: Record<string, string> = {
  heatTimeMin: "heat_time_min", heatTempC: "heat_temp_c", pressureMpa: "pressure_mpa", tempEdgeC: "temp_edge_c", tempCenterC: "temp_center_c",
  inputQtyKg: "input_qty_kg", result: "result", deviationNote: "deviation_note", correctiveAction: "corrective_action", specialNote: "special_note",
  metalFeMid: "metal_fe_mid", metalSusMid: "metal_sus_mid", metalProductOnly: "metal_product_only", metalFeProduct: "metal_fe_product", metalSusProduct: "metal_sus_product",
  passQty: "pass_qty", detectedQty: "detected_qty",
};
const ROW_COLS = `r.id, r.form_record_id, r.batch_seq, r.equipment_id, r.equipment_name, r.equipment_type, r.product_name, r.batch_id AS row_batch_id, r.note,
  r.planned_time, r.measurement_time, r.input_qty_kg, r.heat_time_min, r.heat_temp_c, r.pressure_mpa, r.temp_edge_c, r.temp_center_c,
  r.result, r.is_deviation, r.deviation_note, r.corrective_action, r.special_note,
  r.metal_pass_time, r.metal_fe_mid, r.metal_sus_mid, r.metal_product_only, r.metal_fe_product, r.metal_sus_product,
  r.pass_time_start, r.pass_time_end, r.pass_qty, r.pass_unit, r.detected_qty,
  r.row_version, r.row_confirmed_at, r.row_confirmed_by, r.row_confirmed_version`;

const n = (v: unknown) => (v == null || v === "" ? null : Number(v));
const hm = () => nowKST().slice(0, 5);
function kindOf(form: any, row: any): "heat" | "passage" | "sensitivity" {
  if (form.ccp_type !== "CCP-4P") return "heat";
  return row.equipment_type === "passage" ? "passage" : "sensitivity";
}
function snapshot(row: any) {
  const o: Record<string, unknown> = {};
  for (const [k, c] of Object.entries(EDITABLE)) o[k] = row[c] ?? null;
  o.measurementTime = row.measurement_time ?? null; o.metalPassTime = row.metal_pass_time ?? null;
  o.passTimeStart = row.pass_time_start ?? null; o.passTimeEnd = row.pass_time_end ?? null;
  o.confirmed = row.row_confirmed_at != null && Number(row.row_confirmed_version) === Number(row.row_version);
  o.equipmentId = row.equipment_id ?? null;
  return o;
}
function toSheet(form: any, row: any): { rec: SheetRecord; r: SheetRow } {
  return {
    rec: {
      id: Number(form.id), ccpType: String(form.ccp_type), workDate: String(form.wd), status: String(form.status),
      clHeatTimeMinLo: n(form.cl_heat_time_min_lo), clHeatTimeMinHi: n(form.cl_heat_time_min_hi), clHeatTempLo: n(form.cl_heat_temp_lo),
      clPressureMpaLo: n(form.cl_pressure_mpa_lo), clProductTempLo: n(form.cl_product_temp_lo),
      clHeatTempHi: n(form.cl_heat_temp_hi), clPressureMpaHi: n(form.cl_pressure_mpa_hi),
    },
    r: {
      batchSeq: Number(row.batch_seq), equipmentType: row.equipment_type ?? null, measurementTime: row.measurement_time ?? null,
      heatTimeMin: n(row.heat_time_min), heatTempC: n(row.heat_temp_c), pressureMpa: n(row.pressure_mpa), tempEdgeC: n(row.temp_edge_c), tempCenterC: n(row.temp_center_c),
      result: row.result ?? null, isDeviation: n(row.is_deviation), deviationNote: row.deviation_note ?? null, correctiveAction: row.corrective_action ?? null,
      metalPassTime: row.metal_pass_time ?? null, metalFeMid: row.metal_fe_mid ?? null, metalSusMid: row.metal_sus_mid ?? null, metalProductOnly: row.metal_product_only ?? null,
      metalFeProduct: row.metal_fe_product ?? null, metalSusProduct: row.metal_sus_product ?? null,
      passTimeStart: row.pass_time_start ?? null, passTimeEnd: row.pass_time_end ?? null, passQty: n(row.pass_qty),
      passUnit: row.pass_unit ?? null, detectedQty: n(row.detected_qty), passCrossesMidnight: !!row.__crossesMidnight,
    },
  };
}

async function loadRow(c: any, rowId: number, tenantId: number, lock: boolean) {
  const [[row]]: any = await c.execute(`SELECT ${ROW_COLS} FROM h_ccp_form_rows r WHERE r.id = ? AND r.tenant_id = ?${lock ? " FOR UPDATE" : ""}`, [rowId, tenantId]);
  if (!row) throw new FieldRejectedError(["이 회사의 기록 행이 아닙니다."]);
  const [[form]]: any = await c.execute(
    `SELECT id, batch_id, ccp_type, status, field_mode, voided_at, DATE_FORMAT(work_date, '%Y-%m-%d') AS wd,
            cl_heat_time_min_lo, cl_heat_time_min_hi, cl_heat_temp_lo, cl_pressure_mpa_lo, cl_product_temp_lo, cl_heat_temp_hi, cl_pressure_mpa_hi, detector_equipment_id
       FROM h_ccp_form_records WHERE id = ? AND tenant_id = ?`,
    [row.form_record_id, tenantId],
  );
  if (!form || Number(form.field_mode) !== 1) throw new FieldRejectedError(["현장 확인 기록지가 아닙니다 — 예전 기록지는 기록지 화면에서 고치세요."]);
  if (form.voided_at) throw new FieldRejectedError(["무효 처리된 생산 건의 기록지입니다."]);
  if (form.status === "approved") throw new FieldRejectedError(["승인된 기록지는 고칠 수 없습니다 — 반려 후 수정하세요."]);
  return { row, form };
}

async function priorResult(c: any, tenantId: number, requestId: string) {
  const [ev]: any = await c.execute(`SELECT form_row_id, event FROM h_ccp_row_events WHERE tenant_id = ? AND request_id = ? LIMIT 1`, [tenantId, requestId]);
  return (ev as any[])[0] ?? null;
}

async function addEvent(c: any, e: { tenantId: number; formId: number; rowId: number | null; event: string; userId: number; rowVersion: number | null; before: unknown; after: unknown; requestId: string; meta: ClientMeta }) {
  await c.execute(
    `INSERT INTO h_ccp_row_events (tenant_id, form_record_id, form_row_id, event, user_id, at, row_version, before_json, after_json, request_id, device_id, session_id, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, NOW(3), ?, ?, ?, ?, ?, ?, ?, ?)`,
    [e.tenantId, e.formId, e.rowId, e.event, e.userId, e.rowVersion, e.before == null ? null : JSON.stringify(e.before), e.after == null ? null : JSON.stringify(e.after),
      e.requestId, e.meta.deviceId?.slice(0, 64) ?? null, e.meta.sessionId?.slice(0, 64) ?? null, e.meta.ip?.slice(0, 64) ?? null, e.meta.userAgent?.slice(0, 255) ?? null],
  );
}

/**
 * 지난 날짜 기록의 실제 시각 (2026-10-20, 10/15 복구 뒤 사후 입력) — 화면 이름 → 칸.
 *   오늘 기록은 누른 시각이 측정 시각이지만, 지난 날짜(작업일 < 오늘) 기록을 오늘 확인하면 오늘 시각이 그날 측정 시각으로 남는다.
 *   그래서 지난 날짜는 실제 시각(종이 기록 등)을 사람이 넣어야 확인된다 — 지금 시각·예정 시각으로 채우지 않는다.
 *   오늘·예정 기록에서는 이 값을 쓰지 않는다 (누른 시각 그대로).
 */
const TIME_KEYS: Record<string, { col: string; label: string }> = {
  measurementTime: { col: "measurement_time", label: "측정" }, metalPassTime: { col: "metal_pass_time", label: "점검" },
  passTimeStart: { col: "pass_time_start", label: "통과 시작" }, passTimeEnd: { col: "pass_time_end", label: "통과 종료" },
};
type Values = Partial<Record<keyof typeof EDITABLE | keyof typeof TIME_KEYS, string | number | null>>;
type WriteAction = "confirm" | "edit" | "pass_start" | "pass_end";

/**
 * 한 행에 쓸 내용 계산 + 거부 검사 (DB 를 바꾸지 않는다).
 *   원료 출고(첫 확인) 전에 한 번, 행 잠금 뒤 한 번 — 거부될 확인이 출고를 먼저 일으키지 않도록.
 */
const NUMERIC_COLS = new Set(["heat_time_min", "heat_temp_c", "pressure_mpa", "temp_edge_c", "temp_center_c", "input_qty_kg", "pass_qty", "detected_qty"]);

function planWrite(form: any, row: any, input: { action: WriteAction; expectedRowVersion: number; values?: Values }, extra: { passCrossesMidnight?: boolean } = {}) {
  if (Number(row.row_version) !== Number(input.expectedRowVersion)) {
    throw new FieldConflictError("다른 사람이 먼저 이 행을 바꿨습니다 — 새 값을 확인한 뒤 다시 누르세요.");
  }
  const kind = kindOf(form, row);
  const sets: string[] = [];
  const vals: unknown[] = [];
  const after: Record<string, unknown> = { ...row };
  // 값 고치기 (화이트리스트)
  const past = String(form.wd ?? "") !== "" && String(form.wd) < todayKST();
  for (const [k, v] of Object.entries(input.values ?? {})) {
    if (TIME_KEYS[k]) continue; // 시각은 아래 동작에서만 (지난 날짜일 때)
    const col = EDITABLE[k];
    if (!col) throw new FieldRejectedError([`고칠 수 없는 칸입니다: ${k}`]);
    // 숫자 칸은 숫자만, 수량은 음수·자릿수 검사 (쓰기 경계 — #611 추가 검토 4)
    if (NUMERIC_COLS.has(col) && v != null && v !== "" && !Number.isFinite(Number(v))) throw new FieldRejectedError([`${k}: 숫자가 아닙니다.`]);
    if (col === "pass_qty" && v != null && v !== "") { const pr = quantityProblems("이 행", "통과량", v, String(row.pass_unit ?? "kg")); if (pr.length) throw new FieldRejectedError(pr); }
    if (col === "detected_qty" && v != null && v !== "") { const pr = quantityProblems("이 행", "검출 수", v, "ea"); if (pr.length) throw new FieldRejectedError(pr); }
    if (String(row[col] ?? "") === String(v ?? "")) continue;
    sets.push(`${col} = ?`); vals.push(v ?? null); after[col] = v ?? null;
  }
  const valueChanges = sets.length;
  if ("result" in (input.values ?? {})) { sets.push("is_deviation = ?"); vals.push(after.result === "부적합" ? 1 : 0); after.is_deviation = after.result === "부적합" ? 1 : 0; }

  let confirm = false;
  const t = hm();
  // 시각: 오늘 = 누른 시각, 지난 날짜 = 사람이 넣은 실제 시각 (없으면 거부 — 지금·예정 시각으로 채우지 않음)
  const timeOf = (key: keyof typeof TIME_KEYS): string => {
    if (!past) return t;
    const v = String((input.values as any)?.[key] ?? "").trim();
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) {
      throw new FieldRejectedError([`지난 날짜(${form.wd}) 기록입니다 — 실제 ${TIME_KEYS[key].label} 시각(종이 기록 등)을 넣어 확인하세요. 지금 시각이나 예정 시각으로 채우지 않습니다.`]);
    }
    return v;
  };
  if (input.action === "confirm") {
    if (kind === "passage") throw new FieldRejectedError(["통과 행은 [통과 종료] 로 확인합니다."]);
    if (kind === "heat") { const v = timeOf("measurementTime"); sets.push("measurement_time = ?"); vals.push(v); after.measurement_time = v; }
    else { const v = timeOf("metalPassTime"); sets.push("metal_pass_time = ?"); vals.push(v); after.metal_pass_time = v; }
    confirm = true;
  } else if (input.action === "pass_start") {
    if (kind !== "passage") throw new FieldRejectedError(["통과 행이 아닙니다."]);
    if (row.pass_time_start) throw new FieldRejectedError([`이미 ${String(row.pass_time_start).slice(0, 5)} 에 통과를 시작했습니다.`]);
    const det = form.detector_equipment_id != null ? Number(form.detector_equipment_id) : null;
    const v = timeOf("passTimeStart");
    sets.push("pass_time_start = ?"); vals.push(v); after.pass_time_start = v;
    if (det) { sets.push("equipment_id = ?"); vals.push(det); after.equipment_id = det; }
  } else if (input.action === "pass_end") {
    if (kind !== "passage") throw new FieldRejectedError(["통과 행이 아닙니다."]);
    if (!row.pass_time_start) {
      // 지난 날짜는 시작·종료를 한 번에 옮겨 적는다 (그날 [통과 시작] 을 누를 수 없으므로)
      if (!past) throw new FieldRejectedError(["먼저 [통과 시작] 을 누르세요."]);
      const s0 = timeOf("passTimeStart");
      const det = form.detector_equipment_id != null ? Number(form.detector_equipment_id) : null;
      sets.push("pass_time_start = ?"); vals.push(s0); after.pass_time_start = s0;
      if (det) { sets.push("equipment_id = ?"); vals.push(det); after.equipment_id = det; }
    }
    if (!row.pass_time_end) { const v = timeOf("passTimeEnd"); sets.push("pass_time_end = ?"); vals.push(v); after.pass_time_end = v; }
    confirm = true;
  }
  if (confirm) {
    // 확인 = 이 행 검사 통과 — 필수값·한계기준·부적합 조치 (기록지 제출과 같은 규칙)
    const { rec, r } = toSheet(form, { ...after, __crossesMidnight: !!extra.passCrossesMidnight });
    const problems = validateSheetForConfirm(rec, [r], { date: todayKST(), time: t + ":59" });
    if (problems.length) throw new FieldRejectedError(problems);
  }
  return { kind, sets, vals, confirm, valueChanges };
}

/** 이 쓰기가 예정 생산 건 실행(첫 확인)을 부르는지 — 가열 행 확인, 또는 금속검출 통과 행의 통과 시작 */
function activationBatchOf(form: any, row: any, action: WriteAction): number | null {
  const kind = kindOf(form, row);
  if (action === "confirm" && kind === "heat") return form.batch_id != null ? Number(form.batch_id) : null;
  if (action === "pass_start" && kind === "passage") return row.row_batch_id != null ? Number(row.row_batch_id) : null;
  // 지난 날짜 통과 행을 시작·종료 한 번에 옮겨 적을 때도 첫 통과 = 시작
  if (action === "pass_end" && kind === "passage" && !row.pass_time_start) return row.row_batch_id != null ? Number(row.row_batch_id) : null;
  return null;
}

/**
 * 한 행에 쓰기 — 확인 / 고치기 / 통과 시작 / 통과 종료. 한 트랜잭션, 같은 요청 키 한 번.
 *   confirm: 값(있으면 고친 값)을 저장하고 확인 — 측정(점검) 시각 = 지금. 검사(필수값·한계기준·이탈 조치)에 걸리면 저장하지 않음
 *   edit: 값만 저장 — 확인돼 있었으면 그 확인은 무효
 *   pass_start / pass_end: 금속검출 통과 행. 종료 = 그 행 확인
 * 한 트랜잭션 (2026-10-20, #611 검토 P1): 행 잠금 → 거부 검사(행 버전·값·한계기준·통과 조건) → (첫 확인이면) 생산 건 잠금·예정 해제·원료 출고
 *   → 행 저장 → 이력 → 커밋. 어느 단계가 실패하거나 프로세스가 멈춰도 출고·해제·확인·이력 중 일부만 남지 않는다.
 *   커밋 뒤 실행 단계(결재 요청·일지)는 생산 건에 '남음' 으로 표시돼 있어 실패해도 다음 확인 때 이어서 한다.
 */
export async function writeFieldRow(input: {
  tenantId: number; userId: number; rowId: number; action: WriteAction;
  expectedRowVersion: number; values?: Values; requestId: string; meta?: ClientMeta;
}, pool?: any): Promise<{ status: "done" | "duplicate"; rowId: number; rowVersion: number; confirmed: boolean }> {
  const p = pool ?? (await getRawConnection());
  const meta = input.meta ?? {};
  if (!/^[A-Za-z0-9._:-]{8,64}$/.test(input.requestId)) throw new FieldRejectedError(["요청 키가 올바르지 않습니다."]);
  // 같은 요청이 이미 처리됐으면 그대로 (중복 클릭·재시도) — 재고·행·이력은 다시 처리하지 않고, 남은 실행 단계만 이어서 (#612 추가 검토 3)
  const prev = await priorResult(p, input.tenantId, input.requestId);
  if (prev) {
    await resumeForRow(p, Number(prev.form_row_id), input.tenantId, input.userId);
    return await currentState(p, Number(prev.form_row_id), input.tenantId, "duplicate");
  }

  let activation: BatchActivation | null = null;
  let activationBatchId: number | null = null;
  let result: { status: "done" | "duplicate"; rowId: number; rowVersion: number; confirmed: boolean };
  const c = await p.getConnection();
  try {
    await c.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
    await c.beginTransaction();
    try {
      const { row, form } = await loadRow(c, input.rowId, input.tenantId, true);
      const again = await priorResult(c, input.tenantId, input.requestId);
      if (again) {
        await c.rollback();
        await resumeForRow(p, Number(again.form_row_id), input.tenantId, input.userId);
        return await currentState(p, Number(again.form_row_id), input.tenantId, "duplicate");
      }
      if (form.wd > todayKST()) throw new FieldRejectedError([`작업일(${form.wd})이 아직 오지 않았습니다.`]);
      const before = snapshot(row);
      // 통과 종료가 자정을 넘기는지 — 통과 시작 이력(서버 시각) 날짜 < 오늘이면
      const t0 = hm();
      const crossing = input.action === "pass_end" && row.pass_time_start && !row.pass_time_end
        ? (await passCrossedMidnightRows(c, input.tenantId, [{ id: row.id, pass_time_start: row.pass_time_start, pass_time_end: t0 }], Number(row.id))).has(Number(row.id))
        : false;
      // 거부 검사 먼저 — 거부될 확인이 출고를 일으키지 않는다
      planWrite(form, row, input, { passCrossesMidnight: crossing });
      // 예정 생산 건이면 같은 트랜잭션에서 실행(원료 출고) — 실패하면 throw → 아래에서 전부 롤백
      activationBatchId = activationBatchOf(form, row, input.action);
      if (activationBatchId) activation = await activateBatchInTx(c, activationBatchId, input.tenantId, input.userId);
      // 측정·점검 시각은 출고가 끝난 '지금'
      const { sets, vals, confirm, valueChanges } = planWrite(form, row, input, { passCrossesMidnight: crossing });
      if (!sets.length && !confirm) {
        await c.rollback();
        return { status: "done", rowId: Number(row.id), rowVersion: Number(row.row_version), confirmed: !!before.confirmed };
      }
      const newVersion = Number(row.row_version) + 1;
      sets.push("row_version = ?"); vals.push(newVersion);
      if (confirm) { sets.push("row_confirmed_at = NOW()", "row_confirmed_by = ?", "row_confirmed_version = ?"); vals.push(input.userId, newVersion); }
      sets.push("updated_at = NOW()");
      await c.execute(`UPDATE h_ccp_form_rows SET ${sets.join(", ")} WHERE id = ? AND tenant_id = ?`, [...vals, row.id, input.tenantId]);
      await bumpSheetVersion(c, Number(form.id), input.tenantId); // 기록지 확인(제출)도 다시
      const [[fresh]]: any = await c.execute(`SELECT ${ROW_COLS} FROM h_ccp_form_rows r WHERE r.id = ? AND r.tenant_id = ?`, [row.id, input.tenantId]);
      // 이력 이름 — 값을 고치며 확인했으면 edit_confirm (전/후 값이 함께 남는다)
      const event = input.action === "edit" ? (before.confirmed ? "edit_unconfirm" : "edit") : input.action === "confirm" && valueChanges > 0 ? "edit_confirm" : input.action;
      // 지난 날짜 기록을 오늘 옮겨 적은 확인이면 이력에 그 표시 — 이력의 at(서버 시각)이 적은 시각, 행의 시각이 실제 시각
      const lateEntryOf = input.action !== "edit" && String(form.wd ?? "") !== "" && String(form.wd) < todayKST() ? String(form.wd) : null;
      const after = { ...snapshot(fresh), ...(activation ? { batchActivated: activation.batchId } : {}), ...(lateEntryOf ? { lateEntryOf } : {}) };
      await addEvent(c, { tenantId: input.tenantId, formId: Number(form.id), rowId: Number(row.id), event, userId: input.userId, rowVersion: newVersion, before, after, requestId: input.requestId, meta });
      await c.commit();
      result = { status: "done", rowId: Number(row.id), rowVersion: newVersion, confirmed: confirm };
    } catch (e: any) {
      try { await c.rollback(); } catch { /* 원래 오류 */ }
      activation = null;
      if (e?.code === "ER_DUP_ENTRY" && /uq_cre_tenant_request/.test(String(e?.message))) {
        const pr = await priorResult(p, input.tenantId, input.requestId);
        if (pr) {
          await resumeForRow(p, Number(pr.form_row_id), input.tenantId, input.userId);
          return await currentState(p, Number(pr.form_row_id), input.tenantId, "duplicate");
        }
      }
      throw e;
    }
  } finally {
    c.release();
  }
  // 커밋 뒤 실행 단계 — 실패해도 확인·출고는 이미 한 단위로 저장됨. 남은 단계는 생산 건에 표시돼 다음에 이어서
  try {
    if (activation) await finishBatchActivation(activation);
    else if (activationBatchId) await resumeBatchActivation(activationBatchId, input.tenantId, input.userId);
  } catch (e) {
    console.error("[fieldWork] 예정 생산 건 실행 뒤 단계 실패 — 다음 확인 때 이어서:", e);
  }
  return result;
}

/** 이 행이 속한 생산 건의 남은 실행 단계를 이어서 (이미 끝났거나 다른 요청이 하는 중이면 아무것도 안 함). 실패는 다음으로 미룬다 */
async function resumeForRow(p: any, rowId: number, tenantId: number, userId: number): Promise<void> {
  try {
    const [[r]]: any = await p.execute(
      `SELECT r.batch_id AS row_batch_id, f.batch_id AS form_batch_id, f.ccp_type FROM h_ccp_form_rows r JOIN h_ccp_form_records f ON f.id = r.form_record_id AND f.tenant_id = r.tenant_id
        WHERE r.id = ? AND r.tenant_id = ?`, [rowId, tenantId]);
    const batchId = r ? (String(r.ccp_type) === "CCP-4P" ? r.row_batch_id : r.form_batch_id) : null;
    if (batchId) await resumeBatchActivation(Number(batchId), tenantId, userId);
  } catch (e) {
    console.error("[fieldWork] 남은 실행 단계 이어서 하기 실패 — 다음에 다시:", e);
  }
}

async function currentState(p: any, rowId: number, tenantId: number, status: "done" | "duplicate") {
  const [[r]]: any = await p.execute(`SELECT row_version, row_confirmed_at, row_confirmed_version FROM h_ccp_form_rows WHERE id = ? AND tenant_id = ?`, [rowId, tenantId]);
  return { status, rowId, rowVersion: Number(r?.row_version ?? 0), confirmed: r?.row_confirmed_at != null && Number(r.row_confirmed_version) === Number(r.row_version) };
}

/** 감도점검 한 번 더 (2시간 점검 등) — 평상 결과를 채운 행을 만든다. 시각은 [확인] 때 */
export async function addSensitivityRow(input: { tenantId: number; userId: number; formRecordId: number; productName: string; label: string; requestId: string; meta?: ClientMeta }, pool?: any) {
  const p = pool ?? (await getRawConnection());
  const prev = await priorResult(p, input.tenantId, input.requestId);
  if (prev) return { status: "duplicate" as const, rowId: Number(prev.form_row_id) };
  const c = await p.getConnection();
  try {
    await c.beginTransaction();
    try {
      const [[f]]: any = await c.execute(`SELECT id, ccp_type, field_mode, status, voided_at, detector_equipment_id FROM h_ccp_form_records WHERE id = ? AND tenant_id = ? FOR UPDATE`, [input.formRecordId, input.tenantId]);
      if (!f || f.ccp_type !== "CCP-4P" || Number(f.field_mode) !== 1) throw new FieldRejectedError(["현장 확인 금속검출 기록지가 아닙니다."]);
      if (f.status === "approved" || f.voided_at) throw new FieldRejectedError(["고칠 수 없는 기록지입니다."]);
      const [[mx]]: any = await c.execute(`SELECT COALESCE(MAX(batch_seq), 0) AS m FROM h_ccp_form_rows WHERE form_record_id = ? AND tenant_id = ?`, [f.id, input.tenantId]);
      const [[eq]]: any = await c.execute(`SELECT name FROM equipments WHERE id = ? AND tenant_id = ?`, [f.detector_equipment_id ?? 0, input.tenantId]);
      const [ins]: any = await c.execute(
        `INSERT INTO h_ccp_form_rows (tenant_id, form_record_id, batch_seq, equipment_id, equipment_name, equipment_type, product_name, note,
                                      metal_fe_mid, metal_sus_mid, metal_product_only, metal_fe_product, metal_sus_product, result, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'sensitivity', ?, ?, 'O', 'O', 'X', 'O', 'O', '적합', NOW(), NOW())`,
        [input.tenantId, f.id, Number(mx.m) + 1, f.detector_equipment_id ?? null, eq?.name ?? null, input.productName.slice(0, 200), input.label.slice(0, 100)],
      );
      await bumpSheetVersion(c, Number(f.id), input.tenantId);
      await addEvent(c, { tenantId: input.tenantId, formId: Number(f.id), rowId: Number(ins.insertId), event: "add_row", userId: input.userId, rowVersion: 0, before: null, after: { productName: input.productName, label: input.label }, requestId: input.requestId, meta: input.meta ?? {} });
      await c.commit();
      return { status: "done" as const, rowId: Number(ins.insertId) };
    } catch (e) {
      try { await c.rollback(); } catch { /* 원래 오류 */ }
      throw e;
    }
  } finally {
    c.release();
  }
}

/** 내 설비 (개인 계정별 기억) */
export async function getMyEquipments(tenantId: number, userId: number): Promise<number[]> {
  const c = await getRawConnection();
  const [rows]: any = await c.execute(`SELECT equipment_ids FROM h_user_field_prefs WHERE tenant_id = ? AND user_id = ?`, [tenantId, userId]);
  const v = (rows as any[])[0]?.equipment_ids;
  const arr = typeof v === "string" ? JSON.parse(v) : v;
  return Array.isArray(arr) ? arr.map(Number).filter((x) => x > 0) : [];
}
export async function setMyEquipments(tenantId: number, userId: number, ids: number[]): Promise<number[]> {
  const c = await getRawConnection();
  const uniq = Array.from(new Set(ids.map(Number).filter((x) => x > 0)));
  if (uniq.length) {
    const [own]: any = await c.query(`SELECT id FROM equipments WHERE tenant_id = ? AND id IN (?)`, [tenantId, uniq]);
    if ((own as any[]).length !== uniq.length) throw new FieldRejectedError(["이 회사의 설비가 아닌 번호가 있습니다."]);
  }
  await c.execute(
    `INSERT INTO h_user_field_prefs (tenant_id, user_id, equipment_ids, updated_at) VALUES (?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE equipment_ids = VALUES(equipment_ids), updated_at = NOW()`,
    [tenantId, userId, JSON.stringify(uniq)],
  );
  return uniq;
}

/**
 * 오늘 일 — 내 설비의 가열 행 + 금속검출(검출기를 골랐거나 설비를 안 고른 경우) + 남은 일(기록지별 제출 막는 이유)
 * 읽기만 한다.
 */
export async function listFieldWork(tenantId: number, workDate: string, equipmentIds: number[] | null) {
  const c = await getRawConnection();
  const [forms]: any = await c.execute(
    `SELECT f.id, f.batch_id, f.ccp_type, f.status, f.process_group_name, f.product_name, f.rows_version, f.confirmed_at, f.confirmed_rows_version, f.detector_equipment_id,
            DATE_FORMAT(f.work_date, '%Y-%m-%d') AS wd, f.cl_heat_time_min_lo, f.cl_heat_time_min_hi, f.cl_heat_temp_lo, f.cl_pressure_mpa_lo, f.cl_product_temp_lo,
            f.cl_heat_temp_hi, f.cl_pressure_mpa_hi,
            b.batch_code, b.plan_only, b.status AS batch_status, COALESCE(p.product_name, f.product_name) AS batch_product
       FROM h_ccp_form_records f
       LEFT JOIN h_batches b ON b.id = f.batch_id AND b.tenant_id = f.tenant_id
       LEFT JOIN h_products_v2 p ON p.id = b.product_id AND p.tenant_id = b.tenant_id
      WHERE f.tenant_id = ? AND f.work_date = ? AND f.field_mode = 1 AND f.voided_at IS NULL
      ORDER BY f.ccp_type = 'CCP-4P', f.id`,
    [tenantId, workDate],
  );
  const formList = forms as any[];
  if (!formList.length) return { workDate, heat: [], metal: null, sheets: [] };
  const [rowRows]: any = await c.query(
    `SELECT ${ROW_COLS}, u.name AS confirmed_by_name FROM h_ccp_form_rows r LEFT JOIN users u ON u.id = r.row_confirmed_by
      WHERE r.tenant_id = ? AND r.form_record_id IN (?) ORDER BY r.form_record_id, r.batch_seq, r.id`,
    [tenantId, formList.map((f) => Number(f.id))],
  );
  const rows = rowRows as any[];
  const view = (f: any, r: any) => ({
    rowId: Number(r.id), formRecordId: Number(f.id), batchSeq: Number(r.batch_seq), kind: kindOf(f, r),
    equipmentId: r.equipment_id != null ? Number(r.equipment_id) : null, equipmentName: r.equipment_name ?? null,
    productName: r.product_name ?? f.batch_product ?? null, note: r.note ?? null, batchId: r.row_batch_id != null ? Number(r.row_batch_id) : (f.batch_id != null ? Number(f.batch_id) : null),
    plannedTime: r.planned_time ?? null, measurementTime: r.measurement_time ?? null, values: snapshot(r),
    rowVersion: Number(r.row_version ?? 0), confirmed: !!snapshot(r).confirmed,
    confirmedByName: r.confirmed_by_name ?? null, confirmedAt: r.row_confirmed_at ?? null, passUnit: r.pass_unit ?? null,
  });
  const mine = (r: any) => !equipmentIds || !equipmentIds.length || (r.equipment_id != null && equipmentIds.includes(Number(r.equipment_id)));
  const heat: any[] = [];
  for (const f of formList.filter((x) => x.ccp_type !== "CCP-4P")) {
    for (const r of rows.filter((x) => Number(x.form_record_id) === Number(f.id) && mine(x))) {
      heat.push({ ...view(f, r), process: f.process_group_name ?? f.ccp_type, ccpType: f.ccp_type, batchCode: f.batch_code ?? null, planOnly: Number(f.plan_only ?? 0) === 1,
        cl: { heatTimeMinLo: n(f.cl_heat_time_min_lo), heatTimeMinHi: n(f.cl_heat_time_min_hi), heatTempLo: n(f.cl_heat_temp_lo), heatTempHi: n(f.cl_heat_temp_hi),
              pressureMpaLo: n(f.cl_pressure_mpa_lo), pressureMpaHi: n(f.cl_pressure_mpa_hi), productTempLo: n(f.cl_product_temp_lo) } });
    }
  }
  heat.sort((a, b) => String(a.plannedTime ?? "99").localeCompare(String(b.plannedTime ?? "99")) || a.rowId - b.rowId);
  // 현장 금속검출 = 그날 열린(승인 아닌) 기록지 — 승인 뒤 추가 생산은 추가 기록지에 (dayMetalForm). 다 승인됐으면 첫 기록지 (보기만)
  const mf = formList.find((x) => x.ccp_type === "CCP-4P" && String(x.status) !== "approved") ?? formList.find((x) => x.ccp_type === "CCP-4P");
  const metal = mf && (!equipmentIds || !equipmentIds.length || equipmentIds.includes(Number(mf.detector_equipment_id)))
    ? { formRecordId: Number(mf.id), detectorEquipmentId: mf.detector_equipment_id != null ? Number(mf.detector_equipment_id) : null,
        rows: rows.filter((x) => Number(x.form_record_id) === Number(mf.id)).map((r) => view(mf, r)) }
    : null;
  // 남은 일 — 기록지별 제출을 막는 이유 (서버 제출 검사와 같은 함수)
  const now = { date: todayKST(), time: nowKST() };
  const crossed = await passCrossedMidnightRows(c, tenantId, rows);
  const sheets = formList.map((f) => {
    const rs = rows.filter((x) => Number(x.form_record_id) === Number(f.id)).map((x) => ({ ...x, __crossesMidnight: crossed.has(Number(x.id)) }));
    const rec: SheetRecord = { ...toSheet(f, rs[0] ?? {}).rec, fieldMode: true };
    const problems = validateSheetForConfirm(rec, rs.map((r) => ({ ...toSheet(f, r).r, rowConfirmed: !!snapshot(r).confirmed })), now);
    const confirmed = f.confirmed_at != null && Number(f.confirmed_rows_version) === Number(f.rows_version ?? 0);
    return { formRecordId: Number(f.id), ccpType: String(f.ccp_type), title: f.ccp_type === "CCP-4P" ? "금속검출" : `${f.batch_product ?? ""} ${f.process_group_name ?? ""}`.trim(),
      batchId: f.batch_id != null ? Number(f.batch_id) : null, status: String(f.status), submittedConfirmed: confirmed, problems, rows: rs.length, confirmedRows: rs.filter((r) => snapshot(r).confirmed).length };
  });
  return { workDate, heat, metal, sheets };
}

/** 예전 기록지 화면 입력 이름(camelCase) → 칸 이름 — 바꿀 수 없는 칸(회사·기록지·행 번호)은 뺀다 */
const LEGACY_SKIP = new Set(["tenantId", "formRecordId", "batchSeq", "id", "createdAt", "updatedAt"]);
const snake = (k: string) => k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);

/**
 * 예전 기록지 화면(행 저장)으로 현장 확인 기록지(field_mode = 1)의 행을 고친 경우 — 한 트랜잭션 (2026-10-20, #611 검토):
 *   행 잠금 → 수정 전 값 → 저장 → 그 행 확인 무효(행 버전↑) → 기록지 확인(제출)도 무효 → 이력(edit_legacy, 전/후 값) → 커밋.
 *   잠그는 순서는 현장 쓰기와 같다 (행 → 기록지).
 * 현장 확인 기록지가 아니면 null — 호출자가 예전 저장(upsertCcpFormRow)을 그대로 쓴다.
 */
export async function saveFieldRowFromLegacy(input: {
  tenantId: number; userId: number; formRecordId: number; batchSeq: number; data: Record<string, unknown>; meta?: ClientMeta;
}, pool?: any): Promise<number | null> {
  const p = pool ?? (await getRawConnection());
  const [[f0]]: any = await p.execute(`SELECT field_mode FROM h_ccp_form_records WHERE id = ? AND tenant_id = ?`, [input.formRecordId, input.tenantId]);
  if (!f0 || Number(f0.field_mode) !== 1) return null;
  const cols: string[] = [];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(input.data)) {
    if (LEGACY_SKIP.has(k) || v === undefined) continue;
    if (!/^[a-zA-Z]+$/.test(k)) continue;
    cols.push(snake(k)); vals.push(v);
  }
  const c = await p.getConnection();
  try {
    await c.beginTransaction();
    try {
      const [[row]]: any = await c.execute(
        `SELECT ${ROW_COLS} FROM h_ccp_form_rows r WHERE r.form_record_id = ? AND r.batch_seq = ? AND r.tenant_id = ? ORDER BY r.id LIMIT 1 FOR UPDATE`,
        [input.formRecordId, input.batchSeq, input.tenantId],
      );
      let rowId: number;
      if (row) {
        rowId = Number(row.id);
        await c.execute(
          `UPDATE h_ccp_form_rows SET ${cols.map((x) => `${x} = ?`).join(", ")}${cols.length ? ", " : ""}row_version = row_version + 1,
                  row_confirmed_at = NULL, row_confirmed_by = NULL, row_confirmed_version = NULL, updated_at = NOW()
            WHERE id = ? AND tenant_id = ?`,
          [...vals, rowId, input.tenantId],
        );
      } else {
        const [ins]: any = await c.execute(
          `INSERT INTO h_ccp_form_rows (tenant_id, form_record_id, batch_seq${cols.map((x) => `, ${x}`).join("")}, row_version, created_at, updated_at)
           VALUES (?, ?, ?${cols.map(() => ", ?").join("")}, 1, NOW(), NOW())`,
          [input.tenantId, input.formRecordId, input.batchSeq, ...vals],
        );
        rowId = Number(ins.insertId);
      }
      await bumpSheetVersion(c, input.formRecordId, input.tenantId); // 승인된 기록지면 여기서 거부 → 전부 롤백
      const [[saved]]: any = await c.execute(`SELECT ${ROW_COLS} FROM h_ccp_form_rows r WHERE r.id = ? AND r.tenant_id = ?`, [rowId, input.tenantId]);
      await addEvent(c, {
        tenantId: input.tenantId, formId: input.formRecordId, rowId, event: "edit_legacy", userId: input.userId,
        rowVersion: Number(saved.row_version ?? 0), before: row ? snapshot(row) : null, after: snapshot(saved),
        requestId: `legacy-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`, meta: input.meta ?? {},
      });
      await c.commit();
      return rowId;
    } catch (e) {
      try { await c.rollback(); } catch { /* 원래 오류 */ }
      throw e;
    }
  } finally {
    c.release();
  }
}

/**
 * CCP 기록지 인쇄 문구 — 주기·모니터링 방법·개선조치·한계기준표·설비 열 제목 (2026-10-18)
 *
 * 작성 중(draft·submitted·rejected) 기록지는 공정그룹의 최신 문구를 쓰고,
 * 승인되는 순간 그때 문구를 기록지(print_snapshot)에 고정한다 — 나중에 공정그룹 문구를 개정해도
 * 승인된 기록지 인쇄는 승인 당시 문구 그대로 (기록 보존). 반려되면 고정을 풀어 다시 승인할 때 새로 고정한다.
 *
 * ★ 2026-10-20 (BOM·설비 시간·인쇄 기준 검토 3·4): 문구 개정과 숫자 판정 기준을 나눈다.
 *   한계기준표에서 이 기록지 공정의 줄은 공정그룹의 지금 값이 아니라 기록지에 저장된 판정 기준(생성 때 스냅샷, cl_* 칸)이다 —
 *   제출 판정(ccpSheetConfirm)이 읽는 값과 같은 값이라 '하한 95℃ / 측정 92℃ / 적합' 이 한 문서에 함께 나오지 않는다.
 *   같은 CCP 유형의 다른 공정 줄은 참고용 공정 설정 값이며, 줄마다 출처(source: record | group)를 남긴다. 상한(시간·온도·압력)도 함께.
 *   이미 승인돼 고정된 문구(print_snapshot)는 바꾸지 않는다.
 */
import { getRawConnection } from "../connection";

export interface CcpPrintText {
  monitoringMethod: string | null;
  monitoringCycle: string | null;
  correctiveAction: string | null;
  clTable: Array<{
    name: string; timeMin: any; timeMax: any; pressureMin: any; temperatureMin: any;
    pressureMax?: any; temperatureMax?: any;
    /** record = 이 기록지의 판정 기준(스냅샷), group = 같은 유형 다른 공정의 설정 값 (2026-10-20) */
    source?: "record" | "group"; processGroupId?: number;
  }>;
  equipTypeLabel: string | null;
}

/** 기록지에 저장된 판정 기준 (cl_* 칸) — 한계기준표의 이 기록지 공정 줄 */
export interface RecordCriteria {
  timeLo: unknown; timeHi: unknown; tempLo: unknown; tempHi?: unknown; pressureLo: unknown; pressureHi?: unknown;
}

/** 공정그룹의 지금 문구 — 없으면 null. own 이 있으면 이 기록지 공정 줄은 기록지의 판정 기준으로 */
export async function loadLivePrintText(conn: any, tenantId: number, processGroupId: number, ccpType: string | null, own?: RecordCriteria | null): Promise<CcpPrintText | null> {
  const [rows]: any = await conn.execute(
    `SELECT monitoring_method, monitoring_cycle, corrective_action FROM ccp_process_groups WHERE id = ? AND tenant_id = ? LIMIT 1`,
    [processGroupId, tenantId],
  );
  const g = (rows as any[])[0];
  if (!g) return null;
  let clTable: CcpPrintText["clTable"] = [];
  let equipTypeLabel: string | null = null;
  if (ccpType) {
    // 정규 양식의 '한계기준' 표는 이 회사의 같은 CCP 유형 공정 전부 (원본 양식 대조)
    const [gs]: any = await conn.execute(
      `SELECT id, name, time_min, time_max, pressure_min, pressure_max, temperature_min, temperature_max FROM ccp_process_groups
        WHERE tenant_id = ? AND ccp_type = ? AND status = 'active' ORDER BY sort_order, id`,
      [tenantId, ccpType],
    );
    clTable = (gs as any[]).map((x) =>
      own && Number(x.id) === Number(processGroupId)
        ? { name: x.name, processGroupId: Number(x.id), source: "record" as const, timeMin: own.timeLo ?? null, timeMax: own.timeHi ?? null,
            pressureMin: own.pressureLo ?? null, pressureMax: own.pressureHi ?? null, temperatureMin: own.tempLo ?? null, temperatureMax: own.tempHi ?? null }
        : { name: x.name, processGroupId: Number(x.id), source: "group" as const, timeMin: x.time_min, timeMax: x.time_max,
            pressureMin: x.pressure_min, pressureMax: x.pressure_max ?? null, temperatureMin: x.temperature_min, temperatureMax: x.temperature_max ?? null });
    // 설비 열 제목(교반기/시루/증숙기)은 공정에 배정된 설비 종류
    const [et]: any = await conn.execute(
      `SELECT e.type FROM ccp_process_group_equipments ge JOIN equipments e ON e.id = ge.equipment_id AND e.tenant_id = ge.tenant_id
        WHERE ge.tenant_id = ? AND ge.process_group_id = ? ORDER BY ge.sort_order, ge.id LIMIT 1`,
      [tenantId, processGroupId],
    );
    equipTypeLabel = (et as any[])[0]?.type ?? null;
  }
  return {
    monitoringMethod: g.monitoring_method ?? null,
    monitoringCycle: g.monitoring_cycle ?? null,
    correctiveAction: g.corrective_action ?? null,
    clTable,
    equipTypeLabel,
  };
}

/** 기록지 행의 cl_* 칸 → 판정 기준 (drizzle camelCase · raw snake_case 모두) */
export function recordCriteriaOf(r: any): RecordCriteria {
  return {
    timeLo: r.clHeatTimeMinLo ?? r.cl_heat_time_min_lo ?? null, timeHi: r.clHeatTimeMinHi ?? r.cl_heat_time_min_hi ?? null,
    tempLo: r.clHeatTempLo ?? r.cl_heat_temp_lo ?? null, tempHi: r.clHeatTempHi ?? r.cl_heat_temp_hi ?? null,
    pressureLo: r.clPressureMpaLo ?? r.cl_pressure_mpa_lo ?? null, pressureHi: r.clPressureMpaHi ?? r.cl_pressure_mpa_hi ?? null,
  };
}

/** 기록지의 고정 문구 — 컬럼이 아직 없는 DB(마이그레이션 전)에서도 null 로 */
export async function loadFrozenPrintText(conn: any, formRecordId: number, tenantId: number): Promise<CcpPrintText | null> {
  try {
    const [rs]: any = await conn.execute(`SELECT print_snapshot FROM h_ccp_form_records WHERE id = ? AND tenant_id = ? LIMIT 1`, [formRecordId, tenantId]);
    return parsePrintSnapshot((rs as any[])[0]?.print_snapshot);
  } catch (e: any) {
    if (e?.code === "ER_BAD_FIELD_ERROR") return null;
    throw e;
  }
}

export function parsePrintSnapshot(v: unknown): CcpPrintText | null {
  if (v == null || v === "") return null;
  try {
    const o = typeof v === "string" ? JSON.parse(v) : v;
    return o && typeof o === "object" ? (o as CcpPrintText) : null;
  } catch {
    return null;
  }
}

/** 승인 때 문구 고정 — 이미 고정돼 있으면 그대로 (멱등). 공정그룹이 없는 기록지는 건너뜀 */
export async function freezeCcpPrintText(formRecordId: number, tenantId?: number): Promise<boolean> {
  const conn = await getRawConnection();
  let rs: any;
  try {
    [rs] = await conn.execute(
    `SELECT id, tenant_id, process_group_id, ccp_type, print_snapshot,
            cl_heat_time_min_lo, cl_heat_time_min_hi, cl_heat_temp_lo, cl_heat_temp_hi, cl_pressure_mpa_lo, cl_pressure_mpa_hi
       FROM h_ccp_form_records WHERE id = ?${tenantId != null ? " AND tenant_id = ?" : ""} LIMIT 1`,
    tenantId != null ? [formRecordId, tenantId] : [formRecordId],
    );
  } catch (e: any) {
    if (e?.code === "ER_BAD_FIELD_ERROR") return false; // 컬럼 생성 전 — 고정 없이 진행
    throw e;
  }
  const r = (rs as any[])[0];
  if (!r || r.print_snapshot != null || !r.process_group_id) return false;
  // 이 기록지 공정 줄 = 제출 판정에 쓴 기록지 기준 (공정그룹의 지금 값이 아님)
  const text = await loadLivePrintText(conn, Number(r.tenant_id), Number(r.process_group_id), r.ccp_type ?? null, recordCriteriaOf(r));
  if (!text) return false;
  const [u]: any = await conn.execute(
    `UPDATE h_ccp_form_records SET print_snapshot = ? WHERE id = ? AND tenant_id = ? AND print_snapshot IS NULL`,
    [JSON.stringify(text), formRecordId, Number(r.tenant_id)],
  );
  return Number(u?.affectedRows ?? 0) > 0;
}

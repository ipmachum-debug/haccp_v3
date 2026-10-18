/**
 * CCP 기록지 인쇄 문구 — 주기·모니터링 방법·개선조치·한계기준표·설비 열 제목 (2026-10-18)
 *
 * 작성 중(draft·submitted·rejected) 기록지는 공정그룹의 최신 문구를 쓰고,
 * 승인되는 순간 그때 문구를 기록지(print_snapshot)에 고정한다 — 나중에 공정그룹 문구를 개정해도
 * 승인된 기록지 인쇄는 승인 당시 문구 그대로 (기록 보존). 반려되면 고정을 풀어 다시 승인할 때 새로 고정한다.
 */
import { getRawConnection } from "../connection";

export interface CcpPrintText {
  monitoringMethod: string | null;
  monitoringCycle: string | null;
  correctiveAction: string | null;
  clTable: Array<{ name: string; timeMin: any; timeMax: any; pressureMin: any; temperatureMin: any }>;
  equipTypeLabel: string | null;
}

/** 공정그룹의 지금 문구 — 없으면 null */
export async function loadLivePrintText(conn: any, tenantId: number, processGroupId: number, ccpType: string | null): Promise<CcpPrintText | null> {
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
      `SELECT name, time_min, time_max, pressure_min, temperature_min FROM ccp_process_groups
        WHERE tenant_id = ? AND ccp_type = ? AND status = 'active' ORDER BY sort_order, id`,
      [tenantId, ccpType],
    );
    clTable = (gs as any[]).map((x) => ({ name: x.name, timeMin: x.time_min, timeMax: x.time_max, pressureMin: x.pressure_min, temperatureMin: x.temperature_min }));
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
    `SELECT id, tenant_id, process_group_id, ccp_type, print_snapshot FROM h_ccp_form_records WHERE id = ?${tenantId != null ? " AND tenant_id = ?" : ""} LIMIT 1`,
    tenantId != null ? [formRecordId, tenantId] : [formRecordId],
    );
  } catch (e: any) {
    if (e?.code === "ER_BAD_FIELD_ERROR") return false; // 컬럼 생성 전 — 고정 없이 진행
    throw e;
  }
  const r = (rs as any[])[0];
  if (!r || r.print_snapshot != null || !r.process_group_id) return false;
  const text = await loadLivePrintText(conn, Number(r.tenant_id), Number(r.process_group_id), r.ccp_type ?? null);
  if (!text) return false;
  const [u]: any = await conn.execute(
    `UPDATE h_ccp_form_records SET print_snapshot = ? WHERE id = ? AND tenant_id = ? AND print_snapshot IS NULL`,
    [JSON.stringify(text), formRecordId, Number(r.tenant_id)],
  );
  return Number(u?.affectedRows ?? 0) > 0;
}

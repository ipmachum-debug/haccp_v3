/**
 * 빈 CCP 양식지에 넣을 회사 설정값 (2026-10-18)
 *   한계기준 행 = 그 CCP 유형의 활성 공정그룹(이름·시간·압력·온도), 금속검출은 금속검출기 감도.
 *   주기·모니터링 방법·개선조치 = 공정그룹에 적힌 문구(줄 단위). 비어 있으면 넘기지 않는다 → 양식은 빈 줄.
 */
import { getRawConnection } from "../db/connection";
import type { BlankFormOverrides, BlankFormCcpType } from "./blankFormPdf";

const CCP_OF: Record<BlankFormCcpType, string> = { ccp_1b: "CCP-1B", ccp_2b: "CCP-2B", ccp_3b: "CCP-3B", ccp_4p: "CCP-4P" };
const lines = (s: unknown) => String(s ?? "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
const range = (lo: unknown, hi: unknown, unit: string) =>
  lo != null && hi != null ? `${lo}${unit}이상~${hi}${unit}이하` : lo != null ? `${lo}${unit}이상` : hi != null ? `${hi}${unit}이하` : "";
const min = (lo: unknown, unit: string) => (lo != null ? `${lo}${unit}이상` : "");

export async function loadBlankFormOverrides(tenantId: number, ccpType: BlankFormCcpType): Promise<BlankFormOverrides> {
  const conn = await getRawConnection();
  const out: BlankFormOverrides = {};
  const [gs]: any = await conn.execute(
    `SELECT name, temperature_min, time_min, time_max, pressure_min, monitoring_cycle, monitoring_method, corrective_action
       FROM ccp_process_groups WHERE tenant_id = ? AND ccp_type = ? AND status = 'active' ORDER BY sort_order, id`,
    [tenantId, CCP_OF[ccpType]],
  );
  const groups = gs as any[];
  if (ccpType === "ccp_4p") {
    const [eqs]: any = await conn.execute(
      `SELECT name, fe_sensitivity, sts_sensitivity FROM equipments WHERE tenant_id = ? AND ccp_type = 'CCP-4P' AND status = 'active' ORDER BY id`,
      [tenantId],
    );
    const rows = (eqs as any[]).map((e) => ["", e.fe_sensitivity != null ? `Fe ${e.fe_sensitivity}mmΦ 이상 불검출` : "", e.sts_sensitivity != null ? `SUS ${e.sts_sensitivity}mmΦ 이상 불검출` : ""]);
    if (rows.length) out.limitsRows = rows;
  } else if (groups.length) {
    out.limitsRows = groups.map((g) => ccpType === "ccp_1b"
      ? [g.name, range(g.time_min, g.time_max, "분"), min(g.pressure_min, "Mpa"), min(g.temperature_min, "℃")]
      : [g.name, range(g.time_min, g.time_max, "분"), min(g.temperature_min, "℃")]);
  }
  if (ccpType === "ccp_1b" && groups.length) {
    const [et]: any = await conn.execute(
      `SELECT e.type FROM ccp_process_group_equipments ge JOIN equipments e ON e.id = ge.equipment_id AND e.tenant_id = ge.tenant_id
        JOIN ccp_process_groups g ON g.id = ge.process_group_id AND g.tenant_id = ge.tenant_id
       WHERE ge.tenant_id = ? AND g.ccp_type = 'CCP-1B' AND g.status = 'active' ORDER BY g.sort_order, ge.sort_order LIMIT 1`,
      [tenantId],
    );
    if ((et as any[])[0]?.type) out.equipmentLabel = String((et as any[])[0].type);
  }
  const first = (col: string) => groups.find((g) => String(g[col] ?? "").trim())?.[col];
  const cycle = first("monitoring_cycle"); if (cycle) out.cycleNote = lines(cycle).join(" / ");
  const mm = first("monitoring_method"); if (mm) out.monitoringMethod = lines(mm);
  const ca = first("corrective_action"); if (ca) out.correctiveMethod = lines(ca);
  return out;
}

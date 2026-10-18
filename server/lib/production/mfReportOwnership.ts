/**
 * 품목제조보고 회사 소유 검증 (2026-10-19, Codex BOM 재설계 검토 4-7 / 설계 18 R6)
 *
 * 문제: updateMfReport 가 보고서 머리는 회사로 걸러 고치지만, 버전·원료 줄은 보고서 번호만으로 찾아 고쳤다.
 *   다른 회사의 보고서 번호를 넣으면 그 회사의 버전·원료가 바뀔 수 있었다. 버전 번호·원료 줄 번호를 받는 다른 프로시저도 같은 위험.
 * 해결: 라우터 입력에 들어 있는 모든 번호를 실행 전에 한 번에 확인한다 — 하나라도 이 회사 것이 아니면 아무것도 하지 않고 거부.
 *   보고서 → h_mf_reports.tenant_id, 버전·원료 줄 → 보고서를 거쳐, 제품·원료 → item_master.tenant_id, 공정 → ccp_process_groups.tenant_id.
 *   값이 있는 키만 본다 (없는 키는 그 프로시저가 쓰지 않는 것).
 */

export class MfOwnershipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MfOwnershipError";
  }
}

const ids = (v: unknown): number[] =>
  (Array.isArray(v) ? v : v == null ? [] : [v]).map((x) => Number(x)).filter((x) => Number.isInteger(x) && x > 0);

/** 입력에서 확인할 번호 모으기 — 순수 함수 */
export function collectMfIds(raw: any): { reports: number[]; versions: number[]; ingredients: number[]; items: number[]; groups: number[] } {
  const r = raw && typeof raw === "object" ? raw : {};
  const ings: any[] = Array.isArray(r.ingredients) ? r.ingredients : [];
  const maps: any[] = Array.isArray(r.mappings) ? r.mappings : [];
  const adjs: any[] = Array.isArray(r.adjustments) ? r.adjustments : [];
  const uniq = (a: number[]) => Array.from(new Set(a));
  return {
    // 최상위 id 는 이 라우터에서 보고서 번호 (getById) — 원료 줄 id 는 ingredients[].id 로 따로
    reports: uniq([...ids(r.mfReportId), ...ids(r.ids), ...ids(r.id)]),
    versions: uniq([...ids(r.versionId), ...ids(r.mfReportVersionId)]),
    ingredients: uniq([...ids(r.ingredientId), ...ings.flatMap((i) => ids(i?.id)), ...maps.flatMap((m) => ids(m?.ingredientId))]),
    items: uniq([...ids(r.productId), ...ids(r.materialId), ...ings.flatMap((i) => ids(i?.materialId)), ...adjs.flatMap((a) => ids(a?.yieldMaterialId))]),
    groups: uniq([...ings.flatMap((i) => ids(i?.processGroupId)), ...maps.flatMap((m) => ids(m?.processGroupId)), ...adjs.flatMap((a) => ids(a?.processGroupId))]),
  };
}

async function countOwned(conn: any, sql: string, tenantId: number, list: number[]): Promise<number> {
  if (!list.length) return 0;
  const [rows]: any = await conn.query(sql, [tenantId, list]);
  return Number((rows as any[])[0]?.n ?? 0);
}

/** 모든 번호가 이 회사 것인지 — 아니면 MfOwnershipError (부작용 없음) */
export async function assertMfIdsOwned(conn: any, tenantId: number, raw: any): Promise<void> {
  const c = collectMfIds(raw);
  const checks: Array<[string, number[], string]> = [
    ["품목제조보고", c.reports, `SELECT COUNT(DISTINCT id) AS n FROM h_mf_reports WHERE tenant_id = ? AND id IN (?)`],
    ["품목제조보고 버전", c.versions, `SELECT COUNT(DISTINCT v.id) AS n FROM h_mf_report_versions v JOIN h_mf_reports r ON r.id = v.mf_report_id WHERE r.tenant_id = ? AND v.id IN (?)`],
    ["원료 줄", c.ingredients, `SELECT COUNT(DISTINCT i.id) AS n FROM h_mf_ingredients i JOIN h_mf_report_versions v ON v.id = i.mf_report_version_id JOIN h_mf_reports r ON r.id = v.mf_report_id WHERE r.tenant_id = ? AND i.id IN (?)`],
    ["품목", c.items, `SELECT COUNT(DISTINCT id) AS n FROM item_master WHERE tenant_id = ? AND id IN (?)`],
    ["공정", c.groups, `SELECT COUNT(DISTINCT id) AS n FROM ccp_process_groups WHERE tenant_id = ? AND id IN (?)`],
  ];
  for (const [label, list, sql] of checks) {
    if (!list.length) continue;
    const n = await countOwned(conn, sql, tenantId, list);
    if (n !== list.length) throw new MfOwnershipError(`이 회사의 ${label}이(가) 아닌 번호가 있습니다 — 저장하지 않았습니다.`);
  }
}

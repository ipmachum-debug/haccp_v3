/**
 * 공정 그룹 설정 변경 이력 — 비교 대상 필드와 diff (2026-10-16)
 *
 * 증숙 2개 공정이 4/12~4/15 사이 '묶음 순차 3대' → '순차 1대' 로 바뀌었는데 누가·언제 바꿨는지 기록이 없었다.
 * 한계기준(CL)·설비 운영 방식이 바뀌면 audit_logs 에 변경 전/후를 남긴다 (processGroups.router updateProcessGroup).
 */
export const AUDITED_GROUP_FIELDS = [
  "name", "ccp_type", "temperature_min", "temperature_max", "time_min", "time_max",
  "pressure_min", "pressure_max", "ph_min", "ph_max",
  "equip_group_mode", "equip_interval_min", "equip_batch_size",
] as const;

/** 바뀐 필드만 { field: { before, after } } — 숫자는 값으로 비교 (90 과 "90.00" 은 같음). 바뀐 게 없으면 null */
export function diffAuditedGroupFields(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): Record<string, { before: unknown; after: unknown }> | null {
  if (!before || !after) return null;
  const norm = (v: unknown) => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : String(v));
  const out: Record<string, { before: unknown; after: unknown }> = {};
  for (const f of AUDITED_GROUP_FIELDS) {
    if (norm(before[f]) !== norm(after[f])) out[f] = { before: before[f] ?? null, after: after[f] ?? null };
  }
  return Object.keys(out).length > 0 ? out : null;
}

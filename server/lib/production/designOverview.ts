/**
 * 생산 설계 — 읽기 전용 모음 (2026-10-19 설계 18 §13 1단계). 쓰기 없음.
 *
 *   loadDesignGroups  : 공정(그룹) + 운전 방식 + 시간 프로필 수 + 연결 설비 평상값 → 공장 지도·준비 상태 공용
 *   loadRecipes       : 사용 중(ACTIVE) 품목제조보고마다 '생산에 쓰는 버전' (승인 우선·최신 — selectBomVersion 과 같은 규칙) + 원료 줄
 *   loadOverview      : 제품별 신호등 · 승인 대기 · 공장 설정 오류/누락 · 최근 변경
 *   loadHistory       : 변경·적용 이력 — 감사 기록(공정·설비·품목제조보고·일지 설정) + 품목제조보고 승인/반려,
 *                       그 변경 뒤에 만들어진 생산 건(또는 CCP 기록) 수
 */
import { checkRecipe, groupIssues, processLoads, type DesignGroup, type RecipeIngredient, type ReadinessIssue, type Signal } from "../../../shared/production/designReadiness";
import { toProductionProductId } from "../identity/itemIdentityService";
import { rowKg } from "./ccpBomInput";
import { occupancyFor, type PlannerEquipment } from "./ccpDayPlanner";

const num = (v: unknown) => (v == null ? null : Number(v));

export async function loadDesignGroups(conn: any, tenantId: number): Promise<DesignGroup[]> {
  let gRows: any[];
  try {
    [gRows] = await conn.execute(
      `SELECT g.id, g.name, g.ccp_type, g.sort_order, g.equip_group_mode, g.equip_batch_size,
              (SELECT COUNT(*) FROM ccp_time_profiles tp WHERE tp.tenant_id = g.tenant_id AND tp.ccp_process_group_id = g.id AND tp.is_active = 1) AS profile_count,
              (SELECT MAX(tp.time_minutes) FROM ccp_time_profiles tp WHERE tp.tenant_id = g.tenant_id AND tp.ccp_process_group_id = g.id AND tp.is_active = 1) AS profile_time
         FROM ccp_process_groups g WHERE g.tenant_id = ? AND g.status = 'active' ORDER BY g.sort_order, g.id`,
      [tenantId],
    );
  } catch (e: any) {
    if (e?.code !== "ER_BAD_FIELD_ERROR" && e?.code !== "ER_NO_SUCH_TABLE") throw e;
    [gRows] = await conn.execute(
      `SELECT g.id, g.name, g.ccp_type, g.sort_order, 'sequential' AS equip_group_mode, 1 AS equip_batch_size, 0 AS profile_count, NULL AS profile_time
         FROM ccp_process_groups g WHERE g.tenant_id = ? AND g.status = 'active' ORDER BY g.sort_order, g.id`,
      [tenantId],
    );
  }
  const [eRows]: any = await conn.execute(
    `SELECT ge.process_group_id, e.id, e.name, e.default_temperature, e.default_time, e.batch_operation_time
       FROM ccp_process_group_equipments ge
       JOIN equipments e ON e.id = ge.equipment_id AND e.tenant_id = ge.tenant_id AND e.status = 'active'
      WHERE ge.tenant_id = ? ORDER BY ge.process_group_id, ge.sort_order, ge.equipment_id`,
    [tenantId],
  );
  const byGroup = new Map<number, DesignGroup["equipments"]>();
  for (const r of eRows as any[]) {
    const k = Number(r.process_group_id);
    byGroup.set(k, [...(byGroup.get(k) ?? []), { id: Number(r.id), name: String(r.name), tempC: num(r.default_temperature), timeMin: num(r.default_time), cycleMin: num(r.batch_operation_time) }]);
  }
  return (gRows as any[]).map((r) => {
    const profileCount = Number(r.profile_count ?? 0);
    const profileTimeMin = profileCount === 1 ? num(r.profile_time) : null;
    return {
      id: Number(r.id), name: String(r.name), ccpType: String(r.ccp_type ?? ""),
      mode: String(r.equip_group_mode ?? "sequential"), batchSize: Number(r.equip_batch_size ?? 1) || 1,
      profileCount, profileTimeMin,
      // 설비 기본값(마스터)과 이 공정에 적용되는 값(계획과 같은 occupancyFor)을 나눠 보여 준다
      equipments: (byGroup.get(Number(r.id)) ?? []).map((e) => {
        const heat = profileTimeMin ?? e.timeMin;
        return { ...e, appliedHeatMin: heat, occupancyMin: occupancyFor({ cycleTotalMin: e.cycleMin, defaultTimeMin: e.timeMin } as PlannerEquipment, heat) };
      }),
    };
  });
}

export interface RecipeRow {
  reportId: number;
  reportNo: string;
  productItemId: number;
  productName: string;
  versionId: number;
  versionNo: number;
  approved: boolean;
  approvalStatus: string;
  batchTargetKg: number | null;
  /** 실제 계획이 원물·공정 환산으로 계산하는가 (회사 기능 켜짐 + 버전 켜짐 + 계산 성공) */
  massBasis: boolean;
  /** 버전은 켜졌는데 환산 계산이 안 되는 이유 — 생산 건을 만들 수 없다 */
  calcError: string | null;
  /** 계산은 되지만 확인이 필요한 이유 (실제 계획이 다른 버전을 쓰는 등) */
  calcNote: string | null;
  ingredients: Array<RecipeIngredient & { id: number; deductible: boolean; rawKgPerBatch: number | null }>;
}

const kg2 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * 1배치 원료 kg — 실제 계획(loadPlanBom · 배치 생성)과 같은 규칙 (#600 F600-01: 따로 % × 총량을 계산해 원물·공정 환산 제품이 어긋났다)
 *   기존 계산: rowKg (조정량 > 보정 수량 > 수량, % 는 버전의 1배치 총 생산량 기준, g → kg)
 *   원물·공정 환산 버전: prepareBatchMassBasis 스냅샷 (1배치 총 생산량을 계획량으로) — 공정 kg = 전처리 후 kg, 원물 kg 따로
 *   원료 품목이 없는 줄(중간재)은 두 계산 모두 공정 투입에 넣지 않으므로 kgPerBatch = null (배합량은 rawKgPerBatch 로 표시)
 */
async function applyBatchKg(conn: any, tenantId: number, r: RecipeRow, rows: any[], versionFlag: boolean): Promise<void> {
  const target = r.batchTargetKg;
  const legacy = () => {
    r.ingredients = rows.map((x, k) => {
      const kg = kg2(rowKg({ ...x, version_id: r.versionId, version_no: r.versionNo, batch_target_kg: target }));
      return { ...r.ingredients[k], kgPerBatch: x.material_id == null ? null : kg, rawKgPerBatch: kg };
    });
  };
  if (!versionFlag || !(target != null && target > 0)) return legacy();
  const pid = await toProductionProductId(r.productItemId, tenantId, conn);
  if (!pid) return legacy();
  const { prepareBatchMassBasis } = await import("../../db/production/batchMassBasis");
  const mb = await prepareBatchMassBasis(tenantId, pid, target, conn);
  if (mb.mode === "legacy") return legacy();
  if (mb.mode === "error") { r.calcError = mb.reason; return legacy(); }
  if (mb.snapshot.versionId !== r.versionId) { r.calcNote = `생산 계획은 다른 배합 버전(#${mb.snapshot.versionId})으로 환산합니다 — 이 화면(#${r.versionId})의 kg 은 기존 계산입니다`; return legacy(); }
  const scale = mb.subBatchKg && mb.subBatchKg > 0 && mb.snapshot.plannedFinishedKg > 0 ? mb.subBatchKg / mb.snapshot.plannedFinishedKg : 1;
  const byId = new Map(mb.snapshot.rows.map((x) => [x.ingredientId, x]));
  r.massBasis = true;
  r.ingredients = r.ingredients.map((i) => {
    const s = byId.get(i.id);
    return { ...i, kgPerBatch: s ? kg2(s.processKg * scale) : null, rawKgPerBatch: s ? kg2(s.rawKg * scale) : i.rawKgPerBatch };
  });
}

export async function loadRecipes(conn: any, tenantId: number): Promise<RecipeRow[]> {
  const [vRows]: any = await conn.execute(
    `SELECT r.id AS report_id, r.report_no, r.product_id, COALESCE(p.item_name, CONCAT('품목 #', r.product_id)) AS product_name,
            v.id AS version_id, v.version_no, v.approval_status, v.batch_target_kg, v.mass_basis_enabled
       FROM h_mf_reports r
       JOIN h_mf_report_versions v ON v.mf_report_id = r.id
       LEFT JOIN item_master p ON p.id = r.product_id AND p.tenant_id = r.tenant_id
      WHERE r.tenant_id = ? AND r.status = 'ACTIVE'
      ORDER BY r.id, (v.approval_status = 'APPROVED') DESC, v.version_no DESC, v.id DESC`,
    [tenantId],
  );
  // 보고서마다 첫 줄 = 생산에 쓰는 버전 (승인 우선 · 최신)
  const picked = new Map<number, any>();
  for (const r of vRows as any[]) if (!picked.has(Number(r.report_id))) picked.set(Number(r.report_id), r);
  const versionIds = Array.from(picked.values()).map((r) => Number(r.version_id));
  const rowsByVersion = new Map<number, any[]>();
  if (versionIds.length) {
    const [iRows]: any = await conn.query(
      `SELECT i.id, i.mf_report_version_id, i.material_id, COALESCE(m.item_name, CONCAT('원료 #', COALESCE(i.material_id, i.intermediate_id))) AS name,
              i.unit, i.quantity, i.corrected_quantity, i.adjusted_weight_kg, i.process_group_id, i.is_additional, i.is_deductible, i.entry_stage
         FROM h_mf_ingredients i LEFT JOIN item_master m ON m.id = i.material_id AND m.tenant_id = ?
        WHERE i.mf_report_version_id IN (?) ORDER BY i.mf_report_version_id, i.line_no, i.id`,
      [tenantId, versionIds],
    );
    for (const r of iRows as any[]) {
      const k = Number(r.mf_report_version_id);
      rowsByVersion.set(k, [...(rowsByVersion.get(k) ?? []), r]);
    }
  }
  const out: RecipeRow[] = [];
  for (const r of picked.values()) {
    const rows = rowsByVersion.get(Number(r.version_id)) ?? [];
    const row: RecipeRow = {
      reportId: Number(r.report_id), reportNo: String(r.report_no ?? ""), productItemId: Number(r.product_id), productName: String(r.product_name),
      versionId: Number(r.version_id), versionNo: Number(r.version_no), approvalStatus: String(r.approval_status), approved: r.approval_status === "APPROVED",
      batchTargetKg: num(r.batch_target_kg), massBasis: false, calcError: null, calcNote: null,
      ingredients: rows.map((x) => ({
        id: Number(x.id), name: String(x.name), unit: String(x.unit ?? "%"), quantity: Number(x.quantity) || 0, processGroupId: num(x.process_group_id),
        isAdditional: Number(x.is_additional) === 1, deductible: Number(x.is_deductible) === 1, entryStage: x.entry_stage ?? null,
        kgPerBatch: undefined, rawKgPerBatch: null,
      })),
    };
    await applyBatchKg(conn, tenantId, row, rows, Number(r.mass_basis_enabled) === 1);
    out.push(row);
  }
  return out;
}

export interface RecipeStatus extends Omit<RecipeRow, "ingredients"> {
  signal: Signal;
  issues: ReadinessIssue[];
  ingredientCount: number;
  loads: Array<{ label: string; kg: number }>;
}

export async function loadRecipeStatuses(conn: any, tenantId: number, groups?: DesignGroup[]): Promise<RecipeStatus[]> {
  const gs = groups ?? (await loadDesignGroups(conn, tenantId));
  const gMap = new Map(gs.map((g) => [g.id, g]));
  const order: Record<Signal, number> = { red: 0, yellow: 1, green: 2 };
  return (await loadRecipes(conn, tenantId))
    .map(({ ingredients, ...r }) => {
      const input = { approved: r.approved, batchTargetKg: r.batchTargetKg, ingredients, calcError: r.calcError, calcNote: r.calcNote };
      const c = checkRecipe(input, gMap);
      return { ...r, signal: c.signal, issues: c.issues, ingredientCount: ingredients.length, loads: processLoads(input, gMap) };
    })
    .sort((a, b) => order[a.signal] - order[b.signal] || a.productName.localeCompare(b.productName, "ko"));
}

export interface HistoryEntry {
  at: string;
  kind: "process" | "equipment" | "recipe" | "recipe-approval" | "daily-log";
  title: string;
  description: string | null;
  who: string | null;
  changes: Array<{ field: string; before: unknown; after: unknown }>;
  /** 이 변경 뒤에 만들어진 생산 건 / CCP 기록 수 (적용 추적) — 모르면 null */
  appliedCount: number | null;
  appliedLabel: string | null;
  appliedFirst: string | null;
}

const FIELD_LABEL: Record<string, string> = {
  name: "이름", ccp_type: "CCP 유형", temperature_min: "최저 온도", temperature_max: "최고 온도", time_min: "최소 시간", time_max: "최대 시간",
  pressure_min: "최저 압력", pressure_max: "최고 압력", ph_min: "최저 pH", ph_max: "최고 pH",
  equip_group_mode: "운전 방식", equip_interval_min: "투입 간격(분)", equip_batch_size: "묶음 대수",
  defaultTemperature: "평소 온도", defaultPressure: "평소 압력", defaultTime: "가열시간(분)", batchOperationTime: "한 번 도는 시간(분)",
  edgeTemperature: "가장자리 품온", centerTemperature: "중심 품온", workStartTime: "작업 시작", workEndTime: "작업 종료", status: "상태",
  batchTargetKg: "1배치 총 생산량(kg)", referenceFinishedKg: "기준 완제품량(kg)", yieldBasis: "수율 기준", unitWeightG: "단위 중량(g)", reportNo: "보고서 번호", reportDate: "보고 일자", massBasisEnabled: "원물·공정 환산",
};
export const fieldLabel = (f: string) => FIELD_LABEL[f] ?? f;
const MODE_LABEL: Record<string, string> = { sequential: "한 대씩 차례로", concurrent: "동시에", grouped: "몇 대씩 묶어서" };

function parseChanges(raw: unknown): Array<{ field: string; before: unknown; after: unknown }> {
  let c: any = raw;
  if (typeof c === "string") { try { c = JSON.parse(c); } catch { return []; } }
  if (!c || typeof c !== "object") return [];
  const src = c.diff ?? c.changes ?? c;
  const out: Array<{ field: string; before: unknown; after: unknown }> = [];
  if (Array.isArray(src)) {
    for (const x of src) if (x && typeof x === "object" && "field" in x) out.push({ field: fieldLabel(String(x.field)), before: x.before ?? null, after: x.after ?? null });
    return out;
  }
  for (const [k, v] of Object.entries(src)) {
    if (v && typeof v === "object" && ("before" in (v as any) || "after" in (v as any))) {
      const b = (v as any).before ?? null, a = (v as any).after ?? null;
      out.push({ field: fieldLabel(k), before: k === "equip_group_mode" ? MODE_LABEL[String(b)] ?? b : b, after: k === "equip_group_mode" ? MODE_LABEL[String(a)] ?? a : a });
    }
  }
  return out;
}

async function countAfter(conn: any, sql: string, params: unknown[]): Promise<{ n: number; first: string | null }> {
  try {
    const [[r]]: any = await conn.execute(sql, params);
    return { n: Number(r?.n ?? 0), first: r?.first ? String(r.first) : null };
  } catch {
    return { n: 0, first: null };
  }
}

export async function loadHistory(conn: any, tenantId: number, limit = 100): Promise<HistoryEntry[]> {
  const [aRows]: any = await conn.execute(
    `SELECT a.id, a.action, a.entity_type, a.entity_id, a.changes, a.description, a.user_email, DATE_FORMAT(a.created_at, '%Y-%m-%d %H:%i') AS at, a.created_at AS raw_at
       FROM audit_logs a
      WHERE a.tenant_id = ? AND (a.entity_type IN ('ccp_process_group', 'equipment', 'mf_report', 'daily_log_settings'))
      ORDER BY a.created_at DESC, a.id DESC LIMIT ${Math.max(1, Math.min(500, Math.floor(limit)))}`,
    [tenantId],
  );
  const [pRows]: any = await conn.execute(
    `SELECT ap.action, ap.comment, DATE_FORMAT(ap.action_at, '%Y-%m-%d %H:%i') AS at, ap.action_at AS raw_at, u.email AS who,
            r.id AS report_id, r.product_id, COALESCE(p.item_name, CONCAT('품목 #', r.product_id)) AS product_name, v.version_no
       FROM h_mf_report_approvals ap
       JOIN h_mf_report_versions v ON v.id = ap.mf_report_version_id
       JOIN h_mf_reports r ON r.id = v.mf_report_id AND r.tenant_id = ?
       LEFT JOIN item_master p ON p.id = r.product_id AND p.tenant_id = r.tenant_id
       LEFT JOIN users u ON u.id = ap.action_by
      ORDER BY ap.action_at DESC LIMIT ${Math.max(1, Math.min(500, Math.floor(limit)))}`,
    [tenantId],
  );

  const out: Array<HistoryEntry & { rawAt: any }> = [];
  for (const a of aRows as any[]) {
    const et = String(a.entity_type);
    const kind: HistoryEntry["kind"] = et === "ccp_process_group" ? "process" : et === "equipment" ? "equipment" : et === "mf_report" ? "recipe" : "daily-log";
    let applied = { n: 0, first: null as string | null };
    let appliedLabel: string | null = null;
    if (kind === "process" && a.entity_id) {
      applied = await countAfter(conn, `SELECT COUNT(*) AS n, DATE_FORMAT(MIN(i.created_at), '%Y-%m-%d') AS first FROM h_ccp_instances i WHERE i.tenant_id = ? AND i.process_group_id = ? AND i.created_at > ?`, [tenantId, a.entity_id, a.raw_at]);
      appliedLabel = "이후 만들어진 CCP 기록";
    } else if (kind === "equipment" && a.entity_id) {
      applied = await countAfter(conn, `SELECT COUNT(DISTINCT r.instance_id) AS n, DATE_FORMAT(MIN(r.created_at), '%Y-%m-%d') AS first FROM h_ccp_rows r WHERE r.tenant_id = ? AND r.equipment_id = ? AND r.created_at > ?`, [tenantId, a.entity_id, a.raw_at]);
      appliedLabel = "이후 이 설비가 배정된 CCP 기록";
    } else if (kind === "recipe" && a.entity_id) {
      const [[rep]]: any = await conn.execute(`SELECT product_id FROM h_mf_reports WHERE id = ? AND tenant_id = ?`, [a.entity_id, tenantId]);
      const pid = rep?.product_id ? await toProductionProductId(Number(rep.product_id), tenantId, conn) : null;
      if (pid) applied = await countAfter(conn, `SELECT COUNT(*) AS n, DATE_FORMAT(MIN(planned_date), '%Y-%m-%d') AS first FROM h_batches WHERE tenant_id = ? AND product_id = ? AND created_at > ? AND status <> 'cancelled'`, [tenantId, pid, a.raw_at]);
      appliedLabel = "이후 만들어진 생산 건";
    }
    out.push({
      at: String(a.at), rawAt: a.raw_at, kind,
      title: String(a.description ?? a.action),
      description: null, who: a.user_email ?? null,
      changes: parseChanges(a.changes),
      appliedCount: appliedLabel ? applied.n : null, appliedLabel, appliedFirst: applied.first,
    });
  }
  for (const p of pRows as any[]) {
    const pid = p.product_id ? await toProductionProductId(Number(p.product_id), tenantId, conn) : null;
    const applied = pid ? await countAfter(conn, `SELECT COUNT(*) AS n, DATE_FORMAT(MIN(planned_date), '%Y-%m-%d') AS first FROM h_batches WHERE tenant_id = ? AND product_id = ? AND created_at > ? AND status <> 'cancelled'`, [tenantId, pid, p.raw_at]) : { n: 0, first: null };
    const act = String(p.action).toUpperCase();
    out.push({
      at: String(p.at), rawAt: p.raw_at, kind: "recipe-approval",
      title: `${p.product_name} 배합 v${p.version_no} ${act === "APPROVE" || act === "APPROVED" ? "승인" : act === "REJECT" || act === "REJECTED" ? "반려" : act}`,
      description: p.comment ?? null, who: p.who ?? null, changes: [],
      appliedCount: pid ? applied.n : null, appliedLabel: pid ? "이후 만들어진 생산 건" : null, appliedFirst: applied.first,
    });
  }
  return out
    .sort((a, b) => new Date(b.rawAt).getTime() - new Date(a.rawAt).getTime())
    .slice(0, limit)
    .map(({ rawAt, ...e }) => e);
}

export async function loadOverview(conn: any, tenantId: number) {
  const groups = await loadDesignGroups(conn, tenantId);
  const recipes = await loadRecipeStatuses(conn, tenantId, groups);
  const settingIssues = groups.flatMap(groupIssues);
  const [pRows]: any = await conn.execute(
    `SELECT r.id AS report_id, COALESCE(p.item_name, CONCAT('품목 #', r.product_id)) AS product_name, v.id AS version_id, v.version_no, v.approval_status,
            DATE_FORMAT(v.created_at, '%Y-%m-%d') AS created
       FROM h_mf_report_versions v
       JOIN h_mf_reports r ON r.id = v.mf_report_id AND r.tenant_id = ? AND r.status = 'ACTIVE'
       LEFT JOIN item_master p ON p.id = r.product_id AND p.tenant_id = r.tenant_id
      WHERE v.approval_status <> 'APPROVED'
      ORDER BY v.created_at DESC`,
    [tenantId],
  );
  const counts = { green: 0, yellow: 0, red: 0 };
  for (const r of recipes) counts[r.signal]++;
  return {
    counts,
    recipes,
    pending: (pRows as any[]).map((r) => ({ reportId: Number(r.report_id), productName: String(r.product_name), versionId: Number(r.version_id), versionNo: Number(r.version_no), status: String(r.approval_status), created: r.created ?? null })),
    settingIssues,
    recent: (await loadHistory(conn, tenantId, 8)),
  };
}

/**
 * 제품 배합 상세 (생산 설계 2a) — 생산에 쓰는 버전의 원료 줄 · 1배치 kg · 들어가는 곳 · 공정(설비) · 공통 후속 공정
 *   흐름도(분류도)와 배합표가 같은 데이터를 쓴다. 공정끼리의 순서·합류는 데이터에 없으므로 추측하지 않는다.
 */
export async function loadRecipeDetail(conn: any, tenantId: number, reportId: number) {
  const recipes = await loadRecipes(conn, tenantId);
  const r = recipes.find((x) => x.reportId === reportId);
  if (!r) return null;
  const groups = await loadDesignGroups(conn, tenantId);
  const gMap = new Map(groups.map((g) => [g.id, g]));
  const ingredients = r.ingredients.map((i) => ({
    ...i, kgPerBatch: i.kgPerBatch ?? null,
    processName: i.processGroupId != null ? gMap.get(i.processGroupId)?.name ?? `공정 #${i.processGroupId}` : null,
  }));
  const c = checkRecipe({ approved: r.approved, batchTargetKg: r.batchTargetKg, ingredients: r.ingredients, calcError: r.calcError, calcNote: r.calcNote }, gMap);
  return {
    reportId: r.reportId, reportNo: r.reportNo, productName: r.productName, versionId: r.versionId, versionNo: r.versionNo,
    approved: r.approved, batchTargetKg: r.batchTargetKg, massBasis: r.massBasis, calcError: r.calcError,
    signal: c.signal, issues: c.issues, ingredients,
    processes: groups.filter((g) => c.usedGroupIds.includes(g.id)).map((g) => ({ id: g.id, name: g.name, ccpType: g.ccpType, mode: g.mode, batchSize: g.batchSize, profileTimeMin: g.profileTimeMin, equipmentNames: g.equipments.map((e) => e.name) })),
    // 모든 제품이 거치는 공통 후속 공정 — 지금 코드(배치 생성)가 활성 CCP-4P 를 모든 제품에 넣는 것과 같은 범위
    common: groups.filter((g) => g.ccpType === "CCP-4P").map((g) => ({ id: g.id, name: g.name })),
  };
}

/** 들어가는 곳 저장 — 공정이 없는 원료 줄만, 이 회사·이 버전의 줄만. 바뀐 것만 돌려준다 */
export async function saveEntryStages(
  conn: any, tenantId: number, reportId: number, versionId: number, items: Array<{ ingredientId: number; stage: "direct" | "late" | null }>,
): Promise<Array<{ name: string; before: string; after: string }>> {
  const [[own]]: any = await conn.execute(
    `SELECT v.id FROM h_mf_report_versions v JOIN h_mf_reports r ON r.id = v.mf_report_id WHERE v.id = ? AND r.id = ? AND r.tenant_id = ?`,
    [versionId, reportId, tenantId],
  );
  if (!own) throw new Error("이 회사의 품목제조보고 버전이 아닙니다.");
  const ids = Array.from(new Set(items.map((i) => i.ingredientId)));
  if (!ids.length) return [];
  const [rows]: any = await conn.query(
    `SELECT i.id, i.process_group_id, i.entry_stage, COALESCE(m.item_name, CONCAT('원료 #', COALESCE(i.material_id, i.intermediate_id))) AS name
       FROM h_mf_ingredients i LEFT JOIN item_master m ON m.id = i.material_id AND m.tenant_id = ?
      WHERE i.mf_report_version_id = ? AND i.id IN (?)`,
    [tenantId, versionId, ids],
  );
  const byId = new Map((rows as any[]).map((r) => [Number(r.id), r]));
  if (byId.size !== ids.length) throw new Error("이 버전의 원료 줄이 아닌 번호가 있습니다 — 새로고침 후 다시 하세요.");
  const label = (s: string | null) => (s ? ENTRY_LABEL[s] ?? s : "아직 모름");
  const changed: Array<{ name: string; before: string; after: string }> = [];
  for (const it of items) {
    const row = byId.get(it.ingredientId)!;
    if (row.process_group_id != null) continue; // 공정이 지정된 줄은 공정이 우선 — 들어가는 곳을 따로 두지 않는다
    const before = row.entry_stage ?? null;
    if ((before ?? null) === (it.stage ?? null)) continue;
    await conn.execute(`UPDATE h_mf_ingredients SET entry_stage = ? WHERE id = ? AND mf_report_version_id = ? AND process_group_id IS NULL`, [it.stage, it.ingredientId, versionId]);
    changed.push({ name: String(row.name), before: label(before), after: label(it.stage) });
  }
  return changed;
}
const ENTRY_LABEL: Record<string, string> = { direct: "성형에 바로", late: "나중에 넣음" };

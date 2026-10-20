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
import { toProductionProductId, toProductionProductIds, asItemMasterId } from "../identity/itemIdentityService";
import { rowKg } from "./ccpBomInput";
import { BomQtyError } from "./batchInputPlan";
import { heatingFor, occupancyFor, type PlannerEquipment } from "./ccpDayPlanner";

const num = (v: unknown) => (v == null ? null : Number(v));

export async function loadDesignGroups(conn: any, tenantId: number): Promise<DesignGroup[]> {
  let gRows: any[];
  try {
    [gRows] = await conn.execute(
      `SELECT g.id, g.name, g.ccp_type, g.sort_order, g.equip_group_mode, g.equip_batch_size, g.equip_interval_min,
              g.monitoring_cycle, g.monitoring_method, g.corrective_action,
              (SELECT COUNT(*) FROM ccp_time_profiles tp WHERE tp.tenant_id = g.tenant_id AND tp.ccp_process_group_id = g.id AND tp.is_active = 1) AS profile_count,
              (SELECT MAX(tp.time_minutes) FROM ccp_time_profiles tp WHERE tp.tenant_id = g.tenant_id AND tp.ccp_process_group_id = g.id AND tp.is_active = 1) AS profile_time
         FROM ccp_process_groups g WHERE g.tenant_id = ? AND g.status = 'active' ORDER BY g.sort_order, g.id`,
      [tenantId],
    );
  } catch (e: any) {
    if (e?.code !== "ER_BAD_FIELD_ERROR" && e?.code !== "ER_NO_SUCH_TABLE") throw e;
    [gRows] = await conn.execute(
      `SELECT g.id, g.name, g.ccp_type, g.sort_order, 'sequential' AS equip_group_mode, 1 AS equip_batch_size, 10 AS equip_interval_min, 0 AS profile_count, NULL AS profile_time
         FROM ccp_process_groups g WHERE g.tenant_id = ? AND g.status = 'active' ORDER BY g.sort_order, g.id`,
      [tenantId],
    );
  }
  const [eRows]: any = await conn.execute(
    `SELECT ge.process_group_id, e.id, e.name, e.default_temperature, e.default_time, e.batch_operation_time, e.work_start_time
       FROM ccp_process_group_equipments ge
       JOIN equipments e ON e.id = ge.equipment_id AND e.tenant_id = ge.tenant_id AND e.status = 'active'
      WHERE ge.tenant_id = ? ORDER BY ge.process_group_id, ge.sort_order, ge.equipment_id`,
    [tenantId],
  );
  const byGroup = new Map<number, DesignGroup["equipments"]>();
  for (const r of eRows as any[]) {
    const k = Number(r.process_group_id);
    byGroup.set(k, [...(byGroup.get(k) ?? []), {
      id: Number(r.id), name: String(r.name), tempC: num(r.default_temperature), timeMin: num(r.default_time), cycleMin: num(r.batch_operation_time),
      workStartTime: r.work_start_time ? String(r.work_start_time).slice(0, 5) : null,
    }]);
  }
  return (gRows as any[]).map((r) => {
    const profileCount = Number(r.profile_count ?? 0);
    const profileTimeMin = profileCount === 1 ? num(r.profile_time) : null;
    return {
      id: Number(r.id), name: String(r.name), ccpType: String(r.ccp_type ?? ""),
      mode: String(r.equip_group_mode ?? "sequential"), batchSize: Number(r.equip_batch_size ?? 1) || 1,
      intervalMin: r.equip_interval_min != null ? Number(r.equip_interval_min) : 10,
      profileCount, profileTimeMin,
      monitoringCycle: r.monitoring_cycle ?? null, monitoringMethod: r.monitoring_method ?? null, correctiveAction: r.corrective_action ?? null,
      // 설비 기본값(마스터)과 이 공정에 적용되는 값(계획과 같은 occupancyFor)을 나눠 보여 준다
      equipments: (byGroup.get(Number(r.id)) ?? []).map((e) => {
        const heat = heatingFor(profileCount, profileTimeMin, e.timeMin);
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
  /** 이 버전의 자리 — production(지금 생산에 씀) · draft(그보다 새 수정안, 승인 전) · old(생산에 안 쓰는 옛 버전) */
  versionRole: "production" | "draft" | "old";
  /** 생산에 쓰는 버전보다 새 수정안(승인 전)이 있으면 그 버전 — 현재 신호등과 구분해 보여 준다 */
  newerDraft: { versionId: number; versionNo: number } | null;
  ingredients: Array<RecipeIngredient & { id: number; deductible: boolean; rawKgPerBatch: number | null }>;
}

const kg2 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * 1배치 원료 kg — 실제 계획(loadPlanBom · 배치 생성)과 같은 규칙 (#600 F600-01: 따로 % × 총량을 계산해 원물·공정 환산 제품이 어긋났다)
 *   기존 계산: rowKg (조정량 > BOM 줄 계약 — 주원료 % 는 버전의 1배치 총 생산량 기준, 추가 원재료 kg·g 는 절대량)
 *   원물·공정 환산 버전: prepareBatchMassBasis 스냅샷 (1배치 총 생산량을 계획량으로) — 공정 kg = 전처리 후 kg, 원물 kg 따로
 *   원료 품목이 없는 줄(중간재)은 두 계산 모두 공정 투입에 넣지 않으므로 kgPerBatch = null (배합량은 rawKgPerBatch 로 표시)
 */
async function applyBatchKg(conn: any, tenantId: number, r: RecipeRow, rows: any[], versionFlag: boolean, pid: number | null): Promise<void> {
  const target = r.batchTargetKg;
  const legacy = () => {
    r.ingredients = rows.map((x, k) => {
      let kg: number | null = null;
      try {
        kg = kg2(rowKg({ ...x, version_id: r.versionId, version_no: r.versionNo, batch_target_kg: target }));
      } catch (e) {
        if (!(e instanceof BomQtyError)) throw e; // 계약으로 정할 수 없는 줄 — kg 를 비우고 준비 상태(unit-kg)가 알린다
      }
      return { ...r.ingredients[k], kgPerBatch: x.material_id == null ? null : kg, rawKgPerBatch: kg };
    });
  };
  if (!versionFlag || !(target != null && target > 0)) return legacy();
  if (r.versionRole !== "production") {
    // 실제 계획은 생산에 쓰는 버전만 환산한다 — 수정안·옛 버전은 같은 함수로 계산할 근거가 없어 기존 계산으로 보여 준다
    r.calcNote = "원물·공정 환산 버전 — 이 버전이 생산에 쓰일 때 환산됩니다 (지금 보이는 kg 은 배합비 기준)";
    return legacy();
  }
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

/**
 * @param only 한 보고서(·한 버전)만 — 제품 배합 상세. versionId 가 없으면 생산에 쓰는 버전
 */
export async function loadRecipes(conn: any, tenantId: number, only?: { reportId: number; versionId?: number }): Promise<RecipeRow[]> {
  const [vRows]: any = await conn.execute(
    `SELECT r.id AS report_id, r.report_no, r.product_id, COALESCE(p.item_name, CONCAT('품목 #', r.product_id)) AS product_name,
            v.id AS version_id, v.version_no, v.approval_status, v.batch_target_kg, v.mass_basis_enabled
       FROM h_mf_reports r
       JOIN h_mf_report_versions v ON v.mf_report_id = r.id
       LEFT JOIN item_master p ON p.id = r.product_id AND p.tenant_id = r.tenant_id
      WHERE r.tenant_id = ? AND r.status = 'ACTIVE' ${only ? "AND r.id = ?" : ""}
      ORDER BY r.id, (v.approval_status = 'APPROVED') DESC, v.version_no DESC, v.id DESC`,
    only ? [tenantId, only.reportId] : [tenantId],
  );
  // 보고서마다 첫 줄 = 생산에 쓰는 버전 (승인 우선 · 최신 — selectBomVersion 과 같은 규칙)
  const production = new Map<number, any>();
  const allByReport = new Map<number, any[]>();
  for (const r of vRows as any[]) {
    const k = Number(r.report_id);
    if (!production.has(k)) production.set(k, r);
    allByReport.set(k, [...(allByReport.get(k) ?? []), r]);
  }
  const roleOf = (v: any): RecipeRow["versionRole"] => {
    const prod = production.get(Number(v.report_id));
    if (Number(v.version_id) === Number(prod.version_id)) return "production";
    return v.approval_status !== "APPROVED" && Number(v.version_no) > Number(prod.version_no) ? "draft" : "old";
  };
  let picked: any[] = Array.from(production.values());
  if (only?.versionId) picked = (vRows as any[]).filter((v) => Number(v.version_id) === only.versionId);

  const versionIds = picked.map((r) => Number(r.version_id));
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
  // 생산 품목 id (원물 환산이 쓰는 id) — 이름·번호 추측 없이 item_master.legacy_product_id 연결만
  const pidByItem = await toProductionProductIds(picked.map((r) => Number(r.product_id)), tenantId, conn);
  const out: RecipeRow[] = [];
  for (const r of picked) {
    const rows = rowsByVersion.get(Number(r.version_id)) ?? [];
    const prod = production.get(Number(r.report_id));
    const draft = (allByReport.get(Number(r.report_id)) ?? [])
      .filter((v) => v.approval_status !== "APPROVED" && Number(v.version_no) > Number(prod.version_no))
      .sort((a, b) => Number(b.version_no) - Number(a.version_no))[0];
    const pid = pidByItem.get(Number(r.product_id)) ?? null;
    const row: RecipeRow = {
      reportId: Number(r.report_id), reportNo: String(r.report_no ?? ""), productItemId: Number(r.product_id), productName: String(r.product_name),
      versionId: Number(r.version_id), versionNo: Number(r.version_no), approvalStatus: String(r.approval_status), approved: r.approval_status === "APPROVED",
      batchTargetKg: num(r.batch_target_kg), massBasis: false, calcError: null, calcNote: null,
      versionRole: roleOf(r),
      newerDraft: draft ? { versionId: Number(draft.version_id), versionNo: Number(draft.version_no) } : null,
      ingredients: rows.map((x) => ({
        id: Number(x.id), name: String(x.name), unit: String(x.unit ?? "%"), quantity: Number(x.quantity) || 0, processGroupId: num(x.process_group_id),
        isAdditional: Number(x.is_additional) === 1, deductible: Number(x.is_deductible) === 1, entryStage: x.entry_stage ?? null,
        kgPerBatch: undefined, rawKgPerBatch: null,
      })),
    };
    await applyBatchKg(conn, tenantId, row, rows, Number(r.mass_basis_enabled) === 1, pid);
    out.push(row);
  }
  return out;
}

const readinessInput = (r: RecipeRow) => ({
  approved: r.approved, batchTargetKg: r.batchTargetKg, ingredients: r.ingredients,
  calcError: r.calcError, calcNote: r.calcNote, versionRole: r.versionRole,
});

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
    .map((full) => {
      const { ingredients, ...r } = full;
      const input = readinessInput(full);
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
  heat_min: "운영 가열시간(분)", equipment_ids: "연결 설비",
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
      const pid = rep?.product_id ? await toProductionProductId(asItemMasterId(rep.product_id), tenantId, conn) : null; // 보고서 product_id = 정체성 번호
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
    const pid = p.product_id ? await toProductionProductId(asItemMasterId(p.product_id), tenantId, conn) : null;
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

/** 승인되지 않은 버전 목록 — 자리(수정안·옛 초안·반려·유일 초안)만 구분, 처리하지 않는다 */
export async function loadPendingVersions(conn: any, tenantId: number) {
  const [pRows]: any = await conn.execute(
    `SELECT r.id AS report_id, COALESCE(p.item_name, CONCAT('품목 #', r.product_id)) AS product_name, v.id AS version_id, v.version_no, v.approval_status,
            DATE_FORMAT(v.created_at, '%Y-%m-%d') AS created,
            (SELECT MAX(a.version_no) FROM h_mf_report_versions a WHERE a.mf_report_id = v.mf_report_id AND a.approval_status = 'APPROVED') AS approved_no
       FROM h_mf_report_versions v
       JOIN h_mf_reports r ON r.id = v.mf_report_id AND r.tenant_id = ? AND r.status = 'ACTIVE'
       LEFT JOIN item_master p ON p.id = r.product_id AND p.tenant_id = r.tenant_id
      WHERE v.approval_status <> 'APPROVED'
      ORDER BY v.created_at DESC`,
    [tenantId],
  );
  // 승인되지 않은 버전의 자리 (#600 검토 A6) — 처리(승인·반려·정리)는 하지 않고 구분만:
  //   draft      : 승인 버전보다 새 수정안 → 승인 대기
  //   superseded : 더 새 승인 버전이 이미 생산에 쓰임 → 옛 초안 (처리 방법은 사람이 정함)
  //   rejected   : 반려됨
  //   only       : 승인 버전이 하나도 없음 (이 초안으로 생산 중 — 신호등 빨강)
  const pendingKind = (r: any) => {
    if (String(r.approval_status) === "REJECTED") return "rejected";
    if (r.approved_no == null) return "only";
    return Number(r.version_no) > Number(r.approved_no) ? "draft" : "superseded";
  };
  return (pRows as any[]).map((r) => ({
    reportId: Number(r.report_id), productName: String(r.product_name), versionId: Number(r.version_id), versionNo: Number(r.version_no),
    status: String(r.approval_status), created: r.created ?? null, kind: pendingKind(r), approvedVersionNo: r.approved_no != null ? Number(r.approved_no) : null,
  }));
}

export async function loadOverview(conn: any, tenantId: number) {
  const groups = await loadDesignGroups(conn, tenantId);
  const recipes = await loadRecipeStatuses(conn, tenantId, groups);
  const settingIssues = groups.flatMap(groupIssues);
  const counts = { green: 0, yellow: 0, red: 0 };
  for (const r of recipes) counts[r.signal]++;
  return {
    counts,
    recipes,
    pending: await loadPendingVersions(conn, tenantId),
    settingIssues,
    recent: (await loadHistory(conn, tenantId, 8)),
  };
}

/**
 * 제품 배합 상세 (생산 설계 2a) — 생산에 쓰는 버전의 원료 줄 · 1배치 kg · 들어가는 곳 · 공정(설비) · 공통 후속 공정
 *   흐름도(분류도)와 배합표가 같은 데이터를 쓴다. 공정끼리의 순서·합류는 데이터에 없으므로 추측하지 않는다.
 */
export async function loadRecipeDetail(conn: any, tenantId: number, reportId: number, versionId?: number) {
  const [r] = await loadRecipes(conn, tenantId, { reportId, versionId });
  if (!r) return null;
  const groups = await loadDesignGroups(conn, tenantId);
  const gMap = new Map(groups.map((g) => [g.id, g]));
  const ingredients = r.ingredients.map((i) => ({
    ...i, kgPerBatch: i.kgPerBatch ?? null,
    processName: i.processGroupId != null ? gMap.get(i.processGroupId)?.name ?? `공정 #${i.processGroupId}` : null,
  }));
  const c = checkRecipe(readinessInput(r), gMap);
  const [vRows]: any = await conn.execute(
    `SELECT v.id, v.version_no, v.approval_status FROM h_mf_report_versions v JOIN h_mf_reports r ON r.id = v.mf_report_id AND r.tenant_id = ?
      WHERE v.mf_report_id = ? ORDER BY v.version_no DESC, v.id DESC`,
    [tenantId, reportId],
  );
  const proc = (g: DesignGroup) => ({ id: g.id, name: g.name, ccpType: g.ccpType, mode: g.mode, batchSize: g.batchSize, profileTimeMin: g.profileTimeMin, equipmentNames: g.equipments.map((e) => e.name) });
  return {
    reportId: r.reportId, reportNo: r.reportNo, productName: r.productName, versionId: r.versionId, versionNo: r.versionNo,
    approved: r.approved, versionRole: r.versionRole, newerDraft: r.newerDraft,
    batchTargetKg: r.batchTargetKg, massBasis: r.massBasis, calcError: r.calcError,
    signal: c.signal, issues: c.issues, ingredients,
    processes: groups.filter((g) => c.usedGroupIds.includes(g.id)).map(proc),
    // 모든 제품이 거치는 공통 후속 공정 — 지금 코드(배치 생성)가 활성 CCP-4P 를 모든 제품에 넣는 것과 같은 범위
    common: groups.filter((g) => g.ccpType === "CCP-4P").map((g) => ({ id: g.id, name: g.name })),
    versions: (vRows as any[]).map((v) => ({ versionId: Number(v.id), versionNo: Number(v.version_no), status: String(v.approval_status) })),
  };
}



/**
 * 시험 계산 (생산 설계 2b) — 총 생산량을 넣으면 '오늘 생산' 과 같은 계산으로 회차·공정·설비 시각·원료 양을 보여 준다. 저장 없음.
 *   계획: planCcpForDay (오늘 생산 미리보기·실제 생성과 같은 함수) — 그날 잡힌 다른 생산은 빼고 빈 공장으로 계산.
 *         시작 시각을 안 주면 오늘 생산처럼 설비 작업 시작 시각, 주면 그 시각으로 (오늘 생산의 '시작 시각 바꾸기' 와 같음)
 *   원료: 배치 생성과 같은 식 — 원물·공정 환산이면 prepareBatchMassBasis 스냅샷(원물 kg → 원료 단위), 아니면 BOM 줄 계약(plannedInputQty)
 *   막히는 이유: 미리보기와 같은 사전 검증 (CCP 연결 · 환산 계산 실패)
 * 쓰는 버전 = 생산에 쓰는 버전 (selectBomVersion). 수정안은 승인돼야 계산 대상.
 */
export async function trialCalc(conn: any, tenantId: number, reportId: number, plannedKg: number, startOverride: string | null) {
  const [r] = await loadRecipes(conn, tenantId, { reportId });
  if (!r) return null;
  const pid = await toProductionProductId(asItemMasterId(r.productItemId), tenantId, conn);
  if (!pid) return { ok: false as const, reason: "이 제품은 생산 품목과 연결되어 있지 않아 계산할 수 없습니다 (품목 연결 확인)." };

  const { planCcpForDay } = await import("../../services/ccp-batch");
  const { todayKST } = await import("../../utils/timezone");
  const day = await planCcpForDay({ tenantId, workDate: todayKST(), rows: [{ rowKey: "trial", productId: pid, plannedKg, startTime: startOverride ?? "09:00", startTimeOverride: startOverride }], ignoreBusy: true });
  const plan = day.plans[0];
  const meta = day.meta[0];

  const blocking: string[] = [];
  const { validateProductCcpMapping } = await import("../../services/validateProductCcpMapping");
  const v = await validateProductCcpMapping({ productId: pid, productName: r.productName, tenantId });
  if (!v.valid) blocking.push(v.message);
  if (meta.bom.massBasis === "error") blocking.push(`원물·공정 환산 계산 불가 — ${meta.bom.error}`);
  if (meta.bom.qtyError) blocking.push(`원료 양 계산 불가 — ${meta.bom.qtyError}`);
  blocking.push(...(plan?.blocking ?? []));

  // 원료 — 배치 생성과 같은 줄·같은 식
  const versionId = meta.bom.versionId;
  const ingredients: Array<{ id: number; name: string; unit: string; deductQty: number | null; processKg: number | null; processName: string | null; entryLabel: string; deductible: boolean }> = [];
  if (versionId) {
    const [iRows]: any = await conn.execute(
      `SELECT i.id, i.material_id, i.quantity, i.corrected_quantity, i.unit, i.is_additional, i.is_deductible, i.process_group_id, i.entry_stage, im.base_unit,
              COALESCE(im.item_name, CONCAT('원료 #', COALESCE(i.material_id, i.intermediate_id))) AS name, g.name AS process_name
         FROM h_mf_ingredients i
         LEFT JOIN item_master im ON im.id = i.material_id
         LEFT JOIN ccp_process_groups g ON g.id = i.process_group_id AND g.tenant_id = ?
        WHERE i.mf_report_version_id = ? ORDER BY i.line_no, i.id`,
      [tenantId, versionId],
    );
    let rawById: Map<number, number> | null = null;
    let procById: Map<number, number> | null = null;
    if (meta.bom.massBasis === "basis") {
      const { prepareBatchMassBasis } = await import("../../db/production/batchMassBasis");
      const mb = await prepareBatchMassBasis(tenantId, pid, plannedKg, conn);
      if (mb.mode === "basis") {
        const { recordedRawKgByIngredient } = await import("../../db/production/batchCRUD");
        rawById = recordedRawKgByIngredient({ recorded: true, snapshot: mb.snapshot });
        procById = new Map(mb.snapshot.rows.map((x) => [x.ingredientId, x.processKg]));
      }
    }
    const { isPlannedInputRow, plannedInputQty } = await import("./batchInputPlan");
    const { rawKgToMaterialUnit } = await import("../../db/production/batchMassBasis");
    const r3 = (n: number) => Math.round(n * 1000) / 1000; // 배치 투입 계획 저장 정밀도 (toFixed(3)) 와 같게
    for (const x of iRows as any[]) {
      const row = {
        materialId: x.material_id != null ? Number(x.material_id) : null, isDeductible: x.is_deductible != null ? Number(x.is_deductible) : null,
        quantity: x.quantity, correctedQuantity: x.corrected_quantity, unit: x.unit, isAdditional: x.is_additional != null ? Number(x.is_additional) : null,
      };
      let deductQty: number | null = null;
      let unit = String(x.base_unit || "kg");
      if (isPlannedInputRow(row)) {
        if (rawById) {
          const conv = rawById.has(Number(x.id)) ? rawKgToMaterialUnit(rawById.get(Number(x.id))!, x.base_unit) : null;
          if (!conv) blocking.push(`원료 줄 ${x.name}: 원물·공정 환산 원물 kg 를 원료 단위(${x.base_unit ?? "-"})로 바꿀 수 없습니다`);
          else { deductQty = r3(conv.qty); unit = conv.unit; }
        } else {
          // 배치 생성과 같은 BOM 줄 계약 — 계산할 수 없는 줄은 위 qtyError 로 이미 막힘, 여기서는 칸만 비움
          try {
            const q = plannedInputQty(row, plannedKg, meta.bom.subBatchKg, x.base_unit);
            deductQty = r3(q.qty); unit = q.unit;
          } catch (e) {
            if (!(e instanceof BomQtyError)) throw e;
          }
        }
      }
      const pg = x.process_group_id != null ? Number(x.process_group_id) : null;
      ingredients.push({
        id: Number(x.id), name: String(x.name), unit, deductQty,
        processKg: procById?.has(Number(x.id)) ? r3(procById.get(Number(x.id))!) : null,
        processName: x.process_name ?? null,
        entryLabel: pg != null ? (x.process_name ?? `공정 #${pg}`) : x.entry_stage === "direct" ? "성형에 바로" : x.entry_stage === "late" ? "나중에 넣음" : "아직 모름",
        deductible: Number(x.is_deductible) !== 0,
      });
    }
  }

  return {
    ok: true as const,
    reportId: r.reportId, productName: r.productName,
    versionId, versionNo: meta.bom.versionNo, approved: meta.bom.approved, massBasis: meta.bom.massBasis,
    plannedKg, startOverride, subBatchKg: meta.bom.subBatchKg, roundsCount: plan.roundsCount,
    processes: plan.processes,
    common: meta.groups.filter((g: any) => g.ccp_type === "CCP-4P").map((g: any) => g.name),
    warnings: plan.warnings, blocking, ingredients,
    // 화면의 버전과 계획 버전이 다르면 알려 준다 (수정안을 보고 있을 때 등)
    sameVersionAsScreen: versionId === r.versionId,
  };
}

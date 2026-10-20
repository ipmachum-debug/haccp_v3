/**
 * 생산 화면 자동 검사 — 하루 생산 건마다 '지금 막힌 것' (2026-10-20, 생산 화면 하나로)
 *
 * 매번 거치는 확인 단계(BOM 확인 → 재고 확인 → 생산 시작)를 없애고, 그 결과만 생산 목록의 각 줄에 붙인다.
 *   - setupPending  : 준비 미완 (생성·재계획 뒤 필수 준비가 덜 됨 — 같은 저장을 다시 하면 이어서 준비)
 *   - rows          : 현장 확인 행 (가열 기록지 행 + 이 생산 건의 금속검출 통과 행) 전체·확인
 *   - issueLines    : 원료 출고 확인이 필요한 줄 (lineIssueExceptions 와 같은 판정)
 *   - shortLines    : 아직 출고 안 한 줄 중, 그날 같은 원료를 모두 합친 필요량이 남은 LOT 보다 많은 줄 (출고 기준과 같은 LOT 조건)
 * 읽기만 한다. 부족은 막지 않는다 (회사 음수 정책 그대로) — 보이기만.
 */
import { classifyBatchLines, isRepresented, type LineIssueInfo } from "./issuedBatchLines";

export type LineExceptionKind = "ambiguous" | "unissued" | "pending";

/** 출고 확인이 필요한 줄인가 — 생산 건 화면 카드(lineIssueExceptions)와 같은 판정 */
export function lineExceptionKind(i: Pick<LineIssueInfo, "inventoryDeducted" | "quantity" | "state" | "decision" | "issueHold">, started: boolean): LineExceptionKind | null {
  if (i.inventoryDeducted || !(i.quantity > 0) || isRepresented(i.state)) return null;
  if (i.state === "ambiguous") return "ambiguous";
  if (i.decision === "issue_new") return "pending";
  if (i.issueHold || started) return "unissued";
  return null;
}

/** 원료 출고가 시작된 생산 건인가 (예정 생산 건·수동 모드 진행 중은 정상 대기) */
export function issueStarted(b: { plan_only?: unknown; status?: unknown; mode?: unknown }): boolean {
  return Number(b.plan_only ?? 0) !== 1 && String(b.status) !== "cancelled" && !(b.mode === "manual" && ["planned", "in_progress"].includes(String(b.status)));
}

export interface DayCheck {
  setupPending: boolean;
  rows: { total: number; confirmed: number };
  issueLines: number;
  shortLines: number;
  shortMaterials: string[];
}

const empty = (): DayCheck => ({ setupPending: false, rows: { total: 0, confirmed: 0 }, issueLines: 0, shortLines: 0, shortMaterials: [] });

export async function loadDayChecks(conn: any, tenantId: number, batches: Array<{ id: number; plan_only?: unknown; status?: unknown; mode?: unknown; voided_at?: unknown; setup_pending?: unknown }>): Promise<Map<number, DayCheck>> {
  const out = new Map<number, DayCheck>();
  const live = batches.filter((b) => !b.voided_at && String(b.status) !== "cancelled");
  for (const b of batches) out.set(Number(b.id), { ...empty(), setupPending: Number(b.setup_pending ?? 0) === 1 });
  if (!live.length) return out;
  const ids = live.map((b) => Number(b.id));

  // 현장 확인 행 — 가열 기록지(현장 확인 기록지) 행 + 이 생산 건의 금속검출 통과 행. 확인 = 확인 뒤 바뀌지 않음
  try {
    const [rows]: any = await conn.query(
      `SELECT COALESCE(r.batch_id, f.batch_id) AS bid, COUNT(*) AS n,
              SUM(r.row_confirmed_at IS NOT NULL AND r.row_confirmed_version = r.row_version) AS ok
         FROM h_ccp_form_rows r JOIN h_ccp_form_records f ON f.id = r.form_record_id AND f.tenant_id = r.tenant_id
        WHERE r.tenant_id = ? AND f.field_mode = 1 AND f.voided_at IS NULL
          AND ((f.ccp_type <> 'CCP-4P' AND f.batch_id IN (?)) OR (f.ccp_type = 'CCP-4P' AND r.batch_id IN (?)))
        GROUP BY COALESCE(r.batch_id, f.batch_id)`,
      [tenantId, ids, ids],
    );
    for (const r of rows as any[]) {
      const c = out.get(Number(r.bid));
      if (c) c.rows = { total: Number(r.n ?? 0), confirmed: Number(r.ok ?? 0) };
    }
  } catch (e: any) {
    if (e?.code !== "ER_BAD_FIELD_ERROR") throw e; // 현장 확인 칸 생성 전 DB
  }

  // 원료 — 출고 확인이 필요한 줄 + 그날 부족 원료
  const need = new Map<string, { materialId: number; unit: string; qty: number; lines: Array<{ batchId: number }> }>();
  for (const b of live) {
    const m = await classifyBatchLines(Number(b.id), tenantId, conn);
    const started = issueStarted(b);
    const c = out.get(Number(b.id))!;
    for (const i of Array.from(m.values())) {
      if (lineExceptionKind(i, started)) c.issueLines++;
      if (i.inventoryDeducted || isRepresented(i.state) || !(i.quantity > 0)) continue;
      const k = `${i.materialId}|${i.unit}`;
      const cur = need.get(k) ?? { materialId: Number(i.materialId), unit: String(i.unit), qty: 0, lines: [] };
      cur.qty += Number(i.quantity);
      cur.lines.push({ batchId: Number(b.id) });
      need.set(k, cur);
    }
  }
  if (need.size) {
    const mids = Array.from(new Set(Array.from(need.values()).map((x) => x.materialId)));
    // 남은 양 = 출고가 쓰는 기준과 같게 (fefoLotAllocation: 폐기·보류·만료 상태 제외, 가용량 > 0)
    const [avail]: any = await conn.query(
      `SELECT l.material_id, LOWER(COALESCE(l.unit, 'kg')) AS unit,
              COALESCE(SUM(CASE WHEN (l.status IS NULL OR l.status NOT IN ('expired', 'disposed', 'reserved')) AND l.available_quantity >= 0.001 THEN l.available_quantity ELSE 0 END), 0) AS avail
         FROM h_inventory_lots l WHERE l.tenant_id = ? AND l.material_id IN (?) GROUP BY l.material_id, LOWER(COALESCE(l.unit, 'kg'))`,
      [tenantId, mids],
    );
    const have = new Map((avail as any[]).map((r) => [`${r.material_id}|${r.unit}`, Number(r.avail ?? 0)]));
    const short = Array.from(need.entries()).filter(([k, v]) => v.qty - (have.get(k) ?? 0) > 0.0005);
    if (short.length) {
      const [names]: any = await conn.query(`SELECT id, material_name FROM h_materials WHERE tenant_id = ? AND id IN (?)`, [tenantId, short.map(([, v]) => v.materialId)]);
      const nameOf = new Map((names as any[]).map((r) => [Number(r.id), String(r.material_name ?? "")]));
      for (const [, v] of short) {
        for (const l of v.lines) {
          const c = out.get(l.batchId)!;
          c.shortLines++;
          const nm = nameOf.get(v.materialId) || `원료 #${v.materialId}`;
          if (!c.shortMaterials.includes(nm)) c.shortMaterials.push(nm);
        }
      }
    }
  }
  return out;
}

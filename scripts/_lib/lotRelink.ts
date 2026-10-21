/**
 * LOT ↔ 재고 묶음(h_inventory) 연결 정리 — 공통 (2026-10-21, 단지 재고 정합 1단계: 다른 원료 묶음에 연결된 LOT)
 *
 * 대상: LOT 의 재고 묶음(inventory_id)이 같은 회사의 '다른 원료' 묶음을 가리키는 원료 LOT.
 *   바꾸는 것은 LOT.inventory_id 하나뿐 — 수량·가용·상태·거래(거래의 inventory_id 포함)·재고 집계는 그대로.
 *   (집계 공식 recomputeAggregateFromLots 는 LOT.material_id 로 더하므로 연결을 바꿔도 집계 숫자는 같다.
 *    연결은 출고 LOT 고르기의 첫 조회가 쓰므로, 틀린 연결은 유통기한 순서를 건너뛰게 만든다.)
 *
 * 분류 — READY 만 적용 후보, 나머지는 근거 확인 전 보류 / 보고만:
 *   READY                  목적지 = 같은 회사·같은 원료 묶음 정확히 1개, 단위 같음, 이 LOT 의 거래가 있고 모두 같은 원료·같은 단위
 *   HOLD_DEST_NONE         같은 원료 묶음이 없음
 *   HOLD_DEST_MULTI        같은 원료 묶음이 2개 이상 (어느 쪽인지 정할 근거 없음)
 *   HOLD_UNIT              목적지 묶음 단위 ≠ LOT 단위
 *   HOLD_NO_TX             이 LOT 의 거래가 없음 — 원료번호만 보고 옮기지 않는다 (초기재고·이관 근거 확인)
 *   HOLD_TX_MATERIAL       거래 중 원료번호가 LOT 과 다른 것이 있음 (입고·취소·병합·번호 이력 확인)
 *   HOLD_TX_MATERIAL_NULL  거래 중 원료번호가 비어 있는 것이 있음 (예전 기록 — 같은 원료인지 확인 못 함)
 *   HOLD_TX_UNIT           거래 중 단위가 LOT 과 다른 것이 있음
 *   REPORT_PARENT_MISSING  가리키는 묶음이 없음 — 보고만 (이 도구로 고치지 않음)
 *   REPORT_PARENT_OTHER_TENANT  다른 회사의 묶음을 가리킴 — 보고만
 * 연결이 비어 있는(NULL/0) LOT 은 대상이 아니다 (출고 시 앱이 같은 원료 묶음으로 채운다 — fefoLotAllocation).
 */
import { createHash } from "node:crypto";

export type RelinkCategory =
  | "READY"
  | "HOLD_DEST_NONE" | "HOLD_DEST_MULTI" | "HOLD_UNIT"
  | "HOLD_NO_TX" | "HOLD_TX_MATERIAL" | "HOLD_TX_MATERIAL_NULL" | "HOLD_TX_UNIT"
  | "REPORT_PARENT_MISSING" | "REPORT_PARENT_OTHER_TENANT";

export type RelinkInput = {
  lotId: number; lotNumber: string | null; materialId: number; lotUnit: string; lotStatus: string | null;
  fromInventoryId: number;
  parent: { tenantId: number; materialId: number | null; productId: number | null; unit: string | null } | null;
  /** 같은 회사·LOT 원료와 같은 원료의 묶음들 */
  dests: Array<{ id: number; unit: string | null }>;
  /** 이 LOT 의 거래 — 원료번호·단위별 건수 */
  tx: Array<{ materialId: number | null; unit: string | null; n: number }>;
};

export type RelinkEntry = {
  lotId: number; lotNumber: string | null; materialId: number; lotUnit: string; lotStatus: string | null;
  fromInventoryId: number; fromMaterialId: number | null; fromProductId: number | null;
  toInventoryId: number | null; category: RelinkCategory; reason: string; txCount: number;
};

const normUnit = (u: string | null | undefined) => String(u ?? "").trim().toLowerCase();

/** 연결이 틀린 LOT 인가 — 같은 회사 묶음이면 원료가 다를 때만, 묶음이 없거나 다른 회사면 보고 대상 */
export function isMislinked(i: RelinkInput, tenantId: number): boolean {
  if (!i.parent) return true;
  if (i.parent.tenantId !== tenantId) return true;
  return i.parent.materialId !== i.materialId;
}

/** 순수 분류 — DB 없이 시험한다 */
export function classifyRelink(i: RelinkInput, tenantId: number): RelinkEntry {
  const base = {
    lotId: i.lotId, lotNumber: i.lotNumber, materialId: i.materialId, lotUnit: i.lotUnit, lotStatus: i.lotStatus,
    fromInventoryId: i.fromInventoryId, fromMaterialId: i.parent?.materialId ?? null, fromProductId: i.parent?.productId ?? null,
    txCount: i.tx.reduce((s, t) => s + t.n, 0),
  };
  const out = (category: RelinkCategory, reason: string, toInventoryId: number | null = null): RelinkEntry => ({ ...base, toInventoryId, category, reason });

  if (!i.parent) return out("REPORT_PARENT_MISSING", "가리키는 재고 묶음이 없음");
  if (i.parent.tenantId !== tenantId) return out("REPORT_PARENT_OTHER_TENANT", `다른 회사(${i.parent.tenantId})의 재고 묶음`);
  if (i.dests.length === 0) return out("HOLD_DEST_NONE", "같은 원료 재고 묶음 없음");
  if (i.dests.length > 1) return out("HOLD_DEST_MULTI", `같은 원료 재고 묶음 ${i.dests.length}개 (${i.dests.map((d) => d.id).join(",")})`);
  const dest = i.dests[0];
  if (normUnit(dest.unit) !== normUnit(i.lotUnit)) return out("HOLD_UNIT", `목적지 단위 ${dest.unit ?? "-"} ≠ LOT 단위 ${i.lotUnit}`, dest.id);
  if (base.txCount === 0) return out("HOLD_NO_TX", "이 LOT 의 거래 없음 — 원료번호만으로 옮기지 않음", dest.id);
  if (i.tx.some((t) => t.materialId != null && t.materialId !== i.materialId)) {
    const others = Array.from(new Set(i.tx.filter((t) => t.materialId != null && t.materialId !== i.materialId).map((t) => t.materialId)));
    return out("HOLD_TX_MATERIAL", `거래 원료번호 ${others.join(",")} ≠ LOT 원료 ${i.materialId}`, dest.id);
  }
  if (i.tx.some((t) => t.materialId == null)) return out("HOLD_TX_MATERIAL_NULL", "원료번호가 빈 거래 있음", dest.id);
  if (i.tx.some((t) => normUnit(t.unit) !== normUnit(i.lotUnit))) {
    const units = Array.from(new Set(i.tx.filter((t) => normUnit(t.unit) !== normUnit(i.lotUnit)).map((t) => t.unit)));
    return out("HOLD_TX_UNIT", `거래 단위 ${units.join(",")} ≠ LOT 단위 ${i.lotUnit}`, dest.id);
  }
  return out("READY", "같은 원료·단위 묶음 1개, 거래 원료·단위 일치", dest.id);
}

/** 적용 후보(READY)의 지문 — 미리보기와 적용 사이에 대상이 바뀌지 않았음을 확인한다 */
export function relinkFingerprint(tenantId: number, entries: RelinkEntry[]): string {
  const lines = entries
    .filter((e) => e.category === "READY")
    .map((e) => `${e.lotId}:${e.fromInventoryId}>${e.toInventoryId}`)
    .sort();
  return createHash("sha256").update(`lot-inventory-relink|${tenantId}|${lines.join("|")}`).digest("hex");
}

/** DB 에서 읽어 분류 — 연결이 틀린 원료 LOT 만 (lotIds 가 있으면 그 LOT 만) */
export async function loadRelinkEntries(conn: any, tenantId: number, lotIds: number[] = []): Promise<RelinkEntry[]> {
  const onlyLots = lotIds.length ? `AND l.id IN (${lotIds.map(() => "?").join(",")})` : "";
  const [lots]: any = await conn.query(
    `SELECT l.id, l.lot_number, l.material_id, l.unit, l.status, l.inventory_id,
            p.id AS pid, p.tenant_id AS ptenant, p.material_id AS pmat, p.product_id AS pprod, p.unit AS punit
       FROM h_inventory_lots l
       LEFT JOIN h_inventory p ON p.id = l.inventory_id
      WHERE l.tenant_id = ? AND l.material_id IS NOT NULL AND l.inventory_id IS NOT NULL AND l.inventory_id <> 0 ${onlyLots}
      ORDER BY l.id`,
    [tenantId, ...lotIds],
  );
  const inputs: RelinkInput[] = (lots as any[]).map((r) => ({
    lotId: Number(r.id), lotNumber: r.lot_number ?? null, materialId: Number(r.material_id), lotUnit: String(r.unit ?? ""), lotStatus: r.status ?? null,
    fromInventoryId: Number(r.inventory_id),
    parent: r.pid == null ? null : {
      tenantId: Number(r.ptenant), materialId: r.pmat == null ? null : Number(r.pmat),
      productId: r.pprod == null ? null : Number(r.pprod), unit: r.punit ?? null,
    },
    dests: [], tx: [],
  })).filter((i: RelinkInput) => isMislinked(i, tenantId));
  if (!inputs.length) return [];

  const materialIds = Array.from(new Set(inputs.map((i) => i.materialId)));
  const [dests]: any = await conn.query(
    `SELECT id, material_id, unit FROM h_inventory WHERE tenant_id = ? AND material_id IN (${materialIds.map(() => "?").join(",")}) ORDER BY id`,
    [tenantId, ...materialIds],
  );
  const destsByMaterial = new Map<number, Array<{ id: number; unit: string | null }>>();
  for (const d of dests as any[]) {
    const k = Number(d.material_id);
    if (!destsByMaterial.has(k)) destsByMaterial.set(k, []);
    destsByMaterial.get(k)!.push({ id: Number(d.id), unit: d.unit ?? null });
  }
  const ids = inputs.map((i) => i.lotId);
  const [tx]: any = await conn.query(
    `SELECT lot_id, material_id, unit, COUNT(*) AS n FROM h_inventory_transactions
      WHERE tenant_id = ? AND lot_id IN (${ids.map(() => "?").join(",")})
      GROUP BY lot_id, material_id, unit`,
    [tenantId, ...ids],
  );
  const txByLot = new Map<number, RelinkInput["tx"]>();
  for (const t of tx as any[]) {
    const k = Number(t.lot_id);
    if (!txByLot.has(k)) txByLot.set(k, []);
    txByLot.get(k)!.push({ materialId: t.material_id == null ? null : Number(t.material_id), unit: t.unit ?? null, n: Number(t.n) });
  }
  return inputs.map((i) => classifyRelink({ ...i, dests: destsByMaterial.get(i.materialId) ?? [], tx: txByLot.get(i.lotId) ?? [] }, tenantId));
}

export type RelinkPlanFile = { tool: "lot-inventory-relink"; tenant: number; generatedAt: string; fingerprint: string; lots: RelinkEntry[] };

/**
 * 미리보기 파일 + 승인 목록 → 적용할 항목. 실행 전 검사 (하나라도 틀리면 throw — 아무것도 바꾸지 않음):
 *   이 도구·같은 회사의 파일인지, 파일 내용이 지문과 같은지(손으로 고친 파일 거부), 승인 LOT 이 모두 READY 인지.
 */
export function approvedFromPlan(plan: RelinkPlanFile, tenantId: number, only: number[]): RelinkEntry[] {
  if (plan?.tool !== "lot-inventory-relink" || plan.tenant !== tenantId || !Array.isArray(plan.lots)) throw new Error("이 도구의 같은 회사 미리보기 파일이 아니다");
  if (relinkFingerprint(tenantId, plan.lots) !== plan.fingerprint) throw new Error("미리보기 파일의 지문이 내용과 다르다 — 파일이 바뀌었다");
  if (!only.length) throw new Error("승인 LOT 목록이 비었다");
  const byId = new Map(plan.lots.map((e) => [e.lotId, e]));
  const notReady = only.filter((id) => byId.get(id)?.category !== "READY");
  if (notReady.length) throw new Error(`승인 목록에 미리보기 READY 가 아닌 LOT 이 있다: ${notReady.join(",")} — 실행하지 않음`);
  return only.map((id) => byId.get(id)!);
}

export type ApplyResult = { lotId: number; ok: boolean; reason: string; from: number; to: number | null };

/**
 * 승인된 LOT 만 연결을 바꾼다 — LOT 하나마다 한 트랜잭션.
 *   잠근 뒤 다시 읽어 분류: READY 이고 지금 연결·목적지가 미리보기(plan)와 같을 때만. 아니면 건너뜀(이유 기록).
 *   UPDATE 는 지금 연결이 미리보기 값일 때만 (조건부) — 1행이 아니면 실패.
 */
export async function applyRelink(
  withTx: <T>(fn: (c: any) => Promise<T>, op?: string) => Promise<T>,
  tenantId: number,
  approved: RelinkEntry[],
): Promise<ApplyResult[]> {
  const results: ApplyResult[] = [];
  for (const p of approved) {
    const r = await withTx(async (c) => {
      const [locked]: any = await c.execute(`SELECT id FROM h_inventory_lots WHERE id = ? AND tenant_id = ? FOR UPDATE`, [p.lotId, tenantId]);
      if (!(locked as any[]).length) return { ok: false, reason: "LOT 없음" };
      const [now] = await loadRelinkEntries(c, tenantId, [p.lotId]);
      if (!now) return { ok: false, reason: "더 이상 연결이 틀린 LOT 아님 (이미 바뀜)" };
      if (now.category !== "READY") return { ok: false, reason: `지금 분류 ${now.category}: ${now.reason}` };
      if (now.fromInventoryId !== p.fromInventoryId) return { ok: false, reason: `지금 연결 ${now.fromInventoryId} ≠ 미리보기 ${p.fromInventoryId}` };
      if (now.toInventoryId !== p.toInventoryId) return { ok: false, reason: `지금 목적지 ${now.toInventoryId} ≠ 미리보기 ${p.toInventoryId}` };
      const [res]: any = await c.execute(
        `UPDATE h_inventory_lots SET inventory_id = ? WHERE id = ? AND tenant_id = ? AND inventory_id = ?`,
        [p.toInventoryId, p.lotId, tenantId, p.fromInventoryId],
      );
      if (Number(res?.affectedRows ?? 0) !== 1) throw new Error(`LOT#${p.lotId} 연결 변경 ${res?.affectedRows ?? 0}행 — 되돌림`);
      return { ok: true, reason: "연결 변경" };
    }, `lot-inventory-relink:${p.lotId}`);
    results.push({ lotId: p.lotId, from: p.fromInventoryId, to: p.toInventoryId, ...r });
  }
  return results;
}

/**
 * 되돌리기 — 백업의 LOT 을 원래 연결로. 지금 연결이 이 도구가 바꾼 값(to)일 때만 (그 뒤 앱이 바꿨으면 건너뜀).
 */
export async function restoreRelink(
  withTx: <T>(fn: (c: any) => Promise<T>, op?: string) => Promise<T>,
  tenantId: number,
  items: Array<{ lotId: number; from: number; to: number }>,
): Promise<ApplyResult[]> {
  const results: ApplyResult[] = [];
  for (const it of items) {
    const r = await withTx(async (c) => {
      const [res]: any = await c.execute(
        `UPDATE h_inventory_lots SET inventory_id = ? WHERE id = ? AND tenant_id = ? AND inventory_id = ?`,
        [it.from, it.lotId, tenantId, it.to],
      );
      const n = Number(res?.affectedRows ?? 0);
      return n === 1 ? { ok: true, reason: "원래 연결로" } : { ok: false, reason: "지금 연결이 이 도구가 바꾼 값이 아님 — 건너뜀" };
    }, `lot-inventory-relink-restore:${it.lotId}`);
    results.push({ lotId: it.lotId, from: it.to, to: it.from, ...r });
  }
  return results;
}

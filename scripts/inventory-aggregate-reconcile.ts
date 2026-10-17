/**
 * 원료 재고 집계(h_inventory) ↔ LOT 정본 차이 — 미리보기 / 승인된 원료만 맞춤 (2026-10-17, 단지 재고 복구 1단계)
 *
 * 집계의 정의는 재고 관문(recomputeAggregateFromLots) 하나: 가용 = 'available' 상태 LOT 의 available_quantity 합.
 * 관문을 거치지 않은 예전 쓰기(병합·취소·직접 INSERT 등) 뒤에 집계가 갱신되지 않아 차이가 남았다.
 * 이 도구는 LOT 을 바꾸지 않는다 — LOT 값 자체의 정합(‘used’ 인데 잔량, 음수, 현재수량 불일치)은 2단계에서 따로.
 *
 * 분류:
 *   MERGED   병합된 원료([MERGED→…])의 집계가 남음 (LOT 없음)
 *   NO_ROW   LOT 은 있는데 집계 행 없음
 *   STALE    집계 갱신 뒤에 LOT 이 바뀜 (관문 밖 쓰기) — 관문 공식으로 맞추면 된다
 *   OTHER    집계가 LOT 변경보다 나중인데도 다름 (다른 공식으로 쓴 흔적) — 사람이 확인
 *   ORPHAN   집계 행의 원료가 이 회사에 없음 — 보고만 (적용 대상 아님)
 *   주의 표시: 음수 LOT · 'used' 인데 잔량 · 단위 다름 (맞춘 값의 해석에 영향)
 *
 * 실행 (Codex, 서버):
 *   npx tsx scripts/inventory-aggregate-reconcile.ts --tenant=2                         # 미리보기 (쓰기 없음)
 *   npx tsx scripts/inventory-aggregate-reconcile.ts --tenant=2 --json=preview.json     # 미리보기 저장
 *   npx tsx scripts/inventory-aggregate-reconcile.ts --tenant=2 --only=670,664 --apply --backup=agg-before.json
 *   --apply 는 --only(승인된 원료 id) 와 --backup(적용 전 집계 행 저장 파일) 이 모두 있어야 한다. 전체 일괄 적용 금지.
 */
import { writeFileSync, existsSync } from "node:fs";
import { getRawConnection } from "../server/db/connection";
import { parseOnlyIds } from "./_lib/onlyIds";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? null;
const APPLY = process.argv.includes("--apply");
const TENANT = Number(arg("tenant"));
const JSON_OUT = arg("json");
const BACKUP = arg("backup");
const EPS = 0.0005;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const norm = (u: unknown) => String(u ?? "").trim().toLowerCase();

type Row = {
  materialId: number; name: string | null; unit: string | null; category: string; before: number | null; after: number; diff: number;
  aggregateUpdatedAt: string | null; lastLotChangeAt: string | null; lots: number; warnings: string[];
};

async function preview(conn: any, tenantId: number): Promise<Row[]> {
  const q = async (sql: string, p: any[]) => ((await conn.query(sql, p)) as any)[0] as any[];
  const aggs = await q(
    `SELECT i.material_id, i.available_quantity + 0 AS a, i.unit, DATE_FORMAT(GREATEST(COALESCE(i.last_updated, i.updated_at), i.updated_at), '%Y-%m-%d %H:%i:%s') AS upd
       FROM h_inventory i WHERE i.tenant_id = ? AND i.material_id IS NOT NULL`,
    [tenantId],
  );
  const aggBy = new Map<number, any[]>();
  for (const a of aggs) {
    const k = Number(a.material_id);
    if (!aggBy.has(k)) aggBy.set(k, []);
    aggBy.get(k)!.push(a);
  }
  const lots = await q(
    `SELECT l.material_id,
            COUNT(*) AS n,
            COALESCE(SUM(CASE WHEN l.status = 'available' THEN l.available_quantity ELSE 0 END), 0) + 0 AS gate,
            SUM(l.available_quantity < -?) AS neg,
            SUM(l.status = 'used' AND l.available_quantity > ?) AS used_left,
            GROUP_CONCAT(DISTINCT l.unit) AS units,
            DATE_FORMAT(GREATEST(MAX(l.updated_at), COALESCE(MAX(t.last_tx), '1970-01-01')), '%Y-%m-%d %H:%i:%s') AS last_change
       FROM h_inventory_lots l
       LEFT JOIN (SELECT lot_id, MAX(created_at) AS last_tx FROM h_inventory_transactions WHERE tenant_id = ? GROUP BY lot_id) t ON t.lot_id = l.id
      WHERE l.tenant_id = ? AND l.material_id IS NOT NULL
      GROUP BY l.material_id`,
    [EPS, EPS, tenantId, tenantId],
  );
  const lotBy = new Map<number, any>(lots.map((l) => [Number(l.material_id), l]));
  const mats = await q(`SELECT id, material_name, unit FROM h_materials WHERE tenant_id = ?`, [tenantId]);
  const matBy = new Map<number, any>(mats.map((m) => [Number(m.id), m]));
  const ids = [...new Set([...aggBy.keys(), ...lotBy.keys()])].sort((a, b) => a - b);
  const out: Row[] = [];
  for (const id of ids) {
    const m = matBy.get(id);
    const ag = aggBy.get(id) ?? [];
    const l = lotBy.get(id);
    const after = r3(Number(l?.gate ?? 0));
    const before = ag.length ? r3(ag.reduce((s, a) => s + Number(a.a), 0)) : null;
    if (before != null && Math.abs(before - after) <= EPS && ag.length === 1) continue;
    if (before == null && !(Math.abs(after) > EPS)) continue;
    const warnings: string[] = [];
    if (ag.length > 1) warnings.push(`집계 행 ${ag.length}개`);
    if (Number(l?.neg ?? 0) > 0) warnings.push(`음수 LOT ${l.neg}개`);
    if (Number(l?.used_left ?? 0) > 0) warnings.push(`'used' 인데 잔량 LOT ${l.used_left}개 (맞춘 값에 들어가지 않음)`);
    const units = String(l?.units ?? "").split(",").filter(Boolean);
    if (m && units.some((u) => norm(u) !== norm(m.unit))) warnings.push(`원료 단위(${m.unit ?? "없음"})와 다른 LOT 단위(${units.join(",")})`);
    if (m && ag.some((a) => a.unit && norm(a.unit) !== norm(m.unit))) warnings.push(`집계 단위(${ag.map((a) => a.unit).join(",")}) ≠ 원료 단위(${m.unit ?? "없음"})`);
    const upd = ag.map((a) => a.upd).sort().pop() ?? null;
    const lastChange = l?.last_change ?? null;
    const category = !m ? "ORPHAN"
      : /\[MERGED/.test(String(m.material_name)) && !l ? "MERGED"
      : before == null ? "NO_ROW"
      : upd && lastChange && lastChange > upd ? "STALE"
      : "OTHER";
    out.push({ materialId: id, name: m?.material_name ?? null, unit: m?.unit ?? null, category, before, after, diff: r3(after - (before ?? 0)), aggregateUpdatedAt: upd, lastLotChangeAt: lastChange, lots: Number(l?.n ?? 0), warnings });
  }
  return out;
}

async function main() {
  if (!Number.isSafeInteger(TENANT) || TENANT <= 0) throw new Error("--tenant=<id> 필수");
  let only: number[] | null;
  try {
    only = parseOnlyIds(process.argv);
  } catch (e: any) {
    console.error(`❌ ${e.message}`);
    process.exit(2);
  }
  if (APPLY && (!only || !BACKUP)) throw new Error("--apply 는 --only=<원료 id,…> 와 --backup=<파일> 이 함께 있어야 한다 (전체 일괄 적용 금지)");
  if (APPLY && BACKUP && existsSync(BACKUP)) throw new Error(`백업 파일이 이미 있습니다: ${BACKUP} — 다른 이름을 쓰세요 (덮어쓰지 않음)`);
  const conn = await getRawConnection();
  const rows = await preview(conn, TENANT);
  const target = only ? rows.filter((r) => only!.includes(r.materialId)) : rows;
  const byCat = new Map<string, number>();
  for (const r of rows) byCat.set(r.category, (byCat.get(r.category) ?? 0) + 1);
  console.log(`${APPLY ? "적용" : "미리보기"}: 집계 차이 원료 ${rows.length}개 (tenant ${TENANT}) — ${[...byCat.entries()].map(([k, v]) => `${k} ${v}`).join(", ")}`);
  for (const r of target) {
    console.log(`  #${r.materialId} ${r.name ?? "(원료 없음)"} [${r.category}] 집계 ${r.before ?? "없음"} → ${r.after} (${r.diff >= 0 ? "+" : ""}${r.diff}) · LOT ${r.lots}개 · 집계 갱신 ${r.aggregateUpdatedAt ?? "-"} / 마지막 LOT 변경 ${r.lastLotChangeAt ?? "-"}${r.warnings.length ? ` · ⚠ ${r.warnings.join(" · ")}` : ""}`);
  }
  if (only) {
    const missing = only.filter((id) => !rows.some((r) => r.materialId === id));
    if (missing.length) console.warn(`⚠️ 차이가 없거나 대상이 아닌 원료 id: ${missing.join(",")} — 건너뜀`);
  }
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ tenant: TENANT, generatedAt: new Date().toISOString(), rows }, null, 2));

  if (APPLY) {
    // 원료 없는 집계·집계 행이 여럿인 원료는 적용하지 않는다 (관문은 한 행만 갱신 — 나머지 행이 남는다)
    const skip = (r: Row) => r.category === "ORPHAN" || r.warnings.some((w) => w.startsWith("집계 행"));
    const applicable = target.filter((r) => !skip(r));
    const skipped = target.filter(skip);
    if (skipped.length) console.warn(`⚠️ 적용하지 않음 (원료 없음·집계 행 여러 개 — 따로 확인): ${skipped.map((r) => r.materialId).join(",")}`);
    const [before]: any = await conn.query(
      `SELECT * FROM h_inventory WHERE tenant_id = ? AND material_id IN (?)`, [TENANT, applicable.length ? applicable.map((r) => r.materialId) : [0]],
    );
    writeFileSync(BACKUP!, JSON.stringify({ tenant: TENANT, savedAt: new Date().toISOString(), rows: before }, null, 2));
    console.log(`백업: ${BACKUP} (${(before as any[]).length}행)`);
    const { withInventoryTx, recomputeAggregateFromLots } = await import("../server/lib/inventory/applyInventoryDelta");
    for (const r of applicable) {
      const res = await withInventoryTx(async (c) => {
        // 같은 원료의 LOT 을 잠근 상태에서 관문 공식으로 (동시 입·출고와 겹치지 않게)
        await c.execute(`SELECT id FROM h_inventory_lots WHERE tenant_id = ? AND material_id = ? FOR UPDATE`, [TENANT, r.materialId]);
        return recomputeAggregateFromLots(c, { tenantId: TENANT, subject: { materialId: r.materialId }, unit: r.unit ?? undefined });
      }, `aggregate-reconcile:${r.materialId}`);
      console.log(`  ✓ #${r.materialId} 집계 ${r.before ?? "없음"} → ${res.available}`);
    }
  }
  await (conn as any).end?.();
}

main().catch((e) => {
  console.error("❌", e?.message || e);
  process.exit(1);
});

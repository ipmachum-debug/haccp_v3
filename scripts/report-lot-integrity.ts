/**
 * 원료 LOT 정합 분류 (읽기 전용, 2026-10-17 — 단지 재고 복구 2단계)
 *
 * LOT 마다 장부 값(입고 수량 + 조정 − 사용 거래 합)을 계산해 지금 값과 비교하고 원인별로 나눈다.
 * 고칠 근거가 분명한 것만 '제안' 으로 표시하고, 실물 확인이 필요한 것은 '실사' 로 남긴다. 쓰기 없음.
 *
 *   USED_REMAINING_LEDGER   상태 'used' 인데 가용 잔량 = 장부 잔량 → 장부상 남아 있음. 상태만 'used' (실사로 결정)
 *   USED_REMAINING_OTHER    상태 'used' 인데 잔량, 장부와도 다름 → 실사
 *   AVAILABLE_LEDGER_DIFF   사용 가능 LOT 의 가용 ≠ 장부 → 관문 밖 수량 변경 흔적 (실사 또는 근거 추적)
 *   CURRENT_DIFF            현재수량 ≠ 가용 (예약 없음) — 가용이 장부와 같으면 '현재수량을 가용으로' 제안
 *   NEGATIVE_PLACEHOLDER    NEG- 자리표시 LOT (입고 전 투입 — 음수 정책대로, 입고 때 정산 대상)
 *   NEGATIVE_REAL           일반 LOT 이 음수 → 장부와 비교해 보고
 *   일괄 변경 흔적: 같은 분(minute) 에 상태·수량이 바뀐 LOT 이 많으면 묶어 보여 준다 (원인 추적용)
 *
 * 실행: npx tsx scripts/report-lot-integrity.ts --tenant=2 [--material=645,615] [--json=out.json]
 */
import { writeFileSync } from "node:fs";
import { getRawConnection } from "../server/db/connection";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? null;
const TENANT = Number(arg("tenant"));
const MATERIALS = (arg("material") ?? "").split(",").map((x) => Number(x)).filter((x) => Number.isSafeInteger(x) && x > 0);
const JSON_OUT = arg("json");
const EPS = 0.0005;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;

async function main() {
  if (!Number.isSafeInteger(TENANT) || TENANT <= 0) throw new Error("--tenant=<id> 필수");
  const conn = await getRawConnection();
  const q = async (sql: string, p: any[]) => ((await conn.query(sql, p)) as any)[0] as any[];
  const lots = await q(
    `SELECT l.id, l.material_id, m.material_name, l.lot_number, l.status, l.unit,
            l.quantity + 0 AS q, l.current_quantity + 0 AS c, l.available_quantity + 0 AS a,
            DATE_FORMAT(l.updated_at, '%Y-%m-%d %H:%i') AS upd_min,
            COALESCE(t.used, 0) + 0 AS used, COALESCE(t.adj, 0) + 0 AS adj, COALESCE(t.n, 0) AS ntx
       FROM h_inventory_lots l
       LEFT JOIN h_materials m ON m.id = l.material_id AND m.tenant_id = l.tenant_id
       LEFT JOIN (SELECT lot_id,
                         SUM(CASE WHEN transaction_type IN ('usage', 'outbound', 'disposal', 'transfer') THEN quantity ELSE 0 END) AS used,
                         SUM(CASE WHEN transaction_type IN ('adjustment', 'return') THEN quantity ELSE 0 END) AS adj,
                         COUNT(*) AS n
                    FROM h_inventory_transactions WHERE tenant_id = ? GROUP BY lot_id) t ON t.lot_id = l.id
      WHERE l.tenant_id = ? AND l.material_id IS NOT NULL ${MATERIALS.length ? `AND l.material_id IN (${MATERIALS.map(() => "?").join(",")})` : ""}
      ORDER BY l.material_id, l.id`,
    [TENANT, TENANT, ...MATERIALS],
  );
  const findings: any[] = [];
  for (const l of lots) {
    const q0 = Number(l.q), a = Number(l.a), c = l.c == null ? null : Number(l.c);
    const ledger = r3(q0 + Number(l.adj) - Number(l.used));
    const isNeg = /^NEG-/.test(String(l.lot_number ?? ""));
    const cats: Array<{ cat: string; proposal?: string }> = [];
    if (l.status === "used" && a > EPS) cats.push({ cat: eq(a, ledger) ? "USED_REMAINING_LEDGER" : "USED_REMAINING_OTHER" });
    if (l.status === "available" && !isNeg && !eq(a, ledger)) cats.push({ cat: "AVAILABLE_LEDGER_DIFF" });
    if (c != null && !eq(c, a)) cats.push({ cat: "CURRENT_DIFF", ...(eq(a, ledger) ? { proposal: `현재수량 ${c} → ${a} (가용·장부와 같게)` } : {}) });
    if (a < -EPS) cats.push({ cat: isNeg ? "NEGATIVE_PLACEHOLDER" : "NEGATIVE_REAL" });
    if (!cats.length) continue;
    findings.push({
      lotId: Number(l.id), materialId: Number(l.material_id), material: l.material_name, lot: l.lot_number, status: l.status, unit: l.unit,
      quantity: q0, current: c, available: a, ledger, usedTx: r3(Number(l.used)), adjTx: r3(Number(l.adj)), txCount: Number(l.ntx), updatedMinute: l.upd_min, categories: cats,
    });
  }
  // 원료별 요약
  const byMat = new Map<number, any>();
  for (const f of findings) {
    const s = byMat.get(f.materialId) ?? { materialId: f.materialId, material: f.material, counts: {} as Record<string, number>, usedRemaining: 0, proposals: 0 };
    for (const c of f.categories) {
      s.counts[c.cat] = (s.counts[c.cat] ?? 0) + 1;
      if (c.proposal) s.proposals++;
    }
    if (f.status === "used" && f.available > EPS) s.usedRemaining = r3(s.usedRemaining + f.available);
    byMat.set(f.materialId, s);
  }
  const totals: Record<string, number> = {};
  for (const f of findings) for (const c of f.categories) totals[c.cat] = (totals[c.cat] ?? 0) + 1;
  console.log(`LOT 정합 (tenant ${TENANT}): 확인 LOT ${findings.length}개 / 전체 ${lots.length}개 — ${Object.entries(totals).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  for (const s of byMat.values()) {
    console.log(`#${s.materialId} ${s.material}: ${Object.entries(s.counts).map(([k, v]) => `${k} ${v}`).join(", ")}${s.usedRemaining ? ` · 'used' 잔량 합 ${s.usedRemaining}` : ""}${s.proposals ? ` · 제안 ${s.proposals}` : ""}`);
  }
  // 같은 분에 바뀐 LOT 묶음 (일괄 변경 흔적)
  const clusters = new Map<string, number>();
  for (const f of findings) clusters.set(f.updatedMinute, (clusters.get(f.updatedMinute) ?? 0) + 1);
  const big = [...clusters.entries()].filter(([, n]) => n >= 5).sort((a, b) => b[1] - a[1]);
  if (big.length) console.log(`\n같은 분에 바뀐 확인 LOT 묶음 (5개 이상): ${big.map(([m, n]) => `${m} ${n}개`).join(", ")}`);
  if (MATERIALS.length) {
    console.log("");
    for (const f of findings) {
      console.log(`  LOT#${f.lotId} ${f.lot} [${f.status}] 입고 ${f.quantity} / 현재 ${f.current ?? "-"} / 가용 ${f.available} / 장부 ${f.ledger} (사용 ${f.usedTx}, 조정 ${f.adjTx}, 거래 ${f.txCount}) 변경 ${f.updatedMinute} → ${f.categories.map((c: any) => c.cat + (c.proposal ? `(제안: ${c.proposal})` : "")).join(", ")}`);
    }
  }
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ tenant: TENANT, generatedAt: new Date().toISOString(), totals, materials: [...byMat.values()], lots: findings, clusters: big }, null, 2));
  await (conn as any).end?.();
}

main().catch((e) => {
  console.error("❌", e?.message || e);
  process.exit(1);
});

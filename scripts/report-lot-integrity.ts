/**
 * 원료 LOT 정합 분류 (읽기 전용, 2026-10-17 — 단지 재고 복구 2단계)
 *
 * LOT 마다 거래로 다시 세운 장부(입고 + 반품 + 조정 − 사용·출고·폐기)를 지금 값과 비교하고 원인별로 나눈다 (scripts/_lib/lotLedger).
 * 입고 거래가 없거나 이동 거래가 있는 LOT 은 장부 판단 불가로 따로 (LOT.quantity 는 관문이 바꾸므로 기준으로 쓰지 않는다).
 * 고칠 근거가 분명한 것만 '제안' 으로 표시하고, 실물 확인이 필요한 것은 '실사' 로 남긴다. 쓰기 없음.
 *
 *   USED_REMAINING_LEDGER   상태 'used' 인데 가용 잔량 = 장부 잔량 → 장부상 남아 있음. 상태만 'used' (실사로 결정)
 *   USED_REMAINING_OTHER    상태 'used' 인데 잔량, 장부와도 다름 → 실사
 *   AVAILABLE_LEDGER_DIFF   장부 판단 가능 LOT 의 가용 ≠ 장부 → 관문 밖 수량 변경 후보 (실사 또는 근거 추적)
 *   LEDGER_CLAMP_ZERO       가용 0 · 장부 음수 — 음수 금지 차감이 0 에서 멈춘 것 (오류 아님)
 *   LEDGER_NO_RECEIPT / LEDGER_AMBIGUOUS  입고 거래 없음 / 이동 거래 있음 → 장부 판단 불가 (실사 대상)
 *   CURRENT_DIFF            현재수량 ≠ 가용 (예약 없음) — 가용이 장부와 같으면 '현재수량을 가용으로' 제안
 *   NEGATIVE_PLACEHOLDER    NEG- 자리표시 LOT (입고 전 투입 — 음수 정책대로, 입고 때 정산 대상)
 *   NEGATIVE_REAL           일반 LOT 이 음수 → 장부와 비교해 보고
 *   일괄 변경 흔적: 같은 분(minute) 에 상태·수량이 바뀐 LOT 이 많으면 묶어 보여 준다 (원인 추적용)
 *
 * 실행: npx tsx scripts/report-lot-integrity.ts --tenant=2 [--material=645,615] [--json=out.json]
 */
import { writeFileSync } from "node:fs";
import { getRawConnection } from "../server/db/connection";
import { loadLotLedger, classifyLot, EPS, r3 } from "./_lib/lotLedger";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? null;
const TENANT = Number(arg("tenant"));
const MATERIALS = (arg("material") ?? "").split(",").map((x) => Number(x)).filter((x) => Number.isSafeInteger(x) && x > 0);
const JSON_OUT = arg("json");

async function main() {
  if (!Number.isSafeInteger(TENANT) || TENANT <= 0) throw new Error("--tenant=<id> 필수");
  const conn = await getRawConnection();
  const lots = await loadLotLedger(conn, TENANT, MATERIALS);
  const findings: any[] = [];
  for (const l of lots) {
    const cats = classifyLot(l);
    if (!cats.length) continue;
    findings.push({
      lotId: l.id, materialId: l.materialId, material: l.material, lot: l.lot, status: l.status, unit: l.unit,
      quantity: l.quantity, current: l.current, available: l.available, ledger: l.ledger, ledgerState: l.ledgerState, receiptTx: l.receiptTx, increaseTx: l.increaseTx, decreaseTx: l.decreaseTx, adjTx: l.adjTx, txCount: l.txCount,
      updatedMinute: l.updatedMinute, categories: cats,
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
      console.log(`  LOT#${f.lotId} ${f.lot} [${f.status}] 입고 ${f.quantity} / 현재 ${f.current ?? "-"} / 가용 ${f.available} / 장부 ${f.ledger ?? `판단 불가(${f.ledgerState})`} (입고 ${f.receiptTx}, 반품 ${f.increaseTx}, 조정 ${f.adjTx}, 사용 ${f.decreaseTx}, 거래 ${f.txCount}) 변경 ${f.updatedMinute} → ${f.categories.map((c: any) => c.cat + (c.proposal ? `(제안: ${c.proposal})` : "")).join(", ")}`);
    }
  }
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ tenant: TENANT, generatedAt: new Date().toISOString(), totals, materials: [...byMat.values()], lots: findings, clusters: big }, null, 2));
  await (conn as any).end?.();
}

main().catch((e) => {
  console.error("❌", e?.message || e);
  process.exit(1);
});

/**
 * 실사(재고 실물 확인) 목록 — CSV (읽기 전용, 2026-10-17, 단지 재고 복구 2단계 ③)
 *
 * 장부와 맞지 않는 LOT 이 있는 원료를 차이가 큰 순으로, 그 원료의 확인 대상 LOT 을 모두 한 시트에.
 *   확인 대상 LOT: 사용 가능 상태 LOT 전부 + 'used' 인데 잔량 있는 LOT + 음수 LOT.
 *   열: 순위·원료·LOT·상태·입고일·소비기한·시스템 가용·장부·현재수량·분류·실사 수량(빈칸)·메모(빈칸)
 * 주의: 오래된 LOT 은 예전 기록 방식 때문에 장부 값 자체가 맞지 않을 수 있다 (예: 사용 합이 입고보다 큼) — 실사 수량이 기준.
 * 실사 결과는 이 시트로 받고, 반영은 승인된 원료·LOT 만 별도 조정 절차로 한다 (이 스크립트는 쓰기 없음).
 *
 * 실행: npx tsx scripts/report-stock-count-sheet.ts --tenant=2 --out=count-sheet.csv [--material=645,641] [--top=20]
 */
import { writeFileSync } from "node:fs";
import { getRawConnection } from "../server/db/connection";
import { loadLotLedger, classifyLot, EPS, r3 } from "./_lib/lotLedger";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? null;
const TENANT = Number(arg("tenant"));
const OUT = arg("out");
const TOP = Number(arg("top") ?? 0);
const MATERIALS = (arg("material") ?? "").split(",").map((x) => Number(x)).filter((x) => Number.isSafeInteger(x) && x > 0);
const CAT_LABEL: Record<string, string> = {
  USED_REMAINING_LEDGER: "'다 씀' 표시인데 장부상 잔량",
  USED_REMAINING_OTHER: "'다 씀' 표시인데 잔량(장부와 다름)",
  AVAILABLE_LEDGER_DIFF: "가용 ≠ 장부",
  CURRENT_DIFF: "현재수량 ≠ 가용",
  NEGATIVE_REAL: "음수 LOT",
  NEGATIVE_PLACEHOLDER: "음수 자리표시 LOT",
};
const csv = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

async function main() {
  if (!Number.isSafeInteger(TENANT) || TENANT <= 0) throw new Error("--tenant=<id> 필수");
  if (!OUT) throw new Error("--out=<파일.csv> 필수");
  const conn = await getRawConnection();
  const lots = await loadLotLedger(conn, TENANT, MATERIALS);
  // 재고 차감 제외 원료(정제수 등)는 실사 대상이 아니다
  let exempt = new Set<number>();
  try {
    const [ex]: any = await conn.query(`SELECT id FROM h_materials WHERE tenant_id = ? AND stock_exempt = 1`, [TENANT]);
    exempt = new Set((ex as any[]).map((r) => Number(r.id)));
  } catch { /* 컬럼 이전 DB — 제외 없음 */ }
  // 원료별 차이 크기 = Σ|가용 − 장부| (확인 대상 LOT) + 'used' 잔량
  const byMat = new Map<number, { name: string; unit: string | null; score: number; lots: any[] }>();
  for (const l of lots) {
    const cats = classifyLot(l).filter((c) => c.cat !== "CURRENT_DIFF");
    const inScope = !exempt.has(l.materialId) && (l.status === "available" || (l.status === "used" && l.available > EPS) || l.available < -EPS);
    if (!inScope) continue;
    const m = byMat.get(l.materialId) ?? { name: l.material ?? `원료#${l.materialId}`, unit: l.materialUnit, score: 0, lots: [] };
    m.lots.push({ ...l, cats });
    if (cats.length) m.score += Math.abs(l.available - l.ledger) + (l.status === "used" ? Math.max(l.available, 0) : 0);
    byMat.set(l.materialId, m);
  }
  let ranked = [...byMat.entries()].filter(([, m]) => m.score > EPS).sort((a, b) => b[1].score - a[1].score);
  if (TOP > 0) ranked = ranked.slice(0, TOP);
  const header = ["순위", "원료ID", "원료", "단위", "LOT ID", "LOT 번호", "상태", "입고일", "소비기한", "시스템 가용", "장부(입고+조정-사용)", "현재수량", "분류", "실사 수량", "메모"];
  const lines = [header.join(",")];
  ranked.forEach(([id, m], i) => {
    for (const l of m.lots) {
      lines.push([
        i + 1, id, m.name, m.unit, l.id, l.lot, l.status, l.receiptDate, l.expiryDate, l.available, l.ledger, l.current,
        l.cats.map((c: any) => CAT_LABEL[c.cat] ?? c.cat).join(" / "), "", "",
      ].map(csv).join(","));
    }
  });
  writeFileSync(OUT, "﻿" + lines.join("\n") + "\n"); // 엑셀에서 한글이 깨지지 않게 BOM
  console.log(`실사 목록: 원료 ${ranked.length}개, LOT ${lines.length - 1}줄 → ${OUT}`);
  for (const [id, m] of ranked.slice(0, 15)) console.log(`  #${id} ${m.name}: 차이 크기 ${r3(m.score)}${m.unit ?? ""} · LOT ${m.lots.length}개`);
  await (conn as any).end?.();
}

main().catch((e) => {
  console.error("❌", e?.message || e);
  process.exit(1);
});

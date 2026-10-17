/**
 * 실사(재고 실물 확인) 목록 — CSV (읽기 전용, 2026-10-17, 단지 재고 복구 2단계 ③)
 *
 * 장부와 맞지 않는 LOT 이 있는 원료를 차이가 큰 순으로, 그 원료의 확인 대상 LOT 을 모두 한 시트에.
 *   확인 대상 LOT: 사용 가능 상태 LOT 전부 + 'used' 인데 잔량 있는 LOT + 음수 LOT.
 *   열: 순위·원료·LOT·상태·입고일·소비기한·시스템 가용·장부·현재수량·분류·실사 수량(빈칸)·메모(빈칸)
 * 주의: 오래된 LOT 은 예전 기록 방식 때문에 장부 값 자체가 맞지 않을 수 있다 (예: 사용 합이 입고보다 큼) — 실사 수량이 기준.
 * 원료마다 맨 위에 '원료 합계' 줄 — 현장에서 LOT 을 구분할 수 없으면 실사 수량을 이 줄에만 적는다
 *   (옛 LOT 에 임의로 나누지 않는다, CEO 2026-10-17). LOT 별로 셀 수 있으면 LOT 줄에 적고 합계 줄은 비운다.
 * 실사 결과는 이 시트로 받고, 반영은 승인된 원료·LOT 만 별도 조정 절차로 한다 (이 스크립트는 쓰기 없음).
 *
 * --all     차이 없는 원료도 포함 (LOT 이 있는 원료 전부 — 전체 실사용). 재고 차감 제외 원료·실사 조정(COUNT-) LOT 은 빠진다.
 * --prefill 현장 원리로 초안 (CEO 2026-10-17 확인: 새 LOT 은 앞 LOT 이 거의 다 쓰였을 때 들어온다):
 *             원료마다 가장 최근 입고 LOT·직전 LOT 은 '실사 수량' 빈칸(현장 실측), 그보다 오래된 LOT 은 0, 합계 줄은 비움.
 *             0 은 초안일 뿐 — 현장에 있으면 수량으로 바꿔 적는다. 반영은 미리보기·승인 뒤 (stock-count-apply).
 *
 * 실행: npx tsx scripts/report-stock-count-sheet.ts --tenant=2 --out=count-sheet.csv [--material=645,641] [--top=20] [--all] [--prefill]
 */
import { writeFileSync } from "node:fs";
import { getRawConnection } from "../server/db/connection";
import { loadLotLedger, classifyLot, EPS, r3 } from "./_lib/lotLedger";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? null;
const TENANT = Number(arg("tenant"));
const OUT = arg("out");
const TOP = Number(arg("top") ?? 0);
const ALL = process.argv.includes("--all");
const PREFILL = process.argv.includes("--prefill");
const MATERIALS = (arg("material") ?? "").split(",").map((x) => Number(x)).filter((x) => Number.isSafeInteger(x) && x > 0);
const CAT_LABEL: Record<string, string> = {
  USED_REMAINING_LEDGER: "'다 씀' 표시인데 장부상 잔량",
  USED_REMAINING_OTHER: "'다 씀' 표시인데 잔량(장부와 다름)",
  AVAILABLE_LEDGER_DIFF: "가용 ≠ 거래 장부",
  LEDGER_CLAMP_ZERO: "가용 0 (음수 금지 차감 멈춤)",
  LEDGER_NO_RECEIPT: "입고 기록 없음 — 장부 판단 불가",
  LEDGER_AMBIGUOUS: "이동 거래 — 장부 판단 불가",
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
  // 원료마다 가장 최근·직전 입고 LOT (자리표시 NEG-·실사 조정 COUNT- 제외) — 다 쓴 LOT 이어도 현장 확인 대상
  const recent = new Map<number, number[]>();
  {
    const per = new Map<number, typeof lots>();
    for (const l of lots) {
      if (/^(NEG|COUNT)-/.test(String(l.lot ?? ""))) continue;
      if (!per.has(l.materialId)) per.set(l.materialId, []);
      per.get(l.materialId)!.push(l);
    }
    for (const [mid, ls] of per) {
      const srt = [...ls].sort((a, b) => String(a.receiptDate ?? "").localeCompare(String(b.receiptDate ?? "")) || a.id - b.id);
      recent.set(mid, srt.slice(-2).reverse().map((l) => l.id)); // [가장 최근, 직전]
    }
  }
  const byMat = new Map<number, { name: string; unit: string | null; score: number; lots: any[] }>();
  for (const l of lots) {
    if (exempt.has(l.materialId) || /^COUNT-/.test(String(l.lot ?? ""))) continue;
    const cats = classifyLot(l).filter((c) => c.cat !== "CURRENT_DIFF");
    const isRecent = PREFILL && (recent.get(l.materialId) ?? []).includes(l.id);
    const inScope = isRecent || l.status === "available" || (l.status === "used" && l.available > EPS) || l.available < -EPS;
    if (!inScope) continue;
    const m = byMat.get(l.materialId) ?? { name: l.material ?? `원료#${l.materialId}`, unit: l.materialUnit, score: 0, lots: [] };
    m.lots.push({ ...l, cats });
    // 확인 필요 수량: 장부와 차이 / 장부 판단 불가 LOT 의 가용 / 'used' 잔량
    if (cats.length) m.score += (l.ledger != null ? Math.abs(l.available - l.ledger) : Math.abs(l.available)) + (l.status === "used" ? Math.max(l.available, 0) : 0);
    byMat.set(l.materialId, m);
  }
  let ranked = [...byMat.entries()].filter(([, m]) => ALL || m.score > EPS).sort((a, b) => b[1].score - a[1].score || a[0] - b[0]);
  if (TOP > 0) ranked = ranked.slice(0, TOP);
  const header = ["순위", "원료ID", "원료", "단위", "LOT ID", "LOT 번호", "상태", "입고일", "소비기한", "시스템 가용", "거래 장부(입고+반품+조정-사용)", "현재수량", "분류", "실사 수량", "메모"];
  const lines = [header.join(",")];
  ranked.forEach(([id, m], i) => {
    // 시스템 가용 합계 = 사용 가능 LOT 만 (집계·출고 기준과 같게). 'used' 잔량은 따로 적는다.
    const total = r3(m.lots.filter((l: any) => l.status === "available").reduce((s: number, l: any) => s + Number(l.available), 0));
    const usedLeft = r3(m.lots.filter((l: any) => l.status === "used" && Number(l.available) > EPS).reduce((s: number, l: any) => s + Number(l.available), 0));
    lines.push([
      i + 1, id, m.name, m.unit, "", "원료 합계", "", "", "", total, "", "",
      `LOT 을 구분할 수 없으면 실사 총량을 이 줄에만 (LOT 에 나누지 않음)${usedLeft ? ` · '다 씀' 표시 LOT 잔량 ${usedLeft} 은 합계에 없음` : ""}`, "",
      PREFILL ? "LOT 별로 셉니다 — 이 줄은 비워 둠 (합계와 LOT 중복 반영 금지)" : "",
    ].map(csv).join(","));
    const [latest, prev] = recent.get(id) ?? [];
    for (const l of m.lots) {
      // 초안 값: 가장 최근·직전 → 빈칸(현장 실측), 그 밖 → 0 (현장에 있으면 바꿔 적기)
      const pre = !PREFILL ? ["", ""]
        : l.id === latest ? ["", "현장 실측 — 가장 최근 입고 LOT (라벨 확인 O/X·기한 경과·날짜 모순은 여기에, 날짜는 고치지 않음)"]
        : l.id === prev ? ["", "현장 실측 — 직전 LOT, 조금 남았을 수 있음 (없으면 0)"]
        : ["0", `과거 LOT (${l.receiptDate ?? "입고일 없음"}) — 새 LOT 입고 전에 소모됨 (초안 0 — 현장에 있으면 수량으로 바꿔 적기)`];
      lines.push([
        i + 1, id, m.name, m.unit, l.id, l.lot, l.status, l.receiptDate, l.expiryDate, l.available, l.ledger ?? "판단 불가", l.current,
        l.cats.map((c: any) => CAT_LABEL[c.cat] ?? c.cat).join(" / "), pre[0], pre[1],
      ].map(csv).join(","));
    }
  });
  writeFileSync(OUT, "﻿" + lines.join("\n") + "\n"); // 엑셀에서 한글이 깨지지 않게 BOM
  console.log(`실사 목록: 원료 ${ranked.length}개, ${lines.length - 1}줄 (원료 합계 줄 포함) → ${OUT}`);
  for (const [id, m] of ranked.slice(0, 15)) console.log(`  #${id} ${m.name}: 차이 크기 ${r3(m.score)}${m.unit ?? ""} · LOT ${m.lots.length}개`);
  await (conn as any).end?.();
}

main().catch((e) => {
  console.error("❌", e?.message || e);
  process.exit(1);
});

/**
 * 완제품·재공품 실사 목록 — CSV (읽기 전용, 2026-10-17 — 월요일 작업 전 현재 기준점 확보)
 *
 * CEO 기준: 월요일 작업 전 같은 기준시각으로 원재료·완제품·재공품 실제 수량을 확인한다 (틀어진 DB 숫자를 정답으로 쓰지 않음).
 *
 * [완제품] 제품 + 판매 SKU + 단위 묶음마다 '제품 합계' 줄 + LOT 줄 (제품 LOT 은 SKU 마다 단위가 다르다 — 묶음끼리 더하지 않음).
 *   --prefill: 묶음마다 가장 최근·직전 생산 LOT 은 '실사 수량' 빈칸(현장 실측), 그보다 오래된 LOT 은 0(초안 — 있으면 바꿔 적기),
 *   합계 줄은 비움 (LOT 별 방식). 음수 LOT 은 그대로 표시.
 * [재공품] 실행 시점에 완료·취소되지 않은 배치 — 투입 출고 여부와 함께. 현장 상태(진행 수량·완료·폐기)를 적는다.
 * 쓰기 없음. 반영 절차는 별도 (원료 실사 반영과 같은 원칙으로 승인 뒤).
 *
 * 실행: npx tsx scripts/report-product-count-sheet.ts --tenant=2 --out=product-count.csv [--prefill]
 */
import { writeFileSync } from "node:fs";
import { getRawConnection } from "../server/db/connection";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? null;
const TENANT = Number(arg("tenant"));
const OUT = arg("out");
const PREFILL = process.argv.includes("--prefill");
const EPS = 0.0005;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const csv = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

async function main() {
  if (!Number.isSafeInteger(TENANT) || TENANT <= 0) throw new Error("--tenant=<id> 필수");
  if (!OUT) throw new Error("--out=<파일.csv> 필수");
  const conn = await getRawConnection();
  const q = async (sql: string, p: any[]) => ((await conn.query(sql, p)) as any)[0] as any[];
  const lots = await q(
    `SELECT l.id, l.product_id, p.product_name, l.sku_id, s.sku_name, l.unit, l.lot_number, l.status, l.batch_id,
            DATE_FORMAT(COALESCE(l.production_date, l.receipt_date), '%Y-%m-%d') AS pd, DATE_FORMAT(l.expiry_date, '%Y-%m-%d') AS ed,
            l.available_quantity + 0 AS a
       FROM h_inventory_lots l
       LEFT JOIN h_products_v2 p ON p.id = l.product_id AND p.tenant_id = l.tenant_id
       LEFT JOIN product_skus s ON s.id = l.sku_id AND s.tenant_id = l.tenant_id
      WHERE l.tenant_id = ? AND l.product_id IS NOT NULL
      ORDER BY l.product_id, l.sku_id, l.unit, pd, l.id`,
    [TENANT],
  );
  type G = { productId: number; product: string; skuId: number | null; sku: string | null; unit: string; lots: any[] };
  const groups = new Map<string, G>();
  for (const l of lots) {
    const k = `${l.product_id}|${l.sku_id ?? ""}|${String(l.unit ?? "").trim().toLowerCase()}`;
    if (!groups.has(k)) groups.set(k, { productId: Number(l.product_id), product: l.product_name ?? `제품#${l.product_id}`, skuId: l.sku_id != null ? Number(l.sku_id) : null, sku: l.sku_name, unit: l.unit, lots: [] });
    groups.get(k)!.lots.push(l);
  }
  const header = ["구분", "제품ID", "제품", "SKU ID", "SKU", "단위", "LOT ID", "LOT 번호", "상태", "생산일", "소비기한", "배치", "시스템 가용", "실사 수량", "메모"];
  const lines = [header.join(",")];
  let groupCount = 0, lotRows = 0, blanks = 0;
  for (const g of groups.values()) {
    const real = g.lots.filter((l) => !/^(NEG|COUNT)-/.test(String(l.lot_number ?? "")));
    const recent = real.slice(-2).reverse().map((l) => Number(l.id)); // [가장 최근, 직전]
    const inScope = g.lots.filter((l) => recent.includes(Number(l.id)) || l.status === "available" || Number(l.a) > EPS || Number(l.a) < -EPS);
    if (!inScope.length) continue;
    groupCount++;
    const total = r3(inScope.filter((l) => l.status === "available").reduce((s, l) => s + Number(l.a), 0));
    lines.push(["완제품", g.productId, g.product, g.skuId, g.sku, g.unit, "", "제품 합계", "", "", "", "", total, "",
      PREFILL ? "LOT 별로 셉니다 — 이 줄은 비워 둠 (합계와 LOT 중복 반영 금지)" : "LOT 을 구분할 수 없으면 실사 총량을 이 줄에만 (LOT 에 나누지 않음)"].map(csv).join(","));
    for (const l of inScope) {
      const id = Number(l.id);
      const pre = !PREFILL ? ["", ""]
        : id === recent[0] ? ["", "현장 실측 — 가장 최근 생산 LOT (라벨 확인 O/X·기한 경과는 여기에, 날짜는 고치지 않음)"]
        : id === recent[1] ? ["", "현장 실측 — 직전 LOT, 조금 남았을 수 있음 (없으면 0)"]
        : ["0", `과거 LOT (${l.pd ?? "생산일 없음"}) — 초안 0 (현장에 있으면 수량으로 바꿔 적기)`];
      if (pre[0] === "") blanks++;
      lotRows++;
      lines.push(["완제품", g.productId, g.product, g.skuId, g.sku, g.unit, id, l.lot_number, l.status, l.pd, l.ed, l.batch_id, Number(l.a), pre[0], pre[1]].map(csv).join(","));
    }
  }
  // 재공품 — 완료·취소되지 않은 배치
  const wip = await q(
    `SELECT b.id, b.batch_code, b.product_id, p.product_name, b.status, DATE_FORMAT(b.planned_date, '%Y-%m-%d') AS d, b.planned_quantity + 0 AS pq,
            (SELECT COUNT(*) FROM h_batch_inputs i WHERE i.tenant_id = b.tenant_id AND i.batch_id = b.id) AS n_in,
            (SELECT SUM(i.inventory_deducted = 1) FROM h_batch_inputs i WHERE i.tenant_id = b.tenant_id AND i.batch_id = b.id) AS n_ded
       FROM h_batches b LEFT JOIN h_products_v2 p ON p.id = b.product_id AND p.tenant_id = b.tenant_id
      WHERE b.tenant_id = ? AND b.status IN ('planned', 'in_progress', 'paused', 'under_review')
      ORDER BY b.planned_date, b.id`,
    [TENANT],
  );
  for (const b of wip) {
    lines.push(["재공품", b.product_id, b.product_name, "", "", "", "", `배치 #${b.id} ${b.batch_code}`, b.status, b.d, "", b.id, b.pq, "",
      `현장 상태 기록 (진행 수량·완료·폐기) — 원료 출고 ${Number(b.n_ded ?? 0)}/${Number(b.n_in ?? 0)}줄`].map(csv).join(","));
  }
  writeFileSync(OUT, "﻿" + lines.join("\n") + "\n");
  console.log(`완제품 실사 목록: 제품·SKU·단위 묶음 ${groupCount}개, LOT ${lotRows}줄${PREFILL ? ` (현장 실측 ${blanks}, 초안 0 ${lotRows - blanks})` : ""} · 재공품 배치 ${wip.length}개 → ${OUT}`);
  await (conn as any).end?.();
}

main().catch((e) => {
  console.error("❌", e?.message || e);
  process.exit(1);
});

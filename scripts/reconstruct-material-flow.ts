/**
 * 원재료 흐름 역대조 — 분리 DB 읽기 전용 (2026-10-17, 단지 재고 복구 2·3단계)
 *
 * 검증된 배치(생산일·제품·총생산량 고정) × 배치 날짜의 승인 BOM(또는 바로잡은 BOM) = 원료 소요량.
 * 기간 [--from, --to] 동안 원료마다:
 *   입고 R (LOT 입고 거래 — 실사 조정 제외, 같은 LOT 입고 2건 이상·단위 불일치는 표시)
 *   소요 C (다시 계산) · 기록된 배치 차감 C' · 그 밖의 변동 O (반품·폐기·조정·출고·배치 외 사용, 증가 +)
 *   기말 E = 실사표(--count-csv, 채운 실사 수량 합) 없으면 시스템 가용(실사 전 참고)
 *   역산 기초 = E − R + C − O  (기록 기준이면 C' 로) — 기초가 음수이거나, 날짜를 거슬러 오르다 잔량이 음수가 되면 표시
 *     (그날 이전 입고가 빠졌거나 소요가 과다 — 사람이 확인)
 * 배치 줄 분류: 미차감 / 이중 차감 의심(약 2배) / 과다·과소 차감 / BOM 외 차감 / 원료 바뀜 의심(같은 배치의 BOM 외 차감 ↔ 미차감·과소, 수량 ±10%).
 * 쓰기 없음. 보정안은 이 결과와 실사값을 대조한 뒤 승인 범위만 (별도 도구).
 *
 * 실행: npx tsx scripts/reconstruct-material-flow.ts --tenant=2 --from=2026-01-01 --to=2026-10-19
 *         [--count-csv=채운실사.csv] [--bom-override=bom.csv] [--material=645,615] [--json=out.json] [--batches]
 *   bom.csv 열: 제품ID,시작일,종료일,원료ID,완제품1kg당원료kg  (쌀 등은 건조 원물 기준)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { getRawConnection } from "../server/db/connection";
import { batchNeeds, recordedUsage, classifyNeed, EPS, r3, type BomOverride } from "./_lib/materialFlow";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
const TENANT = Number(arg("tenant"));
const FROM = arg("from");
const TO = arg("to");
const COUNT_CSV = arg("count-csv");
const BOM_CSV = arg("bom-override");
const JSON_OUT = arg("json");
const SHOW_BATCHES = process.argv.includes("--batches");
const MATERIALS = (arg("material") ?? "").split(",").map(Number).filter((x) => Number.isSafeInteger(x) && x > 0);

function csvRows(text: string): string[][] {
  return text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim()).map((l) => {
    const out: string[] = []; let cur = "", q = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (q) { if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true; else if (c === ",") { out.push(cur); cur = ""; } else cur += c;
    }
    out.push(cur);
    return out;
  });
}

async function main() {
  if (!Number.isSafeInteger(TENANT) || TENANT <= 0) throw new Error("--tenant=<id> 필수");
  if (!FROM || !TO || !/^\d{4}-\d{2}-\d{2}$/.test(FROM) || !/^\d{4}-\d{2}-\d{2}$/.test(TO)) throw new Error("--from/--to=YYYY-MM-DD 필수");
  const overrides: BomOverride[] = BOM_CSV
    ? csvRows(readFileSync(BOM_CSV, "utf-8")).slice(1).map((r) => ({ productId: Number(r[0]), from: r[1], to: r[2], materialId: Number(r[3]), kgPerKg: Number(r[4]) }))
        .filter((o) => o.productId > 0 && o.materialId > 0 && Number.isFinite(o.kgPerKg))
    : [];
  const counted = new Map<number, number>();
  if (COUNT_CSV) {
    const rows = csvRows(readFileSync(COUNT_CSV, "utf-8"));
    const h = rows[0];
    const ci = h.indexOf("실사 수량"), mi = h.indexOf("원료ID");
    for (const r of rows.slice(1)) {
      const v = String(r[ci] ?? "").trim().replace(/,/g, "");
      if (v === "") continue;
      const m = Number(r[mi]);
      counted.set(m, r3((counted.get(m) ?? 0) + Number(v)));
    }
  }
  const conn = await getRawConnection();
  const q = async (sql: string, p: any[]) => ((await conn.query(sql, p)) as any)[0] as any[];

  const needs = await batchNeeds(conn, TENANT, FROM, TO, overrides);
  const rec = await recordedUsage(conn, TENANT, needs.map((n) => n.batchId));
  // 원료별·날짜별 소요/기록
  type Day = { R: number; C: number; Crec: number; O: number };
  const mats = new Map<number, { days: Map<string, Day>; batchFlags: any[]; recvFlags: string[] }>();
  const M = (id: number) => {
    if (!mats.has(id)) mats.set(id, { days: new Map(), batchFlags: [], recvFlags: [] });
    return mats.get(id)!;
  };
  const D = (id: number, d: string) => {
    const m = M(id);
    if (!m.days.has(d)) m.days.set(d, { R: 0, C: 0, Crec: 0, O: 0 });
    return m.days.get(d)!;
  };
  for (const n of needs) {
    const matsInBatch = new Set<number>();
    for (const l of n.lines) {
      matsInBatch.add(l.materialId);
      const recQ = rec.get(`${n.batchId}|${l.materialId}`) ?? 0;
      D(l.materialId, n.date).C += l.required;
      D(l.materialId, n.date).Crec += recQ;
      const f = classifyNeed(l.required, recQ);
      if (f) M(l.materialId).batchFlags.push({ batchId: n.batchId, date: n.date, product: n.product, output: n.output, required: l.required, recorded: recQ, flag: f, versionId: n.versionId, versionNote: n.versionNote });
    }
    for (const [k, v] of rec) {
      const [bid, mid] = k.split("|").map(Number);
      if (bid !== n.batchId || matsInBatch.has(mid)) continue;
      D(mid, n.date).Crec += v;
      M(mid).batchFlags.push({ batchId: n.batchId, date: n.date, product: n.product, output: n.output, required: 0, recorded: v, flag: "BOM 외 차감", versionId: n.versionId, versionNote: n.versionNote });
    }
  }
  // 같은 배치 안에서 'BOM 외 차감(X)' 과 '미차감·과소 차감(Y)' 이 비슷한 양이면 원료가 바뀌어 차감된 것으로 표시 (X↔Y).
  //   추정 연결이 아니라 같은 배치·비슷한 수량(±10%) 의 짝만 — 보정안에서 사람이 확인한다.
  {
    const byBatch = new Map<number, Array<{ mid: number; f: any }>>();
    for (const [mid, m] of mats) for (const f of m.batchFlags) {
      if (!byBatch.has(f.batchId)) byBatch.set(f.batchId, []);
      byBatch.get(f.batchId)!.push({ mid, f });
    }
    for (const list of byBatch.values()) {
      const extra = list.filter((x) => x.f.flag === "BOM 외 차감");
      const short = list.filter((x) => x.f.flag === "미차감" || String(x.f.flag).startsWith("과소 차감"));
      for (const e of extra) {
        const gap = (s: any) => s.f.required - s.f.recorded;
        const match = short.find((s) => !s.f.swapWith && Math.abs(gap(s) - e.f.recorded) <= 0.1 * Math.max(gap(s), e.f.recorded));
        if (match) {
          e.f.flag = `원료 바뀜 의심 (BOM 원료 #${match.mid} 대신 차감)`; e.f.swapWith = match.mid;
          match.f.flag = `원료 바뀜 의심 (#${e.mid} 로 차감됨)`; match.f.swapWith = e.mid;
        }
      }
    }
  }
  // 입고·그 밖의 변동 (기간 내, 실사 조정 제외)
  const tx = await q(
    `SELECT t.material_id, DATE_FORMAT(COALESCE(t.transaction_date, t.created_at), '%Y-%m-%d') AS d, t.transaction_type AS ty, t.quantity + 0 AS qty, t.unit,
            t.lot_id, t.reference_type, t.source_type, m.unit AS munit
       FROM h_inventory_transactions t LEFT JOIN h_materials m ON m.id = t.material_id AND m.tenant_id = t.tenant_id
      WHERE t.tenant_id = ? AND t.material_id IS NOT NULL AND COALESCE(t.reference_type, '') <> 'stock_count'
        AND DATE(COALESCE(t.transaction_date, t.created_at)) BETWEEN ? AND ?`,
    [TENANT, FROM, TO],
  );
  const receiptsPerLot = new Map<number, number>();
  for (const t of tx) {
    const isBatchUsage = t.ty === "usage" && (t.reference_type === "batch" || t.reference_type === "batch_input" || ["BATCH", "batch_completion"].includes(t.source_type));
    if (isBatchUsage) continue; // 배치 차감은 위에서 배치별로
    const mid = Number(t.material_id);
    if (t.ty === "receipt" || t.ty === "inbound") {
      D(mid, t.d).R += Number(t.qty);
      if (t.lot_id) receiptsPerLot.set(Number(t.lot_id), (receiptsPerLot.get(Number(t.lot_id)) ?? 0) + 1);
      if (String(t.unit ?? "").trim().toLowerCase() !== String(t.munit ?? "").trim().toLowerCase()) M(mid).recvFlags.push(`${t.d} 입고 단위 ${t.unit} ≠ 원료 ${t.munit}`);
    } else if (t.ty === "return") D(mid, t.d).O += Number(t.qty);
    else if (t.ty === "adjustment") D(mid, t.d).O += Number(t.qty);
    else if (["usage", "outbound", "disposal"].includes(t.ty)) D(mid, t.d).O -= Number(t.qty);
  }
  for (const [lot, n] of receiptsPerLot) {
    if (n > 1) {
      const [r] = await q(`SELECT material_id, lot_number FROM h_inventory_lots WHERE id = ? AND tenant_id = ?`, [lot, TENANT]);
      if (r) M(Number(r.material_id)).recvFlags.push(`LOT#${lot} ${r.lot_number} 입고 거래 ${n}건 (이중 입고 의심)`);
    }
  }
  // 기말: 실사 또는 시스템 가용
  const ids = [...mats.keys()].filter((id) => !MATERIALS.length || MATERIALS.includes(id)).sort((a, b) => a - b);
  const names = new Map<number, any>();
  if (ids.length) for (const r of await q(`SELECT id, material_name, unit, COALESCE(stock_exempt, 0) AS ex FROM h_materials WHERE tenant_id = ? AND id IN (?)`, [TENANT, ids]).catch(async () => q(`SELECT id, material_name, unit, 0 AS ex FROM h_materials WHERE tenant_id = ? AND id IN (?)`, [TENANT, ids]))) names.set(Number(r.id), r);
  const sysAvail = new Map<number, number>();
  if (ids.length) for (const r of await q(`SELECT material_id, COALESCE(SUM(available_quantity), 0) + 0 AS a FROM h_inventory_lots WHERE tenant_id = ? AND status = 'available' AND material_id IN (?) GROUP BY material_id`, [TENANT, ids])) sysAvail.set(Number(r.material_id), Number(r.a));

  const result: any[] = [];
  console.log(`원재료 흐름 역대조 ${FROM} ~ ${TO} (tenant ${TENANT}) — 배치 ${needs.length}개${overrides.length ? `, 바로잡은 BOM ${overrides.length}행` : ""}, 기말 ${COUNT_CSV ? "실사표" : "시스템 가용(실사 전 참고)"}`);
  for (const id of ids) {
    const m = mats.get(id)!;
    const nm = names.get(id);
    const tot = [...m.days.values()].reduce((a, d) => ({ R: a.R + d.R, C: a.C + d.C, Crec: a.Crec + d.Crec, O: a.O + d.O }), { R: 0, C: 0, Crec: 0, O: 0 });
    const E = counted.has(id) ? counted.get(id)! : (sysAvail.get(id) ?? 0);
    const openReq = r3(E - tot.R + tot.C - tot.O);
    const openRec = r3(E - tot.R + tot.Crec - tot.O);
    // 날짜를 거슬러 오르며 잔량 (소요 기준) — 처음 음수가 되는 날
    let bal = E, firstNeg: string | null = null, minBal = E;
    for (const d of [...m.days.keys()].sort().reverse()) {
      const x = m.days.get(d)!;
      bal = bal - x.R + x.C - x.O; // 그날 시작 잔량
      if (bal < minBal) minBal = bal;
      if (bal < -EPS && !firstNeg) firstNeg = d;
    }
    const counts: Record<string, number> = {};
    for (const f of m.batchFlags) { const k = String(f.flag).replace(/\s*\(.*\)/, ""); counts[k] = (counts[k] ?? 0) + 1; }
    const row = {
      materialId: id, material: nm?.material_name ?? null, unit: nm?.unit ?? null, stockExempt: Number(nm?.ex ?? 0) === 1,
      receipts: r3(tot.R), requiredUse: r3(tot.C), recordedUse: r3(tot.Crec), otherNet: r3(tot.O), endStock: r3(E), endSource: counted.has(id) ? "count" : "system",
      impliedOpeningByRequired: openReq, impliedOpeningByRecorded: openRec, useGap: r3(tot.Crec - tot.C),
      firstNegativeDateBackward: firstNeg, minBalanceBackward: r3(minBal), batchFlagCounts: counts, receiptFlags: m.recvFlags, batchFlags: m.batchFlags,
    };
    result.push(row);
    console.log(`#${id} ${row.material ?? "?"}${row.stockExempt ? " [재고 차감 제외]" : ""}: 입고 ${row.receipts} · 소요 ${row.requiredUse} · 기록 차감 ${row.recordedUse} (차 ${row.useGap >= 0 ? "+" : ""}${row.useGap}) · 기타 ${row.otherNet} · 기말 ${row.endStock}(${row.endSource === "count" ? "실사" : "시스템"}) → 역산 기초 ${row.impliedOpeningByRequired}${firstNeg ? ` · ⚠ ${firstNeg} 에 잔량 음수 (최저 ${row.minBalanceBackward})` : ""}${Object.keys(counts).length ? ` · 배치 ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", ")}` : ""}${m.recvFlags.length ? ` · 입고 확인 ${m.recvFlags.length}` : ""}`);
    if (SHOW_BATCHES) for (const f of m.batchFlags) console.log(`    배치#${f.batchId} ${f.date} ${f.product ?? ""} 생산 ${f.output} — 소요 ${f.required} / 기록 ${f.recorded} → ${f.flag}${f.versionNote ? ` (${f.versionNote})` : ""}`);
  }
  // 재고 원료로 이어지지 않는 BOM 행 — 그 소요는 위 원료별 합계에 없다 (추측해 붙이지 않음). 품목 번호별로 따로 보고
  const unlinked = new Map<number, { required: number; batches: number }>();
  for (const n of needs) for (const u of n.unlinked) {
    const x = unlinked.get(u.itemMasterId) ?? { required: 0, batches: 0 };
    unlinked.set(u.itemMasterId, { required: r3(x.required + u.required), batches: x.batches + 1 });
  }
  if (unlinked.size) {
    console.log(`⚠ 재고 원료 연결(legacy_material_id) 없는 BOM 품목 ${unlinked.size}개 — 소요 합계에서 빠짐:`);
    for (const [im, x] of unlinked) console.log(`    품목#${im}: 배치 ${x.batches}개 · 소요 ${x.required}`);
  }
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ tenant: TENANT, from: FROM, to: TO, generatedAt: new Date().toISOString(), overrides: overrides.length, endSource: COUNT_CSV ? "count" : "system", materials: result,
    unlinkedBomItems: [...unlinked].map(([itemMasterId, x]) => ({ itemMasterId, ...x })) }, null, 2));
  await (conn as any).end?.();
}

main().catch((e) => {
  console.error("❌", e?.message || e);
  process.exit(1);
});

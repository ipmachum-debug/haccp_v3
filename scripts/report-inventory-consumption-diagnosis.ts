/**
 * 재고·소모 정합성 진단 (읽기 전용, 2026-10-17 — 단지 재고 복구 우선순위 2·3단계)
 *
 * 왜: 단지 원료 재고가 맞지 않는다(멥쌀 가용 −237kg, 찹쌀 'used' LOT 에 잔량 등). 보정 전에 원인별로 나눠 본다.
 *     과거값 전수 재계산·상태 되살리기·실물 수량 단정은 하지 않는다 — 이 스크립트는 SELECT 만 한다.
 *
 * 1) 배치 소모 대조 (--from/--to 생산일): 투입 줄마다 투입량 vs 실제 차감 거래 합(LOT 나눔 포함)
 *    분류: 정상 / 차감 누락(차감 표시인데 거래 없음) / 이중 차감(거래 합 > 투입) / 부족 차감 / 단위 불일치 /
 *          음수 차감 포함(입고 전 투입) / 투입 줄 없는 차감 거래
 * 2) 원료별 재고 상태 (--material 로 좁힘): 가용 LOT 합 · 집계(h_inventory) 차이 · 'used' 인데 잔량 · 음수 LOT ·
 *    현재수량(current) ≠ 가용(available) LOT · 원료 단위와 다른 LOT
 *
 * 실행: npx tsx scripts/report-inventory-consumption-diagnosis.ts --tenant=2 --from=2026-10-12 --to=2026-10-14 [--material=615,645] [--json=out.json]
 */
import { writeFileSync } from "node:fs";
import { getRawConnection } from "../server/db/connection";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? null;
const TENANT = Number(arg("tenant"));
const FROM = arg("from");
const TO = arg("to");
const MATERIALS = (arg("material") ?? "").split(",").map((x) => Number(x)).filter((x) => Number.isSafeInteger(x) && x > 0);
const JSON_OUT = arg("json");
const EPS = 0.0005;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const norm = (u: unknown) => String(u ?? "").trim().toLowerCase();

async function main() {
  if (!Number.isSafeInteger(TENANT) || TENANT <= 0) throw new Error("--tenant=<id> 필수");
  const ymd = /^\d{4}-\d{2}-\d{2}$/;
  if ((FROM && !ymd.test(FROM)) || (TO && !ymd.test(TO))) throw new Error("--from/--to 는 YYYY-MM-DD");
  const conn = await getRawConnection();
  const q = async (sql: string, p: any[]) => ((await conn.query(sql, p)) as any)[0] as any[];
  const out: any = { tenant: TENANT, from: FROM, to: TO, batches: [], materials: [] };

  // ── 1) 배치 소모 대조 ──
  if (FROM && TO) {
    const batches = await q(
      `SELECT b.id, b.batch_code, b.product_id, p.product_name, b.status, DATE_FORMAT(b.planned_date, '%Y-%m-%d') AS d,
              b.planned_quantity + 0 AS pq, b.actual_quantity + 0 AS aq
         FROM h_batches b LEFT JOIN h_products_v2 p ON p.id = b.product_id AND p.tenant_id = b.tenant_id
        WHERE b.tenant_id = ? AND b.planned_date BETWEEN ? AND ? ORDER BY b.planned_date, b.id`,
      [TENANT, FROM, TO],
    );
    console.log(`\n=== 배치 소모 대조 ${FROM} ~ ${TO} (배치 ${batches.length}개) ===`);
    for (const b of batches) {
      const inputs = await q(
        `SELECT i.id, i.material_id, m.material_name, m.unit AS munit, i.actual_quantity + 0 AS aq, i.unit, i.inventory_deducted AS ded
           FROM h_batch_inputs i LEFT JOIN h_materials m ON m.id = i.material_id AND m.tenant_id = i.tenant_id
          WHERE i.tenant_id = ? AND i.batch_id = ? ORDER BY i.id`,
        [TENANT, b.id],
      );
      const txs = await q(
        `SELECT t.id, t.material_id, t.lot_id, t.quantity + 0 AS qty, t.unit, t.source_line_id, t.notes, l.lot_number
           FROM h_inventory_transactions t LEFT JOIN h_inventory_lots l ON l.id = t.lot_id AND l.tenant_id = t.tenant_id
          WHERE t.tenant_id = ? AND t.reference_type = 'batch' AND t.reference_id = ? AND t.transaction_type = 'usage'`,
        [TENANT, b.id],
      );
      const byLine = new Map<number, any[]>();
      for (const t of txs) {
        const k = Number(t.source_line_id ?? 0);
        if (!byLine.has(k)) byLine.set(k, []);
        byLine.get(k)!.push(t);
      }
      const lines = inputs.map((i) => {
        const ts = byLine.get(Number(i.id)) ?? [];
        const sum = r3(ts.reduce((a, t) => a + Number(t.qty), 0));
        const flags: string[] = [];
        if (Number(i.ded) === 1 && ts.length === 0) flags.push("차감 누락");
        if (ts.length && sum > Number(i.aq) + EPS) flags.push(`이중 차감(+${r3(sum - Number(i.aq))})`);
        if (ts.length && sum + EPS < Number(i.aq)) flags.push(`부족 차감(−${r3(Number(i.aq) - sum)})`);
        if (norm(i.unit) !== norm(i.munit)) flags.push(`단위 불일치(투입 ${i.unit} / 원료 ${i.munit ?? "없음"})`);
        if (ts.some((t) => norm(t.unit) !== norm(i.unit))) flags.push("거래 단위 ≠ 투입 단위");
        if (ts.some((t) => /음수 차감/.test(String(t.notes ?? "")) || /^NEG-/.test(String(t.lot_number ?? "")))) flags.push("음수 차감 포함");
        if (Number(i.ded) !== 1 && ts.length === 0) flags.push("미차감(차감 표시 없음)");
        return { inputId: Number(i.id), materialId: Number(i.material_id), material: i.material_name, qty: Number(i.aq), unit: i.unit, deducted: sum, txCount: ts.length, flags };
      });
      const orphan = [...byLine.entries()].filter(([k]) => !inputs.some((i) => Number(i.id) === k)).flatMap(([, v]) => v);
      const bad = lines.filter((l) => l.flags.length);
      console.log(`\n#${b.id} ${b.d} ${b.batch_code} ${b.product_name ?? ""} [${b.status}] 계획 ${b.pq} / 실적 ${b.aq} — 투입 ${inputs.length}줄, 차감 거래 ${txs.length}건${bad.length ? `, 확인 ${bad.length}줄` : ", 이상 없음"}`);
      for (const l of bad) console.log(`   · ${l.material}(#${l.materialId}) 투입 ${l.qty}${l.unit} / 차감 ${l.deducted} (${l.txCount}건) → ${l.flags.join(", ")}`);
      if (orphan.length) console.log(`   · 투입 줄 없는 차감 거래 ${orphan.length}건: ${orphan.map((t) => `#${t.id} 원료${t.material_id} ${t.qty}${t.unit}`).join(", ")}`);
      out.batches.push({ ...b, lines, orphanTx: orphan.map((t) => ({ id: Number(t.id), materialId: Number(t.material_id), qty: Number(t.qty), unit: t.unit })) });
    }
  }

  // ── 2) 원료별 재고 상태 ──
  const mats = await q(
    `SELECT m.id, m.material_name, m.unit FROM h_materials m WHERE m.tenant_id = ? ${MATERIALS.length ? `AND m.id IN (${MATERIALS.map(() => "?").join(",")})` : ""} ORDER BY m.id`,
    [TENANT, ...MATERIALS],
  );
  console.log(`\n=== 원료별 재고 상태 (원료 ${mats.length}개${MATERIALS.length ? "" : " — 문제 있는 원료만 출력"}) ===`);
  for (const m of mats) {
    const lots = await q(
      `SELECT id, lot_number, status, unit, quantity + 0 AS q, current_quantity + 0 AS c, available_quantity + 0 AS a FROM h_inventory_lots WHERE tenant_id = ? AND material_id = ?`,
      [TENANT, m.id],
    );
    const agg = await q(`SELECT COALESCE(SUM(available_quantity), 0) + 0 AS a, COUNT(*) AS n FROM h_inventory WHERE tenant_id = ? AND material_id = ?`, [TENANT, m.id]);
    const avail = r3(lots.filter((l) => l.status === "available").reduce((s, l) => s + Number(l.a), 0));
    const usedLeft = lots.filter((l) => l.status === "used" && Number(l.a) > EPS);
    const negative = lots.filter((l) => Number(l.a) < -EPS);
    const curDiff = lots.filter((l) => l.c != null && Math.abs(Number(l.c) - Number(l.a)) > EPS);
    const unitDiff = lots.filter((l) => norm(l.unit) !== norm(m.unit));
    const aggA = r3(Number(agg[0]?.a ?? 0));
    const flags: string[] = [];
    if (Math.abs(aggA - avail) > EPS) flags.push(`집계 ${aggA} ≠ 가용 LOT 합 ${avail} (차 ${r3(aggA - avail)})${Number(agg[0]?.n) > 1 ? ` — 집계 행 ${agg[0].n}개` : ""}`);
    if (usedLeft.length) flags.push(`'used' 인데 잔량 ${usedLeft.length}개 (합 ${r3(usedLeft.reduce((s, l) => s + Number(l.a), 0))})`);
    if (negative.length) flags.push(`음수 LOT ${negative.length}개 (합 ${r3(negative.reduce((s, l) => s + Number(l.a), 0))})`);
    if (curDiff.length) flags.push(`현재수량≠가용 LOT ${curDiff.length}개`);
    if (unitDiff.length) flags.push(`원료 단위(${m.unit ?? "없음"})와 다른 LOT ${unitDiff.length}개 (${[...new Set(unitDiff.map((l) => l.unit))].join(",")})`);
    if (!flags.length && !MATERIALS.length) continue;
    console.log(`#${m.id} ${m.material_name} [${m.unit ?? "단위 없음"}] 가용 LOT 합 ${avail} / LOT ${lots.length}개${flags.length ? ` → ${flags.join(" · ")}` : " — 이상 없음"}`);
    out.materials.push({
      id: Number(m.id), name: m.material_name, unit: m.unit, availableLotSum: avail, aggregate: aggA, lots: lots.length, flags,
      usedWithRemaining: usedLeft.map((l) => ({ id: Number(l.id), lot: l.lot_number, available: Number(l.a) })),
      negativeLots: negative.map((l) => ({ id: Number(l.id), lot: l.lot_number, available: Number(l.a), status: l.status })),
      currentMismatch: curDiff.map((l) => ({ id: Number(l.id), lot: l.lot_number, current: Number(l.c), available: Number(l.a) })),
    });
  }
  if (JSON_OUT) {
    writeFileSync(JSON_OUT, JSON.stringify(out, null, 2));
    console.log(`\nJSON: ${JSON_OUT}`);
  }
  await (conn as any).end?.();
}

main().catch((e) => {
  console.error("❌", e?.message || e);
  process.exit(1);
});

/**
 * 재고·소모 정합성 진단 (읽기 전용, 2026-10-17 — 단지 재고 복구 우선순위 2·3단계)
 *
 * 왜: 단지 원료 재고가 맞지 않는다(멥쌀 가용 −237kg, 찹쌀 'used' LOT 에 잔량 등). 보정 전에 원인별로 나눠 본다.
 *     과거값 전수 재계산·상태 되살리기·실물 수량 단정은 하지 않는다 — 이 스크립트는 SELECT 만 한다.
 *
 * 1) 배치 소모 대조 (--from/--to 생산일): 투입 줄마다 투입량 vs 실제 차감 거래 합(LOT 나눔 포함)
 *    (scripts/_lib/consumptionDiag — 거래 세 형식 조회, 투입량 = 실적 없으면 계획, 초과는 '후보', 투입 줄 미확인 거래 분리)
 * 2) 원료별 재고 상태 (--material 로 좁힘): 가용 LOT 합 · 집계(h_inventory) 차이 · 'used' 인데 잔량 · 음수 LOT ·
 *    현재수량(current) ≠ 가용(available) LOT · 원료 단위와 다른 LOT
 *
 * 실행: npx tsx scripts/report-inventory-consumption-diagnosis.ts --tenant=2 --from=2026-10-12 --to=2026-10-14 [--material=615,645] [--json=out.json]
 */
import { writeFileSync } from "node:fs";
import { getRawConnection } from "../server/db/connection";
import { diagnoseBatch } from "./_lib/consumptionDiag";

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
      const d = await diagnoseBatch(conn, TENANT, Number(b.id));
      const bad = d.lines.filter((l) => l.flags.length);
      console.log(`\n#${b.id} ${b.d} ${b.batch_code} ${b.product_name ?? ""} [${b.status}] 계획 ${b.pq} / 실적 ${b.aq} — 투입 ${d.inputs}줄, 차감 거래 ${d.txCount}건${bad.length ? `, 확인 ${bad.length}줄` : ", 이상 없음"}`);
      for (const l of bad) console.log(`   · ${l.material}(#${l.materialId}) 투입 ${l.qty}${l.unit}${l.qtySource === "planned" ? "(계획)" : ""} / 차감 ${l.deducted} (${l.txCount}건) → ${l.flags.join(", ")}`);
      if (d.unlinkedTx.length) console.log(`   · 투입 줄 미확인 거래 ${d.unlinkedTx.length}건: ${d.unlinkedTx.map((t) => `#${t.id} 원료${t.materialId} ${t.qty}${t.unit}`).join(", ")}`);
      out.batches.push({ ...b, ...d });
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

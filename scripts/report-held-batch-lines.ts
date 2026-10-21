/**
 * 출고 보류 투입 줄 설명 — 읽기 전용 (2026-10-21, 단지 10/15 마감 검증: 보류 6줄)
 *
 * 보류 줄(issue_hold = 1, 미차감)마다 같은 생산 건·같은 원료(정본 FK 매핑)의 다른 줄과 실제 출고 거래를 나란히 보여 준다 —
 * '계산 오차' 인지(같은 원료가 이미 다른 줄·거래로 충분히 출고됨), 실제로 덜 출고된 것인지 사람이 판단할 근거.
 *   판단·처리는 하지 않는다. 출고·제외·보류 해제 없음 (쓰기 없음).
 *
 * 실행 (Codex, 서버): npx tsx scripts/report-held-batch-lines.ts --tenant=2 [--batch=1136,1137,1138] [--json=held.json]
 *   결과에는 생산 건·원료·수량이 들어 있다 — 비공개 폴더에만 둔다.
 */
import { writeFileSync } from "node:fs";
import { getRawConnection } from "../server/db/connection";
import { classifyBatchLines } from "../server/lib/production/issuedBatchLines";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? null;
const TENANT = Number(arg("tenant"));
const BATCHES = (arg("batch") ?? "").split(",").map(Number).filter((x) => Number.isSafeInteger(x) && x > 0);
const JSON_OUT = arg("json");
const r3 = (n: number) => Math.round(n * 1000) / 1000;

async function main() {
  if (!Number.isSafeInteger(TENANT) || TENANT <= 0) throw new Error("--tenant=<id> 필수");
  const conn: any = await getRawConnection();
  const onlyBatch = BATCHES.length ? `AND bi.batch_id IN (${BATCHES.map(() => "?").join(",")})` : "";
  const [held]: any = await conn.execute(
    `SELECT bi.id, bi.batch_id, bi.material_id, bi.unit, bi.planned_quantity + 0 AS pq, bi.actual_quantity + 0 AS aq, bi.issue_hold_reason,
            b.batch_code, b.status, DATE_FORMAT(b.planned_date, '%Y-%m-%d') AS d, b.planned_quantity + 0 AS bpq, b.actual_quantity + 0 AS baq,
            p.product_name
       FROM h_batch_inputs bi
       JOIN h_batches b ON b.id = bi.batch_id AND b.tenant_id = bi.tenant_id
       LEFT JOIN h_products_v2 p ON p.id = b.product_id AND p.tenant_id = b.tenant_id
      WHERE bi.tenant_id = ? AND bi.issue_hold = 1 AND bi.inventory_deducted = 0 ${onlyBatch}
      ORDER BY bi.batch_id, bi.id`,
    [TENANT, ...BATCHES],
  );
  const out: any[] = [];
  const byBatch = new Map<number, any[]>();
  for (const h of held as any[]) {
    if (!byBatch.has(Number(h.batch_id))) byBatch.set(Number(h.batch_id), []);
    byBatch.get(Number(h.batch_id))!.push(h);
  }
  console.log(`출고 보류 투입 줄 ${(held as any[]).length}개 (tenant ${TENANT}${BATCHES.length ? `, 생산 건 ${BATCHES.join(",")}` : ""}) — 읽기 전용`);
  for (const [batchId, lines] of byBatch) {
    const states = await classifyBatchLines(batchId, TENANT, conn);
    // 같은 원료 판정은 정본 FK 매핑으로 (item_master.legacy_material_id) — 숫자·이름으로 맞추지 않음
    const mats = Array.from(new Set([...states.values()].map((s) => s.materialId).filter((x) => x > 0)));
    const legacy = new Map<number, number>();
    if (mats.length) {
      const [im]: any = await conn.query(
        `SELECT id, legacy_material_id FROM item_master WHERE tenant_id = ? AND legacy_material_id IS NOT NULL AND (id IN (?) OR legacy_material_id IN (?))`,
        [TENANT, mats, mats],
      );
      for (const r of im as any[]) legacy.set(Number(r.id), Number(r.legacy_material_id));
    }
    const canon = (m: number) => legacy.get(m) ?? m;
    const [txs]: any = await conn.execute(
      `SELECT id, material_id, unit, quantity + 0 AS q, lot_id, source_line_id, reference_type, reference_id, DATE_FORMAT(transaction_date, '%Y-%m-%d') AS td
         FROM h_inventory_transactions
        WHERE tenant_id = ? AND transaction_type = 'usage'
          AND ((source_type IN ('BATCH', 'batch_completion') AND source_id = ?) OR (reference_type = 'batch' AND reference_id = ?))`,
      [TENANT, batchId, batchId],
    );
    const [rev]: any = await conn.execute(
      `SELECT material_id, unit, SUM(quantity) + 0 AS q FROM h_inventory_transactions
        WHERE tenant_id = ? AND transaction_type = 'return' AND reference_type = 'batch' AND reference_id = ? GROUP BY material_id, unit`,
      [TENANT, batchId],
    );
    const h0 = lines[0];
    console.log(`\n생산 건 #${batchId} ${h0.batch_code} ${h0.product_name ?? ""} (${h0.d}, ${h0.status}) 계획 ${h0.bpq} / 실적 ${h0.baq ?? "-"} kg`);
    for (const h of lines) {
      const m = canon(Number(h.material_id));
      const sameLines = [...states.values()].filter((s) => canon(s.materialId) === m);
      const sameTx = (txs as any[]).filter((t) => canon(Number(t.material_id)) === m);
      const issued = r3(sameTx.reduce((s, t) => s + Number(t.q), 0));
      const returned = r3((rev as any[]).filter((t) => canon(Number(t.material_id)) === m).reduce((s, t) => s + Number(t.q), 0));
      const linesTotal = r3(sameLines.reduce((s, l) => s + l.quantity, 0));
      const otherLines = sameLines.filter((l) => l.lineId !== Number(h.id));
      const otherTotal = r3(otherLines.reduce((s, l) => s + l.quantity, 0));
      const lineQty = Number(h.aq ?? h.pq ?? 0);
      // 읽는 법 (판정 아님): 이미 출고(사용 − 되돌림) ≥ 같은 원료 줄 합계 → 이 줄 몫까지 이미 나감 / = 다른 줄 합계 → 이 줄 몫은 출고 기록 없음
      const net = r3(issued - returned);
      const reading = net + 0.0005 >= linesTotal ? "같은 원료 줄 합계만큼 이미 출고됨 (이 줄 몫 포함)"
        : Math.abs(net - otherTotal) <= 0.0005 ? "다른 줄 몫만 출고됨 — 이 줄 몫의 출고 기록 없음"
        : `출고 ${net} — 줄 합계 ${linesTotal} 와 다른 줄 합계 ${otherTotal} 사이 (부분)`;
      const row = {
        batchId, batchCode: h0.batch_code, product: h0.product_name, date: h0.d, lineId: Number(h.id), materialId: Number(h.material_id), canonicalMaterialId: m,
        unit: h.unit, lineQty, holdReason: h.issue_hold_reason, lineState: states.get(Number(h.id))?.state ?? null,
        sameMaterialLines: sameLines.map((l) => ({ lineId: l.lineId, quantity: l.quantity, unit: l.unit, state: l.state, held: l.issueHold })),
        issuedUsage: issued, returned, netIssued: net, sameMaterialLinesTotal: linesTotal, otherLinesTotal: otherTotal,
        usageTx: sameTx.map((t) => ({ id: Number(t.id), q: Number(t.q), unit: t.unit, lotId: t.lot_id, lineId: t.source_line_id, date: t.td })),
        reading,
      };
      out.push(row);
      console.log(`  줄 #${row.lineId} 원료#${row.materialId}${m !== row.materialId ? `(→#${m})` : ""} ${lineQty}${h.unit} [${row.lineState}] — 같은 원료 줄 ${sameLines.length}개 합 ${linesTotal} · 출고 ${issued} − 되돌림 ${returned} = ${net} → ${reading}`);
    }
  }
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ tenant: TENANT, generatedAt: new Date().toISOString(), lines: out }, null, 2));
  await conn.end?.();
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("❌", e?.message || e);
  process.exit(1);
});

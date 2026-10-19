/**
 * 원장 중복 정리 — 명령줄 (2026-10-19, 생산 건 복구와 별도 작업)
 *
 * 기본은 dry-run (읽기 전용 트랜잭션). 대상은 입력 JSON 으로만 받는다 — 회사·원료·배치 번호를 코드에 넣지 않는다.
 *
 *   dry-run:
 *     DATABASE_URL=... npx tsx scripts/ledger-dedup.ts --input=dedup.json [--out=plan.json]
 *   실행 (대표 승인 + 백업·복원 확인 뒤에만):
 *     LEDGER_DEDUP_EXECUTE_APPROVED=yes DATABASE_URL=... npx tsx scripts/ledger-dedup.ts --input=dedup.json \
 *       --execute --key=<정리 키> --fingerprint=<dry-run 지문> --actor=<실행자 users.id>
 *
 * 입력 JSON: { tenantId, materialId(정본 h_materials.id), batchIds: [...], reason }
 * B(원 거래 LOT 없음 + 보충만 LOT) = 원장 전용 상계, A(둘 다 LOT) = 연결만. LOT·집계·수불부·원본 거래는 바꾸지 않는다.
 * 절차: docs/operations/ledger-dedup.md
 */
import { readFileSync, writeFileSync } from "node:fs";

function arg(name: string): string | undefined {
  const a = process.argv.find((x) => x === `--${name}` || x.startsWith(`--${name}=`));
  if (!a) return undefined;
  return a.includes("=") ? a.slice(a.indexOf("=") + 1) : "true";
}

async function main() {
  const inputPath = arg("input");
  if (!inputPath) throw new Error("--input=<JSON 경로> 가 필요합니다.");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL 이 필요합니다.");
  const input = JSON.parse(readFileSync(inputPath, "utf-8"));
  const { planLedgerDedup, executeLedgerDedup } = await import("../server/services/ledgerDedup");
  const { getRawConnection } = await import("../server/db");
  const pool = await getRawConnection();

  if (arg("execute") !== "true") {
    const conn = await pool.getConnection();
    let plan;
    try {
      await conn.query("SET TRANSACTION READ ONLY");
      await conn.beginTransaction();
      plan = await planLedgerDedup(conn, input);
    } finally {
      try { await conn.rollback(); } catch { /* 읽기만 */ }
      conn.release();
    }
    const out = arg("out");
    if (out) writeFileSync(out, JSON.stringify(plan, null, 2));
    const t = plan.totals;
    console.log(`\n== 원장 중복 정리 dry-run (회사 ${input.tenantId}, 원료 #${input.materialId}) — 아무것도 바꾸지 않음 ==`);
    console.log(`실행 가능: ${plan.ok ? "예" : "아니오"}`);
    for (const e of plan.errors) console.log(`  ✗ ${e}`);
    for (const w of plan.warnings) console.log(`  ! ${w}`);
    console.log(`사건: ${t.events}건 ${t.kg}kg — A(실LOT 재차감 근거) ${t.a.count}건 ${t.a.kg}kg / B(원장만 중복) ${t.b.count}건 ${t.b.kg}kg`);
    console.log(`원장 사용(범위): ${t.ledgerUsageBefore} → ${t.ledgerUsageAfter}kg (B 상계만, A 는 재고 검증 대기)`);
    console.log(`A LOT 영향: ${plan.aLotImpact.map((x) => `LOT #${x.lotId} ${x.kg}kg`).join(", ") || "없음"}`);
    console.log(`금액 후보 (자동 선택 안 함): B 원 거래 ₩${plan.cost.bOriginalAmount.toLocaleString("ko-KR")} / B 보충 ₩${plan.cost.bBackfillAmount.toLocaleString("ko-KR")} · A 원 거래 ₩${plan.cost.aOriginalAmount.toLocaleString("ko-KR")} / A 보충 ₩${plan.cost.aBackfillAmount.toLocaleString("ko-KR")}`);
    console.log(`LOT ${plan.stock.lots.length}개·집계 ${plan.stock.aggregate} — 정리 뒤에도 그대로`);
    console.log(`지문: ${plan.fingerprint}`);
    process.exit(plan.ok ? 0 : 2);
  }

  if (process.env.LEDGER_DEDUP_EXECUTE_APPROVED !== "yes") throw new Error("실행은 LEDGER_DEDUP_EXECUTE_APPROVED=yes (대표 승인·백업 확인 뒤) 가 있어야 합니다.");
  const key = arg("key");
  const fingerprint = arg("fingerprint");
  const actor = Number(arg("actor"));
  if (!key || !fingerprint || !(actor > 0)) throw new Error("--key, --fingerprint, --actor 가 모두 필요합니다.");
  const r = await executeLedgerDedup({ ...input, caseKey: key, expectedFingerprint: fingerprint, actorUserId: actor }, { pool });
  console.log(JSON.stringify({ status: r.status, caseId: r.caseId, totals: r.summary?.totals }, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error(`✗ ${e?.message ?? e}`);
  if (e?.errors) for (const x of e.errors) console.error(`  - ${x}`);
  process.exit(1);
});

/**
 * 이력 보존형 생산 건 복구 — 명령줄 (2026-10-19)
 *
 * 기본은 dry-run (읽기만). 대상은 입력 JSON 으로만 받는다 — 회사·날짜·번호를 코드에 넣지 않는다.
 *
 *   dry-run:
 *     DATABASE_URL=... npx tsx scripts/recover-batches.ts --input=recovery.json [--out=plan.json]
 *   실행 (대표 승인 + 백업·복원 확인 뒤에만):
 *     RECOVERY_EXECUTE_APPROVED=yes DATABASE_URL=... npx tsx scripts/recover-batches.ts --input=recovery.json \
 *       --execute --key=<복구 키> --fingerprint=<dry-run 지문> --actor=<실행자 users.id>
 *
 * 입력 JSON: { tenantId, businessDate, keepBatchIds: [...], voids: [{ batchId, supersededBy }], holdInputIds: [...], reason }
 * 절차·되돌리기: docs/operations/batch-recovery.md
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
  const { planRecovery, executeRecovery } = await import("../server/services/batchRecovery");
  const { getRawConnection } = await import("../server/db");
  const pool = await getRawConnection();

  if (arg("execute") !== "true") {
    // 읽기 전용 트랜잭션 — 무엇도 쓰지 않는다
    const conn = await pool.getConnection();
    let plan;
    try {
      await conn.query("SET TRANSACTION READ ONLY");
      await conn.beginTransaction();
      plan = await planRecovery(conn, input);
    } finally {
      try { await conn.rollback(); } catch { /* 읽기만 */ }
      conn.release();
    }
    const out = arg("out");
    if (out) writeFileSync(out, JSON.stringify(plan, null, 2));
    const t = plan.totals;
    console.log(`\n== dry-run ${input.businessDate} (회사 ${input.tenantId}) — 아무것도 바꾸지 않음 ==`);
    console.log(`실행 가능: ${plan.ok ? "예" : "아니오"}`);
    for (const e of plan.errors) console.log(`  ✗ ${e}`);
    for (const w of plan.warnings) console.log(`  ! ${w}`);
    console.log(`생산 건: ${plan.batches.before.count}건 ${plan.batches.before.kg}kg → ${plan.batches.after.count}건 ${plan.batches.after.kg}kg`);
    console.log(`역거래: ${t.reversalCount}건 ${t.reversalQty}kg ₩${t.reversalAmount.toLocaleString("ko-KR")} (원료 ${t.materials}종 · LOT ${t.lots}개) — 사용량 ${t.usageBefore} → ${t.usageAfter}kg`);
    console.log(`가열 공정 행: ${plan.ccp.heatingRowsBefore} → ${plan.ccp.heatingRowsAfter} · 무효 인스턴스 ${plan.ccp.voidInstanceIds.length} · 무효 기록지 ${plan.ccp.voidFormIds.length}`);
    if (plan.ccp.metal) console.log(`금속검출 #${plan.ccp.metal.formRecordId}: 통과 행 ${plan.ccp.metal.passRowsBefore}개 ${plan.ccp.metal.passKgBefore}kg → ${plan.ccp.metal.passRowsAfter}개 ${plan.ccp.metal.passKgAfter}kg (감도점검 ${plan.ccp.metal.sensitivityRows}행 그대로)`);
    console.log(`결재 취소: ${plan.approvals.cancel.map((a) => `#${a.id}`).join(", ") || "없음"} · 보류 줄: ${plan.holds.map((h) => `#${h.inputId}`).join(", ") || "없음"}`);
    console.log(`지문: ${plan.fingerprint}`);
    process.exit(plan.ok ? 0 : 2);
  }

  if (process.env.RECOVERY_EXECUTE_APPROVED !== "yes") throw new Error("실행은 RECOVERY_EXECUTE_APPROVED=yes (대표 승인·백업 확인 뒤) 가 있어야 합니다.");
  const key = arg("key");
  const fingerprint = arg("fingerprint");
  const actor = Number(arg("actor"));
  if (!key || !fingerprint || !(actor > 0)) throw new Error("--key, --fingerprint, --actor 가 모두 필요합니다.");
  const r = await executeRecovery({ ...input, recoveryKey: key, expectedFingerprint: fingerprint, actorUserId: actor }, { pool });
  console.log(JSON.stringify({ status: r.status, recoveryId: r.recoveryId, batches: r.summary?.batches, reversals: { count: r.summary?.reversals?.count, qty: r.summary?.reversals?.qty, amount: r.summary?.reversals?.amount } }, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error(`✗ ${e?.message ?? e}`);
  if (e?.errors) for (const x of e.errors) console.error(`  - ${x}`);
  process.exit(1);
});

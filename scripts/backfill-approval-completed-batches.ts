/**
 * 백필: 승인경로로 완료됐으나 완제품 LOT 이 없는 배치 소급 보정
 * ============================================================================
 * 배경 (쓰기 파이프라인 전수조사, 2026-07-03):
 *   배치완료가 실제로 도는 경로(승인 워크플로)가 status 플래그만 바꾸고 완제품 LOT 을
 *   안 만들었음 → 6/25~7/2 26배치 LOT 0건. 코드는 #404(승인 batch 브랜치 ensureBatchLots)
 *   로 미래분 정상화. 이 스크립트는 '과거' 완료·LOT없음 배치를 소급 보정한다.
 *
 * 경로 무관: "완료됐는데 완제품 LOT 이 0" 인 배치를 전부 찾아 ensureBatchLots 로 생성.
 *   (승인 batch 경로 / document_instance 경로 / dispatch 경로 어느 것으로 완료됐든 커버)
 *
 * 2단계(안전 분리):
 *   Part A — 완제품 LOT 생성 (ensureBatchLots, 멱등). --commit 필요.
 *   Part B — 원재료 유령 usage(lot_id NULL/0) 진단 리포트. 기본 read-only.
 *            실제 정정은 리뷰 후 별도(--commit-materials, 위험도 높음).
 *
 * 실행 (Genspark 서버):
 *   npx tsx scripts/backfill-approval-completed-batches.ts                  # DRY-RUN(진단)
 *   npx tsx scripts/backfill-approval-completed-batches.ts --commit         # Part A 실행(LOT)
 *   npx tsx scripts/backfill-approval-completed-batches.ts --commit --commit-materials  # +Part B
 *
 * 옵션: --tenant=2  --from=2026-06-25  --to=2026-07-02
 * ============================================================================
 */
import { config } from "dotenv";
import mysql from "mysql2/promise";

config(); // .env (경로 다르면 Genspark 가 config({path}) 로 조정)

function arg(name: string, def?: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : def;
}
const COMMIT = process.argv.includes("--commit");
const COMMIT_MATERIALS = process.argv.includes("--commit-materials");
const TENANT = Number(arg("tenant", "2"));
const FROM = arg("from", "2026-06-25");
const TO = arg("to", "2026-07-02");

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL 미설정");
  const conn = await mysql.createConnection(url);
  console.log(`\n=== 승인완료 배치 LOT 백필 (${COMMIT ? "COMMIT" : "DRY-RUN"}) tenant=${TENANT} ${FROM}~${TO} ===\n`);

  // ── STEP 1: 대상 식별 — 완료됐는데 완제품 LOT(product_id) 0건 ──────────────
  const [targets]: any = await conn.execute(
    `SELECT b.id, b.batch_code, b.product_id, b.status,
            b.actual_quantity, b.planned_quantity,
            b.completed_at, b.completion_idempotency_key,
            (SELECT COUNT(*) FROM h_inventory_lots l
               WHERE l.batch_id=b.id AND l.product_id IS NOT NULL) AS fg_lot_count
     FROM h_batches b
     WHERE b.tenant_id=? AND b.status='completed'
       AND DATE(b.completed_at) BETWEEN ? AND ?
     HAVING fg_lot_count = 0
     ORDER BY b.completed_at`,
    [TENANT, FROM, TO],
  );
  console.log(`[STEP1] 완료·완제품LOT 0건 대상: ${targets.length}배치`);
  for (const t of targets as any[]) {
    console.log(
      `  · #${t.id} ${t.batch_code} product_id=${t.product_id} ` +
      `actual=${t.actual_quantity ?? "NULL"} planned=${t.planned_quantity ?? "NULL"} ` +
      `idemKey=${t.completion_idempotency_key ? "SET" : "NULL"} completed=${t.completed_at}`,
    );
  }
  if (targets.length === 0) {
    console.log("대상 없음 — 종료.");
    await conn.end();
    return;
  }

  // ── STEP 2 (Part A): ensureBatchLots 로 완제품 LOT 생성 ────────────────────
  if (!COMMIT) {
    console.log(`\n[STEP2/Part A] DRY-RUN — --commit 시 각 배치에 ensureBatchLots(멱등) 실행 예정.`);
  } else {
    console.log(`\n[STEP2/Part A] ensureBatchLots 실행 (멱등, 이미 LOT 있으면 skip)`);
    const { ensureBatchLots } = await import("../server/db/production/productOutboundManagement");
    let created = 0, skipped = 0, failed = 0;
    for (const t of targets as any[]) {
      try {
        const r: any = await ensureBatchLots(Number(t.id), TENANT);
        const c = r?.created?.length ?? 0;
        created += c;
        if (c === 0) skipped++;
        console.log(`  · #${t.id} → 생성 ${c}건` + (r?.skipped ? ` (skip: ${JSON.stringify(r.skipped)})` : ""));
      } catch (e: any) {
        failed++;
        console.error(`  · #${t.id} 실패: ${String(e?.message || e).slice(0, 120)}`);
      }
    }
    console.log(`[Part A 결과] LOT 생성 합계 ${created}건 / skip배치 ${skipped} / 실패 ${failed}`);
  }

  // ── STEP 3 (Part B): 원재료 유령 usage 진단 (기본 read-only) ───────────────
  const batchIds = (targets as any[]).map((t) => Number(t.id));
  const inClause = batchIds.join(",");
  const [ghosts]: any = await conn.execute(
    `SELECT source_id AS batch_id, COUNT(*) AS ghost_tx,
            ROUND(SUM(quantity),3) AS ghost_qty
     FROM h_inventory_transactions
     WHERE tenant_id=? AND source_type='BATCH' AND transaction_type='usage'
       AND (lot_id IS NULL OR lot_id=0)
       AND source_id IN (${inClause})
     GROUP BY source_id`,
    [TENANT],
  );
  console.log(`\n[STEP3/Part B] 원재료 유령 usage(lot_id NULL/0) 진단:`);
  if ((ghosts as any[]).length === 0) {
    console.log("  유령 usage 없음.");
  } else {
    for (const g of ghosts as any[]) {
      console.log(`  · 배치 #${g.batch_id}: 유령 ${g.ghost_tx}건 / ${g.ghost_qty}`);
    }
    console.log(
      `\n  ⚠️ Part B(유령 → 실제 LOT 재차감)는 재고를 변경하므로 위 진단을 사용자와 확인 후\n` +
      `     --commit-materials 로만 실행. 지금은 리포트만.`,
    );
    if (COMMIT_MATERIALS) {
      console.log(`\n  [Part B COMMIT] FK-우선 resolver 로 유령 usage 재차감 시작...`);
      const { resolveMaterialIds } = await import("../server/lib/production/materialIdResolver");
      const [ghostRows]: any = await conn.execute(
        `SELECT id, source_id AS batch_id, material_id, quantity, unit
         FROM h_inventory_transactions
         WHERE tenant_id=? AND source_type='BATCH' AND transaction_type='usage'
           AND (lot_id IS NULL OR lot_id=0) AND source_id IN (${inClause})
         ORDER BY id`,
        [TENANT],
      );
      let fixed = 0, unresolved = 0, short = 0;
      for (const gt of ghostRows as any[]) {
        const resolved = await resolveMaterialIds(Number(gt.material_id), TENANT, conn);
        const canonicalId = resolved.canonicalId;
        if (resolved.source === "not_found" || resolved.source === "fallback_unchanged") {
          unresolved++;
          console.log(`    · tx#${gt.id} material=${gt.material_id} 미해결(${resolved.source}) — skip`);
          continue;
        }
        const need = parseFloat(gt.quantity || "0");
        // FEFO 가용 LOT
        const [lots]: any = await conn.execute(
          `SELECT id, available_quantity FROM h_inventory_lots
             WHERE tenant_id=? AND material_id=? AND status='available' AND available_quantity>0.001
             ORDER BY CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END, expiry_date ASC, id ASC`,
          [TENANT, canonicalId],
        );
        const avail = (lots as any[]).reduce((s, l) => s + parseFloat(l.available_quantity || "0"), 0);
        if (avail + 0.001 < need) {
          short++;
          console.log(`    · tx#${gt.id} material=${canonicalId} 가용부족(${avail}/${need}) — skip(수동)`);
          continue;
        }
        // 트랜잭션으로 FEFO 차감 + 유령 tx 에 lot_id 연결(첫 LOT)
        await conn.beginTransaction();
        try {
          let remaining = need, firstLot = 0;
          for (const lot of lots as any[]) {
            if (remaining <= 0.001) break;
            const take = Math.min(parseFloat(lot.available_quantity || "0"), remaining);
            if (take <= 0) continue;
            await conn.execute(
              `UPDATE h_inventory_lots
                 SET available_quantity = GREATEST(0, available_quantity - ?),
                     current_quantity = GREATEST(0, COALESCE(current_quantity, quantity) - ?),
                     status = CASE WHEN GREATEST(0, available_quantity - ?) <= 0.001 THEN 'used' ELSE status END,
                     updated_at = NOW()
               WHERE id = ? AND tenant_id = ?`,
              [take, take, take, lot.id, TENANT],
            );
            if (!firstLot) firstLot = Number(lot.id);
            remaining -= take;
          }
          // 유령 tx 를 실제 LOT 로 연결 + canonical material_id 정정 + 표식
          await conn.execute(
            `UPDATE h_inventory_transactions
               SET lot_id = ?, material_id = ?,
                   notes = CONCAT(COALESCE(notes,''),' [backfill: 유령→실LOT 재차감]')
             WHERE id = ? AND tenant_id = ?`,
            [firstLot, canonicalId, gt.id, TENANT],
          );
          // batch_inputs 플래그 보정(있으면)
          await conn.execute(
            `UPDATE h_batch_inputs SET inventory_deducted=1
               WHERE tenant_id=? AND batch_id=? AND material_id=? AND inventory_deducted=0`,
            [TENANT, gt.batch_id, gt.material_id],
          );
          await conn.commit();
          fixed++;
          console.log(`    · tx#${gt.id} → LOT#${firstLot} 재차감 ${need}${gt.unit || ""}`);
        } catch (e: any) {
          await conn.rollback();
          console.error(`    · tx#${gt.id} 실패(rollback): ${String(e?.message || e).slice(0, 100)}`);
        }
      }
      console.log(`  [Part B 결과] 재차감 ${fixed} / 미해결 ${unresolved} / 가용부족 ${short}`);
    }
  }

  // ── STEP 4: 사후 검증 ──────────────────────────────────────────────────────
  const [after]: any = await conn.execute(
    `SELECT COUNT(*) AS still_missing FROM (
       SELECT b.id FROM h_batches b
       WHERE b.tenant_id=? AND b.status='completed' AND DATE(b.completed_at) BETWEEN ? AND ?
         AND NOT EXISTS (SELECT 1 FROM h_inventory_lots l WHERE l.batch_id=b.id AND l.product_id IS NOT NULL)
     ) x`,
    [TENANT, FROM, TO],
  );
  console.log(`\n[STEP4 검증] 완제품 LOT 여전히 없는 완료배치: ${after[0].still_missing}건` +
    (COMMIT ? " (0 이어야 정상)" : " (dry-run 이라 변화 없음)"));

  await conn.end();
  console.log("\n=== 종료 ===\n");
  // ensureBatchLots/resolveMaterialIds 가 여는 app pool(getRawConnection)이 안 닫혀
  // 이벤트 루프가 안 끝나는 문제 → 모든 쓰기가 await 완료된 뒤 명시 종료.
  process.exit(0);
})().catch((e) => {
  console.error("백필 실패:", e);
  process.exit(1);
});

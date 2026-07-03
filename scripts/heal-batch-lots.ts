/**
 * 배치 완제품 LOT 자가치유 수동 트리거 (전체 백로그)
 * ============================================================================
 * PR #410 의 healIncompleteBatchLots() 를 서버에서 직접 실행 (adminProcedure 인증 우회,
 * 삼각분업: Claude 작성 · Genspark 실행). 브라우저 mutate 는 200배치라 timeout 위험 →
 * 서버 스크립트가 안전.
 *
 * 동작: status='completed' 인데 완제품 LOT(product_id) 0건인 배치를 찾아
 *       ensureBatchLots(멱등) + 완료훅 실행. 어느 경로로 완료됐든 커버.
 *
 * 실행 (Genspark 서버):
 *   npx tsx scripts/heal-batch-lots.ts                    # DRY-RUN (대상만 집계)
 *   npx tsx scripts/heal-batch-lots.ts --commit           # 실제 치유
 * 옵션: --tenant=2  --limit=1000
 *
 * 주의: actual_quantity 가 NULL 인 배치는 planned_quantity 로 LOT 생성(수량 근사).
 *       SKU 실적(production_sku_output)이 있으면 SKU LOT, 없으면 fallback 단일 LOT.
 * ============================================================================
 */
import { config } from "dotenv";
import mysql from "mysql2/promise";

config();

function arg(name: string, def?: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : def;
}
const COMMIT = process.argv.includes("--commit");
const TENANT = Number(arg("tenant", "2"));
const LIMIT = Number(arg("limit", "1000"));

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL 미설정");
  const conn = await mysql.createConnection(url);
  console.log(`\n=== 배치 완제품 LOT 자가치유 (${COMMIT ? "COMMIT" : "DRY-RUN"}) tenant=${TENANT} limit=${LIMIT} ===\n`);

  // 대상 집계 (dry-run 성격)
  const [[summary]]: any = await conn.query(
    `SELECT COUNT(*) AS backlog,
            SUM(b.actual_quantity IS NULL OR b.actual_quantity=0) AS actual_null,
            MIN(b.planned_date) AS oldest, MAX(b.planned_date) AS newest
       FROM h_batches b
      WHERE b.tenant_id=? AND b.status='completed'
        AND NOT EXISTS (SELECT 1 FROM h_inventory_lots l
                        WHERE l.batch_id=b.id AND l.tenant_id=b.tenant_id AND l.product_id IS NOT NULL)`,
    [TENANT],
  );
  console.log(`[대상] 완료·완제품LOT없음 배치: ${summary.backlog}건 ` +
    `(actual NULL ${summary.actual_null ?? 0}건 — planned 로 근사) 기간 ${summary.oldest}~${summary.newest}`);

  const [byMonth]: any = await conn.query(
    `SELECT DATE_FORMAT(b.planned_date,'%Y-%m') AS ym, COUNT(*) AS n
       FROM h_batches b
      WHERE b.tenant_id=? AND b.status='completed'
        AND NOT EXISTS (SELECT 1 FROM h_inventory_lots l
                        WHERE l.batch_id=b.id AND l.tenant_id=b.tenant_id AND l.product_id IS NOT NULL)
      GROUP BY ym ORDER BY ym`,
    [TENANT],
  );
  console.log(`[월별] ` + (byMonth as any[]).map((r) => `${r.ym}:${r.n}`).join("  "));

  if (!COMMIT) {
    console.log(`\nDRY-RUN — 실제 치유하려면 --commit. (멱등: 이미 LOT 있으면 skip)`);
    await conn.end();
    process.exit(0);
  }

  // 실제 치유 — PR #410 healer 호출
  console.log(`\n[COMMIT] healIncompleteBatchLots 실행...`);
  const { healIncompleteBatchLots } = await import("../server/schedulers/batchLotSelfHealer");
  const r = await healIncompleteBatchLots({ tenantId: TENANT, limit: LIMIT });
  console.log(`\n[결과] scanned=${r.scanned} healed=${r.healed} lotsCreated=${r.lotsCreated} ` +
    `skipped=${r.skipped} failed=${r.failed}`);
  // 실패/skip 상세 (상위 20)
  const problems = r.details.filter((d) => d.error || d.skipped).slice(0, 20);
  if (problems.length > 0) {
    console.log(`[문제 상세 상위 ${problems.length}]`);
    for (const p of problems) console.log(`  · batch#${p.batchId} ${p.error ? `ERR:${p.error}` : `skip:${p.skipped}`}`);
  }

  // 사후 검증
  const [[after]]: any = await conn.query(
    `SELECT COUNT(*) AS still FROM h_batches b
      WHERE b.tenant_id=? AND b.status='completed'
        AND NOT EXISTS (SELECT 1 FROM h_inventory_lots l
                        WHERE l.batch_id=b.id AND l.tenant_id=b.tenant_id AND l.product_id IS NOT NULL)`,
    [TENANT],
  );
  console.log(`\n[검증] 완제품 LOT 여전히 없는 완료배치: ${after.still}건 (0 이어야 정상, skip 사유 있으면 잔존 가능)`);

  await conn.end();
  console.log(`\n=== 종료 ===\n`);
  process.exit(0);
})().catch((e) => {
  console.error("자가치유 실패:", e);
  process.exit(1);
});

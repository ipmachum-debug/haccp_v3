/**
 * 완료 배치 LOT 누락 백필 스크립트
 * ═══════════════════════════════════════════════════════════════
 * 배경:
 *   updateBatchStatus(status='completed') 경로 (status 드롭다운 변경 등) 가
 *   completeBatch() 의 LOT 생성 로직을 거치지 않아, h_batches 는 'completed'
 *   인데 h_inventory_lots 에 LOT 가 없어 재고 조정/출고 화면에서 보이지 않음.
 *
 *   server/db/production/batchCRUD.ts 의 updateBatchStatus 가 보강되어
 *   이후 발생은 0 이지만, 보강 이전에 누적된 누락 배치를 ensureBatchLots
 *   헬퍼로 일괄 복구한다.
 *
 *   ensureBatchLots 는 SKU 실적 (production_sku_output) 있으면 SKU별 멀티 LOT,
 *   없으면 단일 fallback LOT 를 생성한다 (batchLifecycle.completeBatch 와 동일).
 *
 * 실행:
 *   Dry-run (기본):
 *     npx tsx scripts/backfill-missing-product-lots.ts --tenant 2
 *   실제 실행:
 *     npx tsx scripts/backfill-missing-product-lots.ts --tenant 2 --execute
 * ═══════════════════════════════════════════════════════════════
 */

import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

function parseArgs(argv: string[]) {
  const args: { tenant?: number; execute: boolean } = { execute: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--tenant" || a === "-t") {
      args.tenant = parseInt(argv[++i] || "0", 10);
    } else if (a === "--execute") {
      args.execute = true;
    } else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: tsx scripts/backfill-missing-product-lots.ts --tenant <id> [--execute]",
      );
      process.exit(0);
    }
  }
  return args;
}

async function main() {
  const { tenant, execute } = parseArgs(process.argv);
  if (!tenant || tenant <= 0) {
    console.error("ERROR: --tenant <id> 가 필수입니다.");
    process.exit(1);
  }

  // 서버 헬퍼 (DB 연결 + ensureBatchLots) 동적 import
  const { getRawConnection } = await import("../server/db/connection");
  const { ensureBatchLots } = await import("../server/db/production/productOutboundManagement");

  const conn = await getRawConnection();

  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`완료 배치 LOT 누락 백필 ${execute ? "[EXECUTE]" : "[DRY-RUN]"}`);
  console.log(`tenant_id = ${tenant}`);
  console.log("═══════════════════════════════════════════════════════════════");

  // 1. 백필 대상 조회 (LOT 가 없는 완료 배치)
  const [rows]: any = await conn.execute(
    `SELECT
       b.id AS batch_id, b.batch_code, b.product_id,
       b.actual_quantity, b.planned_quantity,
       COALESCE(b.actual_quantity, b.planned_quantity) AS qty,
       b.end_time,
       (SELECT COUNT(*) FROM production_sku_output pso
          WHERE pso.batch_id = b.id AND pso.tenant_id = b.tenant_id) AS sku_count,
       -- SKU 합을 batch 단위(보통 kg)로 환산: quantity × kg_per_sales_unit
       (SELECT COALESCE(SUM(pso.quantity * COALESCE(ps.kg_per_sales_unit, 1)), 0)
          FROM production_sku_output pso
          JOIN product_skus ps ON pso.sku_id = ps.id
          WHERE pso.batch_id = b.id AND pso.tenant_id = b.tenant_id) AS sku_total
     FROM h_batches b
     WHERE b.tenant_id = ?
       AND b.status = 'completed'
       AND NOT EXISTS (
         SELECT 1 FROM h_inventory_lots l
          WHERE l.batch_id = b.id AND l.tenant_id = b.tenant_id
       )
       AND COALESCE(b.actual_quantity, b.planned_quantity) > 0
     ORDER BY b.end_time DESC, b.id DESC`,
    [tenant],
  );

  const targetCount = (rows as any[]).length;
  console.log(`\n대상 배치: ${targetCount} 건`);

  if (targetCount === 0) {
    console.log("백필 필요 없음. 종료.");
    return;
  }

  // 2. 미리보기 (SKU 분기 + 차이 표시)
  const multiSku = (rows as any[]).filter((r) => Number(r.sku_count) > 0);
  const singleLot = (rows as any[]).filter((r) => Number(r.sku_count) === 0);
  console.log(`  멀티 SKU LOT: ${multiSku.length}건 / 단일 fallback LOT: ${singleLot.length}건`);

  if (singleLot.length > 0) {
    console.log("\n  ⚠ SKU 누락 의심 (사용자 보고: 모든 배치에 SKU 입력했음):");
    for (const r of singleLot) {
      console.log(`    - batch#${r.batch_id} ${r.batch_code} (production_sku_output 없음, planned=${r.planned_quantity})`);
    }
  }

  console.log("\n--- 백필 미리보기 (상위 10건) ---");
  for (const r of (rows as any[]).slice(0, 10)) {
    const skuCnt = Number(r.sku_count);
    const skuTot = parseFloat(String(r.sku_total)); // 이미 batch 단위(kg)로 환산됨
    const batchQty = parseFloat(String(r.qty));
    const diffPct = batchQty > 0 ? Math.abs(skuTot - batchQty) / batchQty * 100 : 0;
    // kg_per_sales_unit 환산 후에도 ±5% 초과면 진짜 데이터 차이 가능성
    const skuTag = skuCnt > 0
      ? `SKU×${skuCnt}≈${skuTot.toFixed(1)}kg${diffPct > 5 ? ` ⚠배치(${batchQty})와 ${diffPct.toFixed(1)}% 차이` : ""}`
      : `단일 ${batchQty}`;
    console.log(`  batch#${r.batch_id} ${r.batch_code} → ${skuTag}`);
  }
  if (targetCount > 10) console.log(`  ... 외 ${targetCount - 10}건`);

  if (!execute) {
    console.log("\n[DRY-RUN] 실제 변경 없음. --execute 플래그로 실행하세요.");
    return;
  }

  // 3. 실제 LOT 생성 (배치별 ensureBatchLots 호출, idempotent)
  console.log("\n--- 백필 실행 ---");
  let totalCreated = 0;
  let totalSkipped = 0;
  const warnings: string[] = [];
  const failures: Array<{ batchId: number; error: string }> = [];

  for (const r of rows as any[]) {
    try {
      const result = await ensureBatchLots(Number(r.batch_id), tenant);
      if (result.skipped) {
        totalSkipped += 1;
        console.log(`  batch#${r.batch_id}: skipped (${result.reason})`);
      } else {
        totalCreated += result.created.length;
        console.log(`  batch#${r.batch_id}: ${result.created.length}건 LOT 생성`);
      }
      if (result.warning) warnings.push(result.warning);
    } catch (e) {
      failures.push({ batchId: Number(r.batch_id), error: (e as Error).message });
      console.error(`  batch#${r.batch_id}: 실패 — ${(e as Error).message}`);
    }
  }

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log(`완료. LOT 생성: ${totalCreated}건 / skipped: ${totalSkipped}건 / 실패: ${failures.length}건`);
  if (warnings.length > 0) {
    console.log(`\n경고 ${warnings.length}건 (SKU 합 vs 배치 수량 ±5% 초과 — 단위 차이 가능):`);
    for (const w of warnings) console.log(`  ⚠ ${w}`);
  }
  if (failures.length > 0) {
    console.log(`\n실패 ${failures.length}건 — 운영팀 확인 필요:`);
    for (const f of failures) console.log(`  - batch#${f.batchId}: ${f.error}`);
  }
  console.log("═══════════════════════════════════════════════════════════════");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

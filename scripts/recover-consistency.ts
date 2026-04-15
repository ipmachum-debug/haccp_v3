/**
 * 정합성 데이터 복구 CLI (Phase 0.5)
 * ═══════════════════════════════════════════════════════════════
 * 사용법:
 *   # DRY RUN (아무것도 쓰지 않음, 무엇을 할지만 출력)
 *   DRY_RUN=1 npx tsx scripts/recover-consistency.ts --tenant=2
 *
 *   # 실제 복구
 *   npx tsx scripts/recover-consistency.ts --tenant=2
 *
 *   # 특정 phase 만
 *   npx tsx scripts/recover-consistency.ts --tenant=2 --phase=journals
 *   npx tsx scripts/recover-consistency.ts --tenant=2 --phase=lots
 *   npx tsx scripts/recover-consistency.ts --tenant=2 --phase=ledger
 *   npx tsx scripts/recover-consistency.ts --tenant=2 --phase=expired
 *
 *   # 테스트 limit
 *   npx tsx scripts/recover-consistency.ts --tenant=2 --limit=10
 *
 * 실행 순서 (중요!):
 *   1. journals → 누락 회계 분개 생성
 *   2. lots → LOT vs TX 불일치 adjustment 기록
 *   3. ledger → transactions 기반 material_ledger_daily 재집계
 *              (2 의 adjustment 가 반영되어야 하므로 반드시 이 순서)
 *   4. expired → 만료 LOT 상태 정리
 *
 *   → 그 다음 scripts/verify-consistency.ts 재실행하여 0건 확인
 * ═══════════════════════════════════════════════════════════════
 */

import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) dotenv.config({ path: envPath });

async function main() {
  const args = process.argv.slice(2);
  const tenantArg = args.find((a) => a.startsWith("--tenant="));
  const phaseArg = args.find((a) => a.startsWith("--phase="));
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const dryRun = process.env.DRY_RUN === "1";

  const tenantId = tenantArg ? parseInt(tenantArg.split("=")[1], 10) : null;
  const phase = phaseArg ? phaseArg.split("=")[1] : "all";
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : undefined;

  console.log("═".repeat(75));
  console.log("  정합성 데이터 복구 (Phase 0.5)");
  console.log("═".repeat(75));
  console.log(`  tenant: ${tenantId === null ? "ALL" : tenantId}`);
  console.log(`  phase:  ${phase}`);
  console.log(`  limit:  ${limit ?? "none"}`);
  console.log(`  mode:   ${dryRun ? "🟡 DRY RUN (쓰기 없음)" : "🔴 LIVE (실제 변경)"}`);
  console.log("═".repeat(75));
  console.log();

  if (!dryRun) {
    console.log("⚠️  LIVE 모드입니다. 5초 후 시작합니다 (Ctrl+C 로 중단)...");
    await new Promise((r) => setTimeout(r, 5000));
  }

  try {
    const { getRawConnection } = await import("../server/db/connection.js");
    const {
      recoverPaidPurchaseJournals,
      recoverLotVsTxBalance,
      recoverMaterialLedgerDaily,
      recoverExpiredLots,
      runAllRecovery,
    } = await import("../server/lib/consistency/recovery.js");

    const conn = await getRawConnection();
    const opts = { dryRun, tenantId, limit };
    const results: any[] = [];

    const start = Date.now();
    switch (phase) {
      case "journals":
        results.push(await recoverPaidPurchaseJournals(conn, opts));
        break;
      case "lots":
        results.push(await recoverLotVsTxBalance(conn, opts));
        break;
      case "ledger":
        results.push(await recoverMaterialLedgerDaily(conn, opts));
        break;
      case "expired":
        results.push(await recoverExpiredLots(conn, opts));
        break;
      case "all":
      default:
        results.push(...(await runAllRecovery(conn, opts)));
        break;
    }

    // 결과 출력
    console.log();
    console.log("─".repeat(75));
    console.log("  📋 복구 결과");
    console.log("─".repeat(75));
    for (const r of results) {
      console.log();
      console.log(`  [${r.phase}]`);
      console.log(`    시도:   ${r.attempted}`);
      console.log(`    성공:   ${r.succeeded}`);
      console.log(`    실패:   ${r.failed}`);
      console.log(`    스킵:   ${r.skipped}`);
      if (r.errors.length > 0) {
        console.log(`    에러 (최대 5건):`);
        for (const e of r.errors.slice(0, 5)) {
          console.log(`      - ${e.id}: ${e.message}`);
        }
      }
      if (r.details.length > 0 && r.details.length <= 20) {
        console.log(`    상세:`);
        for (const d of r.details) console.log(`    ${d}`);
      } else if (r.details.length > 20) {
        console.log(`    상세 (앞 10건만):`);
        for (const d of r.details.slice(0, 10)) console.log(`    ${d}`);
        console.log(`    ... 총 ${r.details.length} 건`);
      }
    }

    console.log();
    console.log("─".repeat(75));
    const totalSucceeded = results.reduce((a, r) => a + r.succeeded, 0);
    const totalFailed = results.reduce((a, r) => a + r.failed, 0);
    console.log(`  총 성공: ${totalSucceeded}, 총 실패: ${totalFailed}`);
    console.log(`  소요: ${Date.now() - start}ms`);
    console.log("─".repeat(75));
    console.log();
    if (dryRun) {
      console.log("🟡 DRY RUN 모드였습니다. 실제 변경 없음.");
      console.log("   실제 실행: DRY_RUN= 제거 (또는 DRY_RUN=0) 후 재실행");
    } else {
      console.log("✅ 복구 완료.");
      console.log("   다음 단계: npx tsx scripts/verify-consistency.ts --tenant=" + (tenantId ?? ""));
    }
    console.log();

    process.exit(totalFailed > 0 ? 1 : 0);
  } catch (err) {
    console.error("\n❌ 복구 실패:", err);
    process.exit(2);
  }
}

main();

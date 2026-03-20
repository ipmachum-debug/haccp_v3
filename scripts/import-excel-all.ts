/**
 * 엑셀 기초데이터 통합 임포트 러너
 *
 * 전체 파이프라인을 순서대로 실행합니다:
 *   Step 1: 마스터 데이터 (거래처, 원료, 제품)
 *   Step 2: 배합비(BOM) (품목제조보고 + 배합비)
 *   Step 3: 운영 데이터 (입고, 이월재고, 생산배치, 납품, 검사)
 *   Step 4: 문서 생성 (CCP, 승인, 생산일보, 주간리포트, 원가)
 *
 * 실행: npx tsx scripts/import-excel-all.ts [엑셀파일경로]
 *
 * 옵션:
 *   --dry-run     실제 DB 변경 없이 데이터만 확인
 *   --clean       기존 임포트 데이터 삭제 후 재임포트
 *   --step=N      특정 단계만 실행 (1~4)
 */

import { execSync } from "child_process";
import path from "path";

const excelPath = process.argv.find(a => !a.startsWith("--") && a.endsWith(".xlsx"))
  || path.resolve(__dirname, "../HACCP_원료수불부_원가관리0320.xlsx");

const stepOnly = process.argv.find(a => a.startsWith("--step="))?.split("=")[1];

const steps = [
  { num: 1, script: "import-excel-master.ts", desc: "마스터 데이터 (거래처/원료/제품)" },
  { num: 2, script: "import-excel-bom.ts", desc: "배합비(BOM)" },
  { num: 3, script: "import-excel-operations.ts", desc: "운영 데이터 (입고/생산/납품/검사)" },
  { num: 4, script: "import-excel-documents.ts", desc: "문서 생성 + 자동로직" },
];

async function main() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║  HACCP-ONE 엑셀 기초데이터 통합 임포트       ║");
  console.log("╠══════════════════════════════════════════════╣");
  console.log(`║  📂 파일: ${path.basename(excelPath).padEnd(35)}║`);
  console.log("╚══════════════════════════════════════════════╝\n");

  const startTime = Date.now();

  for (const step of steps) {
    if (stepOnly && String(step.num) !== stepOnly) continue;

    console.log(`\n${"═".repeat(50)}`);
    console.log(`  Step ${step.num}/4: ${step.desc}`);
    console.log(`${"═".repeat(50)}\n`);

    try {
      const scriptPath = path.resolve(__dirname, step.script);
      execSync(`npx tsx "${scriptPath}" "${excelPath}"`, {
        cwd: path.resolve(__dirname, ".."),
        stdio: "inherit",
        timeout: 300000, // 5분 타임아웃
      });
      console.log(`\n  ✅ Step ${step.num} 완료\n`);
    } catch (err: any) {
      console.error(`\n  ❌ Step ${step.num} 실패: ${err.message}`);
      if (!stepOnly) {
        console.error("  후속 단계를 건너뜁니다.");
        break;
      }
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║  🎉 전체 임포트 완료!                         ║");
  console.log(`║  ⏱️  소요시간: ${elapsed}초`.padEnd(47) + "║");
  console.log("╠══════════════════════════════════════════════╣");
  console.log("║  생성된 데이터:                               ║");
  console.log("║  • 거래처 마스터                              ║");
  console.log("║  • 원재료/제품 마스터 (h_item_master)         ║");
  console.log("║  • 배합비 (h_mf_reports + h_mf_ingredients)   ║");
  console.log("║  • 원재료 입고 + 재고 + LOT                  ║");
  console.log("║  • 이월재고 (material_ledger_daily)           ║");
  console.log("║  • 생산 배치 + 원료투입 (h_batches)           ║");
  console.log("║  • 납품 출고 (accounting_sales)               ║");
  console.log("║  • 육안검사일지                               ║");
  console.log("║  • CCP 기록지 + 승인 요청                    ║");
  console.log("║  • 생산일보 + 주간 리포트                     ║");
  console.log("║  • 배치 원가 분석                             ║");
  console.log("╚══════════════════════════════════════════════╝");
}

main().catch((err) => {
  console.error("❌ 치명적 오류:", err);
  process.exit(1);
});

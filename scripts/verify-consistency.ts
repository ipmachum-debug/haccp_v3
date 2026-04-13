/**
 * 정합성 검증 CLI 스크립트 (READ-ONLY)
 * ═══════════════════════════════════════════════════════════════
 * 사용법:
 *   npx tsx scripts/verify-consistency.ts              # 전체 tenant
 *   npx tsx scripts/verify-consistency.ts --tenant=1   # 특정 tenant
 *   npx tsx scripts/verify-consistency.ts --json       # JSON 출력
 *
 * 주의: 이 스크립트는 SELECT 만 수행합니다. DB 에 쓰지 않습니다.
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
  const jsonMode = args.includes("--json");
  const tenantArg = args.find((a) => a.startsWith("--tenant="));
  const tenantId = tenantArg ? parseInt(tenantArg.split("=")[1], 10) : null;

  if (!jsonMode) {
    console.log(`\n정합성 검증 시작... ${tenantId ? `(tenant=${tenantId})` : "(전체 tenant)"}`);
    console.log("DB 에 쓰지 않습니다. READ-ONLY 모드.\n");
  }

  try {
    // 런타임에 import (DB 연결 필요)
    const { runConsistencyAudit, formatConsoleReport, formatJsonReport } =
      await import("../server/lib/consistency/index.js");

    const report = await runConsistencyAudit(tenantId);

    if (jsonMode) {
      console.log(formatJsonReport(report));
    } else {
      console.log(formatConsoleReport(report));
    }

    // 종료 코드: Critical 있으면 2, High 있으면 1, 아니면 0
    if (report.summary.critical > 0) process.exit(2);
    if (report.summary.high > 0) process.exit(1);
    process.exit(0);
  } catch (err) {
    console.error("\n❌ 검증 실패:", err);
    process.exit(3);
  }
}

main();

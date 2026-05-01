/**
 * Tool 7: esbuild dry-run 사전 검증 lint
 *
 * 목적: PR #204 (coreMesMap.ts JSDoc /** 누락) 같은 esbuild syntax error 를
 *       PR 머지 전에 사전 차단.
 *
 * 검증 방식:
 *   server/_core/index.ts 를 entry point 로 esbuild 번들링 dry-run.
 *   --outfile=/dev/null 로 디스크 쓰기 생략, syntax/import 오류만 확인.
 *
 * 성능: ~0.4 초 (전체 빌드 ~37 초의 1% 이하).
 *
 * 종료 코드:
 *   0 = 통과 (esbuild 번들링 성공)
 *   1 = 실패 (syntax error / import error)
 */

import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const REPO_ROOT = process.cwd();
const ENTRY = "server/_core/index.ts";

function main(): number {
  console.log("=== Tool 7: esbuild dry-run 사전 검증 ===\n");

  const entryPath = path.join(REPO_ROOT, ENTRY);
  if (!fs.existsSync(entryPath)) {
    console.error(`❌ entry 파일 없음: ${entryPath}`);
    return 1;
  }

  console.log(`Entry: ${ENTRY}`);
  console.log(`옵션: --platform=node --packages=external --bundle --format=esm --outfile=/dev/null\n`);

  const t0 = Date.now();
  const result = spawnSync(
    "npx",
    [
      "esbuild",
      ENTRY,
      "--platform=node",
      "--packages=external",
      "--bundle",
      "--format=esm",
      "--outfile=/dev/null",
      "--log-level=warning",
    ],
    {
      cwd: REPO_ROOT,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  const elapsedMs = Date.now() - t0;

  if (result.error) {
    console.error(`❌ esbuild 실행 실패: ${result.error.message}`);
    return 1;
  }

  // esbuild 는 성공 시 stderr 에 빌드 요약 출력
  const stderr = (result.stderr || "").trim();
  const stdout = (result.stdout || "").trim();

  if (result.status === 0) {
    console.log(`✅ 통과: esbuild 번들링 성공 (${elapsedMs}ms)`);
    if (stderr) {
      // 경고만 출력 (warning level)
      const warnings = stderr.split("\n").filter((l) => l.includes("▲") || l.includes("warning"));
      if (warnings.length > 0) {
        console.log(`\nℹ️  경고 ${warnings.length}건 (빌드는 성공):`);
        warnings.slice(0, 5).forEach((w) => console.log(`  ${w}`));
        if (warnings.length > 5) {
          console.log(`  ... (+${warnings.length - 5} 더)`);
        }
      }
    }
    return 0;
  } else {
    console.log(`❌ 실패: esbuild 번들링 에러 (${elapsedMs}ms, exit=${result.status})\n`);
    if (stderr) {
      console.log("=== esbuild 에러 출력 ===");
      console.log(stderr);
    }
    if (stdout) {
      console.log("\n=== esbuild stdout ===");
      console.log(stdout);
    }
    console.log(
      "\n해결 방법: esbuild 가 보고한 라인의 syntax/import 오류를 수정한 뒤 재시도하세요."
    );
    console.log("           대표 사례: PR #204 — coreMesMap.ts JSDoc /** 누락 (rebase union merge 후).");
    return 1;
  }
}

const code = main();
process.exit(code);

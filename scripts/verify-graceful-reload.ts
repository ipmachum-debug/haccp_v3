#!/usr/bin/env tsx
/**
 * verify-graceful-reload.ts
 *
 * Plan D (PR #183) 의 graceful reload 변경이 main 에 정확히 반영되었는지 검증.
 *
 * 배경:
 *   PR #183 머지 후 회귀 체크가 process.send("ready") 위치를 단순 grep 으로
 *   검증하다가 주석 안의 코드 식별자를 false positive 로 잡는 사고 발생.
 *
 * 본 스크립트의 검증 항목:
 *   1. server.listen 콜백 시작 라인 식별
 *   2. 주석 제외 process.send("ready") 호출 라인 식별
 *   3. 두 라인 거리가 30줄 이상 (DB pre-init + 스케줄러 등록 거치는지)
 *   4. gracefulShutdown 안의 closeIdleConnections / isShuttingDown 가드 존재
 *   5. ecosystem.config.cjs 의 listen_timeout >= 30000, kill_timeout >= 10000
 *
 * 사용:
 *   npx tsx scripts/verify-graceful-reload.ts
 *   exit 0 = PASS / exit 1 = FAIL
 */
import fs from "node:fs";
import path from "node:path";

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];

function fail(name: string, detail: string) {
  checks.push({ name, ok: false, detail });
}
function pass(name: string, detail: string) {
  checks.push({ name, ok: true, detail });
}

/**
 * 주석 라인 판정 — 단일 라인 (//) 또는 블록 (/* * /) 내부 라인.
 * 단순 휴리스틱: 라인이 트림 후 // 시작이거나, 블록 주석 트래킹.
 * 본 스크립트는 server/_core/index.ts 만 검사하므로 충분히 정확.
 */
function annotateCommentLines(lines: string[]): boolean[] {
  const inComment = new Array(lines.length).fill(false);
  let inBlock = false;
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (inBlock) {
      inComment[i] = true;
      if (trimmed.includes("*/")) inBlock = false;
      continue;
    }
    if (trimmed.startsWith("//")) {
      inComment[i] = true;
      continue;
    }
    if (trimmed.startsWith("/*") && !trimmed.includes("*/")) {
      inBlock = true;
      inComment[i] = true;
      continue;
    }
  }
  return inComment;
}

// ─────────────────────────────────────────────────────────────
// Check 1~4: server/_core/index.ts
// ─────────────────────────────────────────────────────────────
const serverPath = path.resolve(process.cwd(), "server/_core/index.ts");
if (!fs.existsSync(serverPath)) {
  fail("server-file-exists", `server/_core/index.ts 없음`);
} else {
  const src = fs.readFileSync(serverPath, "utf8");
  const lines = src.split("\n");
  const isComment = annotateCommentLines(lines);

  // listen 콜백 시작 — 'server.listen(' 이 코드 라인에 등장
  let listenLine = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (isComment[i]) continue;
    if (
      lines[i].includes("server.listen(") &&
      lines[i].includes("'0.0.0.0'")
    ) {
      listenLine = i + 1;
      break;
    }
  }

  // process.send("ready") 호출 — 코드 라인에서만
  let readyLine = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (isComment[i]) continue;
    // 정확한 호출 패턴: process.send("ready") 또는 process.send('ready')
    if (
      /\bprocess\.send\s*\(\s*["']ready["']\s*\)/.test(lines[i])
    ) {
      readyLine = i + 1;
      break;
    }
  }

  if (listenLine < 0) {
    fail("listen-callback-found", "server.listen('0.0.0.0', ...) 콜백 미발견");
  } else if (readyLine < 0) {
    fail(
      "ready-call-found",
      `process.send("ready") 호출 미발견 (코드 라인 기준, 주석 제외)`,
    );
  } else {
    const distance = readyLine - listenLine;
    if (distance < 30) {
      fail(
        "ready-after-pre-init",
        `process.send("ready") 위치 ${readyLine}행, listen 콜백 ${listenLine}행 — 차이 ${distance}행 (30행 미만, DB pre-init 거치지 않을 가능성)`,
      );
    } else {
      pass(
        "ready-after-pre-init",
        `process.send("ready") line=${readyLine}, listen callback line=${listenLine}, distance=${distance} lines (≥30)`,
      );
    }
  }

  // gracefulShutdown — closeIdleConnections / isShuttingDown 검증
  const codeOnly = lines
    .map((l, i) => (isComment[i] ? "" : l))
    .join("\n");
  if (!codeOnly.includes("closeIdleConnections")) {
    fail(
      "graceful-close-idle",
      "gracefulShutdown 에 closeIdleConnections 미발견",
    );
  } else {
    pass("graceful-close-idle", "closeIdleConnections 호출 확인");
  }
  if (!codeOnly.includes("isShuttingDown")) {
    fail(
      "graceful-reentry-guard",
      "gracefulShutdown 에 isShuttingDown 재진입 가드 미발견",
    );
  } else {
    pass("graceful-reentry-guard", "isShuttingDown 재진입 가드 확인");
  }
  if (!codeOnly.includes("closeAllConnections")) {
    fail(
      "force-exit-close-all",
      "force-exit 시 closeAllConnections 호출 미발견",
    );
  } else {
    pass("force-exit-close-all", "closeAllConnections (force-exit) 확인");
  }
}

// ─────────────────────────────────────────────────────────────
// Check 5: ecosystem.config.cjs timeout
// ─────────────────────────────────────────────────────────────
const ecoPath = path.resolve(process.cwd(), "ecosystem.config.cjs");
if (!fs.existsSync(ecoPath)) {
  fail("ecosystem-exists", "ecosystem.config.cjs 없음");
} else {
  const eco = fs.readFileSync(ecoPath, "utf8");
  const ecoLines = eco.split("\n");
  const ecoIsComment = annotateCommentLines(ecoLines);
  const ecoCode = ecoLines
    .map((l, i) => (ecoIsComment[i] ? "" : l))
    .join("\n");

  const listenMatch = ecoCode.match(/listen_timeout\s*:\s*(\d+)/);
  const killMatch = ecoCode.match(/kill_timeout\s*:\s*(\d+)/);

  if (!listenMatch) {
    fail("ecosystem-listen-timeout", "listen_timeout 설정 미발견");
  } else {
    const v = Number(listenMatch[1]);
    if (v < 30000) {
      fail(
        "ecosystem-listen-timeout",
        `listen_timeout=${v} (Plan D 요구: 30000+)`,
      );
    } else {
      pass("ecosystem-listen-timeout", `listen_timeout=${v}`);
    }
  }
  if (!killMatch) {
    fail("ecosystem-kill-timeout", "kill_timeout 설정 미발견");
  } else {
    const v = Number(killMatch[1]);
    if (v < 10000) {
      fail(
        "ecosystem-kill-timeout",
        `kill_timeout=${v} (Plan D 요구: 10000+, gracefulShutdown 8s force-exit 보다 길게)`,
      );
    } else {
      pass("ecosystem-kill-timeout", `kill_timeout=${v}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 결과 출력
// ─────────────────────────────────────────────────────────────
console.log("════════════════════════════════════════════════════════════════");
console.log("   Plan D (PR #183) graceful reload 회귀 검증");
console.log("════════════════════════════════════════════════════════════════");
const passed = checks.filter((c) => c.ok).length;
const failed = checks.filter((c) => !c.ok).length;
for (const c of checks) {
  const icon = c.ok ? "✅" : "❌";
  console.log(`  ${icon} ${c.name.padEnd(30)} ${c.detail}`);
}
console.log("");
console.log(`총 ${checks.length}건 — 통과 ${passed}, 실패 ${failed}`);

if (failed > 0) {
  console.error("");
  console.error("회귀 검증 실패. 위 ❌ 항목 확인 후 수정 필요.");
  process.exit(1);
}
console.log("회귀 검증 통과 — Plan D 정상 적용.");

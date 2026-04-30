#!/usr/bin/env tsx
/**
 * measure-reload-502.ts
 *
 * PM2 reload 시 502/504 윈도우를 실측해 데이터로 누적.
 * Plan D (PR #183) graceful reload 의 효과를 동적 검증.
 *
 * 동작:
 *   1. 워커 N개로 health endpoint 에 RPS 만큼 동시 요청 시작
 *   2. measureBeforeMs 만큼 baseline 수집
 *   3. PM2 reload 트리거 (--no-reload 면 skip — baseline 만 측정)
 *   4. measureAfterMs 만큼 reload 중·후 응답 코드 시계열 기록
 *   5. 결과: 200/502/504/기타 카운트, 502 윈도우 지속 시간, ready latency
 *   6. JSON 누적: logs/reload-measurements/<ISO>.json
 *   7. 임계치 초과 시 exit 1 (CI/cron 친화)
 *
 * 사용 예:
 *   npx tsx scripts/measure-reload-502.ts                    # 기본값
 *   npx tsx scripts/measure-reload-502.ts --no-reload        # baseline 만
 *   npx tsx scripts/measure-reload-502.ts --rps 100 --duration 30
 *   npx tsx scripts/measure-reload-502.ts --max-502-window 1000 --max-502-count 10
 *
 * 환경변수:
 *   HEALTH_URL          기본 https://millioai.com/api/health
 *   PM2_APP             기본 haccpone
 *   MEASURE_LOG_DIR     기본 logs/reload-measurements
 *
 * 안전성:
 *   - reload 명령은 옵션으로만 실행 (--no-reload 시 차단)
 *   - 어떤 경우에도 운영 DB / 사용자 데이터 영향 0
 *   - 부하는 GET /api/health 만 (idempotent, 캐시 가능, 인증 불필요)
 *   - SIGINT 시 워커 정리 후 종료 (운영 부하 누적 차단)
 */

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";

type Args = {
  url: string;
  pm2App: string;
  rps: number;
  workers: number;
  beforeMs: number;
  afterMs: number;
  reloadEnabled: boolean;
  max502WindowMs: number;
  max502Count: number;
  maxNon200Pct: number;
  outDir: string;
  silent: boolean;
};

function parseArgs(argv: string[]): Args {
  const get = (k: string, d?: string): string | undefined => {
    const i = argv.indexOf(`--${k}`);
    if (i >= 0 && i + 1 < argv.length) return argv[i + 1];
    return d;
  };
  const has = (k: string): boolean => argv.includes(`--${k}`);

  return {
    url: get("url", process.env.HEALTH_URL ?? "https://millioai.com/api/health")!,
    pm2App: get("app", process.env.PM2_APP ?? "haccpone")!,
    rps: Number(get("rps", "50")),
    workers: Number(get("workers", "20")),
    beforeMs: Number(get("before-ms", "3000")),
    afterMs: Number(get("after-ms", "20000")),
    reloadEnabled: !has("no-reload"),
    max502WindowMs: Number(get("max-502-window", "1000")),
    max502Count: Number(get("max-502-count", "10")),
    maxNon200Pct: Number(get("max-non200-pct", "1.0")),
    outDir: get("out-dir", process.env.MEASURE_LOG_DIR ?? "logs/reload-measurements")!,
    silent: has("silent"),
  };
}

type Sample = {
  tMs: number;             // 측정 시작 후 경과 시간 (ms)
  status: number;          // HTTP status (0 = network error)
  durationMs: number;      // 응답 latency
  err?: string;
};

async function fetchSample(url: string, t0: number): Promise<Sample> {
  const startedAt = performance.now();
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(url, { signal: ctrl.signal, headers: { "user-agent": "measure-reload-502" } });
    clearTimeout(to);
    // 본문 소비해서 keep-alive 정상화
    await res.text().catch(() => undefined);
    return {
      tMs: Math.round(performance.now() - t0),
      status: res.status,
      durationMs: Math.round(performance.now() - startedAt),
    };
  } catch (e: any) {
    return {
      tMs: Math.round(performance.now() - t0),
      status: 0,
      durationMs: Math.round(performance.now() - startedAt),
      err: e?.message ?? String(e),
    };
  }
}

async function runWorker(
  url: string,
  intervalMs: number,
  endsAtMs: number,
  t0: number,
  out: Sample[],
  abortRef: { aborted: boolean },
): Promise<void> {
  // jitter 로 worker 간 요청 시점을 분산 (정확한 RPS 가깝게)
  await new Promise((r) => setTimeout(r, Math.random() * intervalMs));
  while (!abortRef.aborted && performance.now() - t0 < endsAtMs) {
    const reqStart = performance.now();
    const s = await fetchSample(url, t0);
    out.push(s);
    const elapsed = performance.now() - reqStart;
    const wait = Math.max(0, intervalMs - elapsed);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }
}

function triggerPm2Reload(app: string): { ok: boolean; reloadAtMs: number; output: string } {
  const ts = performance.now();
  const r = spawnSync("pm2", ["reload", app, "--update-env"], { encoding: "utf8" });
  return {
    ok: r.status === 0,
    reloadAtMs: ts,
    output: (r.stdout ?? "") + (r.stderr ?? ""),
  };
}

function summarize(samples: Sample[]): {
  total: number;
  byStatus: Record<string, number>;
  errors: number;
  windowMsByStatus: Record<string, number>;
  firstSampleByStatus: Record<string, Sample | null>;
  lastSampleByStatus: Record<string, Sample | null>;
} {
  const byStatus: Record<string, number> = {};
  const firstSampleByStatus: Record<string, Sample | null> = {};
  const lastSampleByStatus: Record<string, Sample | null> = {};
  let errors = 0;

  for (const s of samples) {
    const k = s.status === 0 ? `err` : String(s.status);
    byStatus[k] = (byStatus[k] ?? 0) + 1;
    if (!firstSampleByStatus[k]) firstSampleByStatus[k] = s;
    lastSampleByStatus[k] = s;
    if (s.status === 0) errors++;
  }

  const windowMsByStatus: Record<string, number> = {};
  for (const k of Object.keys(byStatus)) {
    const f = firstSampleByStatus[k];
    const l = lastSampleByStatus[k];
    windowMsByStatus[k] = f && l ? Math.max(0, l.tMs - f.tMs) : 0;
  }

  return {
    total: samples.length,
    byStatus,
    errors,
    windowMsByStatus,
    firstSampleByStatus,
    lastSampleByStatus,
  };
}

function fmt(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const intervalMs = Math.round((1000 * args.workers) / args.rps);
  const totalMs = args.beforeMs + args.afterMs;

  if (!args.silent) {
    console.log("════════════════════════════════════════════════════════════════");
    console.log("  Reload 502 측정 (Plan D 검증)");
    console.log("════════════════════════════════════════════════════════════════");
    console.log(`URL          : ${args.url}`);
    console.log(`PM2 app      : ${args.pm2App}`);
    console.log(`Target RPS   : ${args.rps} (workers=${args.workers}, interval=${intervalMs}ms)`);
    console.log(`Timeline     : baseline ${fmt(args.beforeMs)} → reload → after ${fmt(args.afterMs)}`);
    console.log(`reload       : ${args.reloadEnabled ? "ENABLED" : "DISABLED (baseline only)"}`);
    console.log(`임계치       : 502 윈도우 ≤ ${fmt(args.max502WindowMs)}, 502 카운트 ≤ ${args.max502Count}, non-200 ≤ ${args.maxNon200Pct}%`);
    console.log("");
  }

  const samples: Sample[] = [];
  const abortRef = { aborted: false };
  const t0 = performance.now();

  // SIGINT 시 워커 정리
  process.on("SIGINT", () => {
    if (!args.silent) console.log("\n[abort] SIGINT — 워커 정리");
    abortRef.aborted = true;
  });

  // 워커 시작
  const workerPromises: Promise<void>[] = [];
  for (let i = 0; i < args.workers; i++) {
    workerPromises.push(runWorker(args.url, intervalMs, totalMs, t0, samples, abortRef));
  }

  // baseline 대기
  await new Promise((r) => setTimeout(r, args.beforeMs));
  if (!args.silent) {
    const baseSamples = samples.filter((s) => s.tMs < args.beforeMs);
    console.log(`[baseline] ${baseSamples.length} samples in ${fmt(args.beforeMs)} (≈${Math.round((baseSamples.length * 1000) / args.beforeMs)} RPS)`);
  }

  // reload 트리거
  let reloadResult: { ok: boolean; reloadAtMs: number; output: string } | null = null;
  let reloadTriggeredAtMs: number | null = null;
  if (args.reloadEnabled) {
    if (!args.silent) console.log(`[reload] pm2 reload ${args.pm2App} ...`);
    reloadResult = triggerPm2Reload(args.pm2App);
    reloadTriggeredAtMs = Math.round(reloadResult.reloadAtMs - t0);
    if (!args.silent) {
      console.log(`[reload] triggered at t=${reloadTriggeredAtMs}ms (exit=${reloadResult.ok ? 0 : "non-zero"})`);
    }
  }

  // after 대기
  await new Promise((r) => setTimeout(r, args.afterMs));
  abortRef.aborted = true;
  await Promise.all(workerPromises);

  // 분석
  const sum = summarize(samples);

  // 502/504 윈도우 (reload 후)
  const after = reloadTriggeredAtMs !== null ? samples.filter((s) => s.tMs >= reloadTriggeredAtMs!) : samples;
  const bad = after.filter((s) => s.status === 502 || s.status === 504);
  const badWindow = bad.length > 0 ? bad[bad.length - 1].tMs - bad[0].tMs : 0;

  const non200Total = samples.filter((s) => s.status !== 200).length;
  const non200Pct = (non200Total / Math.max(1, samples.length)) * 100;

  // 결과 출력
  if (!args.silent) {
    console.log("");
    console.log("─── 결과 ────────────────────────────────────────────────────────");
    console.log(`총 요청      : ${sum.total}`);
    console.log(`상태분포     : ${JSON.stringify(sum.byStatus)}`);
    console.log(`502 카운트   : ${sum.byStatus["502"] ?? 0}`);
    console.log(`504 카운트   : ${sum.byStatus["504"] ?? 0}`);
    console.log(`네트워크 err : ${sum.errors}`);
    console.log(`502 윈도우   : ${fmt(badWindow)} (reload 이후 첫~마지막 502/504 간격)`);
    console.log(`non-200 비율 : ${non200Pct.toFixed(2)}%`);
    if (reloadTriggeredAtMs !== null) {
      // 신 인스턴스 첫 200 응답까지의 latency (reload 트리거 ~ 첫 200)
      const firstOkAfter = after.find((s) => s.status === 200);
      if (firstOkAfter) {
        console.log(`reload 후 첫 200 : t=${firstOkAfter.tMs}ms (Δ${firstOkAfter.tMs - reloadTriggeredAtMs}ms)`);
      }
    }
    console.log("");
  }

  // JSON 누적
  fs.mkdirSync(args.outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = path.join(args.outDir, `${stamp}.json`);
  const record = {
    ts: new Date().toISOString(),
    args,
    reload: reloadResult ? { ok: reloadResult.ok, output: reloadResult.output.trim() } : null,
    summary: sum,
    badWindowMs: badWindow,
    non200Pct,
    samples: samples.length <= 5000 ? samples : samples.filter((_, i) => i % Math.ceil(samples.length / 5000) === 0),
  };
  fs.writeFileSync(outPath, JSON.stringify(record, null, 2));
  if (!args.silent) console.log(`[out] ${outPath}`);

  // 임계치 검사
  const violations: string[] = [];
  if (args.reloadEnabled) {
    const cnt502 = (sum.byStatus["502"] ?? 0) + (sum.byStatus["504"] ?? 0);
    if (badWindow > args.max502WindowMs) violations.push(`502 윈도우 ${fmt(badWindow)} > 임계치 ${fmt(args.max502WindowMs)}`);
    if (cnt502 > args.max502Count) violations.push(`502/504 카운트 ${cnt502} > 임계치 ${args.max502Count}`);
    if (non200Pct > args.maxNon200Pct) violations.push(`non-200 비율 ${non200Pct.toFixed(2)}% > 임계치 ${args.maxNon200Pct}%`);
  }

  if (violations.length > 0) {
    console.error("");
    console.error("❌ 회귀 — 임계치 초과:");
    for (const v of violations) console.error(`  · ${v}`);
    console.error("");
    console.error("PR #183 (Plan D) graceful reload 효과가 약화된 것으로 의심됨.");
    console.error("점검: scripts/verify-graceful-reload.ts 실행 + dist 빌드 시점 + ecosystem.config.cjs.");
    process.exit(1);
  }

  if (!args.silent) console.log("✅ 임계치 이내 — Plan D graceful reload 정상 동작.");
}

main().catch((e) => {
  console.error("[fatal]", e);
  process.exit(2);
});

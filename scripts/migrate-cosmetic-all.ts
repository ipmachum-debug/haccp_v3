/**
 * 마이그레이션 일괄 실행: 화장품 GMP Phase 2 + IoT-CCP + CAR
 *
 * Phase 2 lifecycle 9단계 (#145~#158) + IoT 폐쇄 루프 + CAR UNIQUE 인덱스
 * 를 한 번에 적용. 각 스크립트는 idempotent (CREATE TABLE IF NOT EXISTS) 구조
 * 라 반복 실행해도 안전.
 *
 * 실행:
 *   npx tsx scripts/migrate-cosmetic-all.ts
 *
 * 옵션:
 *   --dry-run        : 실행 순서만 출력, 실제 실행 없음
 *   --only=NAME[,..] : 특정 스크립트만 실행 (basename match)
 *   --skip=NAME[,..] : 특정 스크립트만 제외
 *
 * 환경 변수 (자동 감지):
 *   DATABASE_URL                       — Drizzle / 운영 표준 (mysql://user:pass@host:port/db)
 *   DB_HOST / DB_USER / DB_PASSWORD / DB_NAME / DB_PORT — 개별 변수 (자식 스크립트 호환)
 *
 *   본 runner 는 DATABASE_URL 만 설정된 환경 (운영 .env) 에서도 자동 동작:
 *   - DATABASE_URL 파싱 → DB_* 개별 변수로 자식 spawn env 에 주입
 *   - 이미 DB_* 가 설정된 경우 그대로 사용 (override 안 함)
 *
 * 안전:
 *   - 각 단계 실패 시 후속 단계 중단 (--continue-on-error 미지원, 의도적)
 *   - DB 변경은 각 스크립트 내부에서 처리 (이 runner 는 스폰만)
 *   - 실행 시간 / exit code / stderr 요약 출력
 *
 * Genspark 운영 (서버에서 한 번에 활성화 시):
 *   1. 본 스크립트 실행 → 9개 마이그레이션 순차 적용
 *   2. PM2 reload (서버 코드는 이미 main 머지 완료)
 *   3. 사이드바 "GMP 운영 현황" 진입 시 빈 카운트 0 정상 응답 확인
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ESM 호환: package.json 의 "type": "module" 환경에서 __dirname 미정의.
// import.meta.url → 파일 경로 → 디렉토리 경로 변환.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type MigrationStep = {
  name: string;
  script: string;
  description: string;
};

const STEPS: MigrationStep[] = [
  // IoT / CCP 인프라
  {
    name: "iot-ccp-bridge",
    script: "scripts/migrate-iot-ccp-bridge.ts",
    description: "IoT-CCP 매핑 테이블 (h_iot_ccp_bridge)",
  },
  {
    name: "car-unique-index",
    script: "scripts/migrate-car-unique-index.ts",
    description: "CAR (시정조치) UNIQUE 인덱스 강화",
  },
  // 화장품 GMP Phase 2 — lifecycle 순서대로
  {
    name: "cosmetic-bmr",
    script: "scripts/migrate-cosmetic-bmr-table.ts",
    description: "Cosmetic BMR (제조기록서) — Phase 2-1",
  },
  {
    name: "cosmetic-bmr-ipc",
    script: "scripts/migrate-cosmetic-bmr-ipc-table.ts",
    description: "Cosmetic BMR IPC (공정중관리) — Phase 2-3",
  },
  {
    name: "cosmetic-formula",
    script: "scripts/migrate-cosmetic-formula-tables.ts",
    description: "Cosmetic Formula (배합표) — Phase 2-4a",
  },
  {
    name: "cosmetic-bmr-ingredient",
    script: "scripts/migrate-cosmetic-bmr-ingredient-table.ts",
    description: "Cosmetic BMR 원료투입 — Phase 2-4b",
  },
  {
    name: "cosmetic-label",
    script: "scripts/migrate-cosmetic-label-table.ts",
    description: "Cosmetic Label / INCI / 알러지 — Phase 2-5",
  },
  {
    name: "cosmetic-release",
    script: "scripts/migrate-cosmetic-release-table.ts",
    description: "Cosmetic Release (QA 출고) — Phase 2-6",
  },
  {
    name: "cosmetic-stability",
    script: "scripts/migrate-cosmetic-stability-tables.ts",
    description: "Cosmetic Stability (ICH Q1A 안정성) — Phase 2-8",
  },
];

function parseArgs(argv: string[]) {
  let dryRun = false;
  let only: string[] | null = null;
  let skip: string[] = [];
  for (const arg of argv) {
    if (arg === "--dry-run") dryRun = true;
    else if (arg.startsWith("--only=")) {
      only = arg
        .slice("--only=".length)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (arg.startsWith("--skip=")) {
      skip = arg
        .slice("--skip=".length)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return { dryRun, only, skip };
}

function pickSteps(only: string[] | null, skip: string[]): MigrationStep[] {
  let steps = STEPS.slice();
  if (only && only.length > 0) {
    steps = steps.filter((s) => only.includes(s.name));
  }
  if (skip.length > 0) {
    steps = steps.filter((s) => !skip.includes(s.name));
  }
  return steps;
}

/**
 * DATABASE_URL → DB_HOST / DB_USER / DB_PASSWORD / DB_NAME / DB_PORT 변환.
 *
 * 자식 마이그레이션 스크립트들이 process.env.DB_HOST 등 개별 변수를 읽기 때문에,
 * 운영 환경 (.env 에 DATABASE_URL 만 존재) 에서도 자동 동작하도록 변환.
 *
 * 이미 DB_* 가 설정된 경우 override 하지 않음 (사용자 명시 우선).
 *
 * @returns 자식 spawn 에 주입할 추가 env (DB_*). 변환 불필요 시 빈 객체.
 */
function deriveDbEnvFromDatabaseUrl(env: NodeJS.ProcessEnv): Record<string, string> {
  const url = env.DATABASE_URL?.trim();
  if (!url) return {};

  // 이미 모든 DB_* 가 설정되어 있으면 변환 생략 (사용자 명시 우선)
  const allSet =
    env.DB_HOST && env.DB_USER && env.DB_PASSWORD !== undefined && env.DB_NAME;
  if (allSet) return {};

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    console.warn(
      `[runner] DATABASE_URL 파싱 실패 (형식 확인 필요): ${url.replace(/:[^:@]*@/, ":***@")}`,
    );
    return {};
  }

  const out: Record<string, string> = {};
  if (!env.DB_HOST && parsed.hostname) out.DB_HOST = parsed.hostname;
  if (!env.DB_PORT && parsed.port) out.DB_PORT = parsed.port;
  if (!env.DB_USER && parsed.username) out.DB_USER = decodeURIComponent(parsed.username);
  if (env.DB_PASSWORD === undefined && parsed.password)
    out.DB_PASSWORD = decodeURIComponent(parsed.password);
  if (!env.DB_NAME && parsed.pathname) {
    const dbName = parsed.pathname.replace(/^\//, "").split("?")[0];
    if (dbName) out.DB_NAME = dbName;
  }

  if (Object.keys(out).length > 0) {
    const masked = { ...out };
    if (masked.DB_PASSWORD) masked.DB_PASSWORD = "***";
    console.log(
      `[runner] DATABASE_URL → DB_* 자동 변환:`,
      Object.entries(masked)
        .map(([k, v]) => `${k}=${v}`)
        .join(" "),
    );
  }
  return out;
}

async function main() {
  const { dryRun, only, skip } = parseArgs(process.argv.slice(2));
  const steps = pickSteps(only, skip);

  console.log("════════════════════════════════════════════════════════════════");
  console.log("   화장품 GMP Phase 2 + IoT/CAR 마이그레이션 일괄 실행");
  console.log("════════════════════════════════════════════════════════════════");
  console.log(`총 단계: ${steps.length} / ${STEPS.length}`);
  if (dryRun) console.log("모드: DRY-RUN (실제 실행 없음)");
  console.log("");

  // DATABASE_URL → DB_* 변환 (자식 스크립트 호환)
  const derivedDbEnv = deriveDbEnvFromDatabaseUrl(process.env);
  const childEnv: NodeJS.ProcessEnv = { ...process.env, ...derivedDbEnv };

  const results: Array<{
    name: string;
    ok: boolean;
    durationMs: number;
    skipped?: boolean;
  }> = [];

  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    const idx = `[${i + 1}/${steps.length}]`;
    console.log(`────────────────────────────────────────────────────────────────`);
    console.log(`${idx} ${step.name} — ${step.description}`);
    console.log(`        스크립트: ${step.script}`);

    if (dryRun) {
      console.log("        (dry-run, 실행 생략)");
      results.push({ name: step.name, ok: true, durationMs: 0, skipped: true });
      continue;
    }

    const t0 = Date.now();
    const result = spawnSync("npx", ["tsx", step.script], {
      stdio: "inherit",
      cwd: path.resolve(__dirname, ".."),
      env: childEnv,
    });
    const durationMs = Date.now() - t0;
    const ok = result.status === 0;
    results.push({ name: step.name, ok, durationMs });

    if (!ok) {
      console.error("");
      console.error(`❌ 단계 실패: ${step.name} (exit=${result.status})`);
      console.error("   후속 단계 중단. 원인 해결 후 재실행 (idempotent 안전).");
      break;
    }
  }

  console.log("");
  console.log("════════════════════════════════════════════════════════════════");
  console.log("   실행 결과 요약");
  console.log("════════════════════════════════════════════════════════════════");
  for (const r of results) {
    const icon = r.skipped ? "⏭️ " : r.ok ? "✅" : "❌";
    const ms = r.skipped ? "-" : `${r.durationMs}ms`;
    console.log(`  ${icon} ${r.name.padEnd(30)} ${ms}`);
  }
  const failed = results.filter((r) => !r.ok && !r.skipped).length;
  console.log("");
  if (failed > 0) {
    console.error(`총 ${failed}건 실패. exit 1.`);
    process.exit(1);
  }
  console.log(`총 ${results.length}건 완료 (실패 0).`);
  console.log("");
  console.log("다음 단계:");
  console.log("  1. PM2 reload (서버 코드는 main 이미 머지)");
  console.log("  2. /dashboard/cosmetic/dashboard 진입 → 빈 카운트 0 정상 응답 확인");
  console.log("  3. (옵션) F-3 IoT 파일럿 활성화 — ENABLE_CCP_* env 9개 + reload");
}

main().catch((err) => {
  console.error("치명 오류:", err);
  process.exit(1);
});

/**
 * Tool 11: 마이그레이션 저널 무결성 lint (Issue #421 3단계 — 정적 검사)
 * ==============================================================================
 * 목적:
 *   `drizzle-kit migrate` 가 신규 환경에서 **실행 자체가 가능한지** 를 DB 없이 검사한다.
 *
 * 배경:
 *   Issue #421 은 "283개 중 271개 테이블에 CREATE TABLE 이력이 없다"를 다뤘다.
 *   그 원인을 저널 수준에서 보면 더 앞단에서 이미 깨져 있다:
 *
 *     - `drizzle/meta/_journal.json` 이 참조하는 tag 파일 26개가 저장소에 없다.
 *       (0001_calm_sway … 0026_dashing_bloodstorm → 전부 0001_placeholder.sql 등으로 대체됨)
 *       drizzle-kit 은 저널 순서대로 파일을 읽으므로 **첫 미존재 tag 에서 즉시 중단**된다.
 *     - 반대로 저널에 없는 .sql 이 5개 있다 (0047~0050 등). 이들은 **영원히 적용되지 않는다.**
 *
 *   즉 빈 DB 에 마이그레이션을 돌리면 스키마가 재현되지 않는 정도가 아니라
 *   러너가 시작하자마자 죽거나, 조용히 일부를 건너뛴다.
 *
 * 검사 항목:
 *   [A] 저널 tag → 대응 .sql 파일 없음   → migrate 중단 (치명)
 *   [B] .sql 파일 → 저널에 없음          → 영원히 미적용 (조용한 누락)
 *   [C] 저널 idx 중복 / 불연속           → 적용 순서 불확정
 *
 * 정책:
 *   기존 항목은 baseline JSON 으로 통과시키고, **신규 항목만** 실패시킨다.
 *   (부채를 지금 다 갚는 lint 가 아니라, 더 쌓이는 것을 막는 lint 다.)
 *
 * 사용법:
 *   npx tsx scripts/_lint/verify-migration-journal.ts
 *   npx tsx scripts/_lint/verify-migration-journal.ts --update-baseline
 *
 * 종료 코드:
 *   0 = 통과 (baseline 외 신규 0건)
 *   1 = 신규 무결성 위반
 *   2 = 스크립트 오류 (저널 없음/파싱 실패 등)
 * ==============================================================================
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";

const MIGRATION_DIR = "drizzle";
const JOURNAL_PATH = "drizzle/meta/_journal.json";
const BASELINE_PATH = "scripts/_lint/migration-journal-baseline.json";

/** 저널에 없어도 문제 삼지 않는 파일 — 명시적으로 폐기 표시된 것만 */
const IGNORED_SQL = new Set<string>(["_orphaned_0040_document_approval.sql"]);

interface JournalEntry {
  idx: number;
  tag: string;
  when?: number;
}

interface Baseline {
  generatedAt: string;
  /** [A] 저널이 참조하지만 파일이 없는 tag */
  missingFiles: string[];
  /** [B] 저장소에 있으나 저널이 모르는 .sql */
  orphanFiles: string[];
}

function fail(msg: string): never {
  console.error(`❌ ${msg}`);
  process.exit(2);
}

function readJournal(): JournalEntry[] {
  if (!existsSync(JOURNAL_PATH)) fail(`${JOURNAL_PATH} 없음`);
  let raw: any;
  try {
    raw = JSON.parse(readFileSync(JOURNAL_PATH, "utf8"));
  } catch (e: any) {
    fail(`${JOURNAL_PATH} 파싱 실패: ${e?.message ?? e}`);
  }
  const entries = raw?.entries;
  if (!Array.isArray(entries)) fail(`${JOURNAL_PATH} 에 entries 배열이 없음`);
  return entries.map((e: any) => ({
    idx: Number(e.idx),
    tag: String(e.tag ?? ""),
    when: e.when != null ? Number(e.when) : undefined,
  }));
}

function main() {
  const updateBaseline = process.argv.includes("--update-baseline");

  const entries = readJournal();
  if (!existsSync(MIGRATION_DIR)) fail(`${MIGRATION_DIR} 없음`);
  const sqlFiles = readdirSync(MIGRATION_DIR).filter((f) => f.endsWith(".sql"));
  const sqlSet = new Set(sqlFiles);

  console.log("=== 마이그레이션 저널 무결성 (Issue #421 3단계) ===\n");
  console.log(`저널 엔트리 : ${entries.length}`);
  console.log(`SQL 파일    : ${sqlFiles.length}\n`);

  // ── [A] 저널 tag → 파일 없음 (migrate 가 여기서 죽는다) ──
  const missingFiles = entries
    .filter((e) => !sqlSet.has(`${e.tag}.sql`))
    .map((e) => e.tag)
    .sort();

  // ── [B] 파일 → 저널에 없음 (영원히 미적용) ──
  const journalFiles = new Set(entries.map((e) => `${e.tag}.sql`));
  const orphanFiles = sqlFiles
    .filter((f) => !journalFiles.has(f) && !IGNORED_SQL.has(f))
    .sort();

  // ── [C] idx 중복 / 불연속 (baseline 없이 항상 실패 — 구조적 오류) ──
  const idxSeen = new Map<number, string[]>();
  for (const e of entries) {
    if (!idxSeen.has(e.idx)) idxSeen.set(e.idx, []);
    idxSeen.get(e.idx)!.push(e.tag);
  }
  const duplicatedIdx = [...idxSeen.entries()].filter(([, tags]) => tags.length > 1);
  const sortedIdx = [...idxSeen.keys()].sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 0; i < sortedIdx.length; i++) {
    if (sortedIdx[i] !== i) { gaps.push(sortedIdx[i]); break; }
  }

  // 첫 중단 지점 — 실무적으로 가장 중요한 숫자
  const firstBreak = entries.find((e) => !sqlSet.has(`${e.tag}.sql`));

  console.log(`[A] 저널 tag 인데 파일 없음 : ${missingFiles.length}건`);
  if (firstBreak) {
    console.log(`    → drizzle-kit migrate 는 idx=${firstBreak.idx} (${firstBreak.tag}) 에서 중단된다.`);
    console.log(`      전체 ${entries.length}개 중 ${firstBreak.idx}개만 적용 가능.`);
  }
  console.log(`[B] 저널에 없는 .sql        : ${orphanFiles.length}건 (적용되지 않음)`);
  console.log(`[C] idx 중복                : ${duplicatedIdx.length}건 / 불연속: ${gaps.length ? `idx ${gaps[0]}` : "없음"}\n`);

  if (updateBaseline) {
    const next: Baseline = {
      generatedAt: new Date().toISOString().slice(0, 10),
      missingFiles,
      orphanFiles,
    };
    writeFileSync(BASELINE_PATH, JSON.stringify(next, null, 2) + "\n");
    console.log(`✅ baseline 갱신: ${BASELINE_PATH}`);
    console.log(`   missingFiles ${missingFiles.length} / orphanFiles ${orphanFiles.length}`);
    return;
  }

  if (!existsSync(BASELINE_PATH)) {
    console.error(`❌ baseline 파일 없음: ${BASELINE_PATH}`);
    console.error(`   최초 1회: npx tsx ${process.argv[1]} --update-baseline`);
    process.exit(2);
  }

  const baseline: Baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
  const baseMissing = new Set(baseline.missingFiles ?? []);
  const baseOrphan = new Set(baseline.orphanFiles ?? []);

  const newMissing = missingFiles.filter((t) => !baseMissing.has(t));
  const newOrphan = orphanFiles.filter((f) => !baseOrphan.has(f));

  const fixedMissing = (baseline.missingFiles ?? []).filter((t) => !missingFiles.includes(t));
  const fixedOrphan = (baseline.orphanFiles ?? []).filter((f) => !orphanFiles.includes(f));

  console.log(`baseline (${baseline.generatedAt}): missing ${baseMissing.size} / orphan ${baseOrphan.size}`);
  if (fixedMissing.length || fixedOrphan.length) {
    console.log(`🎉 개선: missing ${fixedMissing.length}건, orphan ${fixedOrphan.length}건 해소`);
    console.log(`   (baseline 갱신 권장: --update-baseline)`);
  }
  console.log();

  const problems: string[] = [];
  if (newMissing.length) {
    problems.push(`저널이 참조하지만 파일이 없는 신규 tag ${newMissing.length}건:\n` +
      newMissing.map((t) => `  - ${t}.sql`).join("\n"));
  }
  if (newOrphan.length) {
    problems.push(`저널에 등록되지 않은 신규 .sql ${newOrphan.length}건 (적용되지 않음):\n` +
      newOrphan.map((f) => `  - ${f}`).join("\n"));
  }
  if (duplicatedIdx.length) {
    problems.push(`저널 idx 중복 ${duplicatedIdx.length}건:\n` +
      duplicatedIdx.map(([i, tags]) => `  - idx ${i}: ${tags.join(", ")}`).join("\n"));
  }
  if (gaps.length) {
    problems.push(`저널 idx 불연속: idx ${gaps[0]} 앞이 비어 있음 (0부터 연속이어야 함)`);
  }

  if (problems.length === 0) {
    console.log("✅ 통과: baseline 외 신규 무결성 위반 0건");
    console.log("\n스캔: drizzle/meta/_journal.json + drizzle/*.sql");
    return;
  }

  console.error("❌ 실패: 마이그레이션 저널 무결성 위반\n");
  for (const p of problems) console.error(p + "\n");
  console.error("해결 방법:");
  console.error("  - 새 마이그레이션은 drizzle-kit generate 로 만들어 저널과 파일이 함께 생기게 하십시오.");
  console.error("  - 손으로 .sql 을 추가했다면 _journal.json 에도 엔트리를 넣어야 적용됩니다.");
  console.error("  - 파일을 지웠다면 저널 엔트리도 함께 지워야 migrate 가 중단되지 않습니다.");
  console.error("  (의도된 예외라면 --update-baseline 로 baseline 에 등록)");
  process.exit(1);
}

main();

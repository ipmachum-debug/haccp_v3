// Silent Catch 린터
//
// 서버 코드에서 에러를 조용히 삼키는(silent catch) 패턴을 탐지하여 리포트합니다.
// 이런 패턴들은 프로덕션에서 root cause 를 찾기 어렵게 만듭니다.
//
// 실행: npx tsx scripts/lint-silent-catch.ts
// CI 모드: npx tsx scripts/lint-silent-catch.ts --strict  (발견 시 exit 1)
//
// 탐지 패턴:
//   1. catch {}                        — 완전 빈 catch
//   2. catch (_e) {}                   — 명시적 무시
//   3. catch with only a block comment — 주석만 있는 catch
//   4. .catch(() => {})                — promise silent catch
//   5. .catch(() => null)              — null 반환 silent catch
//
// 제외 패턴:
//   - console.warn / console.error / logger 호출이 있는 catch 는 허용
//   - 파일명에 __tests__, test, spec 포함된 것은 제외

import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(process.cwd(), "server");
const STRICT = process.argv.includes("--strict");

interface Finding {
  file: string;
  line: number;
  snippet: string;
  pattern: string;
}

/** 디렉토리 재귀 순회 */
function* walk(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      if (entry.name === "__tests__") continue;
      yield* walk(full);
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
      if (/\.(test|spec)\.ts$/.test(entry.name)) continue;
      yield full;
    }
  }
}

const findings: Finding[] = [];

function checkFile(filePath: string) {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split(/\r?\n/);
  const relPath = path.relative(process.cwd(), filePath);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // 패턴 1: 완전 빈 catch (같은 줄)
    if (/catch\s*(\(\s*[_a-zA-Z0-9]*\s*(?::\s*\w+)?\s*\))?\s*\{\s*\}/.test(line)) {
      findings.push({ file: relPath, line: i + 1, snippet: trimmed, pattern: "empty-catch" });
      continue;
    }

    // 패턴 2: 주석만 있는 catch (같은 줄)
    if (/catch\s*(\(\s*[_a-zA-Z0-9]*\s*\))?\s*\{\s*\/\*[^*]*\*\/\s*\}/.test(line)) {
      findings.push({ file: relPath, line: i + 1, snippet: trimmed, pattern: "comment-only-catch" });
      continue;
    }

    // 패턴 3: .catch(() => {}) / .catch(() => null)
    if (/\.catch\s*\(\s*\(\s*\)\s*=>\s*(\{\s*\}|null|undefined)\s*\)/.test(line)) {
      findings.push({ file: relPath, line: i + 1, snippet: trimmed, pattern: "promise-silent-catch" });
      continue;
    }
    if (/\.catch\s*\(\s*\(\s*[_a-zA-Z0-9]+\s*\)\s*=>\s*(\{\s*\}|null|undefined)\s*\)/.test(line)) {
      findings.push({ file: relPath, line: i + 1, snippet: trimmed, pattern: "promise-silent-catch-arg" });
      continue;
    }

    // 패턴 4: catch { 다음 줄이 바로 } (여러 줄 빈 catch)
    const catchOpenMatch = /catch\s*(\(\s*[_a-zA-Z0-9]*\s*(?::\s*\w+)?\s*\))?\s*\{\s*$/.exec(line);
    if (catchOpenMatch) {
      // 다음 비어있지 않은 줄을 찾아서 } 인지 확인
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === "") j++;
      if (j < lines.length && lines[j].trim() === "}") {
        findings.push({
          file: relPath,
          line: i + 1,
          snippet: `${trimmed} ... ${lines[j].trim()}`,
          pattern: "multi-line-empty-catch",
        });
      }
    }
  }
}

// 실행
console.log(`[lint-silent-catch] Scanning ${ROOT} ...`);
for (const file of walk(ROOT)) {
  checkFile(file);
}

// 결과 출력
console.log(`\n[lint-silent-catch] ${findings.length}개 silent catch 패턴 발견:\n`);

const byPattern = findings.reduce((acc, f) => {
  acc[f.pattern] = (acc[f.pattern] || 0) + 1;
  return acc;
}, {} as Record<string, number>);

console.log("📊 패턴별 집계:");
for (const [pattern, count] of Object.entries(byPattern).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${pattern.padEnd(30)} ${count}건`);
}

if (findings.length > 0) {
  console.log("\n📋 상세 (첫 50건):");
  findings.slice(0, 50).forEach((f) => {
    console.log(`  ${f.file}:${f.line}`);
    console.log(`    [${f.pattern}] ${f.snippet.substring(0, 120)}`);
  });
  if (findings.length > 50) {
    console.log(`\n  ... 외 ${findings.length - 50}건`);
  }

  console.log("\n💡 수정 가이드:");
  console.log("  - empty-catch / comment-only-catch → catch (e) { console.warn(\"[...]\", e); }");
  console.log("  - promise-silent-catch → .catch((e) => console.warn(\"[...]\", e))");
  console.log("  - 의도적으로 무시해야 하면 catch 블록 안에 \"// intentionally-ignored: reason\" 주석 추가");
}

if (STRICT && findings.length > 0) {
  console.error(`\n❌ --strict 모드: silent catch ${findings.length}건 발견 → exit 1`);
  process.exit(1);
} else {
  console.log(`\n✅ Lint 완료`);
}

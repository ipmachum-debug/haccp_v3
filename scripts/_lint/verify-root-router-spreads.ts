/**
 * Tool 6: _root.ts spread 키 중복 검출 lint
 *
 * 목적: Y-3 Training / Y-4 Calibration 머지 후 발생한 *.list 404 회귀의
 *       근본 원인(레거시 RouterMap 이 coreMesRouterMap 키를 덮어씀)을
 *       다음 PR 단계에서 사전 차단.
 *
 * 검증 방식:
 *   1. server/routers/_root.ts 에서 `...XxxRouterMap` spread 라인을 추출.
 *   2. server/routers/_maps/<map>.ts 각 파일에서 export 된 키 목록 수집.
 *   3. spread 순서대로 키 등록 시뮬레이션 (JS object spread = 나중 키 우선).
 *   4. 동일 키가 2개 이상 spread 에 존재하고, 마지막에 나타나는 spread 가
 *      "권위 있는" spread 가 되도록 ALLOWED_AUTHORITY 정책 적용.
 *
 * 정책 (Y-2 ~ Y-4 운영 결정):
 *   - coreMesRouterMap 은 항상 spread 순서의 마지막 권위.
 *   - 신규 cross-cutting entity (training/calibration/supplier ...) 키가
 *     레거시 (checklistMap/systemMap/masterMap) 키와 충돌하면
 *     coreMes 가 마지막에 spread 되어 우선해야 함.
 *
 * 종료 코드:
 *   0 = 통과
 *   1 = 정책 위반 (coreMesRouterMap 이 마지막이 아니거나 미충돌 신규 중복 발견)
 */

import * as fs from "fs";
import * as path from "path";

const REPO_ROOT = process.cwd();
const ROOT_FILE = path.join(REPO_ROOT, "server/routers/_root.ts");
const MAPS_DIR = path.join(REPO_ROOT, "server/routers/_maps");

interface SpreadInfo {
  line: number;
  variableName: string;
  mapFile: string;
}

interface MapKeys {
  variableName: string;
  filePath: string;
  keys: string[];
}

function extractSpreads(rootContent: string): SpreadInfo[] {
  const lines = rootContent.split("\n");
  const spreads: SpreadInfo[] = [];
  const re = /^\s+\.\.\.(\w+RouterMap)\s*,/;
  lines.forEach((ln, idx) => {
    const m = ln.match(re);
    if (m) {
      const varName = m[1];
      const mapFileGuess = varName.replace(/RouterMap$/, "Map") + ".ts";
      spreads.push({
        line: idx + 1,
        variableName: varName,
        mapFile: mapFileGuess,
      });
    }
  });
  return spreads;
}

function extractMapKeys(filePath: string, expectedExport: string): string[] {
  if (!fs.existsSync(filePath)) {
    console.warn(`  ⚠️  파일 없음: ${filePath}`);
    return [];
  }
  const content = fs.readFileSync(filePath, "utf-8");

  // export const <name> = { ... } as const  형태에서 객체 본문 추출
  const exportRe = new RegExp(
    `export\\s+const\\s+${expectedExport}\\s*=\\s*\\{([\\s\\S]*?)\\}\\s*as\\s+const\\s*;`,
    "m"
  );
  const m = content.match(exportRe);
  if (!m) {
    // fallback: 단순 객체 export
    const fb = new RegExp(
      `export\\s+const\\s+${expectedExport}\\s*=\\s*\\{([\\s\\S]*?)^\\}\\s*;?`,
      "m"
    );
    const m2 = content.match(fb);
    if (!m2) {
      console.warn(`  ⚠️  ${expectedExport} export 객체 본문을 찾지 못함: ${filePath}`);
      return [];
    }
    return parseObjectKeys(m2[1]);
  }
  return parseObjectKeys(m[1]);
}

function parseObjectKeys(body: string): string[] {
  // "  key: someRouter," 또는 "  key: router({ ... })," 패턴
  const keys: string[] = [];
  const lines = body.split("\n");
  for (const ln of lines) {
    // 주석/빈 라인 제외
    if (/^\s*\/\//.test(ln) || /^\s*\*/.test(ln) || /^\s*$/.test(ln)) continue;
    const m = ln.match(/^\s+(\w+)\s*:/);
    if (m) keys.push(m[1]);
  }
  return keys;
}

function main(): number {
  console.log("=== Tool 6: _root.ts spread 키 중복 검출 ===");
  if (!fs.existsSync(ROOT_FILE)) {
    console.error(`❌ 파일 없음: ${ROOT_FILE}`);
    return 1;
  }
  const rootContent = fs.readFileSync(ROOT_FILE, "utf-8");
  const spreads = extractSpreads(rootContent);

  console.log(`\nspread 순서 (${spreads.length}개):`);
  spreads.forEach((s, i) => {
    console.log(`  ${i + 1}. line ${s.line}: ...${s.variableName}`);
  });

  // 각 spread 의 키 수집
  const mapKeysList: MapKeys[] = [];
  for (const s of spreads) {
    const filePath = path.join(MAPS_DIR, s.mapFile);
    const keys = extractMapKeys(filePath, s.variableName);
    mapKeysList.push({
      variableName: s.variableName,
      filePath,
      keys,
    });
  }

  console.log("\n각 RouterMap 키 개수:");
  mapKeysList.forEach((m) => {
    console.log(`  ${m.variableName}: ${m.keys.length}개`);
  });

  // 중복 키 탐지
  const keyOwners: Record<string, string[]> = {};
  mapKeysList.forEach((m) => {
    m.keys.forEach((k) => {
      if (!keyOwners[k]) keyOwners[k] = [];
      keyOwners[k].push(m.variableName);
    });
  });

  const duplicates = Object.entries(keyOwners).filter(([_, owners]) => owners.length > 1);
  console.log(`\n중복 키: ${duplicates.length}건`);

  // coreMesRouterMap 이 마지막 spread 인지 검증
  const lastSpread = spreads[spreads.length - 1];
  const coreMesIsLast = lastSpread && lastSpread.variableName === "coreMesRouterMap";
  console.log(`\ncoreMesRouterMap 이 마지막 spread? ${coreMesIsLast ? "✅ 예" : "❌ 아니요"}`);

  let violations = 0;

  if (!coreMesIsLast) {
    console.log(
      "\n❌ 정책 위반: coreMesRouterMap 이 spread 순서 마지막이 아님."
    );
    console.log(
      "   레거시 맵(checklist/system/master)이 coreMes 의 신규 entity 키를 덮어쓸 수 있음."
    );
    console.log(
      "   해결: server/routers/_root.ts 에서 ...coreMesRouterMap 을 마지막으로 이동."
    );
    violations++;
  }

  // 중복 키 분석 — coreMes 와 충돌하는 경우 권위 검증
  if (duplicates.length > 0) {
    console.log("\n중복 키 상세:");
    duplicates.forEach(([key, owners]) => {
      const ownerOrder = spreads
        .filter((s) => owners.includes(s.variableName))
        .map((s) => s.variableName);
      const winner = ownerOrder[ownerOrder.length - 1];
      const involvesCoreMes = owners.includes("coreMesRouterMap");
      let status = "";
      if (involvesCoreMes && winner === "coreMesRouterMap") {
        status = "✅ coreMes 가 권위 (정상)";
      } else if (involvesCoreMes) {
        status = `❌ ${winner} 가 coreMes 를 덮어씀 (404 회귀 위험)`;
        violations++;
      } else {
        status = `ℹ️  레거시 ↔ 레거시 (winner: ${winner})`;
      }
      console.log(
        `  - ${key}: [${owners.join(" → ")}] → winner: ${winner} ${status}`
      );
    });
  }

  if (violations === 0) {
    console.log(
      `\n✅ 통과: spread 순서 정책 준수 (coreMesRouterMap 마지막 권위 유지).`
    );
    return 0;
  } else {
    console.log(`\n❌ 실패: ${violations}건 정책 위반.`);
    return 1;
  }
}

const code = main();
process.exit(code);

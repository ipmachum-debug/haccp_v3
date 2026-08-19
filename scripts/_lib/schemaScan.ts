/**
 * 스키마 드리프트 조사용 순수 유틸 (Issue #421)
 * ==============================================================================
 * 부수효과가 없어야 테스트할 수 있으므로 엔트리포인트 스크립트와 분리한다.
 * ==============================================================================
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * 수동 백업 테이블 판별.
 * 스키마의 일부가 아니라 운영 중 떠둔 사본이므로 baseline 에서 제외한다.
 * (넣어두면 신규 환경이 남의 백업까지 만들게 된다.)
 *
 * 매칭:  _backup_x  _bak_x  x_backup  x_bak  x_backup_20260419  x_20260422
 * 비매칭: backup_policies  bank_accounts  (선행 언더스코어 없는 정상 테이블)
 */
export const BACKUP_TABLE_RE = /^_(backup|bak)_|_(backup|bak)(_\d+)?$|_\d{8}$/i;

/** 코드 참조 조사 대상 — 여기 없으면 "참조 0" 으로 나온다 */
export const CODE_DIRS = ["server", "shared", "client/src"];
const CODE_EXT = /\.(ts|tsx)$/;

function walk(dir: string, acc: string[]): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return acc; // 없는 디렉터리는 조용히 건너뛴다 (스캔은 부가 기능이다)
  }
  for (const e of entries) {
    if (e === "node_modules" || e === "dist" || e.startsWith(".")) continue;
    const p = join(dir, e);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(p, acc);
    else if (CODE_EXT.test(e)) acc.push(p);
  }
  return acc;
}

/**
 * 컬럼명이 코드에 몇 번 등장하는지 센다.
 *
 * ★ 근사치다. snake_case 이름이 우연히 다른 문맥에 등장할 수 있고,
 *   반대로 동적으로 조립된 SQL 은 잡히지 않는다.
 *   "먼저 볼 것" 을 위로 올리는 정렬용이지 판정이 아니다.
 */
export function countCodeReferences(names: string[], dirs: string[] = CODE_DIRS): Map<string, number> {
  const counts = new Map<string, number>(names.map((n) => [n, 0]));
  if (!names.length) return counts;

  const files: string[] = [];
  for (const d of dirs) walk(d, files);

  const patterns = names.map((n) => ({
    name: n,
    re: new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"),
  }));

  for (const f of files) {
    let text: string;
    try {
      text = readFileSync(f, "utf8");
    } catch {
      continue;
    }
    for (const { name, re } of patterns) {
      if (!text.includes(name)) continue; // 빠른 배제 후에만 정규식을 돌린다
      const m = text.match(re);
      if (m) counts.set(name, (counts.get(name) ?? 0) + m.length);
    }
  }
  return counts;
}

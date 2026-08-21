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

/**
 * 코드 참조 조사 대상.
 *
 * ★ drizzle/ 을 일부러 뺐다.
 *   스키마 정의는 "이 컬럼이 있다"고 주장하는 쪽이다. 그걸 참조로 세면
 *   모든 컬럼이 최소 1점을 받아 순환 논리가 된다. 우리가 알고 싶은 것은
 *   "정의 말고 **실제로 쓰는 코드**가 있는가" 이므로 애플리케이션 코드만 본다.
 */
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

/** snake_case → camelCase (drizzle 스키마는 TS 쪽에서 camelCase 를 쓴다) */
export function toCamel(snake: string): string {
  return snake.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

function wordRe(name: string): RegExp {
  return new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
}

/** snake / camel 두 표기를 모두 세어 합산 */
function countBothCases(text: string, snake: string): number {
  let n = 0;
  for (const variant of new Set([snake, toCamel(snake)])) {
    if (!text.includes(variant)) continue;
    n += text.match(wordRe(variant))?.length ?? 0;
  }
  return n;
}

export interface ColumnRefCount {
  /** 이 테이블을 언급하는 파일 안에서만 센 횟수 — 실질 신호 */
  scoped: number;
  /** 코드베이스 전체에서 컬럼명이 등장한 횟수 — 상한값 */
  global: number;
  /** 해당 테이블을 언급한 파일 수 */
  tableFiles: number;
}

/**
 * "table.column 이 실제로 쓰이는가" 를 근사한다.
 *
 * ★ 왜 테이블 스코프가 필요한가 (2026-08-21 수정)
 *   이전 구현은 컬럼명만 세어서, 서로 무관한 테이블의 동명 컬럼이 전부 합산됐다.
 *   h_capa_records.updated_at 과 h_water_quality_tests.updated_at 이 똑같이 186회로
 *   나온 것이 그 증거다. created_at 524회, notes 1209회 같은 숫자는 사실상
 *   "이 이름이 코드베이스에 흔한가" 를 잰 것이지 그 테이블과는 무관했다.
 *
 *   그래서 **해당 테이블을 언급하는 파일 안에서만** 컬럼명을 센다.
 *
 * ★ 여전히 근사치다
 *   - scoped > 0 은 "그 파일이 테이블과 컬럼을 둘 다 언급한다"는 뜻이지
 *     둘이 실제로 같은 쿼리에서 만난다는 보장은 아니다.
 *   - 동적으로 조립된 SQL (`SELECT ${cols} FROM ${t}`) 은 잡히지 않는다.
 *   - 반면 **scoped === 0 && global === 0 은 신뢰할 수 있다** — 이름이 코드베이스에
 *     아예 없으므로 그 테이블 기준으로도 확실히 미참조다. 사문(死文) 판정 근거로 쓸 수 있다.
 *
 *   즉 0 은 판정에, N>0 은 정렬에만 쓴다.
 */
export function countColumnReferences(
  pairs: Array<{ table: string; column: string }>,
  dirs: string[] = CODE_DIRS,
): Map<string, ColumnRefCount> {
  const out = new Map<string, ColumnRefCount>(
    pairs.map((p) => [`${p.table}.${p.column}`, { scoped: 0, global: 0, tableFiles: 0 }]),
  );
  if (!pairs.length) return out;

  const files: string[] = [];
  for (const d of dirs) walk(d, files);

  // 테이블별로 묶어 파일당 테이블 판정을 한 번만 한다
  const byTable = new Map<string, string[]>();
  for (const { table, column } of pairs) {
    if (!byTable.has(table)) byTable.set(table, []);
    byTable.get(table)!.push(column);
  }

  for (const f of files) {
    let text: string;
    try {
      text = readFileSync(f, "utf8");
    } catch {
      continue;
    }
    for (const [table, columns] of byTable) {
      const mentionsTable = countBothCases(text, table) > 0;
      for (const column of columns) {
        const key = `${table}.${column}`;
        const n = countBothCases(text, column);
        if (n === 0) continue;
        const rec = out.get(key)!;
        rec.global += n;
        if (mentionsTable) {
          rec.scoped += n;
          rec.tableFiles++;
        }
      }
    }
  }
  return out;
}

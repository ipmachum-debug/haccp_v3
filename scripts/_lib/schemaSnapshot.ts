/**
 * drizzle 스냅샷 파싱 공용 유틸 (Issue #421)
 * ==============================================================================
 * drizzle/meta/*_snapshot.json 은 "코드가 주장하는 스키마"다.
 * 실측(information_schema) 과 대조할 때 여러 스크립트가 같은 파싱을 필요로 하므로
 * 여기 한 곳에 모은다. (파싱이 갈라지면 같은 DB 를 두고 서로 다른 답이 나온다.)
 * ==============================================================================
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export const SNAPSHOT_DIR = "drizzle/meta";

export interface SnapshotColumn {
  /** drizzle 가 기록한 컬럼 타입 문자열 (예: "varchar(50)") */
  type: string;
  notNull: boolean;
}

export interface ParsedSnapshot {
  path: string;
  /** table → column → 정의 */
  tables: Map<string, Map<string, SnapshotColumn>>;
}

/** 최신 스냅샷 경로. 없으면 null (호출부가 종료 코드를 정한다) */
export function latestSnapshotPath(dir = SNAPSHOT_DIR): string | null {
  if (!existsSync(dir)) return null;
  const snaps = readdirSync(dir)
    .filter((f) => f.endsWith("_snapshot.json"))
    .sort();
  if (snaps.length === 0) return null;
  return join(dir, snaps[snaps.length - 1]);
}

export function parseSnapshot(path: string): ParsedSnapshot {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const tables = new Map<string, Map<string, SnapshotColumn>>();
  for (const [tableName, def] of Object.entries<any>(raw.tables ?? {})) {
    const cols = new Map<string, SnapshotColumn>();
    for (const [colName, cdef] of Object.entries<any>(def.columns ?? {})) {
      cols.set(colName, {
        type: String(cdef.type ?? ""),
        notNull: Boolean(cdef.notNull),
      });
    }
    tables.set(tableName, cols);
  }
  return { path, tables };
}

/**
 * 타입 문자열 정규화 — 표기 차이로 인한 잡음 제거.
 * MySQL 8 은 int(11) 같은 display width 를 더 이상 돌려주지 않지만
 * 스냅샷에는 남아 있을 수 있어 양쪽을 같은 형태로 만든다.
 */
export function normType(t: string): string {
  return t
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\bint\(\d+\)/g, "int")
    .replace(/\bbigint\(\d+\)/g, "bigint")
    .replace(/\bsmallint\(\d+\)/g, "smallint")
    .replace(/\btinyint\(\d+\)/g, "tinyint")
    .replace(/\bmediumint\(\d+\)/g, "mediumint")
    .replace(/ unsigned/g, " unsigned")
    .replace(/'\s*,\s*'/g, "','")
    .trim();
}

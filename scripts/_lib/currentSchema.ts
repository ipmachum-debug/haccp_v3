/**
 * 현행 drizzle 스키마 introspection (Issue #431 후속)
 * ==============================================================================
 * "코드가 주장하는 스키마" 의 진짜 출처는 drizzle/schema 의 테이블 정의다.
 *
 * ★ 왜 스냅샷(drizzle/meta/*_snapshot.json)을 기준으로 쓰면 안 되는가
 *   스냅샷은 `drizzle-kit generate` 산출물인데, 이 저장소는 저널이 idx=1 에서
 *   깨져 있어(Issue #421) 오랫동안 generate 가 돌지 않았다. 그래서 스냅샷은
 *   스키마 파일보다 뒤처져 있다.
 *
 *   2026-08-21 실측: 스냅샷 283 테이블 / 현행 스키마 357 테이블 / 운영 DB 442.
 *   스냅샷 기준으로 대조했더니 "DB 에 없는 컬럼 46건" 이 나왔는데,
 *   전수 확인 결과 **전부 리네임 이전 이름**이었다. 실제 결함은 0건이었다.
 *
 * ★ 속성명 ≠ 컬럼명
 *   drizzle 은 둘을 따로 둔다. 예: 속성 memo → 컬럼 notes.
 *   대조는 반드시 **컬럼명** 으로 해야 한다 (information_schema 와 같은 축).
 *   속성명으로 코드를 grep 해 "참조 횟수" 를 세던 이전 방식은 이 축을 섞어
 *   신뢰할 수 없는 숫자를 냈다. 그래서 제거했다.
 * ==============================================================================
 */
import { getTableColumns, is } from "drizzle-orm";
import { MySqlTable } from "drizzle-orm/mysql-core";
import * as drizzleSchema from "../../drizzle/schema";

export interface CurrentColumn {
  /** 실제 컬럼명 (information_schema 와 같은 축) */
  column: string;
  /** drizzle 속성명 — 코드에서 쓰는 이름. 컬럼명과 다를 수 있다 */
  property: string;
  /** 예: varchar(255), enum('a','b'), decimal(15,2) */
  sqlType: string;
  notNull: boolean;
}

export interface CurrentSchema {
  /** 테이블명 → 컬럼명 → 정의 */
  tables: Map<string, Map<string, CurrentColumn>>;
  /** 같은 테이블을 두 번 정의한 export (있으면 lint:drizzle-tables 가 잡아야 할 사안) */
  duplicates: Array<{ table: string; exports: string[] }>;
}

const DRIZZLE_NAME = Symbol.for("drizzle:Name");

/**
 * drizzle/schema 의 export 를 훑어 테이블 정의를 모은다.
 * schemaModule 을 주입할 수 있게 열어둔 것은 테스트 때문이다.
 */
export function readCurrentSchema(schemaModule?: Record<string, unknown>): CurrentSchema {
  const mod = schemaModule ?? (drizzleSchema as unknown as Record<string, unknown>);

  const tables = new Map<string, Map<string, CurrentColumn>>();
  const seen = new Map<string, string[]>();

  for (const [exportName, value] of Object.entries(mod)) {
    if (!is(value as never, MySqlTable)) continue;
    const tableName = String((value as Record<symbol, unknown>)[DRIZZLE_NAME]);

    if (!seen.has(tableName)) seen.set(tableName, []);
    seen.get(tableName)!.push(exportName);

    // 중복 정의가 있으면 먼저 만난 쪽을 유지한다 (duplicates 로 별도 보고)
    if (tables.has(tableName)) continue;

    const cols = new Map<string, CurrentColumn>();
    for (const [property, col] of Object.entries<any>(getTableColumns(value as never))) {
      cols.set(String(col.name), {
        column: String(col.name),
        property,
        sqlType: String(col.getSQLType()),
        notNull: Boolean(col.notNull),
      });
    }
    tables.set(tableName, cols);
  }

  const duplicates = [...seen.entries()]
    .filter(([, exports]) => exports.length > 1)
    .map(([table, exports]) => ({ table, exports }));

  return { tables, duplicates };
}

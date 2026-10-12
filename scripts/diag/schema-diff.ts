/**
 * 스키마 ↔ DB 구조 전수 diff — 6단계 완료 기준 (12-schema-baseline-step6.md §6)
 *
 * 사용:
 *   1) Genspark: npx drizzle-kit introspect ... --out /tmp/introspect  (읽기 전용) → schema.ts 전달
 *   2) npx tsx scripts/diag/schema-diff.ts /path/to/introspect/schema.ts
 * 출력: DB-only(스키마에 없음) / 스키마-only(DB 에 없음) 목록. 둘 다 0 이면 완료.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const introspectPath = process.argv[2];
if (!introspectPath) { console.error("usage: schema-diff.ts <introspect schema.ts>"); process.exit(2); }

const dbTables = new Set(
  [...fs.readFileSync(introspectPath, "utf8").matchAll(/^export const \w+ = mysqlTable\(\s*['"](\w+)['"]/gm)].map((m) => m[1]),
);
const files = execSync("git ls-files --cached --others --exclude-standard 'drizzle/schema/**/*.ts' 'drizzle/schema/*.ts' 'drizzle/*.ts'", { encoding: "utf8" })
  .split("\n").filter(Boolean);
const schemaTables = new Set<string>();
for (const f of files) {
  for (const m of fs.readFileSync(path.resolve(f), "utf8").matchAll(/mysqlTable\(\s*['"](\w+)['"]/g)) schemaTables.add(m[1]);
}
const quarantine = (t: string) => /^_orphan_/.test(t);
const dbOnly = [...dbTables].filter((t) => !schemaTables.has(t) && !quarantine(t)).sort();
const schemaOnly = [...schemaTables].filter((t) => !dbTables.has(t)).sort();
console.log(`DB 테이블 ${dbTables.size} · 스키마 테이블 ${schemaTables.size}`);
console.log(`DB-only (스키마에 없음) ${dbOnly.length}:`, dbOnly.join(", ") || "-");
console.log(`스키마-only (DB 에 없음) ${schemaOnly.length}:`, schemaOnly.join(", ") || "-");
process.exit(dbOnly.length + schemaOnly.length === 0 ? 0 : 1);

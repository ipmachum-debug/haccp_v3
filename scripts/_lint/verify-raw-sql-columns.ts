/**
 * Tool 8: raw SQL column / table mismatch 검증 lint
 *
 * 목적: PR #233 / #235 / #236 / #237 의 동일 패턴 버그 (raw SQL 의 컬럼/테이블명
 *       이 Drizzle 스키마 정의와 불일치) 를 다음 PR 단계에서 사전 차단.
 *
 * 검증 패턴:
 *   1. db.execute(sql`...`) 결과를 직접 .map() 으로 사용 (튜플 분해 누락)
 *   2. partners.name (실제는 company_name)
 *   3. partners.business_number (실제는 biz_no)
 *   4. h_products_v2.name (실제는 product_name)
 *   5. 미존재 테이블 참조 (purchases, purchase_items, receiving_inspection_records)
 *
 * 검증 방식:
 *   1. server/db/ + server/routers/ 의 모든 .ts 파일 스캔
 *   2. 알려진 위험 패턴 정규식 매칭
 *   3. 발견 시 파일 경로 + 라인 + 패턴 + 권장 수정 출력
 *   4. 0건 = 통과 / 1건 이상 = 실패 (CI 차단)
 *
 * False positive 방지:
 *   - "AS name" / "as name" 별칭 패턴은 안전 (aiHaccpPlan 같은 사례)
 *   - users.name / h_employees.name / h_products_v2.product_name → 실제 컬럼
 *   - expense_vouchers.partner_name → denormalized 실제 컬럼
 *   - // 주석 / `// ★` 패턴 안의 라인 제외
 *
 * 종료 코드:
 *   0 = 통과
 *   1 = 위반 (raw SQL 컬럼/테이블 불일치 발견)
 *
 * 사용:
 *   npx tsx scripts/_lint/verify-raw-sql-columns.ts
 */

import * as fs from "fs";
import * as path from "path";

const REPO_ROOT = process.cwd();

// ─── 스캔 대상 ───
const SCAN_DIRS = [
  "server/db",
  "server/routers",
  "server/services",
];

// ─── 알려진 위험 패턴 ───
interface BadPattern {
  /** 패턴 이름 */
  name: string;
  /** 정규식 */
  regex: RegExp;
  /** 권장 수정 */
  fix: string;
  /** False positive 회피 — 일치 시 무시 */
  whitelist?: RegExp[];
}

const BAD_PATTERNS: BadPattern[] = [
  // 패턴 A: partners.name (실제는 company_name)
  {
    name: "partners.name (alias 없는 직접 참조)",
    regex: /\bp\.name\s+as\s+partner_name\b/gi,
    fix: "p.company_name as partner_name",
  },
  {
    name: "partners.name as partnerName",
    regex: /\bp\.name\s+as\s+partnerName\b/g,
    fix: "p.company_name as partnerName",
  },
  {
    name: "GROUP BY partners.name",
    regex: /\bGROUP\s+BY\s+[^,;]*\bp\.name\b/gi,
    fix: "GROUP BY ... p.company_name",
  },
  // 패턴 B: partners.business_number (실제는 biz_no)
  {
    name: "partners.business_number",
    regex: /\bp\.business_number\b/g,
    fix: "p.biz_no",
    whitelist: [
      /h_suppliers/i,         // h_suppliers.business_number 는 실재
      /companies/i,           // companies.business_number 도 실재
      /users/i,               // users.business_number 도 실재
      /onboarding/i,
      /materialUsageReport/i, // SELECT business_number FROM companies
      /itemMaster/i,          // h_suppliers
      /companyInfo/i,         // companies
    ],
  },
  // 패턴 C: 미존재 테이블 참조
  {
    name: "FROM purchases (테이블 미존재 — accounting_purchases 사용)",
    regex: /\bFROM\s+purchases\b(?!\s*_)/g,
    fix: "FROM accounting_purchases",
  },
  {
    name: "JOIN purchases (테이블 미존재)",
    regex: /\bJOIN\s+purchases\b(?!\s*_)/g,
    fix: "JOIN accounting_purchases",
  },
  {
    name: "FROM purchase_items (테이블 미존재)",
    regex: /\bFROM\s+purchase_items\b/g,
    fix: "accounting_purchases.unit_price 직접 사용",
  },
  {
    name: "FROM receiving_inspection_records (테이블 미존재)",
    regex: /\bFROM\s+receiving_inspection_records\b/g,
    fix: "h_visual_inspection_records 또는 별도 테이블 결정 후 연결",
  },
  // 패턴 D: 잘못된 date 컬럼명
  {
    name: "purchases.purchase_date (실제는 transaction_date)",
    regex: /\b(?:pu?|purchases)\.purchase_date\b/g,
    fix: "transaction_date",
  },
  {
    name: "quotations.quotation_date (실제는 quote_date)",
    regex: /\bquotations?\.quotation_date\b/gi,
    fix: "quote_date",
  },
  // 패턴 E: db.execute 튜플 분해 누락 — 정밀 검증
  // 단순 정규식으로는 false positive 가 많아 별도 함수에서 정밀 검증 (verifyTupleUnpacking)
  // 여기서는 placeholder (실제 검사는 scanFile 내 별도 호출)
];

/**
 * db.execute 튜플 분해 누락 정밀 검사.
 *
 * 알고리즘:
 *   1. `const X = await db.execute(sql\`...\`);` 매칭 (변수명 X 추출)
 *   2. 매칭 위치 이후 50 라인 내에서:
 *      - `(X as any)[0]` / `X[0]` / `((X as any)?.[0]` 형태 → 안전 (정상 분해)
 *      - `(X as any[]).map` / `X.map` 형태 → 위반 (튜플 자체를 rows 로 사용)
 *      - 둘 다 없음 → 안전 (사용 안 함)
 */
function verifyTupleUnpacking(
  filePath: string,
  content: string,
  lines: string[],
  out: Violation[],
): void {
  const declRegex = /(?:const|let)\s+(\w+)\s*(?::\s*any)?\s*=\s*await\s+db\.execute\(sql/g;
  let match;
  while ((match = declRegex.exec(content)) !== null) {
    const varName = match[1];
    const declOffset = match.index;
    const upToDecl = content.slice(0, declOffset);
    const declLineNo = upToDecl.split("\n").length;

    // 매칭 이후 1500 char (~50 라인) 내에서 사용 검사
    const window = content.slice(declOffset, declOffset + 1500);

    // 안전 패턴: [0] 추출
    const safePatterns = [
      new RegExp(`\\(${varName}\\s+as\\s+any\\)(?:\\?\\.|\\.)?\\[0\\]`),
      new RegExp(`\\(${varName}\\s+as\\s+any\\[\\]\\)\\[0\\]`),
      new RegExp(`\\b${varName}\\.\\[0\\]`),
      new RegExp(`\\(\\(${varName}\\s+as\\s+any\\)\\?\\.\\[0\\]`),
    ];

    // 위험 패턴: 직접 .map / iteration
    const unsafePatterns = [
      new RegExp(`\\(${varName}\\s+as\\s+any\\[\\]\\)\\.map\\b`),
      new RegExp(`\\b${varName}\\.map\\b`),
      new RegExp(`for\\s*\\(\\s*const\\s+\\w+\\s+of\\s+${varName}\\s+as\\s+any\\[\\]\\)`),
    ];

    const isSafe = safePatterns.some((re) => re.test(window));
    const isUnsafe = unsafePatterns.some((re) => re.test(window));

    if (isUnsafe && !isSafe) {
      const lineText = lines[declLineNo - 1] ?? "";
      // 정정 주석 있으면 제외
      const surroundingLines = lines.slice(Math.max(0, declLineNo - 3), declLineNo).join("\n");
      if (/★.*튜플|튜플.*분해|\[0\].*추출/.test(surroundingLines)) continue;

      out.push({
        file: path.relative(REPO_ROOT, filePath),
        line: declLineNo,
        pattern: "db.execute 튜플 분해 누락 (직접 .map 사용)",
        fix: `const result: any = await db.execute(sql\`...\`); const rows = ((result as any)?.[0] ?? []) as any[]; rows.map(...)`,
        matchedText: lineText.trim().slice(0, 80),
      });
    }
  }
}

// ─── 안전 패턴 (false positive 회피) ───
function isSafeContext(line: string): boolean {
  // AS / as 별칭
  if (/\bas\s+name\b/i.test(line)) return true;
  // 주석
  if (/^\s*\/\//.test(line)) return true;
  // 문서/JSDoc 내부
  if (/^\s*\*/.test(line)) return true;
  // 이미 정정 주석
  if (/★.*정정/.test(line)) return true;
  return false;
}

// ─── 위반 정보 ───
interface Violation {
  file: string;
  line: number;
  pattern: string;
  fix: string;
  matchedText: string;
}

const violations: Violation[] = [];

function scanFile(filePath: string): void {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  for (const pattern of BAD_PATTERNS) {
    let match;
    pattern.regex.lastIndex = 0;
    while ((match = pattern.regex.exec(content)) !== null) {
      // line number
      const upToMatch = content.slice(0, match.index);
      const lineNo = upToMatch.split("\n").length;
      const lineText = lines[lineNo - 1] ?? "";

      // safe context check
      if (isSafeContext(lineText)) continue;

      // whitelist check (file-level)
      if (pattern.whitelist?.some((re) => re.test(filePath))) continue;
      if (pattern.whitelist?.some((re) => re.test(lineText))) continue;

      violations.push({
        file: path.relative(REPO_ROOT, filePath),
        line: lineNo,
        pattern: pattern.name,
        fix: pattern.fix,
        matchedText: match[0],
      });
    }
  }

  // 패턴 E: db.execute 튜플 분해 정밀 검사 (regex 단독으로는 false positive 多)
  verifyTupleUnpacking(filePath, content, lines, violations);
}

function walk(dir: string): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // node_modules / test 디렉토리 제외
      if (entry.name === "node_modules" || entry.name === "_backup" || entry.name === "__tests__") continue;
      walk(full);
    } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      scanFile(full);
    }
  }
}

// ─── 실행 ───
console.log("=== Tool 8: raw SQL column / table mismatch lint ===\n");

for (const dir of SCAN_DIRS) {
  const full = path.join(REPO_ROOT, dir);
  if (!fs.existsSync(full)) {
    console.warn(`경고: 스캔 디렉토리 없음 — ${dir}`);
    continue;
  }
  walk(full);
}

// ─── 결과 출력 ───
if (violations.length === 0) {
  console.log("✅ raw SQL 컬럼/테이블 불일치 0건 — 통과\n");
  console.log(`스캔: ${SCAN_DIRS.join(", ")}`);
  console.log(`패턴: ${BAD_PATTERNS.length} 종`);
  process.exit(0);
}

console.error(`❌ ${violations.length} 건 위반 발견:\n`);

// 파일별 그룹화
const byFile = new Map<string, Violation[]>();
for (const v of violations) {
  const arr = byFile.get(v.file) ?? [];
  arr.push(v);
  byFile.set(v.file, arr);
}

for (const [file, vs] of byFile) {
  console.error(`📄 ${file}`);
  for (const v of vs) {
    console.error(`   L${v.line} [${v.pattern}]`);
    console.error(`      매칭: ${v.matchedText}`);
    console.error(`      수정: ${v.fix}`);
  }
  console.error("");
}

console.error("\n참고:");
console.error("  - 동일 패턴 사례: PR #233 (cosmetic dashboard), #235 (quotation),");
console.error("    #236 (4 AI 모듈), #237 (financialReports + f3*)");
console.error("  - 수정 후 npx tsx scripts/_lint/verify-raw-sql-columns.ts 재실행");

process.exit(1);

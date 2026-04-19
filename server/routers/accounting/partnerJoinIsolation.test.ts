/**
 * LEFT JOIN 테넌트 격리 회귀 테스트
 *
 * 검증:
 *  partners 테이블과 JOIN 하는 쿼리에서 ON 조건에 partners.tenantId 매칭이
 *  포함되어 있는지 확인. WHERE 절 필터만으로는 ID 충돌 시 교차 테넌트
 *  데이터가 JOIN 결과에 섞일 위험이 있으므로, Defense-in-Depth 로
 *  JOIN 자체에 테넌트 조건을 넣어야 한다.
 *
 * 대상 파일:
 *  - server/routers/accounting/partnerPrice.router.ts
 *  - server/routers/accounting/quotation.router.ts
 *  - server/routers/accounting/purchaseOrder.router.ts
 *  - server/routers/accounting/taxInvoice.router.ts
 *  - server/partners.ts (apLedger / arLedger)
 *  - server/db/haccp/haccpIntegration.ts
 *  - server/db/accounting/transactionStatement.ts
 *  - server/bankTransactions.ts
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..");

/**
 * `leftJoin(partners, ...)` 호출 블록을 추출한다.
 * Drizzle 쿼리 빌더의 호출 경계는 괄호 매칭으로 판단 — `leftJoin(` 부터 매칭되는 `)` 까지.
 */
function extractLeftJoinPartnersBlocks(source: string): string[] {
  const results: string[] = [];
  const re = /leftJoin\s*\(\s*partners\s*,/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const start = m.index + m[0].lastIndexOf("(");
    let depth = 0;
    let end = start;
    for (let i = start; i < source.length; i++) {
      const ch = source[i];
      if (ch === "(") depth++;
      else if (ch === ")") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    results.push(source.slice(start, end + 1));
  }
  return results;
}

/**
 * partners 와의 JOIN 에 테넌트 조건이 포함되어 있는지 검증.
 * 허용 패턴:
 *  - eq(partners.tenantId, <parent>.tenantId)
 *  - eq(partners.tenantId, ctx.tenantId)
 *  - eq(partners.tenantId, tenantId)
 */
function hasTenantCondition(block: string): boolean {
  return /eq\s*\(\s*partners\.tenantId\s*,/.test(block);
}

const FILES_UNDER_TEST = [
  "server/routers/accounting/partnerPrice.router.ts",
  "server/routers/accounting/quotation.router.ts",
  "server/routers/accounting/purchaseOrder.router.ts",
  "server/routers/accounting/taxInvoice.router.ts",
  "server/partners.ts",
  "server/db/haccp/haccpIntegration.ts",
  "server/db/accounting/transactionStatement.ts",
  "server/bankTransactions.ts",
];

describe("Partner LEFT JOIN — 테넌트 격리 방어", () => {
  for (const rel of FILES_UNDER_TEST) {
    it(`${rel}: 모든 leftJoin(partners, ...) 에 partners.tenantId 조건 포함`, () => {
      const src = readFileSync(join(ROOT, rel), "utf8");
      const blocks = extractLeftJoinPartnersBlocks(src);

      // 이 테스트는 해당 파일이 실제로 partners 와 JOIN 을 사용하는 것을 전제로 함.
      // JOIN 이 전혀 없으면 회귀가 아닌 파일 경로 오류일 가능성이 높으므로 실패시킴.
      expect(
        blocks.length,
        `${rel} 에서 leftJoin(partners, ...) 을 찾지 못했습니다 — 파일 경로/리팩토링 확인 필요`,
      ).toBeGreaterThan(0);

      for (const [i, block] of blocks.entries()) {
        expect(
          hasTenantCondition(block),
          `${rel} [${i + 1}번째 JOIN] 에 partners.tenantId 조건 누락:\n${block}`,
        ).toBe(true);
      }
    });
  }
});

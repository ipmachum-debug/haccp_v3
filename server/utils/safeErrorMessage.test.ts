/**
 * 화면 오류 문장 — SQL·파라미터 원문을 내보내지 않음 (지티 QA R01)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { toSafeErrorMessage } from "./safeErrorMessage";

describe("toSafeErrorMessage", () => {
  it("업무 오류 문장은 그대로", () => {
    expect(toSafeErrorMessage(new Error("이미 존재하는 원재료 코드입니다"))).toBe("이미 존재하는 원재료 코드입니다");
    expect(toSafeErrorMessage(new Error("매입 수량은 0보다 커야 합니다"))).toBe("매입 수량은 0보다 커야 합니다");
  });
  it("Drizzle 'Failed query … params' + 원인 ER_DUP_ENTRY → 중복 안내, SQL 없음", () => {
    const e = new Error("Failed query: insert into `item_master` (`tenant_id`, `item_code`) values (?, ?)\nparams: 14,RM-001");
    (e as any).cause = Object.assign(new Error("Duplicate entry 'RM-001-14' for key 'uq_item_code_tenant'"), { code: "ER_DUP_ENTRY" });
    const msg = toSafeErrorMessage(e);
    expect(msg).toMatch(/이미 등록된 값과 겹칩니다/);
    expect(msg).not.toMatch(/insert|params|RM-001|item_master/i);
  });
  it("코드 없는 SQL 원문 → 일반 안내", () => {
    expect(toSafeErrorMessage(new Error("select id from accounting_accounts where tenant_id = 14"))).toMatch(/^데이터를 처리하지 못했습니다/);
    expect(toSafeErrorMessage(Object.assign(new Error("Unknown column 'x'"), { code: "ER_BAD_FIELD_ERROR" }))).toMatch(/^데이터를 처리하지 못했습니다/);
  });
  it("tRPC errorFormatter 에 연결돼 있음 (서버 tRPC 초기화)", () => {
    const src = readFileSync(join(__dirname, "../_core/trpc.ts"), "utf-8");
    expect(src).toMatch(/errorFormatter\(\{ shape, error \}\)[\s\S]*toSafeErrorMessage\(error\)/);
  });
});

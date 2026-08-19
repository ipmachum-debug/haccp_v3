/**
 * generate-baseline-migration --from-actual 회귀 테스트.
 *
 * information_schema 의 표기를 DDL 로 되돌리는 규칙은 조용히 틀리기 쉽다
 * (따옴표, 식 default, auto_increment, on update, 복합 UNIQUE).
 * 여기서 각 규칙을 고정해둔다. 실제 MySQL 적용은 CI 가 담당한다.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let sql = "";

beforeAll(() => {
  const out = mkdtempSync(join(tmpdir(), "baseline-test-"));
  execFileSync(
    "npx",
    [
      "tsx",
      "scripts/generate-baseline-migration.ts",
      "--from-actual",
      "scripts/__tests__/fixtures/actual-schema.sample.json",
      "--out-dir",
      out,
    ],
    { stdio: "pipe" },
  );
  sql = readFileSync(join(out, "baseline_tables.sql"), "utf8");
});

describe("--from-actual — information_schema → DDL 변환 규칙", () => {
  it("auto_increment 를 복원한다", () => {
    expect(sql).toContain("`id` bigint NOT NULL AUTO_INCREMENT");
  });

  it("문자열 default 에 따옴표를 씌우고 내부 작은따옴표를 이스케이프한다", () => {
    expect(sql).toContain("DEFAULT 'draft'");
    expect(sql).toContain("DEFAULT 'it''s fine'");
  });

  it("숫자 default 는 따옴표를 씌우지 않는다", () => {
    expect(sql).toContain("`qty` int DEFAULT 0");
    expect(sql).not.toContain("DEFAULT '0'");
  });

  it("DEFAULT_GENERATED 는 식으로 취급해 그대로 쓴다", () => {
    expect(sql).toContain("`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP");
    expect(sql).not.toContain("DEFAULT 'CURRENT_TIMESTAMP'");
  });

  it("EXTRA 의 on update 절을 복원한다", () => {
    expect(sql).toMatch(/`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP/);
  });

  it("PRIMARY 인덱스를 PRIMARY KEY 로, 복합 UNIQUE 를 UNIQUE KEY 로 복원한다", () => {
    expect(sql).toContain("PRIMARY KEY (`id`)");
    expect(sql).toContain("UNIQUE KEY `uq_widgets_tenant_code` (`tenant_id`, `code`)");
  });

  it("일반 인덱스를 KEY 로 복원한다", () => {
    expect(sql).toContain("KEY `idx_widgets_status` (`status`)");
  });

  it("스냅샷에 없는 enum 값(운영 드리프트)을 그대로 보존한다", () => {
    // 실측에만 있는 under_review 가 살아남아야 한다 — 이것이 --from-actual 의 존재 이유다
    expect(sql).toContain("enum('draft','under_review')");
  });

  it("nullable 컬럼에 NOT NULL 을 붙이지 않는다", () => {
    expect(sql).toMatch(/`name` text,?\n/);
    expect(sql).not.toContain("`name` text NOT NULL");
  });

  it("테이블을 이름 순으로 낸다 (재생성 diff 안정성)", () => {
    expect(sql.indexOf("`gadgets`")).toBeLessThan(sql.indexOf("`widgets`"));
  });
});

/**
 * 스키마 드리프트 조사 유틸 (scripts/_lib/schemaScan.ts) 테스트.
 * (DB 질의 경로는 운영 접속이 필요하므로 여기서 다루지 않는다.)
 */
import { describe, it, expect } from "vitest";
import { BACKUP_TABLE_RE, countColumnReferences, toCamel } from "../_lib/schemaScan";

describe("BACKUP_TABLE_RE — 수동 백업 테이블 판별", () => {
  it("백업 테이블을 걸러낸다", () => {
    for (const t of [
      "_backup_h_batches",
      "_bak_partners",
      "h_batches_backup",
      "partners_bak",
      "h_batches_backup_20260419",
      "accounting_purchases_20260422",
    ]) {
      expect(BACKUP_TABLE_RE.test(t), t).toBe(true);
    }
  });

  it("정상 테이블을 백업으로 오인하지 않는다", () => {
    for (const t of [
      "h_batches",
      "partners",
      "accounting_accounts",
      "checklist_templates",
      "ai_knowledge_chunks",
      "backup_policies",       // backup 으로 '시작'하지만 접두 언더스코어 규칙에 안 걸림
      "bank_accounts",
      "material_ledger_daily",
    ]) {
      expect(BACKUP_TABLE_RE.test(t), t).toBe(false);
    }
  });
});

describe("toCamel", () => {
  it("snake_case 를 camelCase 로 바꾼다", () => {
    expect(toCamel("updated_at")).toBe("updatedAt");
    expect(toCamel("h_capa_records")).toBe("hCapaRecords");
    expect(toCamel("nc_id")).toBe("ncId");
    expect(toCamel("id")).toBe("id");
  });
});

describe("countColumnReferences — 테이블 스코프 집계", () => {
  it("빈 입력에 안전하다", () => {
    expect(countColumnReferences([]).size).toBe(0);
  });

  it("코드에 아예 없는 이름은 global 0 (사문 판정 근거)", () => {
    const r = countColumnReferences([
      { table: "zzz_no_such_table_xyz", column: "zzz_no_such_column_xyz" },
    ]);
    const rec = r.get("zzz_no_such_table_xyz.zzz_no_such_column_xyz")!;
    expect(rec.global).toBe(0);
    expect(rec.scoped).toBe(0);
  });

  it("★ 회귀: 동명 컬럼이 무관한 테이블끼리 같은 값을 갖지 않는다", () => {
    // 2026-08-21 결함 — 컬럼명만 세던 시절엔 아래 둘이 정확히 같은 수가 나왔다
    // (h_capa_records.updated_at = h_water_quality_tests.updated_at = 186).
    // 테이블 스코프를 넣은 뒤로는 각 테이블 문맥에서만 세므로 갈라져야 한다.
    const r = countColumnReferences([
      { table: "h_batches", column: "updated_at" },
      { table: "zzz_no_such_table_xyz", column: "updated_at" },
    ]);
    const real = r.get("h_batches.updated_at")!;
    const fake = r.get("zzz_no_such_table_xyz.updated_at")!;

    // global 은 같아도 된다 — 같은 이름을 세는 상한값이므로
    expect(real.global).toBe(fake.global);
    // 하지만 scoped 는 갈라져야 한다. 존재하지 않는 테이블은 어떤 파일도 언급하지 않는다
    expect(fake.scoped).toBe(0);
    expect(fake.tableFiles).toBe(0);
    // 실존 테이블은 자기 문맥에서 잡혀야 한다
    expect(real.scoped).toBeGreaterThan(0);
    expect(real.scoped).toBeLessThanOrEqual(real.global);
  });

  it("scoped 는 global 을 넘지 않는다", () => {
    const r = countColumnReferences([
      { table: "h_batches", column: "tenant_id" },
      { table: "partners", column: "tenant_id" },
    ]);
    for (const rec of r.values()) {
      expect(rec.scoped).toBeLessThanOrEqual(rec.global);
    }
  });

  it("camelCase 표기도 센다 (drizzle 스키마는 TS 쪽에서 camel 을 쓴다)", () => {
    const r = countColumnReferences([{ table: "h_batches", column: "tenant_id" }]);
    // tenant_id / tenantId 양쪽을 세므로 어느 한쪽만 셀 때보다 크다
    expect(r.get("h_batches.tenant_id")!.global).toBeGreaterThan(0);
  });
});

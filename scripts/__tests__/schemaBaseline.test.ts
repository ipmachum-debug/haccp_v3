/**
 * 스키마 드리프트 조사 유틸 (scripts/_lib/schemaScan.ts) 테스트.
 * (DB 질의 경로는 운영 접속이 필요하므로 여기서 다루지 않는다.)
 */
import { describe, it, expect } from "vitest";
import { BACKUP_TABLE_RE, toCamel } from "../_lib/schemaScan";
import { readCurrentSchema } from "../_lib/currentSchema";

describe("BACKUP_TABLE_RE — 수동 백업 테이블 판별", () => {
  it("백업 테이블을 걸러낸다", () => {
    for (const t of [
      "_backup_h_batches",
      "_bak_partners",
      "h_batches_backup",
      "partners_bak",
      "h_batches_backup_20260419",
      "accounting_purchases_20260422",
      // 2026-08-21 추가 — 선행 언더스코어 없이 타임스탬프만 붙는 형태를 놓치고 있었다
      "backup_accounting_purchases_154_20260630_100739",
      "backup_h_inventory_20260630_095410_v5apply",
      "backup_tx_9931_20260630_101404",
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
      "backup_policies",       // 타임스탬프가 없으므로 정상 테이블
      "h_backups",             // 백업 관리 기능의 정식 테이블 — 걸러내면 안 된다
      "h_backup_logs",
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

describe("readCurrentSchema — 현행 스키마 introspection", () => {
  const cur = readCurrentSchema();

  it("스냅샷보다 많은 테이블을 본다 (스냅샷은 낡았다)", () => {
    // 2026-08-21 기준 현행 357 / 스냅샷 283. 최소한 300 은 넘어야 한다.
    expect(cur.tables.size).toBeGreaterThan(300);
  });

  it("같은 테이블을 두 번 정의한 export 가 없다", () => {
    expect(cur.duplicates).toEqual([]);
  });

  it("★ 속성명이 아니라 컬럼명으로 색인한다", () => {
    // 이 구분을 놓쳐서 #431 오탐이 났다.
    // bank_transactions 는 속성 memo 를 컬럼 notes 에 매핑한다.
    const bt = cur.tables.get("bank_transactions");
    expect(bt).toBeDefined();
    expect(bt!.has("notes")).toBe(true);   // 컬럼명으로 찾힌다
    expect(bt!.has("memo")).toBe(false);   // 속성명으로는 찾히지 않는다
    expect(bt!.get("notes")!.property).toBe("memo"); // 속성명은 따로 보존한다
  });

  it("sqlType 을 information_schema 와 비교 가능한 형태로 준다", () => {
    const bt = cur.tables.get("bank_transactions")!;
    expect(bt.get("notes")!.sqlType).toMatch(/^varchar\(\d+\)$/);
    expect(bt.get("amount")!.sqlType).toMatch(/^decimal\(\d+,\d+\)$/);
  });

  it("notNull 을 읽는다", () => {
    const bt = cur.tables.get("bank_transactions")!;
    expect(bt.get("tenant_id")!.notNull).toBe(true);
    expect(bt.get("balance")!.notNull).toBe(false);
  });
});

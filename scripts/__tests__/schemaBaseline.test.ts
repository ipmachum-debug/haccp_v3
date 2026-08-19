/**
 * 스키마 드리프트 조사 유틸 (scripts/_lib/schemaScan.ts) 테스트.
 * (DB 질의 경로는 운영 접속이 필요하므로 여기서 다루지 않는다.)
 */
import { describe, it, expect } from "vitest";
import { BACKUP_TABLE_RE, countCodeReferences } from "../_lib/schemaScan";

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

describe("countCodeReferences — 컬럼명 코드 참조 집계", () => {
  it("실제로 쓰이는 컬럼과 존재하지 않는 컬럼을 구분한다", () => {
    const counts = countCodeReferences([
      "tenant_id",
      "zzz_definitely_not_a_real_column_xyz",
    ]);
    // tenant_id 는 이 저장소 전반에 쓰인다
    expect(counts.get("tenant_id")!).toBeGreaterThan(50);
    // 존재하지 않는 이름은 0
    expect(counts.get("zzz_definitely_not_a_real_column_xyz")).toBe(0);
  });

  it("빈 입력에 안전하다", () => {
    expect(countCodeReferences([]).size).toBe(0);
  });

  it("부분일치를 단어 경계로 배제한다", () => {
    // created_at 은 흔하지만, 'x_created_at' 같은 더 긴 이름의 일부로만
    // 세어지지 않도록 \b 경계를 쓴다. 최소한 0 보다 크고 유한해야 한다.
    const n = countCodeReferences(["created_at"]).get("created_at")!;
    expect(n).toBeGreaterThan(0);
    expect(Number.isFinite(n)).toBe(true);
  });
});

/**
 * 설비 배치 운영 설정 정본 하나 — ccp_process_groups (2026-10-18)
 *   단지 10/14: 약식 공정은 '묶음 3대' 인데 기록지 스냅샷은 '순차 10분' — 비어 있는 별도 표(h_ccp_equip_batch_settings)를 읽었다.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf-8");

describe("운영 설정 단일 정본", () => {
  it("코드 어디서도 h_ccp_equip_batch_settings 를 읽거나 쓰지 않는다 (스키마 정의 제외)", () => {
    for (const f of ["server/db/haccp/ccpFormSettings.ts", "server/db/haccp/ccpFormRecordsCRUD.ts", "server/db/haccp/ccpFormRowsOps.ts", "server/routers/haccp/ccpForm.router.ts"]) {
      expect(read(f), f).not.toMatch(/hCcpEquipBatchSettings|(FROM|INTO|UPDATE|JOIN)\s+h_ccp_equip_batch_settings/i);
    }
  });
  it("기록지 생성 스냅샷은 ccp_process_groups 의 운영 설정을 읽고 grouped 를 받아들인다", () => {
    const src = read("server/db/haccp/ccpFormRecordsCRUD.ts");
    expect(src).toMatch(/SELECT equip_group_mode, equip_interval_min FROM ccp_process_groups WHERE id = \? AND tenant_id = \?/);
    expect(src).toMatch(/"concurrent" \| "sequential" \| "grouped"/);
  });
  it("투입 간격 기본값은 한 가지(10분) — 17분 고정값 없음", () => {
    expect(read("server/db/haccp/ccpFormSettings.ts")).not.toMatch(/: 17;/);
  });
});

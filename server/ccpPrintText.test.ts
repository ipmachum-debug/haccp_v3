/**
 * CCP 기록지 인쇄 문구 고정 — 승인 때 고정, 반려 때 해제, 고정 문구가 있으면 인쇄는 그것 (2026-10-18)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const execute = vi.fn();
vi.mock("./db/connection", () => ({ getRawConnection: async () => ({ execute }), getDb: vi.fn() }));
import { freezeCcpPrintText, loadFrozenPrintText, parsePrintSnapshot } from "./db/haccp/ccpPrintText";

beforeEach(() => execute.mockReset());

describe("freezeCcpPrintText", () => {
  it("공정그룹 문구·회사 한계기준표·설비 제목을 기록지에 한 번 고정", async () => {
    execute
      .mockResolvedValueOnce([[{ id: 1828, tenant_id: 2, process_group_id: 1, ccp_type: "CCP-1B", print_snapshot: null }]])
      .mockResolvedValueOnce([[{ monitoring_method: "○ 가열시간 확인", monitoring_cycle: "매 작업시마다", corrective_action: "○ 미달 시 재가열" }]])
      .mockResolvedValueOnce([[{ name: "교반-가열공정", time_min: 10, time_max: 15, pressure_min: "0.16", temperature_min: "90.00" }]])
      .mockResolvedValueOnce([[{ type: "교반기" }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    expect(await freezeCcpPrintText(1828, 2)).toBe(true);
    const [q, p] = execute.mock.calls[4];
    expect(q).toMatch(/SET print_snapshot = \? WHERE id = \? AND tenant_id = \? AND print_snapshot IS NULL/);
    expect(JSON.parse(p[0])).toEqual({
      monitoringMethod: "○ 가열시간 확인", monitoringCycle: "매 작업시마다", correctiveAction: "○ 미달 시 재가열",
      clTable: [{ name: "교반-가열공정", timeMin: 10, timeMax: 15, pressureMin: "0.16", temperatureMin: "90.00" }],
      equipTypeLabel: "교반기",
    });
  });
  it("이미 고정돼 있으면 다시 쓰지 않음 (멱등), 컬럼 없는 DB 는 건너뜀", async () => {
    execute.mockResolvedValueOnce([[{ id: 1, tenant_id: 2, process_group_id: 1, ccp_type: "CCP-1B", print_snapshot: "{}" }]]);
    expect(await freezeCcpPrintText(1, 2)).toBe(false);
    expect(execute).toHaveBeenCalledTimes(1);
    execute.mockRejectedValueOnce(Object.assign(new Error("Unknown column"), { code: "ER_BAD_FIELD_ERROR" }));
    expect(await freezeCcpPrintText(1, 2)).toBe(false);
  });
});

describe("loadFrozenPrintText", () => {
  it("고정 문구를 읽고, 컬럼이 없으면 null", async () => {
    execute.mockResolvedValueOnce([[{ print_snapshot: JSON.stringify({ monitoringCycle: "2시간마다" }) }]]);
    expect(await loadFrozenPrintText({ execute }, 5, 2)).toEqual({ monitoringCycle: "2시간마다" });
    execute.mockRejectedValueOnce(Object.assign(new Error("Unknown column"), { code: "ER_BAD_FIELD_ERROR" }));
    expect(await loadFrozenPrintText({ execute }, 5, 2)).toBeNull();
    expect(parsePrintSnapshot("not json")).toBeNull();
  });
});

describe("승인·반려 연결", () => {
  it("applyCcpFormDecision: 승인 → freezeCcpPrintText, 반려 → print_snapshot = NULL", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(require("node:path").join(__dirname, "db/haccp/ccpStatusSync.ts"), "utf-8");
    expect(src).toMatch(/decision === "approved"[\s\S]{0,200}freezeCcpPrintText\(params\.formRecordId, params\.tenantId\)/);
    expect(src).toMatch(/decision === "rejected"[\s\S]{0,200}SET print_snapshot = NULL/);
  });
});

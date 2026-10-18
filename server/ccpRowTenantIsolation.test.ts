/**
 * CCP 점검 행·인스턴스 회사 격리 (2026-10-18) — id 만으로 다른 회사 데이터를 고치거나 읽지 못하게
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const execute = vi.fn();
vi.mock("./db/connection", () => ({ getRawConnection: async () => ({ execute }), getDb: vi.fn() }));
import { updateCcpRow } from "./db/production/productAndCcp";

beforeEach(() => execute.mockReset());

describe("updateCcpRow", () => {
  it("WHERE 에 tenant_id 를 넣고, 다른 회사 행(0건)이면 오류", async () => {
    execute.mockResolvedValueOnce([{ affectedRows: 1 }]);
    await updateCcpRow(55, { tempC: "95" }, 2);
    expect(execute.mock.calls[0][0]).toMatch(/WHERE id = \? AND tenant_id = \?$/);
    expect(execute.mock.calls[0][1]).toEqual(["95", 55, 2]);
    execute.mockResolvedValueOnce([{ affectedRows: 0 }]);
    await expect(updateCcpRow(55, { tempC: "95" }, 14)).rejects.toThrow(/찾을 수 없습니다/);
  });
  it("회사 정보 없으면 쓰지 않음", async () => {
    await expect(updateCcpRow(55, { tempC: "95" })).rejects.toThrow(/테넌트/);
    expect(execute).not.toHaveBeenCalled();
  });
});

describe("행 조회·인스턴스 상태도 회사 조건", () => {
  it("getCcpRowsByInstanceId · updateCcpInstanceStatus 가 tenantId 로 거른다", () => {
    const src = readFileSync(join(__dirname, "db/production/productAndCcp.ts"), "utf-8");
    expect(src).toMatch(/and\(eq\(hCcpRows\.instanceId, instanceId\), eq\(hCcpRows\.tenantId, Number\(tenantId\)\)\)/);
    expect(src).toMatch(/and\(eq\(hCcpInstances\.id, instanceId\), eq\(hCcpInstances\.tenantId, Number\(tenantId\)\)\)/);
  });
});

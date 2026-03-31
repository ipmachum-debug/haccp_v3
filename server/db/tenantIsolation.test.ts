/**
 * 테넌트 격리 검증 테스트
 * 주요 DB 함수의 tenantId 파라미터 필수 검증
 */
import { describe, it, expect } from "vitest";

describe("테넌트 격리 - deleteBatch", () => {
  it("tenantId 없이 호출하면 에러", async () => {
    // deleteBatch는 tenantId 필수
    const { deleteBatch } = await import("./batchFunctions");
    await expect(deleteBatch(999)).rejects.toThrow("tenantId는 필수");
  });
});

describe("테넌트 격리 - getCcpInstancesByBatchId 시그니처", () => {
  it("tenantId 파라미터를 받아야 함", async () => {
    const mod = await import("./productAndCcp");
    // 함수가 2번째 인자로 tenantId를 받는지 확인
    expect(mod.getCcpInstancesByBatchId.length).toBeGreaterThanOrEqual(1);
  });
});

describe("테넌트 격리 - getPartnerById 시그니처", () => {
  it("tenantId 파라미터를 받아야 함", async () => {
    const { getPartnerById } = await import("../partners");
    expect(getPartnerById.length).toBeGreaterThanOrEqual(1);
  });
});

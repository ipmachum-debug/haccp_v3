/**
 * 구조적 로거 단위 테스트
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { logInfo, logWarn, logError, logSecurity } from "./logger";

describe("Logger", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("logInfo: 기본 메시지 출력", () => {
    logInfo("테스트 메시지");
    expect(console.log).toHaveBeenCalledTimes(1);
    const output = (console.log as any).mock.calls[0][0];
    expect(output).toContain("[INFO]");
    expect(output).toContain("테스트 메시지");
  });

  it("logInfo: 컨텍스트 포함", () => {
    logInfo("배치 생성", { tenantId: 2, batchId: 123 });
    const output = (console.log as any).mock.calls[0][0];
    expect(output).toContain("tenantId:2");
    expect(output).toContain("batchId:123");
  });

  it("logWarn: 경고 출력", () => {
    logWarn("재고 부족", { materialId: 10 });
    expect(console.warn).toHaveBeenCalledTimes(1);
    const output = (console.warn as any).mock.calls[0][0];
    expect(output).toContain("[WARN]");
  });

  it("logError: 에러 + 스택 출력", () => {
    const err = new Error("DB 실패");
    logError("쿼리 오류", err, { tenantId: 1 });
    expect(console.error).toHaveBeenCalled();
    const output = (console.error as any).mock.calls[0][0];
    expect(output).toContain("[ERROR]");
    expect(output).toContain("DB 실패");
  });

  it("logSecurity: 보안 이벤트 출력", () => {
    logSecurity("무단 접근", { userId: 99 });
    expect(console.error).toHaveBeenCalled();
    const output = (console.error as any).mock.calls[0][0];
    expect(output).toContain("[SECURITY]");
  });

  it("logInfo: null/undefined 컨텍스트 안전 처리", () => {
    logInfo("빈 컨텍스트");
    logInfo("null 값", { tenantId: undefined });
    expect(console.log).toHaveBeenCalledTimes(2);
  });
});

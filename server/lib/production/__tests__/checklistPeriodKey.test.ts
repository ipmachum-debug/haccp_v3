/**
 * 체크리스트 인스턴스 period_key 계산 테스트
 *
 * 배경: 배치 파이프라인 STEP 10 이 만든 인스턴스에 period_key 가 비어 있으면
 *       checklistInstance.list 의 기간 필터에서 문서가 사라진다.
 */
import { describe, it, expect } from "vitest";
import { buildPeriodKey } from "../../../db/haccp/checklistAndInspection";

describe("buildPeriodKey", () => {
  it("기준일이 없으면 null", () => {
    expect(buildPeriodKey("daily", null)).toBeNull();
    expect(buildPeriodKey("daily", undefined)).toBeNull();
    expect(buildPeriodKey("daily", "")).toBeNull();
  });

  it("형식이 잘못된 날짜는 null", () => {
    expect(buildPeriodKey("daily", "2026/08/18")).toBeNull();
    expect(buildPeriodKey("daily", "20260818")).toBeNull();
  });

  it("daily / batch_create / batch_complete 는 YYYY-MM-DD", () => {
    expect(buildPeriodKey("daily", "2026-08-18")).toBe("2026-08-18");
    expect(buildPeriodKey("batch_create", "2026-08-18")).toBe("2026-08-18");
    expect(buildPeriodKey("batch_complete", "2026-08-18")).toBe("2026-08-18");
    expect(buildPeriodKey(null, "2026-08-18")).toBe("2026-08-18");
  });

  it("monthly 는 YYYY-MM", () => {
    expect(buildPeriodKey("monthly", "2026-08-18")).toBe("2026-08");
    expect(buildPeriodKey("monthly", "2026-01-01")).toBe("2026-01");
  });

  it("weekly 는 ISO 주차 (YYYY-Www)", () => {
    // 2026-08-18 은 화요일 → ISO 34주차
    expect(buildPeriodKey("weekly", "2026-08-18")).toBe("2026-W34");
    // 2026-01-01 은 목요일 → 2026년 1주차
    expect(buildPeriodKey("weekly", "2026-01-01")).toBe("2026-W01");
    // 2027-01-01 은 금요일 → 2026년 53주차에 속한다
    expect(buildPeriodKey("weekly", "2027-01-01")).toBe("2026-W53");
  });

  it("날짜에 시각이 붙어 있어도 앞 10자리만 사용", () => {
    expect(buildPeriodKey("daily", "2026-08-18 09:00:00")).toBe("2026-08-18");
  });
});

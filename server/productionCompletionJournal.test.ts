import { describe, it, expect, afterEach } from "vitest";
import { isOnOrAfterStart, resolveBatchCost, journalMarker, productionJournalStartDate, isProductionJournalEnabled, DEFAULT_START_DATE } from "./lib/production/productionCompletionJournal";

describe("productionCompletionJournal — 정책/순수 함수", () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; });

  it("전기 시작일: 기본값, env 지정, 잘못된 env 는 기본값", () => {
    delete process.env.PRODUCTION_JOURNAL_START_DATE;
    expect(productionJournalStartDate()).toBe(DEFAULT_START_DATE);
    process.env.PRODUCTION_JOURNAL_START_DATE = "2026-11-01";
    expect(productionJournalStartDate()).toBe("2026-11-01");
    process.env.PRODUCTION_JOURNAL_START_DATE = "nope";
    expect(productionJournalStartDate()).toBe(DEFAULT_START_DATE);
  });

  it("활성 플래그 기본 true, false/0/off 로 끔", () => {
    delete process.env.PRODUCTION_JOURNAL_ENABLED;
    expect(isProductionJournalEnabled()).toBe(true);
    process.env.PRODUCTION_JOURNAL_ENABLED = "false";
    expect(isProductionJournalEnabled()).toBe(false);
  });

  it("시작일 비교: 소급 없음 (이전 완료 배치는 false)", () => {
    expect(isOnOrAfterStart("2026-10-11 23:59:00", "2026-10-12")).toBe(false);
    expect(isOnOrAfterStart("2026-10-12 00:00:00", "2026-10-12")).toBe(true);
    expect(isOnOrAfterStart(new Date("2026-10-20T03:00:00Z"), "2026-10-12")).toBe(true);
    expect(isOnOrAfterStart(null, "2026-10-12")).toBe(false);
  });

  it("금액: material_cost → actual_cost → 투입 합계, 전부 0 이면 0 (전기 안 함)", () => {
    expect(resolveBatchCost({ material_cost: "7268.4" }, 999)).toBe(7268.4);
    expect(resolveBatchCost({ material_cost: null, actual_cost: "3556" }, 999)).toBe(3556);
    expect(resolveBatchCost({ material_cost: 0, actual_cost: 0 }, 26917.199999)).toBe(26917.2);
    expect(resolveBatchCost({}, 0)).toBe(0);
  });

  it("멱등 마커는 배치 id 를 포함하고 접두 매칭에 안전", () => {
    expect(journalMarker(1100)).toBe("[생산완료] BATCH-1100");
  });
});

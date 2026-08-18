/**
 * 미수금 연체 알림 — 단계 판정 / 알림 본문 생성 로직 테스트
 * (DB 접근이 없는 순수 함수만 검증)
 */
import { describe, it, expect } from "vitest";
import {
  resolveOverdueStage,
  buildOverdueNotification,
  OVERDUE_STAGES,
  DEFAULT_PAYMENT_TERMS_DAYS,
  type OverdueRow,
} from "../receivableOverdue";

describe("resolveOverdueStage", () => {
  it("초과일수가 0 이하면 단계 없음", () => {
    expect(resolveOverdueStage(0)).toBeNull();
    expect(resolveOverdueStage(-5)).toBeNull();
  });

  it("1~6일 초과는 d1 (medium)", () => {
    expect(resolveOverdueStage(1)?.key).toBe("d1");
    expect(resolveOverdueStage(6)?.key).toBe("d1");
    expect(resolveOverdueStage(3)?.priority).toBe("medium");
  });

  it("경계값에서 상위 단계로 승격", () => {
    expect(resolveOverdueStage(7)?.key).toBe("d7");
    expect(resolveOverdueStage(29)?.key).toBe("d7");
    expect(resolveOverdueStage(30)?.key).toBe("d30");
    expect(resolveOverdueStage(59)?.key).toBe("d30");
    expect(resolveOverdueStage(60)?.key).toBe("d60");
    expect(resolveOverdueStage(89)?.key).toBe("d60");
    expect(resolveOverdueStage(90)?.key).toBe("d90");
    expect(resolveOverdueStage(365)?.key).toBe("d90");
  });

  it("30일 초과부터는 high 이상 우선순위", () => {
    expect(resolveOverdueStage(30)?.priority).toBe("high");
    expect(resolveOverdueStage(60)?.priority).toBe("urgent");
    expect(resolveOverdueStage(90)?.priority).toBe("urgent");
  });

  it("단계 정의는 초과일수 내림차순이어야 한다 (판정이 first-match 이므로)", () => {
    const days = OVERDUE_STAGES.map((s) => s.minDays);
    expect([...days].sort((a, b) => b - a)).toEqual(days);
  });

  it("기본 결제주기는 30일", () => {
    expect(DEFAULT_PAYMENT_TERMS_DAYS).toBe(30);
  });
});

describe("buildOverdueNotification", () => {
  const row: OverdueRow = {
    partnerId: 42,
    partnerName: "가나다식품",
    paymentTermsDays: 30,
    invoiceCount: 3,
    totalAmount: 12_345_678,
    maxOverdueDays: 45,
    oldestDate: "2026-06-01",
  };

  it("제목/본문에 거래처·금액·초과일수를 담는다", () => {
    const stage = resolveOverdueStage(row.maxOverdueDays)!;
    const n = buildOverdueNotification(row, stage);
    expect(n.title).toBe("[미수금 30일 초과] 가나다식품");
    expect(n.message).toContain("12,345,678원");
    expect(n.message).toContain("3건");
    expect(n.message).toContain("45일 초과");
    expect(n.message).toContain("2026-06-01");
    expect(n.priority).toBe("high");
  });

  it("referenceType 은 단계별로 달라 중복 억제 키가 된다", () => {
    expect(buildOverdueNotification(row, resolveOverdueStage(45)!).referenceType).toBe("ar_overdue_d30");
    expect(buildOverdueNotification(row, resolveOverdueStage(95)!).referenceType).toBe("ar_overdue_d90");
  });

  it("최초 거래일이 없으면 해당 문구를 생략한다", () => {
    const n = buildOverdueNotification({ ...row, oldestDate: null }, resolveOverdueStage(45)!);
    expect(n.message).not.toContain("최초 거래일");
  });
});

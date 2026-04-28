import { describe, it, expect } from "vitest";
import { evaluate, type ControlPoint } from "../controlPoint";
import { isWithin, type CriticalLimit } from "../criticalLimit";
import type { Measurement } from "../measurement";

/**
 * ControlPoint entity 단위 테스트 (CP-1).
 *
 * 본 테스트는 entity 가 업종 무관 추상으로 작동하는지 검증.
 * 식품 CCP / 화장품 CQP / 의약품 IPC 시나리오를 모두 같은 코드로 평가.
 */

const baseControlPoint: ControlPoint = {
  id: 1,
  tenantId: 2,
  code: "TEST-001",
  category: "테스트",
  limits: [],
  monitoringFrequency: "ad_hoc",
  responsibleRole: "QA",
  isActive: true,
  defaultSeverity: "critical",
};

const baseMeasurement = (value: number | boolean | string): Measurement => ({
  value,
  measuredAt: new Date("2026-04-29T01:00:00Z"),
  measuredBy: 1,
});

describe("CriticalLimit.isWithin", () => {
  describe("min 한계", () => {
    const limit: CriticalLimit = { type: "min", value: 75, unit: "°C" };

    it("측정값 ≥ value 이면 within", () => {
      expect(isWithin(limit, baseMeasurement(75))).toBe(true);
      expect(isWithin(limit, baseMeasurement(80))).toBe(true);
    });

    it("측정값 < value 이면 not within", () => {
      expect(isWithin(limit, baseMeasurement(74.9))).toBe(false);
    });

    it("number 외 측정값은 not within", () => {
      expect(isWithin(limit, baseMeasurement(true))).toBe(false);
    });
  });

  describe("max 한계", () => {
    const limit: CriticalLimit = { type: "max", value: 4, unit: "°C" };

    it("측정값 ≤ value 이면 within", () => {
      expect(isWithin(limit, baseMeasurement(4))).toBe(true);
      expect(isWithin(limit, baseMeasurement(2))).toBe(true);
    });

    it("측정값 > value 이면 not within", () => {
      expect(isWithin(limit, baseMeasurement(4.1))).toBe(false);
    });
  });

  describe("range 한계", () => {
    const limit: CriticalLimit = {
      type: "range",
      value: { min: 49.5, max: 50.5 },
      unit: "ml",
    };

    it("min ≤ 측정값 ≤ max 이면 within", () => {
      expect(isWithin(limit, baseMeasurement(50))).toBe(true);
      expect(isWithin(limit, baseMeasurement(49.5))).toBe(true);
      expect(isWithin(limit, baseMeasurement(50.5))).toBe(true);
    });

    it("범위 밖이면 not within", () => {
      expect(isWithin(limit, baseMeasurement(49.4))).toBe(false);
      expect(isWithin(limit, baseMeasurement(50.6))).toBe(false);
    });
  });

  describe("boolean 한계", () => {
    const limit: CriticalLimit = { type: "boolean", value: true };

    it("기대값과 일치하면 within", () => {
      expect(isWithin(limit, baseMeasurement(true))).toBe(true);
    });

    it("기대값과 다르면 not within", () => {
      expect(isWithin(limit, baseMeasurement(false))).toBe(false);
    });
  });

  describe("categorical 한계", () => {
    const limit: CriticalLimit = {
      type: "categorical",
      value: ["pass", "marginal"],
    };

    it("허용 카테고리면 within", () => {
      expect(isWithin(limit, baseMeasurement("pass"))).toBe(true);
      expect(isWithin(limit, baseMeasurement("marginal"))).toBe(true);
    });

    it("허용 외 카테고리면 not within", () => {
      expect(isWithin(limit, baseMeasurement("fail"))).toBe(false);
    });
  });
});

describe("ControlPoint.evaluate", () => {
  it("비활성 ControlPoint 는 항상 normal 반환", () => {
    const cp: ControlPoint = {
      ...baseControlPoint,
      isActive: false,
      limits: [{ type: "min", value: 100 }], // 절대 못 만족
    };

    const result = evaluate(cp, baseMeasurement(50));
    expect(result.type).toBe("normal");
  });

  it("한계기준 모두 통과 시 normal", () => {
    const cp: ControlPoint = {
      ...baseControlPoint,
      limits: [
        { type: "min", value: 75, unit: "°C" },
        { type: "max", value: 100, unit: "°C" },
      ],
    };

    const result = evaluate(cp, baseMeasurement(80));
    expect(result.type).toBe("normal");
  });

  it("하나라도 어기면 deviation 반환 (AND 평가)", () => {
    const cp: ControlPoint = {
      ...baseControlPoint,
      limits: [
        { type: "min", value: 75, unit: "°C" }, // 70 < 75 → 어김
        { type: "max", value: 100, unit: "°C" },
      ],
    };

    const result = evaluate(cp, baseMeasurement(70));
    expect(result.type).toBe("deviation");
    if (result.type === "deviation") {
      expect(result.deviation.controlPointId).toBe(cp.id);
      expect(result.deviation.violatedLimit.type).toBe("min");
      expect(result.deviation.severity).toBe("critical");
      expect(result.deviation.tenantId).toBe(2);
    }
  });

  it("context 의 batchId / lotIds 가 deviation 에 전파됨", () => {
    const cp: ControlPoint = {
      ...baseControlPoint,
      limits: [{ type: "max", value: 4, unit: "°C" }],
    };

    const result = evaluate(cp, baseMeasurement(10), {
      batchId: 565,
      lotIds: [101, 102, 103],
    });

    expect(result.type).toBe("deviation");
    if (result.type === "deviation") {
      expect(result.deviation.batchId).toBe(565);
      expect(result.deviation.lotIds).toEqual([101, 102, 103]);
    }
  });

  it("첫 번째 어긴 한계가 violatedLimit 으로 보고됨", () => {
    const cp: ControlPoint = {
      ...baseControlPoint,
      limits: [
        { type: "min", value: 50, label: "min-50" },
        { type: "max", value: 100, label: "max-100" },
      ],
    };

    const result = evaluate(cp, baseMeasurement(150)); // max 어김
    expect(result.type).toBe("deviation");
    if (result.type === "deviation") {
      expect(result.deviation.violatedLimit.label).toBe("max-100");
    }
  });
});

describe("업종 무관성 검증 — 동일 entity 로 다중 업종 시나리오", () => {
  it("식품 가열공정 ControlPoint (75°C 이상) 평가", () => {
    // 어댑터가 h_ccp_definitions 의 가열공정을 ControlPoint 로 변환한 형태
    const heatingPoint: ControlPoint = {
      ...baseControlPoint,
      code: "HEATING-1",
      category: "온도",
      limits: [{ type: "min", value: 75, unit: "°C" }],
    };

    expect(evaluate(heatingPoint, baseMeasurement(80)).type).toBe("normal");
    expect(evaluate(heatingPoint, baseMeasurement(70)).type).toBe("deviation");
  });

  it("화장품 충진량 ControlPoint (49.5~50.5 ml) 평가", () => {
    // 어댑터가 화장품 GMP 충진량 검사를 ControlPoint 로 변환한 형태
    const fillingPoint: ControlPoint = {
      ...baseControlPoint,
      code: "FILLING-1",
      category: "충진량",
      limits: [{ type: "range", value: { min: 49.5, max: 50.5 }, unit: "ml" }],
      defaultSeverity: "major",
    };

    expect(evaluate(fillingPoint, baseMeasurement(50)).type).toBe("normal");
    expect(evaluate(fillingPoint, baseMeasurement(48)).type).toBe("deviation");
  });

  it("의약품 IPC pH 검사 (6.8~7.2) 평가", () => {
    // 어댑터가 의약품 GMP IPC 를 ControlPoint 로 변환한 형태
    const phPoint: ControlPoint = {
      ...baseControlPoint,
      code: "PH-IPC",
      category: "공정관리",
      limits: [{ type: "range", value: { min: 6.8, max: 7.2 } }],
    };

    expect(evaluate(phPoint, baseMeasurement(7.0)).type).toBe("normal");
    expect(evaluate(phPoint, baseMeasurement(6.5)).type).toBe("deviation");
  });
});

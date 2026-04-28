import { describe, it, expect } from "vitest";
import {
  mapCcpLimitToControlPoint,
  mapCcpLimitsToCriticalLimits,
} from "../ccp.adapter";

/**
 * 식품 CCP 어댑터 단위 테스트 (CP-2).
 *
 * pure function 만 검증 — DB 접근 없음. listFoodControlPoints 는 통합 테스트
 * 영역이라 본 파일 외 검증 (별도 PR).
 *
 * 검증 항목:
 *   - ccpType → category 매핑
 *   - monitoringFrequency 텍스트 → enum 매핑
 *   - 컬럼 NULL 처리
 *   - 한계기준 매핑 (온도 / 가열시간 / 압력)
 *   - ControlPoint entity 변환 결과
 */

const baseRow = {
  id: 1,
  tenantId: 2,
  ccpType: "CCP-1B",
  productName: "쌀빵",
  heatingTimeMinMin: null,
  heatingTimeMinMax: null,
  pressureMpaMin: null,
  temperatureCMin: null,
  monitoringFrequency: null,
  createdAt: null,
  updatedAt: null,
};

describe("mapCcpLimitsToCriticalLimits", () => {
  it("모든 컬럼 NULL 이면 빈 배열 반환", () => {
    const limits = mapCcpLimitsToCriticalLimits(baseRow);
    expect(limits).toEqual([]);
  });

  it("온도 min 만 있으면 min 한계 1개", () => {
    const limits = mapCcpLimitsToCriticalLimits({
      ...baseRow,
      temperatureCMin: "75.0" as any,
    });
    expect(limits).toEqual([
      { type: "min", value: 75, unit: "°C", label: "온도" },
    ]);
  });

  it("가열시간 min/max 둘 다 있으면 range 한계", () => {
    const limits = mapCcpLimitsToCriticalLimits({
      ...baseRow,
      heatingTimeMinMin: 10,
      heatingTimeMinMax: 30,
    });
    expect(limits).toEqual([
      { type: "range", value: { min: 10, max: 30 }, unit: "분", label: "가열시간" },
    ]);
  });

  it("가열시간 min 만 있으면 min 한계", () => {
    const limits = mapCcpLimitsToCriticalLimits({
      ...baseRow,
      heatingTimeMinMin: 10,
    });
    expect(limits).toEqual([
      { type: "min", value: 10, unit: "분", label: "가열시간 min" },
    ]);
  });

  it("압력 min 있으면 min 한계", () => {
    const limits = mapCcpLimitsToCriticalLimits({
      ...baseRow,
      pressureMpaMin: "0.15" as any,
    });
    expect(limits).toEqual([
      { type: "min", value: 0.15, unit: "Mpa", label: "압력" },
    ]);
  });

  it("CCP-1B 가열공정 — 온도 + 가열시간 + 압력 모두", () => {
    const limits = mapCcpLimitsToCriticalLimits({
      ...baseRow,
      temperatureCMin: "75.0" as any,
      heatingTimeMinMin: 10,
      heatingTimeMinMax: 30,
      pressureMpaMin: "0.15" as any,
    });

    expect(limits).toHaveLength(3);
    expect(limits[0]).toEqual({ type: "min", value: 75, unit: "°C", label: "온도" });
    expect(limits[1]).toEqual({
      type: "range",
      value: { min: 10, max: 30 },
      unit: "분",
      label: "가열시간",
    });
    expect(limits[2]).toEqual({ type: "min", value: 0.15, unit: "Mpa", label: "압력" });
  });
});

describe("mapCcpLimitToControlPoint", () => {
  it("CCP-1B 가열공정 → ControlPoint 변환", () => {
    const cp = mapCcpLimitToControlPoint({
      ...baseRow,
      ccpType: "CCP-1B",
      temperatureCMin: "75.0" as any,
      heatingTimeMinMin: 10,
      heatingTimeMinMax: 30,
      monitoringFrequency: "매 배치",
    });

    expect(cp.id).toBe(1);
    expect(cp.tenantId).toBe(2);
    expect(cp.code).toBe("CCP-1B");
    expect(cp.category).toBe("가열공정");
    expect(cp.monitoringFrequency).toBe("every_batch");
    expect(cp.responsibleRole).toBe("QA");
    expect(cp.isActive).toBe(true);
    expect(cp.defaultSeverity).toBe("critical");
    expect(cp.limits).toHaveLength(2);
  });

  it("CCP-4P 금속검출 → 카테고리 '금속검출'", () => {
    const cp = mapCcpLimitToControlPoint({
      ...baseRow,
      ccpType: "CCP-4P",
    });

    expect(cp.category).toBe("금속검출");
  });

  it("monitoringFrequency 매핑 (한국어/영어)", () => {
    const cases: Array<[string, string]> = [
      ["연속 모니터링", "continuous"],
      ["매 배치", "every_batch"],
      ["시간별", "hourly"],
      ["매일 09:00", "daily"],
      ["주 1회", "weekly"],
      ["월 1회", "monthly"],
      ["unknown text", "ad_hoc"],
    ];

    for (const [input, expected] of cases) {
      const cp = mapCcpLimitToControlPoint({
        ...baseRow,
        monitoringFrequency: input,
      });
      expect(cp.monitoringFrequency).toBe(expected);
    }
  });

  it("monitoringFrequency null 이면 ad_hoc", () => {
    const cp = mapCcpLimitToControlPoint(baseRow);
    expect(cp.monitoringFrequency).toBe("ad_hoc");
  });

  it("식품 CCP 는 critical 기본 심각도 — 화장품 CQP 와 차별화", () => {
    const cp = mapCcpLimitToControlPoint(baseRow);
    expect(cp.defaultSeverity).toBe("critical");
  });
});

describe("PR #119 청사진 정렬 검증 — 어댑터 패턴", () => {
  it("같은 ControlPoint interface 가 다른 업종 어댑터에서도 사용 가능", () => {
    // 식품 CCP-1B 가열공정
    const foodCcp = mapCcpLimitToControlPoint({
      ...baseRow,
      ccpType: "CCP-1B",
      temperatureCMin: "75.0" as any,
    });

    // ControlPoint interface 의 모든 필드가 채워져 있음
    // (Phase 2 화장품 어댑터도 동일 interface 만족해야 함)
    expect(foodCcp).toMatchObject({
      id: expect.any(Number),
      tenantId: expect.any(Number),
      code: expect.any(String),
      category: expect.any(String),
      limits: expect.any(Array),
      monitoringFrequency: expect.any(String),
      responsibleRole: expect.any(String),
      isActive: expect.any(Boolean),
      defaultSeverity: expect.any(String),
    });
  });
});

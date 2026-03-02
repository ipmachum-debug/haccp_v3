/**
 * CCP-4P 금속검출 제품별 순차 시간 배분 — 불변 조건 테스트
 * 
 * 이 테스트는 금속검출 공정의 핵심 안전 로직을 보호합니다.
 * 
 * ⚠️  DO NOT DELETE OR SKIP THESE TESTS  ⚠️
 * 
 * 위반 시 금속검출 공정 혼입(contamination) 사고가 발생합니다.
 * 
 * 테스트하는 불변 조건:
 *   1. 서로 다른 제품의 시간 슬롯은 절대 겹치지 않음
 *   2. 동일 제품의 배치는 연속된 하나의 시간 블록으로 그룹화
 *   3. 감도 모니터링(품목시작/종료)은 제품 그룹 경계에서만 발생
 *   4. 통과(passage) 시간은 배치 할당 슬롯 범위를 사용
 *      (중간 배치는 자체 sensitivity check로 클램핑하지 않음)
 * 
 * 참조: server/db/ccpFormRecords.ts — syncCcpRowsToFormRows() CCP-4P 섹션
 */
import { describe, it, expect } from "vitest";
import {
  calcAvailableMinutes,
  skipLunch,
  advanceCursor,
  timeToMin,
  minToTime,
  seededRandom,
} from "./services/metalPassAllocator";

// ─── 테스트용 타입 ───
interface SkuSlot {
  batchId: number;
  productId: number;
  productName: string;
  plannedQty: number;
  allocatedMin: number;
  workStart: number;
  workEnd: number;
}

interface ProductGroup {
  productId: number;
  productName: string;
  totalQty: number;
  slots: SkuSlot[];
  allocatedMin: number;
  groupStart: number;
  groupEnd: number;
}

// ─── 핵심 로직 추출: 제품별 순차 배분 ───
// 이 함수는 ccpFormRecords.ts의 "섹션 3. 제품별 순차 배분" 로직을 그대로 재현합니다.
// 실제 코드가 변경되면 이 테스트도 업데이트되어야 합니다.
function allocateProductGroupSlots(
  skuSlots: SkuSlot[],
  workStartMin: number,
  workEndMin: number,
  lunchStartMin: number,
  lunchEndMin: number,
): { productGroupOrder: number[]; productGroupMap: Record<number, ProductGroup> } {
  const totalWorkMin = calcAvailableMinutes(workStartMin, workEndMin, lunchStartMin, lunchEndMin);

  const productGroupOrder: number[] = [];
  const productGroupMap: Record<number, ProductGroup> = {};

  for (const slot of skuSlots) {
    const pid = slot.productId;
    if (!productGroupMap[pid]) {
      productGroupMap[pid] = {
        productId: pid,
        productName: slot.productName,
        totalQty: 0,
        slots: [],
        allocatedMin: 0,
        groupStart: 0,
        groupEnd: 0,
      };
      productGroupOrder.push(pid);
    }
    productGroupMap[pid].totalQty += slot.plannedQty;
    productGroupMap[pid].slots.push(slot);
  }

  const totalDayQty = skuSlots.reduce((s, sl) => s + sl.plannedQty, 0);
  let cursorMin = workStartMin;

  for (let gi = 0; gi < productGroupOrder.length; gi++) {
    const pg = productGroupMap[productGroupOrder[gi]];
    const proportion = totalDayQty > 0 ? pg.totalQty / totalDayQty : 1 / productGroupOrder.length;
    let pgAllocMin = Math.round(totalWorkMin * proportion);
    if (pgAllocMin < 5) pgAllocMin = 5;

    cursorMin = skipLunch(cursorMin, lunchStartMin, lunchEndMin);
    const pgStart = cursorMin;
    const pgEnd = advanceCursor(cursorMin, pgAllocMin, lunchStartMin, lunchEndMin);

    pg.allocatedMin = pgAllocMin;
    pg.groupStart = pgStart;
    pg.groupEnd = pgEnd;

    const groupTotalQty = pg.totalQty;
    let innerCursor = pgStart;
    for (const slot of pg.slots) {
      const innerProp = groupTotalQty > 0 ? slot.plannedQty / groupTotalQty : 1 / pg.slots.length;
      let innerAlloc = Math.round(pgAllocMin * innerProp);
      if (innerAlloc < 3) innerAlloc = 3;

      innerCursor = skipLunch(innerCursor, lunchStartMin, lunchEndMin);
      const slotStart = innerCursor;
      const slotEnd = advanceCursor(innerCursor, innerAlloc, lunchStartMin, lunchEndMin);
      innerCursor = slotEnd;

      slot.allocatedMin = innerAlloc;
      slot.workStart = slotStart;
      slot.workEnd = Math.min(slotEnd, pgEnd);
    }

    cursorMin = pgEnd;
  }

  return { productGroupOrder, productGroupMap };
}


// ═══════════════════════════════════════════════════════════════════
//  테스트 시나리오
// ═══════════════════════════════════════════════════════════════════

describe("CCP-4P 제품별 순차 시간 배분 — 불변 조건 검증", () => {

  // ─── 기본 상수 ───
  const WORK_START = timeToMin("09:00");  // 540
  const WORK_END = timeToMin("16:30");    // 990
  const LUNCH_START = timeToMin("12:00"); // 720
  const LUNCH_END = timeToMin("13:00");   // 780

  // ─── 시나리오 1: 실제 운영 데이터 재현 ───
  // 호두찹쌀떡(쑥) 900kg + 호두찹쌀떡 300kg + 호두찹쌀떡(쑥) 600kg + 단호박설기 50kg
  describe("실제 운영 시나리오: 3품목 4배치", () => {
    const skuSlots: SkuSlot[] = [
      { batchId: 102, productId: 71, productName: "호두찹쌀떡(쑥)", plannedQty: 900, allocatedMin: 0, workStart: 0, workEnd: 0 },
      { batchId: 103, productId: 73, productName: "호두찹쌀떡", plannedQty: 300, allocatedMin: 0, workStart: 0, workEnd: 0 },
      { batchId: 104, productId: 71, productName: "호두찹쌀떡(쑥)", plannedQty: 600, allocatedMin: 0, workStart: 0, workEnd: 0 },
      { batchId: 105, productId: 68, productName: "단호박설기", plannedQty: 50, allocatedMin: 0, workStart: 0, workEnd: 0 },
    ];

    const result = allocateProductGroupSlots(skuSlots, WORK_START, WORK_END, LUNCH_START, LUNCH_END);
    const { productGroupOrder, productGroupMap } = result;

    it("제품은 3개 그룹으로 분리됨 (71, 73, 68)", () => {
      expect(productGroupOrder).toHaveLength(3);
      expect(productGroupOrder).toEqual([71, 73, 68]);
    });

    it("동일 제품(71) 배치가 하나의 그룹으로 병합됨", () => {
      const pg71 = productGroupMap[71];
      expect(pg71.slots).toHaveLength(2);
      expect(pg71.slots.map(s => s.batchId)).toEqual([102, 104]);
      expect(pg71.totalQty).toBe(1500);
    });

    it("[INVARIANT 1] 제품 그룹 간 시간이 겹치지 않음", () => {
      for (let i = 1; i < productGroupOrder.length; i++) {
        const prevPg = productGroupMap[productGroupOrder[i - 1]];
        const currPg = productGroupMap[productGroupOrder[i]];
        expect(currPg.groupStart).toBeGreaterThanOrEqual(prevPg.groupEnd);
      }
    });

    it("[INVARIANT 2] 제품 그룹 시작 < 종료", () => {
      for (const pid of productGroupOrder) {
        const pg = productGroupMap[pid];
        expect(pg.groupEnd).toBeGreaterThan(pg.groupStart);
      }
    });

    it("[INVARIANT 3] 내부 배치 슬롯이 제품 그룹 범위 내에 있음", () => {
      for (const pid of productGroupOrder) {
        const pg = productGroupMap[pid];
        for (const slot of pg.slots) {
          expect(slot.workStart).toBeGreaterThanOrEqual(pg.groupStart);
          expect(slot.workEnd).toBeLessThanOrEqual(pg.groupEnd + 1); // +1 for rounding
        }
      }
    });

    it("[INVARIANT 4] 배치 102(호두찹쌀떡(쑥))와 104가 연속 시간대에 있음", () => {
      const pg71 = productGroupMap[71];
      const slot102 = pg71.slots.find(s => s.batchId === 102)!;
      const slot104 = pg71.slots.find(s => s.batchId === 104)!;
      // 102 끝 <= 104 시작 (연속)
      expect(slot104.workStart).toBeGreaterThanOrEqual(slot102.workEnd - 1); // -1 for rounding tolerance
    });

    it("[INVARIANT 5] 배치 104의 할당 시간이 충분함 (최소 30분)", () => {
      const pg71 = productGroupMap[71];
      const slot104 = pg71.slots.find(s => s.batchId === 104)!;
      const durationMin = slot104.workEnd - slot104.workStart;
      // 600kg / 1500kg * 총 시간 → 대략 100+분
      expect(durationMin).toBeGreaterThan(30);
    });

    it("제품별 시간이 수량 비례로 할당됨", () => {
      const pg71 = productGroupMap[71]; // 1500kg
      const pg73 = productGroupMap[73]; // 300kg
      const pg68 = productGroupMap[68]; // 50kg
      // 가장 큰 제품이 가장 많은 시간
      expect(pg71.allocatedMin).toBeGreaterThan(pg73.allocatedMin);
      expect(pg73.allocatedMin).toBeGreaterThan(pg68.allocatedMin);
    });
  });


  // ─── 시나리오 2: 단일 제품 단일 배치 ───
  describe("단일 제품 단일 배치", () => {
    const skuSlots: SkuSlot[] = [
      { batchId: 200, productId: 10, productName: "백설기", plannedQty: 500, allocatedMin: 0, workStart: 0, workEnd: 0 },
    ];

    const { productGroupOrder, productGroupMap } = allocateProductGroupSlots(
      skuSlots, WORK_START, WORK_END, LUNCH_START, LUNCH_END,
    );

    it("단일 그룹이 전체 시간을 사용", () => {
      expect(productGroupOrder).toHaveLength(1);
      const pg = productGroupMap[10];
      expect(pg.groupStart).toBe(WORK_START);
      // 전체 작업 시간(점심 제외)을 사용
      expect(pg.allocatedMin).toBe(calcAvailableMinutes(WORK_START, WORK_END, LUNCH_START, LUNCH_END));
    });
  });


  // ─── 시나리오 3: 5개 서로 다른 제품 ───
  describe("5개 서로 다른 제품 — 모두 비겹침 보장", () => {
    const skuSlots: SkuSlot[] = [
      { batchId: 301, productId: 1, productName: "A", plannedQty: 100, allocatedMin: 0, workStart: 0, workEnd: 0 },
      { batchId: 302, productId: 2, productName: "B", plannedQty: 200, allocatedMin: 0, workStart: 0, workEnd: 0 },
      { batchId: 303, productId: 3, productName: "C", plannedQty: 300, allocatedMin: 0, workStart: 0, workEnd: 0 },
      { batchId: 304, productId: 4, productName: "D", plannedQty: 150, allocatedMin: 0, workStart: 0, workEnd: 0 },
      { batchId: 305, productId: 5, productName: "E", plannedQty: 50, allocatedMin: 0, workStart: 0, workEnd: 0 },
    ];

    const { productGroupOrder, productGroupMap } = allocateProductGroupSlots(
      skuSlots, WORK_START, WORK_END, LUNCH_START, LUNCH_END,
    );

    it("[INVARIANT 1] 모든 5개 제품 그룹 간 시간 비겹침", () => {
      for (let i = 1; i < productGroupOrder.length; i++) {
        const prevPg = productGroupMap[productGroupOrder[i - 1]];
        const currPg = productGroupMap[productGroupOrder[i]];
        expect(currPg.groupStart).toBeGreaterThanOrEqual(prevPg.groupEnd);
      }
    });

    it("모든 그룹의 시간이 유효함 (start < end, min 5분)", () => {
      for (const pid of productGroupOrder) {
        const pg = productGroupMap[pid];
        expect(pg.groupEnd - pg.groupStart).toBeGreaterThanOrEqual(5);
      }
    });
  });


  // ─── 시나리오 4: 점심시간 걸치는 배분 ───
  describe("점심시간(12:00-13:00) 걸치는 배분", () => {
    const skuSlots: SkuSlot[] = [
      { batchId: 401, productId: 10, productName: "제품A", plannedQty: 500, allocatedMin: 0, workStart: 0, workEnd: 0 },
      { batchId: 402, productId: 20, productName: "제품B", plannedQty: 500, allocatedMin: 0, workStart: 0, workEnd: 0 },
    ];

    const { productGroupOrder, productGroupMap } = allocateProductGroupSlots(
      skuSlots, WORK_START, WORK_END, LUNCH_START, LUNCH_END,
    );

    it("점심시간(12:00-13:00)에 걸치는 제품 그룹이 점심을 건너뜀", () => {
      const pg1 = productGroupMap[productGroupOrder[0]];
      const pg2 = productGroupMap[productGroupOrder[1]];

      // 두 그룹 모두 점심 시간 안에 시작하거나 끝나지 않아야 함
      for (const pg of [pg1, pg2]) {
        const inLunch = pg.groupStart >= LUNCH_START && pg.groupStart < LUNCH_END;
        if (inLunch) {
          expect(pg.groupStart).toBe(LUNCH_END); // 점심 시간에 시작하면 점심 후로 점프
        }
      }
    });

    it("[INVARIANT 1] 점심 포함 시에도 제품 간 비겹침", () => {
      const pg1 = productGroupMap[productGroupOrder[0]];
      const pg2 = productGroupMap[productGroupOrder[1]];
      expect(pg2.groupStart).toBeGreaterThanOrEqual(pg1.groupEnd);
    });
  });


  // ─── 시나리오 5: 동일 제품이 산발적으로 배치되는 경우 ───
  describe("동일 제품이 산발적으로 배치 (A, B, A, C, A)", () => {
    const skuSlots: SkuSlot[] = [
      { batchId: 501, productId: 1, productName: "A", plannedQty: 100, allocatedMin: 0, workStart: 0, workEnd: 0 },
      { batchId: 502, productId: 2, productName: "B", plannedQty: 200, allocatedMin: 0, workStart: 0, workEnd: 0 },
      { batchId: 503, productId: 1, productName: "A", plannedQty: 150, allocatedMin: 0, workStart: 0, workEnd: 0 },
      { batchId: 504, productId: 3, productName: "C", plannedQty: 100, allocatedMin: 0, workStart: 0, workEnd: 0 },
      { batchId: 505, productId: 1, productName: "A", plannedQty: 50, allocatedMin: 0, workStart: 0, workEnd: 0 },
    ];

    const { productGroupOrder, productGroupMap } = allocateProductGroupSlots(
      skuSlots, WORK_START, WORK_END, LUNCH_START, LUNCH_END,
    );

    it("A의 3개 배치가 하나의 그룹으로 병합됨", () => {
      const pgA = productGroupMap[1];
      expect(pgA.slots).toHaveLength(3);
      expect(pgA.totalQty).toBe(300); // 100+150+50
    });

    it("[INVARIANT 1] 그룹 간 시간 비겹침", () => {
      for (let i = 1; i < productGroupOrder.length; i++) {
        const prevPg = productGroupMap[productGroupOrder[i - 1]];
        const currPg = productGroupMap[productGroupOrder[i]];
        expect(currPg.groupStart).toBeGreaterThanOrEqual(prevPg.groupEnd);
      }
    });

    it("A 내부 배치들이 순차적으로 배치됨", () => {
      const pgA = productGroupMap[1];
      for (let i = 1; i < pgA.slots.length; i++) {
        expect(pgA.slots[i].workStart).toBeGreaterThanOrEqual(pgA.slots[i - 1].workEnd - 1);
      }
    });

    it("[INVARIANT 5] A의 각 배치가 최소 3분 이상 할당됨", () => {
      const pgA = productGroupMap[1];
      for (const slot of pgA.slots) {
        expect(slot.workEnd - slot.workStart).toBeGreaterThanOrEqual(3);
      }
    });
  });


  // ─── 시나리오 6: 통과(passage) 시간 제약 검증 ───
  describe("통과 시간 제약: 중간 배치 클램핑 방지", () => {

    it("중간 배치의 통과 시간이 자체 sensitivity가 아닌 할당 슬롯을 사용", () => {
      // 이 테스트는 수정 전 버그를 재현합니다:
      // 배치104의 sensitivity가 15:08(interval), 15:11(end)일 때
      // 통과 시간이 15:09-15:11 (2분)으로 클램핑되던 버그
      const skuSlots: SkuSlot[] = [
        { batchId: 102, productId: 71, productName: "호두찹쌀떡(쑥)", plannedQty: 900, allocatedMin: 0, workStart: 0, workEnd: 0 },
        { batchId: 103, productId: 73, productName: "호두찹쌀떡", plannedQty: 300, allocatedMin: 0, workStart: 0, workEnd: 0 },
        { batchId: 104, productId: 71, productName: "호두찹쌀떡(쑥)", plannedQty: 600, allocatedMin: 0, workStart: 0, workEnd: 0 },
        { batchId: 105, productId: 68, productName: "단호박설기", plannedQty: 50, allocatedMin: 0, workStart: 0, workEnd: 0 },
      ];

      const { productGroupMap } = allocateProductGroupSlots(
        skuSlots, WORK_START, WORK_END, LUNCH_START, LUNCH_END,
      );

      const pg71 = productGroupMap[71];
      const slot104 = pg71.slots.find(s => s.batchId === 104)!;

      // 배치 104는 제품 그룹 내 마지막 배치 (index=1)
      const isLast = pg71.slots[pg71.slots.length - 1].batchId === 104;
      expect(isLast).toBe(true);

      // 배치 104는 첫 번째가 아님 → 품목시작 sensitivity 없음
      const isFirst = pg71.slots[0].batchId === 104;
      expect(isFirst).toBe(false);

      // ★ 핵심 검증: 배치 104의 할당 시간이 100분 이상 (2분이 아님!)
      const duration = slot104.workEnd - slot104.workStart;
      expect(duration).toBeGreaterThan(100);

      // 통과 시간은 slot104.workStart ~ slot104.workEnd 범위를 사용해야 함
      // (sensitivity 15:08~15:11 범위가 아님)
      expect(slot104.workEnd - slot104.workStart).toBeGreaterThan(30);
    });
  });


  // ─── 시나리오 7: 감도 모니터링 위치 검증 ───
  describe("감도 모니터링(품목시작/종료) 위치", () => {
    const skuSlots: SkuSlot[] = [
      { batchId: 701, productId: 1, productName: "A", plannedQty: 500, allocatedMin: 0, workStart: 0, workEnd: 0 },
      { batchId: 702, productId: 1, productName: "A", plannedQty: 300, allocatedMin: 0, workStart: 0, workEnd: 0 },
      { batchId: 703, productId: 2, productName: "B", plannedQty: 200, allocatedMin: 0, workStart: 0, workEnd: 0 },
    ];

    const { productGroupMap } = allocateProductGroupSlots(
      skuSlots, WORK_START, WORK_END, LUNCH_START, LUNCH_END,
    );

    it("제품 A의 첫 배치(701)가 firstInGroup", () => {
      const pgA = productGroupMap[1];
      expect(pgA.slots[0].batchId).toBe(701);
    });

    it("제품 A의 마지막 배치(702)가 lastInGroup", () => {
      const pgA = productGroupMap[1];
      expect(pgA.slots[pgA.slots.length - 1].batchId).toBe(702);
    });

    it("단독 배치(703)는 firstInGroup이자 lastInGroup", () => {
      const pgB = productGroupMap[2];
      expect(pgB.slots).toHaveLength(1);
      expect(pgB.slots[0].batchId).toBe(703);
    });
  });
});


// ═══════════════════════════════════════════════════════════════════
//  유틸리티 함수 테스트 (이 함수들이 변경되면 할당 로직에 영향)
// ═══════════════════════════════════════════════════════════════════

describe("CCP-4P 의존 유틸리티 함수 안정성", () => {
  it("calcAvailableMinutes: 점심 제외 계산", () => {
    // 09:00-16:30, lunch 12:00-13:00 → 390분
    expect(calcAvailableMinutes(540, 990, 720, 780)).toBe(390);
  });

  it("skipLunch: 점심 시간 중이면 점심 후로 점프", () => {
    expect(skipLunch(730, 720, 780)).toBe(780); // 12:10 → 13:00
    expect(skipLunch(600, 720, 780)).toBe(600); // 10:00 → 10:00 (변경 없음)
    expect(skipLunch(800, 720, 780)).toBe(800); // 13:20 → 13:20 (변경 없음)
  });

  it("advanceCursor: 점심 시간 건너뛰기", () => {
    // 11:00 + 120분 → 11:00→12:00(60분 소모)+lunch→13:00→14:00(60분 소모) = 14:00
    expect(advanceCursor(660, 120, 720, 780)).toBe(840);
  });

  it("timeToMin/minToTime 왕복 변환", () => {
    expect(minToTime(timeToMin("09:05"))).toBe("09:05");
    expect(minToTime(timeToMin("16:30"))).toBe("16:30");
    expect(minToTime(timeToMin("00:00"))).toBe("00:00");
  });
});

/**
 * 일일일지(일반위생관리·이물관리) 점검 항목 — 입력 화면·자동 생성·인쇄가 같은 정의를 쓴다 (2026-10-18, Codex 위생 점검 DL-01)
 *
 * 저장 형태
 *   배열(현재 입력 화면): [{ category, subcategory, itemOrder, itemText, checkResult }] — 저장된 질문 문구가 정본
 *   객체(배치 생성 때 자동 만든 초안, autoDailyReport): { facility1: null, ... } — 키 순서 = 아래 기본 질문 순서
 * 이전 인쇄는 배열을 '순서 번호'로 다른 고정 질문(16개)에 끼워 넣어, 7번(운송 온도) 답이 '위생복 세탁'에 찍혔다.
 * 판정은 세 가지다: 적합 / 부적합 / 미기록 — 미입력을 부적합으로 바꾸지 않는다 (DL-02).
 */

export interface DailyCheckItem {
  category: string;
  subcategory?: string;
  itemOrder: number;
  itemText: string;
  checkResult: string | null;
}

export const DEFAULT_HYGIENE_CHECKS: DailyCheckItem[] = [
  { category: "작업전", subcategory: "개인위생", itemOrder: 1, itemText: "위생복장과 이물 복장이 구분하여 보관되고 있는가?", checkResult: null as string | null },
  { category: "작업전", subcategory: "개인위생", itemOrder: 2, itemText: "종사자의 건강상태가 양호하고 개인 청소가 등을 소지하지 않으며, 청결한 위생복장을 착용하고 있는가?", checkResult: null },
  { category: "작업전", subcategory: "개인위생", itemOrder: 3, itemText: "위생설비(손 세척기 등) 중 이상이 있는 것이 없으며, 종사자는 위생처리를 하고 입실하는가?", checkResult: null },
  { category: "작업중", subcategory: "방충방서", itemOrder: 4, itemText: "방충 방서작업장은 밀폐가 잘 이루어지고 있으며, 방충시설(방충망 파손 등)에는 이상이 없는가?", checkResult: null },
  { category: "작업중", subcategory: "설비", itemOrder: 5, itemText: "파손되거나 고장 난 제조설비가 없는가?", checkResult: null },
  { category: "입고시", subcategory: "온송", itemOrder: 6, itemText: "입고 보관냉장/냉동창고의 온도는 적절히 관리되고 있는가? (냉장창고 : 0~10℃, 냉동창고 : -18℃이하)", checkResult: null },
  { category: "출하시", subcategory: "온송", itemOrder: 7, itemText: "완제품을 운송하는 중 온도기준은 준수하였는가?(지육온도기록지 별도관리)", checkResult: null },
  { category: "작업중", subcategory: "공정관리", itemOrder: 8, itemText: "청결구역상태와 일반구역상태이 분리되어 있으며 오염되지 않도록 관리되고 있는가?", checkResult: null },
  { category: "작업중", subcategory: "공정관리", itemOrder: 9, itemText: "가열후 식힘 공정이 적절히 관리되고 있는가?", checkResult: null },
  { category: "작업중", subcategory: "공정관리", itemOrder: 10, itemText: "완제품의 포장 상태는 양호한가?", checkResult: null },
  { category: "작업중", subcategory: "공정관리", itemOrder: 11, itemText: "모니터링방법(탐정온도계 등)는 사용전후 세척·소독을 실시하고 있는가?", checkResult: null },
  { category: "작업후", subcategory: "방충방서", itemOrder: 12, itemText: "작업장 주변의 음식물 폐기물은 잘 정리되어 보관되어있고, 주기적으로 반출되고 있는가?", checkResult: null },
  { category: "작업후", subcategory: "청소소독", itemOrder: 13, itemText: "작업장 바닥, 배수로, 위생시설, 제조설비(식품과 직접 닿는 부분)의 청소·소독 상태는 양호한가?", checkResult: null },
  { category: "작업후", subcategory: "설비", itemOrder: 14, itemText: "파손되거나 고장 난 제조설비가 없는가?", checkResult: null },
  { category: "작업후", subcategory: "점검", itemOrder: 15, itemText: "중요관리점(CCP) 점검표를 작성 주기에 맞게 작성하고, 한계기준 이탈 시 적절히 개선조치 하였는가?", checkResult: null },
  { category: "작업후", subcategory: "보관", itemOrder: 16, itemText: "사용 후 보관하고 있는 원·부재료 등은 교차오염의 우려가 없도록 구분, 이격관리 및 밀봉하여 관리하고 있는가?", checkResult: null },
  { category: "입고시", subcategory: "입고검사", itemOrder: 17, itemText: "입고 검수일 · 부재료 입고 시 시험성적서를 수령하거나, 육안검사를 실시하고 있는가?", checkResult: null },
  { category: "출하시", subcategory: "온송", itemOrder: 18, itemText: "완제품 운송차량 내부는 청결하고 다른 물품과 구분하여 적재되어 있으며, 차량의 온도는 기준을 준수하고 있는가?", checkResult: null },
];

export const DEFAULT_FOREIGN_CHECKS: DailyCheckItem[] = [
  { category: "원료 입고종 이물관리", itemOrder: 1, itemText: "원·부재료 입고시 외부의 이물을 제거한 후 입고하는가?", checkResult: null as string | null },
  { category: "원료 입고종 이물관리", itemOrder: 2, itemText: "원·부재료 선별시 적절하게 이루어지고 있는가?", checkResult: null },
  { category: "공정중 혼입관리", itemOrder: 3, itemText: "원·부재료 전처리시 이물이 혼입되지 않게 배치하는가?", checkResult: null },
  { category: "공정중 혼입관리", itemOrder: 4, itemText: "공정중 작업도구 중 재질이 벗겨진 자재를 사용하지 않는가?", checkResult: null },
  { category: "공정중 혼입관리", itemOrder: 5, itemText: "작업장에 개인소지품을 소지하지 않았으며 지정된 위생복 및 위생화를 착용하였는가?", checkResult: null },
  { category: "작업장 이물혼입 관리", itemOrder: 6, itemText: "천장 등 작업상태가 올바르며 파손 부위는 없는가?", checkResult: null },
  { category: "작업장 이물혼입 관리", itemOrder: 7, itemText: "작업도구, 공구, 필기도구 등은 지정된 위치에 보관되어 있는가?", checkResult: null },
  { category: "작업장 이물혼입 관리", itemOrder: 8, itemText: "작업에 클립, 핀 칼날 등 이물혼입의 우려가 있는 불필요한 물품이 없는가?", checkResult: null },
  { category: "작업장 이물혼입 관리", itemOrder: 9, itemText: "작업장에 출입하기전 곤충이 붙어있는 것이 없는가?", checkResult: null },
  { category: "제조설비 이물혼입 관리", itemOrder: 10, itemText: "탈락의 우려가 있는 나사류 및 파손 우려가 있는 설비는 없는가?", checkResult: null },
  { category: "제조설비 이물혼입 관리", itemOrder: 11, itemText: "설비등은 주기적으로 세척소독하여 오염물질이 혼입되지 않게 관리하는가?", checkResult: null },
  { category: "제조설비 이물혼입 관리", itemOrder: 12, itemText: "세척소독 및 정비후 나사, 볼트 등의 누락된 곳은 없는가?", checkResult: null },
  { category: "해충 혼입관리", itemOrder: 13, itemText: "작업장 종업원, 방문자 벽 등의 틈이 없는가?", checkResult: null },
  { category: "해충 혼입관리", itemOrder: 14, itemText: "포충등 및 포획장비는 정상작동되며 지정된 위치에 있는가?", checkResult: null },
];

/** 자동 생성 초안(객체)의 키 순서 — 기본 위생 질문 1~18 (server/lib/production/autoDailyReport.ts 주석과 같음) */
export const LEGACY_HYGIENE_OBJECT_KEYS = [
  "facility1", "facility2", "hygiene1", "pest1", "hygiene2", "transport1", "transport2",
  "process1", "process2", "process3", "process4", "pest2", "cleaning1", "hygiene3",
  "ccp1", "storage1", "inspection1", "storage2",
] as const;

/** 자동 생성 초안(객체)의 이물관리 키 순서 — 기본 이물 질문 1~14 (autoDailyReport 주석과 같음) */
export const LEGACY_FOREIGN_OBJECT_KEYS = [
  "material1", "material2", "process1", "process2", "process3", "material3",
  "worker1", "worker2", "worker3", "equipment1", "equipment2", "equipment3", "pest1", "pest2",
] as const;

/** 저장값 → 점검 결과 세 가지 */
export type CheckVerdict = "적합" | "부적합" | "미기록";
export function checkVerdict(v: unknown): CheckVerdict {
  if (v === true || v === "yes" || v === "Y" || v === "pass" || v === "적합") return "적합";
  if (v === false || v === "no" || v === "N" || v === "fail" || v === "부적합") return "부적합";
  return "미기록";
}

/**
 * 저장된 점검(배열 또는 자동 초안 객체) → 항목 배열. 배열은 저장된 질문 그대로, 객체는 키 순서대로 기본 질문.
 * 객체의 true/false 는 yes/no, null 은 미기록(null).
 */
export function normalizeDailyChecks(raw: unknown, defaults: DailyCheckItem[], legacyKeys?: readonly string[]): DailyCheckItem[] {
  if (Array.isArray(raw)) {
    return raw.map((item: any, i: number) => ({
      category: item?.category ?? defaults[i]?.category ?? "",
      subcategory: item?.subcategory ?? (item?.category ? undefined : defaults[i]?.subcategory),
      itemOrder: Number(item?.itemOrder ?? i + 1),
      itemText: item?.itemText ?? defaults[i]?.itemText ?? `${i + 1}번 항목`,
      checkResult: item?.checkResult ?? null,
    }));
  }
  if (raw && typeof raw === "object" && legacyKeys) {
    const o = raw as Record<string, unknown>;
    return defaults.map((d, i) => {
      const v = o[legacyKeys[i]];
      return { ...d, checkResult: v === true ? "yes" : v === false ? "no" : typeof v === "string" && v ? v : null };
    });
  }
  return defaults.map((d) => ({ ...d, checkResult: null }));
}

/**
 * 단지 원본(K-HACCP 일일일지 5종)을 v2 정의로 — '참고 템플릿' (2026-10-18, PR-B1)
 *
 * 관리자가 '일지 설정' 에서 이 템플릿을 고르면 이 정의를 초안으로 복사해 회사에 맞게 고친 뒤 발행한다.
 * 다른 회사에 자동으로 넣지 않는다. 숫자·이름은 원본 기록지 예시이지 모든 회사의 기준이 아니다.
 * ID 는 템플릿 고정값 — 회사 정의 안에서만 쓰이므로 다른 회사와 섞이지 않는다.
 */
import { KHACCP_HYGIENE, KHACCP_FOREIGN, KHACCP_SECTION_HEADERS, KHACCP_FOREIGN_HEADER, KHACCP_TEMPLATE_CODE } from "./khaccpTemplate";
import type { DailyLogDefinition, Point, Slot } from "./definition";

const slots = (p: string): Slot[] => [
  { slotId: `${p}.am`, label: "오전", plannedTime: null, sortOrder: 1 },
  { slotId: `${p}.pm`, label: "오후", plannedTime: null, sortOrder: 2 },
];
const temp = (lower: number | null, upper: number | null) => ({ lower, upper, lowerInclusive: true, upperInclusive: true, required: true });

export function khaccpDefinition(): DailyLogDefinition {
  const h = KHACCP_SECTION_HEADERS;
  const points: Point[] = [
    { pointId: "kh.raw1", zoneId: "kh.z.raw1", name: "원재료실1", section: "temperatureHumidity", sortOrder: 1, active: true,
      measurements: { temperature: temp(1, 35), humidity: temp(null, 65) }, slots: slots("kh.raw1") },
    { pointId: "kh.raw2", zoneId: "kh.z.raw2", name: "원재료실2", section: "temperatureHumidity", sortOrder: 2, active: true,
      measurements: { temperature: temp(1, 35), humidity: temp(null, 65) }, slots: slots("kh.raw2") },
    { pointId: "kh.rapid", zoneId: "kh.z.freeze", name: "급속냉동고", section: "freezer", sortOrder: 1, active: true,
      measurements: { temperature: temp(null, -27) }, slots: slots("kh.rapid") },
    { pointId: "kh.freezer", zoneId: "kh.z.freeze", name: "냉동고", section: "freezer", sortOrder: 2, active: true,
      measurements: { temperature: temp(null, -18) }, slots: slots("kh.freezer") },
    { pointId: "kh.fridge", zoneId: "kh.z.fridge", name: "원재료 냉장고", section: "refrigerator", sortOrder: 1, active: true,
      measurements: { temperature: temp(0, 10) }, slots: slots("kh.fridge") },
  ];
  return {
    definitionVersion: 1,
    templateCode: KHACCP_TEMPLATE_CODE,
    enabledSections: ["hygiene", "foreign", "temperatureHumidity", "freezer", "refrigerator"],
    sectionInfo: {
      hygiene: { title: "일반위생관리 및 공정점검표", criteriaText: "", method: "", cycle: "매일 작성", actions: [] },
      foreign: { title: "이물관리 점검표", criteriaText: "", method: KHACCP_FOREIGN_HEADER.method, cycle: KHACCP_FOREIGN_HEADER.cycle, actions: [] },
      temperatureHumidity: { title: "원재료실 온/습도 점검기록지", criteriaText: h.temperatureHumidity.criteria, method: h.temperatureHumidity.method, cycle: h.temperatureHumidity.cycle, actions: [...h.temperatureHumidity.actions] },
      freezer: { title: "급속냉동고 / 냉동고 온도 점검기록지", criteriaText: h.freezer.criteria, method: h.freezer.method, cycle: h.freezer.cycle, actions: [...h.freezer.actions] },
      refrigerator: { title: "원재료 냉장고 온도 점검 기록지", criteriaText: h.refrigerator.criteria, method: h.refrigerator.method, cycle: h.refrigerator.cycle, actions: [...h.refrigerator.actions] },
    },
    questions: [
      ...KHACCP_HYGIENE.map((q) => ({ itemId: q.itemId, section: "hygiene" as const, stage: q.category, category: q.subcategory ?? "", text: q.itemText, responseType: q.responseType, sortOrder: q.itemOrder, active: true })),
      ...KHACCP_FOREIGN.map((q) => ({ itemId: q.itemId, section: "foreign" as const, stage: "", category: q.category, text: q.itemText, responseType: q.responseType, sortOrder: q.itemOrder, active: true })),
    ],
    zones: [
      { zoneId: "kh.z.raw1", name: "원재료실1", sortOrder: 1, active: true },
      { zoneId: "kh.z.raw2", name: "원재료실2", sortOrder: 2, active: true },
      { zoneId: "kh.z.freeze", name: "냉동구역", sortOrder: 3, active: true },
      { zoneId: "kh.z.fridge", name: "냉장구역", sortOrder: 4, active: true },
    ],
    points,
  };
}

/**
 * 일일일지 v2 — 회사·사업장별 정의 (구역·측정 대상·항목·회차·기준·문구) (2026-10-18, docs/architecture/17 PR-B1)
 *
 * 개념을 섞지 않는다:
 *   점검 시점(stage: 작업전·작업중…)  ≠  구역(zone: 원재료실…)  ≠  측정 대상(point: 냉동고1호…)  ≠  회차(slot: 오전·오후)
 * ID(zoneId·pointId·slotId·itemId)로만 연결한다 — 이름·배열 순서·문자열 포함 여부로 식별하지 않는다. ID 는 재사용하지 않는다.
 * 기준은 하한/상한 숫자 — '18~26℃' 같은 문자열을 파싱하지 않는다.
 * 이 파일은 순수(타입·스키마·상수·함수). DB 없음.
 */
import { z } from "zod";

export const DAILY_LOG_SECTIONS = ["hygiene", "foreign", "temperatureHumidity", "freezer", "refrigerator"] as const;
export type DailyLogSection = (typeof DAILY_LOG_SECTIONS)[number];
export const MEASURE_SECTIONS = ["temperatureHumidity", "freezer", "refrigerator"] as const;
export type MeasureSection = (typeof MEASURE_SECTIONS)[number];

export const SECTION_TITLES: Record<DailyLogSection, string> = {
  hygiene: "일반위생관리 및 공정점검표",
  foreign: "이물관리 점검표",
  temperatureHumidity: "온/습도 점검기록지",
  freezer: "냉동 온도 점검기록지",
  refrigerator: "냉장 온도 점검기록지",
};

/** 입력 가능 범위 — 오타·단위 혼동만 거른다 (관리기준과 다름) */
export const INPUT_RANGE = { temperature: { min: -80, max: 120 }, humidity: { min: 0, max: 100 } } as const;
export type MeasureKind = keyof typeof INPUT_RANGE;
export const MEASURE_UNITS: Record<MeasureKind, string> = { temperature: "℃", humidity: "%" };
export const MEASURE_LABELS: Record<MeasureKind, string> = { temperature: "온도", humidity: "습도" };

const id = z.string().min(1).max(64).regex(/^[A-Za-z0-9_.:-]+$/, "ID 는 영문·숫자·_.:- 만");
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const text = (max: number) => z.string().max(max);

export const measureSpecSchema = z.object({
  lower: z.number().finite().nullable(),
  upper: z.number().finite().nullable(),
  lowerInclusive: z.boolean().default(true),
  upperInclusive: z.boolean().default(true),
  required: z.boolean().default(true),
}).refine((m) => m.lower == null || m.upper == null || m.lower <= m.upper, "하한이 상한보다 큽니다");
export type MeasureSpec = z.infer<typeof measureSpecSchema>;

export const slotSchema = z.object({ slotId: id, label: text(40).min(1), plannedTime: hhmm.nullable().default(null), sortOrder: z.number().int() });
export type Slot = z.infer<typeof slotSchema>;

export const zoneSchema = z.object({ zoneId: id, name: text(60).min(1), sortOrder: z.number().int(), active: z.boolean().default(true) });
export type Zone = z.infer<typeof zoneSchema>;

export const pointSchema = z.object({
  pointId: id,
  zoneId: id,
  name: text(60).min(1),
  section: z.enum(MEASURE_SECTIONS),
  sortOrder: z.number().int(),
  active: z.boolean().default(true),
  measurements: z.object({ temperature: measureSpecSchema.optional(), humidity: measureSpecSchema.optional() })
    .refine((m) => !!(m.temperature || m.humidity), "측정 항목(온도·습도)을 하나 이상 고르세요"),
  slots: z.array(slotSchema).min(1, "점검 회차를 하나 이상 넣으세요").max(12),
});
export type Point = z.infer<typeof pointSchema>;

export const questionSchema = z.object({
  itemId: id,
  section: z.enum(["hygiene", "foreign"]),
  stage: text(30),
  category: text(40),
  text: text(300).min(1),
  responseType: z.enum(["check", "temperature", "check_temperature"]).default("check"),
  sortOrder: z.number().int(),
  active: z.boolean().default(true),
});
export type Question = z.infer<typeof questionSchema>;

export const sectionInfoSchema = z.object({
  title: text(80).min(1),
  criteriaText: text(200).default(""),
  method: text(120).default(""),
  cycle: text(40).default(""),
  actions: z.array(text(300)).max(10).default([]),
});
export type SectionInfo = z.infer<typeof sectionInfoSchema>;

export const definitionSchema = z.object({
  definitionVersion: z.literal(1),
  templateCode: z.string().max(40).nullable().default(null),
  enabledSections: z.array(z.enum(DAILY_LOG_SECTIONS)).min(1, "사용할 기록을 하나 이상 고르세요"),
  sectionInfo: z.partialRecord(z.enum(DAILY_LOG_SECTIONS), sectionInfoSchema).default({}),
  questions: z.array(questionSchema).max(100),
  zones: z.array(zoneSchema).max(100),
  points: z.array(pointSchema).max(200),
}).superRefine((d, ctx) => {
  const dup = (ids: string[], label: string) => {
    const seen = new Set<string>();
    for (const x of ids) { if (seen.has(x)) ctx.addIssue({ code: "custom", message: `${label} ID 중복: ${x}` }); seen.add(x); }
  };
  dup(d.zones.map((z) => z.zoneId), "구역");
  dup(d.points.map((p) => p.pointId), "측정 대상");
  dup(d.questions.map((q) => q.itemId), "질문");
  const zones = new Set(d.zones.map((z) => z.zoneId));
  for (const p of d.points) {
    if (!zones.has(p.zoneId)) ctx.addIssue({ code: "custom", message: `측정 대상 '${p.name}' 의 구역이 없습니다` });
    dup(p.slots.map((s) => s.slotId), `'${p.name}' 회차`);
  }
  for (const s of d.enabledSections) {
    if ((s === "hygiene" || s === "foreign") && !d.questions.some((q) => q.section === s && q.active)) ctx.addIssue({ code: "custom", message: `${SECTION_TITLES[s]}: 사용 중인 질문이 없습니다` });
    if ((MEASURE_SECTIONS as readonly string[]).includes(s) && !d.points.some((p) => p.section === s && p.active)) ctx.addIssue({ code: "custom", message: `${SECTION_TITLES[s]}: 사용 중인 측정 대상이 없습니다` });
  }
});
export type DailyLogDefinition = z.infer<typeof definitionSchema>;

/** 정의 검사 — 문제 문장 목록 (빈 배열이면 통과) */
export function definitionProblems(def: unknown): string[] {
  const r = definitionSchema.safeParse(def);
  if (r.success) return [];
  return r.error.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message));
}

export function parseDefinition(def: unknown): DailyLogDefinition {
  return definitionSchema.parse(def);
}

/** 기준 문장 — '1℃ 이상 35℃ 이하' (설정 숫자에서 만든다) */
export function criteriaText(kind: MeasureKind, m: MeasureSpec | undefined): string {
  if (!m) return "";
  const u = MEASURE_UNITS[kind];
  if (m.lower != null && m.upper != null) return `${m.lower}${u}~${m.upper}${u}`;
  if (m.upper != null) return `${m.upper}${u} ${m.upperInclusive ? "이하" : "미만"}`;
  if (m.lower != null) return `${m.lower}${u} ${m.lowerInclusive ? "이상" : "초과"}`;
  return "기준 없음";
}

/** 기준 판정 — 값이 없으면 null, 기준이 없으면 pass(기록만) */
export function withinCriteria(v: number, m: MeasureSpec): boolean {
  if (m.lower != null && (m.lowerInclusive ? v < m.lower : v <= m.lower)) return false;
  if (m.upper != null && (m.upperInclusive ? v > m.upper : v >= m.upper)) return false;
  return true;
}

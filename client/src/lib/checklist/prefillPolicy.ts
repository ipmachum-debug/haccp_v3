/**
 * 일지 자동 채움 정책 (일지 PR 2, 2026-10-15)
 *
 * 이전 기록을 참고해 "새 일지" 를 만들 때 무엇을 가져오고 무엇을 비우는지 한 곳에서 정한다.
 *   가져온다: 장소·설비·구역·점검 항목·기준·반복 문구·명단 (기록의 뼈대)
 *   비운다 (오늘 다시 확인):
 *     - 판정 — 적합/부적합/O/X/양호/불량/정상/이상/예/아니오 … 값은 "" (미확인). 복사로 판정을 확정하지 않는다
 *     - 측정값 — 온도·습도·결과·측정·포획 수 등 (칸 이름으로 판단). 이전 값은 참고값으로 따로 돌려준다
 *     - 체크(true) — 지난 기록의 "실시함" 체크는 false (미확인)
 *     - 날짜 — 본문 안의 YYYY-MM-DD 는 새 기록일로
 *     - 서명·확인자·승인자·개선조치·기준이탈 — 그날의 일이므로 비움
 *   그대로 둔다: 0·false 가 아닌 뼈대 값, "N/A"(해당 없음), 숫자 id·순번
 * 양식이 config.prefill 로 칸을 더 지정할 수 있다 (keep / clear).
 */

export const JUDGMENT_TOKENS = new Set([
  "적합", "부적합", "O", "X", "○", "×", "양호", "불량", "정상", "이상", "예", "아니오", "있음", "없음",
  "yes", "no", "pass", "fail", "ok", "ng", "합격", "불합격", "확인", "미확인",
]);

/** 측정값 칸 — 이름(경로의 어느 부분이든)이 이 패턴이면 숫자·글자 값을 비운다 */
const MEASURE_KEY = /(temp|humid|measure|reading|result|count|value|lux|ph$|chlorine|bacteria|weight|pressure|level|amount|pests?|total|측정|결과|온도|습도|수치|포획|중량|잔류)/i;
/** 기준 칸 — 측정 패턴에 걸려도 남긴다 */
const STANDARD_KEY = /(standard|criteria|criterion|limit|spec|target|min|max|range|기준|규격|한계)/i;
/** 그날의 사람 확인·조치 — 비운다 */
const DAY_ONLY_KEY = /(signature|sign$|서명|confirmer|확인자|approver|verifier|corrective|actions?$|deviation|조치|이탈|improvement)/i;
/** 뼈대 식별 — 절대 비우지 않음 */
const KEEP_KEY = /^(id|key|seq|no|order|sortOrder|index|code)$/i;

const YMD = /^\d{4}-\d{2}-\d{2}/;

export type ClearedValue = { path: string; label: string; value: unknown; kind: "judgment" | "measurement" | "check" | "date" | "dayOnly" };

export type PrefillResult = {
  data: Record<string, unknown>;
  cleared: ClearedValue[];
  counts: Record<ClearedValue["kind"], number>;
};

export type PrefillOptions = {
  /** 새 기록일 (본문 안 날짜를 이것으로) */
  recordDate: string;
  /** 지우지 않고 그대로 가져올 칸 이름 (양식별) */
  keep?: readonly string[];
  /** 추가로 비울 칸 이름 (양식별) */
  clear?: readonly string[];
};

/** 공통 미리 채우기에서 통째로 빼는 최상위 칸 (새 문서 기준) */
const DROP_TOP = ["id", "approval", "status", "createdAt", "updatedAt", "formDate"];

/** 참고값 표시용 칸 이름 (모르는 칸은 원래 이름) */
const FRIENDLY: Record<string, string> = {
  judgment: "판정", result: "결과", decision: "판정", tempResult: "온도", humidityResult: "습도", measurement: "측정값",
  temperature: "온도", humidity: "습도", bacteriaCount: "세균수", captureCount: "포획 수", flyingTotal: "비래해충 계",
  crawlingTotal: "보행해충 계", flyingPests: "비래해충", crawlingPests: "보행해충", value: "값", count: "수", answers: "답변",
};
const friendly = (k: string) => FRIENDLY[k] ?? k;

/** 배열 행의 사람이 알아볼 이름 (참고값 표시용) */
function rowLabel(row: unknown): string | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  for (const k of ["area", "location", "zone", "설비명", "equipmentName", "name", "item", "checkItem", "label", "installLocation", "productName"]) {
    const v = r[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

export function sanitizeForPrefill(source: Record<string, unknown> | null | undefined, opts: PrefillOptions): PrefillResult {
  const cleared: ClearedValue[] = [];
  const keep = new Set(opts.keep ?? []);
  const clear = new Set(opts.clear ?? []);

  const walk = (v: unknown, key: string, path: string, labelPath: string[], parentKeys: string[]): unknown => {
    const keyPath = [...parentKeys, key];
    const label = [...labelPath, friendly(key)].filter(Boolean).join(" · ");
    if (keep.has(key)) return v;
    if (Array.isArray(v)) {
      return v.map((item, i) => walk(item, "", `${path}[${i}]`, [...labelPath, rowLabel(item) ?? `${i + 1}행`], keyPath));
    }
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, child] of Object.entries(v as Record<string, unknown>)) {
        // 중첩 객체(해충 종류·답변 등)는 그 이름을 앞에 붙인다 — 배열 이름(spaceRows 등)은 빼고 행 이름만
        out[k] = walk(child, k, path ? `${path}.${k}` : k, key && labelPath.length > 0 ? [...labelPath, friendly(key)] : labelPath, keyPath);
      }
      return out;
    }
    if (KEEP_KEY.test(key)) return v;

    const record = (kind: ClearedValue["kind"], next: unknown) => {
      cleared.push({ path, label, value: v, kind });
      return next;
    };

    if (clear.has(key)) return record("dayOnly", typeof v === "boolean" ? false : "");
    if (typeof v === "string" && YMD.test(v)) return record("date", opts.recordDate);
    if (key && DAY_ONLY_KEY.test(key) && v !== "" && v != null && v !== false) return record("dayOnly", typeof v === "boolean" ? false : "");
    if (typeof v === "string" && JUDGMENT_TOKENS.has(v.trim())) return record("judgment", "");
    if (typeof v === "boolean") return v ? record("check", false) : v;
    const measuredPath = keyPath.some((k) => k && MEASURE_KEY.test(k) && !STANDARD_KEY.test(k));
    if (measuredPath && (typeof v === "number" || (typeof v === "string" && v.trim() !== ""))) {
      return record("measurement", typeof v === "number" ? "" : "");
    }
    return v;
  };

  const src: Record<string, unknown> = { ...(source ?? {}) };
  for (const k of DROP_TOP) delete src[k];
  const data = walk(src, "", "", [], []) as Record<string, unknown>;
  const counts = { judgment: 0, measurement: 0, check: 0, date: 0, dayOnly: 0 };
  for (const c of cleared) counts[c.kind]++;
  return { data, cleared, counts };
}

/** 안내 문구 — 무엇을 가져오고 무엇을 비웠는지 (부분 복원을 성공처럼 감추지 않는다) */
export function describePrefill(counts: PrefillResult["counts"]): string {
  const parts: string[] = [];
  if (counts.judgment) parts.push(`판정 ${counts.judgment}건`);
  if (counts.measurement) parts.push(`측정값 ${counts.measurement}건`);
  if (counts.check) parts.push(`체크 ${counts.check}건`);
  if (counts.dayOnly) parts.push(`서명·조치 ${counts.dayOnly}건`);
  return parts.length ? `${parts.join(", ")}은 비웠습니다 — 오늘 확인해 입력하세요.` : "비운 값은 없습니다.";
}

/**
 * 같은 날 여러 장 작성이 정상인 일지 (사건·입고·교육 단위). 나머지는 하루 한 장이 기본 —
 * 오늘 기록이 있으면 이어쓰기를 먼저 권하고, 새로 만들 때 한 번 더 묻는다.
 */
export const MULTIPLE_PER_DAY = new Set([
  "capa_record", "quality_issue_record", "foreign_material_record", "consumer_complaint", "food_recall_notice",
  "packaging_storage_record", "training_log", "product_test_report", "product_test_log", "supplier_inspection",
  "handover_document", "equipment_history", "validity_evaluation", "daily_disposal_record", "air_compressor_maintenance",
]);

export const entryPolicyOf = (formType: string): "single" | "multiple" => (MULTIPLE_PER_DAY.has(formType) ? "multiple" : "single");

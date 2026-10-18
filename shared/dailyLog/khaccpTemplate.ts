/**
 * 일일일지 원본 템플릿 — K-HACCP 「일반위생관리 및 공정점검표」 5종 (2026-10-18, PR-A · docs/architecture/17)
 *
 * 근거: 단지 제공 원본 「일일일지 수정.pdf」 (2026-02-26 기록) 를 그림으로 렌더링해 문구·분류·칸을 대조했다.
 * 적용 범위 (Codex 재검토 P1·P2):
 *   - 이 템플릿을 **켠 회사**(tenant_feature_settings: DAILY_LOG_TEMPLATE_KHACCP_V1)의 **새로 만드는 일지**에만.
 *     만들 때 form_data.templateCode = "khaccp_daily_v1" 을 서버가 찍는다. 화면이 보낸 값은 쓰지 않는다.
 *   - templateCode 가 없는 기록(과거 기록·승인 기록 포함)은 이전 정의·이전 인쇄 그대로 — 소급하지 않는다.
 *   - 켜지 않은 회사는 기존 기본 질문(shared/dailyLogChecks)과 기존 인쇄 문구 그대로.
 * 질문·기준·개선조치 문구는 원본에서 고치지 않는다. 회사별 편집은 PR-D(설정 화면)에서.
 *
 * 운송 온도 (원본 그대로 두 가지 칸):
 *   7번  — 예/아니오 없이 ℃ 값만 기록 (responseType "temperature")
 *   18번 — 예/아니오 + ℃ 값 (responseType "check_temperature")
 *   새 기록: 숫자 또는 '운송 없음'(사유 필수). 빈칸·'-' 는 제출할 수 없다.
 *   과거 기록의 '-' 는 과거 표시 그대로 (이 템플릿 기록이 아니므로 검사 대상 아님).
 */
import type { DailyCheckItem } from "../dailyLogChecks";

export const KHACCP_TEMPLATE_CODE = "khaccp_daily_v1";
export const KHACCP_TEMPLATE_FEATURE = "DAILY_LOG_TEMPLATE_KHACCP_V1";

export type ResponseType = "check" | "temperature" | "check_temperature";

export interface TemplateCheckItem extends DailyCheckItem {
  itemId: string;
  responseType: ResponseType;
  /** 온도 칸 키 — 과거 기록과 같은 이름 (transportTemp / vehicleTemp) */
  tempKey?: "transportTemp" | "vehicleTemp";
}

const H = (n: number, category: string, subcategory: string, itemText: string, responseType: ResponseType = "check", tempKey?: TemplateCheckItem["tempKey"]): TemplateCheckItem =>
  ({ itemId: `H${String(n).padStart(2, "0")}`, itemOrder: n, category, subcategory, itemText, checkResult: null, responseType, ...(tempKey ? { tempKey } : {}) });
const F = (n: number, category: string, itemText: string): TemplateCheckItem =>
  ({ itemId: `F${String(n).padStart(2, "0")}`, itemOrder: n, category, itemText, checkResult: null, responseType: "check" });

/** 일반위생관리 및 공정점검표 (매일 작성) — 원본 18문항 */
export const KHACCP_HYGIENE: readonly TemplateCheckItem[] = Object.freeze([
  H(1, "작업전", "개인위생", "위생복장과 외출 복장이 구분하여 보관되고 있는가?"),
  H(2, "작업전", "개인위생", "종사자의 건강상태가 양호하고 개인 장신구 등을 소지하지 않으며, 청결한 위생복장을 착용하고 작업하고 있는가?"),
  H(3, "작업전", "개인위생", "위생설비(손 세척기 등) 중 이상이 있는 것이 없으며, 종사자는 위생처리를 하고 입실하는가?"),
  H(4, "작업전", "방충 방서", "작업장은 밀폐가 잘 이루어지고 있으며, 방충시설(방충망 파손 등)에는 이상이 없는가?"),
  H(5, "작업전", "설비", "파손되거나 고장 난 제조설비가 없는가?"),
  H(6, "작업전", "입고 보관", "냉장/냉동창고의 온도는 적절히 관리되고 있는가? (냉장창고 : 0~10℃, 냉동창고 : -18℃이하)"),
  H(7, "작업전", "운송", "완제품을 운송하는 중 온도기준을 준수하였는가?(자동온도기록지 별도관리)", "temperature", "transportTemp"),
  H(8, "작업중", "공정관리", "청결구역작업과 일반구역작업이 분리되어 있으며 오염되지 않도록 관리되고 있는가?"),
  H(9, "작업중", "공정관리", "가열후 식힘 공정이 적절히 관리되고 있는가?"),
  H(10, "작업중", "공정관리", "완제품의 포장 상태는 양호한가?"),
  H(11, "작업중", "공정관리", "모니터링장비(탐침온도계 등)는 사용전후 세척·소독을 실시하고 있는가?"),
  H(12, "작업후", "방충방서", "작업장 주변의 음식물 폐기물은 잘 정리되어 보관되어지고 있고, 주기적으로 반출되고 있는가?"),
  H(13, "작업후", "청소소독", "작업장 바닥, 배수로, 위생시설, 제조설비(식품과 직접 닿는 부분)의 청소·소독 상태는 양호한가?"),
  H(14, "작업후", "설비", "파손되거나 고장 난 제조설비가 없는가?"),
  H(15, "작업후", "점검", "중요관리점(CCP) 점검표를 작성 주기에 맞게 작성하고, 한계기준 이탈 시 적절히 개선조치 하였는가?"),
  H(16, "작업후", "보관", "사용 후 보관하고 있는 원·부재료 등은 교차오염의 우려가 없도록 구분, 이격관리 및 밀봉하여 관리하고 있는가?"),
  H(17, "입고시", "입고 검수", "원·부재료 입고 시 시험성적서를 수령하거나, 육안검사를 실시하고 있는가?"),
  H(18, "출하시", "운송", "완제품 운송차량 내부는 청결하고 다른 물품과 구분하여 적재되어 있으며, 차량의 온도는 기준을 준수하고 있는가?", "check_temperature", "vehicleTemp"),
]);

/** 이물관리 점검표 — 원본 14문항 */
export const KHACCP_FOREIGN: readonly TemplateCheckItem[] = Object.freeze([
  F(1, "원료 입고중 이물관리", "원·부자재 입고시 외부의 이물을 제거한 후 입고하는가?"),
  F(2, "원료 입고중 이물관리", "원·부자재 선별시 적합하게 이루어지고 있는가?"),
  F(3, "공정중 혼입관리", "원·부재료 전처리시 연질·경질이물이 혼입되지 않게 폐기하는가?"),
  F(4, "공정중 혼입관리", "공정중 이용하는 작업도구 중 재질이 벗겨진 자재를 사용하지 않는가?"),
  F(5, "작업자에 의한 이물혼입 관리", "작업장에 개인소지품등을 소지하지 않았으며 지정된 위생복 및 위생화등을 착용하였는가?"),
  F(6, "작업자에 의한 이물혼입 관리", "장갑 등 착용상태가 올바르며 파손 부위는 없는가?"),
  F(7, "작업자에 의한 이물혼입 관리", "작업도구, 공구, 필기도구 등은 지정된 위치에 보관되어 있는가?"),
  F(8, "작업자에 의한 이물혼입 관리", "작업에 클립, 핀 칼날등 이물혼입 우려가 있는 불필요한 물품이 없는가?"),
  F(9, "작업자에 의한 이물혼입 관리", "작업장에 출입하기전 끈끈이 롤러등 이물제거 후 입실하는가?"),
  F(10, "제조설비에 의한 이물혼입 관리", "탈락의 우려가 있는 나사류 및 파손 우려가 있는 설비는 없는가?"),
  F(11, "제조설비에 의한 이물혼입 관리", "설비등은 주기적으로 세척소독하여 오염물질이 혼입되지 않게 관리하는가?"),
  F(12, "제조설비에 의한 이물혼입 관리", "세척소독 및 정비후 나사, 볼트 등의 누락된 곳은 없는가?"),
  F(13, "해충등 혼입관리", "작업장 출입문, 외부의 벽 등은 틈이나 구멍이 없이 밀폐되어있는가?"),
  F(14, "해충등 혼입관리", "포충등 및 포획장비는 정상작동되며 지정된 위치가 있는가?"),
]);

export const KHACCP_FOREIGN_HEADER = Object.freeze({ method: "육안검사", cycle: "1회 / 일" });

export interface SectionHeader {
  criteria: string;
  method: string;
  cycle: string;
  actions: readonly string[];
}

/** 온습도·냉동·냉장 머리 정보 — 원본 문구 그대로 */
export const KHACCP_SECTION_HEADERS: Readonly<Record<"temperatureHumidity" | "freezer" | "refrigerator", SectionHeader>> = Object.freeze({
  temperatureHumidity: {
    criteria: "온도: 1℃~35℃, 습도: 65%이하",
    method: "생산팀담당자가 관찰 수치 기록",
    cycle: "일2회",
    actions: [
      "1.온도/습도의관리 기준미달시 원재료를 다른 보관실로 이동하고 에어컨과 온/습도기 검사실시",
      "2.에어컨 작동상태와 온도/습도기 등을 정비하고 이동보관한 원재료는 검사후 부적합이면 폐기",
      "3.온도/습도 이상 또는 설비(에어컨) 고장시 생산팀장에게 통보, 응급조치하고 원인을 파악하여 보수/수리",
    ],
  },
  freezer: {
    criteria: "급속냉동고: -27℃ 이하, 냉동고: -18℃이하",
    method: "생산팀 담당자가 관찰수치 기록",
    cycle: "일2회",
    actions: [
      "1.온도의 관리기준 미달시 원재료를 다른 보관실로 이동하고 온도기와 냉동고 또는 급속냉동고 검사실시",
      "2.냉동고와 급속냉동고의 작동상태와 온도기 등을 정비하고 이동보관한 원재료는 검사후 부적합이면 폐기",
      "3.온도 이상 또는 냉동고 고장시 생산팀장에게 통보, 응급조치하고 원인을 파악하여 보수/수리",
    ],
  },
  refrigerator: {
    criteria: "온도: 0 ℃~10 ℃",
    method: "생산팀 담당자가 관찰수치 기록",
    cycle: "일2회",
    actions: [
      "1. 온도의 관리기준 미달시 원재료를 다른 보관실로 이동하고 냉장고 검사실시",
      "2. 냉장고를 정비하고 이동보관한 원재료는 검사후 부적합이면 폐기",
      "3. 냉장고의 이상 또는 고장시 생산팀장에게 통보, 응급조치하고 원인을 파악하여 보수/수리",
    ],
  },
});

/** 이 기록이 원본 템플릿으로 만든 기록인가 (서버가 생성 때 찍은 값만 본다) */
export function isKhaccpRecord(formData: any): boolean {
  return formData?.templateCode === KHACCP_TEMPLATE_CODE;
}

/** 새 원본 템플릿 일지의 위생·이물 기본 항목 (답·온도 비움) */
export function khaccpDefaultChecks(): { hygieneChecks: any[]; foreignMaterialChecks: any[] } {
  return {
    hygieneChecks: KHACCP_HYGIENE.map((x) => ({ ...x, ...(x.tempKey ? { [x.tempKey]: null, notApplicable: false, notApplicableReason: "" } : {}) })),
    foreignMaterialChecks: KHACCP_FOREIGN.map((x) => ({ ...x })),
  };
}

const isNum = (v: unknown) => v !== null && v !== undefined && String(v).trim() !== "" && Number.isFinite(Number(v));

/**
 * 원본 템플릿 기록의 제출 전 검사 — 운송 온도 칸 (숫자 또는 '운송 없음'+사유). 빈 배열이면 통과.
 *   과거 기록(templateCode 없음)은 검사하지 않는다 — 과거 '-' 표시는 그대로 둔다.
 */
export function khaccpSubmitIssues(formData: any): string[] {
  if (!isKhaccpRecord(formData)) return [];
  const out: string[] = [];
  const items: any[] = Array.isArray(formData?.hygieneChecks) ? formData.hygieneChecks : [];
  for (const def of KHACCP_HYGIENE.filter((d) => d.tempKey)) {
    const it = items.find((x) => x?.itemId === def.itemId);
    const label = `위생 ${def.itemOrder}번(${def.subcategory})`;
    if (!it) { out.push(`${label} 항목이 없습니다.`); continue; }
    const v = it[def.tempKey!];
    if (it.notApplicable === true) {
      if (!String(it.notApplicableReason ?? "").trim()) out.push(`${label}: '운송 없음' 사유를 입력하세요.`);
      if (isNum(v)) out.push(`${label}: '운송 없음' 인데 온도가 입력돼 있습니다 — 하나만 선택하세요.`);
      continue;
    }
    if (!isNum(v)) out.push(`${label}: 온도(℃)를 숫자로 입력하거나 '운송 없음'과 사유를 선택하세요.`);
    if (def.responseType === "check_temperature" && it.checkResult !== "yes" && it.checkResult !== "no") out.push(`${label}: 예/아니오를 선택하세요.`);
  }
  return out;
}

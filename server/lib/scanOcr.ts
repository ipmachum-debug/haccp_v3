/**
 * 스캔 OCR + AI 구조화 파이프라인 (Enhanced v2)
 *
 * 강화된 기능:
 * 1. 이미지 전처리 (Sharp) — 회전보정, 대비강화, 선명화
 * 2. 다중 페이지 PDF 처리
 * 3. CCP 타입별 전문 프롬프트 + 기대값 범위 주입
 * 4. 필드별 신뢰도 점수 (0~1)
 * 5. 이중 패스 검증 (불확실 필드 재인식)
 * 6. 매입전표 인식 지원
 */
import fs from "fs";
import { execSync } from "child_process";
import path from "path";
import { findApiKeyWithDiagnostics, ENV } from "../_core/env";

// ─────────────────────────────────────────────────────────────
// PR-AL-2026-05-27: OpenAI SDK 제거 → llm.ts 와 동일한 fetch 패턴
// ─────────────────────────────────────────────────────────────
// 진단 체인 회고:
//   PR-AH(#344): 진단 패널 — 500 / 45s timeout 가시화
//   PR-AI(#345): findApiKeyWithDiagnostics 통합, fail-fast 5s
//   PR-AJ(#346): catch 블록 진단 주입 — source/keyPreview/proxy 노출
//   PR-AK(#347): gpt-4o → gpt-4o-mini 통일 (모델 권한 가설)
//
// 사용자가 OpenAI 키 (HACCP-ONE AI / sk-proj-...d_EA) 직접 제공.
// CLI 검증 결과 (curl -H "Authorization: Bearer ..."):
//   /v1/models                       → 200 ✅
//   /v1/models/gpt-4o-mini           → 200 ✅  (PR-AK 가설 무효: 모델 권한 정상)
//   /v1/models/gpt-4o                → 200 ✅  (gpt-4o 도 권한 있음)
//   /v1/chat/completions (gpt-4o-mini text) → 200 "PONG" ✅
//   /v1/chat/completions (Vision)    → 400 (1x1 이미지 거부, 인증 통과)
//
// 결론: 키 자체는 완전 정상. scanOcr 만 401.
//
// 유일한 차이: HTTP 호출 방식
//   다른 AI (server/_core/llm.ts:312):
//     fetch(resolveApiUrl(), { headers: { authorization: `Bearer ${ENV.forgeApiKey}` } })
//   scanOcr (이전):
//     new OpenAI({ apiKey }) → SDK 가 추가 헤더/인증 흐름 적용
//     sk-proj-*** Project key 의 경우 SDK 가 Project ID 자동 추출 시
//     운영 환경에서 잘못된 헤더를 보낼 가능성
//
// PR-AL 해결: scanOcr 도 100% 동일한 fetch 패턴 사용
//   - OpenAI SDK 의존성 제거
//   - ENV.forgeApiUrl + ENV.forgeApiKey (모듈 로드 시점 캐싱된 값 사용)
//   - resolveOcrApiUrl() 은 llm.ts:resolveApiUrl 과 완전 동일
//
// 진단 강화:
//   - 진단에 keyTail(끝 4자) 추가 → 운영 서버 실제 키 끝자리로 식별
//     (예: 받은 키 ...d_EA 와 운영 서버 진단 keyTail 비교 → 키 일치/불일치 판단)
//   - 실제 호출 URL 노출 (api.openai.com 직접 vs forge 프록시)
//   - 응답 헤더 openai-organization / openai-version 캡쳐 (어떤 OpenAI 계정으로 도달했는지)
const OCR_MODEL = "gpt-4o-mini";

// ─────────────────────────────────────────────────────────────
// PR-AM-2026-05-27: PR-AL 회귀 버그 hotfix
// ─────────────────────────────────────────────────────────────
// PR-AL 에서 OpenAI SDK 제거하면서 import 블록 정리 중에
// `getSharp()` 함수 정의가 실수로 삭제됨.
// 호출 (callVisionOcr 라인 324: `const sharp = await getSharp()`) 은 남아있어
// "getSharp is not defined" 런타임 ReferenceError 발생 → 500 → router 가
// 401 로 잘못 라벨링 (PR-AJ 의 broad 401 매칭 로직).
//
// 교훈: 진짜 에러는 "getSharp is not defined" 였는데 진단 메시지가
//   '401 키 인증 실패' 로 표시되고 있었음. PR-AL 의 진단 v2 가
//   keyTail 매칭/callUrl=(call-not-reached) 노출 덕분에 root cause 식별 가능.
let _sharp: any = null;
async function getSharp() {
  if (!_sharp) {
    try { _sharp = (await import("sharp")).default; } catch { _sharp = null; }
  }
  return _sharp;
}

// llm.ts:213 의 resolveApiUrl 과 동일
function resolveOcrApiUrl(): string {
  return ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0
    ? `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions`
    : "https://api.openai.com/v1/chat/completions";
}

// llm.ts 의 invokeLLM 과 동일한 호출 형태 — fetch + Bearer + JSON
async function callOpenAIChatCompletions(
  payload: Record<string, any>,
  timeoutMs: number = 90000,
): Promise<{
  data: any;
  url: string;
  organizationHeader: string;
  versionHeader: string;
  processingMsHeader: string;
}> {
  const url = resolveOcrApiUrl();
  const apiKey = ENV.forgeApiKey;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY/BUILT_IN_FORGE_API_KEY 모두 미설정 — ENV.forgeApiKey 가 빈 값입니다.",
    );
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    // 진단용 헤더 (PR-AL): OpenAI 가 어떤 계정으로 인증했는지 검증
    const organizationHeader = response.headers.get("openai-organization") || "";
    const versionHeader = response.headers.get("openai-version") || "";
    const processingMsHeader = response.headers.get("openai-processing-ms") || "";
    if (!response.ok) {
      const errText = await response.text();
      const err: any = new Error(
        `OpenAI API ${response.status} ${response.statusText}: ${errText.slice(0, 500)}`,
      );
      err.status = response.status;
      err.responseText = errText;
      err.url = url;
      err.organizationHeader = organizationHeader;
      err.versionHeader = versionHeader;
      throw err;
    }
    const data = await response.json();
    return { data, url, organizationHeader, versionHeader, processingMsHeader };
  } finally {
    clearTimeout(timer);
  }
}

// ════════════════════════════════════════════
// 타입 정의
// ════════════════════════════════════════════

export interface OcrFieldResult {
  value: any;
  confidence: number;
  needsReview: boolean;
  source: "ocr_primary" | "ocr_verified" | "auto_corrected";
  suggestion?: string;
}

export interface EnhancedOcrResult {
  success: boolean;
  pages: number;
  structuredData: Record<string, any>;
  fields: Record<string, OcrFieldResult>;
  overallConfidence: number;
  lowConfidenceFields: string[];
  rawText: string;
  error?: string;
  // ★ PR-AT (2026-05-28): 양식 자동 분류 결과
  classification?: {
    requestedType: string;   // 사용자가 선택한 타입
    detectedType: string;    // OCR 이 감지한 타입
    overridden: boolean;     // 감지값으로 프롬프트를 교체했는지
    confidence: number;      // 분류 신뢰도 0~1
  };
}

// ════════════════════════════════════════════
// CCP 타입별 전문 프롬프트
// ════════════════════════════════════════════

interface PromptConfig {
  label: string;
  systemPrompt: string;
  jsonSchema: string;
  expectedRanges?: Record<string, [number, number]>;
}

const CHECKLIST_PROMPTS: Record<string, PromptConfig> = {
  // ★ PR-AS (2026-05-28): CCP-1B 다중 측정행 처리.
  //   페이지에 N 개의 측정 시각이 있으면 measurements[] 배열로 반환.
  //   공통 필드 (recordDate, productName) 는 상단/한계기준에서 추출.
  ccp_1b: {
    label: "CCP-1B 가열(증숙) 기록",
    expectedRanges: { temp: [85, 105], time: [5, 60] },
    systemPrompt: `HACCP CCP-1B 가열(증숙)공정 모니터링 기록지 OCR 전문가입니다.
이 양식은 떡류 증숙(찜) 공정의 측정 시각별 가열시간/압력/품온 기록입니다.

추출해야 할 정보 (정확한 폼 필드명 사용):
  공통 필드 (페이지 상단/한계기준 기준):
    - recordDate: 작성일자 (YYYY-MM-DD)
    - productName: 제품명 (예: "콩고물쑥떡", "참쌀떡류" — 한계기준 표가 아닌 측정 데이터 표의 품명 컬럼)
    - inspector: 작성자

  measurements[] 배열 (측정 데이터 표의 각 행마다 1개 객체):
    - measurementTime: 측정시각 (HH:MM 또는 HH:MM:SS)
    - equipment: 교반기 정보 (예: "교반기1호기", "교반기2호기"). 컬럼이 없으면 빈 문자열.
    - heatingTimeMin: 가열시간 (분, 정수)
    - pressureMpa: 압력 (소수, 예: "0.160" — Mpa 단위)
    - inputAmountKg: 투입량 (kg, 소수 또는 정수, 예: "100.00")
    - tempEdgeC: 가열후 품온 - 모서리 (℃, 소수)
    - tempCenterC: 가열후 품온 - 중심부 (℃, 소수)
    - passFail: 판정 ("적합" 또는 "부적합" — 체크박스/V/O 는 "적합", X 는 "부적합")

  - deviationContent: 한계기준 이탈내용 (페이지 하단 — 부적합 시만)
  - correctiveAction: 개선조치 및 결과 (페이지 하단 — 부적합 시만)

검증 규칙:
  - 손글씨 숫자 판독 시 97과 91, 98과 93, 0과 6을 주의 깊게 구별하세요.
  - 빈 측정 행은 무시 (모든 셀이 비어있으면 measurements 배열에 포함하지 않음).
  - 불확실한 필드는 _confidence 객체에 0.5 이하로 신뢰도 보고.

한 PDF = 한 작성일 = 여러 측정 (한 페이지에 여러 시각).
실제 양식에는 보통 2~5 측정 행이 있고, 각 행은 독립된 DB 레코드가 됩니다.`,
    jsonSchema: `{
  "recordDate": "YYYY-MM-DD",
  "productName": "제품명",
  "inspector": "작성자",
  "measurements": [
    {
      "measurementTime": "HH:MM",
      "equipment": "교반기1호기 등",
      "heatingTimeMin": 숫자,
      "pressureMpa": "0.160",
      "inputAmountKg": "100.00",
      "tempEdgeC": "98.8",
      "tempCenterC": "98.8",
      "passFail": "적합 또는 부적합"
    }
  ],
  "deviationContent": "이탈 내용 (없으면 빈 문자열)",
  "correctiveAction": "개선조치 (없으면 빈 문자열)",
  "_confidence": {
    "recordDate": 0.0~1.0,
    "productName": 0.0~1.0,
    "measurements[0].measurementTime": 0.0~1.0,
    "measurements[0].heatingTimeMin": 0.0~1.0,
    "measurements[0].pressureMpa": 0.0~1.0,
    "measurements[0].tempEdgeC": 0.0~1.0,
    "measurements[0].tempCenterC": 0.0~1.0,
    "measurements[0].passFail": 0.0~1.0
  }
}`,
  },
  // ★ PR-AS (2026-05-28): CCP-2B 도 동일 패턴 — measurements[] 배열.
  ccp_2b: {
    label: "CCP-2B 가열(굽기) 기록",
    expectedRanges: { temp: [90, 200], time: [5, 60] },
    systemPrompt: `HACCP CCP-2B 가열(굽기)공정 모니터링 기록지 OCR 전문가입니다.
이 양식은 견과류 등 굽기 공정의 측정 시각별 가열시간/온도 기록입니다.

추출해야 할 정보 (정확한 폼 필드명 사용):
  공통 필드:
    - recordDate: 작성일자 (YYYY-MM-DD)
    - productName: 제품명 (예: "마카다미아", "호두")
    - inspector: 작성자

  measurements[] 배열 (측정 데이터 표의 각 행마다 1개):
    - measurementTime: 측정시각 (HH:MM)
    - heatingTimeMin: 가열시간 (분, 정수)
    - temperatureC: 가열온도 (℃, 소수)
    - inputAmountKg: 투입량 (kg)
    - passFail: 판정 ("적합" 또는 "부적합")

  - deviationContent: 한계기준 이탈내용 (부적합 시만)
  - correctiveAction: 개선조치 및 결과 (부적합 시만)

검증 규칙:
  - 손글씨 숫자 97과 91, 0과 6 구별 주의.
  - 빈 측정 행 무시.

한 PDF = 한 작성일 = 여러 측정.`,
    jsonSchema: `{
  "recordDate": "YYYY-MM-DD",
  "productName": "제품명",
  "inspector": "작성자",
  "measurements": [
    {
      "measurementTime": "HH:MM",
      "heatingTimeMin": 숫자,
      "temperatureC": "150.0",
      "inputAmountKg": "50.00",
      "passFail": "적합 또는 부적합"
    }
  ],
  "deviationContent": "이탈 내용 (없으면 빈 문자열)",
  "correctiveAction": "개선조치 (없으면 빈 문자열)",
  "_confidence": {
    "recordDate": 0.0~1.0,
    "productName": 0.0~1.0,
    "measurements[0].measurementTime": 0.0~1.0,
    "measurements[0].heatingTimeMin": 0.0~1.0,
    "measurements[0].temperatureC": 0.0~1.0,
    "measurements[0].passFail": 0.0~1.0
  }
}`,
  },
  ccp_4p: {
    label: "CCP-4P 금속검출 기록",
    // ★ PR-AO (2026-05-27): expectedRanges 를 폼 필드명 기준으로 재정의.
    //   기존 feMm/susMm (Fe/SUS 시편 mm) 대신 sensitivitySetting/passedQuantity 등
    //   실제 폼 입력 필드 기준 휴리스틱 검증.
    expectedRanges: {
      sensitivitySetting: [50, 300],   // 감도 설정값 (정수)
      passedQuantity: [0, 100000],     // 통과량 (개)
      detectedQuantity: [0, 10000],    // 검출량 (개)
    },
    // ★ PR-AO: 프롬프트를 CCP4PForm 의 Ccp4pFormData 필드와 1:1 매칭.
    //   이전 (PR-AM) 의 generic items[{testType, sensitivity}] → 신규 폼 필드 직접 추출.
    systemPrompt: `HACCP CCP-4P 금속검출공정 모니터링 기록서 OCR 전문가입니다.
이 기록지는 금속검출기의 Fe/SUS 시편 통과 시험 + 제품 검출 결과를 측정 시각별로 기록하는 양식입니다.

추출해야 할 정보 (정확한 폼 필드명 사용):
  - recordDate: 작성일자 (YYYY-MM-DD)
  - productName: 제품명 (예: "마카다미아", "참쌀떡류" — "금속검출 통합" 같은 일반 라벨 X)
  - measurementTime: 측정시각 (HH:MM, 시:분)
  - sensitivitySetting: 감도 설정값 (정수, 예: 130) — Fe/SUS mm 값이 아닌 기기 설정 다이얼 값
  - feTestPiecePass: Fe 시편 통과 (체크/감지되면 "O", 미감지면 "X")
  - stsTestPiecePass: SUS 시편 통과 ("O" 또는 "X")
  - productOnlyPass: 제품 단독 통과 ("O" 또는 "X")
  - feProductPass: Fe + 제품 통과 ("O" 또는 "X")
  - stsProductPass: SUS + 제품 통과 ("O" 또는 "X")
  - passedQuantity: 통과량 (정수, 개수)
  - detectedQuantity: 검출량 (정수, 개수)
  - passFail: 판정 ("적합" 또는 "부적합" — "양호/정상/PASS" 는 "적합"으로 통일)
  - deviationContent: 이탈 내용 (부적합 시만, 없으면 빈 문자열)
  - correctiveAction: 개선조치 및 결과 (부적합 시만)
  - inspector: 작성자

검증 규칙:
  - sensitivitySetting 은 보통 100~200 사이 정수 (감도 130 같은 값)
  - O/X 가 명확히 보이지 않으면 "O" 기본값 (검출 정상)
  - 손글씨가 불확실한 필드는 _confidence 객체에 0.5 이하로 신뢰도 보고

여러 측정 시각이 한 페이지에 있으면 가장 최근 시각 (또는 마지막 행) 의 값으로 추출.
한 PDF = 한 작성일 = 한 레코드.`,
    jsonSchema: `{
  "recordDate": "YYYY-MM-DD",
  "productName": "제품명 (예: 마카다미아)",
  "measurementTime": "HH:MM",
  "sensitivitySetting": 숫자(정수),
  "feTestPiecePass": "O 또는 X",
  "stsTestPiecePass": "O 또는 X",
  "productOnlyPass": "O 또는 X",
  "feProductPass": "O 또는 X",
  "stsProductPass": "O 또는 X",
  "passedQuantity": 숫자(정수),
  "detectedQuantity": 숫자(정수),
  "passFail": "적합 또는 부적합",
  "deviationContent": "이탈 내용 (없으면 빈 문자열)",
  "correctiveAction": "개선조치 (없으면 빈 문자열)",
  "inspector": "작성자",
  "_confidence": {
    "recordDate": 0.0~1.0,
    "productName": 0.0~1.0,
    "measurementTime": 0.0~1.0,
    "sensitivitySetting": 0.0~1.0,
    "feTestPiecePass": 0.0~1.0,
    "stsTestPiecePass": 0.0~1.0,
    "productOnlyPass": 0.0~1.0,
    "feProductPass": 0.0~1.0,
    "stsProductPass": 0.0~1.0,
    "passedQuantity": 0.0~1.0,
    "detectedQuantity": 0.0~1.0,
    "passFail": 0.0~1.0
  }
}`,
  },
  ccp_record: {
    label: "CCP 기록지 (범용)",
    systemPrompt: `HACCP CCP 기록지 OCR 전문가입니다.
CCP(중요관리점) 모니터링 기록을 읽습니다. 온도, 시간, 압력 등 측정값과 판정을 추출하세요.`,
    jsonSchema: `{
  "formDate": "YYYY-MM-DD", "ccpType": "CCP 타입", "productName": "제품명",
  "items": [{ "itemText": "항목", "value": "측정값", "checkResult": "적합/부적합" }],
  "inspector": "작성자", "remarks": "비고"
}`,
  },
  purchase_invoice: {
    label: "매입전표/세금계산서",
    systemPrompt: `매입전표/세금계산서/거래명세서 OCR 전문가입니다.
공급자, 공급받는자, 품목별 수량/단가/금액, 공급가액, 세액, 합계금액을 정확히 추출하세요.
금액의 콤마(,)는 제거하고 숫자만 기록하세요.
날짜 형식은 YYYY-MM-DD로 통일하세요.`,
    jsonSchema: `{
  "formDate": "YYYY-MM-DD (작성일)", "invoiceDate": "YYYY-MM-DD (거래일)",
  "supplierName": "공급자 상호", "supplierBizNo": "사업자번호",
  "items": [{ "itemName": "품명", "quantity": 숫자, "unit": "단위", "unitPrice": 숫자, "amount": 숫자 }],
  "subtotal": 숫자(공급가액), "taxAmount": 숫자(세액), "totalAmount": 숫자(합계금액),
  "remarks": "비고"
}`,
  },
  material_inspection: {
    label: "원재료 입고검사",
    systemPrompt: `원재료 입고검사 기록 OCR 전문가입니다.
원재료명, 공급처, 입고일, 수량, 검사항목별 결과(적합/부적합)를 추출하세요.`,
    jsonSchema: `{
  "formDate": "YYYY-MM-DD", "supplierName": "공급처",
  "items": [{ "itemName": "원재료명", "origin": "원산지", "quantity": "수량", "checkResult": "적합/부적합", "note": "비고" }],
  "overallResult": "적합/부적합", "inspector": "검사자"
}`,
  },
  personal_hygiene: {
    label: "개인위생점검",
    systemPrompt: `개인위생점검표 OCR 전문가입니다.
작업자별 복장/손세척/건강상태 등 점검항목과 결과를 추출하세요.
체크(V, O, ✓)는 "적합", X는 "부적합"으로 변환하세요.`,
    jsonSchema: `{
  "formDate": "YYYY-MM-DD", "items": [{ "itemText": "점검항목", "checkResult": "적합/부적합", "note": "비고" }],
  "inspector": "점검자"
}`,
  },
  temperature_humidity: {
    label: "온습도점검",
    expectedRanges: { temp: [-20, 50], humidity: [30, 80] },
    systemPrompt: `온습도점검 기록 OCR 전문가입니다.
저장고/작업실별 온도(-20~50°C)와 습도(30~80%)를 추출하세요.`,
    jsonSchema: `{
  "formDate": "YYYY-MM-DD", "items": [{ "location": "장소", "tempC": 숫자, "humidity": 숫자, "checkResult": "적합/부적합" }],
  "inspector": "점검자"
}`,
  },
  equipment_cleaning: {
    label: "설비세정기록",
    systemPrompt: `설비세정/소독 기록지 OCR 전문가입니다.
설비/구역별 세정 완료여부, 사용 세정제/소독제, 담당자를 추출하세요.
체크(V, O, ✓)는 "완료", X는 "미완료"로 변환하세요.
불확실한 값은 [?] 접두사를 붙이세요.`,
    jsonSchema: `{
  "formDate": "YYYY-MM-DD",
  "items": [{ "itemText": "설비/구역명", "checkResult": "완료/미완료/해당없음", "detergent": "세정제/소독제명", "note": "비고" }],
  "inspector": "점검자", "remarks": "전체비고"
}`,
  },
  general: {
    label: "일반 체크리스트",
    systemPrompt: `HACCP 식품안전 체크리스트 OCR 전문가입니다.
스캔된 수기 체크리스트 이미지를 분석하여 정확한 JSON 데이터로 변환하세요.
체크(V, O, ✓)는 "적합", X는 "부적합"으로 변환하세요.
불확실한 값은 [?] 접두사를 붙이세요.`,
    jsonSchema: `{
  "formDate": "YYYY-MM-DD", "formType": "문서종류", "title": "제목",
  "items": [{ "itemText": "항목", "checkResult": "적합/부적합/해당없음", "value": "측정값", "note": "비고" }],
  "inspector": "작성자", "remarks": "전체비고", "signature": "서명"
}`,
  },
  // ── ERP 전용 OCR ──
  business_registration: {
    label: "사업자등록증",
    systemPrompt: `사업자등록증 OCR 전문가입니다.
상호(법인명), 대표자, 사업자등록번호, 개업일, 업태, 종목, 사업장소재지를 정확히 추출하세요.
사업자번호는 XXX-XX-XXXXX 형식으로 통일하세요.`,
    jsonSchema: `{
  "companyName": "상호(법인명)", "representative": "대표자",
  "bizNo": "XXX-XX-XXXXX", "openDate": "YYYY-MM-DD",
  "bizType": "업태", "bizItem": "종목", "address": "사업장소재지"
}`,
  },
  quotation_doc: {
    label: "견적서",
    systemPrompt: `견적서/발주서 OCR 전문가입니다.
공급자, 공급받는자, 품목별 수량/단가/금액, 공급가액, 세액, 합계금액, 유효기간을 추출하세요.`,
    jsonSchema: `{
  "docDate": "YYYY-MM-DD", "docNumber": "문서번호",
  "supplierName": "공급자 상호", "supplierBizNo": "사업자번호",
  "customerName": "공급받는자",
  "items": [{ "itemName": "품명", "spec": "규격", "quantity": 숫자, "unit": "단위", "unitPrice": 숫자, "amount": 숫자 }],
  "subtotal": 숫자, "taxAmount": 숫자, "totalAmount": 숫자,
  "validUntil": "YYYY-MM-DD (유효기간)", "remarks": "비고"
}`,
  },
  receipt: {
    label: "영수증",
    systemPrompt: `영수증/간이영수증 OCR 전문가입니다.
상호, 날짜, 품목별 금액, 합계, 결제수단을 추출하세요.`,
    jsonSchema: `{
  "storeName": "상호", "date": "YYYY-MM-DD",
  "items": [{ "itemName": "품명", "amount": 숫자 }],
  "totalAmount": 숫자, "paymentMethod": "카드/현금/계좌이체"
}`,
  },
};

const DEFAULT_PROMPT: PromptConfig = {
  label: "일반 체크리스트",
  systemPrompt: `HACCP 식품안전 체크리스트 OCR 전문가입니다.
스캔된 수기 체크리스트 이미지를 분석하여 정확한 JSON 데이터로 변환하세요.
체크(V, O, ✓)는 "적합", X는 "부적합"으로 변환하세요.
불확실한 값은 [?] 접두사를 붙이세요.`,
  jsonSchema: `{
  "formDate": "YYYY-MM-DD", "formType": "문서종류", "title": "제목",
  "items": [{ "itemText": "항목", "checkResult": "적합/부적합/해당없음", "value": "측정값", "note": "비고" }],
  "inspector": "작성자", "remarks": "전체비고", "signature": "서명"
}`,
};

// ════════════════════════════════════════════
// 이미지 전처리 (Sharp)
// ════════════════════════════════════════════

async function preprocessImage(inputPath: string): Promise<Buffer> {
  const sharp = await getSharp();
  if (!sharp) {
    // Sharp 없으면 원본 반환
    return fs.readFileSync(inputPath);
  }

  try {
    return await sharp(inputPath)
      .rotate()                      // EXIF 기반 자동 회전
      .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
      .grayscale()                   // 흑백 변환 (텍스트 인식 향상)
      .normalize()                   // 대비 자동 정규화 (linear stretch)
      .sharpen({ sigma: 1.5 })       // 선명화
      .png({ quality: 95 })
      .toBuffer();
  } catch (err) {
    console.warn("[scanOcr] 이미지 전처리 실패, 원본 사용:", err);
    return fs.readFileSync(inputPath);
  }
}

// ════════════════════════════════════════════
// 다중 페이지 PDF 처리
// ════════════════════════════════════════════

function pdfToImages(pdfPath: string): { files: string[]; error?: string } {
  const outputBase = pdfPath.replace(/\.pdf$/i, "_page");
  try {
    execSync(`pdftoppm -png -r 200 "${pdfPath}" "${outputBase}"`, { timeout: 60000 });
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    const stderr = err?.stderr?.toString?.() || "";
    console.warn(`[scanOcr] pdftoppm 실행 실패 — ${errMsg} | stderr: ${stderr.slice(0, 200)}`);
    return { files: [], error: `pdftoppm 변환 실패: ${stderr.slice(0, 200) || errMsg}` };
  }

  const dir = path.dirname(outputBase);
  const base = path.basename(outputBase);
  const files = fs.readdirSync(dir)
    .filter(f => f.startsWith(base) && f.endsWith(".png"))
    .sort()
    .map(f => path.join(dir, f));

  if (files.length === 0) {
    return { files: [], error: "pdftoppm은 성공했지만 PNG 파일이 생성되지 않았습니다." };
  }

  return { files };
}

// ════════════════════════════════════════════
// GPT-4o Vision 호출
// ════════════════════════════════════════════

async function callVisionOcr(
  imageBuffer: Buffer,
  mimeType: string,
  config: PromptConfig,
  extraContext?: string
): Promise<{ rawText: string; parsed: Record<string, any> | null }> {
  // PR-AH: GPT-4o Vision은 application/pdf MIME을 지원하지 않음 (image/* 만 가능)
  if (!mimeType.startsWith("image/")) {
    throw new Error(
      `Vision API에 지원되지 않는 MIME 타입: ${mimeType}. ` +
        `이미지(image/png, image/jpeg)만 허용됩니다.`,
    );
  }

  const systemContent = `${config.systemPrompt}

반드시 아래 JSON 형식으로 응답하세요:
${config.jsonSchema}

주의사항:
- 수기 한글을 최대한 정확히 인식하세요
- 읽기 어려운 부분은 값 앞에 [?]를 붙이세요 (예: "[?]97")
- 날짜가 없으면 null
${extraContext || ""}`;

  // PR-AL: 이미지 크기 + 호출 URL 로깅 (디버깅용)
  const base64 = imageBuffer.toString("base64");
  const base64SizeMB = (base64.length / 1024 / 1024).toFixed(2);
  const targetUrl = resolveOcrApiUrl();
  console.log(
    `[scanOcr.callVisionOcr] OpenAI 호출 — mimeType=${mimeType} base64=${base64SizeMB}MB url=${targetUrl}`,
  );

  const callT0 = Date.now();
  try {
    const { data, url, organizationHeader, versionHeader, processingMsHeader } =
      await callOpenAIChatCompletions(
        {
          model: OCR_MODEL,
          max_tokens: 4096,
          messages: [
            { role: "system", content: systemContent },
            {
              role: "user",
              content: [
                { type: "text", text: "이 문서를 분석하여 JSON으로 변환해주세요." },
                {
                  type: "image_url",
                  image_url: { url: `data:${mimeType};base64,${base64}`, detail: "high" },
                },
              ],
            },
          ],
        },
        90000,
      );

    const callElapsed = Date.now() - callT0;
    console.log(
      `[scanOcr.callVisionOcr] OpenAI 성공 (${callElapsed}ms) ` +
        `url=${url} org=${organizationHeader} version=${versionHeader} processing=${processingMsHeader}ms`,
    );

    const content = data?.choices?.[0]?.message?.content || "";
    let parsed: Record<string, any> | null = null;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try { parsed = JSON.parse(jsonMatch[0]); } catch { /* JSON 파싱 실패 */ }
    }
    return { rawText: content, parsed };
  } catch (err: any) {
    const callElapsed = Date.now() - callT0;
    console.error(
      `[scanOcr.callVisionOcr] OpenAI 실패 (${callElapsed}ms) — ` +
        `status=${err?.status} url=${err?.url} org=${err?.organizationHeader} ` +
        `message=${err?.message?.slice(0, 200)}`,
    );
    // 상위로 throw — enhancedOcrAndStructure 의 catch 에서 진단 정보와 함께 메시지 구성
    throw err;
  }
}

// ════════════════════════════════════════════
// ★ PR-AT (2026-05-28): 양식 자동 분류
// ════════════════════════════════════════════

/** 자동 분류 대상 CCP 타입 (잘못된 프롬프트 적용 시 추출값이 완전히 어긋남) */
const CLASSIFIABLE_CCP_TYPES = ["ccp_1b", "ccp_2b", "ccp_3b", "ccp_4p"] as const;

/**
 * 양식 첫 페이지 이미지를 보고 CCP 타입을 분류.
 *   제목/구조만 보는 경량 호출 (low detail, 작은 max_tokens) → 비용/지연 최소화.
 *   반환: { detectedType, confidence } — 분류 불가 시 detectedType="unknown".
 */
async function classifyFormType(
  imageBuffer: Buffer,
  mimeType: string,
): Promise<{ detectedType: string; confidence: number }> {
  if (!mimeType.startsWith("image/")) {
    return { detectedType: "unknown", confidence: 0 };
  }

  const base64 = imageBuffer.toString("base64");
  const systemContent = `HACCP CCP 모니터링 양식 분류 전문가입니다.
이미지의 제목과 표 구조를 보고 어떤 CCP 양식인지 판별하세요.

분류 기준 (제목 문구 우선):
  - "CCP-1B" 또는 "가열(증숙)" / "증숙" / 떡류 압력·품온 표 → ccp_1b
  - "CCP-2B" 또는 "가열(굽기)" / "굽기" / 견과류 가열온도 표 → ccp_2b
  - "CCP-3B" 또는 기타 가열공정 → ccp_3b
  - "CCP-4P" 또는 "금속검출" / Fe·SUS 시편 표 → ccp_4p
  - 위 어디에도 명확히 속하지 않으면 → unknown

반드시 아래 JSON 으로만 응답:
{ "detectedType": "ccp_1b|ccp_2b|ccp_3b|ccp_4p|unknown", "confidence": 0.0~1.0 }`;

  try {
    const { data } = await callOpenAIChatCompletions(
      {
        model: OCR_MODEL,
        max_tokens: 100,
        messages: [
          { role: "system", content: systemContent },
          {
            role: "user",
            content: [
              { type: "text", text: "이 양식의 CCP 타입을 분류하세요." },
              {
                type: "image_url",
                // low detail — 제목/구조만 보면 되므로 고해상도 불필요
                image_url: { url: `data:${mimeType};base64,${base64}`, detail: "low" },
              },
            ],
          },
        ],
      },
      30000,
    );

    const content = data?.choices?.[0]?.message?.content || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const detectedType = String(parsed.detectedType || "unknown").toLowerCase();
      const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
      if ((CLASSIFIABLE_CCP_TYPES as readonly string[]).includes(detectedType)) {
        return { detectedType, confidence };
      }
    }
  } catch (err) {
    console.warn("[scanOcr.classifyFormType] 분류 실패 (무시하고 사용자 선택 사용):", err);
  }
  return { detectedType: "unknown", confidence: 0 };
}

// ════════════════════════════════════════════
// 필드별 신뢰도 계산
// ════════════════════════════════════════════

function calculateFieldConfidence(
  data: Record<string, any>,
  config: PromptConfig
): { fields: Record<string, OcrFieldResult>; lowConfidenceFields: string[] } {
  const fields: Record<string, OcrFieldResult> = {};
  const lowConfidenceFields: string[] = [];
  const ranges = config.expectedRanges || {};

  function processValue(key: string, val: any) {
    let confidence = 0.9;
    let needsReview = false;
    let suggestion: string | undefined;

    const strVal = String(val ?? "");

    // [?] 접두사 → 불확실
    if (strVal.startsWith("[?]") || strVal.includes("[판독불가]")) {
      confidence -= 0.3;
      needsReview = true;
    }

    // 빈 값
    if (val === null || val === undefined || strVal.trim() === "") {
      confidence = 0.3;
      needsReview = true;
    }

    // 숫자 범위 검증
    const numVal = parseFloat(strVal.replace("[?]", ""));
    if (!isNaN(numVal)) {
      for (const [rangeKey, [min, max]] of Object.entries(ranges)) {
        if (key.toLowerCase().includes(rangeKey.toLowerCase()) ||
            key.toLowerCase().includes("temp") && rangeKey === "temp" ||
            key.toLowerCase().includes("duration") && rangeKey === "time") {
          if (numVal < min || numVal > max) {
            confidence -= 0.2;
            needsReview = true;
            suggestion = `기대 범위: ${min}~${max}`;
          }
        }
      }
    }

    confidence = Math.max(0.1, Math.min(1.0, confidence));
    if (confidence < 0.6) lowConfidenceFields.push(key);

    fields[key] = { value: val, confidence, needsReview, source: "ocr_primary", suggestion };
  }

  // 최상위 필드
  for (const [key, val] of Object.entries(data)) {
    if (key === "items" && Array.isArray(val)) {
      // items 배열 내부 각 필드
      val.forEach((item: any, idx: number) => {
        for (const [subKey, subVal] of Object.entries(item)) {
          processValue(`items[${idx}].${subKey}`, subVal);
        }
      });
    } else if (key === "measurements" && Array.isArray(val)) {
      // ★ PR-AS (2026-05-28): measurements[] 배열 — 측정 시각별 행
      val.forEach((m: any, idx: number) => {
        for (const [subKey, subVal] of Object.entries(m)) {
          processValue(`measurements[${idx}].${subKey}`, subVal);
        }
      });
    } else {
      processValue(key, val);
    }
  }

  return { fields, lowConfidenceFields };
}

// ════════════════════════════════════════════
// 이중 패스 검증
// ════════════════════════════════════════════

async function secondPassVerification(
  imageBuffer: Buffer,
  mimeType: string,
  lowFields: string[],
  originalData: Record<string, any>
): Promise<Record<string, any>> {
  if (lowFields.length === 0) return originalData;

  const fieldList = lowFields.map(f => `- ${f}: 현재값 "${getNestedValue(originalData, f)}"`).join("\n");

  try {
    // PR-AL: llm.ts 와 동일한 fetch 패턴
    const { data } = await callOpenAIChatCompletions({
      model: OCR_MODEL,
      max_tokens: 2048,
      messages: [
        {
          role: "system",
          content: `이전 OCR에서 다음 필드가 불확실합니다. 이미지를 다시 주의 깊게 확인하여 정확한 값을 JSON으로 알려주세요.
확인 필요 필드:
${fieldList}

응답 형식: { "필드경로": "교정된 값", ... }
예: { "items[0].tempC": 97, "formDate": "2026-03-15" }`,
        },
        {
          role: "user",
          content: [
            { type: "text", text: "위 필드들의 정확한 값을 다시 확인해주세요." },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBuffer.toString("base64")}`, detail: "high" } },
          ],
        },
      ],
    }, 60000);

    const content = data?.choices?.[0]?.message?.content || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const corrections = JSON.parse(jsonMatch[0]);
      // 교정값 병합
      for (const [fieldPath, correctedVal] of Object.entries(corrections)) {
        setNestedValue(originalData, fieldPath, correctedVal);
      }
    }
  } catch (err) {
    console.warn("[scanOcr] 2차 검증 실패:", err);
  }

  return originalData;
}

function getNestedValue(obj: any, path: string): any {
  // ★ PR-AS: items[] 와 measurements[] 양쪽 모두 지원
  const arrMatch = path.match(/^(items|measurements)\[(\d+)\]\.(.+)$/);
  if (arrMatch) {
    const [, arrKey, idx, sub] = arrMatch;
    return obj[arrKey]?.[parseInt(idx)]?.[sub];
  }
  return obj[path];
}

function setNestedValue(obj: any, path: string, val: any): void {
  const arrMatch = path.match(/^(items|measurements)\[(\d+)\]\.(.+)$/);
  if (arrMatch) {
    const [, arrKey, idx, sub] = arrMatch;
    if (obj[arrKey] && obj[arrKey][parseInt(idx)]) {
      obj[arrKey][parseInt(idx)][sub] = val;
    }
  } else {
    obj[path] = val;
  }
}

// ════════════════════════════════════════════
// 메인 강화 OCR 함수
// ════════════════════════════════════════════

export async function enhancedOcrAndStructure(
  filePath: string,
  checklistType: string,
  options?: {
    templateFields?: { fieldName: string; fieldLabel: string; type: string }[];
    enableTwoPass?: boolean;
    enablePreprocessing?: boolean;
    // ★ PR-AT (2026-05-28): 양식 자동 분류 활성화 (CCP 타입 잘못 선택 보정)
    enableAutoClassify?: boolean;
  }
): Promise<EnhancedOcrResult> {
  const enableTwoPass = options?.enableTwoPass !== false;
  const enablePreprocessing = options?.enablePreprocessing !== false;
  const enableAutoClassify = options?.enableAutoClassify !== false;
  // effectiveType 은 자동 분류 후 교체될 수 있음 (let)
  let effectiveType = checklistType;
  let config = CHECKLIST_PROMPTS[checklistType] || DEFAULT_PROMPT;

  // 양식 필드 정보 추가 컨텍스트
  let extraContext = "";
  if (options?.templateFields?.length) {
    extraContext = "\n이 체크리스트의 필드 구성:\n" +
      options.templateFields.map(f => `- ${f.fieldName} (${f.fieldLabel}): ${f.type}`).join("\n");
  }

  try {
    const ext = path.extname(filePath).toLowerCase();
    let pageBuffers: { buffer: Buffer; mimeType: string }[] = [];

    // PDF → 다중 페이지 처리
    if (ext === ".pdf") {
      const pdfRes = pdfToImages(filePath);
      if (pdfRes.files.length > 0) {
        console.log(`[scanOcr] PDF → ${pdfRes.files.length} 페이지 PNG 변환 완료`);
        for (const imgPath of pdfRes.files) {
          const buf = enablePreprocessing ? await preprocessImage(imgPath) : fs.readFileSync(imgPath);
          pageBuffers.push({ buffer: buf, mimeType: "image/png" });
        }
        // 임시 파일 정리
        pdfRes.files.forEach(p => { try { fs.unlinkSync(p); } catch {} });
      } else {
        // ─── PR-AH: pdftoppm 실패 시 명시적 에러 ───
        // 이전 동작: 원본 PDF를 GPT-4o에 application/pdf MIME으로 전달 → OpenAI가 400 reject
        // 변경: 명확한 에러로 빠르게 fail-fast
        console.error(`[scanOcr] pdftoppm 실패 — PDF를 처리할 수 없습니다: ${pdfRes.error}`);
        return {
          success: false,
          pages: 0,
          structuredData: {},
          fields: {},
          overallConfidence: 0,
          lowConfidenceFields: [],
          rawText: "",
          error:
            `PDF 변환 실패: ${pdfRes.error || "pdftoppm 실행 실패"}. ` +
            `PDF가 손상되었거나 서버에 poppler-utils가 설치되지 않았을 수 있습니다. ` +
            `이미지(JPG/PNG)로 다시 시도해주세요.`,
        };
      }
    } else {
      // 이미지 전처리
      const buf = enablePreprocessing ? await preprocessImage(filePath) : fs.readFileSync(filePath);
      const mimeType = getMimeType(filePath);
      pageBuffers.push({ buffer: buf, mimeType });
    }

    // ★ PR-AT: 양식 자동 분류 — CCP 타입(또는 범용 ccp_record) 선택 시 첫 페이지로 타입 감지.
    //   감지 신뢰도가 충분하고 사용자 선택과 다르면 프롬프트를 감지값으로 교체.
    let classification: EnhancedOcrResult["classification"];
    const isClassifiableSelection =
      (CLASSIFIABLE_CCP_TYPES as readonly string[]).includes(checklistType) ||
      checklistType === "ccp_record";
    if (enableAutoClassify && isClassifiableSelection && pageBuffers.length > 0) {
      const first = pageBuffers[0];
      const { detectedType, confidence } = await classifyFormType(first.buffer, first.mimeType);
      // 신뢰도 0.7 이상 + 사용자 선택과 다를 때만 교체 (ccp_record 는 항상 교체 시도)
      const shouldOverride =
        detectedType !== "unknown" &&
        confidence >= 0.7 &&
        detectedType !== checklistType;
      if (shouldOverride) {
        console.log(
          `[scanOcr] 양식 자동 분류 — 선택=${checklistType} 감지=${detectedType} ` +
            `신뢰도=${confidence.toFixed(2)} → 프롬프트 교체`,
        );
        effectiveType = detectedType;
        config = CHECKLIST_PROMPTS[detectedType] || config;
      }
      classification = {
        requestedType: checklistType,
        detectedType,
        overridden: shouldOverride,
        confidence,
      };
    }

    // 각 페이지 OCR 실행
    let mergedData: Record<string, any> = {};
    let mergedRawText = "";

    for (let i = 0; i < pageBuffers.length; i++) {
      const { buffer, mimeType } = pageBuffers[i];
      const pageLabel = pageBuffers.length > 1 ? `\n\n[${i + 1}/${pageBuffers.length} 페이지]` : "";
      const { rawText, parsed } = await callVisionOcr(buffer, mimeType, config, extraContext + pageLabel);
      mergedRawText += rawText + "\n";

      if (parsed) {
        if (i === 0) {
          mergedData = parsed;
        } else {
          // 다중 페이지: items / measurements 배열 병합
          if (parsed.items && Array.isArray(parsed.items)) {
            mergedData.items = [...(mergedData.items || []), ...parsed.items];
          }
          if (parsed.measurements && Array.isArray(parsed.measurements)) {
            mergedData.measurements = [...(mergedData.measurements || []), ...parsed.measurements];
          }
        }
      }
    }

    if (!mergedData || Object.keys(mergedData).length === 0) {
      return { success: false, pages: pageBuffers.length, structuredData: {}, fields: {}, overallConfidence: 0, lowConfidenceFields: [], rawText: mergedRawText, error: "OCR 결과를 JSON으로 변환하지 못했습니다." };
    }

    // 필드별 신뢰도 계산
    let { fields, lowConfidenceFields } = calculateFieldConfidence(mergedData, config);

    // 이중 패스 검증
    if (enableTwoPass && lowConfidenceFields.length > 0 && pageBuffers.length > 0) {
      const mainBuffer = pageBuffers[0];
      mergedData = await secondPassVerification(mainBuffer.buffer, mainBuffer.mimeType, lowConfidenceFields, mergedData);
      // 재계산
      const recalc = calculateFieldConfidence(mergedData, config);
      // 2차 검증된 필드는 source 업데이트
      for (const fieldKey of lowConfidenceFields) {
        if (recalc.fields[fieldKey]) {
          recalc.fields[fieldKey].source = "ocr_verified";
          recalc.fields[fieldKey].confidence = Math.min(recalc.fields[fieldKey].confidence + 0.15, 0.95);
        }
      }
      fields = recalc.fields;
      lowConfidenceFields = recalc.lowConfidenceFields;
    }

    // 전체 신뢰도
    const allConfs = Object.values(fields).map(f => f.confidence);
    const overallConfidence = allConfs.length > 0 ? allConfs.reduce((a, b) => a + b, 0) / allConfs.length : 0.5;

    return {
      success: true,
      pages: pageBuffers.length,
      structuredData: mergedData,
      fields,
      overallConfidence,
      lowConfidenceFields,
      rawText: mergedRawText,
      classification,
    };
  } catch (error: any) {
    // PR-AH: OpenAI 에러를 구체적으로 분류
    // PR-AJ: 키 진단 정보를 메시지에 주입 (router의 try/catch는 도달 못함 — success=false 반환 경로)
    const errMsg = error?.message || "OCR 처리 중 오류가 발생했습니다.";
    const status = error?.status;
    const errType = error?.type;

    // 키 진단 (401 / 키 누락 케이스용)
    // PR-AL: keyTail(끝 4자) + URL + 응답 헤더(openai-organization) 추가
    //        ENV.forgeApiUrl 캐시값 vs process.env 실시간값 둘 다 노출
    let keyDiagSuffix = "";
    try {
      const diag = findApiKeyWithDiagnostics();
      const envCachedForgeUrl = (ENV.forgeApiUrl || "").trim();
      const keyHead = diag.key ? diag.key.slice(0, 10) : "(empty)";
      const keyTail = diag.key && diag.key.length > 4 ? diag.key.slice(-4) : "";
      const keyLen = diag.key ? diag.key.length : 0;
      const keyPreview = diag.key ? `${keyHead}***${keyTail}(len=${keyLen})` : "(empty)";
      const actualUrl = resolveOcrApiUrl();
      // 호출 시점에 실제 사용된 URL/org/version 은 error 객체에서 추출 (callOpenAIChatCompletions 에서 부착)
      const callUrl = error?.url || "(call-not-reached)";
      const callOrg = error?.organizationHeader || "";
      const callVer = error?.versionHeader || "";
      keyDiagSuffix =
        ` | 진단(PR-AL): model=${OCR_MODEL}, ` +
        `source=${diag.source}, ` +
        `keyPreview=${keyPreview}, ` +
        `targetUrl=${actualUrl.replace(/^https?:\/\//, "").slice(0, 60)}, ` +
        `callUrl=${typeof callUrl === "string" ? callUrl.replace(/^https?:\/\//, "").slice(0, 60) : "(unknown)"}, ` +
        `responseOrg=${callOrg || "(none)"}, ` +
        `responseVersion=${callVer || "(none)"}, ` +
        `forgeUrl(env)=${envCachedForgeUrl ? envCachedForgeUrl.replace(/^https?:\/\//, "").slice(0, 40) : "(none)"}, ` +
        `forgeUrl(processEnv)=${diag.forgeUrlValue ? diag.forgeUrlValue.replace(/^https?:\/\//, "").slice(0, 40) : "(none)"}, ` +
        `processEnv=[OPENAI=${diag.processEnv.OPENAI}, FORGE=${diag.processEnv.FORGE}, BUILT_IN_FORGE_KEY=${diag.processEnv.BUILT_IN_FORGE}, BUILT_IN_FORGE_URL=${diag.processEnv.BUILT_IN_FORGE_URL}]`;
    } catch {
      keyDiagSuffix = " | 진단 수집 실패";
    }

    let userFacingError = errMsg;
    if (status === 400 && errMsg.toLowerCase().includes("image")) {
      userFacingError = `OpenAI Vision이 이미지를 거부했습니다. PDF가 손상되었거나 변환 결과가 비정상일 수 있습니다. (${errMsg.slice(0, 150)})`;
    } else if (status === 429) {
      userFacingError = `OpenAI API 호출 한도를 초과했습니다. 잠시 후 다시 시도해주세요. (${errMsg.slice(0, 150)})`;
    } else if (status === 401 || errMsg.includes("Incorrect API key") || errMsg.toLowerCase().includes("invalid api key")) {
      // PR-AL: 401 진단 — 키 자체 / SDK / 운영 환경 mismatch 모두 식별 가능
      userFacingError =
        `OpenAI API 키 인증 실패 (401). ` +
        `이 키와 모델은 CLI curl 로 검증 완료(다른 AI 기능 정상). ` +
        `운영 환경의 PM2 가 들고 있는 OPENAI_API_KEY 가 다른 값일 가능성이 가장 높습니다. ` +
        `keyTail 을 평소 사용 중인 키 끝 4자와 비교하세요.${keyDiagSuffix}`;
    } else if (errMsg.includes("OPENAI_API_KEY") || errMsg.includes("API 키") || errMsg.includes("설정 누락")) {
      userFacingError = `OpenAI/Forge API 키 설정 누락.${keyDiagSuffix} 서버 .env 파일 또는 PM2 환경에 키를 설정해주세요.`;
    } else if (errType === "timeout" || errMsg.toLowerCase().includes("timeout") || errMsg.toLowerCase().includes("aborted")) {
      userFacingError = `OpenAI API 시간 초과 (90초). 페이지 수가 많거나 이미지가 매우 클 때 발생합니다.${keyDiagSuffix}`;
    } else {
      // PR-AL: 그 외 모든 에러에도 진단 정보 노출 (fallback)
      userFacingError = `${errMsg.slice(0, 200)}${keyDiagSuffix}`;
    }

    console.error(`[scanOcr.enhancedOcrAndStructure] 예외:`, {
      message: errMsg,
      status,
      type: errType,
      keyDiagSuffix,
      stack: error?.stack?.split("\n").slice(0, 5).join("\n"),
    });

    return {
      success: false,
      pages: 0,
      structuredData: {},
      fields: {},
      overallConfidence: 0,
      lowConfidenceFields: [],
      rawText: "",
      error: userFacingError,
    };
  }
}

// ════════════════════════════════════════════
// 하위 호환: 기존 ocrAndStructure
// ════════════════════════════════════════════

export async function ocrAndStructure(
  filePath: string,
  checklistType: string,
  templateFields?: { fieldName: string; fieldLabel: string; type: string }[]
): Promise<{
  success: boolean;
  rawText: string;
  structuredData: Record<string, any>;
  confidence: number;
  error?: string;
}> {
  const result = await enhancedOcrAndStructure(filePath, checklistType, { templateFields });
  return {
    success: result.success,
    rawText: result.rawText,
    structuredData: result.structuredData,
    confidence: result.overallConfidence,
    error: result.error,
  };
}

// ════════════════════════════════════════════
// 유틸리티
// ════════════════════════════════════════════

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".jpg": case ".jpeg": return "image/jpeg";
    case ".png": return "image/png";
    case ".gif": return "image/gif";
    case ".webp": return "image/webp";
    case ".pdf": return "application/pdf";
    default: return "image/jpeg";
  }
}

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
import OpenAI from "openai";
import fs from "fs";
import { execSync } from "child_process";
import path from "path";
import { findApiKeyWithDiagnostics } from "../_core/env";

let _sharp: any = null;
async function getSharp() {
  if (!_sharp) {
    try { _sharp = (await import("sharp")).default; } catch { _sharp = null; }
  }
  return _sharp;
}

// ─────────────────────────────────────────────────────────────
// PR-AI-2026-05-27: 운영 환경 OPENAI_API_KEY 미설정 문제 근본 수정
// ─────────────────────────────────────────────────────────────
// 이전: `new OpenAI({ apiKey: process.env.OPENAI_API_KEY })` 모듈 로드 시점에 1회 평가
//   → 운영 환경의 BUILT_IN_FORGE_API_KEY + BUILT_IN_FORGE_API_URL 프록시 구조 무시
//   → 결과: 401 Incorrect API key provided
//
// 이후: findApiKeyWithDiagnostics() 로 BUILT_IN_FORGE_API_KEY → OPENAI_API_KEY → FORGE_API_KEY
//   순으로 process.env + .env 파일 검색. BUILT_IN_FORGE_API_URL 있으면 baseURL 적용
//   다른 AI 기능들(가격 매칭 등)이 이미 사용하는 server/_core/llm.ts 와 동일한 키 해결 로직
//
// 매 호출마다 새 클라이언트 생성 (캐싱 X) → 키 회전/리로드 시 즉시 반영
function getOpenAIClient(): { client: OpenAI; source: string; usingProxy: boolean } {
  const diag = findApiKeyWithDiagnostics();
  const apiKey = diag.key;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY 설정 누락. " +
        `process.env(OPENAI=${diag.processEnv.OPENAI}, FORGE=${diag.processEnv.FORGE}, ` +
        `BUILT_IN_FORGE=${diag.processEnv.BUILT_IN_FORGE}) 및 .env 파일 모두에서 키를 찾지 못했습니다.`,
    );
  }

  // 운영: forge 프록시 사용 / 로컬: 기본 OpenAI 엔드포인트
  const forgeUrl = (process.env.BUILT_IN_FORGE_API_URL || "").trim();
  const usingProxy = forgeUrl.length > 0;
  const client = new OpenAI(
    usingProxy
      ? { apiKey, baseURL: forgeUrl.replace(/\/$/, "") + "/v1" }
      : { apiKey },
  );
  return { client, source: diag.source, usingProxy };
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
  ccp_1b: {
    label: "CCP-1B 가열(증숙) 기록",
    expectedRanges: { temp: [95, 100], time: [20, 40] },
    systemPrompt: `HACCP CCP-1B 가열(증숙) 기록지 OCR 전문가입니다.
이 문서는 식품의 증숙(찜) 공정에서 중심온도와 가열시간을 기록한 것입니다.
기대값: 온도 95~100°C, 시간 20~40분.
손글씨 숫자를 정확히 읽으세요. 97과 91, 98과 93을 구별하는 데 주의하세요.
불확실한 값은 [?] 접두사를 붙이세요.`,
    jsonSchema: `{
  "formDate": "YYYY-MM-DD", "productName": "제품명", "batchNo": "배치번호",
  "items": [{ "equipmentName": "설비명", "batchNo": "회차", "tempC": 숫자, "durationMin": 숫자, "result": "적합/부적합" }],
  "inspector": "작성자", "remarks": "비고"
}`,
  },
  ccp_2b: {
    label: "CCP-2B 가열(굽기) 기록",
    expectedRanges: { temp: [90, 120], time: [10, 30] },
    systemPrompt: `HACCP CCP-2B 가열(굽기) 기록지 OCR 전문가입니다.
이 문서는 식품 굽기 공정의 온도/시간 기록입니다.
기대값: 온도 90~120°C, 시간 10~30분.
손글씨 숫자 판독 시 97과 91, 0과 6을 주의 깊게 구별하세요.`,
    jsonSchema: `{
  "formDate": "YYYY-MM-DD", "productName": "제품명",
  "items": [{ "equipmentName": "설비명", "batchNo": "회차", "tempC": 숫자, "durationMin": 숫자, "result": "적합/부적합" }],
  "inspector": "작성자", "remarks": "비고"
}`,
  },
  ccp_4p: {
    label: "CCP-4P 금속검출 기록",
    expectedRanges: { feMm: [1.5, 2.5], susMm: [2.0, 3.5] },
    systemPrompt: `HACCP CCP-4P 금속검출 기록지 OCR 전문가입니다.
금속검출기의 Fe(철)/SUS(스테인리스) 테스트피스 감도 기록입니다.
기대값: Fe 2.0mm, SUS 2.5~3.0mm. 감도는 보통 소수점 1자리(2.0, 3.0)입니다.
"양호", "정상", "PASS" 등은 "적합"으로 통일하세요.`,
    jsonSchema: `{
  "formDate": "YYYY-MM-DD", "productName": "금속검출 통합",
  "items": [{ "testType": "Fe/SUS", "sensitivity": 숫자(mm), "result": "적합/부적합", "productName": "제품명" }],
  "inspector": "작성자", "remarks": "비고"
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
  // PR-AI: process.env 직접 접근 대신 견고한 키 해결 사용
  const { client: openai, source: keySource, usingProxy } = getOpenAIClient();

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

  // PR-AH/AI: 이미지 크기 + 키 source 로깅 (디버깅용)
  const base64 = imageBuffer.toString("base64");
  const base64SizeMB = (base64.length / 1024 / 1024).toFixed(2);
  console.log(
    `[scanOcr.callVisionOcr] OpenAI 호출 — mimeType=${mimeType} base64=${base64SizeMB}MB ` +
      `keySource=${keySource} proxy=${usingProxy}`,
  );

  const callT0 = Date.now();
  let response;
  try {
    response = await openai.chat.completions.create(
      {
        model: "gpt-4o",
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
      // PR-AH: 90초 타임아웃 — Cloudflare 100초 한계 이내
      { timeout: 90000 },
    );
  } catch (err: any) {
    const callElapsed = Date.now() - callT0;
    console.error(
      `[scanOcr.callVisionOcr] OpenAI 실패 (${callElapsed}ms) — ` +
        `status=${err?.status} type=${err?.type} message=${err?.message?.slice(0, 200)}`,
    );
    // 상위로 throw — scanChecklist.router에서 분류 처리
    throw err;
  }

  const callElapsed = Date.now() - callT0;
  console.log(`[scanOcr.callVisionOcr] OpenAI 성공 (${callElapsed}ms)`);

  const content = response.choices[0]?.message?.content || "";
  let parsed: Record<string, any> | null = null;

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try { parsed = JSON.parse(jsonMatch[0]); } catch { /* JSON 파싱 실패 */ }
  }

  return { rawText: content, parsed };
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
    // PR-AI: 동일한 키 해결 로직 사용
    const { client: openai } = getOpenAIClient();
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
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
    });

    const content = response.choices[0]?.message?.content || "";
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
  const match = path.match(/^items\[(\d+)\]\.(.+)$/);
  if (match && obj.items) {
    return obj.items[parseInt(match[1])]?.[match[2]];
  }
  return obj[path];
}

function setNestedValue(obj: any, path: string, val: any): void {
  const match = path.match(/^items\[(\d+)\]\.(.+)$/);
  if (match && obj.items && obj.items[parseInt(match[1])]) {
    obj.items[parseInt(match[1])][match[2]] = val;
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
  }
): Promise<EnhancedOcrResult> {
  const enableTwoPass = options?.enableTwoPass !== false;
  const enablePreprocessing = options?.enablePreprocessing !== false;
  const config = CHECKLIST_PROMPTS[checklistType] || DEFAULT_PROMPT;

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
          // 다중 페이지: items 배열 병합
          if (parsed.items && Array.isArray(parsed.items)) {
            mergedData.items = [...(mergedData.items || []), ...parsed.items];
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
    };
  } catch (error: any) {
    // PR-AH: OpenAI 에러를 구체적으로 분류
    // PR-AJ: 키 진단 정보를 메시지에 주입 (router의 try/catch는 도달 못함 — success=false 반환 경로)
    const errMsg = error?.message || "OCR 처리 중 오류가 발생했습니다.";
    const status = error?.status;
    const errType = error?.type;

    // 키 진단 (401 / 키 누락 케이스용)
    let keyDiagSuffix = "";
    try {
      const diag = findApiKeyWithDiagnostics();
      const proxyUrl = (process.env.BUILT_IN_FORGE_API_URL || "").trim();
      const keyPreview = diag.key ? `${diag.key.slice(0, 7)}***(len=${diag.key.length})` : "(empty)";
      keyDiagSuffix =
        ` | 진단: source=${diag.source}, ` +
        `keyPreview=${keyPreview}, ` +
        `proxy=${proxyUrl ? proxyUrl.replace(/^https?:\/\//, "").slice(0, 40) : "(none)"}, ` +
        `processEnv=[OPENAI=${diag.processEnv.OPENAI}, FORGE=${diag.processEnv.FORGE}, BUILT_IN_FORGE=${diag.processEnv.BUILT_IN_FORGE}]`;
    } catch {
      keyDiagSuffix = " | 진단 수집 실패";
    }

    let userFacingError = errMsg;
    if (status === 400 && errMsg.toLowerCase().includes("image")) {
      userFacingError = `OpenAI Vision이 이미지를 거부했습니다. PDF가 손상되었거나 변환 결과가 비정상일 수 있습니다. (${errMsg.slice(0, 150)})`;
    } else if (status === 429) {
      userFacingError = `OpenAI API 호출 한도를 초과했습니다. 잠시 후 다시 시도해주세요. (${errMsg.slice(0, 150)})`;
    } else if (status === 401 || errMsg.includes("Incorrect API key") || errMsg.toLowerCase().includes("invalid api key")) {
      // PR-AJ: 401 시 키 진단 정보를 메시지에 포함
      userFacingError = `OpenAI API 키 인증 실패 (401). 키가 만료/취소되었거나, 운영 환경에서 BUILT_IN_FORGE_API_URL 프록시와 매칭되지 않는 키일 수 있습니다.${keyDiagSuffix}`;
    } else if (errMsg.includes("OPENAI_API_KEY") || errMsg.includes("API 키") || errMsg.includes("설정 누락")) {
      // PR-AJ: 키 누락 시 진단 정보 포함
      userFacingError = `OpenAI/Forge API 키 설정 누락.${keyDiagSuffix} 서버 .env 파일 또는 PM2 환경에 키를 설정해주세요.`;
    } else if (errType === "timeout" || errMsg.toLowerCase().includes("timeout")) {
      userFacingError = `OpenAI API 시간 초과 (90초). 페이지 수가 많거나 이미지가 매우 클 때 발생합니다.`;
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

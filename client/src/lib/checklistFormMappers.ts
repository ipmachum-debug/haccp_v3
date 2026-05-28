/**
 * ★ PR-AN (2026-05-27): OCR JSON → CCP 폼 데이터 매퍼
 *
 * 역할:
 *   서버 scanOcr.ts 가 OpenAI 호출로 추출한 JSON 을 각 CCP 폼의 데이터 구조
 *   (Ccp4pFormData / Ccp1bFormData 등) 로 변환.
 *
 * 정책:
 *   - 서버 calculateFieldConfidence 가 자체 휴리스틱 신뢰도를 계산하여
 *     응답에 `fields: { [key]: { value, confidence, ... } }` 형태로 포함시킴.
 *   - 추가로 OpenAI 가 `_confidence` 객체를 같이 반환하면 우선 적용 (PR-AO+).
 *   - 본 매퍼는 두 소스를 모두 처리: 1) ocrResult._confidence (OpenAI 보고)
 *     2) ocrResult.fields[key].confidence (서버 휴리스틱). OpenAI 우선.
 *
 * 정확도:
 *   - OpenAI 프롬프트를 CCP 폼 필드명과 1:1 매칭으로 재작성하면 매핑 거의 무용
 *     → 직접 추출 (PR-AO 의 scanOcr 변경 후 적용).
 *   - 현재 (PR-AN) 는 legacy 형식 (items[] 배열) 호환을 위해 fallback 변환 유지.
 */
import type { Ccp4pFormData } from "@/components/ccp/CCP4PForm";
import type { Ccp1bFormData } from "@/components/ccp/CCP1BForm";
import type { Ccp2bFormData } from "@/components/ccp/CCP2BForm";

/** 서버 OCR 응답 표준 인터페이스 (legacy + new 양쪽 호환) */
export interface OcrResult {
  // 공통 필드
  formDate?: string;
  productName?: string;
  inspector?: string;
  remarks?: string;
  items?: Array<Record<string, any>>;

  // 서버 휴리스틱 신뢰도 (scanOcr.ts:380 의 fields 객체)
  fields?: Record<string, { value: any; confidence: number; needsReview?: boolean }>;

  // OpenAI 가 보고한 신뢰도 (PR-AO 프롬프트 재작성 후)
  _confidence?: Record<string, number>;

  // ★ PR-AS (2026-05-28): 다중 측정행 (CCP-1B/2B/3B)
  measurements?: Array<Record<string, any>>;

  // 추가 raw 필드 (인덱스 시그니처 대신 명시)
  [key: string]: any;
}

export interface MapResult<T> {
  values: Partial<T>;
  confidence: Partial<Record<keyof T, number>>;
}

/**
 * ★ PR-AS (2026-05-28): 다중 측정행 매퍼 결과.
 *   1 PDF 에 N 개의 측정 시각이 있을 때 N 개의 폼 인스턴스를 만들기 위한 형식.
 *   공통 필드 (recordDate, productName 등) 는 각 row 에 이미 병합되어 있음.
 */
export type MultiMapResult<T> = MapResult<T>[];

/**
 * 신뢰도 단일값 추출 헬퍼
 *   1순위: OpenAI 가 보고한 _confidence[key]
 *   2순위: 서버 휴리스틱 fields[key].confidence
 *   3순위: undefined (시각화 안 함 — 기본값 1.0 으로 간주)
 */
function pickConfidence(
  ocr: OcrResult,
  ...keys: string[]
): number | undefined {
  for (const key of keys) {
    if (ocr._confidence?.[key] !== undefined) return ocr._confidence[key];
    if (ocr.fields?.[key]?.confidence !== undefined) return ocr.fields[key].confidence;
  }
  return undefined;
}

/** 빈 문자열/undefined/null 정규화 → "" */
function s(v: any): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

/** "[?]" 같은 진단 접두사 제거 */
function cleanPrefix(v: any): string {
  const str = s(v);
  return str.replace(/^\[\?\]\s*/, "").replace(/^\[판독불가\]\s*/, "");
}

// ═══════════════════════════════════════════════════════════════
// CCP-4P: 금속검출 (사용자 우선 테스트 케이스)
// ═══════════════════════════════════════════════════════════════
export function mapOcrToCcp4p(ocr: OcrResult): MapResult<Ccp4pFormData> {
  // ── PR-AO 후 응답 형식 (필드 직접) ──
  // 폼 필드명과 OCR 출력 필드명이 일치하면 1:1 매핑.

  // ── PR-AN legacy fallback ──
  // 현재 서버는 items[] 배열로 반환. 첫 번째 Fe / SUS 항목을 추출:
  const items = Array.isArray(ocr.items) ? ocr.items : [];
  const feItem = items.find((it) => /fe/i.test(s(it.testType)));
  const susItem = items.find((it) => /sus|sts/i.test(s(it.testType)));

  // testType 별 result 를 폼의 productOnlyPass / feProductPass 등에 매핑
  // (legacy 응답은 정확하게 매칭 안 되므로 best-effort)
  const normalizePass = (v: any): "O" | "X" => {
    const str = cleanPrefix(v).toUpperCase();
    if (str === "X" || str === "FAIL" || str === "부적합") return "X";
    return "O";
  };

  const overallResult = (() => {
    const allPass = items.every((it) => /적합|pass|양호|정상/i.test(s(it.result)));
    return allPass ? "적합" : "부적합";
  })();

  return {
    values: {
      recordDate: cleanPrefix(ocr.recordDate ?? ocr.formDate),
      productName: cleanPrefix(ocr.productName),
      measurementTime: cleanPrefix(ocr.measurementTime),
      sensitivitySetting: s(
        ocr.sensitivitySetting ?? feItem?.sensitivity ?? susItem?.sensitivity,
      ),
      feTestPiecePass: normalizePass(ocr.feTestPiecePass ?? feItem?.result),
      stsTestPiecePass: normalizePass(ocr.stsTestPiecePass ?? susItem?.result),
      productOnlyPass: normalizePass(ocr.productOnlyPass),
      feProductPass: normalizePass(ocr.feProductPass),
      stsProductPass: normalizePass(ocr.stsProductPass),
      passedQuantity: s(ocr.passedQuantity),
      detectedQuantity: s(ocr.detectedQuantity),
      passFail: ocr.passFail === "부적합" ? "부적합" : (ocr.passFail === "적합" ? "적합" : overallResult),
      deviationContent: cleanPrefix(ocr.deviationContent ?? ocr.remarks),
      correctiveAction: cleanPrefix(ocr.correctiveAction),
    },
    confidence: {
      recordDate: pickConfidence(ocr, "recordDate", "formDate"),
      productName: pickConfidence(ocr, "productName"),
      measurementTime: pickConfidence(ocr, "measurementTime"),
      sensitivitySetting: pickConfidence(ocr, "sensitivitySetting"),
      feTestPiecePass: pickConfidence(ocr, "feTestPiecePass"),
      stsTestPiecePass: pickConfidence(ocr, "stsTestPiecePass"),
      productOnlyPass: pickConfidence(ocr, "productOnlyPass"),
      feProductPass: pickConfidence(ocr, "feProductPass"),
      stsProductPass: pickConfidence(ocr, "stsProductPass"),
      passedQuantity: pickConfidence(ocr, "passedQuantity"),
      detectedQuantity: pickConfidence(ocr, "detectedQuantity"),
      passFail: pickConfidence(ocr, "passFail"),
      deviationContent: pickConfidence(ocr, "deviationContent"),
      correctiveAction: pickConfidence(ocr, "correctiveAction"),
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// CCP-1B: 가열(증숙) — PR-AR 에서 본격 활성화 예정
// ═══════════════════════════════════════════════════════════════
export function mapOcrToCcp1b(ocr: OcrResult): MapResult<Ccp1bFormData> {
  const item = Array.isArray(ocr.items) ? ocr.items[0] ?? {} : {};
  return {
    values: {
      recordDate: cleanPrefix(ocr.recordDate ?? ocr.formDate),
      productName: cleanPrefix(ocr.productName ?? item.productName),
      measurementTime: cleanPrefix(ocr.measurementTime ?? item.measurementTime),
      heatingTimeMin: s(ocr.heatingTimeMin ?? item.heatingTimeMin ?? item.durationMin),
      pressureMpa: s(ocr.pressureMpa ?? item.pressureMpa),
      inputAmountKg: s(ocr.inputAmountKg ?? item.inputAmountKg),
      tempEdgeC: s(ocr.tempEdgeC ?? item.tempEdgeC),
      tempCenterC: s(ocr.tempCenterC ?? item.tempCenterC ?? item.tempC),
      passFail: ocr.passFail === "부적합" ? "부적합" : "적합",
      deviationContent: cleanPrefix(ocr.deviationContent ?? ocr.remarks),
      correctiveAction: cleanPrefix(ocr.correctiveAction),
    },
    confidence: {
      recordDate: pickConfidence(ocr, "recordDate", "formDate"),
      productName: pickConfidence(ocr, "productName"),
      measurementTime: pickConfidence(ocr, "measurementTime"),
      heatingTimeMin: pickConfidence(ocr, "heatingTimeMin", "durationMin"),
      pressureMpa: pickConfidence(ocr, "pressureMpa"),
      inputAmountKg: pickConfidence(ocr, "inputAmountKg"),
      tempEdgeC: pickConfidence(ocr, "tempEdgeC"),
      tempCenterC: pickConfidence(ocr, "tempCenterC", "tempC"),
      passFail: pickConfidence(ocr, "passFail"),
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// CCP-2B: 가열(굽기) — PR-AR
// ═══════════════════════════════════════════════════════════════
export function mapOcrToCcp2b(ocr: OcrResult): MapResult<Ccp2bFormData> {
  const item = Array.isArray(ocr.items) ? ocr.items[0] ?? {} : {};
  return {
    values: {
      recordDate: cleanPrefix(ocr.recordDate ?? ocr.formDate),
      productName: cleanPrefix(ocr.productName ?? item.productName),
      measurementTime: cleanPrefix(ocr.measurementTime ?? item.measurementTime),
      heatingTimeMin: s(ocr.heatingTimeMin ?? item.heatingTimeMin ?? item.durationMin),
      temperatureC: s(ocr.temperatureC ?? item.temperatureC ?? item.tempC),
      inputAmountKg: s(ocr.inputAmountKg ?? item.inputAmountKg),
      passFail: ocr.passFail === "부적합" ? "부적합" : "적합",
      deviationContent: cleanPrefix(ocr.deviationContent ?? ocr.remarks),
      correctiveAction: cleanPrefix(ocr.correctiveAction),
    },
    confidence: {
      recordDate: pickConfidence(ocr, "recordDate", "formDate"),
      productName: pickConfidence(ocr, "productName"),
      measurementTime: pickConfidence(ocr, "measurementTime"),
      heatingTimeMin: pickConfidence(ocr, "heatingTimeMin", "durationMin"),
      temperatureC: pickConfidence(ocr, "temperatureC", "tempC"),
      inputAmountKg: pickConfidence(ocr, "inputAmountKg"),
      passFail: pickConfidence(ocr, "passFail"),
    },
  };
}

// CCP-3B 는 CCP-2B 와 동일 구조이므로 동일 매퍼 재사용
export const mapOcrToCcp3b = mapOcrToCcp2b;

// ═══════════════════════════════════════════════════════════════
// ★ PR-AS (2026-05-28): 다중 측정행 매퍼
//   1 PDF → N 측정행 → N 폼 인스턴스.
//   각 측정행에 공통 필드(recordDate/productName/correctiveAction 등)를
//   병합하여 N 개의 독립된 MapResult 를 반환.
// ═══════════════════════════════════════════════════════════════

function pickRowConfidence(
  ocr: OcrResult,
  rowIdx: number,
  ...keys: string[]
): number | undefined {
  for (const key of keys) {
    const dotted = `measurements[${rowIdx}].${key}`;
    if (ocr._confidence?.[dotted] !== undefined) return ocr._confidence[dotted];
    if (ocr.fields?.[dotted]?.confidence !== undefined) return ocr.fields[dotted].confidence;
  }
  return undefined;
}

export function mapOcrToCcp1bMulti(ocr: OcrResult): MultiMapResult<Ccp1bFormData> {
  const measurements = Array.isArray(ocr.measurements) ? ocr.measurements : [];
  // measurements 없으면 단일 행으로 fallback (legacy items[] 또는 flat 필드)
  if (measurements.length === 0) {
    return [mapOcrToCcp1b(ocr)];
  }

  const sharedRecordDate = cleanPrefix(ocr.recordDate ?? ocr.formDate);
  // 행에 품명이 없을 때만 상단 공통 productName 으로 fallback
  const fallbackProductName = cleanPrefix(ocr.productName);
  const sharedDeviation = cleanPrefix(ocr.deviationContent ?? ocr.remarks);
  const sharedCorrective = cleanPrefix(ocr.correctiveAction);
  const sharedRecordDateConf = pickConfidence(ocr, "recordDate", "formDate");

  return measurements.map((row, idx) => {
    // ★ PR-AS2: 품명은 각 행의 품명 컬럼 우선. equipment(교반기) 가 있으면 병합.
    const rowName = cleanPrefix(row.productName) || fallbackProductName;
    const equipment = cleanPrefix(row.equipment);
    const rowProductName = equipment
      ? `${rowName} (교반기${equipment.replace(/[^0-9]/g, "") || equipment})`.trim()
      : rowName;

    return {
      values: {
        recordDate: sharedRecordDate,
        productName: rowProductName,
        measurementTime: cleanPrefix(row.measurementTime),
        heatingTimeMin: s(row.heatingTimeMin ?? row.durationMin),
        pressureMpa: s(row.pressureMpa),
        inputAmountKg: s(row.inputAmountKg),
        tempEdgeC: s(row.tempEdgeC),
        tempCenterC: s(row.tempCenterC ?? row.tempC),
        passFail: row.passFail === "부적합" ? "부적합" : "적합",
        deviationContent: sharedDeviation,
        correctiveAction: sharedCorrective,
      },
      confidence: {
        recordDate: sharedRecordDateConf,
        productName: pickRowConfidence(ocr, idx, "productName"),
        measurementTime: pickRowConfidence(ocr, idx, "measurementTime"),
        heatingTimeMin: pickRowConfidence(ocr, idx, "heatingTimeMin", "durationMin"),
        pressureMpa: pickRowConfidence(ocr, idx, "pressureMpa"),
        inputAmountKg: pickRowConfidence(ocr, idx, "inputAmountKg"),
        tempEdgeC: pickRowConfidence(ocr, idx, "tempEdgeC"),
        tempCenterC: pickRowConfidence(ocr, idx, "tempCenterC", "tempC"),
        passFail: pickRowConfidence(ocr, idx, "passFail"),
      },
    };
  });
}

export function mapOcrToCcp2bMulti(ocr: OcrResult): MultiMapResult<Ccp2bFormData> {
  const measurements = Array.isArray(ocr.measurements) ? ocr.measurements : [];
  if (measurements.length === 0) {
    return [mapOcrToCcp2b(ocr)];
  }

  const sharedRecordDate = cleanPrefix(ocr.recordDate ?? ocr.formDate);
  const fallbackProductName = cleanPrefix(ocr.productName);
  const sharedDeviation = cleanPrefix(ocr.deviationContent ?? ocr.remarks);
  const sharedCorrective = cleanPrefix(ocr.correctiveAction);
  const sharedRecordDateConf = pickConfidence(ocr, "recordDate", "formDate");

  return measurements.map((row, idx) => ({
    values: {
      recordDate: sharedRecordDate,
      productName: cleanPrefix(row.productName) || fallbackProductName,
      measurementTime: cleanPrefix(row.measurementTime),
      heatingTimeMin: s(row.heatingTimeMin ?? row.durationMin),
      temperatureC: s(row.temperatureC ?? row.tempC),
      inputAmountKg: s(row.inputAmountKg),
      passFail: row.passFail === "부적합" ? "부적합" : "적합",
      deviationContent: sharedDeviation,
      correctiveAction: sharedCorrective,
    },
    confidence: {
      recordDate: sharedRecordDateConf,
      productName: pickRowConfidence(ocr, idx, "productName"),
      measurementTime: pickRowConfidence(ocr, idx, "measurementTime"),
      heatingTimeMin: pickRowConfidence(ocr, idx, "heatingTimeMin", "durationMin"),
      temperatureC: pickRowConfidence(ocr, idx, "temperatureC", "tempC"),
      inputAmountKg: pickRowConfidence(ocr, idx, "inputAmountKg"),
      passFail: pickRowConfidence(ocr, idx, "passFail"),
    },
  }));
}

export const mapOcrToCcp3bMulti = mapOcrToCcp2bMulti;

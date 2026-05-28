/**
 * ★ PR-AN (2026-05-27): 체크리스트 타입 → 양식지 폼 매핑 레지스트리
 *
 * 목적:
 *   ScanChecklistUpload 3단계 미리보기에서 "범용 vertical list" 대신
 *   실제 프로덕트에 구현된 CCP 양식지 (CCP4PForm 등) 를 미리채움 모드로
 *   재사용한다. 최종 확정은 양식지의 정식 저장 mutation
 *   (`ccpMonitoring.createCcpMonitoringRecord`) 으로 처리되므로 수기 입력과
 *   100% 동일한 DB 레코드 생성.
 *
 * 사용:
 *   const entry = getChecklistFormEntry(checklistType);
 *   if (!entry) return <LegacyVerticalPreview ... />;  // 폴백
 *   const { values, confidence } = entry.schemaMapper(ocrResult);
 *   return <entry.Form initialValues={values} fieldConfidence={confidence}
 *                      mode="ocr-review" onSaved={...} />
 */
import { CCP1BForm } from "@/components/ccp/CCP1BForm";
import { CCP2BForm } from "@/components/ccp/CCP2BForm";
import { CCP3BForm } from "@/components/ccp/CCP3BForm";
import { CCP4PForm } from "@/components/ccp/CCP4PForm";
import {
  mapOcrToCcp1b,
  mapOcrToCcp2b,
  mapOcrToCcp3b,
  mapOcrToCcp4p,
  mapOcrToCcp1bMulti,
  mapOcrToCcp2bMulti,
  mapOcrToCcp3bMulti,
  type OcrResult,
  type MapResult,
  type MultiMapResult,
} from "./checklistFormMappers";

export interface ChecklistFormEntry {
  /** 사용자에게 보여줄 라벨 (안내 배너용) */
  label: string;

  /** 양식지 컴포넌트 — 수기/OCR 공용 (props 통해 모드 전환) */
  Form: React.ComponentType<any>;

  /** OCR JSON → 폼 데이터 변환 (단일 레코드) */
  schemaMapper: (ocrResult: OcrResult) => MapResult<any>;

  /**
   * ★ PR-AS (2026-05-28): 다중 측정행 매퍼 — measurements[] 처리.
   *   설정되어 있으면 UI 가 N 개의 폼 인스턴스를 렌더링.
   *   없으면 단일 schemaMapper 만 사용.
   */
  multiSchemaMapper?: (ocrResult: OcrResult) => MultiMapResult<any>;
}

/**
 * 체크리스트 종류 → 양식지 매핑.
 *
 * 키 명세:
 *   - "ccp_4p" : 사용자 우선 테스트 케이스 (금속검출)
 *   - "ccp_1b" / "ccp_2b" / "ccp_3b" : 가열 공정 (props 일반화 완료, 매퍼 best-effort)
 *
 * 미등록 키 (예: "general", "personal_hygiene") 는 null → 폴백 vertical list 사용.
 */
const REGISTRY: Record<string, ChecklistFormEntry> = {
  ccp_1b: {
    label: "CCP-1B 가열(증숙) 기록지",
    Form: CCP1BForm,
    schemaMapper: mapOcrToCcp1b,
    multiSchemaMapper: mapOcrToCcp1bMulti,
  },
  ccp_2b: {
    label: "CCP-2B 가열(굽기) 기록지",
    Form: CCP2BForm,
    schemaMapper: mapOcrToCcp2b,
    multiSchemaMapper: mapOcrToCcp2bMulti,
  },
  ccp_3b: {
    label: "CCP-3B 가열 기록지",
    Form: CCP3BForm,
    schemaMapper: mapOcrToCcp3b,
    multiSchemaMapper: mapOcrToCcp3bMulti,
  },
  ccp_4p: {
    label: "CCP-4P 금속검출 기록지",
    Form: CCP4PForm,
    schemaMapper: mapOcrToCcp4p,
  },
};

/**
 * 레지스트리 조회. 등록되지 않은 타입은 null 반환.
 *
 * ccp_record (범용 CCP 기록) 의 경우 OCR JSON 의 ccpType 필드를 보고
 * 자동 분류 시도. 실패 시 null → 폴백.
 */
export function getChecklistFormEntry(
  checklistType: string,
  ocrResult?: OcrResult,
): ChecklistFormEntry | null {
  const direct = REGISTRY[checklistType];
  if (direct) return direct;

  // ccp_record (범용) 인 경우 OCR 응답의 ccpType / formType 으로 추정
  if (checklistType === "ccp_record" && ocrResult) {
    const t = String(ocrResult.ccpType ?? ocrResult.formType ?? "").toLowerCase();
    if (t.includes("4p") || t.includes("금속")) return REGISTRY.ccp_4p;
    if (t.includes("1b") || t.includes("증숙")) return REGISTRY.ccp_1b;
    if (t.includes("2b") || t.includes("굽기") || t.includes("금기")) return REGISTRY.ccp_2b;
    if (t.includes("3b")) return REGISTRY.ccp_3b;
  }

  return null;
}

/** 등록된 모든 키 (디버깅/UI 용) */
export function getRegisteredFormTypes(): string[] {
  return Object.keys(REGISTRY);
}

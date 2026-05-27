/**
 * ★ PR-AN (2026-05-27): CCP 모니터링 폼 공통 props 인터페이스
 *
 * 목적:
 *   - 4개 CCP 폼 (1B/2B/3B/4P) 가 동일 패턴으로 OCR 미리채움 / 신뢰도 시각화 /
 *     동작 모드 / 저장 콜백을 지원하게 한다.
 *   - 모든 prop 이 optional 이므로 기존 수기 입력 호출처 (`<CCP4PForm />` 등) 는
 *     변경 없이 그대로 동작 (호환 유지).
 *   - OCR 검토 모드에서는 ScanChecklistUpload 가 props 를 채워 동일 컴포넌트를
 *     "미리채움 + 검토" 양식지로 재사용한다.
 *
 * 설계 원칙 (이전 리뷰 반영):
 *   - fieldConfidence 는 Partial<Record<...>> — 일부 필드만 확신도 보고 가능.
 *   - mode 기본값은 "manual" — 기존 동작 그대로.
 *   - title 옵션 — OCR 미리보기에서 "AI 자동 인식 결과 — 검토 후 확정"
 *     같은 헤더로 덮어쓰기 가능.
 */
export type CcpFormMode = "manual" | "ocr-review";

export interface CcpFormProps<TFormData = Record<string, unknown>> {
  /** OCR 결과 등 미리채움 값. 부분 채움 허용. */
  initialValues?: Partial<TFormData>;

  /** 필드별 신뢰도 (0~1). ocr-review 모드에서 시각화에 사용. */
  fieldConfidence?: Partial<Record<keyof TFormData, number>>;

  /** 동작 모드. 기본 "manual" — 기존 수기 입력 동작. */
  mode?: CcpFormMode;

  /** 저장 완료 후 콜백. ScanChecklistUpload 가 result 화면 전환에 사용. */
  onSaved?: (record: any) => void;

  /** 표시할 카드 제목 (선택). 기본은 컴포넌트 자체 제목. */
  title?: string;

  /** 표시할 카드 설명 (선택). */
  description?: string;
}

/**
 * 신뢰도에 따른 Tailwind 클래스 생성 헬퍼
 *   - mode !== "ocr-review" 면 빈 문자열 (수기 모드는 시각화 없음).
 *   - confidence 가 undefined 면 1.0 으로 간주.
 *   - >= 0.9: 표시 없음
 *   - 0.7 ~ 0.9: bg-yellow-50 (옅은 강조)
 *   - < 0.7: ring-2 ring-yellow-400 (강한 강조)
 */
export function confidenceClass(
  mode: CcpFormMode | undefined,
  confidence: number | undefined,
): string {
  if (mode !== "ocr-review") return "";
  const c = confidence ?? 1;
  if (c >= 0.9) return "";
  if (c >= 0.7) return "bg-yellow-50";
  return "ring-2 ring-yellow-400";
}

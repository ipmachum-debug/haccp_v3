/**
 * @deprecated Plugin Architecture (PR #220-225) 로 이주 완료.
 *
 * 신규 코드는 다음을 사용:
 *   import { getDocumentFormTypes } from "@/domain";
 *   const types = getDocumentFormTypes(plugin);
 *
 * 본 파일은 plugin 미정 시 폴백 호환성 유지 목적으로 보존됨.
 * 모든 호출처가 plugin 기반으로 전환되면 제거 예정.
 *
 * Document FormType Catalog — industry 별 분류 (Legacy).
 *
 * 문서 결재자 설정 (DocumentApprovalSettingsPage) 에서 사용.
 * 화장품 GMP 테넌트가 식품 HACCP 전용 문서 (CCP 기록지 등) 를 보지 않도록
 * industry 분류 추가.
 */

export type DocumentFormIndustry = "haccp" | "gmp" | "common";

export interface DocumentFormType {
  formType: string;
  name: string;
  category: string;
  industry: DocumentFormIndustry;
}

export const DOCUMENT_FORM_TYPES: DocumentFormType[] = [
  // ─── 일일 점검 (식품 HACCP 전용) ───
  { formType: "hygiene_checklist", name: "일반위생관리 점검일지", category: "일일 점검", industry: "haccp" },
  { formType: "foreign_material_record", name: "이물관리 점검일지", category: "일일 점검", industry: "haccp" },
  { formType: "temperature_humidity_check", name: "원재료실 온습도 관리일지", category: "일일 점검", industry: "haccp" },
  { formType: "refrigeration_check", name: "냉동·냉장고 온도관리일지", category: "일일 점검", industry: "haccp" },

  // ─── 검사 성적서 (식품 HACCP 전용) ───
  { formType: "airborne_bacteria_test", name: "공중낙하세균 검사 성적서", category: "검사 성적서", industry: "haccp" },
  { formType: "surface_contamination_test", name: "표면오염도 검사 성적서", category: "검사 성적서", industry: "haccp" },
  { formType: "product_test_log", name: "대장균군 검사 성적서", category: "검사 성적서", industry: "haccp" },
  { formType: "product_test_report", name: "제품 검사 성적서", category: "검사 성적서", industry: "haccp" },

  // ─── 위생 관리 (식품 HACCP 전용) ───
  { formType: "personal_hygiene_check", name: "개인 위생관리 점검표", category: "위생 관리", industry: "haccp" },
  { formType: "hygiene_facility_check", name: "위생시설 점검일지", category: "위생 관리", industry: "haccp" },
  { formType: "workplace_hygiene_check", name: "작업장 위생관리 점검표", category: "위생 관리", industry: "haccp" },
  { formType: "sanitation_record", name: "손세척 소독 점검일지", category: "위생 관리", industry: "haccp" },
  { formType: "employee_health_check", name: "종사자 건강상태 확인 일지", category: "위생 관리", industry: "haccp" },
  { formType: "hygiene_inspection", name: "방문자 위생관리 점검표", category: "위생 관리", industry: "haccp" },

  // ─── 설비 관리 (공통 — 화장품 GMP 도 사용) ───
  { formType: "air_compressor_maintenance", name: "공조장치 관리일지", category: "설비 관리", industry: "common" },
  { formType: "air_compressor_filter", name: "공조장치 필터 관리대장", category: "설비 관리", industry: "common" },
  { formType: "equipment_inspection", name: "설비 점검 관리대장", category: "설비 관리", industry: "common" },
  { formType: "equipment_history", name: "설비 이력 관리대장", category: "설비 관리", industry: "common" },
  { formType: "equipment_cleaning_record", name: "세척소독 관리대장", category: "설비 관리", industry: "common" },
  { formType: "illumination_check", name: "조도 점검 관리대장", category: "설비 관리", industry: "common" },

  // ─── 용수/방충 관리 (식품 HACCP 전용) ───
  { formType: "water_quality_test", name: "수질 검사 성적서", category: "용수/방충 관리", industry: "haccp" },
  { formType: "water_management_check", name: "용수관리 점검일지", category: "용수/방충 관리", industry: "haccp" },
  { formType: "water_usage_check", name: "용수 사용량 점검일지", category: "용수/방충 관리", industry: "haccp" },
  { formType: "pest_control_checklist", name: "방충방서 관리일지", category: "용수/방충 관리", industry: "haccp" },

  // ─── 원재료/제품 관리 (식품 HACCP 전용 — 화장품은 BMR/Release 별도) ───
  { formType: "material_inspection", name: "원재료 검수 관리대장", category: "원재료/제품 관리", industry: "haccp" },
  { formType: "packaging_storage_record", name: "포장재 보관 관리대장", category: "원재료/제품 관리", industry: "haccp" },
  { formType: "finished_product_check", name: "완제품 검사 관리대장", category: "원재료/제품 관리", industry: "haccp" },
  { formType: "shipping_inspection", name: "출하 검사 관리대장", category: "원재료/제품 관리", industry: "haccp" },
  { formType: "self_quality_inspection", name: "자주품질 검사 관리대장", category: "원재료/제품 관리", industry: "haccp" },
  { formType: "weight_quality_check", name: "중량 품질 검사 관리대장", category: "원재료/제품 관리", industry: "haccp" },
  { formType: "supplier_inspection", name: "공급업체 점검 관리대장", category: "원재료/제품 관리", industry: "haccp" },

  // ─── 교육/훈련 (공통 — Y-3 cross-cutting) ───
  { formType: "training_log", name: "교육훈련 관리대장", category: "교육/훈련", industry: "common" },

  // ─── 기타 관리 (공통) ───
  { formType: "waste_management", name: "폐기물 관리대장", category: "기타 관리", industry: "common" },
  { formType: "daily_disposal_record", name: "일일 폐기 관리대장", category: "기타 관리", industry: "common" },
  { formType: "food_recall_notice", name: "회수 관리대장", category: "기타 관리", industry: "common" },
  { formType: "consumer_complaint", name: "소비자 불만 관리대장", category: "기타 관리", industry: "common" },
  { formType: "capa_record", name: "개선/시정 조치 관리대장", category: "기타 관리", industry: "common" },
  { formType: "quality_issue_record", name: "품질 이슈 관리대장", category: "기타 관리", industry: "common" },
  { formType: "handover_document", name: "인수인계 문서", category: "기타 관리", industry: "common" },
  { formType: "vehicle_temperature_check", name: "차량 온도 점검일지", category: "기타 관리", industry: "haccp" },

  // ─── 기타 (공통) ───
  { formType: "validity_evaluation", name: "유효성 평가 기록부", category: "기타", industry: "common" },

  // ─── 기간별 일지 (공통) ───
  { formType: "daily_log", name: "일일일지", category: "기간별 일지", industry: "common" },
  { formType: "weekly_log", name: "주간일지", category: "기간별 일지", industry: "common" },
  { formType: "monthly_log", name: "월간일지", category: "기간별 일지", industry: "common" },
  { formType: "yearly_log", name: "연간일지", category: "기간별 일지", industry: "common" },

  // ─── 생산일지 (공통) ───
  { formType: "production_daily", name: "생산일지", category: "생산관리", industry: "common" },

  // ─── CCP 기록지 (식품 HACCP 전용 — 화장품은 IPC 별도) ───
  { formType: "batch_production", name: "[CCP] 배치 CCP 승인 (자동)", category: "CCP 기록지", industry: "haccp" },
  { formType: "ccp_form", name: "[CCP] CCP 모니터링 기록지", category: "CCP 기록지", industry: "haccp" },
  { formType: "ccp_2b_baking", name: "[CCP-2B] 가열(굽기)공정 기록지", category: "CCP 기록지", industry: "haccp" },
  { formType: "ccp_1b_steam", name: "[CCP-1B] 가열(증숙)공정 기록지", category: "CCP 기록지", industry: "haccp" },
  { formType: "ccp_4p_metal", name: "[CCP-4P] 금속검출공정 기록지", category: "CCP 기록지", industry: "haccp" },

  // ─── 화장품 GMP — Phase 2 lifecycle ───
  { formType: "cosmetic_bmr", name: "BMR (제조기록서)", category: "화장품 GMP", industry: "gmp" },
  { formType: "cosmetic_bmr_ipc", name: "BMR 공정중관리 (IPC)", category: "화장품 GMP", industry: "gmp" },
  { formType: "cosmetic_formula", name: "배합표 (Formula)", category: "화장품 GMP", industry: "gmp" },
  { formType: "cosmetic_label", name: "라벨 / 전성분 (INCI)", category: "화장품 GMP", industry: "gmp" },
  { formType: "cosmetic_release", name: "QA 출고 (Release) 승인", category: "화장품 GMP", industry: "gmp" },
  { formType: "cosmetic_stability", name: "안정성시험 (ICH Q1A)", category: "화장품 GMP", industry: "gmp" },

  // ─── Y-시리즈 cross-cutting (화장품 GMP + 식품 HACCP 공통, 다만 양식 동일) ───
  { formType: "y_change_control", name: "변경관리 (Change Control)", category: "품질관리 (Y-시리즈)", industry: "common" },
  { formType: "y_nonconforming", name: "부적합 관리 (통합)", category: "품질관리 (Y-시리즈)", industry: "common" },
  { formType: "y_corrective_action", name: "CAPA (시정·예방조치)", category: "품질관리 (Y-시리즈)", industry: "common" },
  { formType: "y_audit", name: "감사 (Audit)", category: "품질관리 (Y-시리즈)", industry: "common" },
  { formType: "y_calibration", name: "검교정 / 설비 자격", category: "품질관리 (Y-시리즈)", industry: "common" },
  { formType: "y_quality_supplier", name: "공급업체 (AVL)", category: "품질관리 (Y-시리즈)", industry: "common" },
  { formType: "y_risk_assessment", name: "위험 평가 (ICH Q9)", category: "품질관리 (Y-시리즈)", industry: "common" },
];

/**
 * 테넌트 industry 에 맞는 문서 양식만 필터.
 *
 * @param hasHACCP - 식품 HACCP 모듈 활성 여부
 * @param hasGMP - 화장품 GMP 모듈 활성 여부
 * @returns industry 에 해당하는 문서 양식 배열
 *
 * 동작:
 *   - 양 모듈 모두 활성 (다중 사업장) → 전체 반환
 *   - HACCP 만 활성 → "haccp" + "common"
 *   - GMP 만 활성 → "gmp" + "common"
 *   - 둘 다 비활성 → "common" 만 (안전 폴백)
 */
export function filterFormTypesByIndustry(
  hasHACCP: boolean,
  hasGMP: boolean,
): DocumentFormType[] {
  if (hasHACCP && hasGMP) return DOCUMENT_FORM_TYPES;
  return DOCUMENT_FORM_TYPES.filter((ft) => {
    if (ft.industry === "common") return true;
    if (ft.industry === "haccp") return hasHACCP;
    if (ft.industry === "gmp") return hasGMP;
    return false;
  });
}

/**
 * 업종코드별 피처 매핑 설정 (Industry Feature Configuration)
 * ────────────────────────────────────────────────────────────
 * KSIC(한국표준산업분류) 기반 제조업 업종코드와
 * 각 업종에서 활성화되는 모듈/기능을 정의합니다.
 *
 * 이 파일은 서버와 클라이언트 모두에서 사용됩니다.
 * (shared 로직으로 단일 진실 유지)
 *
 * 사용법:
 *   import { INDUSTRY_CODES, resolveIndustryFeatures } from "@/shared/industryConfig";
 *   const features = resolveIndustryFeatures("C10");
 *   if (features.modules.haccp) { ... }
 */

// ============================================
// 1. 업종 카테고리 정의
// ============================================

export type IndustryCategory =
  | "food"         // 식품제조
  | "cosmetics"    // 화장품제조
  | "supplement"   // 건강기능식품
  | "pharma"       // 의약품제조
  | "electronics"  // 전자제품
  | "textile"      // 섬유/의류
  | "chemical"     // 화학제품
  | "general";     // 일반제조

// ============================================
// 2. 모듈/기능 키 타입 정의
// ============================================

/** 활성화 가능한 모듈 */
export type ModuleKey =
  | "erp"           // ERP (회계/재무)
  | "production"    // 생산관리
  | "inventory"     // 재고관리
  | "quality"       // 품질관리
  | "purchasing"    // 구매/발주
  | "sales"         // 판매/견적
  | "hr"            // 인사/급여
  | "haccp"         // HACCP (식품안전)
  | "gmp"           // GMP (우수제조관리)
  | "iso"           // ISO 인증관리
  | "traceability"; // LOT/이력추적

/** 활성화 가능한 세부 기능 */
export type FeatureKey =
  // HACCP 관련
  | "ccp_monitoring"        // CCP 실시간 모니터링
  | "haccp_7principles"     // HACCP 7원칙 12절차
  | "hygiene_checklist"     // 위생점검 체크리스트
  | "allergen_mgmt"         // 알레르기 유발물질 관리
  | "food_defense"          // 식품방어
  | "recall_mgmt"           // 리콜관리
  // GMP 관련
  | "gmp_deviation"         // 일탈관리
  | "gmp_capa"              // 시정/예방조치(CAPA)
  | "stability_test"        // 안정성시험
  | "gmp_validation"        // 밸리데이션
  | "gmp_change_control"    // 변경관리
  // 품질 공통
  | "incoming_inspection"   // 수입검사
  | "process_inspection"    // 공정검사
  | "final_inspection"      // 최종검사
  | "nonconforming_mgmt"    // 부적합품 관리
  | "calibration"           // 계측기 교정
  // 생산 관련
  | "bom_management"        // BOM(자재명세서)
  | "batch_production"      // 배치생산
  | "continuous_production" // 연속생산
  | "work_order"            // 작업지시
  | "equipment_mgmt"        // 설비관리
  // 재고 관련
  | "lot_tracking"          // LOT 추적
  | "fefo_allocation"       // FEFO(선입선출) 배분
  | "expiry_mgmt"           // 유통기한 관리
  | "serial_tracking"       // 시리얼번호 추적
  // ERP 관련
  | "double_entry"          // 복식부기
  | "tax_invoice"           // 세금계산서
  | "cost_analysis"         // 원가분석
  | "budget_mgmt";          // 예산관리

/** UI 라벨 오버라이드 */
export type LabelOverrides = {
  batch?: string;     // "배치" | "로트" | "Batch"
  product?: string;   // "제품" | "완제품" | "화장품"
  material?: string;  // "원재료" | "원료" | "부품"
  process?: string;   // "공정" | "제조공정" | "생산라인"
  site?: string;      // "공장" | "제조소" | "사업장"
};

// ============================================
// 3. 업종별 기본 설정
// ============================================

export interface IndustryProfile {
  code: string;
  nameKo: string;
  nameEn: string;
  category: IndustryCategory;
  description: string;
  icon: string;

  /** 활성 모듈 */
  modules: Record<ModuleKey, boolean>;

  /** 활성 세부 기능 */
  features: Partial<Record<FeatureKey, boolean>>;

  /** UI 라벨 오버라이드 */
  labels: LabelOverrides;

  /** 필수/권장 인증 */
  certifications: Array<{
    code: string;
    nameKo: string;
    requirement: "mandatory" | "recommended" | "optional";
  }>;
}

// ────────────────────────────────────────────────────────────
// 식품제조 (C10)
// ────────────────────────────────────────────────────────────

const FOOD_MANUFACTURING: IndustryProfile = {
  code: "C10",
  nameKo: "식품 제조업",
  nameEn: "Food Manufacturing",
  category: "food",
  description: "식료품 제조 및 가공 (빵류, 음료, 유제품, 육가공, 수산가공 등)",
  icon: "chef-hat",
  modules: {
    erp: true,
    production: true,
    inventory: true,
    quality: true,
    purchasing: true,
    sales: true,
    hr: true,
    haccp: true,       // ★ 핵심
    gmp: false,
    iso: false,
    traceability: true,
  },
  features: {
    // HACCP 핵심
    ccp_monitoring: true,
    haccp_7principles: true,
    hygiene_checklist: true,
    allergen_mgmt: true,
    food_defense: true,
    recall_mgmt: true,
    // 품질
    incoming_inspection: true,
    process_inspection: true,
    final_inspection: true,
    nonconforming_mgmt: true,
    calibration: true,
    // 생산
    bom_management: true,
    batch_production: true,
    work_order: true,
    equipment_mgmt: true,
    // 재고
    lot_tracking: true,
    fefo_allocation: true,
    expiry_mgmt: true,
    // ERP
    double_entry: true,
    tax_invoice: true,
    cost_analysis: true,
  },
  labels: {
    batch: "배치",
    product: "제품",
    material: "원재료",
    process: "공정",
    site: "공장",
  },
  certifications: [
    { code: "HACCP", nameKo: "식품안전관리인증기준(HACCP)", requirement: "mandatory" },
    { code: "ISO22000", nameKo: "식품안전경영시스템", requirement: "recommended" },
    { code: "FSSC22000", nameKo: "식품안전시스템인증", requirement: "optional" },
  ],
};

// ────────────────────────────────────────────────────────────
// 화장품 제조업 (C20)
// ────────────────────────────────────────────────────────────

const COSMETICS_MANUFACTURING: IndustryProfile = {
  code: "C20",
  nameKo: "화장품 제조업",
  nameEn: "Cosmetics Manufacturing",
  category: "cosmetics",
  description: "화장품, 향수, 세정제 등 제조",
  icon: "sparkles",
  modules: {
    erp: true,
    production: true,
    inventory: true,
    quality: true,
    purchasing: true,
    sales: true,
    hr: true,
    haccp: false,
    gmp: true,         // ★ 핵심
    iso: true,
    traceability: true,
  },
  features: {
    // GMP 핵심
    gmp_deviation: true,
    gmp_capa: true,
    stability_test: true,
    gmp_validation: true,
    gmp_change_control: true,
    // 품질
    incoming_inspection: true,
    process_inspection: true,
    final_inspection: true,
    nonconforming_mgmt: true,
    calibration: true,
    // 생산
    bom_management: true,
    batch_production: true,
    work_order: true,
    equipment_mgmt: true,
    // 재고
    lot_tracking: true,
    fefo_allocation: true,
    expiry_mgmt: true,
    // ERP
    double_entry: true,
    tax_invoice: true,
    cost_analysis: true,
  },
  labels: {
    batch: "제조번호",
    product: "화장품",
    material: "원료",
    process: "제조공정",
    site: "제조소",
  },
  certifications: [
    { code: "cGMP", nameKo: "화장품 우수제조관리기준(cGMP)", requirement: "mandatory" },
    { code: "ISO22716", nameKo: "화장품 GMP 국제표준", requirement: "recommended" },
    { code: "ISO9001", nameKo: "품질경영시스템", requirement: "optional" },
  ],
};

// ────────────────────────────────────────────────────────────
// 건강기능식품 (C10_SUPPLEMENT)
// ────────────────────────────────────────────────────────────

const SUPPLEMENT_MANUFACTURING: IndustryProfile = {
  code: "C10_SUP",
  nameKo: "건강기능식품 제조업",
  nameEn: "Health Supplement Manufacturing",
  category: "supplement",
  description: "건강기능식품, 홍삼, 비타민, 프로바이오틱스 등 제조",
  icon: "pill",
  modules: {
    erp: true,
    production: true,
    inventory: true,
    quality: true,
    purchasing: true,
    sales: true,
    hr: true,
    haccp: true,       // ★ HACCP + GMP 동시
    gmp: true,         // ★ HACCP + GMP 동시
    iso: true,
    traceability: true,
  },
  features: {
    // HACCP
    ccp_monitoring: true,
    haccp_7principles: true,
    hygiene_checklist: true,
    allergen_mgmt: true,
    recall_mgmt: true,
    // GMP
    gmp_deviation: true,
    gmp_capa: true,
    stability_test: true,
    gmp_validation: true,
    gmp_change_control: true,
    // 품질
    incoming_inspection: true,
    process_inspection: true,
    final_inspection: true,
    nonconforming_mgmt: true,
    calibration: true,
    // 생산
    bom_management: true,
    batch_production: true,
    work_order: true,
    equipment_mgmt: true,
    // 재고
    lot_tracking: true,
    fefo_allocation: true,
    expiry_mgmt: true,
    // ERP
    double_entry: true,
    tax_invoice: true,
    cost_analysis: true,
  },
  labels: {
    batch: "제조번호",
    product: "건강기능식품",
    material: "원료",
    process: "제조공정",
    site: "제조소",
  },
  certifications: [
    { code: "HACCP", nameKo: "식품안전관리인증기준(HACCP)", requirement: "mandatory" },
    { code: "GMP", nameKo: "건강기능식품 GMP", requirement: "mandatory" },
    { code: "ISO22000", nameKo: "식품안전경영시스템", requirement: "recommended" },
  ],
};

// ────────────────────────────────────────────────────────────
// 의약품 제조업 (C21)
// ────────────────────────────────────────────────────────────

const PHARMA_MANUFACTURING: IndustryProfile = {
  code: "C21",
  nameKo: "의약품 제조업",
  nameEn: "Pharmaceutical Manufacturing",
  category: "pharma",
  description: "의약품, 의약외품, 원료의약품 등 제조",
  icon: "syringe",
  modules: {
    erp: true,
    production: true,
    inventory: true,
    quality: true,
    purchasing: true,
    sales: true,
    hr: true,
    haccp: false,
    gmp: true,         // ★ KGMP 핵심
    iso: true,
    traceability: true,
  },
  features: {
    // GMP 핵심 (의약품 수준)
    gmp_deviation: true,
    gmp_capa: true,
    stability_test: true,
    gmp_validation: true,
    gmp_change_control: true,
    // 품질
    incoming_inspection: true,
    process_inspection: true,
    final_inspection: true,
    nonconforming_mgmt: true,
    calibration: true,
    // 생산
    bom_management: true,
    batch_production: true,
    work_order: true,
    equipment_mgmt: true,
    // 재고
    lot_tracking: true,
    fefo_allocation: true,
    expiry_mgmt: true,
    serial_tracking: true,  // 의약품 시리얼 추적
    // ERP
    double_entry: true,
    tax_invoice: true,
    cost_analysis: true,
  },
  labels: {
    batch: "제조번호",
    product: "의약품",
    material: "원료",
    process: "제조공정",
    site: "제조소",
  },
  certifications: [
    { code: "KGMP", nameKo: "의약품 제조 및 품질관리기준(KGMP)", requirement: "mandatory" },
    { code: "PIC/S", nameKo: "PIC/S GMP", requirement: "recommended" },
    { code: "ISO13485", nameKo: "의료기기 품질경영시스템", requirement: "optional" },
  ],
};

// ────────────────────────────────────────────────────────────
// 전자제품 제조업 (C26)
// ────────────────────────────────────────────────────────────

const ELECTRONICS_MANUFACTURING: IndustryProfile = {
  code: "C26",
  nameKo: "전자부품·컴퓨터·통신장비 제조업",
  nameEn: "Electronics Manufacturing",
  category: "electronics",
  description: "반도체, PCB, 전자부품, 컴퓨터, 통신장비 등 제조",
  icon: "cpu",
  modules: {
    erp: true,
    production: true,
    inventory: true,
    quality: true,
    purchasing: true,
    sales: true,
    hr: true,
    haccp: false,
    gmp: false,
    iso: true,         // ★ ISO 핵심
    traceability: true,
  },
  features: {
    // 품질
    incoming_inspection: true,
    process_inspection: true,
    final_inspection: true,
    nonconforming_mgmt: true,
    calibration: true,
    // 생산
    bom_management: true,
    batch_production: false,
    continuous_production: true,  // 연속생산 라인
    work_order: true,
    equipment_mgmt: true,
    // 재고
    lot_tracking: true,
    serial_tracking: true,       // 시리얼 추적
    // ERP
    double_entry: true,
    tax_invoice: true,
    cost_analysis: true,
    budget_mgmt: true,
  },
  labels: {
    batch: "LOT",
    product: "제품",
    material: "부품",
    process: "생산라인",
    site: "공장",
  },
  certifications: [
    { code: "ISO9001", nameKo: "품질경영시스템", requirement: "recommended" },
    { code: "ISO14001", nameKo: "환경경영시스템", requirement: "optional" },
    { code: "IATF16949", nameKo: "자동차 품질경영시스템", requirement: "optional" },
  ],
};

// ────────────────────────────────────────────────────────────
// 섬유/의류 제조업 (C13-C14)
// ────────────────────────────────────────────────────────────

const TEXTILE_MANUFACTURING: IndustryProfile = {
  code: "C13",
  nameKo: "섬유·의복 제조업",
  nameEn: "Textile & Apparel Manufacturing",
  category: "textile",
  description: "섬유, 의류, 봉제, 직물 등 제조",
  icon: "scissors",
  modules: {
    erp: true,
    production: true,
    inventory: true,
    quality: true,
    purchasing: true,
    sales: true,
    hr: true,
    haccp: false,
    gmp: false,
    iso: false,
    traceability: true,
  },
  features: {
    // 품질
    incoming_inspection: true,
    process_inspection: true,
    final_inspection: true,
    nonconforming_mgmt: true,
    // 생산
    bom_management: true,
    batch_production: true,
    work_order: true,
    equipment_mgmt: true,
    // 재고
    lot_tracking: true,
    // ERP
    double_entry: true,
    tax_invoice: true,
    cost_analysis: true,
  },
  labels: {
    batch: "LOT",
    product: "제품",
    material: "원단/부자재",
    process: "공정",
    site: "공장",
  },
  certifications: [
    { code: "ISO9001", nameKo: "품질경영시스템", requirement: "optional" },
    { code: "OEKO-TEX", nameKo: "유해물질 안전 인증", requirement: "optional" },
  ],
};

// ────────────────────────────────────────────────────────────
// 일반 제조업 (기본, 코드 미지정 시)
// ────────────────────────────────────────────────────────────

const GENERAL_MANUFACTURING: IndustryProfile = {
  code: "C_GENERAL",
  nameKo: "일반 제조업",
  nameEn: "General Manufacturing",
  category: "general",
  description: "금속, 기계, 플라스틱, 고무, 목재, 종이 등 일반 제조",
  icon: "factory",
  modules: {
    erp: true,
    production: true,
    inventory: true,
    quality: true,
    purchasing: true,
    sales: true,
    hr: true,
    haccp: false,
    gmp: false,
    iso: false,
    traceability: true,
  },
  features: {
    // 품질
    incoming_inspection: true,
    process_inspection: true,
    final_inspection: true,
    nonconforming_mgmt: true,
    calibration: true,
    // 생산
    bom_management: true,
    batch_production: true,
    work_order: true,
    equipment_mgmt: true,
    // 재고
    lot_tracking: true,
    // ERP
    double_entry: true,
    tax_invoice: true,
    cost_analysis: true,
  },
  labels: {
    batch: "LOT",
    product: "제품",
    material: "원재료",
    process: "공정",
    site: "공장",
  },
  certifications: [
    { code: "ISO9001", nameKo: "품질경영시스템", requirement: "optional" },
    { code: "ISO14001", nameKo: "환경경영시스템", requirement: "optional" },
  ],
};

// ────────────────────────────────────────────────────────────
// 의료기기 제조업 (C27)
// ────────────────────────────────────────────────────────────

const MEDICAL_DEVICE_MANUFACTURING: IndustryProfile = {
  code: "C27",
  nameKo: "의료기기 제조업",
  nameEn: "Medical Device Manufacturing",
  category: "general", // industryConfig 의 IndustryCategory ENUM 에 medical_device 미정의 — fallback
  description: "1~4등급 의료기기 — DHF/DMR/DHR + ISO 13485 + ISO 14971 위험관리",
  icon: "activity",
  modules: {
    erp: true,
    production: true,
    inventory: true,
    quality: true,
    purchasing: true,
    sales: true,
    hr: true,
    haccp: false,
    gmp: true,         // ★ KGMP 의료기기
    iso: true,         // ★ ISO 13485 핵심
    traceability: true,
  },
  features: {
    // GMP 핵심 (의료기기 KGMP)
    gmp_deviation: true,
    gmp_capa: true,
    gmp_validation: true,
    gmp_change_control: true,
    // 품질
    incoming_inspection: true,
    process_inspection: true,
    final_inspection: true,
    nonconforming_mgmt: true,
    calibration: true,
    // 생산
    bom_management: true,
    batch_production: true,
    work_order: true,
    equipment_mgmt: true,
    // 재고
    lot_tracking: true,
    serial_tracking: true,  // 의료기기 UDI 추적
    expiry_mgmt: true,
    // ERP
    double_entry: true,
    tax_invoice: true,
    cost_analysis: true,
  },
  labels: {
    batch: "Lot",
    product: "의료기기",
    material: "구성품",
    process: "제조공정",
    site: "제조시설",
  },
  certifications: [
    { code: "ISO13485", nameKo: "ISO 13485 의료기기 품질경영시스템", requirement: "mandatory" },
    { code: "ISO14971", nameKo: "ISO 14971 의료기기 위험관리", requirement: "mandatory" },
    { code: "KGMP_MD", nameKo: "의료기기 KGMP", requirement: "mandatory" },
    { code: "MDSAP", nameKo: "MDSAP (Medical Device Single Audit Program)", requirement: "recommended" },
  ],
};

// ============================================
// 4. 업종코드 레지스트리
// ============================================

export const INDUSTRY_PROFILES: Record<string, IndustryProfile> = {
  // 식품
  C10: FOOD_MANUFACTURING,
  C1011: { ...FOOD_MANUFACTURING, code: "C1011", nameKo: "도축업", description: "가축 도축 및 육류 가공" },
  C1012: { ...FOOD_MANUFACTURING, code: "C1012", nameKo: "육류 가공·저장업", description: "육류 절단, 가공, 저장" },
  C1020: { ...FOOD_MANUFACTURING, code: "C1020", nameKo: "수산물 가공·저장업", description: "수산물 냉동, 건조, 염장 가공" },
  C1030: { ...FOOD_MANUFACTURING, code: "C1030", nameKo: "과실·채소 가공·저장업", description: "과실, 채소 절임, 건조, 가공" },
  C1040: { ...FOOD_MANUFACTURING, code: "C1040", nameKo: "유제품 제조업", description: "우유, 치즈, 요거트, 아이스크림 등" },
  C1050: { ...FOOD_MANUFACTURING, code: "C1050", nameKo: "곡물 가공·전분 제조업", description: "쌀, 밀가루, 전분, 면류 등" },
  C1061: { ...FOOD_MANUFACTURING, code: "C1061", nameKo: "떡·빵·과자류 제조업", description: "떡, 빵, 과자, 케이크 등" },
  C1071: { ...FOOD_MANUFACTURING, code: "C1071", nameKo: "조미료·소스 제조업", description: "간장, 된장, 고추장, 소스류" },
  C1079: { ...FOOD_MANUFACTURING, code: "C1079", nameKo: "기타 식품 제조업", description: "두부, 김치, 건강식 등" },
  C1080: { ...FOOD_MANUFACTURING, code: "C1080", nameKo: "동물용 사료 제조업", description: "배합사료, 단미사료 등" },
  C11: { ...FOOD_MANUFACTURING, code: "C11", nameKo: "음료 제조업", description: "비알코올음료, 생수, 주스 등" },

  // 건강기능식품
  C10_SUP: SUPPLEMENT_MANUFACTURING,

  // 화장품
  C20: COSMETICS_MANUFACTURING,
  C2041: { ...COSMETICS_MANUFACTURING, code: "C2041", nameKo: "화장품 제조업", description: "기초, 색조, 바디케어 화장품" },
  C2042: { ...COSMETICS_MANUFACTURING, code: "C2042", nameKo: "치약·비누·세정제 제조업", description: "치약, 비누, 샴푸, 세제 등" },

  // 의약품
  C21: PHARMA_MANUFACTURING,
  C2110: { ...PHARMA_MANUFACTURING, code: "C2110", nameKo: "의약품 제조업", description: "완제의약품, 원료의약품 제조" },
  C2120: { ...PHARMA_MANUFACTURING, code: "C2120", nameKo: "의약외품 제조업", description: "소독제, 위생용품 등" },

  // 전자
  C26: ELECTRONICS_MANUFACTURING,

  // 의료기기 (ISO 13485 / KGMP MD / ISO 14971)
  C27: MEDICAL_DEVICE_MANUFACTURING,

  // 섬유/의류
  C13: TEXTILE_MANUFACTURING,
  C14: { ...TEXTILE_MANUFACTURING, code: "C14", nameKo: "의복 제조업", nameEn: "Apparel Manufacturing" },

  // 일반 제조 (기본)
  C_GENERAL: GENERAL_MANUFACTURING,
};

/** 업종 카테고리별 대표 코드 */
export const CATEGORY_DEFAULTS: Record<IndustryCategory, string> = {
  food: "C10",
  cosmetics: "C20",
  supplement: "C10_SUP",
  pharma: "C21",
  electronics: "C26",
  textile: "C13",
  chemical: "C_GENERAL",
  general: "C_GENERAL",
};

// ============================================
// 5. 런타임 리졸버 함수
// ============================================

/**
 * 업종코드로 IndustryProfile 조회
 * 
 * - 정확한 코드 매칭 → 해당 프로필
 * - 상위 코드 폴백 (C1011 → C10)
 * - 없으면 → GENERAL_MANUFACTURING
 */
export function resolveIndustryProfile(code: string | null | undefined): IndustryProfile {
  if (!code) return GENERAL_MANUFACTURING;

  // 1) 정확한 매칭
  if (INDUSTRY_PROFILES[code]) return INDUSTRY_PROFILES[code];

  // 2) 상위코드 폴백 (C1011 → C10, C2041 → C20)
  const parentCode = code.length > 3 ? code.substring(0, 3) : null;
  if (parentCode && INDUSTRY_PROFILES[parentCode]) return INDUSTRY_PROFILES[parentCode];

  // 3) 2자리 폴백 (C1 → C_GENERAL)
  const topCode = code.substring(0, 2);
  if (INDUSTRY_PROFILES[topCode]) return INDUSTRY_PROFILES[topCode];

  // 4) 기본값
  return GENERAL_MANUFACTURING;
}

/**
 * 업종코드로 활성 모듈 목록 반환
 */
export function getActiveModules(code: string | null | undefined): ModuleKey[] {
  const profile = resolveIndustryProfile(code);
  return (Object.entries(profile.modules) as [ModuleKey, boolean][])
    .filter(([, v]) => v)
    .map(([k]) => k);
}

/**
 * 업종코드로 활성 기능 목록 반환
 */
export function getActiveFeatures(code: string | null | undefined): FeatureKey[] {
  const profile = resolveIndustryProfile(code);
  return (Object.entries(profile.features) as [FeatureKey, boolean][])
    .filter(([, v]) => v)
    .map(([k]) => k);
}

/**
 * 특정 모듈이 업종에서 활성인지 확인
 */
export function isModuleEnabled(code: string | null | undefined, module: ModuleKey): boolean {
  return resolveIndustryProfile(code).modules[module] ?? false;
}

/**
 * 특정 기능이 업종에서 활성인지 확인
 */
export function isFeatureEnabled(code: string | null | undefined, feature: FeatureKey): boolean {
  return resolveIndustryProfile(code).features[feature] ?? false;
}

/**
 * 업종 UI 라벨 조회
 */
export function getIndustryLabel(
  code: string | null | undefined,
  key: keyof LabelOverrides,
  fallback?: string,
): string {
  const profile = resolveIndustryProfile(code);
  return profile.labels[key] ?? fallback ?? key;
}

/**
 * 카테고리 목록 (회원가입 시 업종 선택 UI)
 */
export function getIndustryCategories(): Array<{
  category: IndustryCategory;
  code: string;
  nameKo: string;
  nameEn: string;
  icon: string;
}> {
  return [
    { category: "food", code: "C10", nameKo: "식품 제조업", nameEn: "Food Manufacturing", icon: "chef-hat" },
    { category: "supplement", code: "C10_SUP", nameKo: "건강기능식품 제조업", nameEn: "Health Supplement", icon: "pill" },
    { category: "cosmetics", code: "C20", nameKo: "화장품 제조업", nameEn: "Cosmetics Manufacturing", icon: "sparkles" },
    { category: "pharma", code: "C21", nameKo: "의약품 제조업", nameEn: "Pharmaceutical", icon: "syringe" },
    { category: "electronics", code: "C26", nameKo: "전자부품·장비 제조업", nameEn: "Electronics", icon: "cpu" },
    { category: "general", code: "C27", nameKo: "의료기기 제조업", nameEn: "Medical Device Manufacturing", icon: "activity" },
    { category: "textile", code: "C13", nameKo: "섬유·의복 제조업", nameEn: "Textile & Apparel", icon: "scissors" },
    { category: "general", code: "C_GENERAL", nameKo: "일반 제조업", nameEn: "General Manufacturing", icon: "factory" },
  ];
}

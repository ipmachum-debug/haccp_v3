/**
 * Food (식품 HACCP) Industry Plugin
 *
 * 표준: 식품안전관리법 / Codex Alimentarius HACCP / KFDA F-3
 * 핵심: CCP 모니터링, 위해 분석 (HA), HACCP 7원칙
 */

import type { IndustryPlugin } from "@shared/domain/IndustryPlugin";

export const foodPlugin: IndustryPlugin = {
  key: "food",
  labelKo: "식품 HACCP",
  labelEn: "Food HACCP",
  category: "food",
  industryCodes: ["C10"],
  description: "식품·식자재·식품첨가물 제조 — Codex HACCP 7원칙 + 식약처 F-3",
  icon: "ChefHat",

  labels: {
    batch: "배치",
    product: "제품",
    material: "원재료",
    process: "제조공정",
    site: "공장",
  },

  modules: {
    erp: true,
    production: true,
    inventory: true,
    quality: true,
    purchasing: true,
    sales: true,
    hr: true,
    haccp: true,
    gmp: false,
    iso: false,
    traceability: true,
  },

  features: {
    ccp_monitoring: true,
    haccp_7principles: true,
    hygiene_checklist: true,
    allergen_mgmt: true,
    food_defense: true,
    recall_mgmt: true,
    incoming_inspection: true,
    process_inspection: true,
    final_inspection: true,
    nonconforming_mgmt: true,
    calibration: true,
    bom_management: true,
    batch_production: true,
    work_order: true,
    equipment_mgmt: true,
    lot_tracking: true,
    fefo_allocation: true,
    expiry_mgmt: true,
    double_entry: true,
    tax_invoice: true,
    cost_analysis: true,
  },

  menu: {
    groups: [
      {
        name: "생산",
        order: 20,
        items: [
          { icon: "Package", label: "생산관리", path: "/dashboard/production-management", roles: ["super_admin", "admin", "worker"] },
          { icon: "Calendar", label: "생산운영", path: "/dashboard/production-operations", roles: ["super_admin", "admin", "worker"] },
          { icon: "FileCode", label: "제조기준관리", path: "/dashboard/manufacturing-standards", roles: ["super_admin", "admin", "worker"] },
        ],
      },
      {
        name: "품질·검사",
        order: 30,
        items: [
          { icon: "Shield", label: "CCP 관리", path: "/quality/ccp-monitoring", roles: ["super_admin", "admin", "worker", "inspector", "monitor"] },
          { icon: "ClipboardCheck", label: "검사 관리", path: "/dashboard/inspections", roles: ["super_admin", "admin", "accountant", "worker", "inspector", "monitor"] },
          { icon: "ListChecks", label: "HACCP 체크리스트", path: "/quality/checklists", roles: ["super_admin", "admin", "worker", "inspector", "monitor"] },
        ],
      },
      {
        name: "품질관리 (HACCP)",
        order: 60,
        items: [
          { icon: "FileWarning", label: "부적합제품관리", path: "/dashboard/nonconforming-management", roles: ["super_admin", "admin", "inspector", "monitor"] },
          { icon: "AlertTriangle", label: "시정조치 관리", path: "/corrective-actions", roles: ["super_admin", "admin", "inspector", "monitor", "worker"] },
          { icon: "Activity", label: "F-3 운영 현황", path: "/dashboard/haccp/f3-dashboard", roles: ["super_admin", "admin", "inspector", "monitor"] },
          { icon: "TrendingUp", label: "Deviation 트렌드", path: "/dashboard/haccp/f3-trends", roles: ["super_admin", "admin", "inspector", "monitor"] },
          { icon: "GitBranch", label: "변경관리", path: "/dashboard/food/change-control", roles: ["super_admin", "admin", "inspector", "monitor"] },
          { icon: "AlertCircle", label: "부적합 관리 (통합)", path: "/dashboard/food/nonconforming", roles: ["super_admin", "admin", "inspector", "monitor"] },
          { icon: "AlertTriangle", label: "CAPA (시정·예방)", path: "/dashboard/food/corrective-action", roles: ["super_admin", "admin", "inspector", "monitor"] },
          { icon: "ClipboardCheck", label: "감사 (Audit)", path: "/dashboard/food/audit", roles: ["super_admin", "admin", "inspector", "monitor"] },
          { icon: "GraduationCap", label: "교육 / 훈련", path: "/dashboard/food/training", roles: ["super_admin", "admin", "inspector", "monitor"] },
          { icon: "Sliders", label: "검교정 / 설비 자격", path: "/dashboard/food/calibration", roles: ["super_admin", "admin", "inspector", "monitor"] },
          { icon: "Building", label: "공급업체 (AVL)", path: "/dashboard/food/supplier", roles: ["super_admin", "admin", "inspector", "monitor"] },
          { icon: "AlertTriangle", label: "위험 평가 (HA)", path: "/dashboard/food/risk-assessment", roles: ["super_admin", "admin", "inspector", "monitor"] },
        ],
      },
      {
        name: "감사·검증",
        order: 80,
        items: [
          { icon: "Building2", label: "감사관리", path: "/dashboard/audit-management", roles: ["super_admin", "admin", "inspector", "monitor"] },
          { icon: "ClipboardCheck", label: "HACCP 검증", path: "/dashboard/haccp-verification", roles: ["super_admin", "admin", "inspector", "monitor"] },
          { icon: "Shield", label: "감사 리포트", path: "/dashboard/audit-report", roles: ["super_admin", "admin"] },
        ],
      },
    ],
  },

  notifications: {
    types: [
      { code: "haccp_ccp_check_due", label: "CCP 점검 예정", priority: "medium", category: "CCP" },
      { code: "haccp_ccp_overdue", label: "CCP 점검 누락", priority: "high", category: "CCP" },
      { code: "haccp_ccp_deviation", label: "CCP 한계기준 이탈", priority: "critical", category: "CCP" },
      { code: "haccp_hygiene_check_due", label: "위생 점검 예정", priority: "medium", category: "위생" },
      { code: "haccp_inspection_overdue", label: "검사 누락", priority: "high", category: "검사" },
      { code: "haccp_expiry_7days", label: "유통기한 7일 전", priority: "medium", category: "재고" },
      { code: "haccp_expiry_3days", label: "유통기한 3일 전", priority: "high", category: "재고" },
      { code: "haccp_expiry_overdue", label: "유통기한 초과", priority: "critical", category: "재고" },
      { code: "haccp_stock_low", label: "재고 부족", priority: "medium", category: "재고" },
      { code: "haccp_recall_initiated", label: "회수 발의", priority: "critical", category: "회수" },
    ],
    rules: [
      {
        code: "ccp_check_overdue_2hours",
        description: "CCP 점검 예정 시각 후 2시간 미수행 시 알림",
        trigger: "h_ccp_records.scheduled_at + 2hours < NOW() AND h_ccp_records.actual_at IS NULL",
        notificationType: "haccp_ccp_overdue",
        cooldownMinutes: 60,
      },
      {
        code: "expiry_7days_before",
        description: "재고 유통기한 7일 전",
        trigger: "h_inventory_lots.expiry_date - 7 days = TODAY",
        notificationType: "haccp_expiry_7days",
      },
    ],
  },

  approvals: {
    workflows: [
      {
        code: "haccp_3step",
        label: "HACCP 3단계 결재 (작성 → 검토 → 승인)",
        steps: ["draft", "review", "approve", "released"],
        stepRoles: {
          draft: ["worker", "inspector", "admin"],
          review: ["inspector", "monitor", "admin"],
          approve: ["admin", "super_admin"],
          released: [],
          rejected: [],
        },
      },
    ],
    entityTypes: [
      { code: "food_product_report", label: "품목제조보고", workflow: "haccp_3step", category: "제조보고", entityTable: "h_product_manufacturing_reports" },
      { code: "food_haccp_plan", label: "HACCP Plan 승인", workflow: "haccp_3step", category: "HACCP" },
      { code: "food_recall_request", label: "회수 요청 승인", workflow: "haccp_3step", category: "회수" },
      { code: "food_release_inspection", label: "출하 검사 승인", workflow: "haccp_3step", category: "출하" },
    ],
  },

  documents: {
    formTypes: [
      // 일일 점검
      { code: "hygiene_checklist", name: "일반위생관리 점검일지", category: "일일 점검" },
      { code: "foreign_material_record", name: "이물관리 점검일지", category: "일일 점검" },
      { code: "temperature_humidity_check", name: "원재료실 온습도 관리일지", category: "일일 점검" },
      { code: "refrigeration_check", name: "냉동·냉장고 온도관리일지", category: "일일 점검" },
      // 검사 성적서
      { code: "airborne_bacteria_test", name: "공중낙하세균 검사 성적서", category: "검사 성적서" },
      { code: "surface_contamination_test", name: "표면오염도 검사 성적서", category: "검사 성적서" },
      { code: "product_test_log", name: "대장균군 검사 성적서", category: "검사 성적서" },
      { code: "product_test_report", name: "제품 검사 성적서", category: "검사 성적서" },
      // 위생 관리
      { code: "personal_hygiene_check", name: "개인 위생관리 점검표", category: "위생 관리" },
      { code: "hygiene_facility_check", name: "위생시설 점검일지", category: "위생 관리" },
      { code: "workplace_hygiene_check", name: "작업장 위생관리 점검표", category: "위생 관리" },
      { code: "sanitation_record", name: "손세척 소독 점검일지", category: "위생 관리" },
      { code: "employee_health_check", name: "종사자 건강상태 확인 일지", category: "위생 관리" },
      { code: "hygiene_inspection", name: "방문자 위생관리 점검표", category: "위생 관리" },
      // 설비 관리
      { code: "air_compressor_maintenance", name: "공조장치 관리일지", category: "설비 관리" },
      { code: "air_compressor_filter", name: "공조장치 필터 관리대장", category: "설비 관리" },
      { code: "equipment_inspection", name: "설비 점검 관리대장", category: "설비 관리" },
      { code: "equipment_history", name: "설비 이력 관리대장", category: "설비 관리" },
      { code: "equipment_cleaning_record", name: "세척소독 관리대장", category: "설비 관리" },
      { code: "illumination_check", name: "조도 점검 관리대장", category: "설비 관리" },
      // 용수/방충
      { code: "water_quality_test", name: "수질 검사 성적서", category: "용수/방충 관리" },
      { code: "water_management_check", name: "용수관리 점검일지", category: "용수/방충 관리" },
      { code: "water_usage_check", name: "용수 사용량 점검일지", category: "용수/방충 관리" },
      { code: "pest_control_checklist", name: "방충방서 관리일지", category: "용수/방충 관리" },
      // 원재료/제품
      { code: "material_inspection", name: "원재료 검수 관리대장", category: "원재료/제품 관리" },
      { code: "packaging_storage_record", name: "포장재 보관 관리대장", category: "원재료/제품 관리" },
      { code: "finished_product_check", name: "완제품 검사 관리대장", category: "원재료/제품 관리" },
      { code: "shipping_inspection", name: "출하 검사 관리대장", category: "원재료/제품 관리" },
      { code: "self_quality_inspection", name: "자주품질 검사 관리대장", category: "원재료/제품 관리" },
      { code: "weight_quality_check", name: "중량 품질 검사 관리대장", category: "원재료/제품 관리" },
      { code: "supplier_inspection", name: "공급업체 점검 관리대장", category: "원재료/제품 관리" },
      // 교육 (legacy)
      { code: "training_log", name: "교육훈련 관리대장", category: "교육/훈련" },
      // 기타
      { code: "waste_management", name: "폐기물 관리대장", category: "기타 관리" },
      { code: "daily_disposal_record", name: "일일 폐기 관리대장", category: "기타 관리" },
      { code: "food_recall_notice", name: "회수 관리대장", category: "기타 관리" },
      { code: "consumer_complaint", name: "소비자 불만 관리대장", category: "기타 관리" },
      { code: "capa_record", name: "개선/시정 조치 관리대장", category: "기타 관리" },
      { code: "quality_issue_record", name: "품질 이슈 관리대장", category: "기타 관리" },
      { code: "handover_document", name: "인수인계 문서", category: "기타 관리" },
      { code: "vehicle_temperature_check", name: "차량 온도 점검일지", category: "기타 관리" },
      { code: "validity_evaluation", name: "유효성 평가 기록부", category: "기타" },
      // 기간별 일지
      { code: "daily_log", name: "일일일지", category: "기간별 일지" },
      { code: "weekly_log", name: "주간일지", category: "기간별 일지" },
      { code: "monthly_log", name: "월간일지", category: "기간별 일지" },
      { code: "yearly_log", name: "연간일지", category: "기간별 일지" },
      { code: "production_daily", name: "생산일지", category: "생산관리" },
      // CCP 기록지
      { code: "batch_production", name: "[CCP] 배치 CCP 승인 (자동)", category: "CCP 기록지" },
      { code: "ccp_form", name: "[CCP] CCP 모니터링 기록지", category: "CCP 기록지" },
      { code: "ccp_2b_baking", name: "[CCP-2B] 가열(굽기)공정 기록지", category: "CCP 기록지" },
      { code: "ccp_1b_steam", name: "[CCP-1B] 가열(증숙)공정 기록지", category: "CCP 기록지" },
      { code: "ccp_4p_metal", name: "[CCP-4P] 금속검출공정 기록지", category: "CCP 기록지" },
    ],
    pdfTemplates: [
      {
        code: "food_law_section31_report",
        name: "품목제조보고서",
        regulation: "식품안전관리법 §31",
        template: "templates/food/product_manufacturing_report.pdf",
      },
      {
        code: "haccp_plan_certificate",
        name: "HACCP Plan 인증서",
        regulation: "식품의약품안전처 HACCP 인증",
        template: "templates/food/haccp_plan_cert.pdf",
      },
    ],
  },

  dashboardWidgets: [
    { code: "food_ccp_status", label: "CCP 점검 현황", size: "medium", order: 10, dataSource: "haccp.dashboard.ccpStatus", chartType: "card" },
    { code: "food_inspection_due", label: "검사 예정 / 누락", size: "medium", order: 20, dataSource: "haccp.dashboard.inspectionDue", chartType: "table" },
    { code: "food_expiry_alert", label: "유통기한 임박", size: "medium", order: 30, dataSource: "inventory.expiryAlerts", chartType: "table" },
    { code: "food_deviation_trend", label: "Deviation 트렌드", size: "large", order: 40, dataSource: "haccp.f3.deviationTrend", chartType: "line" },
  ],

  masterCategories: {
    materials: [
      { code: "raw_grain", label: "곡류", order: 10 },
      { code: "raw_meat", label: "축산물", order: 20 },
      { code: "raw_seafood", label: "수산물", order: 30 },
      { code: "raw_vegetable", label: "농산물", order: 40 },
      { code: "additive", label: "식품첨가물", order: 50 },
      { code: "packaging_food", label: "식품포장재", order: 60 },
    ],
    products: [
      { code: "processed_food", label: "가공식품", order: 10 },
      { code: "frozen_food", label: "냉동식품", order: 20 },
      { code: "beverage", label: "음료", order: 30 },
      { code: "snack", label: "과자류", order: 40 },
    ],
  },

  certifications: [
    { code: "HACCP", nameKo: "식품안전관리인증기준 (HACCP)", requirement: "mandatory", authority: "식약처" },
    { code: "ISO22000", nameKo: "ISO 22000 식품안전경영시스템", requirement: "recommended" },
    { code: "FSSC22000", nameKo: "FSSC 22000", requirement: "optional" },
  ],

  ySeriesEnabled: {
    changeControl: true,
    nonconforming: true,
    capa: true,
    audit: true,
    training: true,
    calibration: true,
    qualitySupplier: true,
    riskAssessment: true,
  },
};

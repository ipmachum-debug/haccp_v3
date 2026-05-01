/**
 * Health Functional Food (건강기능식품) Industry Plugin
 *
 * 표준: 건강기능식품에 관한 법률 / 식약처 GMP / KFDA
 * 핵심: 기능성 원료, 표준화 시험, 안전성/유효성, 표시광고 사전심의
 */

import type { IndustryPlugin } from "@shared/domain/IndustryPlugin";

export const healthFunctionalPlugin: IndustryPlugin = {
  key: "health-functional",
  labelKo: "건강기능식품",
  labelEn: "Health Functional Food",
  category: "supplement",
  industryCodes: ["C10_SUP"],
  description: "건강기능식품 제조 — 식약처 GMP / 기능성 원료 표준화",
  icon: "Pill",

  labels: {
    batch: "배치",
    product: "건강기능식품",
    material: "기능성 원료",
    process: "제조공정",
    site: "제조소",
  },

  modules: {
    erp: true,
    production: true,
    inventory: true,
    quality: true,
    purchasing: true,
    sales: true,
    hr: true,
    haccp: true, // 일부 적용
    gmp: true,
    iso: true,
    traceability: true,
  },

  features: {
    haccp_7principles: true,
    hygiene_checklist: true,
    gmp_deviation: true,
    gmp_capa: true,
    stability_test: true,
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
        name: "건강기능식품",
        order: 70,
        items: [
          { icon: "GitBranch", label: "변경관리", path: "/dashboard/health-functional/change-control", roles: ["super_admin", "admin", "inspector", "monitor"] },
          { icon: "AlertCircle", label: "부적합 관리", path: "/dashboard/health-functional/nonconforming", roles: ["super_admin", "admin", "inspector", "monitor"] },
          { icon: "AlertTriangle", label: "CAPA (시정·예방)", path: "/dashboard/health-functional/corrective-action", roles: ["super_admin", "admin", "inspector", "monitor"] },
          { icon: "ClipboardCheck", label: "감사 (Audit)", path: "/dashboard/health-functional/audit", roles: ["super_admin", "admin", "inspector", "monitor"] },
          { icon: "GraduationCap", label: "교육 / 훈련", path: "/dashboard/health-functional/training", roles: ["super_admin", "admin", "inspector", "monitor"] },
          { icon: "Sliders", label: "검교정 / 설비 자격", path: "/dashboard/health-functional/calibration", roles: ["super_admin", "admin", "inspector", "monitor"] },
          { icon: "Building", label: "공급업체 (AVL)", path: "/dashboard/health-functional/supplier", roles: ["super_admin", "admin", "inspector", "monitor"] },
          { icon: "AlertTriangle", label: "위험 평가", path: "/dashboard/health-functional/risk-assessment", roles: ["super_admin", "admin", "inspector", "monitor"] },
        ],
      },
    ],
  },

  notifications: {
    types: [
      { code: "hf_functional_test_pending", label: "기능성 시험 대기", priority: "high", category: "기능성" },
      { code: "hf_label_review_pending", label: "표시광고 사전심의 대기", priority: "high", category: "표시광고" },
      { code: "hf_release_pending", label: "출하 승인 대기", priority: "high", category: "Release" },
      { code: "hf_stability_due", label: "안정성시험 만료 임박", priority: "medium", category: "Stability" },
      { code: "hf_calibration_due", label: "검교정 만료 임박", priority: "high", category: "검교정" },
    ],
    rules: [],
  },

  approvals: {
    workflows: [
      {
        code: "hf_qa_qm",
        label: "건기식 2단계 (QA → QM)",
        steps: ["draft", "review", "approve", "released"],
        stepRoles: {
          draft: ["worker", "admin"],
          review: ["inspector", "admin"],
          approve: ["admin", "super_admin"],
          released: [],
          rejected: [],
        },
      },
    ],
    entityTypes: [
      { code: "hf_functional_test", label: "기능성 시험 결과 승인", workflow: "hf_qa_qm", category: "기능성" },
      { code: "hf_label_advertise", label: "표시광고 사전심의", workflow: "hf_qa_qm", category: "표시광고" },
      { code: "hf_release", label: "출하 승인", workflow: "hf_qa_qm", category: "Release" },
      { code: "hf_change_control", label: "변경관리 승인", workflow: "hf_qa_qm", category: "Change Control" },
    ],
  },

  documents: {
    formTypes: [
      { code: "hf_master_formula", name: "Master Formula Record", category: "건강기능식품" },
      { code: "hf_batch_record", name: "Batch Manufacturing Record", category: "건강기능식품" },
      { code: "hf_functional_test", name: "기능성 시험 성적서", category: "기능성" },
      { code: "hf_safety_test", name: "안전성 시험 성적서", category: "안전성" },
      { code: "hf_label_review", name: "표시광고 심의 신청서", category: "표시광고" },
      { code: "hf_change_control", name: "변경관리", category: "품질관리 (Y-시리즈)" },
      { code: "hf_nonconforming", name: "부적합 관리 (통합)", category: "품질관리 (Y-시리즈)" },
      { code: "hf_capa", name: "CAPA", category: "품질관리 (Y-시리즈)" },
      { code: "hf_audit", name: "감사", category: "품질관리 (Y-시리즈)" },
      { code: "hf_calibration", name: "검교정", category: "품질관리 (Y-시리즈)" },
      { code: "hf_quality_supplier", name: "공급업체 (AVL)", category: "품질관리 (Y-시리즈)" },
      { code: "hf_risk_assessment", name: "위험 평가", category: "품질관리 (Y-시리즈)" },
      { code: "hf_training", name: "교육 기록", category: "품질관리 (Y-시리즈)" },
    ],
    pdfTemplates: [
      { code: "hf_label_advertise_form", name: "표시광고 사전심의 신청서", regulation: "건강기능식품법 §16", template: "templates/health-functional/label_advertise.pdf" },
    ],
  },

  dashboardWidgets: [
    { code: "hf_release_queue", label: "출하 대기", size: "medium", order: 10, dataSource: "industry.healthFunctional.dashboard.releaseQueue", chartType: "card" },
    { code: "hf_functional_tests", label: "기능성 시험 진행", size: "large", order: 20, dataSource: "industry.healthFunctional.dashboard.functionalTests", chartType: "table" },
  ],

  masterCategories: {
    materials: [
      { code: "functional_ingredient", label: "기능성 원료", order: 10 },
      { code: "vitamin", label: "비타민", order: 20 },
      { code: "mineral", label: "미네랄", order: 30 },
      { code: "probiotic", label: "유산균", order: 40 },
      { code: "extract", label: "추출물", order: 50 },
      { code: "packaging_supplement", label: "건기식 포장재", order: 60 },
    ],
    products: [
      { code: "vitamin_supplement", label: "비타민/무기질 보충제", order: 10 },
      { code: "probiotic_supplement", label: "프로바이오틱스", order: 20 },
      { code: "extract_supplement", label: "추출물 제품", order: 30 },
      { code: "functional_drink", label: "기능성 음료", order: 40 },
    ],
  },

  certifications: [
    { code: "HF_GMP", nameKo: "건강기능식품 GMP", requirement: "mandatory", authority: "식약처" },
    { code: "HACCP_HF", nameKo: "건강기능식품 HACCP (해당 시)", requirement: "optional" },
    { code: "ISO22000", nameKo: "ISO 22000", requirement: "optional" },
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

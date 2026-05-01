/**
 * General Manufacturing (일반 제조 ISO 9001) Industry Plugin
 *
 * 표준: ISO 9001 / 일반 제조업
 * 핵심: 품질경영시스템 / 공정관리 / 검사 / 추적
 */

import type { IndustryPlugin } from "@shared/domain/IndustryPlugin";

export const generalManufacturingPlugin: IndustryPlugin = {
  key: "general-manufacturing",
  labelKo: "일반 제조 ISO 9001",
  labelEn: "General Manufacturing ISO 9001",
  category: "general",
  industryCodes: ["C_GENERAL"],
  description: "일반 제조 — ISO 9001 / 금속·기계·플라스틱·고무·목재·종이",
  icon: "Factory",

  labels: {
    batch: "Lot",
    product: "제품",
    material: "원자재",
    process: "공정",
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
    haccp: false,
    gmp: false,
    iso: false,
    traceability: true,
  },

  features: {
    incoming_inspection: true,
    process_inspection: true,
    final_inspection: true,
    nonconforming_mgmt: true,
    calibration: true,
    bom_management: true,
    work_order: true,
    equipment_mgmt: true,
    lot_tracking: true,
    double_entry: true,
    tax_invoice: true,
    cost_analysis: true,
  },

  menu: {
    groups: [
      {
        name: "일반 제조 ISO 9001",
        order: 70,
        items: [
          { icon: "GitBranch", label: "변경관리 (일반제조)", path: "/dashboard/general-manufacturing/change-control", roles: ["super_admin", "admin", "inspector", "monitor"] },
          { icon: "AlertCircle", label: "부적합 관리 (일반제조)", path: "/dashboard/general-manufacturing/nonconforming", roles: ["super_admin", "admin", "inspector", "monitor"] },
          { icon: "AlertTriangle", label: "CAPA (일반제조)", path: "/dashboard/general-manufacturing/corrective-action", roles: ["super_admin", "admin", "inspector", "monitor"] },
          { icon: "ClipboardCheck", label: "감사 (일반제조)", path: "/dashboard/general-manufacturing/audit", roles: ["super_admin", "admin", "inspector", "monitor"] },
          { icon: "GraduationCap", label: "교육 (일반제조)", path: "/dashboard/general-manufacturing/training", roles: ["super_admin", "admin", "inspector", "monitor"] },
          { icon: "Sliders", label: "검교정 (일반제조)", path: "/dashboard/general-manufacturing/calibration", roles: ["super_admin", "admin", "inspector", "monitor"] },
          { icon: "Building", label: "공급업체 (일반제조)", path: "/dashboard/general-manufacturing/supplier", roles: ["super_admin", "admin", "inspector", "monitor"] },
          { icon: "AlertTriangle", label: "위험 평가 (일반제조)", path: "/dashboard/general-manufacturing/risk-assessment", roles: ["super_admin", "admin", "inspector", "monitor"] },
        ],
      },
    ],
  },

  notifications: {
    types: [
      { code: "gen_inspection_due", label: "검사 예정", priority: "medium", category: "검사" },
      { code: "gen_inspection_overdue", label: "검사 누락", priority: "high", category: "검사" },
      { code: "gen_calibration_due", label: "검교정 만료 임박", priority: "high", category: "검교정" },
      { code: "gen_nonconforming_open", label: "부적합 미종결", priority: "medium", category: "부적합" },
      { code: "gen_supplier_evaluation_due", label: "공급업체 재평가 임박", priority: "medium", category: "공급업체" },
    ],
    rules: [],
  },

  approvals: {
    workflows: [
      {
        code: "gen_simple",
        label: "일반 2단계 (검토 → 승인)",
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
      { code: "gen_inspection_report", label: "검사 성적서 승인", workflow: "gen_simple", category: "검사" },
      { code: "gen_change_control", label: "변경관리 승인", workflow: "gen_simple", category: "Change Control" },
      { code: "gen_capa", label: "CAPA 승인", workflow: "gen_simple", category: "품질" },
    ],
  },

  documents: {
    formTypes: [
      { code: "gen_work_instruction", name: "작업표준서", category: "공정관리" },
      { code: "gen_inspection_report", name: "검사 성적서", category: "검사" },
      { code: "gen_quality_manual", name: "품질매뉴얼 (ISO 9001)", category: "ISO 9001" },
      { code: "gen_change_control", name: "변경관리", category: "품질관리 (Y-시리즈)" },
      { code: "gen_nonconforming", name: "부적합 관리", category: "품질관리 (Y-시리즈)" },
      { code: "gen_capa", name: "CAPA", category: "품질관리 (Y-시리즈)" },
      { code: "gen_audit", name: "내부 감사", category: "품질관리 (Y-시리즈)" },
      { code: "gen_calibration", name: "검교정", category: "품질관리 (Y-시리즈)" },
      { code: "gen_quality_supplier", name: "공급업체 평가", category: "품질관리 (Y-시리즈)" },
      { code: "gen_training_record", name: "교육 기록", category: "품질관리 (Y-시리즈)" },
      { code: "gen_risk_assessment", name: "위험 평가", category: "품질관리 (Y-시리즈)" },
    ],
    pdfTemplates: [
      { code: "gen_iso9001_audit_report", name: "ISO 9001 내부감사 보고서", regulation: "ISO 9001 §9.2", template: "templates/general/iso9001_audit.pdf" },
    ],
  },

  dashboardWidgets: [
    { code: "gen_inspection_status", label: "검사 현황", size: "medium", order: 10, dataSource: "industry.general.dashboard.inspection", chartType: "card" },
    { code: "gen_nonconforming_open", label: "미종결 부적합", size: "medium", order: 20, dataSource: "nonconforming.openCount", chartType: "card" },
    { code: "gen_calibration_due", label: "검교정 임박", size: "medium", order: 30, dataSource: "calibration.dueSoon", chartType: "table" },
  ],

  masterCategories: {
    materials: [
      { code: "gen_metal", label: "금속 자재", order: 10 },
      { code: "gen_plastic", label: "플라스틱 자재", order: 20 },
      { code: "gen_rubber", label: "고무 자재", order: 30 },
      { code: "gen_wood", label: "목재", order: 40 },
      { code: "gen_paper", label: "종이/지류", order: 50 },
      { code: "gen_packaging_general", label: "포장재", order: 60 },
    ],
    products: [
      { code: "gen_machinery", label: "기계 부품", order: 10 },
      { code: "gen_industrial", label: "산업용 제품", order: 20 },
      { code: "gen_consumer", label: "소비자용 제품", order: 30 },
    ],
  },

  certifications: [
    { code: "ISO9001", nameKo: "ISO 9001 품질경영시스템", requirement: "recommended" },
    { code: "ISO14001", nameKo: "ISO 14001 환경경영시스템", requirement: "optional" },
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

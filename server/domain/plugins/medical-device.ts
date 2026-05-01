/**
 * Medical Device (의료기기) Industry Plugin
 *
 * 표준: ISO 13485 / KGMP (의료기기) / MDSAP / ISO 14971 (Risk Management)
 * 핵심: DHF / DMR / DHR, 위험관리 (ISO 14971), Design Controls
 */

import type { IndustryPlugin } from "@shared/domain/IndustryPlugin";

export const medicalDevicePlugin: IndustryPlugin = {
  key: "medical-device",
  labelKo: "의료기기 ISO 13485",
  labelEn: "Medical Device ISO 13485",
  category: "electronics", // 임시 — 추후 industryConfig 에 medical-device 카테고리 추가 권장
  industryCodes: ["C27"], // 의료용 기기·기구 제조업 (KSIC C27)
  description: "의료기기 제조 — ISO 13485 / ISO 14971 / KGMP",
  icon: "Activity",

  labels: {
    batch: "Lot",
    product: "의료기기",
    material: "구성품",
    process: "제조공정",
    site: "제조시설",
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
    gmp: true,
    iso: true,
    traceability: true,
  },

  features: {
    gmp_deviation: true,
    gmp_capa: true,
    gmp_validation: true,
    gmp_change_control: true,
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
    serial_tracking: true, // 의료기기 UDI
    expiry_mgmt: true,
    double_entry: true,
    tax_invoice: true,
    cost_analysis: true,
  },

  menu: {
    groups: [
      {
        name: "의료기기 ISO 13485",
        order: 70,
        items: [
          { icon: "GitBranch", label: "변경관리 (ISO 13485)", path: "/dashboard/medical-device/change-control", roles: ["super_admin", "admin", "inspector", "monitor"] },
          { icon: "AlertCircle", label: "부적합 관리 (ISO 13485)", path: "/dashboard/medical-device/nonconforming", roles: ["super_admin", "admin", "inspector", "monitor"] },
          { icon: "AlertTriangle", label: "CAPA (ISO 13485)", path: "/dashboard/medical-device/corrective-action", roles: ["super_admin", "admin", "inspector", "monitor"] },
          { icon: "ClipboardCheck", label: "감사 (ISO 13485)", path: "/dashboard/medical-device/audit", roles: ["super_admin", "admin", "inspector", "monitor"] },
          { icon: "GraduationCap", label: "교육 (ISO 13485)", path: "/dashboard/medical-device/training", roles: ["super_admin", "admin", "inspector", "monitor"] },
          { icon: "Sliders", label: "검교정 (ISO 13485)", path: "/dashboard/medical-device/calibration", roles: ["super_admin", "admin", "inspector", "monitor"] },
          { icon: "Building", label: "공급업체 (ISO 13485)", path: "/dashboard/medical-device/supplier", roles: ["super_admin", "admin", "inspector", "monitor"] },
          { icon: "AlertTriangle", label: "위험관리 ISO 14971", path: "/dashboard/medical-device/risk-assessment", roles: ["super_admin", "admin", "inspector", "monitor"] },
        ],
      },
    ],
  },

  notifications: {
    types: [
      { code: "md_dhf_pending", label: "DHF (Design History File) 검토 대기", priority: "high", category: "Design Controls" },
      { code: "md_dmr_update", label: "DMR (Device Master Record) 갱신 필요", priority: "medium", category: "Design Controls" },
      { code: "md_dhr_pending", label: "DHR (Device History Record) 작성 대기", priority: "medium", category: "Production" },
      { code: "md_udi_missing", label: "UDI (Unique Device Identifier) 누락", priority: "high", category: "UDI" },
      { code: "md_risk_review_due", label: "Risk Assessment 재검토 필요", priority: "high", category: "Risk (ISO 14971)" },
      { code: "md_calibration_due", label: "검교정 만료 임박", priority: "high", category: "검교정" },
      { code: "md_supplier_audit_due", label: "공급업체 실사 예정", priority: "medium", category: "Supplier" },
      { code: "md_complaint_received", label: "Customer Complaint 수신 — 조사 필요", priority: "critical", category: "Complaint" },
    ],
    rules: [],
  },

  approvals: {
    workflows: [
      {
        code: "md_qa_qm",
        label: "ISO 13485 (QA → QM)",
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
      { code: "md_dhf_approval", label: "DHF 승인", workflow: "md_qa_qm", category: "Design Controls" },
      { code: "md_dmr_approval", label: "DMR 승인", workflow: "md_qa_qm", category: "Design Controls" },
      { code: "md_dhr_approval", label: "DHR 승인", workflow: "md_qa_qm", category: "Production" },
      { code: "md_risk_assessment", label: "Risk Assessment 승인 (ISO 14971)", workflow: "md_qa_qm", category: "Risk" },
      { code: "md_complaint_resolution", label: "Customer Complaint 종결 승인", workflow: "md_qa_qm", category: "Complaint" },
      { code: "md_change_control", label: "변경관리 승인", workflow: "md_qa_qm", category: "Change Control" },
    ],
  },

  documents: {
    formTypes: [
      { code: "md_dhf", name: "DHF (Design History File)", category: "Design Controls" },
      { code: "md_dmr", name: "DMR (Device Master Record)", category: "Design Controls" },
      { code: "md_dhr", name: "DHR (Device History Record)", category: "Production" },
      { code: "md_risk_management_file", name: "Risk Management File (ISO 14971)", category: "Risk" },
      { code: "md_complaint_form", name: "Customer Complaint Form", category: "Complaint" },
      { code: "md_capa_form", name: "CAPA Form", category: "품질관리 (Y-시리즈)" },
      { code: "md_change_control", name: "Change Control", category: "품질관리 (Y-시리즈)" },
      { code: "md_nonconforming", name: "Nonconforming Material Report", category: "품질관리 (Y-시리즈)" },
      { code: "md_audit_report", name: "Internal Audit Report", category: "품질관리 (Y-시리즈)" },
      { code: "md_calibration", name: "검교정 / Validation", category: "품질관리 (Y-시리즈)" },
      { code: "md_quality_supplier", name: "공급업체 평가 (AVL)", category: "품질관리 (Y-시리즈)" },
      { code: "md_training_record", name: "교육 기록", category: "품질관리 (Y-시리즈)" },
    ],
    pdfTemplates: [
      { code: "md_dhf_template", name: "DHF Template", regulation: "ISO 13485 §7.3", template: "templates/medical-device/dhf.pdf" },
      { code: "md_risk_management", name: "Risk Management Report", regulation: "ISO 14971", template: "templates/medical-device/risk_management.pdf" },
    ],
  },

  dashboardWidgets: [
    { code: "md_dhf_status", label: "DHF 현황", size: "medium", order: 10, dataSource: "industry.medicalDevice.dashboard.dhfStatus", chartType: "card" },
    { code: "md_complaints_open", label: "미종결 Complaint", size: "medium", order: 20, dataSource: "industry.medicalDevice.dashboard.complaints", chartType: "card" },
    { code: "md_risk_high", label: "고위험 Risk Assessment", size: "large", order: 30, dataSource: "riskAssessment.highResidualScore", chartType: "table" },
  ],

  masterCategories: {
    materials: [
      { code: "md_component_metal", label: "금속 부품", order: 10 },
      { code: "md_component_plastic", label: "플라스틱 부품", order: 20 },
      { code: "md_component_electronic", label: "전자 부품", order: 30 },
      { code: "md_packaging", label: "멸균 포장재", order: 40 },
    ],
    products: [
      { code: "md_class1", label: "1등급 의료기기", order: 10 },
      { code: "md_class2", label: "2등급 의료기기", order: 20 },
      { code: "md_class3", label: "3등급 의료기기", order: 30 },
      { code: "md_class4", label: "4등급 의료기기", order: 40 },
    ],
  },

  certifications: [
    { code: "ISO13485", nameKo: "ISO 13485 의료기기 품질경영시스템", requirement: "mandatory" },
    { code: "ISO14971", nameKo: "ISO 14971 의료기기 위험관리", requirement: "mandatory" },
    { code: "KGMP_MD", nameKo: "의료기기 KGMP", requirement: "mandatory", authority: "식약처" },
    { code: "MDSAP", nameKo: "MDSAP (Medical Device Single Audit Program)", requirement: "recommended" },
    { code: "MDR_EU", nameKo: "EU MDR (Medical Device Regulation)", requirement: "optional" },
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

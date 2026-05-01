/**
 * Pharmaceutical (의약품 KGMP) Industry Plugin
 *
 * 표준: KGMP / ICH Q7~Q10 / PIC/S
 * 핵심: Batch Record, IPC, Validation (IQ/OQ/PQ), Stability, QP Release
 */

import type { IndustryPlugin } from "@shared/domain/IndustryPlugin";

export const pharmaceuticalPlugin: IndustryPlugin = {
  key: "pharmaceutical",
  labelKo: "의약품 KGMP",
  labelEn: "Pharmaceutical KGMP",
  category: "pharma",
  industryCodes: ["C21"],
  description: "의약품 제조 — KGMP / PIC/S / ICH Q7~Q10",
  icon: "Syringe",

  labels: {
    batch: "제조번호",
    product: "의약품",
    material: "원료의약품",
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
    haccp: false,
    gmp: true,
    iso: true,
    traceability: true,
  },

  features: {
    gmp_deviation: true,
    gmp_capa: true,
    stability_test: true,
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
    fefo_allocation: true,
    expiry_mgmt: true,
    serial_tracking: true,
    double_entry: true,
    tax_invoice: true,
    cost_analysis: true,
  },

  menu: {
    groups: [
      {
        name: "의약품 KGMP",
        order: 70,
        items: [
          { icon: "GitBranch", label: "변경관리 (KGMP)", path: "/dashboard/pharmaceutical/change-control", roles: ["super_admin", "admin", "inspector", "monitor"] },
          { icon: "AlertCircle", label: "부적합 관리 (KGMP)", path: "/dashboard/pharmaceutical/nonconforming", roles: ["super_admin", "admin", "inspector", "monitor"] },
          { icon: "AlertTriangle", label: "CAPA (KGMP)", path: "/dashboard/pharmaceutical/corrective-action", roles: ["super_admin", "admin", "inspector", "monitor"] },
          { icon: "ClipboardCheck", label: "감사 (KGMP)", path: "/dashboard/pharmaceutical/audit", roles: ["super_admin", "admin", "inspector", "monitor"] },
          { icon: "GraduationCap", label: "교육 / 훈련 (KGMP)", path: "/dashboard/pharmaceutical/training", roles: ["super_admin", "admin", "inspector", "monitor"] },
          { icon: "Sliders", label: "검교정 IQ/OQ/PQ (KGMP)", path: "/dashboard/pharmaceutical/calibration", roles: ["super_admin", "admin", "inspector", "monitor"] },
          { icon: "Building", label: "공급업체 AVL (KGMP)", path: "/dashboard/pharmaceutical/supplier", roles: ["super_admin", "admin", "inspector", "monitor"] },
          { icon: "AlertTriangle", label: "위험 평가 ICH Q9 (KGMP)", path: "/dashboard/pharmaceutical/risk-assessment", roles: ["super_admin", "admin", "inspector", "monitor"] },
        ],
      },
    ],
  },

  notifications: {
    types: [
      { code: "kgmp_batch_record_pending", label: "Batch Record 작성 대기", priority: "medium", category: "Batch Record" },
      { code: "kgmp_qp_release_pending", label: "QP Release 승인 대기", priority: "high", category: "Release" },
      { code: "kgmp_qp_release_overdue", label: "QP Release 지연", priority: "critical", category: "Release" },
      { code: "kgmp_validation_due", label: "Validation 만료 임박 (IQ/OQ/PQ)", priority: "high", category: "Validation" },
      { code: "kgmp_stability_pending", label: "안정성시험 진행 중", priority: "medium", category: "Stability" },
      { code: "kgmp_deviation_open", label: "Deviation 미종결", priority: "high", category: "Deviation" },
      { code: "kgmp_change_control_pending", label: "변경관리 검토 대기", priority: "medium", category: "Change Control" },
      { code: "kgmp_calibration_due", label: "검교정 만료 임박 (PIC/S §3.41)", priority: "high", category: "검교정" },
      { code: "kgmp_supplier_audit_due", label: "공급업체 실사 예정 (PIC/S §7.5)", priority: "medium", category: "Supplier" },
      { code: "kgmp_training_overdue", label: "교육 미이수", priority: "medium", category: "Training" },
    ],
    rules: [
      {
        code: "validation_30days_before",
        description: "Validation (IQ/OQ/PQ) 만료 30일 전",
        trigger: "h_calibrations.next_due_date - 30 days = TODAY",
        notificationType: "kgmp_validation_due",
      },
    ],
  },

  approvals: {
    workflows: [
      {
        code: "kgmp_qa_qp",
        label: "KGMP 2단계 (QA → QP 출하)",
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
      { code: "pharma_batch_record", label: "Batch Record 승인", workflow: "kgmp_qa_qp", category: "Batch Record" },
      { code: "pharma_qp_release", label: "QP Release 출하 승인", workflow: "kgmp_qa_qp", category: "Release" },
      { code: "pharma_validation", label: "Validation 결과 승인 (IQ/OQ/PQ)", workflow: "kgmp_qa_qp", category: "Validation" },
      { code: "pharma_stability", label: "안정성시험 결과 승인", workflow: "kgmp_qa_qp", category: "Stability" },
      { code: "pharma_deviation", label: "Deviation 종결 승인", workflow: "kgmp_qa_qp", category: "Deviation" },
      { code: "pharma_change_control", label: "변경관리 승인 (ICH Q10)", workflow: "kgmp_qa_qp", category: "Change Control" },
    ],
  },

  documents: {
    formTypes: [
      { code: "pharma_batch_record", name: "Batch Manufacturing Record", category: "의약품 KGMP" },
      { code: "pharma_packaging_record", name: "Batch Packaging Record", category: "의약품 KGMP" },
      { code: "pharma_master_formula", name: "Master Formula Record", category: "의약품 KGMP" },
      { code: "pharma_validation_protocol", name: "Validation Protocol (IQ/OQ/PQ)", category: "Validation" },
      { code: "pharma_validation_report", name: "Validation Report", category: "Validation" },
      { code: "pharma_stability_protocol", name: "Stability Study Protocol (ICH Q1A)", category: "Stability" },
      { code: "pharma_stability_report", name: "Stability Study Report", category: "Stability" },
      { code: "pharma_deviation_report", name: "Deviation Report", category: "품질관리" },
      { code: "pharma_qp_certificate", name: "QP Release Certificate", category: "Release" },
      { code: "pharma_change_control", name: "변경관리 (Change Control)", category: "품질관리 (Y-시리즈)" },
      { code: "pharma_nonconforming", name: "부적합 관리 (통합)", category: "품질관리 (Y-시리즈)" },
      { code: "pharma_capa", name: "CAPA (시정·예방조치)", category: "품질관리 (Y-시리즈)" },
      { code: "pharma_audit", name: "감사 (Audit)", category: "품질관리 (Y-시리즈)" },
      { code: "pharma_calibration", name: "검교정 / Validation", category: "품질관리 (Y-시리즈)" },
      { code: "pharma_quality_supplier", name: "공급업체 AVL", category: "품질관리 (Y-시리즈)" },
      { code: "pharma_risk_assessment", name: "Risk Assessment (ICH Q9)", category: "품질관리 (Y-시리즈)" },
      { code: "pharma_training", name: "교육 기록", category: "품질관리 (Y-시리즈)" },
    ],
    pdfTemplates: [
      { code: "pharma_kgmp_batch_record", name: "KGMP Batch Record PDF", regulation: "KGMP §3 / PIC/S §4", template: "templates/pharma/batch_record.pdf" },
      { code: "pharma_qp_certificate_pdf", name: "QP Release Certificate", regulation: "KGMP §3.5 / ICH Q10", template: "templates/pharma/qp_cert.pdf" },
    ],
  },

  dashboardWidgets: [
    { code: "kgmp_qp_queue", label: "QP Release 대기", size: "medium", order: 10, dataSource: "industry.pharma.dashboard.qpQueue", chartType: "card" },
    { code: "kgmp_validation_status", label: "Validation 현황", size: "large", order: 20, dataSource: "industry.pharma.dashboard.validation", chartType: "table" },
    { code: "kgmp_deviation_open", label: "미종결 Deviation", size: "medium", order: 30, dataSource: "nonconforming.openCount", chartType: "card" },
  ],

  masterCategories: {
    materials: [
      { code: "api", label: "API (원료의약품)", order: 10 },
      { code: "excipient", label: "부형제", order: 20 },
      { code: "solvent", label: "용매", order: 30 },
      { code: "packaging_pharma", label: "1차 / 2차 포장재", order: 40 },
    ],
    products: [
      { code: "tablet", label: "정제 (Tablet)", order: 10 },
      { code: "capsule", label: "캡슐제 (Capsule)", order: 20 },
      { code: "injection", label: "주사제 (Injection)", order: 30 },
      { code: "syrup", label: "시럽제 (Syrup)", order: 40 },
      { code: "ointment", label: "연고제 (Ointment)", order: 50 },
    ],
  },

  certifications: [
    { code: "KGMP_PHARMA", nameKo: "의약품 제조 및 품질관리기준 (KGMP)", requirement: "mandatory", authority: "식약처" },
    { code: "PICS", nameKo: "PIC/S GMP", requirement: "recommended", authority: "PIC/S" },
    { code: "ICH_Q7", nameKo: "ICH Q7 — Active Pharmaceutical Ingredients", requirement: "recommended" },
    { code: "ICH_Q9", nameKo: "ICH Q9 — Quality Risk Management", requirement: "recommended" },
    { code: "ICH_Q10", nameKo: "ICH Q10 — Pharmaceutical Quality System", requirement: "recommended" },
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

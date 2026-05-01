/**
 * Cosmetic (화장품 GMP) Industry Plugin
 *
 * 표준: 화장품법 §6 / KGMP / ISO 22716
 * 핵심: BMR (제조기록서), 배합표, Stability, Release
 */

import type { IndustryPlugin } from "@shared/domain/IndustryPlugin";

export const cosmeticPlugin: IndustryPlugin = {
  key: "cosmetic",
  labelKo: "화장품 GMP",
  labelEn: "Cosmetic GMP",
  category: "cosmetics",
  industryCodes: ["C20"],
  description: "화장품 제조 — KGMP / ISO 22716 + 화장품법 §6 신고",
  icon: "Sparkles",

  labels: {
    batch: "제조번호",
    product: "화장품",
    material: "원료",
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
    double_entry: true,
    tax_invoice: true,
    cost_analysis: true,
  },

  menu: {
    groups: [
      {
        name: "화장품 GMP",
        order: 70,
        items: [
          { icon: "LayoutDashboard", label: "GMP 운영 현황", path: "/dashboard/cosmetic/dashboard", roles: ["super_admin", "admin", "inspector", "monitor"] },
          { icon: "Sparkles", label: "BMR (제조기록)", path: "/dashboard/cosmetic/bmr", roles: ["super_admin", "admin", "inspector", "monitor"] },
          { icon: "FlaskConical", label: "배합표 (Formula)", path: "/dashboard/cosmetic/formula", roles: ["super_admin", "admin", "inspector", "monitor"] },
          { icon: "Tag", label: "라벨 / 전성분", path: "/dashboard/cosmetic/label", roles: ["super_admin", "admin", "inspector", "monitor"] },
          { icon: "Truck", label: "QA 출고 (Release)", path: "/dashboard/cosmetic/release", roles: ["super_admin", "admin", "inspector", "monitor"] },
          { icon: "Thermometer", label: "안정성시험", path: "/dashboard/cosmetic/stability", roles: ["super_admin", "admin", "inspector", "monitor"] },
        ],
      },
      {
        name: "품질관리 (GMP)",
        order: 80,
        items: [
          { icon: "GitBranch", label: "변경관리", path: "/dashboard/cosmetic/change-control", roles: ["super_admin", "admin", "inspector", "monitor"] },
          { icon: "AlertCircle", label: "부적합 관리", path: "/dashboard/cosmetic/nonconforming", roles: ["super_admin", "admin", "inspector", "monitor"] },
          { icon: "ClipboardCheck", label: "감사 (Audit)", path: "/dashboard/cosmetic/audit", roles: ["super_admin", "admin", "inspector", "monitor"] },
          { icon: "AlertTriangle", label: "CAPA (시정·예방)", path: "/dashboard/cosmetic/corrective-action", roles: ["super_admin", "admin", "inspector", "monitor"] },
          { icon: "GraduationCap", label: "교육 / 훈련", path: "/dashboard/cosmetic/training", roles: ["super_admin", "admin", "inspector", "monitor"] },
          { icon: "Sliders", label: "검교정 / 설비 자격", path: "/dashboard/cosmetic/calibration", roles: ["super_admin", "admin", "inspector", "monitor"] },
          { icon: "Building", label: "공급업체 (AVL)", path: "/dashboard/cosmetic/supplier", roles: ["super_admin", "admin", "inspector", "monitor"] },
          { icon: "AlertTriangle", label: "위험 평가 (ICH Q9)", path: "/dashboard/cosmetic/risk-assessment", roles: ["super_admin", "admin", "inspector", "monitor"] },
        ],
      },
    ],
  },

  notifications: {
    types: [
      { code: "gmp_bmr_pending", label: "BMR 작성 대기", priority: "medium", category: "BMR" },
      { code: "gmp_bmr_review_pending", label: "BMR 검토 대기", priority: "high", category: "BMR" },
      { code: "gmp_release_pending", label: "Release 승인 대기", priority: "high", category: "Release" },
      { code: "gmp_release_overdue", label: "Release 지연", priority: "critical", category: "Release" },
      { code: "gmp_ipc_pending", label: "공정중관리 (IPC) 미수행", priority: "high", category: "IPC" },
      { code: "gmp_stability_due_30days", label: "안정성시험 30일 전 만료", priority: "medium", category: "Stability" },
      { code: "gmp_stability_due_7days", label: "안정성시험 7일 전 만료", priority: "high", category: "Stability" },
      { code: "gmp_stability_overdue", label: "안정성시험 만료", priority: "critical", category: "Stability" },
      { code: "gmp_label_review_pending", label: "라벨 / INCI 검토 대기", priority: "medium", category: "라벨" },
      { code: "gmp_supplier_evaluation_due", label: "공급업체 재평가 임박", priority: "medium", category: "공급업체" },
      { code: "gmp_calibration_due", label: "검교정 만료 임박", priority: "high", category: "검교정" },
    ],
    rules: [
      {
        code: "stability_30days_before",
        description: "안정성시험 만료 30일 전 자동 알림",
        trigger: "h_cosmetic_stability_studies.expiry_date - 30 days = TODAY",
        notificationType: "gmp_stability_due_30days",
      },
      {
        code: "release_pending_24hours",
        description: "Release 승인 24시간 미처리 시 알림",
        trigger: "h_cosmetic_releases.status = 'pending' AND h_cosmetic_releases.created_at < NOW() - 24hours",
        notificationType: "gmp_release_overdue",
        cooldownMinutes: 240,
      },
    ],
  },

  approvals: {
    workflows: [
      {
        code: "gmp_qa_qm",
        label: "GMP 2단계 (QA 검토 → QM 승인)",
        steps: ["draft", "review", "approve", "released"],
        stepRoles: {
          draft: ["worker", "admin"],
          review: ["inspector", "admin"],
          approve: ["admin", "super_admin"],
          released: [],
          rejected: [],
        },
      },
      {
        code: "gmp_qa_qm_qp",
        label: "GMP 3단계 + QP (QA → QM → QP 출고)",
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
      { code: "cosmetic_bmr_approval", label: "BMR 승인", workflow: "gmp_qa_qm", category: "BMR", entityTable: "h_cosmetic_bmrs" },
      { code: "cosmetic_release_approval", label: "Release 출하 승인", workflow: "gmp_qa_qm_qp", category: "Release", entityTable: "h_cosmetic_releases" },
      { code: "cosmetic_formula_approval", label: "배합표 승인", workflow: "gmp_qa_qm", category: "Formula", entityTable: "h_cosmetic_formulas" },
      { code: "cosmetic_label_approval", label: "라벨 / INCI 승인", workflow: "gmp_qa_qm", category: "라벨", entityTable: "h_cosmetic_labels" },
      { code: "cosmetic_stability_approval", label: "안정성시험 결과 승인", workflow: "gmp_qa_qm", category: "Stability", entityTable: "h_cosmetic_stability_studies" },
      { code: "cosmetic_change_control", label: "변경관리 승인", workflow: "gmp_qa_qm", category: "변경관리", entityTable: "h_change_controls" },
    ],
  },

  documents: {
    formTypes: [
      { code: "cosmetic_bmr", name: "BMR (제조기록서)", category: "화장품 GMP", pdfTemplate: "cosmetic_bmr_template" },
      { code: "cosmetic_bmr_ipc", name: "BMR 공정중관리 (IPC)", category: "화장품 GMP", pdfTemplate: "cosmetic_ipc_template" },
      { code: "cosmetic_formula", name: "배합표 (Formula)", category: "화장품 GMP" },
      { code: "cosmetic_label", name: "라벨 / 전성분 (INCI)", category: "화장품 GMP" },
      { code: "cosmetic_release", name: "QA 출고 (Release) 승인", category: "화장품 GMP", pdfTemplate: "cosmetic_release_cert" },
      { code: "cosmetic_stability", name: "안정성시험 (ICH Q1A)", category: "화장품 GMP" },
      { code: "cosmetic_pmr", name: "화장품 제조관리기록서 (PMR)", category: "화장품 GMP" },
      { code: "cosmetic_packaging_record", name: "포장 기록서", category: "화장품 GMP" },
      { code: "cosmetic_change_control", name: "변경관리 (Change Control)", category: "품질관리 (Y-시리즈)" },
      { code: "cosmetic_nonconforming", name: "부적합 관리 (통합)", category: "품질관리 (Y-시리즈)" },
      { code: "cosmetic_capa", name: "CAPA (시정·예방조치)", category: "품질관리 (Y-시리즈)" },
      { code: "cosmetic_audit", name: "감사 (Audit)", category: "품질관리 (Y-시리즈)" },
      { code: "cosmetic_calibration", name: "검교정 / 설비 자격", category: "품질관리 (Y-시리즈)" },
      { code: "cosmetic_quality_supplier", name: "공급업체 (AVL)", category: "품질관리 (Y-시리즈)" },
      { code: "cosmetic_risk_assessment", name: "위험 평가 (ICH Q9)", category: "품질관리 (Y-시리즈)" },
      { code: "cosmetic_training", name: "교육 / 훈련 기록", category: "품질관리 (Y-시리즈)" },
    ],
    pdfTemplates: [
      {
        code: "cosmetic_bmr_template",
        name: "BMR (제조기록서) PDF",
        regulation: "KGMP §3 / 화장품법",
        template: "templates/cosmetic/bmr.pdf",
      },
      {
        code: "cosmetic_ipc_template",
        name: "공정중관리 PDF",
        regulation: "KGMP §3.4",
        template: "templates/cosmetic/ipc.pdf",
      },
      {
        code: "cosmetic_release_cert",
        name: "출하 인증서 (Release Certificate)",
        regulation: "KGMP §3.5 / ICH Q10",
        template: "templates/cosmetic/release_cert.pdf",
      },
      {
        code: "cosmetic_law_section6_report",
        name: "화장품법 §6 신고서",
        regulation: "화장품법 §6",
        template: "templates/cosmetic/section6_report.pdf",
      },
    ],
  },

  dashboardWidgets: [
    { code: "gmp_release_queue", label: "출하 대기 BMR", size: "medium", order: 10, dataSource: "industry.cosmetic.dashboard.releaseQueue", chartType: "card" },
    { code: "gmp_stability_chart", label: "안정성시험 진행 현황", size: "large", order: 20, dataSource: "industry.cosmetic.dashboard.stability", chartType: "line" },
    { code: "gmp_bmr_pipeline", label: "BMR 파이프라인", size: "large", order: 30, dataSource: "industry.cosmetic.dashboard.bmrPipeline", chartType: "bar" },
    { code: "gmp_supplier_eval_due", label: "공급업체 재평가 임박", size: "medium", order: 40, dataSource: "qualitySupplier.dueSoon", chartType: "table" },
  ],

  masterCategories: {
    materials: [
      { code: "active_ingredient", label: "유효성분 (Active)", order: 10 },
      { code: "preservative", label: "방부제", order: 20 },
      { code: "fragrance", label: "향료", order: 30 },
      { code: "colorant", label: "색소", order: 40 },
      { code: "humectant", label: "보습제", order: 50 },
      { code: "emulsifier", label: "유화제", order: 60 },
      { code: "thickener", label: "점증제", order: 70 },
      { code: "ph_adjuster", label: "pH 조정제", order: 80 },
      { code: "packaging_cosmetic", label: "화장품 용기 / 포장재", order: 90 },
    ],
    products: [
      { code: "skincare", label: "기초화장품 (Skincare)", order: 10 },
      { code: "makeup", label: "색조화장품 (Makeup)", order: 20 },
      { code: "haircare", label: "두발용 화장품", order: 30 },
      { code: "bodycare", label: "인체세정용", order: 40 },
      { code: "fragrance_product", label: "방향용 화장품", order: 50 },
    ],
  },

  certifications: [
    { code: "KGMP_COSMETIC", nameKo: "화장품 KGMP", requirement: "mandatory", authority: "식약처" },
    { code: "ISO22716", nameKo: "ISO 22716 화장품 GMP", requirement: "recommended" },
    { code: "ISO9001", nameKo: "ISO 9001 품질경영시스템", requirement: "optional" },
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

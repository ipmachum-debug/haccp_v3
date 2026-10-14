/**
 * HACCP 체크리스트 양식 카탈로그 — 단일 출처 (일지 PR 3, 2026-10-15)
 *
 * 이전에는 ChecklistDashboard.tsx 안에 하드코딩되어 있었다. 새 시작 화면(오늘·작성 기록·새 일지 작성)·
 * 옛 전체 화면(/quality/checklists/classic)·즐겨찾기가 모두 이 목록 하나를 쓴다.
 *
 *  - id: 즐겨찾기에 저장하는 양식 식별자 (바꾸지 말 것 — 사용자 즐겨찾기가 이 값을 가리킨다)
 *  - formType: 공통 일지(h_generic_checklist_records) 저장 형식. 별도 모듈(건강진단결과서·검교정)은 null
 *  - cycle: **분류용 표시**(일일·주간·월간·수시). 실제 작성 일정이 아니다 — 이 값으로 "미작성" 을 판정하지 않는다
 */
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Bug, Building2, ClipboardCheck, Cog, Droplet, Droplets, FileCheck, FileText, Filter, FlaskConical, FolderOpen, Gauge, GraduationCap, Handshake, HeartPulse, MessageSquareWarning, Microscope, Package, Scale, ShieldCheck, Sparkles, Sun, Thermometer, ThermometerSun, Trash2, Truck, UserCheck, Wrench, Zap } from "lucide-react";

export type ChecklistCycle = "daily" | "weekly" | "monthly" | "asNeeded";

export const CYCLE_LABELS: Record<ChecklistCycle, string> = { daily: "일일", weekly: "주간", monthly: "월간", asNeeded: "수시" };

export type ChecklistCatalogItem = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  listPath: string;
  createPath: string;
  formType: string | null;
  cycle: ChecklistCycle;
};

export type ChecklistCatalogCategory = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  color: string;
  bgColor: string;
  filterLabel: string;
  items: ChecklistCatalogItem[];
};

export const CHECKLIST_CATEGORIES: ChecklistCatalogCategory[] = [
  {
    id: "hygiene", title: "위생 관리", description: "개인위생, 종사자 건강, 세척·소독, 표면오염도, 위생시설, 작업장위생", icon: Droplet, color: "text-purple-600", bgColor: "bg-purple-50", filterLabel: "위생",
    items: [
      { id: "personal-hygiene", title: "개인 위생관리 점검표", description: "종사자 개인위생 상태를 점검합니다", icon: UserCheck, listPath: "/personal-hygiene-check", createPath: "/personal-hygiene-check/new", formType: "personal_hygiene_check", cycle: "daily" },
      { id: "employee-health", title: "종사자 건강상태 확인 일지", description: "작업장 출입 전 종사자 건강상태를 확인합니다", icon: HeartPulse, listPath: "/employee-health-check", createPath: "/employee-health-check/new", formType: "employee_health_check", cycle: "daily" },
      { id: "sanitation", title: "세척소독 관리대장", description: "세척·소독 제품 및 사용 기록을 관리합니다", icon: Sparkles, listPath: "/sanitation-record", createPath: "/sanitation-record/new", formType: "sanitation_record", cycle: "asNeeded" },
      { id: "surface-contamination", title: "표면오염도 검사 성적서", description: "표면오염도 검사 결과를 기록합니다", icon: Microscope, listPath: "/surface-contamination-test", createPath: "/surface-contamination-test/new", formType: "surface_contamination_test", cycle: "monthly" },
      { id: "health-certificates", title: "건강진단결과서 관리", description: "건강진단결과서(구, 보건증) 현황 및 만료 임박 현황", icon: FileCheck, listPath: "/dashboard/checklist/employee-health", createPath: "/dashboard/checklist/employee-health", formType: null, cycle: "asNeeded" },
      { id: "hygiene-facility", title: "위생시설 점검일지", description: "위생시설의 상태를 점검합니다", icon: Building2, listPath: "/hygiene-facility-check", createPath: "/hygiene-facility-check/new", formType: "hygiene_facility_check", cycle: "daily" },
      { id: "workplace-hygiene", title: "작업장 위생관리 점검표", description: "작업장 전반의 위생 상태를 점검합니다", icon: ClipboardCheck, listPath: "/workplace-hygiene-check", createPath: "/workplace-hygiene-check/new", formType: "workplace_hygiene_check", cycle: "daily" },
    ],
  },
  {
    id: "facility", title: "시설·설비 관리", description: "온·습도, 냉장·냉동 온도, 필터, 조도, 차량온도, 설비이력, 설비점검", icon: Thermometer, color: "text-blue-600", bgColor: "bg-blue-50", filterLabel: "시설",
    items: [
      { id: "temperature-humidity", title: "온·습도 점검표", description: "각 공간의 온·습도를 점검합니다", icon: ThermometerSun, listPath: "/temperature-humidity-check", createPath: "/temperature-humidity-check/new", formType: "temperature_humidity_check", cycle: "daily" },
      { id: "cold-storage-temperature", title: "냉장·냉동창고 자동온도 기록지", description: "냉장·냉동창고의 온도를 기록합니다", icon: Thermometer, listPath: "/refrigeration-check", createPath: "/refrigeration-check/new", formType: "refrigeration_check", cycle: "daily" },
      { id: "filter-management", title: "압축공기 필터·에어컨 필터 관리대장", description: "압축공기 및 에어컨 필터를 관리합니다", icon: Filter, listPath: "/air-compressor", createPath: "/air-compressor/new", formType: "air_compressor_filter", cycle: "monthly" },
      { id: "illumination", title: "조도점검표", description: "작업장 조도를 점검합니다", icon: Sun, listPath: "/illumination-check", createPath: "/illumination-check/new", formType: "illumination_check", cycle: "monthly" },
      { id: "vehicle-temperature", title: "입·출고 차량 온도기록지", description: "입·출고 차량의 온도를 기록합니다", icon: Truck, listPath: "/vehicle-temperature-check", createPath: "/vehicle-temperature-check/new", formType: "vehicle_temperature_check", cycle: "asNeeded" },
      { id: "equipment-history", title: "시설·설비 이력카드", description: "시설·설비의 이력을 관리합니다", icon: Cog, listPath: "/equipment-history", createPath: "/equipment-history/new", formType: "equipment_history", cycle: "asNeeded" },
      { id: "equipment-inspection", title: "시설·설비·제조도구 점검표", description: "시설·설비·제조도구를 점검합니다", icon: Wrench, listPath: "/equipment-inspection", createPath: "/equipment-inspection/new", formType: "equipment_inspection", cycle: "asNeeded" },
      { id: "air-compressor-maintenance", title: "에어콤프레샤 관리일지", description: "에어 콤프레샤 윤활유 교환 및 에어 크리너 세척/소독을 기록합니다", icon: Cog, listPath: "/air-compressor-maintenance", createPath: "/air-compressor-maintenance/new", formType: "air_compressor_maintenance", cycle: "asNeeded" },
    ],
  },
  {
    id: "quality", title: "품질·시정·교육", description: "부적합품 관리, 검교정, 교육훈련, 소비자불만", icon: AlertTriangle, color: "text-red-600", bgColor: "bg-red-50", filterLabel: "품질",
    items: [
      { id: "nonconformance", title: "부적합품 관리 점검표", description: "부적합품 발생 및 처리를 관리합니다", icon: AlertTriangle, listPath: "/quality-issue-record", createPath: "/quality-issue-record/new", formType: "quality_issue_record", cycle: "asNeeded" },
      { id: "calibration", title: "검교정 관리", description: "계측기기 검교정을 관리합니다", icon: Gauge, listPath: "/calibration", createPath: "/calibration", formType: null, cycle: "asNeeded" },
      { id: "training-log", title: "교육훈련일지", description: "교육훈련 기록을 관리합니다", icon: GraduationCap, listPath: "/training-log", createPath: "/training-log/new", formType: "training_log", cycle: "asNeeded" },
      { id: "consumer-complaint", title: "소비자 불만 관리 일지", description: "소비자 불만 접수 및 처리를 관리합니다", icon: MessageSquareWarning, listPath: "/consumer-complaint", createPath: "/consumer-complaint/new", formType: "consumer_complaint", cycle: "asNeeded" },
    ],
  },
  {
    id: "inspection", title: "검사·성적·품질보증", description: "자가품질검사, 중량·품질검사, 제품검사, 완제품출고검사, 협력업체점검", icon: FlaskConical, color: "text-green-600", bgColor: "bg-green-50", filterLabel: "검사",
    items: [
      { id: "self-inspection", title: "자가품질검사", description: "자가품질검사 기록을 관리합니다", icon: FlaskConical, listPath: "/quality/self-inspection", createPath: "/quality/self-inspection/new", formType: "self_quality_inspection", cycle: "asNeeded" },
      { id: "weight-quality", title: "중량 및 품질 검사 일지", description: "중량 및 품질 검사를 기록합니다", icon: Scale, listPath: "/weight-quality-check", createPath: "/weight-quality-check/new", formType: "weight_quality_check", cycle: "asNeeded" },
      { id: "product-test-report", title: "제품검사 성적서", description: "제품검사 성적서를 관리합니다", icon: FileCheck, listPath: "/product-test-report", createPath: "/product-test-report/new", formType: "product_test_report", cycle: "asNeeded" },
      { id: "product-test-log", title: "제품 검사 일지", description: "제품 검사 일지를 기록합니다", icon: FileText, listPath: "/product-test-log", createPath: "/product-test-log/new", formType: "product_test_log", cycle: "asNeeded" },
      { id: "finished-product", title: "완제품 출고검사 일지", description: "완제품 출고 시 검사를 기록합니다", icon: Package, listPath: "/finished-product-check", createPath: "/finished-product-check/new", formType: "finished_product_check", cycle: "asNeeded" },
      { id: "supplier-inspection", title: "협력업체 점검표", description: "협력업체를 점검합니다", icon: Handshake, listPath: "/supplier-inspection", createPath: "/supplier-inspection/new", formType: "supplier_inspection", cycle: "asNeeded" },
    ],
  },
  {
    id: "pest-control", title: "방충·방서 관리", description: "방충·방서 점검, 공중낙하세균 검사, 식품회수", icon: Bug, color: "text-amber-600", bgColor: "bg-amber-50", filterLabel: "방충",
    items: [
      { id: "pest-control-checklist", title: "방충·방서 점검표", description: "방충·방서 상태를 점검합니다", icon: Bug, listPath: "/pest-control/checklists", createPath: "/pest-control/checklists/new", formType: "pest_control_checklist", cycle: "weekly" },
      { id: "airborne-bacteria", title: "공중낙하세균 검사 성적서", description: "공중낙하세균 검사 결과를 기록합니다", icon: Zap, listPath: "/airborne-bacteria-test", createPath: "/airborne-bacteria-test/new", formType: "airborne_bacteria_test", cycle: "monthly" },
      { id: "food-recall", title: "식품 회수 안내문", description: "식품 회수 안내문을 관리합니다", icon: ShieldCheck, listPath: "/food-recall-notice", createPath: "/food-recall-notice/new", formType: "food_recall_notice", cycle: "asNeeded" },
    ],
  },
  {
    id: "water", title: "용수 관리", description: "용수검사 성적서, 용수관리 점검표", icon: Droplets, color: "text-cyan-600", bgColor: "bg-cyan-50", filterLabel: "용수",
    items: [
      { id: "water-quality-test", title: "용수검사 성적서", description: "용수검사 결과를 관리합니다", icon: Droplets, listPath: "/water-quality-test", createPath: "/water-quality-test/new", formType: "water_quality_test", cycle: "asNeeded" },
      { id: "water-management", title: "용수관리 점검표", description: "용수 관리 상태를 점검합니다", icon: Droplet, listPath: "/water-management-check", createPath: "/water-management-check/new", formType: "water_management_check", cycle: "asNeeded" },
    ],
  },
  {
    id: "document", title: "문서·기록·기타", description: "업무인수인계서, 보건증 관리, 일일 폐기 기록", icon: FolderOpen, color: "text-indigo-600", bgColor: "bg-indigo-50", filterLabel: "문서",
    items: [
      { id: "handover-document", title: "업무 인수인계서", description: "업무 인수인계 기록을 관리합니다", icon: FolderOpen, listPath: "/handover-document", createPath: "/handover-document/new", formType: "handover_document", cycle: "asNeeded" },
      { id: "waste-disposal-record", title: "일일 폐기 기록", description: "일일 폐기 기록을 관리합니다", icon: Trash2, listPath: "/daily-disposal-record", createPath: "/daily-disposal-record/new", formType: "daily_disposal_record", cycle: "daily" },
      { id: "waste-management", title: "폐기물 관리대장", description: "폐기물 발생량, 자가처리, 재활용 현황을 기록합니다", icon: Trash2, listPath: "/waste-management", createPath: "/waste-management/new", formType: "waste_management", cycle: "asNeeded" },
    ],
  },
];

export const CHECKLIST_ITEMS: ChecklistCatalogItem[] = CHECKLIST_CATEGORIES.flatMap((c) => c.items);
export const CHECKLIST_ITEM_BY_ID: ReadonlyMap<string, ChecklistCatalogItem> = new Map(CHECKLIST_ITEMS.map((i) => [i.id, i]));
export const CATEGORY_OF_ITEM: ReadonlyMap<string, ChecklistCatalogCategory> = new Map(CHECKLIST_CATEGORIES.flatMap((c) => c.items.map((i) => [i.id, c] as const)));

/** 공통 일지 formType → 양식 이름 (작성 기록 목록 표시용) — 주기 일지 포함 */
export const FORM_TYPE_LABELS: Record<string, string> = {
  ...Object.fromEntries(CHECKLIST_ITEMS.filter((i) => i.formType).map((i) => [i.formType as string, i.title])),
  daily_log: "일일일지", weekly_log: "주간일지", monthly_log: "월간일지", yearly_log: "연간일지",
};

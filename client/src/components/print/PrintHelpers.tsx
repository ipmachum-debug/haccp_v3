/**
 * PrintHelpers.tsx
 * Shared constants, components, and utility render functions for print preview.
 */
import React from "react";
import { StampCellContent } from "@/components/checklist/ApprovalStampBox";

export const FORM_TYPE_LABELS: Record<string, string> = {
  air_compressor_filter: "에어컴프레서 필터 점검표",
  air_compressor_maintenance: "에어컴프레서 유지보수 기록",
  airborne_bacteria_test: "부유균 검사 기록",
  consumer_complaint: "소비자 불만 처리 기록",
  daily_disposal_record: "일일 폐기물 처리 기록",
  daily_log: "일반위생관리 및 공정점검표",
  production_daily: "생산일지",
  batch_completion: "생산일지",
  employee_health_check: "종사자 건강상태 확인 일지",
  equipment_history: "설비 이력 관리",
  equipment_inspection: "설비 점검 기록",
  finished_product_check: "완제품 검사 기록",
  visual_inspection: "원재료 육안검사일지",
  finished_product_inspection: "완제품 출고검사일지",
  material_usage_report: "원료수불 보고서",
  food_recall_notice: "식품 회수 통보서",
  handover_document: "인수인계서",
  hygiene_facility_check: "위생시설 점검표",
  illumination_check: "조도 점검표",
  product_test_log: "제품 시험 기록",
  product_test_report: "제품 시험 보고서",
  sanitation_record: "위생관리 기록",
  self_quality_inspection: "자체 품질 검사",
  supplier_inspection: "공급업체 점검 기록",
  surface_contamination_test: "표면오염 검사 기록",
  temperature_humidity_check: "온·습도 점검표",
  training_log: "교육훈련 기록",
  vehicle_temperature_check: "차량 온도 점검표",
  waste_management: "폐기물 관리 기록",
  water_management_check: "용수관리 점검표",
  weight_quality_check: "중량 품질 검사",
  workplace_hygiene_check: "작업장 위생 점검표",
  personal_hygiene_check: "개인위생 점검표",
  cleaning_disinfection: "세척소독 관리대장",
  pest_control_checklist: "방충·방서 점검표",
  // 주간/월간/연간 일지
  weekly_log: "주간 위생점검 일지",
  monthly_log: "월간 위생/CCP 점검 일지",
  yearly_log: "연간 검교정 점검표",
  // CCP 관련
  batch_plan: "일일배치 CCP 기록지 (그룹)",
  batch_production: "배치 CCP 기록지",
  batch_approval: "배치 CCP 기록지",
  ccp_form: "CCP 모니터링 기록지",
  ccp_checklist: "CCP 체크리스트",
};

export const DAILY_LOG_PAGE_TITLES = [
  "일반위생관리 및 공정점검표",
  "이물관리 점검표",
  "원재료실 온/습도 점검기록지",
  "급속냉동고 / 냉동고 온도 점검기록지",
  "원재료 냉장고 온도 점검 기록지",
];

// 위생시설/작업장 위생 점검표의 checklist 객체 키→라벨 매핑
export const CHECKLIST_LABEL_MAP: Record<string, string> = {
  location: '점검장소', toilet: '화장실청결', handwash: '손세척시설',
  locker: '탈의실', ventilation: '환기시설', screen: '방충망', drainage: '배수시설',
};

// ============================================================================
// 결재란 — 인쇄 (2026-10-15, 화면 결재란 ApprovalStampBox 와 같은 2줄 모양)
// 이전: 역할 줄(작 성/검 토/승 인) → 사각 도장(역할·이름·날짜) → 이름 줄 — 역할·이름이 세 번씩 나왔다.
// 지금: 역할은 위에 한 번, 직인은 원 안에 이름 + 짧은 날짜. 결재 전 칸은 예정자 이름 회색. 이름 줄 없음.
// ============================================================================
const PRINT_ROLES = [
  { key: "author", label: "작성" },
  { key: "reviewer", label: "검토" },
  { key: "approver", label: "승인" },
] as const;

type PrintStampInput = {
  authorName: string; reviewerName: string; approverName: string;
  requestedAt?: string; reviewedAt?: string; approvedAt?: string;
};

/** 칸별 결재 여부·날짜 — 작성: 이름 있으면 / 검토: 검토·승인 시각 있으면 / 승인: 승인 시각 있으면 (이전 규칙 그대로) */
export function printStampCells(i: PrintStampInput) {
  return {
    author: { name: i.authorName, done: !!i.authorName, date: i.requestedAt },
    reviewer: { name: i.reviewerName, done: !!i.reviewerName && !!(i.reviewedAt || i.approvedAt), date: i.reviewedAt || i.approvedAt },
    approver: { name: i.approverName, done: !!i.approverName && !!i.approvedAt, date: i.approvedAt },
  };
}

// ============================================================================
// 상단 결재란 컴포넌트 (독립 사용 시 - CCP 등)
// ============================================================================
export function ApprovalHeader({
  authorName, reviewerName, approverName,
  requestedAt, reviewedAt, approvedAt,
  compact = false,
}: {
  authorName: string; reviewerName: string; approverName: string;
  requestedAt?: string; reviewedAt?: string; approvedAt?: string;
  compact?: boolean;
}) {
  const cells = printStampCells({ authorName, reviewerName, approverName, requestedAt, reviewedAt, approvedAt });
  const cellHeight = compact ? "44px" : "52px";
  const colW = compact ? "48px" : "56px";
  const b = "border border-gray-600";
  return (
    <table className="border-collapse border border-gray-600 text-xs" data-testid="print-approval-header">
      <tbody>
        <tr className="bg-gray-50">
          <th rowSpan={2} className={`${b} px-0.5 text-center text-[9px] font-medium [writing-mode:vertical-rl]`} style={{ width: 18 }}>결재</th>
          {PRINT_ROLES.map((r) => <th key={r.key} className={`${b} px-1 py-0 font-medium text-[9px]`} style={{ width: colW }}>{r.label}</th>)}
        </tr>
        <tr>
          {PRINT_ROLES.map((r) => (
            <td key={r.key} className={`${b} px-0.5 py-0.5 text-center align-middle`} style={{ height: cellHeight }}>
              <StampCellContent {...cells[r.key]} />
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

// ============================================================================
// 제목 + 결재란 통합 컴포넌트 (모든 문서 공통)
// ┌──────────────────────────┬────┬────┬────┐
// │       문서 제목           │작성│검토│승인│
// │       (부제목)           ├────┼────┼────┤
// │                          │ 印 │ 印 │ 印 │
// ├──────────────────────────┴────┴────┴────┤
// │ 점검일자: ...  작성자: ...                │
// └──────────────────────────────────────────┘
// ============================================================================
export function TitleWithApproval({
  title, subtitle, doc, infoLeft
}: {
  title: string;
  subtitle?: string;
  doc?: any;
  /** 3번째 행 (점검일자, 작성자 등) - ReactNode */
  infoLeft?: React.ReactNode;
}) {
  const cells = printStampCells({
    authorName: doc?.authorName || "", reviewerName: doc?.reviewerName || "", approverName: doc?.approverName || "",
    requestedAt: doc?.formData?.date || doc?.requestedAt || "", reviewedAt: doc?.reviewedAt || "", approvedAt: doc?.approvedAt || "",
  });
  const b = "border border-gray-600";
  const colW = "50px";

  return (
    <table className="w-full border-collapse text-xs mb-0" style={{ borderBottom: "none" }} data-testid="print-title-approval">
      <tbody>
        {/* Row 1: 제목(rowspan=2) + 작성/검토/승인 라벨 */}
        <tr>
          <td rowSpan={2} className={`${b} text-center align-middle font-bold text-base`} style={{ padding: "8px 12px" }}>
            {title}
            {subtitle && <><br /><span className="text-sm font-normal text-gray-500">{subtitle}</span></>}
          </td>
          {PRINT_ROLES.map((r) => <td key={r.key} className={`${b} px-1 py-0 font-medium text-[9px] text-center bg-gray-50`} style={{ width: colW }}>{r.label}</td>)}
        </tr>
        {/* Row 2: 직인 */}
        <tr>
          {PRINT_ROLES.map((r) => (
            <td key={r.key} className={`${b} px-0.5 py-0.5 text-center align-middle`} style={{ height: "48px" }}>
              <StampCellContent {...cells[r.key]} />
            </td>
          ))}
        </tr>
        {/* Row 3: 정보행 (점검일자/작성자 등) — 이름 줄 없이 전체 폭 */}
        <tr className="bg-gray-50">
          <td colSpan={4} className={`${b} px-3 py-1 text-sm`}>
            {infoLeft || <span className="text-gray-400">-</span>}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

// ============================================================================
// 범용 행 테이블 렌더러
// ============================================================================
export function renderRowsTable(data: any, title: string, columns: {key: string; label: string}[]) {
  const rows = data?.rows || data?.data || data?.items || [];
  return (
    <div>
      <div className="text-center mb-4"><h2 className="text-xl font-bold">{title}</h2></div>
      <table className="w-full border-collapse border border-gray-400 text-sm">
        <thead><tr className="bg-blue-50">
          <th className="border border-gray-400 px-2 py-1">No.</th>
          {columns.map((c, i) => <th key={i} className="border border-gray-400 px-2 py-1">{c.label}</th>)}
        </tr></thead>
        <tbody>
          {rows.length > 0 ? rows.map((row: any, idx: number) => (
            <tr key={idx}>
              <td className="border border-gray-400 px-2 py-1 text-center">{idx + 1}</td>
              {columns.map((c, i) => (
                <td key={i} className="border border-gray-400 px-2 py-1 text-center">
                  {typeof row[c.key] === "boolean" ? (row[c.key] ? "✓" : "-") : (row[c.key] ?? "-")}
                </td>
              ))}
            </tr>
          )) : (<tr><td colSpan={columns.length + 1} className="border border-gray-400 px-2 py-4 text-center text-gray-400">기록 없음</td></tr>)}
        </tbody>
      </table>
    </div>
  );
}


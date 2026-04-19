/**
 * PrintHelpers.tsx
 * Shared constants, components, and utility render functions for print preview.
 */
import React from "react";
import { ApprovalSeal } from "@/components/SealGenerator";

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
  const sealSize = compact ? 30 : 42;
  const cellHeight = compact ? "36px" : "50px";
  const colW = compact ? "50px" : "60px";
  const b = "border border-gray-600";
  return (
    <table className="border-collapse border border-gray-600 text-xs">
      <thead>
        <tr className="bg-gray-50">
          <th className={`${b} px-1 py-0 font-medium text-[9px]`} style={{ width: colW }}>작 성</th>
          <th className={`${b} px-1 py-0 font-medium text-[9px]`} style={{ width: colW }}>검 토</th>
          <th className={`${b} px-1 py-0 font-medium text-[9px]`} style={{ width: colW }}>승 인</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td className={`${b} px-0.5 py-0.5 text-center align-middle`} style={{ height: cellHeight }}>
            {authorName ? <ApprovalSeal approverName={authorName} approvalDate={requestedAt} approvalType="작성" size={sealSize} /> : <div className="text-gray-300 text-[8px]">미작성</div>}
          </td>
          <td className={`${b} px-0.5 py-0.5 text-center align-middle`} style={{ height: cellHeight }}>
            {reviewerName && (reviewedAt || approvedAt) ? <ApprovalSeal approverName={reviewerName} approvalDate={reviewedAt || approvedAt} approvalType="검토" size={sealSize} /> : <div className="text-gray-300 text-[8px]">미검토</div>}
          </td>
          <td className={`${b} px-0.5 py-0.5 text-center align-middle`} style={{ height: cellHeight }}>
            {approverName && approvedAt ? <ApprovalSeal approverName={approverName} approvalDate={approvedAt} approvalType="승인" size={sealSize} /> : <div className="text-gray-300 text-[8px]">미승인</div>}
          </td>
        </tr>
        <tr className="bg-gray-50">
          <td className={`${b} px-0.5 py-0 text-center text-[8px] text-gray-600`}>{authorName || "-"}</td>
          <td className={`${b} px-0.5 py-0 text-center text-[8px] text-gray-600`}>{reviewerName || "-"}</td>
          <td className={`${b} px-0.5 py-0 text-center text-[8px] text-gray-600`}>{approverName || "-"}</td>
        </tr>
      </tbody>
    </table>
  );
}

// ============================================================================
// 제목 + 결재란 통합 컴포넌트 (모든 문서 공통)
// 하나의 테이블로 제목·결재란·정보행을 연결하여 빈틈 없이 렌더링
// ┌──────────────────────────┬────┬────┬────┐
// │       문서 제목           │작성│검토│승인│
// │       (부제목)           ├────┼────┼────┤
// │                          │ 印 │ 印 │ 印 │
// ├──────────────────────────┼────┼────┼────┤
// │ 점검일자: ... 작성자: ...│이름│이름│이름│
// └──────────────────────────┴────┴────┴────┘
// ============================================================================
export function TitleWithApproval({
  title, subtitle, doc, infoLeft
}: {
  title: string;
  subtitle?: string;
  doc?: any;
  /** 3번째 행 왼쪽 영역 (점검일자, 작성자 등) - ReactNode */
  infoLeft?: React.ReactNode;
}) {
  const authorName = doc?.authorName || "";
  const reviewerName = doc?.reviewerName || "";
  const approverName = doc?.approverName || "";
  const requestedAt = doc?.formData?.date || doc?.requestedAt || "";
  const reviewedAt = doc?.reviewedAt || "";
  const approvedAt = doc?.approvedAt || "";
  const b = "border border-gray-600";
  const colW = "50px";
  const sealSize = 30;

  return (
    <table className="w-full border-collapse text-xs mb-0" style={{ borderBottom: "none" }}>
      <tbody>
        {/* Row 1: 제목(rowspan=2) + 작성/검토/승인 라벨 */}
        <tr>
          <td
            rowSpan={2}
            className={`${b} text-center align-middle font-bold text-base`}
            style={{ padding: "8px 12px" }}
          >
            {title}
            {subtitle && <><br /><span className="text-sm font-normal text-gray-500">{subtitle}</span></>}
          </td>
          <td className={`${b} px-1 py-0 font-medium text-[9px] text-center bg-gray-50`} style={{ width: colW }}>작 성</td>
          <td className={`${b} px-1 py-0 font-medium text-[9px] text-center bg-gray-50`} style={{ width: colW }}>검 토</td>
          <td className={`${b} px-1 py-0 font-medium text-[9px] text-center bg-gray-50`} style={{ width: colW }}>승 인</td>
        </tr>
        {/* Row 2: 날인(직인) */}
        <tr>
          <td className={`${b} px-0.5 py-0.5 text-center align-middle`} style={{ height: "36px" }}>
            {authorName ? <ApprovalSeal approverName={authorName} approvalDate={requestedAt} approvalType="작성" size={sealSize} /> : <div className="text-gray-300 text-[8px]">미작성</div>}
          </td>
          <td className={`${b} px-0.5 py-0.5 text-center align-middle`} style={{ height: "36px" }}>
            {reviewerName && (reviewedAt || approvedAt) ? <ApprovalSeal approverName={reviewerName} approvalDate={reviewedAt || approvedAt} approvalType="검토" size={sealSize} /> : <div className="text-gray-300 text-[8px]">미검토</div>}
          </td>
          <td className={`${b} px-0.5 py-0.5 text-center align-middle`} style={{ height: "36px" }}>
            {approverName && approvedAt ? <ApprovalSeal approverName={approverName} approvalDate={approvedAt} approvalType="승인" size={sealSize} /> : <div className="text-gray-300 text-[8px]">미승인</div>}
          </td>
        </tr>
        {/* Row 3: 정보행 (점검일자/작성자 등) + 이름 */}
        <tr className="bg-gray-50">
          <td className={`${b} px-3 py-1 text-sm`}>
            {infoLeft || <span className="text-gray-400">-</span>}
          </td>
          <td className={`${b} px-0.5 py-0 text-center text-[8px] text-gray-600`}>{authorName || "-"}</td>
          <td className={`${b} px-0.5 py-0 text-center text-[8px] text-gray-600`}>{reviewerName || "-"}</td>
          <td className={`${b} px-0.5 py-0 text-center text-[8px] text-gray-600`}>{approverName || "-"}</td>
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


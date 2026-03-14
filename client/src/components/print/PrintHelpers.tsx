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
  employee_health_check: "종사자 건강상태 확인 일지",
  equipment_history: "설비 이력 관리",
  equipment_inspection: "설비 점검 기록",
  finished_product_check: "완제품 검사 기록",
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
// 상단 결재란 컴포넌트 (컴팩트 버전 - 인쇄 시 공간 절약)
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
  const minW = compact ? "150px" : "180px";
  const colW = compact ? "50px" : "60px";
  return (
    <table className="border-collapse border border-gray-600 text-xs" style={{ minWidth: minW }}>
      <thead>
        <tr>
          <th colSpan={3} className="border border-gray-600 px-1 py-0 bg-gray-100 text-center font-bold text-[10px]">결 재</th>
        </tr>
        <tr className="bg-gray-50">
          <th className={`border border-gray-600 px-1 py-0 font-medium text-[9px]`} style={{ width: colW }}>작 성</th>
          <th className={`border border-gray-600 px-1 py-0 font-medium text-[9px]`} style={{ width: colW }}>검 토</th>
          <th className={`border border-gray-600 px-1 py-0 font-medium text-[9px]`} style={{ width: colW }}>승 인</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td className="border border-gray-600 px-0.5 py-0.5 text-center align-middle" style={{ height: cellHeight }}>
            {authorName ? <ApprovalSeal approverName={authorName} approvalDate={requestedAt} approvalType="작성" size={sealSize} /> : <div className="text-gray-300 text-[8px]">미작성</div>}
          </td>
          <td className="border border-gray-600 px-0.5 py-0.5 text-center align-middle" style={{ height: cellHeight }}>
            {reviewerName && (reviewedAt || approvedAt) ? <ApprovalSeal approverName={reviewerName} approvalDate={reviewedAt || approvedAt} approvalType="검토" size={sealSize} /> : <div className="text-gray-300 text-[8px]">미검토</div>}
          </td>
          <td className="border border-gray-600 px-0.5 py-0.5 text-center align-middle" style={{ height: cellHeight }}>
            {approverName && approvedAt ? <ApprovalSeal approverName={approverName} approvalDate={approvedAt} approvalType="승인" size={sealSize} /> : <div className="text-gray-300 text-[8px]">미승인</div>}
          </td>
        </tr>
        <tr className="bg-gray-50">
          <td className="border border-gray-600 px-0.5 py-0 text-center text-[8px] text-gray-600">{authorName || "-"}</td>
          <td className="border border-gray-600 px-0.5 py-0 text-center text-[8px] text-gray-600">{reviewerName || "-"}</td>
          <td className="border border-gray-600 px-0.5 py-0 text-center text-[8px] text-gray-600">{approverName || "-"}</td>
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

// ============================================================================
// 범용 데이터 렌더러 (fallback)
// ============================================================================
export function renderGenericData(data: any, formType: string) {
  // Import these lazily to avoid circular deps - they are passed as callbacks
  // from renderFormContent. For the standalone usage, we inline the logic.
  if (!data) return <p className="text-gray-500">데이터 없음</p>;
  const title = FORM_TYPE_LABELS[formType] || formType;

  // spaceRows, employeeRows 등 특수 키도 rows로 통합 처리
  const genericRows = data.rows || data.spaceRows || data.employeeRows;
  if (genericRows && Array.isArray(genericRows) && genericRows.length > 0) {
    const keys = Object.keys(genericRows[0]).filter(k => k !== "id" && k !== "signature");
    return (
      <div>
        <div className="text-center mb-4"><h2 className="text-xl font-bold">{title}</h2></div>
        <table className="w-full border-collapse border border-gray-400 text-sm">
          <thead><tr className="bg-blue-50">
            <th className="border border-gray-400 px-2 py-1">No.</th>
            {keys.map((k, i) => <th key={i} className="border border-gray-400 px-2 py-1">{k}</th>)}
          </tr></thead>
          <tbody>
            {genericRows.map((row: any, idx: number) => (
              <tr key={idx}>
                <td className="border border-gray-400 px-2 py-1 text-center">{idx + 1}</td>
                {keys.map((k, i) => (
                  <td key={i} className="border border-gray-400 px-2 py-1 text-center">
                    {typeof row[k] === "boolean" ? (row[k] ? "✓" : "-") : row[k] instanceof Date ? row[k].toISOString().split("T")[0] : typeof row[k] === "object" ? JSON.stringify(row[k]) : (row[k] ?? "-")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (data.data && Array.isArray(data.data) && data.data.length > 0) {
    const keys = Object.keys(data.data[0]);
    return (
      <div>
        <div className="text-center mb-4"><h2 className="text-xl font-bold">{title}</h2></div>
        <table className="w-full border-collapse border border-gray-400 text-sm">
          <thead><tr className="bg-blue-50">
            <th className="border border-gray-400 px-2 py-1">No.</th>
            {keys.map((k, i) => <th key={i} className="border border-gray-400 px-2 py-1">{k}</th>)}
          </tr></thead>
          <tbody>
            {data.data.map((item: any, idx: number) => (
              <tr key={idx}>
                <td className="border border-gray-400 px-2 py-1 text-center">{idx + 1}</td>
                {keys.map((k, i) => (
                  <td key={i} className="border border-gray-400 px-2 py-1 text-center">
                    {typeof item[k] === "object" ? JSON.stringify(item[k]) : (item[k] ?? "-")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const skipKeys = ["id", "createdAt", "updatedAt", "organizationId", "formType", "status", "approval", "writer", "author", "approver"];
  const entries = Object.entries(data).filter(([key]) => !skipKeys.includes(key));
  if (entries.length > 0) {
    return (
      <div>
        <div className="text-center mb-4"><h2 className="text-xl font-bold">{title}</h2></div>
        <table className="w-full border-collapse border border-gray-400 text-sm">
          <tbody>
            {entries.map(([key, value], idx) => (
              <tr key={idx}>
                <td className="border border-gray-400 px-3 py-2 bg-gray-50 font-medium w-1/3">{key}</td>
                <td className="border border-gray-400 px-3 py-2">
                  {typeof value === "object" && value !== null
                    ? (Array.isArray(value) ? `${(value as any[]).length}건` : JSON.stringify(value, null, 2))
                    : String(value ?? "-")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return <p className="text-gray-500">데이터 없음</p>;
}

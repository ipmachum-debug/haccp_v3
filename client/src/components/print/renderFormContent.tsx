/**
 * renderFormContent.tsx
 * Main dispatcher that routes form types to their specific renderers.
 * Also contains renderGenericData (fallback renderer) which depends on
 * both PrintHelpers and ChecklistRenderers.
 */
import React from "react";
import { FORM_TYPE_LABELS, TitleWithApproval, renderRowsTable } from "./PrintHelpers";
import {
  renderEmployeeHealthCheck,
  renderAirCompressorMaintenance,
  renderEquipmentInspection,
  renderTemperatureHumidityCheck,
  renderAirborneBacteriaTest,
  renderTrainingLog,
} from "./DailyLogRenderers";
import {
  renderChecklistItems,
  renderPersonalHygieneCheck,
  renderProductTestReport,
} from "./ChecklistRenderers";
import {
  renderVisualInspectionLog,
  renderFinishedProductInspectionLog,
  renderMaterialUsageReport,
} from "./InspectionRenderers";

// ============================================================================
// 범용 데이터 렌더러 (fallback)
// ============================================================================
export function renderGenericData(data: any, formType: string, doc?: any) {
  if (!data) return <p className="text-gray-500">데이터 없음</p>;
  const title = FORM_TYPE_LABELS[formType] || formType;

  // spaceRows, employeeRows 등 특수 키도 rows로 통합 처리
  const genericRows = data.rows || data.spaceRows || data.employeeRows;
  if (genericRows && Array.isArray(genericRows) && genericRows.length > 0) {
    const keys = Object.keys(genericRows[0]).filter(k => k !== "id" && k !== "signature");
    return (
      <div>
        <TitleWithApproval title={title} doc={doc} />
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

  if (data.checklist || data.checklistItems || data.checkItems || data.items) return renderChecklistItems(data, title);
  if (data.employeeRows) return renderPersonalHygieneCheck(data);

  if (data.data && Array.isArray(data.data) && data.data.length > 0) {
    const keys = Object.keys(data.data[0]);
    return (
      <div>
        <TitleWithApproval title={title} doc={doc} />
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
        <TitleWithApproval title={title} doc={doc} />
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

// ============================================================================
// 생산일지 전용 렌더러
// ============================================================================
function renderProductionDaily(data: any, doc?: any) {
  const production = data?.production || {};
  const ccp = data?.ccp || {};
  const issues = data?.issues || [];
  const batches = production?.batches || [];
  const dateStr = data?.date || doc?.title?.replace("생산일지 - ", "") || "";

  return (
    <div className="space-y-4">
      <TitleWithApproval title={`생산일지 - ${dateStr}`} doc={doc} />

      {/* 생산 요약 */}
      <div>
        <h3 className="text-sm font-bold mb-1 border-b border-gray-300 pb-1">생산 요약</h3>
        <table className="w-full border-collapse border border-gray-400 text-xs">
          <tbody>
            <tr>
              <td className="border border-gray-400 px-2 py-1 bg-gray-50 font-medium w-1/4">생산일자</td>
              <td className="border border-gray-400 px-2 py-1">{dateStr}</td>
              <td className="border border-gray-400 px-2 py-1 bg-gray-50 font-medium w-1/4">총 배치 수</td>
              <td className="border border-gray-400 px-2 py-1">{production.totalBatches || 0}건 (완료: {production.completedBatches || 0}건)</td>
            </tr>
            <tr>
              <td className="border border-gray-400 px-2 py-1 bg-gray-50 font-medium">계획 생산량</td>
              <td className="border border-gray-400 px-2 py-1">{(production.totalPlannedQty || 0).toFixed(1)} kg</td>
              <td className="border border-gray-400 px-2 py-1 bg-gray-50 font-medium">실 생산량</td>
              <td className="border border-gray-400 px-2 py-1">{(production.totalActualQty || 0).toFixed(1)} kg</td>
            </tr>
            <tr>
              <td className="border border-gray-400 px-2 py-1 bg-gray-50 font-medium">달성률</td>
              <td className="border border-gray-400 px-2 py-1">{production.achievementRate || 0}%</td>
              <td className="border border-gray-400 px-2 py-1 bg-gray-50 font-medium">CCP 적합률</td>
              <td className="border border-gray-400 px-2 py-1">{ccp.complianceRate || "100.0"}% ({ccp.totalRecords || 0}건 중 이탈 {ccp.deviationCount || 0}건)</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 배치별 상세 */}
      {batches.length > 0 && (
        <div>
          <h3 className="text-sm font-bold mb-1 border-b border-gray-300 pb-1">배치별 생산 실적</h3>
          <table className="w-full border-collapse border border-gray-400 text-xs">
            <thead>
              <tr className="bg-blue-50">
                <th className="border border-gray-400 px-1 py-1">No</th>
                <th className="border border-gray-400 px-1 py-1">배치코드</th>
                <th className="border border-gray-400 px-1 py-1">제품명</th>
                <th className="border border-gray-400 px-1 py-1">계획량(kg)</th>
                <th className="border border-gray-400 px-1 py-1">실생산량(kg)</th>
                <th className="border border-gray-400 px-1 py-1">상태</th>
                <th className="border border-gray-400 px-1 py-1">시작</th>
                <th className="border border-gray-400 px-1 py-1">종료</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b: any, idx: number) => (
                <tr key={idx}>
                  <td className="border border-gray-400 px-1 py-1 text-center">{idx + 1}</td>
                  <td className="border border-gray-400 px-1 py-1">{b.batchCode || "-"}</td>
                  <td className="border border-gray-400 px-1 py-1">{b.productName || "-"}</td>
                  <td className="border border-gray-400 px-1 py-1 text-right">{(b.plannedQuantity || 0).toFixed(1)}</td>
                  <td className="border border-gray-400 px-1 py-1 text-right">{(b.actualQuantity || 0).toFixed(1)}</td>
                  <td className="border border-gray-400 px-1 py-1 text-center">
                    {b.status === "completed" ? "완료" : b.status === "in_progress" ? "진행중" : b.status || "-"}
                  </td>
                  <td className="border border-gray-400 px-1 py-1 text-center">{b.startTime ? b.startTime.split(" ").pop()?.substring(0, 5) : "-"}</td>
                  <td className="border border-gray-400 px-1 py-1 text-center">{b.endTime ? b.endTime.split(" ").pop()?.substring(0, 5) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* CCP 이탈 이슈 */}
      {issues.length > 0 && (
        <div>
          <h3 className="text-sm font-bold mb-1 border-b border-gray-300 pb-1">CCP 이탈 사항</h3>
          <table className="w-full border-collapse border border-gray-400 text-xs">
            <thead>
              <tr className="bg-red-50">
                <th className="border border-gray-400 px-1 py-1">배치코드</th>
                <th className="border border-gray-400 px-1 py-1">제품명</th>
                <th className="border border-gray-400 px-1 py-1">CCP유형</th>
                <th className="border border-gray-400 px-1 py-1">결과</th>
                <th className="border border-gray-400 px-1 py-1">비고</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((i: any, idx: number) => (
                <tr key={idx}>
                  <td className="border border-gray-400 px-1 py-1">{i.batchCode || "-"}</td>
                  <td className="border border-gray-400 px-1 py-1">{i.productName || "-"}</td>
                  <td className="border border-gray-400 px-1 py-1">{i.ccpType || "-"}</td>
                  <td className="border border-gray-400 px-1 py-1 text-center font-bold text-red-600">{i.result || "-"}</td>
                  <td className="border border-gray-400 px-1 py-1">{i.note || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {issues.length === 0 && (
        <p className="text-xs text-green-700">CCP 이탈 사항 없음</p>
      )}
    </div>
  );
}

// ============================================================================
// 폼 타입별 렌더링 디스패처 (daily_log / batch_production 제외 - 별도 처리)
// ============================================================================
export function renderFormContent(data: any, formType: string, doc?: any) {
  if (!data) return <p className="text-gray-500">데이터 없음</p>;
  switch (formType) {
    case "production_daily": return renderProductionDaily(data, doc);
    case "employee_health_check": return renderEmployeeHealthCheck(data);
    case "air_compressor_maintenance": return renderAirCompressorMaintenance(data);
    case "equipment_inspection": return renderEquipmentInspection(data);
    case "temperature_humidity_check": return renderTemperatureHumidityCheck(data);
    case "airborne_bacteria_test": return renderAirborneBacteriaTest(data);
    case "training_log": return renderTrainingLog(data);
    case "workplace_hygiene_check": return renderChecklistItems(data, "작업장 위생 점검표", doc);
    case "hygiene_facility_check": return renderChecklistItems(data, "위생시설 점검표", doc);
    case "personal_hygiene_check": return renderPersonalHygieneCheck(data, doc);
    case "cleaning_disinfection": return renderChecklistItems(data, "세척소독 관리대장", doc);
    case "vehicle_temperature_check": return renderRowsTable(data, "차량 온도 점검표", [{key:"vehicleNo",label:"차량번호"},{key:"temperature",label:"온도(℃)"},{key:"standard",label:"기준"},{key:"result",label:"판정"},{key:"note",label:"비고"}]);
    case "weight_quality_check": return renderRowsTable(data, "중량 품질 검사", [{key:"productName",label:"제품명"},{key:"standard",label:"기준중량"},{key:"measured",label:"실측중량"},{key:"result",label:"판정"},{key:"note",label:"비고"}]);
    case "surface_contamination_test": return renderRowsTable(data, "표면오염도 검사 성적서", [{key:"item",label:"검사항목"},{key:"location",label:"검사장소"},{key:"method",label:"검사방법"},{key:"result",label:"결과"},{key:"criteria",label:"기준"},{key:"judgment",label:"판정"}]);
    case "water_management_check": return renderChecklistItems(data, "용수관리 점검표", doc);
    case "illumination_check": return renderRowsTable(data, "조도 점검표", [{key:"location",label:"측정장소"},{key:"standard",label:"기준"},{key:"measurement",label:"측정값"},{key:"result",label:"판정"},{key:"remarks",label:"비고"}]);
    case "waste_management": return renderRowsTable(data, "폐기물 관리 기록", [{key:"date",label:"일자"},{key:"type",label:"폐기물종류"},{key:"amount",label:"수량"},{key:"method",label:"처리방법"},{key:"handler",label:"처리자"}]);
    case "pest_control_checklist": return renderRowsTable(data, "방충·방서 점검표", [{key:"location",label:"설치장소"},{key:"deviceType",label:"장치유형"},{key:"captureCount",label:"포획수"},{key:"notes",label:"비고"}]);
    case "product_test_report": return renderProductTestReport(data, doc);
    case "visual_inspection": return renderVisualInspectionLog(data, doc);
    case "finished_product_inspection": return renderFinishedProductInspectionLog(data, doc);
    case "material_usage_report": return renderMaterialUsageReport(data, doc);
    default: return renderGenericData(data, formType, doc);
  }
}

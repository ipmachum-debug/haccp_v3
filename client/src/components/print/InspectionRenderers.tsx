/**
 * 검사일지 인쇄 렌더러
 * - visual_inspection (원재료 육안검사일지)
 * - finished_product_inspection (완제품 출고검사일지)
 * - material_usage_report (원료수불 보고서)
 */
import React from "react";
import { TitleWithApproval } from "./PrintHelpers";

// ============================================================================
// 원재료 육안검사일지
// ============================================================================
export function renderVisualInspectionLog(data: any, doc?: any) {
  if (!data) return <p className="text-gray-500">데이터 없음</p>;
  const items = data.items || [];
  const title = `${data.logYear || ""}년 ${data.logMonth || ""}월 원재료 육안검사일지`;

  return (
    <div>
      <TitleWithApproval title={title} doc={doc} />
      <div className="text-xs text-gray-500 mb-2">총 {items.length}건</div>
      <table className="w-full border-collapse border border-gray-500 text-[10px]">
        <thead>
          <tr className="bg-blue-50">
            <th className="border border-gray-500 px-1 py-1 w-8">No.</th>
            <th className="border border-gray-500 px-1 py-1">입고일자</th>
            <th className="border border-gray-500 px-1 py-1">원재료명</th>
            <th className="border border-gray-500 px-1 py-1">수입증명서/원산지</th>
            <th className="border border-gray-500 px-1 py-1">시험성적서</th>
            <th className="border border-gray-500 px-1 py-1">유통기한</th>
            <th className="border border-gray-500 px-1 py-1">제조일</th>
            <th className="border border-gray-500 px-1 py-1">차량온도</th>
            <th className="border border-gray-500 px-1 py-1">차량상태</th>
            <th className="border border-gray-500 px-1 py-1">팔레트</th>
            <th className="border border-gray-500 px-1 py-1">정상승인</th>
            <th className="border border-gray-500 px-1 py-1">이물질</th>
            <th className="border border-gray-500 px-1 py-1">알레르겐</th>
            <th className="border border-gray-500 px-1 py-1">관리표시</th>
            <th className="border border-gray-500 px-1 py-1">판정</th>
            <th className="border border-gray-500 px-1 py-1">조치</th>
            <th className="border border-gray-500 px-1 py-1">비고</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={17} className="border border-gray-500 px-2 py-4 text-center text-gray-400">
                등록된 검사 항목이 없습니다.
              </td>
            </tr>
          ) : (
            items.map((it: any, i: number) => (
              <tr key={i} className={i % 2 === 0 ? "" : "bg-gray-50"}>
                <td className="border border-gray-500 px-1 py-0.5 text-center">{i + 1}</td>
                <td className="border border-gray-500 px-1 py-0.5 text-center">{it.receiptDate || "-"}</td>
                <td className="border border-gray-500 px-1 py-0.5">{it.productName || "-"}</td>
                <td className="border border-gray-500 px-1 py-0.5 text-center">{it.importCertOrigin || "-"}</td>
                <td className="border border-gray-500 px-1 py-0.5 text-center">{it.testReportAvail || "-"}</td>
                <td className="border border-gray-500 px-1 py-0.5 text-center">{it.expiryDate || "-"}</td>
                <td className="border border-gray-500 px-1 py-0.5 text-center">{it.manufactureDate || "-"}</td>
                <td className="border border-gray-500 px-1 py-0.5 text-center">{it.vehicleTemp || "-"}</td>
                <td className="border border-gray-500 px-1 py-0.5 text-center">{it.vehicleCondition || "-"}</td>
                <td className="border border-gray-500 px-1 py-0.5 text-center">{it.palletCondition || "-"}</td>
                <td className="border border-gray-500 px-1 py-0.5 text-center">{it.normalApproved || "-"}</td>
                <td className="border border-gray-500 px-1 py-0.5 text-center">{it.foreignMatter || "-"}</td>
                <td className="border border-gray-500 px-1 py-0.5 text-center">{it.labelAllergen || "-"}</td>
                <td className="border border-gray-500 px-1 py-0.5 text-center">{it.labelManager || "-"}</td>
                <td className="border border-gray-500 px-1 py-0.5 text-center font-semibold">
                  {it.compliance || "적합"}
                </td>
                <td className="border border-gray-500 px-1 py-0.5">{it.correctiveAction || ""}</td>
                <td className="border border-gray-500 px-1 py-0.5">{it.note || ""}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// 완제품 출고검사일지
// ============================================================================
export function renderFinishedProductInspectionLog(data: any, doc?: any) {
  if (!data) return <p className="text-gray-500">데이터 없음</p>;
  const items = data.items || [];
  const title = `${data.logYear || ""}년 ${data.logMonth || ""}월 완제품 출고검사일지`;

  return (
    <div>
      <TitleWithApproval title={title} doc={doc} />
      <div className="text-xs text-gray-500 mb-2">총 {items.length}건</div>
      <table className="w-full border-collapse border border-gray-500 text-[11px]">
        <thead>
          <tr className="bg-green-50">
            <th className="border border-gray-500 px-1 py-1 w-8">No.</th>
            <th className="border border-gray-500 px-1 py-1">출고일자</th>
            <th className="border border-gray-500 px-1 py-1">제품명</th>
            <th className="border border-gray-500 px-1 py-1">LOT 번호</th>
            <th className="border border-gray-500 px-1 py-1">수량</th>
            <th className="border border-gray-500 px-1 py-1">포장상태</th>
            <th className="border border-gray-500 px-1 py-1">라벨상태</th>
            <th className="border border-gray-500 px-1 py-1">출고방법</th>
            <th className="border border-gray-500 px-1 py-1">온도</th>
            <th className="border border-gray-500 px-1 py-1">아이스박스</th>
            <th className="border border-gray-500 px-1 py-1">판정</th>
            <th className="border border-gray-500 px-1 py-1">조치</th>
            <th className="border border-gray-500 px-1 py-1">비고</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={13} className="border border-gray-500 px-2 py-4 text-center text-gray-400">
                등록된 출고검사 항목이 없습니다.
              </td>
            </tr>
          ) : (
            items.map((it: any, i: number) => (
              <tr key={i} className={i % 2 === 0 ? "" : "bg-gray-50"}>
                <td className="border border-gray-500 px-1 py-0.5 text-center">{i + 1}</td>
                <td className="border border-gray-500 px-1 py-0.5 text-center">{it.shipDate || "-"}</td>
                <td className="border border-gray-500 px-1 py-0.5">{it.productName || "-"}</td>
                <td className="border border-gray-500 px-1 py-0.5 text-center">{it.lotNumber || "-"}</td>
                <td className="border border-gray-500 px-1 py-0.5 text-right">{it.quantity || "-"}</td>
                <td className="border border-gray-500 px-1 py-0.5 text-center">{it.packagingStatus || "○"}</td>
                <td className="border border-gray-500 px-1 py-0.5 text-center">{it.labelStatus || "○"}</td>
                <td className="border border-gray-500 px-1 py-0.5 text-center">{it.shipMethod || "-"}</td>
                <td className="border border-gray-500 px-1 py-0.5 text-center">{it.temperature || "-"}</td>
                <td className="border border-gray-500 px-1 py-0.5 text-center">{it.iceBoxStatus || "○"}</td>
                <td className="border border-gray-500 px-1 py-0.5 text-center font-semibold">
                  {it.result || "적합"}
                </td>
                <td className="border border-gray-500 px-1 py-0.5">{it.correctiveAction || ""}</td>
                <td className="border border-gray-500 px-1 py-0.5">{it.note || ""}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// 원료수불 보고서 (저장된 스냅샷)
// ============================================================================
export function renderMaterialUsageReport(data: any, doc?: any) {
  if (!data) return <p className="text-gray-500">데이터 없음</p>;
  const body = data.body || data;
  const summary = body.summary || {};
  const title = data.title || body.period?.label || "원료수불 보고서";

  const productions = body.productions || [];
  const materialTotal = body.materialWeeklyTotal || [];

  return (
    <div>
      <TitleWithApproval title={title} doc={doc} />

      {/* 요약 */}
      <table className="w-full border-collapse border border-gray-500 text-xs mb-3">
        <thead>
          <tr className="bg-orange-50">
            <th className="border border-gray-500 px-2 py-1">구분</th>
            <th className="border border-gray-500 px-2 py-1">수량 (kg)</th>
            <th className="border border-gray-500 px-2 py-1">종</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border border-gray-500 px-2 py-1 font-medium">생산량</td>
            <td className="border border-gray-500 px-2 py-1 text-right">
              {Number(summary.productionKg || 0).toLocaleString()}
            </td>
            <td className="border border-gray-500 px-2 py-1 text-center">
              {summary.productionKinds || 0}
            </td>
          </tr>
          <tr>
            <td className="border border-gray-500 px-2 py-1 font-medium">판매출고</td>
            <td className="border border-gray-500 px-2 py-1 text-right">
              {Number(summary.salesKg || 0).toLocaleString()}
            </td>
            <td className="border border-gray-500 px-2 py-1 text-center">
              {summary.salesKinds || 0}
            </td>
          </tr>
          <tr>
            <td className="border border-gray-500 px-2 py-1 font-medium">재료입고</td>
            <td className="border border-gray-500 px-2 py-1 text-right">
              {Number(summary.receivingKg || 0).toLocaleString()}
            </td>
            <td className="border border-gray-500 px-2 py-1 text-center">
              {summary.receivingKinds || 0}
            </td>
          </tr>
        </tbody>
      </table>

      {/* 생산 실적 */}
      {productions.length > 0 && (
        <>
          <h4 className="font-semibold text-sm mt-4 mb-1">▶ 생산 실적</h4>
          <table className="w-full border-collapse border border-gray-500 text-[11px] mb-3">
            <thead>
              <tr className="bg-cyan-50">
                <th className="border border-gray-500 px-2 py-1 w-8">No.</th>
                <th className="border border-gray-500 px-2 py-1">날짜</th>
                <th className="border border-gray-500 px-2 py-1">제품명</th>
                <th className="border border-gray-500 px-2 py-1">품목제조번호</th>
                <th className="border border-gray-500 px-2 py-1">생산량(kg)</th>
              </tr>
            </thead>
            <tbody>
              {productions.map((p: any, i: number) => (
                <tr key={i}>
                  <td className="border border-gray-500 px-2 py-1 text-center">{i + 1}</td>
                  <td className="border border-gray-500 px-2 py-1 text-center">{p.date}</td>
                  <td className="border border-gray-500 px-2 py-1">{p.productName}</td>
                  <td className="border border-gray-500 px-2 py-1 text-center">{p.productCode || "-"}</td>
                  <td className="border border-gray-500 px-2 py-1 text-right">
                    {Number(p.quantity || 0).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* 원재료 합계 */}
      {materialTotal.length > 0 && (
        <>
          <h4 className="font-semibold text-sm mt-4 mb-1">▶ 원재료 사용 합계</h4>
          <table className="w-full border-collapse border border-gray-500 text-[11px]">
            <thead>
              <tr className="bg-amber-50">
                <th className="border border-gray-500 px-2 py-1 w-8">No.</th>
                <th className="border border-gray-500 px-2 py-1">원재료명</th>
                <th className="border border-gray-500 px-2 py-1">총 사용량(kg)</th>
              </tr>
            </thead>
            <tbody>
              {materialTotal.map((m: any, i: number) => (
                <tr key={i}>
                  <td className="border border-gray-500 px-2 py-1 text-center">{i + 1}</td>
                  <td className="border border-gray-500 px-2 py-1">{m.materialName}</td>
                  <td className="border border-gray-500 px-2 py-1 text-right">
                    {Number(m.totalQuantity || 0).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

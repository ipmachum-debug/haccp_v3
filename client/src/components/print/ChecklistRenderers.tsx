/**
 * ChecklistRenderers.tsx
 * Render functions for checklist-type forms:
 * - renderChecklistItems (generic checklist with sections support)
 * - renderWaterManagementCheck
 * - renderPersonalHygieneCheck
 * - renderProductTestReport
 */
import React from "react";
import { CHECKLIST_LABEL_MAP, TitleWithApproval } from "./PrintHelpers";

// ============================================================================
// 체크리스트 항목 렌더러 (범용)
// ============================================================================
export function renderChecklistItems(data: any, title: string, doc?: any) {
  const rawChecklist = data?.checklist || data?.checklistItems || data?.checkItems || data?.items || data?.data || [];
  const sections = data?.sections || [];

  // checklist가 객체(key-value)인 경우 배열로 변환 (위생시설/작업장 위생 점검표 패턴)
  if (rawChecklist && typeof rawChecklist === 'object' && !Array.isArray(rawChecklist)) {
    const entries = Object.entries(rawChecklist);
    if (entries.length > 0) {
      return (
        <div>
          <TitleWithApproval title={title} doc={doc} />
          <table className="w-full border-collapse border border-gray-400 text-sm">
            <thead><tr className="bg-blue-50">
              <th className="border border-gray-400 px-2 py-1 w-10">No.</th>
              <th className="border border-gray-400 px-2 py-1">점검항목</th>
              <th className="border border-gray-400 px-2 py-1 w-16">결과</th>
              <th className="border border-gray-400 px-2 py-1 w-24">비고</th>
            </tr></thead>
            <tbody>
              {entries.map(([key, value], idx) => (
                <tr key={idx}>
                  <td className="border border-gray-400 px-2 py-1 text-center">{idx + 1}</td>
                  <td className="border border-gray-400 px-2 py-1">{CHECKLIST_LABEL_MAP[key] || key}</td>
                  <td className="border border-gray-400 px-2 py-1 text-center">{value === '적합' ? '✓ 적합' : value === '부적합' ? '✗ 부적합' : String(value || '-')}</td>
                  <td className="border border-gray-400 px-2 py-1">-</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(data.notes || data.actions) && (
            <div className="mt-2 text-sm">
              {data.notes && <p><strong>특이사항:</strong> {data.notes}</p>}
              {data.actions && <p><strong>개선조치:</strong> {data.actions}</p>}
            </div>
          )}
        </div>
      );
    }
  }

  const checklist = Array.isArray(rawChecklist) ? rawChecklist : [];

  // checkItems 배열 패턴 (용수관리 점검표: {category, subCategory, question, result})
  if (checklist.length > 0 && checklist[0]?.question) {
    return renderWaterManagementCheck(data, title, checklist);
  }

  if (sections.length > 0) {
    return (
      <div>
        <TitleWithApproval title={title} doc={doc} />
        {sections.map((s: any, sIdx: number) => (
          <div key={sIdx} className="mb-3">
            <h3 className="font-bold text-sm mb-1 bg-gray-100 px-2 py-1">{s.title || s.name}</h3>
            <table className="w-full border-collapse border border-gray-400 text-sm">
              <thead><tr className="bg-blue-50">
                <th className="border border-gray-400 px-2 py-1 w-10">No.</th>
                <th className="border border-gray-400 px-2 py-1">점검항목</th>
                <th className="border border-gray-400 px-2 py-1 w-16">결과</th>
                <th className="border border-gray-400 px-2 py-1 w-24">비고</th>
              </tr></thead>
              <tbody>
                {(s.items || []).map((item: any, idx: number) => (
                  <tr key={idx}>
                    <td className="border border-gray-400 px-2 py-1 text-center">{idx + 1}</td>
                    <td className="border border-gray-400 px-2 py-1">{item.text || item.label || item.name || "-"}</td>
                    <td className="border border-gray-400 px-2 py-1 text-center">{item.checked ? "✓ 적합" : (item.result || "-")}</td>
                    <td className="border border-gray-400 px-2 py-1">{item.note || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div>
      <TitleWithApproval title={title} doc={doc} />
      <table className="w-full border-collapse border border-gray-400 text-sm">
        <thead><tr className="bg-blue-50">
          <th className="border border-gray-400 px-2 py-1 w-10">No.</th>
          <th className="border border-gray-400 px-2 py-1">점검항목</th>
          <th className="border border-gray-400 px-2 py-1 w-16">결과</th>
          <th className="border border-gray-400 px-2 py-1 w-24">비고</th>
        </tr></thead>
        <tbody>
          {checklist.length > 0 ? checklist.map((item: any, idx: number) => (
            <tr key={idx}>
              <td className="border border-gray-400 px-2 py-1 text-center">{idx + 1}</td>
              <td className="border border-gray-400 px-2 py-1">{typeof item === "string" ? item : (item.text || item.label || item.name || item.item || "-")}</td>
              <td className="border border-gray-400 px-2 py-1 text-center">{item.checked !== undefined ? (item.checked ? "✓ 적합" : "✗ 부적합") : (item.value || item.result || "-")}</td>
              <td className="border border-gray-400 px-2 py-1">{item.note || item.remarks || "-"}</td>
            </tr>
          )) : (<tr><td colSpan={4} className="border border-gray-400 px-2 py-4 text-center text-gray-400">기록 없음</td></tr>)}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// 용수관리 점검표 전용 렌더러 (checkItems: {category, subCategory, question, result})
// ============================================================================
export function renderWaterManagementCheck(data: any, title: string, checkItems: any[]) {
  // 카테고리별 그룹핑
  const groups: Record<string, any[]> = {};
  checkItems.forEach((item: any) => {
    const key = item.category || '기타';
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  });
  return (
    <div>
      <TitleWithApproval title={title} doc={doc} infoLeft={data.checkDate ? <><span className="font-medium">점검일:</span> {data.checkDate} &nbsp;&nbsp; <span className="font-medium">점검주기:</span> {data.checkCycle || '-'} &nbsp;&nbsp; <span className="font-medium">점검자:</span> {doc?.authorName || data.inspector || '-'}</> : undefined} />
      <table className="w-full border-collapse border border-gray-400 text-sm">
        <thead><tr className="bg-blue-50">
          <th className="border border-gray-400 px-2 py-1 w-10">No.</th>
          <th className="border border-gray-400 px-2 py-1 w-24">구분</th>
          <th className="border border-gray-400 px-2 py-1 w-20">세부</th>
          <th className="border border-gray-400 px-2 py-1">점검항목</th>
          <th className="border border-gray-400 px-2 py-1 w-16">결과</th>
        </tr></thead>
        <tbody>
          {checkItems.map((item: any, idx: number) => (
            <tr key={idx}>
              <td className="border border-gray-400 px-2 py-1 text-center">{idx + 1}</td>
              <td className="border border-gray-400 px-2 py-1 text-center">{item.category || '-'}</td>
              <td className="border border-gray-400 px-2 py-1 text-center">{item.subCategory || '-'}</td>
              <td className="border border-gray-400 px-2 py-1">{item.question || item.text || '-'}</td>
              <td className="border border-gray-400 px-2 py-1 text-center">{item.result === 'good' ? '✓ 적합' : item.result === 'bad' ? '✗ 부적합' : (item.result || '-')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.deviations && Array.isArray(data.deviations) && data.deviations.length > 0 && (
        <div className="mt-3">
          <h3 className="font-bold text-sm mb-1">일탈/부적합 사항</h3>
          <table className="w-full border-collapse border border-gray-400 text-sm">
            <thead><tr className="bg-yellow-50">
              <th className="border border-gray-400 px-2 py-1">일자</th>
              <th className="border border-gray-400 px-2 py-1">장소</th>
              <th className="border border-gray-400 px-2 py-1">내용</th>
              <th className="border border-gray-400 px-2 py-1">조치</th>
              <th className="border border-gray-400 px-2 py-1">조치자</th>
            </tr></thead>
            <tbody>
              {data.deviations.map((d: any, idx: number) => (
                <tr key={idx}>
                  <td className="border border-gray-400 px-2 py-1">{d.date || '-'}</td>
                  <td className="border border-gray-400 px-2 py-1">{d.location || '-'}</td>
                  <td className="border border-gray-400 px-2 py-1">{d.detail || '-'}</td>
                  <td className="border border-gray-400 px-2 py-1">{d.action || '-'}</td>
                  <td className="border border-gray-400 px-2 py-1">{d.actionBy || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 개인위생 점검표 전용 렌더러 (employeeRows + checkColumns 구조)
// ============================================================================
export function renderPersonalHygieneCheck(data: any, doc?: any) {
  const employeeRows = data?.employeeRows || [];
  const checkColumns = data?.checkColumns || [
    { id: 'health', label: '건강상태' },
    { id: 'uniform', label: '위생복,위생모,위생화' },
    { id: 'belongings', label: '개인 소지품' },
    { id: 'workerHygiene', label: '작업자 위생상태' },
    { id: 'hygieneRoom', label: '위생전실 절차' },
    { id: 'handWash', label: '손세척, 소독' },
  ];
  const filledRows = employeeRows.filter((r: any) => r.name && r.name.trim() !== '');
  return (
    <div>
      <TitleWithApproval title="개인 위생관리 점검표" doc={doc} infoLeft={data.checkDate ? <><span className="font-medium">점검일:</span> {data.checkDate} &nbsp;&nbsp; <span className="font-medium">점검자:</span> {doc?.authorName || data.inspector || '-'}</> : undefined} />
      <table className="w-full border-collapse border border-gray-400 text-sm">
        <thead><tr className="bg-blue-50">
          <th className="border border-gray-400 px-2 py-1 w-10">No.</th>
          <th className="border border-gray-400 px-2 py-1 w-20">성명</th>
          {checkColumns.map((col: any, i: number) => (
            <th key={i} className="border border-gray-400 px-1 py-1 text-xs">
              {col.label}{col.subLabel ? <br/> : null}{col.subLabel || ''}
            </th>
          ))}
        </tr></thead>
        <tbody>
          {filledRows.length > 0 ? filledRows.map((row: any, idx: number) => (
            <tr key={idx}>
              <td className="border border-gray-400 px-2 py-1 text-center">{idx + 1}</td>
              <td className="border border-gray-400 px-2 py-1 text-center">{row.name}</td>
              {checkColumns.map((col: any, i: number) => (
                <td key={i} className="border border-gray-400 px-1 py-1 text-center text-xs">
                  {row.checks?.[col.id] === '적합' ? '✓' : row.checks?.[col.id] === '부적합' ? '✗' : (row.checks?.[col.id] || '-')}
                </td>
              ))}
            </tr>
          )) : (<tr><td colSpan={2 + checkColumns.length} className="border border-gray-400 px-2 py-4 text-center text-gray-400">기록 없음</td></tr>)}
        </tbody>
      </table>
      {(data.specialNotes || data.improvementAction) && (
        <div className="mt-2 text-sm">
          {data.specialNotes && <p><strong>특이사항:</strong> {data.specialNotes}</p>}
          {data.improvementAction && <p><strong>개선조치:</strong> {data.improvementAction}</p>}
          {data.actionBy && <p><strong>조치자:</strong> {data.actionBy}</p>}
          {data.confirmedBy && <p><strong>확인자:</strong> {data.confirmedBy}</p>}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 제품검사 성적서
// ============================================================================
export function renderProductTestReport(data: any, doc?: any) {
  const items = data?.items || data?.rows || data?.data || [];
  const productName = data?.productName || "";
  const lotNo = data?.lotNo || "";
  const formDate = data?.formDate || "";
  const confirmer = data?.confirmer || "";
  const notes = data?.notes || "";
  const correctiveAction = data?.correctiveAction || "";
  return (
    <div>
      <TitleWithApproval title="제품검사 성적서" doc={doc} />
      {(productName || lotNo || formDate) && (
        <table className="w-full border-collapse border border-gray-400 text-sm mb-4">
          <tbody>
            {productName && <tr><td className="border border-gray-400 px-3 py-2 bg-gray-50 font-medium w-1/4">제품명</td><td className="border border-gray-400 px-3 py-2">{productName}</td></tr>}
            {lotNo && <tr><td className="border border-gray-400 px-3 py-2 bg-gray-50 font-medium">LOT No.</td><td className="border border-gray-400 px-3 py-2">{lotNo}</td></tr>}
            {formDate && <tr><td className="border border-gray-400 px-3 py-2 bg-gray-50 font-medium">검사일</td><td className="border border-gray-400 px-3 py-2">{formDate}</td></tr>}
            {confirmer && <tr><td className="border border-gray-400 px-3 py-2 bg-gray-50 font-medium">확인자</td><td className="border border-gray-400 px-3 py-2">{confirmer}</td></tr>}
          </tbody>
        </table>
      )}
      <table className="w-full border-collapse border border-gray-400 text-sm">
        <thead><tr className="bg-blue-50">
          <th className="border border-gray-400 px-2 py-1">No.</th>
          <th className="border border-gray-400 px-2 py-1">검사항목</th>
          <th className="border border-gray-400 px-2 py-1">기준</th>
          <th className="border border-gray-400 px-2 py-1">결과</th>
        </tr></thead>
        <tbody>
          {items.length > 0 ? items.map((item: any, idx: number) => (
            <tr key={idx}>
              <td className="border border-gray-400 px-2 py-1 text-center">{idx + 1}</td>
              <td className="border border-gray-400 px-2 py-1">{item.item || item.name || "-"}</td>
              <td className="border border-gray-400 px-2 py-1 text-center">{item.standard || item.criteria || "-"}</td>
              <td className="border border-gray-400 px-2 py-1 text-center">{item.result || item.judgment || "-"}</td>
            </tr>
          )) : (<tr><td colSpan={4} className="border border-gray-400 px-2 py-4 text-center text-gray-400">기록 없음</td></tr>)}
        </tbody>
      </table>
      {(notes || correctiveAction) && (
        <div className="mt-4 text-sm">
          {notes && <div className="mb-2"><span className="font-medium">비고: </span>{notes}</div>}
          {correctiveAction && <div><span className="font-medium">시정조치: </span>{correctiveAction}</div>}
        </div>
      )}
    </div>
  );
}

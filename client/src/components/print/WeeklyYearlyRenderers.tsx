/**
 * WeeklyYearlyRenderers.tsx
 * Render functions for weekly_log and yearly_log print preview
 */
import React from "react";
import { TitleWithApproval } from "./PrintHelpers";

// ============================================================================
// 주간일지 전용 렌더러 (2페이지: 위생관리 + 방충방서)
// ============================================================================

export function renderWeeklyLogPages(data: any, doc?: any): React.ReactNode[] {
  const d = data || {};
  const date = d.date || "";
  const checkerName = d.checkerName || "";
  const hygieneChecks: any[] = d.hygieneChecks || [];
  const pestChecks: any[] = d.pestChecks || [];
  const hygieneNotes = d.hygieneNotes || {};
  const pestNotes = d.pestNotes || {};
  const managementNotes = d.managementNotes || "";

  const cellCls = "border border-gray-400 px-2 py-1 text-sm";
  const headCls = "border border-gray-400 px-2 py-1 text-sm font-medium bg-gray-50";

  const checkLabel = (v: any) => {
    if (v === "양호" || v === "적합" || v === true) return "✓ 양호";
    if (v === "불량" || v === "부적합" || v === false) return "✗ 불량";
    if (v === "해당없음" || v === "N/A") return "N/A";
    return v || "미점검";
  };

  // ─── 페이지 1: 일반위생관리 (주간) ───
  const page1 = (
    <div>
      <TitleWithApproval title="일반위생관리 점검표 (주간)" subtitle="(주 1회 작성)" doc={doc} />
      <div className="flex gap-8 mb-3 text-sm">
        <div><span className="font-medium">점검일자:</span> {date}</div>
        <div><span className="font-medium">점검자:</span> {checkerName || "-"}</div>
      </div>
      <table className="w-full border-collapse border border-gray-400 text-sm">
        <thead>
          <tr className="bg-blue-100">
            <th className={headCls} style={{ width: "50px" }}>No.</th>
            <th className={headCls} style={{ width: "100px" }}>분류</th>
            <th className={headCls}>점검 내용</th>
            <th className={headCls} style={{ width: "100px" }}>점검 결과</th>
          </tr>
        </thead>
        <tbody>
          {hygieneChecks.length > 0 ? hygieneChecks.map((item: any, idx: number) => (
            <tr key={idx}>
              <td className={cellCls + " text-center"}>{item.itemOrder || idx + 1}</td>
              <td className={cellCls + " text-center"}>{item.category || "-"}</td>
              <td className={cellCls}>{item.itemText || "-"}</td>
              <td className={cellCls + " text-center"}>{checkLabel(item.checkResult)}</td>
            </tr>
          )) : (
            <tr><td colSpan={4} className={cellCls + " text-center text-gray-400 py-4"}>점검 항목 없음</td></tr>
          )}
        </tbody>
      </table>
      <table className="w-full border-collapse border border-gray-400 text-sm mt-3">
        <tbody>
          <tr>
            <td className={headCls} style={{ width: "120px" }}>특이사항</td>
            <td className={cellCls}>{hygieneNotes.specialNotes || "-"}</td>
          </tr>
          <tr>
            <td className={headCls}>개선조치 및 결과</td>
            <td className={cellCls}>{hygieneNotes.improvementAction || "-"}</td>
          </tr>
          <tr>
            <td className={headCls}>조치자</td>
            <td className={cellCls}>{hygieneNotes.actionBy || "-"}</td>
          </tr>
          <tr>
            <td className={headCls}>확인자</td>
            <td className={cellCls}>{hygieneNotes.confirmedBy || "-"}</td>
          </tr>
          {managementNotes && (
            <tr>
              <td className={headCls}>관리메모</td>
              <td className={cellCls}>{managementNotes}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  // ─── 페이지 2: 방충·방서관리 (주간) ───
  const page2 = (
    <div>
      <TitleWithApproval title="방충·방서관리 점검표 (주간)" subtitle="(주 1회 작성)" doc={doc} />
      <div className="flex gap-8 mb-3 text-sm">
        <div><span className="font-medium">점검일자:</span> {date}</div>
        <div><span className="font-medium">점검자:</span> {checkerName || "-"}</div>
      </div>
      <table className="w-full border-collapse border border-gray-400 text-sm">
        <thead>
          <tr className="bg-blue-100">
            <th className={headCls} style={{ width: "50px" }}>No.</th>
            <th className={headCls} style={{ width: "100px" }}>분류</th>
            <th className={headCls}>점검 내용</th>
            <th className={headCls} style={{ width: "100px" }}>점검 결과</th>
          </tr>
        </thead>
        <tbody>
          {pestChecks.length > 0 ? pestChecks.map((item: any, idx: number) => (
            <tr key={idx}>
              <td className={cellCls + " text-center"}>{item.itemOrder || idx + 1}</td>
              <td className={cellCls + " text-center"}>{item.category || "-"}</td>
              <td className={cellCls}>{item.itemText || "-"}</td>
              <td className={cellCls + " text-center"}>{checkLabel(item.checkResult)}</td>
            </tr>
          )) : (
            <tr><td colSpan={4} className={cellCls + " text-center text-gray-400 py-4"}>점검 항목 없음</td></tr>
          )}
        </tbody>
      </table>
      <table className="w-full border-collapse border border-gray-400 text-sm mt-3">
        <tbody>
          <tr>
            <td className={headCls} style={{ width: "120px" }}>특이사항</td>
            <td className={cellCls}>{pestNotes.specialNotes || "-"}</td>
          </tr>
          <tr>
            <td className={headCls}>개선조치 및 결과</td>
            <td className={cellCls}>{pestNotes.improvementAction || "-"}</td>
          </tr>
          <tr>
            <td className={headCls}>조치자</td>
            <td className={cellCls}>{pestNotes.actionBy || "-"}</td>
          </tr>
          <tr>
            <td className={headCls}>확인자</td>
            <td className={cellCls}>{pestNotes.confirmedBy || "-"}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );

  return [page1, page2];
}

// ============================================================================
// 연간일지 전용 렌더러 (검교정 점검표)
// ============================================================================

/** 검교정 장비 항목 라벨 매핑 */
const CALIBRATION_LABELS: Record<string, string> = {
  calibrationFreezerPanelThermometer: "냉동고 판넬 온도계",
  calibrationRefrigerator: "냉장고 온도계",
  calibrationTimer: "타이머",
  calibrationProbeThermometer: "탐침 온도계",
  calibrationScale: "저울",
  calibrationOven: "오븐 온도계",
  calibrationMetalDetector: "금속검출기",
  calibrationHygrothermograph: "온습도계",
  calibrationRadiationThermometer1: "방사 온도계 1",
  calibrationRadiationThermometer2: "방사 온도계 2",
  calibrationOvenWorkThermometer: "오븐 작업용 온도계",
};

export function renderYearlyLog(data: any, doc?: any): React.ReactNode {
  const d = data || {};
  const year = d.year || "";
  const date = d.date || d.inspectionDate || "";
  const inspector = d.inspector || "";

  const cellCls = "border border-gray-400 px-2 py-1 text-sm";
  const headCls = "border border-gray-400 px-2 py-1 text-sm font-medium bg-gray-50";

  // calibrationChecks 배열 형태 또는 개별 필드 형태 모두 지원
  const calibrationChecks: any[] = d.calibrationChecks || [];
  const hasArrayFormat = calibrationChecks.length > 0;

  const checkLabel = (v: any) => {
    if (v === "적합" || v === true || v === "양호") return "✓ 적합";
    if (v === "부적합" || v === false || v === "불량") return "✗ 부적합";
    if (v === "N/A" || v === "해당없음") return "N/A";
    if (typeof v === "string" && v.trim()) return v;
    return "미점검";
  };

  return (
    <div>
      <TitleWithApproval title="연간 검교정 점검표" subtitle={`${year}년 (연 1회 작성)`} doc={doc} />
      <div className="flex gap-8 mb-3 text-sm">
        <div><span className="font-medium">점검일자:</span> {date}</div>
        <div><span className="font-medium">점검자:</span> {inspector || "-"}</div>
      </div>

      {/* 검교정 항목 테이블 */}
      <div className="text-sm font-bold mb-1 mt-4">1. 계측기기 검교정 현황</div>
      <table className="w-full border-collapse border border-gray-400 text-sm">
        <thead>
          <tr className="bg-blue-100">
            <th className={headCls} style={{ width: "50px" }}>No.</th>
            <th className={headCls}>장비명</th>
            <th className={headCls} style={{ width: "120px" }}>검교정 결과</th>
            <th className={headCls} style={{ width: "120px" }}>비고</th>
          </tr>
        </thead>
        <tbody>
          {hasArrayFormat ? (
            calibrationChecks.map((item: any, idx: number) => (
              <tr key={idx}>
                <td className={cellCls + " text-center"}>{idx + 1}</td>
                <td className={cellCls}>{item.equipmentName || "-"}</td>
                <td className={cellCls + " text-center"}>{checkLabel(item.result)}</td>
                <td className={cellCls}>{item.notes || "-"}</td>
              </tr>
            ))
          ) : (
            /* 개별 필드 형태 (YearlyLogModal 구조) */
            Object.entries(CALIBRATION_LABELS).map(([key, label], idx) => (
              <tr key={key}>
                <td className={cellCls + " text-center"}>{idx + 1}</td>
                <td className={cellCls}>{label}</td>
                <td className={cellCls + " text-center"}>{checkLabel(d[key])}</td>
                <td className={cellCls}>{"-"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* 금속검출기 정기 점검 */}
      <div className="text-sm font-bold mb-1 mt-4">2. 금속검출기 정기 점검</div>
      <table className="w-full border-collapse border border-gray-400 text-sm">
        <tbody>
          <tr>
            <td className={headCls} style={{ width: "150px" }}>최근 점검일</td>
            <td className={cellCls}>{d.metalDetectorCheckDate || "-"}</td>
            <td className={headCls} style={{ width: "150px" }}>차기 점검일</td>
            <td className={cellCls}>{d.metalDetectorNextCheck || "-"}</td>
          </tr>
        </tbody>
      </table>

      {/* 정기 검증 */}
      <div className="text-sm font-bold mb-1 mt-4">3. 정기 검증 (HACCP 시스템)</div>
      <table className="w-full border-collapse border border-gray-400 text-sm">
        <tbody>
          <tr>
            <td className={headCls} style={{ width: "150px" }}>최근 검증일</td>
            <td className={cellCls}>{d.periodicVerificationDate || "-"}</td>
            <td className={headCls} style={{ width: "150px" }}>차기 검증일</td>
            <td className={cellCls}>{d.periodicVerificationNext || "-"}</td>
          </tr>
        </tbody>
      </table>

      {/* 특이사항/개선조치 */}
      <table className="w-full border-collapse border border-gray-400 text-sm mt-4">
        <tbody>
          <tr>
            <td className={headCls} style={{ width: "120px" }}>특이사항</td>
            <td className={cellCls}>{d.specialNotes || "-"}</td>
          </tr>
          <tr>
            <td className={headCls}>개선조치 및 결과</td>
            <td className={cellCls}>{d.improvementAction || "-"}</td>
          </tr>
          <tr>
            <td className={headCls}>조치자</td>
            <td className={cellCls}>{d.actionTaker || "-"}</td>
          </tr>
          <tr>
            <td className={headCls}>확인</td>
            <td className={cellCls}>{d.confirmation || "-"}</td>
          </tr>
        </tbody>
      </table>

      {d.autoGenerated && d.autoNote && (
        <div className="mt-3 p-3 bg-yellow-50 border border-yellow-300 rounded text-sm text-yellow-800">
          {d.autoNote}
        </div>
      )}
    </div>
  );
}

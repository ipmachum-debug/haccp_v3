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
      <TitleWithApproval title="일반위생관리 점검표 (주간)" subtitle="(주 1회 작성)" doc={doc} infoLeft={<><span className="font-medium">점검일자:</span> {date} &nbsp;&nbsp; <span className="font-medium">점검자:</span> {doc?.authorName || checkerName || "-"}</>} />
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
      <TitleWithApproval title="방충·방서관리 점검표 (주간)" subtitle="(주 1회 작성)" doc={doc} infoLeft={<><span className="font-medium">점검일자:</span> {date} &nbsp;&nbsp; <span className="font-medium">점검자:</span> {doc?.authorName || checkerName || "-"}</>} />
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
// 월간일지 전용 렌더러 (월간 위생/CCP 점검 일지)
// ★ 2026-05-09 추가: monthly_log form_type 의 fallback dump 문제 픽스
//   기존: renderFormContent 디스패처에 case 누락 → renderGenericData 의
//        Object.entries fallback 으로 raw key/value 테이블 출력 (JSON.stringify)
//   현재: 정상 양식 — CCP 점검 표 + 위생 점검 표 + 이탈/특이사항/메타정보
// ============================================================================

export function renderMonthlyLogPages(data: any, doc?: any): React.ReactNode[] {
  const d = data || {};
  const date = d.date || "";
  const yearMonth = (date && typeof date === "string" && date.length >= 7) ? date.substring(0, 7) : "";
  const checkerName = d.checkerName || "";
  const confirmerName = d.confirmerName || "";
  const ccpChecks: any[] = Array.isArray(d.ccpChecks) ? d.ccpChecks : [];
  const hygieneChecks: any[] = Array.isArray(d.hygieneChecks) ? d.hygieneChecks : [];
  const ccpDeviation = d.ccpDeviation || {};
  const hygieneNotes = d.hygieneNotes || {};

  const cellCls = "border border-gray-400 px-2 py-1 text-sm";
  const headCls = "border border-gray-400 px-2 py-1 text-sm font-medium bg-gray-50";

  const checkLabel = (v: any) => {
    if (v === "yes" || v === "양호" || v === "적합" || v === true) return "✓ 적합";
    if (v === "no" || v === "불량" || v === "부적합" || v === false) return "✗ 부적합";
    if (v === "na" || v === "N/A" || v === "해당없음") return "N/A";
    if (typeof v === "string" && v.trim()) return v;
    return "미점검";
  };

  // CCP 점검 항목을 분류별로 그룹화
  const ccpByCategory: Record<string, any[]> = {};
  ccpChecks.forEach((item: any) => {
    const cat = item.category || "기타";
    if (!ccpByCategory[cat]) ccpByCategory[cat] = [];
    ccpByCategory[cat].push(item);
  });

  // 위생 점검 항목을 분류별로 그룹화
  const hygieneByCategory: Record<string, any[]> = {};
  hygieneChecks.forEach((item: any) => {
    const cat = item.category || "기타";
    if (!hygieneByCategory[cat]) hygieneByCategory[cat] = [];
    hygieneByCategory[cat].push(item);
  });

  // ─── 페이지 1: CCP 검증 점검 (월간) ───
  const page1 = (
    <div>
      <TitleWithApproval
        title="월간 CCP 검증 점검표"
        subtitle={`${yearMonth} (월 1회 작성)`}
        doc={doc}
        infoLeft={<><span className="font-medium">점검월:</span> {yearMonth || "-"} &nbsp;&nbsp; <span className="font-medium">점검일:</span> {date || "-"} &nbsp;&nbsp; <span className="font-medium">점검자:</span> {doc?.authorName || checkerName || "-"}</>}
      />
      <table className="w-full border-collapse border border-gray-400 text-sm">
        <thead>
          <tr className="bg-blue-100">
            <th className={headCls} style={{ width: "50px" }}>No.</th>
            <th className={headCls} style={{ width: "110px" }}>분류</th>
            <th className={headCls}>점검 내용</th>
            <th className={headCls} style={{ width: "100px" }}>점검 결과</th>
            <th className={headCls} style={{ width: "150px" }}>비고</th>
          </tr>
        </thead>
        <tbody>
          {ccpChecks.length > 0 ? (
            Object.entries(ccpByCategory).flatMap(([cat, items]) =>
              items.map((item: any, idx: number) => (
                <tr key={`${cat}-${idx}`}>
                  <td className={cellCls + " text-center"}>{item.itemOrder || idx + 1}</td>
                  <td className={cellCls + " text-center"}>{cat}</td>
                  <td className={cellCls}>{item.itemText || "-"}</td>
                  <td className={cellCls + " text-center"}>{checkLabel(item.checkResult)}</td>
                  <td className={cellCls}>{item.notes || "-"}</td>
                </tr>
              )),
            )
          ) : (
            <tr><td colSpan={5} className={cellCls + " text-center text-gray-400 py-4"}>점검 항목 없음</td></tr>
          )}
        </tbody>
      </table>

      {/* CCP 이탈 사항 */}
      <div className="text-sm font-bold mb-1 mt-4">CCP 이탈 사항</div>
      <table className="w-full border-collapse border border-gray-400 text-sm">
        <tbody>
          <tr>
            <td className={headCls} style={{ width: "120px" }}>이탈 상세</td>
            <td className={cellCls}>{ccpDeviation.deviationDetails || "이탈 없음"}</td>
          </tr>
          <tr>
            <td className={headCls}>개선조치 및 결과</td>
            <td className={cellCls}>{ccpDeviation.improvementAction || "-"}</td>
          </tr>
          <tr>
            <td className={headCls}>조치자</td>
            <td className={cellCls}>{ccpDeviation.actionTaker || "-"}</td>
          </tr>
          <tr>
            <td className={headCls}>확인</td>
            <td className={cellCls}>{ccpDeviation.confirmation || "-"}</td>
          </tr>
        </tbody>
      </table>

      {d.autoGenerated && d.autoNote && (
        <div className="mt-3 p-3 bg-yellow-50 border border-yellow-300 rounded text-xs text-yellow-800">
          {d.autoNote}
        </div>
      )}
    </div>
  );

  // ─── 페이지 2: 위생 점검 (월간) ───
  const page2 = (
    <div>
      <TitleWithApproval
        title="월간 위생 점검표"
        subtitle={`${yearMonth} (월 1회 작성)`}
        doc={doc}
        infoLeft={<><span className="font-medium">점검월:</span> {yearMonth || "-"} &nbsp;&nbsp; <span className="font-medium">점검일:</span> {date || "-"} &nbsp;&nbsp; <span className="font-medium">점검자:</span> {doc?.authorName || checkerName || "-"} &nbsp;&nbsp; <span className="font-medium">확인자:</span> {confirmerName || "-"}</>}
      />
      <table className="w-full border-collapse border border-gray-400 text-sm">
        <thead>
          <tr className="bg-blue-100">
            <th className={headCls} style={{ width: "50px" }}>No.</th>
            <th className={headCls} style={{ width: "110px" }}>분류</th>
            <th className={headCls}>점검 내용</th>
            <th className={headCls} style={{ width: "100px" }}>점검 결과</th>
            <th className={headCls} style={{ width: "150px" }}>비고</th>
          </tr>
        </thead>
        <tbody>
          {hygieneChecks.length > 0 ? (
            Object.entries(hygieneByCategory).flatMap(([cat, items]) =>
              items.map((item: any, idx: number) => (
                <tr key={`${cat}-${idx}`}>
                  <td className={cellCls + " text-center"}>{item.itemOrder || idx + 1}</td>
                  <td className={cellCls + " text-center"}>{cat}</td>
                  <td className={cellCls}>{item.itemText || "-"}</td>
                  <td className={cellCls + " text-center"}>{checkLabel(item.checkResult)}</td>
                  <td className={cellCls}>{item.notes || "-"}</td>
                </tr>
              )),
            )
          ) : (
            <tr><td colSpan={5} className={cellCls + " text-center text-gray-400 py-4"}>점검 항목 없음</td></tr>
          )}
        </tbody>
      </table>

      {/* 위생 특이사항 */}
      <div className="text-sm font-bold mb-1 mt-4">위생 특이사항</div>
      <table className="w-full border-collapse border border-gray-400 text-sm">
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
      <TitleWithApproval title="연간 검교정 점검표" subtitle={`${year}년 (연 1회 작성)`} doc={doc} infoLeft={<><span className="font-medium">점검일자:</span> {date} &nbsp;&nbsp; <span className="font-medium">점검자:</span> {doc?.authorName || inspector || "-"}</>} />

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

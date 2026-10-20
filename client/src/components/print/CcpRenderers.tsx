/**
 * CcpRenderers.tsx
 * CCP-related render functions:
 * - renderCcpBatchSummary (batch summary when no records)
 * - renderCcpFormRecord (CCP-1B, CCP-2B, CCP-4P form rendering)
 */
import React from "react";
import { TitleWithApproval } from "./PrintHelpers";

// ============================================================================
// batch_production: 배치 CCP 기록지 요약 (기록지 없을 때)
// ============================================================================
export function renderCcpBatchSummary(doc: any) {
  const desc = doc.description || "";
  const descLines = desc.split("\n").filter(Boolean);
  return (
    <div>
      <TitleWithApproval title="배치 CCP 기록지 승인" subtitle={doc.title} doc={doc} />
      <table className="w-full border-collapse border border-gray-400 text-sm mb-4">
        <tbody>
          {descLines.map((line: string, i: number) => {
            const [label, ...rest] = line.split(":");
            return (
              <tr key={i}>
                <td className="border border-gray-400 px-3 py-2 bg-gray-50 font-medium w-1/3">{label?.trim()}</td>
                <td className="border border-gray-400 px-3 py-2">{rest.join(":").trim()}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-gray-500 text-sm text-center mt-4">
        CCP 기록지 작성 후 개별 제출 시 별도 인쇄 가능합니다.
      </p>
    </div>
  );
}

// ============================================================================
// CCP 기록지 단건 렌더러 (h_ccp_form_records 기반)
// 교반기_가열(증숙)공정_기준서.pdf 양식 완벽 재현
// ============================================================================
export function renderCcpFormRecord(fr: any, doc: any) {
  if (!fr) return <p className="text-gray-500">CCP 기록지 데이터 없음</p>;

  // Date 객체 -> string 안전 변환 헬퍼
  const s = (v: any): string => {
    if (!v) return "";
    if (v instanceof Date) return v.toISOString().split("T")[0];
    return String(v);
  };

  const ccpType = s(fr.ccpType || fr.ccp_type);
  const processGroupName = s(fr.processGroupName || fr.process_group_name);
  // 공정그룹별 모니터링 방법/개선조치 텍스트 (교반 vs 증숙 등 양식 차이) — 있으면 우선 사용
  const monitoringMethodText = s(fr.monitoringMethod || fr.monitoring_method).trim();
  const correctiveActionText = s(fr.correctiveAction || fr.corrective_action).trim();
  const monitoringCycleText = s(fr.monitoringCycle || fr.monitoring_cycle).trim();
  // 회사 한계기준표(같은 CCP 유형 공정 전부) · 설비 열 제목 — 서버 enrichWithGroupText 가 넣어 준다
  const clTable: any[] = Array.isArray(fr.clTable) ? fr.clTable : [];
  const equipTypeLabel = s(fr.equipTypeLabel).trim() || "설비";
  // 저장된 텍스트를 그대로(줄바꿈 보존) 렌더 — 사용자가 기준서 문구를 직접 관리
  const renderMultiline = (text: string) => (
    <div className="whitespace-pre-wrap leading-relaxed">{text}</div>
  );
  const productName = s(fr.productName || fr.product_name);
  const workDate = s(fr.workDate || fr.work_date);
  const status = s(fr.status) || "draft";

  // CL 기준값
  const clHeatTimeLo = fr.clHeatTimeMinLo ?? fr.cl_heat_time_min_lo;
  const clHeatTimeHi = fr.clHeatTimeMinHi ?? fr.cl_heat_time_min_hi;
  const clHeatTempLo = fr.clHeatTempLo ?? fr.cl_heat_temp_lo;
  const clPressureMpaLo = fr.clPressureMpaLo ?? fr.cl_pressure_mpa_lo;
  // 상한 (2026-10-20 검토 4) — 비어 있으면 '이상' 만 (단방향 기준 그대로)
  const clHeatTempHi = fr.clHeatTempHi ?? fr.cl_heat_temp_hi;
  const clPressureMpaHi = fr.clPressureMpaHi ?? fr.cl_pressure_mpa_hi;
  const clMetalFe = fr.clFeMm ?? fr.cl_fe_mm;
  const clMetalSus = fr.clSusMm ?? fr.cl_sus_mm;
  const clMetalSensitivity = fr.clMetalSensitivity ?? fr.cl_metal_sensitivity;
  // 기준이 없으면 '-' — 특정 회사 값을 폴백으로 쓰지 않는다 (2026-10-18)
  const fmtRange = (lo: any, hi: any, unit: string) =>
    lo != null && hi != null ? `${lo}${unit}이상~${hi}${unit}이하` : lo != null ? `${lo}${unit}이상` : hi != null ? `${hi}${unit}이하` : "-";
  const EMPTY_TEXT = (label: string) => (
    <p className="text-gray-400">({label} 문구가 비어 있습니다 — CCP 관리 → 공정그룹에서 입력하세요)</p>
  );

  const formRows: any[] = fr.rows || [];
  const hasFormRows = formRows.length > 0;

  // CCP 타입별 제목
  const ccpTypeLabels: Record<string, string> = {
    "CCP-1B": "중요관리점(CCP-1B) 모니터링일지",
    "CCP-2B": "중요관리점(CCP-2B) 모니터링일지",
    "CCP-4P": "중요관리점(CCP-4P) 모니터링일지",
  };
  const ccpSubLabels: Record<string, string> = {
    "CCP-1B": "[가열(증숙)공정]",
    "CCP-2B": "[가열(굽기)공정]",
    "CCP-4P": "[금속검출공정]",
  };
  // 문서 부제: 실제 공정그룹명을 우선 사용 (하드코딩 라벨은 공정그룹명이 없을 때만 폴백).
  //  동일 CCP 유형이라도 공정그룹은 여러 개(교반-가열/증숙(설기류)/증숙(약식류) 등)이므로
  //  ccpType 만으로 라벨을 고정하면 모든 CCP-1B 가 "가열(증숙)"으로 잘못 표기됨.
  const ccpSubtitle = processGroupName ? `[${processGroupName}]` : (ccpSubLabels[ccpType] || "");

  // 날짜 포맷
  const formatWorkDate = (d: string) => {
    if (!d) return "      .    .    .";
    const parts = d.split("-");
    if (parts.length === 3) return `${parts[0]}.  ${parts[1]}.  ${parts[2]}.`;
    return d;
  };
  const getDayOfWeek = (d: string) => {
    if (!d) return "";
    try {
      const days = ["일", "월", "화", "수", "목", "금", "토"];
      // 타임존 영향 방지: "YYYY-MM-DD" → UTC noon으로 파싱
      const [y, m, day] = d.split("-").map(Number);
      const dt = new Date(Date.UTC(y, m - 1, day, 12, 0, 0));
      return days[dt.getUTCDay()];
    } catch { return ""; }
  };

  const bCls = "border border-gray-600";
  const thCls = `${bCls} px-1 py-0.5 text-center text-xs font-medium`;
  const tdCls = `${bCls} px-1 py-0.5 text-center text-xs`;

  // ══════════════════════════════════════════════════════════
  // CCP-1B: 가열(증숙) - 교반기 공정 기준서 양식
  // ══════════════════════════════════════════════════════════
  if (ccpType === "CCP-1B") {
    // 한계기준 테이블 데이터 (공정그룹 내 모든 설비 표시)
    // formRows에서 고유한 equipment_name 추출 → 한계기준 행 생성
    const uniqueEquipNames = Array.from(
      new Set(formRows.map((r: any) => s(r.equipmentName || r.equipment_name)).filter(Boolean))
    );
    // 정규 양식: 회사의 이 CCP 공정 전부를 나열 (예: 교반-가열 / 증숙(설기류) / 증숙(약식류)). 표가 없으면 이 기록지의 기준 한 줄.
    const clRows = clTable.length > 0
      ? clTable.map((g: any) => ({ name: s(g.name), time: fmtRange(g.timeMin, g.timeMax, "분"), pressure: fmtRange(g.pressureMin, g.pressureMax, "Mpa"), temp: fmtRange(g.temperatureMin, g.temperatureMax, "℃") }))
      : uniqueEquipNames.length > 0
      ? uniqueEquipNames.map((name) => ({
          name: productName ? `${productName}(${name})` : name,
          time: fmtRange(clHeatTimeLo, clHeatTimeHi, "분"),
          pressure: fmtRange(clPressureMpaLo, clPressureMpaHi, "Mpa"),
          temp: fmtRange(clHeatTempLo, clHeatTempHi, "℃"),
        }))
      : [{ name: productName || processGroupName || "-", time: fmtRange(clHeatTimeLo, clHeatTimeHi, "분"), pressure: fmtRange(clPressureMpaLo, clPressureMpaHi, "Mpa"), temp: fmtRange(clHeatTempLo, clHeatTempHi, "℃") }];

    // 8개 빈 행 (기록란)
    const displayRows = hasFormRows
      ? formRows
      : Array.from({ length: 8 }, (_, i) => ({ batchSeq: i + 1 }));

    return (
      <div className="text-xs">
        <TitleWithApproval
          title={ccpTypeLabels[ccpType]}
          subtitle={ccpSubtitle}
          doc={doc}
          infoLeft={<><span className="font-medium">작성일자:</span> {formatWorkDate(workDate)} &nbsp;&nbsp; <span className="font-medium">요일:</span> {getDayOfWeek(workDate)}</>}
        />

        {/* 한계기준 */}
        <table className="w-full border-collapse border border-gray-600 mb-0">
          <thead>
            <tr>
              <th className={`${thCls} bg-gray-50`} rowSpan={2} style={{ width: "12%" }}>한계기준</th>
              <th className={thCls} style={{ width: "25%" }}>품목</th>
              <th className={thCls} style={{ width: "25%" }}>가열시간</th>
              <th className={thCls} style={{ width: "18%" }}>압력</th>
              <th className={thCls} style={{ width: "20%" }}>품온</th>
            </tr>
          </thead>
          <tbody>
            {clRows.map((row, i) => (
              <tr key={i}>
                {i === 0 && <td className={`${tdCls} bg-gray-50 font-medium`} rowSpan={clRows.length}></td>}
                <td className={tdCls}>{row.name}</td>
                <td className={tdCls}>{row.time}</td>
                <td className={tdCls}>{row.pressure}</td>
                <td className={tdCls}>{row.temp}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* 주기 */}
        <table className="w-full border-collapse border border-gray-600 mb-0">
          <tbody>
            <tr>
              <td className={`${bCls} px-2 py-1 font-bold bg-gray-50 text-center`} style={{ width: "12%" }}>주 기</td>
              <td className={`${bCls} px-2 py-1 font-bold`}>{monitoringCycleText ? renderMultiline(monitoringCycleText) : EMPTY_TEXT("주기")}</td>
            </tr>
          </tbody>
        </table>

        {/* 모니터링 방법 */}
        <table className="w-full border-collapse border border-gray-600 mb-0">
          <tbody>
            <tr>
              <td className={`${bCls} px-2 py-1 font-medium bg-gray-50 text-center align-top`} style={{ width: "12%" }} rowSpan={1}>
                모니터링<br />방 법
              </td>
              <td className={`${bCls} px-2 py-1 leading-relaxed`}>
                {monitoringMethodText ? renderMultiline(monitoringMethodText) : EMPTY_TEXT("모니터링 방법")}
              </td>
            </tr>
          </tbody>
        </table>

        {/* 모니터링 기록 테이블 - 교반기_가열(증숙)공정 양식 */}
        <table className="w-full border-collapse border border-gray-600 mb-0 ccp-print-table">
          <thead>
            <tr>
              <th className={thCls} rowSpan={2} style={{ width: "11%" }}>품 명</th>
              <th className={thCls} rowSpan={2} style={{ width: "9%" }}>측정<br/>시각</th>
              <th className={thCls} rowSpan={2} style={{ width: "10%" }}>{equipTypeLabel}</th>
              <th className={thCls} rowSpan={2} style={{ width: "8%" }}>가열<br/>시간</th>
              <th className={thCls} rowSpan={2} style={{ width: "10%" }}>압력<br/><span className="font-normal text-[8px]">(MPa)</span></th>
              <th className={thCls} rowSpan={2} style={{ width: "8%" }}>투입량<br/><span className="font-normal text-[8px]">(kg)</span></th>
              <th className={thCls} colSpan={2}>가열후 품온</th>
              <th className={thCls} rowSpan={2} style={{ width: "10%" }}>판 정</th>
            </tr>
            <tr>
              <th className={thCls} style={{ width: "10%" }}>모서리</th>
              <th className={thCls} style={{ width: "10%" }}>중심부</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row: any, idx: number) => {
              const rowProductName = s(row.productName || row.product_name) || productName;
              const measureTime = s(row.measurementTime || row.measurement_time);
              const equipName = s(row.equipmentName || row.equipment_name);
              const heatTime = row.heatTimeMin ?? row.heat_time_min;
              const pressure = row.pressureMpa ?? row.pressure_mpa;
              const inputQty = row.inputQtyKg ?? row.input_qty_kg;
              const tempEdge = row.tempEdgeC ?? row.temp_edge_c;
              const tempCenter = row.tempCenterC ?? row.temp_center_c;
              const result = row.result;
              const isPass = result === "적합" || result === "PASS";
              const isFail = result === "부적합" || result === "FAIL";

              return (
                <tr key={idx}>
                  <td className={tdCls}>{rowProductName || ""}</td>
                  <td className={tdCls}>{measureTime || ":"}</td>
                  <td className={tdCls}>{equipName || ""}</td>
                  <td className={tdCls}>{heatTime != null ? `${heatTime}분` : ""}</td>
                  <td className={tdCls}>{pressure != null ? `${pressure}` : ""}</td>
                  <td className={tdCls}>{inputQty != null ? `${inputQty}` : ""}</td>
                  <td className={tdCls}>{tempEdge != null ? `${tempEdge}℃` : ""}</td>
                  <td className={tdCls}>{tempCenter != null ? `${tempCenter}℃` : ""}</td>
                  <td className={tdCls}>
                    {result ? (
                      <span className={isPass ? "" : "text-red-600 font-bold"}>
                        {isPass ? "☑ 적 합" : "☑ 부적합"}
                      </span>
                    ) : (
                      <span className="text-gray-400">□ 적 합<br />□ 부적합</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* 개선조치 방법 */}
        <table className="w-full border-collapse border border-gray-600 mb-0">
          <tbody>
            <tr>
              <td className={`${bCls} px-2 py-1 font-medium bg-gray-50 text-center align-top`} style={{ width: "12%" }} rowSpan={1}>
                개선조치<br />방법
              </td>
              <td className={`${bCls} px-2 py-1 leading-relaxed`}>
                {correctiveActionText ? renderMultiline(correctiveActionText) : EMPTY_TEXT("개선조치 방법")}
              </td>
            </tr>
          </tbody>
        </table>

        {/* 한계기준 이탈내용 / 개선조치 및 결과 / 조치자 / 확인 */}
        <table className="w-full border-collapse border border-gray-600">
          <thead>
            <tr>
              <th className={`${thCls} bg-gray-50`} style={{ width: "35%" }}>한계기준 이탈내용</th>
              <th className={`${thCls} bg-gray-50`} style={{ width: "35%" }}>개선조치 및 결과</th>
              <th className={`${thCls} bg-gray-50`} style={{ width: "15%" }}>조치자</th>
              <th className={`${thCls} bg-gray-50`} style={{ width: "15%" }}>확 인</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              const deviationRows = formRows.filter((r: any) => r.isDeviation || r.is_deviation);
              if (deviationRows.length > 0) {
                return deviationRows.map((row: any, idx: number) => (
                  <tr key={idx}>
                    <td className={tdCls}>{s(row.deviationNote || row.deviation_note) || ""}</td>
                    <td className={tdCls}>{s(row.correctiveAction || row.corrective_action) || ""}</td>
                    <td className={tdCls}>{s(row.actionBy || row.action_by) || ""}</td>
                    <td className={tdCls}>{s(row.confirmedBy || row.confirmed_by) || ""}</td>
                  </tr>
                ));
              }
              return (
                <tr>
                  <td className={`${tdCls}`} style={{ height: "30px" }}></td>
                  <td className={tdCls}></td>
                  <td className={tdCls}></td>
                  <td className={tdCls}></td>
                </tr>
              );
            })()}
          </tbody>
        </table>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════
  // CCP-2B: 가열(굽기) - 오븐 공정
  // ══════════════════════════════════════════════════════════
  if (ccpType === "CCP-2B") {
    const displayRows = hasFormRows
      ? formRows
      : Array.from({ length: 8 }, (_, i) => ({ batchSeq: i + 1 }));

    return (
      <div className="text-xs">
        <TitleWithApproval
          title={ccpTypeLabels[ccpType]}
          subtitle={ccpSubtitle}
          doc={doc}
          infoLeft={<><span className="font-medium">작성일자:</span> {formatWorkDate(workDate)} &nbsp;&nbsp; <span className="font-medium">요일:</span> {getDayOfWeek(workDate)}</>}
        />

        <table className="w-full border-collapse border border-gray-600 mb-0">
          <thead>
            <tr>
              <th className={`${thCls} bg-gray-50`} style={{ width: "12%" }}>한계기준</th>
              <th className={thCls}>품목</th>
              <th className={thCls}>가열시간</th>
              <th className={thCls}>가열온도</th>
            </tr>
          </thead>
          <tbody>
            {(clTable.length > 0
              ? clTable.map((g: any) => ({ name: s(g.name), time: fmtRange(g.timeMin, g.timeMax, "분"), temp: fmtRange(g.temperatureMin, g.temperatureMax, "℃") }))
              : [{ name: processGroupName || productName || "-", time: fmtRange(clHeatTimeLo, clHeatTimeHi, "분"), temp: fmtRange(clHeatTempLo, clHeatTempHi, "℃") }]
            ).map((row, i, arr) => (
              <tr key={i}>
                {i === 0 && <td className={`${tdCls} bg-gray-50`} rowSpan={arr.length}></td>}
                <td className={tdCls}>{row.name}</td>
                <td className={tdCls}>{row.time}</td>
                <td className={tdCls}>{row.temp}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <table className="w-full border-collapse border border-gray-600 mb-0">
          <tbody>
            <tr>
              <td className={`${bCls} px-2 py-1 font-bold bg-gray-50 text-center`} style={{ width: "12%" }}>주 기</td>
              <td className={`${bCls} px-2 py-1 font-bold`}>{monitoringCycleText ? renderMultiline(monitoringCycleText) : EMPTY_TEXT("주기")}</td>
            </tr>
          </tbody>
        </table>

        {/* 모니터링 방법 (공정그룹 텍스트 우선, 없으면 굽기 기본 문구) */}
        <table className="w-full border-collapse border border-gray-600 mb-0">
          <tbody>
            <tr>
              <td className={`${bCls} px-2 py-1 font-medium bg-gray-50 text-center align-top`} style={{ width: "12%" }}>
                모니터링<br />방 법
              </td>
              <td className={`${bCls} px-2 py-1 leading-relaxed`}>
                {monitoringMethodText ? renderMultiline(monitoringMethodText) : EMPTY_TEXT("모니터링 방법")}
              </td>
            </tr>
          </tbody>
        </table>

        {/* 모니터링 기록 */}
        <table className="w-full border-collapse border border-gray-600 mb-0 ccp-print-table">
          <thead>
            <tr>
              <th className={thCls} style={{ width: "18%" }}>품 명</th>
              <th className={thCls} style={{ width: "12%" }}>측정시각</th>
              <th className={thCls} style={{ width: "16%" }}>가열시간(분)</th>
              <th className={thCls} style={{ width: "20%" }}>가열온도(판넬온도)</th>
              <th className={thCls} style={{ width: "14%" }}>투입량(kg)</th>
              <th className={thCls} style={{ width: "20%" }}>
                판 정<br />(적합/부적합)
              </th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row: any, idx: number) => {
              const rowProductName = s(row.productName || row.product_name) || productName;
              const measureTime = s(row.measurementTime || row.measurement_time);
              const heatTime = row.heatTimeMin ?? row.heat_time_min;
              const heatTemp = row.heatTempC ?? row.heat_temp_c;
              const inputQty = row.inputQtyKg ?? row.input_qty_kg;
              const result = row.result;
              const isPass = result === "적합" || result === "PASS";
              return (
                <tr key={idx}>
                  <td className={tdCls}>{rowProductName || ""}</td>
                  <td className={tdCls}>{measureTime || ":"}</td>
                  <td className={tdCls}>{heatTime != null ? `${heatTime}분` : ""}</td>
                  <td className={tdCls}>{heatTemp != null ? `${heatTemp}℃` : ""}</td>
                  <td className={tdCls}>{inputQty != null ? `${inputQty}kg` : ""}</td>
                  <td className={tdCls}>
                    {result ? (
                      <span className={isPass ? "" : "text-red-600 font-bold"}>{isPass ? "☑ 적합" : "☑ 부적합"}</span>
                    ) : (
                      <span className="text-gray-400">□ 적합 □ 부적합</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* 개선조치 방법 (공정그룹 텍스트 우선, 없으면 표준 문구) */}
        <table className="w-full border-collapse border border-gray-600 mb-0">
          <tbody>
            <tr>
              <td className={`${bCls} px-2 py-1 font-medium bg-gray-50 text-center align-top`} style={{ width: "12%" }}>
                개선조치<br />방법
              </td>
              <td className={`${bCls} px-2 py-1 leading-relaxed`}>
                {correctiveActionText ? renderMultiline(correctiveActionText) : EMPTY_TEXT("개선조치 방법")}
              </td>
            </tr>
          </tbody>
        </table>

        {/* 한계기준 이탈내용 */}
        <table className="w-full border-collapse border border-gray-600">
          <thead>
            <tr>
              <th className={`${thCls} bg-gray-50`} style={{ width: "35%" }}>한계기준 이탈내용</th>
              <th className={`${thCls} bg-gray-50`} style={{ width: "35%" }}>개선조치 및 결과</th>
              <th className={`${thCls} bg-gray-50`} style={{ width: "15%" }}>조치자</th>
              <th className={`${thCls} bg-gray-50`} style={{ width: "15%" }}>확 인</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              const deviationRows = formRows.filter((r: any) => r.isDeviation || r.is_deviation);
              if (deviationRows.length > 0) {
                return deviationRows.map((row: any, idx: number) => (
                  <tr key={idx}>
                    <td className={tdCls}>{s(row.deviationNote || row.deviation_note) || ""}</td>
                    <td className={tdCls}>{s(row.correctiveAction || row.corrective_action) || ""}</td>
                    <td className={tdCls}>{s(row.actionBy || row.action_by) || ""}</td>
                    <td className={tdCls}>{s(row.confirmedBy || row.confirmed_by) || ""}</td>
                  </tr>
                ));
              }
              return (
                <tr><td className={tdCls} style={{ height: "30px" }}></td><td className={tdCls}></td><td className={tdCls}></td><td className={tdCls}></td></tr>
              );
            })()}
          </tbody>
        </table>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════
  // CCP-4P: 금속검출공정 (PDF 양식 기준 - 감도 모니터링 + 통과량 기록 2개 테이블)
  // ══════════════════════════════════════════════════════════
  if (ccpType === "CCP-4P") {
    // formRows를 분류: 'sensitivity' = 감도 모니터링, 'passage' = 통과량 기록
    // ★ equipment_type이 NULL인 경우도 데이터 패턴으로 자동 분류
    //    - sensitivity: metal_pass_time이 있고 pass_time_start가 없는 행
    //    - passage: pass_time_start 또는 pass_time_end가 있는 행
    const classifyRow = (r: any): "sensitivity" | "passage" | "unknown" => {
      const eqType = r.equipmentType || r.equipment_type;
      if (eqType === "sensitivity") return "sensitivity";
      if (eqType === "passage") return "passage";
      // equipment_type이 NULL인 경우 데이터 패턴으로 분류
      const hasPassageData = r.passTimeStart || r.pass_time_start || r.passTimeEnd || r.pass_time_end;
      // #275 재확인(2026-07): metal_fe_product / metal_sus_product 등 '제품통과' 감도 신호가
      //   기존 판정에서 빠져 있어, metal_pass_time·metal_fe_mid 가 NULL 이고 제품 컬럼만 채워진
      //   감도 행(form_record 1110 패턴)이 'unknown' 으로 누락 → 감도 테이블 빈 PDF. 신호 보강.
      const hasSensitivityData =
        r.metalPassTime || r.metal_pass_time ||
        r.metalFeMid || r.metal_fe_mid ||
        r.metalSusMid || r.metal_sus_mid ||
        r.metalFeProduct || r.metal_fe_product ||
        r.metalSusProduct || r.metal_sus_product ||
        r.metalProductOnly || r.metal_product_only;
      if (hasPassageData) return "passage";
      if (hasSensitivityData) return "sensitivity";
      return "unknown";
    };
    const sensitivityRows = hasFormRows
      ? formRows.filter((r: any) => classifyRow(r) === "sensitivity")
      : [];
    const passageRows = hasFormRows
      ? formRows.filter((r: any) => classifyRow(r) === "passage")
      : [];

    // 인쇄 시 A4 한 장에 맞추기 위해: 데이터 행 + 최소 1~2개 빈 행 (최대 6행)
    const SENSITIVITY_MIN = Math.min(6, Math.max(sensitivityRows.length + 1, 3));
    const PASSAGE_MIN = Math.min(6, Math.max(passageRows.length + 1, 2));

    const displaySensitivityRows = sensitivityRows.length > 0
      ? [...sensitivityRows, ...Array.from({ length: Math.max(0, SENSITIVITY_MIN - sensitivityRows.length) }, () => ({}))]
      : Array.from({ length: SENSITIVITY_MIN }, () => ({}));
    const displayPassageRows = passageRows.length > 0
      ? [...passageRows, ...Array.from({ length: Math.max(0, PASSAGE_MIN - passageRows.length) }, () => ({}))]
      : Array.from({ length: PASSAGE_MIN }, () => ({}));

    // 시간 포맷 헬퍼 (HH:mm:ss → HH:mm)
    // 통과량 = 생산량, 단위는 행에 저장된 것 (SKU 판매단위 또는 kg) — 단위 없는 과거 행은 숫자만
    const PASS_UNIT_LABEL: Record<string, string> = { pack: "팩", box: "상자", ea: "개", kg: "kg", bag: "봉", tray: "판" };
    const fmtPassQty = (q: any, u: any) => (q == null || q === "" ? "" : u ? `${q}${PASS_UNIT_LABEL[String(u)] ?? String(u)}` : String(q));
    const fmtTime = (v: any) => {
      if (!v) return "";
      const ts = String(v);
      return ts.length >= 5 ? ts.substring(0, 5) : ts;
    };

    return (
      <div className="text-xs" style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
        <TitleWithApproval
          title={ccpTypeLabels[ccpType]}
          subtitle={ccpSubtitle}
          doc={doc}
          infoLeft={<><span className="font-medium">점검일자:</span> {formatWorkDate(workDate)} &nbsp;&nbsp; <span className="font-medium">요일:</span> {getDayOfWeek(workDate)}</>}
        />

        {/* 한계기준 */}
        <table className="w-full border-collapse border border-gray-600 mb-0">
          <tbody>
            <tr>
              <td className={`${bCls} px-2 py-0.5 font-medium bg-gray-50 text-center`} rowSpan={2} style={{ width: "10%" }}>한계기준</td>
              <td className={`${bCls} px-2 py-0.5 text-center font-medium`} style={{ width: "15%" }}>감도</td>
              <td className={`${bCls} px-2 py-0.5 text-center`} colSpan={2}>Fe</td>
              <td className={`${bCls} px-2 py-0.5 text-center`} colSpan={2}>SUS</td>
            </tr>
            <tr>
              <td className={`${bCls} px-2 py-0.5 text-center`}>{clMetalSensitivity ?? "-"}</td>
              <td className={`${bCls} px-2 py-0.5 text-center`} colSpan={2}>{clMetalFe != null ? `${clMetalFe}mm\u03A6 이상 불검출` : "-"}</td>
              <td className={`${bCls} px-2 py-0.5 text-center`} colSpan={2}>{clMetalSus != null ? `${clMetalSus}mm\u03A6 이상 불검출` : "-"}</td>
            </tr>
          </tbody>
        </table>

        {/* 주기 */}
        <table className="w-full border-collapse border border-gray-600 mb-0">
          <tbody>
            <tr>
              <td className={`${bCls} px-2 py-0.5 font-medium bg-gray-50 text-center`} style={{ width: "10%" }}>주 기</td>
              <td className={`${bCls} px-2 py-0.5 text-[10px]`} colSpan={2}>{monitoringCycleText ? renderMultiline(monitoringCycleText) : EMPTY_TEXT("주기")}</td>
            </tr>
          </tbody>
        </table>

        {/* 모니터링 방법 - compact */}
        <table className="w-full border-collapse border border-gray-600 mb-0">
          <tbody>
            <tr>
              <td className={`${bCls} px-1 py-0 font-medium bg-gray-50 text-center align-top text-[7px]`} rowSpan={1} style={{ width: "6%" }}>모니터링<br/>방 법</td>
              <td className={`${bCls} px-1 py-0 text-[6.5px] leading-[1.1]`}>
                {/* 회사 공정그룹 문구 (2026-10-18 — 이전엔 특정 회사 문구 고정) */}
                {monitoringMethodText ? renderMultiline(monitoringMethodText) : EMPTY_TEXT("모니터링 방법")}
              </td>
            </tr>
          </tbody>
        </table>

        {/* ═══ 상단 테이블: 금속검출기 감도 모니터링 ═══ */}
        <table className="w-full border-collapse border border-gray-600 mb-0 ccp-print-table">
          <thead>
            <tr>
              <th className={thCls} colSpan={8} style={{ fontSize: "10px", padding: "2px" }}>
                금속검출기 감도 모니터링(검출 : O, 불검출 : X), 판정(적합, 부적합 해당사항에 &#10003; 체크)
              </th>
            </tr>
            <tr>
              <th className={thCls} rowSpan={2} style={{ width: "16%" }}>제품명</th>
              <th className={thCls} rowSpan={2} style={{ width: "9%" }}>통과<br/>시간</th>
              <th className={thCls} style={{ width: "9%" }}>Fe만<br/>통과</th>
              <th className={thCls} style={{ width: "9%" }}>SUS만<br/>통과</th>
              <th className={thCls} rowSpan={2} style={{ width: "9%" }}>제품만<br/>통과</th>
              <th className={thCls} style={{ width: "11%" }}>Fe+제품<br/>통과</th>
              <th className={thCls} style={{ width: "11%" }}>SUS+<br/>제품통과</th>
              <th className={thCls} rowSpan={2} style={{ width: "13%" }}>판 정</th>
            </tr>
            <tr>
              <th className={thCls} style={{ fontSize: "8px", padding: "1px" }}>(중간)</th>
              <th className={thCls} style={{ fontSize: "8px", padding: "1px" }}>(중간)</th>
              <th className={thCls} style={{ fontSize: "8px", padding: "1px" }}>(제품중<br/>양위)</th>
              <th className={thCls} style={{ fontSize: "8px", padding: "1px" }}>(제품중앙위)</th>
            </tr>
          </thead>
          <tbody>
            {displaySensitivityRows.map((row: any, idx: number) => {
              const result = row.result;
              const isPass = result === "적합";
              const isFail = result === "부적합";
              return (
                <tr key={`sens-${idx}`}>
                  <td className={`${tdCls} text-[10px]`}>{s(row.productName || row.product_name) || ""}</td>
                  <td className={tdCls}>{fmtTime(row.metalPassTime || row.metal_pass_time)}</td>
                  <td className={tdCls}>{s(row.metalFeMid || row.metal_fe_mid) || ""}</td>
                  <td className={tdCls}>{s(row.metalSusMid || row.metal_sus_mid) || ""}</td>
                  <td className={tdCls}>{s(row.metalProductOnly || row.metal_product_only) || ""}</td>
                  <td className={tdCls}>{s(row.metalFeProduct || row.metal_fe_product) || ""}</td>
                  <td className={tdCls}>{s(row.metalSusProduct || row.metal_sus_product) || ""}</td>
                  <td className={`${tdCls} text-[9px]`}>
                    {result ? (
                      <span className={isFail ? "text-red-600 font-bold" : ""}>
                        {isPass ? "\u2611 적 합" : isFail ? "\u2611 부적합" : result}
                      </span>
                    ) : (
                      <span className="text-gray-400">{"\u2610 적 합\n\u2610 부적합"}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* ═══ 하단 테이블: 통과량 기록 ═══ */}
        <table className="w-full border-collapse border border-gray-600 mb-0 ccp-print-table">
          <thead>
            <tr>
              <th className={thCls} style={{ width: "18%" }}>제품명</th>
              <th className={thCls} style={{ width: "14%" }}>최초통과시간</th>
              <th className={thCls} style={{ width: "14%" }}>통과종료시간</th>
              <th className={thCls} style={{ width: "12%" }}>통과량</th>
              <th className={thCls} style={{ width: "12%" }}>검출량(개)</th>
              <th className={thCls} style={{ width: "30%" }}>특이사항</th>
            </tr>
          </thead>
          <tbody>
            {displayPassageRows.map((row: any, idx: number) => (
              <tr key={`pass-${idx}`}>
                <td className={`${tdCls} text-[10px]`}>{s(row.productName || row.product_name) || ""}</td>
                <td className={tdCls}>{fmtTime(row.passTimeStart || row.pass_time_start)}</td>
                <td className={tdCls}>{fmtTime(row.passTimeEnd || row.pass_time_end)}</td>
                <td className={tdCls}>{fmtPassQty(row.passQty ?? row.pass_qty, row.passUnit ?? row.pass_unit)}</td>
                <td className={tdCls}>{row.detectedQty ?? row.detected_qty ?? ""}</td>
                <td className={`${tdCls} text-left text-[10px]`}>{s(row.specialNote || row.special_note) || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* 개선조치 방법 - compact */}
        <div className="ccp-corrective-section">
        <table className="w-full border-collapse border border-gray-600 mb-0">
          <tbody>
            <tr>
              <td className={`${bCls} px-1 py-0 font-medium bg-gray-50 text-center align-top text-[7px]`} rowSpan={1} style={{ width: "6%" }}>개선<br/>조치<br/>방법</td>
              <td className={`${bCls} px-1 py-0 text-[6.5px] leading-[1.1]`}>
                {correctiveActionText ? renderMultiline(correctiveActionText) : EMPTY_TEXT("개선조치 방법")}
              </td>
            </tr>
          </tbody>
        </table>
        </div>

        {/* 이탈내용 / 개선조치 */}
        <table className="w-full border-collapse border border-gray-600">
          <thead>
            <tr>
              <th className={`${thCls} bg-gray-50`} style={{ width: "12%" }}>발생일시</th>
              <th className={`${thCls} bg-gray-50`} style={{ width: "25%" }}>이탈내용</th>
              <th className={`${thCls} bg-gray-50`} style={{ width: "33%" }}>개선조치 및 결과</th>
              <th className={`${thCls} bg-gray-50`} style={{ width: "15%" }}>조치자</th>
              <th className={`${thCls} bg-gray-50`} style={{ width: "15%" }}>확인자</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              const deviationRows = formRows.filter((r: any) => r.isDeviation || r.is_deviation);
              if (deviationRows.length > 0) {
                return deviationRows.map((row: any, idx: number) => (
                  <tr key={idx}>
                    <td className={tdCls}>{s(row.measurementTime || row.measurement_time) || ""}</td>
                    <td className={tdCls}>{s(row.deviationNote || row.deviation_note) || ""}</td>
                    <td className={tdCls}>{s(row.correctiveAction || row.corrective_action) || ""}</td>
                    <td className={tdCls}>{s(row.actionBy || row.action_by) || ""}</td>
                    <td className={tdCls}>{s(row.confirmedBy || row.confirmed_by) || ""}</td>
                  </tr>
                ));
              }
              return (
                <tr><td className={tdCls} style={{ height: "24px" }}></td><td className={tdCls}></td><td className={tdCls}></td><td className={tdCls}></td><td className={tdCls}></td></tr>
              );
            })()}
          </tbody>
        </table>
      </div>
    );
  }

  // ── 기본 fallback (알 수 없는 CCP 타입)
  return (
    <div>
      <div className="text-center mb-4">
        <h2 className="text-xl font-bold">{ccpType} CCP 모니터링 기록지</h2>
      </div>
      <p className="text-gray-500 text-sm text-center">지원되지 않는 CCP 유형입니다.</p>
    </div>
  );
}

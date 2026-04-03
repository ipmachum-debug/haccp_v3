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
  const productName = s(fr.productName || fr.product_name);
  const workDate = s(fr.workDate || fr.work_date);
  const status = s(fr.status) || "draft";

  // CL 기준값
  const clHeatTimeLo = fr.clHeatTimeMinLo ?? fr.cl_heat_time_min_lo;
  const clHeatTimeHi = fr.clHeatTimeMinHi ?? fr.cl_heat_time_min_hi;
  const clHeatTempLo = fr.clHeatTempLo ?? fr.cl_heat_temp_lo;
  const clPressureMpaLo = fr.clPressureMpaLo ?? fr.cl_pressure_mpa_lo;
  const clMetalFe = fr.clFeMm ?? fr.cl_fe_mm;
  const clMetalSus = fr.clSusMm ?? fr.cl_sus_mm;
  const clMetalSensitivity = fr.clMetalSensitivity ?? fr.cl_metal_sensitivity;

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
      return days[new Date(d).getDay()];
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
    const clRows = uniqueEquipNames.length > 0
      ? uniqueEquipNames.map((name) => ({
          name: `${productName || "찹쌀떡류"}(${name})`,
          time: `${clHeatTimeLo || 10}분이상~${clHeatTimeHi || 15}분이하`,
          pressure: `${clPressureMpaLo || "0.16"}Mpa이상`,
          temp: `${clHeatTempLo || "90"}℃이상`,
        }))
      : [{ name: `${productName || "찹쌀떡류"}(교반기1)`, time: `${clHeatTimeLo || 10}분이상~${clHeatTimeHi || 15}분이하`, pressure: `${clPressureMpaLo || "0.16"}Mpa이상`, temp: `${clHeatTempLo || "90"}℃이상` }];

    // 8개 빈 행 (기록란)
    const displayRows = hasFormRows
      ? formRows
      : Array.from({ length: 8 }, (_, i) => ({ batchSeq: i + 1 }));

    return (
      <div className="text-xs">
        <TitleWithApproval
          title={ccpTypeLabels[ccpType]}
          subtitle={ccpSubLabels[ccpType]}
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
              <td className={`${bCls} px-2 py-1 font-bold`}>
                매 작업시마다, 같은품목 작업시 2시간마다, 품목 바뀔때마다
              </td>
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
                <div className="space-y-0.5">
                  <p>○ 가열시간 : 모니터링 담당자는 검교정된 타이머를 이용하여 시간을 확인일지에 기록</p>
                  <p>○ 품명 및 해당 품목 가열(증숙) 압력확인 - 압력계 수치 확인</p>
                  <p>○ 품명 및 해당 품목 가열(증숙) 시간확인 - 가열(증숙)시간을 타이머로 설정(setting)</p>
                  <p>○ 시루 최대 적재단수 3단이며 <u>제일 윗단 시루에 스팀이 올라오는 것</u></p>
                  <p>&nbsp;&nbsp;확인후 타이머 (세팅된 가열(증숙)시간) 작동</p>
                  <p>※ 품온 측정 : 스팀공급관에서 제일 끝시루</p>
                  <p>&nbsp;&nbsp;(스팀공급관에서 제일 끝시루) 상단시루에서 모서리 1곳과 중심부 1곳을 측정</p>
                  <p>○ 타이머로 설정된 시간 종료후 탐침온도계로 품온측정 및 측정시간 확인, 기록</p>
                </div>
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
              <th className={thCls} rowSpan={2} style={{ width: "10%" }}>교반기</th>
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
                <div className="space-y-0.5">
                  <p>○ 가열온도 또는 가열시간 미달 시</p>
                  <p>&nbsp;- 모니터링 담당자는 한계기준 이탈시 즉시 작업을 중지한다.</p>
                  <p>&nbsp;- 가열온도와 가열시간을 재조정한 후 미달된 제품에 대해 재가열을 실시하고</p>
                  <p>&nbsp;&nbsp;&nbsp;제품검사(관능)를 실시하여 이상이 없는 경우 다음 공정을 진행한다.</p>
                  <p>&nbsp;- 한계기준 이탈내용과 개선조치 내용을 모니터링 일지에 기록한다.</p>
                  <p>○ 가열온도 또는 가열시간 초과 시</p>
                  <p>&nbsp;- 모니터링 담당자는 한계기준 이탈시 즉시 작업을 중지한다.</p>
                  <p>&nbsp;- 제품검사(관능 등)를 실시하여 이상이 없는 경우 다음공정을 진행한다.</p>
                  <p>&nbsp;- 한계기준 이탈내용과 개선조치 내용을 모니터링 일지에 기록한다.</p>
                  <p>○ 기계고장 시</p>
                  <p>&nbsp;- 모니터링 담당자는 가열기 등 기계고장 시 즉시 작업을 중지한다.</p>
                  <p>&nbsp;- 수리 후 정상적으로 작동 시 재가동한다.</p>
                  <p>&nbsp;&nbsp;※ 즉각적인 수리가 불가능할 경우 교차오염이 되지 않도록 보호조치하여</p>
                  <p>&nbsp;&nbsp;&nbsp;&nbsp;냉장창고에 보관한후, 수리가 끝나면 제품 생산을 계속한다.</p>
                  <p>○ 공통 : 개선조치 시</p>
                  <p>&nbsp;- 문제 발생 시 HACCP팀장에게 보고 후 조치하며, 개선조치 후 모니터링 일지에</p>
                  <p>&nbsp;&nbsp;&nbsp;기록후 HACCP팀장에게 승인을 받는다.</p>
                </div>
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
          subtitle={ccpSubLabels[ccpType]}
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
            <tr>
              <td className={`${tdCls} bg-gray-50`}></td>
              <td className={tdCls}>{processGroupName || "오븐-굽기공정"}</td>
              <td className={tdCls}>{clHeatTimeLo != null ? `${clHeatTimeLo}분이상` : "-"}{clHeatTimeHi != null ? `~${clHeatTimeHi}분이하` : ""}</td>
              <td className={tdCls}>{clHeatTempLo != null ? `${clHeatTempLo}℃이상` : "-"}</td>
            </tr>
          </tbody>
        </table>

        <table className="w-full border-collapse border border-gray-600 mb-0">
          <tbody>
            <tr>
              <td className={`${bCls} px-2 py-1 font-bold bg-gray-50 text-center`} style={{ width: "12%" }}>주 기</td>
              <td className={`${bCls} px-2 py-1 font-bold`}>매 작업시마다, 같은품목 작업시 2시간마다, 품목 바뀔때마다</td>
            </tr>
          </tbody>
        </table>

        {/* 모니터링 기록 */}
        <table className="w-full border-collapse border border-gray-600 mb-0 ccp-print-table">
          <thead>
            <tr>
              <th className={thCls} style={{ width: "14%" }}>품 명</th>
              <th className={thCls} style={{ width: "10%" }}>측정시각</th>
              <th className={thCls} style={{ width: "14%" }}>오븐기</th>
              <th className={thCls} style={{ width: "12%" }}>가열시간(분)</th>
              <th className={thCls} style={{ width: "14%" }}>가열온도(℃)</th>
              <th className={thCls} style={{ width: "10%" }}>투입량(kg)</th>
              <th className={thCls} style={{ width: "12%" }}>
                판 정<br />(적합/부적합)
              </th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row: any, idx: number) => {
              const rowProductName = s(row.productName || row.product_name) || productName;
              const measureTime = s(row.measurementTime || row.measurement_time);
              const equipName = s(row.equipmentName || row.equipment_name);
              const heatTime = row.heatTimeMin ?? row.heat_time_min;
              const heatTemp = row.heatTempC ?? row.heat_temp_c;
              const inputQty = row.inputQtyKg ?? row.input_qty_kg;
              const result = row.result;
              const isPass = result === "적합" || result === "PASS";
              return (
                <tr key={idx}>
                  <td className={tdCls}>{rowProductName || ""}</td>
                  <td className={tdCls}>{measureTime || ":"}</td>
                  <td className={tdCls}>{equipName || ""}</td>
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
    // formRows를 equipment_type으로 분류: 'sensitivity' = 감도 모니터링, 'passage' = 통과량 기록
    const sensitivityRows = hasFormRows
      ? formRows.filter((r: any) => (r.equipmentType || r.equipment_type) === "sensitivity")
      : [];
    const passageRows = hasFormRows
      ? formRows.filter((r: any) => (r.equipmentType || r.equipment_type) === "passage")
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
    const fmtTime = (v: any) => {
      if (!v) return "";
      const ts = String(v);
      return ts.length >= 5 ? ts.substring(0, 5) : ts;
    };

    return (
      <div className="text-xs" style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
        <TitleWithApproval
          title={ccpTypeLabels[ccpType]}
          subtitle={ccpSubLabels[ccpType]}
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
              <td className={`${bCls} px-2 py-0.5 text-center`}>{clMetalSensitivity ?? 130}</td>
              <td className={`${bCls} px-2 py-0.5 text-center`} colSpan={2}>{clMetalFe != null ? `${clMetalFe}mm\u03A6 이상 불검출` : "2.0mm\u03A6 이상 불검출"}</td>
              <td className={`${bCls} px-2 py-0.5 text-center`} colSpan={2}>{clMetalSus != null ? `${clMetalSus}mm\u03A6 이상 불검출` : "3.0mm\u03A6 이상 불검출"}</td>
            </tr>
          </tbody>
        </table>

        {/* 주기 */}
        <table className="w-full border-collapse border border-gray-600 mb-0">
          <tbody>
            <tr>
              <td className={`${bCls} px-2 py-0.5 font-medium bg-gray-50 text-center`} rowSpan={2} style={{ width: "10%" }}>주 기</td>
              <td className={`${bCls} px-2 py-0.5 text-[10px]`} style={{ width: "45%" }}>금속검출기 정상작동 여부 확인</td>
              <td className={`${bCls} px-2 py-0.5 text-[10px]`} style={{ width: "45%" }}>품목 변경시 마다(시작시, 종료시), 동일품목 연속작업시 2시간 마다</td>
            </tr>
            <tr>
              <td className={`${bCls} px-2 py-0.5 text-[10px]`}>금속검출기에 의한 공정품 확인</td>
              <td className={`${bCls} px-2 py-0.5 text-[10px]`}>작업중 상시</td>
            </tr>
          </tbody>
        </table>

        {/* 모니터링 방법 - compact */}
        <table className="w-full border-collapse border border-gray-600 mb-0">
          <tbody>
            <tr>
              <td className={`${bCls} px-1 py-0 font-medium bg-gray-50 text-center align-top text-[7px]`} rowSpan={1} style={{ width: "6%" }}>모니터링<br/>방 법</td>
              <td className={`${bCls} px-1 py-0 text-[6.5px] leading-[1.1]`}>
                <span>&#9675; 감도확인 / &#9675; 벨트 중간 테스트피스(Fe,SUS) 통과→검출여부 확인,기록 / &#9675; 제품강도측정-제품통과→이물없음 확인, 테스트피스+제품 통과 확인,기록 / &#9675; 통과량·검출량 확인,기록</span>
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
              <th className={thCls} style={{ width: "12%" }}>통과량(개)</th>
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
                <td className={tdCls}>{row.passQty ?? row.pass_qty ?? ""}</td>
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
                <span>&#9675; 이물검출→작업중지,보류,제거,출처조사,기록 / &#9675; 감도이상→중지,재조정,재가동,재검사,기록 / &#9675; 고장→중지,수리재가동,불가시업체의뢰,미통과품재검사 / &#9675; 공통:HACCP팀장보고,조치기록,승인</span>
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

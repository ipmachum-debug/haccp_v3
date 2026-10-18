/**
 * 일일일지 v2 인쇄 — 기록의 정의 스냅샷 + 값으로 (2026-10-18, docs/architecture/17 D2)
 *
 * 영역마다 한 쪽. 구역·대상이 많으면 표가 여러 쪽으로 이어진다(머리글 반복, 글자를 줄여 우겨넣지 않음).
 * 기준·점검방법·주기·개선조치는 그 기록이 만들어질 때의 회사 설정 — 최신 설정을 다시 읽지 않는다.
 * 미기록은 '미기록', 실제 부적합만 '부적합', 0 은 0, 대상외는 사유. 승인 전 기록은 그렇다고 표시한다.
 */
import React from "react";
import { TitleWithApproval } from "./PrintHelpers";
import { buildDailyLogViewModelV2, type SectionVM } from "@shared/dailyLog/viewModelV2";
import { MEASURE_LABELS, MEASURE_UNITS } from "@shared/dailyLog/definition";
import type { DailyLogRecordV2 } from "@shared/dailyLog/recordV2";

type DocInfo = Record<string, any>;

const cell = "border border-gray-400 px-2 py-1 text-sm";
const head = "border border-gray-400 px-2 py-1 text-sm font-medium bg-gray-50";
const sec = "border border-gray-400 px-2 py-1 text-sm font-bold bg-blue-50";

/**
 * 표 폭 고정 (Codex PR595 F03): 전역 `table td { white-space: nowrap }` 와 인쇄 미리보기의 table-layout:auto 때문에
 * (행 높이: 전역 화면용 `table tr { height: 36px }` 이 인쇄에도 적용돼 위생 18문항 첫 쪽이 넘쳤다 — 내용 높이로, Codex PR596 실제 PDF)
 * 긴 질문·발생내용이 한 줄로 남아 표가 종이 밖으로 넘쳤다. v2 일지 표만:
 *   칸 폭 고정(시각·수치·판정은 좁게, 설명은 나머지) + 줄바꿈 + 행 단위로 다음 쪽(머리글 반복). 글자를 줄여 우겨넣지 않는다.
 */
const PRINT_CSS = `
.dlv2-print table { table-layout: fixed !important; width: 100% !important; }
.dlv2-print th, .dlv2-print td { white-space: normal !important; overflow-wrap: anywhere; word-break: normal; }
.dlv2-print th { overflow-wrap: normal; word-break: keep-all; }
.dlv2-print tr { height: auto !important; }
.dlv2-print td, .dlv2-print th { padding-top: 4px !important; padding-bottom: 4px !important; }
.dlv2-print thead { display: table-header-group; }
.dlv2-print tr { break-inside: avoid; page-break-inside: avoid; }
`;
const Cols = ({ w }: { w: Array<string | null> }) => <colgroup>{w.map((x, i) => <col key={i} style={x ? { width: x } : undefined} />)}</colgroup>;
const verdictCls = (v: string | null) => (v === "부적합" ? " text-red-700 font-medium" : v === "미기록" ? " text-gray-400" : "");

const STATUS_NOTE: Record<string, string> = {
  draft: "작성 중 — 승인 전 기록입니다",
  submitted: "검토 대기 — 승인 전 기록입니다",
  rejected: "반려됨 — 승인 전 기록입니다",
};

function SectionPage({ s, doc, date }: { s: SectionVM; doc?: DocInfo; date: string }) {
  const statusNote = doc?.status && doc.status !== "approved" ? STATUS_NOTE[doc.status] ?? "승인 전 기록입니다" : null;
  return (
    <div className="dlv2-print">
      <style>{PRINT_CSS}</style>
      <TitleWithApproval title={s.title} doc={doc} infoLeft={<><span className="font-medium">일자:</span> {date} &nbsp;&nbsp; <span className="font-medium">작성자:</span> {doc?.authorName || "-"}</>} />
      {statusNote && <div className="mb-2 border border-amber-400 bg-amber-50 px-2 py-1 text-xs text-amber-800">{statusNote}</div>}
      {s.info && (s.info.criteriaText || s.info.method || s.info.actions.length > 0) && (
        <div className="border border-gray-400 rounded p-3 mb-3 bg-gray-50 text-xs space-y-1">
          {s.info.criteriaText && <p><span className="font-bold">관리기준:</span> {s.info.criteriaText}</p>}
          {(s.info.method || s.info.cycle) && <p><span className="font-bold">점검방법:</span> {[s.info.method, s.info.cycle].filter(Boolean).join(" | ")}</p>}
          {s.info.actions.length > 0 && <><p className="font-bold mt-2">개선조치사항:</p>{s.info.actions.map((a, i) => <p key={i}>{a}</p>)}</>}
        </div>
      )}
      {s.checks && (
        <table className="w-full border-collapse border border-gray-400 text-sm">
          <Cols w={s.section === "hygiene" ? ["64px", "72px", null, "72px"] : ["96px", null, "72px"]} />
          <thead>
            <tr className="bg-blue-100">
              <th className={head}>구분</th>
              {s.section === "hygiene" && <th className={head}>분류</th>}
              <th className={head}>점검 내용</th>
              <th className={head}>기록</th>
            </tr>
          </thead>
          <tbody>
            {s.checks.map((c, i) => {
              const groupKey = s.section === "hygiene" ? c.stage : c.category;
              const first = i === 0 || (s.section === "hygiene" ? s.checks![i - 1].stage : s.checks![i - 1].category) !== groupKey;
              const span = first ? (s.checks!.slice(i).findIndex((x, k) => k > 0 && (s.section === "hygiene" ? x.stage : x.category) !== groupKey)) : 0;
              const rows = first ? (span === -1 ? s.checks!.length - i : span) : 0;
              return (
                <tr key={c.itemId}>
                  {first && <td className={sec} rowSpan={rows}>{groupKey || "-"}</td>}
                  {s.section === "hygiene" && <td className={cell}>{c.category || "-"}</td>}
                  <td className={cell}>{c.order}. {c.text}</td>
                  <td className={cell + " text-center" + verdictCls(c.verdict)}>
                    {/* 한 줄 — '적합 · 0℃' (첫 쪽 세로 공간) */}
                    {[c.verdict, c.tempText].filter(Boolean).join(" · ")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {s.measures && (
        <table className="w-full border-collapse border border-gray-400 text-sm">
          <Cols w={[null, "56px", "76px", ...s.kinds!.map(() => "68px"), "136px", "60px"]} />
          <thead>
            <tr className="bg-blue-100">
              <th className={head}>구역 / 대상</th>
              <th className={head}>회차</th>
              <th className={head}>감시시작</th>
              {s.kinds!.map((k) => <th key={k} className={head}>{MEASURE_LABELS[k]} ({MEASURE_UNITS[k]})</th>)}
              <th className={head}>기준</th>
              <th className={head}>평가</th>
            </tr>
          </thead>
          <tbody>
            {s.measures.map((m) => (
              <tr key={m.rowId}>
                <td className={cell}>{m.zone && m.zone !== m.point ? `${m.zone} · ` : ""}{m.point}</td>
                <td className={cell + " text-center"}>{m.slot}</td>
                <td className={cell + " text-center"}>{m.measuredAt || "-"}</td>
                {s.kinds!.map((k) => <td key={k} className={cell + " text-center"}>{m.values[k] || "-"}</td>)}
                <td className={cell + " text-xs"}>{m.criteria}</td>
                <td className={cell + " text-center" + verdictCls(m.verdict)}>{m.verdict}{m.naReason ? <><br /><span className="text-xs">({m.naReason})</span></> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="mt-2 text-sm font-medium">이상 발생 내용</div>
      <table className="w-full border-collapse border border-gray-400 text-sm mt-1">
        <Cols w={[null, null, "84px", "56px", "64px", "64px"]} />
        <thead><tr className="bg-gray-50"><th className={head}>발생내용</th><th className={head}>조치내용 및 결과</th><th className={head}>완료일자</th><th className={head}>상태</th><th className={head}>조치자</th><th className={head}>확인자</th></tr></thead>
        <tbody>
          {s.deviations.length ? s.deviations.map((d) => (
            <tr key={d.deviationId}>
              <td className={cell}>{d.description || "-"}</td>
              <td className={cell}>{[d.action, d.result].filter(Boolean).join(" → ") || "-"}</td>
              <td className={cell}>{d.completedAt || "-"}</td>
              <td className={cell + (d.state === "open" ? " text-red-700" : "")}>{d.state === "open" ? "조치 중" : "완료"}</td>
              <td className={cell}>{d.actionBy || "-"}</td>
              <td className={cell}>{d.confirmedBy || "-"}</td>
            </tr>
          )) : <tr><td className={cell + " text-center text-gray-400"} colSpan={6}>없음</td></tr>}
        </tbody>
      </table>
      {s.notes && (s.notes.specialNotes || s.notes.improvementAction) && (
        // 한 행 — 첫 쪽(위생 18문항)이 꽉 차 있어 두 행이면 마지막 행만 다음 장으로 넘어갔다 (Codex PR596 실제 PDF)
        <table className="w-full border-collapse border border-gray-400 text-sm mt-2">
          <Cols w={["72px", null, "96px", null]} />
          <tbody>
            <tr>
              <td className={head}>특이사항</td><td className={cell}>{s.notes.specialNotes || "-"}</td>
              <td className={head}>개선조치 및 결과</td><td className={cell}>{s.notes.improvementAction || "-"}</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

/** 영역마다 한 쪽 — [제목, 내용] */
export function renderDailyLogV2Pages(data: DailyLogRecordV2, doc?: DocInfo): Array<{ title: string; content: React.ReactNode }> {
  const vm = buildDailyLogViewModelV2(data);
  return vm.sections.map((s) => ({ title: s.title, content: <SectionPage key={s.section} s={s} doc={doc} date={vm.businessDate} /> }));
}

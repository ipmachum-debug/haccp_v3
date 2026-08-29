/**
 * ★ PR-PP (2026-05-28): 주간 생산계획표 — 미미스 프로토타입 React 이식
 *
 * 특징:
 *   - DashboardLayout 없는 독립 페이지 (/plan) — 별도 URL 운영 가능
 *   - 주 단위 카드 7일, 행 단위 수정, 일별/주간 메모
 *   - localStorage 대신 tRPC + MySQL JSON payload 영구화
 *   - 자동 저장 (debounce 1초)
 *   - 인쇄 (window.print) — A4 portrait
 *   - JSON 백업/복원 (옵션, 기간 export)
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type Proc = "교반" | "증숙";

interface Row {
  proc: Proc;
  item: string;
  client: string;
  qty: string;
  staff: string;
  note: string;
}

interface Day {
  rows: Row[];
  notes: string;
}

interface Payload {
  days: Day[]; // length 7
}

const DAYS_LABEL = ["월", "화", "수", "목", "금", "토", "일"];

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtShort(d: Date): string {
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function isoWeek(d: Date): number {
  const t = new Date(d.valueOf());
  t.setHours(0, 0, 0, 0);
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
  const w1 = new Date(t.getFullYear(), 0, 4);
  return 1 + Math.round(((t.getTime() - w1.getTime()) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7);
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function emptyRow(): Row {
  return { proc: "증숙", item: "", client: "", qty: "", staff: "", note: "" };
}

function emptyPayload(): Payload {
  return {
    days: Array.from({ length: 7 }, () => ({ rows: [emptyRow()], notes: "" })),
  };
}

function dayTotal(day: Day): number {
  return day.rows.reduce((s, r) => {
    const n = parseFloat(r.qty);
    return s + (isNaN(n) ? 0 : n);
  }, 0);
}

function fmtNum(n: number): string {
  if (!n) return "0";
  return String(Math.round(n * 10) / 10);
}

export default function ProductionPlan() {
  const [currentMonday, setCurrentMonday] = useState<Date>(() => startOfWeek(new Date()));
  const [payload, setPayload] = useState<Payload>(() => emptyPayload());
  const [author, setAuthor] = useState("");
  const [weeklyNotes, setWeeklyNotes] = useState("");
  const [saveStatus, setSaveStatus] = useState<string>("");

  const todayDate = useMemo(() => new Date(), []);
  const weekMonday = fmtDate(currentMonday);

  const utils = trpc.useUtils();
  const getQuery = trpc.productionPlan.get.useQuery({ weekMonday }, { staleTime: 0 });
  const upsertMutation = trpc.productionPlan.upsert.useMutation();
  const copyMutation = trpc.productionPlan.copyPreviousWeek.useMutation();
  const clearMutation = trpc.productionPlan.clear.useMutation();

  // 서버 데이터 동기화
  useEffect(() => {
    const d = getQuery.data;
    if (d) {
      setPayload(d.payload as Payload);
      setAuthor(d.author || "");
      setWeeklyNotes(d.weeklyNotes || "");
    }
  }, [getQuery.data, weekMonday]);

  // 자동 저장 (debounced 1s)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);
  useEffect(() => {
    if (!dirtyRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        await upsertMutation.mutateAsync({ weekMonday, payload, author, weeklyNotes });
        setSaveStatus("저장됨 ✓");
        setTimeout(() => setSaveStatus(""), 1500);
        dirtyRef.current = false;
      } catch (e: any) {
        setSaveStatus("저장 실패");
        toast.error("저장 실패: " + e.message);
      }
    }, 1000);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [payload, author, weeklyNotes, weekMonday]);

  function markDirty() {
    dirtyRef.current = true;
  }

  // ─── 행 변경 헬퍼 ───
  function updateRow(dayIdx: number, rowIdx: number, field: keyof Row, value: string) {
    setPayload((p) => {
      const next = { ...p, days: [...p.days] };
      const day = { ...next.days[dayIdx] };
      day.rows = [...day.rows];
      day.rows[rowIdx] = { ...day.rows[rowIdx], [field]: value as Row[typeof field] };
      next.days[dayIdx] = day;
      return next;
    });
    markDirty();
  }

  function addRow(dayIdx: number) {
    setPayload((p) => {
      const next = { ...p, days: [...p.days] };
      const day = { ...next.days[dayIdx] };
      day.rows = [...day.rows, emptyRow()];
      next.days[dayIdx] = day;
      return next;
    });
    markDirty();
  }

  function deleteRow(dayIdx: number, rowIdx: number) {
    setPayload((p) => {
      const next = { ...p, days: [...p.days] };
      const day = { ...next.days[dayIdx] };
      if (day.rows.length <= 1) {
        day.rows = [emptyRow()];
      } else {
        day.rows = day.rows.filter((_, i) => i !== rowIdx);
      }
      next.days[dayIdx] = day;
      return next;
    });
    markDirty();
  }

  function updateDayNotes(dayIdx: number, value: string) {
    setPayload((p) => {
      const next = { ...p, days: [...p.days] };
      next.days[dayIdx] = { ...next.days[dayIdx], notes: value };
      return next;
    });
    markDirty();
  }

  // ─── 네비게이션 ───
  function goPrev() {
    const d = new Date(currentMonday);
    d.setDate(d.getDate() - 7);
    setCurrentMonday(d);
    dirtyRef.current = false;
  }
  function goNext() {
    const d = new Date(currentMonday);
    d.setDate(d.getDate() + 7);
    setCurrentMonday(d);
    dirtyRef.current = false;
  }
  function goThis() {
    setCurrentMonday(startOfWeek(new Date()));
    dirtyRef.current = false;
  }

  // ─── 운영 기능 ───
  async function copyPrevious() {
    try {
      const result = await copyMutation.mutateAsync({ weekMonday });
      if (!result.success) {
        toast.warning(result.message || "지난 주 데이터 없음");
        return;
      }
      setPayload(result.payload as Payload);
      markDirty();
      toast.success("지난 주 SKU/거래처 복사 완료 (수량 비움)");
    } catch (e: any) {
      toast.error("복사 실패: " + e.message);
    }
  }

  async function clearWeek() {
    if (!confirm("이번 주 입력값을 모두 비울까요?")) return;
    try {
      await clearMutation.mutateAsync({ weekMonday });
      setPayload(emptyPayload());
      setAuthor("");
      setWeeklyNotes("");
      dirtyRef.current = false;
      await utils.productionPlan.get.invalidate({ weekMonday });
      toast.success("초기화 완료");
    } catch (e: any) {
      toast.error("초기화 실패: " + e.message);
    }
  }

  async function exportBackup() {
    try {
      const rows = await utils.productionPlan.exportRange.fetch({});
      const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `생산계획표_백업_${fmtDate(new Date())}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${rows.length}주 백업 완료`);
    } catch (e: any) {
      toast.error("백업 실패: " + e.message);
    }
  }

  function printPage() {
    window.print();
  }

  // ─── 렌더 ───
  const dates = useMemo(
    () =>
      DAYS_LABEL.map((_, i) => {
        const d = new Date(currentMonday);
        d.setDate(d.getDate() + i);
        return d;
      }),
    [currentMonday],
  );

  return (
    <div className="pp-root">
      <style>{`
        .pp-root { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif; color: #1a1a1a; background: #f7f7f5; min-height: 100vh; padding: 20px; }
        .pp-container { max-width: 1000px; margin: 0 auto; }
        .pp-h1 { font-size: 22px; font-weight: 500; margin: 0 0 16px; }
        .pp-toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 1rem; flex-wrap: wrap; }
        .pp-toolbar .week-label { font-size: 18px; font-weight: 500; margin-right: auto; display: flex; align-items: center; gap: 6px; }
        .pp-toolbar button { padding: 6px 12px; font-size: 13px; cursor: pointer; background: white; border: 0.5px solid rgba(0,0,0,0.15); border-radius: 8px; font-family: inherit; color: inherit; transition: background 0.15s; }
        .pp-toolbar button:hover { background: #f0f0ed; }
        .pp-toolbar button:active { transform: scale(0.98); }
        .pp-toolbar button:disabled { opacity: 0.5; cursor: not-allowed; }
        .pp-save-status { font-size: 12px; color: #8b8b85; margin-left: 8px; }
        .pp-meta { display: grid; grid-template-columns: 1fr 2fr; gap: 12px; margin-bottom: 1rem; }
        .pp-meta label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #6b6b66; }
        .pp-meta input { font: inherit; padding: 6px 8px; border: 0.5px solid rgba(0,0,0,0.15); border-radius: 8px; background: white; color: #1a1a1a; }
        .day-card { background: white; border: 0.5px solid rgba(0,0,0,0.15); border-radius: 12px; padding: 12px 14px; margin-bottom: 12px; }
        .day-card.is-sat { border-left: 3px solid #378ADD; }
        .day-card.is-sun { border-left: 3px solid #E24B4A; }
        .day-card.is-today { border: 2px solid #378ADD; }
        .day-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
        .day-head .dow { font-size: 18px; font-weight: 500; }
        .day-head .date { font-size: 13px; color: #6b6b66; }
        .today-tag { font-size: 11px; padding: 2px 8px; border-radius: 10px; background: #E6F1FB; color: #0C447C; font-weight: 500; }
        .day-head .day-sum { margin-left: auto; font-size: 13px; color: #6b6b66; }
        .day-head .day-sum strong { color: #1a1a1a; font-weight: 500; }
        .day-head .day-notes { flex: 1 1 100%; }
        .day-head .day-notes input { width: 100%; box-sizing: border-box; font: inherit; padding: 4px 6px; border: 0.5px solid rgba(0,0,0,0.15); border-radius: 8px; background: transparent; color: #1a1a1a; font-size: 12px; }
        .ppc-table { width: 100%; border-collapse: collapse; font-size: 13px; table-layout: fixed; }
        .ppc-table th, .ppc-table td { border: 0.5px solid rgba(0,0,0,0.15); padding: 4px 6px; vertical-align: middle; }
        .ppc-table thead th { background: #f0f0ed; font-weight: 500; font-size: 12px; color: #6b6b66; text-align: left; }
        .ppc-table th.c-proc { width: 70px; text-align: center; }
        .ppc-table th.c-item { width: 28%; }
        .ppc-table th.c-client { width: 18%; }
        .ppc-table th.c-qty { width: 80px; text-align: right; }
        .ppc-table th.c-staff { width: 80px; }
        .ppc-table th.c-del { width: 28px; }
        .ppc-table td input, .ppc-table td select { width: 100%; box-sizing: border-box; border: none; background: transparent; padding: 4px 2px; font: inherit; color: inherit; outline: none; }
        .ppc-table td input.num { text-align: right; }
        .ppc-table td input:focus, .ppc-table td select:focus { background: #FFF7D6; }
        .ppc-table td.proc-cell { text-align: center; padding: 2px; }
        .ppc-table td.proc-cell select { text-align: center; font-size: 12px; font-weight: 500; }
        .ppc-table td.proc-cell.is-kyo { background: #EEEDFE; }
        .ppc-table td.proc-cell.is-kyo select { color: #3C3489; }
        .ppc-table td.proc-cell.is-jeung { background: #E1F5EE; }
        .ppc-table td.proc-cell.is-jeung select { color: #085041; }
        .ppc-row-del { width: 24px; padding: 0 !important; text-align: center; }
        .ppc-row-del button { border: none; background: transparent; color: #8b8b85; cursor: pointer; font-size: 14px; line-height: 1; padding: 4px; }
        .ppc-row-del button:hover { color: #A32D2D; }
        .ppc-add-row { padding: 5px 10px; font-size: 12px; margin-top: 6px; background: white; border: 0.5px solid rgba(0,0,0,0.15); border-radius: 8px; cursor: pointer; font-family: inherit; }
        .ppc-add-row:hover { background: #f0f0ed; }
        @media print {
          .pp-root { background: white !important; padding: 0; }
          .pp-container { max-width: none; }
          .pp-toolbar, .ppc-add-row, .ppc-row-del, .pp-save-status { display: none !important; }
          .pp-h1 { font-size: 14px; margin-bottom: 6px; }
          .day-card { page-break-inside: avoid; margin-bottom: 6px; padding: 6px 8px; border: 0.5px solid #999 !important; }
          .day-card.is-today { border: 0.5px solid #999 !important; }
          .day-head { margin-bottom: 4px; }
          .day-head .dow { font-size: 13px; }
          .day-head .date { font-size: 11px; }
          .ppc-table { font-size: 10px; }
          .ppc-table th, .ppc-table td { padding: 2px 4px; }
          .ppc-table td input, .ppc-table td select { padding: 1px; }
          .pp-meta { margin-bottom: 6px; }
          .pp-meta input { padding: 2px 4px; font-size: 10px; }
          @page { size: A4 portrait; margin: 8mm; }
        }
      `}</style>

      <div className="pp-container">
        <h1 className="pp-h1">📋 주간 생산계획표</h1>

        <div className="pp-toolbar">
          <div className="week-label">
            📅 {currentMonday.getFullYear()}년 {isoWeek(currentMonday)}주차{" "}
            <span style={{ color: "#6b6b66", fontWeight: 400, fontSize: 14 }}>
              ({dates[0].getMonth() + 1}/{dates[0].getDate()} ~ {dates[6].getMonth() + 1}/{dates[6].getDate()})
            </span>
          </div>
          <button onClick={goPrev}>◀ 이전</button>
          <button onClick={goThis}>이번 주</button>
          <button onClick={goNext}>다음 ▶</button>
          <button onClick={copyPrevious} title="지난 주 SKU/거래처 그대로 가져오기 (수량 비움)" disabled={copyMutation.isPending}>
            📋 지난 주 복사
          </button>
          <button onClick={printPage}>🖨 인쇄</button>
          <button onClick={exportBackup} title="전체 주차 JSON 백업">⬇ 백업</button>
          <button onClick={clearWeek} title="이번 주 전체 초기화" disabled={clearMutation.isPending}>🗑 초기화</button>
          <span className="pp-save-status">{saveStatus}</span>
        </div>

        <div className="pp-meta">
          <label>
            작성자
            <input
              type="text"
              value={author}
              onChange={(e) => { setAuthor(e.target.value); markDirty(); }}
              placeholder="이름"
            />
          </label>
          <label>
            주간 공지 / 특이사항
            <input
              type="text"
              value={weeklyNotes}
              onChange={(e) => { setWeeklyNotes(e.target.value); markDirty(); }}
              placeholder="예: 화요일 공휴일, 금요일 위생점검"
            />
          </label>
        </div>

        {DAYS_LABEL.map((dow, i) => {
          const d = dates[i];
          const day = payload.days[i];
          const isToday = sameDay(d, todayDate);
          const classes = ["day-card"];
          if (i === 5) classes.push("is-sat");
          if (i === 6) classes.push("is-sun");
          if (isToday) classes.push("is-today");
          return (
            <div key={i} className={classes.join(" ")}>
              <div className="day-head">
                <span className="dow">{dow}요일</span>
                <span className="date">{fmtShort(d)}</span>
                {isToday && <span className="today-tag">오늘</span>}
                <span className="day-sum">
                  합계 <strong>{fmtNum(dayTotal(day))}</strong>
                </span>
                <div className="day-notes">
                  <input
                    type="text"
                    value={day.notes || ""}
                    onChange={(e) => updateDayNotes(i, e.target.value)}
                    placeholder="이 날 메모 (예: 공휴일, 인력 편성)"
                  />
                </div>
              </div>
              <table className="ppc-table">
                <thead>
                  <tr>
                    <th className="c-proc">공정</th>
                    <th className="c-item">품목</th>
                    <th className="c-client">거래처</th>
                    <th className="c-qty">수량</th>
                    <th className="c-staff">인력</th>
                    <th>비고</th>
                    <th className="c-del"></th>
                  </tr>
                </thead>
                <tbody>
                  {day.rows.map((r, idx) => {
                    const procClass = r.proc === "교반" ? "is-kyo" : "is-jeung";
                    return (
                      <tr key={idx}>
                        <td className={`proc-cell ${procClass}`}>
                          <select value={r.proc} onChange={(e) => updateRow(i, idx, "proc", e.target.value)}>
                            <option value="교반">교반</option>
                            <option value="증숙">증숙</option>
                          </select>
                        </td>
                        <td>
                          <input
                            value={r.item}
                            onChange={(e) => updateRow(i, idx, "item", e.target.value)}
                            placeholder={r.proc === "교반" ? "예: 찹쌀반죽" : "예: 우유설기"}
                          />
                        </td>
                        <td>
                          <input
                            value={r.client}
                            onChange={(e) => updateRow(i, idx, "client", e.target.value)}
                            placeholder="거래처"
                          />
                        </td>
                        <td>
                          <input
                            className="num"
                            value={r.qty}
                            onChange={(e) => updateRow(i, idx, "qty", e.target.value)}
                            inputMode="decimal"
                            placeholder="-"
                          />
                        </td>
                        <td>
                          <input
                            value={r.staff}
                            onChange={(e) => updateRow(i, idx, "staff", e.target.value)}
                            placeholder="-"
                          />
                        </td>
                        <td>
                          <input
                            value={r.note}
                            onChange={(e) => updateRow(i, idx, "note", e.target.value)}
                            placeholder="-"
                          />
                        </td>
                        <td className="ppc-row-del">
                          <button onClick={() => deleteRow(i, idx)} title="삭제">✕</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <button className="ppc-add-row" onClick={() => addRow(i)}>+ 품목 추가</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

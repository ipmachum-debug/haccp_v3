/**
 * 결재란 — 공통 (2026-10-15, 대표 요청)
 *
 * 이전: 4줄 (작 성/검 토/승 인 → 직인 → 이름 → 작성자/검토자/승인자) — 역할과 이름이 위·아래로 두 번씩, 칸도 컸다.
 * 지금: 종이 결재란처럼 2줄. 왼쪽 세로 "결재" + [역할 한 번] + [직인 한 칸]
 *   - 결재 완료: 붉은 원 직인 안에 이름, 아래에 짧은 날짜 (10.15)
 *   - 결재 전: 예정자 이름을 회색 글자로 (없으면 —)
 * 공통 양식(ChecklistFormLayout)·건강일지가 같은 컴포넌트를 쓴다.
 */
export type StampInfo = {
  writerName?: string | null; reviewerName?: string | null; approverName?: string | null;
  writerApproved?: boolean; reviewerApproved?: boolean; approverApproved?: boolean;
  writerDate?: string | null; reviewerDate?: string | null; approverDate?: string | null;
};

const ROLES = [
  { key: "writer", label: "작성" },
  { key: "reviewer", label: "검토" },
  { key: "approver", label: "승인" },
] as const;

/** "2026. 10. 15." / "2026-10-15" → "10.15" (그 외는 그대로) */
export function shortStampDate(d: string | null | undefined): string {
  if (!d) return "";
  const m = String(d).match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  return m ? `${Number(m[2])}.${String(Number(m[3])).padStart(2, "0")}` : String(d);
}

/** 직인 칸 내용 — 화면 결재란·인쇄 결재란 공통 (결재 완료: 원 안 이름 + 짧은 날짜 / 결재 전: 예정자 회색) */
/**
 * 도장 안 글자 — 이름이 잘려 누가 결재했는지 모르게 되지 않도록 (2026-10-20 신규 회사 시험: '생산…' 으로 잘림).
 *   3자 이하 = 한 줄, 4~6자 = 두 줄로 나눠 도장 안에, 7자 이상 = 도장에는 '인' · 이름 전체는 도장 아래에 줄바꿈해 적는다.
 */
export function stampLines(name?: string | null): { inStamp: string[]; below: string | null } {
  const n = String(name ?? "").trim();
  if (!n) return { inStamp: ["인"], below: null };
  const chars = Array.from(n);
  if (chars.length <= 3) return { inStamp: [n], below: null };
  if (chars.length <= 6) { const h = Math.ceil(chars.length / 2); return { inStamp: [chars.slice(0, h).join(""), chars.slice(h).join("")], below: null }; }
  return { inStamp: ["인"], below: n };
}

export function StampCellContent({ name, done, date }: { name?: string | null; done: boolean; date?: string | null }) {
  const d = shortStampDate(date);
  const lines = stampLines(name);
  return done ? (
    <div className="flex flex-col items-center gap-0.5 overflow-hidden" title={name ?? undefined}>
      <span className="flex h-9 w-9 flex-col items-center justify-center rounded-full border-[1.5px] border-red-500 font-bold leading-[1.05] text-red-600 print:border-red-600" data-testid="stamp-circle">
        {lines.inStamp.map((l, i) => <span key={i} className={lines.inStamp.length > 1 ? "text-[8px]" : "text-[10px]"}>{l}</span>)}
      </span>
      {/* 표 칸 전체에 걸린 '줄바꿈 금지'(index.css table td nowrap)를 여기서 풀어 이름이 옆 결재 칸으로 넘치지 않게 — 칸 폭 안에서 줄바꿈 */}
      {lines.below && <span className="block w-full max-w-[44px] whitespace-normal break-all text-center text-[8px] leading-tight text-red-700" style={{ overflowWrap: "anywhere" }} data-testid="stamp-fullname">{lines.below}</span>}
      {d && <span className="text-[9px] tabular-nums text-gray-500">{d}</span>}
    </div>
  ) : (
    <span className="block max-w-[44px] whitespace-normal break-all text-[10px] text-gray-400" style={{ overflowWrap: "anywhere" }}>{name || "—"}</span>
  );
}

export function ApprovalStampBox({ approval }: { approval: StampInfo }) {
  return (
    <table className="border-collapse text-[11px] leading-tight" data-testid="approval-stamp-box" aria-label="결재란">
      <tbody>
        <tr>
          <th rowSpan={2} scope="row" style={{ width: 20 }} className="border border-gray-400 bg-gray-50 px-0.5 text-center text-[10px] font-semibold text-gray-600 [writing-mode:vertical-rl]">
            결재
          </th>
          {ROLES.map((r) => (
            <th key={r.key} scope="col" className="w-14 border border-gray-400 bg-gray-50 py-0.5 text-center text-[10px] font-semibold text-gray-600">
              {r.label}
            </th>
          ))}
        </tr>
        <tr>
          {ROLES.map((r) => {
            const name = (approval[`${r.key}Name`] ?? "") as string;
            const done = !!approval[`${r.key}Approved`];
            return (
              <td key={r.key} className="h-[52px] w-14 border border-gray-400 p-0.5 text-center align-middle" data-testid={`stamp-${r.key}`}>
                <StampCellContent name={name} done={done} date={approval[`${r.key}Date`] as string | null | undefined} />
              </td>
            );
          })}
        </tr>
      </tbody>
    </table>
  );
}

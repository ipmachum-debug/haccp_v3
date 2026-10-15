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
export function StampCellContent({ name, done, date }: { name?: string | null; done: boolean; date?: string | null }) {
  const d = shortStampDate(date);
  return done ? (
    <div className="flex flex-col items-center gap-0.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-full border-[1.5px] border-red-500 text-[10px] font-bold leading-none text-red-600 print:border-red-600">
        <span className="max-w-[30px] truncate">{name || "인"}</span>
      </span>
      {d && <span className="text-[9px] tabular-nums text-gray-500">{d}</span>}
    </div>
  ) : (
    <span className="text-[10px] text-gray-400">{name || "—"}</span>
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

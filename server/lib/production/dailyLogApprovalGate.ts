/**
 * 일일일지(daily_log) 승인 관문 — 모든 검토·승인 전이 경로 공통 (2026-10-15, Codex 일일일지 감사 P1)
 *
 * 사고: 측정 14칸·측정시각 8칸이 모두 빈 일지(#863 10/08, #872 10/12)가 승인완료.
 *   검사는 saveFullForm(제출)·reviewApprovalRequest 두 곳에만 있었고, 실제 승인 화면이 부르는
 *   genericChecklist 의 검토·승인·일괄·바로승인은 검사 없이 상태·직인을 바꿨다.
 *   자동 생성 일지는 기록은 draft 인데 요청은 pending_review 로 만들어져 바로 승인 목록에 뜬다.
 *
 * 규칙
 *   - 요청 → 문서를 회사(tenant_id)로 확인하고, 문서 종류가 daily_log 일 때만 검사한다 (request_type 문자열에 의존하지 않음).
 *   - 빈 값·숫자 아님·입력 범위 밖·실제 측정시각 없음이면 막는다 (shared/dailyLogMeasurements.findMeasurementIssues).
 *   - 기준 밖 실측값은 막지 않는다 — 값은 그대로 두고 평가(부적합)·이탈 조치로 기록한다.
 *   - 부작용(상태·직인·배치·LOT) 전에 호출한다. 실패하면 아무것도 바뀌지 않는다.
 */
import { TRPCError } from "@trpc/server";
import { getRawConnection } from "../../db/connection";
import { CHECKLIST_REFERENCE_TYPES } from "../checklist/recordStatePolicy";
import { findMeasurementIssues, summarizeIssues, type MeasurementIssue } from "../../../shared/dailyLogMeasurements";
import { khaccpSubmitIssues } from "../../../shared/dailyLog/khaccpTemplate";
import { isV2Record, v2ApproveIssues } from "../../../shared/dailyLog/recordV2";

function nowKst(): { date: string; time: string } {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  const p = Object.fromEntries(f.formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour === "24" ? "00" : p.hour}:${p.minute}` };
}

export type DailyLogGateResult =
  | { ok: true; dailyLog: boolean }
  | { ok: false; dailyLog: true; recordId: number; issues: MeasurementIssue[]; message: string };

const parse = (v: unknown) => {
  if (v && typeof v === "object") return v;
  try { return JSON.parse(String(v ?? "")); } catch { return null; }
};

/** 승인 요청 하나를 검사 — 일일일지가 아니면 ok */
export async function checkDailyLogGate(tenantId: number, approvalRequestId: number): Promise<DailyLogGateResult> {
  const conn: any = await getRawConnection();
  const [reqRows]: any = await conn.execute(
    `SELECT reference_type, reference_id FROM h_approval_requests WHERE id = ? AND tenant_id = ? LIMIT 1`,
    [approvalRequestId, tenantId],
  );
  const req = reqRows?.[0];
  if (!req?.reference_id || !(CHECKLIST_REFERENCE_TYPES as readonly string[]).includes(String(req.reference_type))) {
    return { ok: true, dailyLog: false };
  }
  const [recRows]: any = await conn.execute(
    `SELECT id, form_type, form_data FROM h_generic_checklist_records WHERE id = ? AND tenant_id = ? LIMIT 1`,
    [req.reference_id, tenantId],
  );
  const rec = recRows?.[0];
  if (!rec || rec.form_type !== "daily_log") return { ok: true, dailyLog: false };
  const fd = parse(rec.form_data);
  // v2 기록 — 정의 스냅샷 기준 검사 + 미해결 이탈 차단 (docs/architecture/17 C2)
  if (isV2Record(fd)) {
    const v2 = v2ApproveIssues(fd, nowKst());
    if (v2.length === 0) return { ok: true, dailyLog: true };
    return { ok: false, dailyLog: true, recordId: Number(rec.id), issues: [],
      message: `일일일지 #${rec.id} 기록 미완료 — ${v2.slice(0, 5).map((x) => x.replace(/\.$/, "")).join(" / ")}${v2.length > 5 ? ` 외 ${v2.length - 5}건` : ""}. 작성자가 고친 뒤 다시 진행하세요.` };
  }
  const issues = findMeasurementIssues(fd);
  // 원본 템플릿 기록은 운송 온도도 (숫자 또는 '운송 없음'+사유) — 제출과 같은 검사 (PR-A)
  const tIssues = khaccpSubmitIssues(fd);
  if (issues.length === 0 && tIssues.length === 0) return { ok: true, dailyLog: true };
  return {
    ok: false, dailyLog: true, recordId: Number(rec.id), issues,
    message: tIssues.length === 0
      ? `일일일지 #${rec.id} 측정 기록 미완료 — ${summarizeIssues(issues)}. 작성자가 실제 측정값과 측정시각을 입력한 뒤 다시 진행하세요.`
      : `일일일지 #${rec.id} 기록 미완료 — ${[issues.length ? summarizeIssues(issues) : "", ...tIssues].filter(Boolean).join(" / ")}. 작성자가 실제 값을 입력한 뒤 다시 진행하세요.`,
  };
}

/** 단건 경로용 — 막히면 PRECONDITION_FAILED */
export async function assertDailyLogGate(tenantId: number, approvalRequestId: number): Promise<void> {
  const r = await checkDailyLogGate(tenantId, approvalRequestId);
  if (!r.ok) throw new TRPCError({ code: "PRECONDITION_FAILED", message: r.message });
}

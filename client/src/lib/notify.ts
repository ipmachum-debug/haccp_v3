/**
 * notify — 앱 알림(토스트) 단일 창구 (UI/UX 개편 3-a, 2026-10-14)
 *
 * 규칙 (명세 §5): sonner 하나로. 성공(초록) · 경고(주황) · 실패(빨강, 사유 포함) · 진행 중.
 *   notify.success("저장했습니다")
 *   notify.error("저장 실패", err)            // 사유는 Error·tRPC 오류·문자열 모두 받는다
 *   notify.warn("재고가 음수가 됩니다", "입고 대기 LOT 로 처리됩니다")
 *   notify.promise(mutateAsync(), { loading: "저장 중…", success: "저장했습니다", error: "저장 실패" })
 *
 * 배경: 화면 135개 파일이 쓰던 hooks/use-toast(radix) 는 표시기(<Toaster/>)가 앱에 장착되어 있지 않아
 * 알림이 한 번도 보이지 않았다. hooks/use-toast 는 이제 이 모듈로 전달하는 어댑터다.
 */
import { toast as sonner } from "sonner";

type Reason = unknown;

/**
 * 서버가 JSON 대신 HTML 오류 페이지(Nginx 502·504 등)를 돌려주면 브라우저 오류가 그대로 노출된다
 * ("Unexpected token '<', \"<html>…\" is not valid JSON"). 사용자가 알아들을 말로 바꾼다 (2026-10-14 대표 보고).
 */
export function humanizeErrorText(text: string): string {
  if (/Unexpected token '<'|is not valid JSON|<html|Failed to fetch|NetworkError/i.test(text)) {
    return "서버가 응답하지 않습니다 (재시작 중이거나 응답 지연). 잠시 후 다시 시도해 주세요. 계속되면 관리자에게 알려 주세요.";
  }
  return text;
}

/** 4단계 사용 측정 — 실패 알림을 측정 패널이 센다 (측정 모드가 아니면 듣는 곳이 없어 아무 일도 없다) */
export function emitMeasureError(title: string, reason?: Reason) {
  try {
    const r = reasonText(reason);
    window.dispatchEvent(new CustomEvent("millio:measure-error", { detail: r ? `${title} — ${r}` : title }));
  } catch { /* SSR·테스트 */ }
}

/** 오류 객체·문자열에서 사람이 읽을 사유 한 줄 */
export function reasonText(reason: Reason): string | undefined {
  if (reason == null || reason === "") return undefined;
  if (typeof reason === "string") return humanizeErrorText(reason);
  if (reason instanceof Error) return humanizeErrorText(reason.message);
  if (typeof reason === "object" && "message" in (reason as any)) return humanizeErrorText(String((reason as any).message));
  return String(reason);
}

const desc = (d?: Reason) => {
  const t = reasonText(d);
  return t ? { description: t } : undefined;
};

export const notify = {
  success: (title: string, description?: Reason) => sonner.success(title, desc(description)),
  info: (title: string, description?: Reason) => sonner(title, desc(description)),
  warn: (title: string, description?: Reason) => sonner.warning(title, desc(description)),
  /** 실패 — 사유를 함께 보여 준다 (사유 없는 실패 알림 금지) */
  error: (title: string, reason?: Reason) => {
    emitMeasureError(title, reason);
    return sonner.error(title, { ...desc(reason), duration: 8000 });
  },
  loading: (title: string) => sonner.loading(title),
  dismiss: (id?: string | number) => sonner.dismiss(id),
  promise: <T,>(p: Promise<T>, msgs: { loading: string; success: string | ((v: T) => string); error: string | ((e: unknown) => string) }) =>
    sonner.promise(p, {
      loading: msgs.loading,
      success: msgs.success,
      error: (e: unknown) => (typeof msgs.error === "function" ? msgs.error(e) : `${msgs.error}${reasonText(e) ? ` — ${reasonText(e)}` : ""}`),
    }),
};

export type Notify = typeof notify;

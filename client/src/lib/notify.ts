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

/** 오류 객체·문자열에서 사람이 읽을 사유 한 줄 */
export function reasonText(reason: Reason): string | undefined {
  if (reason == null || reason === "") return undefined;
  if (typeof reason === "string") return reason;
  if (reason instanceof Error) return reason.message;
  if (typeof reason === "object" && "message" in (reason as any)) return String((reason as any).message);
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
  error: (title: string, reason?: Reason) => sonner.error(title, { ...desc(reason), duration: 8000 }),
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

/**
 * use-toast — sonner 어댑터 (UI/UX 개편 3-a, 2026-10-14)
 *
 * 이전: shadcn(radix) 토스트 상태 저장소였지만 표시기(<Toaster/> from ui/toaster)가 앱에 장착되지 않아
 *       이 훅을 쓰는 화면 135개 파일의 알림(등록 완료 · 저장 실패 …)이 화면에 한 번도 나오지 않았다.
 * 이후: 같은 사용법(useToast().toast({ title, description, variant }) · toast({...}))을 그대로 받아
 *       앱에 장착된 sonner 로 보낸다. variant "destructive" = 실패(빨강), 그 외 = 일반 알림.
 * 새 코드는 lib/notify 의 notify.success / warn / error 를 쓴다.
 */
import type * as React from "react";
import { toast as sonner } from "sonner";
import { humanizeErrorText, emitMeasureError } from "@/lib/notify";

type ToastInput = {
  title?: React.ReactNode;
  description?: React.ReactNode;
  variant?: "default" | "destructive" | null;
  duration?: number;
  action?: unknown;
  [key: string]: unknown;
};

function toast({ title, description, variant, duration }: ToastInput) {
  // 서버 HTML 오류 페이지(502 등)의 브라우저 오류 문구는 알아들을 말로
  const desc = typeof description === "string" ? humanizeErrorText(description) : description;
  const opts = { ...(desc != null ? { description: desc } : {}), ...(duration ? { duration } : {}) };
  if (variant === "destructive") emitMeasureError(typeof title === "string" ? title : "오류", typeof desc === "string" ? desc : undefined);
  const id = variant === "destructive"
    ? sonner.error(title ?? "오류가 발생했습니다", { duration: 8000, ...opts })
    : sonner(title ?? "", opts);
  return {
    id: String(id),
    dismiss: () => sonner.dismiss(id),
    update: (next: ToastInput) => toast(next),
  };
}

function useToast() {
  return {
    toasts: [] as never[],
    toast,
    dismiss: (toastId?: string) => sonner.dismiss(toastId),
  };
}

export { useToast, toast };

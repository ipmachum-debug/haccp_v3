/**
 * FriendlyErrorBox — 사용자 친화적 에러 표시 컴포넌트
 *
 * Y-시리즈 페이지의 raw SQL / tRPC error 노출 문제 해결.
 *
 * 사용:
 *   {listQuery.error ? <FriendlyErrorBox message={listQuery.error.message} /> : ...}
 */

import { useState } from "react";
import { AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { classifyError } from "@/lib/errorClassifier";

interface Props {
  message: string | null | undefined;
}

export function FriendlyErrorBox({ message }: Props) {
  const [showDetail, setShowDetail] = useState(false);
  const err = classifyError(message);

  return (
    <div className="mx-auto max-w-2xl my-6 p-5 rounded-lg border border-red-200 bg-red-50/40 dark:bg-red-500/5 dark:border-red-500/20">
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
        <div className="flex-1 space-y-2">
          <div className="font-semibold text-red-700 dark:text-red-400">
            {err.title}
          </div>
          {err.hint && (
            <p className="text-sm text-red-600/80 dark:text-red-400/80">
              {err.hint}
            </p>
          )}
          <button
            onClick={() => setShowDetail((v) => !v)}
            className="text-xs text-red-600/60 hover:text-red-700 inline-flex items-center gap-1 mt-2"
          >
            {showDetail ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            기술 상세 {showDetail ? "숨기기" : "보기"}
          </button>
          {showDetail && (
            <pre className="mt-2 text-[10px] font-mono text-red-700/70 bg-red-100/50 dark:bg-red-900/20 p-2 rounded whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
              {err.detail}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

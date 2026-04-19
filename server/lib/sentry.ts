/**
 * Sentry 에러 모니터링 초기화
 *
 * 환경변수 SENTRY_DSN 이 설정된 경우에만 활성화됩니다.
 * 미설정 시 모든 Sentry 함수는 no-op 으로 동작합니다.
 *
 * 사용법 (.env):
 *   SENTRY_DSN=https://xxxxx@oXXX.ingest.sentry.io/XXXX
 *   SENTRY_ENVIRONMENT=production
 */
import * as Sentry from "@sentry/node";

let isInitialized = false;

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    console.log("[Sentry] SENTRY_DSN 미설정 — 에러 모니터링 비활성화");
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development",
    release: `haccp_v3@${process.env.npm_package_version || "1.0.0"}`,

    // 성능 모니터링 (10% 샘플링)
    tracesSampleRate: 0.1,

    // 에러 전송 전 민감 정보 제거
    beforeSend(event) {
      // 비밀번호, 빌링키 등 민감 데이터 마스킹
      if (event.request?.data) {
        const data = event.request.data as Record<string, unknown>;
        const sensitiveKeys = ["password", "passwordHash", "billingKey", "billing_key", "secretKey", "token"];
        for (const key of sensitiveKeys) {
          if (key in data) {
            (data as Record<string, string>)[key] = "[REDACTED]";
          }
        }
      }
      return event;
    },

    // 무시할 에러
    ignoreErrors: [
      "ECONNREFUSED",
      "ECONNRESET",
      "ETIMEDOUT",
      "Socket hang up",
      /^Navigation cancelled/,
    ],
  });

  isInitialized = true;
  console.log("[Sentry] 에러 모니터링 초기화 완료");
}

/**
 * Sentry에 에러 수동 보고
 */
export function captureException(error: Error | unknown, context?: Record<string, unknown>): void {
  if (!isInitialized) return;
  if (context) {
    Sentry.withScope((scope) => {
      for (const [key, value] of Object.entries(context)) {
        scope.setExtra(key, value);
      }
      Sentry.captureException(error);
    });
  } else {
    Sentry.captureException(error);
  }
}

/**
 * Sentry에 메시지 수동 보고
 */
export function captureMessage(message: string, level: "info" | "warning" | "error" = "info"): void {
  if (!isInitialized) return;
  Sentry.captureMessage(message, level);
}

export { Sentry };

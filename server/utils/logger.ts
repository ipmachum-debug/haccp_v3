/**
 * Structured Logging Utility for HACCP-ONE Server
 *
 * Simple console-based logger that adds structured context
 * (timestamp, level, tenantId, userId, operation) to all log output.
 *
 * No external dependencies - wraps console.log/warn/error.
 *
 * Usage:
 *   import { logInfo, logWarn, logError, logSecurity } from "../utils/logger";
 *   logInfo("배치 생성 완료", { tenantId: 2, userId: 5, batchId: 123 });
 *   logError("DB 쿼리 실패", error, { tenantId: 2, operation: "createBatch" });
 */

type LogLevel = "INFO" | "WARN" | "ERROR" | "SECURITY";

interface LogContext {
  tenantId?: number | string;
  userId?: number | string;
  operation?: string;
  [key: string]: unknown;
}

function formatTimestamp(): string {
  const now = new Date();
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const h = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");
  return `${y}-${mo}-${d} ${h}:${mi}:${s}`;
}

function formatContext(ctx?: LogContext): string {
  if (!ctx || Object.keys(ctx).length === 0) return "";
  const parts = Object.entries(ctx)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => {
      if (typeof v === "string") return `${k}:"${v}"`;
      return `${k}:${v}`;
    });
  return parts.length > 0 ? ` {${parts.join(", ")}}` : "";
}

function formatError(err?: unknown): string {
  if (!err) return "";
  if (err instanceof Error) {
    return ` ${err.name}: ${err.message}`;
  }
  return ` ${String(err)}`;
}

function buildLine(level: LogLevel, message: string, context: string, errorStr: string): string {
  return `[${formatTimestamp()}] [${level}] ${message}${context}${errorStr}`;
}

/**
 * Log an informational message.
 *
 * logInfo("배치 생성 완료", { tenantId: 2, userId: 5, batchId: 123 });
 */
export function logInfo(message: string, context?: LogContext): void {
  console.log(buildLine("INFO", message, formatContext(context), ""));
}

/**
 * Log a warning message.
 *
 * logWarn("재고 부족 감지", { tenantId: 2, materialId: 10, remaining: 3 });
 */
export function logWarn(message: string, context?: LogContext): void {
  console.warn(buildLine("WARN", message, formatContext(context), ""));
}

/**
 * Log an error message with optional Error object.
 *
 * logError("DB 쿼리 실패", error, { tenantId: 2, operation: "createBatch" });
 * logError("알 수 없는 오류", null, { tenantId: 2 });
 */
export function logError(message: string, error?: unknown, context?: LogContext): void {
  const line = buildLine("ERROR", message, formatContext(context), formatError(error));
  console.error(line);
  if (error instanceof Error && error.stack) {
    console.error(error.stack);
  }
}

/**
 * Log a security-related event (auth failures, permission violations, etc.).
 *
 * logSecurity("무단 접근 시도", { tenantId: 2, userId: 99, operation: "deleteTenant" });
 */
export function logSecurity(message: string, context?: LogContext): void {
  console.error(buildLine("SECURITY", message, formatContext(context), ""));
}

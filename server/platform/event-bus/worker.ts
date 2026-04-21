/**
 * Event Worker — domain_events 폴링
 *
 * 기본 간격: 5000ms (ENV: EVENT_WORKER_INTERVAL_MS)
 * 활성화 조건: ENV EVENT_WORKER_ENABLED=true (기본 false — 점진 도입)
 */

import { processPendingEvents } from "./event-bus";

let _timer: ReturnType<typeof setInterval> | null = null;

export function startEventWorker(): boolean {
  if (process.env.EVENT_WORKER_ENABLED !== "true") return false;
  if (_timer) return true;

  const intervalMs = Number(process.env.EVENT_WORKER_INTERVAL_MS ?? 5000);

  _timer = setInterval(async () => {
    try {
      await processPendingEvents();
    } catch (err) {
      console.error("[event-worker] tick failed:", err);
    }
  }, intervalMs);

  console.log(`[event-worker] started (interval=${intervalMs}ms)`);
  return true;
}

export function stopEventWorker(): void {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}

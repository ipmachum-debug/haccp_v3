/** drizzle TIMESTAMP·DATETIME ↔ KST 세션 (Codex 대시보드 날짜 검토 #2: 감사 시각 9시간 미래) */
import { describe, it, expect } from "vitest";
import { kstWallToDate, dateToKstWall } from "./db/drizzleKstTime";
import { hStockAlerts } from "../drizzle/schema/part2";

describe("KST 벽시계 ↔ Date", () => {
  it("감사 18:11:35 (KST 세션 값) → 09:11:35Z, 거꾸로도 같은 문자열", () => {
    const d = kstWallToDate("2026-10-16 18:11:35");
    expect(d.toISOString()).toBe("2026-10-16T09:11:35.000Z");
    expect(dateToKstWall(d)).toBe("2026-10-16 18:11:35.000");
  });
  it("자정 전후 — 23:59:30 KST 는 같은 날, 00:00:30 KST 는 다음 날 (UTC 로는 전날 15시대)", () => {
    expect(kstWallToDate("2026-10-16 23:59:30").toISOString()).toBe("2026-10-16T14:59:30.000Z");
    expect(kstWallToDate("2026-10-17 00:00:30").toISOString()).toBe("2026-10-16T15:00:30.000Z");
    expect(dateToKstWall(new Date("2026-10-16T15:00:30Z"))).toBe("2026-10-17 00:00:30.000");
  });
  it("마이크로초 자리도 읽음", () => {
    expect(kstWallToDate("2026-10-16 18:11:35.123456").toISOString()).toBe("2026-10-16T09:11:35.123Z");
  });
  it("drizzle 컬럼(TIMESTAMP) 변환이 설치됨 — 읽기 +09:00, 쓰기 KST 벽시계", () => {
    const col: any = (hStockAlerts as any).createdAt;
    expect(col.mapFromDriverValue("2026-10-16 18:11:35").toISOString()).toBe("2026-10-16T09:11:35.000Z");
    expect(col.mapToDriverValue(new Date("2026-10-16T09:11:35Z"))).toBe("2026-10-16 18:11:35.000");
  });
});

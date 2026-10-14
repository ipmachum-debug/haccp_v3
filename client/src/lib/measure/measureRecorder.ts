/**
 * 4단계 역할별 사용 측정 — 녹화기 (UI/UX 개편 4단계 준비, 2026-10-14)
 *
 * 명세 13 §5 / 14 §6-4: 같은 업무를 개편 전(탭 사이드바)·후(허브 사이드바)로 수행하고
 * 완료 시간 · 클릭 수 · 화면 이동 수 · 오류 · 막힌 지점 을 잰다. 1차는 사람이 재던 것을 화면이 대신 센다.
 *
 * - 서버·DB·API 변경 없음. 기록은 이 브라우저(localStorage)에만 남고, CSV/JSON 으로 내려받아 모은다.
 * - 측정 모드는 주소에 ?measure=1 을 붙이면 켜진다 (끄기: ?measure=0). 일반 사용자 화면에는 아무것도 보이지 않는다.
 * - 개편 전 기준선: 측정 모드에서만 사이드바를 탭 방식으로 바꿔 볼 수 있다 (새로고침 필요).
 */

export type MeasureEventType = "route" | "click" | "error" | "blocked" | "step";
export type MeasureEvent = { t: number; type: MeasureEventType; detail: string };
export type MeasureLayout = "hub" | "tabs";

export type MeasureSession = {
  id: string;
  scenario: string;
  role: string;
  tester: string;
  layout: MeasureLayout;
  tenantId: number | null;
  startedAt: number;
  endedAt: number | null;
  completed: boolean;
  events: MeasureEvent[];
};

/** 측정 시나리오 — 명세 13 §5 A~E + 품질 Q (14 §6-4 순서: 작업자 → 품질 → 회계 → 관리자) */
export const SCENARIOS: ReadonlyArray<{ key: string; label: string; roles: readonly string[] }> = [
  { key: "C", label: "C 하루 생산 → CCP → 자동 자재 차감 → 완료", roles: ["worker", "admin"] },
  { key: "Q", label: "Q 오늘 쓸 기록지 (CCP 1 + 체크리스트 1) → 이탈 시 부적합 등록", roles: ["inspector", "monitor", "worker", "admin"] },
  { key: "B", label: "B 원재료 발주 → 입고 → LOT 생성", roles: ["accountant", "admin"] },
  { key: "D", label: "D 완제품 출고 → 재고 확인", roles: ["accountant", "admin", "worker"] },
  { key: "E", label: "E 회계 승인 → 전표 → 마감", roles: ["accountant", "admin"] },
  { key: "A", label: "A 신규 제품 등록 → 배합 설정 → SKU 등록", roles: ["admin"] },
];

export const STORAGE = {
  on: "millio:measure:on",
  layout: "millio:measure:layout",
  sessions: "millio:measure:sessions",
  active: "millio:measure:active",
  tester: "millio:measure:tester",
} as const;

// ── 저장소 (예외 안전) ──
const store = {
  get(key: string): string | null {
    try { return window.localStorage.getItem(key); } catch { return null; }
  },
  set(key: string, v: string | null) {
    try { v == null ? window.localStorage.removeItem(key) : window.localStorage.setItem(key, v); } catch { /* 사생활 보호 모드 등 */ }
  },
};

export function isMeasureOn(): boolean {
  return store.get(STORAGE.on) === "1";
}

/** ?measure=1 / ?measure=0 으로 측정 모드 전환. 주소에서 그 파라미터는 지운다 (다른 쿼리는 보존) */
export function applyMeasureParam(): void {
  try {
    const url = new URL(window.location.href);
    const v = url.searchParams.get("measure");
    if (v == null) return;
    store.set(STORAGE.on, v === "1" ? "1" : null);
    if (v !== "1") store.set(STORAGE.layout, null);
    url.searchParams.delete("measure");
    window.history.replaceState(window.history.state, "", url.pathname + (url.search ? url.search : "") + url.hash);
  } catch { /* noop */ }
}

/** 측정 모드에서 고른 사이드바 방식 (측정 모드가 아니면 null → 기본 설정 사용) */
export function measureLayoutOverride(): MeasureLayout | null {
  if (!isMeasureOn()) return null;
  const v = store.get(STORAGE.layout);
  return v === "tabs" || v === "hub" ? v : null;
}

export function setMeasureLayout(layout: MeasureLayout) {
  store.set(STORAGE.layout, layout);
}

export function loadSessions(): MeasureSession[] {
  try { const v = JSON.parse(store.get(STORAGE.sessions) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}
export function saveSessions(list: MeasureSession[]) {
  store.set(STORAGE.sessions, JSON.stringify(list.slice(-200)));
}
export function loadActive(): MeasureSession | null {
  try { const v = JSON.parse(store.get(STORAGE.active) || "null"); return v && typeof v === "object" ? v : null; } catch { return null; }
}
export function saveActive(s: MeasureSession | null) {
  store.set(STORAGE.active, s ? JSON.stringify(s) : null);
}

// ── 순수 계산 (테스트 대상) ──

export function newSession(p: { scenario: string; role: string; tester: string; layout: MeasureLayout; tenantId: number | null; now: number; path: string }): MeasureSession {
  return {
    id: `${p.now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    scenario: p.scenario, role: p.role, tester: p.tester.trim(), layout: p.layout, tenantId: p.tenantId,
    startedAt: p.now, endedAt: null, completed: false,
    events: [{ t: p.now, type: "route", detail: p.path }],
  };
}

/** 이벤트 추가 — 같은 경로로의 연속 route 이벤트는 화면 이동으로 세지 않는다 (쿼리만 바뀐 경우 포함) */
export function addEvent(s: MeasureSession, type: MeasureEventType, detail: string, now: number): MeasureSession {
  if (s.endedAt != null) return s;
  if (type === "route") {
    const lastRoute = [...s.events].reverse().find((e) => e.type === "route");
    if (lastRoute && pathOnly(lastRoute.detail) === pathOnly(detail)) return s;
  }
  return { ...s, events: [...s.events, { t: now, type, detail: detail.slice(0, 200) }] };
}

export function endSession(s: MeasureSession, completed: boolean, now: number): MeasureSession {
  return s.endedAt != null ? s : { ...s, endedAt: now, completed };
}

const pathOnly = (p: string) => p.split("?")[0].split("#")[0].replace(/\/+$/, "") || "/";

export type MeasureSummary = {
  id: string; scenario: string; role: string; tester: string; layout: MeasureLayout; tenantId: number | null;
  startedAt: string; durationSec: number; completed: boolean;
  clicks: number; screens: number; errors: number; blocked: number; steps: number;
  path: string; blockedNotes: string; errorNotes: string;
};

/** 세션 요약 — screens = 시작 화면 이후 화면 이동 수, path = 지나간 경로 순서 */
export function summarize(s: MeasureSession): MeasureSummary {
  const by = (t: MeasureEventType) => s.events.filter((e) => e.type === t);
  const routes = by("route").map((e) => pathOnly(e.detail));
  const end = s.endedAt ?? s.events[s.events.length - 1]?.t ?? s.startedAt;
  return {
    id: s.id, scenario: s.scenario, role: s.role, tester: s.tester, layout: s.layout, tenantId: s.tenantId,
    startedAt: new Date(s.startedAt).toISOString(),
    durationSec: Math.max(0, Math.round((end - s.startedAt) / 1000)),
    completed: s.completed,
    clicks: by("click").length,
    screens: Math.max(0, routes.length - 1),
    errors: by("error").length,
    blocked: by("blocked").length,
    steps: by("step").length,
    path: routes.join(" > "),
    blockedNotes: by("blocked").map((e) => e.detail).join(" | "),
    errorNotes: by("error").map((e) => e.detail).join(" | "),
  };
}

const CSV_COLS: Array<keyof MeasureSummary> = [
  "scenario", "role", "layout", "tester", "tenantId", "startedAt", "durationSec", "completed",
  "clicks", "screens", "errors", "blocked", "steps", "blockedNotes", "errorNotes", "path", "id",
];

export function toCsv(sessions: readonly MeasureSession[]): string {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = sessions.map(summarize).map((r) => CSV_COLS.map((c) => esc(r[c])).join(","));
  return "﻿" + [CSV_COLS.join(","), ...rows].join("\n");
}

/** 같은 시나리오·역할의 개편 전(tabs)·후(hub) 평균 비교 — 완료한 세션만 */
export function compareLayouts(sessions: readonly MeasureSession[]) {
  const done = sessions.filter((s) => s.completed && s.endedAt != null).map(summarize);
  const keys = [...new Set(done.map((r) => `${r.scenario}|${r.role}`))].sort();
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
  return keys.map((k) => {
    const [scenario, role] = k.split("|");
    const pick = (layout: MeasureLayout) => done.filter((r) => r.scenario === scenario && r.role === role && r.layout === layout);
    const side = (layout: MeasureLayout) => {
      const rs = pick(layout);
      return { n: rs.length, durationSec: avg(rs.map((r) => r.durationSec)), clicks: avg(rs.map((r) => r.clicks)), screens: avg(rs.map((r) => r.screens)), errors: avg(rs.map((r) => r.errors)), blocked: avg(rs.map((r) => r.blocked)) };
    };
    return { scenario, role, before: side("tabs"), after: side("hub") };
  });
}

/** 클릭 대상 이름 — 버튼·링크의 글자 / aria-label / testid (입력값은 남기지 않는다) */
export function clickLabel(el: Element | null): string | null {
  const target = el?.closest?.("button, a, [role='button'], [role='tab'], [role='menuitem'], [role='option'], input[type='checkbox'], input[type='radio'], select, summary, [data-testid]");
  if (!target) return null;
  const aria = target.getAttribute("aria-label");
  const testid = target.getAttribute("data-testid");
  const text = (target.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40);
  const tag = target.tagName.toLowerCase();
  return `${tag}:${aria || text || testid || "?"}`;
}

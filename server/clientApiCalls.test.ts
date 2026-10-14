/**
 * 화면이 부르는 tRPC 프로시저는 실제로 존재해야 한다 (UI/UX 개편 2-c, 2026-10-14)
 *
 * 배경: _root 가 도메인 맵을 펼치는 순서 때문에 같은 이름(correctiveAction, training)의 구형 HACCP 라우터가
 * 공통(core-mes) 라우터에 덮여, 식품 시정조치·교육관리 화면이 없는 프로시저를 부르고 있었다 (타입 검사로도 안 잡힘).
 * 클라이언트 코드의 trpc.X.Y.useQuery/useMutation 호출을 모아 런타임 appRouter 의 프로시저 목록과 대조한다.
 * 2026-10-14 기준 남은 끊김은 기준선(server/__fixtures__/missing-procedures-baseline-2026-10-14.json) — 새 끊김 0, 기준선은 줄기만.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const baseline = JSON.parse(readFileSync(join(__dirname, "__fixtures__", "missing-procedures-baseline-2026-10-14.json"), "utf-8")) as { missing: string[] };

function clientCalls(): Map<string, Set<string>> {
  const files: string[] = [];
  const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(f) && files.push(p); } };
  walk(join(ROOT, "client", "src"));
  const calls = new Map<string, Set<string>>();
  for (const f of files) {
    const s = readFileSync(f, "utf-8");
    for (const m of s.matchAll(/trpc\.((?:[a-zA-Z0-9_]+\.)+?)(useQuery|useMutation|useInfiniteQuery|useSuspenseQuery)\b/g)) {
      const p = m[1].slice(0, -1);
      if (!calls.has(p)) calls.set(p, new Set());
      calls.get(p)!.add(f.slice(ROOT.length + 1));
    }
  }
  return calls;
}

let procs: Set<string>;
beforeAll(async () => {
  process.env.DATABASE_URL ||= "mysql://test:test@127.0.0.1:1/test";
  process.env.JWT_SECRET ||= "test";
  process.env.SESSION_SECRET ||= "test";
  const { appRouter } = await import("./routers/_root");
  procs = new Set(Object.keys((appRouter as any)._def.procedures));
}, 120_000);

describe("화면 → tRPC 프로시저 연결", () => {
  it("2-c 에서 재연결한 화면: 식품 시정조치 = food.correctiveAction, 구형 교육 = haccpTraining", () => {
    for (const p of ["food.correctiveAction.list", "food.correctiveAction.listByStatus", "food.correctiveAction.recordImmediateAction",
      "haccpTraining.listCourses", "haccpTraining.createSchedule", "haccpTraining.issueCertificate"]) expect(procs.has(p), p).toBe(true);
    expect(procs.has("correctiveAction.listByStatus")).toBe(false); // 공통 CAPA 가 이 이름을 차지 — 구형 화면이 여기로 가면 안 된다
  });

  it("새로 끊긴 호출 0 (기준선 밖)", () => {
    const broken = [...clientCalls().keys()].filter((p) => !procs.has(p)).sort();
    expect(broken.filter((p) => !baseline.missing.includes(p))).toEqual([]);
  });

  it("기준선은 줄기만 한다 — 고친 호출은 기준선에서도 지운다", () => {
    const broken = new Set([...clientCalls().keys()].filter((p) => !procs.has(p)));
    expect(baseline.missing.filter((p) => !broken.has(p))).toEqual([]);
  });
});

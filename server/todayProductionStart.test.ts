/**
 * P-2 오늘의 생산 — 생산 시작 (2026-10-14) · 명세 14 §7-3
 *  - 누른 순간 서버 재검증, 부족이 있으면 확인 없이는 시작하지 않는다 (기존 음수 정책은 그대로 설명만)
 *  - 시작 권리는 조건부 UPDATE 한 번 — 동시 요청 중 하나만 자동출고
 *  - 이미 진행 중이면 아무것도 하지 않는다 (자동출고 재실행 없음)
 *  - 확인하고 시작하면 배치 메모에 기록
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  batch: { id: 7, status: "planned", plannedDate: "2026-10-14", createdBy: 4 } as any,
  check: { totalLines: 3, pendingLines: 3, issuedLines: 0, unissuedLines: 0, shortages: [] as any[], allowNegative: true } as any,
  locked: true,
  dispatchResult: { success: true, warnings: [], errors: [] } as any,
  dispatchThrows: false,
  affectedRows: 1,
  executed: [] as Array<{ sql: string; params: unknown[] }>,
  dispatchCalls: 0,
  audits: [] as any[],
}));

vi.mock("./db", () => ({ getBatchById: vi.fn(async () => state.batch) }));
vi.mock("./db/connection", () => ({
  getRawConnection: vi.fn(async () => ({
    execute: vi.fn(async (sql: string, params: unknown[]) => {
      state.executed.push({ sql, params });
      if (/UPDATE h_batches\s+SET status = 'in_progress'/.test(sql)) return [{ affectedRows: state.affectedRows }];
      return [{ affectedRows: 1 }];
    }),
  })),
}));
vi.mock("./lib/production/batchStartValidation", async (orig) => {
  const real: any = await orig();
  return { ...real, validateBatchStart: vi.fn(async () => state.check) };
});
vi.mock("./lib/production/autoMaterialIssueDispatcher", () => ({
  autoIssueMaterialsDispatch: vi.fn(async () => {
    state.dispatchCalls++;
    if (state.dispatchThrows) throw new Error("DB 끊김");
    return state.dispatchResult;
  }),
}));
vi.mock("./lib/production/batchIssueLock", () => ({
  withBatchIssueLock: vi.fn(async (_t: number, _b: number, fn: () => Promise<any>) => (state.locked ? { locked: true, value: await fn() } : { locked: false })),
}));
vi.mock("./db/system/auditApprovalSupplier", () => ({ createAuditLog: vi.fn(async (i: any) => { state.audits.push(i); }) }));
vi.mock("./lib/production/autoProductionDaily", () => ({ autoRegenerateProductionDaily: vi.fn(async () => undefined) }));

import { todayProductionRouter, isTodayProductionWriteEnabled } from "./routers/production/todayProduction.router";
import { computeShortages, shortageAckNote, isWaterMaterial, type StartLine } from "./lib/production/batchStartValidation";

const caller = () => todayProductionRouter.createCaller({
  user: { id: 4, name: "한상갑", email: "ceo@example.com", role: "admin", tenantId: 2 },
  tenantId: 2,
  req: {} as any, res: {} as any,
} as any);

const SHORT = [{ materialId: 579, materialName: "간장", unit: "kg", required: 1.28, available: 0, shortage: 1.28 }];

beforeEach(() => {
  process.env.TODAY_PRODUCTION_WRITE = "true";
  delete process.env.TODAY_PRODUCTION_WRITE_TENANTS;
  state.batch = { id: 7, status: "planned", plannedDate: "2026-10-14", createdBy: 4 };
  state.check = { totalLines: 3, pendingLines: 3, issuedLines: 0, unissuedLines: 0, shortages: [], allowNegative: true };
  state.locked = true;
  state.dispatchResult = { success: true, warnings: [], errors: [] };
  state.dispatchThrows = false;
  state.affectedRows = 1;
  state.executed = [];
  state.dispatchCalls = 0;
  state.audits = [];
});

describe("생산 시작", () => {
  it("부족 없음 → 조건부 UPDATE 로 시작하고 자동출고 1회", async () => {
    const r: any = await caller().start({ batchId: 7 });
    expect(r.status).toBe("started");
    expect(state.dispatchCalls).toBe(1);
    const upd = state.executed.find((e) => /SET status = 'in_progress'/.test(e.sql))!;
    expect(upd.sql).toMatch(/status IN \(\?,\?\)/);
    expect(upd.params).toEqual([7, 2, "planned", "paused"]);
    expect(state.executed.some((e) => /SET notes/.test(e.sql))).toBe(false);
  });

  it("부족 있음 + 확인 없음 → 시작하지 않고 부족 목록·정책 설명 (상태 변경·자동출고 0)", async () => {
    state.check = { ...state.check, shortages: SHORT };
    const r: any = await caller().start({ batchId: 7 });
    expect(r.status).toBe("needs_confirmation");
    expect(r.shortages).toEqual(SHORT);
    expect(r.message).toContain("음수");
    expect(state.executed).toEqual([]);
    expect(state.dispatchCalls).toBe(0);
  });

  it("음수 금지 테넌트는 '출고 기록만' 으로 설명 (정책은 바꾸지 않음)", async () => {
    state.check = { ...state.check, shortages: SHORT, allowNegative: false };
    const r: any = await caller().start({ batchId: 7 });
    expect(r.message).toContain("출고 기록만");
  });

  it("부족 있음 + 확인 → 시작, 자동출고 1회, 배치 메모에 확인 기록", async () => {
    state.check = { ...state.check, shortages: SHORT };
    const r: any = await caller().start({ batchId: 7, acknowledgeShortage: true });
    expect(r.status).toBe("started");
    expect(state.dispatchCalls).toBe(1);
    const note = state.executed.find((e) => /SET notes/.test(e.sql))!;
    expect(String(note.params[0])).toContain("간장 부족 1.28kg");
    expect(String(note.params[0])).toContain("한상갑(#4)");
    expect(state.audits).toHaveLength(1);
    expect(state.audits[0]).toMatchObject({ action: "batch.start", entityId: 7, userId: 4, changes: { from: "planned", to: "in_progress", shortages: SHORT } });
  });

  it("동시 요청: 조건부 UPDATE 를 잃으면(0행) 자동출고 하지 않고 already_started", async () => {
    state.affectedRows = 0;
    const r: any = await (async () => {
      const p = caller().start({ batchId: 7 });
      state.batch = { ...state.batch, status: "in_progress" }; // 다른 요청이 먼저 시작
      return p;
    })();
    expect(r.status).toBe("already_started");
    expect(state.dispatchCalls).toBe(0);
    expect(state.audits).toHaveLength(0);
  });

  it("이미 진행 중 → 아무것도 하지 않는다 (재검증·자동출고 없음)", async () => {
    state.batch = { ...state.batch, status: "in_progress" };
    const r: any = await caller().start({ batchId: 7 });
    expect(r.status).toBe("already_started");
    expect(state.executed).toEqual([]);
    expect(state.dispatchCalls).toBe(0);
  });

  it("완료·취소 등 시작할 수 없는 상태는 거부", async () => {
    for (const st of ["completed", "cancelled", "under_review", "shipped"]) {
      state.batch = { ...state.batch, status: st };
      await expect(caller().start({ batchId: 7 })).rejects.toThrow(/시작할 수 없습니다/);
    }
    expect(state.dispatchCalls).toBe(0);
  });

  it("작업자 권한 밖(inspector)은 시작 불가 — 기존 batch.updateStatus 와 같은 권한", async () => {
    const c = todayProductionRouter.createCaller({ user: { id: 9, role: "inspector", tenantId: 2 }, tenantId: 2 } as any);
    await expect(c.start({ batchId: 7 })).rejects.toThrow(/작업자 권한/);
  });
});

describe("시작 실패 복구 (Codex #501 검토)", () => {
  it("시작 후 자동출고가 실패하면 started + 오류 + 미출고 줄 수 → 안내 문구", async () => {
    state.dispatchThrows = true;
    state.check = { ...state.check, unissuedLines: 3 };
    const r: any = await caller().start({ batchId: 7 });
    expect(r.status).toBe("started");
    expect(r.autoIssue.success).toBe(false);
    expect(r.autoIssue.errors[0]).toContain("DB 끊김");
    expect(r.unissuedLines).toBe(3);
    expect(r.message).toContain("누락 출고 다시 실행");
  });

  it("dispatcher 가 success 여도 남은 미출고 줄이 있으면 알린다 (부분 성공)", async () => {
    state.check = { ...state.check, unissuedLines: 1 };
    const r: any = await caller().start({ batchId: 7 });
    expect(r.unissuedLines).toBe(1);
    expect(r.message).toContain("1줄이 출고되지 않았습니다");
  });

  it("이미 진행 중인 배치를 다시 시작하면 출고는 안 하고 누락 줄 수를 알려 준다", async () => {
    state.batch = { ...state.batch, status: "in_progress" };
    state.check = { ...state.check, unissuedLines: 2 };
    const r: any = await caller().start({ batchId: 7 });
    expect(r).toMatchObject({ status: "already_started", unissuedLines: 2 });
    expect(r.message).toContain("누락 출고 다시 실행");
    expect(state.dispatchCalls).toBe(0);
  });

  it("retryIssue: 진행 중이 아니면 거부", async () => {
    await expect(caller().retryIssue({ batchId: 7 })).rejects.toThrow(/생산 중인 배치만/);
    expect(state.dispatchCalls).toBe(0);
  });

  it("retryIssue: 남은 줄이 없으면 출고하지 않음", async () => {
    state.batch = { ...state.batch, status: "in_progress" };
    const r: any = await caller().retryIssue({ batchId: 7 });
    expect(r.status).toBe("nothing_to_issue");
    expect(state.dispatchCalls).toBe(0);
  });

  it("retryIssue: 다른 출고가 잠금을 잡고 있으면 busy (출고 0)", async () => {
    state.batch = { ...state.batch, status: "in_progress" };
    state.check = { ...state.check, unissuedLines: 2 };
    state.locked = false;
    const r: any = await caller().retryIssue({ batchId: 7 });
    expect(r.status).toBe("busy");
    expect(state.dispatchCalls).toBe(0);
    expect(state.audits).toHaveLength(0);
  });

  it("retryIssue: 남은 줄 출고 + 감사 로그", async () => {
    state.batch = { ...state.batch, status: "in_progress" };
    state.check = { ...state.check, unissuedLines: 2 };
    // 출고 전 확인 2줄 → 출고 뒤 재확인 0줄
    const { validateBatchStart } = await import("./lib/production/batchStartValidation");
    (validateBatchStart as any).mockImplementationOnce(async () => state.check)
      .mockImplementationOnce(async () => ({ ...state.check, unissuedLines: 0 }));
    const r: any = await caller().retryIssue({ batchId: 7 });
    expect(state.dispatchCalls).toBe(1);
    expect(r).toMatchObject({ status: "reissued", unissuedLines: 0, message: "남은 원료를 모두 출고했습니다." });
    expect(state.audits[0]).toMatchObject({ action: "batch.reissue", entityId: 7 });
  });

  it("작업자 권한 밖(inspector)은 재출고 불가", async () => {
    const c = todayProductionRouter.createCaller({ user: { id: 9, role: "inspector", tenantId: 2 }, tenantId: 2 } as any);
    await expect(c.retryIssue({ batchId: 7 })).rejects.toThrow(/작업자 권한/);
  });
});

describe("쓰기 스위치 (검증 전 운영 차단)", () => {
  it("기본(미설정)은 꺼짐 — 시작·재출고 모두 FORBIDDEN, 상태 변경·출고 0", async () => {
    delete process.env.TODAY_PRODUCTION_WRITE;
    await expect(caller().start({ batchId: 7 })).rejects.toThrow(/검증 중/);
    state.batch = { ...state.batch, status: "in_progress" };
    await expect(caller().retryIssue({ batchId: 7 })).rejects.toThrow(/검증 중/);
    expect(state.executed).toEqual([]);
    expect(state.dispatchCalls).toBe(0);
    expect(await caller().writeEnabled()).toEqual({ enabled: false });
  });

  it("테넌트 목록이 있으면 그 테넌트만 (전체 플래그보다 우선)", async () => {
    process.env.TODAY_PRODUCTION_WRITE_TENANTS = "5";
    expect(isTodayProductionWriteEnabled(2)).toBe(false);
    expect(isTodayProductionWriteEnabled(5)).toBe(true);
    process.env.TODAY_PRODUCTION_WRITE_TENANTS = "2, 5";
    expect(await caller().writeEnabled()).toEqual({ enabled: true });
    delete process.env.TODAY_PRODUCTION_WRITE;
    expect(isTodayProductionWriteEnabled(2)).toBe(true);
    expect(isTodayProductionWriteEnabled(null)).toBe(false);
  });

  it("읽기(checkStart)는 스위치와 무관", async () => {
    delete process.env.TODAY_PRODUCTION_WRITE;
    expect(await caller().checkStart({ batchId: 7 })).toMatchObject({ totalLines: 3 });
  });
});

describe("재검증 계산 (computeShortages)", () => {
  const L = (o: Partial<StartLine>): StartLine => ({ inputId: 1, canonicalMaterialId: 1, materialName: "찹쌀", unit: "kg", required: 1, alreadyIssued: false, isWater: false, ...o });

  it("같은 자재 여러 줄은 합쳐서 비교, 이미 출고된 줄·정제수는 제외", () => {
    const lines = [
      L({ inputId: 1, canonicalMaterialId: 10, materialName: "찹쌀", required: 30 }),
      L({ inputId: 2, canonicalMaterialId: 10, materialName: "찹쌀", required: 20 }),
      L({ inputId: 3, canonicalMaterialId: 11, materialName: "설탕", required: 5, alreadyIssued: true }),
      L({ inputId: 4, canonicalMaterialId: 12, materialName: "정제수", required: 100, isWater: true }),
    ];
    const r = computeShortages(lines, new Map([[10, 45], [11, 0], [12, 0]]));
    expect(r.shortages).toEqual([{ materialId: 10, materialName: "찹쌀", unit: "kg", required: 50, available: 45, shortage: 5 }]);
    expect(r).toMatchObject({ pendingLines: 3, issuedLines: 1, unissuedLines: 2 });
  });

  it("오차 0.001 이하는 부족 아님, 가용 정보가 없으면 0 으로", () => {
    expect(computeShortages([L({ required: 1.0005 })], new Map([[1, 1]])).shortages).toEqual([]);
    expect(computeShortages([L({ canonicalMaterialId: 99, required: 2 })], new Map()).shortages[0].shortage).toBe(2);
  });

  it("정제수 판정·확인 메모 문구", () => {
    expect(isWaterMaterial("정제수(RO)")).toBe(true);
    expect(isWaterMaterial("찹쌀")).toBe(false);
    const note = shortageAckNote({ userName: "작업자A", userId: 12, at: "2026-10-14 09:00", shortages: SHORT as any, allowNegative: true });
    expect(note).toBe("[생산 시작 · 재고 부족 확인] 2026-10-14 09:00 작업자A(#12) — 간장 부족 1.28kg(필요 1.28/가용 0) — 정책: 부족분 음수 차감(다음 입고 시 상쇄)");
  });
});

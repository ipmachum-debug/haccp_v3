/**
 * 감사 로그 재활성화 (2026-10-14)
 *  - db.createAuditLog 가 no-op 이던 것을 운영 audit_logs 실측 컬럼으로 기록
 *  - 테넌트: 인자 → input.tenantId → 사용자 소속 → 0
 *  - 기록 실패가 본 작업을 막지 않는다
 *  - utils/auditLogger(슈퍼관리자 승인) 와 레시피 스텁도 같은 함수로 기록
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  executed: [] as Array<{ sql: string; params: any[] }>,
  userTenant: 2 as number | null,
  fail: false,
}));

vi.mock("./db/connection", () => ({
  getDb: vi.fn(async () => null),
  getRawConnection: vi.fn(async () => ({
    execute: vi.fn(async (sql: string, params: any[]) => {
      if (state.fail && /INSERT INTO audit_logs/.test(sql)) throw new Error("boom");
      state.executed.push({ sql, params });
      if (/FROM h_batches b/.test(sql)) return [[]];
      if (/FROM users/.test(sql)) return [state.userTenant == null ? [] : [{ tenant_id: state.userTenant }]];
      return [{ affectedRows: 1 }];
    }),
  })),
}));

import { createAuditLog } from "./db/system/auditApprovalSupplier";
import { createAuditLog as recipeAudit } from "./db/production/recipe";
import { createAuditLogFromContext } from "./utils/auditLogger";

const inserts = () => state.executed.filter((e) => /INSERT INTO audit_logs/.test(e.sql));

beforeEach(() => { state.executed = []; state.userTenant = 2; state.fail = false; });

describe("createAuditLog", () => {
  it("실측 컬럼으로 INSERT — changes 는 JSON", async () => {
    await createAuditLog({
      action: "batch.complete", entityType: "batch", entityId: 1103, userId: 4,
      userEmail: "ceo@example.com", userRole: "admin", changes: { status: "completed" }, description: "완료",
    }, 2);
    const [ins] = inserts();
    expect(ins.sql).toMatch(/\(tenant_id, action, entity_type, entity_id, user_id, user_email, user_role, changes, description, ip_address, user_agent, created_at\)/);
    expect(ins.params).toEqual([2, "batch.complete", "batch", 1103, 4, "ceo@example.com", "admin", '{"status":"completed"}', "완료", null, null]);
    expect(state.executed.some((e) => /FROM users/.test(e.sql))).toBe(false);
  });

  it("테넌트 인자가 없으면 사용자 소속 테넌트, 그것도 없으면 0", async () => {
    await createAuditLog({ action: "x", entityType: "batch", userId: 4 });
    expect(inserts()[0].params[0]).toBe(2);
    state.executed = []; state.userTenant = null;
    await createAuditLog({ action: "x", entityType: "batch", userId: 99 });
    expect(inserts()[0].params[0]).toBe(0);
  });

  it("기록 실패는 던지지 않는다", async () => {
    state.fail = true;
    await expect(createAuditLog({ action: "x", entityType: "y", userId: 1 }, 2)).resolves.toBeUndefined();
  });

  it("레시피 모듈의 createAuditLog 도 실제로 기록", async () => {
    await recipeAudit({ action: "recipe.delete", entityType: "recipe", entityId: 5, userId: 4 }, 2);
    expect(inserts()[0].params.slice(0, 4)).toEqual([2, "recipe.delete", "recipe", 5]);
  });

  it("슈퍼관리자 승인 로그(utils/auditLogger) 도 같은 컬럼으로", async () => {
    await createAuditLogFromContext(
      { user: { id: 1, role: "super_admin", tenantId: 1 }, req: { ip: "1.2.3.4", headers: { "user-agent": "UA" } } },
      { action: "tenant_approved", targetType: "tenant", targetId: "7", tenantId: "7" },
    );
    const p = inserts()[0].params;
    expect(p).toEqual([7, "tenant_approved", "tenant", 7, 1, null, "super_admin", null, null, "1.2.3.4", "UA"]);
  });
});

describe("batch.updateStatus 가 쓰는 updateBatchStatus (오진 정정 고정)", () => {
  it("server/db 의 updateBatchStatus = batchCRUD 판 (batchId, status, tenantId) — 테넌트 필터·start_time 설정", async () => {
    const db: any = await import("./db");
    const crud = await import("./db/production/batchCRUD");
    expect(db.updateBatchStatus).toBe(crud.updateBatchStatus);
  });
});

describe("getBatchById 테넌트 조건 (Codex #501 검토)", () => {
  it("tenantId 를 받으면 WHERE 에 b.tenant_id 를 건다", async () => {
    const { getBatchById } = await import("./db/production/batchCRUD");
    expect(await getBatchById(7, 2)).toBeUndefined();
    const q = state.executed.find((e) => /FROM h_batches b/.test(e.sql))!;
    expect(q.sql).toMatch(/WHERE b\.id = \? AND b\.tenant_id = \?/);
    expect(q.params).toEqual([7, 2]);
  });
  it("tenantId 없이 부르는 내부 호출은 기존 그대로 (id 만)", async () => {
    const { getBatchById } = await import("./db/production/batchCRUD");
    await getBatchById(7);
    const q = state.executed.find((e) => /FROM h_batches b/.test(e.sql))!;
    expect(q.sql).not.toMatch(/tenant_id = \?/);
    expect(q.params).toEqual([7]);
  });
});

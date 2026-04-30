/**
 * Change Control DB 어댑터 (Layer 3 / db / coreMes / quality)
 *
 * ============================================================================
 * Phase Y-2-0-b — 라우터 레이어.
 *
 * 책임:
 *   - h_change_controls 테이블 CRUD
 *   - 자동 코드 채번 (CC-YYYY-NNNN)
 *   - 상태 전이 검증 (server/core-mes/quality/changeControl.ts canTransition)
 *
 * 의존성 (.dependency-cruiser.cjs):
 *   - core-mes (Layer 2, 순수 도메인) → 정상 방향
 *   - drizzle/schema/coreMes/quality/changeControl
 *   - server/db/connection (getDb)
 *   - industry/* 무참조 (ADR-002 — core 가 industry 모름)
 *
 * 운영 영향: 0
 *   - 신규 entity 만 사용, 기존 row 변경 X
 *   - 라우터 등록 후에도 클라이언트 페이지 미존재 (Y-2-0-c 까지)
 * ============================================================================
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "../../connection";
import {
  hChangeControls,
  type DbChangeControlInsert,
  type DbChangeControlRow,
} from "../../../../drizzle/schema/coreMes/quality/changeControl";
import {
  canTransition,
  type ChangeImpact,
  type ChangeStatus,
  type ChangeType,
  type IndustryContext,
} from "../../../core-mes/quality/changeControl";

/**
 * CC-YYYY-NNNN 자동 채번 (tenant 별 연도 기준 일련번호).
 * idempotent — 같은 tenant + 연도에 N+1 반환.
 */
export async function generateChangeControlCode(tenantId: number): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const year = new Date().getFullYear();
  const prefix = `CC-${year}`;

  // 같은 prefix 중 가장 큰 일련번호 조회 (역순 50건이면 충분 — tenant 당 연 50건 가정)
  const rows = await db
    .select({ code: hChangeControls.code })
    .from(hChangeControls)
    .where(eq(hChangeControls.tenantId, tenantId))
    .orderBy(desc(hChangeControls.id))
    .limit(50);

  const sameYear = rows
    .map((r) => r.code)
    .filter((c): c is string => typeof c === "string" && c.startsWith(prefix));

  const maxSeq = sameYear.reduce((max, code) => {
    const parts = code.split("-");
    const n = parseInt(parts[2] || "0", 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);

  return `${prefix}-${String(maxSeq + 1).padStart(4, "0")}`;
}

export interface CreateChangeControlInput {
  industry: IndustryContext;
  title: string;
  description: string;
  changeType: ChangeType;
  impact?: ChangeImpact;
  requestedBy: number;
  industryMetadata?: Record<string, unknown> | null;
}

export async function createChangeControl(
  data: CreateChangeControlInput,
  tenantId: number,
): Promise<{ id: number; code: string }> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const code = await generateChangeControlCode(tenantId);

  const insertData: DbChangeControlInsert = {
    tenantId,
    industry: data.industry,
    code,
    title: data.title,
    description: data.description,
    changeType: data.changeType,
    impact: data.impact ?? "minor",
    status: "draft",
    requestedBy: data.requestedBy,
    industryMetadata: (data.industryMetadata ?? null) as never,
  };

  const [result]: any = await db.insert(hChangeControls).values(insertData);
  const insertedId = Number(result?.insertId ?? 0);
  if (!insertedId) {
    throw new Error("Change Control 생성 실패 (insertId 없음)");
  }
  return { id: insertedId, code };
}

export interface ListChangeControlOptions {
  industry?: IndustryContext;
  status?: ChangeStatus;
  limit?: number;
}

export async function listChangeControls(
  opts: ListChangeControlOptions | undefined,
  tenantId: number,
): Promise<DbChangeControlRow[]> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const conditions = [eq(hChangeControls.tenantId, tenantId)];
  if (opts?.industry) {
    conditions.push(eq(hChangeControls.industry, opts.industry));
  }
  if (opts?.status) {
    conditions.push(eq(hChangeControls.status, opts.status));
  }

  const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 500);

  const rows = await db
    .select()
    .from(hChangeControls)
    .where(and(...conditions))
    .orderBy(desc(hChangeControls.requestedAt))
    .limit(limit);

  return rows;
}

export async function getChangeControlById(
  id: number,
  tenantId: number,
): Promise<DbChangeControlRow | null> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const rows = await db
    .select()
    .from(hChangeControls)
    .where(
      and(
        eq(hChangeControls.id, id),
        eq(hChangeControls.tenantId, tenantId),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

export interface UpdateDraftInput {
  title?: string;
  description?: string;
  changeType?: ChangeType;
  impact?: ChangeImpact;
  industryMetadata?: Record<string, unknown> | null;
}

/**
 * draft 상태에서만 본문 수정 가능. 다른 상태에서는 throw.
 */
export async function updateChangeControlDraft(
  id: number,
  data: UpdateDraftInput,
  tenantId: number,
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const current = await getChangeControlById(id, tenantId);
  if (!current) throw new Error("Change Control 미존재");
  if (current.status !== "draft") {
    throw new Error(`수정 불가: 현재 상태 ${current.status} (draft 만 본문 수정 허용)`);
  }

  const update: Partial<DbChangeControlInsert> = {};
  if (data.title !== undefined) update.title = data.title;
  if (data.description !== undefined) update.description = data.description;
  if (data.changeType !== undefined) update.changeType = data.changeType;
  if (data.impact !== undefined) update.impact = data.impact;
  if (data.industryMetadata !== undefined) {
    update.industryMetadata = data.industryMetadata as never;
  }

  if (Object.keys(update).length === 0) return;

  await db
    .update(hChangeControls)
    .set(update)
    .where(
      and(
        eq(hChangeControls.id, id),
        eq(hChangeControls.tenantId, tenantId),
      ),
    );
}

export interface TransitionInput {
  to: ChangeStatus;
  /** approved/closed/rejected 등 일부 전이는 actor 필수 */
  actorUserId: number;
}

/**
 * 상태 전이 — canTransition() 검증 후 status + 부수 컬럼 갱신.
 *
 * 부수 컬럼:
 *   approved → approvedBy / approvedAt
 *   closed   → closedAt
 */
export async function transitionChangeControlStatus(
  id: number,
  input: TransitionInput,
  tenantId: number,
): Promise<DbChangeControlRow> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const current = await getChangeControlById(id, tenantId);
  if (!current) throw new Error("Change Control 미존재");

  const fromStatus = current.status as ChangeStatus;
  if (!canTransition(fromStatus, input.to)) {
    throw new Error(
      `상태 전이 불가: ${fromStatus} → ${input.to} (허용되지 않음)`,
    );
  }

  const update: Partial<DbChangeControlInsert> = { status: input.to };
  const now = new Date();

  if (input.to === "approved") {
    update.approvedBy = input.actorUserId;
    update.approvedAt = now;
  }
  if (input.to === "closed") {
    update.closedAt = now;
  }

  await db
    .update(hChangeControls)
    .set(update)
    .where(
      and(
        eq(hChangeControls.id, id),
        eq(hChangeControls.tenantId, tenantId),
      ),
    );

  const updated = await getChangeControlById(id, tenantId);
  if (!updated) throw new Error("전이 후 row 재조회 실패");
  return updated;
}

/**
 * 통계 — industry 별 status 카운트 (대시보드용).
 */
export async function countByStatus(
  tenantId: number,
  industry?: IndustryContext,
): Promise<Record<ChangeStatus, number>> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const conditions = [eq(hChangeControls.tenantId, tenantId)];
  if (industry) {
    conditions.push(eq(hChangeControls.industry, industry));
  }

  const rows = await db
    .select({
      status: hChangeControls.status,
      cnt: sql<number>`COUNT(*)`,
    })
    .from(hChangeControls)
    .where(and(...conditions))
    .groupBy(hChangeControls.status);

  const result: Record<ChangeStatus, number> = {
    draft: 0,
    submitted: 0,
    evaluating: 0,
    approved: 0,
    implementing: 0,
    verifying: 0,
    closed: 0,
    rejected: 0,
    cancelled: 0,
  };
  for (const r of rows) {
    const status = r.status as ChangeStatus;
    if (status in result) result[status] = Number(r.cnt);
  }
  return result;
}

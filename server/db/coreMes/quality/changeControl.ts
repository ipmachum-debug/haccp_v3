/**
 * Change Control DB 헬퍼 — Layer 2 core-mes/quality
 *
 * ============================================================================
 * Cross-cutting 도메인 — 모든 industry 공통.
 * Phase Y-2-0-b (DB 어댑터 + 자동채번 + 상태 전이 검증).
 *
 * 의존성 규칙 (ADR-002):
 *   - 본 파일은 platform / shared-kernel / drizzle 만 import
 *   - industry/* 무참조 — core-mes 가 industry 를 모름 (view filter 만)
 *
 * lifecycle (canTransition 검증):
 *   draft → submitted → evaluating → approved → implementing → verifying → closed
 *           └────→ rejected ──────→ (terminal)
 *           └────→ cancelled ─────→ (terminal — 어느 단계든)
 * ============================================================================
 */
import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "../../connection";
import { hChangeControls } from "../../../../drizzle/schema/coreMes/quality/changeControl";
import {
  type ChangeControl,
  type ChangeStatus,
  type ChangeImpact,
  type ChangeType,
  type IndustryContext,
  canTransition,
} from "../../../core-mes/quality/changeControl";

// ─────────────────────────────────────────────────────────────
// 자동채번
// ─────────────────────────────────────────────────────────────

/**
 * CC-YYYY-NNNN 자동채번 (tenant 별 연도 기준 일련번호).
 * idempotent — 같은 tenant + 연도에 호출 시 N+1 반환.
 *
 * @param tenantId 테넌트 ID
 * @returns 신규 코드 (예: "CC-2026-0001")
 */
export async function generateChangeControlCode(
  tenantId: number,
): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const year = new Date().getFullYear();
  const prefix = `CC-${year}-`;

  // 동일 prefix 의 최대 일련번호 + 1
  const rows = await db
    .select({ code: hChangeControls.code })
    .from(hChangeControls)
    .where(
      and(
        eq(hChangeControls.tenantId, tenantId),
        sql`${hChangeControls.code} LIKE ${prefix + "%"}`,
      ),
    )
    .orderBy(desc(hChangeControls.code))
    .limit(1);

  let next = 1;
  if (rows.length > 0) {
    const m = rows[0].code.match(/^CC-\d{4}-(\d+)$/);
    if (m) next = Number(m[1]) + 1;
  }
  return `${prefix}${String(next).padStart(4, "0")}`;
}

// ─────────────────────────────────────────────────────────────
// CRUD (industry view filter 강제 — tenant 격리 + industry 컨텍스트)
// ─────────────────────────────────────────────────────────────

export type CreateChangeControlInput = {
  tenantId: number;
  industry: IndustryContext;
  title: string;
  description: string;
  changeType: ChangeType;
  impact?: ChangeImpact;
  requestedBy: number;
  industryMetadata?: Record<string, unknown> | null;
};

/**
 * 신규 변경관리 등록 — status = 'draft' 시작.
 * code 는 자동채번.
 */
export async function createChangeControl(
  input: CreateChangeControlInput,
): Promise<{ id: number; code: string }> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const code = await generateChangeControlCode(input.tenantId);

  const result = await db.insert(hChangeControls).values({
    tenantId: input.tenantId,
    industry: input.industry,
    code,
    title: input.title,
    description: input.description,
    changeType: input.changeType,
    impact: input.impact ?? "minor",
    status: "draft",
    requestedBy: input.requestedBy,
    industryMetadata: input.industryMetadata ?? null,
  });

  // mysql2 result: insertId
  const insertId = (result as unknown as { insertId?: number })[0]?.insertId
    ?? (result as unknown as Array<{ insertId?: number }>)[0]?.insertId
    ?? 0;
  return { id: Number(insertId), code };
}

/**
 * tenant + industry 기준 목록 조회 (view filter).
 * 옵션: status 필터, 정렬.
 *
 * @returns 신청일 내림차순
 */
export async function listChangeControls(
  tenantId: number,
  industry: IndustryContext,
  options?: { status?: ChangeStatus; limit?: number; offset?: number },
): Promise<ChangeControl[]> {
  const db = await getDb();
  if (!db) return [];

  const conds = [
    eq(hChangeControls.tenantId, tenantId),
    eq(hChangeControls.industry, industry),
  ];
  if (options?.status) conds.push(eq(hChangeControls.status, options.status));

  const rows = await db
    .select()
    .from(hChangeControls)
    .where(and(...conds))
    .orderBy(desc(hChangeControls.requestedAt))
    .limit(options?.limit ?? 50)
    .offset(options?.offset ?? 0);

  return rows.map(rowToEntity);
}

/**
 * 단건 조회 — tenant + industry 검증 (view filter 강제).
 */
export async function getChangeControlById(
  tenantId: number,
  industry: IndustryContext,
  id: number,
): Promise<ChangeControl | null> {
  const db = await getDb();
  if (!db) return null;

  const rows = await db
    .select()
    .from(hChangeControls)
    .where(
      and(
        eq(hChangeControls.id, id),
        eq(hChangeControls.tenantId, tenantId),
        eq(hChangeControls.industry, industry),
      ),
    )
    .limit(1);

  return rows[0] ? rowToEntity(rows[0]) : null;
}

/**
 * 상태 전이 (canTransition 검증 강제).
 *
 * @throws Error 잘못된 전이 / 미존재 / tenant·industry 불일치
 */
export async function transitionChangeControlStatus(args: {
  tenantId: number;
  industry: IndustryContext;
  id: number;
  toStatus: ChangeStatus;
  approvedBy?: number;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const current = await getChangeControlById(args.tenantId, args.industry, args.id);
  if (!current) {
    throw new Error(
      `ChangeControl 미존재 (id=${args.id}, tenant=${args.tenantId}, industry=${args.industry})`,
    );
  }

  if (!canTransition(current.status, args.toStatus)) {
    throw new Error(
      `잘못된 상태 전이: ${current.status} → ${args.toStatus} (canTransition 거부)`,
    );
  }

  const updates: Record<string, unknown> = { status: args.toStatus };
  if (args.toStatus === "approved") {
    if (!args.approvedBy) {
      throw new Error("approved 전이 시 approvedBy 필수");
    }
    updates.approvedBy = args.approvedBy;
    updates.approvedAt = new Date();
  }
  if (args.toStatus === "closed") {
    updates.closedAt = new Date();
  }

  await db
    .update(hChangeControls)
    .set(updates)
    .where(
      and(
        eq(hChangeControls.id, args.id),
        eq(hChangeControls.tenantId, args.tenantId),
        eq(hChangeControls.industry, args.industry),
      ),
    );
}

/**
 * 영향평가 결과 갱신 — impact 만 변경.
 * 일반적으로 status='evaluating' 상태에서 호출.
 */
export async function updateChangeControlImpact(args: {
  tenantId: number;
  industry: IndustryContext;
  id: number;
  impact: ChangeImpact;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const current = await getChangeControlById(args.tenantId, args.industry, args.id);
  if (!current) {
    throw new Error(
      `ChangeControl 미존재 (id=${args.id}, tenant=${args.tenantId}, industry=${args.industry})`,
    );
  }
  if (current.status === "closed" || current.status === "rejected" || current.status === "cancelled") {
    throw new Error(
      `종결 상태에서 영향도 변경 불가 (status=${current.status})`,
    );
  }

  await db
    .update(hChangeControls)
    .set({ impact: args.impact })
    .where(
      and(
        eq(hChangeControls.id, args.id),
        eq(hChangeControls.tenantId, args.tenantId),
        eq(hChangeControls.industry, args.industry),
      ),
    );
}

// ─────────────────────────────────────────────────────────────
// 통계 (cross-industry / view filter 양쪽 지원)
// ─────────────────────────────────────────────────────────────

/**
 * tenant 내 industry 별 / status 별 카운트.
 *
 * cross-industry 운영 대시보드 (식품 + 화장품 + 의약품 한 화면) 용.
 */
export async function getChangeControlStats(
  tenantId: number,
): Promise<Array<{ industry: IndustryContext; status: ChangeStatus; count: number }>> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({
      industry: hChangeControls.industry,
      status: hChangeControls.status,
      count: sql<number>`COUNT(*)`,
    })
    .from(hChangeControls)
    .where(eq(hChangeControls.tenantId, tenantId))
    .groupBy(hChangeControls.industry, hChangeControls.status);

  return rows.map((r) => ({
    industry: r.industry as IndustryContext,
    status: r.status as ChangeStatus,
    count: Number(r.count),
  }));
}

// ─────────────────────────────────────────────────────────────
// row → entity 변환
// ─────────────────────────────────────────────────────────────

function rowToEntity(
  row: typeof hChangeControls.$inferSelect,
): ChangeControl {
  return {
    id: row.id,
    tenantId: row.tenantId,
    industry: row.industry as IndustryContext,
    code: row.code,
    title: row.title,
    description: row.description,
    changeType: row.changeType as ChangeType,
    impact: row.impact as ChangeImpact,
    status: row.status as ChangeStatus,
    requestedBy: row.requestedBy,
    requestedAt: row.requestedAt,
    approvedBy: row.approvedBy ?? null,
    approvedAt: row.approvedAt ?? null,
    closedAt: row.closedAt ?? null,
    industryMetadata: (row.industryMetadata as Record<string, unknown> | null) ?? null,
  };
}

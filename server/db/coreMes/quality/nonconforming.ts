/**
 * Nonconforming DB 헬퍼 — Layer 2 core-mes/quality
 *
 * ============================================================================
 * Cross-cutting 도메인 — 모든 industry 공통.
 * Phase Y-2-1-b (DB 어댑터 + 자동채번 + 상태 전이 검증).
 *
 * 의존성 규칙 (ADR-002):
 *   - 본 파일은 platform / shared-kernel / drizzle 만 import
 *   - industry/* 무참조 — core-mes 가 industry 를 모름 (view filter 만)
 *
 * lifecycle (canTransition 검증):
 *   detected → under_investigation → pending_disposal → disposed → closed
 *           └────→ cancelled (어느 단계든)
 * ============================================================================
 */
import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "../../connection";
import { hNonconformings } from "../../../../drizzle/schema/coreMes/quality/nonconforming";
import {
  type Nonconforming,
  type NonconformingStatus,
  type NonconformityType,
  type CauseCategory,
  type DisposalMethod,
  type DetectionSource,
  type IndustryContext,
  canTransition,
} from "../../../core-mes/quality/nonconforming";

// ─────────────────────────────────────────────────────────────
// 자동채번
// ─────────────────────────────────────────────────────────────

/**
 * NCR-YYYY-NNNN 자동채번 (tenant 별 연도 기준 일련번호).
 * idempotent — 같은 tenant + 연도에 호출 시 N+1 반환.
 *
 * @param tenantId 테넌트 ID
 * @returns 신규 코드 (예: "NCR-2026-0001")
 */
export async function generateNonconformingCode(
  tenantId: number,
): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const year = new Date().getFullYear();
  const prefix = `NCR-${year}-`;

  const rows = await db
    .select({ code: hNonconformings.code })
    .from(hNonconformings)
    .where(
      and(
        eq(hNonconformings.tenantId, tenantId),
        sql`${hNonconformings.code} LIKE ${prefix + "%"}`,
      ),
    )
    .orderBy(desc(hNonconformings.code))
    .limit(1);

  let next = 1;
  if (rows.length > 0) {
    const m = rows[0].code.match(/^NCR-\d{4}-(\d+)$/);
    if (m) next = Number(m[1]) + 1;
  }
  return `${prefix}${String(next).padStart(4, "0")}`;
}

// ─────────────────────────────────────────────────────────────
// CRUD (industry view filter 강제)
// ─────────────────────────────────────────────────────────────

export type CreateNonconformingInput = {
  tenantId: number;
  industry: IndustryContext;
  detectionDate: string; // YYYY-MM-DD
  detectionSource: DetectionSource;
  nonconformityType: NonconformityType;
  description: string;
  itemName: string;
  lotNumber?: string | null;
  quantity: number;
  unit: string;
  detectedBy: number;
  industryMetadata?: Record<string, unknown> | null;
};

/**
 * 신규 부적합 등록 — status='detected' 시작 + code 자동채번.
 */
export async function createNonconforming(
  input: CreateNonconformingInput,
): Promise<{ id: number; code: string }> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const code = await generateNonconformingCode(input.tenantId);

  const result = await db.insert(hNonconformings).values({
    tenantId: input.tenantId,
    industry: input.industry,
    code,
    detectionDate: input.detectionDate,
    detectionSource: input.detectionSource,
    nonconformityType: input.nonconformityType,
    description: input.description,
    itemName: input.itemName,
    lotNumber: input.lotNumber ?? null,
    quantity: String(input.quantity),
    unit: input.unit,
    detectedBy: input.detectedBy,
    disposalMethod: "pending",
    status: "detected",
    industryMetadata: input.industryMetadata ?? null,
  });

  const insertId = (result as unknown as Array<{ insertId?: number }>)[0]?.insertId ?? 0;
  return { id: Number(insertId), code };
}

/**
 * tenant + industry 기준 목록 조회 (view filter).
 * @returns 발견일 내림차순
 */
export async function listNonconformings(
  tenantId: number,
  industry: IndustryContext,
  options?: { status?: NonconformingStatus; limit?: number; offset?: number },
): Promise<Nonconforming[]> {
  const db = await getDb();
  if (!db) return [];

  const conds = [
    eq(hNonconformings.tenantId, tenantId),
    eq(hNonconformings.industry, industry),
  ];
  if (options?.status) conds.push(eq(hNonconformings.status, options.status));

  const rows = await db
    .select()
    .from(hNonconformings)
    .where(and(...conds))
    .orderBy(desc(hNonconformings.detectionDate), desc(hNonconformings.id))
    .limit(options?.limit ?? 50)
    .offset(options?.offset ?? 0);

  return rows.map(rowToEntity);
}

/**
 * 단건 조회 — tenant + industry 검증 (cross-industry 차단).
 */
export async function getNonconformingById(
  tenantId: number,
  industry: IndustryContext,
  id: number,
): Promise<Nonconforming | null> {
  const db = await getDb();
  if (!db) return null;

  const rows = await db
    .select()
    .from(hNonconformings)
    .where(
      and(
        eq(hNonconformings.id, id),
        eq(hNonconformings.tenantId, tenantId),
        eq(hNonconformings.industry, industry),
      ),
    )
    .limit(1);

  return rows[0] ? rowToEntity(rows[0]) : null;
}

// ─────────────────────────────────────────────────────────────
// 워크플로 액션 (조사 / 처리 / 상태 전이)
// ─────────────────────────────────────────────────────────────

/**
 * 근본 원인 분석 결과 입력.
 *   조사 단계 (under_investigation) 에서 일반적으로 호출.
 *   종결 (closed/cancelled) 상태에서는 거부.
 */
export async function setNonconformingRootCause(args: {
  tenantId: number;
  industry: IndustryContext;
  id: number;
  rootCause: string;
  causeCategory: CauseCategory;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const current = await getNonconformingById(args.tenantId, args.industry, args.id);
  if (!current) throw new Error(`Nonconforming 미존재 (id=${args.id})`);
  if (current.status === "closed" || current.status === "cancelled") {
    throw new Error(`종결 상태에서 원인 분석 변경 불가 (status=${current.status})`);
  }

  await db
    .update(hNonconformings)
    .set({ rootCause: args.rootCause, causeCategory: args.causeCategory })
    .where(
      and(
        eq(hNonconformings.id, args.id),
        eq(hNonconformings.tenantId, args.tenantId),
        eq(hNonconformings.industry, args.industry),
      ),
    );
}

/**
 * 처리 결정 입력 (disposal 단계).
 *   pending_disposal → disposed 전환 직전에 일반적으로 호출.
 */
export async function setNonconformingDisposal(args: {
  tenantId: number;
  industry: IndustryContext;
  id: number;
  disposalMethod: DisposalMethod;
  disposalDate?: string;
  disposalDetails?: string;
  disposalCost?: number;
  preventiveActions?: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const current = await getNonconformingById(args.tenantId, args.industry, args.id);
  if (!current) throw new Error(`Nonconforming 미존재 (id=${args.id})`);
  if (current.status === "closed" || current.status === "cancelled") {
    throw new Error(`종결 상태에서 처리 변경 불가 (status=${current.status})`);
  }

  const updates: Record<string, unknown> = {
    disposalMethod: args.disposalMethod,
  };
  if (args.disposalDate !== undefined) updates.disposalDate = args.disposalDate;
  if (args.disposalDetails !== undefined) updates.disposalDetails = args.disposalDetails;
  if (args.disposalCost !== undefined) updates.disposalCost = String(args.disposalCost);
  if (args.preventiveActions !== undefined) updates.preventiveActions = args.preventiveActions;

  await db
    .update(hNonconformings)
    .set(updates)
    .where(
      and(
        eq(hNonconformings.id, args.id),
        eq(hNonconformings.tenantId, args.tenantId),
        eq(hNonconformings.industry, args.industry),
      ),
    );
}

/**
 * CAPA 연계 — Y-2-2 (CAPA core-mes 추출) 머지 후 활성.
 * 본 함수는 단순 FK 갱신만. CAPA 존재 검증은 호출자 책임.
 */
export async function linkNonconformingToCorrectiveAction(args: {
  tenantId: number;
  industry: IndustryContext;
  id: number;
  correctiveActionId: number | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  await db
    .update(hNonconformings)
    .set({ correctiveActionId: args.correctiveActionId })
    .where(
      and(
        eq(hNonconformings.id, args.id),
        eq(hNonconformings.tenantId, args.tenantId),
        eq(hNonconformings.industry, args.industry),
      ),
    );
}

/**
 * 상태 전이 (canTransition 검증 강제).
 * disposed 시 approvedBy/approvedAt 자동 채움.
 */
export async function transitionNonconformingStatus(args: {
  tenantId: number;
  industry: IndustryContext;
  id: number;
  toStatus: NonconformingStatus;
  approvedBy?: number;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const current = await getNonconformingById(args.tenantId, args.industry, args.id);
  if (!current) {
    throw new Error(`Nonconforming 미존재 (id=${args.id})`);
  }

  if (!canTransition(current.status, args.toStatus)) {
    throw new Error(
      `잘못된 상태 전이: ${current.status} → ${args.toStatus} (canTransition 거부)`,
    );
  }

  const updates: Record<string, unknown> = { status: args.toStatus };
  if (args.toStatus === "disposed") {
    if (!args.approvedBy) {
      throw new Error("disposed 전이 시 approvedBy 필수");
    }
    updates.approvedBy = args.approvedBy;
    updates.approvedAt = new Date();
  }

  await db
    .update(hNonconformings)
    .set(updates)
    .where(
      and(
        eq(hNonconformings.id, args.id),
        eq(hNonconformings.tenantId, args.tenantId),
        eq(hNonconformings.industry, args.industry),
      ),
    );
}

// ─────────────────────────────────────────────────────────────
// 통계 (cross-industry / view filter 양쪽 지원)
// ─────────────────────────────────────────────────────────────

/**
 * tenant 내 industry × status 카운트.
 * cross-industry 운영 대시보드 (식품 + 화장품 + 의약품 한 화면) 용.
 */
export async function getNonconformingStats(
  tenantId: number,
): Promise<Array<{ industry: IndustryContext; status: NonconformingStatus; count: number }>> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({
      industry: hNonconformings.industry,
      status: hNonconformings.status,
      count: sql<number>`COUNT(*)`,
    })
    .from(hNonconformings)
    .where(eq(hNonconformings.tenantId, tenantId))
    .groupBy(hNonconformings.industry, hNonconformings.status);

  return rows.map((r) => ({
    industry: r.industry as IndustryContext,
    status: r.status as NonconformingStatus,
    count: Number(r.count),
  }));
}

// ─────────────────────────────────────────────────────────────
// row → entity 변환
// ─────────────────────────────────────────────────────────────

function rowToEntity(row: typeof hNonconformings.$inferSelect): Nonconforming {
  return {
    id: row.id,
    tenantId: row.tenantId,
    industry: row.industry as IndustryContext,
    code: row.code,
    detectionDate: typeof row.detectionDate === "string"
      ? row.detectionDate
      : (row.detectionDate as unknown as Date).toISOString().slice(0, 10),
    detectionSource: row.detectionSource as DetectionSource,
    nonconformityType: row.nonconformityType as NonconformityType,
    description: row.description,
    itemName: row.itemName,
    lotNumber: row.lotNumber ?? null,
    quantity: Number(row.quantity),
    unit: row.unit,
    rootCause: row.rootCause ?? null,
    causeCategory: (row.causeCategory as CauseCategory | null) ?? null,
    disposalMethod: row.disposalMethod as DisposalMethod,
    disposalDate: row.disposalDate
      ? typeof row.disposalDate === "string"
        ? row.disposalDate
        : (row.disposalDate as unknown as Date).toISOString().slice(0, 10)
      : null,
    disposalDetails: row.disposalDetails ?? null,
    disposalCost: row.disposalCost !== null && row.disposalCost !== undefined
      ? Number(row.disposalCost)
      : null,
    detectedBy: row.detectedBy,
    responsiblePerson: row.responsiblePerson ?? null,
    approvedBy: row.approvedBy ?? null,
    approvedAt: row.approvedAt ?? null,
    correctiveActionId: row.correctiveActionId ?? null,
    preventiveActions: row.preventiveActions ?? null,
    status: row.status as NonconformingStatus,
    notes: row.notes ?? null,
    industryMetadata: (row.industryMetadata as Record<string, unknown> | null) ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

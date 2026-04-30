/**
 * Change Control 라우터 (Layer 3 / routers / coreMes)
 *
 * ============================================================================
 * Phase Y-2-0-b — core-mes/quality 첫 라우터.
 *
 * tRPC 경로: trpc.coreMesChangeControl.*
 *   - list({ industry?, status?, limit? })       — 목록 (industry view filter)
 *   - getById({ id })                              — 단건
 *   - create({ industry, title, description, changeType, impact?, industryMetadata? })
 *   - updateDraft({ id, title?, description?, changeType?, impact?, industryMetadata? })
 *   - transition({ id, to })                       — 상태 전이 (canTransition 검증)
 *   - countByStatus({ industry? })                 — 통계
 *
 * industry 별 페이지 (Y-2-0-c) 가 list({ industry: "food"|"cosmetic"|... }) 로 호출.
 * 단일 테이블 + view filter — ADR-003 Industry-First Menu 정책 준수.
 *
 * 의존성 (.dependency-cruiser.cjs):
 *   - server/_core/trpc
 *   - server/db/coreMes/quality (어댑터)
 *   - server/core-mes/quality/changeControl (entity 타입만)
 *   - industry/* 무참조
 *
 * 운영 영향: 0
 *   - tRPC 경로만 추가, 기존 경로 변경 X
 *   - DB 는 PR #179 에서 이미 생성된 h_change_controls 사용
 * ============================================================================
 */
import { z } from "zod";
import { router, tenantRequiredProcedure } from "../../_core/trpc";
import {
  countByStatus,
  createChangeControl,
  getChangeControlById,
  listChangeControls,
  transitionChangeControlStatus,
  updateChangeControlDraft,
} from "../../db/coreMes/quality/changeControlAdapter";

// ENUM 값 — entity 의 source-of-truth 와 동기 (server/core-mes/quality/changeControl.ts)
const CHANGE_TYPE = [
  "process",
  "specification",
  "formulation",
  "equipment",
  "supplier",
  "label",
  "document",
  "system",
  "other",
] as const;

const CHANGE_IMPACT = ["critical", "major", "minor"] as const;

const CHANGE_STATUS = [
  "draft",
  "submitted",
  "evaluating",
  "approved",
  "implementing",
  "verifying",
  "closed",
  "rejected",
  "cancelled",
] as const;

const INDUSTRY = [
  "food",
  "cosmetic",
  "pharmaceutical",
  "health-functional",
  "medical-device",
  "general-manufacturing",
] as const;

/** Drizzle row → 클라이언트 친화 형태 직렬화 */
function serializeRow(row: any) {
  return {
    id: Number(row.id),
    tenantId: Number(row.tenantId),
    industry: row.industry as (typeof INDUSTRY)[number],
    code: String(row.code),
    title: String(row.title),
    description: String(row.description),
    changeType: row.changeType as (typeof CHANGE_TYPE)[number],
    impact: row.impact as (typeof CHANGE_IMPACT)[number],
    status: row.status as (typeof CHANGE_STATUS)[number],
    requestedBy: Number(row.requestedBy),
    requestedAt: row.requestedAt,
    approvedBy: row.approvedBy != null ? Number(row.approvedBy) : null,
    approvedAt: row.approvedAt,
    closedAt: row.closedAt,
    industryMetadata:
      (row.industryMetadata as Record<string, unknown> | null) ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export const coreMesChangeControlRouter = router({
  /**
   * 목록 조회 — industry view filter.
   *
   * 사용 예 (industry 페이지):
   *   trpc.coreMesChangeControl.list.useQuery({ industry: "food" })
   */
  list: tenantRequiredProcedure
    .input(
      z
        .object({
          industry: z.enum(INDUSTRY).optional(),
          status: z.enum(CHANGE_STATUS).optional(),
          limit: z.number().int().positive().max(500).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const rows = await listChangeControls(input, ctx.tenantId);
      return {
        items: rows.map(serializeRow),
        total: rows.length,
      };
    }),

  /** 단건 조회 */
  getById: tenantRequiredProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const row = await getChangeControlById(input.id, ctx.tenantId);
      if (!row) return null;
      return serializeRow(row);
    }),

  /**
   * 신규 변경 신청 (status = "draft").
   * 코드 자동 채번 (CC-YYYY-NNNN).
   */
  create: tenantRequiredProcedure
    .input(
      z.object({
        industry: z.enum(INDUSTRY),
        title: z.string().min(1).max(255),
        description: z.string().min(1),
        changeType: z.enum(CHANGE_TYPE),
        impact: z.enum(CHANGE_IMPACT).optional(),
        industryMetadata: z.record(z.string(), z.unknown()).nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return createChangeControl(
        {
          industry: input.industry,
          title: input.title,
          description: input.description,
          changeType: input.changeType,
          impact: input.impact,
          requestedBy: Number(ctx.user.id),
          industryMetadata: input.industryMetadata ?? null,
        },
        ctx.tenantId,
      );
    }),

  /**
   * draft 본문 수정. status != "draft" 면 throw.
   */
  updateDraft: tenantRequiredProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        title: z.string().min(1).max(255).optional(),
        description: z.string().min(1).optional(),
        changeType: z.enum(CHANGE_TYPE).optional(),
        impact: z.enum(CHANGE_IMPACT).optional(),
        industryMetadata: z.record(z.string(), z.unknown()).nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      await updateChangeControlDraft(id, rest, ctx.tenantId);
      return { success: true };
    }),

  /**
   * 상태 전이. canTransition() 위반 시 throw.
   * approved → approvedBy/approvedAt, closed → closedAt 자동 채움.
   */
  transition: tenantRequiredProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        to: z.enum(CHANGE_STATUS),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const updated = await transitionChangeControlStatus(
        input.id,
        { to: input.to, actorUserId: Number(ctx.user.id) },
        ctx.tenantId,
      );
      return serializeRow(updated);
    }),

  /**
   * status 별 카운트 (대시보드 위젯용).
   */
  countByStatus: tenantRequiredProcedure
    .input(
      z
        .object({
          industry: z.enum(INDUSTRY).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      return countByStatus(ctx.tenantId, input?.industry);
    }),
});

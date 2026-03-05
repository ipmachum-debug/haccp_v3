// arLedger 라우터 - routers.ts에서 분리됨
// [P2-1] accounting_account_id 연결 + tenant 격리 추가
import { adminProcedure, tenantRequiredProcedure, router } from "../../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

// 테넌트 격리 헬퍼
function getEffectiveTenantId(ctx: any): number {
  const tenantId = ctx.tenantId;
  if (!tenantId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "테넌트 정보가 필요합니다." });
  }
  return tenantId;
}

export const arLedgerRouter = router({
    // 매출 거래 생성 (accountingAccountId 지원)
    create: adminProcedure
      .input(
        z.object({
          customerPartnerId: z.number(),
          occurredAt: z.string(),
          arEntryType: z.enum(["debit", "payment", "credit", "writeoff", "adjust"]),
          amount: z.string(),
          dueDate: z.string().optional(),
          refType: z.string().optional(),
          refId: z.number().optional(),
          memo: z.string().optional(),
          accountingAccountId: z.number().optional(), // FK → accounting_accounts.id
        })
      )
      .mutation(async ({ input, ctx }) => {
        const tenantId = getEffectiveTenantId(ctx);
        const { createArLedgerEntry } = await import("../../partners");
        const { occurredAt, dueDate, ...rest } = input;
        const id = await createArLedgerEntry({
          ...rest,
          tenantId,
          occurredAt: new Date(occurredAt),
          dueDate: dueDate ? new Date(dueDate) : undefined,
          createdBy: ctx.user.id
        });
        return { id };
      }),

    // 매출 원장 목록 조회 (tenant 격리)
    list: tenantRequiredProcedure
      .input(
        z
          .object({
            customerPartnerId: z.number().optional(),
            startDate: z.string().optional(),
            endDate: z.string().optional(),
            arEntryType: z.enum(["debit", "payment", "credit", "writeoff", "adjust"]).optional()
          })
          .optional()
      )
      .query(async ({ input, ctx }) => {
        const tenantId = getEffectiveTenantId(ctx);
        const { getArLedger } = await import("../../partners");
        return await getArLedger({ ...input, tenantId });
      }),

    // 매출 원장 상세 조회
    getById: tenantRequiredProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const tenantId = getEffectiveTenantId(ctx);
        const { getArLedgerById } = await import("../../partners");
        return await getArLedgerById(input.id, tenantId);
      }),

    // 고객사별 매출 집계
    summaryByCustomer: tenantRequiredProcedure
      .input(
        z.object({
          startDate: z.string().optional(),
          endDate: z.string().optional()
        })
      )
      .query(async ({ input, ctx }) => {
        const tenantId = getEffectiveTenantId(ctx);
        const { getArSummaryByCustomer } = await import("../../partners");
        return await getArSummaryByCustomer(input.startDate, input.endDate, tenantId);
      }),

    // 매입/매출 통합 집계
    financialSummary: tenantRequiredProcedure
      .input(
        z.object({
          startDate: z.string().optional(),
          endDate: z.string().optional()
        })
      )
      .query(async ({ input, ctx }) => {
        const tenantId = getEffectiveTenantId(ctx);
        const { getFinancialSummary } = await import("../../partners");
        return await getFinancialSummary(input.startDate, input.endDate, tenantId);
      }),
});

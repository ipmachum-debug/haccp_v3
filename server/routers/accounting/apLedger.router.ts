// apLedger 라우터 - routers.ts에서 분리됨
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

export const apLedgerRouter = router({
    // 매입 거래 생성 (accountingAccountId 지원)
    create: adminProcedure
      .input(
        z.object({
          supplierPartnerId: z.number(),
          occurredAt: z.string(),
          apEntryType: z.enum(["bill", "payment", "credit", "adjust"]),
          amount: z.string(),
          dueDate: z.string().optional(), // Phase B: 지급 만기일 (미지정 시 자동 계산)
          refType: z.string().optional(),
          refId: z.number().optional(),
          memo: z.string().optional(),
          accountingAccountId: z.number().optional(), // FK → accounting_accounts.id
        })
      )
      .mutation(async ({ input, ctx }) => {
        const tenantId = getEffectiveTenantId(ctx);
        const { createApLedgerEntry, resolveDueDate } = await import("../../partners");
        const { dueDate, ...rest } = input;
        // Phase B: payment_terms_days 기반 자동 만기일 계산 (dueDate 명시 없을 때)
        const resolvedDueDate = await resolveDueDate(
          tenantId,
          input.supplierPartnerId,
          input.occurredAt,
          dueDate,
        );
        const id = await createApLedgerEntry({
          ...rest,
          tenantId,
          occurredAt: new Date(input.occurredAt),
          dueDate: resolvedDueDate ?? undefined,
          createdBy: ctx.user.id
        });
        return { id };
      }),

    // 매입 원장 목록 조회 (tenant 격리)
    list: tenantRequiredProcedure
      .input(
        z
          .object({
            supplierPartnerId: z.number().optional(),
            startDate: z.string().optional(),
            endDate: z.string().optional(),
            apEntryType: z.enum(["bill", "payment", "credit", "adjust"]).optional()
          })
          .optional()
      )
      .query(async ({ input, ctx }) => {
        const tenantId = getEffectiveTenantId(ctx);
        const { getApLedger } = await import("../../partners");
        return await getApLedger({ ...input, tenantId });
      }),

    // 매입 원장 상세 조회
    getById: tenantRequiredProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const tenantId = getEffectiveTenantId(ctx);
        const { getApLedgerById } = await import("../../partners");
        return await getApLedgerById(input.id, tenantId);
      }),

    // 공급업체별 매입 집계
    summaryBySupplier: tenantRequiredProcedure
      .input(
        z.object({
          startDate: z.string().optional(),
          endDate: z.string().optional()
        })
      )
      .query(async ({ input, ctx }) => {
        const tenantId = getEffectiveTenantId(ctx);
        const { getApSummaryBySupplier } = await import("../../partners");
        return await getApSummaryBySupplier(input.startDate, input.endDate, tenantId);
      })
});

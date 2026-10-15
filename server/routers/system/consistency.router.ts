/**
 * 재고·LOT 정합성 점검 (2026-10-15) — 관리자 전용, 읽기 전용
 *
 * 생산 흐름(배치 → 원료 차감 → 제품 LOT → 생산완료 분개 → 판매 출고 → LOT 차감)을 기간으로 잘라 대조하고,
 * 기존 Module 0 의 재고 점검(음수 재고·LOT 잔량 vs 거래원장)을 함께 보여 준다.
 * 덤프를 받지 않고도 어느 회사에서나 같은 대조를 할 수 있게 — 이전에는 scripts/verify-consistency.ts (서버 전용) 만 있었다.
 * 로직: server/lib/consistency/productionChainChecks.ts · inventoryChecks.ts (SELECT 전용)
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../../_core/trpc";
import { getRawConnection } from "../../db/connection";
import { runProductionChainChecks } from "../../lib/consistency/productionChainChecks";
import { checkNegativeStock, checkLotVsTransactions } from "../../lib/consistency/inventoryChecks";
import { sortFindings, summarize } from "../../lib/consistency/types";

const YMD = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export function validateRange(from: string, to: string): string | null {
  if (from > to) return "시작일이 종료일보다 늦습니다.";
  const days = (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000;
  if (days > 370) return "기간은 1년 이내로 지정하세요.";
  return null;
}

export const consistencyRouter = router({
  productionChain: adminProcedure
    .input(z.object({ from: YMD, to: YMD }))
    .query(async ({ input, ctx }) => {
      const err = validateRange(input.from, input.to);
      if (err) throw new TRPCError({ code: "BAD_REQUEST", message: err });
      const tenantId = Number(ctx.tenantId);
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "회사(테넌트)를 확인할 수 없습니다." });
      const started = Date.now();
      const conn: any = await getRawConnection();
      const [chain, neg, lotVsTx] = await Promise.all([
        runProductionChainChecks(conn, tenantId, input),
        checkNegativeStock(conn, tenantId),
        checkLotVsTransactions(conn, tenantId),
      ]);
      const findings = sortFindings([...chain, neg, lotVsTx]);
      return { tenantId, range: input, generatedAt: new Date().toISOString(), durationMs: Date.now() - started, findings, summary: summarize(findings) };
    }),
});

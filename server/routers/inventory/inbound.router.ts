/**
 * 입고 문서 라우터 (2026-10-17, 입고 정본화 PR-2) — 처리는 server/lib/inventory/inbound/inboundService.ts 하나.
 * 화면 연결(발주서에서 입고 / 발주 없이 직접 입고) 은 PR-3·4. 회사는 서버 ctx 의 tenantId 만 쓴다.
 */
import { z } from "zod";
import { router, requireCapability } from "../../_core/trpc";
import {
  createInboundDraft, confirmInbound, approveInbound, cancelInboundLine, getReceivableLines,
} from "../../lib/inventory/inbound/inboundService";

const readInventory = requireCapability("ERP_INVENTORY", "READ");
const writeInventory = requireCapability("ERP_INVENTORY", "WRITE");
const approvePurchase = requireCapability("ERP_PURCHASE", "APPROVE");
const cancelPurchase = requireCapability("ERP_PURCHASE", "CANCEL");

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const lineInput = z.object({
  materialId: z.number().int().positive(),
  poLineId: z.number().int().positive().nullish(),
  purchaseQuantity: z.number().positive(),
  purchaseUnit: z.string().min(1).max(20),
  stockQuantity: z.number().positive(),
  stockUnit: z.string().min(1).max(20),
  unitPrice: z.number().min(0),
  lotNumber: z.string().max(100).nullish(),
  expiryDate: ymd.nullish(),
  productionDate: ymd.nullish(),
  location: z.string().max(100).nullish(),
  inspectionResult: z.enum(["pending", "pass", "fail", "conditional"]).nullish(),
  inspectionJson: z.record(z.string(), z.unknown()).nullish(),
  notes: z.string().nullish(),
});

export const inboundRouter = router({
  createDraft: writeInventory
    .input(z.object({
      idempotencyKey: z.string().min(8).max(64),
      sourceType: z.enum(["purchase_order", "direct"]),
      poId: z.number().int().positive().nullish(),
      supplierId: z.number().int().positive().nullish(),
      inboundDate: ymd,
      notes: z.string().nullish(),
      lines: z.array(lineInput).min(1).max(200),
    }))
    .mutation(({ ctx, input }) => createInboundDraft({ ...input, tenantId: ctx.tenantId, userId: ctx.user.id } as any)),

  confirm: writeInventory
    .input(z.object({ headerId: z.number().int().positive() }))
    .mutation(({ ctx, input }) => confirmInbound(input.headerId, ctx.tenantId, ctx.user.id)),

  approve: approvePurchase
    .input(z.object({ headerId: z.number().int().positive() }))
    .mutation(({ ctx, input }) => approveInbound(input.headerId, ctx.tenantId, ctx.user.id)),

  cancelLine: cancelPurchase
    .input(z.object({ lineId: z.number().int().positive(), reason: z.string().max(500).optional() }))
    .mutation(({ ctx, input }) => cancelInboundLine(input.lineId, ctx.tenantId, ctx.user.id, input.reason)),

  receivableLines: readInventory
    .input(z.object({ poId: z.number().int().positive() }))
    .query(({ ctx, input }) => getReceivableLines(input.poId, ctx.tenantId)),
});

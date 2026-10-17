/**
 * 입고 문서 라우터 (2026-10-17, 입고 정본화 PR-2) — 처리는 server/lib/inventory/inbound/inboundService.ts 하나.
 * 화면 연결(발주서에서 입고 / 발주 없이 직접 입고) 은 PR-3·4. 회사는 서버 ctx 의 tenantId 만 쓴다.
 */
import { z } from "zod";
import { router, requireCapability, adminProcedure, tenantRequiredProcedure } from "../../_core/trpc";
import {
  createInboundDraft, confirmInbound, approveInbound, cancelInboundLine, getReceivableLines,
} from "../../lib/inventory/inbound/inboundService";
import { listPackUnits, upsertPackUnit, deactivatePackUnit } from "../../lib/inventory/inbound/packUnits";
import { getRawConnection } from "../../db/connection";

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
  stockQuantity: z.number().positive().nullish(), // 생략하면 서버가 포장 단위 환산으로 계산
  stockUnit: z.string().min(1).max(20).nullish(),
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

  // 재고관리 사용 여부 (CEO 결정 2) — 설정이 없으면 구독 패키지의 HACCP 사용 여부(이전 동작)
  inventoryTracking: tenantRequiredProcedure.query(async ({ ctx }) => {
    const { getInventoryTrackingSetting } = await import("../../lib/inventory/inventoryTrackingPolicy");
    return getInventoryTrackingSetting(ctx.tenantId);
  }),
  setInventoryTracking: adminProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { setTenantFeature } = await import("../../lib/production/massBasisPolicy");
      const { INVENTORY_TRACKING_FEATURE } = await import("../../lib/inventory/inventoryTrackingPolicy");
      if (!ctx.tenantId) throw new Error("테넌트 정보가 필요합니다.");
      await setTenantFeature(await getRawConnection(), ctx.tenantId, INVENTORY_TRACKING_FEATURE, input.enabled, ctx.user?.id ?? null);
      const { createAuditLog } = await import("../../db/system/auditApprovalSupplier");
      await createAuditLog({
        action: "tenant_feature.update", entityType: "tenant_feature", userId: ctx.user?.id,
        changes: { feature: INVENTORY_TRACKING_FEATURE, enabled: input.enabled },
        description: `재고관리 ${input.enabled ? "사용" : "사용 안 함 (회계만)"}`,
      } as any, ctx.tenantId);
      return { enabled: input.enabled };
    }),

  // 포장 단위 환산 (예: 쌀 1포대 = 20kg) — 없으면 그 단위로 입고할 수 없다
  packUnits: readInventory
    .input(z.object({ materialId: z.number().int().positive().optional() }).optional())
    .query(async ({ ctx, input }) => listPackUnits(await getRawConnection(), ctx.tenantId, input?.materialId ?? null)),
  savePackUnit: writeInventory
    .input(z.object({ materialId: z.number().int().positive(), packUnit: z.string().min(1).max(20), baseQty: z.number().positive() }))
    .mutation(async ({ ctx, input }) => {
      const { toInventoryMaterialId } = await import("../../lib/identity/itemIdentityService");
      const conn = await getRawConnection();
      const materialId = (await toInventoryMaterialId(input.materialId, ctx.tenantId, conn)).id;
      return upsertPackUnit(conn, { tenantId: ctx.tenantId, userId: ctx.user.id, materialId, packUnit: input.packUnit, baseQty: input.baseQty });
    }),
  deactivatePackUnit: writeInventory
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => deactivatePackUnit(await getRawConnection(), ctx.tenantId, ctx.user.id, input.id)),
});

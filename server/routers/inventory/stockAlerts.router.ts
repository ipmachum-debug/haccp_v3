// stockAlerts 라우터 - routers.ts에서 분리됨
import { tenantRequiredProcedure, router } from "../../_core/trpc";
import { z } from "zod";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { hInventoryLots } from "../../../drizzle/schema";
import { getDb } from "../../db";

export const stockAlertsRouter = router({
    // 알람 목록 조회
    list: tenantRequiredProcedure
      .input(
        z.object({
          resolved: z.boolean().optional(), // true: 해제된 알람만, false: 미해제 알람만, undefined: 전체
          alertType: z.enum(["low_stock", "expiring_soon", "expired", "overstock"]).optional()
        })
      )
      .query(async ({ input, ctx }) => {
        const db = await getDb();
        const { hStockAlerts, hInventoryLots, hInventory } = await import("../../../drizzle/schema/part2");
        const { eq, and, isNull, isNotNull, desc } = await import("drizzle-orm");

        const conditions = [eq(hStockAlerts.tenantId, ctx.user.tenantId)];
        if (input.resolved !== undefined) {
          conditions.push(input.resolved ? isNotNull(hStockAlerts.resolvedAt) : isNull(hStockAlerts.resolvedAt));
        }
        if (input.alertType) {
          conditions.push(eq(hStockAlerts.alertType, input.alertType));
        }

        const alerts = await db
          .select({
            id: hStockAlerts.id,
            alertType: hStockAlerts.alertType,
            alertDate: hStockAlerts.alertDate,
            message: hStockAlerts.message,
            severity: hStockAlerts.severity,
            resolvedAt: hStockAlerts.resolvedAt,
            resolvedBy: hStockAlerts.resolvedBy,
            inventoryId: hStockAlerts.inventoryId,
            lotId: hStockAlerts.lotId,
            createdAt: hStockAlerts.createdAt,
            // LOT 정보
            lotNumber: hInventoryLots.lotNumber,
            expiryDate: hInventoryLots.expiryDate,
            productionDate: hInventoryLots.productionDate,
            // 재고 정보
            itemName: hInventory.itemName
          })
          .from(hStockAlerts)
          .leftJoin(hInventoryLots, eq(hStockAlerts.lotId, hInventoryLots.id))
          .leftJoin(hInventory, eq(hStockAlerts.inventoryId, hInventory.id))
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(hStockAlerts.createdAt));

        return alerts;
      }),

    // 알람 해제
    resolve: tenantRequiredProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        const { hStockAlerts } = await import("../../../drizzle/schema/part2");
        const { eq, and } = await import("drizzle-orm");

        await db
          .update(hStockAlerts)
          .set({
            resolvedAt: new Date(),
            resolvedBy: ctx.user.name
          })
          .where(and(eq(hStockAlerts.id, input.id), eq(hStockAlerts.tenantId, ctx.user.tenantId)));

        return { success: true };
      }),

    // 알람 통계
    getStats: tenantRequiredProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      const { hStockAlerts } = await import("../../../drizzle/schema/part2");
      const { eq, count, isNull, and } = await import("drizzle-orm");

      const tenantFilter = eq(hStockAlerts.tenantId, ctx.user.tenantId);

      const [totalResult] = await db.select({ count: count() }).from(hStockAlerts).where(and(tenantFilter, isNull(hStockAlerts.resolvedAt)));

      const [expiringResult] = await db
        .select({ count: count() })
        .from(hStockAlerts)
        .where(and(tenantFilter, eq(hStockAlerts.alertType, "expiring_soon"), isNull(hStockAlerts.resolvedAt)));

      const [expiredResult] = await db
        .select({ count: count() })
        .from(hStockAlerts)
        .where(and(tenantFilter, eq(hStockAlerts.alertType, "expired"), isNull(hStockAlerts.resolvedAt)));

      const [lowStockResult] = await db
        .select({ count: count() })
        .from(hStockAlerts)
        .where(and(tenantFilter, eq(hStockAlerts.alertType, "low_stock"), isNull(hStockAlerts.resolvedAt)));

      return {
        total: totalResult.count,
        expiringSoon: expiringResult.count,
        expired: expiredResult.count,
        lowStock: lowStockResult.count
      };
    })
});

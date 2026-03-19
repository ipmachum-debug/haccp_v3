// lotManagement 라우터 - routers.ts에서 분리됨
import { tenantRequiredProcedure, router } from "../../_core/trpc";
import { z } from "zod";
import { lt, or } from "drizzle-orm";
import { getDb, getRawConnection } from "../../db";

export const lotManagementRouter = router({
    // 원재료 입고 + LOT 자동 생성 + 매입전표 자동 생성
    createReceivingWithLot: tenantRequiredProcedure
      .input(z.object({
        materialId: z.number(),
        materialCode: z.string(),
        quantity: z.number(),
        unit: z.string().default('kg'),
        unitPrice: z.number().optional(),
        supplierName: z.string().optional(),
        partnerId: z.number().optional(), // 마스터 거래처 ID
        expiryDate: z.string().optional(),
        receiptDate: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { getDb, getRawConnection } = await import("../../db");
        const db = await getDb();
        if (!db) throw new Error("DB 연결 실패");
        const pool = await getRawConnection();
        const { createMaterialReceivingWithLot } = await import("../../db/visualInspection");
        
        // 거래처 ID → 이름 조회 (마스터 거래처 연동)
        let supplierName = input.supplierName;
        if (input.partnerId && !supplierName) {
          const [partnerRows] = await pool.execute(
            `SELECT company_name FROM partners WHERE id = ? AND tenant_id = ?`,
            [input.partnerId, ctx.tenantId ?? undefined]
          );
          supplierName = (partnerRows as any[])?.[0]?.company_name || supplierName;
        }
        
        const result = await createMaterialReceivingWithLot(db, pool, ctx.tenantId ?? undefined, {
          ...input,
          supplierName,
          userId: ctx.user.id,
        });
        
        // 매입전표 자동 생성 (단가가 있는 경우)
        if (input.unitPrice && input.unitPrice > 0) {
          try {
            const totalAmount = input.quantity * input.unitPrice;
            const receiptDate = input.receiptDate || new Date().toISOString().split("T")[0];
            await pool.execute(
              `INSERT INTO accounting_purchases (
                tenant_id, transaction_date, partner_id, item_name, quantity, unit, unit_price,
                total_amount, status, notes, source_type, source_id, created_by, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, 'material_receipt', ?, ?, NOW())`,
              [
                ctx.tenantId ?? undefined, receiptDate,
                input.partnerId || null,
                input.materialCode + (supplierName ? ` (${supplierName})` : ''),
                input.quantity, input.unit, input.unitPrice,
                totalAmount,
                `원재료 입고 자동생성 (LOT: ${result.lotNumber})${input.notes ? ' - ' + input.notes : ''}`,
                result.lotId || 0,
                ctx.user.id
              ]
            );
            return { ...result, accountingPurchaseCreated: true };
          } catch (err) {
            console.error('[createReceivingWithLot] 매입전표 자동생성 실패:', err);
            return { ...result, accountingPurchaseCreated: false };
          }
        }
        
        return { ...result, accountingPurchaseCreated: false };
      }),

    // LOT 이력 조회 (입고→사용→출고 추적)
    getLotHistory: tenantRequiredProcedure
      .input(z.object({
        materialId: z.number().optional(),
        lotNumber: z.string().optional(),
        limit: z.number().optional(),
      }))
      .query(async ({ input, ctx }) => {
        const { getDb } = await import("../../db");
        const db = await getDb();
        if (!db) return [];
        try {
          const { getMaterialLotHistory } = await import("../../db/visualInspection");
          return await getMaterialLotHistory(db, ctx.tenantId ?? undefined, input);
        } catch (err) {
          console.error('[lotManagement.getLotHistory]', err);
          return [];
        }
      }),

    // 기존 입고 건 LOT 일괄 생성 (backfill)
    backfillLots: tenantRequiredProcedure
      .mutation(async ({ ctx }) => {
        const { getDb, getRawConnection } = await import("../../db");
        const db = await getDb();
        if (!db) throw new Error("DB 연결 실패");
        const pool = await getRawConnection();
        const { backfillMaterialReceivingLots } = await import("../../db/visualInspection");
        return await backfillMaterialReceivingLots(db, pool, ctx.tenantId ?? undefined, ctx.user.id);
      }),
});

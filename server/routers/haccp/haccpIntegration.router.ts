// haccpIntegration 라우터 - routers.ts에서 분리됨
import { adminProcedure, tenantRequiredProcedure, router } from "../../_core/trpc";
import { z } from "zod";

import { todayKST } from "../../utils/timezone";

export const haccpIntegrationRouter = router({
    // 재고 입고 → 매입 거래 생성
    createPurchaseFromReceipt: adminProcedure
      .input(
        z.object({
          inventoryTransactionId: z.number(),
          partnerId: z.number().optional(),
          itemName: z.string(),
          quantity: z.string(),
          unit: z.string(),
          unitPrice: z.string(),
          taxRate: z.string().optional(),
          notes: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { createPurchaseFromReceipt } = await import("../../db/haccp/haccpIntegration");
        return await createPurchaseFromReceipt({
          ...input,
          createdBy: ctx.user.id
        }, ctx.tenantId);
      }),

    // 매입 거래 상세 조회
    getPurchaseById: tenantRequiredProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getPurchaseById } = await import("../../db/haccp/haccpIntegration");
        return await getPurchaseById(input.id, ctx.tenantId);
      }),

    getSaleById: tenantRequiredProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getSaleById } = await import("../../db/haccp/haccpIntegration");
        return await getSaleById(input.id, ctx.tenantId);
      }),

    generatePurchasePdf: tenantRequiredProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { generatePurchasePdf } = await import("../../db/haccp/haccpIntegration");
        const pdfUrl = await generatePurchasePdf(input.id, ctx.tenantId);
        return { pdfUrl };
      }),

    generateSalePdf: tenantRequiredProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { generateSalePdf } = await import("../../db/haccp/haccpIntegration");
        const pdfUrl = await generateSalePdf(input.id, ctx.tenantId);
        return { pdfUrl };
      }),

    // 재고 출고 → 매출 거래 생성
    createSaleFromUsage: tenantRequiredProcedure
      .input(
        z.object({
          inventoryTransactionId: z.number().optional(),
          partnerId: z.number().optional(),
          itemName: z.string(),
          quantity: z.string(),
          unit: z.string(),
          unitPrice: z.string(),
          taxRate: z.string().optional(),
          notes: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { createSaleFromUsage } = await import("../../db/haccp/haccpIntegration");
        return await createSaleFromUsage({
          ...input,
          createdBy: ctx.user.id
        }, ctx.tenantId);
      }),

    // 재고 거래 ID로 회계 거래 조회
    getAccountingByInventoryTransaction: adminProcedure
      .input(z.object({ inventoryTransactionId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getAccountingByInventoryTransaction } = await import("../../db/haccp/haccpIntegration");
        return await getAccountingByInventoryTransaction(input.inventoryTransactionId, ctx.tenantId);
      }),

    // 매입 거래 목록 조회
    getAllPurchases: adminProcedure
      .input(
        z
          .object({
            startDate: z.string().optional(),
            endDate: z.string().optional(),
            partnerId: z.number().optional(),
            itemName: z.string().optional(),
            status: z.string().optional()
          })
          .optional()
      )
      .query(async ({ input, ctx }) => {
        const { getAllPurchases } = await import("../../db/haccp/haccpIntegration");
        return await getAllPurchases(input, ctx.tenantId);
      }),

    // 매입 거래 직접 생성 (품목 단위)
    createPurchase: adminProcedure
      .input(
        z.object({
          transactionDate: z.string(),
          partnerId: z.number(),
          itemName: z.string(),
          materialId: z.number().optional(), // 원재료 ID (레거시 호환)
          itemMasterId: z.number().optional(), // item_master ID (통합 기준)
          quantity: z.number(),
          packagingSize: z.number().optional(), // 포장규격
          unitPrice: z.number(),
          amount: z.number(),
          taxAmount: z.number(),
          memo: z.string().optional(),
          accountCategoryId: z.number().optional(),
          expiryDate: z.string().optional(), // 소비기한
          productionDate: z.string().optional(), // 생산일자
          unit: z.string().optional(), // 단위
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { createPurchase } = await import("../../db/haccp/haccpIntegration");
        return await createPurchase({
          ...input,
          createdBy: ctx.user.id
        }, ctx.tenantId);
      }),

    // 매출 거래 목록 조회
    getAllSales: adminProcedure
      .input(
        z
          .object({
            startDate: z.string().optional(),
            endDate: z.string().optional(),
            partnerId: z.number().optional(),
            itemName: z.string().optional(),
            status: z.string().optional()
          })
          .optional()
      )
      .query(async ({ input, ctx }) => {
        const { getAllSales } = await import("../../db/haccp/haccpIntegration");
        return await getAllSales(input, ctx.tenantId);
      }),

    // 매출 거래 직접 생성 (품목 단위)
    createSale: adminProcedure
      .input(
        z.object({
          transactionDate: z.string(),
          partnerId: z.number(),
          productId: z.number().optional(), // ★ 2026-04-14: h_products FK (Module 2)
          itemName: z.string(),
          quantity: z.number(),
          unitPrice: z.number(),
          amount: z.number(),
          taxAmount: z.number(),
          unit: z.string().optional(),
          memo: z.string().optional(),
          accountCategoryId: z.number().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { createSale } = await import("../../db/haccp/haccpIntegration");
        return await createSale({
          ...input,
          createdBy: ctx.user.id
        }, ctx.tenantId);
      }),

    // 매입 거래 수정
    updatePurchase: adminProcedure
      .input(
        z.object({
          id: z.number(),
          transactionDate: z.string().optional(),
          partnerId: z.number().optional(),
          materialId: z.number().optional(), // ★ 2026-04-13 추가: 원재료 FK
          itemName: z.string().optional(),
          category: z.string().optional(),
          quantity: z.number().optional(),
          unit: z.string().optional(),
          unitPrice: z.number().optional(),
          totalAmount: z.number().optional(),
          taxAmount: z.number().optional(),
          status: z.string().optional(),
          notes: z.string().optional(),
          accountCategoryId: z.number().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { updatePurchase } = await import("../../db/haccp/haccpIntegration");
        const { id, ...data } = input;
        return await updatePurchase(id, data, ctx.tenantId);
      }),

    // 매입 거래 삭제
    deletePurchase: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { deletePurchase } = await import("../../db/haccp/haccpIntegration");
        return await deletePurchase(input.id, ctx.tenantId);
      }),

    // 매출 거래 수정
    updateSale: adminProcedure
      .input(
        z.object({
          id: z.number(),
          transactionDate: z.string().optional(),
          partnerId: z.number().optional(),
          productId: z.number().optional(), // ★ 2026-04-14: h_products FK (Module 2)
          itemName: z.string().optional(),
          category: z.string().optional(),
          quantity: z.number().optional(),
          unit: z.string().optional(),
          unitPrice: z.number().optional(),
          totalAmount: z.number().optional(),
          taxAmount: z.number().optional(),
          status: z.string().optional(),
          notes: z.string().optional(),
          accountCategoryId: z.number().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { updateSale } = await import("../../db/haccp/haccpIntegration");
        const { id, ...data } = input;
        return await updateSale(id, data, ctx.tenantId);
      }),

    // 매출 거래 삭제
    deleteSale: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { deleteSale } = await import("../../db/haccp/haccpIntegration");
        return await deleteSale(input.id, ctx.tenantId);
      }),

    // 매입 거래명세표 PDF 생성
    generatePurchasePDF: tenantRequiredProcedure
      .input(z.object({ purchaseId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { generatePurchaseStatementPDF } = await import("../../db/accounting/transactionStatement");
        const pdfBuffer = await generatePurchaseStatementPDF(input.purchaseId, ctx.tenantId);
        
        // Base64로 변환하여 반환
        return {
          pdf: pdfBuffer.toString("base64"),
          filename: `매입거래명세표_${input.purchaseId}_${todayKST()}.pdf`
        };
      }),

    // 매출 거래명세표 PDF 생성
    generateSalePDF: tenantRequiredProcedure
      .input(z.object({ saleId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { generateSaleStatementPDF } = await import("../../db/accounting/transactionStatement");
        const pdfBuffer = await generateSaleStatementPDF(input.saleId, ctx.tenantId);

        // Base64로 변환하여 반환
        return {
          pdf: pdfBuffer.toString("base64"),
          filename: `매출거래명세표_${input.saleId}_${todayKST()}.pdf`
        };
      }),

    // ─── 그룹 PDF (2026-04-14 추가) ─────────────────────────
    // 매입 거래명세표 그룹 PDF — 같은 거래(날짜+거래처+증빙)의 여러 품목을 한 PDF 로 묶음
    generatePurchaseGroupPDF: tenantRequiredProcedure
      .input(z.object({ purchaseIds: z.array(z.number()).min(1) }))
      .mutation(async ({ input, ctx }) => {
        const { generatePurchaseStatementPDFByIds } = await import("../../db/accounting/transactionStatement");
        const pdfBuffer = await generatePurchaseStatementPDFByIds(input.purchaseIds, ctx.tenantId);
        return {
          pdf: pdfBuffer.toString("base64"),
          filename: `매입거래명세표_그룹_${input.purchaseIds.length}건_${todayKST()}.pdf`,
        };
      }),

    // 매출 거래명세표 그룹 PDF — 같은 거래의 여러 품목을 한 PDF 로 묶음
    generateSaleGroupPDF: tenantRequiredProcedure
      .input(z.object({ saleIds: z.array(z.number()).min(1) }))
      .mutation(async ({ input, ctx }) => {
        const { generateSaleStatementPDFByIds } = await import("../../db/accounting/transactionStatement");
        const pdfBuffer = await generateSaleStatementPDFByIds(input.saleIds, ctx.tenantId);
        return {
          pdf: pdfBuffer.toString("base64"),
          filename: `매출거래명세표_그룹_${input.saleIds.length}건_${todayKST()}.pdf`,
        };
      }),

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 엑셀 일괄 등록 API
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    // 매입 일괄 등록
    bulkCreatePurchases: adminProcedure
      .input(z.object({
        items: z.array(z.object({
          transactionDate: z.string(),
          partnerId: z.number(),
          itemName: z.string(),
          itemMasterId: z.number().optional(),
          quantity: z.number(),
          packagingSize: z.number().optional(),
          unitPrice: z.number(),
          amount: z.number(),
          taxAmount: z.number(),
          memo: z.string().optional(),
          unit: z.string().optional(),
        }))
      }))
      .mutation(async ({ input, ctx }) => {
        const { createPurchase } = await import("../../db/haccp/haccpIntegration");
        let successCount = 0;
        let failCount = 0;
        const errors: { index: number; message: string }[] = [];

        for (let i = 0; i < input.items.length; i++) {
          try {
            await createPurchase({
              ...input.items[i],
              createdBy: ctx.user.id,
            }, ctx.tenantId);
            successCount++;
          } catch (e: any) {
            failCount++;
            errors.push({ index: i, message: e.message || "Unknown error" });
          }
        }

        return { successCount, failCount, errors, total: input.items.length };
      }),

    // 매입 엑셀 업로드 중복 사전 검사 (Phase 8+)
    //   동일 거래처+날짜+품목명 조합이 이미 존재하는지 반환
    checkPurchaseDuplicates: adminProcedure
      .input(z.object({
        candidates: z.array(z.object({
          transactionDate: z.string(),
          partnerId: z.number(),
          itemName: z.string(),
        })).max(2000),
      }))
      .query(async ({ input, ctx }) => {
        if (input.candidates.length === 0) return [];
        const { getRawConnection } = await import("../../db");
        const conn = await getRawConnection();
        try {
          const dates = Array.from(new Set(input.candidates.map(c => c.transactionDate)));
          const partnerIds = Array.from(new Set(input.candidates.map(c => c.partnerId)));
          if (dates.length === 0 || partnerIds.length === 0) return [];
          const placeholders_d = dates.map(() => "?").join(",");
          const placeholders_p = partnerIds.map(() => "?").join(",");
          const [rows] = await conn.execute<any[]>(
            `SELECT transaction_date, partner_id, item_name, quantity, total_amount
             FROM accounting_purchases
             WHERE tenant_id = ?
               AND transaction_date IN (${placeholders_d})
               AND partner_id IN (${placeholders_p})
               AND status != 'cancelled'`,
            [ctx.tenantId, ...dates, ...partnerIds],
          );
          const existingKeys = new Map<string, { quantity: number; amount: number }>();
          for (const r of rows as any[]) {
            const key = `${r.transaction_date}|${r.partner_id}|${r.item_name}`;
            existingKeys.set(key, { quantity: Number(r.quantity), amount: Number(r.total_amount) });
          }
          return input.candidates.map((c) => {
            const key = `${c.transactionDate}|${c.partnerId}|${c.itemName}`;
            const match = existingKeys.get(key);
            return {
              transactionDate: c.transactionDate,
              partnerId: c.partnerId,
              itemName: c.itemName,
              isDuplicate: !!match,
              existing: match ?? null,
            };
          });
        } catch (err: any) {
          console.warn("[checkPurchaseDuplicates]", err.message?.substring(0, 100));
          return input.candidates.map((c) => ({ ...c, isDuplicate: false, existing: null }));
        }
      }),

    // 매출 엑셀 업로드 중복 사전 검사 (Phase 8+)
    //   동일 거래처+날짜+품목명 조합이 이미 존재하는지 반환
    checkSalesDuplicates: adminProcedure
      .input(z.object({
        candidates: z.array(z.object({
          transactionDate: z.string(),
          partnerId: z.number(),
          itemName: z.string(),
        })).max(2000),
      }))
      .query(async ({ input, ctx }) => {
        if (input.candidates.length === 0) return [];
        const { getRawConnection } = await import("../../db");
        const conn = await getRawConnection();
        try {
          // 전체 거래처+날짜+품목 조합 union
          const dates = Array.from(new Set(input.candidates.map(c => c.transactionDate)));
          const partnerIds = Array.from(new Set(input.candidates.map(c => c.partnerId)));
          if (dates.length === 0 || partnerIds.length === 0) return [];
          // 해당 범위 내 기존 매출 조회 (한 번의 쿼리로)
          const placeholders_d = dates.map(() => "?").join(",");
          const placeholders_p = partnerIds.map(() => "?").join(",");
          const [rows] = await conn.execute<any[]>(
            `SELECT transaction_date, partner_id, item_name, quantity, total_amount
             FROM accounting_sales
             WHERE tenant_id = ?
               AND transaction_date IN (${placeholders_d})
               AND partner_id IN (${placeholders_p})
               AND status != 'cancelled'`,
            [ctx.tenantId, ...dates, ...partnerIds],
          );
          const existingKeys = new Map<string, { quantity: number; amount: number }>();
          for (const r of rows as any[]) {
            const key = `${r.transaction_date}|${r.partner_id}|${r.item_name}`;
            existingKeys.set(key, { quantity: Number(r.quantity), amount: Number(r.total_amount) });
          }
          return input.candidates.map((c) => {
            const key = `${c.transactionDate}|${c.partnerId}|${c.itemName}`;
            const match = existingKeys.get(key);
            return {
              transactionDate: c.transactionDate,
              partnerId: c.partnerId,
              itemName: c.itemName,
              isDuplicate: !!match,
              existing: match ?? null,
            };
          });
        } catch (err: any) {
          console.warn("[checkSalesDuplicates]", err.message?.substring(0, 100));
          return input.candidates.map((c) => ({ ...c, isDuplicate: false, existing: null }));
        }
      }),

    // 매출 일괄 등록
    bulkCreateSales: adminProcedure
      .input(z.object({
        items: z.array(z.object({
          transactionDate: z.string(),
          partnerId: z.number(),
          itemName: z.string(),
          productId: z.number().optional(),   // 완제품 FK (매칭 엔진 결과)
          materialId: z.number().optional(),  // 원재료/부자재/외부제품 FK (매칭 엔진 결과)
          quantity: z.number(),
          unitPrice: z.number(),
          amount: z.number(),
          taxAmount: z.number(),
          unit: z.string().optional(),
          memo: z.string().optional(),
        }))
      }))
      .mutation(async ({ input, ctx }) => {
        const { createSale } = await import("../../db/haccp/haccpIntegration");
        let successCount = 0;
        let failCount = 0;
        const errors: { index: number; message: string }[] = [];

        for (let i = 0; i < input.items.length; i++) {
          try {
            await createSale({
              ...input.items[i],
              createdBy: ctx.user.id,
            }, ctx.tenantId);
            successCount++;
          } catch (e: any) {
            failCount++;
            errors.push({ index: i, message: e.message || "Unknown error" });
          }
        }

        return { successCount, failCount, errors, total: input.items.length };
      }),
});

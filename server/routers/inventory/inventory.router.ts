// inventory 라우터 - routers.ts에서 분리됨
import { adminProcedure, tenantRequiredProcedure, router, workerProcedure } from "../../_core/trpc";
import { z } from "zod";
import { eq, lt, or, and, inArray } from "drizzle-orm";
import { hInventoryLots, hInventoryTransactions } from "../../../drizzle/schema";
import { getDb } from "../../db";

export const inventoryRouter = router({
    // LOT 목록 조회 (소비기한/생산일자 포함)
    listLots: tenantRequiredProcedure
      .query(async ({ ctx }) => {
        const { getAllInventoryLotsWithDetails } = await import("../../db");
        return await getAllInventoryLotsWithDetails(ctx.tenantId);
      }),
    
    // 모든 재고 LOT 조회
    list: tenantRequiredProcedure
      .input(
        z.object({
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          materialId: z.number().optional(),
          supplierId: z.number().optional(),
          search: z.string().optional()
        }).optional()
      )
      .query(async ({ input, ctx }) => {
        const { getAllInventoryLots } = await import("../../db");
        return await getAllInventoryLots({ ...(input || {}), tenantId: ctx.tenantId });
      }),
    
    // 재고 입고 (LOT 생성)
    createLot: workerProcedure
      .input(
        z.object({
          materialId: z.number(),
          lotNumber: z.string(),
          quantity: z.string(),
          unit: z.string(),
          expiryDate: z.string().optional(),
          supplierId: z.number().optional(),
          receiptDate: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { createInventoryLot } = await import("../../db");
        return await createInventoryLot({
          materialId: input.materialId,
          lotNumber: input.lotNumber,
          quantity: input.quantity,
          unit: input.unit,
          expiryDate: input.expiryDate ? new Date(input.expiryDate) : undefined,
          supplierId: input.supplierId,
          receiptDate: input.receiptDate ? new Date(input.receiptDate) : undefined,
          userId: ctx.user?.id || 0,
          tenantId: ctx.tenantId
        });
      }),
    
    // 원재료 입고 (LOT 생성 + 재고 업데이트 + 거래 기록)
    receiveMaterial: workerProcedure
      .input(
        z.object({
          materialId: z.number(),
          quantity: z.number(),
          unit: z.string(),
          receiptDate: z.string(),
          expiryDate: z.string().optional(),
          lotNumber: z.string().optional(),
          location: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { receiveMaterial } = await import("../../db");
        return await receiveMaterial({
          materialId: input.materialId,
          quantity: input.quantity,
          unit: input.unit,
          receiptDate: input.receiptDate,
          expiryDate: input.expiryDate,
          lotNumber: input.lotNumber,
          location: input.location,
          tenantId: ctx.tenantId
        });
      }),
    
    // FEFO 순서로 원재료별 LOT 조회
    getLotsByMaterialFefo: tenantRequiredProcedure
      .input(z.object({ materialId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getLotsByMaterialFefo } = await import("../../db");
        return await getLotsByMaterialFefo({ materialId: input.materialId, tenantId: ctx.tenantId });
      }),
    
    // 재고 거래 내역 조회
    getInventoryTransactions: tenantRequiredProcedure
      .input(
        z.object({
          materialId: z.number().optional(),
          startDate: z.string().optional(),
          endDate: z.string().optional()
        })
      )
      .query(async ({ input, ctx }) => {
        const { getInventoryTransactions } = await import("../../db");
        return await getInventoryTransactions({
          materialId: input.materialId,
          startDate: input.startDate,
          endDate: input.endDate,
          tenantId: ctx.tenantId
        });
      }),
    
    // 원재료별 재고 LOT 조회 (FEFO 순서)
    getLotsByMaterialId: tenantRequiredProcedure
      .input(z.object({ materialId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getInventoryLotsByMaterialId } = await import("../../db");
        return await getInventoryLotsByMaterialId(input.materialId);
      }),
    
    // 원재료 투입
    addMaterialInput: workerProcedure
      .input(
        z.object({
          batchId: z.number(),
          materialId: z.number(),
          lotId: z.number(),
          quantity: z.string(),
          unit: z.string()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { addMaterialInputToBatch, notifyLowStock } = await import("../../db");
        await addMaterialInputToBatch({
          batchId: input.batchId,
          materialId: input.materialId,
          lotId: input.lotId,
          quantity: input.quantity,
          unit: input.unit,
          userId: ctx.user?.id || 0
        });
        
        // 재고 부족 감지 및 알림
        await notifyLowStock(input.materialId);
        
        return { success: true, message: "원재료가 투입되었습니다" };
      }),
    
    // 배치별 원재료 투입 내역 조회
    getBatchInputs: tenantRequiredProcedure
      .input(z.object({ batchId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getBatchMaterialInputs } = await import("../../db");
        return await getBatchMaterialInputs(input.batchId);
      }),
    
    // 원재료 투입 수정
    updateMaterialInput: workerProcedure
      .input(
        z.object({
          inputId: z.number(),
          quantity: z.string().optional(),
          lotId: z.number().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { updateMaterialInput, createAuditLog } = await import("../../db");
        await updateMaterialInput(input.inputId, {
          quantity: input.quantity,
          lotId: input.lotId
        });
        
        // 감사 로그 기록
        await createAuditLog({
          action: "material_input.update",
          entityType: "material_input",
          entityId: input.inputId,
          userId: ctx.user.id,
          userEmail: ctx.user.email,
          userRole: ctx.user.role,
          description: `원재료 투입 수정: ${input.inputId}`,
          changes: { updated: input }
        });
        
        return { success: true, message: "원재료 투입이 수정되었습니다" };
      }),
    
    // 원재료 투입 삭제
    deleteMaterialInput: workerProcedure
      .input(z.object({ inputId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { deleteMaterialInput, createAuditLog } = await import("../../db");
        await deleteMaterialInput(input.inputId);
        
        // 감사 로그 기록
        await createAuditLog({
          action: "material_input.delete",
          entityType: "material_input",
          entityId: input.inputId,
          userId: ctx.user.id,
          userEmail: ctx.user.email,
          userRole: ctx.user.role,
          description: `원재료 투입 삭제: ${input.inputId}`,
          changes: { deleted: true }
        });
        
        return { success: true, message: "원재료 투입이 삭제되었습니다" };
      }),
    
    // 재고 부족 원재료 조회
    getLowStock: tenantRequiredProcedure
      .query(async ({ ctx }) => {
        const { getLowStockMaterials } = await import("../../db");
        return await getLowStockMaterials(ctx.tenantId);
      }),
    
    // 원재료별 입출고 이력 조회
    getTransactionHistory: tenantRequiredProcedure
      .input(
        z.object({
          materialId: z.number(),
          startDate: z.date().optional(),
          endDate: z.date().optional()
        })
      )
      .query(async ({ input, ctx }) => {
        const { getMaterialTransactionHistory } = await import("../../db");
        return await getMaterialTransactionHistory(input.materialId, {
          startDate: input.startDate,
          endDate: input.endDate,
          tenantId: ctx.tenantId
        });
      }),
    
    // 재고 회전율 계산
    getTurnoverRate: tenantRequiredProcedure
      .input(
        z.object({
          startDate: z.date().optional(),
          endDate: z.date().optional()
        })
      )
      .query(async ({ input, ctx }) => {
        const { getInventoryTurnoverRate } = await import("../../db");
        return await getInventoryTurnoverRate({
          startDate: input.startDate,
          endDate: input.endDate,
          tenantId: ctx.tenantId
        });
      }),
    
    // 장기 재고 항목 식별
    getSlowMovingItems: tenantRequiredProcedure
      .input(
        z.object({
          thresholdDays: z.number().optional()
        })
      )
      .query(async ({ input, ctx }) => {
        const { getSlowMovingItems } = await import("../../db");
        return await getSlowMovingItems(input.thresholdDays);
      }),
    
    // 재고 회전율 알림 생성
    createTurnoverAlert: adminProcedure
      .input(
        z.object({
          materialId: z.number(),
          turnoverRate: z.number(),
          thresholdRate: z.number()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { createInventoryTurnoverAlert } = await import("../../db.js") as any;
        return await createInventoryTurnoverAlert(
          input.materialId,
          input.turnoverRate,
          input.thresholdRate
        );
      }),
    
    // 재고 회전율 임계값 설정
    setTurnoverThreshold: adminProcedure
      .input(
        z.object({
          materialId: z.number(),
          thresholdRate: z.number(),
          alertEnabled: z.boolean().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { setInventoryTurnoverThreshold } = await import("../../db.js");
        return await setInventoryTurnoverThreshold(
          input.materialId,
          input.thresholdRate,
          input.alertEnabled ?? true
        );
      }),
    
    // 재고 회전율 임계값 조회
    getTurnoverSettings: tenantRequiredProcedure.query(async ({ ctx }) => {
      const { getInventoryTurnoverSettings } = await import("../../db.js");
      return await getInventoryTurnoverSettings();
    }),
    
    // 재고 회전율 임계값 기반 자동 알림 생성
    checkAndCreateTurnoverAlerts: tenantRequiredProcedure.mutation(async ({ ctx }) => {
      const { checkAndCreateTurnoverAlerts } = await import("../../db.js");
      return await checkAndCreateTurnoverAlerts();
    }),
    
    // 재고 LOT 삭제
    deleteLot: adminProcedure
      .input(z.object({ lotId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { deleteInventoryLot, createAuditLog } = await import("../../db");
        await deleteInventoryLot(input.lotId);
        
        // 감사 로그 기록
        await createAuditLog({
          action: "inventory_lot.delete",
          entityType: "inventory_lot",
          entityId: input.lotId,
          userId: ctx.user.id,
          userEmail: ctx.user.email,
          userRole: ctx.user.role,
          description: `재고 LOT 삭제: ${input.lotId}`,
          changes: { deleted: true }
        });
        
        return { success: true, message: "재고 LOT가 삭제되었습니다" };
      }),
    
    // 재고 현황 대시보드
    getDashboard: tenantRequiredProcedure.query(async ({ ctx }) => {
      const { getInventoryDashboard } = await import("../../db");
      return await getInventoryDashboard(ctx.tenantId);
    }),
    
    // 재고 이동 추이 (일별)
    getTrend: tenantRequiredProcedure
      .input(
        z.object({
          startDate: z.string(),
          endDate: z.string(),
          materialId: z.number().optional()
        })
      )
      .query(async ({ input, ctx }) => {
        const { getInventoryTrend } = await import("../../db");
        return await getInventoryTrend({ ...input, tenantId: ctx.tenantId });
      }),
    
    // 원재료별 재고 회전율 분석
    getTurnoverAnalysis: tenantRequiredProcedure
      .input(
        z.object({
          startDate: z.string(),
          endDate: z.string()
        })
      )
      .query(async ({ input, ctx }) => {
        const { calculateInventoryTurnover } = await import("../../db/inventory/inventoryAnalytics");
        const startDate = new Date(input.startDate);
        const endDate = new Date(input.endDate);
        return await calculateInventoryTurnover(undefined, startDate, endDate, ctx.tenantId);
      }),
    
    // 재고 효율성 지표
    getEfficiencyMetrics: tenantRequiredProcedure
      .input(
        z.object({
          startDate: z.string().optional(),
          endDate: z.string().optional()
        })
      )
      .query(async ({ input, ctx }) => {
        const { calculateEfficiencyMetrics } = await import("../../db/inventory/inventoryAnalytics");
        const startDate = input.startDate ? new Date(input.startDate) : undefined;
        const endDate = input.endDate ? new Date(input.endDate) : undefined;
        return await calculateEfficiencyMetrics(startDate, endDate, ctx.tenantId);
      }),
    
    // 재고 부족 예측 분석 (단일 원재료)
    predictShortage: tenantRequiredProcedure
      .input(
        z.object({
          materialId: z.number(),
          days: z.number(), // 예측 기간 (일)
        })
      )
      .query(async ({ input, ctx }) => {
        const { predictInventoryShortage } = await import("../../db");
        return await predictInventoryShortage({ ...input, tenantId: ctx.tenantId });
      }),
    
    // 재고 부족 예측 분석 (모든 원재료)
    predictAllShortage: tenantRequiredProcedure
      .input(
        z.object({
          days: z.number(), // 예측 기간 (일)
        })
      )
      .query(async ({ input, ctx }) => {
        const { predictAllMaterialsShortage } = await import("../../db");
        return await predictAllMaterialsShortage({ ...input, tenantId: ctx.tenantId });
      }),
    
    // 자동 발주 제안 생성
    getPurchaseOrderSuggestions: tenantRequiredProcedure
      .input(
        z.object({
          days: z.number(), // 예측 기간 (일)
        })
      )
      .query(async ({ input, ctx }) => {
        const { generatePurchaseOrderSuggestions } = await import("../../db");
        return await generatePurchaseOrderSuggestions({ ...input, tenantId: ctx.tenantId });
      }),
    
    // 발주 제안 승인
    approvePurchaseOrder: tenantRequiredProcedure
      .input(
        z.object({
          materialId: z.number(),
          quantity: z.number()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { approvePurchaseOrderSuggestion } = await import("../../db");
        return await approvePurchaseOrderSuggestion({
          ...input,
          approvedBy: ctx.user.id
        });
      }),
    
    // 발주 제안 거부
    rejectPurchaseOrder: tenantRequiredProcedure
      .input(
        z.object({
          materialId: z.number(),
          reason: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { rejectPurchaseOrderSuggestion } = await import("../../db");
        return await rejectPurchaseOrderSuggestion({
          materialId: input.materialId,
          rejectedBy: ctx.user.id,
          reason: input.reason
        });
      }),
    
    // 유통기한 임박 현황 (7일 이내)
    getExpiringStock: tenantRequiredProcedure.query(async ({ ctx }) => {
      const { getExpiringMaterials } = await import("../../db");
      return await getExpiringMaterials(ctx.tenantId);
    }),
    
    // 발주 제안 이력 조회
    getPurchaseProposalHistory: tenantRequiredProcedure
      .input(
        z.object({
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          status: z.enum(["draft", "submitted", "approved", "received", "cancelled"]).optional(),
          materialId: z.number().optional()
        })
      )
      .query(async ({ input, ctx }) => {
        const { getPurchaseProposalHistory } = await import("../../db");
        return await getPurchaseProposalHistory({ ...input, tenantId: ctx.tenantId });
      }),
    
    // 재고 출고 (LOT 수량 차감)
    releaseStock: workerProcedure
      .input(
        z.object({
          lotId: z.number(),
          quantity: z.number(),
          releaseDate: z.string(),
          reason: z.string().optional(),
          destination: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        
        // LOT 조회 (테넌트 격리 적용)
        const [lot] = await db.select().from(hInventoryLots).where(
          and(
            eq(hInventoryLots.id, input.lotId),
            eq(hInventoryLots.tenantId, ctx.tenantId as any) 
          )
        );
        if (!lot) {
          throw new Error("LOT을 찾을 수 없습니다.");
        }
        
        const availableQty = parseFloat(lot.availableQuantity);
        
        // 재고 0개여도 출고 가능 (처음 프로그램 시작 시 재고 미입력 고려)
        // 마이너스 재고 방지: 재고가 있으면 차감, 없으면 0 유지
        const newAvailableQty = Math.max(0, availableQty - input.quantity);
        
        // 재고 차감
        await db.update(hInventoryLots)
          .set({ 
            availableQuantity: newAvailableQty.toString()
          })
          .where(and(
            eq(hInventoryLots.id, input.lotId),
            eq(hInventoryLots.tenantId, ctx.tenantId as any) 
          ));
        
        // 거래 내역 기록 (h_inventory_transactions)
        // PR-§5.2-2: material_id 직접 작성 (LOT material_id 승계)
        await db.insert(hInventoryTransactions).values({
          tenantId: ctx.tenantId,
          lotId: input.lotId,
          materialId: lot.materialId,
          transactionType: "usage",
          quantity: input.quantity.toString(),
          unit: lot.unit,
          notes: input.reason || null,
          createdBy: ctx.user.id,
          performedBy: ctx.user.id,
          transactionDate: input.releaseDate
        } as any);
        
        return { 
          success: true, 
          message: "출고가 완료되었습니다."
        };
      }),
    
    // 재고 조정 (재고 실사 등)
    adjustStock: workerProcedure
      .input(
        z.object({
          lotId: z.number(),
          newQuantity: z.number().optional(),
          quantityChange: z.number().optional(),
          reason: z.string()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        
        // LOT 조회 (테넌트 격리 적용)
        const [lot] = await db.select().from(hInventoryLots).where(
          and(
            eq(hInventoryLots.id, input.lotId),
            eq(hInventoryLots.tenantId, ctx.tenantId as any) 
          )
        );
        if (!lot) {
          throw new Error("LOT을 찾을 수 없습니다.");
        }
        
        const oldQty = parseFloat(lot.availableQuantity);
        // quantityChange(증감) 또는 newQuantity(절대값) 지원
        const finalQty = input.newQuantity !== undefined 
          ? input.newQuantity 
          : input.quantityChange !== undefined 
            ? Math.max(0, oldQty + input.quantityChange)
            : oldQty;
        const diff = finalQty - oldQty;
        if (finalQty === oldQty) throw new Error("조정할 수량 변동이 없습니다.");
        
        // 재고 조정
        await db.update(hInventoryLots)
          .set({ 
            availableQuantity: finalQty.toString()
          })
          .where(and(
            eq(hInventoryLots.id, input.lotId),
            eq(hInventoryLots.tenantId, ctx.tenantId as any) 
          ));
        
        // 재고 조정 거래 내역 기록
        // PR-§5.2-2: material_id 직접 작성 (LOT material_id 승계)
        await db.insert(hInventoryTransactions).values({
          tenantId: ctx.tenantId,
          lotId: input.lotId,
          materialId: lot.materialId,
          transactionType: "adjustment",
          quantity: diff.toString(),
          unit: lot.unit,
          notes: `[재고조정] ${input.reason} (${oldQty} → ${finalQty})`,
          createdBy: ctx.user.id,
          performedBy: ctx.user.id,
          transactionDate: new Date().toISOString().split("T")[0]
        } as any);
        
        return { success: true, message: `재고가 조정되었습니다. (${oldQty} → ${finalQty})` };
      }),

    /**
     * 제품 단위 재고 조정 (+/-) — LOT 자동 배분.
     *
     * 2026-04-22 추가: 기존 adjustStock 은 LOT 을 직접 선택해야 했으나,
     * 사용자가 특정 LOT 을 고르기보다는 "제품 단위로 +/- 수량 조정" 하고 싶어함.
     * B 방식 (생성 시간 순서 FEFO):
     *   - 증가(+): 최신 LOT 1개에 추가 (createdAt DESC first)
     *   - 감소(-): 가장 오래된 LOT 부터 cascade 차감 (createdAt ASC, FEFO)
     *
     * 활성 LOT 이 전혀 없으면 throw — 수동 입고 또는 생산 완료 경로 이용.
     */
    adjustStockByProduct: workerProcedure
      .input(
        z.object({
          productId: z.number().optional(),
          materialId: z.number().optional(),
          quantityChange: z.number(), // 양수=증가, 음수=감소
          reason: z.string().min(1),
        }).refine(
          (v) => (v.productId && !v.materialId) || (!v.productId && v.materialId),
          { message: "productId 또는 materialId 중 하나만 지정해야 합니다" },
        ),
      )
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        if (input.quantityChange === 0) throw new Error("조정 수량은 0 이 될 수 없습니다");

        const conditions = [
          eq(hInventoryLots.tenantId, ctx.tenantId as any),
          eq(hInventoryLots.status, "available"),
        ];
        if (input.productId) {
          // 제품: h_inventory_lots.product_id 는 항상 h_products_v2.id 기반 → 직접 매칭
          conditions.push(eq(hInventoryLots.productId, input.productId));
        }
        if (input.materialId) {
          // 원재료/부자재/외주제품: h_inventory_lots.material_id 는
          //   - 신규 데이터: item_master.id
          //   - 레거시 원재료: h_materials.id
          // UI 에서 MaterialCombobox 는 item_master.id 를 반환하므로,
          // 레거시 h_materials.id 도 함께 매칭하기 위해 legacyMaterialId 로 확장.
          const { itemMaster } = await import("../../../drizzle/schema/schema_dual_unit.js");
          const [imRow] = await db
            .select({ legacyMaterialId: itemMaster.legacyMaterialId })
            .from(itemMaster)
            .where(
              and(
                eq(itemMaster.id, input.materialId),
                eq(itemMaster.tenantId, ctx.tenantId as any),
              ),
            )
            .limit(1);

          const materialIds = [input.materialId];
          if (imRow?.legacyMaterialId) materialIds.push(imRow.legacyMaterialId);

          conditions.push(
            materialIds.length === 1
              ? eq(hInventoryLots.materialId, materialIds[0])
              : inArray(hInventoryLots.materialId, materialIds),
          );
        }

        const lots = await db.select().from(hInventoryLots).where(and(...conditions));

        if (lots.length === 0) {
          throw new Error(
            "활성 LOT 없음 — 재고 증가는 수동 입고/생산 완료로, 감소는 기존 LOT 고갈 상태에서 불가.",
          );
        }

        // 정렬: 증가 → 최신 먼저, 감소 → 오래된 먼저
        const sorted = [...lots].sort((a, b) => {
          const aT = new Date(a.createdAt).getTime();
          const bT = new Date(b.createdAt).getTime();
          return input.quantityChange > 0 ? bT - aT : aT - bT;
        });

        const affected: Array<{
          lotId: number;
          lotNumber: string;
          changeQty: number;
          newAvailable: number;
        }> = [];

        if (input.quantityChange > 0) {
          // 증가: 최신 LOT 에 전량 추가
          const target = sorted[0];
          const newAvail = parseFloat(target.availableQuantity) + input.quantityChange;
          const newTotal = parseFloat(target.quantity) + input.quantityChange;

          await db
            .update(hInventoryLots)
            .set({
              availableQuantity: newAvail.toFixed(3),
              quantity: newTotal.toFixed(3),
            })
            .where(
              and(
                eq(hInventoryLots.id, target.id),
                eq(hInventoryLots.tenantId, ctx.tenantId as any),
              ),
            );

          // PR-§5.2-2: material_id 직접 작성 (LOT material_id 승계)
          await db.insert(hInventoryTransactions).values({
            tenantId: ctx.tenantId,
            lotId: target.id,
            materialId: target.materialId,
            transactionType: "adjustment",
            quantity: input.quantityChange.toFixed(3),
            unit: target.unit,
            transactionDate: new Date() as any,
            notes: input.reason,
            createdBy: ctx.user.id,
          } as any);

          affected.push({
            lotId: target.id,
            lotNumber: target.lotNumber,
            changeQty: input.quantityChange,
            newAvailable: newAvail,
          });
        } else {
          // 감소: 오래된 LOT 부터 cascade
          let remaining = Math.abs(input.quantityChange);
          const totalAvail = sorted.reduce(
            (s, l) => s + parseFloat(l.availableQuantity),
            0,
          );
          if (totalAvail + 0.001 < remaining) {
            throw new Error(
              `재고 부족: 요청 ${remaining.toFixed(3)}, 가용 ${totalAvail.toFixed(3)}`,
            );
          }

          for (const lot of sorted) {
            if (remaining <= 0.001) break;
            const avail = parseFloat(lot.availableQuantity);
            const take = Math.min(remaining, avail);
            const newAvail = avail - take;
            const newTotal = parseFloat(lot.quantity) - take;

            await db
              .update(hInventoryLots)
              .set({
                availableQuantity: newAvail.toFixed(3),
                quantity: newTotal.toFixed(3),
                ...(newAvail <= 0.001 ? { status: "used" as const } : {}),
              })
              .where(
                and(
                  eq(hInventoryLots.id, lot.id),
                  eq(hInventoryLots.tenantId, ctx.tenantId as any),
                ),
              );

            // PR-§5.2-2: material_id 직접 작성 (LOT material_id 승계)
            await db.insert(hInventoryTransactions).values({
              tenantId: ctx.tenantId,
              lotId: lot.id,
              materialId: lot.materialId,
              transactionType: "adjustment",
              quantity: (-take).toFixed(3),
              unit: lot.unit,
              transactionDate: new Date() as any,
              notes: input.reason,
              createdBy: ctx.user.id,
            } as any);

            affected.push({
              lotId: lot.id,
              lotNumber: lot.lotNumber,
              changeQty: -take,
              newAvailable: newAvail,
            });
            remaining -= take;
          }
        }

        return {
          success: true,
          affectedLots: affected,
          totalChange: input.quantityChange,
          message: `${affected.length}개 LOT 조정 완료 (${input.quantityChange > 0 ? "+" : ""}${input.quantityChange})`,
        };
      }),

    /**
     * 재고 실사 — 제품별 현재 가용 합계 + 활성 LOT 목록 조회.
     *
     * 2026-04-27 (PR #5): 실사 입력 그리드의 baseline.
     * 클라이언트는 이 결과를 그리드로 표시 후 사용자가 "실사 수량" 입력 →
     * 차이를 계산해서 bulkApplyInventoryCount 로 일괄 적용.
     */
    getProductInventorySnapshot: tenantRequiredProcedure
      .query(async ({ ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        // 활성 product LOT 만 집계 (제품 LOT 만 — material LOT 제외)
        const lots = await db
          .select()
          .from(hInventoryLots)
          .where(
            and(
              eq(hInventoryLots.tenantId, ctx.tenantId as any),
              eq(hInventoryLots.status, "available"),
            ),
          );

        // product_id 별 그룹
        const byProduct = new Map<number, {
          productId: number;
          totalAvailable: number;
          unit: string;
          lots: Array<{ id: number; lotNumber: string; available: number; unit: string; expiryDate: any; createdAt: any }>;
        }>();
        for (const l of lots as any[]) {
          if (!l.productId) continue; // 원재료 LOT 제외
          const pid = Number(l.productId);
          if (!byProduct.has(pid)) {
            byProduct.set(pid, {
              productId: pid,
              totalAvailable: 0,
              unit: l.unit || "kg",
              lots: [],
            });
          }
          const g = byProduct.get(pid)!;
          const avail = parseFloat(l.availableQuantity || "0");
          g.totalAvailable += avail;
          g.lots.push({
            id: Number(l.id),
            lotNumber: l.lotNumber,
            available: avail,
            unit: l.unit || g.unit,
            expiryDate: l.expiryDate,
            createdAt: l.createdAt,
          });
        }

        // 제품 정보 조인
        const { hProductsV2 } = await import("../../../drizzle/schema");
        const productIds = Array.from(byProduct.keys());
        const products =
          productIds.length > 0
            ? await db
                .select()
                .from(hProductsV2)
                .where(
                  and(
                    eq(hProductsV2.tenantId, ctx.tenantId as any),
                    eq(hProductsV2.isActive, 1),
                  ),
                )
            : [];
        const productMap = new Map<number, any>();
        for (const p of products as any[]) productMap.set(Number(p.id), p);

        // 활성 LOT 없는 제품도 포함 (실사 결과 0으로 입력 가능하도록)
        const allActiveProducts = await db
          .select()
          .from(hProductsV2)
          .where(
            and(
              eq(hProductsV2.tenantId, ctx.tenantId as any),
              eq(hProductsV2.isActive, 1),
            ),
          );

        const result = (allActiveProducts as any[]).map((p: any) => {
          const g = byProduct.get(Number(p.id));
          return {
            productId: Number(p.id),
            productCode: p.productCode,
            productName: p.productName,
            unit: g?.unit || p.unit || "kg",
            currentAvailable: g?.totalAvailable ?? 0,
            activeLots: g?.lots ?? [],
            lotCount: g?.lots.length ?? 0,
          };
        });

        // 가용 수량 많은 순으로 정렬 (실사 입력하기 편하게)
        result.sort((a, b) => (b.currentAvailable || 0) - (a.currentAvailable || 0));

        return result;
      }),

    /**
     * 재고 실사 일괄 적용 — 제품별 실사 수량을 받아 자동 차감/증가.
     *
     * 동작 (사용자 결정, 2026-04-27):
     *   - 입력: items: [{ productId, actualQty, reason? }]
     *   - 각 제품에 대해 (실사 - 현재) 만큼 adjustStockByProduct 호출
     *   - 감소(실사 < 현재): 가장 오래된 LOT 부터 cascade 차감 (선생산 자동 차감)
     *   - 증가(실사 > 현재): 최신 LOT 에 가산 (활성 LOT 없으면 skip + warning)
     *   - 동일(실사 == 현재): skip (no-op)
     *   - 활성 LOT 없는 제품에 +qty 시도 → skip + 결과 warning
     *
     * 트랜잭션:
     *   - 각 제품 단위로 adjustStockByProduct 의 Drizzle 트랜잭션 실행 (개별)
     *   - 어느 한 제품 실패해도 다른 제품은 계속 처리 (배치 작업 패턴)
     *   - 실패 케이스는 errors 배열에 누적
     */
    bulkApplyInventoryCount: workerProcedure
      .input(
        z.object({
          items: z.array(z.object({
            productId: z.number(),
            actualQty: z.number().min(0),
            reason: z.string().optional(),
          })).min(1),
          defaultReason: z.string().min(1).default("정기 재고 실사"),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        type ItemResult = {
          productId: number;
          productCode?: string;
          productName?: string;
          before: number;
          after: number;
          diff: number;
          status: "applied" | "skipped" | "failed";
          message?: string;
          affectedLots?: Array<{ lotNumber: string; changeQty: number; newAvailable: number }>;
        };
        const results: ItemResult[] = [];

        // 제품 마스터 조회 (이름 표시용)
        const { hProductsV2 } = await import("../../../drizzle/schema");
        const products = await db
          .select()
          .from(hProductsV2)
          .where(eq(hProductsV2.tenantId, ctx.tenantId as any));
        const productMap = new Map<number, any>();
        for (const p of products as any[]) productMap.set(Number(p.id), p);

        for (const item of input.items) {
          const product = productMap.get(item.productId);

          // 현재 가용 합계 계산
          const lots = await db
            .select()
            .from(hInventoryLots)
            .where(
              and(
                eq(hInventoryLots.tenantId, ctx.tenantId as any),
                eq(hInventoryLots.productId, item.productId),
                eq(hInventoryLots.status, "available"),
              ),
            );
          const before = (lots as any[]).reduce(
            (s, l) => s + parseFloat(l.availableQuantity || "0"),
            0,
          );

          const diff = item.actualQty - before;
          const baseInfo = {
            productId: item.productId,
            productCode: product?.productCode,
            productName: product?.productName,
            before,
            after: item.actualQty,
            diff,
          };

          // 동일 → skip
          if (Math.abs(diff) < 0.001) {
            results.push({
              ...baseInfo,
              status: "skipped",
              message: "차이 없음 — 적용 skip",
            });
            continue;
          }

          // 활성 LOT 없는데 +qty → skip
          if (lots.length === 0 && diff > 0) {
            results.push({
              ...baseInfo,
              status: "skipped",
              message: "활성 LOT 없음 — 생산 완료/수동 입고로 LOT 먼저 생성",
            });
            continue;
          }

          // 적용 — adjustStockByProduct 와 동일 로직 (B 방식 FEFO)
          //   증가: 최신 LOT 에 추가
          //   감소: 가장 오래된 LOT 부터 cascade
          try {
            const sorted = [...(lots as any[])].sort((a, b) => {
              const aT = new Date(a.createdAt).getTime();
              const bT = new Date(b.createdAt).getTime();
              return diff > 0 ? bT - aT : aT - bT;
            });

            const reason = item.reason || input.defaultReason;
            const affected: Array<{ lotNumber: string; changeQty: number; newAvailable: number }> = [];

            if (diff > 0) {
              // 증가 — 최신 LOT 에 전량 추가
              const target = sorted[0];
              const newAvail = parseFloat(target.availableQuantity) + diff;
              const newTotal = parseFloat(target.quantity) + diff;
              await db
                .update(hInventoryLots)
                .set({
                  availableQuantity: newAvail.toFixed(3),
                  quantity: newTotal.toFixed(3),
                })
                .where(
                  and(
                    eq(hInventoryLots.id, target.id),
                    eq(hInventoryLots.tenantId, ctx.tenantId as any),
                  ),
                );
              await db.insert(hInventoryTransactions).values({
                tenantId: ctx.tenantId,
                lotId: target.id,
                materialId: target.materialId,
                transactionType: "adjustment",
                quantity: diff.toFixed(3),
                unit: target.unit,
                transactionDate: new Date() as any,
                notes: `[실사] ${reason}`,
                createdBy: ctx.user.id,
              } as any);
              affected.push({
                lotNumber: target.lotNumber,
                changeQty: diff,
                newAvailable: newAvail,
              });
            } else {
              // 감소 — 가장 오래된 LOT 부터 cascade
              let remaining = Math.abs(diff);
              if (before + 0.001 < remaining) {
                results.push({
                  ...baseInfo,
                  status: "failed",
                  message: `재고 부족: 요청 ${remaining}, 가용 ${before.toFixed(3)}`,
                });
                continue;
              }
              for (const lot of sorted) {
                if (remaining <= 0.001) break;
                const avail = parseFloat(lot.availableQuantity);
                const take = Math.min(remaining, avail);
                const newAvail = avail - take;
                const newTotal = parseFloat(lot.quantity) - take;
                await db
                  .update(hInventoryLots)
                  .set({
                    availableQuantity: newAvail.toFixed(3),
                    quantity: newTotal.toFixed(3),
                    ...(newAvail <= 0.001 ? { status: "used" as const } : {}),
                  })
                  .where(
                    and(
                      eq(hInventoryLots.id, lot.id),
                      eq(hInventoryLots.tenantId, ctx.tenantId as any),
                    ),
                  );
                await db.insert(hInventoryTransactions).values({
                  tenantId: ctx.tenantId,
                  lotId: lot.id,
                  materialId: lot.materialId,
                  transactionType: "adjustment",
                  quantity: (-take).toFixed(3),
                  unit: lot.unit,
                  transactionDate: new Date() as any,
                  notes: `[실사] ${reason}`,
                  createdBy: ctx.user.id,
                } as any);
                affected.push({
                  lotNumber: lot.lotNumber,
                  changeQty: -take,
                  newAvailable: newAvail,
                });
                remaining -= take;
              }
            }

            results.push({
              ...baseInfo,
              status: "applied",
              message: `${affected.length}개 LOT 조정`,
              affectedLots: affected,
            });
          } catch (e: any) {
            results.push({
              ...baseInfo,
              status: "failed",
              message: e?.message ?? String(e),
            });
          }
        }

        const summary = {
          total: results.length,
          applied: results.filter((r) => r.status === "applied").length,
          skipped: results.filter((r) => r.status === "skipped").length,
          failed: results.filter((r) => r.status === "failed").length,
        };

        return { results, summary };
      }),

    // 재고 예측 (과거 사용 패턴 분석)
    getForecast: tenantRequiredProcedure
      .input(
        z.object({
          days: z.number().default(30), // 분석 기간 (일)
        })
      )
      .query(async ({ input, ctx }) => {
        const { getInventoryForecast } = await import("../../db/inventory/inventoryForecast");
        return await getInventoryForecast(input.days, ctx.tenantId);
      }),
    
    // 발주 제안 (재고 부족 예상 원재료)
    getPurchaseRecommendations: tenantRequiredProcedure.query(async ({ ctx }) => {
      const { getPurchaseRecommendations } = await import("../../db/inventory/inventoryForecast");
      return await getPurchaseRecommendations(ctx.tenantId);
    }),

    // 고도화된 재고 예측 (계절성, 요일별 패턴, 이벤트 고려)
    getAdvancedForecast: tenantRequiredProcedure
      .input(z.object({ days: z.number().optional().default(90) }))
      .query(async ({ input, ctx }) => {
        const { getAdvancedInventoryForecast } = await import("../../db/inventory/inventoryForecastAdvanced");
        return await getAdvancedInventoryForecast(input.days, ctx.tenantId);
      }),

    // 고도화된 발주 제안
    getAdvancedPurchaseRecommendations: tenantRequiredProcedure.query(async ({ ctx }) => {
      const { getAdvancedPurchaseRecommendations } = await import("../../db/inventory/inventoryForecastAdvanced");
      return await getAdvancedPurchaseRecommendations(ctx.tenantId);
    }),

    // 입고 등록 (LOT 자동 생성 + 재고 반영)
    createInboundReceipt: workerProcedure
      .input(
        z.object({
          materialId: z.number(),
          quantity: z.number(),
          unit: z.string(),
          unitPrice: z.number().optional(),
          supplierName: z.string().optional(),
          manufacturerName: z.string().optional(),
          expiryDate: z.string().optional(),
          receiptDate: z.string().optional(),
          location: z.string().optional(),
          notes: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { createInboundReceipt } = await import("../../db/production/inboundManagement");
        return await createInboundReceipt({
          materialId: input.materialId,
          quantity: input.quantity,
          unit: input.unit,
          unitPrice: input.unitPrice,
          supplierName: input.supplierName,
          manufacturerName: input.manufacturerName,
          expiryDate: input.expiryDate ? new Date(input.expiryDate) : undefined,
          receiptDate: input.receiptDate ? new Date(input.receiptDate) : undefined,
          location: input.location,
          notes: input.notes,
          createdBy: ctx.user?.id || 0
        }, ctx.tenantId);
      }),

    // 입고 이력 조회
    getInboundHistory: tenantRequiredProcedure
      .input(
        z.object({
          limit: z.number().optional(),
          materialId: z.number().optional(),
          supplierId: z.number().optional(),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          search: z.string().optional()
        })
      )
      .query(async ({ input, ctx }) => {
        const { getInboundHistory } = await import("../../db/production/inboundManagement");
        return await getInboundHistory({
          limit: input.limit,
          materialId: input.materialId,
          supplierId: input.supplierId,
          startDate: input.startDate ? new Date(input.startDate) : undefined,
          endDate: input.endDate ? new Date(input.endDate) : undefined,
          search: input.search
        }, ctx.tenantId);
      }),

    // 입고 이력 조회 (alias for getInboundHistory - 클라이언트 호환용)
    getReceiptHistory: tenantRequiredProcedure
      .query(async ({ ctx }) => {
        const { getInboundHistory } = await import("../../db/production/inboundManagement");
        return await getInboundHistory({ limit: 50 }, ctx.tenantId);
      }),

    // 출고 등록 (LOT 차감 + 재고 반영)
    createOutbound: workerProcedure
      .input(
        z.object({
          materialId: z.number(),
          lotId: z.number(),
          quantity: z.number(),
          unit: z.string(),
          batchId: z.number().optional(),
          notes: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { createOutboundRecord } = await import("../../db/production/outboundManagement");
        return await createOutboundRecord({
          materialId: input.materialId,
          lotId: input.lotId,
          quantity: input.quantity,
          unit: input.unit,
          batchId: input.batchId,
          notes: input.notes,
          createdBy: ctx.user?.id || 0
        }, ctx.tenantId);
      }),

    // 출고 이력 조회
    getOutboundHistory: tenantRequiredProcedure
      .input(
        z.object({
          limit: z.number().optional(),
          materialId: z.number().optional(),
          batchId: z.number().optional(),
          startDate: z.string().optional(),
          endDate: z.string().optional()
        })
      )
      .query(async ({ input, ctx }) => {
        const { getOutboundHistory } = await import("../../db/production/outboundManagement");
        return await getOutboundHistory({
          limit: input.limit,
          materialId: input.materialId,
          batchId: input.batchId,
          startDate: input.startDate ? new Date(input.startDate) : undefined,
          endDate: input.endDate ? new Date(input.endDate) : undefined
        }, ctx.tenantId);
      }),

    // 소모 현황 월별 요약 (일별 그룹 + 원재료별 소계 + 총합계)
    getConsumptionSummary: tenantRequiredProcedure
      .input(
        z.object({
          year: z.number(),
          month: z.number().min(1).max(12),
        })
      )
      .query(async ({ input, ctx }) => {
        const { getConsumptionSummary } = await import("../../db/production/outboundManagement");
        return await getConsumptionSummary({
          year: input.year,
          month: input.month,
        }, ctx.tenantId);
      }),

    // 소모 데이터 기반 재고 일괄 동기화 (현황 차감)
    syncStockFromConsumption: workerProcedure
      .input(
        z.object({
          dryRun: z.boolean().optional().default(false),
        }).optional()
      )
      .mutation(async ({ input, ctx }) => {
        const { syncStockFromConsumption } = await import("../../db/production/outboundManagement");
        return await syncStockFromConsumption(
          ctx.tenantId,
          ctx.user?.id || 1,
          input?.dryRun ?? false
        );
      }),

    // 재고 조정 (LOT 단위)
    adjustInventory: workerProcedure
      .input(
        z.object({
          materialId: z.number(),
          lotId: z.number(),
          quantityChange: z.number(),
          unit: z.string(),
          reason: z.string(),
          notes: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { adjustInventory } = await import("../../db/inventory/inventoryAdjustment");
        return await adjustInventory({
          materialId: input.materialId,
          lotId: input.lotId,
          quantityChange: input.quantityChange,
          unit: input.unit,
          reason: input.reason,
          notes: input.notes,
          createdBy: ctx.user?.id || 0
        }, ctx.tenantId);
      }),

    // 재고 조정 이력 조회
    getAdjustmentHistory: tenantRequiredProcedure
      .input(
        z.object({
          limit: z.number().optional(),
          materialId: z.number().optional(),
          startDate: z.string().optional(),
          endDate: z.string().optional()
        })
      )
      .query(async ({ input, ctx }) => {
        const { getAdjustmentHistory } = await import("../../db/inventory/inventoryAdjustment");
        return await getAdjustmentHistory({
          limit: input.limit,
          materialId: input.materialId,
          startDate: input.startDate ? new Date(input.startDate) : undefined,
          endDate: input.endDate ? new Date(input.endDate) : undefined
        }, ctx.tenantId);
      }),
    
    // 사용량 패턴 분석
    getUsagePattern: tenantRequiredProcedure
      .input(
        z.object({
          materialId: z.number(),
          days: z.number().optional().default(30)
        })
      )
      .query(async ({ input, ctx }) => {
        const { calculateUsagePattern } = await import("../../db/inventory/inventoryForecastAPI");
        return await calculateUsagePattern(input.materialId, ctx.tenantId, input.days);
      }),
    
    // 재고 소진 예상 일자
    predictStockout: tenantRequiredProcedure
      .input(
        z.object({
          materialId: z.number()
        })
      )
      .query(async ({ input, ctx }) => {
        const { predictStockout } = await import("../../db/inventory/inventoryForecastAPI");
        return await predictStockout(input.materialId, ctx.tenantId);
      }),
    
    // 구매 추천
    recommendPurchase: tenantRequiredProcedure
      .input(
        z.object({
          materialId: z.number()
        })
      )
      .query(async ({ input, ctx }) => {
        const { recommendPurchase } = await import("../../db/inventory/inventoryForecastAPI");
        return await recommendPurchase(input.materialId, ctx.tenantId);
      }),
    
    // 모든 원재료 구매 추천
    getAllPurchaseRecommendations: tenantRequiredProcedure.query(async ({ ctx }) => {
      const { getAllPurchaseRecommendations } = await import("../../db/inventory/inventoryForecastAPI");
      return await getAllPurchaseRecommendations(ctx.tenantId);
    }),

    // 재고 부족 예상 감지
    checkLowStockPrediction: tenantRequiredProcedure.query(async ({ ctx }) => {
      const { checkLowStockPrediction } = await import("../../db/inventory/inventoryForecastAPI");
      return await checkLowStockPrediction(ctx.tenantId);
    }),

    // 재고 부족 알림 생성
    createLowStockNotifications: tenantRequiredProcedure.mutation(async ({ ctx }) => {
      const { createLowStockNotifications } = await import("../../db/inventory/inventoryForecastAPI");
      return await createLowStockNotifications(ctx.tenantId);
    }),
    
    // 원재료 ID로 조회
    getById: tenantRequiredProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getMaterialById } = await import("../../db.js");
        return await getMaterialById(input.id);
      }),
    create: adminProcedure
      .input(
        z.object({
          materialName: z.string().min(1),
          materialCode: z.string().min(1),
          category: z.string().optional(),
          categoryId: z.number().optional(), // 카테고리 ID
          unit: z.string().optional(),
          safetyStock: z.number().optional(),
          expiryWarningDays: z.number().optional(),
          isActive: z.number().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { createMaterial } = await import("../../db.js");
        return await createMaterial({ ...input, tenantId: ctx.tenantId });
      }),
    update: adminProcedure
      .input(
        z.object({
          id: z.number(),
          materialName: z.string().optional(),
          materialCode: z.string().optional(),
          category: z.string().optional(),
          categoryId: z.number().optional(), // 카테곣리 ID
          unit: z.string().optional(),
          safetyStock: z.number().optional(),
          expiryWarningDays: z.number().optional(),
          isActive: z.number().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { updateMaterial } = await import("../../db.js");
        const { id, ...data } = input;
        return await updateMaterial(id, { ...data, tenantId: ctx.tenantId });
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { deleteMaterial } = await import("../../db.js");
        return await deleteMaterial(input.id, ctx.tenantId);
      }),
    updatePrice: adminProcedure
      .input(
        z.object({
          id: z.number(),
          unitPrice: z.number(),
          reason: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { updateMaterialPrice } = await import("../../db.js");
        return await updateMaterialPrice(input.id, input.unitPrice, undefined, input.reason);
      }),
    
    // 원재료 단가 이력 조회
    getPriceHistory: tenantRequiredProcedure
      .input(z.object({ materialId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getMaterialPriceHistory } = await import("../../db/accounting/priceHistory.js");
        return await getMaterialPriceHistory(input.materialId, ctx.tenantId);
      }),

    // 자동 코드 생성
    generateCode: tenantRequiredProcedure
      .query(async ({ ctx }) => {
        const { generateMaterialCode } = await import("../../db/system/codeGenerator.js");
        return await generateMaterialCode(ctx.tenantId);
      }),
    
    // 원재료 일괄 등록
    bulkCreate: adminProcedure
      .input(
        z.object({
          materials: z.array(
            z.object({
              materialName: z.string().min(1),
              unit: z.string().min(1),
              safetyStock: z.number().min(0),
              category: z.string().optional(),
              expiryWarningDays: z.number().optional(),
              storageMethod: z.string().optional(),
              notes: z.string().optional()
            })
          )
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { createMaterial } = await import("../../db.js");
        const { generateMaterialCode } = await import("../../db/system/codeGenerator.js");
        const { createUploadHistory } = await import("../../db/system/uploadHistory.js");
        
        const results = {
          success: true,
          successCount: 0,
          failureCount: 0,
          errors: [] as Array<{ row: number; code?: string; message: string }>
        };
        
        for (let i = 0; i < input.materials.length; i++) {
          try {
            const material = input.materials[i];
            const materialCode = await generateMaterialCode(ctx.tenantId);
            
            await createMaterial({
              tenantId: ctx.tenantId,
              materialName: material.materialName,
              materialCode: materialCode,
              unit: material.unit,
              safetyStock: material.safetyStock,
              category: material.category,
              expiryWarningDays: material.expiryWarningDays,
              isActive: 1
            });
            
            results.successCount++;
          } catch (error: any) {
            results.failureCount++;
            results.errors.push({
              row: i + 1,
              message: error.message || "등록 실패"
            });
          }
        }
        
        results.success = results.failureCount === 0;
        
        // 업로드 이력 저장
        await createUploadHistory({
          uploadType: "material",
          userId: ctx.user.id,
          userName: ctx.user.name,
          fileName: "Excel Upload",
          totalCount: input.materials.length,
          successCount: results.successCount,
          errorCount: results.failureCount,
          errors: results.errors
        });
        
        return results;
      }),
    
    // 안전 재고 수준 업데이트
    updateSafetyStock: adminProcedure
      .input(
        z.object({
          materialId: z.number(),
          safetyStockLevel: z.number()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { updateMaterial } = await import("../../db.js");
        await updateMaterial(input.materialId, {
          safetyStock: input.safetyStockLevel
        });
        return { success: true };
      }),

    // 원재료별 유통기한 알림 기준일 일괄 업데이트
    batchUpdateExpiryWarningDays: tenantRequiredProcedure
      .input(
        z.object({
          expiryWarningDays: z.number().int().min(1).max(365)
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { batchUpdateExpiryWarningDays } = await import("../../db.js");
        const count = await batchUpdateExpiryWarningDays(input.expiryWarningDays);
        return { success: true, count };
      }),
    
    // 원재료 가격 변동 추이 조회
    getPriceTrend: tenantRequiredProcedure
      .input(z.object({ materialId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getMaterialPriceHistory } = await import("../../db/accounting/priceHistory");
        return await getMaterialPriceHistory(input.materialId, ctx.tenantId);
      }),

    // ═══ 제품 출고 (Product Outbound) ═══

    // 제품 출고 등록 (LOT 기반 재고 차감 + 매출전표 자동 생성)
    createProductOutbound: workerProcedure
      .input(
        z.object({
          lotId: z.number().optional(),
          batchId: z.number().optional(),
          productName: z.string(),
          quantity: z.number().positive(),
          unit: z.string(),
          unitPrice: z.number().min(0),
          partnerId: z.number().optional(),
          partnerName: z.string().optional(),
          releaseDate: z.string(),
          releaseType: z.enum(["sale", "delivery", "sample", "return", "other"]),
          lotNumber: z.string().optional(),
          notes: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { createProductOutbound } = await import("../../db/production/productOutboundManagement");
        return await createProductOutbound({
          ...input,
          createdBy: ctx.user.id
        }, ctx.tenantId);
      }),

    // 제품 출고 이력 조회
    getProductOutboundHistory: tenantRequiredProcedure
      .input(
        z.object({
          limit: z.number().optional(),
          batchId: z.number().optional(),
          partnerId: z.number().optional(),
          releaseType: z.string().optional(),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          search: z.string().optional()
        }).optional()
      )
      .query(async ({ input, ctx }) => {
        const { getProductOutboundHistory } = await import("../../db/production/productOutboundManagement");
        return await getProductOutboundHistory(input || {}, ctx.tenantId);
      }),

    // 배치별 출고 가능 목록 (FEFO 순서)
    getProductAvailableForRelease: tenantRequiredProcedure
      .query(async ({ ctx }) => {
        const { getProductAvailableForRelease } = await import("../../db/production/productOutboundManagement");
        return await getProductAvailableForRelease(ctx.tenantId);
      }),

    // 제품 출고 취소
    cancelProductOutbound: workerProcedure
      .input(z.object({ outboundId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { cancelProductOutbound } = await import("../../db/production/productOutboundManagement");
        return await cancelProductOutbound(input.outboundId, ctx.user.id, ctx.tenantId);
      }),

    // 제품 출고 추이 (일별)
    getProductOutboundTrend: tenantRequiredProcedure
      .input(
        z.object({
          startDate: z.string(),
          endDate: z.string()
        })
      )
      .query(async ({ input, ctx }) => {
        const { getProductOutboundTrend } = await import("../../db/production/productOutboundManagement");
        return await getProductOutboundTrend(input, ctx.tenantId);
      }),

    // 제품 재고 회전율 분석
    getProductTurnoverAnalysis: tenantRequiredProcedure
      .input(
        z.object({
          startDate: z.string(),
          endDate: z.string()
        })
      )
      .query(async ({ input, ctx }) => {
        const { getProductTurnoverAnalysis } = await import("../../db/production/productOutboundManagement");
        return await getProductTurnoverAnalysis(input, ctx.tenantId);
      }),

    // 제품 출고 대시보드 통계
    getProductOutboundStats: tenantRequiredProcedure
      .query(async ({ ctx }) => {
        const { getProductOutboundStats } = await import("../../db/production/productOutboundManagement");
        return await getProductOutboundStats(ctx.tenantId);
      }),

    /**
     * 소급 재고 차감 - 배치 생산에서 누락된 원재료 출고 일괄 처리
     * 백업 데이터 임포트 등으로 autoMaterialIssue가 실행되지 않은 배치들을 대상으로
     * inventory_deducted=0인 batch_inputs를 찾아 소급 차감 실행
     */
    retroactiveDeduction: adminProcedure
      .input(z.object({
        batchId: z.number().optional(),   // 특정 배치만 처리 (없으면 전체)
        dryRun: z.boolean().optional()    // true면 시뮬레이션만
      }).optional())
      .mutation(async ({ input, ctx }) => {
        const { retroactiveInventoryDeduction } = await import("../../db/production/retroactiveDeduction");
        return await retroactiveInventoryDeduction({
          tenantId: ctx.tenantId,
          userId: ctx.user?.id || 0,
          batchId: input?.batchId,
          dryRun: input?.dryRun || false
        });
      })
});

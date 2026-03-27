// inventory 라우터 - routers.ts에서 분리됨
import { adminProcedure, tenantRequiredProcedure, router, workerProcedure } from "../../_core/trpc";
import { z } from "zod";
import { eq, lt, or, and } from "drizzle-orm";
import { hInventoryLots, hInventoryTransactions } from "../../../drizzle/schema";
import { getDb } from "../../db";

export const inventoryRouter = router({
    // LOT 목록 조회 (소비기한/생산일자 포함)
    listLots: tenantRequiredProcedure
      .query(async ({ ctx }) => {
        const { getAllInventoryLotsWithDetails } = await import("../../db");
        return await getAllInventoryLotsWithDetails(ctx.tenantId!);
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
        return await getAllInventoryLots({ ...(input || {}), tenantId: ctx.tenantId! });
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
          tenantId: ctx.tenantId!
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
          tenantId: ctx.tenantId!
        });
      }),
    
    // FEFO 순서로 원재료별 LOT 조회
    getLotsByMaterialFefo: tenantRequiredProcedure
      .input(z.object({ materialId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getLotsByMaterialFefo } = await import("../../db");
        return await getLotsByMaterialFefo({ materialId: input.materialId, tenantId: ctx.tenantId! });
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
          tenantId: ctx.tenantId!
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
        return await getLowStockMaterials(ctx.tenantId!);
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
          tenantId: ctx.tenantId!
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
          tenantId: ctx.tenantId!
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
        const { createInventoryTurnoverAlert } = await import("../../db.js");
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
      return await getInventoryDashboard(ctx.tenantId!);
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
        return await getInventoryTrend({ ...input, tenantId: ctx.tenantId! });
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
        const { calculateInventoryTurnover } = await import("../../db/inventoryAnalytics");
        const startDate = new Date(input.startDate);
        const endDate = new Date(input.endDate);
        return await calculateInventoryTurnover(undefined, startDate, endDate, ctx.tenantId!);
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
        const { calculateEfficiencyMetrics } = await import("../../db/inventoryAnalytics");
        const startDate = input.startDate ? new Date(input.startDate) : undefined;
        const endDate = input.endDate ? new Date(input.endDate) : undefined;
        return await calculateEfficiencyMetrics(startDate, endDate, ctx.tenantId!);
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
        return await predictInventoryShortage({ ...input, tenantId: ctx.tenantId! });
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
        return await predictAllMaterialsShortage({ ...input, tenantId: ctx.tenantId! });
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
        return await generatePurchaseOrderSuggestions({ ...input, tenantId: ctx.tenantId! });
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
      return await getExpiringMaterials(ctx.tenantId!);
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
        return await getPurchaseProposalHistory({ ...input, tenantId: ctx.tenantId! });
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
            eq(hInventoryLots.tenantId, ctx.tenantId! as any) 
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
            eq(hInventoryLots.tenantId, ctx.tenantId! as any) 
          ));
        
        // 거래 내역 기록 (h_inventory_transactions)
        await db.insert(hInventoryTransactions).values({
          tenantId: ctx.tenantId!,
          lotId: input.lotId,
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
            eq(hInventoryLots.tenantId, ctx.tenantId! as any) 
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
            eq(hInventoryLots.tenantId, ctx.tenantId! as any) 
          ));
        
        // 재고 조정 거래 내역 기록
        await db.insert(hInventoryTransactions).values({
          tenantId: ctx.tenantId!,
          lotId: input.lotId,
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
    
    // 재고 예측 (과거 사용 패턴 분석)
    getForecast: tenantRequiredProcedure
      .input(
        z.object({
          days: z.number().default(30), // 분석 기간 (일)
        })
      )
      .query(async ({ input, ctx }) => {
        const { getInventoryForecast } = await import("../../db/inventoryForecast");
        return await getInventoryForecast(input.days, ctx.tenantId!);
      }),
    
    // 발주 제안 (재고 부족 예상 원재료)
    getPurchaseRecommendations: tenantRequiredProcedure.query(async ({ ctx }) => {
      const { getPurchaseRecommendations } = await import("../../db/inventoryForecast");
      return await getPurchaseRecommendations(ctx.tenantId!);
    }),

    // 고도화된 재고 예측 (계절성, 요일별 패턴, 이벤트 고려)
    getAdvancedForecast: tenantRequiredProcedure
      .input(z.object({ days: z.number().optional().default(90) }))
      .query(async ({ input, ctx }) => {
        const { getAdvancedInventoryForecast } = await import("../../db/inventoryForecastAdvanced");
        return await getAdvancedInventoryForecast(input.days, ctx.tenantId!);
      }),

    // 고도화된 발주 제안
    getAdvancedPurchaseRecommendations: tenantRequiredProcedure.query(async ({ ctx }) => {
      const { getAdvancedPurchaseRecommendations } = await import("../../db/inventoryForecastAdvanced");
      return await getAdvancedPurchaseRecommendations(ctx.tenantId!);
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
        const { createInboundReceipt } = await import("../../db/inboundManagement");
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
        }, ctx.tenantId!);
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
        const { getInboundHistory } = await import("../../db/inboundManagement");
        return await getInboundHistory({
          limit: input.limit,
          materialId: input.materialId,
          supplierId: input.supplierId,
          startDate: input.startDate ? new Date(input.startDate) : undefined,
          endDate: input.endDate ? new Date(input.endDate) : undefined,
          search: input.search
        }, ctx.tenantId!);
      }),

    // 입고 이력 조회 (alias for getInboundHistory - 클라이언트 호환용)
    getReceiptHistory: tenantRequiredProcedure
      .query(async ({ ctx }) => {
        const { getInboundHistory } = await import("../../db/inboundManagement");
        return await getInboundHistory({ limit: 50 }, ctx.tenantId!);
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
        const { createOutboundRecord } = await import("../../db/outboundManagement");
        return await createOutboundRecord({
          materialId: input.materialId,
          lotId: input.lotId,
          quantity: input.quantity,
          unit: input.unit,
          batchId: input.batchId,
          notes: input.notes,
          createdBy: ctx.user?.id || 0
        }, ctx.tenantId!);
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
        const { getOutboundHistory } = await import("../../db/outboundManagement");
        return await getOutboundHistory({
          limit: input.limit,
          materialId: input.materialId,
          batchId: input.batchId,
          startDate: input.startDate ? new Date(input.startDate) : undefined,
          endDate: input.endDate ? new Date(input.endDate) : undefined
        }, ctx.tenantId!);
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
        const { getConsumptionSummary } = await import("../../db/outboundManagement");
        return await getConsumptionSummary({
          year: input.year,
          month: input.month,
        }, ctx.tenantId!);
      }),

    // 소모 데이터 기반 재고 일괄 동기화 (현황 차감)
    syncStockFromConsumption: workerProcedure
      .input(
        z.object({
          dryRun: z.boolean().optional().default(false),
        }).optional()
      )
      .mutation(async ({ input, ctx }) => {
        const { syncStockFromConsumption } = await import("../../db/outboundManagement");
        return await syncStockFromConsumption(
          ctx.tenantId!,
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
        const { adjustInventory } = await import("../../db/inventoryAdjustment");
        return await adjustInventory({
          materialId: input.materialId,
          lotId: input.lotId,
          quantityChange: input.quantityChange,
          unit: input.unit,
          reason: input.reason,
          notes: input.notes,
          createdBy: ctx.user?.id || 0
        }, ctx.tenantId!);
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
        const { getAdjustmentHistory } = await import("../../db/inventoryAdjustment");
        return await getAdjustmentHistory({
          limit: input.limit,
          materialId: input.materialId,
          startDate: input.startDate ? new Date(input.startDate) : undefined,
          endDate: input.endDate ? new Date(input.endDate) : undefined
        }, ctx.tenantId!);
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
        const { calculateUsagePattern } = await import("../../api/inventoryForecast");
        return await calculateUsagePattern(input.materialId, ctx.tenantId!, input.days);
      }),
    
    // 재고 소진 예상 일자
    predictStockout: tenantRequiredProcedure
      .input(
        z.object({
          materialId: z.number()
        })
      )
      .query(async ({ input, ctx }) => {
        const { predictStockout } = await import("../../api/inventoryForecast");
        return await predictStockout(input.materialId, ctx.tenantId!);
      }),
    
    // 구매 추천
    recommendPurchase: tenantRequiredProcedure
      .input(
        z.object({
          materialId: z.number()
        })
      )
      .query(async ({ input, ctx }) => {
        const { recommendPurchase } = await import("../../api/inventoryForecast");
        return await recommendPurchase(input.materialId, ctx.tenantId!);
      }),
    
    // 모든 원재료 구매 추천
    getAllPurchaseRecommendations: tenantRequiredProcedure.query(async ({ ctx }) => {
      const { getAllPurchaseRecommendations } = await import("../../api/inventoryForecast");
      return await getAllPurchaseRecommendations(ctx.tenantId!);
    }),

    // 재고 부족 예상 감지
    checkLowStockPrediction: tenantRequiredProcedure.query(async ({ ctx }) => {
      const { checkLowStockPrediction } = await import("../../api/inventoryForecast");
      return await checkLowStockPrediction(ctx.tenantId!);
    }),

    // 재고 부족 알림 생성
    createLowStockNotifications: tenantRequiredProcedure.mutation(async ({ ctx }) => {
      const { createLowStockNotifications } = await import("../../api/inventoryForecast");
      return await createLowStockNotifications(ctx.tenantId!);
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
        return await createMaterial({ ...input, tenantId: ctx.tenantId! });
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
        return await updateMaterial(id, { ...data, tenantId: ctx.tenantId! });
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { deleteMaterial } = await import("../../db.js");
        return await deleteMaterial(input.id, ctx.tenantId!);
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
        const { getMaterialPriceHistory } = await import("../../db/priceHistory.js");
        return await getMaterialPriceHistory(input.materialId, ctx.tenantId!);
      }),

    // 자동 코드 생성
    generateCode: tenantRequiredProcedure
      .query(async ({ ctx }) => {
        const { generateMaterialCode } = await import("../../db/codeGenerator.js");
        return await generateMaterialCode(ctx.tenantId!);
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
        const { generateMaterialCode } = await import("../../db/codeGenerator.js");
        const { createUploadHistory } = await import("../../db/uploadHistory.js");
        
        const results = {
          success: true,
          successCount: 0,
          failureCount: 0,
          errors: [] as Array<{ row: number; code?: string; message: string }>
        };
        
        for (let i = 0; i < input.materials.length; i++) {
          try {
            const material = input.materials[i];
            const materialCode = await generateMaterialCode(ctx.tenantId!);
            
            await createMaterial({
              tenantId: ctx.tenantId!,
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
        const { getMaterialPriceHistory } = await import("../../db/priceHistory");
        return await getMaterialPriceHistory(input.materialId, ctx.tenantId!);
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
        const { createProductOutbound } = await import("../../db/productOutboundManagement");
        return await createProductOutbound({
          ...input,
          createdBy: ctx.user.id
        }, ctx.tenantId!);
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
        const { getProductOutboundHistory } = await import("../../db/productOutboundManagement");
        return await getProductOutboundHistory(input || {}, ctx.tenantId!);
      }),

    // 배치별 출고 가능 목록 (FEFO 순서)
    getProductAvailableForRelease: tenantRequiredProcedure
      .query(async ({ ctx }) => {
        const { getProductAvailableForRelease } = await import("../../db/productOutboundManagement");
        return await getProductAvailableForRelease(ctx.tenantId!);
      }),

    // 제품 출고 취소
    cancelProductOutbound: workerProcedure
      .input(z.object({ outboundId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { cancelProductOutbound } = await import("../../db/productOutboundManagement");
        return await cancelProductOutbound(input.outboundId, ctx.user.id, ctx.tenantId!);
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
        const { getProductOutboundTrend } = await import("../../db/productOutboundManagement");
        return await getProductOutboundTrend(input, ctx.tenantId!);
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
        const { getProductTurnoverAnalysis } = await import("../../db/productOutboundManagement");
        return await getProductTurnoverAnalysis(input, ctx.tenantId!);
      }),

    // 제품 출고 대시보드 통계
    getProductOutboundStats: tenantRequiredProcedure
      .query(async ({ ctx }) => {
        const { getProductOutboundStats } = await import("../../db/productOutboundManagement");
        return await getProductOutboundStats(ctx.tenantId!);
      }),

    // 제품 출고 + 매출 일괄 등록 (PDF/Excel 데이터 임포트용)
    // LOT/배치 연결 없이 출고/매출 기록만 생성 (과거 데이터 임포트)
    bulkCreateProductOutbound: adminProcedure
      .input(z.object({
        items: z.array(z.object({
          releaseDate: z.string(), // YYYY-MM-DD
          partnerName: z.string(), // 거래처명 (B2C면 "B2C(전자상거래)" 등)
          partnerId: z.number().optional().nullable(),
          deliveryType: z.string(), // B2B, B2C, 위탁
          productName: z.string(),
          quantity: z.number(),
          unitWeight: z.number().optional(), // 단위중량(g)
          unitPrice: z.number().optional(), // 단가
          unit: z.string().optional(), // EA, kg 등
          releaseType: z.string().optional(), // sale, delivery
          notes: z.string().optional(),
        }))
      }))
      .mutation(async ({ input, ctx }) => {
        const { ensureProductOutboundTable } = await import("../../db/productOutboundManagement");
        const { getRawConnection } = await import("../../db");
        await ensureProductOutboundTable();
        const conn = await getRawConnection();
        
        let successCount = 0;
        let failCount = 0;
        const errors: { index: number; message: string }[] = [];
        
        for (let i = 0; i < input.items.length; i++) {
          const item = input.items[i];
          try {
            const totalAmount = item.quantity * (item.unitPrice || 0);
            const releaseType = item.releaseType || (item.deliveryType === 'B2C' ? 'sale' : 'delivery');
            
            // h_product_outbound 레코드 생성 (LOT/배치 없이)
            const [insertResult] = await conn.execute(
              `INSERT INTO h_product_outbound (
                tenant_id, batch_id, lot_id, product_name, quantity, unit, unit_price, total_amount,
                partner_id, partner_name, release_date, release_type, lot_number, notes, status, created_by, created_at
              ) VALUES (?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 'confirmed', ?, NOW())`,
              [
                ctx.tenantId!, item.productName, item.quantity,
                item.unit || 'EA', item.unitPrice || 0, totalAmount,
                item.partnerId || null, item.partnerName,
                item.releaseDate, releaseType,
                item.notes || `${item.deliveryType} 납품${item.unitWeight ? ` (${item.unitWeight}g)` : ''}`,
                ctx.user.id
              ]
            );
            const outboundId = (insertResult as any).insertId;
            
            // 매출전표 자동 생성 (sale/delivery)
            if (releaseType === 'sale' || releaseType === 'delivery') {
              try {
                await conn.execute(
                  `INSERT INTO accounting_sales (
                    tenant_id, transaction_date, partner_id, item_name, quantity, unit, unit_price,
                    total_amount, status, notes, source_type, source_id, created_by, created_at
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, 'product_outbound', ?, ?, NOW())`,
                  [
                    ctx.tenantId!, item.releaseDate,
                    item.partnerId || null,
                    item.productName,
                    item.quantity, item.unit || 'EA', item.unitPrice || 0,
                    totalAmount,
                    `${item.deliveryType} 출고 일괄등록 (거래처: ${item.partnerName})`,
                    outboundId, ctx.user.id
                  ]
                );
              } catch (err) {
                console.error('[bulkCreateProductOutbound] 매출전표 생성 실패:', err);
              }
            }
            
            successCount++;
          } catch (e: any) {
            failCount++;
            errors.push({ index: i, message: e.message || "등록 실패" });
          }
        }
        
        return { successCount, failCount, errors, total: input.items.length };
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
        const { retroactiveInventoryDeduction } = await import("../../db/retroactiveDeduction");
        return await retroactiveInventoryDeduction({
          tenantId: ctx.tenantId!,
          userId: ctx.user?.id || 0,
          batchId: input?.batchId,
          dryRun: input?.dryRun || false
        });
      })
});

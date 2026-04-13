// excel 라우터 - routers.ts에서 분리됨
import { tenantRequiredProcedure, router } from "../../_core/trpc";
import { z } from "zod";

import { todayKST } from "../../utils/timezone";

export const excelRouter = router({
    // 배치 데이터 Excel 내보내기
    exportBatches: tenantRequiredProcedure
      .input(z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        status: z.string().optional()
      }))
      .mutation(async ({ input, ctx }) => {
        const { getAllBatches } = await import("../../db");
        const { exportBatchesToExcel } = await import("../../excel");
        
        // 배치 목록 조회
        const batchData = await getAllBatches({ tenantId: ctx.tenantId });
        const batches = batchData.items;
        
        // Excel 파일 생성
        const buffer = await exportBatchesToExcel(batches);
        
        // Base64 인코딩
        const base64 = buffer.toString("base64");
        
        return {
          data: base64,
          filename: `batches_${todayKST()}.xlsx`
        };
      }),
    
    // 재고 데이터 Excel 내보내기
    exportInventory: tenantRequiredProcedure
      .mutation(async ({ ctx }) => {
        const { getAllInventoryLots } = await import("../../db");
        const { exportInventoryToExcel } = await import("../../excel");
        
        // 재고 목록 조회
        const inventory = await getAllInventoryLots({ tenantId: ctx.tenantId } as any);
        
        // Excel 파일 생성
        const buffer = await exportInventoryToExcel(inventory);
        
        // Base64 인코딩
        const base64 = buffer.toString("base64");
        
        return {
          data: base64,
          filename: `inventory_${todayKST()}.xlsx`
        };
      }),
    
    // 배치 템플릿 다운로드
    downloadBatchTemplate: tenantRequiredProcedure
      .mutation(async ({ ctx }) => {
        const { generateBatchTemplate } = await import("../../excel");
        
        const buffer = await generateBatchTemplate();
        const base64 = buffer.toString("base64");
        
        return {
          data: base64,
          filename: "batch_template.xlsx"
        };
      }),
    
    // 재고 템플릿 다운로드
    downloadInventoryTemplate: tenantRequiredProcedure
      .mutation(async ({ ctx }) => {
        const { generateInventoryTemplate } = await import("../../excel");
        
        const buffer = await generateInventoryTemplate();
        const base64 = buffer.toString("base64");
        
        return {
          data: base64,
          filename: "inventory_template.xlsx"
        };
      })
});

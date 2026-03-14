import { router, tenantRequiredProcedure } from "../../_core/trpc";
import { z } from "zod";
import { getDb } from "../../db";
import { ccpMonitoringRecords } from "../../../drizzle/schema/ccpMonitoring";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { getEffectiveTenantId } from "./_helpers";

export const ccpRecordsRouter = router({
  // CCP 모니터링 기록 관리
  createCcpMonitoringRecord: tenantRequiredProcedure
    .input(z.object({
      recordDate: z.date(),
      ccpType: z.enum(['CCP-1B', 'CCP-2B', 'CCP-3B', 'CCP-4P']),
      batchId: z.string().optional(),
      productName: z.string(),
      measurementTime: z.string().optional(),

      // 가열 공정 관련
      heatingTimeMin: z.number().optional(),
      pressureMpa: z.string().optional(),
      temperatureC: z.string().optional(),
      inputAmountKg: z.string().optional(),
      tempEdgeC: z.string().optional(),
      tempCenterC: z.string().optional(),

      // 금속검출 공정 관련
      metalDetectorId: z.string().optional(),
      sensitivitySetting: z.number().optional(),
      feTestPiecePass: z.string().optional(),
      stsTestPiecePass: z.string().optional(),
      productOnlyPass: z.string().optional(),
      feProductPass: z.string().optional(),
      stsProductPass: z.string().optional(),
      passedQuantity: z.number().optional(),
      detectedQuantity: z.number().optional(),

      passFail: z.enum(['적합', '부적합']),
      deviationContent: z.string().optional(),
      correctiveAction: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);
      const [result] = await db.insert(ccpMonitoringRecords).values({
        ...input,
        tenantId,
        operatorId: ctx.user.id,
      });
      return { id: result.insertId };
    }),

  getCcpMonitoringRecords: tenantRequiredProcedure
    .input(z.object({
      ccpType: z.enum(['CCP-1B', 'CCP-2B', 'CCP-3B', 'CCP-4P']).optional(),
      startDate: z.date().optional(),
      endDate: z.date().optional(),
      productName: z.string().optional(),
      passFail: z.enum(['적합', '부적합']).optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      // P0 FIX: tenantId 강제 필터
      const tenantId = getEffectiveTenantId(ctx);
      let conditions = [eq(ccpMonitoringRecords.tenantId, tenantId)];

      if (input.ccpType) {
        conditions.push(eq(ccpMonitoringRecords.ccpType, input.ccpType));
      }
      if (input.startDate) {
        conditions.push(gte(ccpMonitoringRecords.recordDate, input.startDate));
      }
      if (input.endDate) {
        conditions.push(lte(ccpMonitoringRecords.recordDate, input.endDate));
      }
      if (input.productName) {
        conditions.push(eq(ccpMonitoringRecords.productName, input.productName));
      }
      if (input.passFail) {
        conditions.push(eq(ccpMonitoringRecords.passFail, input.passFail));
      }

      // P0 FIX v2: tenantId 조건은 항상 포함되므로 and() 사용 (sql`1=1` 제거)
      const records = await db
        .select()
        .from(ccpMonitoringRecords)
        .where(and(...conditions))
        .orderBy(desc(ccpMonitoringRecords.recordDate))
        .limit(input.limit)
        .offset(input.offset);

      return records;
    }),

  updateCcpMonitoringRecord: tenantRequiredProcedure
    .input(z.object({
      id: z.number(),
      reviewerId: z.number().optional(),
      deviationContent: z.string().optional(),
      correctiveAction: z.string().optional(),
      correctiveActionBy: z.number().optional(),
      confirmedBy: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);
      const { id, ...data } = input;
      await db.update(ccpMonitoringRecords).set(data).where(and(eq(ccpMonitoringRecords.id, id), eq(ccpMonitoringRecords.tenantId, tenantId)));
      return { success: true };
    }),

  deleteCcpMonitoringRecord: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);
      await db.delete(ccpMonitoringRecords).where(and(eq(ccpMonitoringRecords.id, input.id), eq(ccpMonitoringRecords.tenantId, tenantId)));
      return { success: true };
    }),
});

import { router, tenantRequiredProcedure } from "../../_core/trpc";
import { z } from "zod";
import { generateCcpMonitoringPdf } from "../../_core/pdfGenerator.js";
import { getDb } from "../../db";
import { ccpMonitoringRecords } from "../../../drizzle/schema/ccpMonitoring";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { getEffectiveTenantId } from "./_helpers";

export const ccpStatsRouter = router({
  // CCP 모니터링 PDF 생성
  generateCcpPdf: tenantRequiredProcedure
    .input(z.object({
      period: z.enum(['daily', 'weekly', 'monthly']),
      startDate: z.date(),
      endDate: z.date(),
      ccpType: z.enum(['CCP-1B', 'CCP-2B', 'CCP-3B', 'CCP-4P']).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);

      let conditions: any[] = [
        eq(ccpMonitoringRecords.tenantId, tenantId),
        gte(ccpMonitoringRecords.recordDate, input.startDate),
        lte(ccpMonitoringRecords.recordDate, input.endDate),
      ];

      if (input.ccpType) {
        conditions.push(eq(ccpMonitoringRecords.ccpType, input.ccpType));
      }

      const records = await db
        .select()
        .from(ccpMonitoringRecords)
        .where(and(...conditions))
        .orderBy(ccpMonitoringRecords.recordDate);

      const periodText = input.period === 'daily' ? '일일' : input.period === 'weekly' ? '주간' : '월간';
      const pdfData = {
        period: `${periodText} CCP 모니터링 보고서 (${input.startDate.toLocaleDateString('ko-KR')} ~ ${input.endDate.toLocaleDateString('ko-KR')})`,
        records: records.map((r: any) => ({
          date: r.recordDate.toLocaleDateString('ko-KR'),
          time: r.measurementTime || '-',
          ccpType: r.ccpType,
          temperature: r.temperatureC,
          pressure: r.pressureMpa,
          time_duration: r.heatingTimeMin,
          result: r.passFail,
          inspector: r.operatorId.toString(),
          notes: r.deviationContent || '',
        })),
      };

      const pdfBuffer = await generateCcpMonitoringPdf(pdfData);

      return {
        success: true,
        pdf: pdfBuffer.toString('base64'),
      };
    }),

  // CCP 모니터링 통계
  getCcpMonitoringStats: tenantRequiredProcedure
    .input(z.object({
      ccpType: z.enum(['CCP-1B', 'CCP-2B', 'CCP-3B', 'CCP-4P']).optional(),
      startDate: z.date(),
      endDate: z.date(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);
      let conditions: any[] = [
        eq(ccpMonitoringRecords.tenantId, tenantId),
        gte(ccpMonitoringRecords.recordDate, input.startDate),
        lte(ccpMonitoringRecords.recordDate, input.endDate),
      ];

      if (input.ccpType) {
        conditions.push(eq(ccpMonitoringRecords.ccpType, input.ccpType));
      }

      const stats = await db
        .select({
          ccpType: ccpMonitoringRecords.ccpType,
          totalRecords: sql<number>`COUNT(*)`,
          passedRecords: sql<number>`SUM(CASE WHEN ${ccpMonitoringRecords.passFail} = '적합' THEN 1 ELSE 0 END)`,
          failedRecords: sql<number>`SUM(CASE WHEN ${ccpMonitoringRecords.passFail} = '부적합' THEN 1 ELSE 0 END)`,
        })
        .from(ccpMonitoringRecords)
        .where(and(...conditions))
        .groupBy(ccpMonitoringRecords.ccpType);

      return stats;
    }),

  // 설비 기준 CCP 모니터링 기록 (설비별 조회)
  getCcpRecordsByEquipment: tenantRequiredProcedure
    .input(z.object({
      equipmentId: z.number().optional(),
      ccpType: z.enum(['CCP-1B', 'CCP-2B', 'CCP-3B', 'CCP-4P']).optional(),
      startDate: z.date().optional(),
      endDate: z.date().optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);

      let conditions: any[] = [eq(ccpMonitoringRecords.tenantId, tenantId)];
      if (input.equipmentId) {
        conditions.push(eq(ccpMonitoringRecords.equipmentId, input.equipmentId));
      }
      if (input.ccpType) {
        conditions.push(eq(ccpMonitoringRecords.ccpType, input.ccpType));
      }
      if (input.startDate) {
        conditions.push(gte(ccpMonitoringRecords.recordDate, input.startDate));
      }
      if (input.endDate) {
        conditions.push(lte(ccpMonitoringRecords.recordDate, input.endDate));
      }

      return await db
        .select()
        .from(ccpMonitoringRecords)
        .where(and(...conditions))
        .orderBy(desc(ccpMonitoringRecords.recordDate))
        .limit(input.limit)
        .offset(input.offset);
    }),

  // 설비 기준 CCP 기록 생성 (equipmentId 포함)
  createCcpRecordByEquipment: tenantRequiredProcedure
    .input(z.object({
      equipmentId: z.number(),
      recordDate: z.date(),
      ccpType: z.enum(['CCP-1B', 'CCP-2B', 'CCP-3B', 'CCP-4P']),
      batchId: z.string().optional(),
      productName: z.string(),
      measurementTime: z.string().optional(),
      heatingTimeMin: z.number().optional(),
      pressureMpa: z.string().optional(),
      temperatureC: z.string().optional(),
      inputAmountKg: z.string().optional(),
      tempEdgeC: z.string().optional(),
      tempCenterC: z.string().optional(),
      metalDetectorId: z.string().optional(),
      sensitivitySetting: z.number().optional(),
      feTestPiecePass: z.string().optional(),
      stsTestPiecePass: z.string().optional(),
      productOnlyPass: z.string().optional(),
      feProductPass: z.string().optional(),
      stsProductPass: z.string().optional(),
      passedQuantity: z.number().optional(),
      detectedQuantity: z.number().optional(),
      passFail: z.enum(['\uC801\uD569', '\uBD80\uC801\uD569']),
      deviationContent: z.string().optional(),
      correctiveAction: z.string().optional(),
      source: z.string().default('manual'),
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

  // CCP 설비 목록 (ccp_type 기반) - raw SQL로 equipment_master 조회
  getCcpEquipments: tenantRequiredProcedure
    .input(z.object({
      ccpType: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);

      if (input.ccpType) {
        const rows = await db.execute(
          sql`SELECT id, code, name as equipment_name, type as equipment_type, ccp_type, status, notes
              FROM equipments
              WHERE tenant_id = ${tenantId} AND status = "active" AND ccp_type = ${input.ccpType}
              ORDER BY id ASC`
        );
        return rows[0] || [];
      } else {
        const rows = await db.execute(
          sql`SELECT id, code, name as equipment_name, type as equipment_type, ccp_type, status, notes
              FROM equipments
              WHERE tenant_id = ${tenantId} AND status = "active" AND ccp_type IS NOT NULL
              ORDER BY id ASC`
        );
        return rows[0] || [];
      }
    }),

  // 강화된 통계 - 설비별/제품별/기간별 통계
  getCcpDetailedStats: tenantRequiredProcedure
    .input(z.object({
      startDate: z.date(),
      endDate: z.date(),
      ccpType: z.enum(['CCP-1B', 'CCP-2B', 'CCP-3B', 'CCP-4P']).optional(),
      groupBy: z.enum(['equipment', 'product', 'date', 'ccpType']).default('ccpType'),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);

      let conditions: any[] = [
        eq(ccpMonitoringRecords.tenantId, tenantId),
        gte(ccpMonitoringRecords.recordDate, input.startDate),
        lte(ccpMonitoringRecords.recordDate, input.endDate),
      ];
      if (input.ccpType) {
        conditions.push(eq(ccpMonitoringRecords.ccpType, input.ccpType));
      }

      if (input.groupBy === 'equipment') {
        return await db
          .select({
            equipmentId: ccpMonitoringRecords.equipmentId,
            ccpType: ccpMonitoringRecords.ccpType,
            totalRecords: sql<number>`COUNT(*)`,
            passedRecords: sql<number>`SUM(CASE WHEN ${ccpMonitoringRecords.passFail} = '\uC801\uD569' THEN 1 ELSE 0 END)`,
            failedRecords: sql<number>`SUM(CASE WHEN ${ccpMonitoringRecords.passFail} = '\uBD80\uC801\uD569' THEN 1 ELSE 0 END)`,
            avgTemp: sql<string>`AVG(CAST(${ccpMonitoringRecords.temperatureC} AS DECIMAL(5,2)))`,
            avgPressure: sql<string>`AVG(CAST(${ccpMonitoringRecords.pressureMpa} AS DECIMAL(5,2)))`,
          })
          .from(ccpMonitoringRecords)
          .where(and(...conditions))
          .groupBy(ccpMonitoringRecords.equipmentId, ccpMonitoringRecords.ccpType);
      } else if (input.groupBy === 'product') {
        return await db
          .select({
            productName: ccpMonitoringRecords.productName,
            ccpType: ccpMonitoringRecords.ccpType,
            totalRecords: sql<number>`COUNT(*)`,
            passedRecords: sql<number>`SUM(CASE WHEN ${ccpMonitoringRecords.passFail} = '\uC801\uD569' THEN 1 ELSE 0 END)`,
            failedRecords: sql<number>`SUM(CASE WHEN ${ccpMonitoringRecords.passFail} = '\uBD80\uC801\uD569' THEN 1 ELSE 0 END)`,
          })
          .from(ccpMonitoringRecords)
          .where(and(...conditions))
          .groupBy(ccpMonitoringRecords.productName, ccpMonitoringRecords.ccpType);
      } else if (input.groupBy === 'date') {
        return await db
          .select({
            recordDate: sql<string>`DATE(${ccpMonitoringRecords.recordDate})`,
            totalRecords: sql<number>`COUNT(*)`,
            passedRecords: sql<number>`SUM(CASE WHEN ${ccpMonitoringRecords.passFail} = '\uC801\uD569' THEN 1 ELSE 0 END)`,
            failedRecords: sql<number>`SUM(CASE WHEN ${ccpMonitoringRecords.passFail} = '\uBD80\uC801\uD569' THEN 1 ELSE 0 END)`,
          })
          .from(ccpMonitoringRecords)
          .where(and(...conditions))
          .groupBy(sql`DATE(${ccpMonitoringRecords.recordDate})`);
      } else {
        return await db
          .select({
            ccpType: ccpMonitoringRecords.ccpType,
            totalRecords: sql<number>`COUNT(*)`,
            passedRecords: sql<number>`SUM(CASE WHEN ${ccpMonitoringRecords.passFail} = '\uC801\uD569' THEN 1 ELSE 0 END)`,
            failedRecords: sql<number>`SUM(CASE WHEN ${ccpMonitoringRecords.passFail} = '\uBD80\uC801\uD569' THEN 1 ELSE 0 END)`,
          })
          .from(ccpMonitoringRecords)
          .where(and(...conditions))
          .groupBy(ccpMonitoringRecords.ccpType);
      }
    }),
});

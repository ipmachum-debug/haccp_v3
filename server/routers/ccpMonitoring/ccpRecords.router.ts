import { router, tenantRequiredProcedure } from "../../_core/trpc";
import { z } from "zod";
import { getDb } from "../../db";
import { ccpMonitoringRecords } from "../../../drizzle/schema/ccpMonitoring";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { getEffectiveTenantId } from "./_helpers";
import { triggerCcpTemperatureAlert } from "../../db/system/temperatureAlertTrigger";

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
      const recordId = result.insertId;

      // 2026-04-29 (CP-3-c PoC): ControlPoint 평가기 트리거 — F-3 IoT 폐쇄 루프 첫 단계.
      //   env flag (ENABLE_CCP_EVAL) 미설정 시 즉시 skip — 운영 안전.
      //   활성화 시: 한계 이탈 감지 → h_notifications INSERT (관리자 알림).
      //   LOT HOLD / 손실분개 / 시정조치는 다음 사이클 (F-3 본격).
      import("../industry/food/ccp.evaluatorTrigger")
        .then(({ triggerCcpEvaluator }) =>
          triggerCcpEvaluator({
            recordId: Number(recordId),
            tenantId,
            operatorId: ctx.user.id,
          }),
        )
        .then((res) => {
          if (res.evaluated && res.deviationCount > 0) {
            console.warn(
              `[ccpRecords→ccpEvaluator] recordId=${recordId} ` +
              `이탈 ${res.deviationCount}건 알림 ${res.notificationsCreated}건`,
            );
          }
        })
        .catch((err: any) => {
          console.warn(
            `[ccpRecords→ccpEvaluator] PoC 평가 실패 (recordId=${recordId}, 무시):`,
            err?.message ?? err,
          );
        });

      // P9-4: 실시간 온도 알림 트리거 (비동기, 에러 무시)
      triggerCcpTemperatureAlert({
        tenantId,
        recordId: Number(recordId),
        ccpType: input.ccpType,
        productName: input.productName,
        temperatureC: input.temperatureC,
        tempEdgeC: input.tempEdgeC,
        tempCenterC: input.tempCenterC,
        heatingTimeMin: input.heatingTimeMin,
        pressureMpa: input.pressureMpa,
        passFail: input.passFail,
        measurementTime: input.measurementTime,
      }).catch((err: any) => {
        // ★ 2026-04-15: 이전에는 console.error 만 남기고 끝 →
        //   CCP 이탈 실시간 알림 실패를 사용자/관리자가 알 수 없었음.
        //   여전히 throw 는 못 하지만 (메인 기록 저장은 성공해야 함),
        //   최소한 warn 레벨로 명확히 구분하고 recordId 포함.
        console.warn(
          `[ccpRecords] CCP 온도 알림 트리거 실패 (recordId=${recordId}, ccpType=${input.ccpType}):`,
          err?.message || err,
        );
      });

      return { id: recordId };
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

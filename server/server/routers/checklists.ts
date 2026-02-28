/**
 * 11개 미구현 HACCP 체크리스트 tRPC 라우터
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";

// ✅ P0 FIX: 테넌트/사이트 격리 헬퍼
function getEffectiveSiteId(input: { siteId?: number }, ctx: any): number {
  const siteId = input.siteId ?? ctx.user?.siteId;
  if (!siteId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "사이트 정보가 필요합니다. (siteId)" });
  }
  return siteId;
}

function getEffectiveTenantId(ctx: any): number {
  // ✅ P0 FIX: fallback 제거 - ctx.tenantId는 trpc.ts 미들웨어에서 이미 결정됨
  // super_admin의 경우 actingTenantId가 없으면 tenantId = null → 명시적 403
  const tenantId = ctx.tenantId;
  if (!tenantId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: ctx.user?.role === "super_admin"
        ? "테넌트를 먼저 선택해주세요. (actingTenantId 필요)"
        : "테넌트 정보가 필요합니다. 관리자에게 문의하세요.",
    });
  }
  return tenantId;
}

/**
 * ✅ P0 FIX: verifySiteOwnership - siteId + tenantId 이중 교차 검증
 * siteId 단독으로는 테넌트 경계를 보장하지 못하므로,
 * tenantId를 함께 확인하여 타 테넌트의 레코드 접근을 원천 차단
 */
async function verifySiteOwnership(
  db: any,
  table: any,
  id: number,
  siteId: number,
  tenantId?: number
) {
  // siteId 조건 기본
  const conditions: any[] = [eq(table.id, id), eq(table.siteId, siteId)];

  // tenantId 교차 검증 추가 (테이블에 tenantId 컬럼이 있는 경우)
  if (tenantId && table.tenantId) {
    conditions.push(eq(table.tenantId, tenantId));
  }

  const rows = await db.select().from(table).where(and(...conditions)).limit(1);
  if (!rows[0]) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "해당 레코드를 찾을 수 없거나 접근 권한이 없습니다.",
    });
  }
  return rows[0];
}

import { 
  hWaterQualityTests,
  hAirCompressors,
  hAirCompressorChecks,
  hValidityEvaluations,
  hPersonalHygieneChecks,
  hWaterUsageChecks,
  hEquipmentCleaningRecords,
  hForeignMaterialRecords,
  hRefrigerationChecks,
  hPackagingStorageRecords,
  hQualityIssueRecords,
  hCapaRecords,
  hGenericChecklistRecords,
} from "../../drizzle/schema_main";
import { eq, and, desc, gte, lte, like, sql, count } from "drizzle-orm";

// ============================================================================
// 대시보드 통합 상태 조회 API
// ============================================================================

export const checklistDashboardRouter = router({
  getStats: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("데이터베이스 연결 실패");

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // 각 체크리스트 타입별 통계 조회
    const stats = [
      {
        id: "water-quality-test",
        name: "수질 검사 기록",
        table: hWaterQualityTests,
        dateField: "testDate",
        statusField: "testResult",
        completedValue: "pass",
      },
      {
        id: "air-compressor",
        name: "공기압축기 관리",
        table: hAirCompressorChecks,
        dateField: "checkDate",
        statusField: "status",
        completedValue: "completed",
      },
      {
        id: "validity-evaluation",
        name: "유효성 평가 기록",
        table: hValidityEvaluations,
        dateField: "evaluationDate",
        statusField: "status",
        completedValue: "completed",
      },
      {
        id: "personal-hygiene-check",
        name: "개인위생 점검표",
        table: hPersonalHygieneChecks,
        dateField: "checkDate",
        statusField: "status",
        completedValue: "completed",
      },
      {
        id: "water-usage-check",
        name: "용수 사용 점검표",
        table: hWaterUsageChecks,
        dateField: "checkDate",
        statusField: "status",
        completedValue: "completed",
      },
      {
        id: "equipment-cleaning-record",
        name: "설비 세척·소독 기록",
        table: hEquipmentCleaningRecords,
        dateField: "cleaningDate",
        statusField: "status",
        completedValue: "completed",
      },
      {
        id: "foreign-material-record",
        name: "이물 관리 기록",
        table: hForeignMaterialRecords,
        dateField: "detectionDate",
        statusField: "status",
        completedValue: "resolved",
      },
      {
        id: "refrigeration-check",
        name: "냉동·냉장 설비 점검",
        table: hRefrigerationChecks,
        dateField: "checkDate",
        statusField: "status",
        completedValue: "completed",
      },
      {
        id: "packaging-storage-record",
        name: "포장재 보관 관리",
        table: hPackagingStorageRecords,
        dateField: "checkDate",
        statusField: "status",
        completedValue: "completed",
      },
      {
        id: "quality-issue-record",
        name: "품질 이상 발생 기록",
        table: hQualityIssueRecords,
        dateField: "issueDate",
        statusField: "status",
        completedValue: "resolved",
      },
      {
        id: "capa-record",
        name: "개선조치(CAPA) 기록",
        table: hCapaRecords,
        dateField: "issueDate",
        statusField: "status",
        completedValue: "completed",
      },
    ];

    const results = await Promise.all(
      stats.map(async (stat) => {
        try {
          // 전체 개수
          // ✅ P0 FIX: siteId 필터 적용
          // ✅ P0 FIX: siteId + tenantId 이중 필터 (어느 하나라도 없으면 빈 결과)
          const siteId = ctx.user?.siteId;
          const tenantId = ctx.tenantId;

          // siteId 없으면 해당 통계는 0으로 처리
          if (!siteId) {
            return {
              id: stat.id,
              name: stat.name,
              total: 0,
              completed: 0,
              pending: 0,
              overdue: 0,
            };
          }

          // siteId 필터 (기본)
          const siteCondition = (stat.table as any).siteId
            ? eq((stat.table as any).siteId, siteId)
            : undefined;

          // tenantId 필터 (테이블에 tenantId 컬럼 있을 경우 추가 검증)
          const tenantCondition =
            tenantId && (stat.table as any).tenantId
              ? eq((stat.table as any).tenantId, tenantId)
              : undefined;

          // 복합 필터 (and로 결합)
          const baseFilter = [siteCondition, tenantCondition].filter(Boolean);
          const siteFilter = baseFilter.length > 0 ? and(...(baseFilter as any[])) : undefined;

          const totalResult = await db.select({ count: count() }).from(stat.table).where(siteFilter);
          const total = totalResult[0]?.count || 0;

          // 완료 개수
          const completedResult = await db
            .select({ count: count() })
            .from(stat.table)
            .where(and(siteFilter, eq((stat.table as any)[stat.statusField], stat.completedValue)));
          const completed = completedResult[0]?.count || 0;

          // 기간초과 개수 (7일 이전 데이터 중 미완료)
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          const overdueResult = await db
            .select({ count: count() })
            .from(stat.table)
            .where(
              and(
                siteFilter,
                sql`${(stat.table as any)[stat.dateField]} < ${sevenDaysAgo.toISOString()}`,
                sql`${(stat.table as any)[stat.statusField]} != ${stat.completedValue}`
              )
            );
          const overdue = overdueResult[0]?.count || 0;

          return {
            id: stat.id,
            name: stat.name,
            total: Number(total),
            completed: Number(completed),
            pending: Number(total) - Number(completed),
            overdue: Number(overdue),
          };
        } catch (error) {
          console.error(`Error fetching stats for ${stat.name}:`, error);
          return {
            id: stat.id,
            name: stat.name,
            total: 0,
            completed: 0,
            pending: 0,
            overdue: 0,
          };
        }
      })
    );

    return results;
  }),
});

// ============================================================================
// 1. 수질 검사 기록 (Water Quality Tests)
// ============================================================================

export const waterQualityTestRouter = router({
  list: protectedProcedure
    .input(z.object({
      siteId: z.number().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      testResult: z.enum(["pass", "fail", "pending"]).optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      // ✅ P0 FIX: siteId 강제
      const effectiveSiteId = getEffectiveSiteId(input, ctx);
      const conditions = [eq(hWaterQualityTests.siteId, effectiveSiteId)];
      if (input.startDate) conditions.push(sql`${hWaterQualityTests.testDate} >= ${input.startDate}`);
      if (input.endDate) conditions.push(sql`${hWaterQualityTests.testDate} <= ${input.endDate}`);
      if (input.testResult) conditions.push(eq(hWaterQualityTests.testResult, input.testResult));

      const records = await db
        .select()
        .from(hWaterQualityTests)
        .where(and(...conditions))
        .orderBy(desc(hWaterQualityTests.testDate));

      return records;
    }),



  create: protectedProcedure
    .input(z.object({
      siteId: z.number(),
      testDate: z.string(),
      testLocation: z.string(),
      ph: z.number().optional(),
      turbidity: z.number().optional(),
      residualChlorine: z.number().optional(),
      coliformBacteria: z.string().optional(),
      testResult: z.enum(["pass", "fail", "pending"]).default("pending"),
      remarks: z.string().optional(),
      inspectorId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      const result = await db.insert(hWaterQualityTests).values({
        siteId: input.siteId,
        testDate: new Date(input.testDate),
        testLocation: input.testLocation,
        ph: input.ph?.toString(),
        turbidity: input.turbidity?.toString(),
        residualChlorine: input.residualChlorine?.toString(),
        coliformBacteria: input.coliformBacteria,
        testResult: input.testResult,
        remarks: input.remarks,
        inspectorId: input.inspectorId,
      });

      return { success: true, id: Number((result as any).insertId) };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      testDate: z.string().optional(),
      testLocation: z.string().optional(),
      ph: z.number().optional(),
      turbidity: z.number().optional(),
      residualChlorine: z.number().optional(),
      coliformBacteria: z.string().optional(),
      testResult: z.enum(["pass", "fail", "pending"]).optional(),
      remarks: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      const { id, ...data } = input;
      const updateData: any = {};
      if (data.testDate) updateData.testDate = data.testDate;
      if (data.testLocation) updateData.testLocation = data.testLocation;
      if (data.ph !== undefined) updateData.ph = data.ph.toString();
      if (data.turbidity !== undefined) updateData.turbidity = data.turbidity.toString();
      if (data.residualChlorine !== undefined) updateData.residualChlorine = data.residualChlorine.toString();
      if (data.coliformBacteria) updateData.coliformBacteria = data.coliformBacteria;
      if (data.testResult) updateData.testResult = data.testResult;
      if (data.remarks !== undefined) updateData.remarks = data.remarks;

      // ✅ P0 FIX: siteId 소유권 검증 후 수정
      const effectiveSiteId = getEffectiveSiteId({ siteId: undefined }, ctx);
      await db.update(hWaterQualityTests).set(updateData).where(and(eq(hWaterQualityTests.id, id), eq(hWaterQualityTests.siteId, effectiveSiteId)));

      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      // ✅ P0 FIX: siteId 소유권 검증 후 삭제
      const effectiveSiteId = getEffectiveSiteId({ siteId: undefined }, ctx);
      await db.delete(hWaterQualityTests).where(and(eq(hWaterQualityTests.id, input.id), eq(hWaterQualityTests.siteId, effectiveSiteId)));

      return { success: true };
    }),
});

// ============================================================================
// 2. 공기압축기 관리 (Air Compressors)
// ============================================================================

export const airCompressorRouter = router({
  list: protectedProcedure
    .input(z.object({
      siteId: z.number().optional(),
      status: z.enum(["normal", "warning", "error", "inactive"]).optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      // ✅ P0 FIX: siteId 강제
      const effectiveSiteId = getEffectiveSiteId(input, ctx);
      const conditions = [eq(hAirCompressors.siteId, effectiveSiteId)];
      if (input.status) conditions.push(eq(hAirCompressors.status, input.status));

      const records = await db
        .select()
        .from(hAirCompressors)
        .where(and(...conditions))
        .orderBy(desc(hAirCompressors.createdAt));

      return records;
    }),

  create: protectedProcedure
    .input(z.object({
      siteId: z.number(),
      equipmentCode: z.string(),
      equipmentName: z.string(),
      location: z.string(),
      installDate: z.string().optional(),
      lastMaintenanceDate: z.string().optional(),
      nextMaintenanceDate: z.string().optional(),
      maintenanceCycle: z.number().default(90),
      status: z.enum(["normal", "warning", "error", "inactive"]).default("normal"),
      remarks: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      const result = await db.insert(hAirCompressors).values(input as any);

      return { success: true, id: Number((result as any).insertId) };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      equipmentName: z.string().optional(),
      location: z.string().optional(),
      installDate: z.string().optional(),
      lastMaintenanceDate: z.string().optional(),
      nextMaintenanceDate: z.string().optional(),
      maintenanceCycle: z.number().optional(),
      status: z.enum(["normal", "warning", "error", "inactive"]).optional(),
      remarks: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      const { id, ...data } = input;
      // ✅ P0 FIX: siteId 소유권 검증 후 수정
      const effectiveSiteId = getEffectiveSiteId({ siteId: undefined }, ctx);
      await db.update(hAirCompressors).set(data as any).where(and(eq(hAirCompressors.id, id), eq(hAirCompressors.siteId, effectiveSiteId)));

      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      // ✅ P0 FIX: siteId 소유권 검증 후 삭제
      const effectiveSiteId = getEffectiveSiteId({ siteId: undefined }, ctx);
      await db.delete(hAirCompressors).where(and(eq(hAirCompressors.id, input.id), eq(hAirCompressors.siteId, effectiveSiteId)));

      return { success: true };
    }),

  // 공기압축기 점검 기록
  listChecks: protectedProcedure
    .input(z.object({
      compressorId: z.number(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      const conditions = [eq(hAirCompressorChecks.compressorId, input.compressorId)];
      if (input.startDate) conditions.push(sql`${hAirCompressorChecks.checkDate} >= ${input.startDate}`);
      if (input.endDate) conditions.push(sql`${hAirCompressorChecks.checkDate} <= ${input.endDate}`);

      const records = await db
        .select()
        .from(hAirCompressorChecks)
        .where(and(...conditions))
        .orderBy(desc(hAirCompressorChecks.checkDate));

      return records;
    }),

  createCheck: protectedProcedure
    .input(z.object({
      compressorId: z.number(),
      checkDate: z.string(),
      pressure: z.number().optional(),
      temperature: z.number().optional(),
      oilLevel: z.enum(["normal", "low", "high"]).default("normal"),
      filterCondition: z.enum(["good", "fair", "poor"]).default("good"),
      abnormalNoise: z.number().default(0),
      leakage: z.number().default(0),
      checkResult: z.enum(["pass", "fail"]).default("pass"),
      remarks: z.string().optional(),
      inspectorId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      const result = await db.insert(hAirCompressorChecks).values({
        ...input,
        pressure: input.pressure?.toString(),
        temperature: input.temperature?.toString(),
      } as any);

      return { success: true, id: Number((result as any).insertId) };
    }),
});

// ============================================================================
// 3. 유효성 평가 기록 (Validity Evaluations)
// ============================================================================

export const validityEvaluationRouter = router({
  list: protectedProcedure
    .input(z.object({
      siteId: z.number().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      evaluationResult: z.enum(["effective", "partially_effective", "ineffective"]).optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      // ✅ P0 FIX: siteId 강제
      const effectiveSiteId = getEffectiveSiteId(input, ctx);
      const conditions = [eq(hValidityEvaluations.siteId, effectiveSiteId)];
      if (input.startDate) conditions.push(sql`${hValidityEvaluations.evaluationDate} >= ${input.startDate}`);
      if (input.endDate) conditions.push(sql`${hValidityEvaluations.evaluationDate} <= ${input.endDate}`);
      if (input.evaluationResult) conditions.push(eq(hValidityEvaluations.evaluationResult, input.evaluationResult));

      const records = await db
        .select()
        .from(hValidityEvaluations)
        .where(and(...conditions))
        .orderBy(desc(hValidityEvaluations.evaluationDate));

      return records;
    }),

  create: protectedProcedure
    .input(z.object({
      siteId: z.number(),
      evaluationDate: z.string(),
      evaluationType: z.string(),
      evaluationScope: z.string().optional(),
      evaluationMethod: z.string().optional(),
      findings: z.string().optional(),
      recommendations: z.string().optional(),
      evaluationResult: z.enum(["effective", "partially_effective", "ineffective"]).default("effective"),
      evaluatorId: z.number(),
      approvedBy: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      const result = await db.insert(hValidityEvaluations).values(input as any);

      return { success: true, id: Number((result as any).insertId) };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      evaluationDate: z.string().optional(),
      evaluationType: z.string().optional(),
      evaluationScope: z.string().optional(),
      evaluationMethod: z.string().optional(),
      findings: z.string().optional(),
      recommendations: z.string().optional(),
      evaluationResult: z.enum(["effective", "partially_effective", "ineffective"]).optional(),
      approvedBy: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      const { id, ...data } = input;
      // ✅ P0 FIX: siteId 소유권 검증 후 수정
      const effectiveSiteId = getEffectiveSiteId({ siteId: undefined }, ctx);
      await db.update(hValidityEvaluations).set(data as any).where(and(eq(hValidityEvaluations.id, id), eq(hValidityEvaluations.siteId, effectiveSiteId)));

      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      // ✅ P0 FIX: siteId 소유권 검증 후 삭제
      const effectiveSiteId = getEffectiveSiteId({ siteId: undefined }, ctx);
      await db.delete(hValidityEvaluations).where(and(eq(hValidityEvaluations.id, input.id), eq(hValidityEvaluations.siteId, effectiveSiteId)));

      return { success: true };
    }),
});

// ============================================================================
// 4. 개인위생 점검표 (Personal Hygiene Checks)
// ============================================================================

export const personalHygieneCheckRouter = router({
  list: protectedProcedure
    .input(z.object({
      siteId: z.number().optional(),
      employeeId: z.number().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      checkResult: z.enum(["pass", "fail"]).optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      // ✅ P0 FIX: siteId 강제
      const effectiveSiteId = getEffectiveSiteId(input, ctx);
      const conditions = [eq(hPersonalHygieneChecks.siteId, effectiveSiteId)];
      if (input.employeeId) conditions.push(eq(hPersonalHygieneChecks.employeeId, input.employeeId));
      if (input.startDate) conditions.push(sql`${hPersonalHygieneChecks.checkDate} >= ${input.startDate}`);
      if (input.endDate) conditions.push(sql`${hPersonalHygieneChecks.checkDate} <= ${input.endDate}`);
      if (input.checkResult) conditions.push(eq(hPersonalHygieneChecks.checkResult, input.checkResult));

      const records = await db
        .select()
        .from(hPersonalHygieneChecks)
        .where(and(...conditions))
        .orderBy(desc(hPersonalHygieneChecks.checkDate));

      return records;
    }),

  create: protectedProcedure
    .input(z.object({
      siteId: z.number(),
      employeeId: z.number(),
      checkDate: z.string(),
      uniformCleanliness: z.enum(["good", "fair", "poor"]).default("good"),
      handWashing: z.number().default(1),
      nailTrimming: z.number().default(1),
      jewelry: z.number().default(0),
      hairnet: z.number().default(1),
      mask: z.number().default(1),
      healthCondition: z.enum(["good", "minor_issue", "sick"]).default("good"),
      checkResult: z.enum(["pass", "fail"]).default("pass"),
      remarks: z.string().optional(),
      inspectorId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      const result = await db.insert(hPersonalHygieneChecks).values(input as any);

      return { success: true, id: Number((result as any).insertId) };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      checkDate: z.string().optional(),
      uniformCleanliness: z.enum(["good", "fair", "poor"]).optional(),
      handWashing: z.number().optional(),
      nailTrimming: z.number().optional(),
      jewelry: z.number().optional(),
      hairnet: z.number().optional(),
      mask: z.number().optional(),
      healthCondition: z.enum(["good", "minor_issue", "sick"]).optional(),
      checkResult: z.enum(["pass", "fail"]).optional(),
      remarks: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      const { id, ...data } = input;
      // ✅ P0 FIX: siteId 소유권 검증 후 수정
      const effectiveSiteId = getEffectiveSiteId({ siteId: undefined }, ctx);
      await db.update(hPersonalHygieneChecks).set(data as any).where(and(eq(hPersonalHygieneChecks.id, id), eq(hPersonalHygieneChecks.siteId, effectiveSiteId)));

      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      // ✅ P0 FIX: siteId 소유권 검증 후 삭제
      const effectiveSiteId = getEffectiveSiteId({ siteId: undefined }, ctx);
      await db.delete(hPersonalHygieneChecks).where(and(eq(hPersonalHygieneChecks.id, input.id), eq(hPersonalHygieneChecks.siteId, effectiveSiteId)));

      return { success: true };
    }),
});

// ============================================================================
// 5. 용수 사용 점검표 (Water Usage Checks)
// ============================================================================

export const waterUsageCheckRouter = router({
  list: protectedProcedure
    .input(z.object({
      siteId: z.number().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      checkResult: z.enum(["pass", "fail"]).optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      // ✅ P0 FIX: siteId 강제
      const effectiveSiteId = getEffectiveSiteId(input, ctx);
      const conditions = [eq(hWaterUsageChecks.siteId, effectiveSiteId)];
      if (input.startDate) conditions.push(sql`${hWaterUsageChecks.checkDate} >= ${input.startDate}`);
      if (input.endDate) conditions.push(sql`${hWaterUsageChecks.checkDate} <= ${input.endDate}`);
      if (input.checkResult) conditions.push(eq(hWaterUsageChecks.checkResult, input.checkResult));

      const records = await db
        .select()
        .from(hWaterUsageChecks)
        .where(and(...conditions))
        .orderBy(desc(hWaterUsageChecks.checkDate));

      return records;
    }),

  create: protectedProcedure
    .input(z.object({
      siteId: z.number(),
      checkDate: z.string(),
      usageArea: z.string(),
      waterSource: z.string(),
      usageAmount: z.number().optional(),
      waterPressure: z.number().optional(),
      waterTemperature: z.number().optional(),
      visualInspection: z.enum(["clear", "slightly_cloudy", "cloudy"]).default("clear"),
      checkResult: z.enum(["pass", "fail"]).default("pass"),
      remarks: z.string().optional(),
      inspectorId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      const result = await db.insert(hWaterUsageChecks).values({
        ...input,
        checkDate: new Date(input.checkDate),
        usageAmount: input.usageAmount?.toString(),
        waterPressure: input.waterPressure?.toString(),
        waterTemperature: input.waterTemperature?.toString(),
      } as any);

      return { success: true, id: Number((result as any).insertId) };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      checkDate: z.string().optional(),
      usageArea: z.string().optional(),
      waterSource: z.string().optional(),
      usageAmount: z.number().optional(),
      waterPressure: z.number().optional(),
      waterTemperature: z.number().optional(),
      visualInspection: z.enum(["clear", "slightly_cloudy", "cloudy"]).optional(),
      checkResult: z.enum(["pass", "fail"]).optional(),
      remarks: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      const { id, ...data } = input;
      const updateData: any = {};
      if (data.checkDate) updateData.checkDate = new Date(data.checkDate);
      if (data.usageArea) updateData.usageArea = data.usageArea;
      if (data.waterSource) updateData.waterSource = data.waterSource;
      if (data.usageAmount !== undefined) updateData.usageAmount = data.usageAmount.toString();
      if (data.waterPressure !== undefined) updateData.waterPressure = data.waterPressure.toString();
      if (data.waterTemperature !== undefined) updateData.waterTemperature = data.waterTemperature.toString();
      if (data.visualInspection) updateData.visualInspection = data.visualInspection;
      if (data.checkResult) updateData.checkResult = data.checkResult;
      if (data.remarks !== undefined) updateData.remarks = data.remarks;

      // ✅ P0 FIX: siteId 소유권 검증 후 수정
      const effectiveSiteId = getEffectiveSiteId({ siteId: undefined }, ctx);
      await db.update(hWaterUsageChecks).set(updateData).where(and(eq(hWaterUsageChecks.id, id), eq(hWaterUsageChecks.siteId, effectiveSiteId)));

      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      // ✅ P0 FIX: siteId 소유권 검증 후 삭제
      const effectiveSiteId = getEffectiveSiteId({ siteId: undefined }, ctx);
      await db.delete(hWaterUsageChecks).where(and(eq(hWaterUsageChecks.id, input.id), eq(hWaterUsageChecks.siteId, effectiveSiteId)));

      return { success: true };
    }),
});

// ============================================================================
// 6. 설비 세척·소독 기록 (Equipment Cleaning Records)
// ============================================================================

export const equipmentCleaningRecordRouter = router({
  list: protectedProcedure
    .input(z.object({
      siteId: z.number().optional(),
      equipmentId: z.number().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      verificationResult: z.enum(["pass", "fail"]).optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      // ✅ P0 FIX: siteId 강제
      const effectiveSiteId = getEffectiveSiteId(input, ctx);
      const conditions = [eq(hEquipmentCleaningRecords.siteId, effectiveSiteId)];
      if (input.equipmentId) conditions.push(eq(hEquipmentCleaningRecords.equipmentId, input.equipmentId));
      if (input.startDate) conditions.push(sql`${hEquipmentCleaningRecords.cleaningDate} >= ${input.startDate}`);
      if (input.endDate) conditions.push(sql`${hEquipmentCleaningRecords.cleaningDate} <= ${input.endDate}`);
      if (input.verificationResult) conditions.push(eq(hEquipmentCleaningRecords.verificationResult, input.verificationResult));

      const records = await db
        .select()
        .from(hEquipmentCleaningRecords)
        .where(and(...conditions))
        .orderBy(desc(hEquipmentCleaningRecords.cleaningDate));

      return records;
    }),

  create: protectedProcedure
    .input(z.object({
      siteId: z.number(),
      equipmentId: z.number().optional(),
      equipmentName: z.string(),
      cleaningDate: z.string(),
      cleaningTime: z.string().optional(),
      cleaningMethod: z.string().optional(),
      detergentUsed: z.string().optional(),
      sanitizerUsed: z.string().optional(),
      cleaningDuration: z.number().optional(),
      verificationMethod: z.string().optional(),
      verificationResult: z.enum(["pass", "fail"]).default("pass"),
      remarks: z.string().optional(),
      cleanerId: z.number(),
      verifierId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      const result = await db.insert(hEquipmentCleaningRecords).values({
        ...input,
        cleaningDate: new Date(input.cleaningDate),
      } as any);

      return { success: true, id: Number((result as any).insertId) };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      equipmentName: z.string().optional(),
      cleaningDate: z.string().optional(),
      cleaningTime: z.string().optional(),
      cleaningMethod: z.string().optional(),
      detergentUsed: z.string().optional(),
      sanitizerUsed: z.string().optional(),
      cleaningDuration: z.number().optional(),
      verificationMethod: z.string().optional(),
      verificationResult: z.enum(["pass", "fail"]).optional(),
      remarks: z.string().optional(),
      verifierId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      const { id, ...data } = input;
      const updateData: any = { ...data };
      if (data.cleaningDate) updateData.cleaningDate = new Date(data.cleaningDate);

      // ✅ P0 FIX: siteId 소유권 검증 후 수정
      const effectiveSiteId = getEffectiveSiteId({ siteId: undefined }, ctx);
      await db.update(hEquipmentCleaningRecords).set(updateData).where(and(eq(hEquipmentCleaningRecords.id, id), eq(hEquipmentCleaningRecords.siteId, effectiveSiteId)));

      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      // ✅ P0 FIX: siteId 소유권 검증 후 삭제
      const effectiveSiteId = getEffectiveSiteId({ siteId: undefined }, ctx);
      await db.delete(hEquipmentCleaningRecords).where(and(eq(hEquipmentCleaningRecords.id, input.id), eq(hEquipmentCleaningRecords.siteId, effectiveSiteId)));

      return { success: true };
    }),
});

// ============================================================================
// 7. 이물 관리 기록 (Foreign Material Records)
// ============================================================================

export const foreignMaterialRecordRouter = router({
  list: protectedProcedure
    .input(z.object({
      siteId: z.number().optional(),
      productId: z.number().optional(),
      batchId: z.number().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      severity: z.enum(["low", "medium", "high", "critical"]).optional(),
      status: z.enum(["open", "investigating", "resolved", "closed"]).optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      // ✅ P0 FIX: siteId 강제
      const effectiveSiteId = getEffectiveSiteId(input, ctx);
      const conditions = [eq(hForeignMaterialRecords.siteId, effectiveSiteId)];
      if (input.productId) conditions.push(eq(hForeignMaterialRecords.productId, input.productId));
      if (input.batchId) conditions.push(eq(hForeignMaterialRecords.batchId, input.batchId));
      if (input.startDate) conditions.push(sql`${hForeignMaterialRecords.detectionDate} >= ${input.startDate}`);
      if (input.endDate) conditions.push(sql`${hForeignMaterialRecords.detectionDate} <= ${input.endDate}`);
      if (input.severity) conditions.push(eq(hForeignMaterialRecords.severity, input.severity));
      if (input.status) conditions.push(eq(hForeignMaterialRecords.status, input.status));

      const records = await db
        .select()
        .from(hForeignMaterialRecords)
        .where(and(...conditions))
        .orderBy(desc(hForeignMaterialRecords.detectionDate));

      return records;
    }),

  create: protectedProcedure
    .input(z.object({
      siteId: z.number(),
      detectionDate: z.string(),
      detectionLocation: z.string(),
      productId: z.number().optional(),
      batchId: z.number().optional(),
      materialType: z.string(),
      materialDescription: z.string().optional(),
      materialSize: z.string().optional(),
      detectionMethod: z.string().optional(),
      immediateAction: z.string().optional(),
      rootCause: z.string().optional(),
      correctiveAction: z.string().optional(),
      preventiveAction: z.string().optional(),
      severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
      status: z.enum(["open", "investigating", "resolved", "closed"]).default("open"),
      reportedBy: z.number(),
      investigatedBy: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      const result = await db.insert(hForeignMaterialRecords).values({
        ...input,
        detectionDate: new Date(input.detectionDate),
      } as any);

      return { success: true, id: Number((result as any).insertId) };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      detectionDate: z.string().optional(),
      detectionLocation: z.string().optional(),
      materialType: z.string().optional(),
      materialDescription: z.string().optional(),
      materialSize: z.string().optional(),
      detectionMethod: z.string().optional(),
      immediateAction: z.string().optional(),
      rootCause: z.string().optional(),
      correctiveAction: z.string().optional(),
      preventiveAction: z.string().optional(),
      severity: z.enum(["low", "medium", "high", "critical"]).optional(),
      status: z.enum(["open", "investigating", "resolved", "closed"]).optional(),
      investigatedBy: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      const { id, ...data } = input;
      const updateData: any = { ...data };
      if (data.detectionDate) updateData.detectionDate = new Date(data.detectionDate);

      // ✅ P0 FIX: siteId 소유권 검증 후 수정
      const effectiveSiteId = getEffectiveSiteId({ siteId: undefined }, ctx);
      await db.update(hForeignMaterialRecords).set(updateData).where(and(eq(hForeignMaterialRecords.id, id), eq(hForeignMaterialRecords.siteId, effectiveSiteId)));

      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      // ✅ P0 FIX: siteId 소유권 검증 후 삭제
      const effectiveSiteId = getEffectiveSiteId({ siteId: undefined }, ctx);
      await db.delete(hForeignMaterialRecords).where(and(eq(hForeignMaterialRecords.id, input.id), eq(hForeignMaterialRecords.siteId, effectiveSiteId)));

      return { success: true };
    }),

  close: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      await db.update(hForeignMaterialRecords).set({
        status: "closed",
        closedAt: new Date(),
      } as any).where(eq(hForeignMaterialRecords.id, input.id));

      return { success: true };
    }),
});

// ============================================================================
// 8. 냉동·냉장 설비 점검 (Refrigeration Checks)
// ============================================================================

export const refrigerationCheckRouter = router({
  list: protectedProcedure
    .input(z.object({
      siteId: z.number().optional(),
      equipmentId: z.number().optional(),
      equipmentType: z.enum(["freezer", "refrigerator", "cold_storage"]).optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      checkResult: z.enum(["pass", "fail"]).optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      // ✅ P0 FIX: siteId 강제
      const effectiveSiteId = getEffectiveSiteId(input, ctx);
      const conditions = [eq(hRefrigerationChecks.siteId, effectiveSiteId)];
      if (input.equipmentId) conditions.push(eq(hRefrigerationChecks.equipmentId, input.equipmentId));
      if (input.equipmentType) conditions.push(eq(hRefrigerationChecks.equipmentType, input.equipmentType));
      if (input.startDate) conditions.push(sql`${hRefrigerationChecks.checkDate} >= ${input.startDate}`);
      if (input.endDate) conditions.push(sql`${hRefrigerationChecks.checkDate} <= ${input.endDate}`);
      if (input.checkResult) conditions.push(eq(hRefrigerationChecks.checkResult, input.checkResult));

      const records = await db
        .select()
        .from(hRefrigerationChecks)
        .where(and(...conditions))
        .orderBy(desc(hRefrigerationChecks.checkDate));

      return records;
    }),

  create: protectedProcedure
    .input(z.object({
      siteId: z.number(),
      equipmentId: z.number().optional(),
      equipmentName: z.string(),
      equipmentType: z.enum(["freezer", "refrigerator", "cold_storage"]),
      checkDate: z.string(),
      checkTime: z.string().optional(),
      temperature: z.number(),
      targetTemperature: z.number().optional(),
      humidity: z.number().optional(),
      doorSealCondition: z.enum(["good", "fair", "poor"]).default("good"),
      defrostCondition: z.enum(["normal", "ice_buildup", "needs_defrost"]).default("normal"),
      abnormalNoise: z.number().default(0),
      checkResult: z.enum(["pass", "fail"]).default("pass"),
      remarks: z.string().optional(),
      inspectorId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      const result = await db.insert(hRefrigerationChecks).values({
        ...input,
        checkDate: new Date(input.checkDate),
        temperature: input.temperature.toString(),
        targetTemperature: input.targetTemperature?.toString(),
        humidity: input.humidity?.toString(),
      } as any);

      return { success: true, id: Number((result as any).insertId) };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      equipmentName: z.string().optional(),
      equipmentType: z.enum(["freezer", "refrigerator", "cold_storage"]).optional(),
      checkDate: z.string().optional(),
      checkTime: z.string().optional(),
      temperature: z.number().optional(),
      targetTemperature: z.number().optional(),
      humidity: z.number().optional(),
      doorSealCondition: z.enum(["good", "fair", "poor"]).optional(),
      defrostCondition: z.enum(["normal", "ice_buildup", "needs_defrost"]).optional(),
      abnormalNoise: z.number().optional(),
      checkResult: z.enum(["pass", "fail"]).optional(),
      remarks: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      const { id, ...data } = input;
      const updateData: any = { ...data };
      if (data.checkDate) updateData.checkDate = new Date(data.checkDate);
      if (data.temperature !== undefined) updateData.temperature = data.temperature.toString();
      if (data.targetTemperature !== undefined) updateData.targetTemperature = data.targetTemperature.toString();
      if (data.humidity !== undefined) updateData.humidity = data.humidity.toString();

      // ✅ P0 FIX: siteId 소유권 검증 후 수정
      const effectiveSiteId = getEffectiveSiteId({ siteId: undefined }, ctx);
      await db.update(hRefrigerationChecks).set(updateData).where(and(eq(hRefrigerationChecks.id, id), eq(hRefrigerationChecks.siteId, effectiveSiteId)));

      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      // ✅ P0 FIX: siteId 소유권 검증 후 삭제
      const effectiveSiteId = getEffectiveSiteId({ siteId: undefined }, ctx);
      await db.delete(hRefrigerationChecks).where(and(eq(hRefrigerationChecks.id, input.id), eq(hRefrigerationChecks.siteId, effectiveSiteId)));

      return { success: true };
    }),
});

// ============================================================================
// 9. 포장재 보관 관리 (Packaging Storage Records)
// ============================================================================

export const packagingStorageRecordRouter = router({
  list: protectedProcedure
    .input(z.object({
      siteId: z.number().optional(),
      materialId: z.number().optional(),
      materialType: z.string().optional(),
      storageLocation: z.string().optional(),
      inspectionResult: z.enum(["pass", "fail"]).optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      // ✅ P0 FIX: siteId 강제
      const effectiveSiteId = getEffectiveSiteId(input, ctx);
      const conditions = [eq(hPackagingStorageRecords.siteId, effectiveSiteId)];
      if (input.materialId) conditions.push(eq(hPackagingStorageRecords.materialId, input.materialId));
      if (input.materialType) conditions.push(eq(hPackagingStorageRecords.materialType, input.materialType));
      if (input.storageLocation) conditions.push(like(hPackagingStorageRecords.storageLocation, `%${input.storageLocation}%`));
      if (input.inspectionResult) conditions.push(eq(hPackagingStorageRecords.inspectionResult, input.inspectionResult));

      const records = await db
        .select()
        .from(hPackagingStorageRecords)
        .where(and(...conditions))
        .orderBy(desc(hPackagingStorageRecords.receivedDate));

      return records;
    }),

  create: protectedProcedure
    .input(z.object({
      siteId: z.number(),
      materialId: z.number().optional(),
      materialName: z.string(),
      materialType: z.string(),
      storageLocation: z.string(),
      receivedDate: z.string(),
      lotNumber: z.string().optional(),
      quantity: z.number(),
      uom: z.string(),
      storageCondition: z.enum(["good", "fair", "poor"]).default("good"),
      temperatureControlled: z.number().default(0),
      humidityControlled: z.number().default(0),
      expiryDate: z.string().optional(),
      inspectionResult: z.enum(["pass", "fail"]).default("pass"),
      remarks: z.string().optional(),
      inspectorId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      const result = await db.insert(hPackagingStorageRecords).values({
        ...input,
        receivedDate: new Date(input.receivedDate),
        expiryDate: input.expiryDate ? new Date(input.expiryDate) : undefined,
        quantity: input.quantity.toString(),
      } as any);

      return { success: true, id: Number((result as any).insertId) };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      materialName: z.string().optional(),
      materialType: z.string().optional(),
      storageLocation: z.string().optional(),
      receivedDate: z.string().optional(),
      lotNumber: z.string().optional(),
      quantity: z.number().optional(),
      uom: z.string().optional(),
      storageCondition: z.enum(["good", "fair", "poor"]).optional(),
      temperatureControlled: z.number().optional(),
      humidityControlled: z.number().optional(),
      expiryDate: z.string().optional(),
      inspectionResult: z.enum(["pass", "fail"]).optional(),
      remarks: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      const { id, ...data } = input;
      const updateData: any = { ...data };
      if (data.receivedDate) updateData.receivedDate = new Date(data.receivedDate);
      if (data.expiryDate) updateData.expiryDate = new Date(data.expiryDate);
      if (data.quantity !== undefined) updateData.quantity = data.quantity.toString();

      // ✅ P0 FIX: siteId 소유권 검증 후 수정
      const effectiveSiteId = getEffectiveSiteId({ siteId: undefined }, ctx);
      await db.update(hPackagingStorageRecords).set(updateData).where(and(eq(hPackagingStorageRecords.id, id), eq(hPackagingStorageRecords.siteId, effectiveSiteId)));

      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      // ✅ P0 FIX: siteId 소유권 검증 후 삭제
      const effectiveSiteId = getEffectiveSiteId({ siteId: undefined }, ctx);
      await db.delete(hPackagingStorageRecords).where(and(eq(hPackagingStorageRecords.id, input.id), eq(hPackagingStorageRecords.siteId, effectiveSiteId)));

      return { success: true };
    }),
});

// ============================================================================
// 10. 품질 이상 발생 기록 (Quality Issue Records)
// ============================================================================

export const qualityIssueRecordRouter = router({
  list: protectedProcedure
    .input(z.object({
      siteId: z.number().optional(),
      productId: z.number().optional(),
      batchId: z.number().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      severity: z.enum(["low", "medium", "high", "critical"]).optional(),
      status: z.enum(["open", "investigating", "resolved", "closed"]).optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      // ✅ P0 FIX: siteId 강제
      const effectiveSiteId = getEffectiveSiteId(input, ctx);
      const conditions = [eq(hQualityIssueRecords.siteId, effectiveSiteId)];
      if (input.productId) conditions.push(eq(hQualityIssueRecords.productId, input.productId));
      if (input.batchId) conditions.push(eq(hQualityIssueRecords.batchId, input.batchId));
      if (input.startDate) conditions.push(sql`${hQualityIssueRecords.issueDate} >= ${input.startDate}`);
      if (input.endDate) conditions.push(sql`${hQualityIssueRecords.issueDate} <= ${input.endDate}`);
      if (input.severity) conditions.push(eq(hQualityIssueRecords.severity, input.severity));
      if (input.status) conditions.push(eq(hQualityIssueRecords.status, input.status));

      const records = await db
        .select()
        .from(hQualityIssueRecords)
        .where(and(...conditions))
        .orderBy(desc(hQualityIssueRecords.issueDate));

      return records;
    }),

  create: protectedProcedure
    .input(z.object({
      siteId: z.number(),
      issueDate: z.string(),
      issueType: z.string(),
      productId: z.number().optional(),
      batchId: z.number().optional(),
      lotNumber: z.string().optional(),
      issueDescription: z.string(),
      detectionStage: z.string().optional(),
      affectedQuantity: z.number().optional(),
      immediateAction: z.string().optional(),
      rootCause: z.string().optional(),
      correctiveAction: z.string().optional(),
      preventiveAction: z.string().optional(),
      severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
      status: z.enum(["open", "investigating", "resolved", "closed"]).default("open"),
      reportedBy: z.number(),
      investigatedBy: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      const result = await db.insert(hQualityIssueRecords).values({
        ...input,
        issueDate: new Date(input.issueDate),
        affectedQuantity: input.affectedQuantity?.toString(),
      } as any);

      return { success: true, id: Number((result as any).insertId) };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      issueDate: z.string().optional(),
      issueType: z.string().optional(),
      lotNumber: z.string().optional(),
      issueDescription: z.string().optional(),
      detectionStage: z.string().optional(),
      affectedQuantity: z.number().optional(),
      immediateAction: z.string().optional(),
      rootCause: z.string().optional(),
      correctiveAction: z.string().optional(),
      preventiveAction: z.string().optional(),
      severity: z.enum(["low", "medium", "high", "critical"]).optional(),
      status: z.enum(["open", "investigating", "resolved", "closed"]).optional(),
      investigatedBy: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      const { id, ...data } = input;
      const updateData: any = { ...data };
      if (data.issueDate) updateData.issueDate = new Date(data.issueDate);
      if (data.affectedQuantity !== undefined) updateData.affectedQuantity = data.affectedQuantity.toString();

      // ✅ P0 FIX: siteId 소유권 검증 후 수정
      const effectiveSiteId = getEffectiveSiteId({ siteId: undefined }, ctx);
      await db.update(hQualityIssueRecords).set(updateData).where(and(eq(hQualityIssueRecords.id, id), eq(hQualityIssueRecords.siteId, effectiveSiteId)));

      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      // ✅ P0 FIX: siteId 소유권 검증 후 삭제
      const effectiveSiteId = getEffectiveSiteId({ siteId: undefined }, ctx);
      await db.delete(hQualityIssueRecords).where(and(eq(hQualityIssueRecords.id, input.id), eq(hQualityIssueRecords.siteId, effectiveSiteId)));

      return { success: true };
    }),

  close: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      await db.update(hQualityIssueRecords).set({
        status: "closed",
        closedAt: new Date(),
      } as any).where(eq(hQualityIssueRecords.id, input.id));

      return { success: true };
    }),
});

// ============================================================================
// 11. 개선조치(CAPA) 기록 (CAPA Records)
// ============================================================================

export const capaRecordRouter = router({
  list: protectedProcedure
    .input(z.object({
      siteId: z.number().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      status: z.enum(["open", "in_progress", "completed", "verified", "closed"]).optional(),
      priority: z.enum(["low", "medium", "high", "critical"]).optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      // ✅ P0 FIX: siteId 강제
      const effectiveSiteId = getEffectiveSiteId(input, ctx);
      const conditions = [eq(hCapaRecords.siteId, effectiveSiteId)];
      if (input.startDate) conditions.push(sql`${hCapaRecords.issueDate} >= ${input.startDate}`);
      if (input.endDate) conditions.push(sql`${hCapaRecords.issueDate} <= ${input.endDate}`);
      if (input.status) conditions.push(eq(hCapaRecords.status, input.status));
      if (input.priority) conditions.push(eq(hCapaRecords.priority, input.priority));

      const records = await db
        .select()
        .from(hCapaRecords)
        .where(and(...conditions))
        .orderBy(desc(hCapaRecords.issueDate));

      return records;
    }),

  create: protectedProcedure
    .input(z.object({
      siteId: z.number(),
      capaNumber: z.string(),
      issueDate: z.string(),
      issueSource: z.string().optional(),
      relatedRecordType: z.string().optional(),
      relatedRecordId: z.number().optional(),
      problemDescription: z.string(),
      rootCauseAnalysis: z.string().optional(),
      correctiveAction: z.string().optional(),
      preventiveAction: z.string().optional(),
      actionOwner: z.number().optional(),
      targetCompletionDate: z.string().optional(),
      status: z.enum(["open", "in_progress", "completed", "verified", "closed"]).default("open"),
      priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
      remarks: z.string().optional(),
      createdBy: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      const result = await db.insert(hCapaRecords).values({
        ...input,
        issueDate: new Date(input.issueDate),
        targetCompletionDate: input.targetCompletionDate ? new Date(input.targetCompletionDate) : undefined,
      } as any);

      return { success: true, id: Number((result as any).insertId) };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      issueDate: z.string().optional(),
      issueSource: z.string().optional(),
      problemDescription: z.string().optional(),
      rootCauseAnalysis: z.string().optional(),
      correctiveAction: z.string().optional(),
      preventiveAction: z.string().optional(),
      actionOwner: z.number().optional(),
      targetCompletionDate: z.string().optional(),
      actualCompletionDate: z.string().optional(),
      verificationMethod: z.string().optional(),
      verificationResult: z.enum(["effective", "ineffective", "pending"]).optional(),
      verifiedBy: z.number().optional(),
      status: z.enum(["open", "in_progress", "completed", "verified", "closed"]).optional(),
      priority: z.enum(["low", "medium", "high", "critical"]).optional(),
      remarks: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      const { id, ...data } = input;
      const updateData: any = { ...data };
      if (data.issueDate) updateData.issueDate = new Date(data.issueDate);
      if (data.targetCompletionDate) updateData.targetCompletionDate = new Date(data.targetCompletionDate);
      if (data.actualCompletionDate) updateData.actualCompletionDate = new Date(data.actualCompletionDate);

      // ✅ P0 FIX: siteId 소유권 검증 후 수정
      const effectiveSiteId = getEffectiveSiteId({ siteId: undefined }, ctx);
      await db.update(hCapaRecords).set(updateData).where(and(eq(hCapaRecords.id, id), eq(hCapaRecords.siteId, effectiveSiteId)));

      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      // ✅ P0 FIX: siteId 소유권 검증 후 삭제
      const effectiveSiteId = getEffectiveSiteId({ siteId: undefined }, ctx);
      await db.delete(hCapaRecords).where(and(eq(hCapaRecords.id, input.id), eq(hCapaRecords.siteId, effectiveSiteId)));

      return { success: true };
    }),

  verify: protectedProcedure
    .input(z.object({
      id: z.number(),
      verificationResult: z.enum(["effective", "ineffective", "pending"]),
      verifiedBy: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      await db.update(hCapaRecords).set({
        verificationResult: input.verificationResult,
        verifiedBy: input.verifiedBy,
        verifiedAt: new Date(),
        status: "verified",
      } as any).where(eq(hCapaRecords.id, input.id));

      return { success: true };
    }),

  close: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      await db.update(hCapaRecords).set({
        status: "closed",
      } as any).where(eq(hCapaRecords.id, input.id));

      return { success: true };
    }),
});


// ============================================================================
// 범용 체크리스트 레코드 (Generic Checklist Records)
// 전용 테이블이 없는 체크리스트 폼의 데이터를 JSON으로 저장
// ============================================================================


export const genericChecklistRouter = router({
  // 같은 formType의 최신 레코드 조회 (이전 작성 내용 자동 불러오기)
  getLatestByDate: protectedProcedure
    .input(z.object({
      formType: z.string(),
      formDate: z.string(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      const tenantId = getEffectiveTenantId(ctx);
      const records = await db
        .select()
        .from(hGenericChecklistRecords)
        .where(and(
          eq(hGenericChecklistRecords.formType, input.formType),
          eq((hGenericChecklistRecords as any).tenantId, tenantId)
        ))
        .orderBy(desc(hGenericChecklistRecords.createdAt))
        .limit(1);
      return records[0] || null;
    }),
  list: protectedProcedure
    .input(z.object({
      formType: z.string(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      status: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");
      const tenantId = getEffectiveTenantId(ctx);
      const conditions: any[] = [
        eq(hGenericChecklistRecords.formType, input.formType),
        eq((hGenericChecklistRecords as any).tenantId, tenantId),
      ];
      if (input.startDate) conditions.push(gte(hGenericChecklistRecords.formDate, input.startDate));
      if (input.endDate) conditions.push(lte(hGenericChecklistRecords.formDate, input.endDate));
      if (input.status) conditions.push(eq(hGenericChecklistRecords.status, input.status as any));
      const records = await db
        .select()
        .from(hGenericChecklistRecords)
        .where(and(...conditions))
        .orderBy(desc(hGenericChecklistRecords.createdAt));
      return records;
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");
      const tenantId = getEffectiveTenantId(ctx);
      const records = await db
        .select()
        .from(hGenericChecklistRecords)
        .where(and(
          eq(hGenericChecklistRecords.id, input.id),
          eq((hGenericChecklistRecords as any).tenantId, tenantId)
        ));
      return records[0] || null;
    }),

  create: protectedProcedure
    .input(z.object({
      siteId: z.number().optional(),
      formType: z.string(),
      formDate: z.string(),
      title: z.string().optional(),
      formData: z.any(),
      status: z.enum(["draft", "submitted", "approved", "rejected"]).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");
      const tenantId = getEffectiveTenantId(ctx);
      const result = await db.insert(hGenericChecklistRecords).values({
        siteId: input.siteId || ctx.user.siteId || 1,
        tenantId: tenantId,
        formType: input.formType,
        formDate: input.formDate,
        title: input.title || `${input.formType} - ${input.formDate}`,
        formData: input.formData,
        status: input.status || "draft",
        createdBy: ctx.user.id,
        updatedBy: ctx.user.id,
      } as any);
      return { success: true, id: Number((result as any)[0]?.insertId || (result as any).insertId) };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      formDate: z.string().optional(),
      title: z.string().optional(),
      formData: z.any().optional(),
      status: z.enum(["draft", "submitted", "approved", "rejected"]).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");
      const tenantId = getEffectiveTenantId(ctx);
      const { id, ...data } = input;
      await db.update(hGenericChecklistRecords).set({
        ...data,
        updatedBy: ctx.user.id,
        updatedAt: new Date(),
      } as any).where(and(
        eq(hGenericChecklistRecords.id, id),
        eq((hGenericChecklistRecords as any).tenantId, tenantId)
      ));
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");
      const tenantId = getEffectiveTenantId(ctx);
      await db.delete(hGenericChecklistRecords).where(and(
        eq(hGenericChecklistRecords.id, input.id),
        eq((hGenericChecklistRecords as any).tenantId, tenantId)
      ));
      return { success: true };
    }),

  // 체크리스트 승인 요청 (작성자 → 검토 대기)
  submitForReview: protectedProcedure
    .input(z.object({
      id: z.number(),
      requestType: z.string(),
      title: z.string(),
      description: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");
      const tenantId = getEffectiveTenantId(ctx);

      // 1. 체크리스트 상태를 submitted로 변경
      await db.update(hGenericChecklistRecords).set({
        status: "submitted",
        updatedBy: ctx.user.id,
        updatedAt: new Date(),
      } as any).where(and(
        eq(hGenericChecklistRecords.id, input.id),
        eq((hGenericChecklistRecords as any).tenantId, tenantId)
      ));

      // 2. 승인 요청 생성 (pending_review 상태)
      await db.execute(sql`
        INSERT INTO h_approval_requests 
        (site_id, request_type, reference_type, reference_id, title, description, status, priority, requested_by, tenant_id)
        VALUES 
        (${ctx.user.siteId || 1}, ${input.requestType}, 'checklist', ${input.id}, ${input.title}, ${input.description || ''}, 'pending_review', 'medium', ${ctx.user.id}, ${tenantId})
      `);

      return { success: true, message: "검토 요청이 등록되었습니다." };
    }),

  // 체크리스트 검토 (검토자 → 승인 대기)
  reviewChecklist: protectedProcedure
    .input(z.object({
      approvalRequestId: z.number(),
      action: z.enum(["approve", "reject"]),
      comments: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      if (input.action === "approve") {
        await db.execute(sql`
          UPDATE h_approval_requests 
          SET status = 'pending_approval', reviewed_by = ${ctx.user.id}, reviewed_at = NOW(), review_comments = ${input.comments || null}
          WHERE id = ${input.approvalRequestId}
        `);
        return { success: true, message: "검토가 완료되었습니다. 최종 승인 대기 중입니다." };
      } else {
        const rows: any[] = await db.execute(sql`SELECT reference_id FROM h_approval_requests WHERE id = ${input.approvalRequestId}`) as any;
        const refId = rows?.[0]?.reference_id;
        if (refId) {
          await db.update(hGenericChecklistRecords).set({ status: "draft", updatedAt: new Date() } as any)
            .where(eq(hGenericChecklistRecords.id, refId));
        }
        await db.execute(sql`
          UPDATE h_approval_requests 
          SET status = 'rejected', reviewed_by = ${ctx.user.id}, reviewed_at = NOW(), review_comments = ${input.comments || null},
              rejected_by = ${ctx.user.id}, rejected_at = NOW(), rejection_reason = ${input.comments || null}
          WHERE id = ${input.approvalRequestId}
        `);
        return { success: true, message: "검토가 반려되었습니다." };
      }
    }),

  // 체크리스트 최종 승인 (승인자)
  approveChecklist: protectedProcedure
    .input(z.object({
      approvalRequestId: z.number(),
      action: z.enum(["approve", "reject"]),
      comments: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      const rows: any[] = await db.execute(sql`SELECT reference_id FROM h_approval_requests WHERE id = ${input.approvalRequestId}`) as any;
      const refId = rows?.[0]?.reference_id;

      if (input.action === "approve") {
        if (refId) {
          await db.update(hGenericChecklistRecords).set({ status: "approved", updatedAt: new Date() } as any)
            .where(eq(hGenericChecklistRecords.id, refId));
        }
        await db.execute(sql`
          UPDATE h_approval_requests 
          SET status = 'approved', approved_by = ${ctx.user.id}, approved_at = NOW(), notes = ${input.comments || null}
          WHERE id = ${input.approvalRequestId}
        `);
        return { success: true, message: "최종 승인이 완료되었습니다." };
      } else {
        if (refId) {
          await db.update(hGenericChecklistRecords).set({ status: "submitted", updatedAt: new Date() } as any)
            .where(eq(hGenericChecklistRecords.id, refId));
        }
        await db.execute(sql`
          UPDATE h_approval_requests 
          SET status = 'pending_review', rejected_by = ${ctx.user.id}, rejected_at = NOW(), rejection_reason = ${input.comments || null}
          WHERE id = ${input.approvalRequestId}
        `);
        return { success: true, message: "승인이 반려되었습니다. 재검토가 필요합니다." };
      }
    }),

  // 일괄 검토 (여러 건을 한번에 검토 완료)
  batchReviewChecklists: protectedProcedure
    .input(z.object({
      approvalRequestIds: z.array(z.number()),
      comments: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");
      let successCount = 0;
      for (const id of input.approvalRequestIds) {
        try {
          await db.execute(sql`
            UPDATE h_approval_requests 
            SET status = 'pending_approval', reviewed_by = ${ctx.user.id}, reviewed_at = NOW(), review_comments = ${input.comments || null}
            WHERE id = ${id} AND status IN ('pending_review', 'pending')
          `);
          successCount++;
        } catch (e) {
          console.error(`일괄 검토 실패 (id=${id}):`, e);
        }
      }
      return { success: true, message: `${successCount}건 검토 완료`, count: successCount };
    }),
  // 일괄 승인 (여러 건을 한번에 최종 승인)
  batchApproveChecklists: protectedProcedure
    .input(z.object({
      approvalRequestIds: z.array(z.number()),
      comments: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");
      let successCount = 0;
      for (const id of input.approvalRequestIds) {
        try {
          // reference record도 approved로 변경
          const rows: any[] = await db.execute(sql`SELECT reference_id FROM h_approval_requests WHERE id = ${id}`) as any;
          const refId = rows?.[0]?.reference_id;
          if (refId) {
            await db.update(hGenericChecklistRecords).set({ status: "approved", updatedAt: new Date() } as any)
              .where(eq(hGenericChecklistRecords.id, refId));
          }
          await db.execute(sql`
            UPDATE h_approval_requests 
            SET status = 'approved', approved_by = ${ctx.user.id}, approved_at = NOW(), notes = ${input.comments || null}
            WHERE id = ${id} AND status IN ('pending_approval', 'pending_review', 'pending')
          `);
          successCount++;
        } catch (e) {
          console.error(`일괄 승인 실패 (id=${id}):`, e);
        }
      }
      return { success: true, message: `${successCount}건 승인 완료`, count: successCount };
    }),
  // 승인자가 검토+승인 동시 처리 (검토 자동 완료)
  approveWithAutoReview: protectedProcedure
    .input(z.object({
      approvalRequestId: z.number(),
      comments: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");
      const rows: any[] = await db.execute(sql`SELECT reference_id, status FROM h_approval_requests WHERE id = ${input.approvalRequestId}`) as any;
      const refId = rows?.[0]?.reference_id;
      const currentStatus = rows?.[0]?.status;
      if (refId) {
        await db.update(hGenericChecklistRecords).set({ status: "approved", updatedAt: new Date() } as any)
          .where(eq(hGenericChecklistRecords.id, refId));
      }
      // 검토 단계면 검토도 자동 완료
      if (currentStatus === 'pending_review' || currentStatus === 'pending') {
        await db.execute(sql`
          UPDATE h_approval_requests 
          SET status = 'approved', 
              reviewed_by = ${ctx.user.id}, reviewed_at = NOW(), review_comments = '승인자 자동 검토',
              approved_by = ${ctx.user.id}, approved_at = NOW(), notes = ${input.comments || null}
          WHERE id = ${input.approvalRequestId}
        `);
      } else {
        await db.execute(sql`
          UPDATE h_approval_requests 
          SET status = 'approved', approved_by = ${ctx.user.id}, approved_at = NOW(), notes = ${input.comments || null}
          WHERE id = ${input.approvalRequestId}
        `);
      }
      return { success: true, message: "검토 및 승인이 완료되었습니다." };
    }),
});
import { router, tenantRequiredProcedure } from "../_core/trpc";
import { z } from "zod";
import { generateCcpMonitoringPdf } from "../_core/pdfGenerator.js";
import { getDb } from "../db";
import { 
  ccpLimits, 
  ccpMonitoringRecords, 
  metalDetectionTests, 
  metalDetectionStandards,
  verificationRecords,
  hazardAnalysis,
  productSpecifications,
  productCcpSpecs,
  ccpProcessGroups,
  ccpProcessGroupEquipments,
  ccpProcessGroupProducts,
  ccpTimeProfiles,
  ccpProductTimeProfileMap,
} from "../../drizzle/schema/ccpMonitoring";
import { eq, and, gte, lte, desc, sql, like, asc, SQL } from "drizzle-orm";
import { equipments } from "../../drizzle/schema/equipment";
import { TRPCError } from "@trpc/server";

// ✅ P0 FIX: 테넌트 격리 헬퍼 (fallback 제거 - ctx.tenantId만 인정)
function getEffectiveTenantId(ctx: any): number {
  const tenantId = ctx.tenantId;
  if (!tenantId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "테넌트 정보가 필요합니다. (actingTenantId 누락)" });
  }
  return tenantId;
}

export const ccpMonitoringRouter = router({
  // CCP 한계기준 관리
  createCcpLimit: tenantRequiredProcedure
    .input(z.object({
      ccpType: z.enum(['CCP-1B', 'CCP-2B', 'CCP-3B', 'CCP-4P']),
      productName: z.string(),
      heatingTimeMinMin: z.number().optional(),
      heatingTimeMinMax: z.number().optional(),
      pressureMpaMin: z.string().optional(),
      temperatureCMin: z.string().optional(),
      monitoringFrequency: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      // ✅ P0 FIX: tenantId 강제 주입
      const tenantId = getEffectiveTenantId(ctx);
      const [result] = await db.insert(ccpLimits).values({ ...input, tenantId });
      return { id: result.insertId };
    }),

  getCcpLimits: tenantRequiredProcedure
    .input(z.object({
      ccpType: z.enum(['CCP-1B', 'CCP-2B', 'CCP-3B', 'CCP-4P']).optional(),
      productName: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      // ✅ P0 FIX: tenantId 강제 필터
      const tenantId = getEffectiveTenantId(ctx);
      const conditions = [eq(ccpLimits.tenantId, tenantId)];
      
      if (input.ccpType) {
        conditions.push(eq(ccpLimits.ccpType, input.ccpType));
      }
      if (input.productName) {
        conditions.push(eq(ccpLimits.productName, input.productName));
      }
      
      return await db.select().from(ccpLimits).where(and(...conditions));
    }),

  updateCcpLimit: tenantRequiredProcedure
    .input(z.object({
      id: z.number(),
      heatingTimeMinMin: z.number().optional(),
      heatingTimeMinMax: z.number().optional(),
      pressureMpaMin: z.string().optional(),
      temperatureCMin: z.string().optional(),
      monitoringFrequency: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      // ✅ P0 FIX: tenantId 소유권 검증
      const tenantId = getEffectiveTenantId(ctx);
      const { id, ...data } = input;
      await db.update(ccpLimits).set(data).where(and(eq(ccpLimits.id, id), eq(ccpLimits.tenantId, tenantId)));
      return { success: true };
    }),

  deleteCcpLimit: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      // ✅ P0 FIX: tenantId 소유권 검증
      const tenantId = getEffectiveTenantId(ctx);
      await db.delete(ccpLimits).where(and(eq(ccpLimits.id, input.id), eq(ccpLimits.tenantId, tenantId)));
      return { success: true };
    }),

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
      const [result] = await db.insert(ccpMonitoringRecords).values({
        ...input,
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
      // ✅ P0 FIX: 조건 없으면 전체조회 방지
      // TODO: ccpMonitoringRecords에 tenantId 컬럼 추가 후 필터 강제
      let conditions = [];
      
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

      // ✅ P0 FIX v2: 조건 없으면 최근 50건 반환 (페이지 초기 로딩 지원)
      const records = await db
        .select()
        .from(ccpMonitoringRecords)
        .where(conditions.length > 0 ? and(...conditions) : sql`1=1`)
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
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const { id, ...data } = input;
      await db.update(ccpMonitoringRecords).set(data).where(eq(ccpMonitoringRecords.id, id));
      return { success: true };
    }),

  deleteCcpMonitoringRecord: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      await db.delete(ccpMonitoringRecords).where(eq(ccpMonitoringRecords.id, input.id));
      return { success: true };
    }),

  // 금속검출 테스트 기록 관리
  createMetalDetectionTest: tenantRequiredProcedure
    .input(z.object({
      testDate: z.date(),
      productCategory: z.string(),
      metalType: z.enum(['Fe', 'STS']),
      sizeMm: z.string(),
      position: z.enum(['좌상', '좌하', '중상', '중하', '우상', '우하']),
      testResults: z.string(), // JSON string
      detectionRate: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const [result] = await db.insert(metalDetectionTests).values({
        ...input,
        testerId: ctx.user.id,
      });
      return { id: result.insertId };
    }),

  getMetalDetectionTests: tenantRequiredProcedure
    .input(z.object({
      productCategory: z.string().optional(),
      metalType: z.enum(['Fe', 'STS']).optional(),
      startDate: z.date().optional(),
      endDate: z.date().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      let conditions = [];
      
      if (input.productCategory) {
        conditions.push(eq(metalDetectionTests.productCategory, input.productCategory));
      }
      if (input.metalType) {
        conditions.push(eq(metalDetectionTests.metalType, input.metalType));
      }
      if (input.startDate) {
        conditions.push(gte(metalDetectionTests.testDate, input.startDate));
      }
      if (input.endDate) {
        conditions.push(lte(metalDetectionTests.testDate, input.endDate));
      }
      
      return await db
        .select()
        .from(metalDetectionTests)
        .where(conditions.length > 0 ? and(...conditions) : sql`1=1`)
        .orderBy(desc(metalDetectionTests.testDate))
        .limit(50);
    }),

  // 금속검출 기준 관리
  createMetalDetectionStandard: tenantRequiredProcedure
    .input(z.object({
      productCategory: z.string(),
      metalType: z.enum(['Fe', 'STS']),
      sizeMm: z.string(),
      detectionRate: z.number(),
      sensitivitySetting: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const [result] = await db.insert(metalDetectionStandards).values(input);
      return { id: result.insertId };
    }),

  getMetalDetectionStandards: tenantRequiredProcedure
    .input(z.object({
      productCategory: z.string().optional(),
      metalType: z.enum(['Fe', 'STS']).optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      let conditions = [];
      
      if (input.productCategory) {
        conditions.push(eq(metalDetectionStandards.productCategory, input.productCategory));
      }
      if (input.metalType) {
        conditions.push(eq(metalDetectionStandards.metalType, input.metalType));
      }
      
      return await db
        .select()
        .from(metalDetectionStandards)
        .where(conditions.length > 0 ? and(...conditions) : sql`1=1`);
    }),

  // 검증 기록 관리
  createVerificationRecord: tenantRequiredProcedure
    .input(z.object({
      verificationDate: z.date(),
      verificationType: z.enum(['최초', '일상', '정기', '특별']),
      findings: z.string().optional(),
      nonconformities: z.string().optional(),
      correctiveActions: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const [result] = await db.insert(verificationRecords).values({
        ...input,
        verifierId: ctx.user.id,
      });
      return { id: result.insertId };
    }),

  getVerificationRecords: tenantRequiredProcedure
    .input(z.object({
      verificationType: z.enum(['최초', '일상', '정기', '특별']).optional(),
      startDate: z.date().optional(),
      endDate: z.date().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      let conditions = [];
      
      if (input.verificationType) {
        conditions.push(eq(verificationRecords.verificationType, input.verificationType));
      }
      if (input.startDate) {
        conditions.push(gte(verificationRecords.verificationDate, input.startDate));
      }
      if (input.endDate) {
        conditions.push(lte(verificationRecords.verificationDate, input.endDate));
      }
      
      return await db
        .select()
        .from(verificationRecords)
        .where(conditions.length > 0 ? and(...conditions) : sql`1=1`)
        .orderBy(desc(verificationRecords.verificationDate))
        .limit(50);
    }),

  updateVerificationRecord: tenantRequiredProcedure
    .input(z.object({
      id: z.number(),
      approvedBy: z.number().optional(),
      findings: z.string().optional(),
      nonconformities: z.string().optional(),
      correctiveActions: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const { id, ...data } = input;
      await db.update(verificationRecords).set(data).where(eq(verificationRecords.id, id));
      return { success: true };
    }),

  // 위해요소 분석 관리
  createHazardAnalysis: tenantRequiredProcedure
    .input(z.object({
      processName: z.string(),
      hazardCategory: z.enum(['생물학적', '화학적', '물리적']),
      hazardName: z.string(),
      cause: z.string().optional(),
      severity: z.number().min(1).max(3),
      occurrence: z.number().min(1).max(3),
      riskLevel: z.number().min(1).max(3),
      preventionMeasures: z.string().optional(),
      productCategory: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const [result] = await db.insert(hazardAnalysis).values(input);
      return { id: result.insertId };
    }),

  getHazardAnalysis: tenantRequiredProcedure
    .input(z.object({
      processName: z.string().optional(),
      hazardCategory: z.enum(['생물학적', '화학적', '물리적']).optional(),
      productCategory: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      // ✅ P0 FIX: 조건 없으면 전체조회 방지
      let conditions = [];
      
      if (input.processName) {
        conditions.push(eq(hazardAnalysis.processName, input.processName));
      }
      if (input.hazardCategory) {
        conditions.push(eq(hazardAnalysis.hazardCategory, input.hazardCategory));
      }
      if (input.productCategory) {
        conditions.push(eq(hazardAnalysis.productCategory, input.productCategory));
      }
      
      // ✅ P0 FIX v2: 조건 없으면 전체 반환 (페이지 초기 로딩 지원)
      return await db
        .select()
        .from(hazardAnalysis)
        .where(conditions.length > 0 ? and(...conditions) : sql`1=1`);
    }),

  updateHazardAnalysis: tenantRequiredProcedure
    .input(z.object({
      id: z.number(),
      cause: z.string().optional(),
      severity: z.number().min(1).max(3).optional(),
      occurrence: z.number().min(1).max(3).optional(),
      riskLevel: z.number().min(1).max(3).optional(),
      preventionMeasures: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const { id, ...data } = input;
      await db.update(hazardAnalysis).set(data).where(eq(hazardAnalysis.id, id));
      return { success: true };
    }),

  // 제품 설명서 관리
  createProductSpecification: tenantRequiredProcedure
    .input(z.object({
      productName: z.string(),
      foodType: z.string().optional(),
      appearance: z.string().optional(),
      reportDate: z.date().optional(),
      reportNumber: z.string().optional(),
      authorDate: z.date().optional(),
      ingredients: z.string().optional(), // JSON
      packagingSizes: z.string().optional(), // JSON
      biologicalStandards: z.string().optional(), // JSON
      chemicalStandards: z.string().optional(), // JSON
      physicalStandards: z.string().optional(), // JSON
      storageConditions: z.string().optional(),
      transportConditions: z.string().optional(),
      distributionConditions: z.string().optional(),
      productUsage: z.string().optional(),
      consumptionMethod: z.string().optional(),
      expiryPeriod: z.string().optional(),
      packagingMethod: z.string().optional(),
      packagingMaterial: z.string().optional(),
      labelingInfo: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const [result] = await db.insert(productSpecifications).values({
        ...input,
        authorId: ctx.user.id,
      });
      return { id: result.insertId };
    }),

  getProductSpecifications: tenantRequiredProcedure
    .input(z.object({
      productName: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      let query = db.select().from(productSpecifications);
      
      if (input.productName) {
        query = query.where(eq(productSpecifications.productName, input.productName)) as any;
      }
      
      return await query.orderBy(desc(productSpecifications.createdAt));
    }),

  updateProductSpecification: tenantRequiredProcedure
    .input(z.object({
      id: z.number(),
      foodType: z.string().optional(),
      appearance: z.string().optional(),
      reportDate: z.date().optional(),
      reportNumber: z.string().optional(),
      ingredients: z.string().optional(),
      packagingSizes: z.string().optional(),
      biologicalStandards: z.string().optional(),
      chemicalStandards: z.string().optional(),
      physicalStandards: z.string().optional(),
      storageConditions: z.string().optional(),
      transportConditions: z.string().optional(),
      distributionConditions: z.string().optional(),
      productUsage: z.string().optional(),
      consumptionMethod: z.string().optional(),
      expiryPeriod: z.string().optional(),
      packagingMethod: z.string().optional(),
      packagingMaterial: z.string().optional(),
      labelingInfo: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const { id, ...data } = input;
      await db.update(productSpecifications).set(data).where(eq(productSpecifications.id, id));
      return { success: true };
    }),

  deleteProductSpecification: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      await db.delete(productSpecifications).where(eq(productSpecifications.id, input.id));
      return { success: true };
    }),

  // 위해요소 분석 삭제
  deleteHazardAnalysis: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      await db.delete(hazardAnalysis).where(eq(hazardAnalysis.id, input.id));
      return { success: true };
    }),

  // CCP 모니터링 PDF 생성
  generateCcpPdf: tenantRequiredProcedure
    .input(z.object({
      period: z.enum(['daily', 'weekly', 'monthly']),
      startDate: z.date(),
      endDate: z.date(),
      ccpType: z.enum(['CCP-1B', 'CCP-2B', 'CCP-3B', 'CCP-4P']).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      
      let conditions = [
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
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      let conditions = [
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

  // ============================================================
  // 설비 기준 CCP 모니터링 기록 (설비별 조회)
  // ============================================================
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
      
      let conditions: any[] = [];
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
        .where(conditions.length > 0 ? and(...conditions) : sql`1=1`)
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
      const [result] = await db.insert(ccpMonitoringRecords).values({
        ...input,
        operatorId: ctx.user.id,
      });
      return { id: result.insertId };
    }),

  // ============================================================
  // 제품별 CCP 한계기준 스펙 (product_ccp_specs) CRUD
  // ============================================================
  getProductCcpSpecs: tenantRequiredProcedure
    .input(z.object({
      productId: z.number().optional(),
      ccpType: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);
      
      let conditions: any[] = [eq(productCcpSpecs.tenantId, tenantId), eq(productCcpSpecs.isActive, 1)];
      if (input.productId) {
        conditions.push(eq(productCcpSpecs.productId, input.productId));
      }
      if (input.ccpType) {
        conditions.push(eq(productCcpSpecs.ccpType, input.ccpType));
      }
      
      return await db
        .select()
        .from(productCcpSpecs)
        .where(and(...conditions));
    }),

  createProductCcpSpec: tenantRequiredProcedure
    .input(z.object({
      productId: z.number(),
      ccpType: z.string(),
      minTempC: z.string().optional(),
      maxTempC: z.string().optional(),
      minDurationMin: z.number().optional(),
      maxDurationMin: z.number().optional(),
      minPressureBar: z.string().optional(),
      maxPressureBar: z.string().optional(),
      feSensitivity: z.string().optional(),
      susSensitivity: z.string().optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);
      
      const [result] = await db.insert(productCcpSpecs).values({
        ...input,
        tenantId,
        createdBy: ctx.user.id,
      });
      return { id: result.insertId };
    }),

  updateProductCcpSpec: tenantRequiredProcedure
    .input(z.object({
      id: z.number(),
      minTempC: z.string().optional().nullable(),
      maxTempC: z.string().optional().nullable(),
      minDurationMin: z.number().optional().nullable(),
      maxDurationMin: z.number().optional().nullable(),
      minPressureBar: z.string().optional().nullable(),
      maxPressureBar: z.string().optional().nullable(),
      feSensitivity: z.string().optional().nullable(),
      susSensitivity: z.string().optional().nullable(),
      description: z.string().optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);
      const { id, ...data } = input;
      
      await db.update(productCcpSpecs)
        .set(data)
        .where(and(eq(productCcpSpecs.id, id), eq(productCcpSpecs.tenantId, tenantId)));
      return { success: true };
    }),

  deleteProductCcpSpec: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);
      
      await db.update(productCcpSpecs)
        .set({ isActive: 0 })
        .where(and(eq(productCcpSpecs.id, input.id), eq(productCcpSpecs.tenantId, tenantId)));
      return { success: true };
    }),

  // ============================================================
  // CCP 설비 목록 (ccp_type 기반) - raw SQL로 equipment_master 조회
  // ============================================================
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

  // ============================================================
  // 강화된 통계 - 설비별/제품별/기간별 통계
  // ============================================================
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
      
      let conditions: any[] = [
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

  // ============================================================
  // 제품-CCP 매핑 조회 (마스터데이터 탭용)
  // ============================================================
  getProductCcpMappings: tenantRequiredProcedure
    .input(z.object({
      productId: z.number().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);
      
      const rows = await db.execute(
        sql`SELECT p.id, p.product_name, p.process_flags,
            GROUP_CONCAT(DISTINCT s.ccp_type) as mapped_ccp_types
          FROM h_products_v2 p
          LEFT JOIN product_ccp_specs s ON p.id = s.product_id AND s.is_active = 1 AND s.tenant_id = ${tenantId}
          WHERE p.tenant_id = ${tenantId}
          ${input.productId ? sql`AND p.id = ${input.productId}` : sql``}
          GROUP BY p.id, p.product_name, p.process_flags
          ORDER BY p.id`
      );
      
      return rows[0] || [];
    }),

  // 제품 process_flags 업데이트
  updateProductProcessFlags: tenantRequiredProcedure
    .input(z.object({
      productId: z.number(),
      processFlags: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);
      
      await db.execute(
        sql`UPDATE h_products_v2 SET process_flags = ${input.processFlags} WHERE id = ${input.productId} AND tenant_id = ${tenantId}`
      );
      return { success: true };
    }),


  // ========== 공정 그룹 관리 API ==========
  
  // 공정 그룹 목록 조회
  getProcessGroups: tenantRequiredProcedure
    .input(z.object({ ccpType: z.string().optional() }).optional())
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);
      
      const [rows] = await db.execute(
        sql`SELECT g.*, 
          (SELECT JSON_ARRAYAGG(
            JSON_OBJECT('id', ge.id, 'equipmentId', ge.equipment_id, 'sortOrder', ge.sort_order,
              'equipmentName', e.name, 'equipmentCode', e.code, 'equipmentType', e.type, 'equipmentCcpType', e.ccp_type)
          ) FROM ccp_process_group_equipments ge 
          JOIN equipments e ON ge.equipment_id = e.id
          WHERE ge.process_group_id = g.id AND ge.tenant_id = ${tenantId}) as equipmentList
        FROM ccp_process_groups g
        WHERE g.tenant_id = ${tenantId}
        ${input?.ccpType ? sql`AND g.ccp_type = ${input.ccpType}` : sql``}
        ORDER BY g.sort_order, g.name`
      );
      return (rows as any[]).map((r: any) => ({
        ...r,
        equipments: r.equipmentList ? (typeof r.equipmentList === 'string' ? JSON.parse(r.equipmentList) : r.equipmentList) : []
      }));
    }),

  // 공정 그룹 생성
  createProcessGroup: tenantRequiredProcedure
    .input(z.object({
      name: z.string(),
      ccpType: z.string(),
      description: z.string().optional(),
      temperatureMin: z.number().optional(),
      temperatureMax: z.number().optional(),
      timeMin: z.number().optional(),
      timeMax: z.number().optional(),
      pressureMin: z.number().optional(),
      pressureMax: z.number().optional(),
      phMin: z.number().optional(),
      phMax: z.number().optional(),
      monitoringMethod: z.string().optional(),
      correctiveAction: z.string().optional(),
      sortOrder: z.number().optional(),
      equipmentIds: z.array(z.number()).optional(),
      // 배치 운영 설정 (공정그룹에서 관리)
      equipGroupMode: z.enum(['sequential', 'concurrent', 'grouped']).optional(),
      equipIntervalMin: z.number().optional(),
      equipBatchSize: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);
      
      const [result] = await db.execute(
        sql`INSERT INTO ccp_process_groups (tenant_id, name, ccp_type, description, temperature_min, temperature_max, time_min, time_max, pressure_min, pressure_max, ph_min, ph_max, monitoring_method, corrective_action, sort_order, equip_group_mode, equip_interval_min, equip_batch_size)
        VALUES (${tenantId}, ${input.name}, ${input.ccpType}, ${input.description || null}, ${input.temperatureMin || null}, ${input.temperatureMax || null}, ${input.timeMin || null}, ${input.timeMax || null}, ${input.pressureMin || null}, ${input.pressureMax || null}, ${input.phMin || null}, ${input.phMax || null}, ${input.monitoringMethod || null}, ${input.correctiveAction || null}, ${input.sortOrder || 0}, ${input.equipGroupMode || 'sequential'}, ${input.equipIntervalMin ?? 10}, ${input.equipBatchSize ?? 1})`
      );
      
      const groupId = (result as any).insertId;
      
      if (input.equipmentIds && input.equipmentIds.length > 0) {
        for (let i = 0; i < input.equipmentIds.length; i++) {
          await db.execute(
            sql`INSERT INTO ccp_process_group_equipments (tenant_id, process_group_id, equipment_id, sort_order) VALUES (${tenantId}, ${groupId}, ${input.equipmentIds[i]}, ${i})`
          );
        }
      }
      
      return { id: groupId, success: true };
    }),

  // 공정 그룹 수정
  updateProcessGroup: tenantRequiredProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      ccpType: z.string().optional(),
      description: z.string().optional(),
      temperatureMin: z.number().nullable().optional(),
      temperatureMax: z.number().nullable().optional(),
      timeMin: z.number().nullable().optional(),
      timeMax: z.number().nullable().optional(),
      pressureMin: z.number().nullable().optional(),
      pressureMax: z.number().nullable().optional(),
      phMin: z.number().nullable().optional(),
      phMax: z.number().nullable().optional(),
      monitoringMethod: z.string().optional(),
      correctiveAction: z.string().optional(),
      sortOrder: z.number().optional(),
      equipmentIds: z.array(z.number()).optional(),
      // 배치 운영 설정
      equipGroupMode: z.enum(['sequential', 'concurrent', 'grouped']).optional(),
      equipIntervalMin: z.number().nullable().optional(),
      equipBatchSize: z.number().nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);
      
      // Build dynamic SET clauses using sql.join to avoid COALESCE issues
      const setClauses: SQL[] = [];
      
      if (input.name !== undefined) setClauses.push(sql`name = ${input.name}`);
      if (input.ccpType !== undefined) setClauses.push(sql`ccp_type = ${input.ccpType}`);
      if (input.description !== undefined) setClauses.push(sql`description = ${input.description}`);
      
      // Numeric nullable fields - always update
      const tempMin = input.temperatureMin !== undefined ? input.temperatureMin : null;
      const tempMax = input.temperatureMax !== undefined ? input.temperatureMax : null;
      const tMin = input.timeMin !== undefined ? input.timeMin : null;
      const tMax = input.timeMax !== undefined ? input.timeMax : null;
      const pMin = input.pressureMin !== undefined ? input.pressureMin : null;
      const pMax = input.pressureMax !== undefined ? input.pressureMax : null;
      const phMinVal = input.phMin !== undefined ? input.phMin : null;
      const phMaxVal = input.phMax !== undefined ? input.phMax : null;
      
      setClauses.push(sql`temperature_min = ${tempMin}`);
      setClauses.push(sql`temperature_max = ${tempMax}`);
      setClauses.push(sql`time_min = ${tMin}`);
      setClauses.push(sql`time_max = ${tMax}`);
      setClauses.push(sql`pressure_min = ${pMin}`);
      setClauses.push(sql`pressure_max = ${pMax}`);
      setClauses.push(sql`ph_min = ${phMinVal}`);
      setClauses.push(sql`ph_max = ${phMaxVal}`);
      
      if (input.monitoringMethod !== undefined) setClauses.push(sql`monitoring_method = ${input.monitoringMethod}`);
      if (input.correctiveAction !== undefined) setClauses.push(sql`corrective_action = ${input.correctiveAction}`);
      if (input.sortOrder !== undefined) setClauses.push(sql`sort_order = ${input.sortOrder}`);
      // 배치 운영 설정 업데이트
      if (input.equipGroupMode !== undefined) setClauses.push(sql`equip_group_mode = ${input.equipGroupMode}`);
      if (input.equipIntervalMin !== undefined) setClauses.push(sql`equip_interval_min = ${input.equipIntervalMin}`);
      if (input.equipBatchSize !== undefined) setClauses.push(sql`equip_batch_size = ${input.equipBatchSize}`);
      
      if (setClauses.length > 0) {
        const setClause = sql.join(setClauses, sql`, `);
        await db.execute(sql`UPDATE ccp_process_groups SET ${setClause} WHERE id = ${input.id} AND tenant_id = ${tenantId}`);
      }
      
      if (input.equipmentIds !== undefined) {
        await db.execute(sql`DELETE FROM ccp_process_group_equipments WHERE tenant_id = ${tenantId} AND process_group_id = ${input.id}`);
        for (let i = 0; i < input.equipmentIds.length; i++) {
          await db.execute(
            sql`INSERT INTO ccp_process_group_equipments (tenant_id, process_group_id, equipment_id, sort_order) VALUES (${tenantId}, ${input.id}, ${input.equipmentIds[i]}, ${i})`
          );
        }
      }
      
      return { success: true };
    }),

  // 공정 그룹 삭제
  deleteProcessGroup: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);
      
      // 연관 설비/제품 매핑도 함께 삭제
      await db.execute(sql`DELETE FROM ccp_process_group_equipments WHERE tenant_id = ${tenantId} AND process_group_id = ${input.id}`);
      await db.execute(sql`DELETE FROM ccp_process_group_products WHERE tenant_id = ${tenantId} AND process_group_id = ${input.id}`);
      await db.execute(sql`DELETE FROM ccp_process_groups WHERE id = ${input.id} AND tenant_id = ${tenantId}`);
      return { success: true };
    }),

  // ============================================================
  // ★ 제품 ↔ 공정그룹 매핑 API
  // CCP-1B/2B: BOM 원재료 process_group_id 기반 자동 매핑
  // CCP-4P(금속검출): 공정그룹 관리에서 수동 매핑 (SKU 단위)
  // ============================================================
  
  getProcessGroupProducts: tenantRequiredProcedure
    .input(z.object({
      processGroupId: z.number().optional(),
      ccpType: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);
      
      if (input.processGroupId) {
        // 해당 공정그룹의 ccp_type 확인
        const [groupRows] = await db.execute(
          sql`SELECT id, name, ccp_type FROM ccp_process_groups WHERE id = ${input.processGroupId} AND tenant_id = ${tenantId}`
        );
        const group = (groupRows as any[])[0];
        
        if (group && group.ccp_type === 'CCP-4P') {
          // ★ CCP-4P(금속검출): 수동 매핑 (ccp_process_group_products 테이블)
          // 최종 생산품(SKU) 단위로 금속탐지기를 통과해야 하므로 공정그룹에서 직접 매핑
          const [rows] = await db.execute(
            sql`SELECT gp.id, gp.process_group_id, gp.product_id, gp.created_at,
                p.product_name,
                'MANUAL' as mapping_source
              FROM ccp_process_group_products gp
              JOIN h_products_v2 p ON gp.product_id = p.id
              WHERE gp.tenant_id = ${tenantId} AND gp.process_group_id = ${input.processGroupId}
              ORDER BY p.product_name`
          );
          return rows as any[];
        } else {
          // ★ CCP-1B/2B: BOM 원재료의 process_group_id 기반 자동 매핑
          const [rows] = await db.execute(
            sql`SELECT DISTINCT
                r.product_id,
                p.product_name,
                'BOM' as mapping_source
              FROM h_mf_reports r
              JOIN h_mf_report_versions v ON v.mf_report_id = r.id
              JOIN h_mf_ingredients i ON i.mf_report_version_id = v.id
              JOIN h_products_v2 p ON r.product_id = p.id
              WHERE i.process_group_id = ${input.processGroupId}
                AND r.tenant_id = ${tenantId}
              ORDER BY p.product_name`
          );
          return (rows as any[]).map((r: any) => ({
            ...r,
            process_group_id: input.processGroupId,
          }));
        }
      } else if (input.ccpType) {
        if (input.ccpType === 'CCP-4P') {
          // CCP-4P: 수동 매핑 조회
          const [rows] = await db.execute(
            sql`SELECT gp.id, gp.process_group_id, gp.product_id, gp.created_at,
                p.product_name,
                g.name as group_name, g.ccp_type,
                'MANUAL' as mapping_source
              FROM ccp_process_group_products gp
              JOIN h_products_v2 p ON gp.product_id = p.id
              JOIN ccp_process_groups g ON gp.process_group_id = g.id
              WHERE gp.tenant_id = ${tenantId} AND g.ccp_type = 'CCP-4P'
              ORDER BY g.name, p.product_name`
          );
          return rows as any[];
        } else {
          // CCP-1B/2B: BOM 기반 자동
          const [rows] = await db.execute(
            sql`SELECT DISTINCT
                r.product_id,
                p.product_name,
                g.id as process_group_id,
                g.name as group_name,
                g.ccp_type,
                'BOM' as mapping_source
              FROM h_mf_reports r
              JOIN h_mf_report_versions v ON v.mf_report_id = r.id
              JOIN h_mf_ingredients i ON i.mf_report_version_id = v.id
              JOIN h_products_v2 p ON r.product_id = p.id
              JOIN ccp_process_groups g ON i.process_group_id = g.id
              WHERE r.tenant_id = ${tenantId}
                AND g.ccp_type = ${input.ccpType}
              ORDER BY g.name, p.product_name`
          );
          return rows as any[];
        }
      } else {
        // 전체 조회: BOM 기반(CCP-1B/2B) + 수동(CCP-4P)
        const [bomRows] = await db.execute(
          sql`SELECT DISTINCT
              r.product_id,
              p.product_name,
              g.id as process_group_id,
              g.name as group_name,
              g.ccp_type,
              'BOM' as mapping_source
            FROM h_mf_reports r
            JOIN h_mf_report_versions v ON v.mf_report_id = r.id
            JOIN h_mf_ingredients i ON i.mf_report_version_id = v.id
            JOIN h_products_v2 p ON r.product_id = p.id
            JOIN ccp_process_groups g ON i.process_group_id = g.id
            WHERE r.tenant_id = ${tenantId}
            ORDER BY g.ccp_type, g.name, p.product_name`
        );
        
        const [manualRows] = await db.execute(
          sql`SELECT gp.product_id,
              p.product_name,
              g.id as process_group_id,
              g.name as group_name,
              g.ccp_type,
              'MANUAL' as mapping_source
            FROM ccp_process_group_products gp
            JOIN h_products_v2 p ON gp.product_id = p.id
            JOIN ccp_process_groups g ON gp.process_group_id = g.id
            WHERE gp.tenant_id = ${tenantId} AND g.ccp_type = 'CCP-4P'
            ORDER BY g.name, p.product_name`
        );
        
        return [...(bomRows as any[]), ...(manualRows as any[])];
      }
    }),

  // 수동 제품 매핑 저장 (CCP-4P 금속검출공정용 - SKU 단위 매핑)
  updateProcessGroupProducts: tenantRequiredProcedure
    .input(z.object({
      processGroupId: z.number(),
      productIds: z.array(z.number()),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);
      
      // 기존 수동 매핑 삭제 (tenant 필터 필수)
      await db.execute(
        sql`DELETE FROM ccp_process_group_products WHERE tenant_id = ${tenantId} AND process_group_id = ${input.processGroupId}`
      );
      
      // 새 productIds 일괄 insert
      for (const productId of input.productIds) {
        await db.execute(
          sql`INSERT INTO ccp_process_group_products (tenant_id, process_group_id, product_id) VALUES (${tenantId}, ${input.processGroupId}, ${productId})`
        );
      }
      
      return { success: true, count: input.productIds.length };
    }),

  // ============================================================
  // ★ 시간 프로파일 CRUD (공정별 운영시간 관리)
  // ============================================================
  
  // 시간 프로파일 목록 조회
  getTimeProfiles: tenantRequiredProcedure
    .input(z.object({
      processType: z.string().optional(),
      isActive: z.boolean().default(true),
    }).optional())
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);
      
      let conditions = `WHERE tp.tenant_id = ${tenantId}`;
      if (input?.isActive !== false) {
        conditions += ` AND tp.is_active = 1`;
      }
      if (input?.processType) {
        // processType은 파라미터로 바인딩
      }
      
      if (input?.processType) {
        const [rows] = await db.execute(
          sql`SELECT tp.*, g.name as process_group_name, g.ccp_type
            FROM ccp_time_profiles tp
            LEFT JOIN ccp_process_groups g ON tp.ccp_process_group_id = g.id
            WHERE tp.tenant_id = ${tenantId} AND tp.is_active = 1 AND tp.process_type = ${input.processType}
            ORDER BY tp.process_type, tp.profile_name`
        );
        return rows as any[];
      } else {
        const [rows] = await db.execute(
          sql`SELECT tp.*, g.name as process_group_name, g.ccp_type
            FROM ccp_time_profiles tp
            LEFT JOIN ccp_process_groups g ON tp.ccp_process_group_id = g.id
            WHERE tp.tenant_id = ${tenantId} AND tp.is_active = 1
            ORDER BY tp.process_type, tp.profile_name`
        );
        return rows as any[];
      }
    }),

  // 시간 프로파일 생성 (가드레일: CL 검증 포함)
  createTimeProfile: tenantRequiredProcedure
    .input(z.object({
      processType: z.string(),  // MIX | STEAM | OVEN
      profileName: z.string(),
      timeMinutes: z.number().min(1),
      ccpProcessGroupId: z.number().optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);
      
      // ★ 가드레일 2: CL 검증 - timeMinutes >= CL_minTime
      if (input.ccpProcessGroupId) {
        const [clRows] = await db.execute(
          sql`SELECT time_min, time_max FROM ccp_process_groups WHERE id = ${input.ccpProcessGroupId} AND tenant_id = ${tenantId}`
        );
        const cl = (clRows as any[])[0];
        if (cl) {
          if (cl.time_min && input.timeMinutes < cl.time_min) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `시간(${input.timeMinutes}분)이 CL 최소 시간(${cl.time_min}분)보다 작습니다.`
            });
          }
          if (cl.time_max && input.timeMinutes > cl.time_max) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `시간(${input.timeMinutes}분)이 CL 최대 시간(${cl.time_max}분)을 초과합니다.`
            });
          }
        }
      }
      
      const [result] = await db.execute(
        sql`INSERT INTO ccp_time_profiles (tenant_id, process_type, profile_name, time_minutes, ccp_process_group_id, description)
          VALUES (${tenantId}, ${input.processType}, ${input.profileName}, ${input.timeMinutes}, ${input.ccpProcessGroupId || null}, ${input.description || null})`
      );
      return { id: (result as any).insertId, success: true };
    }),

  // 시간 프로파일 수정 (가드레일: CL 검증 포함)
  updateTimeProfile: tenantRequiredProcedure
    .input(z.object({
      id: z.number(),
      profileName: z.string().optional(),
      timeMinutes: z.number().min(1).optional(),
      ccpProcessGroupId: z.number().nullable().optional(),
      description: z.string().optional(),
      isActive: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);
      
      // ★ 가드레일 2: CL 검증
      if (input.timeMinutes !== undefined) {
        // ccpProcessGroupId를 먼저 확인 (현재 값 또는 새 값)
        let groupId = input.ccpProcessGroupId;
        if (groupId === undefined) {
          const [existing] = await db.execute(
            sql`SELECT ccp_process_group_id FROM ccp_time_profiles WHERE id = ${input.id} AND tenant_id = ${tenantId}`
          );
          groupId = (existing as any[])[0]?.ccp_process_group_id;
        }
        
        if (groupId) {
          const [clRows] = await db.execute(
            sql`SELECT time_min, time_max FROM ccp_process_groups WHERE id = ${groupId} AND tenant_id = ${tenantId}`
          );
          const cl = (clRows as any[])[0];
          if (cl) {
            if (cl.time_min && input.timeMinutes < cl.time_min) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: `시간(${input.timeMinutes}분)이 CL 최소 시간(${cl.time_min}분)보다 작습니다.`
              });
            }
            if (cl.time_max && input.timeMinutes > cl.time_max) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: `시간(${input.timeMinutes}분)이 CL 최대 시간(${cl.time_max}분)을 초과합니다.`
              });
            }
          }
        }
      }
      
      const setClauses: SQL[] = [];
      if (input.profileName !== undefined) setClauses.push(sql`profile_name = ${input.profileName}`);
      if (input.timeMinutes !== undefined) setClauses.push(sql`time_minutes = ${input.timeMinutes}`);
      if (input.ccpProcessGroupId !== undefined) setClauses.push(sql`ccp_process_group_id = ${input.ccpProcessGroupId}`);
      if (input.description !== undefined) setClauses.push(sql`description = ${input.description}`);
      if (input.isActive !== undefined) setClauses.push(sql`is_active = ${input.isActive}`);
      
      if (setClauses.length > 0) {
        const setClause = sql.join(setClauses, sql`, `);
        await db.execute(sql`UPDATE ccp_time_profiles SET ${setClause} WHERE id = ${input.id} AND tenant_id = ${tenantId}`);
      }
      return { success: true };
    }),

  // 시간 프로파일 삭제 (소프트 삭제)
  deleteTimeProfile: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);
      
      await db.execute(
        sql`UPDATE ccp_time_profiles SET is_active = 0 WHERE id = ${input.id} AND tenant_id = ${tenantId}`
      );
      return { success: true };
    }),

  // ============================================================
  // ★ 제품별 시간 프로파일 매핑 CRUD
  // ============================================================
  
  // 제품별 시간 프로파일 매핑 조회
  getProductTimeProfileMaps: tenantRequiredProcedure
    .input(z.object({
      productId: z.number().optional(),
      processType: z.string().optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);
      
      let extraWhere = sql``;
      if (input?.productId) {
        extraWhere = sql` AND m.product_id = ${input.productId}`;
      }
      if (input?.processType) {
        extraWhere = sql`${extraWhere} AND m.process_type = ${input.processType}`;
      }
      
      const [rows] = await db.execute(
        sql`SELECT m.id, m.product_id, m.process_type, m.time_profile_id, m.created_at, m.updated_at,
            p.product_name, p.process_flags,
            tp.profile_name, tp.time_minutes, tp.ccp_process_group_id
          FROM ccp_product_time_profile_map m
          JOIN h_products_v2 p ON m.product_id = p.id
          JOIN ccp_time_profiles tp ON m.time_profile_id = tp.id
          WHERE m.tenant_id = ${tenantId}${extraWhere}
          ORDER BY p.product_name, m.process_type`
      );
      return rows as any[];
    }),

  // 제품별 시간 프로파일 매핑 저장 (upsert)
  updateProductTimeProfileMap: tenantRequiredProcedure
    .input(z.object({
      productId: z.number(),
      processType: z.string(),
      timeProfileId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);
      
      // 기존 매핑 확인
      const [existing] = await db.execute(
        sql`SELECT id FROM ccp_product_time_profile_map 
          WHERE tenant_id = ${tenantId} AND product_id = ${input.productId} AND process_type = ${input.processType}`
      );
      
      if ((existing as any[]).length > 0) {
        // 업데이트
        await db.execute(
          sql`UPDATE ccp_product_time_profile_map SET time_profile_id = ${input.timeProfileId}
            WHERE tenant_id = ${tenantId} AND product_id = ${input.productId} AND process_type = ${input.processType}`
        );
      } else {
        // 신규 생성
        await db.execute(
          sql`INSERT INTO ccp_product_time_profile_map (tenant_id, product_id, process_type, time_profile_id)
            VALUES (${tenantId}, ${input.productId}, ${input.processType}, ${input.timeProfileId})`
        );
      }
      
      return { success: true };
    }),

  // 제품별 시간 프로파일 매핑 삭제
  deleteProductTimeProfileMap: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);
      
      await db.execute(
        sql`DELETE FROM ccp_product_time_profile_map WHERE id = ${input.id} AND tenant_id = ${tenantId}`
      );
      return { success: true };
    }),

  // ★ 가드레일 1: 증숙 포함 제품의 timeProfile 매핑 상태 확인
  // 미매핑 제품 목록을 빨간색으로 표시하기 위한 API
  getUnmappedSteamProducts: tenantRequiredProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);
      
      // 증숙 공정이 포함된 제품 중 timeProfile 매핑이 없는 제품
      const [rows] = await db.execute(
        sql`SELECT p.id, p.product_name, p.process_flags
          FROM h_products_v2 p
          WHERE p.tenant_id = ${tenantId}
            AND p.process_flags LIKE '%STEAM%'
            AND p.id NOT IN (
              SELECT product_id FROM ccp_product_time_profile_map 
              WHERE tenant_id = ${tenantId} AND process_type = 'STEAM'
            )
          ORDER BY p.product_name`
      );
      return rows as any[];
    }),

  // ★ 가드레일 1: 배치 확정 전 timeProfile 매핑 검증
  validateBatchTimeProfiles: tenantRequiredProcedure
    .input(z.object({
      productIds: z.array(z.number()),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);
      
      const results: { productId: number; productName: string; hasSteam: boolean; hasMapping: boolean }[] = [];
      
      for (const productId of input.productIds) {
        const [productRows] = await db.execute(
          sql`SELECT id, product_name, process_flags FROM h_products_v2 WHERE id = ${productId} AND tenant_id = ${tenantId}`
        );
        const product = (productRows as any[])[0];
        if (!product) continue;
        
        const hasSteam = (product.process_flags || '').includes('STEAM');
        let hasMapping = true;
        
        if (hasSteam) {
          const [mapRows] = await db.execute(
            sql`SELECT id FROM ccp_product_time_profile_map 
              WHERE tenant_id = ${tenantId} AND product_id = ${productId} AND process_type = 'STEAM'`
          );
          hasMapping = (mapRows as any[]).length > 0;
        }
        
        results.push({
          productId: product.id,
          productName: product.product_name,
          hasSteam,
          hasMapping,
        });
      }
      
      const allValid = results.every(r => !r.hasSteam || r.hasMapping);
      return { valid: allValid, products: results };
    }),

});

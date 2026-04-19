/**
 * 대시보드 통합 상태 조회 API
 */

import { router, tenantRequiredProcedure } from "../../_core/trpc";
import { getDb } from "../../db";
import {
  hWaterQualityTests,
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
} from "../../../drizzle/schema/schema_main";
import { eq, and, sql, count } from "drizzle-orm";

import { formatLocalDate } from "../../utils/timezone";

export const checklistDashboardRouter = router({
  getStats: tenantRequiredProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("데이터베이스 연결 실패");

    const today = new Date();
    const todayStr = formatLocalDate(today);

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

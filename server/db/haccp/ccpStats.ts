import { getDb } from "../connection";

/**
 * CCP 점검 준수율 통계 (월별/주별)
 * ✅ 멀티테넌시 격리: tenantId 필터 적용
 */
export async function getCcpComplianceStats(params: {
  period: "weekly" | "monthly";
  startDate: string;
  endDate: string;
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { hCcpRows } = await import("../../../drizzle/schema/schema_main");
  const { and, gte, lte, eq, sql } = await import("drizzle-orm");

  const start = new Date(params.startDate);
  const end = new Date(params.endDate);

  const baseConditions: any[] = [
    gte(hCcpRows.measuredAt, start),
    lte(hCcpRows.measuredAt, end)
  ];
  if (tenantId) baseConditions.push(eq(hCcpRows.tenantId, tenantId));

  if (params.period === "weekly") {
    const stats = await db
      .select({
        week: sql<string>`DATE_FORMAT(${hCcpRows.measuredAt}, '%Y-%u')`,
        totalChecks: sql<number>`COUNT(*)`,
        passCount: sql<number>`SUM(CASE WHEN ${hCcpRows.result} = 'PASS' THEN 1 ELSE 0 END)`,
        failCount: sql<number>`SUM(CASE WHEN ${hCcpRows.result} = 'FAIL' THEN 1 ELSE 0 END)`
      })
      .from(hCcpRows)
      .where(and(...baseConditions))
      .groupBy(sql`DATE_FORMAT(${hCcpRows.measuredAt}, '%Y-%u')`)
      .orderBy(sql`DATE_FORMAT(${hCcpRows.measuredAt}, '%Y-%u')`);

    return stats.map((s: any) => ({
      period: s.week,
      totalChecks: s.totalChecks,
      passCount: s.passCount,
      failCount: s.failCount,
      complianceRate: s.totalChecks > 0 ? ((s.passCount / s.totalChecks) * 100).toFixed(2) : "0.00"
    }));
  } else {
    const stats = await db
      .select({
        month: sql<string>`DATE_FORMAT(${hCcpRows.measuredAt}, '%Y-%m')`,
        totalChecks: sql<number>`COUNT(*)`,
        passCount: sql<number>`SUM(CASE WHEN ${hCcpRows.result} = 'PASS' THEN 1 ELSE 0 END)`,
        failCount: sql<number>`SUM(CASE WHEN ${hCcpRows.result} = 'FAIL' THEN 1 ELSE 0 END)`
      })
      .from(hCcpRows)
      .where(and(...baseConditions))
      .groupBy(sql`DATE_FORMAT(${hCcpRows.measuredAt}, '%Y-%m')`)
      .orderBy(sql`DATE_FORMAT(${hCcpRows.measuredAt}, '%Y-%m')`);

    return stats.map((s: any) => ({
      period: s.month,
      totalChecks: s.totalChecks,
      passCount: s.passCount,
      failCount: s.failCount,
      complianceRate: s.totalChecks > 0 ? ((s.passCount / s.totalChecks) * 100).toFixed(2) : "0.00"
    }));
  }
}

/**
 * CCP 이탈 건수 추이 (월별/주별)
 * ✅ 멀티테넌시 격리: tenantId 필터 적용
 */
export async function getCcpDeviationTrend(params: {
  period: "weekly" | "monthly";
  startDate: string;
  endDate: string;
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { hCcpRows } = await import("../../../drizzle/schema/schema_main");
  const { and, gte, lte, eq, sql } = await import("drizzle-orm");

  const start = new Date(params.startDate);
  const end = new Date(params.endDate);

  const baseConditions: any[] = [
    eq(hCcpRows.result, "FAIL"),
    gte(hCcpRows.measuredAt, start),
    lte(hCcpRows.measuredAt, end)
  ];
  if (tenantId) baseConditions.push(eq(hCcpRows.tenantId, tenantId));

  if (params.period === "weekly") {
    const stats = await db
      .select({
        week: sql<string>`DATE_FORMAT(${hCcpRows.measuredAt}, '%Y-%u')`,
        deviationCount: sql<number>`COUNT(*)`
      })
      .from(hCcpRows)
      .where(and(...baseConditions))
      .groupBy(sql`DATE_FORMAT(${hCcpRows.measuredAt}, '%Y-%u')`)
      .orderBy(sql`DATE_FORMAT(${hCcpRows.measuredAt}, '%Y-%u')`);

    return stats.map((s: any) => ({
      period: s.week,
      deviationCount: s.deviationCount
    }));
  } else {
    const stats = await db
      .select({
        month: sql<string>`DATE_FORMAT(${hCcpRows.measuredAt}, '%Y-%m')`,
        deviationCount: sql<number>`COUNT(*)`
      })
      .from(hCcpRows)
      .where(and(...baseConditions))
      .groupBy(sql`DATE_FORMAT(${hCcpRows.measuredAt}, '%Y-%m')`)
      .orderBy(sql`DATE_FORMAT(${hCcpRows.measuredAt}, '%Y-%m')`);

    return stats.map((s: any) => ({
      period: s.month,
      deviationCount: s.deviationCount
    }));
  }
}

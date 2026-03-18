/**
 * 검사 통계 대시보드 DB 함수
 */

import { getDb } from "../db";
import { materialInspectionRecords, hygieneInspectionRecords, shippingInspectionRecords } from "../../drizzle/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";

/**
 * 검사 통계 대시보드 데이터 조회
 */
export async function getInspectionDashboardStatistics(params: {
  type: "material" | "hygiene" | "shipping";
  range: "week" | "month" | "quarter";
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const now = new Date();
  const startDate = new Date();
  
  // 기간 설정
  switch (params.range) {
    case "week":
      startDate.setDate(now.getDate() - 7);
      break;
    case "month":
      startDate.setMonth(now.getMonth() - 1);
      break;
    case "quarter":
      startDate.setMonth(now.getMonth() - 3);
      break;
  }

  const startDateStr = startDate.toISOString().split('T')[0];
  const endDateStr = now.toISOString().split('T')[0];

  // 검사 유형에 따라 테이블 선택
  let table;
  let resultField;
  
  switch (params.type) {
    case "material":
      table = materialInspectionRecords;
      resultField = "inspectionResult";
      break;
    case "hygiene":
      table = hygieneInspectionRecords;
      resultField = "result";
      break;
    case "shipping":
      table = shippingInspectionRecords;
      resultField = "inspectionResult";
      break;
  }

  // 전체 검사 기록 조회
  const conditions: any[] = [
    gte((table as any).inspectionDate, startDateStr),
    lte((table as any).inspectionDate, endDateStr)
  ];
  if (tenantId) {
    conditions.push(eq((table as any).tenantId, tenantId));
  }
  const records = await db
    .select()
    .from(table)
    .where(and(...conditions));

  // 통계 계산
  const totalCount = records.length;
  let passCount = 0;
  let failCount = 0;
  let conditionalCount = 0;

  if (params.type === "material" || params.type === "shipping") {
    passCount = records.filter((r: any) => r.inspectionResult === "pass").length;
    failCount = records.filter((r: any) => r.inspectionResult === "fail").length;
    conditionalCount = records.filter((r: any) => 
      r.inspectionResult === "conditional" || r.inspectionResult === "hold"
    ).length;
  } else if (params.type === "hygiene") {
    passCount = records.filter((r: any) => r.result === "good").length;
    failCount = records.filter((r: any) => r.result === "poor").length;
    conditionalCount = records.filter((r: any) => r.result === "fair").length;
  }

  const passRate = totalCount > 0 ? (passCount / totalCount) * 100 : 0;

  // 불합격 사유 분석 (notes 필드에서 추출)
  const failRecords = records.filter((r: any) => {
    if (params.type === "hygiene") {
      return r.result === "poor";
    }
    return r.inspectionResult === "fail";
  });

  const failReasonMap = new Map<string, number>();
  failRecords.forEach((r: any) => {
    const reason = r.notes || "사유 없음";
    failReasonMap.set(reason, (failReasonMap.get(reason) || 0) + 1);
  });

  const failReasons = Array.from(failReasonMap.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5); // 상위 5개만

  // 검사자별 통계
  const inspectorMap = new Map<string, { totalCount: number; passCount: number }>();
  records.forEach((r: any) => {
    const inspectorName = r.inspectorName;
    const current = inspectorMap.get(inspectorName) || { totalCount: 0, passCount: 0 };
    current.totalCount++;
    
    if (params.type === "hygiene") {
      if (r.result === "good") current.passCount++;
    } else {
      if (r.inspectionResult === "pass") current.passCount++;
    }
    
    inspectorMap.set(inspectorName, current);
  });

  const inspectorStats = Array.from(inspectorMap.entries())
    .map(([inspectorName, stats]) => ({
      inspectorName,
      ...stats,
      passRate: stats.totalCount > 0 ? (stats.passCount / stats.totalCount) * 100 : 0
    }))
    .sort((a, b) => b.totalCount - a.totalCount);

  // 검사 추이 (일별)
  const dateMap = new Map<string, { count: number; passCount: number }>();
  records.forEach((r: any) => {
    const date = r.inspectionDate;
    const current = dateMap.get(date) || { count: 0, passCount: 0 };
    current.count++;
    
    if (params.type === "hygiene") {
      if (r.result === "good") current.passCount++;
    } else {
      if (r.inspectionResult === "pass") current.passCount++;
    }
    
    dateMap.set(date, current);
  });

  const trendData = Array.from(dateMap.entries())
    .map(([date, stats]) => ({
      date,
      count: stats.count,
      passRate: stats.count > 0 ? (stats.passCount / stats.count) * 100 : 0
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // 평균 검사 시간 계산 (임시로 0으로 설정, 실제로는 createdAt과 updatedAt 차이 계산)
  const avgInspectionTime = 0;

  return {
    totalCount,
    passCount,
    failCount,
    conditionalCount,
    passRate,
    failReasons,
    inspectorStats,
    trendData,
    avgInspectionTime
  };
}

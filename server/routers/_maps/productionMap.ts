/**
 * 생산 도메인 라우터 매핑 — _root.ts 분해 (2026-04-19)
 */
import {
  batchRouter,
  batchCostRouter,
  batchScheduleRouter,
  costAnalysisRouter,
  costSavingAIRouter,
  dailyReportRouter,
  intermediateRouter,
  mfReportRouter,
  productRouter,
  productionRouter,
  productionDashboardRouter,
  productionPredictionRouter,
  productionScheduleRouter,
  recipeApprovalRouter,
  recipeManagementRouter,
  scheduleOptimizationRouter,
  aiProductionParserRouter,
  autoAgentRouter,
  dailyLogRouter,
  weeklyLogsRouter,
  monthlyLogsRouter,
  yearlyLogsRouter,
} from "../production";
import { todayProductionRouter } from "../production/todayProduction.router";

export const productionRouterMap = {
  batch: batchRouter,
  // P-2 (2026-10-14): 오늘의 생산 쓰기 — 시작 재검증·중복 방지
  todayProduction: todayProductionRouter,
  // batchApproval: 2026-10-13 제거 — batch.lifecycle.router 의 approve/reject/getApprovalOverview 와 중복이던
  //   미사용 네임스페이스 (클라이언트 참조 0). #473 이 이 죽은 라우터를 고치는 바람에 배치 승인 카드가 무한 로딩이었다.
  batchCost: batchCostRouter,
  batchSchedule: batchScheduleRouter,
  product: productRouter,
  recipeManagement: recipeManagementRouter,
  recipeApproval: recipeApprovalRouter,
  costAnalysis: costAnalysisRouter,
  costSavingAI: costSavingAIRouter,
  intermediate: intermediateRouter,
  mfReport: mfReportRouter,
  production: productionRouter,
  productionSchedule: productionScheduleRouter,
  productionDashboard: productionDashboardRouter,
  productionPrediction: productionPredictionRouter,
  scheduleOptimization: scheduleOptimizationRouter,
  aiProductionParser: aiProductionParserRouter,
  autoAgent: autoAgentRouter,
  dailyReport: dailyReportRouter,
  dailyLog: dailyLogRouter,
  weeklyLog: weeklyLogsRouter,
  monthlyLog: monthlyLogsRouter,
  yearlyLog: yearlyLogsRouter,
} as const;

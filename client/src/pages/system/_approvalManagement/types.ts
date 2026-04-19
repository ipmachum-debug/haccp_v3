/**
 * 승인 관리 도메인 타입 — ApprovalManagement.tsx 에서 추출 (2026-04-19)
 */
import type { RouterOutput } from "@/lib/trpcTypes";

export type ApprovalRequest = RouterOutput["approval"]["list"][number];
export type ApprovalSetting = RouterOutput["organization"]["approvalSettings"]["list"][number];
export type EmployeeRow = RouterOutput["organization"]["employees"]["list"][number];
export type PendingRecipe = RouterOutput["recipeApproval"]["getPending"][number];
export type RecipeHistory = RouterOutput["recipeApproval"]["getHistory"][number];
export type CcpFormRecord = RouterOutput["ccpForm"]["getByBatch"][number];
export type CcpInstance = RouterOutput["ccp"]["getByBatchId"][number];

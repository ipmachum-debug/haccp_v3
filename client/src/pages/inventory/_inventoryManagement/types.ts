/**
 * 재고관리 도메인 타입 — InventoryManagementIntegrated.tsx 에서 추출 (2026-04-19)
 * trpc proxy 가 깊은 타입을 완전히 전파하지 못해 명시 추출
 */
import type { RouterOutput } from "@/lib/trpcTypes";

export type InventoryLot = RouterOutput["inventory"]["list"][number];
export type InboundReceipt = RouterOutput["inventory"]["getInboundHistory"][number];
export type TurnoverRow = RouterOutput["inventory"]["getTurnoverAnalysis"][number];
export type TrendRow = RouterOutput["inventory"]["getTrend"][number];
export type PurchaseSuggestion = RouterOutput["inventory"]["getPurchaseOrderSuggestions"][number];
export type SubsidiaryLot = RouterOutput["inventory"]["listLots"][number];

/** 표시 전용 (서버 turnoverRow + Korean efficiency label) */
export type TurnoverRowDisplay = Omit<TurnoverRow, "efficiency"> & { efficiency: string };

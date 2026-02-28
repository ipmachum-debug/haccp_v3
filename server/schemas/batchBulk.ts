/**
 * 하루 복수 품목 일괄 배치 생성 Zod 스키마
 *
 * [사용처]
 * - server/routers.ts → batch.bulkCreateForDay
 * - 향후 UI 페이지에서 workDate + items[] 입력 시 validation
 *
 * [설계 원칙]
 * - 기존 batch.create의 input과 호환 (siteId, productId, plannedQuantity 등)
 * - 하루(workDate) 단위로 복수 품목을 한 번에 입력
 * - SKU별 예상/확정 수량까지 입력 가능
 * - 금속탐지 스케줄링 정책 포함
 */

import { z } from "zod";

// ───────────────────────────────────────────────────────────
// SKU 산출 입력
// ───────────────────────────────────────────────────────────
export const zSkuOutputInput = z.object({
  skuId: z.number(),
  /** 예상 생산 수량 (판매 단위 기준) */
  plannedQty: z.number().nonnegative().default(0),
  /** 실제 생산 수량 (나중에 입력 가능) */
  actualQty: z.number().nonnegative().optional(),
  /** 불량 수량 */
  defectiveQty: z.number().nonnegative().optional(),
  /** 메모 */
  note: z.string().optional(),
});

// ───────────────────────────────────────────────────────────
// 품목별 배치 입력
// ───────────────────────────────────────────────────────────
export const zBulkBatchItemInput = z.object({
  productId: z.number(),
  /** 반죽/생산량(kg) - batch의 plannedQuantity에 대응 */
  plannedQuantityKg: z.number().positive(),
  /** SKU별 산출 (최소 1개) */
  skuOutputs: z.array(zSkuOutputInput).optional(),

  /** 품목별 시작시간 override (없으면 dayStartTime 사용) */
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(), // "HH:mm"
  /** 해당 품목만 auto/manual 모드 override */
  mode: z.enum(["auto", "manual"]).optional(),
  /** 배치 코드 override (없으면 서버에서 자동 생성) */
  batchCode: z.string().optional(),
});

// ───────────────────────────────────────────────────────────
// 금속탐지 + 공정 스케줄링 정책
// ───────────────────────────────────────────────────────────
export const zSchedulingPolicy = z.object({
  /** 공정그룹 병렬/순차/일괄 운영 정책 적용 여부 */
  applyProcessSchedule: z.boolean().default(true),
  /** 금속탐지 SKU 통과시간 배정 방식 */
  metalAllocation: z.enum(["EQUAL", "PROPORTIONAL"]).default("PROPORTIONAL"),
  /** 금속탐지 직렬 통과 순서 */
  passOrder: z.enum(["INPUT_ORDER", "PLANNED_QTY_DESC", "CUSTOM"]).default("INPUT_ORDER"),
  /** CUSTOM 순서 시 skuId 배열 */
  customSkuOrder: z.array(z.number()).optional(),
}).default({
  applyProcessSchedule: true,
  metalAllocation: "PROPORTIONAL",
  passOrder: "INPUT_ORDER",
});

// ───────────────────────────────────────────────────────────
// 메인: 하루 일괄 배치 생성 입력
// ───────────────────────────────────────────────────────────
export const zBatchBulkCreateForDayInput = z.object({
  siteId: z.number(),
  /** 작업일자 "YYYY-MM-DD" */
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** 하루 작업 시작 시간 "HH:mm" */
  dayStartTime: z.string().regex(/^\d{2}:\d{2}$/).default("09:00"),
  /** 문서 자동/수동 기본값 */
  defaultMode: z.enum(["auto", "manual"]).default("auto"),

  /** 금속탐지 설비 선택 (없으면 기본 라인) */
  metalDetectorEquipmentId: z.number().optional(),

  /** 스케줄링 정책 */
  scheduling: zSchedulingPolicy,

  /** 품목별 배치 목록 (1~50건) */
  items: z.array(zBulkBatchItemInput).min(1).max(50),

  /** 메모 */
  memo: z.string().optional(),
});

// 타입 내보내기
export type SkuOutputInput = z.infer<typeof zSkuOutputInput>;
export type BulkBatchItemInput = z.infer<typeof zBulkBatchItemInput>;
export type SchedulingPolicy = z.infer<typeof zSchedulingPolicy>;
export type BatchBulkCreateForDayInput = z.infer<typeof zBatchBulkCreateForDayInput>;

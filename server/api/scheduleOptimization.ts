import { getDb } from "../db";
import { hBatches, hMaterials, hInventoryLots } from "../../drizzle/schema";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { invokeLLM } from "../_core/llm";

/**
 * AI 기반 생산일정 최적화
 * - 재고 수준 기반 생산 우선순위 계산
 * - 납기일 기반 스케줄링
 * - 설비 가용성 고려
 */
export async function optimizeProductionSchedule(params: {
  startDate: string;
  endDate: string;
  facilityIds?: number[];
  tenantId: number;
}) {
  const { startDate, endDate, facilityIds, tenantId } = params;
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 1. 현재 재고 수준 조회
  const inventoryLevels = await db
    .select({
      productId: hInventoryLots.productId,
      totalQuantity: sql<string>`SUM(${hInventoryLots.availableQuantity})`,
    })
    .from(hInventoryLots)
    .where(eq(hInventoryLots.status, "available"))
    .groupBy(hInventoryLots.productId);

  // 2. 계획된 배치 조회
  const plannedBatches = await db
    .select()
    .from(hBatches)
    .where(
      and(
        eq(hBatches.tenantId, tenantId),
        gte(hBatches.plannedDate, new Date(startDate)),
        lte(hBatches.plannedDate, new Date(endDate)),
        sql`${hBatches.status} IN ('planned', 'in_progress')`
      )
    )
    .orderBy(hBatches.plannedDate);

  // 3. 원재료 재고 수준 조회
  const materialInventory = await db
    .select({
      materialId: hInventoryLots.materialId,
      totalQuantity: sql<string>`SUM(${hInventoryLots.availableQuantity})`,
    })
    .from(hInventoryLots)
    .where(eq(hInventoryLots.status, "available"))
    .groupBy(hInventoryLots.materialId);

  // 4. AI 기반 우선순위 계산
  const optimizationPrompt = `
다음 생산 계획 데이터를 분석하여 최적의 생산 일정을 제안해주세요:

**현재 재고 수준:**
${inventoryLevels.map((inv: any) => `- 제품 ID ${inv.productId}: ${inv.totalQuantity}`).join("\n")}

**원재료 재고:**
${materialInventory.map((mat: any) => `- 원재료 ID ${mat.materialId}: ${mat.totalQuantity}`).join("\n")}

**계획된 배치 (${plannedBatches.length}건):**
${plannedBatches
  .map(
    (batch: any) =>
      `- 배치 ${batch.batchCode}: 제품 ID ${batch.productId}, 계획 수량 ${batch.plannedQuantity}, 계획일 ${batch.plannedDate}`
  )
  .join("\n")}

다음 기준으로 생산 우선순위를 결정하고 최적화된 일정을 제안해주세요:
1. 재고가 부족한 제품 우선 생산
2. 납기일이 임박한 배치 우선 처리
3. 원재료 재고 가용성 고려
4. 설비 가용성 및 생산 효율 고려

응답 형식:
{
  "prioritizedBatches": [
    {
      "batchId": 배치ID,
      "priority": 우선순위(1-5),
      "reason": "우선순위 이유",
      "suggestedStartTime": "제안 시작 시각 (ISO 8601)",
      "estimatedDuration": 예상 소요 시간(분)
    }
  ],
  "warnings": [
    {
      "type": "재고 부족" | "원재료 부족" | "설비 충돌",
      "message": "경고 메시지"
    }
  ],
  "recommendations": [
    "추천 사항 1",
    "추천 사항 2"
  ]
}
`;

  const llmResponse = await invokeLLM({
    messages: [
      {
        role: "system",
        content:
          "당신은 생산 일정 최적화 전문가입니다. 재고 수준, 납기일, 원재료 가용성을 고려하여 최적의 생산 일정을 제안합니다.",
      },
      { role: "user", content: optimizationPrompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "production_schedule_optimization",
        strict: true,
        schema: {
          type: "object",
          properties: {
            prioritizedBatches: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  batchId: { type: "number" },
                  priority: { type: "number" },
                  reason: { type: "string" },
                  suggestedStartTime: { type: "string" },
                  estimatedDuration: { type: "number" },
                },
                required: ["batchId", "priority", "reason", "suggestedStartTime", "estimatedDuration"],
                additionalProperties: false,
              },
            },
            warnings: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  type: { type: "string" },
                  message: { type: "string" },
                },
                required: ["type", "message"],
                additionalProperties: false,
              },
            },
            recommendations: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: ["prioritizedBatches", "warnings", "recommendations"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = llmResponse.choices[0].message.content;
  const optimizationResult = JSON.parse(typeof content === "string" ? content : "{}");

  return {
    inventoryLevels,
    materialInventory,
    plannedBatches,
    optimization: optimizationResult,
  };
}

/**
 * 재고 수준 기반 생산 우선순위 계산
 */
export async function calculateProductionPriority(tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 재고가 부족한 제품 조회 (안전 재고 대비)
  const lowStockProducts = await db
    .select({
      productId: hInventoryLots.productId,
      totalQuantity: sql<string>`SUM(${hInventoryLots.availableQuantity})`,
    })
    .from(hInventoryLots)
    .where(eq(hInventoryLots.status, "available"))
    .groupBy(hInventoryLots.productId);

  return lowStockProducts.map((product: any) => ({
    productId: product.productId,
    currentStock: parseFloat(product.totalQuantity || "0"),
    priority: calculatePriority(parseFloat(product.totalQuantity || "0"), 100), // 기본 안전 재고 100
  }));
}

function calculatePriority(currentStock: number, safetyStock: number): number {
  if (currentStock <= 0) return 5; // 긴급
  const ratio = currentStock / safetyStock;
  if (ratio < 0.2) return 5; // 긴급
  if (ratio < 0.4) return 4; // 높음
  if (ratio < 0.6) return 3; // 중간
  if (ratio < 0.8) return 2; // 낮음
  return 1; // 정상
}

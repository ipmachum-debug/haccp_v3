import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { invokeLLM } from "../_core/llm";

/**
 * 원재료 가격 변동 추이 분석
 */
export async function analyzePriceTrend(
  materialId: number,
  startDate: Date,
  endDate: Date
) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  // 원재료 정보 조회
  const materialQuery = sql`
    SELECT id, material_code, material_name, unit_price
    FROM h_materials
    WHERE id = ${materialId}
  `;
  const materialResult: any = await db.execute(materialQuery);
  if (!materialResult || materialResult.length === 0) {
    return null;
  }
  const material = materialResult[0];

  // 가격 이력 조회
  const priceHistoryQuery = sql`
    SELECT new_price, changed_at
    FROM h_material_price_history
    WHERE material_id = ${materialId}
      AND changed_at >= ${startDate}
      AND changed_at <= ${endDate}
    ORDER BY changed_at ASC
  `;
  const priceHistory: any = await db.execute(priceHistoryQuery);

  const priceChanges = (priceHistory || []).map((row: any) => ({
    price: Number(row.new_price),
    date: new Date(row.changed_at)
  }));

  const prices = priceChanges.map((pc: { price: number; date: Date }) => pc.price);
  const avgPrice = prices.length > 0 ? prices.reduce((a: number, b: number) => a + b, 0) / prices.length : 0;
  const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;

  // 추세 판단
  let trend: "increasing" | "decreasing" | "stable" = "stable";
  if (prices.length >= 2) {
    const firstHalf = prices.slice(0, Math.floor(prices.length / 2));
    const secondHalf = prices.slice(Math.floor(prices.length / 2));
    const avgFirst = firstHalf.reduce((a: number, b: number) => a + b, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((a: number, b: number) => a + b, 0) / secondHalf.length;
    if (avgSecond > avgFirst * 1.1) trend = "increasing";
    else if (avgSecond < avgFirst * 0.9) trend = "decreasing";
  }

  return {
    materialId,
    materialCode: material.material_code,
    materialName: material.material_name,
    currentPrice: Number(material.unit_price),
    avgPrice,
    minPrice,
    maxPrice,
    priceChanges,
    trend
  };
}

/**
 * 최적 구매 시점 추천
 */
export async function recommendPurchaseTiming(materialId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  // 최근 30일 가격 추이 조회
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);

  const priceTrend = await analyzePriceTrend(materialId, startDate, endDate);
  if (!priceTrend) return null;

  let recommendedAction: "buy_now" | "wait" | "monitor" = "monitor";
  let reason = "";
  let estimatedSavings = 0;

  if (priceTrend.trend === "decreasing") {
    recommendedAction = "wait";
    reason = "가격이 하락 추세입니다. 조금 더 기다리면 더 낮은 가격에 구매할 수 있습니다.";
    estimatedSavings = (priceTrend.currentPrice - priceTrend.minPrice) * 100; // 예상 절감액 (100kg 기준)
  } else if (priceTrend.trend === "increasing") {
    recommendedAction = "buy_now";
    reason = "가격이 상승 추세입니다. 지금 구매하는 것이 유리합니다.";
    estimatedSavings = 0;
  } else {
    recommendedAction = "monitor";
    reason = "가격이 안정적입니다. 필요에 따라 구매하세요.";
    estimatedSavings = 0;
  }

  return {
    materialId,
    materialCode: priceTrend.materialCode,
    materialName: priceTrend.materialName,
    currentPrice: priceTrend.currentPrice,
    recommendedAction,
    reason,
    estimatedSavings
  };
}

/**
 * 대체 공급업체 추천
 */
export async function recommendAlternativeSuppliers(materialId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  // 원재료 정보 조회
  const materialQuery = sql`
    SELECT id, material_code, material_name, unit_price
    FROM h_materials
    WHERE id = ${materialId}
  `;
  const materialResult: any = await db.execute(materialQuery);
  if (!materialResult || materialResult.length === 0) {
    return null;
  }
  const material = materialResult[0];

  // 공급업체 조회 (간단한 예시)
  const supplierQuery = sql`
    SELECT id, supplier_code, supplier_name, contact_person, phone
    FROM h_suppliers
    WHERE is_active = 1
    LIMIT 5
  `;
  const suppliers: any = await db.execute(supplierQuery);

  return {
    materialId,
    materialCode: material.material_code,
    materialName: material.material_name,
    currentPrice: Number(material.unit_price),
    alternativeSuppliers: (suppliers || []).map((s: any) => ({
      supplierId: s.id,
      supplierCode: s.supplier_code,
      supplierName: s.supplier_name,
      contactPerson: s.contact_person,
      phone: s.phone,
      estimatedPrice: Number(material.unit_price) * 0.95, // 예시: 5% 할인
      estimatedSavings: Number(material.unit_price) * 0.05 * 100, // 100kg 기준
    }))
  };
}

/**
 * AI 기반 원가 절감 제안 생성
 */
export async function generateCostSavingProposal(materialId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  // 원재료 정보 조회
  const materialQuery = sql`
    SELECT id, material_code, material_name, unit_price
    FROM h_materials
    WHERE id = ${materialId}
  `;
  const materialResult: any = await db.execute(materialQuery);
  if (!materialResult || materialResult.length === 0) {
    return null;
  }
  const material = materialResult[0];

  // 가격 추이 분석
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 90);
  const priceTrend = await analyzePriceTrend(materialId, startDate, endDate);

  // 구매 시점 추천
  const purchaseTiming = await recommendPurchaseTiming(materialId);

  // AI 인사이트 생성
  const aiPrompt = `
원재료 정보:
- 이름: ${material.material_name}
- 현재 가격: ${material.unit_price}원
- 평균 가격: ${priceTrend?.avgPrice || 0}원
- 최저 가격: ${priceTrend?.minPrice || 0}원
- 최고 가격: ${priceTrend?.maxPrice || 0}원
- 가격 추세: ${priceTrend?.trend || "stable"}

위 정보를 바탕으로 원가 절감을 위한 구체적인 제안을 3가지 이상 작성해주세요. 각 제안은 실행 가능하고 구체적이어야 합니다.
`;

  const aiResponse = await invokeLLM({
    messages: [
      { role: "system", content: "당신은 식품 제조업체의 원가 절감 전문가입니다." },
      { role: "user", content: aiPrompt },
    ]
  });

  const aiInsights = aiResponse.choices[0]?.message?.content || "AI 인사이트를 생성할 수 없습니다.";

  // 제안 액션 생성
  const proposedActions = [];
  if (purchaseTiming?.recommendedAction === "buy_now") {
    proposedActions.push({
      action: "immediate_purchase",
      description: "가격 상승 전 대량 구매",
      estimatedSavings: purchaseTiming.estimatedSavings,
      priority: "high" as const
    });
  } else if (purchaseTiming?.recommendedAction === "wait") {
    proposedActions.push({
      action: "delayed_purchase",
      description: "가격 하락 대기 후 구매",
      estimatedSavings: purchaseTiming.estimatedSavings,
      priority: "medium" as const
    });
  }

  proposedActions.push({
    action: "alternative_supplier",
    description: "대체 공급업체 검토",
    estimatedSavings: Number(material.unit_price) * 0.05 * 100,
    priority: "medium" as const
  });

  const totalEstimatedSavings = proposedActions.reduce((sum: number, action) => sum + action.estimatedSavings, 0);

  return {
    materialId,
    materialCode: material.material_code,
    materialName: material.material_name,
    currentCost: Number(material.unit_price),
    proposedActions,
    totalEstimatedSavings,
    aiInsights
  };
}

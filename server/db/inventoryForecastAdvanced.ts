import { eq, and, gte, sql } from "drizzle-orm";
import { getDb } from "../db";
import { hInventory, hInventoryTransactions, hInventoryLots, hMaterials } from "../../drizzle/schema";
import { invokeLLM } from "../_core/llm";

/**
 * 고도화된 재고 예측: 계절성, 요일별 패턴, 특정 이벤트를 고려한 머신러닝 기반 예측
 */

interface UsagePattern {
  date: Date;
  dayOfWeek: number; // 0 (일요일) ~ 6 (토요일)
  month: number; // 1 ~ 12
  quantity: number;
  isHoliday: boolean;
}

interface SeasonalityFactor {
  month: number;
  factor: number; // 평균 대비 배수 (1.0 = 평균, 1.5 = 평균의 1.5배)
}

interface DayOfWeekFactor {
  dayOfWeek: number;
  factor: number;
}

/**
 * 한국 공휴일 확인 (간단한 버전)
 */
function isKoreanHoliday(date: Date): boolean {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  
  // 주요 공휴일 (고정)
  const fixedHolidays = [
    { month: 1, day: 1 },   // 신정
    { month: 3, day: 1 },   // 삼일절
    { month: 5, day: 5 },   // 어린이날
    { month: 6, day: 6 },   // 현충일
    { month: 8, day: 15 },  // 광복절
    { month: 10, day: 3 },  // 개천절
    { month: 10, day: 9 },  // 한글날
    { month: 12, day: 25 }, // 크리스마스
  ];
  
  return fixedHolidays.some(h => h.month === month && h.day === day);
}

/**
 * 과거 사용 패턴 분석
 */
async function analyzeUsagePatterns(materialId: number, days: number = 90): Promise<UsagePattern[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - days);

  const usageRecords = await db
    .select({
      quantity: hInventoryTransactions.quantity,
      createdAt: hInventoryTransactions.createdAt
    })
    .from(hInventoryTransactions)
    .leftJoin(hInventoryLots, eq(hInventoryTransactions.lotId, hInventoryLots.id))
    .where(
      and(
        eq(hInventoryTransactions.transactionType, "usage"),
        eq(hInventoryLots.materialId, materialId),
        gte(hInventoryTransactions.createdAt, pastDate)
      )
    );

  return usageRecords.map(record => {
    const date = new Date(record.createdAt);
    return {
      date,
      dayOfWeek: date.getDay(),
      month: date.getMonth() + 1,
      quantity: Number(record.quantity || 0),
      isHoliday: isKoreanHoliday(date)
    };
  });
}

/**
 * 계절성 분석 (월별 소비 패턴)
 */
function calculateSeasonalityFactors(patterns: UsagePattern[]): SeasonalityFactor[] {
  // 월별 총 사용량 집계
  const monthlyUsage: { [month: number]: number } = {};
  const monthlyCounts: { [month: number]: number } = {};
  
  patterns.forEach(p => {
    monthlyUsage[p.month] = (monthlyUsage[p.month] || 0) + p.quantity;
    monthlyCounts[p.month] = (monthlyCounts[p.month] || 0) + 1;
  });

  // 월별 평균 사용량 계산
  const monthlyAvg: { [month: number]: number } = {};
  Object.keys(monthlyUsage).forEach(month => {
    const m = Number(month);
    monthlyAvg[m] = monthlyUsage[m] / (monthlyCounts[m] || 1);
  });

  // 전체 평균 계산
  const totalAvg = Object.values(monthlyAvg).reduce((sum, val) => sum + val, 0) / Object.keys(monthlyAvg).length;

  // 계절성 팩터 계산 (평균 대비 배수)
  const factors: SeasonalityFactor[] = [];
  for (let month = 1; month <= 12; month++) {
    factors.push({
      month,
      factor: monthlyAvg[month] ? monthlyAvg[month] / totalAvg : 1.0
    });
  }

  return factors;
}

/**
 * 요일별 패턴 분석
 */
function calculateDayOfWeekFactors(patterns: UsagePattern[]): DayOfWeekFactor[] {
  // 요일별 총 사용량 집계
  const dailyUsage: { [day: number]: number } = {};
  const dailyCounts: { [day: number]: number } = {};
  
  patterns.forEach(p => {
    dailyUsage[p.dayOfWeek] = (dailyUsage[p.dayOfWeek] || 0) + p.quantity;
    dailyCounts[p.dayOfWeek] = (dailyCounts[p.dayOfWeek] || 0) + 1;
  });

  // 요일별 평균 사용량 계산
  const dailyAvg: { [day: number]: number } = {};
  Object.keys(dailyUsage).forEach(day => {
    const d = Number(day);
    dailyAvg[d] = dailyUsage[d] / (dailyCounts[d] || 1);
  });

  // 전체 평균 계산
  const totalAvg = Object.values(dailyAvg).reduce((sum, val) => sum + val, 0) / Object.keys(dailyAvg).length;

  // 요일별 팩터 계산
  const factors: DayOfWeekFactor[] = [];
  for (let day = 0; day <= 6; day++) {
    factors.push({
      dayOfWeek: day,
      factor: dailyAvg[day] ? dailyAvg[day] / totalAvg : 1.0
    });
  }

  return factors;
}

/**
 * 공휴일 영향 분석
 */
function calculateHolidayFactor(patterns: UsagePattern[]): number {
  const holidayUsage = patterns.filter(p => p.isHoliday);
  const normalUsage = patterns.filter(p => !p.isHoliday);

  if (holidayUsage.length === 0 || normalUsage.length === 0) return 1.0;

  const holidayAvg = holidayUsage.reduce((sum, p) => sum + p.quantity, 0) / holidayUsage.length;
  const normalAvg = normalUsage.reduce((sum, p) => sum + p.quantity, 0) / normalUsage.length;

  return normalAvg > 0 ? holidayAvg / normalAvg : 1.0;
}

/**
 * LLM 기반 예측 보정
 */
async function getLLMPredictionAdjustment(
  materialName: string,
  currentMonth: number,
  patterns: UsagePattern[]
): Promise<{ adjustmentFactor: number; reasoning: string }> {
  try {
    const patternSummary = {
      totalRecords: patterns.length,
      avgDailyUsage: patterns.reduce((sum, p) => sum + p.quantity, 0) / patterns.length,
      recentTrend: patterns.slice(-30).reduce((sum, p) => sum + p.quantity, 0) / 30
    };

    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: "당신은 식품 제조업의 재고 관리 전문가입니다. 원재료의 과거 사용 패턴을 분석하여 향후 소비 예측을 보정하는 역할을 합니다."
        },
        {
          role: "user",
          content: `원재료: ${materialName}
현재 월: ${currentMonth}월
과거 사용 패턴:
- 총 기록 수: ${patternSummary.totalRecords}개
- 평균 일일 사용량: ${patternSummary.avgDailyUsage.toFixed(2)}
- 최근 30일 평균: ${patternSummary.recentTrend.toFixed(2)}

위 정보를 바탕으로 향후 30일간의 소비 예측을 보정하기 위한 조정 계수(0.5 ~ 2.0)와 그 이유를 제공해주세요.
JSON 형식으로 응답: { "adjustmentFactor": 1.0, "reasoning": "이유" }`
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "prediction_adjustment",
          strict: true,
          schema: {
            type: "object",
            properties: {
              adjustmentFactor: {
                type: "number",
                description: "예측 보정 계수 (0.5 ~ 2.0)"
              },
              reasoning: {
                type: "string",
                description: "보정 이유"
              }
            },
            required: ["adjustmentFactor", "reasoning"],
            additionalProperties: false
          }
        }
      }
    });

    const content = response.choices[0].message.content;
    const contentStr = typeof content === 'string' ? content : '{}';
    const result = JSON.parse(contentStr);
    return {
      adjustmentFactor: Math.max(0.5, Math.min(2.0, result.adjustmentFactor || 1.0)),
      reasoning: result.reasoning || "보정 없음"
    };
  } catch (error) {
    console.error("LLM prediction adjustment failed:", error);
    return { adjustmentFactor: 1.0, reasoning: "LLM 예측 실패, 기본값 사용" };
  }
}

/**
 * 고도화된 재고 예측
 */
export async function getAdvancedInventoryForecast(days: number = 90, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 원재료별 현재 재고 조회
  const materials = await db
    .select()
    .from(hInventory)
    .leftJoin(hMaterials, eq(hInventory.materialId, hMaterials.id));

  const forecasts = await Promise.all(
    materials.map(async (row) => {
      const material = row.h_inventory;
      const materialInfo = row.h_materials;
      
      if (!material || !materialInfo || !material.materialId) return null;

      try {
        // 1. 과거 사용 패턴 분석
        const patterns = await analyzeUsagePatterns(material.materialId, days);
        
        if (patterns.length === 0) {
          // 데이터가 없으면 기본 예측 반환
          return {
            materialId: material.materialId,
            materialName: materialInfo.materialName,
            currentStock: Number(material.totalQuantity),
            safetyStock: Number(materialInfo.safetyStockLevel || 0),
            unit: materialInfo.unit,
            avgDailyUsage: 0,
            daysUntilDepletion: 999,
            depletionDate: null,
            status: "normal",
            confidence: 0,
            seasonalityFactor: 1.0,
            dayOfWeekFactor: 1.0,
            holidayFactor: 1.0,
            llmAdjustment: 1.0,
            llmReasoning: "과거 데이터 부족"
          };
        }

        // 2. 기본 일평균 사용량 계산
        const totalUsed = patterns.reduce((sum, p) => sum + p.quantity, 0);
        const baseAvgDailyUsage = totalUsed / days;

        // 3. 계절성 분석
        const seasonalityFactors = calculateSeasonalityFactors(patterns);
        const currentMonth = new Date().getMonth() + 1;
        const seasonalityFactor = seasonalityFactors.find(f => f.month === currentMonth)?.factor || 1.0;

        // 4. 요일별 패턴 분석
        const dayOfWeekFactors = calculateDayOfWeekFactors(patterns);
        const currentDayOfWeek = new Date().getDay();
        const dayOfWeekFactor = dayOfWeekFactors.find(f => f.dayOfWeek === currentDayOfWeek)?.factor || 1.0;

        // 5. 공휴일 영향 분석
        const holidayFactor = calculateHolidayFactor(patterns);

        // 6. LLM 기반 예측 보정
        const llmAdjustment = await getLLMPredictionAdjustment(
          materialInfo.materialName,
          currentMonth,
          patterns
        );

        // 7. 최종 예측 사용량 계산
        const adjustedAvgDailyUsage = baseAvgDailyUsage * seasonalityFactor * llmAdjustment.adjustmentFactor;

        // 8. 소진 예상 일수 계산
        const daysUntilDepletion =
          adjustedAvgDailyUsage > 0
            ? Math.floor(Number(material.totalQuantity) / adjustedAvgDailyUsage)
            : 999;

        // 9. 소진 예상 날짜
        const depletionDate = new Date();
        depletionDate.setDate(depletionDate.getDate() + daysUntilDepletion);

        // 10. 신뢰도 계산 (데이터 양과 패턴 일관성 기반)
        const confidence = Math.min(100, (patterns.length / days) * 100);

        return {
          materialId: material.materialId,
          materialName: materialInfo.materialName,
          currentStock: Number(material.totalQuantity),
          safetyStock: Number(materialInfo.safetyStockLevel || 0),
          unit: materialInfo.unit,
          avgDailyUsage: Math.round(adjustedAvgDailyUsage * 100) / 100,
          baseAvgDailyUsage: Math.round(baseAvgDailyUsage * 100) / 100,
          daysUntilDepletion,
          depletionDate: daysUntilDepletion < 999 ? depletionDate : null,
          status:
            daysUntilDepletion <= 7
              ? "critical"
              : daysUntilDepletion <= 14
              ? "warning"
              : "normal",
          confidence: Math.round(confidence),
          seasonalityFactor: Math.round(seasonalityFactor * 100) / 100,
          dayOfWeekFactor: Math.round(dayOfWeekFactor * 100) / 100,
          holidayFactor: Math.round(holidayFactor * 100) / 100,
          llmAdjustment: Math.round(llmAdjustment.adjustmentFactor * 100) / 100,
          llmReasoning: llmAdjustment.reasoning
        };
      } catch (error) {
        console.error(`Error forecasting for material ${material.materialId}:`, error);
        return null;
      }
    })
  );

  return forecasts
    .filter((f) => f !== null)
    .sort((a, b) => a!.daysUntilDepletion - b!.daysUntilDepletion);
}

/**
 * 고도화된 발주 제안
 */
export async function getAdvancedPurchaseRecommendations(tenantId?: number) {
  const forecasts = await getAdvancedInventoryForecast(90);

  // 14일 이내 소진 예상 또는 안전 재고 이하인 원재료
  const recommendations = forecasts
    .filter(
      (f) =>
        f && (f.daysUntilDepletion <= 14 || f.currentStock <= f.safetyStock)
    )
    .map((f) => {
      if (!f) return null;
      
      // 발주 권장 수량: 30일치 사용량 + 안전 재고
      const recommendedQuantity = Math.ceil(
        f.avgDailyUsage * 30 + f.safetyStock - f.currentStock
      );

      return {
        ...f,
        recommendedQuantity: Math.max(0, recommendedQuantity),
        reason:
          f.currentStock <= f.safetyStock
            ? "안전 재고 이하"
            : `${f.daysUntilDepletion}일 후 소진 예상`
      };
    })
    .filter((r) => r !== null);

  return recommendations;
}

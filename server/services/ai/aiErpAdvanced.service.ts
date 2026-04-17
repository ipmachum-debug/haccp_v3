/**
 * AI ERP 2순위 서비스 — 발주추천 + 재고예측 + 원가이상탐지
 */
import { invokeLLM } from "../../_core/llm";
import { getPool } from "../../db/pool";

// ═══════════════════════════════════════
// 1. 발주 추천 (사용량 + 안전재고 기반)
// ═══════════════════════════════════════

export interface PurchaseRecommendation {
  materialId: number;
  materialName: string;
  materialCode: string;
  currentStock: number;
  safetyStock: number;
  avgDailyUsage: number;
  daysUntilShortage: number;
  recommendedQty: number;
  urgency: "urgent" | "soon" | "normal";
  reason: string;
}

export async function generatePurchaseRecommendations(tenantId: number): Promise<PurchaseRecommendation[]> {
  const pool = getPool();
  try {
    // 원재료별: 현재고 + 안전재고 + 30일 평균 사용량
    const [rows]: any = await pool.execute(
      `SELECT
         im.id, im.item_name, im.item_code,
         COALESCE(SUM(CASE WHEN il.status = 'available' THEN CAST(il.available_quantity AS DECIMAL(15,3)) ELSE 0 END), 0) as current_stock,
         COALESCE(hm.safety_stock_level, 0) as safety_stock,
         COALESCE((
           SELECT SUM(CAST(ht.quantity AS DECIMAL(15,3))) / 30
           FROM h_inventory_transactions ht
           WHERE ht.tenant_id = ? AND ht.lot_id IN (
             SELECT id FROM h_inventory_lots WHERE material_id = im.id AND tenant_id = ?
           ) AND ht.transaction_type IN ('usage','outbound')
           AND ht.transaction_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
         ), 0) as avg_daily_usage
       FROM item_master im
       LEFT JOIN h_inventory_lots il ON im.id = il.material_id AND il.tenant_id = ?
       LEFT JOIN h_materials hm ON im.legacy_material_id = hm.id
       WHERE im.tenant_id = ? AND im.item_type IN ('raw_material', 'subsidiary') AND im.is_active = 1
       GROUP BY im.id, im.item_name, im.item_code, hm.safety_stock_level`,
      [tenantId, tenantId, tenantId, tenantId],
    );

    return (rows as any[])
      .map((r: any) => {
        const current = Number(r.current_stock || 0);
        const safety = Number(r.safety_stock || 0);
        const dailyUsage = Number(r.avg_daily_usage || 0);
        const daysLeft = dailyUsage > 0 ? Math.floor(current / dailyUsage) : 999;
        const shortfall = Math.max(0, safety - current);
        const recommendedQty = dailyUsage > 0
          ? Math.ceil(dailyUsage * 14) + shortfall // 2주분 + 부족분
          : shortfall > 0 ? shortfall : 0;

        if (recommendedQty <= 0) return null;

        return {
          materialId: r.id,
          materialName: r.item_name,
          materialCode: r.item_code,
          currentStock: current,
          safetyStock: safety,
          avgDailyUsage: Math.round(dailyUsage * 100) / 100,
          daysUntilShortage: daysLeft,
          recommendedQty: Math.round(recommendedQty),
          urgency: daysLeft <= 3 ? "urgent" : daysLeft <= 7 ? "soon" : "normal",
          reason: daysLeft <= 3 ? `${daysLeft}일 내 소진 예상` : daysLeft <= 7 ? `${daysLeft}일 내 부족` : `안전재고 미달 (${shortfall})`,
        } as PurchaseRecommendation;
      })
      .filter(Boolean) as PurchaseRecommendation[];
  } catch (err: any) {
    console.error("[AI purchaseRecommend]", err.message?.substring(0, 80));
    return [];
  }
}

// ═══════════════════════════════════════
// 2. 재고 부족 예측
// ═══════════════════════════════════════

export interface ShortagePrediiction {
  materialId: number;
  materialName: string;
  currentStock: number;
  predictedShortageDate: string;
  daysRemaining: number;
  avgDailyUsage: number;
  confidence: number;
}

export async function predictInventoryShortages(tenantId: number, horizonDays: number = 30): Promise<ShortagePrediiction[]> {
  const pool = getPool();
  try {
    const [rows]: any = await pool.execute(
      `SELECT
         im.id, im.item_name,
         COALESCE(SUM(CASE WHEN il.status = 'available' THEN CAST(il.available_quantity AS DECIMAL(15,3)) ELSE 0 END), 0) as stock,
         COALESCE((
           SELECT SUM(CAST(ht.quantity AS DECIMAL(15,3))) / 30
           FROM h_inventory_transactions ht
           WHERE ht.tenant_id = ? AND ht.lot_id IN (
             SELECT id FROM h_inventory_lots WHERE material_id = im.id AND tenant_id = ?
           ) AND ht.transaction_type IN ('usage','outbound')
           AND ht.transaction_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
         ), 0) as daily_usage
       FROM item_master im
       LEFT JOIN h_inventory_lots il ON im.id = il.material_id AND il.tenant_id = ?
       WHERE im.tenant_id = ? AND im.item_type = 'raw_material' AND im.is_active = 1
       GROUP BY im.id, im.item_name
       HAVING stock > 0 AND daily_usage > 0`,
      [tenantId, tenantId, tenantId, tenantId],
    );

    return (rows as any[])
      .map((r: any) => {
        const stock = Number(r.stock);
        const daily = Number(r.daily_usage);
        const daysLeft = Math.floor(stock / daily);
        if (daysLeft > horizonDays) return null;

        const shortageDate = new Date();
        shortageDate.setDate(shortageDate.getDate() + daysLeft);

        return {
          materialId: r.id,
          materialName: r.item_name,
          currentStock: stock,
          predictedShortageDate: shortageDate.toISOString().slice(0, 10),
          daysRemaining: daysLeft,
          avgDailyUsage: Math.round(daily * 100) / 100,
          confidence: daysLeft <= 7 ? 90 : daysLeft <= 14 ? 75 : 60,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => a.daysRemaining - b.daysRemaining) as ShortagePrediiction[];
  } catch (err: any) {
    console.error("[AI shortagePredict]", err.message?.substring(0, 80));
    return [];
  }
}

// ═══════════════════════════════════════
// 3. 원가 이상 탐지
// ═══════════════════════════════════════

export interface CostAnomaly {
  type: "price_spike" | "usage_spike" | "margin_drop";
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  materialName?: string;
  currentValue: number;
  expectedValue: number;
  deviationPct: number;
}

export async function detectCostAnomalies(tenantId: number): Promise<CostAnomaly[]> {
  const pool = getPool();
  const anomalies: CostAnomaly[] = [];

  try {
    // 단가 급등 탐지: 최근 매입 단가 vs 이전 3개월 평균
    const [priceRows]: any = await pool.execute(
      `SELECT
         ap.item_name,
         CAST(ap.unit_price AS DECIMAL(15,2)) as recent_price,
         (SELECT AVG(CAST(ap2.unit_price AS DECIMAL(15,2)))
          FROM accounting_purchases ap2
          WHERE ap2.tenant_id = ? AND ap2.item_name = ap.item_name
            AND ap2.status != 'cancelled'
            AND ap2.transaction_date >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
            AND ap2.transaction_date < DATE_SUB(CURDATE(), INTERVAL 7 DAY)
         ) as avg_price
       FROM accounting_purchases ap
       WHERE ap.tenant_id = ? AND ap.status != 'cancelled'
         AND ap.transaction_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
       GROUP BY ap.item_name, ap.unit_price
       HAVING avg_price > 0`,
      [tenantId, tenantId],
    );

    for (const r of priceRows as any[]) {
      const recent = Number(r.recent_price);
      const avg = Number(r.avg_price);
      const pct = Math.round(((recent - avg) / avg) * 100);
      if (pct > 15) {
        anomalies.push({
          type: "price_spike",
          severity: pct > 30 ? "high" : "medium",
          title: `${r.item_name} 단가 ${pct}% 상승`,
          description: `최근 ₩${recent.toLocaleString()} vs 평균 ₩${avg.toLocaleString()}`,
          materialName: r.item_name,
          currentValue: recent,
          expectedValue: avg,
          deviationPct: pct,
        });
      }
    }
  } catch (_) {}

  try {
    // 매출원가율 변동 탐지
    const [marginRows]: any = await pool.execute(
      `SELECT
         DATE_FORMAT(e.entry_date, '%Y-%m') as ym,
         SUM(CASE WHEN l.account_code LIKE '5%' THEN l.debit_amount ELSE 0 END) as cost,
         SUM(CASE WHEN l.account_code LIKE '4%' THEN l.credit_amount ELSE 0 END) as revenue
       FROM expense_journal_lines l
       JOIN expense_journal_entries e ON l.journal_entry_id = e.id
       WHERE l.tenant_id = ? AND e.entry_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
       GROUP BY DATE_FORMAT(e.entry_date, '%Y-%m')
       ORDER BY ym DESC LIMIT 6`,
      [tenantId],
    );

    const margins = (marginRows as any[]).map((r: any) => ({
      month: r.ym,
      costRatio: Number(r.revenue) > 0 ? Math.round((Number(r.cost) / Number(r.revenue)) * 100) : 0,
    }));

    if (margins.length >= 2) {
      const current = margins[0]?.costRatio || 0;
      const prev = margins[1]?.costRatio || 0;
      const diff = current - prev;
      if (diff > 5) {
        anomalies.push({
          type: "margin_drop",
          severity: diff > 10 ? "high" : "medium",
          title: `매출원가율 ${diff}%p 상승 (${margins[0]?.month})`,
          description: `${prev}% → ${current}% (전월 대비)`,
          currentValue: current,
          expectedValue: prev,
          deviationPct: diff,
        });
      }
    }
  } catch (_) {}

  return anomalies.sort((a, b) => (a.severity === "high" ? -1 : b.severity === "high" ? 1 : 0));
}

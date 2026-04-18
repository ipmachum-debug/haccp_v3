/**
 * 대표용 AI 리포트 — 월간/주간 경영 요약
 *
 * 매출/원가/이익 + 전월 비교 + 위험요소 + 추천 액션
 */
import { invokeLLM } from "../../_core/llm";
import { getPool } from "../../db/pool";
import { logWarn } from "../../utils/logger";

export interface ExecutiveReport {
  period: string;
  summary: string;
  metrics: {
    revenue: number;
    cost: number;
    grossProfit: number;
    grossMargin: number;
    expenses: number;
    netProfit: number;
    prevRevenue: number;
    prevNetProfit: number;
    revenueGrowth: number;
    profitGrowth: number;
  };
  highlights: string[];
  risks: string[];
  actions: string[];
  aiNarrative: string;
}

export async function generateExecutiveReport(
  tenantId: number,
  year: number,
  month: number,
): Promise<ExecutiveReport> {
  const pool = getPool();
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = `${year}-${String(month).padStart(2, "0")}-31`;
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const prevStart = `${prevYear}-${String(prevMonth).padStart(2, "0")}-01`;
  const prevEnd = `${prevYear}-${String(prevMonth).padStart(2, "0")}-31`;

  const fmt = (n: number) => `₩${n.toLocaleString()}`;

  // 데이터 수집
  let revenue = 0, cost = 0, expenses = 0;
  let prevRevenue = 0, prevCost = 0, prevExpenses = 0;
  const failedSources: string[] = [];

  try {
    const [salesRows]: any = await pool.execute(
      `SELECT COALESCE(SUM(CAST(total_amount AS DECIMAL(15,2))), 0) as total
       FROM accounting_sales WHERE tenant_id = ? AND status != 'cancelled'
       AND transaction_date >= ? AND transaction_date <= ?`,
      [tenantId, startDate, endDate]);
    revenue = Number(salesRows[0]?.total || 0);

    const [prevSalesRows]: any = await pool.execute(
      `SELECT COALESCE(SUM(CAST(total_amount AS DECIMAL(15,2))), 0) as total
       FROM accounting_sales WHERE tenant_id = ? AND status != 'cancelled'
       AND transaction_date >= ? AND transaction_date <= ?`,
      [tenantId, prevStart, prevEnd]);
    prevRevenue = Number(prevSalesRows[0]?.total || 0);
  } catch (err) {
    failedSources.push("sales");
    logWarn("경영리포트: 매출 데이터 조회 실패", { tenantId, operation: "generateExecutiveReport", error: String(err) });
  }

  try {
    const [costRows]: any = await pool.execute(
      `SELECT COALESCE(SUM(CAST(total_amount AS DECIMAL(15,2))), 0) as total
       FROM accounting_purchases WHERE tenant_id = ? AND status != 'cancelled'
       AND transaction_date >= ? AND transaction_date <= ?`,
      [tenantId, startDate, endDate]);
    cost = Number(costRows[0]?.total || 0);

    const [prevCostRows]: any = await pool.execute(
      `SELECT COALESCE(SUM(CAST(total_amount AS DECIMAL(15,2))), 0) as total
       FROM accounting_purchases WHERE tenant_id = ? AND status != 'cancelled'
       AND transaction_date >= ? AND transaction_date <= ?`,
      [tenantId, prevStart, prevEnd]);
    prevCost = Number(prevCostRows[0]?.total || 0);
  } catch (err) {
    failedSources.push("purchases");
    logWarn("경영리포트: 매입 데이터 조회 실패", { tenantId, operation: "generateExecutiveReport", error: String(err) });
  }

  try {
    const [expRows]: any = await pool.execute(
      `SELECT COALESCE(SUM(CAST(l.debit_amount AS DECIMAL(15,2))), 0) as total
       FROM expense_journal_lines l
       JOIN expense_journal_entries e ON l.journal_entry_id = e.id AND e.tenant_id = l.tenant_id
       WHERE l.tenant_id = ? AND l.account_code LIKE '8%'
       AND e.entry_date >= ? AND e.entry_date <= ?`,
      [tenantId, startDate, endDate]);
    expenses = Number(expRows[0]?.total || 0);
  } catch (err) {
    failedSources.push("expenses");
    logWarn("경영리포트: 판관비 데이터 조회 실패", { tenantId, operation: "generateExecutiveReport", error: String(err) });
  }

  const grossProfit = revenue - cost;
  const grossMargin = revenue > 0 ? Math.round((grossProfit / revenue) * 100) : 0;
  const netProfit = grossProfit - expenses;
  const prevNetProfit = prevRevenue - prevCost - prevExpenses;
  const revenueGrowth = prevRevenue > 0 ? Math.round(((revenue - prevRevenue) / prevRevenue) * 100) : 0;
  const profitGrowth = prevNetProfit > 0 ? Math.round(((netProfit - prevNetProfit) / prevNetProfit) * 100) : 0;

  // LLM 경영 해설
  let aiNarrative = "";
  const highlights: string[] = [];
  const risks: string[] = [];
  const actions: string[] = [];

  try {
    const result = await invokeLLM({
      messages: [{
        role: "system",
        content: `중소기업 경영 컨설턴트. 대표에게 월간 경영 현황을 설명합니다.
JSON: {"narrative":"3~4문장 해설","highlights":["좋은 점"],"risks":["위험"],"actions":["추천 조치"]}`,
      }, {
        role: "user",
        content: `${year}년 ${month}월 경영 현황:
매출: ${fmt(revenue)} (전월 ${fmt(prevRevenue)}, ${revenueGrowth > 0 ? "+" : ""}${revenueGrowth}%)
매입(원가): ${fmt(cost)}
매출총이익: ${fmt(grossProfit)} (마진 ${grossMargin}%)
판관비: ${fmt(expenses)}
순이익: ${fmt(netProfit)}

분석해주세요.`,
      }],
    });

    const rawContent = result.choices?.[0]?.message?.content;
    const text = typeof rawContent === "string" ? rawContent : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      aiNarrative = parsed.narrative || "";
      highlights.push(...(parsed.highlights || []));
      risks.push(...(parsed.risks || []));
      actions.push(...(parsed.actions || []));
    }
  } catch (err) {
    logWarn("경영리포트: LLM 호출 실패 — 폴백 해설 사용", { tenantId, operation: "generateExecutiveReport", error: String(err) });
    aiNarrative = `${month}월 매출 ${fmt(revenue)}, 순이익 ${fmt(netProfit)}. 전월 대비 매출 ${revenueGrowth}% 변동.`;
  }

  if (failedSources.length > 0) {
    risks.push(`일부 경영 데이터 수집 실패 (${failedSources.join(", ")}) — 리포트 수치가 불완전할 수 있습니다`);
  }

  return {
    period: `${year}년 ${month}월`,
    summary: aiNarrative,
    metrics: {
      revenue, cost, grossProfit, grossMargin, expenses, netProfit,
      prevRevenue, prevNetProfit, revenueGrowth, profitGrowth,
    },
    highlights, risks, actions, aiNarrative,
  };
}

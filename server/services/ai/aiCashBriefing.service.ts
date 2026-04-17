/**
 * AI 자금 브리핑 — 매일 자동 요약
 *
 * 은행 잔액, AP/AR, 위험 거래, 자금 예측을 LLM이 한국어로 요약
 */
import { invokeLLM } from "../../_core/llm";
import { getPool } from "../../db/pool";

export interface CashBriefing {
  date: string;
  summary: string;
  highlights: string[];
  warnings: string[];
  recommendations: string[];
  data: {
    bankBalance: number;
    apTotal: number;
    arTotal: number;
    todayDeposit: number;
    todayWithdrawal: number;
    overdueAR: number;
    overdueAP: number;
  };
}

export async function generateCashBriefing(tenantId: number): Promise<CashBriefing> {
  const pool = getPool();
  const today = new Date().toISOString().slice(0, 10);

  // 데이터 수집
  let bankBalance = 0, apTotal = 0, arTotal = 0;
  let todayDeposit = 0, todayWithdrawal = 0;
  let overdueAR = 0, overdueAP = 0;
  let recentTrend = "";

  try {
    const [bank]: any = await pool.execute(
      `SELECT COALESCE(SUM(CAST(balance AS DECIMAL(15,2))), 0) as total FROM bank_accounts WHERE tenant_id = ? AND is_active = 'Y'`,
      [tenantId]);
    bankBalance = Number(bank[0]?.total || 0);
  } catch (_) {}

  try {
    const [ap]: any = await pool.execute(
      `SELECT COALESCE(SUM(CAST(total_amount AS DECIMAL(15,2))), 0) as total, COUNT(*) as cnt FROM accounting_purchases WHERE tenant_id = ? AND status IN ('pending','approved')`,
      [tenantId]);
    apTotal = Number(ap[0]?.total || 0);
  } catch (_) {}

  try {
    const [ar]: any = await pool.execute(
      `SELECT COALESCE(SUM(CAST(total_amount AS DECIMAL(15,2))), 0) as total, COUNT(*) as cnt FROM accounting_sales WHERE tenant_id = ? AND status IN ('pending','approved')`,
      [tenantId]);
    arTotal = Number(ar[0]?.total || 0);
  } catch (_) {}

  try {
    const [tx]: any = await pool.execute(
      `SELECT COALESCE(SUM(CASE WHEN transaction_type='deposit' THEN CAST(amount AS DECIMAL(15,2)) ELSE 0 END), 0) as dep,
              COALESCE(SUM(CASE WHEN transaction_type='withdrawal' THEN CAST(amount AS DECIMAL(15,2)) ELSE 0 END), 0) as wd
       FROM bank_transactions WHERE tenant_id = ? AND transaction_date = ?`,
      [tenantId, today]);
    todayDeposit = Number(tx[0]?.dep || 0);
    todayWithdrawal = Number(tx[0]?.wd || 0);
  } catch (_) {}

  try {
    const [odAR]: any = await pool.execute(
      `SELECT COALESCE(SUM(CAST(total_amount AS DECIMAL(15,2))), 0) as total FROM accounting_sales
       WHERE tenant_id = ? AND status IN ('pending','approved') AND transaction_date < DATE_SUB(CURDATE(), INTERVAL 30 DAY)`,
      [tenantId]);
    overdueAR = Number(odAR[0]?.total || 0);
  } catch (_) {}

  try {
    const [odAP]: any = await pool.execute(
      `SELECT COALESCE(SUM(CAST(total_amount AS DECIMAL(15,2))), 0) as total FROM accounting_purchases
       WHERE tenant_id = ? AND status IN ('pending','approved') AND transaction_date < DATE_SUB(CURDATE(), INTERVAL 30 DAY)`,
      [tenantId]);
    overdueAP = Number(odAP[0]?.total || 0);
  } catch (_) {}

  // 최근 7일 추이
  try {
    const [trend]: any = await pool.execute(
      `SELECT DATE(transaction_date) as d,
              SUM(CASE WHEN transaction_type='deposit' THEN amount ELSE 0 END) as dep,
              SUM(CASE WHEN transaction_type='withdrawal' THEN amount ELSE 0 END) as wd
       FROM bank_transactions WHERE tenant_id = ? AND transaction_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
       GROUP BY DATE(transaction_date) ORDER BY d`,
      [tenantId]);
    recentTrend = (trend as any[]).map((t: any) =>
      `${t.d}: 입금 ₩${Number(t.dep).toLocaleString()} / 출금 ₩${Number(t.wd).toLocaleString()}`
    ).join("\n");
  } catch (_) {}

  const fmt = (n: number) => `₩${n.toLocaleString()}`;
  const projectedCash = bankBalance + arTotal - apTotal;

  // LLM 브리핑 생성
  let summary = "";
  const highlights: string[] = [];
  const warnings: string[] = [];
  const recommendations: string[] = [];

  try {
    const result = await invokeLLM({
      messages: [{
        role: "system",
        content: `당신은 중소기업 CFO 보좌관입니다. 자금 현황을 간결하게 브리핑합니다.
JSON으로 답하세요: {"summary":"2~3문장 요약","highlights":["좋은 점"],"warnings":["위험 사항"],"recommendations":["추천 조치"]}`,
      }, {
        role: "user",
        content: `오늘 자금 현황:
- 은행 잔액: ${fmt(bankBalance)}
- 미지급금(AP): ${fmt(apTotal)}
- 미수금(AR): ${fmt(arTotal)}
- 예상 가용자금: ${fmt(projectedCash)}
- 오늘 입금: ${fmt(todayDeposit)} / 출금: ${fmt(todayWithdrawal)}
- 30일 초과 연체 미수금: ${fmt(overdueAR)}
- 30일 초과 연체 미지급금: ${fmt(overdueAP)}
${recentTrend ? `\n최근 7일:\n${recentTrend}` : ""}

브리핑해주세요.`,
      }],
    });

    const rawContent = result.choices?.[0]?.message?.content;
    const text = typeof rawContent === "string" ? rawContent : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      summary = parsed.summary || "";
      highlights.push(...(parsed.highlights || []));
      warnings.push(...(parsed.warnings || []));
      recommendations.push(...(parsed.recommendations || []));
    }
  } catch (err: any) {
    summary = `은행 잔액 ${fmt(bankBalance)}, 미지급 ${fmt(apTotal)}, 미수금 ${fmt(arTotal)}. 예상 가용자금 ${fmt(projectedCash)}.`;
    if (overdueAR > 0) warnings.push(`30일 초과 미수금 ${fmt(overdueAR)} 회수 필요`);
    if (overdueAP > 0) warnings.push(`30일 초과 미지급금 ${fmt(overdueAP)} 지급 검토`);
  }

  return {
    date: today, summary, highlights, warnings, recommendations,
    data: { bankBalance, apTotal, arTotal, todayDeposit, todayWithdrawal, overdueAR, overdueAP },
  };
}

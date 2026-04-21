/**
 * AI 은행거래 자동분류 — 규칙 미매칭 시 LLM 폴백
 *
 * 흐름:
 *   1. findMatchingRule() → 기존 규칙 매칭 시도
 *   2. NO_MATCH → classifyWithAI() → LLM에 거래 설명 전달
 *   3. LLM이 계정과목 추천 (신뢰도 포함)
 *   4. 고신뢰 → 자동 적용 + 규칙 학습, 저신뢰 → "추천" 표시
 */
import { invokeLLM } from "../../_core/llm";
import { getPool } from "../../db/pool";
import { logWarn } from "../../utils/logger";

export interface AIClassifyResult {
  accountCode: string | null;
  accountName: string | null;
  accountId: number | null;
  confidence: number; // 0~100
  reason: string;
  isAuto: boolean; // 자동 적용 여부
}

const EMPTY_RESULT: AIClassifyResult = {
  accountCode: null, accountName: null, accountId: null,
  confidence: 0, reason: "AI 분류 불가", isAuto: false,
};

/**
 * LLM 기반 은행거래 자동분류
 */
export async function classifyBankTransaction(
  tenantId: number,
  description: string,
  amount: number,
  transactionType: "deposit" | "withdrawal",
): Promise<AIClassifyResult> {
  try {
    // 1. 테넌트의 계정과목 목록 조회
    const pool = getPool();
    const [accounts]: any = await pool.execute(
      `SELECT code, name, category FROM accounting_accounts
       WHERE tenant_id = ? AND is_active = 'Y' ORDER BY code`,
      [tenantId],
    );

    if (!accounts.length) return EMPTY_RESULT;

    const accountList = (accounts as any[])
      .map((a: any) => `${a.code} ${a.name} (${a.category})`)
      .join("\n");

    // 2. 최근 매칭 이력 조회 (패턴 학습용)
    let recentPatterns = "";
    try {
      const [recent]: any = await pool.execute(
        `SELECT bt.description, bt.transaction_type, bt.amount,
                aa.code as account_code, aa.name as account_name
         FROM bank_transactions bt
         LEFT JOIN accounting_accounts aa ON bt.matched_account_id = aa.id AND aa.tenant_id = bt.tenant_id
         WHERE bt.tenant_id = ? AND bt.matching_status = 'matched'
           AND aa.code IS NOT NULL
         ORDER BY bt.transaction_date DESC LIMIT 20`,
        [tenantId],
      );
      if ((recent as any[]).length > 0) {
        recentPatterns = "\n\n최근 매칭 이력:\n" +
          (recent as any[]).map((r: any) =>
            `- "${r.description}" (${r.transaction_type}, ₩${Number(r.amount).toLocaleString()}) → ${r.account_code} ${r.account_name}`
          ).join("\n");
      }
    } catch (err) {
      logWarn("은행분류: 최근 매칭 이력 조회 실패 — 이력 없이 진행", { tenantId, operation: "classifyBankTransaction", error: String(err) });
    }

    // 3. LLM 호출
    const result = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `당신은 한국 중소기업 회계 전문가입니다. 은행 거래 내역을 보고 적절한 계정과목을 추천합니다.

사용 가능한 계정과목:
${accountList}
${recentPatterns}

반드시 아래 JSON 형식으로만 답하세요:
{"code":"계정코드","name":"계정명","confidence":0~100,"reason":"추천 이유 한 줄"}

confidence 기준:
- 90+: 거의 확실 (전기요금→수도광열비 등)
- 70~89: 높은 확률
- 50~69: 추측
- 50 미만: 불확실`,
        },
        {
          role: "user",
          content: `거래 유형: ${transactionType === "deposit" ? "입금" : "출금"}
금액: ₩${amount.toLocaleString()}
적요: ${description}

이 거래에 맞는 계정과목을 추천해주세요.`,
        },
      ],
    });

    // 4. 응답 파싱
    const rawContent = result.choices?.[0]?.message?.content;
    const text = typeof rawContent === "string" ? rawContent : "";
    const jsonMatch = text.match(/\{[^}]+\}/);
    if (!jsonMatch) return { ...EMPTY_RESULT, reason: "AI 응답 파싱 실패" };

    const parsed = JSON.parse(jsonMatch[0]);
    const confidence = Number(parsed.confidence || 0);

    // 5. 계정 ID 조회
    let accountId: number | null = null;
    if (parsed.code) {
      const [acc]: any = await pool.execute(
        `SELECT id FROM accounting_accounts WHERE tenant_id = ? AND code = ? LIMIT 1`,
        [tenantId, parsed.code],
      );
      if (acc[0]?.id) accountId = Number(acc[0].id);
    }

    return {
      accountCode: parsed.code || null,
      accountName: parsed.name || null,
      accountId,
      confidence,
      reason: parsed.reason || "AI 추천",
      isAuto: confidence >= 85,
    };
  } catch (err: any) {
    console.error("[AI classify]", err.message?.substring(0, 100));
    return { ...EMPTY_RESULT, reason: `AI 오류: ${err.message?.substring(0, 50)}` };
  }
}

/**
 * 미매칭 거래 일괄 AI 분류
 */
export async function classifyUnmatchedTransactions(
  tenantId: number,
  limit: number = 20,
): Promise<Array<{ transactionId: number; description: string; result: AIClassifyResult }>> {
  const pool = getPool();
  try {
    const [rows]: any = await pool.execute(
      `SELECT id, description, amount, transaction_type
       FROM bank_transactions
       WHERE tenant_id = ? AND matching_status = 'unmatched'
       ORDER BY transaction_date DESC LIMIT ?`,
      [tenantId, limit],
    );

    const results: Array<{ transactionId: number; description: string; result: AIClassifyResult }> = [];

    for (const tx of rows as any[]) {
      const result = await classifyBankTransaction(
        tenantId,
        tx.description || "",
        Number(tx.amount || 0),
        tx.transaction_type as "deposit" | "withdrawal",
      );
      results.push({ transactionId: tx.id, description: tx.description, result });
    }

    return results;
  } catch (err: any) {
    console.error("[AI classify batch]", err.message);
    return [];
  }
}

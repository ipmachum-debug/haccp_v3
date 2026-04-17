/**
 * AI 전표 자동추천 — 거래 정보 기반 차변/대변 추천
 *
 * 1. 과거 패턴 기반: 같은 거래처 + 비슷한 금액 → 같은 계정
 * 2. LLM 폴백: 패턴 없으면 AI가 추천
 */
import { invokeLLM } from "../../_core/llm";
import { getPool } from "../../db/pool";

export interface JournalRecommendation {
  debitCode: string;
  debitName: string;
  creditCode: string;
  creditName: string;
  confidence: number;
  reason: string;
  source: "pattern" | "ai";
}

/**
 * 거래 정보로 분개 추천
 */
export async function recommendJournalEntry(
  tenantId: number,
  params: {
    type: "purchase" | "sale" | "expense" | "manual";
    itemName?: string;
    partnerName?: string;
    amount: number;
    description?: string;
  },
): Promise<JournalRecommendation> {
  const pool = getPool();

  // 1. 과거 패턴 검색 — 같은 거래처 + 같은 품목의 이전 분개
  try {
    let patternQuery = `
      SELECT l.account_code, l.account_name, l.debit_amount, l.credit_amount,
             e.description
      FROM expense_journal_lines l
      JOIN expense_journal_entries e ON l.journal_entry_id = e.id
      WHERE l.tenant_id = ?`;
    const patternParams: any[] = [tenantId];

    if (params.partnerName) {
      patternQuery += ` AND e.description LIKE ?`;
      patternParams.push(`%${params.partnerName}%`);
    } else if (params.itemName) {
      patternQuery += ` AND e.description LIKE ?`;
      patternParams.push(`%${params.itemName}%`);
    }

    patternQuery += ` ORDER BY e.entry_date DESC LIMIT 10`;

    const [patterns]: any = await pool.execute(patternQuery, patternParams);

    if ((patterns as any[]).length >= 2) {
      const debits = (patterns as any[]).filter((p: any) => Number(p.debit_amount) > 0);
      const credits = (patterns as any[]).filter((p: any) => Number(p.credit_amount) > 0);

      if (debits.length > 0 && credits.length > 0) {
        return {
          debitCode: debits[0].account_code,
          debitName: debits[0].account_name,
          creditCode: credits[0].account_code,
          creditName: credits[0].account_name,
          confidence: 90,
          reason: `과거 ${(patterns as any[]).length}건 패턴 기반`,
          source: "pattern",
        };
      }
    }
  } catch (_) {}

  // 2. LLM 폴백
  try {
    const [accounts]: any = await pool.execute(
      `SELECT code, name, category FROM accounting_accounts WHERE tenant_id = ? AND is_active = 'Y' ORDER BY code`,
      [tenantId],
    );

    const accountList = (accounts as any[])
      .map((a: any) => `${a.code} ${a.name} (${a.category})`)
      .join("\n");

    const typeLabels: Record<string, string> = {
      purchase: "매입", sale: "매출", expense: "비용", manual: "수기",
    };

    const result = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `한국 중소기업 복식부기 전문가. 거래를 보고 차변/대변 계정을 추천.

계정과목:
${accountList}

JSON 형식으로 답하세요:
{"debitCode":"코드","debitName":"이름","creditCode":"코드","creditName":"이름","confidence":0~100,"reason":"이유"}`,
        },
        {
          role: "user",
          content: `거래유형: ${typeLabels[params.type] || params.type}
품목: ${params.itemName || "-"}
거래처: ${params.partnerName || "-"}
금액: ₩${params.amount.toLocaleString()}
적요: ${params.description || "-"}

차변/대변 계정을 추천해주세요.`,
        },
      ],
    });

    const rawContent = result.choices?.[0]?.message?.content;
    const text = typeof rawContent === "string" ? rawContent : "";
    const jsonMatch = text.match(/\{[^}]+\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        debitCode: parsed.debitCode || "",
        debitName: parsed.debitName || "",
        creditCode: parsed.creditCode || "",
        creditName: parsed.creditName || "",
        confidence: Number(parsed.confidence || 60),
        reason: parsed.reason || "AI 추천",
        source: "ai",
      };
    }
  } catch (err: any) {
    console.error("[AI journal recommend]", err.message?.substring(0, 80));
  }

  // 3. 기본 폴백
  const defaults: Record<string, JournalRecommendation> = {
    purchase: { debitCode: "1410", debitName: "원재료", creditCode: "2010", creditName: "외상매입금", confidence: 50, reason: "기본 매입 패턴", source: "pattern" },
    sale: { debitCode: "1310", debitName: "외상매출금", creditCode: "4010", creditName: "상품매출", confidence: 50, reason: "기본 매출 패턴", source: "pattern" },
    expense: { debitCode: "8200", debitName: "복리후생비", creditCode: "1020", creditName: "보통예금", confidence: 30, reason: "기본 비용 패턴", source: "pattern" },
    manual: { debitCode: "", debitName: "", creditCode: "", creditName: "", confidence: 0, reason: "추천 불가", source: "pattern" },
  };

  return defaults[params.type] || defaults.manual;
}

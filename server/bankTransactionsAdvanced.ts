import { getDb } from "./db";
import { 
  bankTransactions,
  matchingRules,
  partners
} from "../drizzle/schema_main";
import { eq, and, desc, isNull } from "drizzle-orm";

/**
 * 매칭 규칙 조건 타입
 */
interface MatchingCondition {
  field: "counterpartyText" | "memo" | "amount" | "direction";
  operator: "contains" | "equals" | "startsWith" | "endsWith" | "regex" | "gt" | "lt" | "gte" | "lte";
  value: string | number;
}

/**
 * 매칭 규칙 액션 타입
 */
interface MatchingAction {
  type: "assignPartner" | "assignLedger";
  partnerId?: number;
  ledgerType?: "ap" | "ar";
}

/**
 * 매칭 후보 타입 (TOP3 추천용)
 */
interface MatchCandidate {
  partnerId: number;
  partnerName: string;
  score: number; // 0-100 점수
  matchedRules: string[]; // 매칭된 규칙 설명
}

/**
 * 조건 평가 함수
 */
function evaluateCondition(
  condition: MatchingCondition,
  transaction: any
): boolean {
  const fieldValue = transaction[condition.field];
  
  if (fieldValue === null || fieldValue === undefined) {
    return false;
  }

  switch (condition.operator) {
    case "contains":
      return String(fieldValue).toLowerCase().includes(String(condition.value).toLowerCase());
    
    case "equals":
      return String(fieldValue).toLowerCase() === String(condition.value).toLowerCase();
    
    case "startsWith":
      return String(fieldValue).toLowerCase().startsWith(String(condition.value).toLowerCase());
    
    case "endsWith":
      return String(fieldValue).toLowerCase().endsWith(String(condition.value).toLowerCase());
    
    case "regex":
      try {
        const regex = new RegExp(String(condition.value), "i");
        return regex.test(String(fieldValue));
      } catch {
        return false;
      }
    
    case "gt":
      return Number(fieldValue) > Number(condition.value);
    
    case "lt":
      return Number(fieldValue) < Number(condition.value);
    
    case "gte":
      return Number(fieldValue) >= Number(condition.value);
    
    case "lte":
      return Number(fieldValue) <= Number(condition.value);
    
    default:
      return false;
  }
}

/**
 * 고급 자동 매칭 엔진
 * - ruleType 기반 다양한 매칭 로직 (keyword, amount, pattern)
 * - conditions JSON 필드 파싱 및 적용
 * - weight와 priority 기반 점수 계산
 * - TOP3 추천 시스템
 */
export async function autoMatchBankTransactionsAdvanced(bankAccountId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 매칭되지 않은 거래 조회
  const unmatched = await db
    .select()
    .from(bankTransactions)
    .where(
      and(
        eq(bankTransactions.bankAccountId, bankAccountId),
        isNull(bankTransactions.matchedPartnerId)
      )
    );

  // 매칭 규칙 조회 (priority 높은 순)
  const rules = await db
    .select()
    .from(matchingRules)
    .where(eq(matchingRules.isActive, 1))
    .orderBy(desc(matchingRules.priority));

  // 거래처 목록 조회 (캐싱용)
  const allPartners = await db
    .select()
    .from(partners)
    .where(eq(partners.isActive, 1));

  let matched = 0;
  const matchResults: Array<{
    transactionId: number;
    partnerId: number | null;
    score: number;
    candidates: MatchCandidate[];
  }> = [];

  for (const tx of unmatched) {
    const candidates: MatchCandidate[] = [];

    // 각 규칙에 대해 평가
    for (const rule of rules) {
      try {
        // conditions JSON 파싱
        const conditions: MatchingCondition[] = JSON.parse(rule.conditions);
        const actions: MatchingAction[] = JSON.parse(rule.actions);

        // 모든 조건이 만족하는지 확인
        const allConditionsMet = conditions.every(condition =>
          evaluateCondition(condition, tx)
        );

        if (allConditionsMet) {
          // 액션에서 partnerId 추출
          const assignPartnerAction = actions.find(a => a.type === "assignPartner");
          if (assignPartnerAction && assignPartnerAction.partnerId) {
            const partner = allPartners.find(p => p.id === assignPartnerAction.partnerId);
            if (partner) {
              // 점수 계산: priority (0-1000) + weight (0-10) → 0-100 점수로 정규화
              const priorityScore = (rule.priority / 1000) * 50; // 최대 50점
              const weightScore = (parseFloat(rule.weight) / 10) * 50; // 최대 50점
              const totalScore = Math.min(100, priorityScore + weightScore);

              candidates.push({
                partnerId: assignPartnerAction.partnerId,
                partnerName: partner.companyName,
                score: totalScore,
                matchedRules: [`${rule.ruleType}: ${conditions.map(c => `${c.field} ${c.operator} ${c.value}`).join(', ')}`]
              });
            }
          }
        }
      } catch (error) {
        // JSON 파싱 오류 무시
        console.error(`Rule ${rule.id} parsing error:`, error);
      }
    }

    // 후보가 있으면 점수 순으로 정렬
    if (candidates.length > 0) {
      candidates.sort((a, b) => b.score - a.score);

      // TOP1 후보를 자동 매칭 (점수가 80점 이상인 경우만)
      const topCandidate = candidates[0];
      if (topCandidate.score >= 80) {
        await db
          .update(bankTransactions)
          .set({
            matchedPartnerId: topCandidate.partnerId,
            matchedAt: new Date()
          })
          .where(eq(bankTransactions.id, tx.id));

        matched++;
      }

      matchResults.push({
        transactionId: tx.id,
        partnerId: topCandidate.score >= 80 ? topCandidate.partnerId : null,
        score: topCandidate.score,
        candidates: candidates.slice(0, 3), // TOP3만 저장
      });
    } else {
      matchResults.push({
        transactionId: tx.id,
        partnerId: null,
        score: 0,
        candidates: []
      });
    }
  }

  return {
    matched,
    total: unmatched.length,
    matchResults, // TOP3 추천 결과 포함
  };
}

/**
 * 특정 거래에 대한 TOP3 매칭 후보 조회
 */
export async function getMatchCandidates(transactionId: number): Promise<MatchCandidate[]> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 거래 조회
  const [tx] = await db
    .select()
    .from(bankTransactions)
    .where(eq(bankTransactions.id, transactionId))
    .limit(1);

  if (!tx) {
    throw new Error("거래를 찾을 수 없습니다");
  }

  // 매칭 규칙 조회
  const rules = await db
    .select()
    .from(matchingRules)
    .where(eq(matchingRules.isActive, 1))
    .orderBy(desc(matchingRules.priority));

  // 거래처 목록 조회
  const allPartners = await db
    .select()
    .from(partners)
    .where(eq(partners.isActive, 1));

  const candidates: MatchCandidate[] = [];

  for (const rule of rules) {
    try {
      const conditions: MatchingCondition[] = JSON.parse(rule.conditions);
      const actions: MatchingAction[] = JSON.parse(rule.actions);

      const allConditionsMet = conditions.every(condition =>
        evaluateCondition(condition, tx)
      );

      if (allConditionsMet) {
        const assignPartnerAction = actions.find(a => a.type === "assignPartner");
        if (assignPartnerAction && assignPartnerAction.partnerId) {
          const partner = allPartners.find(p => p.id === assignPartnerAction.partnerId);
          if (partner) {
            const priorityScore = (rule.priority / 1000) * 50;
            const weightScore = (parseFloat(rule.weight) / 10) * 50;
            const totalScore = Math.min(100, priorityScore + weightScore);

            candidates.push({
              partnerId: assignPartnerAction.partnerId,
              partnerName: partner.companyName,
              score: totalScore,
              matchedRules: [`${rule.ruleType}: ${conditions.map(c => `${c.field} ${c.operator} ${c.value}`).join(', ')}`]
            });
          }
        }
      }
    } catch (error) {
      console.error(`Rule ${rule.id} parsing error:`, error);
    }
  }

  // 점수 순으로 정렬하고 TOP3 반환
  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, 3);
}

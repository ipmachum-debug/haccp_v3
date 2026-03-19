/**
 * 한국어 품목명 퍼지 매칭 유틸리티
 * 
 * - Levenshtein distance 기반 유사도
 * - 공백/특수문자 정규화
 * - 한글 자소 분리 지원
 * - 부분 문자열 매칭 보너스
 */

// 한글 자소 분리 (초성/중성/종성)
const CHOSUNG = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
const JUNGSUNG = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'];
const JONGSUNG = ['','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];

function decomposeKorean(str: string): string {
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code >= 0xAC00 && code <= 0xD7A3) {
      const base = code - 0xAC00;
      const cho = Math.floor(base / (21 * 28));
      const jung = Math.floor((base % (21 * 28)) / 28);
      const jong = base % 28;
      result += CHOSUNG[cho] + JUNGSUNG[jung] + JONGSUNG[jong];
    } else {
      result += str[i];
    }
  }
  return result;
}

// 문자열 정규화: 소문자, 공백/특수문자 제거
function normalize(str: string): string {
  return str
    .toLowerCase()
    .replace(/[\s\-_()（）\[\]【】·.,/\\]/g, '')
    .trim();
}

// Levenshtein distance
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,      // 삭제
        dp[i][j - 1] + 1,      // 삽입
        dp[i - 1][j - 1] + cost // 교체
      );
    }
  }
  return dp[m][n];
}

export type FuzzyMatchResult = {
  item: any;
  score: number;       // 0 ~ 1 (1이 완전 일치)
  matchType: 'exact' | 'normalized' | 'contains' | 'fuzzy' | 'decomposed';
};

/**
 * 품목명 퍼지 매칭
 * @param input 사용자가 엑셀에 입력한 품목명
 * @param masterItems 품목 마스터 목록 (itemName 필드 필요)
 * @param topN 상위 N개 결과 반환 (기본 5)
 * @returns 매칭 결과 배열 (점수 내림차순)
 */
export function fuzzyMatchItem(
  input: string,
  masterItems: any[],
  topN: number = 5
): FuzzyMatchResult[] {
  if (!input || !input.trim()) return [];
  
  const inputNorm = normalize(input);
  const inputDecomp = decomposeKorean(inputNorm);
  
  const results: FuzzyMatchResult[] = [];
  
  for (const item of masterItems) {
    const itemName = item.itemName || item.name || '';
    if (!itemName) continue;
    
    const itemNorm = normalize(itemName);
    const itemDecomp = decomposeKorean(itemNorm);
    
    // 1. 정확히 일치
    if (inputNorm === itemNorm) {
      results.push({ item, score: 1.0, matchType: 'exact' });
      continue;
    }
    
    // 2. 정규화 후 일치
    if (inputNorm.replace(/\s/g, '') === itemNorm.replace(/\s/g, '')) {
      results.push({ item, score: 0.98, matchType: 'normalized' });
      continue;
    }
    
    // 3. 포함 관계 (한쪽이 다른 쪽에 포함)
    const containsScore = (() => {
      if (itemNorm.includes(inputNorm)) {
        return 0.85 + (inputNorm.length / itemNorm.length) * 0.1;
      }
      if (inputNorm.includes(itemNorm)) {
        return 0.8 + (itemNorm.length / inputNorm.length) * 0.1;
      }
      return 0;
    })();
    
    if (containsScore > 0) {
      results.push({ item, score: containsScore, matchType: 'contains' });
      continue;
    }
    
    // 4. Levenshtein 기반 유사도 (정규화된 문자열)
    const maxLen = Math.max(inputNorm.length, itemNorm.length);
    if (maxLen > 0) {
      const dist = levenshtein(inputNorm, itemNorm);
      const similarity = 1 - dist / maxLen;
      
      // 5. 자소 분리 후 Levenshtein (한글 유사도 보정)
      const decompMaxLen = Math.max(inputDecomp.length, itemDecomp.length);
      const decompDist = levenshtein(inputDecomp, itemDecomp);
      const decompSimilarity = decompMaxLen > 0 ? 1 - decompDist / decompMaxLen : 0;
      
      // 두 유사도 중 높은 것 사용
      const bestScore = Math.max(similarity, decompSimilarity * 0.95);
      
      if (bestScore > 0.3) { // 최소 30% 유사도 이상만
        results.push({
          item,
          score: bestScore,
          matchType: decompSimilarity > similarity ? 'decomposed' : 'fuzzy'
        });
      }
    }
  }
  
  // 점수 기준 내림차순 정렬 후 상위 N개
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topN);
}

/**
 * 거래처명 퍼지 매칭
 * @param input 엑셀에서 입력한 거래처명
 * @param partners 거래처 목록
 * @param topN 상위 결과 수
 */
export function fuzzyMatchPartner(
  input: string,
  partners: any[],
  topN: number = 5
): { partner: any; score: number }[] {
  if (!input || !input.trim()) return [];
  
  const inputNorm = normalize(input);
  
  const results: { partner: any; score: number }[] = [];
  
  for (const partner of partners) {
    const name = partner.company_name || partner.companyName || '';
    if (!name) continue;
    
    const nameNorm = normalize(name);
    
    // 정확히 일치
    if (inputNorm === nameNorm) {
      results.push({ partner, score: 1.0 });
      continue;
    }
    
    // 포함
    if (nameNorm.includes(inputNorm) || inputNorm.includes(nameNorm)) {
      const longer = Math.max(inputNorm.length, nameNorm.length);
      const shorter = Math.min(inputNorm.length, nameNorm.length);
      results.push({ partner, score: 0.8 + (shorter / longer) * 0.15 });
      continue;
    }
    
    // Levenshtein
    const maxLen = Math.max(inputNorm.length, nameNorm.length);
    if (maxLen > 0) {
      const dist = levenshtein(inputNorm, nameNorm);
      const score = 1 - dist / maxLen;
      if (score > 0.4) {
        results.push({ partner, score });
      }
    }
  }
  
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topN);
}

/**
 * 엑셀 헤더 자동 매칭
 * @param excelHeaders 엑셀 파일의 헤더 문자열 배열
 * @param expectedFields 시스템 필드 목록 (label, key 형태)
 */
export function autoMatchHeaders(
  excelHeaders: string[],
  expectedFields: { key: string; label: string; aliases: string[] }[]
): Record<string, number | null> {
  const mapping: Record<string, number | null> = {};
  
  for (const field of expectedFields) {
    let bestColIdx: number | null = null;
    let bestScore = 0;
    
    const allLabels = [field.label, ...field.aliases];
    
    for (let colIdx = 0; colIdx < excelHeaders.length; colIdx++) {
      const header = normalize(excelHeaders[colIdx] || '');
      
      for (const label of allLabels) {
        const labelNorm = normalize(label);
        
        // 정확히 일치
        if (header === labelNorm) {
          bestColIdx = colIdx;
          bestScore = 1.0;
          break;
        }
        
        // 포함
        if (header.includes(labelNorm) || labelNorm.includes(header)) {
          const score = 0.8;
          if (score > bestScore) {
            bestScore = score;
            bestColIdx = colIdx;
          }
        }
        
        // 퍼지
        const maxLen = Math.max(header.length, labelNorm.length);
        if (maxLen > 0) {
          const dist = levenshtein(header, labelNorm);
          const score = 1 - dist / maxLen;
          if (score > bestScore && score > 0.6) {
            bestScore = score;
            bestColIdx = colIdx;
          }
        }
      }
      
      if (bestScore === 1.0) break;
    }
    
    mapping[field.key] = bestScore >= 0.6 ? bestColIdx : null;
  }
  
  return mapping;
}

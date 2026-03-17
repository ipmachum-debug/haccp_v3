/**
 * 글로벌 HACCP 지식베이스 사전 탑재
 * P9-3: 모든 테넌트가 공통으로 참조할 수 있는 기준서 문서 탑재
 *
 * 실행: npx tsx scripts/seed-global-knowledge.ts
 */

import { getRawConnection } from "../server/db/connection";

const GLOBAL_DOCUMENTS = [
  {
    title: "HACCP 7원칙 12절차",
    docType: "haccp_plan",
    description: "식품안전관리인증(HACCP) 핵심 원리",
    content: `# HACCP 7원칙 12절차

## 5개 사전 단계
1. **HACCP 팀 구성**: 다양한 분야의 전문가로 구성. 팀장은 HACCP 시스템 전반을 관리.
2. **제품 설명서 작성**: 제품명, 성분, 포장방법, 유통기한, 보관조건 등을 상세히 기술.
3. **용도 확인**: 제품의 사용 용도와 대상 소비자 파악. 특수 소비자(영유아, 노인, 알레르기 환자) 고려.
4. **공정 흐름도 작성**: 원재료 입고부터 출하까지 모든 공정을 순서대로 기록.
5. **공정 흐름도 현장 확인**: 실제 현장과 흐름도가 일치하는지 확인.

## 7원칙
### 원칙 1: 위해요소 분석 (Hazard Analysis)
- 생물학적 위해: 세균(살모넬라, 리스테리아, 대장균 O157:H7), 바이러스, 기생충
- 화학적 위해: 잔류농약, 중금속, 식품첨가물 과다, 알레르겐, 세제잔류
- 물리적 위해: 금속조각, 유리파편, 뼈, 돌, 머리카락, 플라스틱

### 원칙 2: 중요관리점(CCP) 결정
- CCP 결정도(Decision Tree) 활용
- Q1: 예방조치가 있는가?
- Q2: 이 단계가 위해를 제거하거나 허용 수준으로 감소시키는가?
- Q3: 이 위해가 허용 수준을 초과할 수 있는가?
- Q4: 후속 단계가 이 위해를 제거하거나 감소시키는가?

### 원칙 3: 한계기준(CL) 설정
- 온도, 시간, pH, 수분활성도(Aw), 염소 농도 등 측정 가능한 값
- 예: 가열 CCP → 중심온도 75°C 이상, 1분 이상
- 예: 금속검출 CCP → Fe 1.5mm, SUS 2.0mm 이하

### 원칙 4: 모니터링 체계 수립
- 무엇을(What), 어떻게(How), 언제(When), 누가(Who)
- 연속 모니터링: 온도기록계, 금속검출기
- 비연속 모니터링: 주기적 측정 (매 배치, 매 시간 등)

### 원칙 5: 시정조치(Corrective Action)
- CL 이탈 시 즉각적 조치 계획
- 원인 파악 → 제품 격리 → 재발방지 → 기록

### 원칙 6: 검증(Verification)
- HACCP 계획이 올바르게 수행되는지 확인
- 검증 활동: 기록 검토, 장비 교정, 미생물 검사, 내부 심사

### 원칙 7: 기록 관리(Record Keeping)
- 모든 HACCP 관련 기록을 체계적으로 보관
- 최소 보관 기간: 유통기한 + 6개월
- 기록 종류: CCP 모니터링, 시정조치, 검증활동, 위해분석`,
  },
  {
    title: "식품위생법 주요 규정 요약",
    docType: "sanitation",
    description: "식품 제조가공업 위생 관련 주요 법규",
    content: `# 식품위생법 주요 규정

## 영업자 준수사항
1. **식품 등의 위생적 취급에 관한 기준**: 부패·변질 우려 식품 보관금지, 유통기한 경과 제품 판매금지
2. **건강진단**: 영업자 및 종업원 연 1회 건강진단 (장티푸스, 폐결핵 등)
3. **위생교육**: 영업자 및 종업원 정기 위생교육 이수

## 시설기준
- 작업장: 청결구역/일반구역 분리, 방충방서 시설
- 급수시설: 수돗물 또는 먹는물 수질기준 적합한 지하수
- 화장실: 작업장과 분리, 정화조 설치
- 보관시설: 원료/완제품 별도 보관

## HACCP 의무적용 대상
- 어육가공품, 냉동식품, 빙과류, 비가열음료, 레토르트식품
- 김치류(배추김치), 과자·캔디류, 면류, 음료류
- 기타 식품(매출액 기준) 순차 확대

## 자가품질검사
- 식품제조가공업자: 품목별 자가품질검사 실시
- 검사 주기: 제조·가공하는 식품 유형에 따라 1개월~6개월
- 직접 검사 또는 검사기관 위탁

## 원산지 표시
- 수입 원재료 사용 시 원산지 표시 의무
- 쇠고기, 돼지고기, 닭고기 등 원산지 표시 필수`,
  },
  {
    title: "선행요건프로그램(PRP) 관리기준",
    docType: "prerequisite",
    description: "HACCP 운영의 기반이 되는 8대 선행요건",
    content: `# 선행요건프로그램(PRP) 8대 관리기준

## 1. 영업장 관리
- 작업장 구획: 원료 입고 → 전처리 → 가공 → 포장 → 출하 동선 구분
- 교차오염 방지: 청결구역/준청결구역/일반구역 분리
- 환기 시설: 적절한 환기로 응결수, 이취 방지

## 2. 위생 관리
- 개인위생: 작업복, 위생모, 위생화 착용, 손 씻기 (30초 이상)
- 작업장 위생: 바닥·벽·천장 청결, 세척·소독 실시
- 작업 전후 위생 점검 실시

## 3. 제조시설·설비 관리
- 정기 점검·정비 계획 수립 및 실행
- 식품 접촉면: 스테인리스 스틸 등 비흡수성 재질
- 세척·소독이 용이한 구조

## 4. 냉장·냉동 관리
- 냉장: 0~10°C (5°C 이하 권장)
- 냉동: -18°C 이하
- 온도 기록: 1일 2회 이상 확인·기록

## 5. 용수 관리
- 수돗물: 수질검사 성적서 연 1회 확인
- 지하수: 먹는물 수질기준 검사 연 1회 (음용수 전항목)
- 비음용수 배관: 식품용과 구분 표시

## 6. 보관·운송 관리
- 선입선출(FIFO) 원칙 준수
- 바닥에서 15cm 이상 이격
- 벽에서 30cm 이상 이격
- 원재료·완제품·반제품 별도 보관

## 7. 검사 관리
- 원재료 수입검사: 입고 시 외관, 온도, 유통기한 확인
- 공정검사: CCP 모니터링 + 중간 품질검사
- 완제품검사: 관능검사 + 미생물검사 + 이화학검사

## 8. 회수 프로그램
- 회수(리콜) 절차: 문제 인지 → 유통 차단 → 고객 통보 → 회수 → 폐기/재처리
- 가상 회수 훈련: 연 1회 이상 실시
- LOT 추적 시스템으로 신속 회수 가능 체계 구축`,
  },
  {
    title: "CCP 모니터링 기준 가이드",
    docType: "ccp_standard",
    description: "주요 CCP 유형별 한계기준 및 모니터링 방법",
    content: `# CCP 모니터링 기준 가이드

## CCP-1: 가열 공정 (살균/멸균)
- **한계기준**: 중심온도 75°C 이상, 1분 이상 유지
  - 가금류: 74°C 이상
  - 어육류: 63°C 이상
  - 레토르트: 121°C, 15분 이상 (F0=4 이상)
- **모니터링**: 매 배치 중심온도 측정 (디지털 온도계)
- **시정조치**: 미달 시 재가열 또는 폐기
- **기록**: 온도, 시간, 담당자, 날짜

## CCP-2: 냉각 공정
- **한계기준**: 가열 후 60°C → 10°C 이하, 4시간 이내
  - 또는 2단계: 60→21°C 2시간 + 21→5°C 4시간
- **모니터링**: 냉각 시작/완료 시간, 온도 기록
- **시정조치**: 시간 초과 시 폐기

## CCP-3: 금속검출
- **한계기준**: Fe 1.0~2.0mm, SUS 1.5~2.5mm (제품별 설정)
- **모니터링**: 전 제품 통과, 검출기 감도 매 2시간 확인
- **시정조치**: 검출 시 라인 정지, 이전 합격 이후 제품 전량 재검사
- **테스트피스**: Fe, SUS, Non-Fe 3종 사용

## CCP-4: 보관 온도 관리
- **냉장**: 0~10°C (제품별 세부 기준)
- **냉동**: -18°C 이하
- **모니터링**: 자동 온도기록장치 또는 1일 2회 수동 확인
- **시정조치**: 기준 이탈 시 제품 안전성 평가, 필요시 폐기

## CCP-5: 살균수 농도 (세척 공정)
- **한계기준**: 유효염소 100~200ppm
- **모니터링**: 매 배치 시작 전 염소 농도 측정
- **시정조치**: 농도 부족 시 재조정 후 재세척`,
  },
];

async function seedGlobalKnowledge() {
  console.log("[Seed] 글로벌 HACCP 지식베이스 탑재 시작...");
  const conn = await getRawConnection();

  for (const doc of GLOBAL_DOCUMENTS) {
    // 중복 체크
    const [existing] = await conn.execute(
      `SELECT id FROM ai_knowledge_documents WHERE title = ? AND is_global = 1 LIMIT 1`,
      [doc.title]
    );

    if ((existing as any[]).length > 0) {
      console.log(`  [Skip] "${doc.title}" 이미 존재`);
      continue;
    }

    // 문서 저장 (tenant_id=0 → 글로벌)
    const [result] = await conn.execute(
      `INSERT INTO ai_knowledge_documents
       (tenant_id, title, description, doc_type, content, chunk_count, total_tokens, status, is_active, is_global, created_at, updated_at)
       VALUES (0, ?, ?, ?, ?, 0, 0, 'active', 1, 1, NOW(), NOW())`,
      [doc.title, doc.description, doc.docType, doc.content]
    );

    const docId = (result as any).insertId;

    // 청크 분할 (500자 단위)
    const chunks = splitContent(doc.content, 500, 50);
    for (let i = 0; i < chunks.length; i++) {
      await conn.execute(
        `INSERT INTO ai_knowledge_chunks
         (document_id, chunk_index, content, token_count, metadata, created_at)
         VALUES (?, ?, ?, ?, ?, NOW())`,
        [docId, i, chunks[i], Math.ceil(chunks[i].length / 2), JSON.stringify({ category: doc.docType })]
      );
    }

    // 청크 수 업데이트
    await conn.execute(
      `UPDATE ai_knowledge_documents SET chunk_count = ?, total_tokens = ? WHERE id = ?`,
      [chunks.length, Math.ceil(doc.content.length / 2), docId]
    );

    console.log(`  [OK] "${doc.title}" → ${chunks.length} 청크 생성`);
  }

  console.log("[Seed] 글로벌 HACCP 지식베이스 탑재 완료");
  process.exit(0);
}

function splitContent(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start = end - overlap;
    if (start >= text.length) break;
  }
  return chunks;
}

seedGlobalKnowledge().catch((err) => {
  console.error("[Seed] 실패:", err);
  process.exit(1);
});

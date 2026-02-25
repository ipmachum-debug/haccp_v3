# 다음 세션 시작 가이드

## 🎯 현재 상황

재고-회계 통합 시스템 설계 완료, 구현 준비 단계입니다.

---

## 📋 핵심 설계 원칙

### 1. 단일 진실(SoT)
- **재고 SoT**: `h_inventory_transactions` (LOT 단위 기록)
- **회계 SoT**: `accounting_transactions` (복식부기 라인 원장)
- **문서**: `accounting_purchases`, `accounting_sales`는 입력용

### 2. 상태머신
```
DRAFT (작성 중) → POSTED (확정) → CANCELED (취소)
```
- 원장은 생성 후 불변
- 취소는 삭제가 아니라 역거래 추가

### 3. 멱등성 키
```
UNIQUE(source_type, source_id, source_line_id, action_type, ...)
```
- DB 제약으로 강제 (코드 체크는 레이스 컨디션에 뚫림)

### 4. 원가 흐름
```
원재료 재고 → WIP (재공품) → 제품 재고 → COGS (매출원가)
```

### 5. 역거래 패턴
- 삭제 금지
- 취소 시 `action_type='REVERSAL'`로 역거래 추가
- 재고: quantity 음수
- 회계: DR/CR 반대

---

## 📝 구현 순서

### Step 1: 스키마 변경
1. accounting_transactions 테이블 생성
2. accounting_purchases/sales에 doc_id, status 추가
3. h_inventory_transactions에 source_type, action_type 추가
4. h_batches에 status, 원가 필드 추가
5. doc_line_lots 테이블 생성
6. accounting_accounts 테이블 생성

### Step 2: POST/CANCEL 로직 구현
1. 매입 POST/CANCEL
2. 원재료 출고 POST/CANCEL
3. 생산 완료 POST
4. 제품 판매 POST/CANCEL
5. 반품 로직

### Step 3: 테스트
- Vitest 테스트 작성
- 전체 플로우 통합 테스트

---

**작성일**: 2026-01-31

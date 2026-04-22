-- ============================================================================
-- 2026-04-22: accounting_sales.accounting_excluded 플래그 추가
-- ============================================================================
--
-- 배경:
--   B2C 전자상거래 매출은 "이지어드민" 등 주문 수집 툴로 매일 업로드 하지만,
--   회계상 매출 인식은 플랫폼별 분기 정산서 기반으로 해야 함 (한국 실무 표준).
--   이지어드민 매출 ≠ 플랫폼 정산 = 구조적 불일치.
--
--   이에 accounting_sales 에 "회계 연동 제외" 플래그를 추가하여:
--     - 재고 차감은 실행 (HACCP 법적 의무)
--     - 매출/COGS 분개 생성은 skip
--     - 수금 처리도 차단 (플랫폼 정산에서 별도 처리)
--
-- 사용:
--   - 엑셀 일괄 업로드 시 "B2C 전자상거래 (회계 제외)" 체크박스
--   - 체크 시 이 업로드의 모든 매출이 accounting_excluded=1 로 INSERT
--
-- 향후:
--   플랫폼 정산 모듈 (b2c_sellers + b2c_sales_entries) 에서 분기별로
--   플랫폼/셀러/결제수단 단위로 매출을 수기 입력 → 자동 분개 생성.
-- ============================================================================

ALTER TABLE accounting_sales
  ADD COLUMN accounting_excluded TINYINT NOT NULL DEFAULT 0
  COMMENT '회계 연동 제외 여부 (B2C 플랫폼 매출 — 재고만 차감, 분개 skip)';

-- 인덱스 (조회 최적화 — 대부분의 매출 집계 쿼리에서 이 플래그로 필터링 예정)
CREATE INDEX idx_accounting_sales_accounting_excluded
  ON accounting_sales(tenant_id, accounting_excluded, status);

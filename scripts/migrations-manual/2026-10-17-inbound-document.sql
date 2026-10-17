-- 입고 문서 스키마 (2026-10-17, 입고 정본화 PR-1)
-- 서버 부팅 시 ensureRequiredSchema → ensureInboundDocumentSchema 가 같은 DDL 을 자동 실행한다 (필요할 때만).
-- 이 파일은 기록·수동 적용용. 전부 NULL 허용(또는 기본값) 컬럼 추가 + 유니크 키 — 기존 행 값은 바꾸지 않는다.
--
-- 배포 직전 사전 점검 (0 이어야 유니크 생성 가능):
--   SELECT COUNT(*) FROM (SELECT tenant_id, header_id, line_number FROM h_inbound_lines GROUP BY 1,2,3 HAVING COUNT(*) > 1) x;
--   (새 컬럼 lot_id / inbound_line_id / idempotency_key 는 전부 NULL 로 시작하므로 중복 없음)

ALTER TABLE h_inbound_headers
  ADD COLUMN source_type varchar(30) NULL,
  ADD COLUMN po_id bigint NULL,
  ADD COLUMN idempotency_key varchar(64) NULL,
  ADD COLUMN approved_by bigint NULL,
  ADD COLUMN approved_at timestamp NULL,
  ADD COLUMN cancelled_by bigint NULL,
  ADD COLUMN cancelled_at timestamp NULL,
  MODIFY COLUMN status enum('draft','confirmed','cancelled','pending_approval') NOT NULL DEFAULT 'draft',
  ADD UNIQUE KEY uq_ibh_tenant_idem (tenant_id, idempotency_key),
  ADD KEY idx_ibh_tenant_po (tenant_id, po_id);

ALTER TABLE h_inbound_lines
  ADD COLUMN po_line_id bigint NULL,
  ADD COLUMN lot_id bigint NULL,
  ADD COLUMN receipt_tx_id bigint NULL,
  ADD COLUMN production_date date NULL,
  ADD COLUMN inspection_result enum('pending','pass','fail','conditional') NULL,
  ADD COLUMN inspection_json json NULL,
  ADD COLUMN inspected_by bigint NULL,
  ADD COLUMN inspected_at timestamp NULL,
  ADD COLUMN cancelled_qty decimal(10,3) NOT NULL DEFAULT 0,
  ADD UNIQUE KEY uq_ibl_tenant_header_line (tenant_id, header_id, line_number),
  ADD UNIQUE KEY uq_ibl_tenant_lot (tenant_id, lot_id),
  ADD KEY idx_ibl_tenant_po_line (tenant_id, po_line_id);

-- 입고 줄 하나에 LOT 하나. 재시도·동시 확정의 두 번째 INSERT 는 여기서 막힌다.
-- 입고 취소는 LOT 수량만 되돌리고 연결은 남긴다. 다시 받으면 새 입고 줄 → 새 LOT.
ALTER TABLE h_inventory_lots
  ADD COLUMN inbound_line_id bigint NULL,
  ADD UNIQUE KEY uq_lot_tenant_inbound_line (tenant_id, inbound_line_id);

-- 매입전표는 입고에 연결만 (PR-5 에서 사용)
ALTER TABLE accounting_purchases
  ADD COLUMN inbound_line_id bigint NULL,
  ADD KEY idx_ap_tenant_inbound_line (tenant_id, inbound_line_id);

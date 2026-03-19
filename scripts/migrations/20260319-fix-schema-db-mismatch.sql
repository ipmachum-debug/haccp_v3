-- ============================================================
-- Migration: Fix Schema ↔ DB Column Mismatch
-- Date: 2026-03-19
-- Author: AI Developer
-- 
-- 문제: Drizzle ORM 스키마에 정의된 컬럼이 실제 MySQL DB에 존재하지 않아
--       SELECT * 쿼리(expiringLots 등)에서 "Unknown column" 에러 발생.
--       이로 인해 inventory.getDashboard API가 500 에러를 반환하고
--       재고 현황(현황 탭), 발주 탭이 "로딩 중" 또는 "데이터 없음" 표시.
--
-- 해결: DB에 누락된 컬럼 추가
-- ============================================================

-- 1. h_inventory_lots: current_quantity 컬럼 추가
--    스키마: drizzle/schema/part2.ts:70
--    용도: 현재 재고 수량 (available_quantity와 별도 추적)
ALTER TABLE h_inventory_lots 
  ADD COLUMN IF NOT EXISTS current_quantity DECIMAL(10,3) DEFAULT NULL AFTER quantity;

-- 2. h_batches: 원가 계산 관련 컬럼 7개 추가  
--    스키마: drizzle/schema_main.ts:495-501
--    용도: 배치 수율/손실/원가 추적 (CCP Scheduler에서 SELECT * 사용)
ALTER TABLE h_batches 
  ADD COLUMN IF NOT EXISTS actual_yield DECIMAL(10,2) DEFAULT NULL AFTER actual_quantity,
  ADD COLUMN IF NOT EXISTS loss_quantity DECIMAL(10,2) DEFAULT NULL AFTER actual_yield,
  ADD COLUMN IF NOT EXISTS material_cost DECIMAL(15,2) DEFAULT NULL AFTER loss_quantity,
  ADD COLUMN IF NOT EXISTS labor_cost DECIMAL(15,2) DEFAULT NULL AFTER material_cost,
  ADD COLUMN IF NOT EXISTS overhead_cost DECIMAL(15,2) DEFAULT NULL AFTER labor_cost,
  ADD COLUMN IF NOT EXISTS total_cost DECIMAL(15,2) DEFAULT NULL AFTER overhead_cost,
  ADD COLUMN IF NOT EXISTS unit_cost DECIMAL(15,2) DEFAULT NULL AFTER total_cost;

-- 3. 검증
SELECT 'h_inventory_lots.current_quantity' as col, 
       COUNT(*) as exists_check
FROM information_schema.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'h_inventory_lots' 
  AND COLUMN_NAME = 'current_quantity'
UNION ALL
SELECT 'h_batches.actual_yield',
       COUNT(*)
FROM information_schema.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'h_batches' 
  AND COLUMN_NAME = 'actual_yield';

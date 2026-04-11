-- 4/6 배치 상태 확인 및 completed로 변경

-- 1. 현재 상태 확인
SELECT id, batch_code, status, actual_quantity, completed_at
FROM h_batches
WHERE tenant_id = 2 AND planned_date = '2026-04-06';

-- 2. planned → completed 변경 (승인 완료된 배치)
UPDATE h_batches
SET status = 'completed',
    actual_quantity = planned_quantity,
    completed_at = NOW()
WHERE tenant_id = 2
  AND planned_date = '2026-04-06'
  AND status = 'planned';

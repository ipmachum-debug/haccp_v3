-- =====================================================================
-- 스케줄러 중복 알림 정리 + 안전재고 설정 점검   2026-10-13
-- =====================================================================
-- 적용 일자: (Genspark 실행 시 기입)
-- 실행 환경: 운영 DB haccp_tenant_db (MySQL 8.0)
-- 실행 주체: Genspark — §0 백업 → §1 현황 → §2 읽음 처리 → §3 검증 → §4 안전재고 점검 목록 (CEO 결정)
-- 전제:     PR "fix(dashboard): 경영 상황판 지표 보정 + 스케줄러 중복 알림 억제" 배포 완료
--           (이후 스케줄러는 같은 대상의 미읽음 알림이 있으면 재발행하지 않는다)
-- 롤백:     §0 백업에서 is_read / read_at 복원 (데이터 삭제 없음)
--
-- 배경 (덤프 2026-10-10 실측, tenant 2)
--   · 미읽음 알림 25,111건. 재고 부족 계열 20,301 (low_stock_critical 16,899 / low_stock 3,004 / low_stock_warning 398),
--     유통기한 계열 3,893 (expiry_urgent 3,755 / expiry_warning_7d 79 / expiry_warning_3d 59),
--     일일마감 보고 475, 배치 미완료 215, 미수금 125.
--   · 원인: 스케줄러 3개가 "오늘 이미 보냈는가" 만 보고 매일 새 알림 발행. 같은 자재·LOT 알림이 날마다 쌓임.
--   · 경영 상황판 "승인 대기 200건" 은 이 미읽음 알림 수(목록 API 상한 200)였다. 실제 승인 대기는 2건.
--
-- 규칙
--   · 같은 (tenant, type, 대상) 의 미읽음 알림 중 최신 1건만 남기고 나머지는 읽음 처리.
--     대상 = reference_id 가 있으면 reference_id, 없으면 message 의 LOT/자재명 부분(제목 title) 으로 묶는다.
--   · 일일마감 보고(daily_closing_report)·배치 미완료·미수금은 7일보다 오래된 것만 읽음 처리.
-- =====================================================================

-- ---------------------------------------------------------------------
-- §0. 백업 (is_read 관련 컬럼만, 전 테넌트)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS _bak_notif_20261013 AS
  SELECT id, tenant_id, user_id, notification_type, is_read, read_at FROM h_notifications;
SELECT (SELECT COUNT(*) FROM _bak_notif_20261013) AS bak, (SELECT COUNT(*) FROM h_notifications) AS src;
-- → bak = src 확인 후 진행. (6-a 정리 대상 목록에 추가)

-- ---------------------------------------------------------------------
-- §1. 현황
-- ---------------------------------------------------------------------
SELECT tenant_id, notification_type, COUNT(*) AS unread
FROM h_notifications WHERE is_read = 0
GROUP BY 1, 2 ORDER BY 3 DESC;

-- ---------------------------------------------------------------------
-- §2. 읽음 처리
-- ---------------------------------------------------------------------
-- 2-a. 상태형 알림: (tenant, type, 대상키) 별 최신 1건만 남긴다
--      대상키 = COALESCE(reference_id, title)  — 재고 부족은 title 에 자재명, 유통기한은 title 에 자재명 + message 에 LOT
DROP TEMPORARY TABLE IF EXISTS tmp_notif_keep;
CREATE TEMPORARY TABLE tmp_notif_keep AS
  SELECT MAX(id) AS keep_id
  FROM h_notifications
  WHERE is_read = 0
    AND notification_type IN ('low_stock_critical','low_stock','low_stock_warning',
                              'expiry_urgent','expiry_warning_7d','expiry_warning_3d')
  GROUP BY tenant_id, notification_type, COALESCE(reference_id, 0), CASE WHEN reference_id IS NULL THEN title ELSE '' END;

UPDATE h_notifications n
LEFT JOIN tmp_notif_keep k ON k.keep_id = n.id
SET n.is_read = 1, n.read_at = NOW()
WHERE n.is_read = 0
  AND n.notification_type IN ('low_stock_critical','low_stock','low_stock_warning',
                              'expiry_urgent','expiry_warning_7d','expiry_warning_3d')
  AND k.keep_id IS NULL;
-- 예상 ≈ 24,000 (tenant 2)

-- 2-b. 일자형 알림: 7일보다 오래된 것은 읽음 처리
UPDATE h_notifications
SET is_read = 1, read_at = NOW()
WHERE is_read = 0
  AND notification_type IN ('daily_closing_report','batch_incomplete_warning','ar_overdue')
  AND created_at < DATE_SUB(NOW(), INTERVAL 7 DAY);

DROP TEMPORARY TABLE IF EXISTS tmp_notif_keep;

-- ---------------------------------------------------------------------
-- §3. 검증 — §1 재실행. 재고 부족·유통기한 계열은 자재/LOT 수 수준(수십 건)이어야 한다
-- ---------------------------------------------------------------------
SELECT tenant_id, notification_type, COUNT(*) AS unread
FROM h_notifications WHERE is_read = 0
GROUP BY 1, 2 ORDER BY 3 DESC;

-- ---------------------------------------------------------------------
-- §4. 안전재고 설정 점검 목록 (CEO 결정 — 코드로 숨기지 않고 자재 설정에서 고친다)
-- ---------------------------------------------------------------------
-- 활성 자재 중 안전재고 > 0 인데 거래 이력이 한 번도 없는 자재 (덤프 기준 8건).
-- 실제로 쓰지 않는 자재면 안전재고를 0 으로 바꾸거나 비활성화 → "재고 경고 31" 이 그만큼 줄어든다.
SELECT m.id, m.material_name, m.material_code, m.safety_stock_level, m.unit, m.is_active
FROM h_materials m
WHERE m.tenant_id = 2 AND m.is_active = 1 AND COALESCE(m.safety_stock_level, 0) > 0
  AND NOT EXISTS (SELECT 1 FROM h_inventory_transactions t WHERE t.material_id = m.id AND t.tenant_id = 2)
ORDER BY m.material_name;

-- 참고: 나머지 재고 경고(거래 이력은 있으나 현재 0) 는 실사(PRODUCTION_JOURNAL_START_DATE) 때 실재고로 맞추면 해소된다.

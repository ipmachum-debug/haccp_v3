/**
 * db.ts - Barrel file (re-export hub)
 *
 * v2-rebuild: 도메인별 서브디렉토리 구조로 재편
 *
 * 기존 import 예시:
 *   import { getDb, createBatch, getAllUsers } from '../db';
 * → 그대로 동작합니다.
 *
 * 새로운 import 방식 (권장):
 *   import { getDb } from '../db/connection';
 *   import { createBatch } from '../db/production/batchFunctions';
 *   import { getAllUsers } from '../db/system/userManagement';
 *
 * 도메인 디렉토리:
 *   - production/: 배치, 생산, 원가, BOM, 레시피
 *   - haccp/: CCP, 검사, 체크리스트, 설비, HACCP 통합
 *   - accounting/: 회계, 분개, 재무보고서, 원장
 *   - inventory/: 재고, LOT, 입출고, 수불부
 *   - ai/: AI 엔진, 규칙, 지식베이스, 예측
 *   - system/: 대시보드, 알림, 감사, 사용자, 설정
 */

// ── 인프라 (루트) ──
export { getDb, getRawConnection, withTransaction } from './db/connection';

// ── production ──
export * from './db/production/batchFunctions';
export * from './db/production/productAndCcp';
export * from './db/production/costAnalysis';
export * from './db/production/productionAnalytics';

// ── haccp ──
export * from './db/haccp/ccpScheduleFunctions';
export * from './db/haccp/checklistAndInspection';
export * from './db/haccp/equipmentGroupsTenant';

// ── inventory ──
export * from './db/inventory/inventoryFunctions';
export * from './db/inventory/inventoryForecastAPI';

// ── system ──
export * from './db/system/userManagement';
export * from './db/system/notificationFunctions';
export * from './db/system/auditApprovalSupplier';
// dashboardAndAnalytics barrel skipped (duplicate exports with costAnalysis + dashboardStats)
export * from './db/system/dashboardStats';

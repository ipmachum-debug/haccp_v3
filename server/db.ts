/**
 * db.ts - Barrel file (re-export hub)
 *
 * 기존 9,119줄의 모놀리식 파일을 도메인별 모듈로 분리했습니다.
 * 이 파일은 하위 호환성을 위해 모든 도메인 모듈을 re-export합니다.
 *
 * 기존 import 예시:
 *   import { getDb, createBatch, getAllUsers } from '../db';
 * → 그대로 동작합니다.
 *
 * 새로운 import 방식 (권장):
 *   import { getDb } from '../db/connection';
 *   import { createBatch } from '../db/batchFunctions';
 *   import { getAllUsers } from '../db/userManagement';
 *
 * 도메인 모듈 목록:
 *   - connection.ts: DB 연결 (getDb, getRawConnection)
 *   - userManagement.ts: 사용자 CRUD, 권한 관리
 *   - batchFunctions.ts: 배치 CRUD, 코드 생성, 보고서, 완료 처리
 *   - productAndCcp.ts: 제품, 레시피, CCP 템플릿/인스턴스/이탈
 *   - inventoryFunctions.ts: 재고, 원재료, LOT, 입출고
 *   - ccpScheduleFunctions.ts: CCP 점검 일정
 *   - notificationFunctions.ts: 알림 CRUD, 통계
 *   - checklistAndInspection.ts: 체크리스트, 검사 시스템
 *   - auditApprovalSupplier.ts: 감사로그, 승인, 거래처, 평가
 *   - dashboardAndAnalytics.ts: 대시보드, 통계, 원가, 수익성, 예측
 *   - equipmentGroupsTenant.ts: 설비, 사용자그룹, 생산일정, 테넌트
 */

// DB 연결
export { getDb, getRawConnection, withTransaction } from './db/connection';

// 사용자 관리
export * from './db/userManagement';

// 배치 관리
export * from './db/batchFunctions';

// 제품, 레시피, CCP
export * from './db/productAndCcp';

// 재고, 원재료, LOT
export * from './db/inventoryFunctions';

// CCP 점검 일정
export * from './db/ccpScheduleFunctions';

// 알림
export * from './db/notificationFunctions';

// 체크리스트, 검사
export * from './db/checklistAndInspection';

// 감사로그, 승인, 거래처, 평가
export * from './db/auditApprovalSupplier';

// 대시보드, 통계, 분석
export * from './db/dashboardAndAnalytics';

// 설비, 사용자그룹, 생산일정, 테넌트
export * from './db/equipmentGroupsTenant';

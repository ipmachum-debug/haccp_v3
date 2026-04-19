# Millio AI API 레퍼런스

> 자동 생성일: 2026-03-28 | 프로토콜: tRPC v11 | 인증: JWT (세션 기반)

---

## 인증 방식

모든 API는 세션 기반 JWT 인증을 사용합니다.
- `publicProcedure`: 인증 불필요 (auth.login, auth.register 등)
- `tenantRequiredProcedure`: 로그인 + 테넌트 필수
- `adminProcedure`: 관리자 권한 필요
- `workerProcedure`: 작업자 이상 권한

---

## 도메인별 API 엔드포인트

### 🔐 인증 (auth)
| 엔드포인트 | 타입 | 권한 | 설명 |
|-----------|------|------|------|
| `auth.me` | query | public | 현재 로그인 사용자 조회 |
| `auth.register` | mutation | public | 회원가입 (관리자 승인 필요) |
| `auth.login` | mutation | public | 로그인 |
| `auth.logout` | mutation | public | 로그아웃 |
| `auth.passwordReset` | mutation | public | 비밀번호 재설정 |

### 📦 생산 관리 (batch / production)
| 엔드포인트 | 타입 | 권한 | 설명 |
|-----------|------|------|------|
| `batch.list` | query | tenant | 배치 목록 조회 |
| `batch.getById` | query | tenant | 배치 상세 조회 |
| `batch.create` | mutation | worker | 배치 생성 |
| `batch.update` | mutation | worker | 배치 수정 |
| `batch.delete` | mutation | admin | 배치 삭제 |
| `batch.completeBatch` | mutation | worker | 배치 완료 처리 |
| `batch.startBatch` | mutation | worker | 배치 시작 |
| `dailyReport.getProduction` | query | tenant | 일별 생산 실적 |
| `dailyReport.getReportById` | query | tenant | 생산일보 상세 (인쇄용) |
| `dailyReport.regenerateReport` | mutation | admin | 생산일보 재생성 |
| `dailyReport.submitApproval` | mutation | worker | 생산일보 승인 요청 |

### 🔬 CCP 관리 (ccp / ccpForm)
| 엔드포인트 | 타입 | 권한 | 설명 |
|-----------|------|------|------|
| `ccp.getByBatchId` | query | tenant | 배치별 CCP 인스턴스 조회 |
| `ccp.getInstanceById` | query | tenant | CCP 인스턴스 상세 |
| `ccp.addRow` | mutation | worker | CCP 점검 행 추가 |
| `ccpForm.getByBatch` | query | tenant | 배치별 CCP 기록지 조회 |
| `ccpForm.getById` | query | tenant | CCP 기록지 단건 조회 |

### 📊 재고 관리 (inventory)
| 엔드포인트 | 타입 | 권한 | 설명 |
|-----------|------|------|------|
| `inventory.getDashboard` | query | tenant | 재고 현황 대시보드 |
| `inventory.list` | query | tenant | LOT 목록 조회 |
| `inventory.getTrend` | query | tenant | 재고 이동 추이 |
| `inventory.getTurnoverAnalysis` | query | tenant | 회전율 분석 |
| `inventory.releaseStock` | mutation | worker | 재고 출고 |
| `inventory.adjustStock` | mutation | admin | 재고 조정 |
| `inventory.getInboundHistory` | query | tenant | 입고 이력 |
| `inventory.getProductAvailableForRelease` | query | tenant | 제품 출고 가능 재고 |
| `inventory.createProductOutbound` | mutation | worker | 제품 출고 등록 |
| `inventory.getProductOutboundHistory` | query | tenant | 제품 출고 이력 |
| `inventory.getProductOutboundStats` | query | tenant | 제품 출고 통계 |
| `inventory.predictAllShortage` | query | tenant | 재고 부족 예측 |
| `inventory.getPurchaseOrderSuggestions` | query | tenant | 발주 제안 |

### 💰 회계 (accounting / expense / financialReports)
| 엔드포인트 | 타입 | 권한 | 설명 |
|-----------|------|------|------|
| `haccpIntegration.listPurchases` | query | tenant | 매입 목록 |
| `haccpIntegration.listSales` | query | tenant | 매출 목록 |
| `haccpIntegration.createPurchase` | mutation | worker | 매입 등록 |
| `haccpIntegration.createSale` | mutation | worker | 매출 등록 |
| `expense.list` | query | tenant | 비용 전표 목록 |
| `expense.create` | mutation | worker | 비용 전표 생성 |
| `expense.post` | mutation | admin | 비용 전표 확정 |
| `financialReports.trialBalance` | query | tenant | 시산표 |
| `financialReports.balanceSheet` | query | tenant | 재무상태표 |
| `financialReports.incomeStatement` | query | tenant | 손익계산서 |
| `apLedger.list` | query | tenant | 매입 원장 |
| `arLedger.list` | query | tenant | 매출 원장 |

### 🏭 마스터 데이터 (material / product / partners / supplier)
| 엔드포인트 | 타입 | 권한 | 설명 |
|-----------|------|------|------|
| `material.list` | query | tenant | 원재료 목록 |
| `material.create` | mutation | admin | 원재료 등록 |
| `product.list` | query | tenant | 제품 목록 |
| `partners.list` | query | tenant | 거래처 목록 |
| `partners.create` | mutation | tenant | 거래처 등록 |
| `partners.getById` | query | tenant | 거래처 상세 |
| `supplier.list` | query | tenant | 공급업체 목록 |
| `itemMaster.list` | query | tenant | 품목 마스터 목록 |

### 📋 검사/체크리스트 (inspection / checklist / genericChecklist)
| 엔드포인트 | 타입 | 권한 | 설명 |
|-----------|------|------|------|
| `visualInspection.getOrCreateMonthly` | mutation | tenant | 육안검사일지 월별 생성/조회 |
| `visualInspection.syncReceivings` | mutation | tenant | 원재료 입고 자동 동기화 |
| `finishedProductInspection.getOrCreateMonthly` | mutation | tenant | 완제품출고검사 월별 생성/조회 |
| `finishedProductInspection.syncOutbounds` | mutation | tenant | 출고 데이터 자동 동기화 |
| `genericChecklist.submit` | mutation | tenant | 체크리스트 제출 |
| `genericChecklist.getById` | query | tenant | 체크리스트 상세 |
| `dailyLog.getByDate` | query | tenant | 일일일지 조회 |

### ✅ 승인 관리 (approval)
| 엔드포인트 | 타입 | 권한 | 설명 |
|-----------|------|------|------|
| `approval.list` | query | tenant | 승인 요청 목록 |
| `approval.getById` | query | tenant | 승인 요청 상세 |
| `approval.approve` | mutation | admin | 승인 |
| `approval.reject` | mutation | admin | 반려 |
| `approval.requestBatchApproval` | mutation | worker | 배치 승인 요청 |

### 🏦 은행 관리 (bankTransaction / matchingRules)
| 엔드포인트 | 타입 | 권한 | 설명 |
|-----------|------|------|------|
| `bankTransaction.list` | query | tenant | 은행 거래 목록 |
| `bankTransaction.upload` | mutation | admin | 거래 내역 업로드 |
| `matchingRules.list` | query | tenant | 매칭 규칙 목록 |
| `matchingRules.create` | mutation | admin | 매칭 규칙 생성 |

### 🤖 AI 엔진 (ai)
| 엔드포인트 | 타입 | 권한 | 설명 |
|-----------|------|------|------|
| `ai.chat` | mutation | tenant | AI 챗봇 (하나) 대화 |
| `ai.runRules` | mutation | admin | 규칙엔진 수동 실행 |
| `ai.getAlerts` | query | tenant | AI 알림 조회 |
| `ai.searchKnowledge` | query | tenant | 지식베이스 검색 |
| `ai.uploadDocument` | mutation | admin | 지식베이스 문서 업로드 |

### 📝 품목제조보고 (mfReport)
| 엔드포인트 | 타입 | 권한 | 설명 |
|-----------|------|------|------|
| `mfReport.list` | query | tenant | 품목제조보고 목록 |
| `mfReport.getById` | query | tenant | 품목제조보고 상세 |
| `mfReport.createVersion` | mutation | admin | 새 버전 생성 |
| `mfReport.approveVersion` | mutation | admin | 버전 승인 |

### 🔧 시스템 (system / notification / user)
| 엔드포인트 | 타입 | 권한 | 설명 |
|-----------|------|------|------|
| `user.list` | query | admin | 사용자 목록 |
| `user.approve` | mutation | admin | 사용자 승인 |
| `notification.list` | query | tenant | 알림 목록 |
| `notification.markAsRead` | mutation | tenant | 알림 읽음 처리 |
| `excel.export` | mutation | tenant | 엑셀 내보내기 |
| `excelImport.import` | mutation | admin | 엑셀 가져오기 |

---

## 공통 에러 코드

| 코드 | 설명 |
|------|------|
| `UNAUTHORIZED` | 로그인 필요 |
| `FORBIDDEN` | 권한 없음 (테넌트/역할) |
| `NOT_FOUND` | 리소스 미존재 |
| `BAD_REQUEST` | 입력 검증 실패 |
| `INTERNAL_SERVER_ERROR` | 서버 내부 오류 |

---

## 유틸리티 파일

| 파일 | 설명 |
|------|------|
| `server/utils/logger.ts` | 구조적 로깅 (logInfo/logWarn/logError/logSecurity) |
| `server/utils/dbHelpers.ts` | DB 결과 타입 헬퍼 (getRows/getFirstRow/getInsertId) |
| `server/db/journalHelper.ts` | 회계 분개 공통 함수 |
| `client/src/hooks/useTabWithUrl.ts` | 탭 상태 URL 유지 훅 |
| `client/src/components/PaginatedTable.tsx` | 페이지네이션/정렬 공통 컴포넌트 |

---

## 등록된 라우터 (127개)

```
accountCategories, accounting, accountingAccountCategories, accountingAccounts,
accountingDaily, accountingDocuments, accountingMonthly, admin, adminEmployee,
ai, aiProductionParser, airCompressor, apLedger, approval, arLedger,
auditLog, auditLogs, auth, bankAccount, bankTransaction, bankTransactionBulk,
banner, batch, batchApproval, batchCost, batchSchedule, board, calibration,
capaRecord, categories, ccp, ccpForm, ccpMonitoring, ccpSchedule, ccpTemplate,
checklist, checklistDashboard, checklistInstance, checklistSchedule, checklistStats,
checklistTemplate, communicationLogs, correctiveAction, costAnalysis, costSavingAI,
dailyLog, dailyReport, dashboard, documentApproval, documentPrint, employee,
equipment, equipmentCleaningRecord, excel, excelImport, expense, favorites,
financialReports, finishedProductInspection, foreignMaterialRecord, genericChecklist,
group, haccpIntegration, haccpPlanVerification, hazardAnalysis, healthCertificate,
hygiene, inspection, intermediate, internalAudit, inventory, inventoryAccounting,
itemMaster, lotManagement, matchingRules, material, materialLedger, metalDetection,
mfReport, monthlyLog, nonconformingProduct, notification, notificationSettings,
opscoreSync, organization, packagingStorageRecord, partners, personalHygieneCheck,
pestControl, pipeline, product, productSku, production, productionDashboard,
productionPrediction, productionSchedule, qualityChecklist, qualityIssueRecord,
recallSimulation, recipe, recipeApproval, recipeManagement, refrigerationCheck,
report, reports, scheduleOptimization, scheduler, stockAlerts, subscription,
superadmin, superadminApproval, superadminDashboard, supplier, supplierAudit,
supplierEvaluation, support, system, templateSettings, tenant, tenants,
tenantsPublic, traceability, training, uploadHistory, user, validityEvaluation,
visualInspection, waterQualityTest, waterUsageCheck, weeklyLog, yearlyLog
```

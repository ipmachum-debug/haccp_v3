# 14a. 메뉴·라우트 인벤토리 — 109개 메뉴 경로의 행선지

> 생성: 2026-10-14, main `cd3fcbbb` 기준 (10/14 백업 `44b4c99d` + #482~#485).
> 본문: [14-ui-ux-restructure-spec.md](./14-ui-ux-restructure-spec.md). 추출 방법은 본문 §1-1.
> 재생성: 메뉴 정의가 바뀌면 이 표를 다시 뽑는다 (2단계 이후에는 메뉴 레지스트리에서 자동 생성).

**처리 구분**
- **유지**: 허브 안에서 독립 업무로 남는다.
- **통합**: 다른 화면의 탭·버튼·목록으로 들어간다. **경로는 살리고**(리다이렉트 또는 그대로) 메뉴 항목만 없앤다.
- **이동**: 다른 허브로 옮긴다.
- 폐기는 이번 표에 없다. 화면 삭제는 4단계 측정 뒤 별도 결정.

| 처리 | 수 |
|---|---:|
| 유지 | 55 (2-b-2 재분류 +3: 마스터 데이터 · 거래처 피드 · 커뮤니케이션 로그 / 2026-10-14 매입·매출 허브 개편으로 매입 입력·매출 입력 메뉴 복귀 +2) |
| 통합 | 52 — **완료 42** (Deviation 트렌드 2-b-2 · 업종 품질 41 2-c) · 2-c 보류 2 (식품 부적합·시정조치 — 14c 결정) · 3-b 6 · P-2 2 |
| 이동 | 2 |

**CEO 조건부 승인 (2026-10-14)**: 메뉴 통합은 승인, 업무 기능 통합은 별도 검증. 본문 §3-1 의 8개 분리 항목은 같은 허브 안에서도 업무·정본을 나눈다.
"통합" 행은 2-b·2-c PR 에서 아래 두 열을 채워야 머지한다 — **통합 후 접근 위치** (새 허브 → 화면 → 탭·버튼, 1:1) · **기능 손실 확인** (필드 / 승인 흐름 / 기록 보존 / 출력 각각 동일 여부). 2-b-2 (2026-10-14) 에서 전 행에 예정 위치를 적었고, 완료 건은 ✓.

**허브 개편 (2026-10-14 CEO)**: 구매·입고 + 판매·출고 → **매입·매출 관리** (허브 안 [매입 | 매출] 탭). 아래 표의 허브 열은 개편 후 기준. 매입·매출 6개 화면의 기능·라우트·권한은 그대로다.

## A. 메뉴 경로 109개

| 허브 | 처리 | 경로 | 현재 메뉴명 | 노출 역할 (super_admin 제외) | 정의 위치 | 화면 컴포넌트 | 비고 | 통합 후 접근 위치 | 기능 손실 확인 |
|---|---|---|---|---|---|---|---|---|---|
| 오늘 할 일 | 통합 | /dashboard | 대시보드 / 통합 대시보드 | accountant, admin, inspector, monitor, user, worker | HACCP탭(legacy), WORK탭, 공통(plugin엔진), 슈퍼관리자 | Dashboard | 통합 대시보드·대시보드·Today 3곳 → "오늘 할 일" 첫 화면(역할별). 경로 유지 | 3-b 업무함(오늘 할 일 입구) 뒤 — 지금은 유지 | 통합 시점에 확인 |
| 오늘 할 일 | 통합 | /dashboard/approval | 승인 관리 | admin, inspector, monitor, worker | HACCP탭(legacy), 공통(plugin엔진) | ApprovalManagement | 승인 → 업무함 탭 | 3-b 업무함 — 승인 처리 흐름 포함 후 메뉴 제거 | 통합 시점에 확인 |
| 오늘 할 일 | 통합 | /dashboard/notifications | 알림 관리 | accountant, admin, inspector, monitor, worker | HACCP탭(legacy), WORK탭, 공통(plugin엔진) | NotificationManagement,NotificationHisto | 알림 → 업무함(받은편지함) 탭 | 3-b 업무함 | 통합 시점에 확인 |
| 오늘 할 일 | 통합 | /dashboard/today | Today | admin, inspector, user, worker | WORK탭, 슈퍼관리자 | Today | Today → "오늘 할 일" 으로 흡수. createdAt→planned_date 버그 선수정(§2-3) | 3-b 역할별 첫 화면 — 0-1 로 데이터 정합성은 확보 | 통합 시점에 확인 |
| 매입·매출 | 유지 | /dashboard/accounting/communication-log | 커뮤니케이션 로그 | admin | 회계탭 | lazy(() => import("@/pages/accounting/Co | 거래처 상세의 탭으로 — 거래처 상세 "활동" 탭은 CRM 활동(partnerCrm)이고 커뮤니케이션 로그는 별도 테이블·전 거래처 조회라 탭으로 흡수 불가. 유지 (2-b-2 재분류) | (유지) | - |
| 매입·매출 | 유지 | /dashboard/accounting/partner-prices | 단가표 | admin | 회계탭 | lazy(() => import("@/pages/accounting/Pa | 단가표 |  |  |
| 매입·매출 | 유지 | /dashboard/accounting/partners | 거래처 | admin | 회계탭 | lazy(() => import("@/pages/accounting/Pa | 거래처 — 매입·매출 공용. 매입·매출 관리 허브의 거래처 소구역(두 탭 모두 표시) |  |  |
| 매입·매출 | 유지 | /dashboard/accounting/purchase-orders | 발주서 (이전 '발주·구매') | admin | 회계탭 | lazy(() => import("@/pages/accounting/Pu | 발주 |  |  |
| 매입·매출 | 유지 | /dashboard/accounting/purchases/create | 매입 입력 (이전 '매입 등록') | admin | 회계탭 | lazy(() => import("@/pages/accounting/Pu | 2-b-2 에서 조회 화면 버튼으로 통합했다가 매입·매출 허브 개편으로 메뉴 복귀 (조회 화면 [＋ 입력] 바로가기는 유지) | 매입·매출 관리 → [매입] 탭 → 매입 입력 | 동일 페이지 ✓ |
| 매입·매출 | 유지 | /dashboard/accounting/purchases/list | 매입 조회 | admin | 회계탭 | lazy(() => import("@/pages/accounting/Pu | 매입 (조회가 입구, 등록은 버튼) |  |  |
| 매입·매출 | 유지 | /dashboard/partners/feed | 거래처 피드 (CRM) | admin | 회계탭 | lazy(() => import("@/pages/partners/Part | 거래처 상세의 탭으로 — 거래처 **목록**의 SNS 식 뷰(PartnerFeedPage) 라 거래처 상세 탭이 될 수 없음. 구매·입고 허브에 유지, 향후 거래처 목록의 뷰 토글로 (2-b-2 재분류) | (유지) | - |
| 품목·재고 | 유지 | /dashboard/item-master | 품목 마스터 | accountant, admin | HACCP탭(legacy), 공통(plugin엔진), 회계탭 | lazy(() => import("@/pages/master/ItemMa | 품목 등록·SKU — 품목 정본(item_master) |  |  |
| 품목·재고 | 유지 | /dashboard/master-data | 마스터 데이터 | accountant, admin | HACCP탭(legacy), 공통(plugin엔진), 회계탭 | MasterDataManagement | 품목 마스터와 중복 영역 정리 후 기준정보 탭으로 (원재료·제품·카테고리) — 품목·재고 허브의 "기준정보(원재료·제품·카테고리·공급업체·매핑)". CEO 분리 항목 1: 품목 마스터(정체성) ↔ 기준정보(수량 세계) 는 통합하지 않는다 (2-b-2 재분류) | (유지) | - |
| 품목·재고 | 유지 | /inventory-management | 재고 관리 | accountant, admin, worker | HACCP탭(legacy), 공통(plugin엔진), 회계탭 | InventoryManagementIntegrated | 재고 현황·LOT·수불·입출고·실사·조정 (실사·조정은 권한 분리 유지) |  |  |
| 생산관리 | 유지 | /dashboard/manufacturing-standards | 제조기준관리 | admin, worker | HACCP탭(legacy), p:food | ManufacturingStandards | 배합·BOM·품목제조보고 — 기준정보라 실적과 분리 유지 (원칙 3) |  |  |
| 생산관리 | 통합 | /dashboard/production-management | 생산관리 | admin, worker | HACCP탭(legacy), p:food | ProductionManagement | 생산 허브 첫 화면 = 오늘의 생산(계획·진행 중 지시) | P-2·3-b 생산 허브 입구(오늘의 생산) 쓰기 연결 뒤 — 파일럿 끝날 때까지 유지 | 통합 시점에 확인 |
| 생산관리 | 통합 | /dashboard/production-operations | 생산운영 | admin, worker | HACCP탭(legacy), p:food | ProductionOperations | 생산 허브의 계획·일지 화면으로 | P-2·3-b | 통합 시점에 확인 |
| 품질·규정 | 통합 | /corrective-actions | 시정조치 관리 | admin, inspector, monitor, worker | HACCP탭(legacy), p:food | CorrectiveActionList | 식품 전용 시정조치 → 공통 CAPA 1벌로 | 유지 권장 — 식품 CAR(CCP 이탈·F-3·SLA)은 공통 CAPA 로 대체 불가. 14c §3-2. 2-c 에서 화면 → 식품 CAR API 연결 버그 수정 | 14c 비교표 참조 |
| 품질·규정 | 유지 | /dashboard/audit-management | 감사관리 | admin, inspector, monitor | HACCP탭(legacy), p:food | AuditManagement | 감사·검증 |  |  |
| 품질·규정 | 통합 | /dashboard/cosmetic/audit | 감사 (Audit) | admin, inspector, monitor | HACCP탭(legacy), p:cosmetic | CosmeticAudit | 감사 공통 1벌 (/quality/audit) — 업종은 테넌트 설정, 차이는 정책 데이터. 이미 공통 페이지 래퍼 | 품질·규정 → 감사 (Audit) — 공통 경로 /quality/audit (업종은 테넌트 설정에서 자동, 옛 경로는 리다이렉트) (2-c 완료) | 같은 공통 페이지에 같은 업종 값 — 필드·승인 흐름·기록 보존·출력 동일 ✓ |
| 품질·규정 | 유지 | /dashboard/cosmetic/bmr | BMR (제조기록) | admin, inspector, monitor | HACCP탭(legacy), p:cosmetic | CosmeticBmrList | 화장품 GMP 전용 기능 (업종 메뉴로 노출) |  |  |
| 품질·규정 | 통합 | /dashboard/cosmetic/calibration | 검교정 / 설비 자격 | admin, inspector, monitor | HACCP탭(legacy), p:cosmetic | CosmeticCalibration | 검교정 공통 1벌 (/quality/calibration) — 업종은 테넌트 설정, 차이는 정책 데이터. 이미 공통 페이지 래퍼 | 품질·규정 → 검교정 / 설비 자격 — 공통 경로 /quality/calibration (업종은 테넌트 설정에서 자동, 옛 경로는 리다이렉트) (2-c 완료) | 같은 공통 페이지에 같은 업종 값 — 필드·승인 흐름·기록 보존·출력 동일 ✓ |
| 품질·규정 | 통합 | /dashboard/cosmetic/change-control | 변경관리 | admin, inspector, monitor | HACCP탭(legacy), p:cosmetic | CosmeticChangeControl | 변경관리 공통 1벌 (/quality/change-control) — 업종은 테넌트 설정, 차이는 정책 데이터. 이미 공통 페이지 래퍼 | 품질·규정 → 변경관리 — 공통 경로 /quality/change-control (업종은 테넌트 설정에서 자동, 옛 경로는 리다이렉트) (2-c 완료) | 같은 공통 페이지에 같은 업종 값 — 필드·승인 흐름·기록 보존·출력 동일 ✓ |
| 품질·규정 | 통합 | /dashboard/cosmetic/corrective-action | CAPA (시정·예방) | admin, inspector, monitor | HACCP탭(legacy), p:cosmetic | CosmeticCorrectiveAction | CAPA·시정조치 공통 1벌 (/quality/corrective-action) — 업종은 테넌트 설정, 차이는 정책 데이터. 이미 공통 페이지 래퍼 | 품질·규정 → CAPA (시정·예방) — 공통 경로 /quality/corrective-action (업종은 테넌트 설정에서 자동, 옛 경로는 리다이렉트) (2-c 완료) | 같은 공통 페이지에 같은 업종 값 — 필드·승인 흐름·기록 보존·출력 동일 ✓ |
| 품질·규정 | 유지 | /dashboard/cosmetic/dashboard | GMP 운영 현황 | admin, inspector, monitor | HACCP탭(legacy), p:cosmetic | CosmeticDashboard | 화장품 GMP 전용 기능 (업종 메뉴로 노출) |  |  |
| 품질·규정 | 유지 | /dashboard/cosmetic/formula | 배합표 (Formula) | admin, inspector, monitor | HACCP탭(legacy), p:cosmetic | CosmeticFormulaList | 화장품 GMP 전용 기능 (업종 메뉴로 노출) |  |  |
| 품질·규정 | 유지 | /dashboard/cosmetic/label | 라벨 / 전성분 | admin, inspector, monitor | HACCP탭(legacy), p:cosmetic | CosmeticLabelList | 화장품 GMP 전용 기능 (업종 메뉴로 노출) |  |  |
| 품질·규정 | 통합 | /dashboard/cosmetic/nonconforming | 부적합 관리 | admin, inspector, monitor | HACCP탭(legacy), p:cosmetic | CosmeticNonconforming | 부적합 공통 1벌 (/quality/nonconforming) — 업종은 테넌트 설정, 차이는 정책 데이터. 이미 공통 페이지 래퍼 | 품질·규정 → 부적합 관리 — 공통 경로 /quality/nonconforming (업종은 테넌트 설정에서 자동, 옛 경로는 리다이렉트) (2-c 완료) | 같은 공통 페이지에 같은 업종 값 — 필드·승인 흐름·기록 보존·출력 동일 ✓ |
| 품질·규정 | 유지 | /dashboard/cosmetic/release | QA 출고 (Release) | admin, inspector, monitor | HACCP탭(legacy), p:cosmetic | CosmeticReleaseList | 화장품 GMP 전용 기능 (업종 메뉴로 노출) |  |  |
| 품질·규정 | 통합 | /dashboard/cosmetic/risk-assessment | 위험 평가 (ICH Q9) | admin, inspector, monitor | HACCP탭(legacy), p:cosmetic | CosmeticRiskAssessment | 위험평가 공통 1벌 (/quality/risk-assessment) — 업종은 테넌트 설정, 차이는 정책 데이터. 이미 공통 페이지 래퍼 | 품질·규정 → 위험 평가 (ICH Q9) — 공통 경로 /quality/risk-assessment (업종은 테넌트 설정에서 자동, 옛 경로는 리다이렉트) (2-c 완료) | 같은 공통 페이지에 같은 업종 값 — 필드·승인 흐름·기록 보존·출력 동일 ✓ |
| 품질·규정 | 유지 | /dashboard/cosmetic/stability | 안정성시험 | admin, inspector, monitor | HACCP탭(legacy), p:cosmetic | CosmeticStabilityList | 화장품 GMP 전용 기능 (업종 메뉴로 노출) |  |  |
| 품질·규정 | 통합 | /dashboard/cosmetic/supplier | 공급업체 (AVL) | admin, inspector, monitor | HACCP탭(legacy), p:cosmetic | CosmeticSupplier | 공급업체 평가 공통 1벌 (/quality/supplier) — 업종은 테넌트 설정, 차이는 정책 데이터. 이미 공통 페이지 래퍼 | 품질·규정 → 공급업체 (AVL) — 공통 경로 /quality/supplier (업종은 테넌트 설정에서 자동, 옛 경로는 리다이렉트) (2-c 완료) | 같은 공통 페이지에 같은 업종 값 — 필드·승인 흐름·기록 보존·출력 동일 ✓ |
| 품질·규정 | 통합 | /dashboard/cosmetic/training | 교육 / 훈련 | admin, inspector, monitor | HACCP탭(legacy), p:cosmetic | CosmeticTraining | 교육 공통 1벌 (/quality/training) — 업종은 테넌트 설정, 차이는 정책 데이터. 이미 공통 페이지 래퍼 | 품질·규정 → 교육 / 훈련 — 공통 경로 /quality/training (업종은 테넌트 설정에서 자동, 옛 경로는 리다이렉트) (2-c 완료) | 같은 공통 페이지에 같은 업종 값 — 필드·승인 흐름·기록 보존·출력 동일 ✓ |
| 품질·규정 | 유지 | /dashboard/document-output | 문서 출력 | accountant, admin, inspector, monitor | HACCP탭(legacy), 공통(plugin엔진) | DocumentPrintManagement | 문서 출력 — 기록지 인쇄. 회계 문서함과 이름 구분 |  |  |
| 품질·규정 | 유지 | /dashboard/food/allergen | 알레르겐 관리 | admin, inspector, monitor | p:food | FoodAllergen | 식품 전용 (업종 기능) |  |  |
| 품질·규정 | 통합 | /dashboard/food/change-control | 변경관리 | admin, inspector, monitor | HACCP탭(legacy), p:food | FoodChangeControl | 공통 변경관리 1벌 | 품질·규정 → 변경관리 — 공통 경로 /quality/change-control (업종은 테넌트 설정에서 자동, 옛 경로는 리다이렉트) (2-c 완료) | 같은 공통 페이지에 같은 업종 값 — 필드·승인 흐름·기록 보존·출력 동일 ✓ |
| 품질·규정 | 유지 | /dashboard/food/environmental-monitoring | 환경 모니터링 | admin, inspector, monitor | p:food | FoodEnvironmentalMonitoring | 식품 전용 (업종 기능) |  |  |
| 품질·규정 | 유지 | /dashboard/food/food-protection | 식품방어·문화 | admin, inspector, monitor | p:food | FoodProtectionManagement | 식품 전용 (업종 기능) |  |  |
| 품질·규정 | 통합 | /dashboard/general-manufacturing/audit | 감사 (일반제조) | admin, inspector, monitor | HACCP탭(legacy), p:general-manufacturing | GeneralMfgAudit | 감사 공통 1벌 (/quality/audit) — 업종은 테넌트 설정, 차이는 정책 데이터. 이미 공통 페이지 래퍼 | 품질·규정 → 감사 (일반제조) — 공통 경로 /quality/audit (업종은 테넌트 설정에서 자동, 옛 경로는 리다이렉트) (2-c 완료) | 같은 공통 페이지에 같은 업종 값 — 필드·승인 흐름·기록 보존·출력 동일 ✓ |
| 품질·규정 | 통합 | /dashboard/general-manufacturing/calibration | 검교정 (일반제조) | admin, inspector, monitor | HACCP탭(legacy), p:general-manufacturing | GeneralMfgCalibration | 검교정 공통 1벌 (/quality/calibration) — 업종은 테넌트 설정, 차이는 정책 데이터. 이미 공통 페이지 래퍼 | 품질·규정 → 검교정 (일반제조) — 공통 경로 /quality/calibration (업종은 테넌트 설정에서 자동, 옛 경로는 리다이렉트) (2-c 완료) | 같은 공통 페이지에 같은 업종 값 — 필드·승인 흐름·기록 보존·출력 동일 ✓ |
| 품질·규정 | 통합 | /dashboard/general-manufacturing/change-control | 변경관리 (일반제조) | admin, inspector, monitor | HACCP탭(legacy), p:general-manufacturing | GeneralMfgChangeControl | 변경관리 공통 1벌 (/quality/change-control) — 업종은 테넌트 설정, 차이는 정책 데이터. 이미 공통 페이지 래퍼 | 품질·규정 → 변경관리 (일반제조) — 공통 경로 /quality/change-control (업종은 테넌트 설정에서 자동, 옛 경로는 리다이렉트) (2-c 완료) | 같은 공통 페이지에 같은 업종 값 — 필드·승인 흐름·기록 보존·출력 동일 ✓ |
| 품질·규정 | 통합 | /dashboard/general-manufacturing/corrective-action | CAPA (일반제조) | admin, inspector, monitor | HACCP탭(legacy), p:general-manufacturing | GeneralMfgCorrectiveAction | CAPA·시정조치 공통 1벌 (/quality/corrective-action) — 업종은 테넌트 설정, 차이는 정책 데이터. 이미 공통 페이지 래퍼 | 품질·규정 → CAPA (일반제조) — 공통 경로 /quality/corrective-action (업종은 테넌트 설정에서 자동, 옛 경로는 리다이렉트) (2-c 완료) | 같은 공통 페이지에 같은 업종 값 — 필드·승인 흐름·기록 보존·출력 동일 ✓ |
| 품질·규정 | 통합 | /dashboard/general-manufacturing/nonconforming | 부적합 관리 (일반제조) | admin, inspector, monitor | HACCP탭(legacy), p:general-manufacturing | GeneralMfgNonconforming | 부적합 공통 1벌 (/quality/nonconforming) — 업종은 테넌트 설정, 차이는 정책 데이터. 이미 공통 페이지 래퍼 | 품질·규정 → 부적합 관리 (일반제조) — 공통 경로 /quality/nonconforming (업종은 테넌트 설정에서 자동, 옛 경로는 리다이렉트) (2-c 완료) | 같은 공통 페이지에 같은 업종 값 — 필드·승인 흐름·기록 보존·출력 동일 ✓ |
| 품질·규정 | 통합 | /dashboard/general-manufacturing/risk-assessment | 위험 평가 (일반제조) | admin, inspector, monitor | HACCP탭(legacy), p:general-manufacturing | GeneralMfgRiskAssessment | 위험평가 공통 1벌 (/quality/risk-assessment) — 업종은 테넌트 설정, 차이는 정책 데이터. 이미 공통 페이지 래퍼 | 품질·규정 → 위험 평가 (일반제조) — 공통 경로 /quality/risk-assessment (업종은 테넌트 설정에서 자동, 옛 경로는 리다이렉트) (2-c 완료) | 같은 공통 페이지에 같은 업종 값 — 필드·승인 흐름·기록 보존·출력 동일 ✓ |
| 품질·규정 | 통합 | /dashboard/general-manufacturing/supplier | 공급업체 (일반제조) | admin, inspector, monitor | HACCP탭(legacy), p:general-manufacturing | GeneralMfgSupplier | 공급업체 평가 공통 1벌 (/quality/supplier) — 업종은 테넌트 설정, 차이는 정책 데이터. 이미 공통 페이지 래퍼 | 품질·규정 → 공급업체 (일반제조) — 공통 경로 /quality/supplier (업종은 테넌트 설정에서 자동, 옛 경로는 리다이렉트) (2-c 완료) | 같은 공통 페이지에 같은 업종 값 — 필드·승인 흐름·기록 보존·출력 동일 ✓ |
| 품질·규정 | 통합 | /dashboard/general-manufacturing/training | 교육 (일반제조) | admin, inspector, monitor | HACCP탭(legacy), p:general-manufacturing | GeneralMfgTraining | 교육 공통 1벌 (/quality/training) — 업종은 테넌트 설정, 차이는 정책 데이터. 이미 공통 페이지 래퍼 | 품질·규정 → 교육 (일반제조) — 공통 경로 /quality/training (업종은 테넌트 설정에서 자동, 옛 경로는 리다이렉트) (2-c 완료) | 같은 공통 페이지에 같은 업종 값 — 필드·승인 흐름·기록 보존·출력 동일 ✓ |
| 품질·규정 | 유지 | /dashboard/haccp-verification | HACCP 검증 | admin, inspector, monitor | HACCP탭(legacy), p:food | HaccpVerification | 감사·검증 (식품) |  |  |
| 품질·규정 | 유지 | /dashboard/haccp/f3-dashboard | F-3 운영 현황 | admin, inspector, monitor | HACCP탭(legacy), p:food | F3Dashboard | 감사·검증 하위 |  |  |
| 품질·규정 | 통합 | /dashboard/haccp/f3-trends | Deviation 트렌드 | admin, inspector, monitor | HACCP탭(legacy), p:food | DeviationTrends | F-3 운영 현황의 탭으로 | 품질·규정 → F-3 운영 현황 → [Deviation 트렌드 →] 링크 (2-b-2 완료) | 동일 페이지로 이동 ✓ |
| 품질·규정 | 통합 | /dashboard/health-functional/audit | 감사 (Audit) / 감사 (건기식) | admin, inspector, monitor | HACCP탭(legacy), p:health-functional | HealthFunctionalAudit | 감사 공통 1벌 (/quality/audit) — 업종은 테넌트 설정, 차이는 정책 데이터. 이미 공통 페이지 래퍼 | 품질·규정 → 감사 (Audit) / 감사 (건기식) — 공통 경로 /quality/audit (업종은 테넌트 설정에서 자동, 옛 경로는 리다이렉트) (2-c 완료) | 같은 공통 페이지에 같은 업종 값 — 필드·승인 흐름·기록 보존·출력 동일 ✓ |
| 품질·규정 | 통합 | /dashboard/health-functional/calibration | 검교정 (건기식) / 검교정 / 설비 자격 | admin, inspector, monitor | HACCP탭(legacy), p:health-functional | HealthFunctionalCalibration | 검교정 공통 1벌 (/quality/calibration) — 업종은 테넌트 설정, 차이는 정책 데이터. 이미 공통 페이지 래퍼 | 품질·규정 → 검교정 (건기식) / 검교정 / 설비 자격 — 공통 경로 /quality/calibration (업종은 테넌트 설정에서 자동, 옛 경로는 리다이렉트) (2-c 완료) | 같은 공통 페이지에 같은 업종 값 — 필드·승인 흐름·기록 보존·출력 동일 ✓ |
| 품질·규정 | 통합 | /dashboard/health-functional/change-control | 변경관리 / 변경관리 (건기식) | admin, inspector, monitor | HACCP탭(legacy), p:health-functional | HealthFunctionalChangeControl | 변경관리 공통 1벌 (/quality/change-control) — 업종은 테넌트 설정, 차이는 정책 데이터. 이미 공통 페이지 래퍼 | 품질·규정 → 변경관리 / 변경관리 (건기식) — 공통 경로 /quality/change-control (업종은 테넌트 설정에서 자동, 옛 경로는 리다이렉트) (2-c 완료) | 같은 공통 페이지에 같은 업종 값 — 필드·승인 흐름·기록 보존·출력 동일 ✓ |
| 품질·규정 | 통합 | /dashboard/health-functional/corrective-action | CAPA (건기식) / CAPA (시정·예방) | admin, inspector, monitor | HACCP탭(legacy), p:health-functional | HealthFunctionalCorrectiveAction | CAPA·시정조치 공통 1벌 (/quality/corrective-action) — 업종은 테넌트 설정, 차이는 정책 데이터. 이미 공통 페이지 래퍼 | 품질·규정 → CAPA (건기식) / CAPA (시정·예방) — 공통 경로 /quality/corrective-action (업종은 테넌트 설정에서 자동, 옛 경로는 리다이렉트) (2-c 완료) | 같은 공통 페이지에 같은 업종 값 — 필드·승인 흐름·기록 보존·출력 동일 ✓ |
| 품질·규정 | 통합 | /dashboard/health-functional/nonconforming | 부적합 관리 / 부적합 관리 (건기식) | admin, inspector, monitor | HACCP탭(legacy), p:health-functional | HealthFunctionalNonconforming | 부적합 공통 1벌 (/quality/nonconforming) — 업종은 테넌트 설정, 차이는 정책 데이터. 이미 공통 페이지 래퍼 | 품질·규정 → 부적합 관리 / 부적합 관리 (건기식) — 공통 경로 /quality/nonconforming (업종은 테넌트 설정에서 자동, 옛 경로는 리다이렉트) (2-c 완료) | 같은 공통 페이지에 같은 업종 값 — 필드·승인 흐름·기록 보존·출력 동일 ✓ |
| 품질·규정 | 통합 | /dashboard/health-functional/risk-assessment | 위험 평가 / 위험 평가 (건기식) | admin, inspector, monitor | HACCP탭(legacy), p:health-functional | HealthFunctionalRiskAssessment | 위험평가 공통 1벌 (/quality/risk-assessment) — 업종은 테넌트 설정, 차이는 정책 데이터. 이미 공통 페이지 래퍼 | 품질·규정 → 위험 평가 / 위험 평가 (건기식) — 공통 경로 /quality/risk-assessment (업종은 테넌트 설정에서 자동, 옛 경로는 리다이렉트) (2-c 완료) | 같은 공통 페이지에 같은 업종 값 — 필드·승인 흐름·기록 보존·출력 동일 ✓ |
| 품질·규정 | 통합 | /dashboard/health-functional/supplier | 공급업체 (AVL) / 공급업체 (건기식) | admin, inspector, monitor | HACCP탭(legacy), p:health-functional | HealthFunctionalSupplier | 공급업체 평가 공통 1벌 (/quality/supplier) — 업종은 테넌트 설정, 차이는 정책 데이터. 이미 공통 페이지 래퍼 | 품질·규정 → 공급업체 (AVL) / 공급업체 (건기식) — 공통 경로 /quality/supplier (업종은 테넌트 설정에서 자동, 옛 경로는 리다이렉트) (2-c 완료) | 같은 공통 페이지에 같은 업종 값 — 필드·승인 흐름·기록 보존·출력 동일 ✓ |
| 품질·규정 | 통합 | /dashboard/health-functional/training | 교육 (건기식) / 교육 / 훈련 | admin, inspector, monitor | HACCP탭(legacy), p:health-functional | HealthFunctionalTraining | 교육 공통 1벌 (/quality/training) — 업종은 테넌트 설정, 차이는 정책 데이터. 이미 공통 페이지 래퍼 | 품질·규정 → 교육 (건기식) / 교육 / 훈련 — 공통 경로 /quality/training (업종은 테넌트 설정에서 자동, 옛 경로는 리다이렉트) (2-c 완료) | 같은 공통 페이지에 같은 업종 값 — 필드·승인 흐름·기록 보존·출력 동일 ✓ |
| 품질·규정 | 유지 | /dashboard/inspections | 검사 관리 | accountant, admin, inspector, monitor, worker | HACCP탭(legacy), p:food | InspectionManagement | 검사 (원재료·위생·출하·육안) |  |  |
| 품질·규정 | 통합 | /dashboard/medical-device/audit | 감사 (ISO 13485) | admin, inspector, monitor | HACCP탭(legacy), p:medical-device | MedicalDeviceAudit | 감사 공통 1벌 (/quality/audit) — 업종은 테넌트 설정, 차이는 정책 데이터. 이미 공통 페이지 래퍼 | 품질·규정 → 감사 (ISO 13485) — 공통 경로 /quality/audit (업종은 테넌트 설정에서 자동, 옛 경로는 리다이렉트) (2-c 완료) | 같은 공통 페이지에 같은 업종 값 — 필드·승인 흐름·기록 보존·출력 동일 ✓ |
| 품질·규정 | 통합 | /dashboard/medical-device/calibration | 검교정 (ISO 13485) | admin, inspector, monitor | HACCP탭(legacy), p:medical-device | MedicalDeviceCalibration | 검교정 공통 1벌 (/quality/calibration) — 업종은 테넌트 설정, 차이는 정책 데이터. 이미 공통 페이지 래퍼 | 품질·규정 → 검교정 (ISO 13485) — 공통 경로 /quality/calibration (업종은 테넌트 설정에서 자동, 옛 경로는 리다이렉트) (2-c 완료) | 같은 공통 페이지에 같은 업종 값 — 필드·승인 흐름·기록 보존·출력 동일 ✓ |
| 품질·규정 | 통합 | /dashboard/medical-device/change-control | 변경관리 (ISO 13485) | admin, inspector, monitor | HACCP탭(legacy), p:medical-device | MedicalDeviceChangeControl | 변경관리 공통 1벌 (/quality/change-control) — 업종은 테넌트 설정, 차이는 정책 데이터. 이미 공통 페이지 래퍼 | 품질·규정 → 변경관리 (ISO 13485) — 공통 경로 /quality/change-control (업종은 테넌트 설정에서 자동, 옛 경로는 리다이렉트) (2-c 완료) | 같은 공통 페이지에 같은 업종 값 — 필드·승인 흐름·기록 보존·출력 동일 ✓ |
| 품질·규정 | 통합 | /dashboard/medical-device/corrective-action | CAPA (ISO 13485) | admin, inspector, monitor | HACCP탭(legacy), p:medical-device | MedicalDeviceCorrectiveAction | CAPA·시정조치 공통 1벌 (/quality/corrective-action) — 업종은 테넌트 설정, 차이는 정책 데이터. 이미 공통 페이지 래퍼 | 품질·규정 → CAPA (ISO 13485) — 공통 경로 /quality/corrective-action (업종은 테넌트 설정에서 자동, 옛 경로는 리다이렉트) (2-c 완료) | 같은 공통 페이지에 같은 업종 값 — 필드·승인 흐름·기록 보존·출력 동일 ✓ |
| 품질·규정 | 통합 | /dashboard/medical-device/nonconforming | 부적합 관리 (ISO 13485) | admin, inspector, monitor | HACCP탭(legacy), p:medical-device | MedicalDeviceNonconforming | 부적합 공통 1벌 (/quality/nonconforming) — 업종은 테넌트 설정, 차이는 정책 데이터. 이미 공통 페이지 래퍼 | 품질·규정 → 부적합 관리 (ISO 13485) — 공통 경로 /quality/nonconforming (업종은 테넌트 설정에서 자동, 옛 경로는 리다이렉트) (2-c 완료) | 같은 공통 페이지에 같은 업종 값 — 필드·승인 흐름·기록 보존·출력 동일 ✓ |
| 품질·규정 | 통합 | /dashboard/medical-device/risk-assessment | 위험관리 ISO 14971 | admin, inspector, monitor | HACCP탭(legacy), p:medical-device | MedicalDeviceRiskAssessment | 위험평가 공통 1벌 (/quality/risk-assessment) — 업종은 테넌트 설정, 차이는 정책 데이터. 이미 공통 페이지 래퍼 | 품질·규정 → 위험관리 ISO 14971 — 공통 경로 /quality/risk-assessment (업종은 테넌트 설정에서 자동, 옛 경로는 리다이렉트) (2-c 완료) | 같은 공통 페이지에 같은 업종 값 — 필드·승인 흐름·기록 보존·출력 동일 ✓ |
| 품질·규정 | 통합 | /dashboard/medical-device/supplier | 공급업체 (ISO 13485) | admin, inspector, monitor | HACCP탭(legacy), p:medical-device | MedicalDeviceSupplier | 공급업체 평가 공통 1벌 (/quality/supplier) — 업종은 테넌트 설정, 차이는 정책 데이터. 이미 공통 페이지 래퍼 | 품질·규정 → 공급업체 (ISO 13485) — 공통 경로 /quality/supplier (업종은 테넌트 설정에서 자동, 옛 경로는 리다이렉트) (2-c 완료) | 같은 공통 페이지에 같은 업종 값 — 필드·승인 흐름·기록 보존·출력 동일 ✓ |
| 품질·규정 | 통합 | /dashboard/medical-device/training | 교육 (ISO 13485) | admin, inspector, monitor | HACCP탭(legacy), p:medical-device | MedicalDeviceTraining | 교육 공통 1벌 (/quality/training) — 업종은 테넌트 설정, 차이는 정책 데이터. 이미 공통 페이지 래퍼 | 품질·규정 → 교육 (ISO 13485) — 공통 경로 /quality/training (업종은 테넌트 설정에서 자동, 옛 경로는 리다이렉트) (2-c 완료) | 같은 공통 페이지에 같은 업종 값 — 필드·승인 흐름·기록 보존·출력 동일 ✓ |
| 품질·규정 | 통합 | /dashboard/nonconforming-management | 부적합제품관리 | admin, inspector, monitor | HACCP탭(legacy), p:food | NonconformingManagement | 식품 전용 부적합 → 공통 부적합 1벌로 (업종 정책 데이터) | 보류 — 식품 구형 부적합(h_nonconforming_products, 배치·첨부·승인)과 공통 부적합의 차이 3가지. 14c §3-1 대표 결정 후 별도 PR | 14c 비교표 참조 |
| 품질·규정 | 통합 | /dashboard/pharmaceutical/audit | 감사 (KGMP) | admin, inspector, monitor | HACCP탭(legacy), p:pharmaceutical | PharmaceuticalAudit | 감사 공통 1벌 (/quality/audit) — 업종은 테넌트 설정, 차이는 정책 데이터. 이미 공통 페이지 래퍼 | 품질·규정 → 감사 (KGMP) — 공통 경로 /quality/audit (업종은 테넌트 설정에서 자동, 옛 경로는 리다이렉트) (2-c 완료) | 같은 공통 페이지에 같은 업종 값 — 필드·승인 흐름·기록 보존·출력 동일 ✓ |
| 품질·규정 | 통합 | /dashboard/pharmaceutical/calibration | 검교정 IQ/OQ/PQ (KGMP) | admin, inspector, monitor | HACCP탭(legacy), p:pharmaceutical | PharmaceuticalCalibration | 검교정 공통 1벌 (/quality/calibration) — 업종은 테넌트 설정, 차이는 정책 데이터. 이미 공통 페이지 래퍼 | 품질·규정 → 검교정 IQ/OQ/PQ (KGMP) — 공통 경로 /quality/calibration (업종은 테넌트 설정에서 자동, 옛 경로는 리다이렉트) (2-c 완료) | 같은 공통 페이지에 같은 업종 값 — 필드·승인 흐름·기록 보존·출력 동일 ✓ |
| 품질·규정 | 통합 | /dashboard/pharmaceutical/change-control | 변경관리 (KGMP) | admin, inspector, monitor | HACCP탭(legacy), p:pharmaceutical | PharmaceuticalChangeControl | 변경관리 공통 1벌 (/quality/change-control) — 업종은 테넌트 설정, 차이는 정책 데이터. 이미 공통 페이지 래퍼 | 품질·규정 → 변경관리 (KGMP) — 공통 경로 /quality/change-control (업종은 테넌트 설정에서 자동, 옛 경로는 리다이렉트) (2-c 완료) | 같은 공통 페이지에 같은 업종 값 — 필드·승인 흐름·기록 보존·출력 동일 ✓ |
| 품질·규정 | 통합 | /dashboard/pharmaceutical/corrective-action | CAPA (KGMP) | admin, inspector, monitor | HACCP탭(legacy), p:pharmaceutical | PharmaceuticalCorrectiveAction | CAPA·시정조치 공통 1벌 (/quality/corrective-action) — 업종은 테넌트 설정, 차이는 정책 데이터. 이미 공통 페이지 래퍼 | 품질·규정 → CAPA (KGMP) — 공통 경로 /quality/corrective-action (업종은 테넌트 설정에서 자동, 옛 경로는 리다이렉트) (2-c 완료) | 같은 공통 페이지에 같은 업종 값 — 필드·승인 흐름·기록 보존·출력 동일 ✓ |
| 품질·규정 | 통합 | /dashboard/pharmaceutical/nonconforming | 부적합 관리 (KGMP) | admin, inspector, monitor | HACCP탭(legacy), p:pharmaceutical | PharmaceuticalNonconforming | 부적합 공통 1벌 (/quality/nonconforming) — 업종은 테넌트 설정, 차이는 정책 데이터. 이미 공통 페이지 래퍼 | 품질·규정 → 부적합 관리 (KGMP) — 공통 경로 /quality/nonconforming (업종은 테넌트 설정에서 자동, 옛 경로는 리다이렉트) (2-c 완료) | 같은 공통 페이지에 같은 업종 값 — 필드·승인 흐름·기록 보존·출력 동일 ✓ |
| 품질·규정 | 통합 | /dashboard/pharmaceutical/risk-assessment | 위험 평가 ICH Q9 (KGMP) | admin, inspector, monitor | HACCP탭(legacy), p:pharmaceutical | PharmaceuticalRiskAssessment | 위험평가 공통 1벌 (/quality/risk-assessment) — 업종은 테넌트 설정, 차이는 정책 데이터. 이미 공통 페이지 래퍼 | 품질·규정 → 위험 평가 ICH Q9 (KGMP) — 공통 경로 /quality/risk-assessment (업종은 테넌트 설정에서 자동, 옛 경로는 리다이렉트) (2-c 완료) | 같은 공통 페이지에 같은 업종 값 — 필드·승인 흐름·기록 보존·출력 동일 ✓ |
| 품질·규정 | 통합 | /dashboard/pharmaceutical/supplier | 공급업체 AVL (KGMP) | admin, inspector, monitor | HACCP탭(legacy), p:pharmaceutical | PharmaceuticalSupplier | 공급업체 평가 공통 1벌 (/quality/supplier) — 업종은 테넌트 설정, 차이는 정책 데이터. 이미 공통 페이지 래퍼 | 품질·규정 → 공급업체 AVL (KGMP) — 공통 경로 /quality/supplier (업종은 테넌트 설정에서 자동, 옛 경로는 리다이렉트) (2-c 완료) | 같은 공통 페이지에 같은 업종 값 — 필드·승인 흐름·기록 보존·출력 동일 ✓ |
| 품질·규정 | 통합 | /dashboard/pharmaceutical/training | 교육 / 훈련 (KGMP) | admin, inspector, monitor | HACCP탭(legacy), p:pharmaceutical | PharmaceuticalTraining | 교육 공통 1벌 (/quality/training) — 업종은 테넌트 설정, 차이는 정책 데이터. 이미 공통 페이지 래퍼 | 품질·규정 → 교육 / 훈련 (KGMP) — 공통 경로 /quality/training (업종은 테넌트 설정에서 자동, 옛 경로는 리다이렉트) (2-c 완료) | 같은 공통 페이지에 같은 업종 값 — 필드·승인 흐름·기록 보존·출력 동일 ✓ |
| 품질·규정 | 통합 | /dashboard/scan-checklist | 스캔 체크리스트 입력 | admin, inspector | WORK탭 | lazy(() => import("@/pages/checklist/Sca | "오늘 쓸 기록지" 의 스캔 입력 버튼으로 | 3-b "오늘 쓸 기록지" 스캔 입력 버튼 | 통합 시점에 확인 |
| 품질·규정 | 통합 | /mobile-quick-check | 모바일 빠른 점검 | admin, inspector, worker | HACCP탭(legacy) | MobileQuickCheck | "오늘 쓸 기록지" 목록의 모바일 진입으로 | 3-b "오늘 쓸 기록지" 모바일 진입 | 통합 시점에 확인 |
| 품질·규정 | 유지 | /quality/ccp-monitoring | CCP 관리 | admin, inspector, monitor, worker | HACCP탭(legacy), p:food | CCPMonitoring | CCP 기록지 (정본 = 공식 기록지) |  |  |
| 품질·규정 | 유지 | /quality/checklists | HACCP 체크리스트 | admin, inspector, monitor, worker | HACCP탭(legacy), p:food | ChecklistDashboard | 점검일지·체크리스트 |  |  |
| 매입·매출 | 유지 | /dashboard/accounting/b2c-platform | B2C 플랫폼 정산 | admin | 회계탭 | lazy(() => import("@/pages/accounting/B2 | B2C 플랫폼 정산 (회계 제외 매출의 세무 정리) |  |  |
| 매입·매출 | 유지 | /dashboard/accounting/quotations | 견적서 | admin | 회계탭 | lazy(() => import("@/pages/accounting/Qu | 견적 |  |  |
| 매입·매출 | 유지 | /dashboard/accounting/sales/create | 매출 입력 (이전 '매출 등록') | admin | 회계탭 | lazy(() => import("@/pages/accounting/Sa | 2-b-2 에서 조회 화면 버튼으로 통합했다가 매입·매출 허브 개편으로 메뉴 복귀 (조회 화면 [＋ 입력] 바로가기는 유지) | 매입·매출 관리 → [매출] 탭 → 매출 입력 | 동일 페이지 ✓ |
| 매입·매출 | 유지 | /dashboard/accounting/sales/list | 매출 조회 | admin | 회계탭 | lazy(() => import("@/pages/accounting/Sa | 매출 (엑셀 업로드 6단계 포함) |  |  |
| 매입·매출 | 유지 | /dashboard/accounting/tax-invoices | 세금계산서 | admin | 회계탭 | lazy(() => import("@/pages/accounting/Ta | 세금계산서 |  |  |
| 회계·경영 | 유지 | /accounting/documents | 문서함 | admin | 회계탭 | lazy(() => import("@/pages/accounting/Ac | 회계 문서함 |  |  |
| 회계·경영 | 유지 | /dashboard/accounting | 대시보드 | admin | 회계탭 | AccountingManagement | 회계 허브 첫 화면 = 회계 받은편지함 |  |  |
| 회계·경영 | 유지 | /dashboard/accounting/accounts | 계정 과목 | admin | 회계탭 | lazy(() => import("@/pages/accounting/Ac | 계정과목 (기준정보) |  |  |
| 회계·경영 | 유지 | /dashboard/accounting/bank-management | 은행 관리 | admin | 회계탭 | lazy(() => import("@/pages/accounting/Ba | 은행·매칭 |  |  |
| 회계·경영 | 유지 | /dashboard/accounting/budget | 예산 관리 | admin | 회계탭 | lazy(() => import("@/pages/accounting/Bu | 예산 |  |  |
| 회계·경영 | 유지 | /dashboard/accounting/cash-flow | 자금현황 | admin | 회계탭 | lazy(() => import("@/pages/accounting/Ca | 자금 |  |  |
| 회계·경영 | 유지 | /dashboard/accounting/change-log | 변경이력 | admin | 회계탭 | lazy(() => import("@/pages/accounting/Ch | 마감 하위 (변경이력) |  |  |
| 회계·경영 | 유지 | /dashboard/accounting/closing-management | 마감 관리 | admin | 회계탭 | lazy(() => import("@/pages/accounting/Cl | 마감 |  |  |
| 회계·경영 | 유지 | /dashboard/accounting/expense | 비용관리 | admin | 회계탭 | lazy(() => import("@/pages/accounting/Ex | 비용 |  |  |
| 회계·경영 | 유지 | /dashboard/accounting/financial-reports | 재무보고서 | admin | 회계탭 | lazy(() => import("@/pages/accounting/Fi | 재무보고 |  |  |
| 회계·경영 | 유지 | /dashboard/accounting/fixed-assets | 고정자산 | admin | 회계탭 | lazy(() => import("@/pages/accounting/Fi | 고정자산 |  |  |
| 회계·경영 | 유지 | /dashboard/accounting/hr | 인사관리 | admin | 회계탭 | lazy(() => import("@/pages/accounting/HR | 인사·급여 |  |  |
| 회계·경영 | 유지 | /dashboard/accounting/journal-entries | 전표 관리 | admin | 회계탭 | lazy(() => import("@/pages/accounting/Jo | 전표 |  |  |
| 회계·경영 | 이동 | /dashboard/accounting/partner-credit | 신용관리 | admin | 회계탭 | lazy(() => import("@/pages/accounting/Pa | 신용관리 → 회계·경영(채권) |  |  |
| 회계·경영 | 유지 | /dashboard/accounting/payroll | 급여관리 | admin | 회계탭 | lazy(() => import("@/pages/accounting/Pa | 인사·급여 |  |  |
| 회계·경영 | 유지 | /dashboard/accounting/recurring | 반복 거래 | admin | 회계탭 | lazy(() => import("@/pages/accounting/Re | 마감 하위 |  |  |
| 회계·경영 | 유지 | /dashboard/accounting/vat-management | 부가세 | admin | 회계탭 | lazy(() => import("@/pages/accounting/Va | 세무(부가세) |  |  |
| 환경설정 | 유지 | /admin/opscore-sync | GOGOGOPICK 연동 | admin | HACCP탭(legacy) | OpscoreSync | 외부 연동 |  |  |
| 환경설정 | 유지 | /admin/settings | 시스템 관리 | admin | HACCP탭(legacy), 공통(plugin엔진), 회계탭 | SystemManagement | 시스템 관리 (2곳 등록 → 1) |  |  |
| 환경설정 | 이동 | /dashboard/accounting/notice-board | 사내공지관리 | admin | WORK탭 | lazy(() => import("@/pages/accounting/Ac | 사내공지관리 (WORK 탭 → 환경설정) |  |  |
| 환경설정 | 유지 | /dashboard/data-import | 데이터 임포트 | admin | WORK탭 | lazy(() => import("@/pages/system/DataIm | 데이터 임포트 |  |  |
| 플랫폼 | 유지 | /dashboard/server-monitor | 서버 모니터링 |  | 슈퍼관리자 | lazy(() => import("@/pages/system/Server |  |  |  |
| 플랫폼 | 유지 | /dashboard/super-admin | 슈퍼관리자 대시보드 |  | HACCP탭(legacy), 공통(plugin엔진) | SuperAdminDashboard | 테넌트 업무 메뉴와 분리 |  |  |
| 플랫폼 | 유지 | /dashboard/tenants | 테넌트 관리 |  | HACCP탭(legacy), 공통(plugin엔진) | TenantManagement |  |  |  |
| 플랫폼 | 유지 | /dashboard/user-approval | 사용자 승인 |  | HACCP탭(legacy), 공통(plugin엔진) | SuperAdminUserApproval,SuperAdminUserApp |  |  |  |

## B. 메뉴에 없는 독립 라우트 151개 (2-b 에서 허브 귀속 또는 `legacyPaths`)

메뉴 109 외 라우트 302 = 상세(`:id`) 63 + 메뉴 하위 104 + **아래 151**. 링크·즐겨찾기·북마크로만 도달하는 화면이다. 411 라우트 전부가 직접 접근 검증 대상(본문 §8).

| 경로 | 화면 컴포넌트 | 귀속 허브 (2-b 에서 확정) |
|---|---|---|
| / | LandingPage | public |
| /404 | NotFound | public |
| /account-categories | AccountCategoryManagement | finance |
| /accounting-close | AccountingCloseManagement | finance |
| /accounting/monthly-summary | lazy(() => import("@/pages/accounting/AccountingMo | finance |
| /accounting/monthly-summary/new | lazy(() => import("@/pages/accounting/AccountingMo | finance |
| /admin/employee-approval | EmployeeApproval | settings |
| /admin/failed-tasks | FailedTasks | platform |
| /admin/user-approval | SuperAdminUserApproval | platform |
| /air-compressor | AirCompressorList | quality |
| /air-compressor-maintenance | AirCompressorMaintenanceList | quality |
| /air-compressor-maintenance/new | AirCompressorMaintenanceForm | quality |
| /air-compressor/new | AirCompressorForm | quality |
| /airborne-bacteria-test | AirborneBacteriaTestList | quality |
| /airborne-bacteria-test/new | AirborneBacteriaTestForm | quality |
| /batch-profitability-dashboard | BatchProfitabilityDashboard | production |
| /batch-schedule | BatchSchedule | production |
| /batch-schedule-calendar | BatchScheduleCalendar | production |
| /batch/new | (children) | production |
| /board | NoticeBoard | today |
| /board/alerts | BoardAlarms | today |
| /calibration | CalibrationManagement | quality |
| /capa-record | CapaRecordList | quality |
| /capa-record/new | CapaRecordForm | quality |
| /category-management | CategoryManagement | items |
| /ccp-deviation-dashboard | CcpDeviationDashboard | quality |
| /checklist-approval | ChecklistApprovalManagement | quality |
| /checklist-instance | ChecklistInstance | quality |
| /checklist-instance/form | ChecklistInstanceForm | quality |
| /checklist-schedule | ChecklistScheduleManagement | quality |
| /company-settings | CompanySettings | settings |
| /consumer-complaint | ConsumerComplaintList | quality |
| /consumer-complaint/new | ConsumerComplaintForm | quality |
| /daily-disposal-record | DailyDisposalRecordList | quality |
| /daily-disposal-record/new | DailyDisposalRecordForm | quality |
| /daily-log/daily | DailyLogForm | quality |
| /daily-report | ProductionDailyReport | production |
| /dashboard/checklist/templates/new | ChecklistTemplateForm | quality |
| /document-approval | DocumentApprovalManagement | today |
| /document-approval-settings | DocumentApprovalSettingsPage | settings |
| /employee-health-check | EmployeeHealthCheckRecordList | quality |
| /employee-health-check/new | EmployeeHealthCheckForm | quality |
| /equipment-cleaning-record | EquipmentCleaningRecordList | quality |
| /equipment-cleaning-record/new | EquipmentCleaningRecordForm | quality |
| /equipment-history | EquipmentHistoryList | quality |
| /equipment-history/new | EquipmentHistoryForm | quality |
| /equipment-inspection | EquipmentInspectionList | quality |
| /equipment-inspection/new | EquipmentInspectionForm | quality |
| /faq | FAQPage | public |
| /finished-product-check | FinishedProductCheckList | quality |
| /finished-product-check/new | FinishedProductCheckForm | quality |
| /food-recall-notice | FoodRecallNoticeList | quality |
| /food-recall-notice/new | FoodRecallNoticeForm | quality |
| /foreign-material-record | ForeignMaterialRecordList | quality |
| /foreign-material-record/new | ForeignMaterialRecordForm | quality |
| /forgot-password | ForgotPassword | public |
| /haccp-plan-verification | HaccpPlanVerification | quality |
| /handover-document | HandoverDocumentList | quality |
| /handover-document/new | HandoverDocumentForm | quality |
| /hygiene-facility-check | HygieneFacilityCheckList | quality |
| /hygiene-facility-check/new | HygieneFacilityCheckForm | quality |
| /hygiene/checklists | HygieneChecklistList | quality |
| /hygiene/checklists/new | HygieneChecklistForm | quality |
| /illumination-check | IlluminationCheckList | quality |
| /illumination-check/new | IlluminationCheckForm | quality |
| /internal-audit | InternalAudit | quality |
| /internal-audit-plan | InternalAuditPlan | quality |
| /inventory-lots | InventoryLots | items |
| /inventory-prediction | InventoryPredictionDashboard | items |
| /inventory-turnover-dashboard | InventoryTurnoverDashboard | items |
| /inventory/receipt | InventoryReceipt | trade |
| /inventory/release | InventoryRelease | trade |
| /legal | LegalPage | public |
| /login | Login | public |
| /master/recipe | RecipeManagement | production |
| /material-usage-report-print | lazy(() => import("@/pages/accounting/MaterialUsag | finance |
| /monthly-log/form | MonthlyLogForm | quality |
| /nonconforming-products | NonconformingProduct | quality |
| /notification-statistics | NotificationStatistics | today |
| /notifications | NotificationCenter | today |
| /organization/departments | DepartmentManagement | settings |
| /organization/employees | EmployeeManagement | settings |
| /organization/positions | PositionManagement | settings |
| /packaging-storage-record | PackagingStorageRecordList | quality |
| /packaging-storage-record/new | PackagingStorageRecordForm | quality |
| /pending-approval | PendingApproval | public |
| /personal-hygiene-check | PersonalHygieneCheckList | quality |
| /personal-hygiene-check/new | PersonalHygieneCheckForm | quality |
| /pest-control-checklist | PestControlChecklistList | quality |
| /pest-control-checklist/new | PestControlChecklistForm | quality |
| /pest-control/checklists | PestControlChecklistList | quality |
| /pest-control/checklists/new | PestControlChecklistForm | quality |
| /print-preview | PrintPreviewPage | quality |
| /product-test-log | ProductTestLogList | quality |
| /product-test-log/new | ProductTestLogForm | quality |
| /product-test-report | ProductTestReportList | quality |
| /product-test-report/new | ProductTestReportForm | quality |
| /production-dashboard | BatchProductionDashboard | production |
| /production-monitor | ProductionMonitor | production |
| /quality-issue-record | QualityIssueRecordList | quality |
| /quality-issue-record/new | QualityIssueRecordForm | quality |
| /quality/approvals | ApprovalQueue | quality |
| /quality/ccp-limits | CCPLimitsManagement | quality |
| /quality/hazard-analysis | HazardAnalysisManagement | quality |
| /quality/notification-settings | ChecklistNotificationSettings | settings |
| /quality/product-specification | ProductSpecificationManagement | quality |
| /quality/self-inspection | SelfQualityInspectionList | quality |
| /quality/self-inspection/new | SelfQualityInspectionForm | quality |
| /quality/statistics | ChecklistStatistics | quality |
| /quality/templates | TemplateManagement | quality |
| /recall-simulation | RecallSimulation | quality |
| /refrigeration-check | RefrigerationCheckList | quality |
| /refrigeration-check/new | RefrigerationCheckForm | quality |
| /register | Register | public |
| /reset-password | ResetPassword | public |
| /roadmap | RoadmapPage | public |
| /sanitation-record | SanitationRecordList | quality |
| /sanitation-record/new | SanitationRecordForm | quality |
| /signup | OnboardingPage | public |
| /stock-alerts | StockAlerts | items |
| /supplier-audit | SupplierAudit | quality |
| /supplier-inspection | SupplierInspectionList | quality |
| /supplier-inspection/new | SupplierInspectionForm | quality |
| /support | SupportPage | public |
| /surface-contamination-test | SurfaceContaminationTestList | quality |
| /surface-contamination-test/new | SurfaceContaminationTestForm | quality |
| /system-settings | SystemSettings | settings |
| /temperature-humidity-check | TemperatureHumidityCheckList | quality |
| /temperature-humidity-check/new | TemperatureHumidityCheckForm | quality |
| /traceability | Traceability | quality |
| /training-log | TrainingLogList | quality |
| /training-log/new | TrainingLogForm | quality |
| /training/courses | TrainingCourseList | quality |
| /validity-evaluation | ValidityEvaluationList | quality |
| /validity-evaluation/new | ValidityEvaluationForm | quality |
| /vehicle-temperature-check | VehicleTemperatureCheckList | quality |
| /vehicle-temperature-check/new | VehicleTemperatureCheckForm | quality |
| /verify-email | VerifyEmail | public |
| /waste-management | WasteManagementList | quality |
| /waste-management/new | WasteManagementForm | quality |
| /water-management-check | WaterManagementCheckList | quality |
| /water-management-check/new | WaterManagementCheckForm | quality |
| /water-quality-test | WaterQualityTestList | quality |
| /water-quality-test/new | WaterQualityTestForm | quality |
| /water-usage-check | WaterUsageCheckList | quality |
| /water-usage-check/new | WaterUsageCheckForm | quality |
| /weekly-log/form | WeeklyLogForm | quality |
| /weight-quality-check | WeightQualityCheckList | quality |
| /weight-quality-check/new | WeightQualityCheckForm | quality |
| /workplace-hygiene-check | WorkplaceHygieneCheckList | quality |
| /workplace-hygiene-check/new | WorkplaceHygieneCheckForm | quality |

# 14. MILLIO AI UI/UX 개편 명세서 — 메뉴 정본화 · 업무 허브 · 공통 UI

> 작성: 2026-10-14. 상태: **명세 확정 대기 (CEO 검토)**. 기준 소스: main `cd3fcbbb` (10/14 서버 백업 `44b4c99d` + #482~#485).
> 선행: [13-role-workflow-screens-step7.md](./13-role-workflow-screens-step7.md) (7단계 설계 초안 — 이 문서가 그 실행 명세다).
> 부록: [14a-menu-route-inventory.md](./14a-menu-route-inventory.md) — 109개 메뉴 경로 전부의 행선지·처리·역할·화면.

---

## 0. 목표와 성공 기준

> **117개 메뉴를 50개로 줄이는 것이 성공이 아니다. 사용자가 117개의 존재를 몰라도 자기 업무를 끝내는 것이 성공이다.** (CEO, 2026-10-14)

1. **찾기 쉽다** — 업무 이름으로 들어간다 (구매·입고, 생산관리 …). 기능 이름으로 찾지 않는다.
2. **한 업무를 여러 메뉴로 돌지 않는다** — 업무의 입구는 하나, 기능은 필요한 순간에 보인다.
3. **업종·권한이 달라도 같은 방식으로 쓴다** — 공통 업무 메뉴 + 업종별 기능 구성 + 사용자별 권한.

**판정 기준 (4단계에서 측정)**: 같은 업무를 개편 전·후에 수행했을 때 **클릭·화면 이동은 줄고, 기능과 권한은 그대로**이며, **기존 URL·즐겨찾기는 모두 동작**한다.

**바꾸지 않는 것**: 데이터 처리 로직의 정본 — `ItemIdentityService`(품목 정체성), 재고 관문(`applyInventoryDelta`·음수 정책), CCP 공식 기록지 정본, 업무 FK, 서버 권한 검사. **메뉴의 통합과 업무 로직의 통합은 다른 작업이다.**

---

## 1. 현황 실측

### 1-1. 메뉴는 다섯 군데에서 만들어진다

`DashboardLayout.tsx` 의 메뉴 배열 4개 + `clientMenuEngine.ts` 공통 그룹 + 업종 플러그인 6개(`server/domain/plugins/*.ts`). 사이드바 탭이 무엇이냐에 따라 다른 출처를 쓴다.

| 탭 / 상황 | 메뉴 출처 | 항목 수 |
|---|---|---:|
| HACCP 탭 (업종 플러그인 있음) | `clientMenuEngine` 공통 + 플러그인 `menu.groups` | 11 + 업종 8~16 |
| HACCP 탭 (플러그인 없음) | `DashboardLayout` 레거시 `menuItems` (6개 업종 품질 메뉴 전부 포함) | 72 |
| 회계 탭 | `DashboardLayout` `accountingMenuItems` | 33 |
| WORK 탭 | `DashboardLayout` `workMenuItems` (ERP 전용 / 통합 두 벌) | 4 + 5 |
| 슈퍼관리자 | `DashboardLayout` `superAdminMenuItems` + 공통 엔진 | 3 |
| 모바일 | `MobileBottomNav.tsx` 하드코딩 4개 (홈·알림·로그·설정) | 4 |

추출 방법: 위 소스에서 `{ icon, label, path, roles }` 객체를 정규식으로 전수 추출(DashboardLayout 의 label+path 117줄 전부 매칭 확인), `App.tsx` 의 `<Route>` 와 대조.

| 지표 | 값 |
|---|---:|
| 메뉴 정의(출처 합산) | 190 |
| 서로 다른 메뉴 경로 | 109 |
| `App.tsx` 라우트 | 411 |
| 메뉴 경로 중 라우트 없음 | 0 |
| 같은 경로를 2곳 이상에서 정의 | 71 |
| 같은 경로·다른 이름 | 9 (`/dashboard` = "대시보드"/"통합 대시보드", 건기식 품질 8개) |
| 페이지 파일 | 454 |

**문제**: 메뉴 이름·역할을 바꾸면 2~3곳을 같이 고쳐야 하고, 탭·업종에 따라 같은 경로가 다른 이름·다른 역할로 보인다. 즐겨찾기·`childRoutes`·라벨 치환도 각자 경로 문자열을 들고 있다.

### 1-2. 역할별 노출이 실제 업무와 어긋난다

| 발견 | 근거 | 영향 |
|---|---|---|
| **회계 탭 33개 전부 `super_admin`·`admin` 만** | `accountingMenuItems` roles | `accountant` 계정은 회계 메뉴가 **하나도 안 보인다** |
| **서버도 `accountant` 차단** | 회계 라우터 다수가 `adminProcedure` (admin/super_admin 만) — 예: 매출 일괄등록, 견적, 세금계산서, 발주, 급여, 전표 일부 | 메뉴를 열어줘도 저장에서 FORBIDDEN |
| `employee` 가 볼 수 있는 메뉴 **0개** | 전체 190개 정의 중 `employee` 포함 0 | 첫 화면·메뉴 미정 |
| 존재하지 않는 역할 `user` | WORK 탭 `/dashboard`, `/dashboard/today` | 의미 없는 값, 실제 enum 은 `super_admin·admin·accountant·worker·monitor·inspector·employee` |
| **역할 권한 매트릭스가 이미 있는데 안 쓰인다** | `server/utils/rbacMatrix.ts` — 7역할 × 10기능 × read/write/delete/approve/export. `accountant` 는 회계 read·write·approve·export 로 정의돼 있음. 이를 쓰는 `createFeatureProcedure` 사용처 **0**, DB 기반 `requireCapability` 사용처 **1** | 정책은 있는데 메뉴도 서버도 각자 하드코딩 (CLAUDE.md 절대 금지 7번 "admin-hardcoded" 상태) |

### 1-3. 첫 화면(Today)의 데이터 연결이 틀렸다

| 위치 | 현재 | 맞는 기준 |
|---|---|---|
| `Today.tsx` 오늘 배치 | `batch.createdAt` 이 오늘 | **`planned_date`** (#457 업무일자 원칙) — 어제 미리 만든 오늘 생산이 빠지고, 오늘 소급 입력한 과거 배치가 들어온다 |
| 미완료 CCP | `ccp.getAllRecords(status:'draft')` = 설비행 사본(`h_ccp_instances`) | **공식 기록지(`h_ccp_form_records`) 오늘 작업일 draft** — 경영 상황판(#481)과 같은 기준 |
| 실패/이탈 | `failedItems: 0 // TODO` | 미해결 CCP 이탈(`h_ccp_deviations`) 수 |

새 업무 화면을 만들기 전에 **이 연결부터** 고친다(§2).

### 1-4. 화면마다 사용 규칙이 다르다

| 요소 | 실측 | 비고 |
|---|---|---|
| 페이지 헤더 | 공통 컴포넌트 없음 (`PageHeader` 사용 0) | 제목·설명·버튼 위치가 페이지마다 다름 |
| 탭 | `<Tabs>` 71개 페이지, URL 유지(`useTabWithUrl`) 17개 | 나머지는 새로고침 시 탭 초기화, 일부는 세그먼트 버튼 |
| 테이블 | 직접 `<Table>` 182개 파일, 공통 `DataGrid` 페이지 사용 0 | 정렬·페이지·선택·일괄작업 동작이 제각각 |
| 토스트 | `sonner` 150 파일 / `use-toast` 136 파일 | 같은 앱에 알림 형식 두 가지 |
| 상태 배지 | 공통 컴포넌트 없음 | 같은 `pending` 이 "대기"/"검토중"/"요청"으로 다르게 보임 |
| 업종 품질 화면 | 업종별 페이지 6벌이지만 **이미 공통 페이지 래퍼** (`<NonconformingPage industry="food"/>`) | 통합은 메뉴·라우트 수준 작업. 단 식품은 별도 구형 페이지(부적합 576줄·시정조치·교육·검교정·공급업체)를 따로 씀 |

---

## 2. 0단계 — 개편 전에 고칠 결함 (기능 그대로, 연결만 바로잡기)

| # | 내용 | 범위 |
|---|---|---|
| 0-1 | **Today 데이터 연결**: 오늘 배치 = `planned_date`, 미완료 CCP = 공식 기록지 draft, 이탈 = 미해결 이탈 수 | `Today.tsx` (서버는 #481 의 `getDashboardStats` 재사용) |
| 0-2 | **회계 담당자 권한**: 회계 라우터의 `adminProcedure` → `createFeatureProcedure("accounting", write/approve)` (rbacMatrix 기준). 회계 메뉴 roles 에 `accountant` | 서버 회계 라우터 + 회계 메뉴. admin 동작 불변 |
| 0-3 | 존재하지 않는 역할 `user` 제거, `employee` 첫 화면 = 공지·출퇴근·내 교육 | 메뉴 정의 |

0-2 는 권한을 **넓히는** 변경이므로 머지 전 CEO 확인: `accountant` 가 매출·매입 승인(재고·분개 발생)까지 하는가, 조회·작성만 하는가. rbacMatrix 기본값은 approve 포함.

---

## 3. 정보구조 — 업무 허브 8개 + 플랫폼

업무 흐름 순서: **사다 → 들이다 → 만들다 → 기록하다 → 팔다 → 맞추다**. 각 허브의 **첫 화면은 기능 목록이 아니라 "지금 처리할 것"** 이다.

| 허브 | 첫 화면 (입구) | 2차 업무 | 들어가는 기존 경로 (부록 14a) | 기본 역할 |
|---|---|---|---|---|
| 🏠 **오늘 할 일** | 역할별: 작업자=오늘의 생산 / 품질=오늘의 기록 / 회계=회계 받은편지함 / 관리자=운영 현황+결재함 | 진행 상황, **업무함**(승인 대기 + 미처리 알림 한 목록) | `/dashboard`, `/dashboard/today`, `/dashboard/approval`, `/dashboard/notifications` | 전원 |
| 📦 **구매·입고** | 입고 예정·미입고 발주, 승인 대기 매입 | 발주, 매입(조회가 입구·등록은 버튼), 원재료 입고, 거래처(상세에 CRM·커뮤니케이션 탭), 단가표 | `purchase-orders`, `purchases/*`, `partners*`, `communication-log`, `partner-prices` | admin, accountant |
| 🗂️ **품목·재고** | 재고 부족·음수·유통기한 임박 | 품목 등록·SKU, 재고 현황, LOT, 수불부, **실사·조정(권한 분리)** | `item-master`, `master-data`, `inventory-management` | admin, accountant, worker(읽기) |
| 🏭 **생산관리** | 오늘 생산계획 + 진행 중 생산지시 | 생산계획, 생산지시·실적, 생산일지, **배합·BOM(기준정보 — 분리 유지)** | `production-management`, `production-operations`, `manufacturing-standards` | admin, worker |
| 🛡️ **품질·규정** | **오늘 쓸 기록지** (CCP·체크리스트·검사 중 미작성·미측정) | CCP, 검사, 점검일지, 부적합, CAPA, 변경, 교육, 검교정, 공급업체 평가, 위험평가, 감사·검증, 업종 전용 기능 | `ccp-monitoring`, `inspections`, `checklists`, 업종 품질 48 → 공통 8, `food/*`, `cosmetic/*`, `audit-management`, `haccp-verification`, `f3-*`, 모바일·스캔 입력 | inspector, monitor, admin (worker 는 기록 작성) |
| 🚚 **판매·출고** | 확정 대기 매출·오늘 출고 | 견적, 매출(엑셀 업로드 6단계), 출고, 거래명세, 세금계산서, B2C 정산 | `quotations`, `sales/*`, `tax-invoices`, `b2c-platform` | admin, accountant |
| 💰 **회계·경영** | **회계 받은편지함** (미매칭 은행거래, 이번 달 마감 남은 것, 미수·미지급) | 전표, 자금, 은행, 세무(부가세), 마감, 재무보고, 예산, 고정자산, 계정과목, 신용관리, 인사·급여, 문서함 | `accounting`, `expense`, `bank-management`, `journal-entries`, `vat-management`, `financial-reports`, `cash-flow`, `budget`, `payroll`, `hr`, `accounts`, `fixed-assets`, `recurring`, `closing-management`, `change-log`, `documents`, `partner-credit` | accountant, admin |
| ⚙️ **환경설정** | 사용자·권한 | 회사정보, 업종 설정, 사내공지, 데이터 임포트, 외부 연동, 시스템 | `admin/settings`, `data-import`, `notice-board`, `opscore-sync` | admin |
| 플랫폼 (슈퍼관리자 전용, 테넌트 메뉴와 분리) | 플랫폼 대시보드 | 테넌트, 사용자 승인, 서버 모니터링 | `super-admin`, `user-approval`, `tenants`, `server-monitor` | super_admin |

**8개 안에 모든 기능을 탭으로 몰아넣지 않는다.** 생산관리에 들어가 15개 탭이 보이면 지금과 같다. 허브 = 입구 화면(지금 처리할 것) + 업무를 고르면 그 업무 화면으로 이동. 탭은 **같은 대상의 다른 면**(예: 거래처 상세의 기본정보·CRM·커뮤니케이션)에만 쓴다.

**허브 이름은 CEO 확정 대상**(§9). 위는 CEO 제안(2026-10-14) 그대로다.

### 3-1. 통합하면 안 되는 것 (원칙: 메뉴는 묶되 업무는 나눈다)

| 같은 허브지만 분리 유지 | 이유 |
|---|---|
| 배합·BOM ↔ 생산실적 | 기준정보 관리 vs 실제 결과 기록. 권한·변경 이력 요건이 다름 |
| 입고 ↔ 실사·조정 | 조정은 재고를 직접 바꿈 → 별도 권한·승인 절차 |
| 품질 기록 작성 ↔ 승인 | 작성자·검토자·승인자 분리 (CCP 기록지 결재 흐름) |
| 매출 등록 ↔ 매출 확정 | 확정 시 재고 차감·분개 — 권한 분리 |
| 회계 제외(B2C) ↔ 회계 포함 매출 | 이중 회계 방지 안전장치 (#485) |

---

## 4. 메뉴 정의 정본화 (2단계)

### 4-1. 메뉴 레지스트리 한 곳

`shared/navigation/menuRegistry.ts` (타입·상수만 — shared-kernel 규칙 준수). 사이드바·모바일 하단바·즐겨찾기·`childRoutes`·브레드크럼·라벨 치환·부록 14a 표를 **모두 여기서 생성**한다.

```ts
interface MenuEntry {
  id: string;                 // 안정 키 (즐겨찾기 저장용, 경로가 바뀌어도 유지)
  hub: HubId;                 // today | purchase | items | production | quality | sales | finance | settings | platform
  label: string;              // 업종 용어는 labelKey 로 치환 (useIndustryLabel)
  path: RoutePath;            // ROUTES 상수만
  childPaths?: RoutePath[];   // 상세·하위 화면 (활성 메뉴 판정)
  feature: FeatureArea;       // rbacMatrix 기능 영역
  permission: Permission;     // 이 메뉴를 보려면 필요한 권한 (보통 read)
  industries?: IndustryKey[]; // 없으면 공통. 있으면 해당 업종 테넌트만
  module?: "haccp" | "erp";   // 구독 모듈
  mobile?: boolean;           // 모바일 하단바·빠른 메뉴 노출
  order: number;
  legacyPaths?: string[];     // 옛 URL → 이 항목으로 리다이렉트
}
```

- **노출 판정 = 업종 ∩ 모듈 ∩ 권한** — 하나의 함수 (`visibleMenu(user, tenant)`). 탭(WORK/회계/HACCP)별 출처 분기 삭제.
- 업종 플러그인의 `menu.groups` 는 **업종 전용 기능 목록**(`industries` 지정 항목)으로만 남긴다. 공통 메뉴를 플러그인이 다시 정의하지 않는다.
- 업종 품질 8종은 **공통 경로 1벌**(`/quality/nonconforming` 등) + 업종은 테넌트 설정에서. 업종별 차이(필수 항목·승인 단계·보존 기간·용어)는 정책 데이터(04-policy-registry). 기존 `/dashboard/{업종}/{기능}` 48개는 `legacyPaths` 로 리다이렉트.

### 4-2. 권한 — 메뉴와 서버가 같은 매트릭스를 본다

- `server/utils/rbacMatrix.ts` → `shared/permissions/rbacMatrix.ts` 로 옮겨 클라이언트·서버가 같은 표를 쓴다 (값 변경 없음).
- 메뉴: `permission` 을 매트릭스로 판정. 메뉴 항목의 roles 배열 하드코딩 삭제.
- 서버: 라우터를 `adminProcedure`/`workerProcedure` 에서 `createFeatureProcedure(feature, permission)` 으로 점진 이주 (Strangler — 허브 단위 PR). **메뉴를 숨기는 것은 권한이 아니다. 서버 검사는 반드시 유지·강화한다.**
- 사용자별 예외가 필요해지면 DB 기반 `requireCapability`(04-policy-registry) 로 확장. 지금은 역할 매트릭스로 충분.

### 4-3. 기존 URL·즐겨찾기 보존

- 모든 기존 경로는 **그대로 열리거나** `legacyPaths` 리다이렉트로 새 위치로 간다. 404 0건이 완료 조건.
- 즐겨찾기(`menuPath` 저장)는 마이그레이션 시 레지스트리의 `legacyPaths` 로 해석 → 새 `id` 로 변환.

---

## 5. 공통 UI 규칙 (3단계)

색상·디자인은 지금 것을 유지한다. **사용 규칙만 통일**한다. 새로 만들거나 손대는 화면부터 적용(Strangler) — 전 화면 일괄 교체 금지.

| 요소 | 기준 | 공통 컴포넌트 |
|---|---|---|
| 페이지 헤더 | 좌: 제목 + 한 줄 설명. 우: 주요 작업 버튼(최대 2, 주 버튼 1). 그 아래 허브 경로(브레드크럼) | `PageHeader` (신규) |
| 검색·필터 | 한 줄: 검색창(좌) · 기간 · 상태 · 기타 필터 · [초기화]. 필터 값은 URL 쿼리에 유지 | `FilterBar` (신규) |
| 데이터 테이블 | 열 정렬, 페이지 이동(하단), 행 선택 체크박스 + 선택 시 상단에 일괄 작업 바, 빈 상태 문구, 로딩 스켈레톤 | 기존 `DataGrid` 를 표준으로 확장 |
| 등록·수정 | 짧은 입력 = 사이드 시트, 긴 입력 = 전용 페이지. 하단 고정 [취소][저장] (저장이 우측) | `FormFooter` (신규) |
| 상세 화면 | 상단 요약 → 탭: 정보 / 이력 / 첨부 / 승인 | `DetailLayout` (신규) |
| 상태 표시 | 상태 사전 한 곳: 작성 중 · 대기 · 검토 대기 · 승인 대기 · 승인 · 완료 · 반려 · 취소 · 오류 → 색·문구 고정 | `StatusBadge` + `statusDictionary` |
| 알림(토스트) | `sonner` 하나로. 성공(초록)·경고(주황)·실패(빨강, 사유 포함)·진행 중 | `notify.success/warn/error` 래퍼 |
| 탭 | 같은 대상의 다른 면에만. URL 유지(`useTabWithUrl`) 필수 | — |
| 모바일 | 하단바 = 레지스트리 `mobile: true` 항목(역할별). 표는 카드 목록으로. 입력은 핵심 필드 우선 | `MobileBottomNav` 레지스트리화 |

---

## 6. 업종 × 역할 모델

**공통 업무 메뉴 + 업종별 기능 구성 + 사용자별 접근 권한.**

| 축 | 결정하는 것 | 저장 위치 |
|---|---|---|
| 업종 (테넌트) | 업종 전용 기능 노출, 용어, 품질 기록 필수 항목·승인 단계·보존 기간 | 테넌트 `industry` + 정책 데이터 |
| 모듈 (구독) | HACCP / ERP 노출 | 구독 패키지 |
| 역할 (사용자) | 허브·메뉴 노출, 서버 쓰기·승인 권한, 첫 화면 | `rbacMatrix` |

새 업종 추가 = 플러그인(전용 기능) + 정책 데이터 + 용어. **사이드바·허브·공통 화면은 손대지 않는다.**

---

## 7. 실행 단계와 PR

| 단계 | PR | 내용 | 완료 기준 |
|---|---|---|---|
| **0** | 0-1 Today 연결 / 0-2 회계 담당자 권한 / 0-3 역할 정리 | §2 | Today 수치 = 경영 상황판 수치, accountant 계정으로 회계 메뉴·저장 동작 |
| **1** | (이 문서) 인벤토리 확정 | 부록 14a 의 처리 구분을 CEO 확정 | 109 경로 전부 행선지 확정 |
| **2-a** | 메뉴 레지스트리 + 노출 함수 | 다섯 출처 → 한 곳. **화면상 메뉴는 아직 기존과 동일** (같은 결과를 내는지 스냅샷 테스트) | 역할×업종 조합별 메뉴 스냅샷이 기존과 일치 |
| **2-b** | 허브 사이드바 전환 | 8 허브 + 플랫폼. WORK/회계/HACCP 탭 제거. `legacyPaths` 리다이렉트 | 기존 URL 404 0, 즐겨찾기 전부 동작 |
| **2-c** | 업종 품질 8종 공통 경로 | `/quality/{기능}` 1벌, 48 경로 리다이렉트, 식품 구형 페이지와 공통 페이지 diff → 기능 차이 정책 데이터화 | 6개 업종 테넌트에서 같은 화면 |
| **3-a** | 공통 컴포넌트 | `PageHeader`·`FilterBar`·`DataGrid` 표준·`StatusBadge`·`notify`·`FormFooter`·`DetailLayout` | 컴포넌트 + 사용 가이드 |
| **3-b** | 허브 입구 화면 | 오늘 할 일(역할별) · 각 허브 첫 화면 ("지금 처리할 것") | 13 문서 §3 "오늘의 생산" 시나리오 1화면 완결 |
| **3-c** | 화면 적용 | 허브별로 자주 쓰는 화면부터 공통 규칙 적용 (매출·매입·재고·CCP 순) | 허브당 상위 3화면 |
| **4** | 역할별 검증 | 작업자 → 품질 → 회계 → 관리자 순서로 13 문서 §5 시나리오 A~E 측정 | 개편 전 대비 클릭·화면 이동 감소, 기능·권한 동일 |

각 단계는 독립 배포 가능하고, 숫자가 나빠지면 되돌린다. 화면 삭제(폐기)는 4단계 측정 뒤 별도 결정 — 이번 범위에서 화면을 지우지 않는다.

---

## 8. 검증

- **메뉴 스냅샷 테스트**: 역할 7 × 업종 6 × 모듈 3 조합의 `visibleMenu` 결과를 고정 — 2-a 에서 기존과 동일, 2-b 이후 의도된 차이만.
- **URL 회귀**: 부록 14a 의 109 경로 + 즐겨찾기 저장 경로 전부 200 또는 리다이렉트.
- **권한 회귀**: 역할별 대표 API 호출 (accountant 매출 확정·전표 작성, worker 회계 API 차단, employee 쓰기 전부 차단).
- **업무 측정**: 13 문서 §5 시나리오 A~E, 개편 전 베이스라인 먼저.

---

## 9. CEO 결정 요청

1. **허브 8개 이름·순서** (§3) — 위 표가 CEO 제안 그대로. 현장 용어로 바꿀 곳이 있으면 지금.
2. **회계 담당자 권한 범위** (§2 0-2) — `accountant` 가 매출·매입 **확정**(재고·분개 발생)까지 하는가, 작성·조회까지만인가.
3. **부록 14a 처리 구분** — 특히 "통합" 57건 중 현장에서 따로 쓰는 화면이 있는지 (예: 마스터 데이터 ↔ 품목 마스터, 생산관리 ↔ 생산운영).
4. **첫 파일럿 역할** — 13 문서 결정 3 그대로: worker "오늘의 생산" vs accountant "회계 받은편지함".
5. **0단계(Today·회계 권한) 를 명세 확정 전에 먼저 진행할지** — 기능 변경 없는 연결 수정이라 먼저 해도 개편과 충돌하지 않는다.

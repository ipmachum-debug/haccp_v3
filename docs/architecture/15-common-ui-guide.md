# 15. 공통 UI 사용 가이드 (UI/UX 개편 3-a)

> 작성: 2026-10-14. 명세 [14 §5](./14-ui-ux-restructure-spec.md) 의 공통 UI 규칙을 코드 부품으로 만든 것.
> **원칙**: 색상·디자인은 지금 것을 유지하고 **사용 규칙만 통일**한다. 새로 만들거나 손대는 화면부터 적용한다(Strangler). 전 화면 일괄 교체는 하지 않는다 — 화면 적용은 3-c.

## 0. 이번에 바로 고쳐진 것

- **알림이 보이지 않던 문제**: 화면 135개 파일이 쓰던 `hooks/use-toast` 는 표시기(`<Toaster/>` from `ui/toaster`)가 앱에 없어서 **등록 완료·저장 실패 같은 알림이 한 번도 나오지 않았다.** `use-toast` 를 sonner 어댑터로 바꿔 코드 수정 없이 전부 보이게 했다 (`variant: "destructive"` = 빨간 실패).
- 알림 표시기: 색 구분(성공 초록·경고 주황·실패 빨강), 닫기 버튼, **상단 오른쪽** (모바일 하단바에 가리지 않게).
- 상단 헤더 = 전역 도구: **화면 찾기**(Ctrl/⌘+K) · 출퇴근 · 알림 · **프로필**(PC). 모바일은 검색 아이콘 · 출퇴근 · 알림.

## 1. 부품 목록

| 요소 | 부품 | 위치 |
|---|---|---|
| 페이지 머리 | `PageHeader` | `client/src/components/common/PageHeader.tsx` |
| 검색·필터 | `FilterBar` + `useUrlFilters` | `client/src/components/common/FilterBar.tsx` |
| 데이터 표 | `DataGrid` | `client/src/components/common/DataGrid.tsx` |
| 등록·수정 하단 버튼 | `FormFooter` | `client/src/components/common/FormFooter.tsx` |
| 상세 화면 | `DetailLayout` | `client/src/components/common/DetailLayout.tsx` |
| 상태 표시 | `StatusBadge` + `statusDictionary` | `client/src/components/common/StatusBadge.tsx`, `client/src/lib/statusDictionary.ts` |
| 알림 | `notify` | `client/src/lib/notify.ts` |
| 헤더 검색·프로필 | `GlobalMenuSearch`, `HeaderProfileMenu` | `client/src/components/dashboard/HeaderTools.tsx` |

## 2. 규칙과 예시

### 페이지 머리 — `PageHeader`
- 좌: 제목 + 한 줄 설명. 우: 작업 버튼 **최대 2개, 주 버튼 1개**. 위: 허브 경로(브레드크럼)는 경로로 **자동**.
```tsx
<PageHeader
  title="매출 조회" description="매출 거래를 조회하고 확정합니다."
  primary={{ label: "＋ 매출 입력", onClick: () => navigate(ROUTES_SALES_CREATE) }}
  secondary={{ label: "엑셀 일괄등록", icon: FileSpreadsheet, onClick: openUpload }}
/>
```

### 검색·필터 — `FilterBar` + `useUrlFilters`
- 한 줄: 검색창(좌) · 기간 · 상태 · 기타 · [초기화]. **필터 값은 URL 쿼리에 유지** — 새로고침·뒤로가기·링크 공유에도 그대로.
- 기본값과 같은 값은 쿼리에서 빠지고, 필터와 무관한 쿼리(`tab` 등)는 보존된다.
```tsx
const [f, setF, reset] = useUrlFilters({ q: "", from: "", to: "", status: "all" });
<FilterBar search={{ value: f.q, onChange: (v) => setF({ q: v }), placeholder: "거래처·품목" }} onReset={reset}>
  <Input type="date" value={f.from} onChange={(e) => setF({ from: e.target.value })} />
</FilterBar>
```

### 데이터 표 — `DataGrid`
- 열 정렬(없음 → 오름 → 내림), 하단 페이지 이동, 행 선택 + **선택 시 상단 일괄 작업 바**, 빈 상태 문구, 로딩 스켈레톤.
- 정렬: 숫자는 숫자로, 문자는 한국어 순, 빈 값은 항상 뒤.
- 모바일: `mobileCard` 를 주면 md 미만에서 **카드 목록**.
- 기존 `components/accounting/DataGrid`(회계 원장 전용)는 그대로 둔다.
```tsx
<DataGrid rows={sales} rowKey={(r) => r.id} loading={q.isLoading} emptyText="조건에 맞는 매출이 없습니다."
  columns={[{ key: "date", header: "일자", sortable: true }, { key: "amount", header: "금액", align: "right", sortable: true, cell: (r) => r.amount.toLocaleString() },
            { key: "status", header: "상태", cell: (r) => <StatusBadge status={r.status} domain="sale" /> }]}
  selectable bulkActions={(sel) => <Button size="sm" onClick={() => confirm(sel)}>선택 {sel.length}건 확정</Button>}
  onRowClick={(r) => navigate(`/dashboard/accounting/sales/${r.id}`)} mobileCard={(r) => <SaleCard sale={r} />} />
```

### 등록·수정 — `FormFooter`
- 짧은 입력 = 사이드 시트, 긴 입력 = 전용 페이지. 하단 **[취소][저장], 저장이 오른쪽**. 저장 중에는 저장만 잠기고 "저장 중…".
```tsx
<FormFooter onCancel={() => history.back()} onSave={submit} saving={mut.isPending} saveDisabled={!valid} hint="* 필수 항목" />
```

### 상세 화면 — `DetailLayout`
- 상단 요약 → 탭: **정보 / 이력 / 첨부 / 승인** (있는 것만). 탭은 URL(`?tab=`)에 유지.

### 상태 표시 — `StatusBadge`
- 표준: **작성 중 · 대기 · 진행 중 · 검토 대기 · 승인 대기 · 승인 · 완료 · 반려 · 취소 · 오류** — 문구·색 고정.
- 원래 코드를 그대로 넘긴다(`submitted` → 검토 대기, `canceled` → 취소 …). DB 값은 바꾸지 않는다.
- 업무별 뜻이 다르면 `domain` (매출·매입 `pending` = 승인 대기). 사전에 없는 코드는 원문 그대로 회색(숨기지 않음).
- 사전에 없는 업무 고유 상태는 `label`·`tone` 으로: `<StatusBadge status="x" label="입고 대기" tone="amber" />`

### 알림 — `notify`
- `notify.success("저장했습니다")` · `notify.warn("재고가 음수가 됩니다", "입고 대기 LOT 로 처리됩니다")` · `notify.error("저장 실패", err)` · `notify.promise(p, {...})`
- **실패에는 사유를 붙인다** (`err` 를 그대로 넘기면 메시지를 뽑는다).
- 기존 `useToast().toast({...})` 는 계속 동작하지만 새 코드는 `notify`.

### 탭
- 같은 대상의 다른 면에만. **URL 유지(`useTabWithUrl`) 필수**. 예외: 매입·매출 관리 허브의 [매입|매출] (사이드바 탐색).

## 3. 적용 순서 (3-c)
허브별로 자주 쓰는 화면부터: 매출·매입 조회 → 재고 → CCP. 한 PR 에 몇 화면씩, 기능 변화 없이 부품만 바꾼다.

| 차수 | 화면 | 적용 |
|---|---|---|
| 1차 (2026-10-14) | 매출 조회 · 매입 조회 · 발주서 | PageHeader, 상태 StatusBadge (sale·purchase·purchaseOrder 업무 문구) |
| 1차 | 재고 관리 · CCP 모니터링 | PageHeader (재고 종류 전환·LOT 추적 / 기간·PDF 출력) |
| 1차 | 허브 입구 /hub/{허브} | PageHeader + 처리할 일 카드 (새 화면) |
| 다음 | 위 화면들의 필터·표 | FilterBar(URL 유지) · DataGrid — 표 동작(정렬·선택)이 바뀌므로 화면별로 검증하며 |

## 4. 검증
`server/commonUi.test.ts` — 상태 사전 문구·예외, URL 필터 읽기/쓰기, 표 정렬·페이지·정렬 순환, use-toast → sonner 전달, 헤더 도구 배치.

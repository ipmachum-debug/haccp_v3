# Millio AI 아키텍처 문서

> 최초 작성: 2026-04-21
> 상태: CANONICAL — 신규 기능 / 리팩토링 / 신규 모듈 개발 시 이 문서를 기준으로 결정.

---

## 문서 구성

### 핵심 원칙 (순서대로 읽기)
1. [00-layers.md](./00-layers.md) — **5계층 + shared-kernel** 정의
2. [01-dependency-rules.md](./01-dependency-rules.md) — 의존 방향 / 금지 규칙 / CI 강제
3. [02-naming-conventions.md](./02-naming-conventions.md) — 테이블 / 라우터 / 파일 네이밍
4. [03-event-catalog.md](./03-event-catalog.md) — 표준 도메인 이벤트 + outbox 패턴
5. [04-policy-registry.md](./04-policy-registry.md) — Feature / Capability / Package / Posting / Approval 정책

### 결정 기록 (ADR)
- [ADR-001-shared-kernel.md](./ADR-001-shared-kernel.md) — Shared Kernel 도입
- [ADR-002-no-core-to-industry.md](./ADR-002-no-core-to-industry.md) — core → industry 역참조 금지

---

## 핵심 철학

```
100만 줄짜리 제품의 목표는 "100만 줄을 쓰는 것"이 아니라
"100만 줄이 되어도 한 도메인 수정이 다른 도메인을 깨지 않는 구조" 이다.
```

### 6원칙 (코드 리뷰 기준)

1. **모든 기능은 도메인별 폴더로** — 파일 많은 건 괜찮음, 경계가 없는 게 문제
2. **모든 쓰기 작업은 상태전이 기준으로** — 자유 문자열 금지, enum 또는 상수
3. **회계/재고/LOT 는 이벤트 원천을 하나로** — 같은 도메인 이벤트가 여러 곳에서 발생 금지
4. **권한은 하드코딩 if문 말고 capability 기반** — 04-policy-registry.md 참조
5. **업종 특화는 core 에 넣지 말고 확장 모듈로** — ADR-002 참조
6. **삭제보다 취소/역처리 중심으로** — `delete` 액션 금지, `cancel` / `unpost` 사용

### 2가지 추가 원칙 (확장성)

7. **마이그레이션은 코드 밖으로** — `startupMigrations` 이 아닌 Drizzle migration 사용
8. **읽기 모델과 쓰기 모델 분리** — 대시보드/보고서는 집계 테이블 사용 (CQRS-lite)

---

## 현재 상태 (2026-04-21 기준)

| 원칙 | 상태 | 증거 |
|---|---|---|
| 1. 도메인별 폴더 | ✅ 진행 중 | `routers/accounting/`, `routers/haccp/` |
| 2. 상태 전이 기준 쓰기 | 🟡 혼재 | `batch.status` OK, 일부 문자열 자유 입력 남음 |
| 3. 이벤트 원천 단일화 | 🟡 진행 중 | `expense_journal_entries/lines` 로 수렴 중 |
| 4. Capability 권한 | ❌ 아직 | `adminProcedure` 단일 게이트. 신규 도입 필요 |
| 5. 업종 특화 분리 | ⚠️ 위험 | HACCP 가 `h_batches` 로 코어와 결합 |
| 6. 삭제 vs 취소 | 🟡 반반 | `cancel` 많음, `delete` 도 존재 |
| 7. 마이그레이션 외부화 | ❌ 아직 | `startupMigrations` 의존 |
| 8. CQRS-lite | ❌ 아직 | 대시보드가 트랜잭션 테이블 직접 집계 |

---

## 이주 전략

**Strangler Fig 방식으로 점진 이전** — Big Bang Rewrite ❌

비율: **신규 기능 70% : 구조 이주 30%**

1. 신규 기능은 반드시 새 레이어 구조로 작성
2. 기존 코드는 건드릴 때 함께 이주
3. 완성 목표 기간: 6 ~ 12 개월

---

## CI 강제

`.dependency-cruiser.cjs` 가 레이어 의존 규칙을 검사. 위반 시 PR merge 차단.

```bash
npx depcruise --config .dependency-cruiser.cjs server
```

---

## 읽는 순서 (역할별)

**신규 개발자**:
1. 00-layers.md (개요 파악)
2. 01-dependency-rules.md (건드릴 때 주의사항)
3. 02-naming-conventions.md (코딩 규칙)

**기능 추가 전**:
1. 이 기능이 어느 레이어인가? → 00-layers.md
2. 다른 레이어를 참조하는가? → 01-dependency-rules.md 허용?
3. 이벤트 발행이 필요한가? → 03-event-catalog.md
4. 권한 체크 어떻게? → 04-policy-registry.md

**리팩토링 전**:
1. ADR 들 먼저 읽기 (왜 이렇게 되었는지)
2. 현재 상태 표 확인 (어디부터 손댈지)

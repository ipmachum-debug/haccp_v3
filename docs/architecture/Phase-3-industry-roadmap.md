# Phase 3 — 신규 업종 진입 로드맵

> 작성: 2026-04-30 — Phase 2 cosmetic GMP lifecycle 완성 (#145~#160) 직후, Phase 3
> 시장 진입 후보 업종의 골격 + 우선순위 + 패턴 재사용 계획.

---

## 배경

```
Phase 1 (완료): 식품 (food) — HACCP + F-3 IoT 폐쇄 루프
Phase 2 (완료): 화장품 (cosmetic) — GMP lifecycle 9단계 + 운영 대시보드
Phase 3 (시작): 신규 업종 진입
```

Phase 2 에서 정립된 패턴 (lifecycle entity → BMR/IPC → 라벨 → release → 안정성 → 신고서 → 대시보드)
이 다른 업종에도 적용 가능. 본 문서는 Phase 3 후보 업종 + 진입 순서 + 패턴 재사용
계획.

---

## 후보 업종 + 우선순위

| 우선순위 | 업종 | 모듈 키 | 시장 적합성 | 패턴 재사용도 |
|---------|------|---------|-------------|---------------|
| **높음** | 의약품 | `pharmaceutical` | KGMP, 약사법 — 화장품과 가까움 | 90% (BMR/IPC/안정성 동일) |
| **높음** | 건강기능식품 | `health-functional` | KFDA, GMP — 식품+화장품 중간 | 85% |
| 중간 | 의료기기 | `medical-device` | MFDS GMP — ISO 13485 | 70% (별도 risk class) |
| 중간 | 일반제조 | `general-manufacturing` | ISO 9001 — 모든 분야 | 60% (lifecycle 단순) |
| 낮음 | 의류/섬유 | `apparel` | OEKO-TEX, BSCI | 40% (lifecycle 다름) |
| 낮음 | 전자제품 | `electronics` | RoHS, REACH | 30% |

---

## Phase 2 패턴 재사용 매트릭스

| Phase 2 entity | 의약품 | 건강기능식품 | 의료기기 | 일반제조 |
|----------------|--------|--------------|----------|----------|
| BMR (제조기록) | ✅ MFR | ✅ 동일 | ⚠️ DHR (Device History) | ✅ 단순화 |
| IPC (공정중관리) | ✅ 동일 | ✅ 동일 | ✅ 동일 | ⚠️ 옵션 |
| Formula (배합) | ✅ MF (Master Formula) | ✅ 동일 | ❌ N/A (BoM 으로) | ✅ BoM |
| Ingredient | ✅ API + 부형제 | ✅ 동일 | ⚠️ 부품 (BoM) | ✅ BoM |
| Label/INCI | ✅ 약품 표시 사항 (약사법 §65) | ✅ 영양성분/광고 | ⚠️ UDI | ❌ 일반표시 |
| Release | ✅ QA Release (GMP) | ✅ 동일 | ✅ 동일 | ⚠️ 단순 |
| Stability | ✅ ICH Q1A 동일 | ✅ 자체 안정성 | ⚠️ Shelf-life | ❌ |
| KFDA Report | ✅ MFDS 신고 | ✅ MFDS 신고 | ✅ MFDS GMP 심사 | ❌ |
| Dashboard | ✅ 동일 | ✅ 동일 | ✅ 동일 | ✅ 동일 |

→ **의약품 / 건강기능식품 은 패턴 80~90% 재사용 가능**, 즉 Phase 3 진입 시 1순위.

---

## Phase 3-A: 의약품 (Pharmaceutical) GMP

### 시장 컨텍스트
- **법규**: 약사법 + 의약품 등 안전에 관한 규칙
- **GMP 기준**: KGMP (식품의약품안전처 고시 2025-XX호)
- **국제**: PIC/S GMP, ICH Q7~Q11
- **주요 차이 (vs 화장품)**:
  - 처방전 (medical prescription) 개념 — 임상 / 처방 경로 추가 (cosmetic 의 "배합" 과 구분되는 진짜 의미의 처방)
  - API (Active Pharmaceutical Ingredient) 별도 관리
  - 안정성시험 ICH Q1A 동일하나 더 엄격 (장기 / 가속 / 과혹 / Photo / 동결-융해)
  - PIC/S 실사 대비 — 더 엄격한 audit trail
  - 의약품 시판 후 안전관리 (PMS) — 부작용 보고 (KAERS)

### 디렉토리 구조 (Phase 2 미러)
```
server/routers/industry/pharmaceutical/
  ├── index.ts                  # exports
  ├── bmr.router.ts             # MFR (Master Formula Record) + BMR
  ├── bmrIpc.router.ts          # IPC (공정중관리)
  ├── bmrIngredient.router.ts   # API + 부형제 투입
  ├── formula.router.ts         # MF (Master Formula)
  ├── label.router.ts           # 약품 표시 사항 (약사법 §65)
  ├── release.router.ts         # QA Release (GMP)
  ├── stability.router.ts       # ICH Q1A (장기/가속/과혹/Photo/동결-융해)
  ├── kgmpReport.router.ts      # KGMP / MFDS 신고
  ├── pms.router.ts             # 시판 후 안전관리 (PMS) — 신규 entity
  └── dashboard.router.ts       # 운영 대시보드

drizzle/schema/industry/pharmaceutical/
  ├── bmr.ts (h_pharma_bmr)
  ├── bmrIpc.ts
  ├── bmrIngredient.ts
  ├── formula.ts
  ├── label.ts
  ├── release.ts
  ├── stability.ts
  └── pms.ts                    # 신규 entity (cosmetic 에 없음)

server/db/industry/pharmaceutical/  (DB 어댑터)
client/src/pages/pharmaceutical/    (클라이언트 페이지)

scripts/migrate-pharma-*.ts (마이그레이션 — Phase 2 패턴 그대로)
```

### Phase 3-A lifecycle 단계 (Phase 2 미러 + α)

| Step | 영역 | Phase 2 대응 | 차이점 |
|------|------|--------------|--------|
| 3-A-1 | BMR (MFR) | 2-1 | "처방" 명명 가능 (약품은 진짜 처방 의미) |
| 3-A-2 | BMR detail | 2-2 | |
| 3-A-3 | IPC | 2-3 | 더 엄격한 limits |
| 3-A-4a | Master Formula | 2-4a | API + 부형제 분리 |
| 3-A-4b | Ingredient (API) | 2-4b | API 별도 관리 (CTD 연계) |
| 3-A-5 | Label (약사법 §65) | 2-5 | INCI 대신 KP/USP/EP 모노그래프 |
| 3-A-6 | Release (QA) | 2-6 | QP (Qualified Person) 책임자 서명 |
| 3-A-7 | Alerts | 2-7 | IPC fail / PMS 사례 / 회수 |
| 3-A-8 | Stability ICH Q1A | 2-8 | + Photo + 동결-융해 |
| 3-A-9 | KGMP / MFDS 신고서 | 2-9 | CTD (Common Technical Doc) 양식 |
| 3-A-10 | 대시보드 | 2-10 | + PMS 부작용 카운트 |
| **3-A-11** | **PMS (신규)** | — | 시판 후 부작용 보고 + KAERS 연계 |

→ 약 11개 PR (Phase 2 와 동일 개수). 각 PR 1~2일.

---

## Phase 3-B: 건강기능식품 (Health-Functional Food)

### 시장 컨텍스트
- **법규**: 건강기능식품에 관한 법률
- **GMP 기준**: 건강기능식품 GMP (KFDA 고시)
- **주요 차이 (vs 화장품)**:
  - 영양성분 표시 (영양기능정보 / 일일섭취량 / 주의사항)
  - 기능성 원료 (인정형 / 고시형) 분리
  - 광고 심의 (한국건강기능식품협회)
  - 안정성시험 자체 기준 (ICH Q1A 보다 단순)

### 패턴 재사용
- BMR / IPC / Formula / Ingredient / Release / Stability — Phase 2 cosmetic 그대로 적용
- Label 만 영양성분 표시 + 기능성 정보로 교체
- KFDA Report 는 건기식 신고서 양식

→ Phase 3-A 의약품 보다 **공수 적음** (5~7 PR 예상).

---

## 진입 순서 권장

```
[1] Phase 3-A 의약품 GMP    — 11개 PR, 약 2~3주
   ↓ (대표 화장품 + 의약품 동시 운영 검증)
[2] Phase 3-B 건강기능식품   — 7개 PR, 약 1~2주
   ↓ (식품 + 화장품 + 건기식 통합 — 식품기업 추가 진입)
[3] Phase 3-C 의료기기 GMP   — 별도 검토 (ISO 13485)
[4] Phase 3-D 일반제조 (ISO 9001) — 단순 lifecycle
```

---

## 의존성 / ADR 준수 확인

각 신규 industry 추가 시:

- [ ] `industry-cannot-use-other-industry` — pharmaceutical 이 cosmetic / food 무참조
- [ ] 공통 패턴은 shared-kernel 또는 core 로 승격 검토
  - 예: ICH Q1A 안정성시험 → cosmetic / pharmaceutical 양쪽 사용 시 core-mes/stability 로 승격
  - 예: BMR lifecycle → core-mes/lifecycle 로 승격
- [ ] core-mes / core-erp 가 industry/pharmaceutical 무참조 (ADR-002)

→ Phase 3-A 진입 시 Phase 2 cosmetic 의 stability / lifecycle 코드 검토 → 공통 패턴 추출 PR 가능.

---

## 본 PR (Phase 3 시작 PR)

이번 PR 은 **로드맵 문서만 추가**. 실제 코드는 후속 PR (3-A-1 부터) 에서.

이유:
- 골격 디렉토리 미리 생성 시 빈 import 에러 가능성
- Phase 2 완성 직후라 패턴 안정 검토 필요 (1~2주 관찰)
- 신규 업종 시장 검증 (영업 / 법무 / 운영) 후 진입 결정

후속 PR 트리거:
- 의약품 사업 진입 결정 시 → Phase 3-A-1 PR (의약품 BMR) 생성
- 건기식 사업 진입 결정 시 → Phase 3-B-1 PR

---

## Phase 2 회고 — Phase 3 적용 교훈

✅ **잘 작동한 패턴**:
- 9개 PR 분할 (한 PR = 한 entity)
- ADR-002 cosmetic isolation 엄격 준수
- 마커 검증 자동화 (`grep -rn '<<<<<<<\|>>>>>>>'`)
- migration runner 통합 스크립트 (Step 1)

⚠️ **개선 필요**:
- 명명 규칙 (cosmetic 의 "배합" vs "처방" 사고) — Phase 3 진입 전 업종별 용어집 확보
- 테넌트 미존재 환경 E2E — smoke 스크립트 필수 (#144, #148 패턴)
- 운영 활성화 체크리스트 미리 (Step 2~3 패턴)

→ Phase 3 진입 시 위 4개 자산 (PR 분할 / ADR / 마커검증 / 마이그레이션 runner) +
   3개 개선 (용어집 / smoke / 운영 체크리스트) 모두 갖추고 시작.

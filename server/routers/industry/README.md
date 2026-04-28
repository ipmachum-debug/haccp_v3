# server/routers/industry/

> 작성: 2026-04-28
> 트리거: PR #114 업종 모듈화 진단 보고서 + 특허 청사진 매핑

## 목적

Layer 4 (industry) — 업종별 규제 / 공정 / 문서 특화 라우터의 5계층 디렉토리 구조 시작점.

`docs/architecture/00-layers.md` 의 5계층 정의에 따라 본 디렉토리는 다음 업종을 담는다:

```
server/routers/industry/
├── food/        — HACCP, CCP, 위생, 유통기한, 회수 (점진 이주 예정)
├── cosmetic/    — BMR, 처방서, 라벨, 전성분 (이번 PR PoC)
├── health/      — 건기식 COA, 배합, 기능성 원료
├── electronics/ — 전자부품 RoHS / IPC
├── apparel/     — 섬유 가공 / 염색
└── general-manufacturing/ — Fallback 템플릿
```

## 현재 상태 (2026-04-28)

| 업종 | 디렉토리 상태 | 비고 |
| --- | --- | --- |
| `cosmetic/` | 🟢 **이번 PR PoC** | `bmr.router.ts` placeholder — Phase 2 (화장품 GMP) 시작점 |
| `food/` | ⚠️ 미이주 | 현재 `server/routers/haccp/` (평탄 위치) — Phase A-1 에서 점진 이주 |
| 기타 | ⏳ 미생성 | 시장 진입 시점에 추가 |

## 의존성 룰 (`.dependency-cruiser.cjs` 가 자동 강제)

```
✅ industry/cosmetic → core-erp / core-mes / shared-kernel / platform  (정상)
❌ industry/cosmetic → industry/food                                    (cross-industry 금지)
❌ industry/cosmetic → addon/*                                          (역방향 금지)
❌ core-erp → industry/cosmetic                                         (ADR-002)
```

CI 자동 검증: `.github/workflows/architecture-check.yml`

## 신규 업종 추가 절차

1. `server/routers/industry/<업종>/` 디렉토리 생성
2. 1+ placeholder 라우터 (`*.router.ts`)
3. `index.ts` 에서 export
4. `server/routers/_maps/industryMap.ts` 에 통합
5. `server/routers/_root.ts` 에서 spread
6. `server/lib/industry/industryConfig.ts` 의 `INDUSTRY_CODES` 매핑
7. `tsc --noEmit` + `npm run arch:check` 통과 검증

## 관련 문서

- [`docs/architecture/00-layers.md`](../../../docs/architecture/00-layers.md) — 5계층 정의
- [`docs/architecture/01-dependency-rules.md`](../../../docs/architecture/01-dependency-rules.md) — 의존 방향
- [`docs/architecture/ADR-002-no-core-to-industry.md`](../../../docs/architecture/ADR-002-no-core-to-industry.md)
- [`docs/architecture/industry-coupling-audit-2026-04-28.md`](../../../docs/architecture/industry-coupling-audit-2026-04-28.md) — 진단 + 마일스톤
- [`server/lib/industry/industryConfig.ts`](../../lib/industry/industryConfig.ts) — 업종 메타데이터 단일 source

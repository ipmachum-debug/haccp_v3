# addon/ — 애드온 레이어

> 최상위. **선택적 고급 기능** · 별도 과금 / 별도 배포 가능.

## 속하는 것

| 하위 도메인 | 책임 |
|---|---|
| `ai/` | 규칙엔진, RAG 지식베이스, 챗봇 "하나", 이상탐지, 예측 |
| `hr-advanced/` | 급여/인사 고급 기능 (4대보험 자동계산, 근태 집계 등) |
| `bi/` | BI 리포트, 커스텀 대시보드, 데이터 export |
| `iot/` | 설비 센서 / 온도 측정기 수집 |
| `mobile/` | 모바일 전용 API / 푸시 알림 |
| `external-integration/` | 외부 시스템 연동 (세무, 쇼핑몰, 물류) |

## 속하지 않는 것

- ❌ core 가 없으면 안 되는 **필수** 기능 → `core-erp` / `core-mes` 로
- ❌ 다른 `addon/*` 를 import (애드온 간 수평 의존 금지)
- ❌ core / industry 가 `addon/*` 를 import (하위 레이어가 상위 참조 금지)

## 의존 규칙

```
addon → industry → core-erp, core-mes → shared-kernel → platform
```

- addon 은 **모든 하위 레이어 참조 가능**
- 하지만 **다른 addon 은 참조 불가** — 애드온끼리는 이벤트 / API 로만 연결

## 이벤트 구독 패턴

addon 은 주로 core / industry 이벤트를 **구독** 하는 역할:

```typescript
// addon/ai/subscribers/alert.subscriber.ts
eventBus.subscribe('food.ccp-deviation', async (event) => {
  await aiRulesEngine.evaluate(event);
});

eventBus.subscribe('inventory.low-stock-alert', async (event) => {
  await aiSuggestPurchase(event);
});
```

## 이주 소스 (기존 → 여기로)

| 기존 위치 | 이주 대상 |
|---|---|
| `server/routers-ai.ts` | `addon/ai/` |
| `server/db/rulesEngine.ts` | `addon/ai/rules/` |
| `server/db/aiContextLayer.ts` | `addon/ai/context/` |
| `server/db/aiActionEngine.ts` | `addon/ai/action/` |
| `server/db/knowledgeBase.ts` | `addon/ai/knowledge/` |
| `server/routers/accounting/hrManagement.router.ts` (급여 고급 부분) | `addon/hr-advanced/` |
| `server/services/ai/*` | `addon/ai/services/` |
| `server/services/bank/aiClassify.service.ts` | `addon/ai/bank-classify/` |

## 과금 연결

addon 은 **Package Policy** (04-policy-registry.md) 로 제어됨:
- `enterprise` 플랜 → AI + BI + IoT 기본 포함
- `standard` 플랜 → AI 선택 add-on
- 체험 / 프로모션은 `tenant_feature_overrides` 사용

## 참고

- `docs/architecture/00-layers.md`
- `docs/architecture/04-policy-registry.md`
- `docs/architecture/03-event-catalog.md` — addon/ai 이벤트 목록

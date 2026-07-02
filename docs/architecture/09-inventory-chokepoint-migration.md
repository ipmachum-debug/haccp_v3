# 09 — 재고 3자 불변식 단일 관문(applyInventoryDelta) 이주 대장

> P2 — 병② "3자 불변식 미강제" 봉인. `08-inventory-identity-diagnosis.md` 후속.
> 최초: 2026-07-02. 성격: **Strangler Fig 이주 추적 대장**(살아있는 체크리스트).

## 왜 계속 재발했나 (구조적 원인)

재고 이동 1건은 항상 세 원장을 함께 갱신해야 정합이다:

```
h_inventory_lots (LOT, FEFO 정본)  ⇄  h_inventory_transactions (원장)  ⇄  h_inventory (집계)
```

그런데 ~20+ write 경로가 **각자 3 leg 을 손으로 짜고**, 다수가 하나 이상을 누락했다.
로직을 아무리 고쳐도 재발한 이유:

1. **단일 정의 지점 부재** — "재고를 움직인다"는 연산이 코드 20곳에 흩어져, 새 기능마다 새 구현이 생김.
2. **불변식 미강제** — 어떤 경로도 "3 leg 이 맞는지"를 강제하지 않음 → 조용히 누락.
3. **검증 루프 부재** — 표류를 잡아내는 상시 장치가 없어 데이터 부채로 누적.

→ **근본 해법은 로직 수정이 아니라 "관문 단일화 + 자가 치유"**. 그게 P2.

## 관문 API (`server/lib/inventory/applyInventoryDelta.ts`)

| 함수 | 역할 |
|------|------|
| `recomputeAggregateFromLots(conn, {tenantId, subject, unit?})` | ★ **자가 치유 primitive**. 집계를 ΣLOT.available 로 재계산(available := ΣLOT.available, total := available + reserved). 집계 행 FOR UPDATE 로 동시성 직렬화. |
| `applyLotDelta(conn, {...})` | 기존 LOT 에 델타 적용 + 원장 + 집계 재계산(3 leg 원자). 소진 부족 시 `InventoryShortageError`. |
| `receiveNewLot(conn, {...})` | 신규 LOT 생성 + receipt 원장 + 집계 재계산(3 leg 원자). |
| `withInventoryTx(fn)` | 트랜잭션 없는 호출자용 래퍼. |

**자가 치유의 힘**: 집계를 "증감"이 아니라 **LOT 합계로 재계산**하므로, 과거 어떤 경로가
집계를 빠뜨렸어도 다음 이동에서 자동 교정된다. 표류가 구조적으로 불가능.

### 규약 정규화(census 가 드러낸 분열을 관문에서 통일)
- 원장 `quantity` 는 **항상 양수**, 방향은 `transaction_type`.
- `lot_id` 매칭 실패는 **NULL**(sentinel 0 금지).
- 원장/집계 `material_id` 는 canonical `h_materials.id`만(item_master.id 유입 금지). 제품은 `material_id=NULL`+`product_id`.

## 이주 방식 (Strangler Fig — 한 번에 다시 쓰지 않음)

- **패턴 A (집계 누락 경로)**: 기존 LOT/원장 코드 유지 + 커밋 직전
  `await recomputeAggregateFromLots(conn, { tenantId, subject, unit })` **한 줄 추가**.
  - subject 는 **LOT 의 canonical id**(`lot.material_id`/`lot.product_id`)를 쓴다 — 변수로 들고 있는
    `material_id` 가 item_master 공간일 수 있으므로 LOT 정본을 신뢰.
- **패턴 B (신규/정리 경로)**: `receiveNewLot`/`applyLotDelta` 로 3 leg 통째 위임.

## 이주 대장 (census 전수 — 최근 갱신 2026-07-02)

상태: ✅ 이주완료 / 🔜 다음 대상(트랜잭션 有, 저위험) / ⏳ 대기(비트랜잭션·복잡) / 🐞 정합버그(우선)

### A. 입고/증가
| 상태 | 사이트 | leg | 비고 |
|------|--------|-----|------|
| ✅존치 | `inboundManagement.createInboundReceipt` | 3 leg 원자 | 정본 템플릿. 추후 `receiveNewLot` 로 대체 검토 |
| ✅존치 | `accounting/purchasePost.postPurchase` | 3 leg | 단 AGG upsert 가 inner try/catch → 이주 시 recompute 로 대체 |
| ⏳ | `haccp/haccpIntegration.createPurchase` | 3 leg(best-effort) | #387 로 AGG 추가됨. → 트랜잭션화 + `receiveNewLot` 이주 |
| ⏳ | `haccp/visualInspectionFinished.createMaterialReceiptWithLot` | 3 leg(비원자) | 패턴 B |
| ⏳ | `system/simplifiedDataProcessor.createMaterialPurchase` | 3 leg(공유 conn) | |
| 🔜 | `inventory/inventoryFunctions.receiveMaterial` | LOT+TXN, **AGG 생략(명시)** | 패턴 A |
| 🔜 | `inventory/inventoryFunctions.createInventoryLot` | LOT+TXN | 패턴 A |
| 🔜 | `production/productionAnalytics.approvePurchaseOrderSuggestion` | LOT+TXN | 패턴 A |

### B. 소모/출고/차감
| 상태 | 사이트 | leg | 비고 |
|------|--------|-----|------|
| ✅존치 | `production/autoMaterialIssueV2.issueOneMaterial` | 3 leg 원자 | 의도된 정본 소모 경로 |
| ✅존치 | `production/outboundManagement.createOutboundRecord` | 3 leg 원자 | 정본 템플릿 |
| ✅존치 | `inventory/inventoryFunctions.deductLotQuantity` | 3 leg 원자 | |
| 🐞 | `inventory/materialOutboundPost.postMaterialOutbound` | **TXN only(음수)** | **LOT 미차감**! 유령 원장. 우선 수정 |
| ⏳ | `production/autoMaterialIssue.autoMaterialIssue`(v1) | 3 leg(비원자)+fallback | v2 로 수렴 검토 |
| ⏳ | `production/batchLifecycle.completeBatch` | AGG 선차감 후 LOT/TXN best-effort | 순서 취약. 패턴 B 재구성 |
| 🔜 | `inventory/inventoryFunctions.addMaterialInputToBatch` | LOT+TXN | 패턴 A |
| 🔜 | `inventory/inventoryFunctions.releaseInventory` | LOT+TXN | 비표준 txn_type |
| 🔜 | `inventory/inventory.router.release` | LOT+TXN | 패턴 A |
| 🔜 | `system/simplifiedDataProcessor.createOutbound` | LOT+TXN | |
| 🔜 | `system/simplifiedDataProcessor.createBatchInput` | LOT+AGG, **TXN 생략** | 원장 공백 |
| ⏳ | `production/decomposeBundleOutbound` | LOT+TXN | sku 기반 |
| ⏳ | `production/productOutboundManagement.releaseProduct` | LOT+TXN | 제품 |

### C. 완제품 생산 입고(제품측)
| 상태 | 사이트 | leg | 비고 |
|------|--------|-----|------|
| 🐞 | `production/productionCompletePost.postProductionComplete` | **TXN only** | LOT+AGG 생략. 제품재고 증가 불일치의 원인 |
| 🐞 | `production/productionCompletePostV2` | TXN only | 동일 |
| ⏳ | `production/batchLifecycle.completeBatch` SKU LOT 블록 | LOT+TXN | AGG 별도 |
| ⏳ | `production/productOutboundManagement.createProductLot/ensureBatchLots` | LOT+TXN | 제품 |
| ⏳ | `system/simplifiedDataProcessor.createProductLot` | LOT+TXN | |

### D. 조정/실사
| 상태 | 사이트 | leg | 비고 |
|------|--------|-----|------|
| ⏳ | `inventory/inventoryAdjustment.adjustInventory` | 3 leg(비원자) | LOT.quantity vs AGG.total 정합 주의 |
| 🔜 | `inventory/inventoryFunctions.adjustInventoryStock` | LOT+TXN | 비표준 txn_type |
| 🔜 | `inventory/inventory.router.adjustStock` | LOT+TXN | 패턴 A |
| 🔜 | `inventory/inventory.router.adjustStockByProduct` | LOT+TXN | FEFO cascade |
| 🔜 | `inventory/inventory.router.applyPhysicalCount` | LOT+TXN | 패턴 A |

### E. 취소/역수행/반품
| 상태 | 사이트 | leg | 비고 |
|------|--------|-----|------|
| ✅**이주완료** | `accounting/purchaseCancel.cancelPurchase` | +AGG recompute | **본 PR** |
| ✅**이주완료** | `accounting/purchaseReturn.router.create` | +AGG recompute | **본 PR** |
| 🔜 | `accounting/purchaseOrder.router.delete`(PO 역수행) | LOT+TXN | 패턴 A |
| 🔜 | `accounting/productSalePost.postProductSale` | LOT+TXN(제품) | 패턴 A(subject=productId) |
| 🔜 | `accounting/productSaleCancel.cancelProductSale` | LOT+TXN(제품) | 패턴 A |
| 🔜 | `production/productOutboundManagement.cancelProductRelease` | LOT+TXN(제품) | |
| 🐞 | `inventory/materialOutboundCancel.cancelMaterialOutbound` | TXN only(음수) | LOT 미복원 |
| 🐞 | `production/productionCompleteCancel` | TXN only | LOT+AGG 미복원 |
| ⏳ | `inventory/inventoryFunctions.deleteMaterialInput` | LOT 복원만 | TXN+AGG 누락 |

### F. 예약/상태/복구(수량 델타 없음)
| 상태 | 사이트 | 비고 |
|------|--------|------|
| ⏳ | `industry/food/ccp.evaluatorTrigger.reserveBatchLots` | LOT.status 만, AGG.reserved 미동기 |
| 참고 | `lib/consistency/recovery.ts` | 재조정 도구(원장 백필) — 관문과 별개 유지 |
| 참고 | `lib/inventory/fefoLotAllocation.allocateLotsFEFO` | 읽기전용 할당기(차감 안 함) — 호출자가 차감 |

## 다음 우선순위
1. 🐞 **정합버그 3건 먼저**: `postMaterialOutbound`(LOT 미차감), `productionCompletePost/V2`(제품 LOT+AGG 누락), `materialOutboundCancel`/`productionCompleteCancel`(미복원). — 실제 오차 생성원.
2. 🔜 **패턴 A 일괄**: `inventory.router` 4종 + `inventoryFunctions` 3종 + PO/판매 취소 — 한 줄 recompute 추가로 저위험.
3. **검증 루프 상설화**: `diagnose_inventory_integrity.sql` 을 주기 실행(스케줄러/CI)해 3a/3b 표류를 상시 감시 → 재발 즉시 가시화.

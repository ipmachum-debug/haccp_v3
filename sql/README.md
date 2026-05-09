# Tenant 2 (millioai.com) DB Migration SQL — Step 5~9

찹쌀떡 제조사 tenant_id=2 의 점진적 데이터 마이그레이션 SQL 묶음.
각 step 은 **dry-run (ROLLBACK)** → **commit** 두 파일로 구성.

| Step | 목적 | dry-run | commit | 실행 결과 |
|------|------|---------|--------|----------|
| 5 | mat063 remap 보정 | `step5_fix_mat063_remap.sql` | `step5_fix_mat063_remap_commit.sql` | 완료 |
| 6 | 마카다미아왕찹쌀떡 3종 BOM 등록 | `step6_macadamia_3_bom_update.sql` | `step6_macadamia_3_bom_commit.sql` | 완료 |
| 7 | 마카다미아왕찹쌀떡(혼합)-흰 신규 등록 + report_no 통일 | `step7_macadamia_mixed_white_dryrun.sql` | `step7_macadamia_mixed_white_commit.sql` | item_master.id=301, h_products_v2.id=301, PROD-048 |
| 8 | h_products_v2 backfill (id=295/296/297/298) | `step8_h_products_v2_backfill_dryrun.sql` | `step8_h_products_v2_backfill_commit.sql` | active 89→93 |
| 9 | 4/20 batch_production AR backfill (586/587/588) | `step9_batch_production_ar_backfill_dryrun.sql` | `step9_batch_production_ar_backfill_commit.sql` | AR 2418/2419/2420, pending_review 8→11 |

## 실행 패턴

```bash
# 1) dry-run 으로 영향 범위 검증 (ROLLBACK 포함)
mysql -uroot -p haccp_tenant_db < sql/stepN_*_dryrun.sql

# 2) 결과 OK 시 commit 실행
mysql -uroot -p haccp_tenant_db < sql/stepN_*_commit.sql
```

## 핵심 메모

- **Step 7**: report_no='20210212055310' 로 4종 묶음 (백/흑/혼합-흰/혼합-흑) 식약처 동일 보고서 번호로 등록
- **Step 8 root cause**: Step 2 (own_product 마이그) 가 item_master 만 INSERT 하고 h_products_v2 누락 → product.list tRPC API (server/routers/production/product.router.ts:22-62) 가 hProductsV2 만 조회하므로 신제품 검색 불가
- **Step 9 root cause**: 4/20 batches (586/587/588) 가 5/9 21:35 bulkCreateForDay 로 생성되었으나 batchOrchestrator 6.3 (batch_production AR) 로그 미출력 → batch level AR 누락 → 승인관리 검토대기에 4/20 CCP 기록지 안 보임

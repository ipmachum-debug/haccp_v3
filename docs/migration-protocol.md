# 마이그레이션 / 데이터 백필 운영 프로토콜

**작성일**: 2026-04-26
**계기**: PR-W2 dry-run 이 의도치 않게 commit 된 사고 + PR-K3 mld 73건 누락 가능성

---

## 🚨 핵심 룰: DDL 은 트랜잭션 밖에서 사전 실행

### 배경

MySQL/InnoDB 에서 다음 DDL 문은 **암묵적 commit (implicit commit)** 을 발생시켜
현재 트랜잭션을 강제 종료시킨다:

- `CREATE TABLE` / `DROP TABLE` / `ALTER TABLE`
- `TRUNCATE`
- `RENAME TABLE`
- `CREATE INDEX` / `DROP INDEX`
- `LOAD DATA INFILE` (일부 변형)

### 위험한 패턴 (사고 사례)

```typescript
// ❌ 위험: BEGIN 후 DDL → DDL 시점에 implicit commit. 이후 UPDATE 는 auto-commit.
await conn.beginTransaction();
await conn.query(`DROP TABLE IF EXISTS backup_xxx`);     // ← 여기서 트랜잭션 종료!
await conn.query(`CREATE TABLE backup_xxx AS SELECT...`); // 별개 auto-commit
await conn.execute(`UPDATE h_xxx SET ...`);               // 별개 auto-commit ★ 되돌릴 수 없음
if (DRY_RUN) await conn.rollback();                       // 빈 트랜잭션을 롤백 (효과 없음)
```

이 패턴이 PR-W2 에서 dry-run 가드를 우회시켜 13개 LOT 단위 변환이 실제 commit 되었다.

### 안전한 패턴

```typescript
// ✅ 안전: DDL 을 트랜잭션 밖에서 사전 실행
console.log("[Step 1] DDL — 트랜잭션 외부");
await conn.query(`DROP TABLE IF EXISTS backup_xxx`);
await conn.query(`CREATE TABLE backup_xxx AS SELECT...`);

console.log("[Step 2] BEGIN TRANSACTION + UPDATE");
await conn.beginTransaction();
try {
  await conn.execute(`UPDATE h_xxx SET ...`);
  if (DRY_RUN) await conn.rollback();
  else        await conn.commit();
} catch (e) {
  await conn.rollback();
  throw e;
}
```

---

## ✅ 마이그레이션 스크립트 작성 체크리스트

1. **Dry-run / Commit 분기**
   - `--dry-run` 이 기본, `--commit` 명시 시에만 영구 적용
   - 실행 시작 시 모드를 명확히 출력

2. **백업 우선**
   - 이름 규칙: `<pr_id>_backup_<table>_YYYY_MM_DD`
   - 변경 대상 행만 백업 (전체 테이블 X — 디스크 절약)
   - `CREATE TABLE backup AS SELECT * FROM ... WHERE ...` 형태

3. **DDL 트랜잭션 분리**
   - 백업 테이블 생성 (DDL) 은 트랜잭션 시작 전에
   - UPDATE/DELETE 만 BEGIN/COMMIT/ROLLBACK 안에

4. **사후 검증 SQL**
   - 변경된 행 수가 기대치와 일치하는지
   - 잔존 부정합 (mismatch / NULL) 카운트 0
   - 핵심 invariant 재확인 (예: 합계, 단위 혼재)

5. **로그 출력**
   - BEFORE / AFTER 통계 print
   - affected rows 수 print
   - 최종 mode 표시 (DRY-RUN ROLLBACK / COMMIT)

---

## 🗂️ 백업 테이블 라이프사이클

- **생성**: 마이그 dry-run / commit 시점에 자동 생성
- **검증 기간**: 최소 30일 보존 (롤백 비상시 대응)
- **삭제**: 30일 후 별도 정리 작업 (`scripts/_cleanup-backup-tables.ts`)
- **명명**:
  - 권장: `<pr_id>_<purpose>_backup_<YYYY_MM_DD>`
  - 예: `w3_tx_date_backup_2026_04_26`, `k3_mld_backup_2026_04_26`

---

## 📋 PR 마이그레이션 워크플로우

```
1. 진단 스크립트 작성 → 실행 → 결과 저장 (_<purpose>-output.txt)
2. 사용자에게 진단 결과 + 정정 정책 보고 → 승인 받기
3. 백필 스크립트 작성 (dry-run / commit 두 모드)
4. dry-run 실행 → AFTER 통계 보고 → 사용자 최종 승인
5. commit 실행 → 결과 보고
6. 코드 수정이 동반되는 경우 → genspark_ai_developer 브랜치에 커밋
7. PR 생성 (코드 + 데이터 백필 스크립트 둘 다 포함)
8. PR 본문에 dry-run 출력 / 검증 SQL / 롤백 절차 명시
```

---

## 🔄 롤백 절차 (긴급)

```sql
-- 예: W3 transaction_date 백필 롤백
START TRANSACTION;

UPDATE h_inventory_transactions t
JOIN w3_backfill_tx_date_backup_2026_04_26 bk ON bk.id = t.id
SET t.transaction_date = bk.transaction_date;

-- 검증
SELECT COUNT(*) FROM h_inventory_transactions t
JOIN w3_backfill_tx_date_backup_2026_04_26 bk ON bk.id = t.id
WHERE t.transaction_date <> bk.transaction_date;
-- 0 이어야 함

COMMIT;
```

---

## 📝 사고 후 학습 사항

### PR-W2 사고 (2026-04-26)
- **증상**: dry-run 실행 후 ROLLBACK 출력됐지만 LOT 13건 + 트랜잭션 13건 + inbound_lines 13건 모두 commit 됨
- **원인**: `BEGIN TRANSACTION` 직후 `DROP/CREATE TABLE` 실행 → implicit commit
- **다행**: 결과 값이 사용자 확정값과 100% 일치, 백업 테이블 보존 → 그대로 유지
- **개선**: 본 프로토콜 작성, 향후 모든 마이그 스크립트에 적용

### 의심 사례: PR-K3 mld 73건 누락
- 동일 패턴이 의심됨. 백업 테이블이 commit 됐는데 UPDATE 가 ROLLBACK 처리됐을 가능성. (역방향 사고)
- W3 단계에서 mld 정합성 점검 시 재검토 필요.

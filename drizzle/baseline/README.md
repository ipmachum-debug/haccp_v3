# 실측 스키마 baseline

운영 DB 의 `information_schema` 를 그대로 덤프한 결과입니다.
**drizzle 스냅샷("코드가 주장하는 스키마")이 아니라 "실제로 존재하는 스키마"** 입니다.

## 왜 필요한가

저장소의 마이그레이션은 스키마의 source of truth 가 아닙니다.
283개 테이블 중 271개가 `CREATE TABLE` 이력 없이 존재합니다 ([Issue #421](https://github.com/ipmachum-debug/haccp_v3/issues/421)).
따라서 "실제로 무엇이 있는가" 는 DB 에 물어보는 수밖에 없고, 그 답을 여기 고정합니다.

## 생성 / 갱신

```bash
# ① 대조만 (읽기 전용, 파일 안 씀)
npx tsx scripts/dump-schema-baseline.ts

# ② 결과 확인 후 기록
npx tsx scripts/dump-schema-baseline.ts --write
```

`information_schema` 에 대한 `SELECT` 만 수행합니다. DB 를 변경하지 않습니다.

## 이 디렉터리를 `drizzle/meta/` 에 두지 않은 이유

`drizzle/meta/` 는 drizzle-kit 이 관리합니다(`_journal.json`, `*_snapshot.json`).
외부 파일을 섞으면 도구 동작을 예측하기 어려워지므로 분리했습니다.

## 담긴 것 / 담기지 않은 것

- ✅ 테이블명, 컬럼명, 타입, nullable, 기본값, 순서
- ❌ 행 데이터 없음 (구조만)
- ❌ 인덱스/외래키는 현재 미포함 (필요해지면 확장)

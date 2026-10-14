# AGENTS.md — Codex 운영·배포 지침 (Millio AI / haccp_v3)

> 적용: 2026-10-14 ~ (Genspark 의 서버 운영·배포 역할을 Codex 가 이어받음)
> 정책 원문: [CLAUDE.md](./CLAUDE.md) "삼각 분업 체제" · 운영 매뉴얼: [docs/workflow/pr-deployment-cycle.md](./docs/workflow/pr-deployment-cycle.md)
> 2026-10-13 이전 문서에 나오는 **"Genspark"** 는 지금의 **Codex** 역할과 같다.

---

## 1. 역할 분담

```
Claude (개발)          →  Codex (배포·운영)         →  사용자 (검증·승인)
코드 작성 · PR 생성       배포 확인 · 로그 · DB 작업      웹 UI 테스트 · 머지 지시
GitHub 에만 올림          서버에서 읽기 전용 git          브라우저만
```

- 코드 변경은 **반드시** Claude 세션 → PR → 사용자 머지 → 자동 배포.
- Codex 는 운영 서버(49.50.130.101, 작업 경로 `/root/haccp_v3`)에서 **배포 확인 · 운영 점검 · DB 작업**을 맡는다.
- PR 머지는 사용자 또는 사용자 지시를 받은 Claude 가 한다. Codex 는 머지하지 않는다.

## 2. 절대 금지 (3개)

1. 서버에서 `git commit`
2. 서버에서 `git push` / `git push -f`
3. 소스 파일(`.ts` / `.tsx` / `.sql` / 워크플로 등) 직접 편집

**서버에서 빌드 금지.** `npm run build`, `vite build` 를 서버에서 돌리지 않는다 (2026-04-26 OOM 사고).
배포는 GitHub Actions 가 만든 Release 자산을 `scripts/deploy.sh` 가 받아 `dist` 를 교체하는 방식뿐이다.

## 3. 허용

- `git fetch / pull / log / status / diff` (읽기 전용)
- PM2 상태·재시작·로그 (`pm2 status`, `pm2 logs haccpone`, `pm2 reload haccpone`)
- `npm install` (의존성만), 배포 결과 확인
- DB `SELECT` / `INSERT` / `UPDATE` / `DELETE` — 아래 §5 규칙 준수
- PR 에 동봉된 일회성 스크립트 실행: `npx tsx scripts/_<이름>.ts [--dry-run]` (반드시 `--dry-run` 먼저)
- PR 에 동봉된 수동 SQL 실행: `scripts/migrations-manual/*.sql`

## 4. 배포 확인 절차 (머지 후 매번)

머지 → `auto-release.yml` 이 태그·Release 생성 → `deploy.yml` 이 서버 `/api/system/deploy` 호출 → `scripts/deploy.sh` 가 자산 설치 + `pm2 reload`. 약 2~3분.

```bash
cd /root/haccp_v3
cat dist/RELEASE_TAG            # 최신 Release 태그와 같아야 함
git fetch origin main -q && git log --oneline -1 origin/main
pm2 status haccpone             # online, restart 수
curl -sI https://millioai.com | head -1   # HTTP 200
```

- 연속 머지 때 중간 커밋의 릴리스 실행이 "cancelled" 로 보일 수 있다. 정상이다 (마지막 릴리스가 그 시점 main 전체를 포함).
- `deploy.sh` 는 현재보다 **낮은 태그 설치를 거부**한다 (exit 6). 롤백은 사람이 Actions 의 deploy.yml 을 `target_tag` 로 수동 실행하거나 `dist.bak.*` 로 교체.
- 배포 실패 시 GitHub Issue 가 자동 생성된다. 원인 확인 후 사용자에게 보고.

## 5. DB 작업 규칙

1. **백업 먼저.** 변경 전 대상 컬럼을 `_bak_<주제>_<YYYYMMDD>_*` 테이블로 복사하고 건수 일치를 확인. 만든 백업 테이블은 보고에 이름·건수를 적는다 (6-a 정리 대상).
2. **상태 필드는 가능하면 앱 로직 경유.** `status`, `approval_status` 등을 DB 로만 바꾸면 분개·재고 차감·LOT 같은 파생 작업이 빠진 "유령 상태" 가 된다 (2026-04-22 매출 7183/7184 사고). 직접 INSERT 가 필요하면 `pending` 으로 넣고 UI 에서 승인.
3. **tenant_id 조건 필수.** 모든 UPDATE / DELETE 에 `tenant_id = ?` (운영 고객사 = tenant 2).
4. **수동 SQL 파일은 섹션 순서대로.** `§0 백업 → §1 현황 → §2 변경 → §3 반영 → §4 검증`. 각 섹션의 건수(`ROW_COUNT()`)를 기록. 예상 건수와 크게 다르면 멈추고 보고.
5. **멱등 확인.** 같은 SQL 을 다시 돌려 변경 0건이면 안전.
6. 금지: `h_mf_reports.product_id` 를 v2 id 로 UPDATE, `item_master.id = h_products_v2.id` 전제, 재고 집계 전수 자동 재계산 ([docs/architecture/11-identity-policy-v3.md](./docs/architecture/11-identity-policy-v3.md)).
7. `NEG-*` (음수 자리표시) / `COUNT-*` (실사) LOT 는 실제 입고가 아니다. 수량 정리는 실사 기능으로.

## 6. 긴급 hotfix 예외

사이트 다운·500 폭주처럼 즉시 고쳐야 할 때만:

1. 서버에서 최소 수정 후 `pm2 reload haccpone` 로 복구
2. `.githooks/pre-commit` 이 `hotfix` 입력을 요구한다 (무의식 커밋 차단)
3. `/var/log/haccp-hotfix/hotfix.log` 에 기록
4. **1시간 안에** 같은 변경을 Claude 에게 넘겨 GitHub PR 로 올린다

## 7. 보고 형식

```
PR #XX 머지 → 배포 완료
| 항목            | 값                       |
| 머지 커밋        | 7자리 SHA                 |
| RELEASE_TAG     | v0.X.Y                   |
| 운영 HEAD        | SHA                      |
| PM2 haccpone    | online, restart N        |
| HTTP            | 200                      |

DB 작업 (있을 때)
| 섹션 | ROW_COUNT | 예상 |
백업 테이블: 이름 (건수)

⚠️ 관찰 사항 / 사용자 확인 화면
```

- 숫자는 실측값만. 추정이면 "추정" 이라고 쓴다.
- 해석이 필요한 결과(예: 왜 이 행이 남았는지)는 단정하지 말고 쿼리 결과를 그대로 붙여 Claude 에게 넘긴다.

## 8. 참고 문서

- [CLAUDE.md](./CLAUDE.md) — 프로젝트 전체 지침·아키텍처 규칙
- [docs/deploy-flow.md](./docs/deploy-flow.md) — Release 자산 기반 배포·롤백
- [docs/migration-protocol.md](./docs/migration-protocol.md) — DB 마이그레이션·트랜잭션 안전
- [docs/workflow/pr-deployment-cycle.md](./docs/workflow/pr-deployment-cycle.md) — PR·배포 사이클과 사고 사례

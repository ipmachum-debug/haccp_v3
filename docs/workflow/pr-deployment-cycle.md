# PR / 배포 / 기획 워크플로우 사이클

> 최초 작성: 2026-04-27
> 상태: CANONICAL — Claude / Genspark / 사용자 3자 협업의 표준 사이클
> 관련 문서: [CLAUDE.md 삼각 분업 체제](../../CLAUDE.md), [docs/deploy-flow.md](../deploy-flow.md), [docs/migration-protocol.md](../migration-protocol.md)

이 문서는 `CLAUDE.md`의 삼각 분업 체제(Claude / Genspark / 사용자)가 실제로 어떻게 굴러가는지의 실측 패턴을 정리한다. 새 세션 시작 시 즉시 페이스를 회복하기 위한 "운영 매뉴얼".

---

## 🔄 PR 라이프사이클 (실측 패턴)

```
[Claude]                       [사용자]                  [Genspark / GitHub Actions]

1. 작업 요청 수령
2. 코드 작성
3. tsc --noEmit 통과
4. git push -u origin <branch>
5. PR 생성 (mcp__github__create_pull_request)
                                ↓
                              6. 검토 + Merge
                                  ↓
                              auto-release.yml
                                  ↓ v0.X.Y 태그
                              deploy.yml
                                  ↓ POST /api/system/deploy
                                                          ↓
                                                       7. scripts/deploy.sh
                                                          (자산 다운로드 + atomic swap + pm2 reload)
                                  ↓
                              8. 결과 보고 (자동 배포 OK?)
```

총 소요시간: 머지 → 운영 반영 약 **2~3분**.

상세 배포 흐름은 [docs/deploy-flow.md](../deploy-flow.md) 참조.

---

## 🤝 PR 머지 권한 분담

| 역할 | 머지 가능 | 비고 |
|------|----------|------|
| 사용자 | 모든 PR | 1차 머지자 |
| Claude | 머지 가능하지만 명시 요청 시만 | "머지해줘" 등 명시 요청 또는 PR 체인 정리 |
| Genspark | 머지 ❌ | 빌드 / 배포 / DB 만 |

**학습된 사용자 패턴**: PR 만들고 "PR 은 사용자가 열어주세요" 라고 하면 사용자가 짜증냄.
PR 은 Claude 가 **자동 생성**하는 게 사용자 패턴.

---

## 📋 PR 본문 표준 구조

검증된 패턴 — 모든 큰 PR 은 이 구조를 따른다.

```markdown
## 🎯 배경 (왜 필요한가)
사용자 보고 / 이전 세션 미해결 / 발견된 결함

## 🔍 근본 원인 (있을 때)
구체 코드 위치 + 메커니즘

## 📦 변경 (X 파일, +N / -M)
| 파일 | 변경 |
| --- | --- |

## ✅ Effect / 효과
Before / After 표

## 🛡 안전
- tenantId 격리
- 트랜잭션 / 롤백
- 회귀 영향 0

## Test plan
- [x] tsc 통과 (로컬 확인)
- [ ] 머지 후 검증 항목들

## 🔜 후속 (선택)
- 별도 PR 후보
```

---

## 🧩 다중 PR 분할 패턴 (큰 작업)

§5.2 시리즈가 모범 사례. 큰 변경은 단계별 안전 머지 가능한 PR 로 분해한다.

| Phase | PR | 머지 조건 | 코드 변경 | DB 변경 |
|-------|-----|----------|----------|---------|
| 1 | 스키마 + 백필 SQL | 언제든 머지 OK (운영 무영향) | NULLABLE 컬럼 추가만 | Genspark 적용 |
| 2 | INSERT 사이트 수정 | Phase 1 백필 완료 후 | 18 파일 INSERT 에 column 작성 | 없음 |
| 3 | SELECT 단순화 | Phase 2 머지 후 | SQL 우선순위 변경 | 없음 |
| 4 (선택) | fallback 정리 | 1주~1달 안정성 검증 후 | defense-in-depth 제거 | 없음 |

**핵심 원리**: 각 Phase 가 독립적으로 안전 → 단계별 검증 → 사고 시 부분 롤백 가능.

---

## 🎨 기획 (Plan) 패턴 — 사용자 의사결정 도구

큰 작업 시작 전 **항상 옵션 제시 → 사용자 선택**:

```markdown
**Option A** — 최소 (작음)
- 동작
- 장점 / 단점

**Option B** — 중간 (추천)
- 동작
- 장점 / 단점

**Option C** — 큼
- 동작
- 장점 / 단점

**추천: B**
이유: ...

진행할까요? 다른 옵션 원하시면 말씀해주세요.
```

효과적인 질문 형식:
1. **단답 가능한 객관식**: "A / B / C 중에?"
2. **의도 확인**: "지금 / 우선순위 낮음?"
3. **구체 사양**: "엑셀 / UI / 둘 다?"

---

## 🛡️ 운영 안전 룰

### 코드 영역
1. 새 PR 시작 전 **main sync** — `git fetch origin main && git checkout -b ... origin/main`
2. **`tsc --noEmit` 필수** — 머지 전 항상 로컬 통과
3. **tenantId 격리** — 모든 SELECT / UPDATE 에 명시
4. **mock data 0** — 의도적으로 "데이터 없음" 표시, 가짜 값 안 만듦

### DB 영역 (Genspark 와 분담)
1. 스키마 변경: Drizzle 마이그레이션 + 수동 SQL 파일 (`scripts/migrations-manual/`) 둘 다 제공
2. NULLABLE 컬럼 추가 + `ALGORITHM=INSTANT` 권장 (lock 최소화)
3. 백필: idempotent (`WHERE col IS NULL` 조건)
4. STRICT 모드 방어: REGEXP 가드, `sql_mode` 일시 해제
5. **트랜잭션 + DDL 분리** — [docs/migration-protocol.md](../migration-protocol.md) 참조 (PR-W2 사고 교훈)

### 인프라 영역
1. 워크플로 변경 시: `workflow` scope 토큰 필수 (Claude 토큰 OK, Genspark 토큰 X)
2. `PAT_TOKEN` 의존: `auto-release.yml` 의 release 생성에 필수 (release.published 트리거용)
3. **`deploy.sh` 수정 — 서버 빌드 절대 금지** (OOM 재발 — [docs/deploy-flow.md](../deploy-flow.md))

---

## 🔀 의존 PR 처리 (PR-on-PR)

PR B 가 PR A 위에 쌓이는 경우:

```bash
# 1. B 의 base 를 A 의 head 로 만들기
git checkout -b feat/b feat/a

# 2. A 머지 후 B 의 base 를 main 으로 자동 변경
mcp__github__update_pull_request(pullNumber=B, base="main")
# → auto-update 발동

# 3. B 머지
```

검증된 사례: PR #58 → PR #59 (auto-rebase 성공).

---

## 📊 검증 결과 보고 형식 (Genspark 표준)

머지 후 자동 배포가 끝나면 Genspark 가 다음 형식으로 보고한다. 이 보고가 들어오면 Claude 는 (1) 머지 확인 → (2) 다음 단계 또는 추가 검증 안내 → (3) 사용자 의도 확인 후 진행.

```
PR #XX 머지 → 자동 배포 완료
배포 체인
| 항목                | 값                                |
| PR 머지 커밋        | 7자리 SHA                          |
| 자동 생성 릴리스     | v0.X.Y (UTC 시각)                  |
| deploy.yml 실행     | ✅ success, NmNs                   |
| 운영 git HEAD       | SHA ✅                             |
| PM2 haccpone        | online, uptime, restart count      |
| 운영 HTTP           | HTTP/2 200                         |

📦 변경 요약
...

⚠️ 관찰 사항 (있을 때)
...
```

---

## 🆘 사고 대응 패턴

### 케이스 1: 빌드 OOM (2026-04-26)
- **즉시**: NCP 콘솔 강제정지 + 재시작
- **원인**: 서버에서 직접 빌드 — `vite build` + `esbuild` 가 4–6 GB 점유 → OOM Killer 발동
- **영구 해결**: PR #79 — Release 자산 다운로드 방식 ([docs/deploy-flow.md](../deploy-flow.md))
- **모니터링**: 빌드 중 `free -h` 거의 변화 없어야 함

### 케이스 2: 사용자 보고 후 신속 fix
- 예: PR #95 (셀러 수정/삭제) — 사용자 즉시 보고 → 90분 내 PR
- **관찰**: 서버 endpoint 이미 있고 UI 만 부재한 케이스 자주 있음 → grep 으로 먼저 확인

### 케이스 3: 운영 알림 33건 (2026-04-22)
- **분석**: 옛 에러 재노출 (`h_notifications.is_resolved=0`)
- **해결**: SQL `UPDATE is_resolved=1` (Genspark) — 코드 변경 없음
- **교훈**: 알림 폭주 ≠ 신규 버그. 먼저 timestamp 분포 확인.

---

## 🎯 새 세션 즉시 시작 가능한 사이클

```
[새 세션 시작]
사용자: <이슈 보고 / 새 요구사항>

Claude:
1. 관련 코드 위치 확인 (grep / Read)
2. 옵션 A/B/C 제시 (큰 작업이면)
3. 사용자 결정 받음
4. TodoWrite 로 단계 정의
5. branch + 코드 + tsc + commit + push
6. PR 생성 (자동)
7. 사용자 머지
8. Genspark 자동 배포
9. 검증 결과 받음 → 다음 단계
```

이 사이클이 세션 1개에 **5~10번 반복**되는 게 정상 페이스.

---

## 관련 문서

- [CLAUDE.md](../../CLAUDE.md) — 삼각 분업 체제 (정책)
- [docs/deploy-flow.md](../deploy-flow.md) — Release 자산 기반 배포 흐름
- [docs/migration-protocol.md](../migration-protocol.md) — DB 마이그레이션 / 트랜잭션 안전
- [docs/architecture/README.md](../architecture/README.md) — 5계층 아키텍처

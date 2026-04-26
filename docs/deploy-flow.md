# 운영 배포 흐름 (PR-D1, 2026-04-27 기준)

## 배경 — OOM 이슈 근본 해결

이전 흐름은 서버에서 직접 빌드를 실행했다.

```
GitHub Actions → /api/system/deploy 호출
   └─ 서버: git pull → npm install → npm run build → pm2 restart
```

문제점:
- **메모리 8 GB**(swap 0) 환경에서 `vite build` + `esbuild`가 4–6 GB를 일시적으로 점유
- OOM Killer가 가장 큰 프로세스(보통 MySQL 또는 다른 PM2 앱)를 강제 종료
- → MySQL/PM2 동반 사망, SSH 연결 끊김, 사이트 다운

## 신규 흐름 (Release 자산 기반)

```
GitHub Actions runner (메모리 7 GB, 단일 작업 → 안전)
   ├─ 1. checkout + npm install + npm run build
   ├─ 2. dist/ → tar.gz 패키징 (≈15-20 MB)
   ├─ 3. SHA256 체크섬 계산
   └─ 4. GitHub Release 자산으로 업로드 (gh release upload --clobber)

       ↓

GitHub Actions runner (deploy job)
   └─ /api/system/deploy 호출
        body: { release_tag, asset_name, expected_sha256 }

       ↓

운영 서버 (메모리 안전 — 빌드 안 함)
   └─ scripts/deploy.sh 실행
        ├─ 1. git fetch + reset (코드 메타데이터만)
        ├─ 2. GitHub API로 자산 다운로드 (curl + GITHUB_TOKEN)
        ├─ 3. SHA256 검증
        ├─ 4. tar 추출 → 임시 디렉터리
        ├─ 5. atomic swap: dist → dist.bak.YYYYMMDD_HHMMSS
        │                  새 dist → 본 자리
        └─ 6. 5초 후 background pm2 reload (자기 자신 죽이지 않도록 setsid)
```

## 배포 트리거 방법

### 자동 (GitHub Release 발행)

```bash
# 로컬에서 태그 생성 후 push
git tag -a v0.8.3 -m "Release v0.8.3"
git push origin v0.8.3

# GitHub UI 에서 release 발행
# → Actions 가 자동으로 빌드 → 자산 업로드 → 배포
```

### 수동 (workflow_dispatch)

1. https://github.com/ipmachum-debug/haccp_v3/actions/workflows/deploy.yml
2. **Run workflow** 클릭
3. `confirm`: `DEPLOY` 입력 (필수, 다른 값이면 중단)
4. `target_tag`: `v0.8.3` 등 (비우면 latest release 사용)

### 수동 (서버에 직접 curl)

자산은 이미 release 에 올라가 있어야 함. 새로 빌드하지 않고 재배포만.

```bash
curl -X POST https://millioai.com/api/system/deploy \
  -H "Authorization: Bearer $DEPLOY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "release_tag": "v0.8.3",
    "asset_name": "dist-v0.8.3-abc1234.tar.gz",
    "expected_sha256": "<64자 hex>"
  }'
```

## 환경변수 (서버 `.env`)

| 변수 | 용도 | 누락 시 |
|------|------|--------|
| `DEPLOY_TOKEN` | `/api/system/deploy` 호출 인증 | 503 응답 |
| `GITHUB_TOKEN` | Release 자산 다운로드 (Bearer) | 503 응답 |
| `DEPLOY_SCRIPT_PATH` | `deploy.sh` 위치 (선택) | `/root/haccp_v3/scripts/deploy.sh` 사용 |

`GITHUB_TOKEN` 권한:
- **Fine-grained PAT**: 대상 repo `ipmachum-debug/haccp_v3` 의 **Contents: Read** 권한
- **Classic PAT**: `repo` scope (또는 public repo면 `public_repo`)

## GitHub Actions secrets

| Secret | 용도 |
|--------|------|
| `DEPLOY_URL` | 배포 API URL, 예: `https://millioai.com/api/system/deploy` |
| `DEPLOY_TOKEN` | 위 API 호출 시 Bearer token (서버 `.env` 와 동일) |

`GITHUB_TOKEN` 은 Actions 가 자동 주입하므로 secrets 등록 불필요 (build job 에서 자산 업로드용).

## 롤백

서버에 직전 `dist` 가 `dist.bak.YYYYMMDD_HHMMSS` 로 자동 보관됨 (최근 5개).

```bash
ssh root@49.50.130.101
cd /root/haccp_v3
ls -lt dist.bak.*                 # 백업 목록
rm -rf dist
mv dist.bak.20260427_103045 dist  # 원하는 시점으로 복원
pm2 reload haccpone
```

## 실패 시 자동 알림

`deploy` job 이 실패하면 GitHub Actions 가 자동으로 Issue 를 생성한다 (`bug`, `critical`, `deploy`, `automated` 라벨). Issue 본문에 다음이 포함됨:
- 발생 시각 (KST)
- 트리거 (release / workflow_dispatch)
- HTTP status, commit SHA, 워크플로우 로그 링크
- 긴급 대응 절차 (로그 확인, PM2 상태, 수동 재배포, 롤백)

## 메모리 영향 비교

| 단계 | 이전 (서버 빌드) | 신규 (자산 다운로드) |
|------|-----------------|--------------------|
| git pull | ~10 MB | ~10 MB |
| npm install | ~500 MB | (실행 안 함) |
| vite build | ~3-5 GB (피크) | (실행 안 함) |
| esbuild | ~1-2 GB | (실행 안 함) |
| 자산 다운로드 | (해당 없음) | ~20 MB (스트림) |
| tar 추출 | (해당 없음) | ~50 MB |
| pm2 reload | ~200 MB (새 워커) | ~200 MB |
| **피크 메모리** | **5-7 GB** | **~300 MB** |
| **OOM 위험** | **높음** | **거의 없음** |

## 참고 — 서버 PORT 이슈 (2026-04-26)

`PORT=3001` 을 `.env` 에 설정해두면 PM2 daemon (PID 1467) 이 먼저 3001 을 점유해서 haccpone 이 3002 로 fallback 된다. 이로 인해 nginx 가 3001 로 프록시하면 빈 응답이 반환된다.

**해결**: nginx `millioai.conf` 의 `proxy_pass` 를 `http://localhost:3002` 로 수정 (적용됨).

**향후 정리 후보**: `.env` 의 `PORT=3001` 을 `PORT=3002` 로 변경하거나, PM2 ecosystem 에서 daemon 이 PORT 환경변수를 상속받지 않도록 분리.

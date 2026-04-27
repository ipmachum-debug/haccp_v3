# PR-D2 수동 적용 안내

## 배경

PAT (Personal Access Token) 에 `workflow` scope 가 없어 GitHub App 이 워크플로 파일을 직접 push 할 수 없음 (PR #79 와 동일 제약).

따라서 이 변경은 **사용자가 GitHub UI 또는 workflow scope 가 있는 PAT 로 직접 적용** 해야 함.

## 변경 내용

`.github/workflows/auto-release.yml` 의 release 생성 단계에서:
- `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` → `GH_TOKEN: ${{ secrets.PAT_TOKEN || secrets.GITHUB_TOKEN }}`

이유: `GITHUB_TOKEN` 으로 만든 release 는 `release.published` 이벤트로 다른 워크플로 (deploy.yml) 를 트리거하지 못함 (GitHub 보안 정책).

## 적용 방법 (3가지 중 택 1)

### A. GitHub Web UI 에서 직접 편집 (가장 빠름)

1. https://github.com/ipmachum-debug/haccp_v3/blob/main/.github/workflows/auto-release.yml 접속
2. 연필 아이콘 (Edit) 클릭
3. 본 디렉터리의 `auto-release.yml.PR-D2` 내용으로 전체 교체
4. Commit message: `fix(deploy): PR-D2 auto-release PAT_TOKEN 사용 — deploy.yml 자동 트리거 복구`
5. main 에 직접 commit 또는 새 PR 생성

### B. 로컬에서 PR 생성 (workflow scope PAT 보유 시)

```bash
git checkout -b fix/auto-release-trigger-deploy origin/main
cp docs/manual-apply/auto-release.yml.PR-D2 .github/workflows/auto-release.yml
git add .github/workflows/auto-release.yml
git commit -m "fix(deploy): PR-D2 auto-release PAT_TOKEN 사용 — deploy.yml 자동 트리거 복구"
git push -u origin fix/auto-release-trigger-deploy
gh pr create --base main
```

### C. Claude/다른 에이전트에게 위임

main 에 직접 commit 권한이 있는 다른 에이전트 또는 사용자에게 이 디렉터리의 파일을 적용 요청.

## 검증 (적용 후)

main 에 다음 PR 머지 시 (예: PR-W8) auto-release.yml 이 v0.8.8 release 생성 → deploy.yml 자동 트리거 → 빌드+배포까지 자동 진행되어야 함.

확인 명령:
```bash
gh run list --workflow=deploy.yml --limit 5
# → release 이벤트로 trigger 된 run 이 보여야 함
```

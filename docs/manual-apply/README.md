# 수동 적용 필요 파일

이 디렉터리의 파일들은 **GitHub PAT 의 workflow scope 제약**으로 자동 push 가 불가능해서 사용자가 수동으로 적용해야 한다.

## PR-D1: `deploy.yml` 갱신

### 배경

GitHub 은 보안상 `repo` scope 만 있는 fine-grained PAT (또는 GitHub App) 가 `.github/workflows/*.yml` 파일을 수정하는 것을 차단한다 (`workflow` scope 필요).

Genspark 가 사용하는 PAT 는 `Contents:write` 까지만 있어서 자동으로 push 할 수 없다.

### 적용 방법 (택 1)

#### 옵션 A — GitHub Web UI 에서 직접 편집 (가장 간단, 1분)

1. https://github.com/ipmachum-debug/haccp_v3/blob/feat/release-based-deploy/.github/workflows/deploy.yml 접속
2. 우상단 ✏️ (Edit this file) 클릭
3. 기존 내용 **전체 삭제** 후 `docs/manual-apply/deploy.yml.PR-D1` 내용 **붙여넣기**
4. 하단 **Commit changes**:
   - 옵션: **Commit directly to the `feat/release-based-deploy` branch**
   - message: `feat(deploy): PR-D1 deploy.yml — Release 자산 업로드 + body 전달`
5. PR #79 자동 갱신됨 → 머지

#### 옵션 B — workflow scope 가 있는 Classic PAT 로 push

```bash
# 1. https://github.com/settings/tokens/new 에서 Classic PAT 발급
#    이름: haccp-workflow-update
#    scopes: workflow (이것만 있어도 됨)
#
# 2. 로컬에서 (서버 X)
cd ~/haccp_v3   # 또는 clone 받은 위치
git fetch origin feat/release-based-deploy
git checkout feat/release-based-deploy
cp docs/manual-apply/deploy.yml.PR-D1 .github/workflows/deploy.yml
git add .github/workflows/deploy.yml
git commit -m "feat(deploy): PR-D1 deploy.yml — Release 자산 업로드 + body 전달"
git push https://<PAT>@github.com/ipmachum-debug/haccp_v3.git feat/release-based-deploy
```

#### 옵션 C — GitHub CLI (gh) 사용

```bash
gh auth login   # workflow scope 포함된 토큰으로 로그인
gh repo clone ipmachum-debug/haccp_v3 -- --branch feat/release-based-deploy
cd haccp_v3
cp docs/manual-apply/deploy.yml.PR-D1 .github/workflows/deploy.yml
git add .github/workflows/deploy.yml
git commit -m "feat(deploy): PR-D1 deploy.yml — Release 자산 업로드 + body 전달"
git push origin feat/release-based-deploy
```

### 적용 후

PR #79 가 자동 갱신되고, **모든 파일이 한 PR 에 모이면 머지 가능 상태**가 된다.

머지 후 다음을 진행:

1. v0.8.3 release 발행 (또는 workflow_dispatch 로 수동 실행)
2. GitHub Actions 가 자동으로 `dist.tar.gz` 생성 → release 자산 업로드 → `/api/system/deploy` 호출
3. 서버에서 자산 다운로드 → atomic swap → `pm2 reload`

---

## 적용 완료 후 정리

이 디렉터리(`docs/manual-apply/`)는 **PR-D1 머지 후 삭제** 해도 됨.
다음 hotfix 때 재사용할 수도 있어 일단 보관.

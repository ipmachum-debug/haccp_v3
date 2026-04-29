# Storage 백엔드 운영 가이드

> 작성: 2026-04-29
> 트리거: BUILT_IN_FORGE 미설정 사고 — 자체 storage (AWS S3) 도입
> 관련 PR: `feat/storage-aws-s3-backend`
> 코드: [`server/storage.ts`](../../server/storage.ts)

---

## 🎯 백엔드 우선순위

`server/storage.ts` 가 자동 분기:

| 환경변수 | 백엔드 |
| --- | --- |
| `AWS_S3_BUCKET` 설정 | **AWS S3** (또는 S3 호환 — Cloudflare R2, MinIO) |
| `BUILT_IN_FORGE_API_URL` + `BUILT_IN_FORGE_API_KEY` 설정 | Forge proxy (Manus WebDev 레거시) |
| 둘 다 미설정 | 첨부 업로드 시 throw |

**우선순위**: S3 > Forge > throw. 둘 다 설정되어 있으면 S3 먼저.

---

## 📦 영향 받는 기능

`storagePut` / `storageGet` 호출처:

- 건강진단서 PDF 첨부
- 체크리스트 첨부 파일
- OCR 스캔 (사업자등록증, 영수증, HACCP 점검 기록지 등)
- 거래명세표 / 견적서 PDF 자동 저장

---

## 🚀 AWS S3 설정 (권장)

### 1. AWS 계정 + S3 버킷 생성

- 리전 권장: `ap-northeast-2` (서울)
- 버킷 이름: `millioai-prod-uploads` (예시)
- 차단 옵션:
  - **퍼블릭 액세스 차단 ON** (기본) — presigned URL 로 다운로드
  - 또는 **CloudFront 같은 CDN 사용 시 ON** (CDN 만 접근)

### 2. IAM 사용자 + 키 발급

권한:
- `s3:PutObject`
- `s3:GetObject`
- (선택) `s3:DeleteObject`

버킷 ARN: `arn:aws:s3:::millioai-prod-uploads/*`

### 3. 운영 `.env` 추가

```bash
# /root/haccp_v3/.env
AWS_S3_BUCKET=millioai-prod-uploads
AWS_S3_REGION=ap-northeast-2
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...

# 선택 — CDN URL 사용 시 (영구 URL)
# 미설정 시 presigned URL (1시간 유효) 자동 발급
# AWS_S3_PUBLIC_BASE_URL=https://cdn.millioai.com
```

### 4. PM2 재시작

```bash
pm2 reload haccpone
```

### 5. 검증

```bash
# 진단 endpoint 호출 (선택 — 추후 추가 예정)
curl https://millioai.com/api/system/storage-status

# 또는 PM2 로그에서 첨부 업로드 시도 → 정상 응답 확인
pm2 logs haccpone | grep -i "s3\|storage"
```

---

## 🔄 S3 호환 서비스 (Cloudflare R2 / MinIO)

AWS S3 가 아닌 호환 서비스 사용 시:

```bash
# Cloudflare R2 (egress 무료, 더 저렴)
AWS_S3_BUCKET=millioai-uploads
AWS_S3_REGION=auto                                                  # R2 는 auto 권장
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com           # ← 핵심
AWS_S3_PUBLIC_BASE_URL=https://files.millioai.com                   # R2 custom domain

# MinIO 자체호스팅
AWS_S3_BUCKET=millioai-uploads
AWS_S3_REGION=us-east-1
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
AWS_S3_ENDPOINT=http://minio:9000
```

코드 변경 없음 — `AWS_S3_ENDPOINT` 만 설정하면 자동 호환.

---

## 🔁 Forge proxy (레거시)

기존 Manus WebDev 환경의 storage proxy. 운영 자체 서버에선 키 발급 불가능하면 사용 어려움.

```bash
BUILT_IN_FORGE_API_URL=https://...
BUILT_IN_FORGE_API_KEY=...
```

S3 가 활성화되면 Forge 는 자동으로 미사용 — 굳이 제거할 필요 없음 (env 비활성화만으로 OK).

---

## 🛡 보안 체크리스트

- [ ] IAM 사용자 권한 최소화 (PutObject + GetObject 만)
- [ ] 버킷 퍼블릭 액세스 차단 (CDN 또는 presigned URL 만 사용)
- [ ] CORS 설정 (프론트엔드 도메인만 허용)
- [ ] 환경변수 git 미커밋 (`.env` 가 `.gitignore` 에 포함)
- [ ] AWS 키 회전 정책 (3~6개월)
- [ ] 비용 모니터링 (CloudWatch 알람)

---

## 💰 비용 예상 (식품 HACCP 운영 1 tenant 기준)

| 항목 | 월 사용량 (예상) | AWS S3 비용 |
| --- | --- | --- |
| 저장 (PDF/이미지) | 1 GB | $0.025 |
| PUT 요청 | 1,000 회 | $0.005 |
| GET (presigned) | 5,000 회 | $0.002 |
| Egress (다운로드) | 500 MB | $0.045 |
| **합계** | | **~$0.08/월** |

10 tenant 운영 시도 월 1달러 미만. R2 사용 시 egress 무료라 더 저렴.

---

## 🔜 향후 개선 (별도 PR)

- [ ] 진단 endpoint (`/api/system/storage-status`) — 백엔드 / bucket / 마지막 업로드 시각
- [ ] 파일 삭제 API (`storageDelete`)
- [ ] 멀티파트 업로드 (대용량 파일 — 100MB+)
- [ ] 바이러스 검사 통합 (ClamAV / VirusTotal)
- [ ] 자동 만료 / 라이프사이클 (오래된 임시 파일 정리)

---

## 관련

- `server/storage.ts` — 본 가이드의 코드
- `server/_core/env.ts` — 환경변수 로드 (BUILT_IN_FORGE_API_KEY)
- AWS S3 Pricing: https://aws.amazon.com/s3/pricing/
- Cloudflare R2: https://www.cloudflare.com/products/r2/

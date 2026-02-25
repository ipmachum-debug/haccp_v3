# HACCP 시스템 백업 가이드

## 개요

이 문서는 HACCP 시스템의 데이터베이스를 외부 서버로 백업하는 방법을 설명합니다.

## 원격 서버 정보

- **서버 IP**: 49.50.130.101
- **SSH 사용자**: root
- **SSH 비밀번호**: golden1004!
- **MySQL 사용자**: root
- **MySQL 비밀번호**: Golden1004!@#
- **백업 디렉토리**: /root/haccp_backups/

## 백업 명령어

### 1. 전체 백업 (스키마 + 데이터)

```bash
pnpm backup:full
```

- 데이터베이스 전체를 백업하고 원격 서버에 자동으로 복원합니다.
- 원격 서버의 `haccp_production` 데이터베이스에 저장됩니다.

### 2. 스키마만 백업

```bash
pnpm backup:schema
```

- 테이블 구조, 인덱스, 트리거, 프로시저만 백업합니다.
- 데이터는 포함되지 않습니다.

### 3. 데이터만 백업

```bash
pnpm backup:data
```

- 테이블의 데이터만 백업합니다.
- 스키마는 포함되지 않습니다.

## 백업 프로세스

1. **로컬 데이터베이스에서 덤프 생성**
   - `mysqldump` 명령어를 사용하여 SQL 파일 생성

2. **백업 파일 압축**
   - `.tar.gz` 형식으로 압축

3. **원격 서버로 전송**
   - `scp` 명령어를 사용하여 파일 전송

4. **원격 서버에서 복원** (full 백업인 경우)
   - `haccp_production` 데이터베이스에 자동 복원

## 백업 파일 명명 규칙

```
haccp_backup_{타입}_{타임스탬프}.tar.gz
```

예시:
- `haccp_backup_full_20260119_181500.tar.gz`
- `haccp_backup_schema_20260119_181530.tar.gz`

## 수동 백업 스크립트 실행

```bash
./scripts/backup-to-remote.sh [schema|data|full]
```

## 주의사항

1. **네트워크 연결 확인**
   - 원격 서버에 접근 가능한지 확인하세요.
   - SSH 포트(22)가 열려있어야 합니다.

2. **디스크 공간 확인**
   - 백업 파일 크기를 고려하여 충분한 디스크 공간을 확보하세요.

3. **백업 주기**
   - 개발 중: 주요 기능 완성 시마다 백업
   - 운영 중: 일일 자동 백업 권장

4. **보안**
   - SSH 비밀번호와 MySQL 비밀번호는 안전하게 관리하세요.
   - 백업 파일에는 민감한 데이터가 포함될 수 있습니다.

## 자동 백업 설정 (선택사항)

### Cron을 사용한 일일 자동 백업

```bash
# 매일 새벽 2시에 전체 백업
0 2 * * * cd /home/ubuntu/haccp_v3 && pnpm backup:full >> /var/log/haccp_backup.log 2>&1
```

## 복원 방법

### 원격 서버에서 수동 복원

```bash
# 원격 서버에 SSH 접속
ssh root@49.50.130.101

# 백업 디렉토리로 이동
cd /root/haccp_backups

# 최신 백업 파일 압축 해제
tar -xzf haccp_backup_full_YYYYMMDD_HHMMSS.tar.gz

# MySQL로 복원
mysql -u root -p'Golden1004!@#' haccp_production < full_backup.sql
```

## 문제 해결

### 1. SSH 연결 실패

```bash
# SSH 연결 테스트
ssh root@49.50.130.101
```

### 2. MySQL 연결 실패

```bash
# MySQL 연결 테스트
mysql -h 49.50.130.101 -u root -p'Golden1004!@#' -e "SHOW DATABASES;"
```

### 3. 백업 파일이 너무 큰 경우

```bash
# 스키마와 데이터를 분리하여 백업
pnpm backup:schema
pnpm backup:data
```

## 백업 로그 확인

백업 스크립트는 실행 중 상세한 로그를 출력합니다:

- ✅ 성공 메시지
- ❌ 오류 메시지
- 🔄 진행 상황
- 📤 전송 상태

## 지원

문제가 발생하면 백업 로그를 확인하고, 필요시 시스템 관리자에게 문의하세요.

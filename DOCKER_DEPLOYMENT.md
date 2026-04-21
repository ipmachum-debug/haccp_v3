# HACCP 시스템 Docker 배포 가이드

이 문서는 HACCP 시스템을 Docker를 사용하여 외부 서버에 배포하는 방법을 설명합니다.

## 📋 사전 요구사항

- Docker 및 Docker Compose 설치
- SSH 접근 권한 (외부 서버)
- `sshpass` 설치 (자동 배포 스크립트 사용 시)

## 🚀 배포 방법

### 1. 자동 배포 (권장)

가장 간단한 방법으로, 스크립트 하나로 전체 배포 프로세스를 자동화합니다.

```bash
# 프로젝트 루트에서 실행
bash scripts/deploy-to-server.sh
```

이 스크립트는 다음 작업을 자동으로 수행합니다:
1. Docker 이미지 빌드
2. 이미지를 tar 파일로 저장
3. 원격 서버로 파일 전송
4. 원격 서버에서 이미지 로드 및 컨테이너 시작

### 2. 수동 배포

#### Step 1: Docker 이미지 빌드

```bash
docker build -t haccp_v3:latest .
```

#### Step 2: Docker 이미지 저장

```bash
docker save haccp_v3:latest -o haccp_v3.tar
```

#### Step 3: 원격 서버로 전송

```bash
scp haccp_v3.tar root@49.50.130.101:/tmp/
scp docker-compose.yml root@49.50.130.101:/var/www/haccp_v3/
scp .env.production.template root@49.50.130.101:/var/www/haccp_v3/
```

#### Step 4: 원격 서버에서 실행

```bash
ssh root@49.50.130.101

# 작업 디렉토리로 이동
cd /var/www/haccp_v3

# Docker 이미지 로드
docker load -i /tmp/haccp_v3.tar

# 환경 변수 설정
cp .env.production.template .env.production
nano .env.production  # 실제 값으로 수정

# 컨테이너 시작
docker-compose up -d

# 상태 확인
docker-compose ps
docker-compose logs -f
```

### 3. 로컬 테스트

배포 전에 로컬에서 Docker 환경을 테스트할 수 있습니다.

```bash
# Docker Compose로 전체 스택 실행
docker-compose up -d

# 로그 확인
docker-compose logs -f

# 접속 테스트
curl http://localhost:3000

# 중지
docker-compose down
```

## 🔧 환경 변수 설정

`.env.production` 파일을 생성하고 다음 변수를 설정하세요:

```env
# 데이터베이스 연결 — 실제 값은 배포 서버 .env 에만 저장 (문서에 비밀번호 금지)
DATABASE_URL=mysql://USER:PASSWORD@HOST:3306/haccp_db

# JWT 시크릿 (반드시 32자 이상 랜덤 값으로 변경)
JWT_SECRET=change-to-random-32char-plus-secret

# 서버 설정
PORT=3000
NODE_ENV=production

# MySQL 설정 (docker-compose 사용 시) — 실제 값 코드에 커밋 금지
MYSQL_ROOT_PASSWORD=CHANGE_ME
MYSQL_DATABASE=haccp_db
MYSQL_USER=haccp_user
MYSQL_PASSWORD=CHANGE_ME
```

## 📊 배포 후 확인

### 1. 컨테이너 상태 확인

```bash
docker-compose ps
```

### 2. 로그 확인

```bash
# 전체 로그
docker-compose logs

# 실시간 로그
docker-compose logs -f

# 특정 서비스 로그
docker-compose logs app
docker-compose logs mysql
```

### 3. 데이터베이스 마이그레이션

```bash
# 앱 컨테이너에 접속
docker-compose exec app sh

# 마이그레이션 실행
pnpm db:push
```

### 4. 접속 테스트

```bash
curl http://49.50.130.101:3000
```

또는 브라우저에서 `http://49.50.130.101:3000` 접속

## 🔄 업데이트 배포

코드 변경 후 재배포하는 방법:

```bash
# 자동 배포 스크립트 실행
bash scripts/deploy-to-server.sh
```

또는 수동으로:

```bash
# 1. 새 이미지 빌드
docker build -t haccp_v3:latest .

# 2. 원격 서버로 전송 (위의 Step 2-4 반복)

# 3. 원격 서버에서 재시작
ssh root@49.50.130.101
cd /var/www/haccp_v3
docker-compose down
docker load -i /tmp/haccp_v3.tar
docker-compose up -d
```

## 🛠️ 문제 해결

### 컨테이너가 시작되지 않는 경우

```bash
# 로그 확인
docker-compose logs app

# 컨테이너 재시작
docker-compose restart app
```

### 데이터베이스 연결 실패

```bash
# MySQL 컨테이너 상태 확인
docker-compose logs mysql

# MySQL 컨테이너 재시작
docker-compose restart mysql
```

### 포트 충돌

```bash
# 3000 포트를 사용 중인 프로세스 확인
sudo lsof -i :3000

# 프로세스 종료
sudo kill -9 <PID>
```

## 📝 주의사항

1. **JWT_SECRET**: 프로덕션 환경에서는 반드시 강력한 랜덤 문자열로 변경하세요.
2. **데이터베이스 비밀번호**: 기본 비밀번호를 사용하지 말고 강력한 비밀번호로 변경하세요.
3. **방화벽 설정**: 외부에서 3000 포트에 접근할 수 있도록 방화벽 규칙을 설정하세요.
4. **SSL/TLS**: 프로덕션 환경에서는 HTTPS를 사용하도록 Nginx 리버스 프록시를 설정하세요.

## 🔐 보안 권장사항

1. **SSH 키 인증 사용**: 비밀번호 대신 SSH 키를 사용하세요.
2. **환경 변수 암호화**: `.env.production` 파일을 안전하게 관리하세요.
3. **정기적인 업데이트**: Docker 이미지와 의존성을 정기적으로 업데이트하세요.
4. **로그 모니터링**: 로그를 정기적으로 확인하여 이상 징후를 감지하세요.

## 📞 지원

문제가 발생하면 다음을 확인하세요:
- Docker 및 Docker Compose 버전
- 서버 리소스 (CPU, 메모리, 디스크)
- 네트워크 연결 상태
- 로그 파일

// PM2 ecosystem config
// ────────────────────────────────────────────────────────────────
// ⚠️  IMPORTANT:
//   이 파일에는 비밀 값(API 키, 세션 시크릿 등) 하드코딩 금지.
//   실제 값은 서버의 .env 파일에 저장하고, 아래 env 블록은
//   process.env 를 참조하여 PM2 가 .env 값을 주입하도록 구성.
//
//   서버에 .env 파일이 없으면 PM2 시작 전에 생성:
//     cp .env.example .env
//     vi .env   # 실제 값 입력
//
//   필수 환경변수 목록:
//     - DATABASE_URL              (MySQL 메인 DB)
//     - OPSCORE_DATABASE_URL      (OpsCore 메타 DB)
//     - OPENAI_API_KEY            (AI 챗봇 '하나' 필수)
//     - SESSION_SECRET            (JWT / 세션 암호화)
//     - SENDGRID_API_KEY          (이메일 발송)
//     - SENDGRID_FROM_EMAIL       (발신 주소)
// ────────────────────────────────────────────────────────────────

// .env 파일을 먼저 로드하여 process.env 에 주입
// (dotenv 가 없으면 PM2 는 ecosystem 의 env 블록만 사용)
try {
  require('dotenv').config();
} catch (_) {
  // dotenv 미설치 시 무시 — PM2 직접 실행 또는 export 된 env 사용
}

module.exports = {
  apps: [{
    name: 'haccpone',
    script: './dist/index.js',
    instances: 1,
    exec_mode: 'fork',
    max_memory_restart: '1500M',
    env: {
      NODE_ENV: 'production',
      PORT: process.env.PORT || '3001',

      // ── 데이터베이스 ──
      DATABASE_URL: process.env.DATABASE_URL,
      OPSCORE_DATABASE_URL: process.env.OPSCORE_DATABASE_URL,

      // ── AI / 외부 서비스 ──
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-4o-mini',

      // ── 이메일 ──
      SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,
      SENDGRID_FROM_EMAIL: process.env.SENDGRID_FROM_EMAIL,

      // ── 세션 / 보안 ──
      SESSION_SECRET: process.env.SESSION_SECRET,

      // ── CORS ──
      CORS_ORIGINS: process.env.CORS_ORIGINS || 'https://millioai.com',

      // ── 타임존 ──
      TZ: process.env.TZ || 'Asia/Seoul',
    },
    error_file: '/root/.pm2/logs/haccp-v3-error.log',
    out_file: '/root/.pm2/logs/haccp-v3-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    watch: false,
    max_restarts: 10,
    min_uptime: '10s',
    listen_timeout: 10000,
    kill_timeout: 5000,
  }]
};

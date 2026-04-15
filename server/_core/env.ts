// .env 파일에서 OPENAI_API_KEY를 직접 읽기 (시스템 환경변수 빈값 문제 우회)
// 원인: PM2가 시스템 환경의 OPENAI_API_KEY="" (빈값)을 상속 →
//       dotenv v17이 "이미 정의됨" 으로 판단하여 .env 값 미주입
// ★ 2026-04-15: 캐싱 완전 제거 — 매 호출마다 fresh read
//   이유: 서버 시작 초반에 env 가 "" 로 캐시되면 이후 모든 호출이 "" 반환
//   호출당 파일 I/O 있지만 AI 호출은 드물어 성능 영향 미미

function parseEnvValue(raw: string): string {
  let v = raw.trim();
  if (!/^["']/.test(v)) {
    const hashIdx = v.indexOf('#');
    if (hashIdx >= 0) v = v.slice(0, hashIdx).trim();
  }
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  return v.trim();
}

function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match) {
      const key = match[1];
      const val = parseEnvValue(match[2]);
      if (val.length > 0) {
        result[key] = val;
      }
    }
  }
  return result;
}

function findApiKey(): string {
  // 1. process.env 에서 먼저 확인 (빈 문자열은 무시)
  const envCandidates = [
    process.env.BUILT_IN_FORGE_API_KEY,
    process.env.OPENAI_API_KEY,
    process.env.FORGE_API_KEY,
  ];
  for (const v of envCandidates) {
    if (v && v.trim().length > 0) {
      return v.trim();
    }
  }

  // 2. .env 파일 직접 파싱 (여러 경로 시도)
  try {
    const fs = require("fs");
    const path = require("path");
    const searchPaths = [
      path.resolve(process.cwd(), ".env"),
      "/root/haccpone-v2/.env",
      "/root/haccp_v3/.env",
      "/root/haccp_v3/webapp/.env",
      "/home/user/haccp_v3/.env",
      "/var/www/haccp_v3/.env",
    ];
    for (const envPath of searchPaths) {
      try {
        if (fs.existsSync(envPath)) {
          const content = fs.readFileSync(envPath, "utf-8");
          const parsed = parseEnvFile(content);
          const key = parsed.BUILT_IN_FORGE_API_KEY || parsed.OPENAI_API_KEY || parsed.FORGE_API_KEY;
          if (key && key.length > 0) {
            return key;
          }
        }
      } catch { /* ignore per-path */ }
    }
  } catch { /* ignore fs/path errors */ }

  return "";
}

/** 진단용 — 서버 시작 시 1회 호출하여 상태 출력 */
export function printEnvDiagnostics() {
  const key = findApiKey();
  console.log("[env] ===== AI/LLM API 진단 =====");
  console.log("[env] cwd:", process.cwd());
  console.log("[env] process.env.OPENAI_API_KEY:", JSON.stringify(process.env.OPENAI_API_KEY));
  console.log("[env] process.env.BUILT_IN_FORGE_API_KEY:", JSON.stringify(process.env.BUILT_IN_FORGE_API_KEY));
  console.log("[env] forgeApiUrl:", process.env.BUILT_IN_FORGE_API_URL || "(OpenAI 기본)");
  console.log("[env] forgeApiKey:", key ? `✅ 설정됨 (length=${key.length}, prefix=${key.slice(0, 7)}***)` : "❌ 미설정");
  console.log("[env] =============================");
}

// forgeApiKey는 getter로 정의하여 항상 최신 값을 읽음 (캐시 없음)
export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL || "",
  get forgeApiKey(): string {
    return findApiKey();
  },
};

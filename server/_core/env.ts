// .env 파일에서 OPENAI_API_KEY를 직접 읽기 (시스템 환경변수 빈값 문제 우회)
// 원인: PM2가 시스템 환경의 OPENAI_API_KEY="" (빈값)을 상속 →
//       dotenv v17이 "이미 정의됨" 으로 판단하여 .env 값 미주입
// ★ 2026-04-15: 로더 강화
//   - 다중 키 이름 (OPENAI_API_KEY, BUILT_IN_FORGE_API_KEY, FORGE_API_KEY)
//   - 따옴표 제거 ("sk-xxx" / 'sk-xxx' → sk-xxx)
//   - 공백 허용 (KEY = value 패턴)
//   - 주석 제거 (# 로 시작하는 부분)
//   - 다중 경로 fallback
//   - 첫 성공 시 캐시 (성능)

let _cachedKey: string | undefined = undefined;

function parseEnvValue(raw: string): string {
  let v = raw.trim();
  // 주석 제거 (# 뒤는 무시, 단 따옴표 안에 있으면 유지)
  // 간단히: 따옴표로 감싸져 있지 않으면 첫 #에서 자름
  if (!/^["']/.test(v)) {
    const hashIdx = v.indexOf('#');
    if (hashIdx >= 0) v = v.slice(0, hashIdx).trim();
  }
  // 따옴표 제거
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
    // KEY = value 또는 KEY=value
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
  if (_cachedKey !== undefined) return _cachedKey;

  // 1. process.env 에서 먼저 확인 (빈 문자열은 무시)
  const envCandidates = [
    process.env.BUILT_IN_FORGE_API_KEY,
    process.env.OPENAI_API_KEY,
    process.env.FORGE_API_KEY,
  ];
  for (const v of envCandidates) {
    if (v && v.trim().length > 0) {
      _cachedKey = v.trim();
      console.log(`[env] API key from process.env (length=${_cachedKey.length})`);
      return _cachedKey;
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
            _cachedKey = key;
            console.log(`[env] API key from ${envPath} (length=${key.length})`);
            return _cachedKey;
          }
        }
      } catch (innerErr) {
        console.warn(`[env] ${envPath} 읽기 실패:`, innerErr);
      }
    }
  } catch (outerErr) {
    console.warn("[env] dotenv fallback 전체 실패:", outerErr);
  }

  // 찾지 못함
  _cachedKey = "";
  console.warn("[env] ⚠️ API key 를 찾을 수 없음. AI 기능이 비활성화됩니다.");
  console.warn("[env]   process.env.OPENAI_API_KEY =", JSON.stringify(process.env.OPENAI_API_KEY));
  console.warn("[env]   process.env.BUILT_IN_FORGE_API_KEY =", JSON.stringify(process.env.BUILT_IN_FORGE_API_KEY));
  console.warn("[env]   cwd =", process.cwd());
  return "";
}

/** AI 기능 진단용 — 서버 시작 시 호출하여 상태 출력 */
export function printEnvDiagnostics() {
  const key = findApiKey();
  console.log("[env] ===== AI/LLM API 진단 =====");
  console.log("[env] forgeApiUrl:", process.env.BUILT_IN_FORGE_API_URL || "(OpenAI 기본)");
  console.log("[env] forgeApiKey:", key ? `설정됨 (length=${key.length}, prefix=${key.slice(0, 7)}***)` : "미설정");
  console.log("[env] =============================");
}

// forgeApiKey는 getter로 정의하여 항상 최신 env 값을 읽음
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

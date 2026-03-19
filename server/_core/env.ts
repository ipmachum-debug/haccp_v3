// .env 파일에서 OPENAI_API_KEY를 직접 읽기 (시스템 환경변수 빈값 문제 우회)
let _cachedOpenAIKey: string | undefined = undefined;
function getOpenAIKeyFromDotenv(): string {
  if (_cachedOpenAIKey !== undefined) return _cachedOpenAIKey;
  try {
    const fs = require("fs");
    const path = require("path");
    // PM2 cwd와 여러 경로에서 .env 파일 찾기
    const searchPaths = [
      path.resolve(process.cwd(), ".env"),
      "/root/haccp_v3/.env",
      "/root/haccp_v3/webapp/.env",
    ];
    for (const envPath of searchPaths) {
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, "utf-8");
        const match = content.match(/^OPENAI_API_KEY=(.+)$/m);
        if (match) {
          const key = match[1].trim();
          _cachedOpenAIKey = key;
          return key;
        }
      }
    }
  } catch {}
  _cachedOpenAIKey = "";
  return "";
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
    return process.env.BUILT_IN_FORGE_API_KEY || process.env.OPENAI_API_KEY || getOpenAIKeyFromDotenv();
  },
};

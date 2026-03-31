import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import path from "path";
import cookieParser from "cookie-parser";
import cors from "cors";
import session from "express-session";
import { createClient } from "redis";
import { RedisStore } from "connect-redis";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
// import { registerOAuthRoutes } from "./oauth"; // OAuth 제거: 로컬 인증만 사용
import { loginRouter } from "./loginRoute";
import superadminRouter from "../superadmin";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { initScheduler } from "../scheduler.js";
import { initNotificationScheduler } from "./notificationScheduler";
import { initCcpAdvanceNotificationScheduler } from "./ccpAdvanceNotificationScheduler";
import { initBatchStartNotificationScheduler } from "./batchStartNotificationScheduler";
import { initInventoryForecastScheduler } from "./inventoryForecastScheduler";
import { initInspectionNotificationScheduler } from "./inspectionNotificationScheduler";
import { initApprovalAutomationScheduler } from "./approvalAutomationScheduler";
import { initInspectionReportScheduler } from "./inspectionReportScheduler";
import { initChecklistGenerator } from "../schedulers/checklistGenerator";
import { initSubscriptionScheduler } from "../services/subscriptionScheduler";
import { initDailyClosingScheduler } from "../services/dailyClosingScheduler";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

// ============================================================================
// 환경변수 검증 - 서버 시작 전 필수/권장 변수 확인
// ============================================================================
function validateEnvVars(): void {
  const required = ["DATABASE_URL"] as const;
  const optional = ["REDIS_URL", "OPENAI_API_KEY", "CORS_ORIGINS"] as const;

  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`[FATAL] 필수 환경변수 누락: ${missing.join(", ")}`);
    console.error("서버를 시작할 수 없습니다. .env 파일을 확인하세요.");
    process.exit(1);
  }

  for (const key of optional) {
    if (!process.env[key]) {
      console.warn(`[WARN] 선택 환경변수 미설정: ${key} — 일부 기능이 제한될 수 있습니다.`);
    }
  }
}

async function startServer() {
  validateEnvVars();

  const app = express();
  const server = createServer(app);
  
  // Rate Limiting - 기본 IP당 분당 200회 제한
  const rateMap = new Map<string, { count: number; resetAt: number }>();
  app.use((req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const entry = rateMap.get(ip);
    if (!entry || now > entry.resetAt) {
      rateMap.set(ip, { count: 1, resetAt: now + 60000 });
    } else {
      entry.count++;
      if (entry.count > 200) {
        res.status(429).json({ error: '요청이 너무 많습니다. 잠시 후 다시 시도하세요.' });
        return;
      }
    }
    next();
  });
  // 만료된 항목 정리 (5분마다)
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of rateMap) { if (now > entry.resetAt) rateMap.delete(ip); }
  }, 300000);

  // CORS 설정 - 허용 도메인 제한
  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
    : ['https://haccpone.com', 'https://www.haccpone.com', 'http://localhost:5173', 'http://localhost:3000'];
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) callback(null, true);
      else callback(null, true); // 운영 전환 시 false로 변경
    },
    credentials: true,
  }));
  
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  
  // Cookie parser for JWT authentication
  app.use(cookieParser());
  
  // ============================================================================
  // ✨ Redis 세션 스토어 설정
  // ============================================================================
  
  // Redis 클라이언트 생성 및 연결
  const redisClient = createClient({
    url: process.env.REDIS_URL || "redis://localhost:6379",
    socket: {
      reconnectStrategy: (retries) => {
        if (retries > 10) {
          console.error("[Redis] Max reconnection attempts reached. Giving up.");
          return new Error("Max reconnection attempts reached");
        }
        const delay = Math.min(retries * 100, 3000);
        console.log(`[Redis] Reconnecting in ${delay}ms... (attempt ${retries})`);
        return delay;
      },
    },
  });
  
  redisClient.on("error", (err) => {
    console.error("[Redis] Client error:", err.message);
  });
  
  redisClient.on("connect", () => {
    console.log("[Redis] Connected successfully");
  });
  
  redisClient.on("reconnecting", () => {
    console.log("[Redis] Reconnecting...");
  });
  
  // Redis 연결
  try {
    await redisClient.connect();
    console.log("[Redis] Session store ready");
  } catch (err) {
    console.error("[Redis] Failed to connect:", err);
    console.warn("[Redis] Falling back to MemoryStore (NOT recommended for production)");
  }
  
  // Redis 세션 스토어 생성
  const redisStore = new RedisStore({
    client: redisClient,
    prefix: "haccp:sess:",  // 세션 키 접두사
    ttl: 60 * 60 * 24 * 7,  // 7일 (초 단위)
  });
  
  // Session 미들웨어 (Redis 스토어 사용)
  app.use(session({
    store: redisStore,
    secret: process.env.SESSION_SECRET || (() => { console.warn('[SECURITY] SESSION_SECRET 환경변수를 설정하세요!'); return 'haccp-v3-fallback-' + (process.env.DATABASE_URL || '').slice(-16); })(),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // HTTPS에서만 secure 쿠키
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7일
      domain: process.env.NODE_ENV === 'production' ? '.haccpone.com' : undefined,
    },
  }));
  
  // OAuth callback under /api/oauth/callback
  // registerOAuthRoutes(app); // OAuth 제거: 로컬 인증만 사용
  // Login route (네이티브 HTML form 제출용)
  app.use(loginRouter);
  // 특정기간일지 REST API 라우트
  const customPeriodLogRouter = (await import("../routers/customPeriodLogs")).default;
  app.use("/api/customPeriodLog", customPeriodLogRouter);
  // 연간일지 REST API 라우트
  const yearlyLogRestRouter = (await import("../routers/yearlyLogRest")).default;
  app.use("/api/yearlyLog", yearlyLogRestRouter);
  app.use("/api/superadmin", superadminRouter);
  // 비용전표 첨부파일 업로드 REST API
  const expenseUploadRouter = (await import("../routers/expenseUpload")).default;
  app.use("/api/expense", expenseUploadRouter);
  // 업로드 파일 정적 서빙
  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, '0.0.0.0', async () => {
    console.log(`Server running on http://0.0.0.0:${port}/`);
    
    // DB 사전 초기화 (스케줄러보다 먼저 실행)
    try {
      const { getDb } = await import("../db");
      await getDb();
      console.log("[Server] Database pre-initialized successfully");
      
      // 자동 마이그레이션 실행 (누락된 컬럼 추가 등)
      const { runStartupMigrations } = await import("../db/startupMigrations");
      await runStartupMigrations();
    } catch (err) {
      console.error("[Server] Database pre-initialization failed:", err);
    }
    
    // 스케줄러 초기화
    initScheduler();
    // 알림 자동 삭제 스케줄러 초기화
    // initNotificationScheduler();
    // CCP 점검 사전 알림 스케줄러 초기화
    // initCcpAdvanceNotificationScheduler();
    // 배치 시작 알림 스케줄러 초기화
    // initBatchStartNotificationScheduler();
    // 재고 예측 알림 스케줄러 초기화
    // initInventoryForecastScheduler();
    // 검사 알림 스케줄러 초기화
    // initInspectionNotificationScheduler();
    console.log("[Scheduler] 모든 스케줄러 임시 비활성화 (로그인 기능 안정화를 위해)");
    // 승인 자동화 스케줄러 초기화
    initApprovalAutomationScheduler();
    // 체크리스트 자동 생성 스케줄러 초기화
    initChecklistGenerator();
    // 검사 리포트 스케줄러 초기화
    initInspectionReportScheduler();
    // 구독 만료 알림 스케줄러 초기화
    initSubscriptionScheduler();
    // 일일 마감 스케줄러 초기화 (매일 18:00)
    initDailyClosingScheduler();
  });
  
  // Graceful shutdown: Redis 연결 정리
  const gracefulShutdown = async () => {
    console.log("[Server] Shutting down gracefully...");
    try {
      await redisClient.quit();
      console.log("[Redis] Disconnected");
    } catch (err) {
      console.error("[Redis] Error during disconnect:", err);
    }
    server.close(() => {
      console.log("[Server] Closed");
      process.exit(0);
    });
  };
  
  process.on("SIGTERM", gracefulShutdown);
  process.on("SIGINT", gracefulShutdown);
}

startServer().catch(console.error);

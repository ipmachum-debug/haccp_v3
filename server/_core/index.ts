// dotenv v17: override=true 필수 — 시스템 환경에 OPENAI_API_KEY="" (빈값)이 있으면
// dotenv가 "이미 정의됨"으로 판단하여 .env 값을 주입하지 않는 문제 방지
import { config as dotenvConfig } from "dotenv";
import path from "path";
dotenvConfig({
  path: path.resolve(process.cwd(), ".env"),
  override: true,
});

import express from "express";
import { createServer } from "http";
import net from "net";
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
import { initDailyClosingScheduler } from "../services/dailyClosingScheduler";
import { initSentry, captureException } from "../lib/sentry";

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
  // ★ ESM 번들에서 dotenv/config import가 lazy init될 수 있으므로
  //    startServer 진입 시 명시적으로 .env 로드 (override=true 로 빈값 덮어쓰기)
  // ★ 2026-04-15: PM2 CWD 불일치 대비 — 여러 경로 순회하여 첫 번째 발견 파일 로드
  const fs = await import("fs");
  const candidatePaths = [
    path.resolve(process.cwd(), ".env"),
    "/root/haccp_v3/.env",
    "/root/haccp_v3/webapp/.env",
    "/root/haccpone-v2/.env",
    "/home/user/haccp_v3/.env",
    "/var/www/haccp_v3/.env",
  ];
  let loadedFrom: string | null = null;
  for (const p of candidatePaths) {
    try {
      if (fs.existsSync(p)) {
        dotenvConfig({ path: p, override: true });
        loadedFrom = p;
        break;
      }
    } catch { /* ignore per-path */ }
  }
  console.log(`[startServer] dotenv loaded from: ${loadedFrom ?? "(none — process env only)"}`);

  validateEnvVars();

  // Sentry 에러 모니터링 초기화 (SENTRY_DSN 환경변수 필요)
  initSentry();

  // 트랜잭션 실패 텔레메트리 — connection.ts ↔ operationMonitor.ts 순환 해소용 registry
  {
    const { setTransactionFailureTracker } = await import("../db/connection.js");
    const { trackTransactionFailure } = await import("../utils/operationMonitor.js");
    setTransactionFailureTracker(trackTransactionFailure);
  }

  // AI/LLM 진단 출력 (서버 로그에서 확인 가능)
  const { printEnvDiagnostics } = await import("./env.js").catch(() => ({ printEnvDiagnostics: undefined }));
  if (printEnvDiagnostics) printEnvDiagnostics();

  const app = express();
  const server = createServer(app);

  // trust proxy — nginx 뒤에서 X-Forwarded-For 헤더를 사용해 실제 클라이언트 IP 식별
  // ★ 2026-04-15 Genspark 커밋 fa64385 동기화
  //   이전: 모든 요청이 127.0.0.1 로 카운트 → 한 사람이 전체 한계 소진 → 429
  //   현재: trust proxy 1 → req.ip 가 X-Forwarded-For 의 실제 클라이언트 IP 반환
  app.set('trust proxy', 1);

  // Rate Limiting
  // ★ 2026-04-15 조정: SPA tRPC 부하를 고려하여 한계 대폭 상향
  //   이전: 200 req/min → CCP 모니터링 같은 다중 쿼리 페이지에서 정상 사용자도 429
  //   현재: 인증된 /trpc/* 는 제외, 그 외는 1200 req/min (DoS 방어용)
  const rateMap = new Map<string, { count: number; resetAt: number }>();
  const RATE_LIMIT_MAX = 1200; // req per minute per IP
  app.use((req, res, next) => {
    // 인증된 API 경로는 rate limit 스킵 (세션 기반 인증이 이미 보호)
    // 정적 에셋(assets, @vite, node_modules)도 스킵
    const p = req.path || "";
    if (
      p.startsWith("/trpc/") ||
      p.startsWith("/api/") ||
      p.startsWith("/assets/") ||
      p.startsWith("/@") ||
      p.startsWith("/node_modules/") ||
      p.startsWith("/src/") ||
      p === "/favicon.ico"
    ) {
      return next();
    }
    // trust proxy 설정으로 req.ip 가 X-Forwarded-For 의 실제 클라이언트 IP 반환
    // 폴백: X-Forwarded-For 헤더 직접 파싱
    const ip = req.ip || req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const entry = rateMap.get(ip);
    if (!entry || now > entry.resetAt) {
      rateMap.set(ip, { count: 1, resetAt: now + 60000 });
    } else {
      entry.count++;
      if (entry.count > RATE_LIMIT_MAX) {
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
    : ['https://millioai.com', 'https://www.millioai.com', 'http://localhost:5173', 'http://localhost:3000'];
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
  
  // SESSION_SECRET: production 에서는 필수, dev 에서만 폴백 허용
  const sessionSecret = (() => {
    const env = process.env.SESSION_SECRET;
    if (env && env.length >= 32) return env;
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "[SECURITY] SESSION_SECRET 환경변수 필수 (32자 이상). production 부팅 중단.",
      );
    }
    console.warn(
      "[SECURITY] SESSION_SECRET 미설정 — dev/test 전용 폴백 사용 중.",
    );
    return "dev-only-session-secret-do-not-use-in-production-12345678";
  })();

  // Session 미들웨어 (Redis 스토어 사용)
  app.use(session({
    store: redisStore,
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // HTTPS에서만 secure 쿠키
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7일
      domain: process.env.NODE_ENV === 'production' ? '.millioai.com' : undefined,
    },
  }));
  
  // OAuth callback under /api/oauth/callback
  // registerOAuthRoutes(app); // OAuth 제거: 로컬 인증만 사용
  // Login route (네이티브 HTML form 제출용)
  app.use(loginRouter);
  // 특정기간일지 REST API 라우트
  const customPeriodLogRouter = (await import("../routers/production/customPeriodLogs.router")).default;
  app.use("/api/customPeriodLog", customPeriodLogRouter);
  // 연간일지 REST API 라우트
  const yearlyLogRestRouter = (await import("../routers/production/yearlyLogRest.router")).default;
  app.use("/api/yearlyLog", yearlyLogRestRouter);
  app.use("/api/superadmin", superadminRouter);
  // 비용전표 첨부파일 업로드 REST API
  const expenseUploadRouter = (await import("../routers/accounting/expenseUpload.router")).default;
  app.use("/api/expense", expenseUploadRouter);
  // 업로드 파일 정적 서빙
  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

  // ── 내부 관리자 API (localhost만 허용) ──
  const checkLocalhost = (req: any): boolean => {
    const forwarded = req.headers['x-forwarded-for'];
    const remoteIp = req.ip || req.socket.remoteAddress || '';
    return !forwarded && (remoteIp === '127.0.0.1' || remoteIp === '::1' || remoteIp === '::ffff:127.0.0.1');
  };

  // 생산일지 재생성
  app.post("/api/internal/regenerate-production-daily", async (req, res) => {
    try {
      if (!checkLocalhost(req)) return res.status(403).json({ error: "localhost only" });
      const { date, tenantId } = req.body || {};
      if (!date || !tenantId) return res.status(400).json({ error: "date and tenantId required" });
      const { autoRegenerateProductionDaily } = await import("../lib/production/autoProductionDaily");
      const result = await autoRegenerateProductionDaily(Number(tenantId), String(date));
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 완제품 출고검사 기본 배송방법 일괄 변경
  app.post("/api/internal/fix-ship-method", async (req, res) => {
    try {
      if (!checkLocalhost(req)) return res.status(403).json({ error: "localhost only" });
      const { tenantId } = req.body || {};
      if (!tenantId) return res.status(400).json({ error: "tenantId required" });
      const { getDb } = await import("../db");
      const { sql } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) return res.status(500).json({ error: "DB 연결 실패" });
      // DB 컬럼 기본값 변경
      await db.execute(sql`ALTER TABLE h_finished_product_inspection_items MODIFY COLUMN ship_method VARCHAR(30) DEFAULT '택배(아이스박스)'`).catch(() => {});
      // 기존 '차량배송' 데이터를 '택배(아이스박스)'로 일괄 변경
      const result = await db.execute(sql`
        UPDATE h_finished_product_inspection_items
        SET ship_method = '택배(아이스박스)'
        WHERE tenant_id = ${Number(tenantId)} AND (ship_method = '차량배송' OR ship_method IS NULL)
      `);
      const affected = (result as any)[0]?.affectedRows || 0;
      res.json({ success: true, message: `${affected}건 배송방법 변경 완료 (차량배송 → 택배(아이스박스))` });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // DB 조회 (관리용, localhost only)
  app.post("/api/internal/query", async (req, res) => {
    try {
      if (!checkLocalhost(req)) return res.status(403).json({ error: "localhost only" });
      const { sql: sqlQuery, params } = req.body || {};
      if (!sqlQuery) return res.status(400).json({ error: "sql required" });
      // SELECT만 허용
      if (!/^\s*SELECT/i.test(sqlQuery)) return res.status(400).json({ error: "SELECT only" });
      const { getRawConnection } = await import("../db/connection");
      const pool = await getRawConnection();
      const [rows] = await pool.execute(sqlQuery, params || []);
      res.json({ success: true, count: (rows as any[]).length, rows });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // DB 수정 (관리용, localhost only)
  app.post("/api/internal/execute", async (req, res) => {
    try {
      if (!checkLocalhost(req)) return res.status(403).json({ error: "localhost only" });
      const { sql: sqlQuery, params } = req.body || {};
      if (!sqlQuery) return res.status(400).json({ error: "sql required" });
      const { getRawConnection } = await import("../db/connection");
      const pool = await getRawConnection();
      const [result] = await pool.execute(sqlQuery, params || []);
      const affected = (result as any).affectedRows || 0;
      res.json({ success: true, affectedRows: affected });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // CCP form rows resync (특정 날짜 배치 전체)
  app.post("/api/internal/resync-form-rows", async (req, res) => {
    try {
      if (!checkLocalhost(req)) return res.status(403).json({ error: "localhost only" });
      const { date, tenantId } = req.body || {};
      if (!date || !tenantId) return res.status(400).json({ error: "date and tenantId required" });
      const { getRawConnection } = await import("../db/connection");
      const { syncCcpRowsToFormRows } = await import("../db/haccp/ccpFormRecords");
      const pool = await getRawConnection();
      const [batchRows] = await pool.execute(
        `SELECT id, batch_code, batch_order FROM h_batches WHERE planned_date = ? AND tenant_id = ? ORDER BY batch_order`,
        [String(date), Number(tenantId)]
      ) as any;
      const results: any[] = [];
      for (const b of (batchRows || [])) {
        try {
          const r = await syncCcpRowsToFormRows({ batchId: b.id, tenantId: Number(tenantId) });
          results.push({ batchId: b.id, batchCode: b.batch_code, synced: r.synced });
        } catch (e: any) {
          results.push({ batchId: b.id, batchCode: b.batch_code, error: e.message });
        }
      }
      res.json({ success: true, count: batchRows.length, results });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 특정 날짜 생산배치 강제 삭제 (완료 상태 포함)
  app.post("/api/internal/force-delete-batches", async (req, res) => {
    try {
      if (!checkLocalhost(req)) return res.status(403).json({ error: "localhost only" });
      const { date, tenantId } = req.body || {};
      if (!date || !tenantId) return res.status(400).json({ error: "date and tenantId required" });
      const { getRawConnection } = await import("../db/connection");
      const pool = await getRawConnection();

      // 1. 해당 날짜의 배치 목록 조회
      const [batchRows] = await pool.execute(
        `SELECT b.id, b.batch_code, b.status, p.product_name
         FROM h_batches b
         LEFT JOIN h_products_v2 p ON b.product_id = p.id
         WHERE b.planned_date = ? AND b.tenant_id = ?`,
        [String(date), Number(tenantId)]
      ) as any;
      
      if (!batchRows || batchRows.length === 0) {
        return res.json({ success: true, message: `${date} 날짜에 배치가 없습니다.`, deleted: 0, batches: [] });
      }

      const deletedBatches: any[] = [];
      const { deleteBatch } = await import("../db/production/batchFunctions");

      // 2. 각 배치를 강제 삭제 (deleteBatch 함수 사용 - CCP, 일정, 승인 등 cascade 삭제)
      for (const batch of batchRows) {
        try {
          await deleteBatch(Number(batch.id), Number(tenantId));
          deletedBatches.push({
            id: batch.id,
            batchCode: batch.batch_code,
            productName: batch.product_name,
            status: batch.status,
            result: 'deleted'
          });
        } catch (err: any) {
          deletedBatches.push({
            id: batch.id,
            batchCode: batch.batch_code,
            productName: batch.product_name,
            status: batch.status,
            result: `error: ${err.message}`
          });
        }
      }

      // 3. 일일일지(h_generic_checklist_records)에서 해당 날짜 배치 정보 제거
      try {
        const [clRows] = await pool.execute(
          `SELECT id, form_data FROM h_generic_checklist_records
           WHERE form_type = 'daily_log' AND form_date = ? AND tenant_id = ? LIMIT 1`,
          [String(date), Number(tenantId)]
        ) as any;
        if (clRows && clRows.length > 0) {
          const cl = clRows[0];
          let formData: any = {};
          try { formData = typeof cl.form_data === 'string' ? JSON.parse(cl.form_data) : (cl.form_data || {}); } catch {}
          if (Array.isArray(formData.batches)) {
            const deletedIds = new Set(deletedBatches.filter((b: any) => b.result === 'deleted').map((b: any) => b.id));
            formData.batches = formData.batches.filter((b: any) => !deletedIds.has(b.batchId));
            formData.totalBatches = formData.batches.length;
            formData.totalProduction = formData.batches.reduce((s: number, b: any) => s + (b.actualQuantity || 0), 0);
            await pool.execute(
              `UPDATE h_generic_checklist_records SET form_data = ?, updated_at = NOW() WHERE id = ?`,
              [JSON.stringify(formData), Number(cl.id)]
            );
          }
        }
      } catch (dlErr: any) {
        console.error('[force-delete-batches] 일일일지 정리 실패:', dlErr);
      }

      // 4. 생산일지(h_daily_reports) 해당 날짜 삭제
      // ★ 2026-04-15: 이전에는 catch (_e) {} 로 완전 무시 → 테이블 미존재/FK 제약 실패가
      //   조용히 넘어가 데이터 중복/불일치 생김. warn 로그 남기도록 변경.
      try {
        await pool.execute(
          `DELETE FROM h_daily_reports WHERE report_date = ? AND report_type = 'production_daily' AND tenant_id = ?`,
          [String(date), Number(tenantId)]
        );
      } catch (e: any) {
        console.warn(`[force-delete-batches] h_daily_reports 삭제 실패 (date=${date}):`, e?.message || e);
      }

      // 5. production_sku_output 해당 날짜 삭제
      try {
        await pool.execute(
          `DELETE FROM production_sku_output WHERE work_date = ? AND tenant_id = ?`,
          [String(date), Number(tenantId)]
        );
      } catch (e: any) {
        console.warn(`[force-delete-batches] production_sku_output 삭제 실패 (date=${date}):`, e?.message || e);
      }

      // 6. h_production_performance 해당 날짜 삭제
      try {
        await pool.execute(
          `DELETE FROM h_production_performance WHERE work_date = ? AND tenant_id = ?`,
          [String(date), Number(tenantId)]
        );
      } catch (e: any) {
        console.warn(`[force-delete-batches] h_production_performance 삭제 실패 (date=${date}):`, e?.message || e);
      }

      // 7. h_production_start 해당 날짜 삭제
      try {
        await pool.execute(
          `DELETE FROM h_production_start WHERE work_date = ? AND tenant_id = ?`,
          [String(date), Number(tenantId)]
        );
      } catch (e: any) {
        console.warn(`[force-delete-batches] h_production_start 삭제 실패 (date=${date}):`, e?.message || e);
      }

      res.json({
        success: true,
        message: `${date} 생산배치 ${deletedBatches.filter((b: any) => b.result === 'deleted').length}/${batchRows.length}건 삭제 완료`,
        deleted: deletedBatches.filter((b: any) => b.result === 'deleted').length,
        total: batchRows.length,
        batches: deletedBatches
      });
    } catch (err: any) {
      console.error('[force-delete-batches] error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── 백업 헬스체크 (Bearer 토큰 인증, GitHub Actions 용) ──
  // /home/root/backups/haccp/backup_status.json 파일을 읽어 현재 상태 반환.
  // 이 파일은 scripts/backup.sh 가 백업 완료 후 자동으로 업데이트한다.
  app.get("/api/system/backup-health", async (req, res) => {
    try {
      const expectedToken = process.env.BACKUP_HEALTH_TOKEN;
      if (!expectedToken) {
        return res.status(503).json({ ok: false, error: "BACKUP_HEALTH_TOKEN 미설정 (서버 env 확인 필요)" });
      }

      const authHeader = req.headers.authorization || "";
      const providedToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
      if (providedToken !== expectedToken) {
        return res.status(401).json({ ok: false, error: "invalid token" });
      }

      const fs = await import("fs/promises");
      const STATUS_PATH = process.env.BACKUP_STATUS_PATH || "/home/root/backups/haccp/backup_status.json";

      let statusJson: any;
      try {
        const raw = await fs.readFile(STATUS_PATH, "utf-8");
        statusJson = JSON.parse(raw);
      } catch (err: any) {
        return res.status(500).json({
          ok: false,
          error: "backup_status.json 읽기 실패 — 백업이 한 번도 실행되지 않았거나 스크립트 오류",
          details: err.message,
          status_path: STATUS_PATH,
        });
      }

      const nowEpoch = Math.floor(Date.now() / 1000);
      const mtimeEpoch = Number(statusJson.latest_backup_mtime_epoch || 0);
      const ageSeconds = mtimeEpoch > 0 ? nowEpoch - mtimeEpoch : -1;
      const ageMinutes = ageSeconds >= 0 ? Math.floor(ageSeconds / 60) : -1;
      const sizeBytes = Number(statusJson.latest_backup_size_bytes || 0);

      // ── 판정 규칙 ──
      // - 최신 백업이 26시간 이내여야 함 (cron: 매일 02:00)
      // - 최소 크기 10KB (354바이트 참사 방지)
      const MAX_AGE_MINUTES = 1560;
      const MIN_SIZE_BYTES = 10240;

      const errors: string[] = [];
      if (ageMinutes < 0) {
        errors.push("백업 파일 mtime 정보 없음");
      } else if (ageMinutes > MAX_AGE_MINUTES) {
        errors.push(`백업 노후: ${ageMinutes}분 경과 (허용: ${MAX_AGE_MINUTES}분)`);
      }
      if (sizeBytes < MIN_SIZE_BYTES) {
        errors.push(`백업 과소: ${sizeBytes}바이트 (최소: ${MIN_SIZE_BYTES}바이트) — DB_NAME 환경변수 확인 필요`);
      }

      const ok = errors.length === 0;
      return res.status(ok ? 200 : 503).json({
        ok,
        errors,
        checked_at: new Date().toISOString(),
        thresholds: { max_age_minutes: MAX_AGE_MINUTES, min_size_bytes: MIN_SIZE_BYTES },
        status: {
          ...statusJson,
          derived_age_minutes: ageMinutes,
          derived_age_hours: ageMinutes >= 0 ? Math.round((ageMinutes / 60) * 10) / 10 : null,
          derived_size_human: sizeBytes >= 1024 * 1024
            ? `${(sizeBytes / (1024 * 1024)).toFixed(1)}MB`
            : sizeBytes >= 1024
            ? `${(sizeBytes / 1024).toFixed(1)}KB`
            : `${sizeBytes}B`,
        },
      });
    } catch (err: any) {
      console.error("[backup-health] error:", err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ── 자동 배포 (Bearer 토큰 인증, GitHub Actions 용) ──
  // PR-D1 (2026-04-27): Release 자산 기반 배포로 전환.
  //   이전: 서버에서 git pull → npm install → npm run build → pm2 restart (8GB OOM 발생)
  //   현재: GitHub Actions 가 dist.tar.gz 를 Release 자산으로 업로드 →
  //         서버는 자산 다운로드 → atomic swap → pm2 reload (메모리 안전)
  //
  // POST body (JSON):
  //   - release_tag        (필수)  배포할 release tag, 예: "v0.8.3"
  //   - asset_name         (필수)  자산 파일명, 예: "dist-v0.8.3-abc1234.tar.gz"
  //   - expected_sha256    (선택)  자산 SHA256. 있으면 다운로드 후 체크섬 검증
  //
  // 동시 배포 방지를 위해 in-memory 락 사용.
  let deployInProgress = false;
  app.post("/api/system/deploy", async (req, res) => {
    try {
      const expectedToken = process.env.DEPLOY_TOKEN;
      if (!expectedToken) {
        return res.status(503).json({ ok: false, error: "DEPLOY_TOKEN 미설정 (서버 env 확인 필요)" });
      }

      const authHeader = req.headers.authorization || "";
      const providedToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
      if (providedToken !== expectedToken) {
        return res.status(401).json({ ok: false, error: "invalid token" });
      }

      // body 파싱 (release_tag/asset_name 필수)
      const body: any = req.body || {};
      const releaseTag = typeof body.release_tag === "string" ? body.release_tag.trim() : "";
      const assetName = typeof body.asset_name === "string" ? body.asset_name.trim() : "";
      const expectedSha256 = typeof body.expected_sha256 === "string" ? body.expected_sha256.trim() : "";

      if (!releaseTag) {
        return res.status(400).json({
          ok: false,
          error: "release_tag 필수 (예: { release_tag: 'v0.8.3', asset_name: 'dist-v0.8.3-abc1234.tar.gz' })",
        });
      }
      if (!assetName) {
        return res.status(400).json({ ok: false, error: "asset_name 필수" });
      }

      // 입력값 형식 안전성 검사 (커맨드 인젝션 방지)
      if (!/^[A-Za-z0-9._+\-]{1,64}$/.test(releaseTag)) {
        return res.status(400).json({ ok: false, error: "release_tag 형식 부적합" });
      }
      if (!/^[A-Za-z0-9._+\-]{1,128}$/.test(assetName)) {
        return res.status(400).json({ ok: false, error: "asset_name 형식 부적합" });
      }
      if (expectedSha256 && !/^[a-fA-F0-9]{64}$/.test(expectedSha256)) {
        return res.status(400).json({ ok: false, error: "expected_sha256 형식 부적합 (64자 hex)" });
      }

      if (!process.env.GITHUB_TOKEN) {
        return res.status(503).json({
          ok: false,
          error: "GITHUB_TOKEN 미설정 (서버 .env 확인 필요 — Release 자산 다운로드용)",
        });
      }

      if (deployInProgress) {
        return res.status(409).json({ ok: false, error: "다른 배포가 진행 중입니다" });
      }
      deployInProgress = true;

      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execAsync = promisify(exec);

      const DEPLOY_SCRIPT = process.env.DEPLOY_SCRIPT_PATH || "/root/haccp_v3/scripts/deploy.sh";
      const startedAt = new Date().toISOString();

      console.log(`[deploy] 시작 — tag=${releaseTag}, asset=${assetName}`);
      try {
        const { stdout, stderr } = await execAsync(`bash ${DEPLOY_SCRIPT}`, {
          timeout: 5 * 60 * 1000, // 5분 (자산 다운로드만 하므로 충분)
          maxBuffer: 10 * 1024 * 1024, // 10MB
          env: {
            ...process.env,
            RELEASE_TAG: releaseTag,
            ASSET_NAME: assetName,
            EXPECTED_SHA256: expectedSha256,
          },
        });

        console.log("[deploy] 성공");
        return res.status(200).json({
          ok: true,
          release_tag: releaseTag,
          asset_name: assetName,
          started_at: startedAt,
          finished_at: new Date().toISOString(),
          stdout: stdout.slice(-5000),
          stderr: stderr.slice(-2000),
        });
      } catch (err: any) {
        console.error("[deploy] 실패:", err.message);
        return res.status(500).json({
          ok: false,
          error: "deploy script failed",
          release_tag: releaseTag,
          asset_name: assetName,
          started_at: startedAt,
          finished_at: new Date().toISOString(),
          code: err.code,
          signal: err.signal,
          stdout: (err.stdout || "").slice(-5000),
          stderr: (err.stderr || "").slice(-2000),
        });
      } finally {
        deployInProgress = false;
      }
    } catch (err: any) {
      deployInProgress = false;
      console.error("[deploy] endpoint error:", err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

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
    // ★ Plan D: ready 신호를 이 단계 완료 후로 이동.
    //   기존: listen 콜백 진입 즉시 process.send("ready") → PM2 가 곧바로 구
    //         인스턴스 종료 → 신 인스턴스 첫 요청이 DB 초기화 전에 들어와
    //         500/타임아웃 발생 (502 윈도우 5~10초).
    //   변경: getDb() await + 스케줄러 등록 후 ready 통지 → 구 인스턴스 종료
    //         시점에 신 인스턴스 완전 준비 완료.
    try {
      const { getDb } = await import("../db");
      await getDb();
      console.log("[Server] Database pre-initialized successfully");

      // 자동 마이그레이션 — production 기본 비활성.
      // 배포 재현성/스키마 drift 방지를 위해 배포 파이프라인에서 명시적으로 돌리는 것이 원칙.
      // 비상 시 RUN_STARTUP_MIGRATIONS=true 로 강제 실행 가능.
      const shouldRunMigrations =
        process.env.NODE_ENV !== "production" ||
        process.env.RUN_STARTUP_MIGRATIONS === "true";
      if (shouldRunMigrations) {
        const { runStartupMigrations } = await import("../db/startupMigrations");
        await runStartupMigrations();
      } else {
        console.log("[Server] startupMigrations skipped (production default). Set RUN_STARTUP_MIGRATIONS=true to enable.");
      }
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
    // 일일 마감 스케줄러 초기화 (매일 18:00)
    initDailyClosingScheduler();

    // ★ Plan D: PM2 wait_ready 신호 — DB + 스케줄러 모두 준비 완료 후 통지.
    // ecosystem.config.cjs 의 wait_ready: true + listen_timeout: 30000 과 함께 동작.
    // 이 신호 직전까지 PM2 는 구 인스턴스 종료를 보류 → 502 윈도우 0초 수렴.
    if (typeof process.send === "function") {
      process.send("ready");
      console.log("[PM2] 'ready' 신호 전송 완료 (DB + 스케줄러 준비 완료 후)");
    }
  });
  
  // Graceful shutdown: Redis 연결 정리 + keep-alive idle 연결 정리
  // ★ Plan D: 502 윈도우의 진짜 원인 — keep-alive idle 소켓 정리 누락.
  //   기존: server.close() 만 호출 → keep-alive idle 소켓 살아있어 콜백 지연
  //         → reload 시 502 윈도우 5~10초.
  //   변경:
  //     1. closeIdleConnections() — idle 소켓 즉시 정리 (Node 18.2+)
  //     2. server.close() — 활성 요청만 끝까지 응답
  //     3. 8초 force-exit timer — 응답 늦은 요청은 closeAllConnections() 으로 강제 종료
  const gracefulShutdown = async () => {
    console.log("[Server] Shutting down gracefully...");

    try {
      await redisClient.quit();
      console.log("[Redis] Disconnected");
    } catch (err) {
      console.error("[Redis] Error during disconnect:", err);
    }

    // 1. Keep-alive idle 연결 즉시 정리 (502 윈도우의 핵심 원인 차단)
    //    Node 18.2+ Server.closeIdleConnections() — 활성 요청 없는 소켓만 종료.
    //    cast 사용 (TypeScript @types/node 일부 버전 미반영).
    try {
      (server as { closeIdleConnections?: () => void }).closeIdleConnections?.();
      console.log("[Server] Idle connections closed");
    } catch (err) {
      console.error("[Server] closeIdleConnections error (non-fatal):", err);
    }

    // 2. 활성 요청 응답 대기 후 server.close() 콜백 호출
    server.close(() => {
      console.log("[Server] Closed gracefully");
      process.exit(0);
    });

    // 3. 8초 후 강제 종료 — 응답 안 끝나는 요청 차단 (PM2 kill_timeout 보다 짧게)
    const FORCE_EXIT_MS = 8000;
    setTimeout(() => {
      console.warn(`[Server] Graceful shutdown timeout (${FORCE_EXIT_MS}ms) — forcing exit`);
      try {
        (server as { closeAllConnections?: () => void }).closeAllConnections?.();
      } catch (err) {
        console.error("[Server] closeAllConnections error:", err);
      }
      process.exit(0);
    }, FORCE_EXIT_MS).unref();
  };
  
  process.on("SIGTERM", gracefulShutdown);
  process.on("SIGINT", gracefulShutdown);

  // 미처리 에러 Sentry 보고 + 서버 종료 방지
  process.on("uncaughtException", (err) => {
    console.error("[FATAL] uncaughtException:", err);
    captureException(err, { type: "uncaughtException" });
  });
  process.on("unhandledRejection", (reason) => {
    console.error("[FATAL] unhandledRejection:", reason);
    captureException(reason instanceof Error ? reason : new Error(String(reason)), { type: "unhandledRejection" });
  });
}

startServer().catch(console.error);

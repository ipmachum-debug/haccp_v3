/**
 * 서버 모니터링 유틸리티
 * CPU, RAM, 디스크, MySQL, 프로세스 상태 체크
 * 느림 원인 자동 기록
 */
import { execSync } from "child_process";
import { getPool } from "../db/pool";
import { logInfo, logWarn, logError } from "./logger";

export interface ServerStatus {
  timestamp: string;
  cpu: { usage: number; loadAvg: number[] };
  memory: { total: number; used: number; free: number; usagePercent: number };
  disk: { total: string; used: string; available: string; usagePercent: number };
  mysql: { connections: number; slowQueries: number; uptime: number; threadsRunning: number };
  process: { pid: number; uptime: number; memoryMB: number };
  alerts: string[];
}

function safeExec(cmd: string): string {
  try {
    return execSync(cmd, { timeout: 5000, encoding: "utf-8" }).trim();
  } catch {
    return "";
  }
}

export async function getServerStatus(): Promise<ServerStatus> {
  const alerts: string[] = [];
  const now = new Date().toISOString();

  // ── CPU ──
  let cpuUsage = 0;
  let loadAvg = [0, 0, 0];
  try {
    const loadStr = safeExec("cat /proc/loadavg");
    if (loadStr) {
      const parts = loadStr.split(" ");
      loadAvg = [parseFloat(parts[0]), parseFloat(parts[1]), parseFloat(parts[2])];
    }
    // CPU 사용률 (간이 계산)
    const statLine = safeExec("grep 'cpu ' /proc/stat");
    if (statLine) {
      const vals = statLine.split(/\s+/).slice(1).map(Number);
      const idle = vals[3];
      const total = vals.reduce((a, b) => a + b, 0);
      cpuUsage = Math.round(((total - idle) / total) * 100);
    }
  } catch {}
  if (cpuUsage > 80) alerts.push(`CPU 사용률 ${cpuUsage}% (80% 초과)`);
  if (loadAvg[0] > 4) alerts.push(`Load Average ${loadAvg[0]} (높음)`);

  // ── Memory ──
  let memTotal = 0, memUsed = 0, memFree = 0, memPercent = 0;
  try {
    const memStr = safeExec("free -m | grep Mem");
    if (memStr) {
      const parts = memStr.split(/\s+/);
      memTotal = parseInt(parts[1]) || 0;
      memUsed = parseInt(parts[2]) || 0;
      memFree = parseInt(parts[3]) || 0;
      memPercent = memTotal > 0 ? Math.round((memUsed / memTotal) * 100) : 0;
    }
  } catch {}
  if (memPercent > 85) alerts.push(`메모리 사용률 ${memPercent}% (85% 초과)`);

  // ── Disk ──
  let diskTotal = "", diskUsed = "", diskAvail = "", diskPercent = 0;
  try {
    const dfStr = safeExec("df -h / | tail -1");
    if (dfStr) {
      const parts = dfStr.split(/\s+/);
      diskTotal = parts[1];
      diskUsed = parts[2];
      diskAvail = parts[3];
      diskPercent = parseInt(parts[4]) || 0;
    }
  } catch {}
  if (diskPercent > 85) alerts.push(`디스크 사용률 ${diskPercent}% (85% 초과)`);

  // ── MySQL ──
  let mysqlConns = 0, slowQueries = 0, mysqlUptime = 0, threadsRunning = 0;
  try {
    const pool = getPool();
    const [statusRows] = await pool.execute<any[]>("SHOW GLOBAL STATUS WHERE Variable_name IN ('Threads_connected','Slow_queries','Uptime','Threads_running')");
    for (const row of statusRows) {
      switch (row.Variable_name) {
        case "Threads_connected": mysqlConns = parseInt(row.Value); break;
        case "Slow_queries": slowQueries = parseInt(row.Value); break;
        case "Uptime": mysqlUptime = parseInt(row.Value); break;
        case "Threads_running": threadsRunning = parseInt(row.Value); break;
      }
    }
  } catch {}
  if (mysqlConns > 100) alerts.push(`MySQL 연결 수 ${mysqlConns} (100 초과)`);
  if (threadsRunning > 20) alerts.push(`MySQL 실행 쓰레드 ${threadsRunning} (20 초과)`);

  // ── Process ──
  const processMemory = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
  const processUptime = Math.round(process.uptime());

  // ── 경고 로깅 ──
  if (alerts.length > 0) {
    logWarn(`[서버모니터링] 경고 ${alerts.length}건: ${alerts.join(", ")}`);
  }

  return {
    timestamp: now,
    cpu: { usage: cpuUsage, loadAvg },
    memory: { total: memTotal, used: memUsed, free: memFree, usagePercent: memPercent },
    disk: { total: diskTotal, used: diskUsed, available: diskAvail, usagePercent: diskPercent },
    mysql: { connections: mysqlConns, slowQueries, uptime: mysqlUptime, threadsRunning },
    process: { pid: process.pid, uptime: processUptime, memoryMB: processMemory },
    alerts,
  };
}

/**
 * API 응답시간 측정 미들웨어
 * Express 미들웨어로 등록하면 모든 요청의 응답시간을 기록
 */
export function responseTimeLogger() {
  return (req: any, res: any, next: any) => {
    const start = Date.now();
    const originalEnd = res.end;

    res.end = function (...args: any[]) {
      const duration = Date.now() - start;
      const path = req.originalUrl || req.url;

      // 3초 이상 걸리면 경고 로깅
      if (duration > 3000) {
        logWarn(`[슬로우 요청] ${req.method} ${path} → ${duration}ms (${res.statusCode})`);
      }

      // 10초 이상이면 에러급
      if (duration > 10000) {
        logError(`[매우 느린 요청] ${req.method} ${path} → ${duration}ms (${res.statusCode})`);
      }

      originalEnd.apply(res, args);
    };

    next();
  };
}

/**
 * 느림 원인 진단 (수동 호출용)
 */
export async function diagnoseSlow(): Promise<{
  bottleneck: string;
  details: Record<string, any>;
  recommendation: string;
}> {
  const status = await getServerStatus();

  // CPU 병목
  if (status.cpu.usage > 80) {
    return {
      bottleneck: "CPU",
      details: { usage: status.cpu.usage, loadAvg: status.cpu.loadAvg },
      recommendation: "CPU 사용률이 높습니다. 무거운 배치 작업이나 AI 호출이 집중되고 있을 수 있습니다.",
    };
  }

  // 메모리 병목
  if (status.memory.usagePercent > 85) {
    return {
      bottleneck: "메모리",
      details: { used: status.memory.used, total: status.memory.total, percent: status.memory.usagePercent },
      recommendation: "메모리 부족입니다. Node.js 힙 크기 확인 또는 PM2 인스턴스 수 조정이 필요합니다.",
    };
  }

  // 디스크 I/O
  if (status.disk.usagePercent > 85) {
    return {
      bottleneck: "디스크",
      details: { used: status.disk.used, total: status.disk.total, percent: status.disk.usagePercent },
      recommendation: "디스크 공간이 부족합니다. 로그 파일이나 오래된 백업을 정리하세요.",
    };
  }

  // MySQL 병목
  if (status.mysql.threadsRunning > 20 || status.mysql.connections > 100) {
    return {
      bottleneck: "MySQL",
      details: { connections: status.mysql.connections, threadsRunning: status.mysql.threadsRunning, slowQueries: status.mysql.slowQueries },
      recommendation: "MySQL 연결이 많거나 쿼리가 느립니다. 슬로우쿼리 로그를 확인하세요.",
    };
  }

  // API 지연 (서버는 정상인데 느리면)
  return {
    bottleneck: "외부 API (가능성 높음)",
    details: { cpu: status.cpu.usage, memory: status.memory.usagePercent, mysql: status.mysql.threadsRunning },
    recommendation: "서버 자원은 정상입니다. AI API 응답 지연(미국 시간대 피크타임) 가능성이 높습니다. 측정 전 단정은 불가합니다.",
  };
}

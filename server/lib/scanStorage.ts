/**
 * 스캔 파일 로컬 임시 저장소
 * - 서버 로컬 디스크에 임시 보관
 * - 7일 후 자동 삭제 (cleanup 함수)
 * - 나중에 네이버 Object Storage로 전환 가능
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";

const SCAN_DIR = process.env.SCAN_DIR || "/home/root/haccp_v3/uploads/scans";
const RETENTION_DAYS = 7;

// 디렉토리 초기화
export function ensureScanDir(): void {
  if (!fs.existsSync(SCAN_DIR)) {
    fs.mkdirSync(SCAN_DIR, { recursive: true });
  }
}

/**
 * 파일 저장 (Buffer → 로컬 디스크)
 * 반환: { filePath, fileName, key }
 */
export function saveScanFile(
  tenantId: number,
  originalName: string,
  buffer: Buffer
): { filePath: string; fileName: string; key: string } {
  ensureScanDir();

  const { todayKST } = require("../utils/timezone");
  const date = todayKST().replace(/-/g, "");
  const tenantDir = path.join(SCAN_DIR, String(tenantId), date);
  if (!fs.existsSync(tenantDir)) {
    fs.mkdirSync(tenantDir, { recursive: true });
  }

  const ext = path.extname(originalName) || ".pdf";
  const uuid = crypto.randomUUID();
  const fileName = `${uuid}${ext}`;
  const filePath = path.join(tenantDir, fileName);
  const key = `${tenantId}/${date}/${fileName}`;

  fs.writeFileSync(filePath, buffer);

  return { filePath, fileName, key };
}

/**
 * 파일 읽기 (OCR 처리용)
 */
export function readScanFile(key: string): Buffer | null {
  const filePath = path.join(SCAN_DIR, key);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath);
}

/**
 * 파일 삭제 (OCR 완료 후 즉시 삭제 또는 7일 후 삭제)
 */
export function deleteScanFile(key: string): boolean {
  const filePath = path.join(SCAN_DIR, key);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

/**
 * 7일 경과 파일 자동 정리
 * cron 또는 스케줄러에서 매일 호출
 */
export function cleanupExpiredScans(): { deleted: number; errors: number } {
  ensureScanDir();
  let deleted = 0;
  let errors = 0;
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;

  function walkDir(dir: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
        // 빈 디렉토리 삭제
        try {
          const remaining = fs.readdirSync(fullPath);
          if (remaining.length === 0) fs.rmdirSync(fullPath);
        } catch {}
      } else {
        try {
          const stat = fs.statSync(fullPath);
          if (stat.mtimeMs < cutoff) {
            fs.unlinkSync(fullPath);
            deleted++;
          }
        } catch {
          errors++;
        }
      }
    }
  }

  walkDir(SCAN_DIR);
  return { deleted, errors };
}

/**
 * 저장소 현황
 */
export function getScanStorageInfo(): {
  totalFiles: number;
  totalSizeMB: number;
  scanDir: string;
  retentionDays: number;
} {
  ensureScanDir();
  let totalFiles = 0;
  let totalSize = 0;

  function countDir(dir: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        countDir(fullPath);
      } else {
        totalFiles++;
        try { totalSize += fs.statSync(fullPath).size; } catch {}
      }
    }
  }

  countDir(SCAN_DIR);
  return {
    totalFiles,
    totalSizeMB: Math.round(totalSize / 1024 / 1024 * 10) / 10,
    scanDir: SCAN_DIR,
    retentionDays: RETENTION_DAYS,
  };
}

/**
 * Storage 헬퍼 — AWS S3 / Forge proxy / 호환 백엔드 지원
 *
 * ============================================================================
 * 백엔드 우선순위 (env 기반):
 *
 *   1. AWS_S3_BUCKET 설정 → AWS S3 (또는 S3 호환 — Cloudflare R2, MinIO 등)
 *   2. BUILT_IN_FORGE_API_URL 설정 → Manus / Forge proxy (레거시)
 *   3. 둘 다 미설정 → throw
 *
 * 기존 코드 (storagePut / storageGet) 시그니처 유지 — 호출자 변경 0.
 *
 * ============================================================================
 * AWS S3 환경변수 (운영 .env):
 *
 *   AWS_S3_BUCKET=my-bucket-name              [필수]
 *   AWS_S3_REGION=ap-northeast-2              [선택, 기본: ap-northeast-2]
 *   AWS_ACCESS_KEY_ID=AKIA...                 [선택, IAM role 사용 시 미설정]
 *   AWS_SECRET_ACCESS_KEY=...                 [선택, IAM role 사용 시 미설정]
 *   AWS_S3_ENDPOINT=https://...               [선택, S3 호환 서비스 (R2/MinIO)]
 *   AWS_S3_PUBLIC_BASE_URL=https://cdn...     [선택, CDN 사용 시 — 미설정 → presigned URL]
 *
 * S3 호환 서비스 예시:
 *   - Cloudflare R2: AWS_S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com
 *   - MinIO 자체호스팅: AWS_S3_ENDPOINT=http://minio:9000
 *
 * ============================================================================
 * IAM 권한 (S3 bucket policy):
 *   - s3:PutObject   (storagePut)
 *   - s3:GetObject   (storageGet via presigned URL)
 *   - (선택) s3:DeleteObject (향후 삭제 기능)
 *
 * ============================================================================
 * 트리거: 2026-04-29 운영 BUILT_IN_FORGE 미설정 사고 — 자체 storage 도입
 * ============================================================================
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ENV } from "./_core/env";

// ────────────────────────────────────────────────────────────────────────
// Backend 분기
// ────────────────────────────────────────────────────────────────────────

type StorageBackend = "s3" | "forge" | "none";

function detectBackend(): StorageBackend {
  if (process.env.AWS_S3_BUCKET?.trim()) return "s3";
  if (ENV.forgeApiUrl && ENV.forgeApiKey) return "forge";
  return "none";
}

/**
 * 사용자 친화 에러 메시지로 throw 되는 storage 백엔드 미설정 에러.
 *
 * 식별: `error.code === 'STORAGE_PROXY_NOT_CONFIGURED'` 으로 라우터 / 클라이언트가
 * 일반 throw 와 구분 가능. UI 는 fallback 메시지 사용 권장.
 *
 * 운영자 자동 알림: 처음 throw 될 때 (per-process) h_notifications 에 INSERT —
 * 동일 process 내 중복 알림 폭탄 방지 (in-memory cooldown 60 분).
 */
export class StorageNotConfiguredError extends Error {
  readonly code = "STORAGE_PROXY_NOT_CONFIGURED";
  readonly userMessage =
    "파일 저장 서비스에 일시적인 장애가 발생했습니다. 잠시 후 다시 시도해 주세요. (운영팀에 자동 알림이 전송되었습니다)";
  constructor() {
    super(
      "Storage backend not configured: set AWS_S3_BUCKET (+ AWS credentials) or BUILT_IN_FORGE_API_URL/KEY"
    );
    this.name = "StorageNotConfiguredError";
  }
}

/** 운영자 알림 cooldown — 동일 process 에서 60 분 1회만 INSERT */
const NOTIFY_COOLDOWN_MS = 60 * 60 * 1000;
let lastNotifiedAt = 0;

/**
 * 운영자 (admin role) 에게 storage 미설정 알림 INSERT (best-effort).
 *
 * 실패해도 throw 하지 않음 — 원본 storage 에러 흐름을 방해하지 않기 위함.
 */
async function notifyAdminsStorageMisconfigured(
  tenantId: number | undefined,
  context: string,
): Promise<void> {
  const now = Date.now();
  if (now - lastNotifiedAt < NOTIFY_COOLDOWN_MS) return;
  lastNotifiedAt = now;

  try {
    const { getDb } = await import("./db/connection");
    const db = await getDb();
    if (!db) return;

    const { sql } = await import("drizzle-orm");
    await db.execute(sql`
      INSERT INTO h_notifications (tenant_id, user_id, notification_type, title, message, priority, created_at)
      SELECT u.tenant_id, u.id, 'storage_misconfigured',
        ${"[운영경고] 파일 저장 서비스 인증 누락"},
        ${`storagePut/storageGet 호출 시 storage 백엔드 (AWS_S3_BUCKET 또는 BUILT_IN_FORGE_API_*) 환경변수가 설정되지 않아 실패. context=${context}, tenantId=${tenantId ?? "unknown"}. 운영 .env 에 키 추가 후 'pm2 reload haccpone' 필요.`},
        'urgent', NOW()
      FROM users u WHERE u.role = 'admin' AND u.is_active = 1
      LIMIT 10
    `);
  } catch (err) {
    // best-effort — 알림 실패는 무시 (원본 에러는 caller 가 받음)
    // eslint-disable-next-line no-console
    console.error("[storage] 운영자 알림 INSERT 실패 (무시):", err);
  }
}

/** relKey 에서 tenantId 추출 (`tenant-<id>/...` 패턴) — 알림 메타데이터용 */
function extractTenantId(relKey: string): number | undefined {
  const m = relKey.match(/^tenant-(\d+)\//);
  return m ? Number(m[1]) : undefined;
}

// ────────────────────────────────────────────────────────────────────────
// AWS S3 백엔드
// ────────────────────────────────────────────────────────────────────────

let _s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (_s3Client) return _s3Client;

  const region = process.env.AWS_S3_REGION?.trim() || "ap-northeast-2";
  const endpoint = process.env.AWS_S3_ENDPOINT?.trim();
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();

  _s3Client = new S3Client({
    region,
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    ...(accessKeyId && secretAccessKey
      ? { credentials: { accessKeyId, secretAccessKey } }
      : {}),
    // accessKey 미설정 시 SDK 가 IAM role / instance profile 자동 시도
  });
  return _s3Client;
}

function getS3Bucket(): string {
  const bucket = process.env.AWS_S3_BUCKET?.trim();
  if (!bucket) throw new Error("AWS_S3_BUCKET 미설정");
  return bucket;
}

async function s3Put(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType: string,
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  const bucket = getS3Bucket();
  const client = getS3Client();

  const body = typeof data === "string" ? Buffer.from(data, "utf-8") : data;

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );

  // URL 결정
  //   1. AWS_S3_PUBLIC_BASE_URL 설정 → CDN URL (영구)
  //   2. 미설정 → presigned URL (1h, 만료 가능)
  const cdnBase = process.env.AWS_S3_PUBLIC_BASE_URL?.trim();
  const url = cdnBase
    ? `${cdnBase.replace(/\/+$/, "")}/${key}`
    : await s3Presign(client, bucket, key);

  return { key, url };
}

async function s3Presign(
  client: S3Client,
  bucket: string,
  key: string,
  expiresIn = 3600,
): Promise<string> {
  return await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn },
  );
}

async function s3Get(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  const bucket = getS3Bucket();
  const client = getS3Client();
  const url = await s3Presign(client, bucket, key);
  return { key, url };
}

// ────────────────────────────────────────────────────────────────────────
// Forge proxy 백엔드 (레거시 — Manus WebDev 환경)
// ────────────────────────────────────────────────────────────────────────

function buildForgeUploadUrl(baseUrl: string, relKey: string): URL {
  const url = new URL("v1/storage/upload", ensureTrailingSlash(baseUrl));
  url.searchParams.set("path", normalizeKey(relKey));
  return url;
}

async function buildForgeDownloadUrl(
  baseUrl: string,
  relKey: string,
  apiKey: string,
): Promise<string> {
  const downloadApiUrl = new URL(
    "v1/storage/downloadUrl",
    ensureTrailingSlash(baseUrl),
  );
  downloadApiUrl.searchParams.set("path", normalizeKey(relKey));
  const response = await fetch(downloadApiUrl, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return (await response.json()).url;
}

async function forgePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType: string,
): Promise<{ key: string; url: string }> {
  const baseUrl = ENV.forgeApiUrl.replace(/\/+$/, "");
  const apiKey = ENV.forgeApiKey;
  const key = normalizeKey(relKey);

  const uploadUrl = buildForgeUploadUrl(baseUrl, key);
  const blob =
    typeof data === "string"
      ? new Blob([data], { type: contentType })
      : new Blob([data as any], { type: contentType });
  const form = new FormData();
  form.append("file", blob, key.split("/").pop() ?? key);

  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(
      `Storage upload failed (${response.status} ${response.statusText}): ${message}`,
    );
  }
  const url = (await response.json()).url;
  return { key, url };
}

async function forgeGet(relKey: string): Promise<{ key: string; url: string }> {
  const baseUrl = ENV.forgeApiUrl.replace(/\/+$/, "");
  const apiKey = ENV.forgeApiKey;
  const key = normalizeKey(relKey);
  return {
    key,
    url: await buildForgeDownloadUrl(baseUrl, key, apiKey),
  };
}

// ────────────────────────────────────────────────────────────────────────
// 공통 유틸
// ────────────────────────────────────────────────────────────────────────

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

// ────────────────────────────────────────────────────────────────────────
// Public API — 시그니처 기존과 동일 (호출자 변경 0)
// ────────────────────────────────────────────────────────────────────────

/**
 * 파일 업로드.
 *
 * @param relKey      저장 경로 (예: "tenant-2/health-certs/abc.pdf")
 * @param data        Buffer / Uint8Array / string
 * @param contentType MIME (기본: application/octet-stream)
 * @returns { key, url } — url 은 backend 따라:
 *           - S3 + AWS_S3_PUBLIC_BASE_URL: CDN URL (영구)
 *           - S3 (CDN 미설정): presigned URL (1h)
 *           - Forge: forge proxy URL
 */
export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const backend = detectBackend();

  switch (backend) {
    case "s3":
      return await s3Put(relKey, data, contentType);
    case "forge":
      return await forgePut(relKey, data, contentType);
    case "none": {
      // 운영자 알림 (best-effort, fire-and-forget) + 사용자 친화 에러
      const tenantId = extractTenantId(relKey);
      void notifyAdminsStorageMisconfigured(
        tenantId,
        `storagePut(${relKey.slice(0, 60)})`,
      );
      throw new StorageNotConfiguredError();
    }
  }
}

/**
 * 파일 다운로드 URL 발급.
 *
 * @param relKey 저장된 경로
 * @returns { key, url } — url 은 1시간 유효 (presigned 또는 forge proxy)
 */
export async function storageGet(
  relKey: string,
): Promise<{ key: string; url: string }> {
  const backend = detectBackend();

  switch (backend) {
    case "s3":
      return await s3Get(relKey);
    case "forge":
      return await forgeGet(relKey);
    case "none": {
      // 운영자 알림 (best-effort, fire-and-forget) + 사용자 친화 에러
      const tenantId = extractTenantId(relKey);
      void notifyAdminsStorageMisconfigured(
        tenantId,
        `storageGet(${relKey.slice(0, 60)})`,
      );
      throw new StorageNotConfiguredError();
    }
  }
}

/**
 * 진단용 — 현재 활성화된 backend 식별자 반환.
 *
 * 사용:
 *   GET /api/system/storage-status 등에서 표시 가능.
 */
export function getStorageBackendInfo(): {
  backend: StorageBackend;
  bucket?: string;
  region?: string;
  cdnBase?: string;
  forgeUrl?: string;
} {
  const backend = detectBackend();
  if (backend === "s3") {
    return {
      backend,
      bucket: process.env.AWS_S3_BUCKET?.trim(),
      region: process.env.AWS_S3_REGION?.trim() || "ap-northeast-2",
      cdnBase: process.env.AWS_S3_PUBLIC_BASE_URL?.trim() || undefined,
    };
  }
  if (backend === "forge") {
    return {
      backend,
      forgeUrl: ENV.forgeApiUrl,
    };
  }
  return { backend };
}

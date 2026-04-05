/**
 * 네이버 Object Storage 연결 (S3 호환 API)
 * 
 * 기존 @aws-sdk/client-s3 그대로 사용
 * endpoint만 네이버 Object Storage로 변경
 * 
 * 환경변수:
 *   NAVER_OS_ENDPOINT=https://kr.object.ncloudstorage.com
 *   NAVER_OS_REGION=kr-standard
 *   NAVER_OS_ACCESS_KEY=네이버클라우드_Access_Key
 *   NAVER_OS_SECRET_KEY=네이버클라우드_Secret_Key
 *   NAVER_OS_BUCKET=haccp-one-scans
 */
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const ENDPOINT = process.env.NAVER_OS_ENDPOINT || "https://kr.object.ncloudstorage.com";
const REGION = process.env.NAVER_OS_REGION || "kr-standard";
const ACCESS_KEY = process.env.NAVER_OS_ACCESS_KEY || "";
const SECRET_KEY = process.env.NAVER_OS_SECRET_KEY || "";
const BUCKET = process.env.NAVER_OS_BUCKET || "haccp-one-scans";

let s3Client: S3Client | null = null;

export function getS3Client(): S3Client {
  if (!s3Client) {
    if (!ACCESS_KEY || !SECRET_KEY) {
      console.warn("[Object Storage] NAVER_OS_ACCESS_KEY / SECRET_KEY 환경변수를 설정하세요.");
    }
    s3Client = new S3Client({
      endpoint: ENDPOINT,
      region: REGION,
      credentials: {
        accessKeyId: ACCESS_KEY,
        secretAccessKey: SECRET_KEY,
      },
      forcePathStyle: true, // 네이버 Object Storage 호환 필수
    });
  }
  return s3Client;
}

export function getBucket(): string {
  return BUCKET;
}

/**
 * 업로드용 Presigned URL 발급
 * - 브라우저에서 S3로 직접 업로드 (서버 디스크 사용 X)
 * - 7일 후 자동 만료 (lifecycle과 별도)
 */
export async function getUploadPresignedUrl(
  key: string,
  contentType: string,
  expiresIn: number = 600 // 10분
): Promise<{ uploadUrl: string; key: string; bucket: string }> {
  const client = getS3Client();
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn });
  return { uploadUrl, key, bucket: BUCKET };
}

/**
 * 다운로드용 Presigned URL 발급
 */
export async function getDownloadPresignedUrl(
  key: string,
  expiresIn: number = 3600 // 1시간
): Promise<string> {
  const client = getS3Client();
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return await getSignedUrl(client, command, { expiresIn });
}

/**
 * 파일 삭제 (OCR 처리 완료 후 호출)
 */
export async function deleteObject(key: string): Promise<void> {
  const client = getS3Client();
  await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

/**
 * 업로드 키 생성 (tenant/날짜/UUID 기반)
 */
export function generateUploadKey(tenantId: number, filename: string): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const uuid = crypto.randomUUID();
  const ext = filename.split(".").pop() || "pdf";
  return `scans/${tenantId}/${date}/${uuid}.${ext}`;
}

/**
 * ★ PR-AG (2026-05-23): 건강진단서 서버 프록시 다운로드
 *
 * 배경 (5번 PR 의 여정):
 *   PR-AB → PR-AF 의 검증으로 다음이 확정됨:
 *     • R2 storage 백엔드 정상 (PUT/GET 라이브 통과)
 *     • fileKey 형식 정상 (ASCII, 슬래시/prefix 정상)
 *     • presigned URL 발급 정상 (X-Amz-Signature 포함)
 *     • 서버측 GET → 200 OK, 정상 PDF 받음 (375KB)
 *     • 그러나 클라이언트의 새 창 navigate → R2 가 AccessDenied XML 반환
 *
 *   서버에서는 OK, 클라이언트에서는 403.
 *   같은 presigned URL, 다른 결과.
 *
 *   후보 원인 (브라우저 vs 서버 차이):
 *     A) R2 의 Referer/Origin/Sec-Fetch-Site 기반 차단 (브라우저만 차단)
 *     B) R2 bucket 의 CORS allowedOrigins 설정 누락 (브라우저만 차단)
 *     C) Cloudflare 도메인의 hotlink protection / Bot Fight Mode
 *     D) presigned URL 의 일부 헤더가 브라우저에서만 다르게 전송됨
 *
 *   원인이 무엇이든, **클라이언트가 R2 에 직접 접근하지 않는 방식** 으로
 *   우회하면 무조건 해결됨. 우리 서버는 이미 GET 으로 200 OK 를 받음을 확인.
 *
 * 동작:
 *   GET /api/health-cert/download/:certId
 *     1. JWT 인증 (requireTenantAuth)
 *     2. cert 소유권 검증 (내 tenant 의 직원 소속인지)
 *     3. fileKey 확보 (PR-AB 의 3단 fallback 동일)
 *     4. storageGet 으로 presigned URL 발급
 *     5. 서버에서 R2 로 GET fetch
 *     6. 응답을 Node Response 로 stream/pipe
 *
 * 보안:
 *   - tenant 격리 재검증 (이중 보장)
 *   - fileKey 의 raw 응답을 직접 노출하지 않음 (Content-Type 강제 설정)
 *   - 5xx 시 명시적 에러 JSON (XML 페이지 노출 방지)
 *
 * 비용:
 *   - egress 한 번 더 발생 (R2→서버, 서버→클라)
 *   - Cloudflare Pages 의 무료 tier 는 무제한 egress (Workers 가 아니라 Pages 임)
 *   - 평균 PDF 크기 ~500KB, 직원 한 명당 다운로드 빈도 낮음 → 무시 가능
 */

import { Router, Response } from "express";
import { getDb } from "../../db";
import { healthCertificates, hEmployees } from "../../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { storageGet, StorageNotConfiguredError } from "../../storage";
import {
  requireTenantAuth,
  TenantAuthRequest,
} from "../../_core/expressAuthMiddleware";

const healthCertDownloadProxyRouter = Router();

// 모든 라우트 인증 필수
healthCertDownloadProxyRouter.use(requireTenantAuth as any);

/**
 * GET /api/health-cert/download/:certId
 *
 * 서버가 R2 에서 PDF 를 받아서 클라이언트로 stream.
 * 클라이언트는 R2 와 직접 통신하지 않음.
 */
healthCertDownloadProxyRouter.get(
  "/download/:certId",
  async (req: TenantAuthRequest, res: Response) => {
    const startedAt = Date.now();
    const certIdRaw = req.params.certId;
    const certId = Number(certIdRaw);
    const tenantId = req.tenantUser!.tenantId;
    const userId = req.tenantUser!.id;

    if (!Number.isFinite(certId) || certId <= 0) {
      return res
        .status(400)
        .json({ error: "잘못된 cert id 입니다.", certId: certIdRaw });
    }

    try {
      const db = await getDb();
      if (!db) {
        return res
          .status(500)
          .json({ error: "데이터베이스에 연결할 수 없습니다." });
      }

      // 1) cert 조회 + tenant 소유권 검증 (raw select 로 조인 한 번에)
      const [cert] = await db
        .select({
          id: healthCertificates.id,
          employeeId: healthCertificates.employeeId,
          fileKey: healthCertificates.fileKey,
          fileUrl: healthCertificates.fileUrl,
          fileName: healthCertificates.fileName,
        })
        .from(healthCertificates)
        .where(eq(healthCertificates.id, certId));

      if (!cert) {
        return res
          .status(404)
          .json({ error: "건강진단서를 찾을 수 없습니다.", certId });
      }

      const [emp] = await db
        .select({ id: hEmployees.id, tenantId: hEmployees.tenantId })
        .from(hEmployees)
        .where(
          and(
            eq(hEmployees.id, cert.employeeId),
            eq(hEmployees.tenantId, tenantId)
          )
        );

      if (!emp) {
        console.warn(`[healthCertDownloadProxy] FORBIDDEN`, {
          certId,
          tenantId,
          userId,
          empOwnerCheck: "fail",
        });
        return res.status(403).json({
          error: "해당 건강진단서에 접근 권한이 없습니다.",
        });
      }

      // 2) fileKey 확보 (3단 fallback — PR-AB 와 동일)
      let fileKey: string | null = cert.fileKey ?? null;
      let keySource: "stored" | "legacy_extract" | "missing" = "missing";
      if (fileKey) {
        keySource = "stored";
      } else if (cert.fileUrl) {
        try {
          const url = new URL(cert.fileUrl.split("?")[0]);
          const path = url.pathname.replace(/^\/+/, "");
          const tenantMatch = path.match(/(tenant-\d+\/.*)/);
          if (tenantMatch) {
            fileKey = tenantMatch[1];
            keySource = "legacy_extract";
          }
        } catch {
          /* ignore */
        }
      }

      if (!fileKey) {
        return res.status(404).json({
          error: "첨부 파일을 찾을 수 없습니다.",
          certId,
          hint: "다시 업로드 후 시도하세요.",
        });
      }

      // 3) presigned URL 발급
      let presignedUrl: string;
      try {
        const result = await storageGet(fileKey);
        presignedUrl = result.url;
      } catch (err: any) {
        if (err instanceof StorageNotConfiguredError) {
          return res.status(500).json({
            error: "스토리지가 설정되지 않았습니다.",
          });
        }
        console.error(`[healthCertDownloadProxy] storageGet 실패`, {
          certId,
          tenantId,
          fileKey: fileKey.slice(0, 80),
          keySource,
          errorName: err?.name,
          errorMessage: err?.message?.slice(0, 200),
        });
        return res.status(500).json({
          error: "다운로드 URL 발급 실패",
          detail: err?.message?.slice(0, 100) ?? "unknown",
        });
      }

      // 4) 서버에서 R2 로 GET fetch (브라우저가 직접 접근하지 않음 = 핵심)
      let upstream: Response | any;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        upstream = await fetch(presignedUrl, {
          method: "GET",
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
      } catch (fetchErr: any) {
        console.error(`[healthCertDownloadProxy] R2 fetch 실패`, {
          certId,
          tenantId,
          errorName: fetchErr?.name,
          errorMessage: fetchErr?.message?.slice(0, 200),
        });
        return res.status(502).json({
          error: "스토리지 서버에 연결할 수 없습니다.",
          detail: `${fetchErr?.name}: ${fetchErr?.message?.slice(0, 100)}`,
        });
      }

      if (!upstream.ok) {
        // upstream 의 body 를 약간 읽어서 진단 로그
        let bodyHint: string | undefined;
        try {
          bodyHint = (await upstream.text()).slice(0, 200);
        } catch {
          /* ignore */
        }
        console.error(`[healthCertDownloadProxy] R2 응답 비정상`, {
          certId,
          tenantId,
          keySource,
          status: upstream.status,
          statusText: upstream.statusText,
          bodyHint,
        });
        return res.status(502).json({
          error: `스토리지에서 파일을 가져오지 못했습니다 (${upstream.status} ${upstream.statusText})`,
          certId,
          keySource,
        });
      }

      // 5) 응답 헤더 설정 + body stream
      // 안전한 다운로드 파일명 (Content-Disposition 의 RFC5987 인코딩)
      const safeName = cert.fileName ?? `health-cert-${certId}.pdf`;
      const asciiFallback = safeName
        .replace(/[^\x20-\x7e]/g, "_")
        .replace(/"/g, "");
      const utf8Encoded = encodeURIComponent(safeName);

      // Content-Type: upstream 이 application/pdf 면 그대로, 아니면 추정
      const upstreamCt = upstream.headers.get("content-type");
      const contentType =
        upstreamCt && /pdf|image|octet-stream/i.test(upstreamCt)
          ? upstreamCt
          : safeName.toLowerCase().endsWith(".pdf")
          ? "application/pdf"
          : safeName.toLowerCase().match(/\.(jpe?g|png|gif|webp)$/)
          ? `image/${safeName.toLowerCase().split(".").pop()?.replace("jpg", "jpeg")}`
          : "application/octet-stream";

      res.setHeader("Content-Type", contentType);
      // inline 으로 두면 브라우저가 PDF 를 새 창에서 직접 렌더 — 기존 UX 와 동일
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${asciiFallback}"; filename*=UTF-8''${utf8Encoded}`
      );
      const upstreamLen = upstream.headers.get("content-length");
      if (upstreamLen) {
        res.setHeader("Content-Length", upstreamLen);
      }
      // 캐시 — 다운로드 후 변경 가능성 있어 짧게
      res.setHeader("Cache-Control", "private, max-age=60");
      // 진단용 헤더 (운영 디버깅)
      res.setHeader("X-HCT-KeySource", keySource);
      res.setHeader("X-HCT-ProxyVersion", "PR-AG-2026-05-23");

      // body stream — Node 18+ 의 fetch 는 ReadableStream 반환
      if (!upstream.body) {
        return res
          .status(502)
          .json({ error: "스토리지 응답 본문이 비어있습니다." });
      }

      // ReadableStream → Node Response 로 변환
      // (Node 18+ 의 stream/web 으로 변환 + pipe)
      const { Readable } = await import("stream");
      const nodeStream = Readable.fromWeb(upstream.body as any);
      nodeStream.on("error", (streamErr: any) => {
        console.error(`[healthCertDownloadProxy] stream error`, {
          certId,
          tenantId,
          errorMessage: streamErr?.message?.slice(0, 200),
        });
        if (!res.headersSent) {
          res.status(500).json({ error: "스트리밍 중 오류" });
        } else {
          res.end();
        }
      });
      nodeStream.pipe(res);

      // 완료 로그
      res.on("finish", () => {
        const elapsed = Date.now() - startedAt;
        console.log(`[healthCertDownloadProxy] OK`, {
          certId,
          tenantId,
          keySource,
          contentType,
          bytes: upstreamLen,
          elapsedMs: elapsed,
        });
      });
    } catch (err: any) {
      console.error(`[healthCertDownloadProxy] 예외`, {
        certId,
        tenantId,
        errorName: err?.name,
        errorMessage: err?.message?.slice(0, 200),
        stack: err?.stack?.slice(0, 500),
      });
      if (!res.headersSent) {
        return res.status(500).json({
          error: "다운로드 처리 중 오류가 발생했습니다.",
          detail: err?.message?.slice(0, 100) ?? "unknown",
        });
      }
    }
  }
);

export default healthCertDownloadProxyRouter;

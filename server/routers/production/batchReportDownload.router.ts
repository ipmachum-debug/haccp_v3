/**
 * GET /api/batch-report/download/:batchId — 배치 완료 보고서 PDF (서버 경유, 2026-10-20)
 *   건강진단서 다운로드(healthCertDownloadProxy, PR-AG)와 같은 방식: 브라우저는 저장소에 직접 가지 않는다.
 *   로그인한 회사의 생산 건만. 실패하면 'Access Denied' XML 대신 이유와 돌아갈 곳을 한국어로 보여 준다.
 */
import { Router, Response } from "express";
import { requireTenantAuth, TenantAuthRequest } from "../../_core/expressAuthMiddleware";
import { getRawConnection } from "../../db";
import { fetchBatchReport } from "../../lib/production/batchReportFile";

const batchReportDownloadRouter = Router();
batchReportDownloadRouter.use(requireTenantAuth as any);

const page = (title: string, msg: string, batchId: number) =>
  `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;max-width:560px;margin:15vh auto;padding:0 16px;color:#222}a{color:#2563eb}</style></head>
<body><h1 style="font-size:20px">${title}</h1><p>${msg}</p><p><a href="/dashboard/batch/${batchId}">생산 건 화면으로 돌아가기</a></p></body></html>`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

batchReportDownloadRouter.get("/download/:batchId", async (req: TenantAuthRequest, res: Response) => {
  const batchId = Number(req.params.batchId);
  const tenantId = req.tenantUser!.tenantId;
  if (!Number.isFinite(batchId) || batchId <= 0) return res.status(400).type("html").send(page("잘못된 요청", "생산 건 번호가 올바르지 않습니다.", 0));
  try {
    const r = await fetchBatchReport(await getRawConnection(), tenantId, batchId);
    if (!r.ok) return res.status(r.status).type("html").send(page("보고서를 열 수 없습니다", esc(r.reason), batchId));
    res.setHeader("Content-Type", r.contentType);
    res.setHeader("Content-Disposition", `inline; filename="${r.fileName.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "")}"`);
    if (r.contentLength) res.setHeader("Content-Length", r.contentLength);
    res.setHeader("Cache-Control", "private, no-store");
    if (!r.body) return res.status(502).type("html").send(page("보고서를 열 수 없습니다", "저장소 응답이 비어 있습니다.", batchId));
    const { Readable } = await import("stream");
    const node = Readable.fromWeb(r.body as any);
    node.on("error", (e: any) => {
      console.error("[batchReportDownload] 전송 중 오류", { batchId, tenantId, message: String(e?.message ?? "").slice(0, 200) });
      if (!res.headersSent) res.status(500).end(); else res.destroy();
    });
    node.pipe(res);
  } catch (e: any) {
    console.error("[batchReportDownload] 실패", { batchId, tenantId, message: String(e?.message ?? "").slice(0, 200) });
    if (!res.headersSent) res.status(500).type("html").send(page("보고서를 열 수 없습니다", "서버 오류 — 잠시 뒤 다시 시도하거나 [보고서 다시 만들기]를 쓰세요.", batchId));
  }
});

export default batchReportDownloadRouter;

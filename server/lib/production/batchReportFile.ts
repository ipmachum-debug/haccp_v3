/**
 * 배치 완료 보고서 파일 — 서버가 저장소에서 받아 브라우저로 넘긴다 (2026-10-20, 신규 회사 시험 #622 재검증).
 *
 * 같은 서명 주소가 서버에서는 200, 브라우저 새 창에서는 AccessDenied (건강진단서와 같은 증상 — PR-AG 에서 같은 방식으로 해결).
 * 그래서 브라우저가 저장소에 직접 가지 않는다: /api/batch-report/download/:batchId 가 이 함수로 파일을 받아 그대로 내려준다.
 * 저장소는 비공개 그대로, 권한을 넓히지 않는다. 이 회사의 생산 건·이 회사 경로의 파일만.
 */
import { reportKeyFromUrl, storageGet } from "../../storage";

export type ReportFetch =
  | { ok: true; body: ReadableStream<Uint8Array> | null; contentType: string; contentLength: string | null; fileName: string }
  | { ok: false; status: number; reason: string };

export async function fetchBatchReport(conn: any, tenantId: number, batchId: number, timeoutMs = 30000): Promise<ReportFetch> {
  const [rows]: any = await conn.execute(`SELECT batch_code, completion_report_url AS u FROM h_batches WHERE id = ? AND tenant_id = ? LIMIT 1`, [batchId, tenantId]);
  const b = (rows as any[])[0];
  if (!b) return { ok: false, status: 404, reason: "생산 건을 찾을 수 없습니다." };
  const key = reportKeyFromUrl(b.u ?? null, tenantId);
  if (!key) return { ok: false, status: 404, reason: "완료 보고서가 아직 없습니다 — [보고서 다시 만들기]로 만드세요." };
  const { url } = await storageGet(key);
  let res: Response;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    res = await fetch(url, { method: "GET", signal: controller.signal });
    clearTimeout(t);
  } catch (e: any) {
    return { ok: false, status: 502, reason: `저장소에 연결하지 못했습니다 (${e?.name ?? "error"})` };
  }
  if (!res.ok) {
    try { await res.arrayBuffer(); } catch { /* 연결 정리만 */ }
    // 진단은 서버 로그에만 — 파일 위치·상태 (서명 값 없음)
    console.error("[batchReportDownload] 저장소 응답 비정상", { batchId, tenantId, key: key.slice(0, 120), status: res.status });
    return { ok: false, status: 502, reason: `저장된 보고서 파일을 가져오지 못했습니다 (${res.status}) — [보고서 다시 만들기]로 새로 만드세요.` };
  }
  return { ok: true, body: res.body, contentType: "application/pdf", contentLength: res.headers.get("content-length"), fileName: `batch-completion-report-${String(b.batch_code)}.pdf` };
}

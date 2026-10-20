/**
 * 배치 완료 보고서 PDF (2026-10-20 고침 — 신규 회사 시험: 한글 깨짐 · 점검 0건 · LOT N/A · 하단 잘림)
 *
 * 읽기만 한다 — 원본 기록·승인 스냅샷은 바꾸지 않는다. 회사 조건을 모든 조회에 건다.
 *   CCP  : 공식 기록지(h_ccp_form_records) — 가열 기록지는 이 생산 건의 행, 금속검출(일일 통합)은 이 생산 건 행만. 무효 기록지 제외.
 *          (이전: 옛 hCcpRecords 를 읽어 실제 승인된 기록지가 있어도 '점검 0건')
 *   원료 : 실제 출고 거래(h_inventory_transactions usage·return, reference=batch)의 LOT 별 순사용량 (이전: input.lotId 만 읽어 'N/A')
 *   제품 : 이 생산 건의 완제품 LOT (h_inventory_lots.batch_id)
 * 글꼴: 나눔고딕 (다른 서류 PDF 와 같은 방식). 없으면 만들지 않고 이유와 함께 실패 (깨진 글자로 만들지 않음).
 */
import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";
import { storagePut } from "../storage";
import { getRawConnection } from "../db/connection";

// esbuild ESM 번들 호환 — __dirname 미사용 (trainingReportPdf 와 같은 경로 후보)
function findFontPath(fontName: string): string | null {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, "fonts", fontName),
    path.join(cwd, "..", "fonts", fontName),
    path.join(cwd, "..", "..", "fonts", fontName),
    path.join(cwd, "..", "..", "..", "fonts", fontName),
    `/root/haccp_v3/fonts/${fontName}`,
    `/home/root/haccp_v3/fonts/${fontName}`,
    `/var/www/haccp_v3/fonts/${fontName}`,
    `/home/user/haccp_v3/fonts/${fontName}`,
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch { /* 다음 후보 */ }
  }
  return null;
}

const CCP_NAME: Record<string, string> = { "CCP-1B": "가열(증숙·교반)", "CCP-2B": "가열(굽기)", "CCP-3B": "가열(볶음)", "CCP-4P": "금속검출" };
const STATUS_NAME: Record<string, string> = { draft: "작성 중", submitted: "제출", approved: "승인", rejected: "반려" };
const kst = (d: Date | string | null | undefined) => (d ? new Date(d).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "-");
const fmtQty = (v: unknown) => (v == null || v === "" ? "-" : Number(v).toLocaleString("ko-KR", { maximumFractionDigits: 3 }));

export interface BatchReportData {
  batch: { batchCode: string; productName: string | null; plannedQuantity: unknown; actualQuantity: unknown; plannedDate: string | null; completedAt: unknown; mode: string | null; status: string };
  ccp: Array<{ ccpType: string; processName: string | null; status: string; rows: number; confirmedRows: number; deviations: number }>;
  materials: Array<{ materialName: string; lotNumber: string | null; qty: number; unit: string }>;
  productLots: Array<{ lotNumber: string; quantity: unknown; unit: string | null; expiryDate: string | null }>;
}

/** 보고서에 넣을 자료 — 이 회사의 이 생산 건만 (읽기만) */
export async function loadBatchReportData(batchId: number, tenantId: number, conn?: any): Promise<BatchReportData> {
  const c = conn ?? (await getRawConnection());
  const [[b]]: any = await c.execute(
    `SELECT b.batch_code, b.planned_quantity, b.actual_quantity, DATE_FORMAT(b.planned_date, '%Y-%m-%d') AS pd, b.completed_at, b.mode, b.status,
            p.product_name
       FROM h_batches b LEFT JOIN h_products_v2 p ON p.id = b.product_id AND p.tenant_id = b.tenant_id
      WHERE b.id = ? AND b.tenant_id = ? LIMIT 1`,
    [batchId, tenantId],
  );
  if (!b) throw new Error(`생산 건 ${batchId} 을(를) 찾을 수 없습니다`);
  const [ccpRows]: any = await c.query(
    `SELECT f.id, f.ccp_type, f.process_group_name, f.status,
            SUM(CASE WHEN f.ccp_type <> 'CCP-4P' OR r.batch_id = ? THEN 1 ELSE 0 END) AS n_rows,
            SUM(CASE WHEN (f.ccp_type <> 'CCP-4P' OR r.batch_id = ?) AND r.row_confirmed_at IS NOT NULL AND r.row_confirmed_version = r.row_version THEN 1 ELSE 0 END) AS n_ok,
            SUM(CASE WHEN (f.ccp_type <> 'CCP-4P' OR r.batch_id = ?) AND r.is_deviation = 1 THEN 1 ELSE 0 END) AS n_dev
       FROM h_ccp_form_records f
       LEFT JOIN h_ccp_form_rows r ON r.form_record_id = f.id AND r.tenant_id = f.tenant_id
      WHERE f.tenant_id = ? AND f.voided_at IS NULL
        AND (f.batch_id = ? OR (f.ccp_type = 'CCP-4P' AND EXISTS (SELECT 1 FROM h_ccp_form_rows r2 WHERE r2.form_record_id = f.id AND r2.tenant_id = f.tenant_id AND r2.batch_id = ?)))
      GROUP BY f.id, f.ccp_type, f.process_group_name, f.status
      ORDER BY f.ccp_type = 'CCP-4P', f.id`,
    [batchId, batchId, batchId, tenantId, batchId, batchId],
  );
  // 원료 — 실제 출고(usage) − 반환(return) 을 LOT 별로
  const [matRows]: any = await c.execute(
    `SELECT t.lot_id, l.lot_number, COALESCE(m.material_name, CONCAT('원료 #', t.material_id)) AS material_name, t.unit,
            SUM(CASE WHEN t.transaction_type = 'usage' THEN ABS(t.quantity) WHEN t.transaction_type = 'return' THEN -ABS(t.quantity) ELSE 0 END) AS qty
       FROM h_inventory_transactions t
       LEFT JOIN h_inventory_lots l ON l.id = t.lot_id AND l.tenant_id = t.tenant_id
       LEFT JOIN h_materials m ON m.id = t.material_id AND m.tenant_id = t.tenant_id
      WHERE t.tenant_id = ? AND t.reference_type = 'batch' AND t.reference_id = ? AND t.transaction_type IN ('usage', 'return') AND t.material_id IS NOT NULL
      GROUP BY t.material_id, t.lot_id, l.lot_number, m.material_name, t.unit
      HAVING ABS(qty) > 0.0005
      ORDER BY material_name, l.lot_number`,
    [tenantId, batchId],
  );
  const [lotRows]: any = await c.execute(
    `SELECT lot_number, quantity, unit, DATE_FORMAT(expiry_date, '%Y-%m-%d') AS exp FROM h_inventory_lots
      WHERE tenant_id = ? AND batch_id = ? AND product_id IS NOT NULL ORDER BY id`,
    [tenantId, batchId],
  );
  return {
    batch: { batchCode: String(b.batch_code), productName: b.product_name ?? null, plannedQuantity: b.planned_quantity, actualQuantity: b.actual_quantity, plannedDate: b.pd ?? null, completedAt: b.completed_at, mode: b.mode ?? null, status: String(b.status) },
    ccp: (ccpRows as any[]).map((r) => ({ ccpType: String(r.ccp_type), processName: r.process_group_name ?? null, status: String(r.status), rows: Number(r.n_rows ?? 0), confirmedRows: Number(r.n_ok ?? 0), deviations: Number(r.n_dev ?? 0) })),
    materials: (matRows as any[]).map((r) => ({ materialName: String(r.material_name), lotNumber: r.lot_number ?? null, qty: Number(r.qty), unit: String(r.unit ?? "") })),
    productLots: (lotRows as any[]).map((r) => ({ lotNumber: String(r.lot_number), quantity: r.quantity, unit: r.unit ?? null, expiryDate: r.exp ?? null })),
  };
}

/** PDF 만들기 (순수 — 저장하지 않음) */
export async function renderBatchReportPdf(d: BatchReportData): Promise<Buffer> {
  const regular = findFontPath("NanumGothic-Regular.ttf");
  const bold = findFontPath("NanumGothic-Bold.ttf");
  if (!regular || !bold) throw new Error("한글 폰트 파일 없음 (NanumGothic-Regular.ttf / NanumGothic-Bold.ttf) — 서버의 fonts/ 폴더를 확인하세요.");
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 50 });
      const chunks: Buffer[] = [];
      doc.on("data", (x) => chunks.push(x));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
      doc.registerFont("R", regular);
      doc.registerFont("B", bold);
      const W = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const section = (t: string) => { if (doc.y > 720) doc.addPage(); doc.moveDown(0.6).font("B").fontSize(12).text(t, { width: W }); doc.moveDown(0.2).font("R").fontSize(10); };
      const line = (t: string) => { if (doc.y > 760) doc.addPage(); doc.text(t, { width: W }); };

      doc.font("B").fontSize(18).text("배치 완료 보고서", { align: "center", width: W });
      doc.moveDown(0.8);
      const b = d.batch;
      section("생산 건");
      line(`생산 건 번호: ${b.batchCode}`);
      line(`제품: ${b.productName ?? "-"}`);
      line(`생산일: ${b.plannedDate ?? "-"}   ·   완료: ${kst(b.completedAt as any)}`);
      line(`계획 수량: ${fmtQty(b.plannedQuantity)} kg   ·   실제 수량: ${fmtQty(b.actualQuantity)} kg`);
      const yieldRate = Number(b.plannedQuantity) > 0 && b.actualQuantity != null ? `${((Number(b.actualQuantity) / Number(b.plannedQuantity)) * 100).toFixed(1)}%` : "-";
      line(`수율(실제/계획): ${yieldRate}   ·   처리 방식: ${b.mode === "manual" ? "수동" : "자동"}`);

      section("CCP 기록지 (공식 기록지 기준)");
      if (!d.ccp.length) line("이 생산 건의 CCP 기록지가 없습니다.");
      for (const r of d.ccp) {
        const name = `${CCP_NAME[r.ccpType] ?? r.ccpType}${r.processName ? ` · ${r.processName}` : ""}`;
        line(`- ${name}: ${STATUS_NAME[r.status] ?? r.status} · 기록 ${r.rows}행 (현장 확인 ${r.confirmedRows}행)${r.deviations ? ` · 이탈 ${r.deviations}행` : " · 이탈 없음"}`);
      }

      section("원료 투입 (실제 출고 LOT)");
      if (!d.materials.length) line("이 생산 건으로 출고된 원료가 없습니다.");
      for (const m of d.materials) line(`- ${m.materialName}  ·  LOT ${m.lotNumber ?? "-"}  ·  ${fmtQty(m.qty)} ${m.unit}`);

      section("완제품 LOT");
      if (!d.productLots.length) line("이 생산 건의 완제품 LOT 이 없습니다.");
      for (const l of d.productLots) line(`- ${l.lotNumber}  ·  ${fmtQty(l.quantity)} ${l.unit ?? ""}${l.expiryDate ? `  ·  소비기한 ${l.expiryDate}` : ""}`);

      // 생성 시각 — 본문 폭 안에서 오른쪽 정렬 (이전: 폭 지정 없이 오른쪽 끝에서 잘림)
      doc.moveDown(1.2).font("R").fontSize(8).fillColor("#555").text(`보고서 생성: ${kst(new Date())}`, { width: W, align: "right" });
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * 보고서를 만들어 회사 폴더에 올리고 저장 주소를 돌려준다 — 위치를 DB 에 쓰는 일은 호출측 (검증 뒤에만, batch.regenerateCompletionReport).
 */
export async function generateBatchCompletionReport(batchId: number, tenantId?: number): Promise<string> {
  if (!tenantId) throw new Error("회사 정보 없이 보고서를 만들지 않습니다");
  const data = await loadBatchReportData(batchId, tenantId);
  const pdf = await renderBatchReportPdf(data);
  const fileName = `batch-completion-report-${data.batch.batchCode}-${Date.now()}.pdf`;
  const { url } = await storagePut(`tenant-${tenantId}/reports/${fileName}`, pdf, "application/pdf");
  return url;
}

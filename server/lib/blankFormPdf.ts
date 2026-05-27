/**
 * ★ PR-AS-blank (2026-05-28): CCP 빈 양식지 PDF 생성기
 *
 * 목적:
 *   사용자가 시스템에서 빈 CCP 양식지를 다운받아 인쇄 → 현장에서 수기 기입 →
 *   다시 스캔 업로드. OCR 가 양식 레이아웃 인지하여 정확히 추출.
 *
 * 양식 종류:
 *   - CCP-1B: 가열(증숙) — 떡류
 *   - CCP-2B: 가열(굽기) — 견과류
 *   - CCP-3B: CCP-2B 와 동일 양식 사용
 *   - CCP-4P: 금속검출
 *
 * 디자인 원칙:
 *   - 실제 현장 양식의 표준 레이아웃 준수 (제목, 한계기준 표, 측정 데이터 표,
 *     개선조치, 작성/검토/승인 칸)
 *   - A4 portrait, 한글 폰트 NanumGothic
 *   - 측정 행은 충분히 (10행) 비워두기 — 사용자가 채워 쓰는 공간
 *   - 하단에 OCR 안내문 ("이 양식을 스캔하면 자동 입력됩니다")
 */
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

// 한글 폰트 경로 (transactionStatementPDF 와 동일 패턴)
function findFontPath(fontName: string): string | null {
  const cwd = process.cwd();
  const paths = [
    path.join(cwd, "fonts", fontName),
    path.join(cwd, "..", "fonts", fontName),
    path.join(cwd, "..", "..", "fonts", fontName),
    `/root/haccp_v3/fonts/${fontName}`,
    `/home/root/haccp_v3/fonts/${fontName}`,
    `/var/www/haccp_v3/fonts/${fontName}`,
    `/home/user/haccp_v3/fonts/${fontName}`,
  ];
  for (const p of paths) {
    try { if (fs.existsSync(p)) return p; } catch (_) { /* ignore */ }
  }
  return null;
}

export type BlankFormCcpType = "ccp_1b" | "ccp_2b" | "ccp_3b" | "ccp_4p";

interface CcpFormSpec {
  title: string;
  subtitle: string;
  description?: string;
  limitsHeader: string[];        // 한계기준 표 컬럼
  limitsRows: string[][];        // 한계기준 표 행
  monitoringNote: string;        // 주기/모니터링 방법 텍스트
  dataTableHeader: string[];     // 측정 데이터 표 컬럼
  dataTableRowHeight: number;    // 행 높이
  correctiveNote: string;        // 개선조치 방법 텍스트
}

const FORM_SPECS: Record<BlankFormCcpType, CcpFormSpec> = {
  ccp_1b: {
    title: "중요관리점(CCP-1B) 모니터링일지",
    subtitle: "[가열(증숙)공정]",
    limitsHeader: ["품목", "가열시간", "압력", "품온"],
    limitsRows: [
      ["참쌀떡류(교반기1호기)", "10분이상~15분이하", "0.16Mpa이상", "90.0℃이상"],
      ["참쌀떡류(교반기2호기)", "10분이상~15분이하", "0.12Mpa이상", "90.0℃이상"],
      ["전통떡류", "10분이상~15분이하", "0.28Mpa이상", "90.0℃이상"],
      ["약식", "35분이상~40분이하", "0.28Mpa이상", "90.0℃이상"],
    ],
    monitoringNote: "매 작업시마다, 같은품목 작업시 2시간마다, 품목 바뀔때마다",
    dataTableHeader: ["품명", "측정시각", "교반기", "가열시간", "압력(Mpa)", "투입량(kg)", "모서리(℃)", "중심부(℃)", "판정"],
    dataTableRowHeight: 22,
    correctiveNote:
      "○ 가열온도 또는 가열시간 미달 시\n" +
      "  - 모니터링 담당자는 한계기준 이탈시 즉시 작업을 중지한다.\n" +
      "  - 가열온도와 가열시간을 재조정한 후 미달된 제품에 대해 재가열을 실시하고,\n" +
      "    제품검사(관능)를 실시하여 이상이 없는 경우 다음 공정을 진행한다.\n" +
      "  - 한계기준 이탈내용과 개선조치 내용을 모니터링 일지에 기록한다.\n" +
      "○ 기계고장 시\n" +
      "  - 수리 후 정상적으로 작동 시 재가동한다.",
  },
  ccp_2b: {
    title: "중요관리점(CCP-2B) 모니터링일지",
    subtitle: "[가열(굽기)공정]",
    limitsHeader: ["품목", "가열시간", "온도"],
    limitsRows: [
      ["마카다미아", "10분이상~15분이하", "150℃이상"],
      ["호두", "10분이상~15분이하", "150℃이상"],
      ["땅콩", "10분이상~15분이하", "150℃이상"],
      ["기타 견과류", "10분이상~15분이하", "150℃이상"],
    ],
    monitoringNote: "매 작업시마다, 같은품목 작업시 2시간마다, 품목 바뀔때마다",
    dataTableHeader: ["품명", "측정시각", "가열시간(분)", "가열온도(℃)", "투입량(kg)", "판정"],
    dataTableRowHeight: 22,
    correctiveNote:
      "○ 가열온도 또는 가열시간 미달 시 즉시 작업을 중지하고 재가열을 실시.\n" +
      "○ 한계기준 이탈내용과 개선조치 내용을 모니터링 일지에 기록한다.",
  },
  ccp_3b: {
    title: "중요관리점(CCP-3B) 모니터링일지",
    subtitle: "[가열공정]",
    limitsHeader: ["품목", "가열시간", "온도"],
    limitsRows: [
      ["대상 품목", "기준 시간", "기준 온도"],
    ],
    monitoringNote: "매 작업시마다, 같은품목 작업시 2시간마다, 품목 바뀔때마다",
    dataTableHeader: ["품명", "측정시각", "가열시간(분)", "가열온도(℃)", "투입량(kg)", "판정"],
    dataTableRowHeight: 22,
    correctiveNote:
      "○ 가열온도 또는 가열시간 미달 시 즉시 작업을 중지하고 재가열을 실시.",
  },
  ccp_4p: {
    title: "중요관리점(CCP-4P) 모니터링일지",
    subtitle: "[금속검출공정]",
    limitsHeader: ["감도설정", "Fe", "SUS"],
    limitsRows: [
      ["130", "Fe 2.0mmΦ 이상 불검출", "SUS 3.0mmΦ 이상 불검출"],
    ],
    monitoringNote: "매 작업시마다 시편 통과 확인. 시편 미감지 시 즉시 작업 중단.",
    dataTableHeader: ["품명", "측정시각", "감도", "Fe시편", "SUS시편", "제품만", "Fe+제품", "SUS+제품", "통과량", "검출량", "판정"],
    dataTableRowHeight: 22,
    correctiveNote:
      "○ 시편 미감지 시 즉시 작업 중지 후 감도 재조정.\n" +
      "○ 제품 검출 시 해당 제품 격리, 원인 조사, 재검사 실시.",
  },
};

/**
 * 빈 양식지 PDF 생성. Buffer 반환 (다운로드용 stream).
 */
export async function generateBlankFormPdf(ccpType: BlankFormCcpType): Promise<Buffer> {
  const spec = FORM_SPECS[ccpType];
  if (!spec) throw new Error(`알 수 없는 양식 타입: ${ccpType}`);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margin: 36,
        info: { Title: spec.title, Author: "Millio AI" },
      });
      const chunks: Buffer[] = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // 한글 폰트 등록
      const regular = findFontPath("NanumGothic-Regular.ttf");
      const bold = findFontPath("NanumGothic-Bold.ttf");
      if (!regular || !bold) {
        return reject(new Error(`한글 폰트 없음. cwd=${process.cwd()}`));
      }
      doc.registerFont("NG", regular);
      doc.registerFont("NGB", bold);

      // ─── 레이아웃 상수 ───
      const pageMargin = 36;
      const contentWidth = 595 - pageMargin * 2;  // A4 = 595pt
      const leftX = pageMargin;
      const rightX = pageMargin + contentWidth;
      let y = pageMargin;

      // ─── 헤더: 제목 + 작성/검토/승인 박스 ───
      const headerH = 50;
      const approvalBoxW = 120;
      const titleBoxW = contentWidth - approvalBoxW;

      // 제목 박스 (좌측)
      doc.rect(leftX, y, titleBoxW, headerH).lineWidth(0.8).strokeColor("#000").stroke();
      doc.fillColor("#000").font("NGB").fontSize(14)
        .text(spec.title, leftX + 6, y + 10, { width: titleBoxW - 12, align: "center" });
      doc.font("NG").fontSize(11)
        .text(spec.subtitle, leftX + 6, y + 30, { width: titleBoxW - 12, align: "center" });

      // 작성/검토/승인 박스 (우측, 3분할)
      const approvalX = leftX + titleBoxW;
      doc.rect(approvalX, y, approvalBoxW, headerH).lineWidth(0.8).stroke();
      const cellW = approvalBoxW / 3;
      ["작성", "검토", "승인"].forEach((label, i) => {
        const cx = approvalX + cellW * i;
        if (i > 0) doc.moveTo(cx, y).lineTo(cx, y + headerH).lineWidth(0.5).stroke();
        // 상단 라벨
        doc.font("NGB").fontSize(8).text(label, cx, y + 3, { width: cellW, align: "center" });
        // 라벨 아래 구분선
        doc.moveTo(cx, y + 14).lineTo(cx + cellW, y + 14).lineWidth(0.3).stroke();
      });
      y += headerH;

      // ─── 작성일자 + 작성자 ───
      const dateLineH = 22;
      doc.rect(leftX, y, contentWidth, dateLineH).lineWidth(0.8).stroke();
      doc.font("NGB").fontSize(10).text("작성일자 :", leftX + 8, y + 6, { continued: false });
      // 빈 칸 (사용자가 손글씨)
      doc.font("NG").fontSize(10).text("       년     월     일", leftX + 70, y + 6);
      y += dateLineH;

      // ─── 한계기준 표 ───
      const limitsHeaderH = 22;
      const limitsRowH = 20;

      // 한계기준 라벨 (좌측)
      const labelW = 70;
      const valueW = contentWidth - labelW;
      const limitsTableH = limitsHeaderH + spec.limitsRows.length * limitsRowH;
      doc.rect(leftX, y, labelW, limitsTableH).lineWidth(0.8).stroke();
      doc.font("NGB").fontSize(10).text("한계기준", leftX, y + limitsTableH / 2 - 6, {
        width: labelW, align: "center",
      });

      // 한계기준 표 (우측)
      const limitsX = leftX + labelW;
      doc.rect(limitsX, y, valueW, limitsTableH).lineWidth(0.8).stroke();

      // 헤더 행
      const colWs = spec.limitsHeader.map(() => valueW / spec.limitsHeader.length);
      let cx = limitsX;
      doc.rect(limitsX, y, valueW, limitsHeaderH).fillAndStroke("#F0F0F0", "#000")
        .lineWidth(0.5).strokeColor("#000");
      doc.fillColor("#000").font("NGB").fontSize(9);
      spec.limitsHeader.forEach((col, i) => {
        doc.text(col, cx + 4, y + 7, { width: colWs[i] - 8, align: "center" });
        if (i > 0) doc.moveTo(cx, y).lineTo(cx, y + limitsTableH).lineWidth(0.3).stroke();
        cx += colWs[i];
      });
      // 본문 행
      doc.font("NG").fontSize(9);
      spec.limitsRows.forEach((row, ri) => {
        const ry = y + limitsHeaderH + ri * limitsRowH;
        doc.moveTo(limitsX, ry).lineTo(limitsX + valueW, ry).lineWidth(0.3).stroke();
        cx = limitsX;
        row.forEach((cell, ci) => {
          doc.text(cell, cx + 4, ry + 6, { width: colWs[ci] - 8, align: "center" });
          cx += colWs[ci];
        });
      });
      y += limitsTableH;

      // ─── 주기 / 모니터링 방법 ───
      const noteH = 26;
      doc.rect(leftX, y, contentWidth, noteH).lineWidth(0.8).stroke();
      doc.font("NGB").fontSize(9).text("주 기", leftX + 8, y + 4);
      doc.font("NG").fontSize(9).text(spec.monitoringNote, leftX + 8, y + 14, { width: contentWidth - 16 });
      y += noteH;

      // ─── 측정 데이터 표 (헤더 + 빈 10행) ───
      const tableHeaderH = 26;
      const dataRowCount = 10;
      const dataTableH = tableHeaderH + dataRowCount * spec.dataTableRowHeight;

      const dataColCount = spec.dataTableHeader.length;
      const dataColW = contentWidth / dataColCount;

      // 헤더 배경
      doc.rect(leftX, y, contentWidth, tableHeaderH).fillAndStroke("#E5E5E5", "#000")
        .lineWidth(0.5);
      doc.fillColor("#000").font("NGB").fontSize(8);
      cx = leftX;
      spec.dataTableHeader.forEach((col, i) => {
        doc.text(col, cx + 2, y + 9, { width: dataColW - 4, align: "center" });
        if (i > 0) doc.moveTo(cx, y).lineTo(cx, y + dataTableH).lineWidth(0.3).stroke();
        cx += dataColW;
      });
      // 외곽선
      doc.rect(leftX, y, contentWidth, dataTableH).lineWidth(0.8).stroke();
      // 행 구분선
      for (let r = 1; r <= dataRowCount; r++) {
        const ry = y + tableHeaderH + r * spec.dataTableRowHeight - spec.dataTableRowHeight;
        doc.moveTo(leftX, ry).lineTo(leftX + contentWidth, ry).lineWidth(0.3).stroke();
      }
      y += dataTableH;

      // ─── 개선조치 방법 ───
      doc.moveDown(0.3);
      const correctiveStartY = doc.y;
      doc.font("NGB").fontSize(10).text("개선조치 방법", leftX, correctiveStartY);
      doc.font("NG").fontSize(8).fillColor("#444")
        .text(spec.correctiveNote, leftX, doc.y + 2, { width: contentWidth, lineGap: 2 });

      // ─── 하단: 이탈/조치 기록란 ───
      doc.moveDown(1);
      const footerY = doc.y;
      const footerH = 70;
      doc.fillColor("#000");
      doc.rect(leftX, footerY, contentWidth, footerH).lineWidth(0.8).stroke();
      const footerColW = contentWidth / 4;
      ["한계기준 이탈내용", "개선조치 및 결과", "조치자", "확인"].forEach((label, i) => {
        const fx = leftX + footerColW * i;
        if (i > 0) doc.moveTo(fx, footerY).lineTo(fx, footerY + footerH).lineWidth(0.5).stroke();
        doc.rect(fx, footerY, footerColW, 18).fillAndStroke("#F0F0F0", "#000").lineWidth(0.3);
        doc.fillColor("#000").font("NGB").fontSize(8)
          .text(label, fx + 2, footerY + 6, { width: footerColW - 4, align: "center" });
      });

      // ─── 푸터 안내 ───
      doc.fillColor("#888").font("NG").fontSize(7).text(
        "※ 이 양식지를 작성 후 millioai.com 에서 스캔 업로드하면 AI 가 자동 인식하여 시스템에 입력합니다.",
        leftX, 800, { width: contentWidth, align: "center" },
      );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

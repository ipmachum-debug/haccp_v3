/**
 * ★ PR-AS-blank2 (2026-05-28): CCP 빈 양식지 PDF 생성기 — 실제 양식 구조 재현
 *
 * 목적:
 *   사용자가 시스템에서 빈 CCP 양식지를 다운받아 인쇄 → 현장 수기 기입 →
 *   스캔 업로드. OCR 가 양식 레이아웃 인지하여 정확히 추출.
 *
 * 레이아웃 (실제 현장 양식 기준):
 *   ┌────────────────────────────────┬──────────┐
 *   │  중요관리점(CCP-1B) 모니터링일지       │ 작성|검토|승인 │
 *   ├────────────────────────────────┴──────────┤
 *   │ 작성일자: 년 월 일                                │
 *   ├──────┬──────────────────────────────────────┤
 *   │ 한계  │ 품목 | 가열시간 | 압력 | 품온                │
 *   │ 기준  │ ── 한계기준 데이터 행 N개 ──                 │
 *   ├──────┼──────────────────────────────────────┤
 *   │ 주 기  │ 매 작업시마다, ...                          │
 *   ├──────┼──────────────────────────────────────┤
 *   │ 모니터링│ ○ 가열시간 : ...                           │
 *   │ 방 법 │ ○ 압력확인 : ...                           │
 *   ├──────┴──────────────────────────────────────┤
 *   │ 품명|측정시각|교반기|가열시간|압력|투입량|가열후품온|판정 │
 *   │                                |모서리|중심부|        │
 *   │ ── 빈 측정 데이터 행 10개 ──                          │
 *   ├──────┬──────────────────────────────────────┤
 *   │ 개선  │ ○ 가열온도 또는 가열시간 미달 시              │
 *   │ 조치  │  - 모니터링 담당자는 ...                     │
 *   │ 방 법 │                                            │
 *   ├──────┴──────┬──────┬──────┬──────────────────┤
 *   │ 한계기준이탈내용 | 개선조치및결과 | 조치자 | 확인        │
 *   │ ── 빈 행 ──                                          │
 *   └────────────────────────────────────────────────────┘
 */
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

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
  /** 한계기준 표 헤더 컬럼 */
  limitsHeader: string[];
  /** 한계기준 표 데이터 행 */
  limitsRows: string[][];
  /** 주기 텍스트 */
  cycleNote: string;
  /** 모니터링 방법 (불릿 라인) */
  monitoringMethod: string[];
  /**
   * 측정 데이터 표 컬럼 정의.
   *   - parentLabel : 그룹 헤더 (없으면 self 헤더만 사용)
   *   - label       : 컬럼 헤더
   *   - widthRatio  : 컬럼 너비 비율 (합계 = 1)
   */
  dataColumns: Array<{ parentLabel?: string; label: string; widthRatio: number }>;
  /** 개선조치 방법 (불릿 라인) */
  correctiveMethod: string[];
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
    cycleNote: "매 작업시마다, 같은품목 작업시 2시간마다, 품목 바뀔때마다",
    monitoringMethod: [
      "○ 가열시간 : 모니터링 담당자는 검교정된 타이머를 이용하여 시간을 확인일지에 기록",
      "○ 품명 및 해당 품목 가열(증숙) 압력확인 - 압력계 수치 확인",
      "○ 품명 및 해당 품목 가열(증숙) 시간확인 - 가열(증숙)시간을 타이머로 설정(setting)",
      "○ 시루 최대 적재단수 3단이며 제일 윗단 시루에 스팀이 올라오는 것 확인후 타이머 (세팅된 가열(증숙)시간) 작동",
      "※ 품온 측정 : 스팀공급관에서 제일 끝시루 상단시루에서 모서리 1곳과 중심부 1곳을 측정",
      "○ 타이머로 설정된 시간 종료후 탐침온도계로 품온측정 및 측정시간 확인, 기록",
    ],
    dataColumns: [
      { label: "품 명",             widthRatio: 0.14 },
      { label: "측정시각",         widthRatio: 0.10 },
      { label: "교반기",           widthRatio: 0.09 },
      { label: "가열시간",         widthRatio: 0.09 },
      { label: "압력(Mpa)",       widthRatio: 0.10 },
      { label: "투입량(kg)",      widthRatio: 0.10 },
      { parentLabel: "가열후 품온", label: "모서리", widthRatio: 0.10 },
      { parentLabel: "가열후 품온", label: "중심부", widthRatio: 0.10 },
      { label: "판 정",            widthRatio: 0.18 },
    ],
    correctiveMethod: [
      "○ 가열온도 또는 가열시간 미달 시",
      "  - 모니터링 담당자는 한계기준 이탈시 즉시 작업을 중지한다.",
      "  - 가열온도와 가열시간을 재조정한 후 미달된 제품에 대해 재가열을 실시하고",
      "    제품검사(관능)를 실시하여 이상이 없는 경우 다음 공정을 진행한다.",
      "  - 한계기준 이탈내용과 개선조치 내용을 모니터링 일지에 기록한다.",
      "○ 가열온도 또는 가열시간 초과 시",
      "  - 모니터링 담당자는 한계기준 이탈시 즉시 작업을 중지한다.",
      "  - 제품검사(관능 등)를 실시하여 이상이 없는 경우 다음 공정을 진행한다.",
      "  - 한계기준 이탈내용과 개선조치 내용을 모니터링 일지에 기록한다.",
      "○ 기계고장 시",
      "  - 모니터링 담당자는 가열기 등 기계고장 시 즉시 작업을 중지한다.",
      "  - 수리 후 정상적으로 작동 시 재가동한다.",
      "○ 공통 : 개선조치 시",
      "  - 문제 발생 시 HACCP팀장에게 보고 후 조치하며, 개선조치 후 모니터링 일지에 기록후 HACCP팀장에게 승인을 받는다.",
    ],
  },
  ccp_2b: {
    title: "중요관리점(CCP-2B) 모니터링일지",
    subtitle: "[가열(굽기)공정]",
    limitsHeader: ["품목", "가열시간", "온도"],
    limitsRows: [
      ["마카다미아", "10분이상~15분이하", "150℃이상"],
      ["호두",       "10분이상~15분이하", "150℃이상"],
      ["땅콩",       "10분이상~15분이하", "150℃이상"],
    ],
    cycleNote: "매 작업시마다, 같은품목 작업시 2시간마다, 품목 바뀔때마다",
    monitoringMethod: [
      "○ 가열시간 : 모니터링 담당자는 검교정된 타이머를 이용하여 시간을 확인일지에 기록",
      "○ 가열온도 : 오븐 온도계 수치 확인",
      "○ 가열 종료 후 탐침온도계로 품온측정 및 측정시간 확인, 기록",
    ],
    dataColumns: [
      { label: "품 명",       widthRatio: 0.18 },
      { label: "측정시각",   widthRatio: 0.12 },
      { label: "가열시간(분)", widthRatio: 0.14 },
      { label: "가열온도(℃)", widthRatio: 0.14 },
      { label: "투입량(kg)", widthRatio: 0.14 },
      { label: "판 정",       widthRatio: 0.28 },
    ],
    correctiveMethod: [
      "○ 가열온도 또는 가열시간 미달 시 즉시 작업을 중지하고 재가열을 실시.",
      "○ 가열온도 또는 가열시간 초과 시 제품검사(관능)를 실시하여 이상 여부 판단.",
      "○ 기계고장 시 수리 후 정상 작동 확인 후 재가동.",
      "○ 한계기준 이탈내용과 개선조치 내용을 모니터링 일지에 기록.",
    ],
  },
  ccp_3b: {
    title: "중요관리점(CCP-3B) 모니터링일지",
    subtitle: "[가열공정]",
    limitsHeader: ["품목", "가열시간", "온도"],
    limitsRows: [
      ["대상 품목", "기준 시간", "기준 온도"],
    ],
    cycleNote: "매 작업시마다, 같은품목 작업시 2시간마다, 품목 바뀔때마다",
    monitoringMethod: [
      "○ 가열시간 : 검교정된 타이머로 시간 확인 및 기록",
      "○ 가열온도 : 온도계 수치 확인",
      "○ 가열 종료 후 탐침온도계로 품온측정 및 측정시간 확인, 기록",
    ],
    dataColumns: [
      { label: "품 명",       widthRatio: 0.20 },
      { label: "측정시각",   widthRatio: 0.13 },
      { label: "가열시간(분)", widthRatio: 0.15 },
      { label: "가열온도(℃)", widthRatio: 0.15 },
      { label: "투입량(kg)", widthRatio: 0.14 },
      { label: "판 정",       widthRatio: 0.23 },
    ],
    correctiveMethod: [
      "○ 가열온도 또는 가열시간 미달 시 즉시 작업을 중지하고 재가열을 실시.",
      "○ 한계기준 이탈내용과 개선조치 내용을 모니터링 일지에 기록.",
    ],
  },
  ccp_4p: {
    title: "중요관리점(CCP-4P) 모니터링일지",
    subtitle: "[금속검출공정]",
    limitsHeader: ["감도 설정", "Fe 시편", "SUS 시편"],
    limitsRows: [
      ["130", "Fe 2.0mmΦ 이상 불검출", "SUS 3.0mmΦ 이상 불검출"],
    ],
    cycleNote: "매 작업시마다 시편 통과 확인. 시편 미감지 시 즉시 작업 중단.",
    monitoringMethod: [
      "○ 작업 시작 전 시편(Fe/SUS) 통과시켜 감도 정상 확인",
      "○ 제품 단독 통과 → Fe시편+제품 → SUS시편+제품 순으로 통과 시험",
      "○ 통과량 / 검출량 기록",
      "○ 검출 발생 시 해당 제품 격리 후 원인 조사",
    ],
    dataColumns: [
      { label: "품 명",     widthRatio: 0.12 },
      { label: "측정시각", widthRatio: 0.09 },
      { label: "감 도",     widthRatio: 0.07 },
      { label: "Fe시편",   widthRatio: 0.07 },
      { label: "SUS시편",  widthRatio: 0.07 },
      { label: "제품만",   widthRatio: 0.07 },
      { label: "Fe+제품",  widthRatio: 0.08 },
      { label: "SUS+제품", widthRatio: 0.08 },
      { label: "통과량",   widthRatio: 0.08 },
      { label: "검출량",   widthRatio: 0.08 },
      { label: "판 정",     widthRatio: 0.19 },
    ],
    correctiveMethod: [
      "○ 시편 미감지 시 즉시 작업 중지 후 감도 재조정.",
      "○ 제품 검출 시 해당 제품 격리, 원인 조사, 재검사 실시.",
      "○ 이탈내용과 개선조치 내용을 모니터링 일지에 기록.",
    ],
  },
};

/**
 * 빈 양식지 PDF 생성. Buffer 반환.
 */
export async function generateBlankFormPdf(ccpType: BlankFormCcpType): Promise<Buffer> {
  const spec = FORM_SPECS[ccpType];
  if (!spec) throw new Error(`알 수 없는 양식 타입: ${ccpType}`);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margin: 28,
        info: { Title: spec.title, Author: "Millio AI" },
      });
      const chunks: Buffer[] = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const regular = findFontPath("NanumGothic-Regular.ttf");
      const bold = findFontPath("NanumGothic-Bold.ttf");
      if (!regular || !bold) {
        return reject(new Error(`한글 폰트 없음. cwd=${process.cwd()}`));
      }
      doc.registerFont("NG", regular);
      doc.registerFont("NGB", bold);

      // ─── 레이아웃 상수 ───
      const M = 28;                              // 페이지 마진
      const W = 595 - M * 2;                     // 컨텐츠 너비
      const labelW = 64;                         // 좌측 라벨 컬럼 너비
      const contentW = W - labelW;               // 우측 컨텐츠 너비
      const left = M;
      let y = M;

      // ═══════════════════════════════════════════════
      // 1) 헤더 (제목 + 작성/검토/승인 박스)
      // ═══════════════════════════════════════════════
      const headerH = 46;
      const approvalW = 120;
      const titleW = W - approvalW;

      doc.lineWidth(0.8).strokeColor("#000")
        .rect(left, y, titleW, headerH).stroke();
      doc.fillColor("#000").font("NGB").fontSize(13)
        .text(spec.title, left + 4, y + 9, { width: titleW - 8, align: "center" });
      doc.font("NG").fontSize(10)
        .text(spec.subtitle, left + 4, y + 27, { width: titleW - 8, align: "center" });

      const apprX = left + titleW;
      doc.rect(apprX, y, approvalW, headerH).stroke();
      const apprCellW = approvalW / 3;
      const apprLabelH = 13;
      ["작성", "검토", "승인"].forEach((label, i) => {
        const cx = apprX + apprCellW * i;
        if (i > 0) {
          doc.lineWidth(0.4).moveTo(cx, y).lineTo(cx, y + headerH).stroke();
        }
        doc.font("NGB").fontSize(8).text(label, cx, y + 3, { width: apprCellW, align: "center" });
        doc.lineWidth(0.3).moveTo(cx, y + apprLabelH).lineTo(cx + apprCellW, y + apprLabelH).stroke();
      });
      y += headerH;

      // ═══════════════════════════════════════════════
      // 2) 작성일자 행
      // ═══════════════════════════════════════════════
      const dateH = 20;
      doc.lineWidth(0.8).rect(left, y, W, dateH).stroke();
      doc.font("NGB").fontSize(10).text("작성일자 :", left + 8, y + 5);
      doc.font("NG").fontSize(10).text("       년     월     일      요일 :", left + 70, y + 5);
      y += dateH;

      // ═══════════════════════════════════════════════
      // 3) 한계기준 섹션
      // ═══════════════════════════════════════════════
      const limitsHeaderH = 18;
      const limitsRowH = 18;
      const limitsBodyH = limitsHeaderH + spec.limitsRows.length * limitsRowH;

      doc.lineWidth(0.8).rect(left, y, labelW, limitsBodyH).stroke();
      doc.font("NGB").fontSize(10).text("한계기준", left, y + limitsBodyH / 2 - 6, {
        width: labelW, align: "center",
      });

      const lx = left + labelW;
      const limitsColCount = spec.limitsHeader.length;
      const limitsColW = contentW / limitsColCount;

      // 1) 헤더 배경 fill 먼저
      doc.fillColor("#EEEEEE").rect(lx, y, contentW, limitsHeaderH).fill();

      // 2) 텍스트
      doc.fillColor("#000").font("NGB").fontSize(9);
      spec.limitsHeader.forEach((col, i) => {
        const cx = lx + limitsColW * i;
        doc.text(col, cx, y + 5, { width: limitsColW, align: "center" });
      });
      doc.font("NG").fontSize(9);
      spec.limitsRows.forEach((row, ri) => {
        const ry = y + limitsHeaderH + ri * limitsRowH;
        row.forEach((cell, ci) => {
          doc.text(cell, lx + limitsColW * ci, ry + 5, { width: limitsColW, align: "center" });
        });
      });

      // 3) 선 마지막에 일괄
      doc.strokeColor("#000").lineWidth(0.8).rect(lx, y, contentW, limitsBodyH).stroke();
      doc.lineWidth(0.4).moveTo(lx, y + limitsHeaderH).lineTo(lx + contentW, y + limitsHeaderH).stroke();
      for (let i = 1; i < limitsColCount; i++) {
        const cx = lx + limitsColW * i;
        doc.lineWidth(0.3).moveTo(cx, y).lineTo(cx, y + limitsBodyH).stroke();
      }
      for (let ri = 1; ri < spec.limitsRows.length; ri++) {
        const ry = y + limitsHeaderH + ri * limitsRowH;
        doc.lineWidth(0.3).moveTo(lx, ry).lineTo(lx + contentW, ry).stroke();
      }
      y += limitsBodyH;

      // ═══════════════════════════════════════════════
      // 4) 주 기 행
      // ═══════════════════════════════════════════════
      const cycleH = 22;
      doc.lineWidth(0.8).rect(left, y, labelW, cycleH).stroke();
      doc.rect(left + labelW, y, contentW, cycleH).stroke();
      doc.font("NGB").fontSize(10).text("주 기", left, y + 6, { width: labelW, align: "center" });
      doc.font("NG").fontSize(9).text(spec.cycleNote, left + labelW + 6, y + 6, {
        width: contentW - 12, height: cycleH - 4,
      });
      y += cycleH;

      // ═══════════════════════════════════════════════
      // 5) 모니터링 방법 행
      // ═══════════════════════════════════════════════
      const monLineH = 11;
      const monH = spec.monitoringMethod.length * monLineH + 8;
      doc.lineWidth(0.8).rect(left, y, labelW, monH).stroke();
      doc.rect(left + labelW, y, contentW, monH).stroke();
      doc.font("NGB").fontSize(10).text("모니터링\n  방 법", left, y + monH / 2 - 12, {
        width: labelW, align: "center", lineGap: 2,
      });
      doc.font("NG").fontSize(8);
      spec.monitoringMethod.forEach((line, i) => {
        doc.text(line, left + labelW + 6, y + 4 + i * monLineH, {
          width: contentW - 12, lineBreak: false, ellipsis: true,
        });
      });
      y += monH;

      // ═══════════════════════════════════════════════
      // 6) 측정 데이터 표
      // ═══════════════════════════════════════════════
      const groupHeaderH = 14;
      const colHeaderH = 18;
      const hasGroupHeader = spec.dataColumns.some(c => !!c.parentLabel);
      const dataHeaderH = (hasGroupHeader ? groupHeaderH : 0) + colHeaderH;
      const dataRowCount = 10;
      const dataRowH = 20;
      const dataBodyH = dataHeaderH + dataRowCount * dataRowH;

      // 1) 컬럼별 fill — 그룹 없는 컬럼은 전체 헤더 높이 단일색,
      //    그룹 있는 컬럼은 상단(그룹) 짙은색 + 하단(서브) 옅은색.
      const colHeaderY = y + (hasGroupHeader ? groupHeaderH : 0);
      {
        let cx = left;
        spec.dataColumns.forEach((col) => {
          const cw = W * col.widthRatio;
          if (hasGroupHeader && col.parentLabel) {
            doc.fillColor("#E8E8E8").rect(cx, y, cw, groupHeaderH).fill();
            doc.fillColor("#F2F2F2").rect(cx, colHeaderY, cw, colHeaderH).fill();
          } else {
            // 그룹 없는 컬럼은 전체 헤더 영역 단일색
            doc.fillColor("#F2F2F2").rect(cx, y, cw, dataHeaderH).fill();
          }
          cx += cw;
        });
      }

      // 2) 그룹 헤더 텍스트 (병합된 그룹 셀 한 번씩) + 경계 수집
      let groupBoundaries: number[] = [];
      if (hasGroupHeader) {
        let xCursor = left;
        const groups: Array<{ x: number; w: number; label: string | null }> = [];
        for (const col of spec.dataColumns) {
          const cw = W * col.widthRatio;
          const lbl = col.parentLabel || null;
          const last = groups[groups.length - 1];
          if (last && last.label === lbl) {
            last.w += cw;
          } else {
            groups.push({ x: xCursor, w: cw, label: lbl });
          }
          xCursor += cw;
        }
        doc.fillColor("#000").font("NGB").fontSize(8);
        groups.forEach((g) => {
          if (g.label) {
            // 세로 가운데 정렬 (groupHeaderH = 14 → y+3 정도)
            doc.text(g.label, g.x, y + 3, { width: g.w, align: "center" });
          }
        });
        groupBoundaries = groups.slice(1).map(g => g.x);
      }

      // 3) 컬럼 헤더 텍스트
      doc.fillColor("#000").font("NGB").fontSize(8);
      {
        let cx = left;
        spec.dataColumns.forEach((col) => {
          const cw = W * col.widthRatio;
          if (hasGroupHeader && !col.parentLabel) {
            // 그룹 없는 컬럼: 전체 헤더 높이의 세로 가운데
            doc.text(col.label, cx, y + dataHeaderH / 2 - 4, {
              width: cw, align: "center",
            });
          } else {
            // 그룹 있는 컬럼의 서브 헤더 또는 그룹 헤더 자체 없는 표
            const baseY = hasGroupHeader ? colHeaderY : y;
            doc.text(col.label, cx, baseY + colHeaderH / 2 - 4, {
              width: cw, align: "center",
            });
          }
          cx += cw;
        });
      }

      // 4) 모든 선을 마지막에 그리기
      doc.fillColor("#000").strokeColor("#000");

      // 외곽선
      doc.lineWidth(0.8).rect(left, y, W, dataBodyH).stroke();

      // 그룹 헤더 ↔ 컬럼 헤더 경계: 그룹 헤더 영역 안에서만 가로선
      //   (그룹 없는 컬럼은 가로선 없이 단일 셀로)
      if (hasGroupHeader) {
        let cx = left;
        spec.dataColumns.forEach((col) => {
          const cw = W * col.widthRatio;
          if (col.parentLabel) {
            doc.lineWidth(0.4)
              .moveTo(cx, y + groupHeaderH).lineTo(cx + cw, y + groupHeaderH).stroke();
          }
          cx += cw;
        });
        // 그룹 경계 세로선 (그룹 헤더 영역 안에서만)
        groupBoundaries.forEach(bx => {
          doc.lineWidth(0.3).moveTo(bx, y).lineTo(bx, y + groupHeaderH).stroke();
        });
      }

      // 컬럼 헤더 ↔ 본문 경계
      doc.lineWidth(0.4)
        .moveTo(left, colHeaderY + colHeaderH)
        .lineTo(left + W, colHeaderY + colHeaderH).stroke();

      // 컬럼 세로선 (헤더 + 본문)
      {
        let cx = left;
        spec.dataColumns.forEach((col, i) => {
          const cw = W * col.widthRatio;
          if (i > 0) {
            const prevParent = spec.dataColumns[i - 1].parentLabel;
            const curParent = col.parentLabel;
            const sameGroup = hasGroupHeader && prevParent && prevParent === curParent;
            const startY = sameGroup ? colHeaderY : y;
            doc.lineWidth(0.3).moveTo(cx, startY).lineTo(cx, y + dataBodyH).stroke();
          }
          cx += cw;
        });
      }

      // 빈 데이터 행 가로선
      for (let r = 1; r <= dataRowCount; r++) {
        const ry = colHeaderY + colHeaderH + r * dataRowH - dataRowH;
        if (r > 0) {
          doc.lineWidth(0.3).moveTo(left, ry).lineTo(left + W, ry).stroke();
        }
      }
      y += dataBodyH;

      // ═══════════════════════════════════════════════
      // 7) 개선조치 방법 행 (페이지 넘침 처리)
      // ═══════════════════════════════════════════════
      const corrLineH = 11;
      const corrH = spec.correctiveMethod.length * corrLineH + 10;

      const footerHeaderH = 18;
      const footerRowH = 20;
      const footerRowCount = 3;
      const footerH = footerHeaderH + footerRowCount * footerRowH;

      if (y + corrH + footerH + 30 > 842 - M) {
        doc.addPage();
        y = M;
      }

      doc.lineWidth(0.8).rect(left, y, labelW, corrH).stroke();
      doc.rect(left + labelW, y, contentW, corrH).stroke();
      doc.font("NGB").fontSize(10).text("개선조치\n  방 법", left, y + corrH / 2 - 12, {
        width: labelW, align: "center", lineGap: 2,
      });
      doc.font("NG").fontSize(8);
      spec.correctiveMethod.forEach((line, i) => {
        doc.text(line, left + labelW + 6, y + 5 + i * corrLineH, {
          width: contentW - 12, lineBreak: false, ellipsis: true,
        });
      });
      y += corrH;

      // ═══════════════════════════════════════════════
      // 8) 이탈/조치 기록 표
      // ═══════════════════════════════════════════════
      const footerCols = ["한계기준 이탈내용", "개선조치 및 결과", "조치자", "확인"];
      const footerColWs = [W * 0.40, W * 0.40, W * 0.10, W * 0.10];

      // 1) 헤더 배경 fill 먼저
      doc.fillColor("#EEEEEE").rect(left, y, W, footerHeaderH).fill();

      // 2) 텍스트
      doc.fillColor("#000").font("NGB").fontSize(9);
      {
        let fx = left;
        footerCols.forEach((col, i) => {
          doc.text(col, fx, y + 4, { width: footerColWs[i], align: "center" });
          fx += footerColWs[i];
        });
      }

      // 3) 선 일괄
      doc.strokeColor("#000").lineWidth(0.8).rect(left, y, W, footerH).stroke();
      doc.lineWidth(0.4).moveTo(left, y + footerHeaderH).lineTo(left + W, y + footerHeaderH).stroke();
      {
        let fx = left;
        footerCols.forEach((_, i) => {
          if (i > 0) {
            doc.lineWidth(0.3).moveTo(fx, y).lineTo(fx, y + footerH).stroke();
          }
          fx += footerColWs[i];
        });
      }
      for (let r = 1; r < footerRowCount; r++) {
        const ry = y + footerHeaderH + r * footerRowH;
        doc.lineWidth(0.3).moveTo(left, ry).lineTo(left + W, ry).stroke();
      }
      y += footerH;

      // ═══════════════════════════════════════════════
      // 9) 푸터 안내
      // ═══════════════════════════════════════════════
      doc.fillColor("#888").font("NG").fontSize(7).text(
        "※ 작성 후 millioai.com 에서 스캔 업로드하면 AI 가 자동 인식하여 시스템에 입력합니다.",
        left, y + 6, { width: W, align: "center" },
      );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

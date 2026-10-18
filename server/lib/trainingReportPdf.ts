/**
 * HACCP 교육 과정 보고서 PDF (2026-10-18, Codex 교육 점검 EDU-04)
 *
 * 이전: 화면(jsPDF)에서 한글 폰트 없이 만들어 한글이 전부 깨졌다.
 * 지금: 서버에서 pdfkit + 나눔고딕 — 다른 서류 PDF 와 같은 방식.
 */
import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";
import { formatTrainingMinutes, TRAINING_CATEGORY_LABELS } from "../../shared/trainingLabels";

export interface TrainingReportData {
  courses: Array<{
    id: number; courseCode: string; courseName: string; category: string; duration: number;
    validityPeriod: number | null; passingScore: string | null; description: string | null;
  }>;
  schedules: Array<{ id: number; courseId: number; scheduledDate: Date | string; status: string | null }>;
  participants: Array<{ scheduleId: number; attendanceStatus: string | null; passed: number | null; certificateIssued: number | null }>;
}

// esbuild ESM 번들 호환 — __dirname 미사용 (partnerPricesPdf 와 같은 경로 후보)
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
    } catch (_) { /* ignore */ }
  }
  return null;
}

const ymd = (v: Date | string) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

export async function generateTrainingReportPdf(data: TrainingReportData): Promise<Buffer> {
  const regular = findFontPath("NanumGothic-Regular.ttf");
  const bold = findFontPath("NanumGothic-Bold.ttf");
  if (!regular || !bold) throw new Error("한글 폰트 파일 없음 (NanumGothic-Regular.ttf / NanumGothic-Bold.ttf) — 서버의 fonts/ 폴더를 확인하세요.");

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 40 });
      const chunks: Buffer[] = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
      doc.registerFont("R", regular);
      doc.registerFont("B", bold);

      doc.font("B").fontSize(18).text("교육 훈련 관리 보고서", { align: "center" });
      doc.moveDown(0.5);
      doc.font("R").fontSize(9).fillColor("#555")
        .text(`작성: ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}   ·   교육 과정 ${data.courses.length}개`, { align: "center" });
      doc.fillColor("#000").moveDown(1);

      data.courses.forEach((c, i) => {
        if (doc.y > 720) doc.addPage();
        const sch = data.schedules.filter((s) => s.courseId === c.id);
        const schIds = new Set(sch.map((s) => s.id));
        const ps = data.participants.filter((p) => schIds.has(p.scheduleId));
        doc.font("B").fontSize(12).text(`${i + 1}. ${c.courseName}`);
        doc.font("R").fontSize(9);
        const lines = [
          `코드 ${c.courseCode}   ·   분류 ${TRAINING_CATEGORY_LABELS[c.category] ?? c.category}   ·   교육 시간 ${formatTrainingMinutes(c.duration)}`,
          `합격 점수 ${c.passingScore != null ? `${Number(c.passingScore)}점` : "없음"}   ·   유효 기간 ${c.validityPeriod ? `${c.validityPeriod}개월` : "기한 없음"}`,
          `일정 ${sch.length}회 (완료 ${sch.filter((s) => s.status === "completed").length})   ·   참가 ${ps.length}명 · 출석 ${ps.filter((p) => p.attendanceStatus === "attended").length} · 합격 ${ps.filter((p) => Number(p.passed) === 1).length} · 수료증 ${ps.filter((p) => Number(p.certificateIssued) === 1).length}`,
        ];
        if (sch.length) lines.push(`최근 일정: ${sch.slice(0, 5).map((s) => ymd(s.scheduledDate)).join(", ")}`);
        if (c.description) lines.push(`설명: ${c.description.slice(0, 200)}`);
        for (const l of lines) doc.text(l, { indent: 12, lineGap: 4 });
        doc.moveDown(0.8);
      });
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * 화장품 GMP — KFDA 신고서 PDF 통합 출력 (Phase 2-9)
 *
 * ============================================================================
 * 화장품 KFDA 신고/심사 시 필요한 자료를 한 PDF 로 통합:
 *   - 표지 (제품 + 배치 + 제조일)
 *   - 제품 정보 (BMR 헤더)
 *   - 제조 기록 (BMR lifecycle 추적)
 *   - IPC 측정 결과 표
 *   - (향후) 배합표 / 라벨 / 안정성시험 / 회수
 *
 * 의존성:
 *   - main 의 BMR (#145 머지) + IPC (#151 머지) 활용
 *   - 향후 #152/#154/#157 머지 시 통합 확장
 * ============================================================================
 */

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { eq, and } from "drizzle-orm";
import { getDb } from "../../connection";
import { hCosmeticBmr } from "../../../../drizzle/schema/industry/cosmetic/bmr";
import { hCosmeticBmrIpc } from "../../../../drizzle/schema/industry/cosmetic/bmrIpc";

function fmtDate(d: any): string {
  if (!d) return "-";
  try {
    return new Date(d).toLocaleString("ko-KR");
  } catch {
    return String(d);
  }
}

function addHeader(doc: jsPDF, title: string, bmrCode: string) {
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(title, 14, 18);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`BMR: ${bmrCode}`, 14, 25);
  doc.text(
    `Generated: ${new Date().toISOString().slice(0, 19).replace("T", " ")} UTC`,
    14,
    30,
  );
  doc.line(14, 33, 196, 33);
}

function addSectionTitle(doc: jsPDF, y: number, title: string): number {
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(title, 14, y);
  return y + 4;
}

/**
 * BMR 의 KFDA 신고용 통합 PDF 생성.
 *
 * @returns base64 인코딩 PDF buffer
 */
export async function generateKfdaReportPdf(
  bmrId: number,
  tenantId: number,
): Promise<{ filename: string; base64: string }> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 1. BMR 조회
  const [bmr] = await db
    .select()
    .from(hCosmeticBmr)
    .where(and(eq(hCosmeticBmr.tenantId, tenantId), eq(hCosmeticBmr.id, bmrId)))
    .limit(1);
  if (!bmr) throw new Error("BMR 미존재");

  // 2. IPC 측정값 조회
  const ipcs = await db
    .select()
    .from(hCosmeticBmrIpc)
    .where(
      and(
        eq(hCosmeticBmrIpc.tenantId, tenantId),
        eq(hCosmeticBmrIpc.bmrId, bmrId),
      ),
    );

  // 3. PDF 생성
  const doc = new jsPDF();
  addHeader(doc, "Cosmetic GMP — KFDA Report", String(bmr.bmrCode));

  // === 제품 정보 ===
  let y = addSectionTitle(doc, 42, "Product / Batch Information");
  autoTable(doc, {
    startY: y,
    theme: "grid",
    styles: { fontSize: 9 },
    headStyles: { fillColor: [80, 80, 80], textColor: 255 },
    head: [["Field", "Value"]],
    body: [
      ["BMR Code", String(bmr.bmrCode)],
      ["Product ID", `#${bmr.productId}`],
      ["Batch Number", String(bmr.batchNumber ?? "-")],
      ["Planned Quantity", `${Number(bmr.plannedQuantityKg ?? 0).toLocaleString("ko-KR")} kg`],
      [
        "Actual Quantity",
        bmr.actualQuantityKg !== null
          ? `${Number(bmr.actualQuantityKg).toLocaleString("ko-KR")} kg`
          : "-",
      ],
      [
        "Manufacturing Date",
        bmr.manufacturingDate ? String(bmr.manufacturingDate).slice(0, 10) : "-",
      ],
      ["Status", String(bmr.status)],
    ],
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // === 제조 기록 ===
  y = addSectionTitle(doc, y, "Manufacturing Lifecycle");
  autoTable(doc, {
    startY: y,
    theme: "grid",
    styles: { fontSize: 9 },
    headStyles: { fillColor: [80, 80, 80], textColor: 255 },
    head: [["Stage", "User", "Timestamp"]],
    body: [
      ["Created", `#${bmr.createdBy}`, fmtDate(bmr.createdAt)],
      [
        "QA Approved",
        bmr.approvedBy ? `#${bmr.approvedBy}` : "-",
        fmtDate(bmr.approvedAt),
      ],
      [
        "Manufacturing Started",
        "-",
        fmtDate(bmr.manufacturingStartedAt),
      ],
      [
        "Completed",
        bmr.completedBy ? `#${bmr.completedBy}` : "-",
        fmtDate(bmr.completedAt),
      ],
      bmr.rejectedAt
        ? ["Rejected", `#${bmr.rejectedBy ?? "?"}`, fmtDate(bmr.rejectedAt)]
        : ["", "", ""],
    ],
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  if (bmr.rejectReason) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "italic");
    doc.text(`Reject Reason: ${bmr.rejectReason}`, 14, y);
    y += 6;
  }

  // === IPC 측정 결과 ===
  if (ipcs.length > 0) {
    y = addSectionTitle(doc, y, `IPC (In-Process Control) Results — ${ipcs.length} items`);
    const ipcBody = ipcs.map((ipc) => [
      String(ipc.measurementLabel ?? ipc.measurementType),
      ipc.expectedMin !== null || ipc.expectedMax !== null
        ? `${ipc.expectedMin ?? "-"} ~ ${ipc.expectedMax ?? "-"}`
        : "-",
      ipc.measuredValue !== null ? Number(ipc.measuredValue).toString() : "-",
      String(ipc.unit ?? "-"),
      String(ipc.passFail).toUpperCase(),
    ]);
    autoTable(doc, {
      startY: y,
      theme: "grid",
      styles: { fontSize: 8 },
      headStyles: { fillColor: [80, 80, 80], textColor: 255 },
      head: [["Item", "Limit", "Measured", "Unit", "Result"]],
      body: ipcBody,
      didParseCell(data) {
        if (data.section === "body" && data.column.index === 4) {
          const val = String(data.cell.raw).toUpperCase();
          if (val === "FAIL") {
            data.cell.styles.fillColor = [254, 226, 226]; // red-100
            data.cell.styles.textColor = [185, 28, 28]; // red-700
            data.cell.styles.fontStyle = "bold";
          } else if (val === "PASS") {
            data.cell.styles.fillColor = [220, 252, 231]; // emerald-100
            data.cell.styles.textColor = [21, 128, 61]; // emerald-700
          }
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 8;

    // IPC 요약
    const total = ipcs.length;
    const pass = ipcs.filter((i) => i.passFail === "pass").length;
    const fail = ipcs.filter((i) => i.passFail === "fail").length;
    const pending = ipcs.filter((i) => i.passFail === "pending").length;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(
      `Summary: ${pass}/${total} pass · ${fail} fail · ${pending} pending`,
      14,
      y,
    );
    y += 6;
  } else {
    y = addSectionTitle(doc, y, "IPC Results");
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("No IPC measurements recorded.", 14, y);
    y += 6;
  }

  // === 향후 통합 안내 ===
  if (y < 270) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(120);
    doc.text(
      "Future sections (after Phase 2 PR merges): Formula breakdown · Label/INCI · Stability test results.",
      14,
      275,
    );
    doc.setTextColor(0);
  }

  // === Footer ===
  doc.setFontSize(8);
  doc.text(
    "Millio AI — Cosmetic GMP Module (Phase 2-9)",
    14,
    285,
  );
  doc.text(
    `Tenant: ${tenantId} · Document for KFDA submission`,
    14,
    289,
  );

  const buffer = Buffer.from(doc.output("arraybuffer") as ArrayBuffer);
  const base64 = buffer.toString("base64");
  const filename = `KFDA-${bmr.bmrCode}-${new Date().toISOString().slice(0, 10)}.pdf`;

  return { filename, base64 };
}

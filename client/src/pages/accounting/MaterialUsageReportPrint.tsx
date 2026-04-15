/**
 * 원료수불 기간 보고서 - 인쇄 전용 페이지 (주간 형식)
 * -----------------------------------------------------------------------------
 * URL 쿼리 (둘 중 하나):
 *   1) ?id={reportId}                — 저장된 보고서 (스냅샷) 출력
 *   2) ?start=YYYY-MM-DD & end=YYYY-MM-DD & type=week
 *      또는 + &autoprint=1            — 즉석 미리보기 (DB 저장 X)
 *
 * 화면 구성 (사용자 요청 형식):
 *   1) 헤더: W10 | 2026.04.06(월) ~ 2026.04.12(일)
 *   2) 주간 요약: 생산량 / 판매출고 / 재료입고
 *   3) 생산 실적: No / 날짜 / 제품명 / 생산량(kg)
 *   4) 주간 원재료 사용: 날짜별 (No / 원재료명 / 사용량(kg)) + 일별 소계
 *   5) 주간 합계 (품목별): No / 원재료명 / 주간합계(kg)
 *   6) 결재란
 */
import { useEffect, useMemo, useRef } from "react";
import { trpc } from "@/lib/trpc";

// ============================================================================
// 타입 정의
// ============================================================================
interface ProductionEntry {
  date: string;
  productId: number;
  productCode: string;
  productName: string;
  batchCode: string;
  quantity: number;
  unit: string;
  status: string;
}
interface DailyMaterialUsage {
  date: string;
  items: Array<{
    materialId: number;
    materialCode: string;
    materialName: string;
    quantity: number;
    unit: string;
  }>;
  subtotal: number;
}
interface MaterialWeeklyTotal {
  materialId: number;
  materialCode: string;
  materialName: string;
  totalQuantity: number;
  unit: string;
}
interface CompanyInfo {
  companyName: string;
  businessNumber: string;
  address: string;
  phone: string;
}
interface ProductMaterialUsage {
  productId: number;
  productCode: string;
  productName: string;
  totalProduction: number;
  unit: string;
  materials: Array<{
    materialId: number;
    materialName: string;
    totalQuantity: number;
    unit: string;
  }>;
}
interface PrevPeriodComparison {
  prevProductionKg: number;
  prevSalesKg: number;
  prevReceivingKg: number;
  productionDelta: number;
  salesDelta: number;
  receivingDelta: number;
}
interface UsageReport {
  period: { start: string; end: string; type: "week" | "month" | "custom"; weekNumber?: number; label: string };
  company?: CompanyInfo;
  summary: {
    productionKg: number;
    productionKinds: number;
    salesKg: number;
    salesKinds: number;
    receivingKg: number;
    receivingKinds: number;
  };
  productions: ProductionEntry[];
  dailyMaterialUsage: DailyMaterialUsage[];
  materialWeeklyTotal: MaterialWeeklyTotal[];
  productMaterialUsage?: ProductMaterialUsage[];
  comparison?: PrevPeriodComparison;
  totals: {
    batchCount: number;
    productCount: number;
    materialCount: number;
    totalUsage: number;
  };
  generatedAt?: string;
}

// ============================================================================
// 유틸
// ============================================================================
function fmtNum(n: number, digits = 1): string {
  if (n == null || isNaN(n)) return "0";
  return Number(n).toLocaleString("ko-KR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}
const KOR_DAY = ["일", "월", "화", "수", "목", "금", "토"];
function fmtDateMMDD(dateStr: string): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return dateStr;
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmtDateMMDDDay(dateStr: string): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return dateStr;
  return `${d.getMonth() + 1}/${d.getDate()}(${KOR_DAY[d.getDay()]})`;
}

// ============================================================================
// 컴포넌트
// ============================================================================
export default function MaterialUsageReportPrint() {
  const params = useMemo(() => {
    const p = new URLSearchParams(window.location.search);
    return {
      id: p.get("id") ? Number(p.get("id")) : null,
      start: p.get("start") || "",
      end: p.get("end") || "",
      type: (p.get("type") || "week") as "week" | "month" | "custom",
      autoprint: p.get("autoprint") === "1",
    };
  }, []);

  // 1) 저장된 보고서 우선
  const { data: savedReport, isLoading: savedLoading } =
    trpc.materialLedger.getReportById.useQuery(
      { id: params.id || 0 },
      { enabled: !!params.id },
    );

  // 2) 즉석 미리보기 (id 가 없을 때만)
  const { data: liveReport, isLoading: liveLoading } =
    trpc.materialLedger.getUsageReport.useQuery(
      { start: params.start, end: params.end, type: params.type },
      { enabled: !params.id && !!params.start && !!params.end },
    );

  // 인쇄 이력 기록
  const markPrintedMutation = trpc.materialLedger.markReportPrinted.useMutation();

  const isLoading = params.id ? savedLoading : liveLoading;

  // 보고서 데이터 추출 (저장된 보고서면 body 사용)
  const report: UsageReport | null = useMemo(() => {
    if (params.id && savedReport) {
      return (savedReport as any).body as UsageReport | null;
    }
    if (!params.id && liveReport) {
      return liveReport as unknown as UsageReport;
    }
    return null;
  }, [params.id, savedReport, liveReport]);

  const reportTitle = useMemo(() => {
    if (params.id && savedReport) return (savedReport as any).title;
    if (report) return `주간 원료수불 보고서 (${report.period.label})`;
    return "주간 원료수불 보고서";
  }, [params.id, savedReport, report]);

  // 자동 인쇄
  const triggered = useRef(false);
  useEffect(() => {
    if (!params.autoprint) return;
    if (isLoading) return;
    if (!report) return;
    if (triggered.current) return;
    triggered.current = true;
    const t = setTimeout(() => {
      window.print();
      // 저장된 보고서면 인쇄 이력 기록
      if (params.id) {
        markPrintedMutation.mutate({ id: params.id });
      }
    }, 500);
    return () => clearTimeout(t);
  }, [isLoading, report, params.autoprint, params.id]);

  // ====== Render ======
  if (!params.id && (!params.start || !params.end)) {
    return (
      <div className="p-8">
        <h1 className="text-xl font-bold">잘못된 요청</h1>
        <p className="text-sm text-gray-600 mt-2">
          ?id={"{reportId}"} 또는 ?start=...&amp;end=...&amp;type=week 가 필요합니다.
        </p>
      </div>
    );
  }
  if (isLoading) {
    return <div className="p-8 text-center">보고서 데이터 불러오는 중...</div>;
  }
  if (!report) {
    return <div className="p-8 text-center">데이터가 없습니다.</div>;
  }

  // 생산 실적 합계
  const productionTotal = report.productions.reduce((acc, p) => acc + p.quantity, 0);
  // 주간 합계 합계
  const materialGrandTotal = report.materialWeeklyTotal.reduce(
    (acc, m) => acc + m.totalQuantity,
    0,
  );

  return (
    <div className="material-usage-report bg-white text-black">
      <style>{`
        @page { size: A4; margin: 12mm 10mm; }
        @media print {
          body { margin: 0; padding: 0; }
          .no-print { display: none !important; }
          .page-break { page-break-after: always; }
          .avoid-break { page-break-inside: avoid; break-inside: avoid; }
        }
        .material-usage-report {
          font-family: "Noto Sans KR", "Malgun Gothic", sans-serif;
          font-size: 11px;
          line-height: 1.4;
          padding: 16px;
          max-width: 210mm;
          margin: 0 auto;
        }
        /* === 메인 헤더 === */
        .main-header {
          background: #4a7c5a;
          color: white;
          padding: 12px 16px;
          font-size: 18px;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 0;
        }
        .main-header .icon {
          background: white;
          color: #4a7c5a;
          width: 26px; height: 26px;
          border-radius: 4px;
          display: inline-flex; align-items: center; justify-content: center;
          font-size: 16px;
        }

        /* === 섹션 헤더 (주간 요약 / 생산 실적 / 원재료 사용 / 주간 합계) === */
        .section-bar {
          background: #f0a040;
          color: white;
          padding: 6px 12px;
          font-weight: 700;
          font-size: 13px;
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 12px;
        }
        .section-bar.cyan { background: #2cb5b3; }
        .section-bar.purple { background: #7e57c2; }
        .section-bar.green { background: #4a7c5a; }

        /* === 일반 표 === */
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 0;
        }
        th, td {
          border: 1px solid #888;
          padding: 4px 6px;
          font-size: 11px;
          text-align: center;
          vertical-align: middle;
        }
        th {
          background: #fff7d6;
          font-weight: 700;
        }
        .text-left { text-align: left; }
        .text-right { text-align: right; }
        .row-num {
          background: #f5f5f5;
          width: 40px;
          font-weight: 600;
          color: #666;
        }

        /* === 요약 표 === */
        .summary-table th {
          background: #f0a040;
          color: white;
          font-weight: 700;
        }
        .summary-table .label-cell {
          background: #fff;
          text-align: left;
          font-weight: 600;
          padding-left: 12px;
        }

        /* === 일별 헤더 === */
        .day-header {
          background: #e8f5e9;
          padding: 4px 10px;
          font-weight: 700;
          font-size: 12px;
          border: 1px solid #888;
          border-bottom: none;
          margin-top: 6px;
        }
        .day-subtotal {
          background: #fff7d6;
          font-weight: 700;
        }
        .grand-total {
          background: #fff3d0;
          font-weight: 700;
        }

        /* 결재란 */
        .approval-box {
          margin-top: 16px;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          border: 1px solid #555;
        }
        .approval-box > div {
          height: 60px;
          border-right: 1px solid #555;
          text-align: center;
          font-size: 10px;
          padding-top: 4px;
        }
        .approval-box > div:last-child { border-right: none; }
      `}</style>

      {/* 인쇄 버튼 (화면용) */}
      <div className="no-print" style={{ marginBottom: 12, textAlign: "right" }}>
        <button
          onClick={() => window.print()}
          style={{
            padding: "8px 18px",
            background: "#0070f3",
            color: "white",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          🖨 인쇄
        </button>
      </div>

      {/* === 회사 정보 === */}
      {report.company && (report.company.companyName || report.company.businessNumber) && (
        <div
          className="avoid-break"
          style={{
            border: "1px solid #888",
            padding: "8px 12px",
            marginBottom: 4,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            fontSize: 10,
            background: "#fafafa",
          }}
        >
          <div>
            <strong>{report.company.companyName || "-"}</strong>
            {report.company.businessNumber && (
              <span style={{ marginLeft: 8, color: "#666" }}>
                사업자번호: {report.company.businessNumber}
              </span>
            )}
          </div>
          <div style={{ textAlign: "right", color: "#666" }}>
            {report.company.address && <span>{report.company.address}</span>}
            {report.company.phone && <span style={{ marginLeft: 8 }}>{report.company.phone}</span>}
          </div>
        </div>
      )}

      {/* === 메인 헤더 === */}
      <div className="main-header avoid-break">
        <span className="icon">📅</span>
        {report.period.label}
      </div>

      {/* === 주간 요약 === */}
      <div className="section-bar avoid-break">
        <span>📌</span> 주간 요약
      </div>
      <table className="summary-table avoid-break">
        <tbody>
          <tr>
            <td className="row-num">1</td>
            <td className="label-cell">📦 생산량</td>
            <td className="text-right" style={{ width: "22%" }}>
              {fmtNum(report.summary.productionKg)} kg
            </td>
            <td style={{ width: "10%" }}>{report.summary.productionKinds}종</td>
            <td style={{ width: "16%", fontSize: 9 }}>
              {report.comparison ? (
                <span
                  style={{
                    color:
                      report.comparison.productionDelta > 0
                        ? "#16a34a"
                        : report.comparison.productionDelta < 0
                          ? "#dc2626"
                          : "#666",
                  }}
                >
                  전기간 대비 {report.comparison.productionDelta > 0 ? "+" : ""}
                  {report.comparison.productionDelta}%
                </span>
              ) : (
                "-"
              )}
            </td>
          </tr>
          <tr>
            <td className="row-num">2</td>
            <td className="label-cell">📤 판매출고</td>
            <td className="text-right">{fmtNum(report.summary.salesKg)} kg</td>
            <td>{report.summary.salesKinds}종</td>
            <td style={{ fontSize: 9 }}>
              {report.comparison ? (
                <span
                  style={{
                    color:
                      report.comparison.salesDelta > 0
                        ? "#16a34a"
                        : report.comparison.salesDelta < 0
                          ? "#dc2626"
                          : "#666",
                  }}
                >
                  {report.comparison.salesDelta > 0 ? "+" : ""}
                  {report.comparison.salesDelta}%
                </span>
              ) : (
                "-"
              )}
            </td>
          </tr>
          <tr>
            <td className="row-num">3</td>
            <td className="label-cell">📥 재료입고</td>
            <td className="text-right">{fmtNum(report.summary.receivingKg)} kg</td>
            <td>{report.summary.receivingKinds}종</td>
            <td style={{ fontSize: 9 }}>
              {report.comparison ? (
                <span
                  style={{
                    color:
                      report.comparison.receivingDelta > 0
                        ? "#16a34a"
                        : report.comparison.receivingDelta < 0
                          ? "#dc2626"
                          : "#666",
                  }}
                >
                  {report.comparison.receivingDelta > 0 ? "+" : ""}
                  {report.comparison.receivingDelta}%
                </span>
              ) : (
                "-"
              )}
            </td>
          </tr>
        </tbody>
      </table>

      {/* === 생산 실적 === */}
      <div className="section-bar cyan avoid-break">
        <span>🏭</span> 생산 실적
      </div>
      <table>
        <thead>
          <tr>
            <th className="row-num">No</th>
            <th style={{ width: "16%" }}>날짜</th>
            <th style={{ width: "44%" }}>제품명</th>
            <th style={{ width: "20%" }}>품목제조번호</th>
            <th style={{ width: "16%" }}>생산량(kg)</th>
          </tr>
        </thead>
        <tbody>
          {report.productions.map((p, i) => (
            <tr key={`p-${i}`}>
              <td className="row-num">{i + 1}</td>
              <td>{fmtDateMMDD(p.date)}</td>
              <td className="text-left">{p.productName}</td>
              <td className="text-left" style={{ fontSize: 9 }}>{p.productCode || "-"}</td>
              <td className="text-right">{fmtNum(p.quantity)}</td>
            </tr>
          ))}
          <tr className="grand-total">
            <td colSpan={4} className="text-right">소 계</td>
            <td className="text-right">{fmtNum(productionTotal)}</td>
          </tr>
          {report.productions.length === 0 && (
            <tr>
              <td colSpan={5} style={{ color: "#999", padding: 16 }}>
                해당 기간에 생산 실적이 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* === 주간 원재료 사용 === */}
      <div className="section-bar purple avoid-break" style={{ marginTop: 16 }}>
        <span>🧰</span> 주간 원재료 사용 ({report.totals.materialCount}종, 총 {fmtNum(report.totals.totalUsage)} kg)
      </div>
      {report.dailyMaterialUsage.length === 0 ? (
        <div style={{ padding: 16, textAlign: "center", color: "#999", border: "1px solid #888" }}>
          원재료 사용 내역이 없습니다.
        </div>
      ) : (
        report.dailyMaterialUsage.map((day) => (
          <div key={day.date} className="avoid-break">
            <div className="day-header">📋 {fmtDateMMDDDay(day.date)}</div>
            <table>
              <thead>
                <tr>
                  <th className="row-num">No</th>
                  <th style={{ width: "55%" }}>원 재 료 명</th>
                  <th style={{ width: "20%" }}>코드</th>
                  <th style={{ width: "21%" }}>사용량(kg)</th>
                </tr>
              </thead>
              <tbody>
                {day.items.map((m, i) => (
                  <tr key={`${day.date}-${i}`}>
                    <td className="row-num">{i + 1}</td>
                    <td className="text-left">{m.materialName}</td>
                    <td style={{ fontSize: 9 }}>{m.materialCode || "-"}</td>
                    <td className="text-right">{fmtNum(m.quantity)}</td>
                  </tr>
                ))}
                <tr className="day-subtotal">
                  <td colSpan={3} className="text-right">{fmtDateMMDD(day.date)} 소계</td>
                  <td className="text-right">{fmtNum(day.subtotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ))
      )}

      {/* === 주간 합계 (품목별) === */}
      {report.materialWeeklyTotal.length > 0 && (
        <>
          <div className="section-bar green avoid-break" style={{ marginTop: 16 }}>
            <span>🎯</span> 주간 합계 (품목별)
          </div>
          <table className="avoid-break">
            <thead>
              <tr>
                <th className="row-num">No</th>
                <th style={{ width: "55%" }}>원 재 료 명</th>
                <th style={{ width: "20%" }}>코드</th>
                <th style={{ width: "21%" }}>주간합계(kg)</th>
              </tr>
            </thead>
            <tbody>
              {report.materialWeeklyTotal.map((m, i) => (
                <tr key={`w-${i}`}>
                  <td className="row-num">{i + 1}</td>
                  <td className="text-left">{m.materialName}</td>
                  <td style={{ fontSize: 9 }}>{m.materialCode || "-"}</td>
                  <td className="text-right">{fmtNum(m.totalQuantity)}</td>
                </tr>
              ))}
              <tr className="grand-total">
                <td colSpan={3} className="text-right">합 계</td>
                <td className="text-right">{fmtNum(materialGrandTotal)}</td>
              </tr>
            </tbody>
          </table>
        </>
      )}

      {/* === 제품별 원재료 사용 (Cross-Tab) === */}
      {report.productMaterialUsage && report.productMaterialUsage.length > 0 && (
        <>
          <div className="section-bar avoid-break" style={{ marginTop: 16, background: "#5c6bc0" }}>
            <span>🔄</span> 제품별 원재료 사용 내역
          </div>
          {report.productMaterialUsage.map((p) => (
            <div key={p.productId} className="avoid-break" style={{ marginBottom: 6 }}>
              <div
                style={{
                  background: "#e8eaf6",
                  padding: "4px 10px",
                  fontWeight: 700,
                  fontSize: 11,
                  border: "1px solid #888",
                  borderBottom: "none",
                }}
              >
                🍱 {p.productName}{" "}
                {p.productCode && (
                  <span style={{ fontSize: 9, color: "#666", fontWeight: 400 }}>
                    [{p.productCode}]
                  </span>
                )}
                <span style={{ float: "right", fontSize: 10, color: "#444" }}>
                  생산: {fmtNum(p.totalProduction)} {p.unit}
                </span>
              </div>
              {p.materials.length > 0 ? (
                <table>
                  <thead>
                    <tr>
                      <th className="row-num">No</th>
                      <th>원재료명</th>
                      <th style={{ width: "20%" }}>사용량</th>
                      <th style={{ width: "10%" }}>단위</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.materials.map((m, mi) => (
                      <tr key={mi}>
                        <td className="row-num">{mi + 1}</td>
                        <td className="text-left">{m.materialName}</td>
                        <td className="text-right">{fmtNum(m.totalQuantity)}</td>
                        <td>{m.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div
                  style={{
                    border: "1px solid #888",
                    padding: 6,
                    fontSize: 9,
                    color: "#999",
                  }}
                >
                  원재료 사용 내역이 없습니다.
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {/* === 결재란 === */}
      <div className="approval-box avoid-break">
        <div>작성자</div>
        <div>검토자</div>
        <div>승인자</div>
      </div>

      <div style={{ textAlign: "right", fontSize: 9, color: "#888", marginTop: 8 }}>
        제목: {reportTitle} · 출력일: {new Date().toLocaleString("ko-KR")}
      </div>
    </div>
  );
}

/**
 * HACCP 감사 리포트 대시보드
 * 교육 + 체크리스트 + CCP + 시정조치 + 위생검사 통합 종합 점수
 */
import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Shield, BookOpen, ListChecks, AlertTriangle, CheckCircle2,
  Loader2, Printer, TrendingUp, ClipboardCheck
} from "lucide-react";

function ScoreGauge({ label, score, icon }: { label: string; score: number; icon: React.ReactNode }) {
  const color = score >= 90 ? "text-emerald-600" : score >= 70 ? "text-amber-600" : "text-red-600";
  const bg = score >= 90 ? "bg-emerald-500" : score >= 70 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="bg-white rounded-xl border p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">{icon} {label}</div>
      <div className={`text-3xl font-black ${color}`}>{score}%</div>
      <div className="w-full bg-gray-100 rounded-full h-2 mt-2">
        <div className={`h-2 rounded-full ${bg}`} style={{ width: `${Math.min(score, 100)}%` }} />
      </div>
    </div>
  );
}

export default function AuditReportDashboard() {
  const now = new Date();
  const [startDate, setStartDate] = useState(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-01`);
  const [endDate, setEndDate] = useState(now.toISOString().slice(0, 10));

  const { data, isLoading } = trpc.auditReport.getAuditSummary.useQuery(
    { startDate, endDate },
    { refetchInterval: 60000 }
  );

  const handlePrint = () => {
    if (!data) return;
    const pw = window.open("", "_blank");
    if (!pw) return;
    const scoreColor = (s: number) => s >= 90 ? "#16a34a" : s >= 70 ? "#d97706" : "#dc2626";
    pw.document.write(`<html><head><title>HACCP 감사 리포트</title>
    <style>
      body{font-family:'Malgun Gothic',sans-serif;font-size:12px;padding:30px;max-width:210mm}
      h1{text-align:center;font-size:20px;border-bottom:2px solid #000;padding-bottom:8px}
      .sub{text-align:center;color:#666;margin-bottom:20px}
      table{width:100%;border-collapse:collapse;margin-bottom:16px}
      td,th{border:1px solid #999;padding:6px 8px}
      .bg{background:#f3f4f6}
      .tc{text-align:center}
      .fw{font-weight:bold}
      .big{font-size:24px;font-weight:900}
      @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    </style></head><body>
    <h1>HACCP 종합 감사 리포트</h1>
    <p class="sub">${startDate} ~ ${endDate}</p>

    <table><tr>
      <td class="bg fw tc" width="20%">종합 점수</td>
      <td class="tc big" style="color:${scoreColor(data.overallScore)}" width="30%">${data.overallScore}점</td>
      <td class="bg fw tc" width="20%">등급</td>
      <td class="tc fw" style="font-size:18px;color:${scoreColor(data.overallScore)}">${data.overallScore >= 90 ? "우수" : data.overallScore >= 70 ? "보통" : "미흡"}</td>
    </tr></table>

    <h3>항목별 상세</h3>
    <table>
      <tr class="bg"><th>항목</th><th>실적</th><th>달성률</th><th>비고</th></tr>
      <tr><td class="fw">교육훈련</td><td class="tc">${data.training.totalDone}/${data.training.expected}건</td><td class="tc fw" style="color:${scoreColor(data.training.rate)}">${data.training.rate}%</td><td>배정 ${data.training.assignedDays}일 × ${data.training.totalUsers}명</td></tr>
      <tr><td class="fw">체크리스트</td><td class="tc">${data.checklist.completed}/${data.checklist.total}건</td><td class="tc fw" style="color:${scoreColor(data.checklist.rate)}">${data.checklist.rate}%</td><td>완료 기준</td></tr>
      <tr><td class="fw">CCP 준수</td><td class="tc">${data.ccp.total - data.ccp.deviations}/${data.ccp.total}건</td><td class="tc fw" style="color:${scoreColor(data.ccp.complianceRate)}">${data.ccp.complianceRate}%</td><td>이탈 ${data.ccp.deviations}건</td></tr>
      <tr><td class="fw">시정조치</td><td class="tc">${data.capa.completed}/${data.capa.total}건</td><td class="tc fw" style="color:${scoreColor(data.capa.rate)}">${data.capa.rate}%</td><td>완료 기준</td></tr>
      <tr><td class="fw">위생검사</td><td class="tc">${data.hygiene.passed}/${data.hygiene.total}건</td><td class="tc fw" style="color:${scoreColor(data.hygiene.rate)}">${data.hygiene.rate}%</td><td>합격 기준</td></tr>
    </table>

    <h3>확인/승인</h3>
    <table><tr class="bg"><th width="25%">구분</th><th width="25%">작성자</th><th width="25%">검토자</th><th width="25%">승인자</th></tr>
    <tr><td class="bg fw">서명</td><td style="height:50px"></td><td></td><td></td></tr>
    <tr><td class="bg fw">일자</td><td></td><td></td><td></td></tr></table>

    <p style="text-align:center;font-size:9px;color:#999;margin-top:20px">HACCP-ONE 자동생성 | 식품위생법 시행규칙 기준 3년 보관</p>
    <script>window.onload=function(){setTimeout(function(){window.print()},800)}</script>
    </body></html>`);
    pw.document.close();
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Shield className="h-5 w-5 text-blue-600" />
              HACCP 감사 리포트
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">교육 + 체크리스트 + CCP + 시정조치 + 위생검사 종합</p>
          </div>
          <div className="flex items-center gap-2">
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="text-xs border rounded px-2 py-1" />
            <span className="text-gray-400">~</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="text-xs border rounded px-2 py-1" />
            <Button variant="outline" size="sm" onClick={handlePrint} disabled={!data}>
              <Printer className="h-3.5 w-3.5 mr-1" /> 출력
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>
        ) : data ? (
          <>
            {/* 종합 점수 */}
            <div className={`rounded-xl border-2 p-6 text-center shadow-sm ${
              data.overallScore >= 90 ? "border-emerald-300 bg-emerald-50" :
              data.overallScore >= 70 ? "border-amber-300 bg-amber-50" : "border-red-300 bg-red-50"
            }`}>
              <p className="text-sm text-gray-600 mb-1">종합 감사 점수</p>
              <p className={`text-5xl font-black ${
                data.overallScore >= 90 ? "text-emerald-600" :
                data.overallScore >= 70 ? "text-amber-600" : "text-red-600"
              }`}>{data.overallScore}<span className="text-xl">점</span></p>
              <Badge className={`mt-2 ${
                data.overallScore >= 90 ? "bg-emerald-100 text-emerald-700" :
                data.overallScore >= 70 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
              }`}>
                {data.overallScore >= 90 ? "우수" : data.overallScore >= 70 ? "보통" : "미흡"}
              </Badge>
            </div>

            {/* 항목별 점수 */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <ScoreGauge label="교육훈련" score={data.training.rate} icon={<BookOpen className="h-3.5 w-3.5" />} />
              <ScoreGauge label="체크리스트" score={data.checklist.rate} icon={<ListChecks className="h-3.5 w-3.5" />} />
              <ScoreGauge label="CCP 준수" score={data.ccp.complianceRate} icon={<AlertTriangle className="h-3.5 w-3.5" />} />
              <ScoreGauge label="시정조치" score={data.capa.rate} icon={<CheckCircle2 className="h-3.5 w-3.5" />} />
              <ScoreGauge label="위생검사" score={data.hygiene.rate} icon={<ClipboardCheck className="h-3.5 w-3.5" />} />
            </div>

            {/* 상세 테이블 */}
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="bg-gray-50 border-b">
                  <th className="px-4 py-3 text-left font-bold">항목</th>
                  <th className="px-4 py-3 text-center font-bold">실적</th>
                  <th className="px-4 py-3 text-center font-bold">달성률</th>
                  <th className="px-4 py-3 text-left font-bold">비고</th>
                </tr></thead>
                <tbody>
                  <tr className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">교육훈련</td>
                    <td className="px-4 py-3 text-center">{data.training.totalDone}/{data.training.expected}건</td>
                    <td className={`px-4 py-3 text-center font-bold ${data.training.rate >= 90 ? "text-emerald-600" : data.training.rate >= 70 ? "text-amber-600" : "text-red-600"}`}>{data.training.rate}%</td>
                    <td className="px-4 py-3 text-gray-500">배정 {data.training.assignedDays}일 × {data.training.totalUsers}명</td>
                  </tr>
                  <tr className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">체크리스트</td>
                    <td className="px-4 py-3 text-center">{data.checklist.completed}/{data.checklist.total}건</td>
                    <td className={`px-4 py-3 text-center font-bold ${data.checklist.rate >= 90 ? "text-emerald-600" : "text-amber-600"}`}>{data.checklist.rate}%</td>
                    <td className="px-4 py-3 text-gray-500">완료 기준</td>
                  </tr>
                  <tr className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">CCP 준수</td>
                    <td className="px-4 py-3 text-center">{data.ccp.total - data.ccp.deviations}/{data.ccp.total}건</td>
                    <td className={`px-4 py-3 text-center font-bold ${data.ccp.complianceRate >= 90 ? "text-emerald-600" : "text-red-600"}`}>{data.ccp.complianceRate}%</td>
                    <td className="px-4 py-3 text-gray-500">이탈 {data.ccp.deviations}건</td>
                  </tr>
                  <tr className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">시정조치</td>
                    <td className="px-4 py-3 text-center">{data.capa.completed}/{data.capa.total}건</td>
                    <td className={`px-4 py-3 text-center font-bold ${data.capa.rate >= 90 ? "text-emerald-600" : "text-amber-600"}`}>{data.capa.rate}%</td>
                    <td className="px-4 py-3 text-gray-500">완료 기준</td>
                  </tr>
                  <tr className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">위생검사</td>
                    <td className="px-4 py-3 text-center">{data.hygiene.passed}/{data.hygiene.total}건</td>
                    <td className={`px-4 py-3 text-center font-bold ${data.hygiene.rate >= 90 ? "text-emerald-600" : "text-amber-600"}`}>{data.hygiene.rate}%</td>
                    <td className="px-4 py-3 text-gray-500">합격 기준</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}

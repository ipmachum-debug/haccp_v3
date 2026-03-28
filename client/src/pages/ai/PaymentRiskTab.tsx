import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle, Loader2, Brain,
} from "lucide-react";

// ============================================================================
// ERP AI Tab 3: AP/AR 연체 리스크
// ============================================================================
export function PaymentRiskTab() {
  const data = trpc.ai.analyzePaymentRisk.useQuery();
  const report = data.data;

  const riskColor: Record<string, string> = {
    critical: "text-red-600",
    high: "text-orange-600",
    medium: "text-yellow-600",
    low: "text-green-600",
  };

  return (
    <div className="space-y-2.5">
      <h2 className="text-sm font-semibold flex items-center gap-2">
        <AlertTriangle className="w-5 h-5 text-orange-500" /> AP/AR 연체 리스크 분석
      </h2>

      {data.isLoading ? (
        <Card><CardContent className="flex items-center justify-center py-6"><Loader2 className="w-6 h-6 animate-spin" /></CardContent></Card>
      ) : !report ? (
        <Card><CardContent className="py-6 text-center text-muted-foreground">데이터 없음</CardContent></Card>
      ) : (
        <>
          {/* Aging 요약 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            <Card>
              <CardContent className="py-2 px-3"><h4 className="text-xs font-semibold text-red-600">AP (미지급금) Aging</h4>
                <Table>
                  <TableHeader><TableRow>
                    <TableHead className="text-xs">구간</TableHead><TableHead className="text-xs text-right">금액</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    <TableRow><TableCell className="text-xs">정상</TableCell><TableCell className="text-xs text-right">{report.apSummary.current.toLocaleString()}</TableCell></TableRow>
                    <TableRow><TableCell className="text-xs text-yellow-600">30일</TableCell><TableCell className="text-xs text-right">{report.apSummary.days30.toLocaleString()}</TableCell></TableRow>
                    <TableRow><TableCell className="text-xs text-orange-600">60일</TableCell><TableCell className="text-xs text-right">{report.apSummary.days60.toLocaleString()}</TableCell></TableRow>
                    <TableRow><TableCell className="text-xs text-red-600">90일+</TableCell><TableCell className="text-xs text-right">{(report.apSummary.days90 + report.apSummary.days120plus).toLocaleString()}</TableCell></TableRow>
                    <TableRow className="font-bold"><TableCell className="text-xs">합계</TableCell><TableCell className="text-xs text-right">{report.apSummary.total.toLocaleString()}</TableCell></TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="py-2 px-3"><h4 className="text-xs font-semibold text-blue-600">AR (미수금) Aging</h4>
                <Table>
                  <TableHeader><TableRow>
                    <TableHead className="text-xs">구간</TableHead><TableHead className="text-xs text-right">금액</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    <TableRow><TableCell className="text-xs">정상</TableCell><TableCell className="text-xs text-right">{report.arSummary.current.toLocaleString()}</TableCell></TableRow>
                    <TableRow><TableCell className="text-xs text-yellow-600">30일</TableCell><TableCell className="text-xs text-right">{report.arSummary.days30.toLocaleString()}</TableCell></TableRow>
                    <TableRow><TableCell className="text-xs text-orange-600">60일</TableCell><TableCell className="text-xs text-right">{report.arSummary.days60.toLocaleString()}</TableCell></TableRow>
                    <TableRow><TableCell className="text-xs text-red-600">90일+</TableCell><TableCell className="text-xs text-right">{(report.arSummary.days90 + report.arSummary.days120plus).toLocaleString()}</TableCell></TableRow>
                    <TableRow className="font-bold"><TableCell className="text-xs">합계</TableCell><TableCell className="text-xs text-right">{report.arSummary.total.toLocaleString()}</TableCell></TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          {/* 거래처별 리스크 */}
          {report.apProfiles.length > 0 && (
            <Card>
              <CardContent className="py-2 px-3"><h4 className="text-xs font-semibold">AP 거래처별 리스크 (상위)</h4>
                <Table>
                  <TableHeader><TableRow>
                    <TableHead className="text-xs">거래처</TableHead>
                    <TableHead className="text-xs text-right">미지급액</TableHead>
                    <TableHead className="text-xs text-right">최장 연체</TableHead>
                    <TableHead className="text-xs text-right">기한준수</TableHead>
                    <TableHead className="text-xs text-center">리스크</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {report.apProfiles.slice(0, 10).map((p: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs">{p.partnerName}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{p.totalOutstanding.toLocaleString()}</TableCell>
                        <TableCell className="text-xs text-right">{p.oldestOverdueDays > 0 ? `${p.oldestOverdueDays}일` : "-"}</TableCell>
                        <TableCell className="text-xs text-right">{p.onTimeRate}%</TableCell>
                        <TableCell className="text-xs text-center">
                          <Badge variant="outline" className={riskColor[p.riskLevel]}>{p.riskScore}점</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* AI 분석 + 권고 */}
          {report.aiAnalysis && (
            <Card className="border-indigo-200 bg-indigo-50">
              <CardContent className="py-2 px-3">
                <h4 className="text-xs font-semibold text-indigo-700 flex items-center gap-1.5 mb-1"><Brain className="w-3.5 h-3.5" /> AI 종합 분석</h4>
                <p className="text-xs whitespace-pre-wrap">{report.aiAnalysis}</p>
              </CardContent>
            </Card>
          )}
          {report.recommendations.length > 0 && (
            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="py-2 px-3">
                <h4 className="text-xs font-semibold text-blue-700 mb-1">권고사항</h4>
                <div className="text-xs">{report.recommendations.map((r: string, i: number) => <div key={i} className="mb-0.5">* {r}</div>)}</div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle, Loader2, BookCheck,
} from "lucide-react";
import { SeverityBadge } from "./SeverityBadge";

// ============================================================================
// ERP AI Tab 4: 분개 검증
// ============================================================================
export function JournalValidationTab() {
  const data = trpc.ai.validateJournals.useQuery({});
  const report = data.data;

  const typeLabel: Record<string, string> = {
    imbalance: "대차 불균형",
    unusual_pair: "비정상 계정조합",
    round_number: "라운드 넘버",
    off_hours: "비업무시간",
    sequence_gap: "번호 누락",
  };

  return (
    <div className="space-y-2.5">
      <h2 className="text-sm font-semibold flex items-center gap-2">
        <BookCheck className="w-5 h-5 text-indigo-600" /> 분개 검증 AI
      </h2>

      {data.isLoading ? (
        <Card><CardContent className="flex items-center justify-center py-6"><Loader2 className="w-6 h-6 animate-spin" /></CardContent></Card>
      ) : !report ? (
        <Card><CardContent className="py-6 text-center text-muted-foreground">데이터 없음</CardContent></Card>
      ) : (
        <>
          {/* 요약 */}
          <div className="grid grid-cols-4 gap-2">
            <Card><CardContent className="py-2.5 px-3 text-center">
              <div className="text-xs text-muted-foreground">검증 기간</div>
              <div className="text-sm font-medium">{report.period}</div>
            </CardContent></Card>
            <Card><CardContent className="py-2.5 px-3 text-center">
              <div className="text-xs text-muted-foreground">총 분개</div>
              <div className="text-xl font-bold">{report.stats.totalEntries}건</div>
            </CardContent></Card>
            <Card className={report.stats.criticalCount > 0 ? "border-red-300 bg-red-50" : ""}>
              <CardContent className="py-2.5 px-3 text-center">
                <div className="text-xs text-muted-foreground">위험 이슈</div>
                <div className="text-xl font-bold text-red-600">{report.stats.criticalCount}</div>
              </CardContent></Card>
            <Card><CardContent className="py-2.5 px-3 text-center">
              <div className="text-xs text-muted-foreground">전체 이슈</div>
              <div className="text-xl font-bold">{report.stats.issueCount}</div>
            </CardContent></Card>
          </div>

          {report.issues.length === 0 ? (
            <Card><CardContent className="py-4 text-center text-muted-foreground">
              <CheckCircle className="w-10 h-10 mx-auto mb-2 text-green-500" />
              <p>분개 이상 항목이 발견되지 않았습니다.</p>
            </CardContent></Card>
          ) : (
            <div className="space-y-2">
              {report.issues.map((issue: any, i: number) => (
                <Card key={i} className={issue.severity === "critical" ? "border-red-200" : issue.severity === "high" ? "border-orange-200" : ""}>
                  <CardContent className="py-2.5 px-3">
                    <div className="flex items-start gap-2">
                      <Badge variant="outline" className="shrink-0">{typeLabel[issue.type] || issue.type}</Badge>
                      <div className="flex-1">
                        <p className="font-medium text-sm">{issue.title}</p>
                        <p className="text-sm text-muted-foreground mt-1">{issue.description}</p>
                      </div>
                      <SeverityBadge severity={issue.severity} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertOctagon, CheckCircle, Loader2,
} from "lucide-react";

// ============================================================================
// ERP AI Tab 1: 비용 이상탐지
// ============================================================================
export function ExpenseAnomalyTab() {
  const data = trpc.ai.detectExpenseAnomalies.useQuery();
  const report = data.data;

  const sevColor: Record<string, string> = {
    critical: "text-red-600 bg-red-50 border-red-200",
    high: "text-orange-600 bg-orange-50 border-orange-200",
    medium: "text-yellow-600 bg-yellow-50 border-yellow-200",
    low: "text-blue-600 bg-blue-50 border-blue-200",
  };

  return (
    <div className="space-y-2.5">
      <h2 className="text-sm font-semibold flex items-center gap-2">
        <AlertOctagon className="w-5 h-5 text-red-500" /> 비용 이상탐지
      </h2>

      {data.isLoading ? (
        <Card><CardContent className="flex items-center justify-center py-6"><Loader2 className="w-6 h-6 animate-spin" /></CardContent></Card>
      ) : !report || report.anomalies.length === 0 ? (
        <Card><CardContent className="py-6 text-center text-muted-foreground">
          <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-500 opacity-50" />
          <p>비용 이상 항목이 없습니다.</p>
        </CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Card className="border-red-200 bg-red-50"><CardContent className="py-2.5 px-3 text-center">
              <div className="text-lg font-bold text-red-600">{report.criticalCount}</div>
              <div className="text-xs text-muted-foreground">위험</div>
            </CardContent></Card>
            <Card className="border-orange-200 bg-orange-50"><CardContent className="py-2.5 px-3 text-center">
              <div className="text-lg font-bold text-orange-600">{report.highCount}</div>
              <div className="text-xs text-muted-foreground">높음</div>
            </CardContent></Card>
            <Card><CardContent className="py-2.5 px-3 text-center">
              <div className="text-lg font-bold">{report.anomalies.length}</div>
              <div className="text-xs text-muted-foreground">전체</div>
            </CardContent></Card>
          </div>

          <div className="space-y-2">
            {report.anomalies.map((a: any, i: number) => (
              <Card key={i} className={`border ${sevColor[a.severity] || ""}`}>
                <CardContent className="py-2.5 px-3">
                  <div className="flex items-start gap-2">
                    <Badge variant="outline" className={sevColor[a.severity]}>{a.severity}</Badge>
                    <div className="flex-1">
                      <p className="font-medium text-sm">{a.title}</p>
                      <p className="text-sm text-muted-foreground mt-1">{a.description}</p>
                      {a.recommendations?.length > 0 && (
                        <div className="mt-2 text-xs text-muted-foreground">
                          {a.recommendations.map((r: string, j: number) => <span key={j} className="mr-2">* {r}</span>)}
                        </div>
                      )}
                    </div>
                    {a.amount && <span className="text-sm font-mono font-medium shrink-0">{Number(a.amount).toLocaleString()}원</span>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

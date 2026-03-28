import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle, CheckCircle, RefreshCw, Loader2, Brain,
} from "lucide-react";
import { SeverityBadge } from "./SeverityBadge";

// ============================================================================
// P8-2: 이상탐지 탭
// ============================================================================
export function AnomalyTab() {
  const anomalyQuery = trpc.ai.detectAnomalies.useQuery(undefined, { refetchOnWindowFocus: false });
  const data = anomalyQuery.data;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-orange-500" />
          AI 이상 패턴 탐지
        </h2>
        <Button variant="outline" size="sm" onClick={() => anomalyQuery.refetch()}>
          <RefreshCw className="w-4 h-4 mr-1" /> 재분석
        </Button>
      </div>

      {anomalyQuery.isLoading && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />데이터 분석 중...</div>}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Card><CardContent className="py-2.5 px-3 text-center">
              <div className="text-xl font-bold">{data.totalAnomalies}</div>
              <p className="text-sm text-muted-foreground">총 이상 감지</p>
            </CardContent></Card>
            <Card className={data.criticalCount > 0 ? "border-red-300 bg-red-50" : ""}>
              <CardContent className="py-2.5 px-3 text-center">
                <div className="text-xl font-bold text-red-600">{data.criticalCount}</div>
                <p className="text-sm text-muted-foreground">위험 등급</p>
              </CardContent>
            </Card>
          </div>

          {data.aiSummary && (
            <Card className="border-indigo-200 bg-indigo-50">
              <CardContent className="py-2 px-3"><h4 className="text-xs font-semibold flex items-center gap-2"><Brain className="w-4 h-4" /> AI 종합 분석</h4><p className="text-sm whitespace-pre-wrap">{data.aiSummary}</p></CardContent>
            </Card>
          )}

          {data.anomalies.map((anomaly: any, i: number) => (
            <Card key={i} className={anomaly.severity === "critical" ? "border-red-300" : anomaly.severity === "high" ? "border-orange-300" : ""}>
              <CardContent className="py-2.5 px-3">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <SeverityBadge severity={anomaly.severity} />
                    <span className="font-medium">{anomaly.title}</span>
                  </div>
                  {anomaly.zScore && <span className="text-xs text-muted-foreground">Z-score: {anomaly.zScore}</span>}
                </div>
                <p className="text-sm text-muted-foreground mb-2">{anomaly.description}</p>
                {anomaly.possibleCauses && (
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium">가능한 원인:</span> {anomaly.possibleCauses.join(", ")}
                  </div>
                )}
                {anomaly.recommendedActions && (
                  <div className="text-xs text-blue-600 mt-1">
                    <span className="font-medium">권장 조치:</span> {anomaly.recommendedActions.join(", ")}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}

          {data.totalAnomalies === 0 && (
            <Card><CardContent className="pt-6 text-center text-muted-foreground">
              <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-500" />
              이상 패턴이 감지되지 않았습니다
            </CardContent></Card>
          )}
        </>
      )}
    </div>
  );
}

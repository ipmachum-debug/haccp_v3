import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle, ChevronRight, RefreshCw, Loader2, Brain,
} from "lucide-react";
import { SeverityBadge } from "./SeverityBadge";

// ============================================================================
// P8-3: 예측분석 탭
// ============================================================================
export function PredictionTab() {
  const predQuery = trpc.ai.getPredictions.useQuery(undefined, { refetchOnWindowFocus: false });
  const data = predQuery.data;

  const RISK_COLORS: Record<string, string> = {
    critical: "border-red-300 bg-red-50",
    high: "border-orange-300 bg-orange-50",
    medium: "border-yellow-300 bg-yellow-50",
    low: "border-green-300 bg-green-50",
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <ChevronRight className="w-5 h-5 text-blue-500" />
          AI 예측 분석
        </h2>
        <Button variant="outline" size="sm" onClick={() => predQuery.refetch()}>
          <RefreshCw className="w-4 h-4 mr-1" /> 재분석
        </Button>
      </div>

      {predQuery.isLoading && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />예측 분석 중...</div>}

      {data && (
        <>
          {data.aiNarrative && (
            <Card className="border-indigo-200 bg-indigo-50">
              <CardContent className="py-2 px-3"><h4 className="text-xs font-semibold flex items-center gap-2"><Brain className="w-4 h-4" /> AI 전망</h4><p className="text-sm whitespace-pre-wrap">{data.aiNarrative}</p></CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {data.predictions.map((pred: any, i: number) => (
              <Card key={i} className={RISK_COLORS[pred.riskLevel] || ""}>
                <CardContent className="py-2.5 px-3">
                  <div className="flex items-start justify-between mb-2">
                    <span className="font-medium text-sm">{pred.title}</span>
                    <Badge variant="outline" className="text-xs">
                      {pred.trend === "up" ? "\u2191" : pred.trend === "down" ? "\u2193" : "\u2192"} {pred.timeframe}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">{pred.description}</p>
                  <div className="flex items-center gap-2.5 text-xs">
                    <span>신뢰도: <strong>{pred.confidence}</strong></span>
                    <SeverityBadge severity={pred.riskLevel} />
                  </div>
                  {pred.recommendations.length > 0 && (
                    <div className="mt-2 text-xs text-blue-600">
                      {pred.recommendations.map((r: string, j: number) => <div key={j}>- {r}</div>)}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {data.predictions.length === 0 && (
            <Card><CardContent className="pt-6 text-center text-muted-foreground">
              <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-500" />
              현재 주의가 필요한 예측이 없습니다
            </CardContent></Card>
          )}
        </>
      )}
    </div>
  );
}

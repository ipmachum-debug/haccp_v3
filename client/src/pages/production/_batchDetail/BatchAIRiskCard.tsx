/**
 * BatchDetail 분해 — 배치 AI 리스크 요약 카드.
 */
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Brain,
  Shield,
  ClipboardCheck,
  AlertTriangle,
  TrendingUp,
  XCircle,
} from "lucide-react";

type AiAlert = {
  id: number;
  level?: string;
  severity?: string;
  title?: string;
  message?: string;
  [k: string]: unknown;
};

export function BatchAIRiskCard({ batchId }: { batchId: number }) {
  const risk = trpc.ai.batchRiskSummary.useQuery(
    { batchId },
    { enabled: !!batchId, refetchInterval: 60000 }
  );

  if (!risk.data?.success || (risk.data.alertCount === 0 && !risk.data.riskScore)) {
    return null; // 데이터 없으면 카드 숨김
  }

  const data = risk.data;
  const riskColors: Record<string, string> = {
    critical: "border-red-400 bg-red-50",
    high: "border-orange-400 bg-orange-50",
    medium: "border-yellow-300 bg-yellow-50",
    low: "border-green-300 bg-green-50",
  };
  const riskLabels: Record<string, string> = {
    critical: "위험",
    high: "높음",
    medium: "보통",
    low: "양호",
  };
  const riskTextColors: Record<string, string> = {
    critical: "text-red-700",
    high: "text-orange-700",
    medium: "text-yellow-700",
    low: "text-green-700",
  };

  const level = data.riskLevel || "low";

  return (
    <Card className={`${riskColors[level] || ""}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Brain className="w-5 h-5 text-indigo-600" />
          AI 리스크 요약
          {data.riskScore !== null && (
            <Badge variant="outline" className={`ml-auto text-sm font-bold ${riskTextColors[level]}`}>
              {riskLabels[level]} ({data.riskScore}점)
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {/* 리스크 지표 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-red-500" />
              <div>
                <div className="text-xs text-muted-foreground">CCP 이탈</div>
                <div className="font-semibold">{data.ccpDeviationCount}건</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-orange-500" />
              <div>
                <div className="text-xs text-muted-foreground">체크리스트 누락</div>
                <div className="font-semibold">{data.checklistMissing}건</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-500" />
              <div>
                <div className="text-xs text-muted-foreground">AI 알림</div>
                <div className="font-semibold">{data.alertCount}건</div>
              </div>
            </div>
            {data.yieldDeviation !== null && (
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-500" />
                <div>
                  <div className="text-xs text-muted-foreground">수율 편차</div>
                  <div className="font-semibold">
                    {data.yieldDeviation > 0 ? "+" : ""}{data.yieldDeviation}%
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 심각도별 알림 수 */}
          {data.alertCount > 0 && (
            <div className="flex gap-3 text-xs">
              {data.bySeverity.critical > 0 && (
                <span className="flex items-center gap-1 text-red-600 font-medium">
                  <XCircle className="w-3 h-3" /> 위험 {data.bySeverity.critical}
                </span>
              )}
              {data.bySeverity.high > 0 && (
                <span className="flex items-center gap-1 text-orange-600 font-medium">
                  <AlertTriangle className="w-3 h-3" /> 높음 {data.bySeverity.high}
                </span>
              )}
              {data.bySeverity.medium > 0 && (
                <span className="text-yellow-600 font-medium">보통 {data.bySeverity.medium}</span>
              )}
              {data.bySeverity.low > 0 && (
                <span className="text-blue-600">낮음 {data.bySeverity.low}</span>
              )}
            </div>
          )}

          {/* 최근 알림 목록 (최대 3개) */}
          {data.alerts.length > 0 && (
            <div className="space-y-1 mt-2 border-t pt-2">
              {data.alerts.slice(0, 3).map((alert: AiAlert) => (
                <div key={alert.id} className="flex items-start gap-2 text-sm">
                  <Badge variant="outline" className={`text-[10px] shrink-0 ${
                    alert.severity === "critical" ? "bg-red-100 text-red-700" :
                    alert.severity === "high" ? "bg-orange-100 text-orange-700" :
                    "bg-yellow-100 text-yellow-700"
                  }`}>
                    {alert.severity === "critical" ? "위험" : alert.severity === "high" ? "높음" : "보통"}
                  </Badge>
                  <span className="text-muted-foreground truncate">{alert.title}</span>
                </div>
              ))}
              {data.alerts.length > 3 && (
                <p className="text-xs text-muted-foreground">외 {data.alerts.length - 3}건 더...</p>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

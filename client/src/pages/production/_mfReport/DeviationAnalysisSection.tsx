/**
 * MfReportList 분해 — 오차 분석 섹션.
 * 품목제조보고 버전별 실제 배치 데이터 vs 법적 배합비 오차 + 수정 제안.
 */
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle } from "lucide-react";

export function DeviationAnalysisSection({ versionId }: { versionId: number }) {
  const { data: analysis, isLoading } = trpc.mfReport.getDeviationAnalysis.useQuery(
    { versionId },
    { enabled: !!versionId }
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        <span className="text-sm text-muted-foreground">오차 분석 데이터 로딩 중...</span>
      </div>
    );
  }

  if (!analysis || !analysis.materialAnalysis || analysis.materialAnalysis.length === 0) {
    return (
      <div className="text-center py-4 text-sm text-muted-foreground">
        완료된 배치 데이터가 없어 오차 분석을 수행할 수 없습니다.
        <br />배치 생산이 진행되면 자동으로 분석 데이터가 축적됩니다.
      </div>
    );
  }

  const getConfidenceBadge = (level: string) => {
    switch (level) {
      case "stable": return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">안정</Badge>;
      case "moderate": return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">보통</Badge>;
      case "initial": return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">초기</Badge>;
      default: return <Badge variant="outline">데이터 부족</Badge>;
    }
  };

  const getDeviationColor = (deviation: number | null) => {
    if (deviation === null) return "";
    const abs = Math.abs(deviation);
    if (abs > 2.0) return "text-red-600 dark:text-red-400 font-bold";
    if (abs > 1.0) return "text-orange-600 dark:text-orange-400 font-semibold";
    if (abs > 0.5) return "text-yellow-600 dark:text-yellow-400";
    return "text-green-600 dark:text-green-400";
  };

  const hasSuggestions = analysis.materialAnalysis.some((m: any) => m.suggestion);

  return (
    <div className="space-y-4">
      {/* 요약 통계 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-muted/50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold">{analysis.totalBatches}</div>
          <div className="text-xs text-muted-foreground">총 배치 수</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold">{analysis.completedBatchesWithActual}</div>
          <div className="text-xs text-muted-foreground">실측 데이터 보유</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold">{analysis.materialAnalysis.length}</div>
          <div className="text-xs text-muted-foreground">분석 원재료 수</div>
        </div>
      </div>

      {/* 원재료별 오차 분석 테이블 */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="text-left p-2 font-medium">원재료</th>
              <th className="text-right p-2 font-medium">법적 (%)</th>
              <th className="text-right p-2 font-medium">보정 (%)</th>
              <th className="text-right p-2 font-medium">실제 평균 (%)</th>
              <th className="text-right p-2 font-medium">오차</th>
              <th className="text-right p-2 font-medium">표준편차</th>
              <th className="text-center p-2 font-medium">배치 수</th>
              <th className="text-center p-2 font-medium">신뢰도</th>
            </tr>
          </thead>
          <tbody>
            {analysis.materialAnalysis.map((mat: any, idx: number) => (
              <tr key={idx} className={`border-b hover:bg-muted/20 ${mat.suggestion ? "bg-orange-50 dark:bg-orange-950/20" : ""}`}>
                <td className="p-2 font-medium">{mat.materialName}</td>
                <td className="p-2 text-right font-mono text-muted-foreground">{mat.legalPct.toFixed(1)}</td>
                <td className="p-2 text-right font-mono">{mat.correctedPct.toFixed(1)}</td>
                <td className="p-2 text-right font-mono">
                  {mat.avgActualRatio !== null ? mat.avgActualRatio.toFixed(2) : "-"}
                </td>
                <td className={`p-2 text-right font-mono ${getDeviationColor(mat.avgDeviation)}`}>
                  {mat.avgDeviation !== null ? `${mat.avgDeviation > 0 ? "+" : ""}${mat.avgDeviation.toFixed(2)}%` : "-"}
                </td>
                <td className="p-2 text-right font-mono text-muted-foreground">
                  {mat.stdDeviation !== null ? `±${mat.stdDeviation.toFixed(2)}` : "-"}
                </td>
                <td className="p-2 text-center">{mat.batchCount}</td>
                <td className="p-2 text-center">{getConfidenceBadge(mat.confidenceLevel)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 수정 제안 */}
      {hasSuggestions && (
        <div className="border border-orange-200 dark:border-orange-800 rounded-lg p-4 bg-orange-50 dark:bg-orange-950/30">
          <h4 className="font-semibold text-orange-800 dark:text-orange-200 mb-2 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            품목제조보고 수정 검토 제안
          </h4>
          <p className="text-xs text-orange-600 dark:text-orange-400 mb-3">
            아래 원재료는 실제 생산 데이터와 법적 배합비 간 유의미한 차이가 감지되었습니다.
            법적 배합비는 자동으로 변경되지 않으며, 수정이 필요한 경우 새로운 버전을 생성해야 합니다.
          </p>
          <div className="space-y-2">
            {analysis.materialAnalysis
              .filter((m: any) => m.suggestion)
              .map((mat: any, idx: number) => (
                <div key={idx} className="text-sm p-2 bg-white dark:bg-gray-900 rounded border border-orange-100 dark:border-orange-900">
                  <span className="font-medium">{mat.materialName}:</span>{" "}
                  <span className="text-muted-foreground">{mat.suggestion}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* 범례 */}
      <div className="text-xs text-muted-foreground border-t pt-3 space-y-1">
        <p><strong>오차 색상 기준:</strong> <span className="text-green-600">0.5% 이하</span> | <span className="text-yellow-600">0.5~1.0%</span> | <span className="text-orange-600">1.0~2.0%</span> | <span className="text-red-600">2.0% 초과</span></p>
        <p><strong>신뢰도 등급:</strong> 데이터 부족 (5회 미만) &rarr; 초기 (5~9회) &rarr; 보통 (10~19회) &rarr; 안정 (20회 이상)</p>
        <p><strong>수정 제안 조건:</strong> 배치 10회 이상 + 평균 오차 &plusmn;1% 이상 + 표준편차 2% 미만</p>
      </div>
    </div>
  );
}

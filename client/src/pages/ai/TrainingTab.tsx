import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle, BookOpen, RefreshCw, Loader2, Brain,
} from "lucide-react";

// ============================================================================
// P8-8: 교육 추천 탭
// ============================================================================
export function TrainingTab() {
  const trainQuery = trpc.ai.getTrainingRecommendations.useQuery(undefined, { refetchOnWindowFocus: false });
  const data = trainQuery.data;

  const PRIORITY_COLORS: Record<string, string> = {
    urgent: "bg-red-100 text-red-800 border-red-300",
    high: "bg-orange-100 text-orange-800 border-orange-300",
    medium: "bg-yellow-100 text-yellow-800 border-yellow-300",
    low: "bg-blue-100 text-blue-800 border-blue-300",
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-green-600" />
          AI 교육 추천
        </h2>
        <Button variant="outline" size="sm" onClick={() => trainQuery.refetch()}>
          <RefreshCw className="w-4 h-4 mr-1" /> 재분석
        </Button>
      </div>

      {trainQuery.isLoading && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />교육 필요도 분석 중...</div>}

      {data && (
        <>
          {data.overallAssessment && (
            <Card className="border-indigo-200 bg-indigo-50">
              <CardContent className="py-2 px-3"><h4 className="text-xs font-semibold flex items-center gap-2"><Brain className="w-4 h-4" /> AI 종합 평가</h4><p className="text-sm whitespace-pre-wrap">{data.overallAssessment}</p></CardContent>
            </Card>
          )}

          {data.scheduleSuggestion.length > 0 && (
            <Card>
              <CardContent className="py-2 px-3"><h4 className="text-xs font-semibold">추천 교육 일정 (4주)</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>주차</TableHead>
                      <TableHead>교육명</TableHead>
                      <TableHead>대상</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.scheduleSuggestion.map((s: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell>{s.week}주차</TableCell>
                        <TableCell>{s.training}</TableCell>
                        <TableCell>{s.target}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {data.recommendations.map((rec: any, i: number) => (
            <Card key={i} className={rec.priority === "urgent" ? "border-red-300" : ""}>
              <CardContent className="py-2.5 px-3">
                <div className="flex items-start justify-between mb-2">
                  <span className="font-medium">{rec.title}</span>
                  <Badge variant="outline" className={PRIORITY_COLORS[rec.priority] || ""}>
                    {rec.priority === "urgent" ? "긴급" : rec.priority === "high" ? "높음" : rec.priority === "medium" ? "보통" : "낮음"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mb-2">{rec.description}</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><strong>대상:</strong> {rec.targetAudience.join(", ")}</div>
                  <div><strong>소요시간:</strong> {rec.suggestedDuration}</div>
                  <div><strong>근거:</strong> {rec.reason}</div>
                  <div><strong>관련 건수:</strong> {rec.relatedIncidents}건</div>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  <strong>핵심 주제:</strong> {rec.keyTopics.join(" / ")}
                </div>
              </CardContent>
            </Card>
          ))}

          {data.recommendations.length === 0 && (
            <Card><CardContent className="pt-6 text-center text-muted-foreground">
              <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-500" />
              현재 추가 교육이 필요한 항목이 없습니다
            </CardContent></Card>
          )}
        </>
      )}
    </div>
  );
}

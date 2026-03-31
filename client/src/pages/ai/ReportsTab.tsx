import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  FileText, Loader2, Brain,
} from "lucide-react";

// ============================================================================
// P8-5: AI 보고서 탭
// ============================================================================
export function ReportsTab() {
  const [reportType, setReportType] = useState<string>("executive");
  const execMutation = trpc.ai.generateExecutiveSummary.useMutation();
  const haccpMutation = trpc.ai.generateHaccpNarrative.useMutation();
  const financialMutation = trpc.ai.generateFinancialNarrative.useMutation();

  const isLoading = execMutation.isPending || haccpMutation.isPending || financialMutation.isPending;
  const currentData = reportType === "executive" ? execMutation.data
    : reportType === "haccp" ? haccpMutation.data
    : financialMutation.data;

  const handleGenerate = () => {
    if (reportType === "executive") execMutation.mutate({});
    else if (reportType === "haccp") haccpMutation.mutate({});
    else {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
      const end = now.toISOString().split("T")[0];
      financialMutation.mutate({ startDate: start, endDate: end });
    }
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <FileText className="w-5 h-5 text-teal-600" />
          AI 보고서 생성
        </h2>
        <div className="flex items-center gap-2">
          <Select value={reportType} onValueChange={setReportType}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="executive">경영진 요약</SelectItem>
              <SelectItem value="haccp">HACCP 주간보고</SelectItem>
              <SelectItem value="financial">재무 월간보고</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleGenerate} disabled={isLoading}>
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Brain className="w-4 h-4 mr-1" />}
            보고서 생성
          </Button>
        </div>
      </div>

      {currentData && (
        <div className="space-y-2.5">
          <Card>
            <CardContent className="py-2.5 px-3">
              <h3 className="text-sm font-semibold">{(currentData as any).title}</h3>
              <p className="text-[11px] text-muted-foreground mb-2">기간: {(currentData as any).period} | 생성: {(currentData as any).generatedAt?.split("T")[0]}</p>
              <div className="prose prose-sm max-w-none whitespace-pre-wrap">{(currentData as any).narrative}</div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {(currentData as any).highlights?.length > 0 && (
              <Card className="border-green-200 bg-green-50">
                <CardContent className="py-2 px-3">
                  <h4 className="text-xs font-semibold text-green-700 mb-1">긍정적 지표</h4>
                  <div className="text-xs">{(currentData as any).highlights.map((h: string, i: number) => <div key={i} className="mb-0.5">+ {h}</div>)}</div>
                </CardContent>
              </Card>
            )}
            {(currentData as any).concerns?.length > 0 && (
              <Card className="border-orange-200 bg-orange-50">
                <CardContent className="py-2 px-3">
                  <h4 className="text-xs font-semibold text-orange-700 mb-1">우려 사항</h4>
                  <div className="text-xs">{(currentData as any).concerns.map((c: string, i: number) => <div key={i} className="mb-0.5">! {c}</div>)}</div>
                </CardContent>
              </Card>
            )}
            {(currentData as any).recommendations?.length > 0 && (
              <Card className="border-blue-200 bg-blue-50">
                <CardContent className="py-2 px-3">
                  <h4 className="text-xs font-semibold text-blue-700 mb-1">권장 사항</h4>
                  <div className="text-xs">{(currentData as any).recommendations.map((r: string, i: number) => <div key={i} className="mb-0.5">* {r}</div>)}</div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {!currentData && !isLoading && (
        <Card><CardContent className="pt-6 text-center text-muted-foreground">
          보고서 유형을 선택하고 "보고서 생성" 버튼을 클릭하세요
        </CardContent></Card>
      )}
    </div>
  );
}

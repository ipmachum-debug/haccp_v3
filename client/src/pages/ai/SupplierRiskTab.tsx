import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Shield, RefreshCw, Loader2, Brain,
} from "lucide-react";
import { SeverityBadge } from "./SeverityBadge";

// ============================================================================
// P8-7: 공급업체 리스크 탭
// ============================================================================
export function SupplierRiskTab() {
  const riskQuery = trpc.ai.analyzeSupplierRisk.useQuery(undefined, { refetchOnWindowFocus: false });
  const data = riskQuery.data;

  const RISK_BG: Record<string, string> = {
    critical: "bg-red-100", high: "bg-orange-100", medium: "bg-yellow-50", low: "",
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Shield className="w-5 h-5 text-purple-500" />
          공급업체 리스크 분석
        </h2>
        <Button variant="outline" size="sm" onClick={() => riskQuery.refetch()}>
          <RefreshCw className="w-4 h-4 mr-1" /> 재분석
        </Button>
      </div>

      {riskQuery.isLoading && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />공급업체 분석 중...</div>}

      {data && (
        <>
          {data.aiSummary && (
            <Card className="border-indigo-200 bg-indigo-50">
              <CardContent className="py-2 px-3"><h4 className="text-xs font-semibold flex items-center gap-2"><Brain className="w-4 h-4" /> AI 종합 분석</h4><p className="text-sm whitespace-pre-wrap">{data.aiSummary}</p></CardContent>
            </Card>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>공급업체</TableHead>
                <TableHead className="text-center">리스크점수</TableHead>
                <TableHead className="text-center">납품지연</TableHead>
                <TableHead className="text-center">불합격률</TableHead>
                <TableHead className="text-center">가격변동</TableHead>
                <TableHead className="text-center">거래건수</TableHead>
                <TableHead>주요 우려</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.suppliers.map((s: any) => (
                <TableRow key={s.partnerId} className={RISK_BG[s.riskLevel] || ""}>
                  <TableCell className="font-medium">{s.partnerName}</TableCell>
                  <TableCell className="text-center">
                    <SeverityBadge severity={s.riskLevel} /> <span className="ml-1">{s.overallScore}</span>
                  </TableCell>
                  <TableCell className="text-center">{s.metrics.deliveryDelayRate}%</TableCell>
                  <TableCell className="text-center">{s.metrics.qualityRejectRate}%</TableCell>
                  <TableCell className="text-center">{s.metrics.priceVolatility}%</TableCell>
                  <TableCell className="text-center">{s.metrics.transactionCount}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                    {s.concerns.join("; ") || "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {data.suppliers.length === 0 && (
            <Card><CardContent className="pt-6 text-center text-muted-foreground">분석 가능한 공급업체가 없습니다</CardContent></Card>
          )}
        </>
      )}
    </div>
  );
}

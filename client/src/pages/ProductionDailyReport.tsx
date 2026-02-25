import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs"
import { TabsList } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { CalendarIcon, Download, FileText, AlertCircle, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { generateDailyReportPDF } from "@/lib/pdfGenerator";
import { toast } from "sonner";

export default function ProductionDailyReport() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const dateString = format(selectedDate, "yyyy-MM-dd");

  // API 호출
  const { data: production, isLoading: loadingProduction } = trpc.dailyReport.getProduction.useQuery({ date: dateString });
  const { data: ccpRecords, isLoading: loadingCcp } = trpc.dailyReport.getCcpRecords.useQuery({ date: dateString });
  const { data: issues, isLoading: loadingIssues } = trpc.dailyReport.getIssues.useQuery({ date: dateString });
  const { data: summary, isLoading: loadingSummary } = trpc.dailyReport.getSummary.useQuery({ date: dateString });

  const handleDownloadPDF = () => {
    if (!production || !ccpRecords || !issues || !summary) {
      toast.error("데이터를 불러오는 중입니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    try {
      generateDailyReportPDF({
        date: format(selectedDate, "yyyy-MM-dd"),
        summary: {
          totalBatches: summary.batches.total,
          completedBatches: summary.batches.completed,
          ccpChecks: summary.ccp.totalRecords,
          ccpCompliance: parseFloat(summary.ccp.complianceRate),
        },
        production: production.map(p => ({
          batchCode: p.batchCode,
          productName: p.productName || "-",
          quantity: p.plannedQuantity || "-",
          status: p.status,
          startTime: p.startTime,
          endTime: p.endTime,
        })),
        ccpRecords: ccpRecords.map(c => ({
          ccpType: c.ccpType || "-",
          result: c.result || "-",
          measuredAt: c.measuredAt || new Date(),
          isDeviation: c.result === "FAIL",
        })),
        issues: issues.map(i => ({
          batchCode: i.batchCode || "-",
          issueType: i.ccpType || "기타",
          description: i.note || "-",
          createdAt: i.measuredAt || new Date(),
        })),
      });
      toast.success("PDF가 다운로드되었습니다.");
    } catch (error) {
      console.error("PDF 생성 오류:", error);
      toast.error("PDF 생성 중 오류가 발생했습니다.");
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      planned: { label: "계획됨", variant: "outline" },
      in_progress: { label: "진행 중", variant: "default" },
      paused: { label: "일시중지", variant: "secondary" },
      completed: { label: "완료", variant: "default" },
      failed: { label: "실패", variant: "destructive" },
      cancelled: { label: "취소됨", variant: "destructive" },
      shipped: { label: "출하됨", variant: "default" },
      archived: { label: "보관됨", variant: "secondary" },
    };
    const config = statusMap[status] || { label: status, variant: "outline" as const };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getCcpResultBadge = (result: string | null) => {
    if (!result) return <Badge variant="outline">미입력</Badge>;
    if (result === "PASS") return <Badge variant="default" className="bg-green-600">적합</Badge>;
    if (result === "FAIL") return <Badge variant="destructive">부적합</Badge>;
    return <Badge variant="outline">{result}</Badge>;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">생산일보</h1>
            <p className="text-muted-foreground mt-1">일별 생산 실적 및 CCP 기록 조회</p>
          </div>
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-[240px] justify-start text-left font-normal")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(selectedDate, "PPP", { locale: ko })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar mode="single" selected={selectedDate} onSelect={(date) => date && setSelectedDate(date)} initialFocus />
              </PopoverContent>
            </Popover>
            <Button variant="outline" size="icon" onClick={handleDownloadPDF} disabled={loadingProduction || loadingCcp || loadingIssues || loadingSummary}>
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* 요약 통계 */}
        {loadingSummary ? (
          <div className="grid gap-4 md:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <div className="h-4 bg-muted animate-pulse rounded w-24" />
                </CardHeader>
                <CardContent>
                  <div className="h-8 bg-muted animate-pulse rounded w-16" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>총 배치</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summary?.batches.total || 0}건</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>완료 배치</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{summary?.batches.completed || 0}건</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>CCP 점검</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summary?.ccp.totalRecords || 0}건</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>CCP 준수율</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">{summary?.ccp.complianceRate || "0.00"}%</div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* 탭 */}
        <Tabs defaultValue="production" className="space-y-4">
          <TabsList>
            <TabsTrigger value="production">
              <FileText className="mr-2 h-4 w-4" />
              생산 실적
            </TabsTrigger>
            <TabsTrigger value="ccp">
              <CheckCircle2 className="mr-2 h-4 w-4" />
              CCP 기록
            </TabsTrigger>
            <TabsTrigger value="issues">
              <AlertCircle className="mr-2 h-4 w-4" />
              이상 사항
            </TabsTrigger>
          </TabsList>

          {/* 생산 실적 탭 */}
          <TabsContent value="production" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>일별 생산 실적</CardTitle>
                <CardDescription>{format(selectedDate, "yyyy년 MM월 dd일", { locale: ko })} 생산 배치 목록</CardDescription>
              </CardHeader>
              <CardContent>
                {loadingProduction ? (
                  <div className="text-center py-8 text-muted-foreground">로딩 중...</div>
                ) : !production || production.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">해당 날짜에 생산 기록이 없습니다.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>배치 번호</TableHead>
                        <TableHead>제품명</TableHead>
                        <TableHead className="text-right">계획 수량</TableHead>
                        <TableHead className="text-right">실제 수량</TableHead>
                        <TableHead>상태</TableHead>
                        <TableHead>시작 시간</TableHead>
                        <TableHead>종료 시간</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {production.map((batch) => (
                        <TableRow key={batch.batchId}>
                          <TableCell className="font-medium">{batch.batchCode}</TableCell>
                          <TableCell>{batch.productName}</TableCell>
                          <TableCell className="text-right">{batch.plannedQuantity}</TableCell>
                          <TableCell className="text-right">{batch.actualQuantity || "-"}</TableCell>
                          <TableCell>{getStatusBadge(batch.status)}</TableCell>
                          <TableCell>{batch.startTime ? format(new Date(batch.startTime), "HH:mm") : "-"}</TableCell>
                          <TableCell>{batch.endTime ? format(new Date(batch.endTime), "HH:mm") : "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* CCP 기록 탭 */}
          <TabsContent value="ccp" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>CCP 점검 기록</CardTitle>
                <CardDescription>{format(selectedDate, "yyyy년 MM월 dd일", { locale: ko })} CCP 점검 내역</CardDescription>
              </CardHeader>
              <CardContent>
                {loadingCcp ? (
                  <div className="text-center py-8 text-muted-foreground">로딩 중...</div>
                ) : !ccpRecords || ccpRecords.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">해당 날짜에 CCP 기록이 없습니다.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>배치 번호</TableHead>
                        <TableHead>CCP 유형</TableHead>
                        <TableHead>점검 결과</TableHead>
                        <TableHead>점검 시간</TableHead>
                        <TableHead>비고</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ccpRecords.map((record) => (
                        <TableRow key={record.rowId}>
                          <TableCell className="font-medium">{record.batchCode}</TableCell>
                          <TableCell>{record.ccpType}</TableCell>
                          <TableCell>{getCcpResultBadge(record.result)}</TableCell>
                          <TableCell>{record.measuredAt ? format(new Date(record.measuredAt), "HH:mm:ss") : "-"}</TableCell>
                          <TableCell className="max-w-xs truncate">{record.note || "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 이상 사항 탭 */}
          <TabsContent value="issues" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>이상 사항</CardTitle>
                <CardDescription>{format(selectedDate, "yyyy년 MM월 dd일", { locale: ko })} CCP 부적합 건</CardDescription>
              </CardHeader>
              <CardContent>
                {loadingIssues ? (
                  <div className="text-center py-8 text-muted-foreground">로딩 중...</div>
                ) : !issues || issues.length === 0 ? (
                  <div className="text-center py-8 text-green-600 font-medium">
                    <CheckCircle2 className="mx-auto h-12 w-12 mb-2" />
                    해당 날짜에 이상 사항이 없습니다.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>배치 번호</TableHead>
                        <TableHead>제품명</TableHead>
                        <TableHead>CCP 유형</TableHead>
                        <TableHead>점검 결과</TableHead>
                        <TableHead>발생 시간</TableHead>
                        <TableHead>비고</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {issues.map((issue) => (
                        <TableRow key={issue.rowId}>
                          <TableCell className="font-medium">{issue.batchCode}</TableCell>
                          <TableCell>{issue.productName}</TableCell>
                          <TableCell>{issue.ccpType}</TableCell>
                          <TableCell>{getCcpResultBadge(issue.result)}</TableCell>
                          <TableCell>{issue.measuredAt ? format(new Date(issue.measuredAt), "HH:mm:ss") : "-"}</TableCell>
                          <TableCell className="max-w-xs">{issue.note || "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

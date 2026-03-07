import { useState } from "react";
import { trpc } from "../lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Badge } from "../components/ui/badge";
import { FileDown, FileText, Calendar, BarChart3, AlertTriangle, CheckCircle2, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function CcpReportGenerator() {
  const [reportType, setReportType] = useState<string>("daily");
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });
  const [selectedCcpType, setSelectedCcpType] = useState<string>("all");

  // CCP 기록 조회 (보고서용)
  const { data: ccpRecords, isLoading } = trpc.ccp.getAllRecords.useQuery({
    ccpType: selectedCcpType === "all" ? undefined : selectedCcpType,
  });

  // Excel export mutation
  const exportMutation = trpc.ccp.exportInspectionHistory.useMutation({
    onSuccess: (result) => {
      const byteCharacters = atob(result.file);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Excel 보고서가 다운로드되었습니다");
    },
    onError: (error) => {
      toast.error(`Excel 보고서 생성 실패: ${error.message}`);
    },
  });

  // PDF 보고서 mutation
  const pdfMutation = trpc.report.generateCcpReport.useMutation({
    onSuccess: (data) => {
      const link = document.createElement("a");
      link.href = `data:application/pdf;base64,${data.pdf}`;
      link.download = data.filename;
      link.click();
      toast.success("PDF 보고서가 다운로드되었습니다");
    },
    onError: (error) => {
      toast.error(`PDF 보고서 생성 실패: ${error.message}`);
    },
  });

  const handleExcelReport = () => {
    exportMutation.mutate({
      startDate: new Date(dateRange.startDate),
      endDate: new Date(dateRange.endDate),
      ccpType: selectedCcpType === "all" ? undefined : selectedCcpType,
    });
  };

  const handlePdfReport = () => {
    if (!dateRange.startDate || !dateRange.endDate) {
      toast.error("기간을 선택해주세요");
      return;
    }
    // deviation은 daily로 처리
    const pdfReportType = reportType === "deviation" ? "daily" : reportType;
    pdfMutation.mutate({
      reportType: pdfReportType as "daily" | "weekly" | "monthly",
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      ccpType: selectedCcpType === "all" ? undefined : selectedCcpType,
    });
  };

  // 기록 필터링
  const filteredRecords = ccpRecords?.filter((record) => {
    if (dateRange.startDate && record.workDate) {
      if (new Date(record.workDate) < new Date(dateRange.startDate)) return false;
    }
    if (dateRange.endDate && record.workDate) {
      if (new Date(record.workDate) > new Date(dateRange.endDate)) return false;
    }
    // 이탈 보고서일 때는 반려/이탈 건만 필터
    if (reportType === "deviation") {
      return record.status === "rejected";
    }
    return true;
  }) || [];

  // 요약 통계 계산
  const totalRecords = filteredRecords.length;
  const approvedRecords = filteredRecords.filter(r => r.status === 'approved').length;
  const deviationRecords = filteredRecords.filter(r => r.status === 'rejected').length;
  const pendingRecords = filteredRecords.filter(r => r.status === 'draft' || r.status === 'submitted').length;

  const reportTypes = [
    { value: "daily", label: "일일 보고서", icon: Calendar, description: "일별 CCP 모니터링 결과 요약", color: "text-blue-600 bg-blue-50 dark:bg-blue-900/20" },
    { value: "weekly", label: "주간 보고서", icon: BarChart3, description: "주간 CCP 모니터링 통계 및 분석", color: "text-green-600 bg-green-50 dark:bg-green-900/20" },
    { value: "monthly", label: "월간 보고서", icon: FileText, description: "월간 CCP 모니터링 종합 보고서", color: "text-purple-600 bg-purple-50 dark:bg-purple-900/20" },
    { value: "deviation", label: "이탈 보고서", icon: AlertTriangle, description: "CCP 이탈 건 상세 및 개선 조치", color: "text-red-600 bg-red-50 dark:bg-red-900/20" },
  ];

  const isPending = exportMutation.isPending || pdfMutation.isPending;

  return (
    <div className="space-y-3">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <h2 className="text-base font-bold flex items-center gap-2">
            <FileText className="h-4 w-4" /> 보고서 생성
          </h2>
          <p className="text-xs text-muted-foreground">
            CCP 모니터링 데이터 기반 보고서 다운로드
          </p>
        </div>
      </div>

      {/* 보고서 유형 선택 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {reportTypes.map((type) => {
          const Icon = type.icon;
          const isSelected = reportType === type.value;
          return (
            <Card
              key={type.value}
              className={`cursor-pointer transition-all hover:shadow-sm ${isSelected ? 'ring-2 ring-primary shadow-sm' : ''}`}
              onClick={() => setReportType(type.value)}
            >
              <CardContent className="pt-3 pb-2 px-3">
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded-md ${isSelected ? 'bg-primary text-primary-foreground' : type.color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-xs">{type.label}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{type.description}</p>
                  </div>
                </div>
                {isSelected && (
                  <div className="mt-2 pt-1.5 border-t flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-primary" />
                    <span className="text-[10px] text-primary font-medium">선택됨</span>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 필터 및 생성 */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm">보고서 조건 설정</CardTitle>
          <CardDescription className="text-xs">
            {reportTypes.find(t => t.value === reportType)?.label} - 기간과 CCP 유형을 선택하세요
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 px-4 pb-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">시작일</Label>
              <Input
                type="date"
                value={dateRange.startDate}
                onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs">종료일</Label>
              <Input
                type="date"
                value={dateRange.endDate}
                onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs">CCP 유형</Label>
              <Select value={selectedCcpType} onValueChange={setSelectedCcpType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  <SelectItem value="CCP-1B">CCP-1B (가열/증숙)</SelectItem>
                  <SelectItem value="CCP-2B">CCP-2B (가열 굽기)</SelectItem>
                  <SelectItem value="CCP-3B">CCP-3B (가열/볶음)</SelectItem>
                  <SelectItem value="CCP-4P">CCP-4P (금속검출)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button onClick={handlePdfReport} disabled={isPending} variant="default" size="sm">
              {pdfMutation.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />PDF 생성 중...</>
              ) : (
                <><Download className="mr-2 h-4 w-4" />PDF 보고서 다운로드</>
              )}
            </Button>
            <Button onClick={handleExcelReport} disabled={isPending} variant="outline" size="sm">
              {exportMutation.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Excel 생성 중...</>
              ) : (
                <><FileDown className="mr-2 h-4 w-4" />Excel 보고서 다운로드</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 요약 통계 */}
      <div className="grid grid-cols-4 gap-2">
        <Card>
          <CardContent className="p-3">
            <div className="text-center">
              <p className="text-lg font-bold">{totalRecords}</p>
              <p className="text-xs text-muted-foreground">총 기록</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-center">
              <p className="text-lg font-bold text-green-600">{approvedRecords}</p>
              <p className="text-xs text-muted-foreground">승인됨</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-center">
              <p className="text-lg font-bold text-red-600">{deviationRecords}</p>
              <p className="text-xs text-muted-foreground">이탈/반려</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-center">
              <p className="text-lg font-bold text-amber-600">{pendingRecords}</p>
              <p className="text-xs text-muted-foreground">대기중</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 미리보기 테이블 */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm">보고서 미리보기</CardTitle>
          <CardDescription className="text-xs">
            {dateRange.startDate} ~ {dateRange.endDate} ({filteredRecords.length}건)
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filteredRecords.length === 0 ? (
            <p className="text-center py-4 text-sm text-muted-foreground">해당 기간에 CCP 기록이 없습니다</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>날짜</TableHead>
                    <TableHead>CCP 유형</TableHead>
                    <TableHead>제품</TableHead>
                    <TableHead>배치</TableHead>
                    <TableHead>상태</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRecords.slice(0, 20).map((record) => (
                    <TableRow key={record.id}>
                      <TableCell>{record.workDate ? new Date(record.workDate).toLocaleDateString('ko-KR') : '-'}</TableCell>
                      <TableCell><Badge variant="outline">{record.ccpType}</Badge></TableCell>
                      <TableCell>{record.productName || '-'}</TableCell>
                      <TableCell>{record.batchCode || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={record.status === 'approved' ? 'default' : record.status === 'rejected' ? 'destructive' : 'secondary'}>
                          {record.status === 'approved' ? '승인' : record.status === 'rejected' ? '반려' : record.status === 'submitted' ? '제출' : '작성중'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredRecords.length > 20 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        ... 외 {filteredRecords.length - 20}건 (보고서에서 전체 확인)
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

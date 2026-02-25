import { useState } from "react";
import { trpc } from "../lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Badge } from "../components/ui/badge";
import { FileDown, FileText, Calendar, BarChart3, AlertTriangle, CheckCircle2 } from "lucide-react";
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
      toast.success("보고서가 다운로드되었습니다");
    },
    onError: (error) => {
      toast.error(`보고서 생성 실패: ${error.message}`);
    },
  });

  const handleGenerateReport = () => {
    exportMutation.mutate({
      startDate: new Date(dateRange.startDate),
      endDate: new Date(dateRange.endDate),
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
    return true;
  }) || [];

  // 요약 통계 계산
  const totalRecords = filteredRecords.length;
  const approvedRecords = filteredRecords.filter(r => r.status === 'approved').length;
  const deviationRecords = filteredRecords.filter(r => r.status === 'rejected').length;
  const pendingRecords = filteredRecords.filter(r => r.status === 'draft' || r.status === 'submitted').length;

  const reportTypes = [
    { value: "daily", label: "일일 보고서", icon: Calendar, description: "일별 CCP 모니터링 결과 요약" },
    { value: "weekly", label: "주간 보고서", icon: BarChart3, description: "주간 CCP 모니터링 통계 및 이탈 분석" },
    { value: "monthly", label: "월간 보고서", icon: FileText, description: "월간 CCP 모니터링 종합 보고서" },
    { value: "deviation", label: "이탈 보고서", icon: AlertTriangle, description: "CCP 이탈 건 상세 보고서 및 개선 조치" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <FileText className="h-5 w-5" /> 보고서 생성
          </h2>
          <p className="text-sm text-muted-foreground">
            CCP 모니터링 데이터를 기반으로 보고서를 생성하고 다운로드합니다
          </p>
        </div>
      </div>

      {/* 보고서 유형 선택 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {reportTypes.map((type) => {
          const Icon = type.icon;
          return (
            <Card
              key={type.value}
              className={`cursor-pointer transition-all hover:shadow-md ${reportType === type.value ? 'ring-2 ring-primary' : ''}`}
              onClick={() => setReportType(type.value)}
            >
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${reportType === type.value ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{type.label}</p>
                    <p className="text-xs text-muted-foreground">{type.description}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 필터 및 생성 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">보고서 조건 설정</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div>
              <Label>시작일</Label>
              <Input
                type="date"
                value={dateRange.startDate}
                onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
              />
            </div>
            <div>
              <Label>종료일</Label>
              <Input
                type="date"
                value={dateRange.endDate}
                onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
              />
            </div>
            <div>
              <Label>CCP 유형</Label>
              <Select value={selectedCcpType} onValueChange={setSelectedCcpType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  <SelectItem value="CCP-1B">CCP-1B (가열)</SelectItem>
                  <SelectItem value="CCP-2B">CCP-2B (냉각)</SelectItem>
                  <SelectItem value="CCP-3B">CCP-3B (교반)</SelectItem>
                  <SelectItem value="CCP-4P">CCP-4P (금속검출)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleGenerateReport} disabled={exportMutation.isPending} className="min-h-[44px]">
              <FileDown className="mr-2 h-4 w-4" />
              {exportMutation.isPending ? "생성 중..." : "Excel 보고서 생성"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 요약 통계 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <p className="text-2xl font-bold">{totalRecords}</p>
              <p className="text-sm text-muted-foreground">총 기록</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">{approvedRecords}</p>
              <p className="text-sm text-muted-foreground">승인됨</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-red-600">{deviationRecords}</p>
              <p className="text-sm text-muted-foreground">이탈/반려</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-amber-600">{pendingRecords}</p>
              <p className="text-sm text-muted-foreground">대기중</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 미리보기 테이블 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">보고서 미리보기</CardTitle>
          <CardDescription>
            {dateRange.startDate} ~ {dateRange.endDate} 기간의 CCP 기록 ({filteredRecords.length}건)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center py-8 text-muted-foreground">로딩 중...</p>
          ) : filteredRecords.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">해당 기간에 CCP 기록이 없습니다</p>
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
                      <TableCell>{record.workDate ? new Date(record.workDate).toLocaleDateString() : '-'}</TableCell>
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
                        ... 외 {filteredRecords.length - 20}건 (Excel 보고서에서 전체 확인)
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

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { FileText, Download, Loader2 } from "lucide-react";

import { todayLocal } from "../../lib/dateUtils";

export default function ReportManagement() {
  const [reportType, setReportType] = useState<"daily" | "weekly" | "monthly">("daily");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [ccpType, setCcpType] = useState("");

  const generateMutation = trpc.report.generateCcpReport.useMutation({
    onSuccess: (data: any) => {
      // Base64 PDF를 다운로드
      const link = document.createElement("a");
      link.href = `data:application/pdf;base64,${data.pdf}`;
      link.download = data.filename;
      link.click();
      
      toast.success("보고서가 생성되었습니다");
    },
    onError: (error: { message: string }) => {
      toast.error(`보고서 생성 실패: ${error.message}`);
    },
  });

  const handleGenerate = () => {
    if (!startDate || !endDate) {
      toast.error("기간을 선택해주세요");
      return;
    }

    generateMutation.mutate({
      reportType,
      startDate,
      endDate,
      ccpType: ccpType || undefined,
    });
  };

  // 오늘 날짜 기본값
  const today = todayLocal();

  return (
    <div className="space-y-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">보고서 관리</h1>
        <p className="text-muted-foreground mt-2">
          CCP 점검 보고서를 생성하고 다운로드합니다
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            CCP 점검 보고서 생성
          </CardTitle>
          <CardDescription>
            일일/주간/월간 CCP 점검 리포트를 PDF로 생성합니다
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="reportType">보고서 유형</Label>
              <Select
                value={reportType}
                onValueChange={(value: "daily" | "weekly" | "monthly") => setReportType(value)}
              >
                <SelectTrigger id="reportType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">일일 보고서</SelectItem>
                  <SelectItem value="weekly">주간 보고서</SelectItem>
                  <SelectItem value="monthly">월간 보고서</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ccpType">CCP 타입 (선택)</Label>
              <Input
                id="ccpType"
                value={ccpType}
                onChange={(e) => setCcpType(e.target.value)}
                placeholder="예: CCP-1A (전체는 빈칸)"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="startDate">시작 날짜</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                max={today}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="endDate">종료 날짜</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                max={today}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              onClick={handleGenerate}
              disabled={generateMutation.isPending}
              className="gap-2"
            >
              {generateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  생성 중...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  보고서 생성
                </>
              )}
            </Button>
          </div>

          <div className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
            <p className="font-medium mb-2">💡 사용 팁:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>일일 보고서: 시작 날짜와 종료 날짜를 같은 날로 설정</li>
              <li>주간 보고서: 7일 간격으로 설정 (예: 월요일~일요일)</li>
              <li>월간 보고서: 해당 월의 첫날과 마지막 날로 설정</li>
              <li>CCP 타입을 지정하면 해당 타입만 포함됩니다</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

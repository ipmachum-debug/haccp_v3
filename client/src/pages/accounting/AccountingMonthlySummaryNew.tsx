import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { Calendar, TrendingUp, TrendingDown, AlertCircle } from "lucide-react";

export default function AccountingMonthlySummaryNew() {
  const [, setLocation] = useLocation();
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [highAmountThreshold, setHighAmountThreshold] = useState(1000000);

  const generateMutation = trpc.accountingMonthly.generateSummary.useMutation({
    onSuccess: (data: any) => {
      toast.success("월 마감 집계가 생성되었습니다.");
      setLocation(`/accounting/monthly-summary/${year}/${month}`);
    },
    onError: (error: any) => {
      toast.error(`월 마감 생성 실패: ${error.message}`);
    },
  });

  const handleGenerate = () => {
    if (year < 2020 || year > 2100) {
      toast.error("유효한 연도를 입력해주세요 (2020-2100)");
      return;
    }
    if (month < 1 || month > 12) {
      toast.error("유효한 월을 입력해주세요 (1-12)");
      return;
    }

    generateMutation.mutate({
      year,
      month,
      highAmountThreshold,
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* 헤더 */}
        <div>
          <h1 className="text-3xl font-bold">새 월 마감 생성</h1>
          <p className="text-muted-foreground mt-1">
            일일 마감 데이터를 기반으로 월간 집계를 생성합니다
          </p>
        </div>

        {/* 입력 폼 */}
        <Card>
          <CardHeader>
            <CardTitle>월 마감 정보</CardTitle>
            <CardDescription>
              집계할 연도와 월을 선택하고 고액 거래 기준 금액을 설정하세요
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="year">연도</Label>
                <Input
                  id="year"
                  type="number"
                  value={year}
                  onChange={(e) => setYear(parseInt(e.target.value))}
                  min={2020}
                  max={2100}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="month">월</Label>
                <Input
                  id="month"
                  type="number"
                  value={month}
                  onChange={(e) => setMonth(parseInt(e.target.value))}
                  min={1}
                  max={12}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="threshold">고액 거래 기준 금액 (원)</Label>
              <Input
                id="threshold"
                type="number"
                value={highAmountThreshold}
                onChange={(e) => setHighAmountThreshold(parseInt(e.target.value))}
                min={0}
                step={100000}
              />
              <p className="text-sm text-muted-foreground">
                이 금액 이상의 거래는 고액 거래로 분류됩니다
              </p>
            </div>

            <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-blue-500 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-blue-900 dark:text-blue-100">
                    월 마감 집계 생성 안내
                  </p>
                  <ul className="mt-2 space-y-1 text-blue-700 dark:text-blue-300">
                    <li>• 해당 월의 모든 일일 마감 데이터를 집계합니다</li>
                    <li>• 총 입금/출금/순현금흐름을 계산합니다</li>
                    <li>• 마감 누락일을 자동으로 체크합니다</li>
                    <li>• 고액 거래 목록을 추출합니다</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                onClick={handleGenerate}
                disabled={generateMutation.isPending}
                className="flex-1"
              >
                <Calendar className="mr-2 h-4 w-4" />
                {generateMutation.isPending ? "생성 중..." : "월 마감 생성"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setLocation("/accounting/monthly-summary")}
              >
                취소
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

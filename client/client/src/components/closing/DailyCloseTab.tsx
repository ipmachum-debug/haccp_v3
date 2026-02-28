import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function DailyCloseTab() {
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [largeAmountChecked, setLargeAmountChecked] = useState(false);

  // 일일 마감 통계 조회
  const { data: stats, refetch: refetchStats } = trpc.accountingDaily.getStats.useQuery({
    targetDate: selectedDate,
  });

  // 마감 여부 확인
  const { data: isClosed, refetch: refetchIsClosed } = trpc.accountingDaily.isClosed.useQuery({
    targetDate: selectedDate,
  });

  // 마감 이력 조회
  const { data: history, refetch: refetchHistory } = trpc.accountingDaily.getHistory.useQuery({
    limit: 30,
  });

  // 일일 마감 실행
  const executeMutation = trpc.accountingDaily.execute.useMutation({
    onSuccess: () => {
      toast({
        title: "일일 마감 완료",
        description: `${format(selectedDate, "yyyy-MM-dd")} 일일 마감이 완료되었습니다.`,
      });
      refetchStats();
      refetchIsClosed();
      refetchHistory();
    },
    onError: (error: any) => {
      toast({
        title: "일일 마감 실패",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleExecuteClose = () => {
    if (!selectedDate) {
      toast({
        title: "날짜를 선택하세요",
        variant: "destructive",
      });
      return;
    }

    if (isClosed) {
      toast({
        title: "이미 마감된 날짜입니다",
        variant: "destructive",
      });
      return;
    }

    executeMutation.mutate({
      closeDate: selectedDate,
      largeAmountChecked,
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        {/* 날짜 선택 */}
        <Card>
          <CardHeader>
            <CardTitle>마감 날짜 선택</CardTitle>
            <CardDescription>마감할 날짜를 선택하세요</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => date && setSelectedDate(date)}
              locale={ko}
              className="rounded-md border"
            />
            <div className="mt-4 text-center">
              <p className="text-sm text-muted-foreground">선택된 날짜</p>
              <p className="text-lg font-semibold">
                {format(selectedDate, "yyyy년 MM월 dd일 (E)", { locale: ko })}
              </p>
              {isClosed && (
                <p className="text-sm text-green-600 mt-2">✓ 마감 완료</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 일일 통계 */}
        <Card>
          <CardHeader>
            <CardTitle>일일 거래 통계</CardTitle>
            <CardDescription>
              {format(selectedDate, "yyyy-MM-dd")} 거래 내역
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {stats ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">총 거래 건수</p>
                    <p className="text-2xl font-bold">{stats.totalTransactions}건</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">완료 건수</p>
                    <p className="text-2xl font-bold text-green-600">
                      {stats.totalCompleted}건
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">총 매출(입금)</p>
                    <p className="text-xl font-semibold text-blue-600">
                      {stats.totalDeposits.toLocaleString()}원
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">총 매입</p>
                    <p className="text-xl font-semibold text-orange-600">
                      {((stats as any).totalPurchases || 0).toLocaleString()}원
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">총 비용(경비)</p>
                    <p className="text-xl font-semibold text-purple-600">
                      {((stats as any).totalExpenses || 0).toLocaleString()}원
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">총 출금(매입+비용)</p>
                    <p className="text-xl font-semibold text-red-600">
                      {stats.totalWithdrawals.toLocaleString()}원
                    </p>
                  </div>
                </div>
                <div className="pt-4 border-t">
                  <p className="text-sm text-muted-foreground">순 현금 흐름</p>
                  <p
                    className={`text-2xl font-bold ${
                      stats.netCashFlow >= 0 ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {stats.netCashFlow >= 0 ? "+" : ""}
                    {stats.netCashFlow.toLocaleString()}원
                  </p>
                </div>

                <div className="pt-4 space-y-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="largeAmount"
                      checked={largeAmountChecked}
                      onCheckedChange={(checked) =>
                        setLargeAmountChecked(checked as boolean)
                      }
                    />
                    <Label htmlFor="largeAmount" className="text-sm">
                      고액 거래 확인 완료
                    </Label>
                  </div>

                  <Button
                    onClick={handleExecuteClose}
                    disabled={isClosed || executeMutation.isPending}
                    className="w-full"
                    size="lg"
                  >
                    {executeMutation.isPending
                      ? "마감 처리 중..."
                      : isClosed
                      ? "마감 완료"
                      : "일일 마감 실행"}
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">통계를 불러오는 중...</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 마감 이력 */}
      <Card>
        <CardHeader>
          <CardTitle>최근 마감 이력</CardTitle>
          <CardDescription>최근 30일 마감 내역</CardDescription>
        </CardHeader>
        <CardContent>
          {history && history.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>마감 날짜</TableHead>
                  <TableHead>총 거래</TableHead>
                  <TableHead>완료 건수</TableHead>
                  <TableHead>예외 건수</TableHead>
                  <TableHead>고액 확인</TableHead>
                  <TableHead>마감 시각</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((record: any) => (
                  <TableRow key={record.id}>
                    <TableCell className="font-medium">
                      {typeof record.closeDate === "string"
                        ? record.closeDate
                        : format(new Date(record.closeDate), "yyyy-MM-dd")}
                    </TableCell>
                    <TableCell>{record.totalCount}건</TableCell>
                    <TableCell className="text-green-600">
                      {record.completedCount}건
                    </TableCell>
                    <TableCell className="text-red-600">
                      {record.exceptionCount}건
                    </TableCell>
                    <TableCell>
                      {record.largeAmountChecked ? "✓" : "-"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(record.createdAt), "yyyy-MM-dd HH:mm")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground text-center py-8">
              마감 이력이 없습니다.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

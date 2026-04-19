import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import {
  CalendarCheck,
  TrendingUp,
  TrendingDown,
  ArrowRightLeft,
  CheckCircle,
  AlertCircle,
  Clock,
} from "lucide-react";

export default function DailyCloseTab() {
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [largeAmountChecked, setLargeAmountChecked] = useState(false);

  const { data: stats, refetch: refetchStats } = trpc.accountingDaily.getStats.useQuery({
    targetDate: selectedDate,
  });

  const { data: isClosed, refetch: refetchIsClosed } = trpc.accountingDaily.isClosed.useQuery({
    targetDate: selectedDate,
  });

  const { data: history, refetch: refetchHistory } = trpc.accountingDaily.getHistory.useQuery({
    limit: 30,
  });

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
    onError: (error: { message: string }) => {
      toast({ title: "일일 마감 실패", description: error.message, variant: "destructive" });
    },
  });

  const handleExecuteClose = () => {
    if (!selectedDate) {
      toast({ title: "날짜를 선택하세요", variant: "destructive" });
      return;
    }
    if (isClosed) {
      toast({ title: "이미 마감된 날짜입니다", variant: "destructive" });
      return;
    }
    executeMutation.mutate({ closeDate: selectedDate, largeAmountChecked });
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        {/* 날짜 선택 */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarCheck className="h-4 w-4" />
              마감 날짜 선택
            </CardTitle>
            <CardDescription>마감할 날짜를 선택하세요</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => date && setSelectedDate(date)}
              locale={ko}
              className="rounded-lg border"
            />
            <div className="mt-4 text-center">
              <p className="text-xs text-muted-foreground">선택된 날짜</p>
              <p className="text-lg font-semibold mt-0.5">
                {format(selectedDate, "yyyy년 MM월 dd일 (E)", { locale: ko })}
              </p>
              {isClosed && (
                <Badge variant="outline" className="mt-2 gap-1 text-green-600 border-green-300 bg-green-50">
                  <CheckCircle className="h-3 w-3" />
                  마감 완료
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 일일 통계 */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <ArrowRightLeft className="h-4 w-4" />
              일일 거래 통계
            </CardTitle>
            <CardDescription>{format(selectedDate, "yyyy-MM-dd")} 거래 내역</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {stats ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <Card className="border-l-4 border-l-blue-400">
                    <CardContent className="p-3">
                      <p className="text-xs text-muted-foreground">총 거래 건수</p>
                      <p className="text-xl font-bold mt-0.5">{stats.totalTransactions}<span className="text-sm font-normal text-muted-foreground ml-1">건</span></p>
                    </CardContent>
                  </Card>
                  <Card className="border-l-4 border-l-green-400">
                    <CardContent className="p-3">
                      <p className="text-xs text-muted-foreground">완료 건수</p>
                      <p className="text-xl font-bold mt-0.5 text-green-600">{stats.totalCompleted}<span className="text-sm font-normal text-muted-foreground ml-1">건</span></p>
                    </CardContent>
                  </Card>
                  <Card className="border-l-4 border-l-indigo-400">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <TrendingUp className="h-3.5 w-3.5 text-indigo-500" />
                        <p className="text-xs text-muted-foreground">총 입금</p>
                      </div>
                      <p className="text-lg font-semibold text-indigo-600">{stats.totalDeposits.toLocaleString()}<span className="text-xs font-normal text-muted-foreground ml-0.5">원</span></p>
                    </CardContent>
                  </Card>
                  <Card className="border-l-4 border-l-red-400">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                        <p className="text-xs text-muted-foreground">총 출금</p>
                      </div>
                      <p className="text-lg font-semibold text-red-600">{stats.totalWithdrawals.toLocaleString()}<span className="text-xs font-normal text-muted-foreground ml-0.5">원</span></p>
                    </CardContent>
                  </Card>
                </div>

                <Card className={`border-l-4 ${stats.netCashFlow >= 0 ? "border-l-emerald-500" : "border-l-red-500"}`}>
                  <CardContent className="p-3">
                    <p className="text-xs text-muted-foreground">순 현금 흐름</p>
                    <p className={`text-2xl font-bold ${stats.netCashFlow >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {stats.netCashFlow >= 0 ? "+" : ""}{stats.netCashFlow.toLocaleString()}<span className="text-sm font-normal text-muted-foreground ml-1">원</span>
                    </p>
                  </CardContent>
                </Card>

                <div className="pt-2 space-y-4">
                  <div className="flex items-center space-x-2 p-3 bg-muted/30 rounded-lg">
                    <Checkbox
                      id="largeAmount"
                      checked={largeAmountChecked}
                      onCheckedChange={(checked) => setLargeAmountChecked(checked as boolean)}
                    />
                    <Label htmlFor="largeAmount" className="text-sm cursor-pointer">
                      고액 거래 확인 완료
                    </Label>
                  </div>

                  <Button
                    onClick={handleExecuteClose}
                    disabled={isClosed || executeMutation.isPending}
                    className="w-full"
                    size="lg"
                  >
                    {executeMutation.isPending ? "마감 처리 중..." : isClosed ? "마감 완료" : "일일 마감 실행"}
                  </Button>
                </div>
              </>
            ) : (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-16 bg-muted/50 rounded-md animate-pulse" />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 마감 이력 */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-4 w-4" />
                최근 마감 이력
              </CardTitle>
              <CardDescription>최근 30일 마감 내역</CardDescription>
            </div>
            {history && history.length > 0 && (
              <Badge variant="secondary">{history.length}건</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {history && history.length > 0 ? (
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="text-xs font-semibold">마감 날짜</TableHead>
                    <TableHead className="text-xs font-semibold text-right">총 거래</TableHead>
                    <TableHead className="text-xs font-semibold text-right">완료</TableHead>
                    <TableHead className="text-xs font-semibold text-right">예외</TableHead>
                    <TableHead className="text-xs font-semibold text-center">고액 확인</TableHead>
                    <TableHead className="text-xs font-semibold">마감 시각</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((record: any) => (
                    <TableRow key={record.id} className="hover:bg-muted/20">
                      <TableCell className="font-medium text-sm">
                        {typeof record.closeDate === "string"
                          ? record.closeDate
                          : format(new Date(record.closeDate), "yyyy-MM-dd")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{record.totalCount}건</TableCell>
                      <TableCell className="text-right tabular-nums text-sm text-green-600">{record.completedCount}건</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {record.exceptionCount > 0 ? (
                          <Badge variant="destructive" className="text-xs">{record.exceptionCount}건</Badge>
                        ) : (
                          <span className="text-muted-foreground">0건</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {record.largeAmountChecked ? (
                          <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-muted-foreground/40 mx-auto" />
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(record.createdAt), "yyyy-MM-dd HH:mm")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <CalendarCheck className="h-12 w-12 mb-4 opacity-30" />
              <p className="text-base font-medium">마감 이력이 없습니다.</p>
              <p className="text-sm mt-1">일일 마감을 실행하면 이력이 표시됩니다.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

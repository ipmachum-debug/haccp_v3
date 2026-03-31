import { useState } from "react";
import { useTabWithUrl } from "@/hooks/useTabWithUrl";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs"
import { TabsList } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Lock, Play, RefreshCw } from "lucide-react";

import { todayLocal } from "../lib/dateUtils";

export default function AccountingCloseManagement() {
  const [activeTab, setActiveTab] = useTabWithUrl('tab', 'daily');
  const [selectedDate, setSelectedDate] = useState<string>(
    todayLocal()
  );
  const [selectedMonth, setSelectedMonth] = useState<string>(
    new Date().toISOString().slice(0, 7)
  );

  // 일일 마감 데이터 조회
  const { data: dailyCloses, refetch: refetchDaily } = trpc.accountingClose.getDailyList.useQuery();
  const { data: monthlyCloses, refetch: refetchMonthly } = trpc.accountingClose.getMonthlyList.useQuery();

  // 일일 마감 실행
  const performDaily = trpc.accountingClose.performDaily.useMutation({
    onSuccess: () => {
      toast.success("일일 마감이 완료되었습니다.");
      refetchDaily();
    },
    onError: (error: any) => {
      toast.error(`일일 마감 실패: ${error.message}`);
    },
  });

  // 일일 마감 잠금
  const lockDaily = trpc.accountingClose.lockDaily.useMutation({
    onSuccess: () => {
      toast.success("일일 마감이 확정(잠금)되었습니다.");
      refetchDaily();
    },
    onError: (error: any) => {
      toast.error(`일일 마감 잠금 실패: ${error.message}`);
    },
  });

  // 월간 마감 실행
  const performMonthly = trpc.accountingClose.performMonthly.useMutation({
    onSuccess: () => {
      toast.success("월간 마감이 완료되었습니다.");
      refetchMonthly();
    },
    onError: (error: any) => {
      toast.error(`월간 마감 실패: ${error.message}`);
    },
  });

  // 월간 마감 잠금
  const lockMonthly = trpc.accountingClose.lockMonthly.useMutation({
    onSuccess: () => {
      toast.success("월간 마감이 확정(잠금)되었습니다.");
      refetchMonthly();
    },
    onError: (error: any) => {
      toast.error(`월간 마감 잠금 실패: ${error.message}`);
    },
  });

  const handleDailyClose = () => {
    if (!selectedDate) {
      toast.error("마감할 날짜를 선택해주세요.");
      return;
    }
    performDaily.mutate({ date: selectedDate });
  };

  const handleDailyLock = (date: string) => {
    if (confirm(`${date} 일일 마감을 확정(잠금)하시겠습니까? 잠금 후에는 수정할 수 없습니다.`)) {
      lockDaily.mutate({ date });
    }
  };

  const handleMonthlyClose = () => {
    if (!selectedMonth) {
      toast.error("마감할 월을 선택해주세요.");
      return;
    }
    const [year, month] = selectedMonth.split("-").map(Number);
    performMonthly.mutate({ year, month });
  };

  const handleMonthlyLock = (year: number, month: number) => {
    if (confirm(`${year}년 ${month}월 마감을 확정(잠금)하시겠습니까? 잠금 후에는 수정할 수 없습니다.`)) {
      lockMonthly.mutate({ year, month });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>마감 관리</CardTitle>
            <CardDescription>일일/월간 회계 마감을 관리합니다</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="daily">일일 마감</TabsTrigger>
                <TabsTrigger value="monthly">월간 마감</TabsTrigger>
              </TabsList>

              {/* 일일 마감 탭 */}
              <TabsContent value="daily" className="space-y-4">
                <div className="flex items-center gap-4">
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="px-3 py-2 border rounded-md"
                  />
                  <Button onClick={handleDailyClose} disabled={performDaily.isPending}>
                    <Play className="w-4 h-4 mr-2" />
                    {performDaily.isPending ? "마감 중..." : "일일 마감 실행"}
                  </Button>
                  <Button variant="outline" onClick={() => refetchDaily()}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    새로고침
                  </Button>
                </div>

                <div className="border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>마감일</TableHead>
                        <TableHead className="text-right">매입 합계</TableHead>
                        <TableHead className="text-right">매출 합계</TableHead>
                        <TableHead className="text-right">순현금흐름</TableHead>
                        <TableHead>상태</TableHead>
                        <TableHead>작업</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dailyCloses && dailyCloses.length > 0 ? (
                        dailyCloses.map((close: any) => (
                          <TableRow key={close.id}>
                            <TableCell>{close.close_date}</TableCell>
                            <TableCell className="text-right">
                              {Number(close.total_purchases).toLocaleString()}원
                            </TableCell>
                            <TableCell className="text-right">
                              {Number(close.total_sales).toLocaleString()}원
                            </TableCell>
                            <TableCell className="text-right">
                              {(Number(close.total_sales) - Number(close.total_purchases)).toLocaleString()}원
                            </TableCell>
                            <TableCell>
                              {close.is_locked ? (
                                <Badge variant="secondary">
                                  <Lock className="w-3 h-3 mr-1" />
                                  잠금
                                </Badge>
                              ) : (
                                <Badge>마감 완료</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {!close.is_locked && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleDailyLock(close.close_date)}
                                  disabled={lockDaily.isPending}
                                >
                                  <Lock className="w-3 h-3 mr-1" />
                                  확정
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground">
                            마감 내역이 없습니다
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              {/* 월간 마감 탭 */}
              <TabsContent value="monthly" className="space-y-4">
                <div className="flex items-center gap-4">
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="px-3 py-2 border rounded-md"
                  />
                  <Button onClick={handleMonthlyClose} disabled={performMonthly.isPending}>
                    <Play className="w-4 h-4 mr-2" />
                    {performMonthly.isPending ? "마감 중..." : "월간 마감 실행"}
                  </Button>
                  <Button variant="outline" onClick={() => refetchMonthly()}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    새로고침
                  </Button>
                </div>

                <div className="border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>마감월</TableHead>
                        <TableHead className="text-right">매입 합계</TableHead>
                        <TableHead className="text-right">매출 합계</TableHead>
                        <TableHead className="text-right">순현금흐름</TableHead>
                        <TableHead>상태</TableHead>
                        <TableHead>작업</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {monthlyCloses && monthlyCloses.length > 0 ? (
                        monthlyCloses.map((close: any) => (
                          <TableRow key={close.id}>
                            <TableCell>{close.year}년 {close.month}월</TableCell>
                            <TableCell className="text-right">
                              {Number(close.total_purchases).toLocaleString()}원
                            </TableCell>
                            <TableCell className="text-right">
                              {Number(close.total_sales).toLocaleString()}원
                            </TableCell>
                            <TableCell className="text-right">
                              {(Number(close.total_sales) - Number(close.total_purchases)).toLocaleString()}원
                            </TableCell>
                            <TableCell>
                              {close.is_locked ? (
                                <Badge variant="secondary">
                                  <Lock className="w-3 h-3 mr-1" />
                                  잠금
                                </Badge>
                              ) : (
                                <Badge>마감 완료</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {!close.is_locked && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleMonthlyLock(close.year, close.month)}
                                  disabled={lockMonthly.isPending}
                                >
                                  <Lock className="w-3 h-3 mr-1" />
                                  확정
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground">
                            마감 내역이 없습니다
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

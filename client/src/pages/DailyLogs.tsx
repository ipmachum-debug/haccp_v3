import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, FileText } from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { cn } from "@/lib/utils";

export default function DailyLogs() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  // 선택한 날짜의 배치 목록 조회
  const { data: batchData, isLoading } = trpc.batch.list.useQuery();
  const allBatches = batchData?.items || [];
  
  // 선택한 날짜에 해당하는 배치 필터링
  const batches = allBatches?.filter((batch: any) => {
    const batchDate = new Date(batch.plannedDate);
    return (
      batchDate.getFullYear() === selectedDate.getFullYear() &&
      batchDate.getMonth() === selectedDate.getMonth() &&
      batchDate.getDate() === selectedDate.getDate()
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-[240px] justify-start text-left font-normal",
                !selectedDate && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {selectedDate ? (
                format(selectedDate, "PPP", { locale: ko })
              ) : (
                <span>날짜 선택</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => date && setSelectedDate(date)}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* 일일 요약 */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">총 생산 배치</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{batches?.length || 0}</div>
            <p className="text-xs text-muted-foreground">
              {format(selectedDate, "yyyy년 MM월 dd일", { locale: ko })}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">완료된 배치</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {batches?.filter((b: any) => b.status === "completed").length || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              전체 배치의{" "}
              {batches?.length
                ? Math.round(
                    (batches.filter((b: any) => b.status === "completed").length /
                      batches.length) *
                      100
                  )
                : 0}
              %
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">생산 중인 배치</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {batches?.filter((b: any) => b.status === "in_progress").length || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              현재 진행 중
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 배치 목록 */}
      <Card>
        <CardHeader>
          <CardTitle>생산 배치 목록</CardTitle>
          <CardDescription>
            {format(selectedDate, "yyyy년 MM월 dd일", { locale: ko })} 생산 배치 현황
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">로딩 중...</div>
          ) : batches && batches.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>배치 번호</TableHead>
                  <TableHead>제품명</TableHead>
                  <TableHead>생산 수량</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>생산 시작</TableHead>
                  <TableHead>생산 완료</TableHead>
                  <TableHead>작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((batch: any) => (
                  <TableRow key={batch.id}>
                    <TableCell className="font-medium">{batch.batchCode}</TableCell>
                    <TableCell>제품 ID: {batch.productId}</TableCell>
                    <TableCell>
                      {batch.actualQuantity || batch.plannedQuantity}
                    </TableCell>
                    <TableCell>
                      {batch.status === "planned" && (
                        <Badge variant="outline" className="bg-gray-500/10 text-gray-500 border-gray-500">
                          계획됨
                        </Badge>
                      )}
                      {batch.status === "in_progress" && (
                        <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500">
                          생산 중
                        </Badge>
                      )}
                      {batch.status === "completed" && (
                        <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500">
                          완료
                        </Badge>
                      )}
                      {batch.status === "failed" && (
                        <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500">
                          실패
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {batch.startTime
                        ? format(new Date(batch.startTime), "HH:mm", { locale: ko })
                        : "-"}
                    </TableCell>
                    <TableCell>
                      {batch.endTime
                        ? format(new Date(batch.endTime), "HH:mm", { locale: ko })
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          window.location.href = `/dashboard/batch/${batch.id}`;
                        }}
                      >
                        <FileText className="h-4 w-4 mr-1" />
                        상세
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              선택한 날짜에 생산 배치가 없습니다.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

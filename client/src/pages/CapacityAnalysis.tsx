import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";

export default function CapacityAnalysis() {
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [capacityGroupBy, setCapacityGroupBy] = useState<"day" | "week">("day");

  const startDate = `${selectedMonth}-01`;
  const endDate = `${selectedMonth}-${new Date(parseInt(selectedMonth.split("-")[0]), parseInt(selectedMonth.split("-")[1]), 0).getDate()}`;

  // 생산 능력 분석 조회
  const { data: capacityAnalysis, isLoading: isLoadingCapacity } = trpc.productionSchedule.analyzeProductionCapacity.useQuery({
    startDate,
    endDate,
    groupBy: capacityGroupBy,
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>생산 능력 분석</CardTitle>
              <CardDescription>
                {selectedMonth.replace("-", "년 ")}월 일별/주별 생산 능력 분석
              </CardDescription>
            </div>
            <div className="flex gap-4">
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => {
                    const date = new Date();
                    date.setMonth(date.getMonth() - i);
                    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
                    return (
                      <SelectItem key={value} value={value}>
                        {date.getFullYear()}년 {date.getMonth() + 1}월
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <Select value={capacityGroupBy} onValueChange={(v) => setCapacityGroupBy(v as "day" | "week")}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">일별</SelectItem>
                  <SelectItem value="week">주별</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingCapacity ? (
            <div className="text-center py-8 text-muted-foreground">로딩 중...</div>
          ) : !capacityAnalysis || capacityAnalysis.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              선택한 기간에 데이터가 없습니다.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{capacityGroupBy === "day" ? "일자" : "주"}</TableHead>
                  <TableHead>계획 배치 수</TableHead>
                  <TableHead>계획 수량</TableHead>
                  <TableHead>완료 배치 수</TableHead>
                  <TableHead>완료 수량</TableHead>
                  <TableHead>완료율</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {capacityAnalysis.map((row) => (
                  <TableRow key={row.period}>
                    <TableCell className="font-medium">{row.period}</TableCell>
                    <TableCell>{row.plannedCount}</TableCell>
                    <TableCell>{row.plannedQuantity.toLocaleString()}</TableCell>
                    <TableCell>{row.completedCount}</TableCell>
                    <TableCell>{row.actualQuantity.toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge variant={row.utilizationRate >= 80 ? "default" : "secondary"}>
                        {row.utilizationRate.toFixed(1)}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

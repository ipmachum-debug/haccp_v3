import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { useIndustryLabel } from "@/hooks/useIndustryFeatures";

export default function ProductAnalysis() {
  const L = useIndustryLabel();
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const startDate = `${selectedMonth}-01`;
  const endDate = `${selectedMonth}-${new Date(parseInt(selectedMonth.split("-")[0]), parseInt(selectedMonth.split("-")[1]), 0).getDate()}`;

  // 제품별 생산 능력 분석 조회
  const { data: productCapacity, isLoading: isLoadingProductCapacity } = trpc.productionSchedule.analyzeProductionCapacityByProduct.useQuery({
    startDate,
    endDate,
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>제품별 생산 능력 분석</CardTitle>
              <CardDescription>
                {selectedMonth.replace("-", "년 ")}월 제품별 생산 실적
              </CardDescription>
            </div>
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
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingProductCapacity ? (
            <div className="text-center py-8 text-muted-foreground">로딩 중...</div>
          ) : !productCapacity || productCapacity.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              선택한 기간에 데이터가 없습니다.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{L("product")}</TableHead>
                  <TableHead>{`${L("batch")} 수`}</TableHead>
                  <TableHead>계획 수량</TableHead>
                  <TableHead>실제 수량</TableHead>
                  <TableHead>완료 배치</TableHead>
                  <TableHead>완료율</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productCapacity.map((row: any) => (
                  <TableRow key={row.productId}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{row.productName}</div>
                        <div className="text-sm text-muted-foreground">{row.productCode}</div>
                      </div>
                    </TableCell>
                    <TableCell>{row.batchCount}</TableCell>
                    <TableCell>{row.totalPlannedQuantity.toLocaleString()}</TableCell>
                    <TableCell>{row.totalActualQuantity.toLocaleString()}</TableCell>
                    <TableCell>{row.completedCount}</TableCell>
                    <TableCell>
                      <Badge variant={row.completionRate >= 80 ? "default" : "secondary"}>
                        {row.completionRate.toFixed(1)}%
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

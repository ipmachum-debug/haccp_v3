import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useIndustryLabel } from "@/hooks/useIndustryFeatures";

export default function ScheduleOptimization() {
  const L = useIndustryLabel();
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [selectedSuggestion, setSelectedSuggestion] = useState<number | null>(null);
  const [newDate, setNewDate] = useState("");
  const utils = trpc.useUtils();
  
  const startDate = `${selectedMonth}-01`;
  const endDate = `${selectedMonth}-${new Date(parseInt(selectedMonth.split("-")[0]), parseInt(selectedMonth.split("-")[1]), 0).getDate()}`;
  
  const { data: optimization, isLoading, refetch } = trpc.productionSchedule.optimizeSchedule.useQuery({
    startDate,
    endDate,
  });
  
  const applyOptimization = trpc.productionSchedule.applyOptimization.useMutation({
    onSuccess: () => {
      utils.productionSchedule.getBatchSchedule.invalidate();
      utils.productionSchedule.optimizeSchedule.invalidate();
      setSelectedSuggestion(null);
      setNewDate("");
      toast.success("일정이 변경되었습니다");
    },
    onError: (error: { message: string }) => {
      toast.error(`일정 변경 실패: ${error.message}`);
    },
  });
  
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>생산 일정 최적화 제안</CardTitle>
              <CardDescription>
                {selectedMonth.replace("-", "년 ")}월 재고 현황 기반 일정 최적화 분석
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
              <Button onClick={() => refetch()} variant="outline">
                새로고침
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">로딩 중...</div>
          ) : !optimization ? (
            <div className="text-center py-8 text-muted-foreground">
              데이터를 불러올 수 없습니다.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">총 배치 수</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{optimization.totalBatches}</div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">문제 배치 수</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-destructive">
                      {optimization.batchesWithIssues}
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">최적화율</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {optimization.totalBatches > 0
                        ? ((1 - optimization.batchesWithIssues / optimization.totalBatches) * 100).toFixed(1)
                        : 0}%
                    </div>
                  </CardContent>
                </Card>
              </div>
              
              {optimization.suggestions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  모든 배치 일정이 최적화되어 있습니다.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{`${L("batch")} 코드`}</TableHead>
                      <TableHead>{L("product")}</TableHead>
                      <TableHead>현재 일정</TableHead>
                      <TableHead>문제</TableHead>
                      <TableHead>제안</TableHead>
                      <TableHead>우선순위</TableHead>
                      <TableHead>작업</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {optimization.suggestions.map((suggestion: any) => (
                      <TableRow key={suggestion.batchId}>
                        <TableCell className="font-medium">{suggestion.batchCode}</TableCell>
                        <TableCell>{suggestion.productName}</TableCell>
                        <TableCell>
                          {new Date(suggestion.currentDate).toLocaleDateString("ko-KR")}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-destructive">
                            <AlertCircle className="h-4 w-4" />
                            <span className="text-sm">{suggestion.issue}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{suggestion.suggestion}</TableCell>
                        <TableCell>
                          <Badge variant={suggestion.priority === "high" ? "destructive" : "secondary"}>
                            {suggestion.priority === "high" ? "고" : "중"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedSuggestion(suggestion.batchId);
                              setNewDate(suggestion.currentDate);
                            }}
                          >
                            일정 변경
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* 일정 변경 다이얼로그 */}
      <Dialog open={selectedSuggestion !== null} onOpenChange={(open) => !open && setSelectedSuggestion(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{L("batch")} 일정 변경</DialogTitle>
            <DialogDescription>
              새로운 생산 일정을 선택하세요.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="newDate">새 생산 일정</Label>
              <Input
                id="newDate"
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setSelectedSuggestion(null)}>
              취소
            </Button>
            <Button
              onClick={() => {
                if (!selectedSuggestion || !newDate) return;
                applyOptimization.mutate({
                  batchId: selectedSuggestion,
                  newPlannedDate: newDate,
                });
              }}
              disabled={!newDate || applyOptimization.isPending}
            >
              적용
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

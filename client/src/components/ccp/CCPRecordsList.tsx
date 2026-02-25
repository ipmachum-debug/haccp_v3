import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";

export function CCPRecordsList() {
  const [filters, setFilters] = useState({
    ccpType: "all" as "all" | "CCP-1B" | "CCP-2B" | "CCP-3B" | "CCP-4P",
    startDate: "",
    endDate: "",
  });

  const { data: records, isLoading } = trpc.ccpMonitoring.getCcpMonitoringRecords.useQuery({
    ccpType: filters.ccpType === "all" ? undefined : filters.ccpType,
    startDate: filters.startDate ? new Date(filters.startDate) : undefined,
    endDate: filters.endDate ? new Date(filters.endDate) : undefined,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>CCP 모니터링 기록 조회</CardTitle>
        <CardDescription>
          CCP 모니터링 기록을 조회하고 관리합니다
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 필터 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label htmlFor="ccpType">CCP 유형</Label>
            <Select
              value={filters.ccpType}
              onValueChange={(value) => setFilters({ ...filters, ccpType: value as any })}
            >
              <SelectTrigger>
                <SelectValue placeholder="전체" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                <SelectItem value="CCP-1B">CCP-1B (가열/증숙)</SelectItem>
                <SelectItem value="CCP-2B">CCP-2B (가열/금기)</SelectItem>
                <SelectItem value="CCP-3B">CCP-3B (가열/볶음)</SelectItem>
                <SelectItem value="CCP-4P">CCP-4P (금속검출)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="startDate">시작일</Label>
            <Input
              id="startDate"
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="endDate">종료일</Label>
            <Input
              id="endDate"
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>&nbsp;</Label>
            <Button
              variant="outline"
              onClick={() => setFilters({ ccpType: "all", startDate: "", endDate: "" })}
              className="w-full"
            >
              필터 초기화
            </Button>
          </div>
        </div>

        {/* 기록 목록 */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>CCP 유형</TableHead>
                <TableHead>제품명</TableHead>
                <TableHead>기록일시</TableHead>
                <TableHead>측정시각</TableHead>
                <TableHead>판정</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records && records.length > 0 ? (
                records.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell>
                      <Badge variant="outline">{record.ccpType}</Badge>
                    </TableCell>
                    <TableCell>{record.productName}</TableCell>
                    <TableCell>
                      {new Date(record.recordDate).toLocaleDateString('ko-KR')}
                    </TableCell>
                    <TableCell>{record.measurementTime || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={record.passFail === "적합" ? "default" : "destructive"}>
                        {record.passFail}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    기록이 없습니다
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

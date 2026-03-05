import DashboardLayout from "@/components/DashboardLayout";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { Plus, Search, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function WaterQualityTestList() {
  const [, setLocation] = useLocation();
  const navigate = (path: string) => setLocation(path);
  const { toast } = useToast();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [testResult, setTestResult] = useState<string>("");

  const { data: records, isLoading, refetch } = trpc.waterQualityTest.list.useQuery({
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    testResult: testResult as any || undefined,
  });

  const deleteMutation = trpc.waterQualityTest.delete.useMutation({
    onSuccess: () => {
      toast({ title: "삭제 완료", description: "수질 검사 기록이 삭제되었습니다." });
      refetch();
    },
    onError: (error) => {
      toast({ title: "삭제 실패", description: error.message, variant: "destructive" });
    },
  });

  const handleDelete = (id: number) => {
    if (confirm("정말 삭제하시겠습니까?")) {
      deleteMutation.mutate({ id });
    }
  };

  const getResultBadge = (result: string) => {
    switch (result) {
      case "pass":
        return <Badge className="bg-green-500">적합</Badge>;
      case "fail":
        return <Badge className="bg-red-500">부적합</Badge>;
      case "pending":
        return <Badge className="bg-yellow-500">대기</Badge>;
      default:
        return <Badge>{result}</Badge>;
    }
  };

  return (
    <DashboardLayout>
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            수질 검사 기록
          </CardTitle>
          <Button onClick={() => navigate("/water-quality-test/new")}>
            <Plus className="h-4 w-4 mr-2" />
            신규 등록
          </Button>
        </CardHeader>
        <CardContent>
          {/* 검색 필터 */}
          <div className="flex gap-4 mb-6">
            <Input
              type="date"
              placeholder="시작일"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-48"
            />
            <Input
              type="date"
              placeholder="종료일"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-48"
            />
            <Select value={testResult} onValueChange={setTestResult}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="검사 결과" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                <SelectItem value="pass">적합</SelectItem>
                <SelectItem value="fail">부적합</SelectItem>
                <SelectItem value="pending">대기</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => refetch()}>
              <Search className="h-4 w-4 mr-2" />
              검색
            </Button>
          </div>

          {/* 테이블 */}
          {isLoading ? (
            <div className="text-center py-8">로딩 중...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>검사일</TableHead>
                  <TableHead>검사 위치</TableHead>
                  <TableHead>pH</TableHead>
                  <TableHead>탁도</TableHead>
                  <TableHead>잔류염소</TableHead>
                  <TableHead>대장균</TableHead>
                  <TableHead>검사 결과</TableHead>
                  <TableHead>검사자</TableHead>
                  <TableHead>작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records && records.length > 0 ? (
                  records.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell>{new Date(record.testDate).toLocaleDateString()}</TableCell>
                      <TableCell>{record.testLocation}</TableCell>
                      <TableCell>{record.ph || "-"}</TableCell>
                      <TableCell>{record.turbidity || "-"}</TableCell>
                      <TableCell>{record.residualChlorine || "-"}</TableCell>
                      <TableCell>{record.coliformBacteria || "-"}</TableCell>
                      <TableCell>{getResultBadge(record.testResult)}</TableCell>
                      <TableCell>{record.inspectorId}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate(`/water-quality-test/${record.id}`)}
                          >
                            수정
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDelete(record.id)}
                          >
                            삭제
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      등록된 수질 검사 기록이 없습니다.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
    </DashboardLayout>
  );
}

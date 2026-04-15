import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs"
import { TabsList } from "@/components/ui/tabs";
import { Plus, Eye } from "lucide-react";


export default function ShippingInspections() {
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);

  const { data: inspections, isLoading } = trpc.inspection.shipping.list.useQuery({
    status: statusFilter,
  });

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive"> = {
      pending: "secondary",
      completed: "default",
      rejected: "destructive",
    };
    const labels: Record<string, string> = {
      pending: "대기",
      completed: "완료",
      rejected: "반려",
    };
    return (
      <Badge variant={variants[status] || "default"}>
        {labels[status] || status}
      </Badge>
    );
  };

  const getResultBadge = (result: string | null) => {
    if (!result) return <Badge variant="secondary">미검사</Badge>;
    const variants: Record<string, "default" | "destructive" | "secondary"> = {
      pass: "default",
      fail: "destructive",
      hold: "secondary",
    };
    const labels: Record<string, string> = {
      pass: "합격",
      fail: "불합격",
      hold: "보류",
    };
    return (
      <Badge variant={variants[result] || "secondary"}>
        {labels[result] || result}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">출하 검사</h1>
          <p className="text-muted-foreground mt-1">
            출하 전 최종 제품의 품질 검사 기록을 관리합니다.
          </p>
        </div>
        <Link href="/dashboard/inspections/shipping/create">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            검사 기록 작성
          </Button>
        </Link>
      </div>

      <Tabs defaultValue="all" onValueChange={(v) => setStatusFilter(v === "all" ? undefined : v)}>
        <TabsList>
          <TabsTrigger value="all">전체</TabsTrigger>
          <TabsTrigger value="pending">대기</TabsTrigger>
          <TabsTrigger value="completed">완료</TabsTrigger>
          <TabsTrigger value="rejected">반려</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>출하 검사 목록</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                  로딩 중...
                </div>
              ) : !inspections || inspections.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  검사 기록이 없습니다.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>검사일</TableHead>
                      <TableHead>배치</TableHead>
                      <TableHead>제품</TableHead>
                      <TableHead>수량</TableHead>
                      <TableHead>검사자</TableHead>
                      <TableHead>상태</TableHead>
                      <TableHead>결과</TableHead>
                      <TableHead className="text-right">작업</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inspections.map((inspection: any) => (
                      <TableRow key={inspection.id}>
                        <TableCell>
                          {new Date(inspection.inspectionDate).toLocaleDateString("ko-KR")}
                        </TableCell>
                        <TableCell>{inspection.batchCode}</TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{inspection.productName}</div>
                            <div className="text-sm text-muted-foreground">
                              {inspection.productCode}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{inspection.quantity || "-"}</TableCell>
                        <TableCell>{inspection.inspectorName}</TableCell>
                        <TableCell>{getStatusBadge(inspection.status)}</TableCell>
                        <TableCell>{getResultBadge(inspection.inspectionResult)}</TableCell>
                        <TableCell className="text-right">
                          <Link href={`/dashboard/inspections/shipping/${inspection.id}`}>
                            <Button variant="ghost" size="sm">
                              <Eye className="h-4 w-4 mr-1" />
                              상세
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {["pending", "completed", "rejected"].map((tab) => (
          <TabsContent key={tab} value={tab} className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>
                  {tab === "pending" && "대기 중인 검사"}
                  {tab === "completed" && "완료된 검사"}
                  {tab === "rejected" && "반려된 검사"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="text-center py-8 text-muted-foreground">
                    로딩 중...
                  </div>
                ) : !inspections || inspections.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    {tab === "pending" && "대기 중인 검사가 없습니다."}
                    {tab === "completed" && "완료된 검사가 없습니다."}
                    {tab === "rejected" && "반려된 검사가 없습니다."}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>검사일</TableHead>
                        <TableHead>배치</TableHead>
                        <TableHead>제품</TableHead>
                        <TableHead>수량</TableHead>
                        <TableHead>검사자</TableHead>
                        {tab === "completed" && <TableHead>결과</TableHead>}
                        <TableHead className="text-right">작업</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inspections.map((inspection: any) => (
                        <TableRow key={inspection.id}>
                          <TableCell>
                            {new Date(inspection.inspectionDate).toLocaleDateString("ko-KR")}
                          </TableCell>
                          <TableCell>{inspection.batchCode}</TableCell>
                          <TableCell>
                            <div>
                              <div className="font-medium">{inspection.productName}</div>
                              <div className="text-sm text-muted-foreground">
                                {inspection.productCode}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>{inspection.quantity || "-"}</TableCell>
                          <TableCell>{inspection.inspectorName}</TableCell>
                          {tab === "completed" && (
                            <TableCell>{getResultBadge(inspection.inspectionResult)}</TableCell>
                          )}
                          <TableCell className="text-right">
                            <Link href={`/dashboard/inspections/shipping/${inspection.id}`}>
                              <Button variant="ghost" size="sm">
                                <Eye className="h-4 w-4 mr-1" />
                                상세
                              </Button>
                            </Link>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

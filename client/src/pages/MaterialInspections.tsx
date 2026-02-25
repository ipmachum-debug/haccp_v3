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
import { Plus, Eye, FileText } from "lucide-react";


export default function MaterialInspections() {
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [resultFilter, setResultFilter] = useState<string | undefined>(undefined);

  const { data: inspections, isLoading } = trpc.inspection.material.list.useQuery({
    status: statusFilter,
    inspectionResult: resultFilter,
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
      conditional: "secondary",
    };
    const labels: Record<string, string> = {
      pass: "합격",
      fail: "불합격",
      conditional: "조건부 합격",
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
          <h1 className="text-3xl font-bold">원재료 검사</h1>
          <p className="text-muted-foreground mt-1">
            입고된 원재료의 품질 검사 기록을 관리합니다.
          </p>
        </div>
        <Link href="/dashboard/inspections/material/create">
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
              <CardTitle>원재료 검사 목록</CardTitle>
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
                      <TableHead>원재료</TableHead>
                      <TableHead>LOT 번호</TableHead>
                      <TableHead>공급업체</TableHead>
                      <TableHead>검사자</TableHead>
                      <TableHead>상태</TableHead>
                      <TableHead>결과</TableHead>
                      <TableHead className="text-right">작업</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inspections.map((inspection) => (
                      <TableRow key={inspection.id}>
                        <TableCell>
                          {new Date(inspection.inspectionDate).toLocaleDateString("ko-KR")}
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{inspection.materialName}</div>
                            <div className="text-sm text-muted-foreground">
                              {inspection.materialCode}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{inspection.lotNumber}</TableCell>
                        <TableCell>{inspection.supplierName || "-"}</TableCell>
                        <TableCell>{inspection.inspectorName}</TableCell>
                        <TableCell>{getStatusBadge(inspection.status)}</TableCell>
                        <TableCell>{getResultBadge(inspection.inspectionResult)}</TableCell>
                        <TableCell className="text-right">
                          <Link href={`/dashboard/inspections/material/${inspection.id}`}>
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

        <TabsContent value="pending" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>대기 중인 검사</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                  로딩 중...
                </div>
              ) : !inspections || inspections.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  대기 중인 검사가 없습니다.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>검사일</TableHead>
                      <TableHead>원재료</TableHead>
                      <TableHead>LOT 번호</TableHead>
                      <TableHead>공급업체</TableHead>
                      <TableHead>검사자</TableHead>
                      <TableHead className="text-right">작업</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inspections.map((inspection) => (
                      <TableRow key={inspection.id}>
                        <TableCell>
                          {new Date(inspection.inspectionDate).toLocaleDateString("ko-KR")}
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{inspection.materialName}</div>
                            <div className="text-sm text-muted-foreground">
                              {inspection.materialCode}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{inspection.lotNumber}</TableCell>
                        <TableCell>{inspection.supplierName || "-"}</TableCell>
                        <TableCell>{inspection.inspectorName}</TableCell>
                        <TableCell className="text-right">
                          <Link href={`/dashboard/inspections/material/${inspection.id}`}>
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

        <TabsContent value="completed" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>완료된 검사</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                  로딩 중...
                </div>
              ) : !inspections || inspections.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  완료된 검사가 없습니다.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>검사일</TableHead>
                      <TableHead>원재료</TableHead>
                      <TableHead>LOT 번호</TableHead>
                      <TableHead>공급업체</TableHead>
                      <TableHead>검사자</TableHead>
                      <TableHead>결과</TableHead>
                      <TableHead className="text-right">작업</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inspections.map((inspection) => (
                      <TableRow key={inspection.id}>
                        <TableCell>
                          {new Date(inspection.inspectionDate).toLocaleDateString("ko-KR")}
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{inspection.materialName}</div>
                            <div className="text-sm text-muted-foreground">
                              {inspection.materialCode}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{inspection.lotNumber}</TableCell>
                        <TableCell>{inspection.supplierName || "-"}</TableCell>
                        <TableCell>{inspection.inspectorName}</TableCell>
                        <TableCell>{getResultBadge(inspection.inspectionResult)}</TableCell>
                        <TableCell className="text-right">
                          <Link href={`/dashboard/inspections/material/${inspection.id}`}>
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

        <TabsContent value="rejected" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>반려된 검사</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                  로딩 중...
                </div>
              ) : !inspections || inspections.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  반려된 검사가 없습니다.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>검사일</TableHead>
                      <TableHead>원재료</TableHead>
                      <TableHead>LOT 번호</TableHead>
                      <TableHead>공급업체</TableHead>
                      <TableHead>검사자</TableHead>
                      <TableHead className="text-right">작업</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inspections.map((inspection) => (
                      <TableRow key={inspection.id}>
                        <TableCell>
                          {new Date(inspection.inspectionDate).toLocaleDateString("ko-KR")}
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{inspection.materialName}</div>
                            <div className="text-sm text-muted-foreground">
                              {inspection.materialCode}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{inspection.lotNumber}</TableCell>
                        <TableCell>{inspection.supplierName || "-"}</TableCell>
                        <TableCell>{inspection.inspectorName}</TableCell>
                        <TableCell className="text-right">
                          <Link href={`/dashboard/inspections/material/${inspection.id}`}>
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
      </Tabs>
    </div>
  );
}

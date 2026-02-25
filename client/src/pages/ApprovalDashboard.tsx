import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle, XCircle, Clock, FileText } from "lucide-react";
import { useLocation } from "wouter";

export default function ApprovalDashboard() {
  const [, setLocation] = useLocation();
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");

  // 승인 대기 항목 조회
  const { data: pendingApprovals, isLoading } = trpc.approval.getPendingApprovals.useQuery();

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="p-8">
          <div className="flex items-center justify-center h-64">
            <div className="text-muted-foreground">로딩 중...</div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200"><Clock className="h-3 w-3 mr-1" />대기 중</Badge>;
      case "approved":
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200"><CheckCircle className="h-3 w-3 mr-1" />승인됨</Badge>;
      case "rejected":
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200"><XCircle className="h-3 w-3 mr-1" />반려됨</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case "batch":
        return <Badge variant="secondary">배치 승인</Badge>;
      case "inventory_adjustment":
        return <Badge variant="secondary">재고 조정</Badge>;
      case "ccp_review":
        return <Badge variant="secondary">CCP 검토</Badge>;
      case "mfr":
        return <Badge variant="secondary">품목제조보고</Badge>;
      default:
        return <Badge variant="secondary">{type}</Badge>;
    }
  };

  const handleViewDetail = (type: string, id: number) => {
    switch (type) {
      case "batch":
        setLocation(`/dashboard/batch/${id}`);
        break;
      case "inventory_adjustment":
        setLocation(`/dashboard/inventory/adjustments/${id}`);
        break;
      case "ccp_review":
        setLocation(`/quality/ccp-monitoring`);
        break;
      case "mfr":
        setLocation(`/dashboard/mf-reports/${id}`);
        break;
      default:
        break;
    }
  };

  // 필터링된 승인 항목
  const filteredApprovals = pendingApprovals?.filter((approval: any) => {
    if (statusFilter === "all") return true;
    return approval.status === statusFilter;
  }) || [];

  // 통계 계산
  const stats = {
    total: pendingApprovals?.length || 0,
    pending: pendingApprovals?.filter((a: any) => a.status === "pending").length || 0,
    approved: pendingApprovals?.filter((a: any) => a.status === "approved").length || 0,
    rejected: pendingApprovals?.filter((a: any) => a.status === "rejected").length || 0,
  };

  return (
    <DashboardLayout>
      <div className="p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">승인 워크플로우 대시보드</h1>
            <p className="text-muted-foreground mt-2">
              승인 대기 중인 항목을 한눈에 확인하고 관리하세요
            </p>
          </div>
          <Select value={statusFilter} onValueChange={(value: any) => setStatusFilter(value)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="상태 필터" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              <SelectItem value="pending">대기 중</SelectItem>
              <SelectItem value="approved">승인됨</SelectItem>
              <SelectItem value="rejected">반려됨</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 요약 카드 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                전체 항목
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}건</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                대기 중
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{stats.pending}건</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                승인됨
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.approved}건</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                반려됨
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{stats.rejected}건</div>
            </CardContent>
          </Card>
        </div>

        {/* 승인 항목 테이블 */}
        <Card>
          <CardHeader>
            <CardTitle>승인 항목 목록</CardTitle>
          </CardHeader>
          <CardContent>
            {filteredApprovals.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                승인 대기 항목이 없습니다
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>유형</TableHead>
                    <TableHead>제목</TableHead>
                    <TableHead>요청자</TableHead>
                    <TableHead>요청일시</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead>작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredApprovals.map((approval: any) => (
                    <TableRow key={`${approval.type}-${approval.id}`}>
                      <TableCell>{getTypeBadge(approval.type)}</TableCell>
                      <TableCell className="font-medium">{approval.title}</TableCell>
                      <TableCell>{approval.requesterName}</TableCell>
                      <TableCell>{new Date(approval.createdAt).toLocaleString("ko-KR")}</TableCell>
                      <TableCell>{getStatusBadge(approval.status)}</TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewDetail(approval.type, approval.id)}
                        >
                          <FileText className="h-4 w-4 mr-1" />
                          상세보기
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

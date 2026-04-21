import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { CheckCircle, XCircle, Clock, AlertCircle } from "lucide-react";
import { useIndustryLabel } from "@/hooks/useIndustryFeatures";

export default function ApprovalHistory() {
  const L = useIndustryLabel();
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "rejected" | "cancelled" | undefined>(undefined);
  const [requestTypeFilter, setRequestTypeFilter] = useState<string | undefined>(undefined);

  // 승인 요청 목록 조회 (전체 이력)
  const { data: requests = [], isLoading } = trpc.approval.list.useQuery({
    status: statusFilter,
    requestType: requestTypeFilter,
  });

  // 상태 뱃지 렌더링
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">
            <Clock className="w-3 h-3 mr-1" />
            대기 중
          </Badge>
        );
      case "approved":
        return (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
            <CheckCircle className="w-3 h-3 mr-1" />
            승인됨
          </Badge>
        );
      case "rejected":
        return (
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">
            <XCircle className="w-3 h-3 mr-1" />
            거부됨
          </Badge>
        );
      case "cancelled":
        return (
          <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-300">
            취소됨
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // 우선순위 뱃지 렌더링
  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "urgent":
        return (
          <Badge variant="destructive" className="bg-red-600">
            <AlertCircle className="w-3 h-3 mr-1" />
            긴급
          </Badge>
        );
      case "high":
        return (
          <Badge variant="destructive" className="bg-orange-600">
            높음
          </Badge>
        );
      case "medium":
        return (
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300">
            중간
          </Badge>
        );
      case "low":
        return (
          <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-300">
            낮음
          </Badge>
        );
      default:
        return <Badge variant="outline">{priority}</Badge>;
    }
  };

  // 요청 유형 한글 변환
  const getRequestTypeLabel = (requestType: string) => {
    const labels: Record<string, string> = {
      batch_approval: "배치 승인",
      inventory_adjustment: "재고 조정",
      material_inspection: "원재료 검사",
      hygiene_inspection: "위생 점검",
      document_approval: "문서 승인",
      recipe_change: "레시피 변경",
      ccp_deviation: "CCP 이탈",
      ccp_review: "CCP 검토",
    };
    return labels[requestType] || requestType;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">승인 이력</h1>
          <p className="text-muted-foreground mt-2">모든 승인 요청의 이력을 조회합니다.</p>
        </div>

        {/* 필터 */}
        <Card>
          <CardHeader>
            <CardTitle>필터</CardTitle>
            <CardDescription>승인 이력을 필터링합니다.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>상태</Label>
                <Select
                  value={statusFilter || "all"}
                  onValueChange={(value) => setStatusFilter(value === "all" ? undefined : value as any)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="전체" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    <SelectItem value="pending">대기 중</SelectItem>
                    <SelectItem value="approved">승인됨</SelectItem>
                    <SelectItem value="rejected">거부됨</SelectItem>
                    <SelectItem value="cancelled">취소됨</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>요청 유형</Label>
                <Select
                  value={requestTypeFilter || "all"}
                  onValueChange={(value) => setRequestTypeFilter(value === "all" ? undefined : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="전체" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    <SelectItem value="batch_approval">{L("batch")} 승인</SelectItem>
                    <SelectItem value="inventory_adjustment">재고 조정</SelectItem>
                    <SelectItem value="material_inspection">{L("material")} 검사</SelectItem>
                    <SelectItem value="hygiene_inspection">위생 점검</SelectItem>
                    <SelectItem value="document_approval">문서 승인</SelectItem>
                    <SelectItem value="recipe_change">레시피 변경</SelectItem>
                    <SelectItem value="ccp_deviation">CCP 이탈</SelectItem>
                    <SelectItem value="ccp_review">CCP 검토</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 승인 이력 목록 */}
        <Card>
          <CardHeader>
            <CardTitle>승인 이력 목록</CardTitle>
            <CardDescription>
              {isLoading ? "로딩 중..." : `총 ${requests.length}개의 이력`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">로딩 중...</div>
            ) : requests.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">승인 이력이 없습니다.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-medium">ID</th>
                      <th className="text-left p-3 font-medium">제목</th>
                      <th className="text-left p-3 font-medium">요청 유형</th>
                      <th className="text-left p-3 font-medium">우선순위</th>
                      <th className="text-left p-3 font-medium">상태</th>
                      <th className="text-left p-3 font-medium">요청 일시</th>
                      <th className="text-left p-3 font-medium">처리 일시</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map((request: any) => (
                      <tr key={request.id} className="border-b hover:bg-muted/50">
                        <td className="p-3">{request.id}</td>
                        <td className="p-3 font-medium">{request.title}</td>
                        <td className="p-3">{getRequestTypeLabel(request.requestType)}</td>
                        <td className="p-3">{getPriorityBadge(request.priority)}</td>
                        <td className="p-3">{getStatusBadge(request.status)}</td>
                        <td className="p-3">
                          {new Date(request.requestedAt).toLocaleString("ko-KR")}
                        </td>
                        <td className="p-3">
                          {request.approvedAt
                            ? new Date(request.approvedAt).toLocaleString("ko-KR")
                            : request.rejectedAt
                            ? new Date(request.rejectedAt).toLocaleString("ko-KR")
                            : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

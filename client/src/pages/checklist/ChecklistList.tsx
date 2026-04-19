import { useState } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { FileText, CheckCircle, UserCheck, Plus, Calendar, User, Search, X } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function ChecklistList() {
  const [location] = useLocation();
  const searchParams = new URLSearchParams(location.split("?")[1] || "");
  const categoryParam = searchParams.get("category") || "";

  const [selectedInstance, setSelectedInstance] = useState<number | null>(null);
  const [selectedReviewer, setSelectedReviewer] = useState<string>("");
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>(categoryParam);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [assignedToFilter, setAssignedToFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const utils = trpc.useUtils();
  
  const { data: instances, isLoading } = trpc.qualityChecklist.listInstances.useQuery({
    status: statusFilter === "all" ? undefined : (statusFilter as any),
    category: categoryFilter === "all" || !categoryFilter ? undefined : categoryFilter,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    assignedTo: assignedToFilter === "all" ? undefined : parseInt(assignedToFilter),
  });

  const { data: users } = trpc.user.list.useQuery();

  // 클라이언트 측 검색 필터링
  const filteredInstances = instances?.filter((instance: any) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      instance.id.toString().includes(query) ||
      (instance.templateName && instance.templateName.toLowerCase().includes(query))
    );
  }) || [];

  const assignReviewerMutation = trpc.qualityChecklist.assignReviewer.useMutation({
    onSuccess: () => {
      toast.success("승인자가 지정되었습니다");
      utils.qualityChecklist.listInstances.invalidate();
      setShowAssignDialog(false);
      setSelectedInstance(null);
      setSelectedReviewer("");
    },
    onError: (error: { message: string }) => {
      toast.error(error.message);
    },
  });

  const handleAssignReviewer = () => {
    if (!selectedInstance || !selectedReviewer) {
      toast.error("승인자를 선택해주세요");
      return;
    }
    assignReviewerMutation.mutate({
      instanceId: selectedInstance,
      reviewerId: parseInt(selectedReviewer),
    });
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      pending: { label: "대기", variant: "secondary" },
      in_progress: { label: "진행 중", variant: "default" },
      completed: { label: "완료", variant: "outline" },
      skipped: { label: "건너뜀", variant: "destructive" },
      cancelled: { label: "취소", variant: "destructive" },
    };
    const config = statusMap[status] || { label: status, variant: "outline" };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const handleClearFilters = () => {
    setStatusFilter("all");
    setCategoryFilter("all");
    setStartDate("");
    setEndDate("");
    setAssignedToFilter("all");
    setSearchQuery("");
  };

  const hasActiveFilters = statusFilter !== "all" || categoryFilter !== "all" || startDate || endDate || assignedToFilter !== "all" || searchQuery;

  if (isLoading) {
    return (
      <div className="container py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  return (
    <DashboardLayout>
    <div className="space-y-6">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 via-blue-600 to-purple-600 bg-clip-text text-transparent">
              체크리스트 목록
            </h1>
            <p className="text-muted-foreground mt-2">
              작성된 체크리스트를 조회하고 관리할 수 있습니다
            </p>
          </div>
          <Link href="/quality/checklists/select-type">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              새 체크리스트
            </Button>
          </Link>
        </div>

        <Card className="p-4">
          <div className="space-y-4">
            {/* 필터 그룹 1: 검색 */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="체크리스트 번호 또는 템플릿 이름 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-10"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* 필터 그룹 2: 드롭다운 필터 */}
            <div className="flex flex-wrap gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="상태 필터" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 상태</SelectItem>
                  <SelectItem value="pending">대기</SelectItem>
                  <SelectItem value="in_progress">진행 중</SelectItem>
                  <SelectItem value="completed">완료</SelectItem>
                  <SelectItem value="pending_review">승인 대기</SelectItem>
                  <SelectItem value="approved">승인 완료</SelectItem>
                  <SelectItem value="rejected">반려</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="카테고리 필터" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">모든 카테고리</SelectItem>
                  <SelectItem value="CCP">중요관리점(CCP)</SelectItem>
                  <SelectItem value="SANITATION">위생관리</SelectItem>
                  <SelectItem value="QUALITY">품질관리</SelectItem>
                  <SelectItem value="SAFETY">안전관리</SelectItem>
                  <SelectItem value="TRAINING">교육훈련</SelectItem>
                  <SelectItem value="MAINTENANCE">설비유지보수</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={assignedToFilter} onValueChange={setAssignedToFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="담당자 필터" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">모든 담당자</SelectItem>
                  {users?.map((user: any) => (
                    <SelectItem key={user.id} value={user.id.toString()}>
                      {user.name || user.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 필터 그룹 3: 날짜 범위 */}
            <div className="flex flex-wrap gap-2 items-center">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">예정일:</span>
              </div>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-[160px]"
              />
              <span className="text-muted-foreground">–</span>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-[160px]"
              />
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearFilters}
                >
                  <X className="w-4 h-4 mr-1" />
                  모든 필터 초기화
                </Button>
              )}
            </div>

            {/* 필터 요약 */}
            <div className="flex flex-wrap gap-2 items-center text-sm">
              <span className="text-muted-foreground">총 {filteredInstances.length}개의 체크리스트</span>
              {statusFilter !== "all" && <Badge variant="outline">상태: {statusFilter}</Badge>}
              {categoryFilter && categoryFilter !== "all" && <Badge variant="outline">카테고리: {categoryFilter}</Badge>}
              {assignedToFilter !== "all" && <Badge variant="outline">담당자 필터 적용</Badge>}
              {(startDate || endDate) && <Badge variant="outline">날짜 범위 적용</Badge>}
              {searchQuery && <Badge variant="outline">검색: "{searchQuery}"</Badge>}
            </div>
          </div>
        </Card>

        {!filteredInstances || filteredInstances.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg text-muted-foreground">
                {hasActiveFilters ? "필터 조건에 맞는 체크리스트가 없습니다" : "체크리스트가 없습니다"}
              </p>
              {hasActiveFilters && (
                <Button variant="outline" onClick={handleClearFilters} className="mt-4">
                  필터 초기화
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {filteredInstances.map((instance: any) => (
              <Card key={instance.id} className="card-hover">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <FileText className="w-5 h-5" />
                        체크리스트 #{instance.id}
                      </CardTitle>
                      <CardDescription>
                        예정일: {instance.targetDate ? new Date(instance.targetDate).toLocaleDateString() : "-"}
                      </CardDescription>
                    </div>
                    {getStatusBadge(instance.status)}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">템플릿:</span>
                        <p className="font-medium">{instance.templateName || "-"}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">카테고리:</span>
                        <p className="font-medium">{instance.category || "-"}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">담당자:</span>
                        <p className="font-medium">{instance.assignedTo || "-"}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">작성일:</span>
                        <p className="font-medium">
                          {instance.createdAt ? new Date(instance.createdAt).toLocaleDateString() : "-"}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Link href={`/quality/checklists/${instance.id}`}>
                        <Button size="sm" variant="outline">
                          <CheckCircle className="w-4 h-4 mr-2" />
                          상세 보기
                        </Button>
                      </Link>
                      {instance.status === "completed" && !instance.reviewerId && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedInstance(instance.id);
                            setShowAssignDialog(true);
                          }}
                        >
                          <UserCheck className="w-4 h-4 mr-2" />
                          승인자 지정
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* 승인자 지정 다이얼로그 */}
      <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>승인자 지정</DialogTitle>
            <DialogDescription>
              이 체크리스트를 검토할 승인자를 선택해주세요.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Select value={selectedReviewer} onValueChange={setSelectedReviewer}>
              <SelectTrigger>
                <SelectValue placeholder="승인자 선택" />
              </SelectTrigger>
              <SelectContent>
                {users?.map((user: any) => (
                  <SelectItem key={user.id} value={user.id.toString()}>
                    {user.name || user.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignDialog(false)}>
              취소
            </Button>
            <Button onClick={handleAssignReviewer} disabled={assignReviewerMutation.isPending}>
              {assignReviewerMutation.isPending ? "처리 중..." : "지정"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </DashboardLayout>
  );
}

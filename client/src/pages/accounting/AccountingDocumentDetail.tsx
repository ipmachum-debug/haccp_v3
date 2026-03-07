import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  FileText,
  Download,
  ArrowLeft,
  CheckCircle,
  Clock,
  Eye,
  XCircle,
  Upload,
  AlertCircle,
} from "lucide-react";

export default function AccountingDocumentDetail() {
  const [, params] = useRoute("/accounting/documents/:id");
  const [, setLocation] = useLocation();
  
  const documentId = parseInt(params?.id || "0");

  const [statusForm, setStatusForm] = useState({
    status: "uploaded" as const,
    comment: "",
  });

  const { data: detail, isLoading, refetch } = trpc.accountingDocuments.getDetail.useQuery({
    id: documentId,
  });

  const updateStatusMutation = trpc.accountingDocuments.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("문서 상태가 변경되었습니다.");
      refetch();
      setStatusForm({ status: "uploaded", comment: "" });
    },
    onError: (error) => {
      toast.error(`상태 변경 실패: ${error.message}`);
    },
  });

  const handleStatusUpdate = () => {
    updateStatusMutation.mutate({
      documentId,
      status: statusForm.status,
      comment: statusForm.comment || undefined,
    });
  };

  const getCategoryLabel = (cat: string) => {
    const labels: Record<string, string> = {
      monthly_report: "월 마감 리포트",
      tax_invoice: "세금계산서",
      receipt: "영수증",
      journal_entry: "분개장",
      other: "기타",
    };
    return labels[cat] || cat;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "requested":
        return <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" />요청됨</Badge>;
      case "uploaded":
        return <Badge variant="default" className="gap-1 bg-blue-500"><Upload className="h-3 w-3" />업로드됨</Badge>;
      case "reviewed":
        return <Badge variant="default" className="gap-1 bg-purple-500"><Eye className="h-3 w-3" />검토됨</Badge>;
      case "completed":
        return <Badge variant="default" className="gap-1 bg-green-500"><CheckCircle className="h-3 w-3" />완료</Badge>;
      case "rejected":
        return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />반려</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">로딩 중...</div>
        </div>
      </DashboardLayout>
    );
  }

  if (!detail) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-64">
          <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">문서를 찾을 수 없습니다.</p>
          <Button className="mt-4" onClick={() => setLocation("/accounting/documents")}>
            목록으로 돌아가기
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setLocation("/accounting/documents")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">{detail.title}</h1>
              <p className="text-muted-foreground mt-1">
                문서 상세 정보 및 워크플로우 관리
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {getStatusBadge((detail as any).status || detail.workflow?.[0]?.status || "uploaded")}
            <Badge variant="outline">{getCategoryLabel(detail.category)}</Badge>
          </div>
        </div>

        {/* 문서 정보 */}
        <Card>
          <CardHeader>
            <CardTitle>문서 정보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">문서 유형</div>
                <div className="font-medium">{getCategoryLabel(detail.category)}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">기간</div>
                <div className="font-medium">
                  {detail.year}년 {detail.month ? `${detail.month}월` : ""}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">파일명</div>
                <div className="font-medium">{detail.fileName}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">업로드 일시</div>
                <div className="font-medium">
                  {new Date(detail.createdAt).toLocaleString("ko-KR")}
                </div>
              </div>
            </div>

            {detail.description && (
              <div>
                <div className="text-sm text-muted-foreground mb-1">설명</div>
                <div className="font-medium">{detail.description}</div>
              </div>
            )}

            <div className="pt-4">
              <Button
                onClick={() => window.open(detail.fileUrl, "_blank")}
                className="w-full"
              >
                <Download className="mr-2 h-4 w-4" />
                파일 다운로드
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 상태 변경 */}
        <Card>
          <CardHeader>
            <CardTitle>상태 변경</CardTitle>
            <CardDescription>
              문서의 처리 상태를 변경하고 코멘트를 남길 수 있습니다
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="status">새 상태</Label>
              <Select
                value={statusForm.status}
                onValueChange={(value: any) => setStatusForm({ ...statusForm, status: value })}
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="requested">요청됨</SelectItem>
                  <SelectItem value="uploaded">업로드됨</SelectItem>
                  <SelectItem value="reviewed">검토됨</SelectItem>
                  <SelectItem value="completed">완료</SelectItem>
                  <SelectItem value="rejected">반려</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="comment">코멘트 (선택)</Label>
              <Textarea
                id="comment"
                value={statusForm.comment}
                onChange={(e) => setStatusForm({ ...statusForm, comment: e.target.value })}
                placeholder="상태 변경 사유나 추가 정보를 입력하세요"
                rows={3}
              />
            </div>

            <Button
              onClick={handleStatusUpdate}
              disabled={updateStatusMutation.isPending}
              className="w-full"
            >
              {updateStatusMutation.isPending ? "변경 중..." : "상태 변경"}
            </Button>
          </CardContent>
        </Card>

        {/* 워크플로우 이력 */}
        {detail.workflow && detail.workflow.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>워크플로우 이력</CardTitle>
              <CardDescription>
                문서의 상태 변경 이력
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {detail.workflow.map((wf, index) => (
                  <div
                    key={wf.id}
                    className={`flex gap-4 pb-4 ${index !== detail.workflow.length - 1 ? "border-b" : ""}`}
                  >
                    <div className="flex flex-col items-center">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        wf.status === "completed" ? "bg-green-100 text-green-600" :
                        wf.status === "rejected" ? "bg-red-100 text-red-600" :
                        "bg-blue-100 text-blue-600"
                      }`}>
                        {wf.status === "completed" ? <CheckCircle className="h-4 w-4" /> :
                         wf.status === "rejected" ? <XCircle className="h-4 w-4" /> :
                         <Clock className="h-4 w-4" />}
                      </div>
                      {index !== detail.workflow.length - 1 && (
                        <div className="w-0.5 h-full bg-border mt-2" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {getStatusBadge(wf.status)}
                        <span className="text-sm text-muted-foreground">
                          {new Date(wf.changedAt).toLocaleString("ko-KR")}
                        </span>
                      </div>
                      {wf.comment && (
                        <p className="text-sm text-muted-foreground mt-1">{wf.comment}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}

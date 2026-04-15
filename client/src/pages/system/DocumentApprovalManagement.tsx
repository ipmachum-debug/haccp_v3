import { useState } from "react";
import { trpc } from "../../lib/trpc";
import DashboardLayout from "../../components/dashboard/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { CheckCircle, XCircle, Clock, FileText, Search, CheckSquare, Square, ListChecks } from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { Input } from "../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Textarea } from "../../components/ui/textarea";
import { toast } from "sonner";

export default function DocumentApprovalManagement() {
  const [activeTab, setActiveTab] = useState("review");
  const [selectedDocument, setSelectedDocument] = useState<any>(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [comments, setComments] = useState("");
  const [action, setAction] = useState<"approve" | "reject">("approve");
  const [bulkAction, setBulkAction] = useState<"approve" | "reject">("approve");
  const [bulkType, setBulkType] = useState<"review" | "approve">("review");
  
  // 체크박스 선택 상태
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  
  // 필터 상태 - 백엔드 API 입력 스키마에 맞춤
  const [filters, setFilters] = useState({
    documentTypeCode: "",
    category: "",
    searchKeyword: ""
  });

  // 검토 대기 문서 조회 - 백엔드: siteId(필수), status(optional)
  const { data: pendingDocs, refetch: refetchPending } = trpc.documentApproval.getPendingDocuments.useQuery({
    siteId: 1,
    page: 1,
    limit: 100,
    ...(filters.documentTypeCode ? { documentTypeCode: filters.documentTypeCode } : {}),
  });

  // 승인 완료 문서 조회
  const { data: approvedDocs } = trpc.documentApproval.getApprovedDocuments.useQuery({
    siteId: 1,
    page: 1,
    limit: 100,
    ...(filters.documentTypeCode ? { documentTypeCode: filters.documentTypeCode } : {}),
  });

  // 문서 타입 목록 - 백엔드 반환: { types: [...] }
  const { data: documentTypesData } = trpc.documentApproval.getDocumentTypes.useQuery();
  const documentTypes = documentTypesData?.types || [];

  // 검토 mutation - 백엔드 입력: { documentId, action, comments? }
  const reviewMutation = trpc.documentApproval.reviewDocument.useMutation({
    onSuccess: () => {
      toast.success("검토가 완료되었습니다");
      refetchPending();
      setReviewDialogOpen(false);
      setComments("");
    },
    onError: (error: any) => {
      toast.error(`검토 실패: ${error.message}`);
    }
  });

  // 승인 mutation - 백엔드 입력: { documentId, action, comments? }
  const approveMutation = trpc.documentApproval.approveDocument.useMutation({
    onSuccess: () => {
      toast.success("승인이 완료되었습니다");
      refetchPending();
      setApproveDialogOpen(false);
      setComments("");
    },
    onError: (error: any) => {
      toast.error(`승인 실패: ${error.message}`);
    }
  });

  // 일괄 검토 mutation - 백엔드 입력: { documentIds, action, comments? }
  const bulkReviewMutation = trpc.documentApproval.bulkReview.useMutation({
    onSuccess: (result: any) => {
      toast.success(result?.message || "일괄 검토가 완료되었습니다");
      refetchPending();
      setBulkDialogOpen(false);
      setSelectedIds([]);
      setComments("");
    },
    onError: (error: any) => {
      toast.error(`일괄 검토 실패: ${error.message}`);
    }
  });

  // 일괄 승인 mutation - 백엔드 입력: { documentIds, action, comments? }
  const bulkApproveMutation = trpc.documentApproval.bulkApprove.useMutation({
    onSuccess: (result: any) => {
      toast.success(result?.message || "일괄 승인이 완료되었습니다");
      refetchPending();
      setBulkDialogOpen(false);
      setSelectedIds([]);
      setComments("");
    },
    onError: (error: any) => {
      toast.error(`일괄 승인 실패: ${error.message}`);
    }
  });

  // 개별 검토 처리 - 백엔드: { documentId, action, comments? }
  const handleReview = () => {
    if (!selectedDocument) return;
    reviewMutation.mutate({
      documentId: selectedDocument.id,
      action,
      comments
    });
  };

  // 개별 승인 처리 - 백엔드: { documentId, action, comments? }
  const handleApprove = () => {
    if (!selectedDocument) return;
    approveMutation.mutate({
      documentId: selectedDocument.id,
      action,
      comments
    });
  };

  // 일괄 처리 - 백엔드: { documentIds, action, comments? }
  const handleBulkAction = () => {
    if (selectedIds.length === 0) return;
    if (bulkType === "review") {
      bulkReviewMutation.mutate({
        documentIds: selectedIds,
        action: bulkAction,
        comments
      });
    } else {
      bulkApproveMutation.mutate({
        documentIds: selectedIds,
        action: bulkAction,
        comments
      });
    }
  };

  // 체크박스 토글
  const toggleSelect = (id: number) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // 전체 선택/해제 (특정 상태)
  const toggleSelectAll = (status: string) => {
    const docs = allPendingDocuments.filter((d: any) => d.status === status);
    const docIds = docs.map((d: any) => d.id);
    const allSelected = docIds.length > 0 && docIds.every((id: number) => selectedIds.includes(id));
    
    if (allSelected) {
      setSelectedIds(prev => prev.filter(id => !docIds.includes(id)));
    } else {
      setSelectedIds(prev => Array.from(new Set([...prev, ...docIds])));
    }
  };

  // 선택된 문서 중 특정 상태 개수
  const getSelectedCountByStatus = (status: string) => {
    return allPendingDocuments.filter((d: any) => 
      d.status === status && selectedIds.includes(d.id)
    ).length;
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: any }> = {
      draft: { label: "초안", variant: "secondary" },
      pending_review: { label: "검토 대기", variant: "warning" },
      pending_approval: { label: "승인 대기", variant: "warning" },
      approved: { label: "승인 완료", variant: "success" },
      rejected: { label: "반려", variant: "destructive" }
    };
    const config = statusMap[status] || { label: status, variant: "default" };
    return <Badge variant={config.variant as any}>{config.label}</Badge>;
  };

  const getCategoryBadge = (category: string) => {
    const categoryMap: Record<string, { label: string; color: string }> = {
      production: { label: "생산", color: "bg-blue-100 text-blue-800" },
      ccp: { label: "CCP", color: "bg-red-100 text-red-800" },
      inspection: { label: "검사", color: "bg-green-100 text-green-800" },
      training: { label: "교육", color: "bg-purple-100 text-purple-800" },
      hygiene: { label: "위생", color: "bg-yellow-100 text-yellow-800" },
      prerequisite: { label: "선행관리", color: "bg-orange-100 text-orange-800" },
      other: { label: "기타", color: "bg-gray-100 text-gray-800" }
    };
    const config = categoryMap[category] || { label: category || "기타", color: "bg-gray-100 text-gray-800" };
    return <Badge className={config.color}>{config.label}</Badge>;
  };

  // 문서 배열 안전하게 가져오기 - 백엔드 snake_case 필드명 사용
  const allPendingDocuments = Array.isArray(pendingDocs?.documents) ? pendingDocs.documents : [];
  const reviewPendingDocs = allPendingDocuments.filter((d: any) => d.status === "pending_review");
  const approvalPendingDocs = allPendingDocuments.filter((d: any) => d.status === "pending_approval");
  const approvedDocuments = Array.isArray(approvedDocs?.documents) ? approvedDocs.documents : [];

  // 문서 카드 렌더링 함수 - 백엔드 snake_case 필드명 사용
  const renderDocumentCard = (doc: any, type: "review" | "approve") => (
    <Card key={doc.id} className={`transition-colors ${selectedIds.includes(doc.id) ? (type === 'review' ? 'border-blue-400 bg-blue-50/50 dark:bg-blue-950/10' : 'border-green-400 bg-green-50/50 dark:bg-green-950/10') : ''}`}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <button
              onClick={() => toggleSelect(doc.id)}
              className="mt-1 text-muted-foreground hover:text-blue-600 transition-colors"
            >
              {selectedIds.includes(doc.id) 
                ? <CheckSquare className="w-5 h-5 text-blue-600" /> 
                : <Square className="w-5 h-5" />
              }
            </button>
            <div>
              <CardTitle className="text-lg">{doc.document_type_name || "문서"}</CardTitle>
              <CardDescription>
                작업 날짜: {doc.work_date ? format(new Date(doc.work_date), "PPP", { locale: ko }) : "N/A"}
              </CardDescription>
            </div>
          </div>
          <div className="flex gap-2">
            {getCategoryBadge(doc.document_category)}
            {getStatusBadge(doc.status)}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 ml-8">
          <div>
            <p className="text-sm text-muted-foreground">문서 코드</p>
            <p className="font-medium">{doc.document_type_code || "N/A"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">배치 ID</p>
            <p className="font-medium">{doc.batch_id || "N/A"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">제품 ID</p>
            <p className="font-medium">{doc.product_id || "N/A"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">작성 일시</p>
            <p className="font-medium">
              {doc.created_at ? format(new Date(doc.created_at), "PPpp", { locale: ko }) : "N/A"}
            </p>
          </div>
        </div>
        
        <div className="ml-8">
          {doc.is_auto_generated === 1 && (
            <Badge variant="outline" className="mb-4">
              <FileText className="w-3 h-3 mr-1" />
              자동 생성
            </Badge>
          )}
          {doc.review_comments && (
            <p className="text-sm text-muted-foreground mb-4">
              검토 의견: {doc.review_comments}
            </p>
          )}

          <div className="flex gap-2">
            {type === "review" && (
              <>
                <Button
                  size="sm"
                  onClick={() => {
                    setSelectedDocument(doc);
                    setAction("approve");
                    setReviewDialogOpen(true);
                  }}
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  검토 승인
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    setSelectedDocument(doc);
                    setAction("reject");
                    setReviewDialogOpen(true);
                  }}
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  검토 반려
                </Button>
              </>
            )}
            {type === "approve" && (
              <>
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => {
                    setSelectedDocument(doc);
                    setAction("approve");
                    setApproveDialogOpen(true);
                  }}
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  최종 승인
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    setSelectedDocument(doc);
                    setAction("reject");
                    setApproveDialogOpen(true);
                  }}
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  반려
                </Button>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">문서 승인 관리</h1>
          <p className="text-muted-foreground">
            자동 생성된 문서를 검토하고 승인합니다. 체크박스로 여러 문서를 선택하여 일괄 처리할 수 있습니다.
          </p>
        </div>

        {/* 일괄 처리 액션 바 */}
        {selectedIds.length > 0 && (
          <Card className="mb-4 border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800">
            <CardContent className="py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ListChecks className="w-5 h-5 text-blue-600" />
                  <span className="font-medium text-blue-700 dark:text-blue-400">
                    {selectedIds.length}개 문서 선택됨
                  </span>
                  {getSelectedCountByStatus("pending_review") > 0 && (
                    <Badge variant="outline">{getSelectedCountByStatus("pending_review")}개 검토 대기</Badge>
                  )}
                  {getSelectedCountByStatus("pending_approval") > 0 && (
                    <Badge variant="outline">{getSelectedCountByStatus("pending_approval")}개 승인 대기</Badge>
                  )}
                </div>
                <div className="flex gap-2">
                  {getSelectedCountByStatus("pending_review") > 0 && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => {
                          setBulkType("review");
                          setBulkAction("approve");
                          setBulkDialogOpen(true);
                        }}
                      >
                        일괄 검토 승인
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          setBulkType("review");
                          setBulkAction("reject");
                          setBulkDialogOpen(true);
                        }}
                      >
                        일괄 검토 반려
                      </Button>
                    </>
                  )}
                  {getSelectedCountByStatus("pending_approval") > 0 && (
                    <>
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700"
                        onClick={() => {
                          setBulkType("approve");
                          setBulkAction("approve");
                          setBulkDialogOpen(true);
                        }}
                      >
                        일괄 최종 승인
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          setBulkType("approve");
                          setBulkAction("reject");
                          setBulkDialogOpen(true);
                        }}
                      >
                        일괄 반려
                      </Button>
                    </>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedIds([])}
                  >
                    선택 해제
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 필터 */}
        <Card className="mb-4">
          <CardContent className="py-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">문서 타입</label>
                <Select
                  value={filters.documentTypeCode || "all"}
                  onValueChange={(value) => setFilters({ ...filters, documentTypeCode: value === 'all' ? '' : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="전체" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    {documentTypes.map((type: any, idx: number) => (
                      <SelectItem key={type.id || idx} value={type.code || String(type.id || idx)}>
                      {type.name || '알 수 없음'}
                    </SelectItem>
                  ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <label className="text-sm font-medium mb-2 block">카테고리</label>
                <Select
                  value={filters.category || "all"}
                  onValueChange={(value) => setFilters({ ...filters, category: value === 'all' ? '' : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="전체" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    <SelectItem value="production">생산</SelectItem>
                    <SelectItem value="ccp">CCP</SelectItem>
                    <SelectItem value="inspection">검사</SelectItem>
                    <SelectItem value="training">교육</SelectItem>
                    <SelectItem value="hygiene">위생</SelectItem>
                    <SelectItem value="prerequisite">선행관리</SelectItem>
                    <SelectItem value="other">기타</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <label className="text-sm font-medium mb-2 block">검색</label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="문서 타입명 또는 코드"
                    value={filters.searchKeyword}
                    onChange={(e) => setFilters({ ...filters, searchKeyword: e.target.value })}
                    className="pl-9"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="review">
              <Clock className="w-4 h-4 mr-2" />
              검토 대기 ({reviewPendingDocs.length})
            </TabsTrigger>
            <TabsTrigger value="approval">
              <FileText className="w-4 h-4 mr-2" />
              승인 대기 ({approvalPendingDocs.length})
            </TabsTrigger>
            <TabsTrigger value="approved">
              <CheckCircle className="w-4 h-4 mr-2" />
              승인 완료 ({approvedDocuments.length})
            </TabsTrigger>
          </TabsList>

          {/* 검토 대기 탭 */}
          <TabsContent value="review" className="space-y-4">
            {reviewPendingDocs.length > 0 && (
              <div className="flex items-center gap-2 py-2">
                <button
                  onClick={() => toggleSelectAll("pending_review")}
                  className="text-muted-foreground hover:text-blue-600 transition-colors"
                >
                  {reviewPendingDocs.every((d: any) => selectedIds.includes(d.id)) && reviewPendingDocs.length > 0
                    ? <CheckSquare className="w-5 h-5 text-blue-600" />
                    : <Square className="w-5 h-5" />
                  }
                </button>
                <span className="text-sm text-muted-foreground">전체 선택</span>
              </div>
            )}
            {reviewPendingDocs.map((doc: any) => renderDocumentCard(doc, "review"))}
            {reviewPendingDocs.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium mb-1">검토 대기 문서가 없습니다</p>
                  <p className="text-sm">배치 완료 시 자동 생성된 문서가 이곳에 표시됩니다</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* 승인 대기 탭 */}
          <TabsContent value="approval" className="space-y-4">
            {approvalPendingDocs.length > 0 && (
              <div className="flex items-center gap-2 py-2">
                <button
                  onClick={() => toggleSelectAll("pending_approval")}
                  className="text-muted-foreground hover:text-green-600 transition-colors"
                >
                  {approvalPendingDocs.every((d: any) => selectedIds.includes(d.id)) && approvalPendingDocs.length > 0
                    ? <CheckSquare className="w-5 h-5 text-green-600" />
                    : <Square className="w-5 h-5" />
                  }
                </button>
                <span className="text-sm text-muted-foreground">전체 선택</span>
              </div>
            )}
            {approvalPendingDocs.map((doc: any) => renderDocumentCard(doc, "approve"))}
            {approvalPendingDocs.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium mb-1">승인 대기 문서가 없습니다</p>
                  <p className="text-sm">검토 승인된 문서가 이곳에 표시됩니다</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* 승인 완료 탭 */}
          <TabsContent value="approved" className="space-y-4">
            {approvedDocuments.map((doc: any) => (
              <Card key={doc.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{doc.document_type_name || "문서"}</CardTitle>
                      <CardDescription>
                        작업 날짜: {doc.work_date ? format(new Date(doc.work_date), "PPP", { locale: ko }) : "N/A"}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      {getCategoryBadge(doc.document_category)}
                      {getStatusBadge(doc.status)}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">문서 코드</p>
                      <p className="font-medium">{doc.document_type_code || "N/A"}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">승인 일시</p>
                      <p className="font-medium">
                        {doc.approved_at ? format(new Date(doc.approved_at), "PPpp", { locale: ko }) : "N/A"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">배치 ID</p>
                      <p className="font-medium">{doc.batch_id || "N/A"}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">PDF</p>
                      {doc.pdf_url ? (
                        <Button size="sm" variant="outline" onClick={() => window.open(doc.pdf_url, "_blank")}>
                          PDF 보기
                        </Button>
                      ) : (
                        <p className="font-medium text-muted-foreground">미생성</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {approvedDocuments.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <CheckCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium mb-1">승인 완료 문서가 없습니다</p>
                  <p className="text-sm">승인된 문서가 이곳에 표시됩니다</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* 검토 다이얼로그 */}
        <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {action === "approve" ? "검토 승인" : "검토 반려"}
              </DialogTitle>
              <DialogDescription>
                {selectedDocument?.document_type_name} - {selectedDocument?.work_date}
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <label className="text-sm font-medium mb-2 block">의견 (선택)</label>
              <Textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="검토 의견을 입력하세요"
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setReviewDialogOpen(false)}>
                취소
              </Button>
              <Button 
                onClick={handleReview} 
                disabled={reviewMutation.isPending}
                variant={action === "reject" ? "destructive" : "default"}
              >
                {reviewMutation.isPending ? "처리 중..." : (action === "approve" ? "검토 승인" : "검토 반려")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 승인 다이얼로그 */}
        <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {action === "approve" ? "최종 승인" : "반려"}
              </DialogTitle>
              <DialogDescription>
                {selectedDocument?.document_type_name} - {selectedDocument?.work_date}
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <label className="text-sm font-medium mb-2 block">의견 (선택)</label>
              <Textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="승인 의견을 입력하세요"
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setApproveDialogOpen(false)}>
                취소
              </Button>
              <Button 
                onClick={handleApprove} 
                disabled={approveMutation.isPending}
                variant={action === "reject" ? "destructive" : "default"}
              >
                {approveMutation.isPending ? "처리 중..." : (action === "approve" ? "최종 승인" : "반려")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 일괄 처리 다이얼로그 */}
        <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                일괄 {bulkType === "review" ? "검토" : "승인"} {bulkAction === "approve" ? "승인" : "반려"}
              </DialogTitle>
              <DialogDescription>
                {selectedIds.length}개 문서를 일괄 처리합니다
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <div className="mb-4 max-h-40 overflow-y-auto">
                {allPendingDocuments
                  .filter((d: any) => selectedIds.includes(d.id))
                  .map((doc: any) => (
                    <div key={doc.id} className="flex items-center gap-2 py-1 text-sm">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      <span>{doc.document_type_name}</span>
                      <span className="text-muted-foreground">({doc.work_date})</span>
                    </div>
                  ))
                }
              </div>
              <label className="text-sm font-medium mb-2 block">공통 의견 (선택)</label>
              <Textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="공통 의견을 입력하세요"
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setBulkDialogOpen(false)}>
                취소
              </Button>
              <Button
                onClick={handleBulkAction}
                disabled={bulkReviewMutation.isPending || bulkApproveMutation.isPending}
                variant={bulkAction === "reject" ? "destructive" : "default"}
              >
                {bulkReviewMutation.isPending || bulkApproveMutation.isPending 
                  ? "처리 중..." 
                  : `${selectedIds.length}개 문서 ${bulkAction === "approve" ? "승인" : "반려"}`
                }
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}

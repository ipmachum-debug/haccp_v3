import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useLocation } from "wouter";
import { Plus, FileText, ArrowLeft, Calendar, Trash2, Edit, Send, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { ReactNode } from "react";

// ============================================================================
// 공통 리스트 설정
// ============================================================================
export interface ChecklistListConfig {
  formType: string;           // genericChecklist formType
  title: string;              // 리스트 제목 (예: "종사자 건강상태 확인 일지")
  description: string;        // 설명
  icon: ReactNode;            // 아이콘
  basePath: string;           // 기본 경로 (예: "/employee-health-check")
  backPath: string;           // 뒤로가기 경로 (예: "/quality/checklists")
  // 각 폼별 추가 컬럼 (선택)
  extraColumns?: {
    header: string;
    width: string;
    render: (record: any) => ReactNode;
  }[];
}

// ============================================================================
// 공통 리스트 페이지 컴포넌트
// ============================================================================
export default function ChecklistListPage({ config }: { config: ChecklistListConfig }) {
  const [, setLocation] = useLocation();
  const navigate = (path: string) => setLocation(path);
  const { toast } = useToast();
  const [searchDate, setSearchDate] = useState("");
  const [submittingId, setSubmittingId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);

  // genericChecklist API에서 해당 formType의 레코드 조회
  const { data: records, isLoading, refetch } = trpc.genericChecklist.list.useQuery({
    formType: config.formType,
  });

  const deleteMutation = trpc.genericChecklist.delete.useMutation({
    onSuccess: () => {
      toast({ title: "삭제 완료", description: `${config.title}가 삭제되었습니다.` });
      refetch();
    },
    onError: (error: any) => {
      toast({ title: "삭제 실패", description: error.message, variant: "destructive" });
    },
  });

  const submitForReviewMutation = trpc.genericChecklist.submitForReview.useMutation({
    onSuccess: () => {
      toast({ title: "승인 요청 완료", description: "검토자에게 승인 요청이 전송되었습니다." });
      setSubmittingId(null);
      refetch();
    },
    onError: (error: any) => {
      toast({ title: "승인 요청 실패", description: error.message, variant: "destructive" });
      setSubmittingId(null);
    },
  });

  // ============================================================================
  // 개별 핸들러
  // ============================================================================
  const handleDelete = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("정말 삭제하시겠습니까?")) {
      deleteMutation.mutate({ id });
    }
  };

  const handleSubmitForReview = (record: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("승인을 요청하시겠습니까?")) {
      setSubmittingId(record.id);
      submitForReviewMutation.mutate({
        id: record.id,
        requestType: config.formType,
        title: record.title || `${config.title} - ${record.formDate}`,
        description: `작성일: ${record.formDate}`,
      });
    }
  };

  // ============================================================================
  // 일괄 처리 핸들러
  // ============================================================================
  const handleBatchDelete = async () => {
    const draftIds = Array.from(selectedIds).filter(id => {
      const record = filteredRecords.find((r: any) => r.id === id);
      return record && record.status === "draft";
    });
    if (draftIds.length === 0) {
      toast({ title: "삭제 불가", description: "작성중 상태의 항목만 삭제할 수 있습니다.", variant: "destructive" });
      return;
    }
    if (!confirm(`선택된 ${draftIds.length}건을 삭제하시겠습니까?`)) return;
    
    setIsBatchProcessing(true);
    try {
      for (const id of draftIds) {
        await deleteMutation.mutateAsync({ id });
      }
      toast({ title: "일괄 삭제 완료", description: `${draftIds.length}건이 삭제되었습니다.` });
      setSelectedIds(new Set());
      refetch();
    } catch (error: any) {
      toast({ title: "일괄 삭제 실패", description: error.message, variant: "destructive" });
    } finally {
      setIsBatchProcessing(false);
    }
  };

  const handleBatchSubmit = async () => {
    const draftIds = Array.from(selectedIds).filter(id => {
      const record = filteredRecords.find((r: any) => r.id === id);
      return record && record.status === "draft";
    });
    if (draftIds.length === 0) {
      toast({ title: "승인요청 불가", description: "작성중 상태의 항목만 승인요청할 수 있습니다.", variant: "destructive" });
      return;
    }
    if (!confirm(`선택된 ${draftIds.length}건을 승인요청하시겠습니까?`)) return;
    
    setIsBatchProcessing(true);
    try {
      for (const id of draftIds) {
        const record = filteredRecords.find((r: any) => r.id === id);
        await submitForReviewMutation.mutateAsync({
          id,
          requestType: config.formType,
          title: record?.title || `${config.title} - ${record?.formDate}`,
          description: `작성일: ${record?.formDate}`,
        });
      }
      toast({ title: "일괄 승인요청 완료", description: `${draftIds.length}건의 승인요청이 전송되었습니다.` });
      setSelectedIds(new Set());
      refetch();
    } catch (error: any) {
      toast({ title: "일괄 승인요청 실패", description: error.message, variant: "destructive" });
    } finally {
      setIsBatchProcessing(false);
    }
  };

  // ============================================================================
  // 선택 핸들러
  // ============================================================================
  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredRecords.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredRecords.map((r: any) => r.id)));
    }
  };

  // ============================================================================
  // 유틸리티
  // ============================================================================
  const filteredRecords = records?.filter((record: any) => {
    if (!searchDate) return true;
    return record.formDate === searchDate;
  }) || [];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-600 text-white text-xs">승인완료</Badge>;
      case "submitted":
        return <Badge className="bg-yellow-500 text-white text-xs">승인대기</Badge>;
      case "rejected":
        return <Badge variant="destructive" className="text-xs">반려</Badge>;
      case "draft":
      default:
        return <Badge variant="outline" className="text-xs">작성중</Badge>;
    }
  };

  const getWriterName = (record: any) => {
    try {
      const fd = record.formData as any;
      if (fd?.approval?.writerName) return fd.approval.writerName;
    } catch {}
    return "-";
  };

  // tenant_seq 표시 (없으면 리스트 인덱스 사용)
  const getTenantSeq = (record: any) => {
    if (record.tenantSeq) return record.tenantSeq;
    return null;
  };

  // ============================================================================
  // 렌더링
  // ============================================================================
  return (
    <DashboardLayout>
      <div className="container mx-auto py-6 max-w-[1200px]">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button variant="outline" size="sm" onClick={() => navigate(config.backPath)}>
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  체크리스트
                </Button>
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {config.icon}
                    {config.title}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {config.description}
                  </CardDescription>
                </div>
              </div>
              <Button onClick={() => navigate(`${config.basePath}/new`)} className="gap-1">
                <Plus className="h-4 w-4" />
                신규 작성
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* 검색 필터 + 일괄 처리 버튼 */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <Input
                    type="date"
                    value={searchDate}
                    onChange={(e) => setSearchDate(e.target.value)}
                    className="w-40 h-9"
                  />
                </div>
                <Button variant="outline" size="sm" onClick={() => setSearchDate("")}>
                  초기화
                </Button>
              </div>
              {selectedIds.size > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{selectedIds.size}건 선택</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-blue-600 border-blue-300 hover:bg-blue-50"
                    onClick={handleBatchSubmit}
                    disabled={isBatchProcessing}
                  >
                    {isBatchProcessing ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Send className="h-3 w-3 mr-1" />}
                    일괄 승인요청
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleBatchDelete}
                    disabled={isBatchProcessing}
                  >
                    {isBatchProcessing ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Trash2 className="h-3 w-3 mr-1" />}
                    일괄 삭제
                  </Button>
                </div>
              )}
            </div>

            {isLoading ? (
              <div className="text-center py-12 text-muted-foreground">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-3"></div>
                로딩 중...
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-10 text-center">
                        <Checkbox
                          checked={filteredRecords.length > 0 && selectedIds.size === filteredRecords.length}
                          onCheckedChange={toggleSelectAll}
                        />
                      </TableHead>
                      <TableHead className="w-12 text-center">No.</TableHead>
                      <TableHead className="w-28">작성일</TableHead>
                      <TableHead>제목</TableHead>
                      <TableHead className="w-20 text-center">작성자</TableHead>
                      {config.extraColumns?.map((col, idx) => (
                        <TableHead key={idx} className={`${col.width} text-center`}>{col.header}</TableHead>
                      ))}
                      <TableHead className="w-24 text-center">승인 상태</TableHead>
                      <TableHead className="w-52 text-center">작업</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRecords.length > 0 ? (
                      filteredRecords.map((record: any, index: number) => (
                        <TableRow
                          key={record.id}
                          className={`hover:bg-muted/30 cursor-pointer ${selectedIds.has(record.id) ? "bg-blue-50" : ""}`}
                          onClick={() => navigate(`${config.basePath}/${record.id}`)}
                        >
                          <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selectedIds.has(record.id)}
                              onCheckedChange={() => toggleSelect(record.id)}
                            />
                          </TableCell>
                          <TableCell className="text-center text-muted-foreground">
                            {getTenantSeq(record) ?? (index + 1)}
                          </TableCell>
                          <TableCell className="font-medium text-sm">
                            {record.formDate || new Date(record.createdAt).toLocaleDateString("ko-KR")}
                          </TableCell>
                          <TableCell className="text-sm">
                            {record.title || `${config.title} - ${record.formDate}`}
                          </TableCell>
                          <TableCell className="text-center text-sm">
                            {getWriterName(record)}
                          </TableCell>
                          {config.extraColumns?.map((col, idx) => (
                            <TableCell key={idx} className="text-center text-sm">
                              {col.render(record)}
                            </TableCell>
                          ))}
                          <TableCell className="text-center">
                            {getStatusBadge(record.status)}
                          </TableCell>
                          <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                            <div className="flex flex-wrap gap-1 justify-center">
                              {record.status === "draft" && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs text-blue-600 border-blue-300 hover:bg-blue-50"
                                  onClick={(e) => handleSubmitForReview(record, e)}
                                  disabled={submittingId === record.id}
                                >
                                  {submittingId === record.id ? (
                                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                  ) : (
                                    <Send className="h-3 w-3 mr-1" />
                                  )}
                                  승인요청
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => navigate(`${config.basePath}/${record.id}`)}
                              >
                                <Edit className="h-3 w-3 mr-1" />
                                수정
                              </Button>
                              {record.status === "draft" && (
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={(e) => handleDelete(record.id, e)}
                                >
                                  <Trash2 className="h-3 w-3 mr-1" />
                                  삭제
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={7 + (config.extraColumns?.length || 0)} className="text-center py-12 text-muted-foreground">
                          <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          등록된 {config.title}가 없습니다.
                          <br />
                          <Button variant="link" className="mt-2" onClick={() => navigate(`${config.basePath}/new`)}>
                            새로운 {config.title} 작성하기
                          </Button>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}

            {filteredRecords.length > 0 && (
              <div className="mt-3 text-sm text-muted-foreground">
                총 {filteredRecords.length}건의 기록이 있습니다.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

/**
 * 견적서 목록 페이지 — Phase C (2026-04-14)
 * ═══════════════════════════════════════════════════════════════
 * 상태 필터 + 검색 + 액션 (발송/수락/거절/취소/변환/PDF)
 * ═══════════════════════════════════════════════════════════════
 */
import { useState } from "react";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  FileText,
  Plus,
  Search,
  Send,
  CheckCircle,
  XCircle,
  Trash2,
  ArrowRight,
  Eye,
  Printer,
  ClipboardCopy,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  draft: { label: "작성 중", className: "bg-slate-200 text-slate-700 border-transparent" },
  sent: { label: "발송됨", className: "bg-blue-600 text-white border-transparent" },
  accepted: { label: "수락됨", className: "bg-emerald-600 text-white border-transparent" },
  rejected: { label: "거절됨", className: "bg-rose-600 text-white border-transparent" },
  expired: { label: "만료됨", className: "bg-amber-500 text-white border-transparent" },
  converted: { label: "매출 변환", className: "bg-purple-600 text-white border-transparent" },
  cancelled: { label: "취소됨", className: "bg-zinc-500 text-white border-transparent" },
};

export default function QuotationList() {
  return (
    <DashboardLayout>
      <QuotationListContent />
    </DashboardLayout>
  );
}

function QuotationListContent() {
  const [, navigate] = useLocation();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchText, setSearchText] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const utils = trpc.useUtils();

  // 견적 목록
  const { data: quotations = [], isLoading } = trpc.quotation.list.useQuery({
    status: statusFilter !== "all" ? (statusFilter as any) : undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    search: searchText || undefined,
  });

  // KPI 통계
  const { data: stats } = trpc.quotation.stats.useQuery();

  // Mutations
  const sendMutation = trpc.quotation.markSent.useMutation({
    onSuccess: () => {
      toast({ title: "발송 처리 완료" });
      utils.quotation.list.invalidate();
      utils.quotation.stats.invalidate();
    },
    onError: (e: any) => toast({ title: "실패", description: e.message, variant: "destructive" }),
  });
  const acceptMutation = trpc.quotation.markAccepted.useMutation({
    onSuccess: () => {
      toast({ title: "수락 처리 완료" });
      utils.quotation.list.invalidate();
      utils.quotation.stats.invalidate();
    },
    onError: (e: any) => toast({ title: "실패", description: e.message, variant: "destructive" }),
  });
  const rejectMutation = trpc.quotation.markRejected.useMutation({
    onSuccess: () => {
      toast({ title: "거절 처리 완료" });
      utils.quotation.list.invalidate();
      utils.quotation.stats.invalidate();
    },
    onError: (e: any) => toast({ title: "실패", description: e.message, variant: "destructive" }),
  });
  const cancelMutation = trpc.quotation.cancel.useMutation({
    onSuccess: () => {
      toast({ title: "취소 처리 완료" });
      utils.quotation.list.invalidate();
    },
    onError: (e: any) => toast({ title: "실패", description: e.message, variant: "destructive" }),
  });
  const deleteMutation = trpc.quotation.delete.useMutation({
    onSuccess: () => {
      toast({ title: "삭제 완료" });
      utils.quotation.list.invalidate();
    },
    onError: (e: any) => toast({ title: "실패", description: e.message, variant: "destructive" }),
  });
  const convertMutation = trpc.quotation.convertToSale.useMutation({
    onSuccess: (res: any) => {
      toast({
        title: "매출 변환 완료",
        description: `매출 전표 ${res.createdSaleIds?.length || 0}건 생성`,
      });
      utils.quotation.list.invalidate();
      utils.quotation.stats.invalidate();
    },
    onError: (e: any) => toast({ title: "실패", description: e.message, variant: "destructive" }),
  });
  const pdfMutation = trpc.quotation.generatePdf.useMutation({
    onSuccess: (res: any) => {
      const blob = new Blob([Uint8Array.from(atob(res.pdf), (c) => c.charCodeAt(0))], {
        type: "application/pdf",
      });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    },
    onError: (e: any) => toast({ title: "PDF 생성 실패", description: e.message, variant: "destructive" }),
  });

  const handleAction = (action: string, q: any) => {
    if (action === "send") {
      if (confirm(`견적서 ${q.quotationNumber} 를 발송 처리하시겠습니까?`)) {
        sendMutation.mutate({ id: q.id });
      }
    } else if (action === "accept") {
      if (confirm(`견적서 ${q.quotationNumber} 를 수락 처리하시겠습니까?`)) {
        acceptMutation.mutate({ id: q.id });
      }
    } else if (action === "reject") {
      const reason = prompt("거절 사유 (선택)");
      if (reason !== null) rejectMutation.mutate({ id: q.id, reason: reason || undefined });
    } else if (action === "cancel") {
      if (confirm(`견적서 ${q.quotationNumber} 를 취소하시겠습니까?`)) {
        cancelMutation.mutate({ id: q.id });
      }
    } else if (action === "delete") {
      if (confirm(`견적서 ${q.quotationNumber} 를 삭제하시겠습니까? (작성 중 만 가능)`)) {
        deleteMutation.mutate({ id: q.id });
      }
    } else if (action === "convert") {
      if (confirm(`견적서 ${q.quotationNumber} 를 매출 전표로 변환하시겠습니까?`)) {
        convertMutation.mutate({ id: q.id });
      }
    } else if (action === "pdf") {
      pdfMutation.mutate({ id: q.id });
    }
  };

  return (
    <div className="p-4 space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <FileText className="h-5 w-5 text-indigo-600" />
            견적서 관리
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            고객 견적 생성 → 발송 → 수락 → 매출 전표 자동 변환
          </p>
        </div>
        <Button
          onClick={() => navigate("/dashboard/accounting/quotations/create")}
          className="bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700"
        >
          <Plus className="h-4 w-4 mr-1" /> 견적서 등록
        </Button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">전체</p>
            <p className="text-2xl font-bold">{stats?.total ?? 0}건</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">발송</p>
            <p className="text-2xl font-bold text-blue-600">{stats?.sentCount ?? 0}건</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">수락</p>
            <p className="text-2xl font-bold text-emerald-600">{stats?.acceptedCount ?? 0}건</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">매출 변환</p>
            <p className="text-2xl font-bold text-purple-600">{stats?.convertedCount ?? 0}건</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">파이프라인</p>
            <p className="text-xl font-bold text-amber-600">
              {(stats?.pipelineAmount ?? 0).toLocaleString()}원
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 필터 */}
      <Card>
        <CardContent className="py-3">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div>
              <Label className="text-xs">상태</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  <SelectItem value="draft">작성 중</SelectItem>
                  <SelectItem value="sent">발송됨</SelectItem>
                  <SelectItem value="accepted">수락됨</SelectItem>
                  <SelectItem value="rejected">거절됨</SelectItem>
                  <SelectItem value="converted">변환됨</SelectItem>
                  <SelectItem value="cancelled">취소됨</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">시작일</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-9"
              />
            </div>
            <div>
              <Label className="text-xs">종료일</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs">검색</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="견적번호 검색"
                  className="h-9 pl-8"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 목록 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">견적서 목록</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>견적번호</TableHead>
                <TableHead>거래처</TableHead>
                <TableHead>견적일</TableHead>
                <TableHead>유효기간</TableHead>
                <TableHead>제목</TableHead>
                <TableHead className="text-right">총액</TableHead>
                <TableHead>상태</TableHead>
                <TableHead className="text-center">액션</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    로딩 중...
                  </TableCell>
                </TableRow>
              ) : quotations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    등록된 견적서가 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                quotations.map((q: any) => {
                  const status = STATUS_LABELS[q.status] || { label: q.status, className: "" };
                  return (
                    <TableRow key={q.id} className="group">
                      <TableCell className="font-mono text-xs">{q.quotationNumber}</TableCell>
                      <TableCell className="text-sm">{q.partnerName || `#${q.partnerId}`}</TableCell>
                      <TableCell className="text-xs">{q.quoteDate}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {q.validUntil || "-"}
                      </TableCell>
                      <TableCell className="text-sm max-w-[220px] truncate">
                        {q.title || "-"}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {Number(q.grandTotal).toLocaleString()}원
                      </TableCell>
                      <TableCell>
                        <Badge className={status.className}>{status.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-1 opacity-80 group-hover:opacity-100">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleAction("pdf", q)}
                            title="PDF 미리보기"
                            className="h-7 w-7 p-0"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {q.status === "draft" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleAction("send", q)}
                              title="발송"
                              className="h-7 w-7 p-0 text-blue-600"
                            >
                              <Send className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {q.status === "sent" && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleAction("accept", q)}
                                title="수락"
                                className="h-7 w-7 p-0 text-emerald-600"
                              >
                                <CheckCircle className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleAction("reject", q)}
                                title="거절"
                                className="h-7 w-7 p-0 text-rose-600"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                          {q.status === "accepted" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleAction("convert", q)}
                              title="매출 전표로 변환"
                              className="h-7 px-2 text-purple-600"
                            >
                              <ArrowRight className="h-3.5 w-3.5 mr-1" />
                              변환
                            </Button>
                          )}
                          {["draft", "sent"].includes(q.status) && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleAction("cancel", q)}
                              title="취소"
                              className="h-7 w-7 p-0 text-zinc-500"
                            >
                              <ClipboardCopy className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {q.status === "draft" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleAction("delete", q)}
                              title="삭제"
                              className="h-7 w-7 p-0 text-red-500 hover:bg-red-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

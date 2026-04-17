/**
 * 견적서 목록 페이지 — Phase C (2026-04-14)
 * ═══════════════════════════════════════════════════════════════
 * 상태 필터 + 검색 + 액션 (발송/수락/거절/취소/변환/PDF)
 * ═══════════════════════════════════════════════════════════════
 */
import { useState, useMemo } from "react";
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
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
  Copy,
  History,
  Edit,
  Save,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { MaterialCombobox } from "@/components/inventory/MaterialCombobox";
import { ProductCombobox } from "@/components/inventory/ProductCombobox";
import { PartnerSearchInput } from "@/components/inventory/PartnerSearchInput";

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

  // 수정 Dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingQuo, setEditingQuo] = useState<any>(null);
  const [editPartnerId, setEditPartnerId] = useState<number | null>(null);
  const [editPartnerName, setEditPartnerName] = useState("");
  const [editQuoteDate, setEditQuoteDate] = useState("");
  const [editValidUntil, setEditValidUntil] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editPaymentTerms, setEditPaymentTerms] = useState("");
  const [editDeliveryTerms, setEditDeliveryTerms] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editLines, setEditLines] = useState<Array<{
    id: string;
    targetType: "material" | "product" | "service";
    materialId: number | null;
    productId: number | null;
    itemName: string;
    itemCode?: string;
    description?: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    discountRate: number;
    taxAmount: number;
    notes?: string;
  }>>([]);

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
  const updateMutation = trpc.quotation.update.useMutation({
    onSuccess: (r: any) => {
      toast({ title: "수정 완료", description: r.message });
      utils.quotation.list.invalidate();
      utils.quotation.stats.invalidate();
      setEditDialogOpen(false);
      setEditingQuo(null);
    },
    onError: (e: any) => toast({ title: "수정 실패", description: e.message, variant: "destructive" }),
  });
  // 견적서 복사
  const duplicateMutation = trpc.quotation.duplicate.useMutation({
    onSuccess: (r: any) => {
      toast({ title: "복사 완료", description: `${r.quotationNumber} 생성` });
      utils.quotation.list.invalidate();
    },
    onError: (e: any) => toast({ title: "복사 실패", description: e.message, variant: "destructive" }),
  });
  // 거래처 이력
  const [historyPartnerId, setHistoryPartnerId] = useState<number | null>(null);
  const [historyPartnerName, setHistoryPartnerName] = useState("");
  const { data: partnerHistory } = trpc.quotation.partnerHistory.useQuery(
    { partnerId: historyPartnerId || undefined, partnerName: historyPartnerName || undefined },
    { enabled: !!historyPartnerId || !!historyPartnerName },
  );

  // PDF 공통 헬퍼
  const base64ToPdfBlob = (b64: string): Blob => {
    const byteCharacters = atob(b64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    return new Blob([new Uint8Array(byteNumbers)], { type: "application/pdf" });
  };

  // 미리보기 (Eye) - 새 탭
  const previewPdfMutation = trpc.quotation.generatePdf.useMutation({
    onSuccess: (res: any) => {
      const blob = base64ToPdfBlob(res.pdf);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      toast({ title: "미리보기", description: "새 탭에서 열렸습니다." });
    },
    onError: (e: any) => toast({ title: "미리보기 실패", description: e.message, variant: "destructive" }),
  });

  // 인쇄 (Printer) - iframe 자동 프린트
  const printPdfMutation = trpc.quotation.generatePdf.useMutation({
    onSuccess: (res: any) => {
      const blob = base64ToPdfBlob(res.pdf);
      const url = URL.createObjectURL(blob);
      const iframe = document.createElement("iframe");
      iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
      iframe.src = url;
      iframe.onload = () => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch (_) {
          window.open(url, "_blank");
        }
      };
      document.body.appendChild(iframe);
      setTimeout(() => {
        try { document.body.removeChild(iframe); URL.revokeObjectURL(url); } catch (_) { /* ignore */ }
      }, 120_000);
      toast({ title: "인쇄", description: "프린트 대화상자를 엽니다." });
    },
    onError: (e: any) => toast({ title: "인쇄 실패", description: e.message, variant: "destructive" }),
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
      previewPdfMutation.mutate({ id: q.id });
    } else if (action === "print") {
      printPdfMutation.mutate({ id: q.id });
    } else if (action === "duplicate") {
      if (confirm(`견적서 ${q.quotationNumber} 를 복사하시겠습니까?`)) {
        duplicateMutation.mutate({ id: q.id });
      }
    } else if (action === "history") {
      setHistoryPartnerId(q.partnerId);
      setHistoryPartnerName(q.partnerName || "");
    } else if (action === "printDoc") {
      printQuotationDoc(q);
    }
  };

  // 견적서 규격 문서 인쇄
  const printQuotationDoc = async (q: any) => {
    // 상세 조회
    let lines: any[] = [];
    try {
      const detail = await utils.quotation.getById.fetch({ id: q.id });
      lines = (detail as any)?.lines || [];
    } catch (_) {}

    const pw = window.open("", "_blank");
    if (!pw) return;
    const lineRows = lines.map((l: any, i: number) =>
      `<tr><td class="b tc">${i+1}</td><td class="b">${l.itemName || ""}</td><td class="b tc">${l.description || ""}</td>
       <td class="b tc">${l.quantity || 0}</td><td class="b tc">${l.unit || "EA"}</td>
       <td class="b r">₩${Number(l.unitPrice || 0).toLocaleString()}</td>
       <td class="b r">₩${Number(l.amount || 0).toLocaleString()}</td></tr>`
    ).join("");

    pw.document.write(`<html><head><title>견적서 ${q.quotationNumber}</title>
    <style>body{font-family:'Malgun Gothic',sans-serif;font-size:11px;padding:20px;max-width:210mm;margin:0 auto}
    h1{text-align:center;font-size:20px;border-bottom:3px double #000;padding-bottom:8px}
    table{width:100%;border-collapse:collapse;margin-bottom:12px}
    .b{border:1px solid #999;padding:4px 6px} .tc{text-align:center} .r{text-align:right} .bg{background:#f3f4f6;font-weight:bold}
    @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;margin:0;padding:10px}}</style></head><body>
    <h1>견 적 서</h1>
    <table><tr><td class="b bg" width="15%">견적번호</td><td class="b" width="35%">${q.quotationNumber}</td>
      <td class="b bg" width="15%">견적일</td><td class="b">${q.quoteDate || ""}</td></tr>
    <tr><td class="b bg">거래처</td><td class="b">${q.partnerName || ""}</td>
      <td class="b bg">유효기간</td><td class="b">${q.validUntil || "-"}</td></tr>
    <tr><td class="b bg">제목</td><td class="b" colspan="3">${q.title || ""}</td></tr></table>

    <table><tr class="bg"><th class="b" width="30">No</th><th class="b">품목</th><th class="b">규격</th>
      <th class="b" width="50">수량</th><th class="b" width="40">단위</th><th class="b" width="80">단가</th><th class="b" width="90">금액</th></tr>
    ${lineRows || '<tr><td class="b tc" colspan="7">품목 없음</td></tr>'}
    </table>

    <table><tr><td class="b bg" width="50%">공급가액</td><td class="b r">₩${Number(q.subtotal || 0).toLocaleString()}</td></tr>
    <tr><td class="b bg">부가세</td><td class="b r">₩${Number(q.taxAmount || 0).toLocaleString()}</td></tr>
    <tr><td class="b bg" style="font-size:14px">합계금액</td><td class="b r" style="font-size:14px;font-weight:bold">₩${Number(q.grandTotal || 0).toLocaleString()}</td></tr></table>

    <table><tr><td class="b bg">결제조건</td><td class="b">${q.paymentTerms || "-"}</td></tr>
    <tr><td class="b bg">비고</td><td class="b">${q.notes || "-"}</td></tr></table>

    <div style="margin-top:30px;text-align:right">
      <p style="font-size:9px;color:#999">본 견적서의 유효기간은 ${q.validUntil || "별도 협의"} 까지입니다.</p>
      <p style="font-size:9px;color:#999">HACCP-ONE 자동생성</p>
    </div>
    <script>window.onload=function(){setTimeout(function(){window.print()},600)}</script></body></html>`);
    pw.document.close();
  };

  // 수정 Dialog
  const handleOpenEdit = async (q: any) => {
    setEditingQuo(q);
    setEditPartnerId(q.partnerId);
    setEditPartnerName(q.partnerName || `#${q.partnerId}`);
    setEditQuoteDate(q.quoteDate || "");
    setEditValidUntil(q.validUntil || "");
    setEditTitle(q.title || "");
    setEditNotes(q.notes || "");
    setEditPaymentTerms("");
    setEditDeliveryTerms("");
    try {
      const detail = await utils.quotation.getById.fetch({ id: q.id });
      setEditPaymentTerms((detail as any)?.paymentTerms || "");
      setEditDeliveryTerms((detail as any)?.deliveryTerms || "");
      setEditLines(
        ((detail as any)?.lines || []).map((l: any) => ({
          id: `${l.id}-${Date.now()}`,
          targetType: l.targetType || "product",
          materialId: l.materialId,
          productId: l.productId,
          itemName: l.itemName,
          itemCode: l.itemCode || "",
          description: l.description || "",
          quantity: Number(l.quantity),
          unit: l.unit || "EA",
          unitPrice: Number(l.unitPrice),
          discountRate: Number(l.discountRate || 0),
          taxAmount: Number(l.taxAmount || 0),
          notes: l.notes || "",
        }))
      );
    } catch (e) {
      setEditLines([]);
    }
    setEditDialogOpen(true);
  };

  const handleEditSave = () => {
    if (!editingQuo) return;
    if (!editPartnerId) {
      toast({ title: "거래처를 선택하세요", variant: "destructive" });
      return;
    }
    if (editLines.some((l) => !l.itemName || l.quantity <= 0 || l.unitPrice < 0)) {
      toast({ title: "모든 품목의 품목명/수량/단가를 확인하세요", variant: "destructive" });
      return;
    }
    updateMutation.mutate({
      id: editingQuo.id,
      partnerId: editPartnerId,
      quoteDate: editQuoteDate,
      validUntil: editValidUntil || undefined,
      title: editTitle || undefined,
      paymentTerms: editPaymentTerms || undefined,
      deliveryTerms: editDeliveryTerms || undefined,
      notes: editNotes || undefined,
      lines: editLines.map((l) => ({
        targetType: l.targetType,
        materialId: l.materialId || undefined,
        productId: l.productId || undefined,
        itemName: l.itemName,
        itemCode: l.itemCode || undefined,
        description: l.description || undefined,
        quantity: l.quantity,
        unit: l.unit,
        unitPrice: l.unitPrice,
        discountRate: l.discountRate || undefined,
        taxAmount: l.taxAmount,
        notes: l.notes || undefined,
      })),
    });
  };

  const recalcEditLine = (l: any) => {
    const gross = (l.quantity || 0) * (l.unitPrice || 0);
    const discount = gross * ((l.discountRate || 0) / 100);
    const amount = gross - discount;
    return { ...l, taxAmount: Math.round(amount * 0.1) };
  };

  const addEditLine = () => {
    setEditLines((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        targetType: "product",
        materialId: null,
        productId: null,
        itemName: "",
        itemCode: "",
        description: "",
        quantity: 0,
        unit: "EA",
        unitPrice: 0,
        discountRate: 0,
        taxAmount: 0,
        notes: "",
      },
    ]);
  };

  const removeEditLine = (id: string) => {
    if (editLines.length <= 1) {
      toast({ title: "최소 1개 품목이 필요합니다", variant: "destructive" });
      return;
    }
    setEditLines((prev) => prev.filter((l) => l.id !== id));
  };

  const updateEditLine = (id: string, patch: Record<string, any>) => {
    setEditLines((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        return recalcEditLine({ ...l, ...patch });
      })
    );
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
                          {/* 미리보기 */}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleAction("pdf", q)}
                            disabled={previewPdfMutation.isPending}
                            title="견적서 미리보기"
                            className="h-7 w-7 p-0"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {/* 인쇄 */}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleAction("print", q)}
                            disabled={printPdfMutation.isPending}
                            title="견적서 인쇄"
                            className="h-7 w-7 p-0"
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </Button>
                          {/* 수정 (draft만) */}
                          {q.status === "draft" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenEdit(q)}
                              title="수정"
                              className="h-7 w-7 p-0 text-orange-600 hover:bg-orange-50"
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                          )}
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
                          {/* 복사/인쇄/이력 */}
                          <Button size="sm" variant="outline" onClick={() => handleAction("duplicate", q)}
                            title="복사" className="h-7 w-7 p-0 text-indigo-500 hover:bg-indigo-50">
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleAction("printDoc", q)}
                            title="인쇄" className="h-7 w-7 p-0 text-gray-500 hover:bg-gray-50">
                            <Printer className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleAction("history", q)}
                            title="거래처 이력" className="h-7 w-7 p-0 text-teal-500 hover:bg-teal-50">
                            <History className="h-3.5 w-3.5" />
                          </Button>
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
      {/* 수정 Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5 text-orange-600" />
              견적서 수정 — {editingQuo?.quotationNumber}
            </DialogTitle>
            <DialogDescription>
              작성 중(draft) 견적서의 내용을 수정합니다.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="col-span-2">
                <Label className="text-xs">거래처 *</Label>
                <PartnerSearchInput
                  selectedId={editPartnerId}
                  selectedName={editPartnerName}
                  onSelect={(id, name) => {
                    setEditPartnerId(id);
                    setEditPartnerName(name);
                  }}
                  onClear={() => {
                    setEditPartnerId(null);
                    setEditPartnerName("");
                  }}
                  placeholder="거래처 검색"
                />
              </div>
              <div>
                <Label className="text-xs">견적일 *</Label>
                <Input type="date" value={editQuoteDate} onChange={(e) => setEditQuoteDate(e.target.value)} className="h-9" />
              </div>
              <div>
                <Label className="text-xs">유효기간</Label>
                <Input type="date" value={editValidUntil} onChange={(e) => setEditValidUntil(e.target.value)} className="h-9" />
              </div>
              <div className="col-span-4">
                <Label className="text-xs">제목</Label>
                <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="견적 제목" className="h-9" />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">결제 조건</Label>
                <Input value={editPaymentTerms} onChange={(e) => setEditPaymentTerms(e.target.value)} className="h-9" />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">배송 조건</Label>
                <Input value={editDeliveryTerms} onChange={(e) => setEditDeliveryTerms(e.target.value)} className="h-9" />
              </div>
              <div className="col-span-4">
                <Label className="text-xs">메모</Label>
                <Input value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="특이사항" className="h-9" />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">품목 ({editLines.length})</Label>
              <Button size="sm" variant="outline" onClick={addEditLine}>
                <Plus className="h-3.5 w-3.5 mr-1" /> 추가
              </Button>
            </div>
            <div className="border rounded max-h-[300px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">#</TableHead>
                    <TableHead className="w-[80px]">타입</TableHead>
                    <TableHead>품목</TableHead>
                    <TableHead className="w-[80px]">수량</TableHead>
                    <TableHead className="w-[100px]">단가</TableHead>
                    <TableHead className="w-[60px]">할인%</TableHead>
                    <TableHead className="w-[90px] text-right">금액</TableHead>
                    <TableHead className="w-[40px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {editLines.map((line, idx) => {
                    const gross = (line.quantity || 0) * (line.unitPrice || 0);
                    const disc = gross * ((line.discountRate || 0) / 100);
                    const lineAmt = Math.round(gross - disc);
                    return (
                      <TableRow key={line.id}>
                        <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell>
                          <Select
                            value={line.targetType}
                            onValueChange={(v) =>
                              updateEditLine(line.id, {
                                targetType: v,
                                materialId: null,
                                productId: null,
                                itemName: "",
                                itemCode: "",
                              })
                            }
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="product">제품</SelectItem>
                              <SelectItem value="material">원재료</SelectItem>
                              <SelectItem value="service">서비스</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          {line.targetType === "service" ? (
                            <Input
                              value={line.itemName}
                              onChange={(e) => updateEditLine(line.id, { itemName: e.target.value })}
                              placeholder="서비스명"
                              className="h-8"
                            />
                          ) : line.targetType === "material" ? (
                            <MaterialCombobox
                              selectedId={line.materialId}
                              selectedName={line.itemName}
                              itemTypes={["raw_material", "subsidiary", "external_product"]}
                              placeholder="품목 검색..."
                              onSelect={(m) =>
                                updateEditLine(line.id, {
                                  materialId: m.id,
                                  productId: null,
                                  itemName: m.materialName,
                                  itemCode: m.materialCode || "",
                                  unit: m.unit || line.unit,
                                })
                              }
                              onClear={() =>
                                updateEditLine(line.id, { materialId: null, itemName: "", itemCode: "" })
                              }
                            />
                          ) : (
                            <ProductCombobox
                              selectedId={line.productId}
                              selectedName={line.itemName}
                              onSelect={(p) =>
                                updateEditLine(line.id, {
                                  productId: p.id,
                                  materialId: null,
                                  itemName: p.productName,
                                  itemCode: p.productCode || "",
                                })
                              }
                              onClear={() =>
                                updateEditLine(line.id, { productId: null, itemName: "", itemCode: "" })
                              }
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.001"
                            value={line.quantity || ""}
                            onChange={(e) => updateEditLine(line.id, { quantity: parseFloat(e.target.value) || 0 })}
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={line.unitPrice || ""}
                            onChange={(e) => updateEditLine(line.id, { unitPrice: parseFloat(e.target.value) || 0 })}
                            className="h-8 text-right"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={line.discountRate || ""}
                            onChange={(e) => updateEditLine(line.id, { discountRate: parseFloat(e.target.value) || 0 })}
                            min={0}
                            max={100}
                            step={0.01}
                            className="h-8 text-right"
                          />
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {lineAmt.toLocaleString()}원
                        </TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost" onClick={() => removeEditLine(line.id)} className="h-6 w-6 p-0 text-red-500">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              취소
            </Button>
            <Button
              onClick={handleEditSave}
              disabled={updateMutation.isPending}
              className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600"
            >
              <Save className="h-4 w-4 mr-2" />
              {updateMutation.isPending ? "저장 중..." : "수정 저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 거래처 견적 이력 다이얼로그 */}
      {(historyPartnerId || historyPartnerName) && (
        <Dialog open onOpenChange={() => { setHistoryPartnerId(null); setHistoryPartnerName(""); }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>거래처 견적 이력 — {historyPartnerName}</DialogTitle>
            </DialogHeader>
            {partnerHistory?.summary && (
              <div className="grid grid-cols-4 gap-2 mb-3">
                <div className="bg-blue-50 rounded-lg p-2 text-center">
                  <p className="text-[10px] text-muted-foreground">총 견적</p>
                  <p className="text-lg font-bold text-blue-700">{partnerHistory.summary.totalCount}건</p>
                </div>
                <div className="bg-emerald-50 rounded-lg p-2 text-center">
                  <p className="text-[10px] text-muted-foreground">총 금액</p>
                  <p className="text-sm font-bold text-emerald-700">₩{partnerHistory.summary.totalAmount.toLocaleString()}</p>
                </div>
                <div className="bg-violet-50 rounded-lg p-2 text-center">
                  <p className="text-[10px] text-muted-foreground">매출 전환</p>
                  <p className="text-lg font-bold text-violet-700">{partnerHistory.summary.convertedCount}건</p>
                </div>
                <div className="bg-amber-50 rounded-lg p-2 text-center">
                  <p className="text-[10px] text-muted-foreground">전환율</p>
                  <p className="text-lg font-bold text-amber-700">{partnerHistory.summary.conversionRate}%</p>
                </div>
              </div>
            )}
            <div className="max-h-[300px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead><tr className="border-b bg-muted/30 sticky top-0">
                  <th className="p-2 text-left">견적번호</th>
                  <th className="p-2 text-left">날짜</th>
                  <th className="p-2 text-left">제목</th>
                  <th className="p-2 text-right">금액</th>
                  <th className="p-2 text-center">상태</th>
                </tr></thead>
                <tbody>
                  {partnerHistory?.history?.map((h: any) => (
                    <tr key={h.id} className="border-b hover:bg-accent/50">
                      <td className="p-2 font-mono">{h.number}</td>
                      <td className="p-2">{h.date}</td>
                      <td className="p-2 truncate max-w-[200px]">{h.title}</td>
                      <td className="p-2 text-right font-mono">₩{h.amount.toLocaleString()}</td>
                      <td className="p-2 text-center">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                          h.status === "converted" ? "bg-emerald-100 text-emerald-700" :
                          h.status === "accepted" ? "bg-blue-100 text-blue-700" :
                          h.status === "rejected" ? "bg-red-100 text-red-700" :
                          h.status === "expired" ? "bg-gray-100 text-gray-500" :
                          "bg-amber-100 text-amber-700"
                        }`}>
                          {h.status === "converted" ? "매출전환" : h.status === "accepted" ? "수락" :
                           h.status === "rejected" ? "거절" : h.status === "expired" ? "만료" :
                           h.status === "sent" ? "발송" : "작성"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

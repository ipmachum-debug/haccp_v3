/**
 * 세금계산서 (Tax Invoice) 관리 페이지 — Phase C Part 2 UI (2026-04-14)
 * ═══════════════════════════════════════════════════════════════
 * - 매출/매입 탭 전환 + 상태 필터 + 검색
 * - 등록/자세히(Eye)/인쇄(Printer)/발행/취소/삭제/팝빌전송
 * - 팝빌 STUB 모드 배너 (환경변수 미설정 시)
 * ═══════════════════════════════════════════════════════════════
 */
import { useState, useMemo } from "react";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Receipt,
  Plus,
  Search,
  Eye,
  Printer,
  Trash2,
  CheckCircle,
  XCircle,
  Send,
  AlertTriangle,
  FileText,
  Settings2,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { PartnerSearchInput } from "@/components/inventory/PartnerSearchInput";
import PopbillSettingsContent from "./PopbillSettings";

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  draft: { label: "작성 중", className: "bg-slate-200 text-slate-700 border-transparent" },
  issued: { label: "사내 발행", className: "bg-blue-600 text-white border-transparent" },
  sent_to_popbill: { label: "팝빌 전송중", className: "bg-amber-500 text-white border-transparent" },
  approved: { label: "국세청 승인", className: "bg-emerald-600 text-white border-transparent" },
  rejected: { label: "거부됨", className: "bg-rose-600 text-white border-transparent" },
  cancelled: { label: "취소됨", className: "bg-zinc-500 text-white border-transparent" },
};

const TAX_CATEGORY_LABELS: Record<string, string> = {
  taxed: "과세(10%)",
  zero_rated: "영세율",
  tax_free: "면세",
};

type InvoiceType = "sales" | "purchase";

interface LineRow {
  key: string;
  itemName: string;
  itemSpec: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  supplyAmount: string;
  taxAmount: string;
  notes: string;
}

function emptyLine(): LineRow {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    itemName: "",
    itemSpec: "",
    quantity: "",
    unit: "EA",
    unitPrice: "",
    supplyAmount: "",
    taxAmount: "",
    notes: "",
  };
}

export default function TaxInvoiceManagement() {
  return (
    <DashboardLayout>
      <TaxInvoiceContent />
    </DashboardLayout>
  );
}

function TaxInvoiceContent() {
  const [tab, setTab] = useState<InvoiceType>("sales");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchText, setSearchText] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // 등록 Dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [popbillOpen, setPopbillOpen] = useState(false);
  const [createType, setCreateType] = useState<InvoiceType>("sales");
  const [createTaxCategory, setCreateTaxCategory] = useState<
    "taxed" | "zero_rated" | "tax_free"
  >("taxed");
  const [createReceiptType, setCreateReceiptType] = useState<"invoice" | "receipt">(
    "invoice",
  );
  const [createPartnerId, setCreatePartnerId] = useState<number | null>(null);
  const [createPartnerName, setCreatePartnerName] = useState("");
  const [createIssueDate, setCreateIssueDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [createSupplyDate, setCreateSupplyDate] = useState("");
  const [createRemark1, setCreateRemark1] = useState("");
  const [createNotes, setCreateNotes] = useState("");
  const [createLines, setCreateLines] = useState<LineRow[]>([emptyLine()]);

  const utils = trpc.useUtils();

  // 목록
  const { data: invoices = [], isLoading } = trpc.taxInvoice.list.useQuery({
    invoiceType: tab,
    status: statusFilter !== "all" ? (statusFilter as any) : undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    search: searchText || undefined,
  });

  // KPI (올해 통계)
  const { data: statsRaw } = trpc.taxInvoice.stats.useQuery({});
  const stats = useMemo(() => {
    const arr = (statsRaw as any[]) || [];
    let salesCount = 0, salesSupply = 0, salesTax = 0;
    let purchaseCount = 0, purchaseSupply = 0, purchaseTax = 0;
    arr.forEach((row: any) => {
      if (row.invoice_type === "sales") {
        salesCount += Number(row.count || 0);
        salesSupply += Number(row.supplyTotal || 0);
        salesTax += Number(row.taxTotal || 0);
      } else if (row.invoice_type === "purchase") {
        purchaseCount += Number(row.count || 0);
        purchaseSupply += Number(row.supplyTotal || 0);
        purchaseTax += Number(row.taxTotal || 0);
      }
    });
    return { salesCount, salesSupply, salesTax, purchaseCount, purchaseSupply, purchaseTax };
  }, [statsRaw]);

  // 팝빌 모드
  const { data: popbillInfo } = trpc.popbillSettings.get.useQuery();
  const isStubMode = popbillInfo?.mode === "stub";

  // Mutations
  const createMutation = trpc.taxInvoice.create.useMutation({
    onSuccess: (res: any) => {
      toast({ title: "등록 완료", description: res.message });
      utils.taxInvoice.list.invalidate();
      utils.taxInvoice.stats.invalidate();
      setCreateOpen(false);
      resetCreateForm();
    },
    onError: (e: { message: string }) =>
      toast({ title: "등록 실패", description: e.message, variant: "destructive" }),
  });

  const issueMutation = trpc.taxInvoice.issue.useMutation({
    onSuccess: () => {
      toast({ title: "발행 처리 완료" });
      utils.taxInvoice.list.invalidate();
    },
    onError: (e: { message: string }) =>
      toast({ title: "발행 실패", description: e.message, variant: "destructive" }),
  });

  const cancelMutation = trpc.taxInvoice.cancel.useMutation({
    onSuccess: () => {
      toast({ title: "취소 처리 완료" });
      utils.taxInvoice.list.invalidate();
    },
    onError: (e: { message: string }) =>
      toast({ title: "취소 실패", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = trpc.taxInvoice.delete.useMutation({
    onSuccess: () => {
      toast({ title: "삭제 완료" });
      utils.taxInvoice.list.invalidate();
    },
    onError: (e: { message: string }) =>
      toast({ title: "삭제 실패", description: e.message, variant: "destructive" }),
  });

  const sendPopbillMutation = trpc.taxInvoice.sendToPopbill.useMutation({
    onSuccess: (res: any) => {
      toast({ title: "팝빌 전송", description: res.message });
      utils.taxInvoice.list.invalidate();
    },
    onError: (e: { message: string }) =>
      toast({ title: "팝빌 전송 실패", description: e.message, variant: "destructive" }),
  });

  // PDF 공통 헬퍼
  const base64ToPdfBlob = (b64: string): Blob => {
    const byteCharacters = atob(b64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    return new Blob([new Uint8Array(byteNumbers)], { type: "application/pdf" });
  };

  const previewPdfMutation = trpc.taxInvoice.generatePdf.useMutation({
    onSuccess: (res: any) => {
      const blob = base64ToPdfBlob(res.pdf);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      toast({ title: "미리보기", description: "새 탭에서 열렸습니다." });
    },
    onError: (e: { message: string }) =>
      toast({ title: "미리보기 실패", description: e.message, variant: "destructive" }),
  });

  const printPdfMutation = trpc.taxInvoice.generatePdf.useMutation({
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
        try {
          document.body.removeChild(iframe);
          URL.revokeObjectURL(url);
        } catch (_) { /* ignore */ }
      }, 120_000);
      toast({ title: "인쇄", description: "프린트 대화상자를 엽니다." });
    },
    onError: (e: { message: string }) =>
      toast({ title: "인쇄 실패", description: e.message, variant: "destructive" }),
  });

  // 등록 폼 초기화
  const resetCreateForm = () => {
    setCreatePartnerId(null);
    setCreatePartnerName("");
    setCreateTaxCategory("taxed");
    setCreateReceiptType("invoice");
    setCreateIssueDate(new Date().toISOString().slice(0, 10));
    setCreateSupplyDate("");
    setCreateRemark1("");
    setCreateNotes("");
    setCreateLines([emptyLine()]);
  };

  const openCreate = (type: InvoiceType) => {
    setCreateType(type);
    resetCreateForm();
    setCreateOpen(true);
  };

  // 라인 추가/삭제/수정
  const addLine = () => {
    if (createLines.length >= 4) {
      toast({
        title: "최대 4개까지만 가능",
        description: "한국 세법 표준 — 4건 초과 시 '외 N건'으로 처리됩니다.",
        variant: "destructive",
      });
      return;
    }
    setCreateLines([...createLines, emptyLine()]);
  };

  const removeLine = (key: string) => {
    if (createLines.length <= 1) {
      toast({ title: "최소 1개 품목이 필요합니다", variant: "destructive" });
      return;
    }
    setCreateLines(createLines.filter((l) => l.key !== key));
  };

  const updateLine = (key: string, patch: Partial<LineRow>) => {
    setCreateLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const next = { ...l, ...patch };
        // 수량 × 단가 → 공급가액 자동 계산
        if ("quantity" in patch || "unitPrice" in patch) {
          const q = parseFloat(next.quantity) || 0;
          const p = parseFloat(next.unitPrice) || 0;
          const supply = Math.round(q * p);
          next.supplyAmount = supply > 0 ? String(supply) : "";
          // 과세 기준 세액 10%
          if (createTaxCategory === "taxed") {
            next.taxAmount = supply > 0 ? String(Math.round(supply * 0.1)) : "";
          }
        }
        if ("supplyAmount" in patch && createTaxCategory === "taxed") {
          const s = parseFloat(next.supplyAmount) || 0;
          next.taxAmount = s > 0 ? String(Math.round(s * 0.1)) : "";
        }
        return next;
      }),
    );
  };

  // 합계
  const createTotal = useMemo(() => {
    let supply = 0, tax = 0;
    createLines.forEach((l) => {
      supply += parseFloat(l.supplyAmount) || 0;
      tax += parseFloat(l.taxAmount) || 0;
    });
    return { supply, tax, total: supply + tax };
  }, [createLines]);

  const handleCreateSubmit = () => {
    if (!createPartnerId) {
      toast({ title: "거래처를 선택하세요", variant: "destructive" });
      return;
    }
    if (!createIssueDate) {
      toast({ title: "작성일자를 입력하세요", variant: "destructive" });
      return;
    }
    const invalidLine = createLines.find(
      (l) => !l.itemName.trim() || !l.supplyAmount,
    );
    if (invalidLine) {
      toast({
        title: "품목명/공급가액 필수",
        description: "모든 라인의 품목명과 공급가액을 입력하세요.",
        variant: "destructive",
      });
      return;
    }

    createMutation.mutate({
      invoiceType: createType,
      taxCategory: createTaxCategory,
      receiptType: createReceiptType,
      partnerId: createPartnerId,
      issueDate: createIssueDate,
      supplyDate: createSupplyDate || undefined,
      remark1: createRemark1 || undefined,
      notes: createNotes || undefined,
      lines: createLines.map((l) => ({
        itemName: l.itemName,
        itemSpec: l.itemSpec || undefined,
        quantity: l.quantity ? parseFloat(l.quantity) : undefined,
        unit: l.unit || undefined,
        unitPrice: l.unitPrice ? parseFloat(l.unitPrice) : undefined,
        supplyAmount: parseFloat(l.supplyAmount) || 0,
        taxAmount: l.taxAmount ? parseFloat(l.taxAmount) : undefined,
        notes: l.notes || undefined,
      })),
    });
  };

  // 액션 핸들러
  const handleAction = (action: string, ti: any) => {
    if (action === "preview") {
      previewPdfMutation.mutate({ id: ti.id });
    } else if (action === "print") {
      printPdfMutation.mutate({ id: ti.id });
    } else if (action === "issue") {
      if (confirm(`${ti.invoiceNumber} 를 사내 발행 처리하시겠습니까?`)) {
        issueMutation.mutate({ id: ti.id });
      }
    } else if (action === "cancel") {
      const reason = prompt("취소 사유 (선택)");
      if (reason !== null) cancelMutation.mutate({ id: ti.id, reason: reason || undefined });
    } else if (action === "delete") {
      if (confirm(`${ti.invoiceNumber} 를 삭제하시겠습니까? (작성 중만 가능)`)) {
        deleteMutation.mutate({ id: ti.id });
      }
    } else if (action === "popbill") {
      if (
        confirm(
          `${ti.invoiceNumber} 를 팝빌로 전송하시겠습니까?\n${
            isStubMode ? "★ 현재 STUB 모드 — 실제 국세청으로 전송되지 않습니다." : ""
          }`,
        )
      ) {
        sendPopbillMutation.mutate({ id: ti.id });
      }
    }
  };

  return (
    <div className="p-4 space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Receipt className="h-5 w-5 text-indigo-600" />
            세금계산서 관리
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            사내 발행 → 팝빌 전자발행 → 국세청 승인 · 매출/매입 양방향
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setPopbillOpen(true)}
            variant="outline"
            className="border-slate-300 text-slate-700 hover:bg-slate-50"
            title="팝빌 연동 설정"
          >
            <Settings2 className="h-4 w-4 mr-1" /> 팝빌 설정
          </Button>
          <Button
            onClick={() => openCreate("sales")}
            className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700"
          >
            <Plus className="h-4 w-4 mr-1" /> 매출 세금계산서
          </Button>
          <Button
            onClick={() => openCreate("purchase")}
            variant="outline"
            className="border-blue-300 text-blue-700 hover:bg-blue-50"
          >
            <Plus className="h-4 w-4 mr-1" /> 매입 세금계산서
          </Button>
        </div>
      </div>

      {/* STUB 모드 배너 */}
      {isStubMode && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="py-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-700 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-amber-900">
              <strong>팝빌 STUB 모드</strong> — 환경변수{" "}
              <code className="bg-amber-100 px-1 rounded">POPBILL_LINK_ID</code> /{" "}
              <code className="bg-amber-100 px-1 rounded">POPBILL_SECRET_KEY</code> 가
              설정되지 않아 실제 국세청 전송이 되지 않습니다. 모든 팝빌 호출은 가짜 응답을
              반환합니다. (테스트/개발 용)
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">매출 건수</p>
            <p className="text-2xl font-bold text-emerald-600">
              {stats.salesCount.toLocaleString()}건
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">매출 공급가액</p>
            <p className="text-xl font-bold text-emerald-700">
              {stats.salesSupply.toLocaleString()}원
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">매입 건수</p>
            <p className="text-2xl font-bold text-blue-600">
              {stats.purchaseCount.toLocaleString()}건
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">매입 공급가액</p>
            <p className="text-xl font-bold text-blue-700">
              {stats.purchaseSupply.toLocaleString()}원
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 탭 + 필터 */}
      <Card>
        <CardContent className="py-3 space-y-3">
          <Tabs value={tab} onValueChange={(v) => setTab(v as InvoiceType)}>
            <TabsList>
              <TabsTrigger value="sales">매출 세금계산서</TabsTrigger>
              <TabsTrigger value="purchase">매입 세금계산서</TabsTrigger>
            </TabsList>
          </Tabs>

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
                  <SelectItem value="issued">사내 발행</SelectItem>
                  <SelectItem value="sent_to_popbill">팝빌 전송중</SelectItem>
                  <SelectItem value="approved">국세청 승인</SelectItem>
                  <SelectItem value="rejected">거부됨</SelectItem>
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
                  placeholder="세금계산서 번호 검색"
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
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            {tab === "sales" ? "매출 세금계산서" : "매입 세금계산서"} 목록
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>세금계산서번호</TableHead>
                <TableHead>거래처</TableHead>
                <TableHead>사업자번호</TableHead>
                <TableHead>작성일</TableHead>
                <TableHead>과세구분</TableHead>
                <TableHead className="text-right">공급가액</TableHead>
                <TableHead className="text-right">세액</TableHead>
                <TableHead className="text-right">합계</TableHead>
                <TableHead>상태</TableHead>
                <TableHead className="text-center">액션</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                    로딩 중...
                  </TableCell>
                </TableRow>
              ) : invoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                    등록된 세금계산서가 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                invoices.map((ti: any) => {
                  const status = STATUS_LABELS[ti.status] || {
                    label: ti.status,
                    className: "",
                  };
                  return (
                    <TableRow key={ti.id} className="group">
                      <TableCell className="font-mono text-xs">
                        {ti.invoiceNumber}
                      </TableCell>
                      <TableCell className="text-sm">
                        {ti.partnerName || `#${ti.partnerId}`}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {ti.partnerBizNo || "-"}
                      </TableCell>
                      <TableCell className="text-xs">{ti.issueDate}</TableCell>
                      <TableCell className="text-xs">
                        <Badge variant="outline" className="text-[10px]">
                          {TAX_CATEGORY_LABELS[ti.taxCategory] || ti.taxCategory}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-xs">
                        {Number(ti.supplyAmount || 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-xs">
                        {Number(ti.taxAmount || 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums font-semibold">
                        {Number(ti.totalAmount || 0).toLocaleString()}원
                      </TableCell>
                      <TableCell>
                        <Badge className={status.className}>{status.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-1 opacity-80 group-hover:opacity-100">
                          {/* 자세히 */}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleAction("preview", ti)}
                            disabled={previewPdfMutation.isPending}
                            title="자세히 보기"
                            className="h-7 w-7 p-0"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {/* 인쇄 */}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleAction("print", ti)}
                            disabled={printPdfMutation.isPending}
                            title="인쇄"
                            className="h-7 w-7 p-0"
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </Button>
                          {/* 발행 (draft만) */}
                          {ti.status === "draft" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleAction("issue", ti)}
                              title="사내 발행"
                              className="h-7 w-7 p-0 text-blue-600"
                            >
                              <CheckCircle className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {/* 팝빌 전송 (매출 sales + issued/draft만) */}
                          {ti.invoiceType === "sales" &&
                            ["draft", "issued", "rejected"].includes(ti.status) && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleAction("popbill", ti)}
                                disabled={sendPopbillMutation.isPending}
                                title="팝빌 전송"
                                className="h-7 w-7 p-0 text-purple-600"
                              >
                                <Send className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          {/* 취소 (cancelled 외) */}
                          {ti.status !== "cancelled" && ti.status !== "draft" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleAction("cancel", ti)}
                              title="취소"
                              className="h-7 w-7 p-0 text-rose-600"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {/* 삭제 (draft만) */}
                          {ti.status === "draft" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleAction("delete", ti)}
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

      {/* ═══ 등록 Dialog ═══ */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {createType === "sales" ? "매출" : "매입"} 세금계산서 등록
            </DialogTitle>
            <DialogDescription>
              한국 세법 표준 — 라인 최대 4개. 초과 시 팝빌 전송 시 "외 N건" 처리.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* 거래처 + 기본 정보 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>거래처 *</Label>
                <PartnerSearchInput
                  selectedId={createPartnerId}
                  selectedName={createPartnerName}
                  onSelect={(id, name) => {
                    setCreatePartnerId(id);
                    setCreatePartnerName(name);
                  }}
                  onClear={() => {
                    setCreatePartnerId(null);
                    setCreatePartnerName("");
                  }}
                  placeholder="거래처 검색..."
                />
              </div>
              <div>
                <Label>작성일 *</Label>
                <Input
                  type="date"
                  value={createIssueDate}
                  onChange={(e) => setCreateIssueDate(e.target.value)}
                />
              </div>
              <div>
                <Label>공급일 (선택)</Label>
                <Input
                  type="date"
                  value={createSupplyDate}
                  onChange={(e) => setCreateSupplyDate(e.target.value)}
                />
              </div>
              <div>
                <Label>과세구분</Label>
                <Select
                  value={createTaxCategory}
                  onValueChange={(v) => setCreateTaxCategory(v as any)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="taxed">과세 (10%)</SelectItem>
                    <SelectItem value="zero_rated">영세율</SelectItem>
                    <SelectItem value="tax_free">면세</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>영수/청구</Label>
                <Select
                  value={createReceiptType}
                  onValueChange={(v) => setCreateReceiptType(v as any)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="invoice">청구</SelectItem>
                    <SelectItem value="receipt">영수</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 품목 라인 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">
                  품목 ({createLines.length}/4)
                </Label>
                <Button type="button" size="sm" variant="outline" onClick={addLine}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> 라인 추가
                </Button>
              </div>
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs">
                      <TableHead className="w-[24%]">품목명 *</TableHead>
                      <TableHead className="w-[10%]">규격</TableHead>
                      <TableHead className="w-[10%]">수량</TableHead>
                      <TableHead className="w-[8%]">단위</TableHead>
                      <TableHead className="w-[14%]">단가</TableHead>
                      <TableHead className="w-[14%]">공급가액 *</TableHead>
                      <TableHead className="w-[14%]">세액</TableHead>
                      <TableHead className="w-[6%]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {createLines.map((l) => (
                      <TableRow key={l.key}>
                        <TableCell className="p-1">
                          <Input
                            value={l.itemName}
                            onChange={(e) =>
                              updateLine(l.key, { itemName: e.target.value })
                            }
                            className="h-8 text-xs"
                            placeholder="품목명"
                          />
                        </TableCell>
                        <TableCell className="p-1">
                          <Input
                            value={l.itemSpec}
                            onChange={(e) =>
                              updateLine(l.key, { itemSpec: e.target.value })
                            }
                            className="h-8 text-xs"
                          />
                        </TableCell>
                        <TableCell className="p-1">
                          <Input
                            type="number"
                            value={l.quantity}
                            onChange={(e) =>
                              updateLine(l.key, { quantity: e.target.value })
                            }
                            className="h-8 text-xs text-right"
                          />
                        </TableCell>
                        <TableCell className="p-1">
                          <Input
                            value={l.unit}
                            onChange={(e) => updateLine(l.key, { unit: e.target.value })}
                            className="h-8 text-xs text-center"
                          />
                        </TableCell>
                        <TableCell className="p-1">
                          <Input
                            type="number"
                            value={l.unitPrice}
                            onChange={(e) =>
                              updateLine(l.key, { unitPrice: e.target.value })
                            }
                            className="h-8 text-xs text-right"
                          />
                        </TableCell>
                        <TableCell className="p-1">
                          <Input
                            type="number"
                            value={l.supplyAmount}
                            onChange={(e) =>
                              updateLine(l.key, { supplyAmount: e.target.value })
                            }
                            className="h-8 text-xs text-right font-semibold"
                          />
                        </TableCell>
                        <TableCell className="p-1">
                          <Input
                            type="number"
                            value={l.taxAmount}
                            onChange={(e) =>
                              updateLine(l.key, { taxAmount: e.target.value })
                            }
                            className="h-8 text-xs text-right"
                          />
                        </TableCell>
                        <TableCell className="p-1 text-center">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => removeLine(l.key)}
                            className="h-7 w-7 p-0 text-red-500"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex justify-end gap-4 text-sm">
                <div>
                  공급가액: <strong>{createTotal.supply.toLocaleString()}원</strong>
                </div>
                <div>
                  세액: <strong>{createTotal.tax.toLocaleString()}원</strong>
                </div>
                <div className="text-base">
                  합계:{" "}
                  <strong className="text-indigo-600">
                    {createTotal.total.toLocaleString()}원
                  </strong>
                </div>
              </div>
            </div>

            {/* 비고 */}
            <div>
              <Label>비고</Label>
              <Input
                value={createRemark1}
                onChange={(e) => setCreateRemark1(e.target.value)}
                placeholder="팝빌 표준 비고 (최대 100자)"
                maxLength={100}
              />
            </div>
            <div>
              <Label>메모</Label>
              <Textarea
                value={createNotes}
                onChange={(e) => setCreateNotes(e.target.value)}
                placeholder="내부 메모 (세금계산서에 표시되지 않음)"
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              취소
            </Button>
            <Button
              onClick={handleCreateSubmit}
              disabled={createMutation.isPending}
              className="bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700"
            >
              {createMutation.isPending ? "생성 중..." : "등록"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ 팝빌 설정 Dialog ═══ */}
      <Dialog open={popbillOpen} onOpenChange={setPopbillOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-indigo-600" />
              팝빌 연동 설정
            </DialogTitle>
            <DialogDescription>
              전자세금계산서 발행 파트너 (팝빌) 연동 설정 · 회원 등록 · 잔여 포인트 조회
            </DialogDescription>
          </DialogHeader>
          <PopbillSettingsContent />
        </DialogContent>
      </Dialog>
    </div>
  );
}

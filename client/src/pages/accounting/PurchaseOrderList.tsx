/**
 * 발주서 목록 페이지 — Phase A (2026-04-14)
 * ═══════════════════════════════════════════════════════════════
 * 상태 필터 + 검색 + 액션 (승인/취소/삭제/입고 처리)
 * ═══════════════════════════════════════════════════════════════
 */
import { FilterBar, useUrlFilters } from "@/components/common/FilterBar";
import { DataGrid } from "@/components/common/DataGrid";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  ClipboardList,
  Plus,
  Search,
  CheckCircle,
  XCircle,
  Trash2,
  PackageCheck,
  Eye,
  FileText,
  Printer,
  Edit,
  Save,
} from "lucide-react";
import { MaterialCombobox } from "@/components/inventory/MaterialCombobox";
import { PartnerSearchInput } from "@/components/inventory/PartnerSearchInput";
import { toast } from "@/hooks/use-toast";
import type { RouterOutput } from "@/lib/trpcTypes";
import { useIndustryLabel } from "@/hooks/useIndustryFeatures";

// 발주서 목록 단일 row / 상세 조회 / 라인 타입
type OrderRow = RouterOutput["purchaseOrder"]["list"][number];
type OrderDetail = RouterOutput["purchaseOrder"]["getById"];
type OrderLine = NonNullable<OrderDetail>["lines"][number];

const STATUS_LABELS: Record<string, { label: string; variant: string; className: string }> = {
  draft: { label: "작성 중", variant: "outline", className: "" },
  approved: { label: "승인됨", variant: "default", className: "bg-blue-600 text-white border-transparent" },
  partial_received: { label: "일부 입고", variant: "default", className: "bg-amber-500 text-white border-transparent" },
  received: { label: "전량 입고", variant: "default", className: "bg-green-600 text-white border-transparent" },
  cancelled: { label: "취소됨", variant: "destructive", className: "" },
};

export default function PurchaseOrderList() {
  const L = useIndustryLabel();
  return (
    <DashboardLayout>
      <PurchaseOrderListContent />
    </DashboardLayout>
  );
}

function PurchaseOrderListContent() {
  const L = useIndustryLabel();
  const [, navigate] = useLocation();
  // 3-c 2차: 필터 값은 URL 쿼리에 유지 (새로고침·뒤로가기·링크 공유에도 그대로)
  const [filters, setFilters, resetFilters] = useUrlFilters({ status: "all", q: "", from: "", to: "" });
  const statusFilter = filters.status, searchText = filters.q, startDate = filters.from, endDate = filters.to;

  // 수정 Dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingPo, setEditingPo] = useState<{ id: number; poNumber?: string } | null>(null);
  const [editPartnerId, setEditPartnerId] = useState<number | null>(null);
  const [editPartnerName, setEditPartnerName] = useState("");
  const [editOrderDate, setEditOrderDate] = useState("");
  const [editExpectedDeliveryDate, setEditExpectedDeliveryDate] = useState("");
  const [editDeliveryAddress, setEditDeliveryAddress] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editLines, setEditLines] = useState<Array<{
    id: string;
    materialId: number | null;
    itemName: string;
    itemCode?: string;
    orderedQty: number;
    unit: string;
    unitPrice: number;
    taxAmount: number;
    notes?: string;
  }>>([]);

  // 입고 처리 Dialog
  const [receiveDialogOpen, setReceiveDialogOpen] = useState(false);
  const [receivePoId, setReceivePoId] = useState<number | null>(null);
  const [receiveLines, setReceiveLines] = useState<Record<number, number>>({});
  const [receiptDate, setReceiptDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [receiveAutoFilled, setReceiveAutoFilled] = useState<boolean>(false);
  // 줄별 LOT 번호·소비기한 (선택) — 입고 문서 줄에 기록, LOT 에 그대로
  const [receiveExtra, setReceiveExtra] = useState<Record<number, { lotNumber?: string; expiryDate?: string }>>({});
  // 입고 요청 키 — 대화창 하나에 하나. 더블 클릭·재시도는 같은 입고 문서로 (서버 idempotency)
  const [receiveKey, setReceiveKey] = useState<string>("");
  // 포장 단위 환산 미리보기 (예: 3포대 → 60kg) — 서버가 같은 설정으로 다시 확인한다
  const { data: receivable, refetch: refetchReceivable } = trpc.purchaseOrder.receivableLines.useQuery(
    { poId: receivePoId! },
    { enabled: !!receivePoId && receiveDialogOpen },
  );
  const convByLine = new Map<number, { factor: number; baseUnit: string } | null>(
    ((receivable ?? []) as any[]).map((r) => [Number(r.poLineId), r.conversion ?? null]),
  );
  const [packInput, setPackInput] = useState<Record<number, string>>({});
  const savePackMutation = trpc.inbound.savePackUnit.useMutation({
    onSuccess: () => { toast({ title: "환산 설정 저장" }); refetchReceivable(); },
    onError: (e: { message: string }) => toast({ title: "환산 설정 실패", description: e.message, variant: "destructive" }),
  });

  const utils = trpc.useUtils();

  // 발주 목록
  const { data: orders = [], isLoading } = trpc.purchaseOrder.list.useQuery({
    status: statusFilter !== "all" ? (statusFilter as "draft" | "approved" | "partial" | "received" | "cancelled") : undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    search: searchText || undefined,
  });

  // 입고 처리용 상세 조회
  const { data: receivingPo } = trpc.purchaseOrder.getById.useQuery(
    { id: receivePoId! },
    { enabled: !!receivePoId },
  );

  // ★ 2026-04-15: 다이얼로그가 열리고 PO 상세 로드 완료 시 잔량으로 자동 채우기
  //   이전: placeholder 만 표시되고 receiveLines 는 {} 상태 → 사용자가 타이핑 안 하면
  //   handleReceive 에서 빈 배열로 "입고할 라인을 선택하세요" 토스트 → 원인 모름
  useEffect(() => {
    if (receiveDialogOpen && receivingPo && !receiveAutoFilled) {
      const initialLines: Record<number, number> = {};
      for (const line of (receivingPo as OrderDetail)?.lines || []) {
        const ordered = Number(line.orderedQty);
        const already = Number(line.receivedQty);
        const remaining = ordered - already;
        if (remaining > 0) {
          initialLines[line.id] = remaining;
        }
      }
      setReceiveLines(initialLines);
      setReceiveAutoFilled(true);
    }
    if (!receiveDialogOpen && receiveAutoFilled) {
      setReceiveAutoFilled(false);
    }
  }, [receiveDialogOpen, receivingPo, receiveAutoFilled]);

  const approveMutation = trpc.purchaseOrder.approve.useMutation({
    onSuccess: (r: { message: string }) => {
      toast({ title: "승인 완료", description: r.message });
      utils.purchaseOrder.list.invalidate();
    },
    onError: (e: { message: string }) => toast({ title: "승인 실패", description: e.message, variant: "destructive" }),
  });

  const cancelMutation = trpc.purchaseOrder.cancel.useMutation({
    onSuccess: (r: { message: string }) => {
      toast({ title: "취소 완료", description: r.message });
      utils.purchaseOrder.list.invalidate();
    },
    onError: (e: { message: string }) => toast({ title: "취소 실패", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = trpc.purchaseOrder.delete.useMutation({
    onSuccess: (r: { message: string }) => {
      toast({ title: "삭제 완료", description: r.message });
      utils.purchaseOrder.list.invalidate();
    },
    onError: (e: { message: string }) => toast({ title: "삭제 실패", description: e.message, variant: "destructive" }),
  });

  const updateMutation = trpc.purchaseOrder.update.useMutation({
    onSuccess: (r: { message: string }) => {
      toast({ title: "수정 완료", description: r.message });
      utils.purchaseOrder.list.invalidate();
      setEditDialogOpen(false);
      setEditingPo(null);
    },
    onError: (e: { message: string }) => toast({ title: "수정 실패", description: e.message, variant: "destructive" }),
  });

  const receiveMutation = trpc.purchaseOrder.receive.useMutation({
    onSuccess: (r: { message: string; newStatus: string }) => {
      toast({
        title: "입고 처리 완료",
        description: `${r.message} — 상태: ${STATUS_LABELS[r.newStatus]?.label || r.newStatus}`,
      });
      utils.purchaseOrder.list.invalidate();
      setReceiveDialogOpen(false);
      setReceivePoId(null);
      setReceiveLines({});
    },
    onError: (e: { message: string }) => toast({ title: "입고 실패", description: e.message, variant: "destructive" }),
  });

  // ★ 2026-04-14: 발주서 PDF 공통 헬퍼
  const base64ToPdfBlob = (b64: string): Blob => {
    const byteCharacters = atob(b64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    return new Blob([new Uint8Array(byteNumbers)], { type: "application/pdf" });
  };

  // 🖨️ 인쇄 (iframe 자동 프린트)
  const generatePdfMutation = trpc.purchaseOrder.generatePdf.useMutation({
    onSuccess: (data: any) => {
      const blob = base64ToPdfBlob(data.pdf);
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
    onError: (e: { message: string }) => toast({ title: "인쇄 실패", description: e.message, variant: "destructive" }),
  });

  // 👁️ 자세히보기 (새 탭)
  const previewPdfMutation = trpc.purchaseOrder.generatePdf.useMutation({
    onSuccess: (data: any) => {
      const blob = base64ToPdfBlob(data.pdf);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      toast({ title: "미리보기", description: "새 탭에서 열렸습니다." });
    },
    onError: (e: { message: string }) => toast({ title: "미리보기 실패", description: e.message, variant: "destructive" }),
  });

  // 통계 카드
  const stats = useMemo(() => {
    const count = orders.length;
    const grandTotal = (orders as OrderRow[]).reduce((s, o) => s + parseFloat(String(o.grandTotal ?? "0")), 0);
    const pending = (orders as OrderRow[]).filter((o) => o.status === "approved").length;
    return { count, grandTotal, pending };
  }, [orders]);

  // 수정 Dialog 열기
  const handleOpenEdit = async (po: OrderRow) => {
    setEditingPo(po);
    setEditPartnerId(po.partnerId);
    setEditPartnerName(po.partnerName || `#${po.partnerId}`);
    setEditOrderDate(po.orderDate || "");
    setEditExpectedDeliveryDate(po.expectedDeliveryDate || "");
    setEditDeliveryAddress("");
    setEditNotes(po.notes || "");
    // 상세 조회로 라인 데이터 가져오기
    try {
      const detail = await utils.purchaseOrder.getById.fetch({ id: po.id });
      setEditDeliveryAddress((detail as any)?.deliveryAddress || "");
      setEditLines(
        ((detail as any)?.lines || []).map((l: any) => ({
          id: `${l.id}-${Date.now()}`,
          materialId: l.materialId,
          itemName: l.itemName,
          itemCode: l.itemCode || "",
          orderedQty: Number(l.orderedQty),
          unit: l.unit || "EA",
          unitPrice: Number(l.unitPrice),
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
    if (!editingPo) return;
    if (!editPartnerId) {
      toast({ title: "공급업체를 선택하세요", variant: "destructive" });
      return;
    }
    if (editLines.some((l) => !l.itemName || l.orderedQty <= 0 || l.unitPrice < 0)) {
      toast({ title: "모든 품목의 품목명/수량/단가를 확인하세요", variant: "destructive" });
      return;
    }
    updateMutation.mutate({
      id: editingPo.id,
      partnerId: editPartnerId,
      orderDate: editOrderDate,
      expectedDeliveryDate: editExpectedDeliveryDate || undefined,
      deliveryAddress: editDeliveryAddress || undefined,
      notes: editNotes || undefined,
      lines: editLines.map((l) => ({
        materialId: l.materialId || undefined,
        itemName: l.itemName,
        itemCode: l.itemCode || undefined,
        orderedQty: l.orderedQty,
        unit: l.unit,
        unitPrice: l.unitPrice,
        taxAmount: l.taxAmount,
        notes: l.notes || undefined,
      })),
    });
  };

  const addEditLine = () => {
    setEditLines((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        materialId: null,
        itemName: "",
        itemCode: "",
        orderedQty: 0,
        unit: "EA",
        unitPrice: 0,
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
        const updated = { ...l, ...patch };
        if ("orderedQty" in patch || "unitPrice" in patch) {
          const amt = (updated.orderedQty || 0) * (updated.unitPrice || 0);
          updated.taxAmount = Math.round(amt * 0.1);
        }
        return updated;
      })
    );
  };

  const handleApprove = (id: number, poNumber: string) => {
    if (confirm(`발주서 ${poNumber} 를 승인하시겠습니까?`)) {
      approveMutation.mutate({ id });
    }
  };

  const handleCancel = (id: number, poNumber: string) => {
    const reason = prompt(`${poNumber} 취소 사유 (선택)`);
    if (reason !== null) {
      cancelMutation.mutate({ id, reason: reason || undefined });
    }
  };

  const handleDelete = (id: number, poNumber: string, status: string) => {
    const isReceived = ["partial_received", "received"].includes(status);
    if (isReceived) {
      toast({ title: "삭제할 수 없습니다", description: "입고가 시작된 발주서는 삭제할 수 없습니다. 입고를 먼저 취소하세요.", variant: "destructive" });
      return;
    }
    const msg = `${poNumber} 를 삭제하시겠습니까?`;
    if (confirm(msg)) {
      deleteMutation.mutate({ id });
    }
  };

  const handleOpenReceive = (poId: number) => {
    setReceivePoId(poId);
    setReceiveLines({});
    setReceiveExtra({});
    setReceiveKey(`po-${poId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
    setReceiveDialogOpen(true);
  };

  /** 미입고 잔량 전체 채우기 */
  const fillRemaining = () => {
    const filled: Record<number, number> = {};
    for (const line of ((receivingPo as OrderDetail)?.lines ?? []) as any[]) {
      const remaining = Number(line.orderedQty) - Number(line.receivedQty);
      if (remaining > 0) filled[line.id] = Math.round(remaining * 1000) / 1000;
    }
    setReceiveLines(filled);
  };

  const handleReceive = () => {
    if (!receivePoId) return;
    const linesPayload = Object.entries(receiveLines)
      .filter(([, qty]) => qty > 0)
      .map(([lineId, qty]) => {
        const extra = receiveExtra[parseInt(lineId)] ?? {};
        return {
          lineId: parseInt(lineId), receivedQty: qty,
          ...(extra.lotNumber?.trim() ? { lotNumber: extra.lotNumber.trim() } : {}),
          ...(extra.expiryDate ? { expiryDate: extra.expiryDate } : {}),
        };
      });

    if (linesPayload.length === 0) {
      toast({ title: "입고할 라인을 선택하세요", variant: "destructive" });
      return;
    }

    receiveMutation.mutate({
      poId: receivePoId,
      lines: linesPayload,
      receiptDate,
      idempotencyKey: receiveKey || undefined,
    });
  };


  // 행별 작업 버튼 — 표(PC)와 카드(모바일)가 같은 버튼을 쓴다 (3-c 2차)
  const renderPoActions = (po: OrderRow) => (
              <div className="flex items-center justify-center gap-1 opacity-80 group-hover:opacity-100">
                {/* 👁️ 자세히보기 (미리보기) */}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => previewPdfMutation.mutate({ id: po.id })}
                  disabled={previewPdfMutation.isPending}
                  title="발주서 미리보기"
                  className="h-7 w-7 p-0"
                >
                  <Eye className="h-3.5 w-3.5" />
                </Button>
                {/* 🖨️ 인쇄 */}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => generatePdfMutation.mutate({ id: po.id })}
                  disabled={generatePdfMutation.isPending}
                  title="발주서 인쇄"
                  className="h-7 w-7 p-0"
                >
                  <Printer className="h-3.5 w-3.5" />
                </Button>
                {po.status === "draft" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleOpenEdit(po)}
                    title="수정"
                    className="h-7 w-7 p-0 text-orange-600 hover:bg-orange-50"
                  >
                    <Edit className="h-3.5 w-3.5" />
                  </Button>
                )}
                {po.status === "draft" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleApprove(po.id, po.poNumber)}
                    title="승인"
                    className="h-7 w-7 p-0 text-blue-600 hover:bg-blue-50"
                  >
                    <CheckCircle className="h-3.5 w-3.5" />
                  </Button>
                )}
                {(po.status === "approved" || po.status === "partial_received") && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleOpenReceive(po.id)}
                    title="입고 처리"
                    className="h-7 w-7 p-0 text-green-600 hover:bg-green-50"
                  >
                    <PackageCheck className="h-3.5 w-3.5" />
                  </Button>
                )}
                {["draft", "approved"].includes(po.status) && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleCancel(po.id, po.poNumber)}
                    title="취소"
                    className="h-7 w-7 p-0 text-amber-600 hover:bg-amber-50"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                  </Button>
                )}
                {po.status !== "cancelled" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDelete(po.id, po.poNumber, po.status)}
                    title={["partial_received", "received"].includes(po.status) ? "입고가 시작된 발주서는 삭제할 수 없습니다" : "삭제"}
                    className="h-7 w-7 p-0 text-red-500 hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
  );

  return (
    <div className="p-4 space-y-4">
      {/* 3-c (2026-10-14): 페이지 머리 표준 — 메뉴 이름 '발주서' 와 맞춤 */}
      <PageHeader
        title="발주서"
        description="공급업체 발주 → 승인 → 입고 처리 → 매입전표 자동 생성"
        primary={{ label: "발주서 등록", icon: Plus, onClick: () => navigate("/dashboard/accounting/purchase-orders/create") }}
      />

      {/* KPI */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">전체 발주</p>
            <p className="text-2xl font-bold">{stats.count}건</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">입고 대기 (승인됨)</p>
            <p className="text-2xl font-bold text-blue-600">{stats.pending}건</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">총액 (필터 기준)</p>
            <p className="text-2xl font-bold text-purple-600">
              {Math.round(stats.grandTotal).toLocaleString()}원
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 필터 — 3-c 2차 FilterBar */}
      <FilterBar
        className="mb-0"
        search={{ value: searchText, onChange: (v) => setFilters({ q: v }), placeholder: "PO 번호 (예: PO-2026-0001)" }}
        onReset={resetFilters}
      >
        <Select value={statusFilter} onValueChange={(v) => setFilters({ status: v })}>
          <SelectTrigger className="h-9 w-36" aria-label="상태"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 상태</SelectItem>
            <SelectItem value="draft">작성 중</SelectItem>
            <SelectItem value="approved">승인</SelectItem>
            <SelectItem value="partial_received">일부 입고</SelectItem>
            <SelectItem value="received">전량 입고</SelectItem>
            <SelectItem value="cancelled">취소</SelectItem>
          </SelectContent>
        </Select>
        <Input type="date" aria-label="시작일" value={startDate} onChange={(e) => setFilters({ from: e.target.value })} className="h-9 w-40" />
        <span className="text-muted-foreground text-sm">~</span>
        <Input type="date" aria-label="종료일" value={endDate} onChange={(e) => setFilters({ to: e.target.value })} className="h-9 w-40" />
      </FilterBar>

      {/* 목록 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">발주 목록</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DataGrid<OrderRow>
            rows={orders as OrderRow[]}
            rowKey={(po) => po.id}
            loading={isLoading}
            emptyText='발주서가 없습니다. 오른쪽 위 "발주서 등록" 으로 시작하세요.'
            initialSort={{ key: "orderDate", dir: "desc" }}
            className="p-3"
            columns={[
              { key: "poNumber", header: "PO 번호", sortable: true, className: "font-mono text-xs" },
              { key: "partner", header: "공급업체", sortable: true, sortValue: (po) => po.partnerName ?? "", cell: (po) => po.partnerName || `#${po.partnerId}` },
              { key: "orderDate", header: "발주일", sortable: true, className: "text-xs" },
              { key: "expectedDeliveryDate", header: "납기", sortable: true, className: "text-xs text-muted-foreground", cell: (po) => po.expectedDeliveryDate || "-" },
              { key: "grandTotal", header: "총액", align: "right", sortable: true, className: "font-mono tabular-nums",
                sortValue: (po) => parseFloat(po.grandTotal || "0"), cell: (po) => Math.round(parseFloat(po.grandTotal || "0")).toLocaleString() },
              { key: "status", header: "상태", sortable: true, cell: (po) => <StatusBadge status={po.status} domain="purchaseOrder" /> },
              { key: "actions", header: "액션", align: "center", cell: (po) => renderPoActions(po) },
            ]}
            mobileCard={(po) => (
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs">{po.poNumber}</span>
                  <StatusBadge status={po.status} domain="purchaseOrder" />
                </div>
                <div className="text-sm font-medium">{po.partnerName || `#${po.partnerId}`}</div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{po.orderDate}{po.expectedDeliveryDate ? ` · 납기 ${po.expectedDeliveryDate}` : ""}</span>
                  <span className="font-mono text-foreground">{Math.round(parseFloat(po.grandTotal || "0")).toLocaleString()}원</span>
                </div>
                <div className="pt-1 [&>div]:justify-start">{renderPoActions(po)}</div>
              </div>
            )}
          />
        </CardContent>
      </Card>

      {/* 수정 Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5 text-orange-600" />
              발주서 수정 — {editingPo?.poNumber}
            </DialogTitle>
            <DialogDescription>
              작성 중(draft) 발주서의 내용을 수정합니다.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {/* 거래 정보 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="col-span-2">
                <Label className="text-xs">공급업체 *</Label>
                <PartnerSearchInput
                  partnerType="supplier"
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
                  placeholder="공급업체 검색"
                />
              </div>
              <div>
                <Label className="text-xs">발주일 *</Label>
                <Input type="date" value={editOrderDate} onChange={(e) => setEditOrderDate(e.target.value)} className="h-9" />
              </div>
              <div>
                <Label className="text-xs">납기 예정일</Label>
                <Input type="date" value={editExpectedDeliveryDate} onChange={(e) => setEditExpectedDeliveryDate(e.target.value)} className="h-9" />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">납품 장소</Label>
                <Input value={editDeliveryAddress} onChange={(e) => setEditDeliveryAddress(e.target.value)} placeholder="예: 본사 창고" className="h-9" />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">메모</Label>
                <Input value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="특이사항" className="h-9" />
              </div>
            </div>

            {/* 품목 라인 */}
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
                    <TableHead>{`${L("material")}`}</TableHead>
                    <TableHead className="w-[90px]">수량</TableHead>
                    <TableHead className="w-[70px]">단위</TableHead>
                    <TableHead className="w-[100px]">단가</TableHead>
                    <TableHead className="w-[100px] text-right">금액</TableHead>
                    <TableHead className="w-[40px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {editLines.map((line, idx) => (
                    <TableRow key={line.id}>
                      <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell>
                        <MaterialCombobox
                          selectedId={line.materialId}
                          selectedName={line.itemName}
                          itemTypes={["raw_material", "subsidiary", "external_product"]}
                          placeholder="품목 검색..."
                          onSelect={(m) => {
                            updateEditLine(line.id, {
                              materialId: m.id,
                              itemName: m.materialName,
                              itemCode: m.materialCode || "",
                              unit: m.unit || line.unit,
                            });
                          }}
                          onClear={() => updateEditLine(line.id, { materialId: null, itemName: "", itemCode: "" })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.001"
                          value={line.orderedQty || ""}
                          onChange={(e) => updateEditLine(line.id, { orderedQty: parseFloat(e.target.value) || 0 })}
                          className="h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={line.unit}
                          onChange={(e) => updateEditLine(line.id, { unit: e.target.value })}
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
                      <TableCell className="text-right font-mono text-xs">
                        {Math.round((line.orderedQty || 0) * (line.unitPrice || 0)).toLocaleString()}원
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" onClick={() => removeEditLine(line.id)} className="h-6 w-6 p-0 text-red-500">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
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

      {/* 입고 처리 Dialog */}
      <Dialog open={receiveDialogOpen} onOpenChange={setReceiveDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackageCheck className="h-5 w-5 text-green-600" />
              입고 처리 — {(receivingPo as OrderDetail)?.poNumber}
            </DialogTitle>
            <DialogDescription>
              실제 입고된 수량을 입력하세요. 확정하면 재고·LOT·수불에 한 번 반영되고 매입전표 초안(대기)이 함께 만들어집니다.
              전표 확정 때는 분개만 생깁니다. 남은 수량은 다음에 나눠 받을 수 있습니다.
            </DialogDescription>
          </DialogHeader>

          <div className="mb-3 grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">입고일</Label>
              <Input
                type="date"
                value={receiptDate}
                onChange={(e) => setReceiptDate(e.target.value)}
                className="h-9"
              />
            </div>
            <div>
              <Label className="text-xs">공급업체</Label>
              <div className="h-9 flex items-center text-sm">
                {(receivingPo as OrderDetail)?.partner?.companyName || "-"}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto border rounded">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>라인</TableHead>
                  <TableHead>품목</TableHead>
                  <TableHead className="text-right">발주</TableHead>
                  <TableHead className="text-right">기존 입고</TableHead>
                  <TableHead className="text-right">잔량</TableHead>
                  <TableHead className="text-right w-[130px]">이번 입고</TableHead>
                  <TableHead className="w-[170px]">재고 환산</TableHead>
                  <TableHead className="w-[130px]">LOT 번호 (선택)</TableHead>
                  <TableHead className="w-[140px]">소비기한 (선택)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(receivingPo as OrderDetail)?.lines?.map((line: any) => {
                  const ordered = Number(line.orderedQty);
                  const already = Number(line.receivedQty);
                  const remaining = ordered - already;
                  return (
                    <TableRow key={line.id}>
                      <TableCell className="text-xs">{line.lineNumber}</TableCell>
                      <TableCell>
                        <div className="text-sm">{line.itemName}</div>
                        {line.itemCode && (
                          <div className="text-[10px] text-muted-foreground">{line.itemCode}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {ordered} {line.unit}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-muted-foreground">
                        {already} {line.unit}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs font-semibold">
                        {remaining} {line.unit}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.001"
                          min={0}
                          max={remaining}
                          value={receiveLines[line.id] ?? ""}
                          onChange={(e) => {
                            const qty = parseFloat(e.target.value) || 0;
                            setReceiveLines({ ...receiveLines, [line.id]: qty });
                          }}
                          placeholder={String(remaining)}
                          className="h-8 text-right"
                          disabled={remaining <= 0}
                        />
                      </TableCell>
                      <TableCell className="text-xs">
                        {(() => {
                          const conv = convByLine.get(Number(line.id));
                          const qty = receiveLines[line.id] ?? 0;
                          if (conv) {
                            return conv.factor === 1
                              ? <span className="text-muted-foreground">{qty} {conv.baseUnit}</span>
                              : <span className="font-mono">{qty}{line.unit} → <b>{Math.round(qty * conv.factor * 1000) / 1000}{conv.baseUnit}</b></span>;
                          }
                          if (!line.materialId) return <span className="text-red-600">원재료 미연결</span>;
                          return (
                            <div className="space-y-1">
                              <div className="text-red-600">환산 설정 없음 — 입고 불가</div>
                              <div className="flex items-center gap-1">
                                <span>1{line.unit} =</span>
                                <Input
                                  type="number" step="0.001" min={0}
                                  value={packInput[line.id] ?? ""}
                                  onChange={(e) => setPackInput({ ...packInput, [line.id]: e.target.value })}
                                  className="h-7 w-16 text-right text-xs"
                                />
                                <span>기준단위</span>
                                <Button
                                  size="sm" variant="outline" className="h-7 px-2 text-xs"
                                  disabled={!(parseFloat(packInput[line.id] ?? "") > 0) || savePackMutation.isPending}
                                  onClick={() => savePackMutation.mutate({ materialId: Number(line.materialId), packUnit: line.unit, baseQty: parseFloat(packInput[line.id]) })}
                                >저장</Button>
                              </div>
                            </div>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        <Input
                          value={receiveExtra[line.id]?.lotNumber ?? ""}
                          onChange={(e) => setReceiveExtra({ ...receiveExtra, [line.id]: { ...receiveExtra[line.id], lotNumber: e.target.value } })}
                          placeholder="자동"
                          className="h-8 text-xs"
                          disabled={remaining <= 0}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="date"
                          value={receiveExtra[line.id]?.expiryDate ?? ""}
                          onChange={(e) => setReceiveExtra({ ...receiveExtra, [line.id]: { ...receiveExtra[line.id], expiryDate: e.target.value } })}
                          className="h-8 text-xs"
                          disabled={remaining <= 0}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={fillRemaining} className="mr-auto">
              미입고 잔량 전체 채우기
            </Button>
            <Button variant="outline" onClick={() => setReceiveDialogOpen(false)}>
              취소
            </Button>
            <Button
              onClick={handleReceive}
              disabled={receiveMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              <PackageCheck className="h-4 w-4 mr-2" />
              입고 확정
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

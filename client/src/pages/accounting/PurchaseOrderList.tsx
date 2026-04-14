/**
 * 발주서 목록 페이지 — Phase A (2026-04-14)
 * ═══════════════════════════════════════════════════════════════
 * 상태 필터 + 검색 + 액션 (승인/취소/삭제/입고 처리)
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
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

const STATUS_LABELS: Record<string, { label: string; variant: string; className: string }> = {
  draft: { label: "작성 중", variant: "outline", className: "" },
  approved: { label: "승인됨", variant: "default", className: "bg-blue-600 text-white border-transparent" },
  partial_received: { label: "일부 입고", variant: "default", className: "bg-amber-500 text-white border-transparent" },
  received: { label: "전량 입고", variant: "default", className: "bg-green-600 text-white border-transparent" },
  cancelled: { label: "취소됨", variant: "destructive", className: "" },
};

export default function PurchaseOrderList() {
  return (
    <DashboardLayout>
      <PurchaseOrderListContent />
    </DashboardLayout>
  );
}

function PurchaseOrderListContent() {
  const [, navigate] = useLocation();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchText, setSearchText] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  // 입고 처리 Dialog
  const [receiveDialogOpen, setReceiveDialogOpen] = useState(false);
  const [receivePoId, setReceivePoId] = useState<number | null>(null);
  const [receiveLines, setReceiveLines] = useState<Record<number, number>>({});
  const [receiptDate, setReceiptDate] = useState<string>(() => new Date().toISOString().slice(0, 10));

  const utils = trpc.useUtils();

  // 발주 목록
  const { data: orders = [], isLoading } = trpc.purchaseOrder.list.useQuery({
    status: statusFilter !== "all" ? (statusFilter as any) : undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    search: searchText || undefined,
  });

  // 입고 처리용 상세 조회
  const { data: receivingPo } = trpc.purchaseOrder.getById.useQuery(
    { id: receivePoId! },
    { enabled: !!receivePoId },
  );

  const approveMutation = trpc.purchaseOrder.approve.useMutation({
    onSuccess: (r: any) => {
      toast({ title: "승인 완료", description: r.message });
      utils.purchaseOrder.list.invalidate();
    },
    onError: (e: any) => toast({ title: "승인 실패", description: e.message, variant: "destructive" }),
  });

  const cancelMutation = trpc.purchaseOrder.cancel.useMutation({
    onSuccess: (r: any) => {
      toast({ title: "취소 완료", description: r.message });
      utils.purchaseOrder.list.invalidate();
    },
    onError: (e: any) => toast({ title: "취소 실패", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = trpc.purchaseOrder.delete.useMutation({
    onSuccess: (r: any) => {
      toast({ title: "삭제 완료", description: r.message });
      utils.purchaseOrder.list.invalidate();
    },
    onError: (e: any) => toast({ title: "삭제 실패", description: e.message, variant: "destructive" }),
  });

  const receiveMutation = trpc.purchaseOrder.receive.useMutation({
    onSuccess: (r: any) => {
      toast({
        title: "입고 처리 완료",
        description: `${r.message} — 상태: ${STATUS_LABELS[r.newStatus]?.label || r.newStatus}`,
      });
      utils.purchaseOrder.list.invalidate();
      setReceiveDialogOpen(false);
      setReceivePoId(null);
      setReceiveLines({});
    },
    onError: (e: any) => toast({ title: "입고 실패", description: e.message, variant: "destructive" }),
  });

  // 통계 카드
  const stats = useMemo(() => {
    const count = orders.length;
    const grandTotal = orders.reduce((s: number, o: any) => s + parseFloat(o.grandTotal || "0"), 0);
    const pending = orders.filter((o: any) => o.status === "approved").length;
    return { count, grandTotal, pending };
  }, [orders]);

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

  const handleDelete = (id: number, poNumber: string) => {
    if (confirm(`${poNumber} 를 삭제하시겠습니까? (작성 중 상태만 가능)`)) {
      deleteMutation.mutate({ id });
    }
  };

  const handleOpenReceive = (poId: number) => {
    setReceivePoId(poId);
    setReceiveLines({});
    setReceiveDialogOpen(true);
  };

  const handleReceive = () => {
    if (!receivePoId) return;
    const linesPayload = Object.entries(receiveLines)
      .filter(([, qty]) => qty > 0)
      .map(([lineId, qty]) => ({ lineId: parseInt(lineId), receivedQty: qty }));

    if (linesPayload.length === 0) {
      toast({ title: "입고할 라인을 선택하세요", variant: "destructive" });
      return;
    }

    receiveMutation.mutate({
      poId: receivePoId,
      lines: linesPayload,
      receiptDate,
    });
  };

  return (
    <div className="p-4 space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-purple-600" />
            발주·구매 관리
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            공급업체 발주 → 승인 → 입고 처리 → 매입전표 자동 생성
          </p>
        </div>
        <Button
          onClick={() => navigate("/dashboard/accounting/purchase-orders/create")}
          className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
        >
          <Plus className="h-4 w-4 mr-1" /> 발주서 등록
        </Button>
      </div>

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

      {/* 필터 */}
      <Card>
        <CardContent className="py-3">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">상태</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  <SelectItem value="draft">작성 중</SelectItem>
                  <SelectItem value="approved">승인됨</SelectItem>
                  <SelectItem value="partial_received">일부 입고</SelectItem>
                  <SelectItem value="received">전량 입고</SelectItem>
                  <SelectItem value="cancelled">취소됨</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">시작일</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">종료일</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label className="text-xs">PO 번호 검색</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="PO-2026-0001"
                  className="h-9 pl-9"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 목록 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">발주 목록</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO 번호</TableHead>
                <TableHead>공급업체</TableHead>
                <TableHead>발주일</TableHead>
                <TableHead>납기</TableHead>
                <TableHead className="text-right">총액</TableHead>
                <TableHead>상태</TableHead>
                <TableHead className="text-center">액션</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    로딩 중...
                  </TableCell>
                </TableRow>
              ) : orders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    발주서가 없습니다. 우측 상단 "발주서 등록" 으로 시작하세요.
                  </TableCell>
                </TableRow>
              ) : (
                orders.map((po: any) => {
                  const statusInfo = STATUS_LABELS[po.status] || { label: po.status, variant: "secondary", className: "" };
                  return (
                    <TableRow key={po.id} className="group">
                      <TableCell className="font-mono text-xs">{po.poNumber}</TableCell>
                      <TableCell>{po.partnerName || `#${po.partnerId}`}</TableCell>
                      <TableCell className="text-xs">{po.orderDate}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {po.expectedDeliveryDate || "-"}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {Math.round(parseFloat(po.grandTotal || "0")).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusInfo.variant as any} className={statusInfo.className}>
                          {statusInfo.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-1 opacity-80 group-hover:opacity-100">
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
                          {po.status === "draft" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDelete(po.id, po.poNumber)}
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

      {/* 입고 처리 Dialog */}
      <Dialog open={receiveDialogOpen} onOpenChange={setReceiveDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackageCheck className="h-5 w-5 text-green-600" />
              입고 처리 — {(receivingPo as any)?.poNumber}
            </DialogTitle>
            <DialogDescription>
              실제 입고된 수량을 입력하세요. 매입전표가 자동 생성되고 재고/수불이 업데이트됩니다.
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
                {(receivingPo as any)?.partner?.companyName || "-"}
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {(receivingPo as any)?.lines?.map((line: any) => {
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
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <DialogFooter>
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

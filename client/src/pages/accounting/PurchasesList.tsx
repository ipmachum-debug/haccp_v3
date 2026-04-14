import React, { useState, useMemo } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { Badge } from "@/components/ui/badge";
import {
  Download,
  Search,
  FileText,
  Printer,
  Trash2,
  Edit,
  CheckCircle,
  Eye,
  ShoppingCart,
  Receipt,
  Calculator,
  Coins,
  RotateCcw,
  Package,
  FileSpreadsheet,
  Upload,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  DollarSign,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import * as XLSX from "xlsx";
import { EditPurchaseDialog } from "@/components/accounting/EditPurchaseDialog";
import { useLocation } from "wouter";
import ExcelBulkUploadModal from "@/components/ExcelBulkUploadModal";

import { todayLocal } from "../../lib/dateUtils";
import {
  groupTransactions,
  getAvailableActions,
  STATUS_LABELS,
  STATUS_COLORS,
  type TransactionGroup,
} from "../../lib/transactionGrouping";

export default function PurchasesList() {
  return (
    <DashboardLayout>
      <PurchasesListContent />
    </DashboardLayout>
  );
}

function PurchasesListContent() {
  const [, navigate] = useLocation();
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>("all");
  const [itemNameSearch, setItemNameSearch] = useState<string>("");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [editingPurchase, setEditingPurchase] = useState<any>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 25;

  // ★ 2026-04-13: PDF base64 → Blob 공통 헬퍼
  const base64ToPdfBlob = (b64: string): Blob => {
    const byteCharacters = atob(b64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    return new Blob([new Uint8Array(byteNumbers)], { type: "application/pdf" });
  };

  // 🖨️ 인쇄 (Printer 버튼) — 숨은 iframe 에 PDF 로드 후 자동으로 프린트 대화상자 열기
  const generatePDFMutation = trpc.haccpIntegration.generatePurchasePDF.useMutation({
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
          // PDF iframe 인쇄가 막힌 브라우저 → 폴백: 새 탭 열기
          window.open(url, "_blank");
        }
      };
      document.body.appendChild(iframe);
      // 메모리 정리 (2분 후)
      setTimeout(() => {
        try { document.body.removeChild(iframe); URL.revokeObjectURL(url); } catch (_) { /* ignore */ }
      }, 120_000);
      toast({ title: "인쇄", description: "프린트 대화상자를 엽니다." });
    },
    onError: (error: any) => {
      toast({ title: "인쇄 실패", description: error.message, variant: "destructive" });
    },
  });

  // 👁️ 자세히보기 (Eye 버튼) — 새 탭에 PDF 미리보기 (브라우저 내장 viewer 의 인쇄/다운로드 사용)
  const previewPDFMutation = trpc.haccpIntegration.generatePurchasePDF.useMutation({
    onSuccess: (data: any) => {
      const blob = base64ToPdfBlob(data.pdf);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      toast({ title: "미리보기", description: "새 탭에서 인쇄/다운로드가 가능합니다." });
    },
    onError: (error: any) => {
      toast({ title: "미리보기 실패", description: error.message, variant: "destructive" });
    },
  });

  // ─── 그룹 PDF (2026-04-14 추가) ───────────────────────────
  // 같은 거래의 여러 품목을 한 PDF 로 묶어서 출력
  // 실패 시: 단일 PDF 로 자동 폴백 (첫 품목 기준)
  const previewGroupPDFMutation = trpc.haccpIntegration.generatePurchaseGroupPDF.useMutation({
    onSuccess: (data: any) => {
      const blob = base64ToPdfBlob(data.pdf);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      toast({ title: "거래명세표 미리보기", description: "새 탭에서 열렸습니다." });
    },
    onError: (error: any, variables: any) => {
      console.error("[generatePurchaseGroupPDF] 그룹 PDF 실패 — 단일 PDF 폴백 시도:", error.message, variables);
      // 폴백: 첫 품목으로 단일 PDF 호출
      const firstId = variables?.purchaseIds?.[0];
      if (firstId) {
        toast({ title: "그룹 PDF 실패 — 첫 품목 단일 PDF 로 재시도", description: error.message });
        previewPDFMutation.mutate({ purchaseId: firstId });
      } else {
        toast({ title: "미리보기 실패", description: error.message, variant: "destructive" });
      }
    },
  });
  const printGroupPDFMutation = trpc.haccpIntegration.generatePurchaseGroupPDF.useMutation({
    onSuccess: (data: any) => {
      const blob = base64ToPdfBlob(data.pdf);
      const url = URL.createObjectURL(blob);
      const iframe = document.createElement("iframe");
      iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
      iframe.src = url;
      iframe.onload = () => {
        try { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); }
        catch (_) { window.open(url, "_blank"); }
      };
      document.body.appendChild(iframe);
      setTimeout(() => { try { document.body.removeChild(iframe); URL.revokeObjectURL(url); } catch (_) { /* ignore */ } }, 120_000);
      toast({ title: "인쇄", description: "프린트 대화상자를 엽니다." });
    },
    onError: (error: any, variables: any) => {
      console.error("[printGroupPDF] 그룹 PDF 실패 — 단일 PDF 폴백 시도:", error.message, variables);
      const firstId = variables?.purchaseIds?.[0];
      if (firstId) {
        toast({ title: "그룹 PDF 실패 — 첫 품목 단일 PDF 로 재시도", description: error.message });
        generatePDFMutation.mutate({ purchaseId: firstId });
      } else {
        toast({ title: "인쇄 실패", description: error.message, variant: "destructive" });
      }
    },
  });

  const handlePrintStatement = (purchaseId: number) => {
    generatePDFMutation.mutate({ purchaseId });
  };

  const handlePreviewStatement = (purchaseId: number) => {
    previewPDFMutation.mutate({ purchaseId });
  };

  // 매입 승인 mutation (pending → approved) — 재고/회계 원장 반영
  const postMutation = trpc.inventoryAccounting.purchasePost.useMutation({
    onSuccess: () => {
      toast({ title: "매입 승인 완료", description: "매입이 승인되어 재고 및 회계 원장에 반영되었습니다." });
      refetch();
    },
    onError: (error: any) => {
      toast({ title: "승인 실패", description: error.message, variant: "destructive" });
    },
  });

  // 매입 취소 mutation
  const cancelMutation = trpc.inventoryAccounting.purchaseCancel.useMutation({
    onSuccess: () => {
      toast({ title: "매입 취소 성공", description: "매입이 취소되어 재고 및 회계 원장이 롤백되었습니다." });
      refetch();
    },
    onError: (error: any) => {
      toast({ title: "취소 실패", description: error.message, variant: "destructive" });
    },
  });

  // 매입 지급 완료 mutation (approved → paid)
  const markPaidMutation = trpc.inventoryAccounting.purchaseMarkPaid.useMutation({
    onSuccess: () => {
      toast({ title: "지급 완료 처리", description: "매입이 지급 완료 상태로 전환되었습니다." });
      refetch();
    },
    onError: (error: any) => {
      toast({ title: "지급 처리 실패", description: error.message, variant: "destructive" });
    },
  });

  // 매입 복구 mutation (cancelled → pending)
  const restoreMutation = trpc.inventoryAccounting.purchaseRestore.useMutation({
    onSuccess: () => {
      toast({ title: "복구 완료", description: "취소된 매입이 대기 상태로 복구되었습니다." });
      refetch();
    },
    onError: (error: any) => {
      toast({ title: "복구 실패", description: error.message, variant: "destructive" });
    },
  });

  // ─── 그룹 단위 액션 핸들러 (Promise.all) ─────────────────────
  const handleGroupAction = async (
    group: TransactionGroup,
    action: "approve" | "markPaid" | "cancel" | "restore",
  ) => {
    const actionLabels: Record<string, string> = {
      approve: "승인",
      markPaid: "지급 완료 처리",
      cancel: "취소",
      restore: "복구",
    };
    const label = actionLabels[action];
    const itemText = group.itemCount > 1 ? `${group.itemCount}개 품목` : "이 거래";
    if (!confirm(`${group.transactionDate} ${group.partnerName} — ${itemText}을(를) ${label}하시겠습니까?`)) {
      return;
    }

    const targetIds = group.items
      .filter((item) => {
        const available = getAvailableActions(item.status, "purchase");
        return available.includes(action);
      })
      .map((item) => item.id);

    if (targetIds.length === 0) {
      toast({ title: `${label} 불가`, description: "해당 상태의 품목이 없습니다.", variant: "destructive" });
      return;
    }

    try {
      if (action === "approve") {
        await Promise.all(targetIds.map((id) => postMutation.mutateAsync({ purchaseId: id })));
      } else if (action === "markPaid") {
        await Promise.all(targetIds.map((id) => markPaidMutation.mutateAsync({ purchaseId: id })));
      } else if (action === "cancel") {
        await Promise.all(targetIds.map((id) => cancelMutation.mutateAsync({ purchaseId: id })));
      } else if (action === "restore") {
        await Promise.all(targetIds.map((id) => restoreMutation.mutateAsync({ purchaseId: id })));
      }
      toast({ title: `그룹 ${label} 완료`, description: `${targetIds.length}개 품목 처리됨` });
    } catch (err: any) {
      toast({ title: `그룹 ${label} 실패`, description: err?.message || "일부 품목 처리 실패", variant: "destructive" });
    }
  };

  // 삭제 mutation
  const deleteMutation = trpc.haccpIntegration.deletePurchase.useMutation({
    onSuccess: () => {
      toast({ title: "삭제 성공", description: "매입 거래가 삭제되었습니다." });
      refetch();
      setSelectedIds([]);
    },
    onError: (error: any) => {
      toast({ title: "삭제 실패", description: error.message, variant: "destructive" });
    },
  });

  // 거래처 목록 조회
  const { data: partners = [] } = trpc.partners.list.useQuery();

  // 매입 목록 조회
  const filters: any = {};
  if (startDate) filters.startDate = startDate;
  if (endDate) filters.endDate = endDate;
  if (selectedPartnerId !== "all") filters.partnerId = parseInt(selectedPartnerId);
  if (itemNameSearch) filters.itemName = itemNameSearch;
  if (selectedStatus !== "all") filters.status = selectedStatus;

  const { data: purchases = [], isLoading, refetch } = trpc.haccpIntegration.getAllPurchases.useQuery(filters);

  // KPI 계산 (전체 데이터 기준)
  const kpiData = useMemo(() => {
    const totalCount = purchases.length;
    const totalAmount = purchases.reduce((sum: number, p: any) => sum + parseFloat(p.amount || p.totalAmount || "0"), 0);
    const totalTax = purchases.reduce((sum: number, p: any) => sum + parseFloat(p.taxAmount || "0"), 0);
    const totalSum = totalAmount + totalTax;
    return { totalCount, totalAmount, totalTax, totalSum };
  }, [purchases]);

  // ─── 거래 그룹화 (2026-04-14 재설계) ───────────────────────
  //   방식: flat row 를 유지하되 (date + partnerId + evidenceNumber) 기준으로
  //   연속 배치하고, 그룹의 첫 row 에만 거래일자/거래처/상태/그룹액션 표시 (rowspan 효과).
  //   사용자 원함: "제품 리스트는 기존대로 바로 보이되, 제품명 옆에 거래처별로 그룹화"
  const groupedPurchases = useMemo(
    () => groupTransactions(purchases as any),
    [purchases],
  );

  // 페이지네이션은 그룹 단위 (같은 거래 품목들이 페이지에서 분리되지 않도록)
  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(groupedPurchases.length / PAGE_SIZE));
  }, [groupedPurchases.length]);
  const safePage = Math.min(currentPage, totalPages);
  const pagedGroups = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return groupedPurchases.slice(start, start + PAGE_SIZE);
  }, [groupedPurchases, safePage]);
  // 현재 페이지에 포함된 모든 품목 (select-all, 페이지 품목 수 계산용)
  const pagedPurchases = useMemo(() => {
    return pagedGroups.flatMap((g: any) => g.items);
  }, [pagedGroups]);

  // 필터 변경 시 페이지 리셋
  const resetPage = () => setCurrentPage(1);

  // 현재 페이지 전체 선택/해제
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const pageIds = pagedPurchases.map((p: any) => p.id);
      setSelectedIds((prev) => [...new Set([...prev, ...pageIds])]);
    } else {
      const pageIds = new Set(pagedPurchases.map((p: any) => p.id));
      setSelectedIds((prev) => prev.filter((id) => !pageIds.has(id)));
    }
  };

  const handleSelectOne = (id: number, checked: boolean) => {
    setSelectedIds(checked ? [...selectedIds, id] : selectedIds.filter((sid) => sid !== id));
  };

  // 필터 초기화
  const handleResetFilters = () => {
    setStartDate("");
    setEndDate("");
    setSelectedPartnerId("all");
    setItemNameSearch("");
    setSelectedStatus("all");
    resetPage();
  };

  // 선택 삭제
  const handleDeleteSelected = () => {
    if (selectedIds.length === 0) {
      toast({ title: "선택 항목 없음", description: "삭제할 항목을 선택해주세요.", variant: "destructive" });
      return;
    }
    if (!confirm(`선택한 ${selectedIds.length}개 항목을 삭제하시겠습니까?`)) return;
    Promise.all(selectedIds.map((id) => deleteMutation.mutateAsync({ id })))
      .then(() => {
        toast({ title: "삭제 완료", description: `${selectedIds.length}개 항목이 삭제되었습니다.` });
        setSelectedIds([]);
        refetch();
      })
      .catch((error) => {
        toast({ title: "삭제 실패", description: error.message, variant: "destructive" });
      });
  };

  // 선택 다운로드
  const handleDownloadSelected = () => {
    if (selectedIds.length === 0) {
      toast({ title: "선택 항목 없음", description: "다운로드할 항목을 선택해주세요.", variant: "destructive" });
      return;
    }
    const selected = purchases.filter((p: any) => selectedIds.includes(p.id));
    downloadExcel(selected, "선택 매입 목록", `선택_매입_목록_${todayLocal()}.xlsx`);
  };

  // 전체 다운로드
  const handleDownloadAll = () => {
    if (purchases.length === 0) {
      toast({ title: "데이터 없음", description: "다운로드할 데이터가 없습니다.", variant: "destructive" });
      return;
    }
    downloadExcel(purchases, "매입 목록", `매입_목록_${todayLocal()}.xlsx`);
  };

  const downloadExcel = (data: any[], sheetName: string, fileName: string) => {
    const excelData = data.map((p: any) => ({
      거래일자: p.transactionDate,
      거래처명: p.partnerName || "-",
      품목명: p.itemName,
      수량: p.quantity,
      단위: p.unit || "-",
      단가: p.unitPrice,
      금액: p.amount || p.totalAmount,
      세금: p.taxAmount || 0,
      합계: (parseFloat(p.amount || p.totalAmount || "0") + parseFloat(p.taxAmount || "0")).toFixed(2),
      증빙유형: p.documentType || "-",
      상태: getStatusLabel(p.status),
      비고: p.notes || "-",
    }));
    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, fileName);
    toast({ title: "다운로드 완료", description: "엑셀 파일이 다운로드되었습니다." });
  };

  const getStatusLabel = (status: string) => {
    const map: Record<string, string> = {
      pending: "대기 중", approved: "승인됨", paid: "지급 완료", cancelled: "취소됨", POSTED: "확정",
    };
    return map[status] || "-";
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="text-yellow-600 border-yellow-300 bg-yellow-50">대기 중</Badge>;
      case "approved":
        return <Badge variant="default" className="bg-blue-100 text-blue-700 border-blue-200">승인됨</Badge>;
      case "paid":
        return <Badge variant="default" className="bg-green-100 text-green-700 border-green-200">지급 완료</Badge>;
      case "cancelled":
        return <Badge variant="destructive">취소됨</Badge>;
      case "POSTED":
        return <Badge variant="default" className="bg-emerald-100 text-emerald-700 border-emerald-200">확정</Badge>;
      default:
        return <Badge variant="outline">-</Badge>;
    }
  };

  const formatCurrency = (value: string | number) => {
    const num = typeof value === "string" ? parseFloat(value) : value;
    return isNaN(num) ? "0" : num.toLocaleString();
  };

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
            <ShoppingCart className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">매입 조회</h1>
            <p className="text-sm text-muted-foreground">매입 거래 내역을 조회하고 관리합니다.</p>
          </div>
        </div>
        <Button onClick={() => setBulkUploadOpen(true)} variant="outline" size="sm" className="gap-2">
          <FileSpreadsheet className="h-4 w-4" />
          엑셀 일괄등록
        </Button>
      </div>

      {/* KPI 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">총 건수</p>
                <p className="text-2xl font-bold">{kpiData.totalCount}<span className="text-sm font-normal text-muted-foreground ml-1">건</span></p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-500">
                <Package className="h-4 w-4" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-indigo-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">총 금액</p>
                <p className="text-2xl font-bold">{formatCurrency(kpiData.totalAmount)}<span className="text-sm font-normal text-muted-foreground ml-1">원</span></p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-50 text-indigo-500">
                <Receipt className="h-4 w-4" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">총 세금</p>
                <p className="text-2xl font-bold">{formatCurrency(kpiData.totalTax)}<span className="text-sm font-normal text-muted-foreground ml-1">원</span></p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-50 text-amber-500">
                <Calculator className="h-4 w-4" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">총 합계</p>
                <p className="text-2xl font-bold text-emerald-600">{formatCurrency(kpiData.totalSum)}<span className="text-sm font-normal text-muted-foreground ml-1">원</span></p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">
                <Coins className="h-4 w-4" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 필터 카드 */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Search className="h-4 w-4" />
              조회 조건
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={handleResetFilters} className="text-muted-foreground hover:text-foreground">
              <RotateCcw className="h-3.5 w-3.5 mr-1" />
              초기화
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">시작일</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">종료일</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">거래처</Label>
              <Select value={selectedPartnerId} onValueChange={setSelectedPartnerId}>
                <SelectTrigger><SelectValue placeholder="전체" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  {partners.map((p: any) => (
                    <SelectItem key={p.id} value={p.id.toString()}>{p.companyName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">품목명</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="품목명 검색" value={itemNameSearch} onChange={(e) => setItemNameSearch(e.target.value)} className="pl-8" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">상태</Label>
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger><SelectValue placeholder="전체" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  <SelectItem value="pending">대기 중</SelectItem>
                  <SelectItem value="approved">승인됨</SelectItem>
                  <SelectItem value="paid">지급 완료</SelectItem>
                  <SelectItem value="cancelled">취소됨</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 액션 버튼 영역 */}
          <div className="flex items-center justify-between mt-4 pt-4 border-t">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleDownloadSelected} disabled={selectedIds.length === 0}>
                <Download className="h-3.5 w-3.5 mr-1.5" />
                선택 다운로드 ({selectedIds.length})
              </Button>
              <Button variant="destructive" size="sm" onClick={handleDeleteSelected} disabled={selectedIds.length === 0}>
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                선택 삭제 ({selectedIds.length})
              </Button>
            </div>
            <Button variant="outline" size="sm" onClick={handleDownloadAll}>
              <Download className="h-3.5 w-3.5 mr-1.5" />
              전체 다운로드
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 테이블 카드 */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4" />
              매입 거래 내역
            </CardTitle>
            <span className="text-sm text-muted-foreground">총 {purchases.length}건 · {safePage}/{totalPages} 페이지</span>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 bg-muted/50 rounded-md animate-pulse" />
              ))}
            </div>
          ) : purchases.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <ShoppingCart className="h-12 w-12 mb-4 opacity-30" />
              <p className="text-base font-medium">조회된 매입 거래가 없습니다.</p>
              <p className="text-sm mt-1">필터 조건을 변경하거나 새로운 거래를 등록해주세요.</p>
            </div>
          ) : (
            <div className="space-y-4">
            {/* 거래 / 품목 수 요약 */}
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground">
                총 <span className="font-semibold text-foreground">{groupedPurchases.length}</span>건 거래 ·{" "}
                <span className="font-semibold text-foreground">{purchases.length}</span>개 품목
              </div>
            </div>

            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="w-[44px]">
                      <Checkbox
                        checked={pagedPurchases.length > 0 && pagedPurchases.every((p: any) => selectedIds.includes(p.id))}
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                    <TableHead className="text-xs font-semibold">거래일자</TableHead>
                    <TableHead className="text-xs font-semibold">거래처명</TableHead>
                    <TableHead className="text-xs font-semibold">품목명</TableHead>
                    <TableHead className="text-xs font-semibold text-right">수량</TableHead>
                    <TableHead className="text-xs font-semibold text-right">단가</TableHead>
                    <TableHead className="text-xs font-semibold text-right">금액</TableHead>
                    <TableHead className="text-xs font-semibold text-right">세금</TableHead>
                    <TableHead className="text-xs font-semibold text-right">합계</TableHead>
                    <TableHead className="text-xs font-semibold">증빙</TableHead>
                    <TableHead className="text-xs font-semibold">상태</TableHead>
                    <TableHead className="text-xs font-semibold text-center">액션</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* 거래별 그룹화 rowspan-flat 렌더 (2026-04-14 재설계)
                      - 품목은 flat row 로 전부 즉시 표시 (접힘 없음)
                      - 같은 거래(date+partner+증빙)의 품목은 연속 배치
                      - 그룹 첫 row 에만 거래일자/거래처/상태/그룹액션 표시 (rowspan 효과)
                      - 그룹 배경색 교차로 시각적 구분 */}
                  {pagedGroups.map((group: any, groupIdx: number) => {
                    const groupBgClass = groupIdx % 2 === 0 ? "" : "bg-slate-50/40";
                    const availableGroupActions = getAvailableActions(group.dominantStatus, "purchase");
                    const statusLabel = STATUS_LABELS[group.dominantStatus] || group.dominantStatus;
                    const statusColor = STATUS_COLORS[group.dominantStatus] || "";
                    const isMultiItem = group.items.length > 1;

                    return group.items.map((purchase: any, itemIdx: number) => {
                      const isFirst = itemIdx === 0;
                      const amount = parseFloat(purchase.amount || purchase.totalAmount || "0");
                      const tax = parseFloat(purchase.taxAmount || "0");
                      const itemActions = getAvailableActions(purchase.status, "purchase");

                      return (
                        <TableRow
                          key={`${group.groupKey}-${purchase.id}`}
                          className={cn("group hover:bg-muted/20", groupBgClass)}
                        >
                          <TableCell>
                            <Checkbox
                              checked={selectedIds.includes(purchase.id)}
                              onCheckedChange={(checked) => handleSelectOne(purchase.id, checked as boolean)}
                            />
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap">
                            {isFirst && new Date(group.transactionDate).toLocaleDateString("ko-KR")}
                          </TableCell>
                          <TableCell className="text-sm">
                            {isFirst && (
                              <>
                                <div className="font-medium">{group.partnerName}</div>
                                {isMultiItem && (
                                  <div className="text-[10px] text-muted-foreground mt-0.5">
                                    [{group.itemCount}건] 총 {formatCurrency(group.grandTotal)}
                                  </div>
                                )}
                              </>
                            )}
                          </TableCell>
                          <TableCell className="text-sm max-w-[160px] truncate">
                            {isMultiItem && !isFirst && <span className="text-muted-foreground mr-1">└</span>}
                            {purchase.itemName}
                          </TableCell>
                          <TableCell className="text-sm text-right tabular-nums">
                            {purchase.quantity} {purchase.unit || ""}
                          </TableCell>
                          <TableCell className="text-sm text-right tabular-nums">
                            {formatCurrency(purchase.unitPrice)}
                          </TableCell>
                          <TableCell className="text-sm text-right tabular-nums">
                            {formatCurrency(amount)}
                          </TableCell>
                          <TableCell className="text-sm text-right tabular-nums text-muted-foreground">
                            {formatCurrency(tax)}
                          </TableCell>
                          <TableCell className="text-sm text-right tabular-nums font-semibold">
                            {formatCurrency(amount + tax)}
                          </TableCell>
                          <TableCell className="text-sm">
                            {isFirst && group.evidenceNumber ? (
                              <Badge variant="outline" className="text-xs">{group.evidenceNumber}</Badge>
                            ) : !isFirst ? "" : "-"}
                          </TableCell>
                          <TableCell>
                            {isFirst ? (
                              <Badge variant="outline" className={`${statusColor} text-xs`}>
                                {statusLabel}
                                {group.isMixed && <span className="ml-1">⚠</span>}
                              </Badge>
                            ) : ""}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                              {isFirst ? (
                                <>
                                  {/* 그룹 단위 액션 (첫 row 에만) */}
                                  {availableGroupActions.includes("approve") && (
                                    <Button size="sm" variant="default"
                                      onClick={() => handleGroupAction(group, "approve")}
                                      disabled={postMutation.isPending}
                                      title={isMultiItem ? "그룹 전체 승인" : "승인"}
                                      className="h-7 w-7 p-0 bg-blue-600 hover:bg-blue-700">
                                      <CheckCircle className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                  {availableGroupActions.includes("markPaid") && (
                                    <Button size="sm" variant="default"
                                      onClick={() => handleGroupAction(group, "markPaid")}
                                      disabled={markPaidMutation.isPending}
                                      title={isMultiItem ? "그룹 전체 지급 완료" : "지급 완료"}
                                      className="h-7 w-7 p-0 bg-emerald-600 hover:bg-emerald-700">
                                      <DollarSign className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                  {availableGroupActions.includes("restore") && (
                                    <Button size="sm" variant="outline"
                                      onClick={() => handleGroupAction(group, "restore")}
                                      disabled={restoreMutation.isPending}
                                      title={isMultiItem ? "그룹 전체 복구" : "복구"}
                                      className="h-7 w-7 p-0 text-amber-600">
                                      <RotateCcw className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                  {/* 거래명세표 PDF — 그룹 전체 묶음 */}
                                  <Button size="sm" variant="outline"
                                    onClick={() => previewGroupPDFMutation.mutate({ purchaseIds: group.items.map((i: any) => i.id) })}
                                    disabled={previewGroupPDFMutation.isPending}
                                    title="거래명세표 미리보기" className="h-7 w-7 p-0">
                                    <Eye className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button size="sm" variant="outline"
                                    onClick={() => printGroupPDFMutation.mutate({ purchaseIds: group.items.map((i: any) => i.id) })}
                                    disabled={printGroupPDFMutation.isPending}
                                    title="거래명세표 인쇄" className="h-7 w-7 p-0">
                                    <Printer className="h-3.5 w-3.5" />
                                  </Button>
                                  {availableGroupActions.includes("cancel") && (
                                    <Button size="sm" variant="outline"
                                      onClick={() => handleGroupAction(group, "cancel")}
                                      disabled={cancelMutation.isPending}
                                      title={isMultiItem ? "그룹 전체 취소" : "취소"}
                                      className="h-7 w-7 p-0 text-zinc-500 hover:bg-zinc-100">
                                      <XCircle className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                </>
                              ) : null}
                              {/* 품목 단위 액션 (모든 row 에) */}
                              {itemActions.includes("edit") && (
                                <Button size="sm" variant="outline"
                                  onClick={() => { setEditingPurchase(purchase); setIsEditDialogOpen(true); }}
                                  title="품목 수정" className="h-7 w-7 p-0">
                                  <Edit className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {itemActions.includes("delete") && (
                                <Button size="sm" variant="outline"
                                  onClick={() => { if (confirm("이 품목을 삭제하시겠습니까?")) deleteMutation.mutate({ id: purchase.id }); }}
                                  title="품목 삭제" className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    });
                  })}
                </TableBody>
              </Table>
            </div>

            {/* 페이지네이션 */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <p className="text-sm text-muted-foreground">
                  {((safePage - 1) * PAGE_SIZE) + 1}–{Math.min(safePage * PAGE_SIZE, purchases.length)}건 / 총 {purchases.length}건
                </p>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" className="h-8 w-8 p-0"
                    onClick={() => setCurrentPage(1)} disabled={safePage <= 1} title="첫 페이지">
                    <ChevronsLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 w-8 p-0"
                    onClick={() => setCurrentPage(safePage - 1)} disabled={safePage <= 1} title="이전">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 2)
                    .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                      if (idx > 0 && p - (arr[idx - 1]) > 1) acc.push("...");
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((p, idx) =>
                      p === "..." ? (
                        <span key={`ellipsis-${idx}`} className="px-1 text-muted-foreground text-sm">…</span>
                      ) : (
                        <Button key={p} variant={p === safePage ? "default" : "outline"} size="sm"
                          className="h-8 min-w-[2rem] px-2 text-xs"
                          onClick={() => setCurrentPage(p as number)}>
                          {p}
                        </Button>
                      )
                    )}
                  <Button variant="outline" size="sm" className="h-8 w-8 p-0"
                    onClick={() => setCurrentPage(safePage + 1)} disabled={safePage >= totalPages} title="다음">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 w-8 p-0"
                    onClick={() => setCurrentPage(totalPages)} disabled={safePage >= totalPages} title="마지막 페이지">
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 수정 다이얼로그 */}
      {editingPurchase && (
        <EditPurchaseDialog
          purchase={editingPurchase}
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          onSuccess={() => { refetch(); setEditingPurchase(null); }}
        />
      )}

      {/* 엑셀 일괄등록 모달 */}
      <ExcelBulkUploadModal
        open={bulkUploadOpen}
        onOpenChange={setBulkUploadOpen}
        mode="purchase"
      />
    </div>
  );
}

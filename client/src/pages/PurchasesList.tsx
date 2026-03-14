import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
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
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import * as XLSX from "xlsx";
import { EditPurchaseDialog } from "@/components/EditPurchaseDialog";
import { useLocation } from "wouter";
import ExcelBulkUploadModal from "@/components/ExcelBulkUploadModal";

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

  // 거래명세표 PDF 생성 (다운로드)
  const generatePDFMutation = trpc.haccpIntegration.generatePurchasePDF.useMutation({
    onSuccess: (data: any) => {
      const linkSource = `data:application/pdf;base64,${data.pdf}`;
      const downloadLink = document.createElement("a");
      downloadLink.href = linkSource;
      downloadLink.download = data.filename;
      downloadLink.click();
      toast({ title: "인쇄 성공", description: "거래명세표가 다운로드되었습니다." });
    },
    onError: (error: any) => {
      toast({ title: "인쇄 실패", description: error.message, variant: "destructive" });
    },
  });

  // 거래명세표 PDF 미리보기
  const previewPDFMutation = trpc.haccpIntegration.generatePurchasePDF.useMutation({
    onSuccess: (data: any) => {
      const byteCharacters = atob(data.pdf);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
      toast({ title: "미리보기", description: "거래명세표가 새 탭에서 열렸습니다." });
    },
    onError: (error: any) => {
      toast({ title: "미리보기 실패", description: error.message, variant: "destructive" });
    },
  });

  const handlePrintStatement = (purchaseId: number) => {
    generatePDFMutation.mutate({ purchaseId });
  };

  const handlePreviewStatement = (purchaseId: number) => {
    previewPDFMutation.mutate({ purchaseId });
  };

  // 매입 확정 mutation
  const postMutation = trpc.inventoryAccounting.purchasePost.useMutation({
    onSuccess: () => {
      toast({ title: "매입 확정 성공", description: "매입이 확정되어 재고 및 회계 원장에 반영되었습니다." });
      refetch();
    },
    onError: (error: any) => {
      toast({ title: "확정 실패", description: error.message, variant: "destructive" });
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

  // KPI 계산
  const kpiData = useMemo(() => {
    const totalCount = purchases.length;
    const totalAmount = purchases.reduce((sum: number, p: any) => sum + parseFloat(p.amount || p.totalAmount || "0"), 0);
    const totalTax = purchases.reduce((sum: number, p: any) => sum + parseFloat(p.taxAmount || "0"), 0);
    const totalSum = totalAmount + totalTax;
    return { totalCount, totalAmount, totalTax, totalSum };
  }, [purchases]);

  // 전체 선택/해제
  const handleSelectAll = (checked: boolean) => {
    setSelectedIds(checked ? purchases.map((p: any) => p.id) : []);
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
    downloadExcel(selected, "선택 매입 목록", `선택_매입_목록_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  // 전체 다운로드
  const handleDownloadAll = () => {
    if (purchases.length === 0) {
      toast({ title: "데이터 없음", description: "다운로드할 데이터가 없습니다.", variant: "destructive" });
      return;
    }
    downloadExcel(purchases, "매입 목록", `매입_목록_${new Date().toISOString().split("T")[0]}.xlsx`);
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
            <span className="text-sm text-muted-foreground">총 {purchases.length}건</span>
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
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="w-[44px]">
                      <Checkbox
                        checked={selectedIds.length === purchases.length && purchases.length > 0}
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
                  {purchases.map((purchase: any) => {
                    const amount = parseFloat(purchase.amount || purchase.totalAmount || "0");
                    const tax = parseFloat(purchase.taxAmount || "0");
                    return (
                      <TableRow key={purchase.id} className="group hover:bg-muted/20">
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.includes(purchase.id)}
                            onCheckedChange={(checked) => handleSelectOne(purchase.id, checked as boolean)}
                          />
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {new Date(purchase.transactionDate).toLocaleDateString("ko-KR")}
                        </TableCell>
                        <TableCell className="text-sm font-medium">{purchase.partnerName || "-"}</TableCell>
                        <TableCell className="text-sm max-w-[160px] truncate">{purchase.itemName}</TableCell>
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
                          {purchase.documentType ? (
                            <Badge variant="outline" className="text-xs">{purchase.documentType}</Badge>
                          ) : "-"}
                        </TableCell>
                        <TableCell>{getStatusBadge(purchase.status)}</TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                            <Button
                              size="sm" variant="default"
                              onClick={() => { if (confirm("이 매입을 확정하시겠습니까?")) postMutation.mutate({ purchaseId: purchase.id }); }}
                              disabled={postMutation.isPending || purchase.status === "POSTED"}
                              title="매입 확정" className="h-7 w-7 p-0"
                            >
                              <CheckCircle className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => handlePreviewStatement(purchase.id)}
                              disabled={previewPDFMutation.isPending} title="미리보기" className="h-7 w-7 p-0">
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => handlePrintStatement(purchase.id)}
                              disabled={generatePDFMutation.isPending} title="다운로드" className="h-7 w-7 p-0">
                              <Printer className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="outline"
                              onClick={() => { setEditingPurchase(purchase); setIsEditDialogOpen(true); }}
                              title="수정" className="h-7 w-7 p-0">
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="outline"
                              onClick={() => { if (confirm("이 거래를 삭제하시겠습니까?")) deleteMutation.mutate({ id: purchase.id }); }}
                              title="삭제" className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
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

import { useState, useMemo, useCallback } from "react";
import { usePaginatedSort, SortableHeader, PaginationBar } from "@/components/PaginatedTable";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  TrendingUp,
  Receipt,
  Calculator,
  Coins,
  RotateCcw,
  BarChart3,
  FileSpreadsheet,
  Upload,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import * as XLSX from "xlsx";
import { EditSaleDialog } from "@/components/EditSaleDialog";
import { useLocation } from "wouter";
import ExcelBulkUploadModal from "@/components/ExcelBulkUploadModal";

import { todayLocal } from "../lib/dateUtils";

export default function SalesList() {
  return (
    <DashboardLayout>
      <SalesListContent />
    </DashboardLayout>
  );
}

function SalesListContent() {
  const [, navigate] = useLocation();
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>("all");
  const [itemNameSearch, setItemNameSearch] = useState<string>("");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [editingSale, setEditingSale] = useState<any>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);

  // 거래명세표 PDF 생성
  const generatePDFMutation = trpc.haccpIntegration.generateSalePDF.useMutation({
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

  const handlePrintStatement = (saleId: number) => {
    generatePDFMutation.mutate({ saleId });
  };

  // 삭제 mutation
  const deleteMutation = trpc.haccpIntegration.deleteSale.useMutation({
    onSuccess: () => {
      toast({ title: "삭제 성공", description: "매출 거래가 삭제되었습니다." });
      refetch();
      setSelectedIds([]);
    },
    onError: (error: any) => {
      toast({ title: "삭제 실패", description: error.message, variant: "destructive" });
    },
  });

  // 거래처 목록 조회
  const { data: partners = [] } = trpc.partners.list.useQuery();

  // 매출 거래 조회
  const { data: sales = [], isLoading, refetch } = trpc.haccpIntegration.getAllSales.useQuery({
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    partnerId: selectedPartnerId !== "all" ? parseInt(selectedPartnerId) : undefined,
    itemName: itemNameSearch || undefined,
    status: selectedStatus !== "all" ? selectedStatus : undefined,
  });

  // KPI 계산
  const kpiData = useMemo(() => {
    const totalCount = sales.length;
    const totalAmount = sales.reduce((sum: number, s: any) => sum + parseFloat(s.amount || "0"), 0);
    const totalTax = sales.reduce((sum: number, s: any) => sum + parseFloat(s.taxAmount || "0"), 0);
    const totalSum = totalAmount + totalTax;
    return { totalCount, totalAmount, totalTax, totalSum };
  }, [sales]);

  // 페이지네이션 + 정렬
  const {
    sort, handleSort, pagination, setPage, setPageSize,
    pageData, totalItems, totalPages, startIdx, endIdx
  } = usePaginatedSort(sales, {
    defaultSort: { key: "transactionDate", direction: "desc" },
    defaultPageSize: 30,
    sortFn: (a: any, b: any, key: string, dir) => {
      let aVal = a[key], bVal = b[key];
      // numeric fields
      if (["quantity", "unitPrice", "amount", "taxAmount"].includes(key)) {
        aVal = parseFloat(aVal || "0"); bVal = parseFloat(bVal || "0");
        return dir === "asc" ? aVal - bVal : bVal - aVal;
      }
      // date
      if (key === "transactionDate") {
        aVal = aVal || ""; bVal = bVal || "";
        return dir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      // string
      aVal = String(aVal || ""); bVal = String(bVal || "");
      const cmp = aVal.localeCompare(bVal, "ko");
      return dir === "asc" ? cmp : -cmp;
    },
  });

  // 전체 선택/해제
  const handleSelectAll = (checked: boolean) => {
    setSelectedIds(checked ? sales.map((s: any) => s.id) : []);
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
    const selected = sales.filter((s: any) => selectedIds.includes(s.id));
    downloadExcel(selected, "선택 매출조회", `선택_매출조회_${todayLocal()}.xlsx`);
  };

  // 전체 다운로드
  const handleExcelDownload = () => {
    if (sales.length === 0) {
      toast({ title: "데이터 없음", description: "다운로드할 데이터가 없습니다.", variant: "destructive" });
      return;
    }
    downloadExcel(sales, "매출조회", `매출조회_${todayLocal()}.xlsx`);
  };

  const downloadExcel = (data: any[], sheetName: string, fileName: string) => {
    const excelData = data.map((s: any) => ({
      거래일자: new Date(s.transactionDate).toLocaleDateString("ko-KR"),
      거래처명: s.partnerName || "-",
      품목명: s.itemName || "-",
      수량: s.quantity || 0,
      단가: s.unitPrice || 0,
      금액: s.amount || 0,
      세금: s.taxAmount || 0,
      합계: parseFloat(s.amount || "0") + parseFloat(s.taxAmount || "0"),
      증빙유형: getProofLabel(s.proofType),
      상태: getStatusLabel(s.status),
      비고: s.notes || "-",
    }));
    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, fileName);
    toast({ title: "다운로드 완료", description: "엑셀 파일이 다운로드되었습니다." });
  };

  const getStatusLabel = (status: string) => {
    const map: Record<string, string> = {
      pending: "대기 중", approved: "승인됨", received: "수금 완료", cancelled: "취소됨",
    };
    return map[status] || "-";
  };

  const getProofLabel = (type: string) => {
    const map: Record<string, string> = {
      tax_invoice: "세금계산서", receipt: "영수증", statement: "거래명세서", none: "없음",
    };
    return map[type] || "-";
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="text-yellow-600 border-yellow-300 bg-yellow-50">대기 중</Badge>;
      case "approved":
        return <Badge variant="default" className="bg-blue-100 text-blue-700 border-blue-200">승인됨</Badge>;
      case "received":
        return <Badge variant="default" className="bg-green-100 text-green-700 border-green-200">수금 완료</Badge>;
      case "cancelled":
        return <Badge variant="destructive">취소됨</Badge>;
      default:
        return <Badge variant="outline">-</Badge>;
    }
  };

  const getProofBadge = (type: string) => {
    switch (type) {
      case "tax_invoice":
        return <Badge variant="outline" className="text-indigo-600 border-indigo-200 bg-indigo-50 text-xs">세금계산서</Badge>;
      case "receipt":
        return <Badge variant="outline" className="text-teal-600 border-teal-200 bg-teal-50 text-xs">영수증</Badge>;
      case "statement":
        return <Badge variant="outline" className="text-purple-600 border-purple-200 bg-purple-50 text-xs">거래명세서</Badge>;
      case "none":
        return <Badge variant="outline" className="text-xs">없음</Badge>;
      default:
        return <span className="text-sm text-muted-foreground">-</span>;
    }
  };

  const formatCurrency = (value: string | number) => {
    const num = typeof value === "string" ? parseFloat(value) : value;
    return isNaN(num) ? "0" : num.toLocaleString();
  };

  return (
    <>
      <div className="space-y-6">
        {/* 페이지 헤더 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">매출 조회</h1>
              <p className="text-sm text-muted-foreground">매출 거래 내역을 조회하고 관리합니다.</p>
            </div>
          </div>
          <Button onClick={() => setBulkUploadOpen(true)} variant="outline" size="sm" className="gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            엑셀 일괄등록
          </Button>
        </div>

        {/* KPI 요약 카드 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">총 건수</p>
                  <p className="text-2xl font-bold">{kpiData.totalCount}<span className="text-sm font-normal text-muted-foreground ml-1">건</span></p>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">
                  <BarChart3 className="h-4 w-4" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">총 금액</p>
                  <p className="text-2xl font-bold">{formatCurrency(kpiData.totalAmount)}<span className="text-sm font-normal text-muted-foreground ml-1">원</span></p>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-500">
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
          <Card className="border-l-4 border-l-violet-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">총 합계</p>
                  <p className="text-2xl font-bold text-violet-600">{formatCurrency(kpiData.totalSum)}<span className="text-sm font-normal text-muted-foreground ml-1">원</span></p>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-50 text-violet-500">
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
                    <SelectItem value="received">수금 완료</SelectItem>
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
              <Button variant="outline" size="sm" onClick={handleExcelDownload}>
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
                매출 거래 내역
              </CardTitle>
              <span className="text-sm text-muted-foreground">총 {totalItems.toLocaleString()}건 중 {startIdx}-{endIdx}</span>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-12 bg-muted/50 rounded-md animate-pulse" />
                ))}
              </div>
            ) : sales.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <TrendingUp className="h-12 w-12 mb-4 opacity-30" />
                <p className="text-base font-medium">조회된 매출 거래가 없습니다.</p>
                <p className="text-sm mt-1">필터 조건을 변경하거나 새로운 거래를 등록해주세요.</p>
              </div>
            ) : (
              <>
              <div className="rounded-lg border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="w-[44px]">
                        <Checkbox
                          checked={selectedIds.length === pageData.length && pageData.length > 0}
                          onCheckedChange={(checked) => setSelectedIds(checked ? pageData.map((s: any) => s.id) : [])}
                        />
                      </TableHead>
                      <SortableHeader label="거래일자" sortKey="transactionDate" currentSort={sort} onSort={handleSort} />
                      <SortableHeader label="거래처명" sortKey="partnerName" currentSort={sort} onSort={handleSort} />
                      <SortableHeader label="품목명" sortKey="itemName" currentSort={sort} onSort={handleSort} />
                      <SortableHeader label="수량" sortKey="quantity" currentSort={sort} onSort={handleSort} align="right" />
                      <SortableHeader label="단가" sortKey="unitPrice" currentSort={sort} onSort={handleSort} align="right" />
                      <SortableHeader label="금액" sortKey="amount" currentSort={sort} onSort={handleSort} align="right" />
                      <TableHead className="text-xs font-semibold text-right">세금</TableHead>
                      <TableHead className="text-xs font-semibold text-right">합계</TableHead>
                      <TableHead className="text-xs font-semibold">증빙</TableHead>
                      <TableHead className="text-xs font-semibold">상태</TableHead>
                      <TableHead className="text-xs font-semibold text-center">액션</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageData.map((sale: any) => {
                      const amount = parseFloat(sale.amount || "0");
                      const tax = parseFloat(sale.taxAmount || "0");
                      return (
                        <TableRow key={sale.id} className="group hover:bg-muted/20">
                          <TableCell>
                            <Checkbox
                              checked={selectedIds.includes(sale.id)}
                              onCheckedChange={(checked) => handleSelectOne(sale.id, checked as boolean)}
                            />
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap">
                            {new Date(sale.transactionDate).toLocaleDateString("ko-KR")}
                          </TableCell>
                          <TableCell className="text-sm font-medium">{sale.partnerName || "-"}</TableCell>
                          <TableCell className="text-sm max-w-[160px] truncate">{sale.itemName || "-"}</TableCell>
                          <TableCell className="text-sm text-right tabular-nums">
                            {parseFloat(sale.quantity || "0").toLocaleString()}
                          </TableCell>
                          <TableCell className="text-sm text-right tabular-nums">
                            {formatCurrency(sale.unitPrice || "0")}
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
                          <TableCell>{getProofBadge(sale.proofType)}</TableCell>
                          <TableCell>{getStatusBadge(sale.status)}</TableCell>
                          <TableCell>
                            <div className="flex items-center justify-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                              <Button size="sm" variant="outline" onClick={() => handlePrintStatement(sale.id)}
                                disabled={generatePDFMutation.isPending} title="거래명세표 출력" className="h-7 w-7 p-0">
                                <Printer className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm" variant="outline"
                                onClick={() => { setEditingSale(sale); setIsEditDialogOpen(true); }}
                                title="수정" className="h-7 w-7 p-0">
                                <Edit className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm" variant="outline"
                                onClick={() => { if (confirm("이 거래를 삭제하시겠습니까?")) deleteMutation.mutate({ id: sale.id }); }}
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
              <PaginationBar
                totalItems={totalItems}
                totalPages={totalPages}
                currentPage={pagination.page}
                pageSize={pagination.pageSize}
                startIdx={startIdx}
                endIdx={endIdx}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
              />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 수정 다이얼로그 */}
      {editingSale && (
        <EditSaleDialog
          sale={editingSale}
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          onSuccess={() => { refetch(); setEditingSale(null); }}
        />
      )}

      {/* 엑셀 일괄등록 모달 */}
      <ExcelBulkUploadModal
        open={bulkUploadOpen}
        onOpenChange={setBulkUploadOpen}
        mode="sale"
      />
    </>
  );
}

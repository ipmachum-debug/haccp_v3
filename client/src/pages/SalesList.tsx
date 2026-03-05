import { useState } from "react";
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
import { Download, Search, FileText, Printer, Trash2, Edit } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import * as XLSX from "xlsx";
import { EditSaleDialog } from "@/components/EditSaleDialog";

export default function SalesList() {
  return (
    <DashboardLayout>
      <SalesListContent />
    </DashboardLayout>
  );
}

function SalesListContent() {
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>("all");
  const [itemNameSearch, setItemNameSearch] = useState<string>("");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [editingSale, setEditingSale] = useState<any>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  // 거래명세표 PDF 생성
  const generatePDFMutation = trpc.haccpIntegration.generateSalePDF.useMutation({
    onSuccess: (data) => {
      const linkSource = `data:application/pdf;base64,${data.pdf}`;
      const downloadLink = document.createElement("a");
      downloadLink.href = linkSource;
      downloadLink.download = data.filename;
      downloadLink.click();
      
      toast({
        title: "인쇄 성공",
        description: "거래명세표가 다운로드되었습니다.",
      });
    },
    onError: (error) => {
      toast({
        title: "인쇄 실패",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handlePrintStatement = (saleId: number) => {
    generatePDFMutation.mutate({ saleId });
  };

  // 삭제 mutation
  const deleteMutation = trpc.haccpIntegration.deleteSale.useMutation({
    onSuccess: () => {
      toast({
        title: "삭제 성공",
        description: "매출 거래가 삭제되었습니다.",
      });
      refetch();
      setSelectedIds([]);
    },
    onError: (error) => {
      toast({
        title: "삭제 실패",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // 거래처 목록 조회
  const { data: partners = [] } = trpc.partners.list.useQuery();

  // 매출 거래 조회 (백엔드 필터링 적용)
  const { data: sales = [], isLoading, refetch } = trpc.haccpIntegration.getAllSales.useQuery({
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    partnerId: selectedPartnerId !== "all" ? parseInt(selectedPartnerId) : undefined,
    itemName: itemNameSearch || undefined,
    status: selectedStatus !== "all" ? selectedStatus : undefined,
  });

  // 전체 선택/해제
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(sales.map((s: any) => s.id));
    } else {
      setSelectedIds([]);
    }
  };

  // 개별 선택/해제
  const handleSelectOne = (id: number, checked: boolean) => {
    if (checked) {
      setSelectedIds([...selectedIds, id]);
    } else {
      setSelectedIds(selectedIds.filter((selectedId) => selectedId !== id));
    }
  };

  // 선택 삭제
  const handleDeleteSelected = () => {
    if (selectedIds.length === 0) {
      toast({
        title: "선택 항목 없음",
        description: "삭제할 항목을 선택해주세요.",
        variant: "destructive",
      });
      return;
    }

    if (!confirm(`선택한 ${selectedIds.length}개 항목을 삭제하시겠습니까?`)) {
      return;
    }

    Promise.all(selectedIds.map((id) => deleteMutation.mutateAsync({ id })))
      .then(() => {
        toast({
          title: "삭제 완료",
          description: `${selectedIds.length}개 항목이 삭제되었습니다.`,
        });
        setSelectedIds([]);
        refetch();
      })
      .catch((error) => {
        toast({
          title: "삭제 실패",
          description: error.message,
          variant: "destructive",
        });
      });
  };

  // 선택 다운로드
  const handleDownloadSelected = () => {
    if (selectedIds.length === 0) {
      toast({
        title: "선택 항목 없음",
        description: "다운로드할 항목을 선택해주세요.",
        variant: "destructive",
      });
      return;
    }

    const selectedSales = sales.filter((s: any) => selectedIds.includes(s.id));
    
    const excelData = selectedSales.map((sale: any) => ({
      거래일자: new Date(sale.transactionDate).toLocaleDateString("ko-KR"),
      거래처명: sale.partnerName || "-",
      품목명: sale.itemName || "-",
      수량: sale.quantity || 0,
      단가: sale.unitPrice || 0,
      금액: sale.amount || 0,
      세금: sale.taxAmount || 0,
      합계: (parseFloat(sale.amount || "0") + parseFloat(sale.taxAmount || "0")),
      증빙유형: sale.proofType || "-",
      상태: sale.status || "-",
      비고: sale.notes || "-",
    }));

    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "선택 매출조회");
    XLSX.writeFile(wb, `선택_매출조회_${new Date().toISOString().split("T")[0]}.xlsx`);

    toast({
      title: "다운로드 완료",
      description: `${selectedIds.length}개 항목이 다운로드되었습니다.`,
    });
  };

  // 전체 다운로드
  const handleExcelDownload = () => {
    if (sales.length === 0) {
      toast({
        title: "다운로드 실패",
        description: "다운로드할 데이터가 없습니다.",
        variant: "destructive",
      });
      return;
    }

    const excelData = sales.map((sale: any) => ({
      거래일자: new Date(sale.transactionDate).toLocaleDateString("ko-KR"),
      거래처명: sale.partnerName || "-",
      품목명: sale.itemName || "-",
      수량: sale.quantity || 0,
      단가: sale.unitPrice || 0,
      금액: sale.amount || 0,
      세금: sale.taxAmount || 0,
      합계: (parseFloat(sale.amount || "0") + parseFloat(sale.taxAmount || "0")),
      증빙유형: sale.proofType || "-",
      상태: sale.status || "-",
      비고: sale.notes || "-",
    }));

    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "매출조회");
    XLSX.writeFile(wb, `매출조회_${new Date().toISOString().split("T")[0]}.xlsx`);

    toast({
      title: "다운로드 완료",
      description: "엑셀 파일이 다운로드되었습니다.",
    });
  };

  return (
    <>
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">매출 조회</h1>
      </div>

      {/* 필터 카드 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            조회 조건
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">시작일</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">종료일</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="partner">거래처</Label>
              <Select value={selectedPartnerId} onValueChange={setSelectedPartnerId}>
                <SelectTrigger id="partner">
                  <SelectValue placeholder="전체" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  {partners.map((partner: any) => (
                    <SelectItem key={partner.id} value={partner.id.toString()}>
                      {partner.companyName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="itemName">품목명</Label>
              <Input
                id="itemName"
                type="text"
                placeholder="품목명 검색..."
                value={itemNameSearch}
                onChange={(e) => setItemNameSearch(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">상태</Label>
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger id="status">
                  <SelectValue placeholder="전체" />
                </SelectTrigger>
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
        </CardContent>
      </Card>

      {/* 액션 버튼 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadSelected}
            disabled={selectedIds.length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            선택 다운로드 ({selectedIds.length})
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDeleteSelected}
            disabled={selectedIds.length === 0}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            선택 삭제 ({selectedIds.length})
          </Button>
        </div>
        <Button variant="outline" size="sm" onClick={handleExcelDownload}>
          <Download className="h-4 w-4 mr-2" />
          전체 다운로드
        </Button>
      </div>

      {/* 매출 거래 목록 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              매출 거래 내역
            </div>
            <span className="text-sm text-muted-foreground">
              총 {sales.length}건
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              데이터를 불러오는 중...
            </div>
          ) : sales.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              조회된 매출 거래가 없습니다.
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">
                      <Checkbox
                        checked={selectedIds.length === sales.length && sales.length > 0}
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                    <TableHead>거래일자</TableHead>
                    <TableHead>거래처명</TableHead>
                    <TableHead>품목명</TableHead>
                    <TableHead className="text-right">수량</TableHead>
                    <TableHead className="text-right">단가</TableHead>
                    <TableHead className="text-right">금액</TableHead>
                    <TableHead className="text-right">세금</TableHead>
                    <TableHead className="text-right">합계</TableHead>
                    <TableHead>증빙유형</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead>비고</TableHead>
                    <TableHead className="text-center">액션</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sales.map((sale: any) => (
                    <TableRow key={sale.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.includes(sale.id)}
                          onCheckedChange={(checked) => handleSelectOne(sale.id, checked as boolean)}
                        />
                      </TableCell>
                      <TableCell>
                        {new Date(sale.transactionDate).toLocaleDateString("ko-KR")}
                      </TableCell>
                      <TableCell>{sale.partnerName || "-"}</TableCell>
                      <TableCell>{sale.itemName || "-"}</TableCell>
                      <TableCell className="text-right"><div className="flex flex-wrap gap-1 justify-end">
                        {parseFloat(sale.quantity || "0").toLocaleString()}
</div>                      </TableCell>
                      <TableCell className="text-right"><div className="flex flex-wrap gap-1 justify-end">
                        {parseFloat(sale.unitPrice || "0").toLocaleString()}원
</div>                      </TableCell>
                      <TableCell className="text-right"><div className="flex flex-wrap gap-1 justify-end">
                        {parseFloat(sale.amount || "0").toLocaleString()}원
</div>                      </TableCell>
                      <TableCell className="text-right"><div className="flex flex-wrap gap-1 justify-end">
                        {parseFloat(sale.taxAmount || "0").toLocaleString()}원
</div>                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {(parseFloat(sale.amount || "0") + parseFloat(sale.taxAmount || "0")).toLocaleString()}원
                      </TableCell>
                      <TableCell>
                        {sale.proofType === "tax_invoice" ? "세금계산서" :
                         sale.proofType === "receipt" ? "영수증" :
                         sale.proofType === "statement" ? "거래명세서" :
                         sale.proofType === "none" ? "없음" : "-"}
                      </TableCell>
                      <TableCell>
                        {sale.status === "pending" ? "대기 중" :
                         sale.status === "approved" ? "승인됨" :
                         sale.status === "received" ? "수금 완료" :
                         sale.status === "cancelled" ? "취소됨" : "-"}
                      </TableCell>
                      <TableCell>{sale.notes || "-"}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handlePrintStatement(sale.id)}
                            disabled={generatePDFMutation.isPending}
                            title="거래명세표 출력"
                          >
                            <Printer className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingSale(sale);
                              setIsEditDialogOpen(true);
                            }}
                            title="수정"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                              if (confirm("이 거래를 삭제하시겠습니까?")) {
                                deleteMutation.mutate({ id: sale.id });
                              }
                            }}
                            title="삭제"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 합계 요약 */}
      {sales.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>합계</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">총 거래 건수</p>
                <p className="text-2xl font-bold">{sales.length}건</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">총 금액</p>
                <p className="text-2xl font-bold">
                  {sales
                    .reduce((sum: number, s: any) => sum + parseFloat(s.amount || "0"), 0)
                    .toLocaleString()}원
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">총 세금</p>
                <p className="text-2xl font-bold">
                  {sales
                    .reduce((sum: number, s: any) => sum + parseFloat(s.taxAmount || "0"), 0)
                    .toLocaleString()}원
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">총 합계</p>
                <p className="text-2xl font-bold text-primary">
                  {sales
                    .reduce((sum: number, s: any) => sum + parseFloat(s.amount || "0") + parseFloat(s.taxAmount || "0"), 0)
                    .toLocaleString()}원
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>

    {/* 수정 다이얼로그 */}
    {editingSale && (
      <EditSaleDialog
        sale={editingSale}
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        onSuccess={() => {
          refetch();
          setEditingSale(null);
        }}
      />
    )}
    </>
  );
}

import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Download, Search, FileText, Printer, Trash2, Edit, CheckCircle, XCircle, Eye } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import * as XLSX from "xlsx";
import { EditPurchaseDialog } from "@/components/EditPurchaseDialog";

export default function PurchasesList() {
  return (
    <DashboardLayout>
      <PurchasesListContent />
    </DashboardLayout>
  );
}

function PurchasesListContent() {
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>("all");
  const [itemNameSearch, setItemNameSearch] = useState<string>("");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [editingPurchase, setEditingPurchase] = useState<any>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  // 거래명세표 PDF 생성 (다운로드)
  const generatePDFMutation = trpc.haccpIntegration.generatePurchasePDF.useMutation({
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

  // 거래명세표 PDF 미리보기 (새 탭에서 열기)
  const previewPDFMutation = trpc.haccpIntegration.generatePurchasePDF.useMutation({
    onSuccess: (data) => {
      // base64를 Blob으로 변환하여 새 탭에서 미리보기
      const byteCharacters = atob(data.pdf);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: "application/pdf" });
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, "_blank");
      
      toast({
        title: "미리보기",
        description: "거래명세표가 새 탭에서 열렸습니다.",
      });
    },
    onError: (error) => {
      toast({
        title: "미리보기 실패",
        description: error.message,
        variant: "destructive",
      });
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
      toast({
        title: "매입 확정 성공",
        description: "매입이 확정되어 재고 및 회계 원장에 반영되었습니다.",
      });
      refetch();
    },
    onError: (error) => {
      toast({
        title: "확정 실패",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // 매입 취소 mutation
  const cancelMutation = trpc.inventoryAccounting.purchaseCancel.useMutation({
    onSuccess: () => {
      toast({
        title: "매입 취소 성공",
        description: "매입이 취소되어 재고 및 회계 원장이 롤백되었습니다.",
      });
      refetch();
    },
    onError: (error) => {
      toast({
        title: "취소 실패",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // 삭제 mutation
  const deleteMutation = trpc.haccpIntegration.deletePurchase.useMutation({
    onSuccess: () => {
      toast({
        title: "삭제 성공",
        description: "매입 거래가 삭제되었습니다.",
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

  // 매입 목록 조회
  const filters: any = {};
  if (startDate) filters.startDate = startDate;
  if (endDate) filters.endDate = endDate;
  if (selectedPartnerId !== "all") filters.partnerId = parseInt(selectedPartnerId);
  if (itemNameSearch) filters.itemName = itemNameSearch;
  if (selectedStatus !== "all") filters.status = selectedStatus;

  const { data: purchases = [], isLoading, refetch } = trpc.haccpIntegration.getAllPurchases.useQuery(filters);

  // 전체 선택/해제
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(purchases.map((p: any) => p.id));
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

    // 순차 삭제
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

  // 선택 다운로드 (엑셀)
  const handleDownloadSelected = () => {
    if (selectedIds.length === 0) {
      toast({
        title: "선택 항목 없음",
        description: "다운로드할 항목을 선택해주세요.",
        variant: "destructive",
      });
      return;
    }

    const selectedPurchases = purchases.filter((p: any) => selectedIds.includes(p.id));
    
    const excelData = selectedPurchases.map((purchase: any) => ({
      거래일자: purchase.transactionDate,
      거래처명: purchase.partnerName || "-",
      품목명: purchase.itemName,
      수량: purchase.quantity,
      단위: purchase.unit || "-",
      단가: purchase.unitPrice,
      금액: purchase.amount || purchase.totalAmount,
      세금: purchase.taxAmount || 0,
      합계: (parseFloat(purchase.amount || purchase.totalAmount || "0") + parseFloat(purchase.taxAmount || "0")).toFixed(2),
      증빙유형: purchase.documentType || "-",
      상태: purchase.status === "pending" ? "대기 중" :
             purchase.status === "approved" ? "승인됨" :
             purchase.status === "paid" ? "지급 완료" :
             purchase.status === "cancelled" ? "취소됨" : "-",
      비고: purchase.notes || "-",
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "선택 매입 목록");
    XLSX.writeFile(workbook, `선택_매입_목록_${new Date().toISOString().split("T")[0]}.xlsx`);

    toast({
      title: "다운로드 완료",
      description: `${selectedIds.length}개 항목이 다운로드되었습니다.`,
    });
  };

  // 전체 다운로드 (엑셀)
  const handleDownloadAll = () => {
    if (purchases.length === 0) {
      toast({
        title: "데이터 없음",
        description: "다운로드할 데이터가 없습니다.",
        variant: "destructive",
      });
      return;
    }

    const excelData = purchases.map((purchase: any) => ({
      거래일자: purchase.transactionDate,
      거래처명: purchase.partnerName || "-",
      품목명: purchase.itemName,
      수량: purchase.quantity,
      단위: purchase.unit || "-",
      단가: purchase.unitPrice,
      금액: purchase.amount || purchase.totalAmount,
      세금: purchase.taxAmount || 0,
      합계: (parseFloat(purchase.amount || purchase.totalAmount || "0") + parseFloat(purchase.taxAmount || "0")).toFixed(2),
      증빙유형: purchase.documentType || "-",
      상태: purchase.status === "pending" ? "대기 중" :
             purchase.status === "approved" ? "승인됨" :
             purchase.status === "paid" ? "지급 완료" :
             purchase.status === "cancelled" ? "취소됨" : "-",
      비고: purchase.notes || "-",
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "매입 목록");
    XLSX.writeFile(workbook, `매입_목록_${new Date().toISOString().split("T")[0]}.xlsx`);

    toast({
      title: "다운로드 완료",
      description: "매입 목록이 다운로드되었습니다.",
    });
  };

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          매입 거래 목록
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 필터 영역 */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="text-sm font-medium mb-1 block">시작일</label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">종료일</label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">거래처</label>
            <Select value={selectedPartnerId} onValueChange={setSelectedPartnerId}>
              <SelectTrigger>
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
          <div>
            <label className="text-sm font-medium mb-1 block">품목명</label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="품목명 검색"
                value={itemNameSearch}
                onChange={(e) => setItemNameSearch(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">상태</label>
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger>
                <SelectValue placeholder="전체" />
              </SelectTrigger>
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
          <Button variant="outline" size="sm" onClick={handleDownloadAll}>
            <Download className="h-4 w-4 mr-2" />
            전체 다운로드
          </Button>
        </div>

        {/* 테이블 */}
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">
            로딩 중...
          </div>
        ) : purchases.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            조회된 매입 거래가 없습니다.
          </div>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">
                    <Checkbox
                      checked={selectedIds.length === purchases.length && purchases.length > 0}
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
                {purchases.map((purchase: any) => (
                  <TableRow key={purchase.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.includes(purchase.id)}
                        onCheckedChange={(checked) => handleSelectOne(purchase.id, checked as boolean)}
                      />
                    </TableCell>
                    <TableCell>
                      {new Date(purchase.transactionDate).toLocaleDateString("ko-KR")}
                    </TableCell>
                    <TableCell>{purchase.partnerName || "-"}</TableCell>
                    <TableCell>{purchase.itemName}</TableCell>
                    <TableCell className="text-right"><div className="flex flex-wrap gap-1 justify-end">
                      {purchase.quantity} {purchase.unit || ""}
</div>                    </TableCell>
                    <TableCell className="text-right"><div className="flex flex-wrap gap-1 justify-end">
                      {parseFloat(purchase.unitPrice).toLocaleString()}원
</div>                    </TableCell>
                    <TableCell className="text-right"><div className="flex flex-wrap gap-1 justify-end">
                      {parseFloat(purchase.amount || purchase.totalAmount || "0").toLocaleString()}원
</div>                    </TableCell>
                    <TableCell className="text-right"><div className="flex flex-wrap gap-1 justify-end">
                      {parseFloat(purchase.taxAmount || "0").toLocaleString()}원
</div>                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {(
                        parseFloat(purchase.amount || purchase.totalAmount || "0") +
                        parseFloat(purchase.taxAmount || "0")
                      ).toLocaleString()}원
                    </TableCell>
                    <TableCell>{purchase.documentType || "-"}</TableCell>
                    <TableCell>
                      {purchase.status === "pending" ? "대기 중" :
                       purchase.status === "approved" ? "승인됨" :
                       purchase.status === "paid" ? "지급 완료" :
                       purchase.status === "cancelled" ? "취소됨" : "-"}
                    </TableCell>
                    <TableCell>{purchase.notes || "-"}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => {
                            if (confirm("이 매입을 확정하시겠습니까? 확정 후에는 재고 및 회계 원장에 반영됩니다.")) {
                              postMutation.mutate({ purchaseId: purchase.id });
                            }
                          }}
                          disabled={postMutation.isPending || purchase.status === "POSTED"}
                          title="매입 확정"
                        >
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handlePreviewStatement(purchase.id)}
                          disabled={previewPDFMutation.isPending}
                          title="거래명세표 미리보기"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handlePrintStatement(purchase.id)}
                          disabled={generatePDFMutation.isPending}
                          title="거래명세표 다운로드"
                        >
                          <Printer className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingPurchase(purchase);
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
                              deleteMutation.mutate({ id: purchase.id });
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

    {/* 수정 다이얼로그 */}
    {editingPurchase && (
      <EditPurchaseDialog
        purchase={editingPurchase}
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        onSuccess={() => {
          refetch();
          setEditingPurchase(null);
        }}
      />
    )}
    </>
  );
}

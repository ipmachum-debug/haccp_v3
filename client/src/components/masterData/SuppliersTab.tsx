import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Plus, Pencil, Trash2, Upload, FileSpreadsheet, Search, ArrowUpDown, ChevronLeft, ChevronRight, Download } from "lucide-react";
import SupplierBulkUploadModal from "@/components/masterData/SupplierBulkUploadModal";
import TemplateCustomizer from "@/components/checklist/TemplateCustomizer";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function SuppliersTab() {
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<any>(null);
  const [supplierBulkUploadOpen, setSupplierBulkUploadOpen] = useState(false);
  const [templateCustomizerOpen, setTemplateCustomizerOpen] = useState(false);

  // 거래처 필터/정렬/페이지네이션 state
  const [supSearchQuery, setSupSearchQuery] = useState("");
  const [supSortBy, setSupSortBy] = useState<"supplierCode" | "supplierName" | "supplierType">("supplierName");
  const [supSortOrder, setSupSortOrder] = useState<"asc" | "desc">("asc");
  const [supPage, setSupPage] = useState(1);
  const supPageSize = 30;

  const utils = trpc.useUtils();

  // 거래처 관리
  const { data: supplierData, refetch: refetchSuppliers } = trpc.supplier.getAll.useQuery({
    page: supPage,
    limit: supPageSize,
    sortBy: supSortBy,
    sortOrder: supSortOrder,
    search: supSearchQuery || undefined,
  });
  const suppliers = (supplierData as any)?.items ?? (Array.isArray(supplierData) ? supplierData : []);
  const supplierTotal = (supplierData as any)?.total ?? 0;
  const supplierTotalPages = Math.ceil(supplierTotal / supPageSize) || 1;
  const createSupplierMutation = trpc.supplier.create.useMutation({
    onSuccess: () => {
      toast.success("거래처가 추가되었습니다");
      setSupplierDialogOpen(false);
      refetchSuppliers();
    },
    onError: (error: { message: string }) => {
      toast.error(`거래처 추가 실패: ${error.message}`);
    },
  });

  const deleteSupplierMutation = trpc.supplier.delete.useMutation({
    onSuccess: () => {
      toast.success("거래처가 삭제되었습니다");
      refetchSuppliers();
    },
    onError: (error: { message: string }) => {
      toast.error(`거래처 삭제 실패: ${error.message}`);
    },
  });

  const updateSupplierMutation = trpc.supplier.update.useMutation({
    onSuccess: () => {
      toast.success("거래처가 수정되었습니다");
      setEditingSupplier(null);
      refetchSuppliers();
    },
    onError: (error: { message: string }) => {
      toast.error(`거래처 수정 실패: ${error.message}`);
    },
  });

  const handleCreateSupplier = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createSupplierMutation.mutate({
      businessNumber: formData.get("businessNumber") as string,
      supplierName: formData.get("supplierName") as string,
      supplierType: (formData.get("supplierType") as string) || undefined,
      contactPerson: (formData.get("contactPerson") as string) || undefined,
      phone: (formData.get("contactPhone") as string) || undefined,
      email: (formData.get("contactEmail") as string) || undefined,
      address: (formData.get("address") as string) || undefined,
      certifications: undefined,
      rating: undefined,
    });
  };

  const handleUpdateSupplier = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    updateSupplierMutation.mutate({
      id: editingSupplier.id,
      businessNumber: formData.get("businessNumber") as string,
      supplierName: formData.get("supplierName") as string,
      supplierType: (formData.get("supplierType") as string) || undefined,
      contactPerson: (formData.get("contactPerson") as string) || undefined,
      phone: (formData.get("contactPhone") as string) || undefined,
      email: (formData.get("contactEmail") as string) || undefined,
      address: (formData.get("address") as string) || undefined,
    });
  };

  // 거래처 정렬 토글
  const handleSupSort = (field: "supplierCode" | "supplierName" | "supplierType") => {
    if (supSortBy === field) { setSupSortOrder(supSortOrder === "asc" ? "desc" : "asc"); }
    else { setSupSortBy(field); setSupSortOrder("asc"); }
    setSupPage(1);
  };

  // 거래처 전체 다운로드
  const handleExportAllSuppliers = async () => {
    try {
      const allData = await utils.supplier.exportAll.fetch();
      const items = (allData as any)?.items ?? [];
      if (items.length === 0) { toast.error("다운로드할 거래처가 없습니다"); return; }
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("거래처 목록");
      const hr = ws.addRow(["사업자번호", "거래처명", "유형", "담당자", "연락처", "이메일", "주소"]);
      hr.eachCell((c: any) => { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } }; });
      items.forEach((s: any) => { ws.addRow([s.businessNumber || "", s.supplierName || "", s.supplierType || "", s.contactPerson || "", s.phone || "", s.email || "", s.address || ""]); });
      ws.columns = [{ width: 18 }, { width: 25 }, { width: 15 }, { width: 12 }, { width: 15 }, { width: 20 }, { width: 30 }];
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "거래처_전체목록_" + new Date().toISOString().slice(0, 10) + ".xlsx"; a.click(); URL.revokeObjectURL(url);
      toast.success(items.length + "개 거래처 데이터를 다운로드했습니다");
    } catch (e: any) { toast.error("다운로드 실패: " + e.message); }
  };

  const handleDownloadSupplierTemplate = async () => {
    const { generateSupplierTemplate, downloadTemplate } = await import("@/lib/excelTemplates");
    const blob = await generateSupplierTemplate();
    downloadTemplate(blob, "거래처_일괄등록_템플릿.xlsx");
    toast.success("템플릿이 다운로드되었습니다");
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>거래처 관리</CardTitle>
              <CardDescription>
                거래처 목록 및 연락처 정보 관리 | 총 <strong>{supplierTotal}개</strong> 등록됨
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleExportAllSuppliers}>
                <Download className="h-4 w-4 mr-2" />
                전체 다운로드
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownloadSupplierTemplate}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                템플릿
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setTemplateCustomizerOpen(true);
                }}
              >
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                커스텀 템플릿
              </Button>
              <Button variant="outline" onClick={() => setSupplierBulkUploadOpen(true)}>
                <Upload className="h-4 w-4 mr-2" />
                일괄 업로드
              </Button>
              <Dialog open={supplierDialogOpen} onOpenChange={setSupplierDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    거래처 추가
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <form onSubmit={handleCreateSupplier}>
                    <DialogHeader>
                      <DialogTitle>새 거래처 추가</DialogTitle>
                      <DialogDescription>새로운 거래처 정보를 입력하세요</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <Label htmlFor="businessNumber">사업자번호 *</Label>
                        <Input id="businessNumber" name="businessNumber" required placeholder="123-45-67890" />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="supplierName">거래처명 *</Label>
                        <Input id="supplierName" name="supplierName" required />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="supplierType">거래처 유형</Label>
                        <Select name="supplierType">
                          <SelectTrigger id="supplierType">
                            <SelectValue placeholder="선택하세요" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="거래처">거래처</SelectItem>
                            <SelectItem value="공급처">공급처</SelectItem>
                            <SelectItem value="원재료">원재료</SelectItem>
                            <SelectItem value="판매처">판매처</SelectItem>
                            <SelectItem value="전자상거래">전자상거래</SelectItem>
                            <SelectItem value="경비항목">경비항목</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="contactPerson">담당자</Label>
                        <Input id="contactPerson" name="contactPerson" />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="contactPhone">연락처</Label>
                        <Input id="contactPhone" name="contactPhone" placeholder="예: 010-1234-5678" />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="contactEmail">이메일</Label>
                        <Input id="contactEmail" name="contactEmail" type="email" />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="address">주소</Label>
                        <Input id="address" name="address" />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="submit" disabled={createSupplierMutation.isPending}>
                        {createSupplierMutation.isPending ? "추가 중..." : "추가"}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* 검색 바 */}
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="거래처명 또는 사업자번호로 검색..." value={supSearchQuery} onChange={(e) => { setSupSearchQuery(e.target.value); setSupPage(1); }} className="pl-10" />
            </div>
            <p className="text-sm text-muted-foreground">
              {supSearchQuery ? `검색 결과: ${supplierTotal}건` : `${supPage}/${supplierTotalPages} 페이지`}
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer select-none" onClick={() => handleSupSort("supplierCode")}>
                  <div className="flex items-center gap-1">사업자번호 <ArrowUpDown className="h-3 w-3" />{supSortBy === "supplierCode" && <span className="text-xs">({supSortOrder === "asc" ? "▲" : "▼"})</span>}</div>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => handleSupSort("supplierName")}>
                  <div className="flex items-center gap-1">거래처명 <ArrowUpDown className="h-3 w-3" />{supSortBy === "supplierName" && <span className="text-xs">({supSortOrder === "asc" ? "▲" : "▼"})</span>}</div>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => handleSupSort("supplierType")}>
                  <div className="flex items-center gap-1">유형 <ArrowUpDown className="h-3 w-3" />{supSortBy === "supplierType" && <span className="text-xs">({supSortOrder === "asc" ? "▲" : "▼"})</span>}</div>
                </TableHead>
                <TableHead>담당자</TableHead>
                <TableHead>연락처</TableHead>
                <TableHead>상태</TableHead>
                <TableHead className="text-right">작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    {supSearchQuery ? `"${supSearchQuery}"에 대한 검색 결과가 없습니다.` : '등록된 거래처가 없습니다. "거래처 추가" 또는 "일괄 업로드"를 사용하세요.'}
                  </TableCell>
                </TableRow>
              ) : (
                suppliers.map((supplier: any) => (
                  <TableRow key={supplier.id}>
                    <TableCell className="font-medium">{supplier.businessNumber || "-"}</TableCell>
                    <TableCell>{supplier.supplierName}</TableCell>
                    <TableCell>{supplier.supplierType || "-"}</TableCell>
                    <TableCell>{supplier.contactPerson || "-"}</TableCell>
                    <TableCell>{supplier.phone || "-"}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        supplier.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
                      }`}>
                        {supplier.isActive ? "활성" : "비활성"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingSupplier(supplier)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (confirm("정말 삭제하시겠습니까?")) {
                              deleteSupplierMutation.mutate({ id: supplier.id });
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {/* 페이지네이션 */}
          {supplierTotalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <p className="text-sm text-muted-foreground">총 {supplierTotal}개 중 {(supPage - 1) * supPageSize + 1}~{Math.min(supPage * supPageSize, supplierTotal)}개 표시</p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={supPage <= 1} onClick={() => setSupPage(supPage - 1)}><ChevronLeft className="h-4 w-4" /> 이전</Button>
                {Array.from({ length: Math.min(supplierTotalPages, 7) }, (_, i) => {
                  let pn: number;
                  if (supplierTotalPages <= 7) pn = i + 1;
                  else if (supPage <= 4) pn = i + 1;
                  else if (supPage >= supplierTotalPages - 3) pn = supplierTotalPages - 6 + i;
                  else pn = supPage - 3 + i;
                  return <Button key={pn} variant={supPage === pn ? "default" : "outline"} size="sm" className="w-9" onClick={() => setSupPage(pn)}>{pn}</Button>;
                })}
                <Button variant="outline" size="sm" disabled={supPage >= supplierTotalPages} onClick={() => setSupPage(supPage + 1)}>다음 <ChevronRight className="h-4 w-4" /></Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 거래처 수정 Dialog */}
      <Dialog open={!!editingSupplier} onOpenChange={(open) => !open && setEditingSupplier(null)}>
        <DialogContent>
          <form onSubmit={handleUpdateSupplier}>
            <DialogHeader>
              <DialogTitle>거래처 수정</DialogTitle>
              <DialogDescription>거래처 정보를 수정하세요</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-businessNumber">사업자번호 *</Label>
                <Input id="edit-businessNumber" name="businessNumber" defaultValue={editingSupplier?.businessNumber} required placeholder="123-45-67890" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-supplierName">거래처명 *</Label>
                <Input id="edit-supplierName" name="supplierName" defaultValue={editingSupplier?.supplierName} required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-supplierType">거래처 유형</Label>
                <Select name="supplierType" defaultValue={editingSupplier?.supplierType || ""}>
                  <SelectTrigger id="edit-supplierType">
                    <SelectValue placeholder="선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="거래처">거래처</SelectItem>
                    <SelectItem value="공급처">공급처</SelectItem>
                    <SelectItem value="원재료">원재료</SelectItem>
                    <SelectItem value="판매처">판매처</SelectItem>
                    <SelectItem value="전자상거래">전자상거래</SelectItem>
                    <SelectItem value="경비항목">경비항목</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-contactPerson">담당자</Label>
                <Input id="edit-contactPerson" name="contactPerson" defaultValue={editingSupplier?.contactPerson || ""} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-contactPhone">연락처</Label>
                <Input id="edit-contactPhone" name="contactPhone" defaultValue={editingSupplier?.phone || ""} placeholder="예: 010-1234-5678" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-contactEmail">이메일</Label>
                <Input id="edit-contactEmail" name="contactEmail" type="email" defaultValue={editingSupplier?.email || ""} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-address">주소</Label>
                <Input id="edit-address" name="address" defaultValue={editingSupplier?.address || ""} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingSupplier(null)}>
                취소
              </Button>
              <Button type="submit" disabled={updateSupplierMutation.isPending}>
                {updateSupplierMutation.isPending ? "수정 중..." : "수정"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 일괄 업로드 모달 */}
      <SupplierBulkUploadModal
        open={supplierBulkUploadOpen}
        onClose={() => setSupplierBulkUploadOpen(false)}
        onSuccess={() => refetchSuppliers()}
      />
      <TemplateCustomizer
        open={templateCustomizerOpen}
        onClose={() => setTemplateCustomizerOpen(false)}
        templateType="supplier"
      />
    </>
  );
}

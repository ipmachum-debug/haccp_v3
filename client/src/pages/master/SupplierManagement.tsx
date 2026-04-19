import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search, Star } from "lucide-react";
import { Link } from "wouter";
import { Textarea } from "@/components/ui/textarea";
import DashboardLayout from "@/components/dashboard/DashboardLayout";

export default function SupplierManagement() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
  const [autoSupplierCode, setAutoSupplierCode] = useState("");

  // 거래처 목록 조회
  const { data: rawSuppliersData, isLoading, refetch } = trpc.supplier.getAll.useQuery({ limit: 9999 });
  const suppliers = (rawSuppliersData as any)?.items ?? (Array.isArray(rawSuppliersData) ? rawSuppliersData : []);
  const utils = trpc.useUtils();

  // 생성 다이얼로그가 열릴 때 자동으로 코드 생성
  useEffect(() => {
    if (isCreateDialogOpen) {
      (async () => {
        try {
          const result = await utils.supplier.generateCode.fetch();
          setAutoSupplierCode(result);
        } catch (error: any) {
          console.error("거래처 코드 자동 생성 실패:", error.message);
        }
      })();
    } else {
      setAutoSupplierCode("");
    }
  }, [isCreateDialogOpen]);

  // 거래처 생성
  const createMutation = trpc.supplier.create.useMutation({
    onSuccess: () => {
      toast.success("거래처가 생성되었습니다.");
      setIsCreateDialogOpen(false);
      refetch();
    },
    onError: (error: { message: string }) => {
      toast.error(`거래처 생성 실패: ${error.message}`);
    },
  });

  // 거래처 수정
  const updateMutation = trpc.supplier.update.useMutation({
    onSuccess: () => {
      toast.success("거래처가 수정되었습니다.");
      setIsEditDialogOpen(false);
      setSelectedSupplier(null);
      refetch();
    },
    onError: (error: { message: string }) => {
      toast.error(`거래처 수정 실패: ${error.message}`);
    },
  });

  // 거래처 삭제
  const deleteMutation = trpc.supplier.delete.useMutation({
    onSuccess: () => {
      toast.success("거래처가 삭제되었습니다.");
      refetch();
    },
    onError: (error: { message: string }) => {
      toast.error(`거래처 삭제 실패: ${error.message}`);
    },
  });

  // 필터링된 거래처 목록
  const filteredSuppliers = suppliers?.filter(
    (supplier: any) =>
      supplier.supplierName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      supplier.supplierCode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      supplier.businessNumber?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    createMutation.mutate({
      supplierCode: autoSupplierCode,
      supplierName: formData.get("supplierName") as string,
      businessNumber: formData.get("businessNumber") as string,
      contactPerson: formData.get("contactPerson") as string,
      phone: formData.get("phone") as string,
      email: formData.get("email") as string,
      address: formData.get("address") as string,
      supplierType: formData.get("supplierType") as string,
      certifications: formData.get("certifications") as string,
      rating: formData.get("rating") as string,
    });
  };

  const handleUpdate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedSupplier) return;

    const formData = new FormData(e.currentTarget);
    
    updateMutation.mutate({
      id: selectedSupplier.id,
      supplierCode: formData.get("supplierCode") as string,
      supplierName: formData.get("supplierName") as string,
      businessNumber: formData.get("businessNumber") as string,
      contactPerson: formData.get("contactPerson") as string,
      phone: formData.get("phone") as string,
      email: formData.get("email") as string,
      address: formData.get("address") as string,
      supplierType: formData.get("supplierType") as string,
      certifications: formData.get("certifications") as string,
      rating: formData.get("rating") as string,
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("정말로 이 거래처를 삭제하시겠습니까?")) {
      deleteMutation.mutate({ id });
    }
  };

  const openEditDialog = (supplier: any) => {
    setSelectedSupplier(supplier);
    setIsEditDialogOpen(true);
  };

  return (
    <DashboardLayout>

    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>거래처 관리</CardTitle>
              <CardDescription>공급업체 및 고객 정보를 관리합니다.</CardDescription>
            </div>
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  거래처 추가
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>새 거래처 추가</DialogTitle>
                  <DialogDescription>
                    새로운 거래처 정보를 입력하세요.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreate}>
                  <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="supplierCode">거래처 코드</Label>
                        <Input id="supplierCode" name="supplierCode" value={autoSupplierCode} readOnly className="bg-muted" placeholder="자동 생성됩니다" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="supplierName">거래처명 *</Label>
                        <Input id="supplierName" name="supplierName" required placeholder="(주)한국식품" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="businessNumber">사업자번호</Label>
                        <Input id="businessNumber" name="businessNumber" placeholder="123-45-67890" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="supplierType">거래처 유형</Label>
                        <Select name="supplierType">
                          <SelectTrigger>
                            <SelectValue placeholder="유형 선택" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="supplier">공급업체</SelectItem>
                            <SelectItem value="customer">고객</SelectItem>
                            <SelectItem value="both">공급업체/고객</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="contactPerson">담당자</Label>
                        <Input id="contactPerson" name="contactPerson" placeholder="홍길동" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="phone">연락처</Label>
                        <Input id="phone" name="phone" placeholder="02-1234-5678" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">이메일</Label>
                      <Input id="email" name="email" type="email" placeholder="contact@example.com" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="address">주소</Label>
                      <Textarea id="address" name="address" placeholder="서울시 강남구..." rows={2} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="certifications">인증서</Label>
                      <Textarea id="certifications" name="certifications" placeholder="HACCP, ISO 22000..." rows={2} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="rating">등급</Label>
                      <Select name="rating">
                        <SelectTrigger>
                          <SelectValue placeholder="등급 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="A">A (우수)</SelectItem>
                          <SelectItem value="B">B (양호)</SelectItem>
                          <SelectItem value="C">C (보통)</SelectItem>
                          <SelectItem value="D">D (미흡)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                      취소
                    </Button>
                    <Button type="submit" disabled={createMutation.isPending}>
                      {createMutation.isPending ? "생성 중..." : "생성"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="거래처명, 코드, 사업자번호로 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-8">로딩 중...</div>
          ) : filteredSuppliers && filteredSuppliers.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>거래처 코드</TableHead>
                    <TableHead>거래처명</TableHead>
                    <TableHead>사업자번호</TableHead>
                    <TableHead>담당자</TableHead>
                    <TableHead>연락처</TableHead>
                    <TableHead>유형</TableHead>
                    <TableHead>등급</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead className="text-right">작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSuppliers.map((supplier: any) => (
                    <TableRow key={supplier.id}>
                      <TableCell className="font-mono">{supplier.supplierCode || "-"}</TableCell>
                      <TableCell className="font-medium">{supplier.supplierName}</TableCell>
                      <TableCell>{supplier.businessNumber || "-"}</TableCell>
                      <TableCell>{supplier.contactPerson || "-"}</TableCell>
                      <TableCell>{supplier.phone || "-"}</TableCell>
                      <TableCell>
                        {supplier.supplierType === "supplier" && <Badge variant="outline">공급업체</Badge>}
                        {supplier.supplierType === "customer" && <Badge variant="outline">고객</Badge>}
                        {supplier.supplierType === "both" && <Badge variant="outline">공급업체/고객</Badge>}
                        {!supplier.supplierType && "-"}
                      </TableCell>
                      <TableCell>
                        {supplier.rating === "A" && <Badge variant="default">A (우수)</Badge>}
                        {supplier.rating === "B" && <Badge variant="secondary">B (양호)</Badge>}
                        {supplier.rating === "C" && <Badge variant="outline">C (보통)</Badge>}
                        {supplier.rating === "D" && <Badge variant="destructive">D (미흡)</Badge>}
                        {!supplier.rating && "-"}
                      </TableCell>
                      <TableCell>
                        {supplier.isActive ? (
                          <Badge variant="default">활성</Badge>
                        ) : (
                          <Badge variant="secondary">비활성</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/dashboard/suppliers/${supplier.id}/evaluations`}>
                          <Button variant="ghost" size="sm">
                            <Star className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditDialog(supplier)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(supplier.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              {searchTerm ? "검색 결과가 없습니다." : "등록된 거래처가 없습니다."}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 수정 다이얼로그 */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>거래처 수정</DialogTitle>
            <DialogDescription>
              거래처 정보를 수정하세요.
            </DialogDescription>
          </DialogHeader>
          {selectedSupplier && (
            <form onSubmit={handleUpdate}>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-supplierCode">거래처 코드</Label>
                    <Input
                      id="edit-supplierCode"
                      name="supplierCode"
                      defaultValue={selectedSupplier.supplierCode || ""}
                      placeholder="SUP-001"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-supplierName">거래처명 *</Label>
                    <Input
                      id="edit-supplierName"
                      name="supplierName"
                      defaultValue={selectedSupplier.supplierName}
                      required
                      placeholder="(주)한국식품"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-businessNumber">사업자번호</Label>
                    <Input
                      id="edit-businessNumber"
                      name="businessNumber"
                      defaultValue={selectedSupplier.businessNumber || ""}
                      placeholder="123-45-67890"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-supplierType">거래처 유형</Label>
                    <Select name="supplierType" defaultValue={selectedSupplier.supplierType || ""}>
                      <SelectTrigger>
                        <SelectValue placeholder="유형 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="supplier">공급업체</SelectItem>
                        <SelectItem value="customer">고객</SelectItem>
                        <SelectItem value="both">공급업체/고객</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-contactPerson">담당자</Label>
                    <Input
                      id="edit-contactPerson"
                      name="contactPerson"
                      defaultValue={selectedSupplier.contactPerson || ""}
                      placeholder="홍길동"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-phone">연락처</Label>
                    <Input
                      id="edit-phone"
                      name="phone"
                      defaultValue={selectedSupplier.phone || ""}
                      placeholder="02-1234-5678"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-email">이메일</Label>
                  <Input
                    id="edit-email"
                    name="email"
                    type="email"
                    defaultValue={selectedSupplier.email || ""}
                    placeholder="contact@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-address">주소</Label>
                  <Textarea
                    id="edit-address"
                    name="address"
                    defaultValue={selectedSupplier.address || ""}
                    placeholder="서울시 강남구..."
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-certifications">인증서</Label>
                  <Textarea
                    id="edit-certifications"
                    name="certifications"
                    defaultValue={selectedSupplier.certifications || ""}
                    placeholder="HACCP, ISO 22000..."
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-rating">등급</Label>
                  <Select name="rating" defaultValue={selectedSupplier.rating || ""}>
                    <SelectTrigger>
                      <SelectValue placeholder="등급 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="A">A (우수)</SelectItem>
                      <SelectItem value="B">B (양호)</SelectItem>
                      <SelectItem value="C">C (보통)</SelectItem>
                      <SelectItem value="D">D (미흡)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsEditDialogOpen(false);
                    setSelectedSupplier(null);
                  }}
                >
                  취소
                </Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? "수정 중..." : "수정"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  
    </DashboardLayout>
  );
}

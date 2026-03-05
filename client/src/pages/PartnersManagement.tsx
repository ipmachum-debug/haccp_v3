import { useState } from "react";
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
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function PartnersManagement() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPartner, setEditingPartner] = useState<any>(null);
  const [filterType, setFilterType] = useState<"all" | "supplier" | "customer" | "subcontractor">("all");

  // 거래처 목록 조회
  const { data: partners = [], isLoading } = trpc.partners.list.useQuery(
    filterType === "all" ? undefined : { partnerType: filterType }
  );

  // 거래처 생성/수정 mutation
  const utils = trpc.useUtils();
  const createMutation = trpc.partners.create.useMutation({
    onSuccess: () => {
      utils.partners.list.invalidate();
      setIsDialogOpen(false);
      toast({ title: "거래처가 생성되었습니다." });
    },
    onError: (error) => {
      toast({ title: "오류", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = trpc.partners.update.useMutation({
    onSuccess: () => {
      utils.partners.list.invalidate();
      setIsDialogOpen(false);
      setEditingPartner(null);
      toast({ title: "거래처가 수정되었습니다." });
    },
    onError: (error) => {
      toast({ title: "오류", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = trpc.partners.delete.useMutation({
    onSuccess: () => {
      utils.partners.list.invalidate();
      toast({ title: "거래처가 삭제되었습니다." });
    },
    onError: (error) => {
      toast({ title: "오류", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      partnerType: formData.get("partnerType") as "supplier" | "customer" | "subcontractor",
      bizNo: formData.get("bizNo") as string,
      companyName: formData.get("companyName") as string,
      ceoName: formData.get("ceoName") as string || undefined,
      bizType: formData.get("bizType") as string || undefined,
      bizItem: formData.get("bizItem") as string || undefined,
      address: formData.get("address") as string || undefined,
      phone: formData.get("phone") as string || undefined,
      fax: formData.get("fax") as string || undefined,
      email: formData.get("email") as string || undefined,
      bankName: formData.get("bankName") as string || undefined,
      bankAccount: formData.get("bankAccount") as string || undefined,
    };

    if (editingPartner) {
      const { partnerType, bizNo, ...updateData } = data;
      updateMutation.mutate({ id: editingPartner.id, ...updateData });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (partner: any) => {
    setEditingPartner(partner);
    setIsDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    if (confirm("정말 삭제하시겠습니까?")) {
      deleteMutation.mutate({ id });
    }
  };

  const getPartnerTypeLabel = (type: string) => {
    switch (type) {
      case "supplier": return "공급업체";
      case "customer": return "고객사";
      case "subcontractor": return "외주업체";
      default: return type;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Building2 className="h-8 w-8" />
            거래처 관리
          </h1>
          <p className="text-muted-foreground mt-1">
            공급업체, 고객사, 외주업체를 관리합니다
          </p>
        </div>
        <Button onClick={() => { setEditingPartner(null); setIsDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          거래처 추가
        </Button>
      </div>

      {/* 필터 */}
      <div className="mb-4">
        <Select value={filterType} onValueChange={(value: any) => setFilterType(value)}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="거래처 유형" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="supplier">공급업체</SelectItem>
            <SelectItem value="customer">고객사</SelectItem>
            <SelectItem value="subcontractor">외주업체</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 거래처 목록 */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>유형</TableHead>
              <TableHead>사업자번호</TableHead>
              <TableHead>회사명</TableHead>
              <TableHead>대표자</TableHead>
              <TableHead>연락처</TableHead>
              <TableHead>이메일</TableHead>
              <TableHead className="text-right">작업</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  로딩 중...
                </TableCell>
              </TableRow>
            ) : partners.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  등록된 거래처가 없습니다
                </TableCell>
              </TableRow>
            ) : (
              partners.map((partner: any) => (
                <TableRow key={partner.id}>
                  <TableCell>{getPartnerTypeLabel(partner.partnerType)}</TableCell>
                  <TableCell>{partner.bizNo}</TableCell>
                  <TableCell className="font-medium">{partner.companyName}</TableCell>
                  <TableCell>{partner.ceoName || "-"}</TableCell>
                  <TableCell>{partner.phone || "-"}</TableCell>
                  <TableCell>{partner.email || "-"}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(partner)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(partner.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* 거래처 추가/수정 다이얼로그 */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPartner ? "거래처 수정" : "거래처 추가"}</DialogTitle>
            <DialogDescription>
              거래처 정보를 입력하세요
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="partnerType">유형 *</Label>
                  <Select
                    name="partnerType"
                    defaultValue={editingPartner?.partnerType || "supplier"}
                    disabled={!!editingPartner}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="유형 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="supplier">공급업체</SelectItem>
                      <SelectItem value="customer">고객사</SelectItem>
                      <SelectItem value="subcontractor">외주업체</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bizNo">사업자번호 *</Label>
                  <Input
                    id="bizNo"
                    name="bizNo"
                    defaultValue={editingPartner?.bizNo}
                    placeholder="000-00-00000"
                    required
                    disabled={!!editingPartner}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="companyName">회사명 *</Label>
                  <Input
                    id="companyName"
                    name="companyName"
                    defaultValue={editingPartner?.companyName}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ceoName">대표자</Label>
                  <Input
                    id="ceoName"
                    name="ceoName"
                    defaultValue={editingPartner?.ceoName}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="bizType">업태</Label>
                  <Input
                    id="bizType"
                    name="bizType"
                    defaultValue={editingPartner?.bizType}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bizItem">업종</Label>
                  <Input
                    id="bizItem"
                    name="bizItem"
                    defaultValue={editingPartner?.bizItem}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">주소</Label>
                <Input
                  id="address"
                  name="address"
                  defaultValue={editingPartner?.address}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">전화번호</Label>
                  <Input
                    id="phone"
                    name="phone"
                    defaultValue={editingPartner?.phone}
                    placeholder="02-0000-0000"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fax">팩스</Label>
                  <Input
                    id="fax"
                    name="fax"
                    defaultValue={editingPartner?.fax}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">이메일</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  defaultValue={editingPartner?.email}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="bankName">은행명</Label>
                  <Input
                    id="bankName"
                    name="bankName"
                    defaultValue={editingPartner?.bankName}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bankAccount">계좌번호</Label>
                  <Input
                    id="bankAccount"
                    name="bankAccount"
                    defaultValue={editingPartner?.bankAccount}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                취소
              </Button>
              <Button type="submit">
                {editingPartner ? "수정" : "추가"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

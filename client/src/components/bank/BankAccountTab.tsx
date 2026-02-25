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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Edit, Trash2, Star, Loader2, Building2, CreditCard, TrendingUp, TrendingDown } from "lucide-react";
import { toast } from "sonner";

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  checking: "보통예금",
  savings: "저축예금",
  investment: "투자계좌",
  other: "기타",
};

export default function BankAccountTab() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<any>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [formData, setFormData] = useState({
    bankName: "",
    accountNo: "",
    accountName: "",
    accountType: "checking" as "checking" | "savings" | "investment" | "other",
    currency: "KRW",
    notes: "",
  });

  const utils = trpc.useUtils();

  // 계좌 목록 조회 (필터 적용)
  const { data: accountsData, isLoading } = trpc.bankAccount.list.useQuery(
    filterStatus !== "all" ? { isActive: filterStatus as "Y" | "N" } : undefined
  );
  const accounts = accountsData?.accounts || [];

  const createMutation = trpc.bankAccount.create.useMutation({
    onSuccess: () => {
      toast.success("계좌가 등록되었습니다");
      utils.bankAccount.list.invalidate();
      handleCloseDialog();
    },
    onError: (error: any) => {
      toast.error(`오류: ${error.message}`);
    },
  });

  const updateMutation = trpc.bankAccount.update.useMutation({
    onSuccess: () => {
      toast.success("계좌 정보가 수정되었습니다");
      utils.bankAccount.list.invalidate();
      handleCloseDialog();
    },
    onError: (error: any) => {
      toast.error(`오류: ${error.message}`);
    },
  });

  const deleteMutation = trpc.bankAccount.delete.useMutation({
    onSuccess: () => {
      toast.success("계좌가 비활성화되었습니다");
      utils.bankAccount.list.invalidate();
    },
    onError: (error: any) => {
      toast.error(`오류: ${error.message}`);
    },
  });

  // 통계 계산
  const stats = {
    total: accounts.length,
    active: accounts.filter((a: any) => a.isActive === "Y").length,
    inactive: accounts.filter((a: any) => a.isActive !== "Y").length,
    totalBalance: accounts.reduce((sum: number, a: any) => sum + parseFloat(a.balance || "0"), 0),
  };

  const handleOpenDialog = (account?: any) => {
    if (account) {
      setEditingAccount(account);
      setFormData({
        bankName: account.bankName || "",
        accountNo: account.accountNo || "",
        accountName: account.accountName || "",
        accountType: account.accountType || "checking",
        currency: account.currency || "KRW",
        notes: account.notes || "",
      });
    } else {
      setEditingAccount(null);
      setFormData({
        bankName: "",
        accountNo: "",
        accountName: "",
        accountType: "checking",
        currency: "KRW",
        notes: "",
      });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingAccount(null);
  };

  const handleSubmit = () => {
    if (!formData.bankName || !formData.accountNo) {
      toast.error("은행명과 계좌번호는 필수입니다");
      return;
    }

    const payload = {
      bankName: formData.bankName,
      accountNo: formData.accountNo,
      accountName: formData.accountName || undefined,
      accountType: formData.accountType,
      currency: formData.currency,
      notes: formData.notes || undefined,
    };

    if (editingAccount) {
      updateMutation.mutate({ id: editingAccount.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("이 계좌를 비활성화하시겠습니까?")) {
      deleteMutation.mutate({ id });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 통계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">전체 계좌</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}개</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">활성 계좌</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.active}개</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">비활성 계좌</CardTitle>
            <TrendingDown className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-400">{stats.inactive}개</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">총 잔액</CardTitle>
            <Building2 className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {stats.totalBalance.toLocaleString()}원
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 필터 및 액션 */}
      <div className="flex justify-between items-center">
        <div className="flex gap-2 items-center">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="상태 필터" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              <SelectItem value="Y">활성</SelectItem>
              <SelectItem value="N">비활성</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground ml-2">
            {accounts.length}개의 계좌
          </p>
        </div>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="h-4 w-4 mr-2" />
          계좌 추가
        </Button>
      </div>

      {/* 계좌 목록 테이블 */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>은행명</TableHead>
                <TableHead>계좌번호</TableHead>
                <TableHead>예금주</TableHead>
                <TableHead>계좌 유형</TableHead>
                <TableHead className="text-right">잔액</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>등록일</TableHead>
                <TableHead>메모</TableHead>
                <TableHead className="text-right">작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((account: any) => (
                <TableRow key={account.id}>
                  <TableCell className="font-medium">{account.bankName}</TableCell>
                  <TableCell className="font-mono text-sm">{account.accountNo}</TableCell>
                  <TableCell>{account.accountName || "-"}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {ACCOUNT_TYPE_LABELS[account.accountType] || account.accountType}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {parseFloat(account.balance || "0").toLocaleString()}원
                  </TableCell>
                  <TableCell>
                    <Badge variant={account.isActive === "Y" ? "default" : "secondary"}>
                      {account.isActive === "Y" ? "활성" : "비활성"}
                    </Badge>
                    {account.isPrimary === 1 && (
                      <Badge variant="outline" className="ml-1 border-yellow-500 text-yellow-600">
                        <Star className="h-3 w-3 mr-1" />주 계좌
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(account.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[150px] truncate">
                    {account.notes || "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenDialog(account)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(account.id)}
                        disabled={account.isActive === "N"}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {accounts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    등록된 계좌가 없습니다. "계좌 추가" 버튼을 눌러 새 계좌를 등록하세요.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 추가/수정 Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingAccount ? "계좌 수정" : "새 계좌 등록"}
            </DialogTitle>
            <DialogDescription>
              은행 계좌 정보를 입력하세요. * 표시는 필수 항목입니다.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="bankName">은행명 *</Label>
                <Input
                  id="bankName"
                  value={formData.bankName}
                  onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                  placeholder="예: 국민은행"
                />
              </div>
              <div>
                <Label htmlFor="accountType">계좌 유형</Label>
                <Select
                  value={formData.accountType}
                  onValueChange={(value: any) => setFormData({ ...formData, accountType: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="checking">보통예금</SelectItem>
                    <SelectItem value="savings">저축예금</SelectItem>
                    <SelectItem value="investment">투자계좌</SelectItem>
                    <SelectItem value="other">기타</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="accountNo">계좌번호 *</Label>
              <Input
                id="accountNo"
                value={formData.accountNo}
                onChange={(e) => setFormData({ ...formData, accountNo: e.target.value })}
                placeholder="예: 123-456-789012"
              />
            </div>
            <div>
              <Label htmlFor="accountName">예금주명</Label>
              <Input
                id="accountName"
                value={formData.accountName}
                onChange={(e) => setFormData({ ...formData, accountName: e.target.value })}
                placeholder="예: (주)해썹원"
              />
            </div>
            <div>
              <Label htmlFor="notes">메모</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="계좌에 대한 메모를 입력하세요 (예: 급여 계좌, 법인 운영 계좌)"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              취소
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={
                !formData.bankName ||
                !formData.accountNo ||
                createMutation.isPending ||
                updateMutation.isPending
              }
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {editingAccount ? "수정" : "등록"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

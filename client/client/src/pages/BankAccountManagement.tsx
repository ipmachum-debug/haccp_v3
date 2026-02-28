import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Edit, Trash2, TrendingUp, TrendingDown, DollarSign } from "lucide-react";
import { toast } from "sonner";

export default function BankAccountManagement() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<any>(null);
  const [filterStatus, setFilterStatus] = useState<"Y" | "N" | "all">("all");

  const { data: accounts, refetch } = trpc.bankAccount.list.useQuery({ isActive: filterStatus });
  const createMutation = trpc.bankAccount.create.useMutation();
  const updateMutation = trpc.bankAccount.update.useMutation();
  const deleteMutation = trpc.bankAccount.delete.useMutation();

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    try {
      await createMutation.mutateAsync({
        bankName: formData.get("bankName") as string,
        accountNo: formData.get("accountNo") as string,
        accountName: formData.get("accountName") as string || undefined,
        accountType: (formData.get("accountType") as any) || "checking",
        currency: "KRW",
        notes: formData.get("notes") as string || undefined,
      });
      
      toast.success("계좌가 등록되었습니다.");
      setIsCreateDialogOpen(false);
      refetch();
    } catch (error: any) {
      toast.error(error.message || "계좌 등록에 실패했습니다.");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("계좌를 비활성화하시겠습니까?")) return;
    
    try {
      await deleteMutation.mutateAsync({ id });
      toast.success("계좌가 비활성화되었습니다.");
      refetch();
    } catch (error: any) {
      toast.error(error.message || "계좌 비활성화에 실패했습니다.");
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* 헤더 */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">은행 계좌 관리</h1>
            <p className="text-gray-500 mt-1">회사의 은행 계좌를 관리합니다</p>
          </div>
          
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                계좌 추가
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>새 계좌 등록</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <Label htmlFor="bankName">은행명 *</Label>
                  <Input id="bankName" name="bankName" required placeholder="예: 국민은행" />
                </div>
                <div>
                  <Label htmlFor="accountNo">계좌번호 *</Label>
                  <Input id="accountNo" name="accountNo" required placeholder="예: 123-456-789012" />
                </div>
                <div>
                  <Label htmlFor="accountName">예금주명</Label>
                  <Input id="accountName" name="accountName" placeholder="예: (주)해썹원" />
                </div>
                <div>
                  <Label htmlFor="accountType">계좌 유형</Label>
                  <Select name="accountType" defaultValue="checking">
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
                <div>
                  <Label htmlFor="notes">메모</Label>
                  <Input id="notes" name="notes" placeholder="메모 (선택)" />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                    취소
                  </Button>
                  <Button type="submit" disabled={createMutation.isLoading}>
                    {createMutation.isLoading ? "등록 중..." : "등록"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* 필터 */}
        <div className="flex gap-2">
          <Select value={filterStatus} onValueChange={(value: any) => setFilterStatus(value)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              <SelectItem value="Y">활성</SelectItem>
              <SelectItem value="N">비활성</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 계좌 목록 */}
        <Card>
          <CardHeader>
            <CardTitle>등록된 계좌 ({accounts?.length || 0}개)</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>은행명</TableHead>
                  <TableHead>계좌번호</TableHead>
                  <TableHead>예금주</TableHead>
                  <TableHead>계좌 유형</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>등록일</TableHead>
                  <TableHead className="text-right">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-gray-500 py-8">
                      등록된 계좌가 없습니다
                    </TableCell>
                  </TableRow>
                ) : (
                  accounts?.map((account: any) => (
                    <TableRow key={account.id}>
                      <TableCell className="font-medium">{account.bankName}</TableCell>
                      <TableCell>{account.accountNo}</TableCell>
                      <TableCell>{account.accountName || "-"}</TableCell>
                      <TableCell>
                        {account.accountType === "checking" && "보통예금"}
                        {account.accountType === "savings" && "저축예금"}
                        {account.accountType === "investment" && "투자계좌"}
                        {account.accountType === "other" && "기타"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={account.isActive === "Y" ? "default" : "secondary"}>
                          {account.isActive === "Y" ? "활성" : "비활성"}
                        </Badge>
                      </TableCell>
                      <TableCell>{new Date(account.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => window.location.href = `/finance/bank-transactions?accountId=${account.id}`}
                          >
                            거래내역
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDelete(account.id)}
                            disabled={account.isActive === "N"}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Edit, Trash2, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function BankMatchingRuleManagement() {
  const { toast } = useToast();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedRule, setSelectedRule] = useState<any>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    ruleType: "keyword" as "keyword" | "amount" | "pattern" | "combined",
    keywordPattern: "",
    amountMin: "",
    amountMax: "",
    regexPattern: "",
    accountingAccountId: "",
    priority: "5",
    isActive: true,
  });

  // Queries
  const { data: rules, refetch: refetchRules } = trpc.matchingRules.list.useQuery();
  const { data: accounts } = trpc.accountingAccounts.list.useQuery();

  // Mutations
  const createRule = trpc.matchingRules.create.useMutation({
    onSuccess: () => {
      toast({ title: "매칭 규칙이 생성되었습니다." });
      refetchRules();
      setIsAddDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({ title: "오류", description: error.message, variant: "destructive" });
    },
  });

  const updateRule = trpc.matchingRules.update.useMutation({
    onSuccess: () => {
      toast({ title: "매칭 규칙이 수정되었습니다." });
      refetchRules();
      setIsEditDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({ title: "오류", description: error.message, variant: "destructive" });
    },
  });

  const deleteRule = trpc.matchingRules.delete.useMutation({
    onSuccess: () => {
      toast({ title: "매칭 규칙이 삭제되었습니다." });
      refetchRules();
    },
    onError: (error: any) => {
      toast({ title: "오류", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      ruleType: "keyword",
      keywordPattern: "",
      amountMin: "",
      amountMax: "",
      regexPattern: "",
      accountingAccountId: "",
      priority: "5",
      isActive: true,
    });
    setSelectedRule(null);
  };

  const handleAdd = () => {
    resetForm();
    setIsAddDialogOpen(true);
  };

  const handleEdit = (rule: any) => {
    setSelectedRule(rule);
    setFormData({
      name: rule.name,
      ruleType: rule.ruleType,
      keywordPattern: rule.keywordPattern || "",
      amountMin: rule.amountMin?.toString() || "",
      amountMax: rule.amountMax?.toString() || "",
      regexPattern: rule.regexPattern || "",
      accountingAccountId: rule.accountingAccountId?.toString() || "",
      priority: rule.priority.toString(),
      isActive: rule.isActive,
    });
    setIsEditDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    if (confirm("이 매칭 규칙을 삭제하시겠습니까?")) {
      deleteRule.mutate({ id });
    }
  };

  const handleSubmit = () => {
    const payload: any = {
      name: formData.name,
      ruleType: formData.ruleType,
      priority: parseInt(formData.priority),
      isActive: formData.isActive,
    };

    if (formData.accountingAccountId) {
      payload.accountingAccountId = parseInt(formData.accountingAccountId);
    }

    if (formData.ruleType === "keyword" && formData.keywordPattern) {
      payload.keywordPattern = formData.keywordPattern;
    }

    if (formData.ruleType === "amount") {
      if (formData.amountMin) payload.amountMin = parseFloat(formData.amountMin);
      if (formData.amountMax) payload.amountMax = parseFloat(formData.amountMax);
    }

    if (formData.ruleType === "pattern" && formData.regexPattern) {
      payload.regexPattern = formData.regexPattern;
    }

    if (selectedRule) {
      updateRule.mutate({ id: selectedRule.id, ...payload });
    } else {
      createRule.mutate(payload);
    }
  };

  const getRuleTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      keyword: "키워드",
      amount: "금액 범위",
      pattern: "정규식",
      combined: "복합",
    };
    return labels[type] || type;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>매칭 규칙 관리</CardTitle>
                <CardDescription>
                  은행 거래 내역을 자동으로 계정 과목에 매칭하는 규칙을 관리합니다.
                  키워드, 금액 범위, 정규식 패턴 등 다양한 조건을 설정할 수 있습니다.
                </CardDescription>
              </div>
              <Button onClick={handleAdd}>
                <Plus className="mr-2 h-4 w-4" />
                규칙 추가
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>규칙명</TableHead>
                  <TableHead>유형</TableHead>
                  <TableHead>조건</TableHead>
                  <TableHead>계정 과목</TableHead>
                  <TableHead>우선순위</TableHead>
                  <TableHead>매칭 통계</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead className="text-right">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules?.map((rule: any) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium">{rule.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{getRuleTypeLabel(rule.ruleType)}</Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate">
                      {rule.ruleType === "keyword" && rule.keywordPattern}
                      {rule.ruleType === "amount" && `${rule.amountMin?.toLocaleString()} ~ ${rule.amountMax?.toLocaleString()}원`}
                      {rule.ruleType === "pattern" && rule.regexPattern}
                      {rule.ruleType === "combined" && "복합 조건"}
                    </TableCell>
                    <TableCell>
                      {accounts?.find((a: any) => a.id === rule.accountingAccountId)?.name || "-"}
                    </TableCell>
                    <TableCell>{rule.priority}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-green-500" />
                        <span className="text-sm">{rule.matchCount || 0}건</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={rule.isActive ? "default" : "secondary"}>
                        {rule.isActive ? "활성" : "비활성"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(rule)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(rule.id)}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {(!rules || rules.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      등록된 매칭 규칙이 없습니다.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Add/Edit Dialog */}
        <Dialog open={isAddDialogOpen || isEditDialogOpen} onOpenChange={(open) => {
          if (!open) {
            setIsAddDialogOpen(false);
            setIsEditDialogOpen(false);
            resetForm();
          }
        }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{selectedRule ? "매칭 규칙 수정" : "매칭 규칙 추가"}</DialogTitle>
              <DialogDescription>
                거래 내역을 자동으로 매칭할 규칙을 설정합니다.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">규칙명 *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="예: 급여 자동 매칭"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="ruleType">규칙 유형 *</Label>
                <Select value={formData.ruleType} onValueChange={(value: any) => setFormData({ ...formData, ruleType: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="keyword">키워드 매칭</SelectItem>
                    <SelectItem value="amount">금액 범위 매칭</SelectItem>
                    <SelectItem value="pattern">정규식 패턴 매칭</SelectItem>
                    <SelectItem value="combined">복합 조건 매칭</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.ruleType === "keyword" && (
                <div className="grid gap-2">
                  <Label htmlFor="keywordPattern">키워드 패턴 *</Label>
                  <Input
                    id="keywordPattern"
                    value={formData.keywordPattern}
                    onChange={(e) => setFormData({ ...formData, keywordPattern: e.target.value })}
                    placeholder="예: 급여, 월급, 임금"
                  />
                  <p className="text-sm text-muted-foreground">
                    쉼표(,)로 구분하여 여러 키워드를 입력할 수 있습니다.
                  </p>
                </div>
              )}

              {formData.ruleType === "amount" && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="amountMin">최소 금액</Label>
                    <Input
                      id="amountMin"
                      type="number"
                      value={formData.amountMin}
                      onChange={(e) => setFormData({ ...formData, amountMin: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="amountMax">최대 금액</Label>
                    <Input
                      id="amountMax"
                      type="number"
                      value={formData.amountMax}
                      onChange={(e) => setFormData({ ...formData, amountMax: e.target.value })}
                      placeholder="10000000"
                    />
                  </div>
                </div>
              )}

              {formData.ruleType === "pattern" && (
                <div className="grid gap-2">
                  <Label htmlFor="regexPattern">정규식 패턴 *</Label>
                  <Textarea
                    id="regexPattern"
                    value={formData.regexPattern}
                    onChange={(e) => setFormData({ ...formData, regexPattern: e.target.value })}
                    placeholder="예: ^급여.*$"
                  />
                  <p className="text-sm text-muted-foreground">
                    JavaScript 정규식 형식으로 입력합니다.
                  </p>
                </div>
              )}

              <div className="grid gap-2">
                <Label htmlFor="accountingAccountId">매칭할 계정 과목</Label>
                <Select value={formData.accountingAccountId} onValueChange={(value) => setFormData({ ...formData, accountingAccountId: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="계정 과목 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts?.map((account: any) => (
                      <SelectItem key={account.id} value={account.id.toString()}>
                        {account.code} - {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="priority">우선순위 (1-10)</Label>
                <Input
                  id="priority"
                  type="number"
                  min="1"
                  max="10"
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                />
                <p className="text-sm text-muted-foreground">
                  숫자가 작을수록 우선순위가 높습니다.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="h-4 w-4"
                />
                <Label htmlFor="isActive">규칙 활성화</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setIsAddDialogOpen(false);
                setIsEditDialogOpen(false);
                resetForm();
              }}>
                취소
              </Button>
              <Button onClick={handleSubmit}>
                {selectedRule ? "수정" : "추가"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}

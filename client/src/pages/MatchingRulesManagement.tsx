import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Sparkles } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";

type RuleType = "keyword" | "amount" | "pattern";
type TargetType = "partner" | "account" | "both";

interface MatchingRule {
  id: number;
  name: string;
  ruleType: RuleType;
  keyword: string | null;
  conditions: Record<string, any> | null;
  targetType: TargetType;
  targetPartnerId: number | null;
  targetAccountId: number | null;
  priority: number;
  weight: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface FormData {
  name: string;
  ruleType: RuleType;
  keyword: string;
  conditions: string; // JSON string
  targetType: TargetType;
  targetPartnerId: string;
  targetAccountId: string;
  priority: number;
  weight: number;
  isActive: boolean;
}

export default function MatchingRulesManagement() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<MatchingRule | null>(null);
  const [formData, setFormData] = useState<FormData>({
    name: "",
    ruleType: "keyword",
    keyword: "",
    conditions: "{}",
    targetType: "partner",
    targetPartnerId: "",
    targetAccountId: "",
    priority: 500,
    weight: 5,
    isActive: true,
  });

  const utils = trpc.useUtils();
  const { data: rules = [], isLoading } = trpc.matchingRules.list.useQuery();

  const createMutation = trpc.matchingRules.create.useMutation({
    onSuccess: () => {
      toast.success("매칭 규칙이 생성되었습니다");
      utils.matchingRules.list.invalidate();
      handleCloseDialog();
    },
    onError: (error) => {
      toast.error(`생성 실패: ${error.message}`);
    },
  });

  const updateMutation = trpc.matchingRules.update.useMutation({
    onSuccess: () => {
      toast.success("매칭 규칙이 수정되었습니다");
      utils.matchingRules.list.invalidate();
      handleCloseDialog();
    },
    onError: (error) => {
      toast.error(`수정 실패: ${error.message}`);
    },
  });

  const deleteMutation = trpc.matchingRules.delete.useMutation({
    onSuccess: () => {
      toast.success("매칭 규칙이 삭제되었습니다");
      utils.matchingRules.list.invalidate();
    },
    onError: (error) => {
      toast.error(`삭제 실패: ${error.message}`);
    },
  });

  const handleOpenDialog = (rule?: MatchingRule) => {
    if (rule) {
      setEditingRule(rule);
      setFormData({
        name: rule.name,
        ruleType: rule.ruleType,
        keyword: rule.keyword || "",
        conditions: JSON.stringify(rule.conditions || {}, null, 2),
        targetType: rule.targetType,
        targetPartnerId: rule.targetPartnerId?.toString() || "",
        targetAccountId: rule.targetAccountId?.toString() || "",
        priority: rule.priority,
        weight: rule.weight,
        isActive: rule.isActive,
      });
    } else {
      setEditingRule(null);
      setFormData({
        name: "",
        ruleType: "keyword",
        keyword: "",
        conditions: "{}",
        targetType: "partner",
        targetPartnerId: "",
        targetAccountId: "",
        priority: 500,
        weight: 5,
        isActive: true,
      });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingRule(null);
  };

  const handleSubmit = () => {
    // JSON 유효성 검사
    let parsedConditions: Record<string, any> = {};
    try {
      parsedConditions = JSON.parse(formData.conditions);
    } catch (error) {
      toast.error("조건(JSON)이 올바르지 않습니다");
      return;
    }

    const payload = {
      name: formData.name,
      ruleType: formData.ruleType,
      keyword: formData.keyword || undefined,
      conditions: parsedConditions,
      targetType: formData.targetType,
      targetPartnerId: formData.targetPartnerId ? parseInt(formData.targetPartnerId) : undefined,
      targetAccountId: formData.targetAccountId ? parseInt(formData.targetAccountId) : undefined,
      priority: formData.priority,
      weight: formData.weight,
      isActive: formData.isActive,
    };

    if (editingRule) {
      updateMutation.mutate({ id: editingRule.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("정말로 이 매칭 규칙을 삭제하시겠습니까?")) {
      deleteMutation.mutate({ id });
    }
  };

  const getRuleTypeLabel = (ruleType: RuleType) => {
    const labels: Record<RuleType, string> = {
      keyword: "키워드",
      amount: "금액",
      pattern: "패턴",
    };
    return labels[ruleType];
  };

  const getTargetTypeLabel = (targetType: TargetType) => {
    const labels: Record<TargetType, string> = {
      partner: "거래처",
      account: "계정과목",
      both: "둘 다",
    };
    return labels[targetType];
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-6 w-6 text-purple-500" />
                  매칭 규칙 관리
                </CardTitle>
                <CardDescription>
                  은행 거래 자동 매칭을 위한 규칙을 관리합니다
                </CardDescription>
              </div>
              <Button onClick={() => handleOpenDialog()}>
                <Plus className="mr-2 h-4 w-4" />
                규칙 추가
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">로딩 중...</div>
            ) : rules.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                등록된 매칭 규칙이 없습니다
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>규칙 이름</TableHead>
                    <TableHead>규칙 유형</TableHead>
                    <TableHead>키워드</TableHead>
                    <TableHead>대상 유형</TableHead>
                    <TableHead>우선순위</TableHead>
                    <TableHead>가중치</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead>작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((rule) => (
                    <TableRow key={rule.id}>
                      <TableCell className="font-medium">{rule.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{getRuleTypeLabel(rule.ruleType)}</Badge>
                      </TableCell>
                      <TableCell>{rule.keyword || "-"}</TableCell>
                      <TableCell>{getTargetTypeLabel(rule.targetType)}</TableCell>
                      <TableCell>{rule.priority}</TableCell>
                      <TableCell>{rule.weight}</TableCell>
                      <TableCell>
                        <Badge variant={rule.isActive ? "default" : "secondary"}>
                          {rule.isActive ? "활성" : "비활성"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenDialog(rule)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(rule.id)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* 추가/수정 Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingRule ? "매칭 규칙 수정" : "매칭 규칙 추가"}
              </DialogTitle>
              <DialogDescription>
                은행 거래 자동 매칭을 위한 규칙을 설정하세요
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              {/* 규칙 이름 */}
              <div>
                <Label htmlFor="name">규칙 이름 *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="예: 네이버 광고비"
                />
              </div>

              {/* 규칙 유형 */}
              <div>
                <Label htmlFor="ruleType">규칙 유형 *</Label>
                <Select
                  value={formData.ruleType}
                  onValueChange={(value) =>
                    setFormData({ ...formData, ruleType: value as RuleType })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="keyword">키워드</SelectItem>
                    <SelectItem value="amount">금액</SelectItem>
                    <SelectItem value="pattern">패턴</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* 키워드 */}
              <div>
                <Label htmlFor="keyword">키워드</Label>
                <Input
                  id="keyword"
                  value={formData.keyword}
                  onChange={(e) => setFormData({ ...formData, keyword: e.target.value })}
                  placeholder="예: 네이버, 카카오"
                />
              </div>

              {/* 조건 (JSON) */}
              <div>
                <Label htmlFor="conditions">조건 (JSON)</Label>
                <Textarea
                  id="conditions"
                  value={formData.conditions}
                  onChange={(e) => setFormData({ ...formData, conditions: e.target.value })}
                  placeholder='{"field": "counterpartyText", "operator": "contains", "value": "네이버"}'
                  rows={5}
                  className="font-mono text-sm"
                />
              </div>

              {/* 대상 유형 */}
              <div>
                <Label htmlFor="targetType">대상 유형 *</Label>
                <Select
                  value={formData.targetType}
                  onValueChange={(value) =>
                    setFormData({ ...formData, targetType: value as TargetType })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="partner">거래처</SelectItem>
                    <SelectItem value="account">계정과목</SelectItem>
                    <SelectItem value="both">둘 다</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* 거래처 ID */}
              <div>
                <Label htmlFor="targetPartnerId">거래처 ID</Label>
                <Input
                  id="targetPartnerId"
                  type="number"
                  value={formData.targetPartnerId}
                  onChange={(e) =>
                    setFormData({ ...formData, targetPartnerId: e.target.value })
                  }
                  placeholder="거래처 ID"
                />
              </div>

              {/* 계정과목 ID */}
              <div>
                <Label htmlFor="targetAccountId">계정과목 ID</Label>
                <Input
                  id="targetAccountId"
                  type="number"
                  value={formData.targetAccountId}
                  onChange={(e) =>
                    setFormData({ ...formData, targetAccountId: e.target.value })
                  }
                  placeholder="계정과목 ID"
                />
              </div>

              {/* 우선순위 */}
              <div>
                <Label htmlFor="priority">우선순위 (0-1000) *</Label>
                <Input
                  id="priority"
                  type="number"
                  min={0}
                  max={1000}
                  value={formData.priority}
                  onChange={(e) =>
                    setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })
                  }
                />
              </div>

              {/* 가중치 */}
              <div>
                <Label htmlFor="weight">가중치 (0-10) *</Label>
                <Input
                  id="weight"
                  type="number"
                  min={0}
                  max={10}
                  value={formData.weight}
                  onChange={(e) =>
                    setFormData({ ...formData, weight: parseInt(e.target.value) || 0 })
                  }
                />
              </div>

              {/* 상태 */}
              <div>
                <Label htmlFor="isActive">상태 *</Label>
                <Select
                  value={formData.isActive ? "active" : "inactive"}
                  onValueChange={(value) =>
                    setFormData({ ...formData, isActive: value === "active" })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">활성</SelectItem>
                    <SelectItem value="inactive">비활성</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleCloseDialog}>
                취소
              </Button>
              <Button onClick={handleSubmit}>
                {editingRule ? "수정" : "추가"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}

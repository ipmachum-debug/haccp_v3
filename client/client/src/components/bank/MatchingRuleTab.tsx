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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Plus,
  Edit,
  Trash2,
  Loader2,
  Settings2,
  Zap,
  Target,
  ListFilter,
  ToggleLeft,
  ArrowUpDown,
  Info,
} from "lucide-react";
import { toast } from "sonner";

const RULE_TYPE_LABELS: Record<string, string> = {
  keyword: "키워드 매칭",
  amount: "금액 패턴",
  pattern: "복합 패턴",
};

const RULE_TYPE_DESCRIPTIONS: Record<string, string> = {
  keyword: "거래 내역의 적요(메모)에 특정 키워드가 포함되면 매칭합니다.",
  amount: "특정 금액 범위에 해당하는 거래를 자동 매칭합니다.",
  pattern: "키워드 + 금액 + 거래유형 등 복합 조건으로 매칭합니다.",
};

const TARGET_TYPE_LABELS: Record<string, string> = {
  partner: "거래처",
  account: "계정과목",
  both: "거래처 + 계정과목",
};

export default function MatchingRuleTab() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<any>(null);
  const [formData, setFormData] = useState({
    ruleType: "keyword" as "keyword" | "amount" | "pattern",
    priority: 500,
    weight: 5,
    isActive: true,
    // conditions JSON 필드 내부
    keyword: "",
    minAmount: "",
    maxAmount: "",
    transactionType: "all",
    // actions JSON 필드 내부
    targetType: "account" as "partner" | "account" | "both",
    targetPartnerId: "",
    targetAccountId: "",
    ruleName: "",
  });

  const utils = trpc.useUtils();

  // 매칭 규칙 목록
  const { data: rules, isLoading } = trpc.matchingRules.list.useQuery();

  const createMutation = trpc.matchingRules.create.useMutation({
    onSuccess: () => {
      toast.success("매칭 규칙이 생성되었습니다");
      utils.matchingRules.list.invalidate();
      handleCloseDialog();
    },
    onError: (error: any) => {
      toast.error(`오류: ${error.message}`);
    },
  });

  const updateMutation = trpc.matchingRules.update.useMutation({
    onSuccess: () => {
      toast.success("매칭 규칙이 수정되었습니다");
      utils.matchingRules.list.invalidate();
      handleCloseDialog();
    },
    onError: (error: any) => {
      toast.error(`오류: ${error.message}`);
    },
  });

  const deleteMutation = trpc.matchingRules.delete.useMutation({
    onSuccess: () => {
      toast.success("매칭 규칙이 삭제되었습니다");
      utils.matchingRules.list.invalidate();
    },
    onError: (error: any) => {
      toast.error(`오류: ${error.message}`);
    },
  });

  // 규칙 활성/비활성 토글
  const handleToggleActive = (rule: any) => {
    updateMutation.mutate({
      id: rule.id,
      isActive: !rule.isActive,
    });
  };

  // 통계 계산
  const stats = {
    total: (rules || []).length,
    active: (rules || []).filter((r: any) => r.isActive === 1 || r.isActive === true).length,
    inactive: (rules || []).filter((r: any) => r.isActive === 0 || r.isActive === false).length,
    byType: {
      keyword: (rules || []).filter((r: any) => r.ruleType === "keyword").length,
      amount: (rules || []).filter((r: any) => r.ruleType === "amount").length,
      pattern: (rules || []).filter((r: any) => r.ruleType === "pattern").length,
    },
  };

  // conditions/actions JSON 파싱
  const parseConditions = (conditionsStr: string) => {
    try {
      return typeof conditionsStr === "string" ? JSON.parse(conditionsStr) : conditionsStr || {};
    } catch {
      return {};
    }
  };

  const parseActions = (actionsStr: string) => {
    try {
      return typeof actionsStr === "string" ? JSON.parse(actionsStr) : actionsStr || {};
    } catch {
      return {};
    }
  };

  const handleOpenDialog = (rule?: any) => {
    if (rule) {
      const conditions = parseConditions(rule.conditions);
      const actions = parseActions(rule.actions);
      setEditingRule(rule);
      setFormData({
        ruleType: rule.ruleType || "keyword",
        priority: rule.priority || 500,
        weight: parseFloat(rule.weight) || 5,
        isActive: rule.isActive === 1 || rule.isActive === true,
        keyword: conditions.keyword || "",
        minAmount: conditions.minAmount?.toString() || "",
        maxAmount: conditions.maxAmount?.toString() || "",
        transactionType: conditions.transactionType || "all",
        targetType: actions.targetType || "account",
        targetPartnerId: actions.targetPartnerId?.toString() || "",
        targetAccountId: actions.targetAccountId?.toString() || "",
        ruleName: conditions.name || actions.name || "",
      });
    } else {
      setEditingRule(null);
      setFormData({
        ruleType: "keyword",
        priority: 500,
        weight: 5,
        isActive: true,
        keyword: "",
        minAmount: "",
        maxAmount: "",
        transactionType: "all",
        targetType: "account",
        targetPartnerId: "",
        targetAccountId: "",
        ruleName: "",
      });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingRule(null);
  };

  const handleSubmit = () => {
    if (!formData.ruleName) {
      toast.error("규칙 이름을 입력해주세요");
      return;
    }

    // conditions JSON 구성
    const conditions: Record<string, any> = {
      name: formData.ruleName,
    };
    if (formData.keyword) conditions.keyword = formData.keyword;
    if (formData.minAmount) conditions.minAmount = parseFloat(formData.minAmount);
    if (formData.maxAmount) conditions.maxAmount = parseFloat(formData.maxAmount);
    if (formData.transactionType !== "all") conditions.transactionType = formData.transactionType;

    // actions JSON 구성
    const actions: Record<string, any> = {
      name: formData.ruleName,
      targetType: formData.targetType,
    };
    if (formData.targetPartnerId) actions.targetPartnerId = parseInt(formData.targetPartnerId);
    if (formData.targetAccountId) actions.targetAccountId = parseInt(formData.targetAccountId);

    const payload: any = {
      name: formData.ruleName,
      ruleType: formData.ruleType,
      priority: formData.priority,
      weight: formData.weight,
      isActive: formData.isActive,
      conditions,
      targetType: formData.targetType,
    };

    if (formData.keyword) payload.keyword = formData.keyword;
    if (formData.targetPartnerId) payload.targetPartnerId = parseInt(formData.targetPartnerId);
    if (formData.targetAccountId) payload.targetAccountId = parseInt(formData.targetAccountId);

    if (editingRule) {
      updateMutation.mutate({ id: editingRule.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("이 매칭 규칙을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) {
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
      {/* 안내 문구 */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="flex items-start gap-3 pt-4">
          <Info className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">매칭 규칙이란?</p>
            <p>
              은행 거래 내역을 자동으로 분류하기 위한 규칙입니다. 
              키워드, 금액 범위, 거래 패턴 등의 조건을 설정하면, 
              "AI 자동 매칭" 실행 시 이 규칙에 따라 거래가 자동으로 계정과목/거래처에 매칭됩니다.
              우선순위(숫자가 작을수록 먼저)와 가중치(높을수록 신뢰도 높음)를 조정하여 매칭 정확도를 높일 수 있습니다.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 통계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">전체 규칙</CardTitle>
            <Settings2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}개</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">활성 규칙</CardTitle>
            <Zap className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.active}개</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">비활성 규칙</CardTitle>
            <ToggleLeft className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-400">{stats.inactive}개</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">유형별</CardTitle>
            <ListFilter className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-xs space-y-1">
              <p>키워드: {stats.byType.keyword}개</p>
              <p>금액: {stats.byType.amount}개</p>
              <p>복합: {stats.byType.pattern}개</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 액션 */}
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          {(rules || []).length}개의 매칭 규칙 (우선순위 순)
        </p>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="h-4 w-4 mr-2" />
          규칙 추가
        </Button>
      </div>

      {/* 규칙 목록 */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">활성</TableHead>
                <TableHead>규칙 이름</TableHead>
                <TableHead>유형</TableHead>
                <TableHead>조건</TableHead>
                <TableHead>대상</TableHead>
                <TableHead className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <ArrowUpDown className="h-3 w-3" />
                    우선순위
                  </div>
                </TableHead>
                <TableHead className="text-center">가중치</TableHead>
                <TableHead className="text-right">작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rules || []).map((rule: any) => {
                const conditions = parseConditions(rule.conditions);
                const actions = parseActions(rule.actions);
                const isActive = rule.isActive === 1 || rule.isActive === true;
                const ruleName = conditions.name || actions.name || `규칙 #${rule.id}`;

                return (
                  <TableRow key={rule.id} className={!isActive ? "opacity-50" : ""}>
                    <TableCell>
                      <Switch
                        checked={isActive}
                        onCheckedChange={() => handleToggleActive(rule)}
                        disabled={updateMutation.isPending}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{ruleName}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {RULE_TYPE_LABELS[rule.ruleType] || rule.ruleType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px]">
                      {conditions.keyword && (
                        <span className="block">키워드: "{conditions.keyword}"</span>
                      )}
                      {conditions.minAmount && (
                        <span className="block">최소: {Number(conditions.minAmount).toLocaleString()}원</span>
                      )}
                      {conditions.maxAmount && (
                        <span className="block">최대: {Number(conditions.maxAmount).toLocaleString()}원</span>
                      )}
                      {conditions.transactionType && conditions.transactionType !== "all" && (
                        <span className="block">유형: {conditions.transactionType === "deposit" ? "입금" : "출금"}</span>
                      )}
                      {!conditions.keyword && !conditions.minAmount && !conditions.maxAmount && "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        <Target className="h-3 w-3 mr-1" />
                        {TARGET_TYPE_LABELS[actions.targetType] || "미지정"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center font-mono">{rule.priority}</TableCell>
                    <TableCell className="text-center font-mono">{parseFloat(rule.weight).toFixed(1)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenDialog(rule)}
                        >
                          <Edit className="h-4 w-4" />
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
                );
              })}
              {(!rules || rules.length === 0) && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    등록된 매칭 규칙이 없습니다. "규칙 추가" 버튼을 눌러 새 규칙을 등록하세요.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 추가/수정 Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingRule ? "매칭 규칙 수정" : "새 매칭 규칙 생성"}
            </DialogTitle>
            <DialogDescription>
              거래 내역 자동 매칭에 사용할 규칙을 설정합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {/* 규칙 이름 */}
            <div>
              <Label htmlFor="ruleName">규칙 이름 *</Label>
              <Input
                id="ruleName"
                value={formData.ruleName}
                onChange={(e) => setFormData({ ...formData, ruleName: e.target.value })}
                placeholder="예: 네이버 광고 수익 매칭"
              />
            </div>

            {/* 규칙 유형 */}
            <div>
              <Label>규칙 유형 *</Label>
              <Select
                value={formData.ruleType}
                onValueChange={(value: any) => setFormData({ ...formData, ruleType: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="keyword">키워드 매칭</SelectItem>
                  <SelectItem value="amount">금액 패턴</SelectItem>
                  <SelectItem value="pattern">복합 패턴</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {RULE_TYPE_DESCRIPTIONS[formData.ruleType]}
              </p>
            </div>

            {/* 조건 설정 */}
            <div className="border rounded-lg p-4 space-y-3">
              <h4 className="text-sm font-medium">조건 설정</h4>

              {(formData.ruleType === "keyword" || formData.ruleType === "pattern") && (
                <div>
                  <Label htmlFor="keyword">키워드</Label>
                  <Input
                    id="keyword"
                    value={formData.keyword}
                    onChange={(e) => setFormData({ ...formData, keyword: e.target.value })}
                    placeholder="예: 네이버, 카카오, 급여"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    거래 적요에 이 키워드가 포함되면 매칭됩니다.
                  </p>
                </div>
              )}

              {(formData.ruleType === "amount" || formData.ruleType === "pattern") && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="minAmount">최소 금액</Label>
                    <Input
                      id="minAmount"
                      type="number"
                      value={formData.minAmount}
                      onChange={(e) => setFormData({ ...formData, minAmount: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label htmlFor="maxAmount">최대 금액</Label>
                    <Input
                      id="maxAmount"
                      type="number"
                      value={formData.maxAmount}
                      onChange={(e) => setFormData({ ...formData, maxAmount: e.target.value })}
                      placeholder="무제한"
                    />
                  </div>
                </div>
              )}

              {formData.ruleType === "pattern" && (
                <div>
                  <Label>거래 유형</Label>
                  <Select
                    value={formData.transactionType}
                    onValueChange={(value) => setFormData({ ...formData, transactionType: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">전체</SelectItem>
                      <SelectItem value="deposit">입금</SelectItem>
                      <SelectItem value="withdrawal">출금</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* 매칭 대상 */}
            <div className="border rounded-lg p-4 space-y-3">
              <h4 className="text-sm font-medium">매칭 대상</h4>
              <div>
                <Label>대상 유형</Label>
                <Select
                  value={formData.targetType}
                  onValueChange={(value: any) => setFormData({ ...formData, targetType: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="partner">거래처</SelectItem>
                    <SelectItem value="account">계정과목</SelectItem>
                    <SelectItem value="both">거래처 + 계정과목</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {(formData.targetType === "partner" || formData.targetType === "both") && (
                <div>
                  <Label htmlFor="targetPartnerId">거래처 ID</Label>
                  <Input
                    id="targetPartnerId"
                    type="number"
                    value={formData.targetPartnerId}
                    onChange={(e) => setFormData({ ...formData, targetPartnerId: e.target.value })}
                    placeholder="거래처 ID"
                  />
                </div>
              )}

              {(formData.targetType === "account" || formData.targetType === "both") && (
                <div>
                  <Label htmlFor="targetAccountId">계정과목 ID</Label>
                  <Input
                    id="targetAccountId"
                    type="number"
                    value={formData.targetAccountId}
                    onChange={(e) => setFormData({ ...formData, targetAccountId: e.target.value })}
                    placeholder="계정과목 ID"
                  />
                </div>
              )}
            </div>

            {/* 우선순위 & 가중치 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="priority">우선순위 (0~1000, 낮을수록 먼저)</Label>
                <Input
                  id="priority"
                  type="number"
                  min={0}
                  max={1000}
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label htmlFor="weight">가중치 (0~10, 높을수록 신뢰도 높음)</Label>
                <Input
                  id="weight"
                  type="number"
                  min={0}
                  max={10}
                  step={0.5}
                  value={formData.weight}
                  onChange={(e) => setFormData({ ...formData, weight: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>

            {/* 활성 상태 */}
            <div className="flex items-center gap-3">
              <Switch
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
              />
              <Label>규칙 활성화</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              취소
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={
                !formData.ruleName ||
                createMutation.isPending ||
                updateMutation.isPending
              }
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {editingRule ? "수정" : "생성"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState, useMemo } from "react";
import { trpc } from "../../lib/trpc";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "../../components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../../components/ui/sheet";
import {
  Plus,
  Pencil,
  Trash2,
  FolderTree,
  List,
  ChevronDown,
  ChevronRight,
  Search,
  Download,
  Upload,
  Layers,
  CircleDot,
  Building2,
  Wallet,
  TrendingUp,
  Receipt,
} from "lucide-react";
import { toast } from "sonner";

import { useIndustryLabel } from "@/hooks/useIndustryFeatures";
// ===== 5분류 체계 (고정, 추가/삭제 불가) =====
// 2026-04-19 분해: 상수/타입 → _accountingAccounts/constants, 구조탭 → AccountStructureTab
import {
  type AccountCategory,
  type AccountCategoryRow,
  type AccountingAccountRow,
  type AccountingStats,
  FIXED_CATEGORIES,
  categoryLabels,
  categoryBadgeColors,
  majorToCategory,
  categoryToMajor,
} from "./_accountingAccounts/constants";
import { AccountStructureTab, SideSheetAccountList } from "./_accountingAccounts/AccountStructureTab";
export default function AccountingAccounts() {
  const L = useIndustryLabel();
  const [activeTab, setActiveTab] = useState("structure");

  // P6: 성능 개선 — 공유 데이터를 부모에서 한 번만 조회하고 자식 탭에 전달
  // 이전: AccountStructureTab + AccountListTab 각각 3개 API 호출 (list, getAll, getStats) = 6개 중복 호출
  // 이후: 부모에서 3개 API 호출 → props로 전달
  // ★ 2026-04-15: staleTime 5분 + refetchOnMount=false + refetchOnWindowFocus=false
  //   계정 구조는 거의 변경되지 않으므로 장기 캐시로 탭 전환/재진입 시 즉시 렌더
  //   이전: 10초 로딩 (매번 fresh fetch)
  const longCacheOptions = {
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    refetchOnMount: false as const,
    refetchOnWindowFocus: false as const,
    refetchOnReconnect: false as const,
  };
  const { data: categories = [], isLoading: catLoading, refetch: refetchCategories } = trpc.accountCategories.getAll.useQuery(
    undefined,
    longCacheOptions
  );
  const { data: allAccounts = [], isLoading: accLoading } = trpc.accountingAccounts.list.useQuery(
    {},
    longCacheOptions
  );
  const { data: stats } = trpc.accountingAccounts.getStats.useQuery(
    undefined,
    longCacheOptions
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">계정 과목 관리</h1>
            <p className="text-muted-foreground mt-2">
              5분류 체계 기반의 계정 구조와 세부 계정 과목을 관리합니다
            </p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="structure" className="gap-2">
              <FolderTree className="h-4 w-4" />
              계정 구조 (5분류)
            </TabsTrigger>
            <TabsTrigger value="list" className="gap-2">
              <List className="h-4 w-4" />
              계정 과목 목록
            </TabsTrigger>
          </TabsList>

          <TabsContent value="structure" className="mt-6">
            <AccountStructureTab
              categories={categories}
              catLoading={catLoading}
              refetchCategories={refetchCategories}
              allAccounts={allAccounts}
              stats={stats}
            />
          </TabsContent>
          <TabsContent value="list" className="mt-6">
            <AccountListTab
              categories={categories}
              allAccounts={allAccounts}
              accLoading={accLoading}
              stats={stats}
            />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

function AccountListTab({
  categories,
  allAccounts,
  accLoading,
  stats,
}: {
  categories: AccountCategoryRow[];
  allAccounts: AccountingAccountRow[];
  accLoading: boolean;
  stats: AccountingStats | undefined;
}) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<any>(null);
  const [filterCategory, setFilterCategory] = useState<AccountCategory | "ALL">("ALL");
  const [filterActive, setFilterActive] = useState<"ALL" | "Y" | "N">("Y");
  const [searchText, setSearchText] = useState("");

  const [formData, setFormData] = useState({
    code: "",
    name: "",
    category: "expenses" as AccountCategory,
    accountCategoryId: undefined as number | undefined,
    description: "",
    isActive: "Y" as "Y" | "N",
  });

  const utils = trpc.useUtils();

  // P6: 필터된 계정 목록 — 부모에서 전달받은 allAccounts를 클라이언트 필터링
  const accounts = useMemo(() => {
    return allAccounts.filter((acc: AccountingAccountRow) => {
      if (filterCategory !== "ALL" && acc.category !== filterCategory) return false;
      if (filterActive !== "ALL" && acc.isActive !== filterActive) return false;
      return true;
    });
  }, [allAccounts, filterCategory, filterActive]);

  const isLoading = accLoading;

  // 상위계정 ID → 이름 매핑
  const groupNameMap = useMemo(() => {
    const map: Record<number, string> = {};
    (categories || []).forEach((cat: AccountCategoryRow) => {
      map[cat.id] = cat.name;
    });
    return map;
  }, [categories]);

  // 카테고리별 상위계정 필터
  const filteredGroups = useMemo(() => {
    const cat = formData.category;
    const majorLabel = categoryToMajor[cat];
    return (categories || []).filter((c: AccountCategoryRow) => c.majorCategory === majorLabel);
  }, [categories, formData.category]);

  // 검색 필터
  const filteredAccounts = useMemo(() => {
    if (!searchText.trim()) return accounts;
    const lower = searchText.toLowerCase();
    return accounts.filter(
      (acc: AccountingAccountRow) =>
        acc.code?.toLowerCase().includes(lower) ||
        acc.name?.toLowerCase().includes(lower) ||
        acc.description?.toLowerCase().includes(lower)
    );
  }, [accounts, searchText]);

  const createMutation = trpc.accountingAccounts.create.useMutation({
    onSuccess: () => {
      utils.accountingAccounts.list.invalidate();
      utils.accountingAccounts.getStats.invalidate();
      toast.success("계정 과목이 생성되었습니다.");
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error: { message: string }) => toast.error(`생성 실패: ${error.message}`),
  });

  const updateMutation = trpc.accountingAccounts.update.useMutation({
    onSuccess: () => {
      utils.accountingAccounts.list.invalidate();
      utils.accountingAccounts.getStats.invalidate();
      toast.success("계정 과목이 수정되었습니다.");
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error: { message: string }) => toast.error(`수정 실패: ${error.message}`),
  });

  const deleteMutation = trpc.accountingAccounts.delete.useMutation({
    onSuccess: () => {
      utils.accountingAccounts.list.invalidate();
      utils.accountingAccounts.getStats.invalidate();
      toast.success("계정 과목이 비활성화되었습니다.");
    },
    onError: (error: { message: string }) => toast.error(`비활성화 실패: ${error.message}`),
  });

  const resetForm = () => {
    setFormData({
      code: "",
      name: "",
      category: "expenses",
      accountCategoryId: undefined,
      description: "",
      isActive: "Y",
    });
    setEditingAccount(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingAccount) {
      updateMutation.mutate({
        id: editingAccount.id,
        code: formData.code,
        name: formData.name,
        category: formData.category,
        accountCategoryId: formData.accountCategoryId || undefined,
        description: formData.description,
        isActive: formData.isActive,
      });
    } else {
      createMutation.mutate({
        code: formData.code,
        name: formData.name,
        category: formData.category,
        accountCategoryId: formData.accountCategoryId || undefined,
        description: formData.description,
        isActive: formData.isActive,
      });
    }
  };

  const handleEdit = (account: AccountingAccountRow) => {
    setEditingAccount(account);
    setFormData({
      code: account.code,
      name: account.name,
      category: account.category as AccountCategory,
      accountCategoryId: account.accountCategoryId || undefined,
      description: account.description || "",
      isActive: account.isActive,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    if (confirm("정말 이 계정 과목을 비활성화하시겠습니까?")) {
      deleteMutation.mutate({ id });
    }
  };

  // 새 계정 추가 시 카테고리 변경 → 코드 자동 생성
  const handleCategoryChange = async (value: AccountCategory) => {
    setFormData((prev) => ({ ...prev, category: value, accountCategoryId: undefined }));
    if (!editingAccount) {
      try {
        const result = await utils.accountingAccounts.getNextCode.fetch({ category: value });
        if (result?.nextCode) {
          setFormData((prev) => ({ ...prev, code: result.nextCode, category: value, accountCategoryId: undefined }));
        }
      } catch {
        // ignore
      }
    }
  };

  const openNewDialog = async () => {
    resetForm();
    // 기본 카테고리의 다음 코드 가져오기
    try {
      const result = await utils.accountingAccounts.getNextCode.fetch({ category: "expenses" });
      if (result?.nextCode) {
        setFormData((prev) => ({ ...prev, code: result.nextCode }));
      }
    } catch {
      // ignore
    }
    setIsDialogOpen(true);
  };

  return (
    <>
      {/* 안내 */}
      <div className="bg-muted/50 border rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <List className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium">계정 과목 목록</p>
            <p className="text-xs text-muted-foreground mt-1">
              개별 계정 과목의 검색·필터·추가·수정·비활성화를 수행합니다.
              새 계정을 추가할 때는 반드시 <strong>분류(5분류)</strong>와 <strong>상위계정(그룹)</strong>을 선택해야 합니다.
            </p>
          </div>
        </div>
      </div>

      {/* 필터 + 검색 + 버튼 */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex gap-3 flex-1">
          <div className="w-40">
            <Select
              value={filterCategory}
              onValueChange={(value) => setFilterCategory(value as AccountCategory | "ALL")}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="분류(5분류)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">전체 분류</SelectItem>
                {FIXED_CATEGORIES.map((fc) => (
                  <SelectItem key={fc.key} value={fc.key}>
                    {fc.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-32">
            <Select
              value={filterActive}
              onValueChange={(value) => setFilterActive(value as "ALL" | "Y" | "N")}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="상태" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">전체 상태</SelectItem>
                <SelectItem value="Y">활성</SelectItem>
                <SelectItem value="N">비활성</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9 h-9"
              placeholder="코드, 과목명, 설명 검색..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
        </div>
        <Button size="sm" className="h-9" onClick={openNewDialog}>
          <Plus className="h-4 w-4 mr-1" />
          계정 과목 추가
        </Button>
      </div>

      {/* 요약 뱃지 */}
      {stats && (
        <div className="flex gap-2 mb-4 flex-wrap">
          <Badge variant="outline" className="text-xs">
            전체 {stats.total}개
          </Badge>
          <Badge variant="outline" className="text-xs text-green-600 border-green-300">
            활성 {stats.active}개
          </Badge>
          {FIXED_CATEGORIES.map((fc) => (
            <Badge key={fc.key} variant="outline" className={`text-xs ${categoryBadgeColors[fc.key].replace("bg-", "border-").replace("100", "300")} ${categoryBadgeColors[fc.key]}`}>
              {fc.label} {stats.byCategory[fc.key] || 0}
            </Badge>
          ))}
        </div>
      )}

      {/* 테이블 */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">코드</TableHead>
                <TableHead>계정 과목명</TableHead>
                <TableHead className="w-[80px]">분류(5분류)</TableHead>
                <TableHead>상위계정(그룹)</TableHead>
                <TableHead className="w-[60px]">상태</TableHead>
                <TableHead>설명</TableHead>
                <TableHead className="text-right w-[80px]">작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    로딩 중...
                  </TableCell>
                </TableRow>
              ) : filteredAccounts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    {searchText ? "검색 결과가 없습니다." : "등록된 계정 과목이 없습니다."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredAccounts.map((account: AccountingAccountRow) => (
                  <TableRow key={account.id}>
                    <TableCell className="font-mono text-xs">{account.code}</TableCell>
                    <TableCell className="font-medium">{account.name}</TableCell>
                    <TableCell>
                      <Badge className={`${categoryBadgeColors[account.category as AccountCategory] || "bg-gray-100 text-gray-800"} text-xs`}>
                        {categoryLabels[account.category as AccountCategory] || account.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {account.accountCategoryId
                        ? groupNameMap[account.accountCategoryId] || `#${account.accountCategoryId}`
                        : <span className="text-xs text-muted-foreground/50">미배정</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={account.isActive === "Y" ? "default" : "secondary"} className="text-xs">
                        {account.isActive === "Y" ? "활성" : "비활성"}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                      {account.description || "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleEdit(account)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive"
                          onClick={() => handleDelete(account.id)}
                          disabled={account.isActive === "N"}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
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

      {/* 생성/수정 다이얼로그 */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingAccount ? "계정 과목 수정" : "계정 과목 추가"}
            </DialogTitle>
            <DialogDescription>
              {editingAccount
                ? "계정 과목 정보를 수정하세요."
                : "새 계정 과목을 추가합니다. 분류(5분류)와 상위계정(그룹)을 반드시 선택하세요."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              {/* 분류(5분류) */}
              <div className="space-y-2">
                <Label>분류 (5분류) *</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) => handleCategoryChange(value as AccountCategory)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIXED_CATEGORIES.map((fc) => (
                      <SelectItem key={fc.key} value={fc.key}>
                        <div className="flex items-center gap-2">
                          <Badge className={`${categoryBadgeColors[fc.key]} text-xs`}>{fc.label}</Badge>
                          <span className="text-xs text-muted-foreground">({fc.code}xxx)</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 상위계정(그룹) */}
              <div className="space-y-2">
                <Label>상위계정 (그룹) *</Label>
                <Select
                  value={formData.accountCategoryId ? String(formData.accountCategoryId) : "none"}
                  onValueChange={(value) =>
                    setFormData({ ...formData, accountCategoryId: value === "none" ? undefined : Number(value) })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="상위계정을 선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      <span className="text-muted-foreground">(상위계정 없음)</span>
                    </SelectItem>
                    {filteredGroups.map((g: AccountCategoryRow) => (
                      <SelectItem key={g.id} value={String(g.id)}>
                        <span className="font-mono text-xs mr-1">[{g.code}]</span>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {filteredGroups.length === 0 && (
                  <p className="text-xs text-amber-600">
                    이 분류에 등록된 상위계정(그룹)이 없습니다. "계정 구조" 탭에서 먼저 그룹을 추가하세요.
                  </p>
                )}
              </div>

              {/* 코드 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>코드 *</Label>
                  <Input
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    placeholder="예: 1010, 5020"
                    required
                    readOnly={!editingAccount}
                    className={!editingAccount ? "bg-muted" : ""}
                  />
                  {!editingAccount && (
                    <p className="text-xs text-muted-foreground">분류 선택 시 자동 생성</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>상태 *</Label>
                  <Select
                    value={formData.isActive}
                    onValueChange={(value) => setFormData({ ...formData, isActive: value as "Y" | "N" })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Y">활성</SelectItem>
                      <SelectItem value="N">비활성</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* 과목명 */}
              <div className="space-y-2">
                <Label>계정 과목명 *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="예: 현금, 외상매출금, 급여"
                  required
                />
              </div>

              {/* 설명 */}
              <div className="space-y-2">
                <Label>설명</Label>
                <Input
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="계정 과목에 대한 설명"
                />
              </div>
            </div>
            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => { setIsDialogOpen(false); resetForm(); }}>
                취소
              </Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {createMutation.isPending || updateMutation.isPending ? "처리 중..." : editingAccount ? "수정" : "추가"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

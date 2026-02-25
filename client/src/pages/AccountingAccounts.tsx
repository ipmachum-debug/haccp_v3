import { useState, useEffect, useCallback } from "react";
import { trpc } from "../lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "../components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Plus, Pencil, Trash2, FolderTree, Settings } from "lucide-react";
import { toast } from "sonner";

// ===== 5분류 체계 (accounting_accounts) =====
type AccountCategory = "assets" | "liabilities" | "equity" | "revenue" | "expenses";

const categoryLabels: Record<AccountCategory, string> = {
  assets: "자산",
  liabilities: "부채",
  equity: "자본",
  revenue: "수익",
  expenses: "비용",
};

const categoryColors: Record<AccountCategory, string> = {
  assets: "bg-blue-100 text-blue-800",
  liabilities: "bg-red-100 text-red-800",
  equity: "bg-green-100 text-green-800",
  revenue: "bg-purple-100 text-purple-800",
  expenses: "bg-orange-100 text-orange-800",
};

// ===== 계정 과목 카테고리 (account_categories) 색상 =====
const majorCategoryColors: Record<string, string> = {
  "자산": "bg-blue-100 text-blue-800",
  "부채": "bg-red-100 text-red-800",
  "자본": "bg-green-100 text-green-800",
  "수익": "bg-purple-100 text-purple-800",
  "비용": "bg-orange-100 text-orange-800",
  "매입비": "bg-blue-100 text-blue-800",
  "인건비": "bg-green-100 text-green-800",
  "운영비": "bg-yellow-100 text-yellow-800",
  "판매비": "bg-purple-100 text-purple-800",
  "관리비": "bg-pink-100 text-pink-800",
  "금융·기타": "bg-gray-100 text-gray-800",
};

export default function AccountingAccounts() {
  const [activeTab, setActiveTab] = useState("accounts");

  return (
    <DashboardLayout>
      <div className="container py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">계정 과목 관리</h1>
            <p className="text-muted-foreground mt-2">
              회계 시스템에서 사용할 계정 과목을 관리합니다
            </p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="accounts">
              <FolderTree className="h-4 w-4 mr-2" />
              계정 과목 (5분류)
            </TabsTrigger>
            <TabsTrigger value="categories">
              <Settings className="h-4 w-4 mr-2" />
              계정 카테고리 관리
            </TabsTrigger>
          </TabsList>

          <TabsContent value="accounts" className="mt-6">
            <AccountsTab />
          </TabsContent>
          <TabsContent value="categories" className="mt-6">
            <CategoriesTab />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

// ===== 탭 1: 계정 과목 (5분류 체계) =====
function AccountsTab() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<any>(null);
  const [filterCategory, setFilterCategory] = useState<AccountCategory | "ALL">("ALL");
  const [filterActive, setFilterActive] = useState<"ALL" | "Y" | "N">("Y");

  const [formData, setFormData] = useState({
    code: "",
    name: "",
    category: "expenses" as AccountCategory,
    description: "",
    isActive: "Y" as "Y" | "N",
  });

  const utils = trpc.useUtils();

  // 계정 과목 목록 조회
  const { data: accounts = [], isLoading } = trpc.accountingAccounts.list.useQuery({
    category: filterCategory === "ALL" ? undefined : filterCategory,
    isActive: filterActive === "ALL" ? undefined : filterActive,
  });

  // 통계 조회
  const { data: stats } = trpc.accountingAccounts.getStats.useQuery();

  // 다음 코드 조회
  const { data: nextCodeData } = trpc.accountingAccounts.getNextCode.useQuery(
    { category: formData.category },
    { enabled: false }
  );

  // 생성 mutation
  const createMutation = trpc.accountingAccounts.create.useMutation({
    onSuccess: () => {
      utils.accountingAccounts.list.invalidate();
      utils.accountingAccounts.getStats.invalidate();
      toast.success("계정 과목이 생성되었습니다.");
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(`생성 실패: ${error.message}`);
    },
  });

  // 수정 mutation
  const updateMutation = trpc.accountingAccounts.update.useMutation({
    onSuccess: () => {
      utils.accountingAccounts.list.invalidate();
      utils.accountingAccounts.getStats.invalidate();
      toast.success("계정 과목이 수정되었습니다.");
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(`수정 실패: ${error.message}`);
    },
  });

  // 삭제 mutation
  const deleteMutation = trpc.accountingAccounts.delete.useMutation({
    onSuccess: () => {
      utils.accountingAccounts.list.invalidate();
      utils.accountingAccounts.getStats.invalidate();
      toast.success("계정 과목이 비활성화되었습니다.");
    },
    onError: (error) => {
      toast.error(`삭제 실패: ${error.message}`);
    },
  });

  const resetForm = () => {
    setFormData({
      code: "",
      name: "",
      category: "expenses",
      description: "",
      isActive: "Y",
    });
    setEditingAccount(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingAccount) {
      updateMutation.mutate({
        id: editingAccount.id,
        ...formData,
      });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (account: any) => {
    setEditingAccount(account);
    setFormData({
      code: account.code,
      name: account.name,
      category: account.category as AccountCategory,
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

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div />
        <Button
          onClick={() => {
            resetForm();
            setIsDialogOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          계정 과목 추가
        </Button>
      </div>

      {/* 통계 카드 */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">전체</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">활성</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.active}</div>
            </CardContent>
          </Card>
          {Object.entries(stats.byCategory).map(([category, count]) => (
            <Card key={category}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  {categoryLabels[category as AccountCategory] || category}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{count as number}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 필터 */}
      <div className="flex gap-4 mb-6">
        <div className="flex-1">
          <Label>카테고리</Label>
          <Select
            value={filterCategory}
            onValueChange={(value) => setFilterCategory(value as AccountCategory | "ALL")}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">전체</SelectItem>
              {Object.entries(categoryLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1">
          <Label>상태</Label>
          <Select
            value={filterActive}
            onValueChange={(value) => setFilterActive(value as "ALL" | "Y" | "N")}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">전체</SelectItem>
              <SelectItem value="Y">활성</SelectItem>
              <SelectItem value="N">비활성</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 테이블 */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>코드</TableHead>
                <TableHead>계정 과목명</TableHead>
                <TableHead>카테고리</TableHead>
                <TableHead>설명</TableHead>
                <TableHead>상태</TableHead>
                <TableHead className="text-right">작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    로딩 중...
                  </TableCell>
                </TableRow>
              ) : accounts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    등록된 계정 과목이 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                accounts.map((account) => (
                  <TableRow key={account.id}>
                    <TableCell className="font-mono">{account.code}</TableCell>
                    <TableCell className="font-medium">{account.name}</TableCell>
                    <TableCell>
                      <Badge className={categoryColors[account.category as AccountCategory] || "bg-gray-100 text-gray-800"}>
                        {categoryLabels[account.category as AccountCategory] || account.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate">{account.description}</TableCell>
                    <TableCell>
                      <Badge variant={account.isActive === "Y" ? "default" : "secondary"}>
                        {account.isActive === "Y" ? "활성" : "비활성"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(account)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(account.id)}
                          disabled={account.isActive === "N"}
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
        </CardContent>
      </Card>

      {/* 생성/수정 다이얼로그 */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingAccount ? "계정 과목 수정" : "계정 과목 추가"}
            </DialogTitle>
            <DialogDescription>
              계정 과목 정보를 입력하세요. 코드는 고유해야 합니다.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <Label htmlFor="code">코드 *</Label>
                <Input
                  id="code"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="예: 1010, 2010"
                  required
                  readOnly={!editingAccount}
                  className={!editingAccount ? "bg-muted" : ""}
                />
                {!editingAccount && (
                  <p className="text-xs text-muted-foreground mt-1">
                    카테고리 선택 시 자동으로 생성됩니다
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="name">계정 과목명 *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="예: 현금, 외상매출금"
                  required
                />
              </div>
              <div>
                <Label htmlFor="category">카테고리 *</Label>
                <Select
                  value={formData.category}
                  onValueChange={async (value) => {
                    if (!editingAccount) {
                      try {
                        const result = await utils.accountingAccounts.getNextCode.fetch({
                          category: value as AccountCategory,
                        });
                        if (result?.nextCode) {
                          setFormData((prev) => ({
                            ...prev,
                            code: result.nextCode,
                            category: value as AccountCategory,
                          }));
                        } else {
                          setFormData((prev) => ({
                            ...prev,
                            category: value as AccountCategory,
                          }));
                        }
                      } catch {
                        setFormData((prev) => ({
                          ...prev,
                          category: value as AccountCategory,
                        }));
                      }
                    } else {
                      setFormData({ ...formData, category: value as AccountCategory });
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(categoryLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="description">설명</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="계정 과목에 대한 설명"
                />
              </div>
              <div>
                <Label htmlFor="isActive">상태 *</Label>
                <Select
                  value={formData.isActive}
                  onValueChange={(value) =>
                    setFormData({ ...formData, isActive: value as "Y" | "N" })
                  }
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
            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsDialogOpen(false);
                  resetForm();
                }}
              >
                취소
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {editingAccount ? "수정" : "추가"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ===== 탭 2: 계정 카테고리 관리 (account_categories) =====
function CategoriesTab() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<any>(null);
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    majorCategory: "비용",
    minorCategory: "",
    description: "",
  });

  // 계정 카테고리 목록 조회
  const { data: categories, isLoading, refetch } = trpc.accountCategories.getAll.useQuery();

  // 등록 mutation
  const createMutation = trpc.accountCategories.create.useMutation({
    onSuccess: () => {
      toast.success("계정 카테고리가 등록되었습니다.");
      setIsCreateDialogOpen(false);
      resetForm();
      refetch();
    },
    onError: (error) => {
      toast.error(`등록 실패: ${error.message}`);
    },
  });

  // 수정 mutation
  const updateMutation = trpc.accountCategories.update.useMutation({
    onSuccess: () => {
      toast.success("계정 카테고리가 수정되었습니다.");
      setIsEditDialogOpen(false);
      setEditingCategory(null);
      refetch();
    },
    onError: (error) => {
      toast.error(`수정 실패: ${error.message}`);
    },
  });

  // 삭제 mutation
  const deleteMutation = trpc.accountCategories.delete.useMutation({
    onSuccess: () => {
      toast.success("계정 카테고리가 삭제되었습니다.");
      refetch();
    },
    onError: (error) => {
      toast.error(`삭제 실패: ${error.message}`);
    },
  });

  const resetForm = () => {
    setFormData({
      code: "",
      name: "",
      majorCategory: "비용",
      minorCategory: "",
      description: "",
    });
  };

  // 코드 자동 생성
  const generateNextCode = useCallback(() => {
    const prefix = "ACC";
    const existingCodes = (categories || [])
      .filter((c: any) => c.code?.startsWith(prefix + "-"))
      .map((c: any) => {
        const parts = (c.code || "").split("-");
        return parseInt(parts[1] || "0", 10);
      })
      .filter((n: number) => !isNaN(n));
    const maxNum = existingCodes.length > 0 ? Math.max(...existingCodes) : 0;
    return `${prefix}-${(maxNum + 1).toString().padStart(3, "0")}`;
  }, [categories]);

  useEffect(() => {
    if (isCreateDialogOpen) {
      const nextCode = generateNextCode();
      setFormData((prev) => ({ ...prev, code: nextCode }));
    } else {
      resetForm();
    }
  }, [isCreateDialogOpen]);

  const handleCreate = () => {
    if (!formData.code || !formData.name) {
      toast.error("계정 코드와 계정명은 필수입니다.");
      return;
    }
    createMutation.mutate({
      code: formData.code,
      name: formData.name,
      majorCategory: formData.majorCategory,
      minorCategory: formData.minorCategory || undefined,
      description: formData.description || undefined,
    });
  };

  const handleEdit = () => {
    if (!formData.code || !formData.name) {
      toast.error("계정 코드와 계정명은 필수입니다.");
      return;
    }
    updateMutation.mutate({
      id: editingCategory.id,
      code: formData.code,
      name: formData.name,
      majorCategory: formData.majorCategory,
      minorCategory: formData.minorCategory || undefined,
      description: formData.description || undefined,
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("정말 삭제하시겠습니까?")) {
      deleteMutation.mutate({ id });
    }
  };

  const openEditDialog = (category: any) => {
    setEditingCategory(category);
    setFormData({
      code: category.code,
      name: category.name,
      majorCategory: category.majorCategory || "비용",
      minorCategory: category.minorCategory || "",
      description: category.description || "",
    });
    setIsEditDialogOpen(true);
  };

  // 대분류별 그룹화
  const groupedCategories = (categories || []).reduce((acc: Record<string, any[]>, category: any) => {
    const major = category.majorCategory || "기타";
    if (!acc[major]) {
      acc[major] = [];
    }
    acc[major].push(category);
    return acc;
  }, {} as Record<string, any[]>);

  // 고유 대분류 목록 추출
  const uniqueMajorCategories = [...new Set((categories || []).map((c: any) => c.majorCategory).filter(Boolean))];

  if (isLoading) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        데이터를 불러오는 중...
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm text-muted-foreground">
            매입/매출 거래를 회계 항목으로 분류하기 위한 계정 카테고리를 관리합니다.
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          카테고리 등록
        </Button>
      </div>

      {/* 대분류별 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {Object.entries(groupedCategories).map(([major, items]) => (
          <Card key={major}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FolderTree className="h-5 w-5" />
                <Badge className={majorCategoryColors[major] || "bg-gray-100 text-gray-800"}>
                  {major}
                </Badge>
              </CardTitle>
              <CardDescription>{(items as any[]).length}개 항목</CardDescription>
            </CardHeader>
            <CardContent>
              {(items as any[]).length === 0 ? (
                <p className="text-sm text-muted-foreground">등록된 항목이 없습니다.</p>
              ) : (
                <div className="space-y-2">
                  {(items as any[]).map((item: any) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-2 rounded-md hover:bg-accent"
                    >
                      <div className="flex-1">
                        <div className="font-medium text-sm">{item.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {item.code}
                          {item.minorCategory && ` · ${item.minorCategory}`}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEditDialog(item)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDelete(item.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 전체 목록 테이블 */}
      <Card>
        <CardHeader>
          <CardTitle>전체 카테고리 목록</CardTitle>
          <CardDescription>
            총 {categories?.length || 0}개의 카테고리가 등록되어 있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!categories || categories.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              등록된 카테고리가 없습니다. 카테고리를 등록해주세요.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>코드</TableHead>
                  <TableHead>카테고리명</TableHead>
                  <TableHead>대분류</TableHead>
                  <TableHead>중분류</TableHead>
                  <TableHead>설명</TableHead>
                  <TableHead className="text-right">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((category: any) => (
                  <TableRow key={category.id}>
                    <TableCell className="font-mono">{category.code}</TableCell>
                    <TableCell className="font-medium">{category.name}</TableCell>
                    <TableCell>
                      <Badge className={majorCategoryColors[category.majorCategory] || "bg-gray-100 text-gray-800"}>
                        {category.majorCategory}
                      </Badge>
                    </TableCell>
                    <TableCell>{category.minorCategory || "-"}</TableCell>
                    <TableCell className="max-w-xs truncate">
                      {category.description || "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => openEditDialog(category)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => handleDelete(category.id)}>
                          <Trash2 className="h-4 w-4" />
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

      {/* 등록 다이얼로그 */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>카테고리 등록</DialogTitle>
            <DialogDescription>
              새로운 계정 카테고리 정보를 입력하세요.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cat-code">코드 *</Label>
                <Input
                  id="cat-code"
                  value={formData.code}
                  readOnly
                  className="bg-muted"
                  placeholder="자동 생성"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cat-major">대분류 *</Label>
                <Select
                  value={formData.majorCategory}
                  onValueChange={(value) => setFormData({ ...formData, majorCategory: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["자산", "부채", "자본", "수익", "비용", "매입비", "인건비", "운영비", "판매비", "관리비", "금융·기타"].map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                    {uniqueMajorCategories
                      .filter((c) => !["자산", "부채", "자본", "수익", "비용", "매입비", "인건비", "운영비", "판매비", "관리비", "금융·기타"].includes(c as string))
                      .map((cat) => (
                        <SelectItem key={cat as string} value={cat as string}>
                          {cat as string}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-name">카테고리명 *</Label>
              <Input
                id="cat-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="예: 원재료 매입"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-minor">중분류</Label>
              <Input
                id="cat-minor"
                value={formData.minorCategory}
                onChange={(e) => setFormData({ ...formData, minorCategory: e.target.value })}
                placeholder="예: 원재료"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-desc">설명</Label>
              <Textarea
                id="cat-desc"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="카테고리에 대한 설명"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsCreateDialogOpen(false); resetForm(); }}>
              취소
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? "등록 중..." : "등록"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 수정 다이얼로그 */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>카테고리 수정</DialogTitle>
            <DialogDescription>
              카테고리 정보를 수정하세요.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-cat-code">코드</Label>
                <Input
                  id="edit-cat-code"
                  value={formData.code}
                  readOnly
                  className="bg-muted"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-cat-major">대분류 *</Label>
                <Select
                  value={formData.majorCategory}
                  onValueChange={(value) => setFormData({ ...formData, majorCategory: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["자산", "부채", "자본", "수익", "비용", "매입비", "인건비", "운영비", "판매비", "관리비", "금융·기타"].map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                    {uniqueMajorCategories
                      .filter((c) => !["자산", "부채", "자본", "수익", "비용", "매입비", "인건비", "운영비", "판매비", "관리비", "금융·기타"].includes(c as string))
                      .map((cat) => (
                        <SelectItem key={cat as string} value={cat as string}>
                          {cat as string}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-cat-name">카테고리명 *</Label>
              <Input
                id="edit-cat-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="예: 원재료 매입"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-cat-minor">중분류</Label>
              <Input
                id="edit-cat-minor"
                value={formData.minorCategory}
                onChange={(e) => setFormData({ ...formData, minorCategory: e.target.value })}
                placeholder="예: 원재료"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-cat-desc">설명</Label>
              <Textarea
                id="edit-cat-desc"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="카테고리에 대한 설명"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsEditDialogOpen(false); setEditingCategory(null); }}>
              취소
            </Button>
            <Button onClick={handleEdit} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "수정 중..." : "수정"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

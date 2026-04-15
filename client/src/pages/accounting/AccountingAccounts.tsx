import { useState, useEffect, useCallback, useMemo } from "react";
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

// ===== 5분류 체계 (고정, 추가/삭제 불가) =====
type AccountCategory = "assets" | "liabilities" | "equity" | "revenue" | "expenses";

const FIXED_CATEGORIES: {
  key: AccountCategory;
  label: string;
  code: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  borderColor: string;
  description: string;
}[] = [
  {
    key: "assets",
    label: "자산",
    code: "1",
    icon: Building2,
    color: "text-blue-700",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
    description: "기업이 소유한 경제적 자원",
  },
  {
    key: "liabilities",
    label: "부채",
    code: "2",
    icon: Receipt,
    color: "text-red-700",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
    description: "갚아야 할 의무",
  },
  {
    key: "equity",
    label: "자본",
    code: "3",
    icon: Wallet,
    color: "text-green-700",
    bgColor: "bg-green-50",
    borderColor: "border-green-200",
    description: "자산에서 부채를 뺀 잔여 지분",
  },
  {
    key: "revenue",
    label: "수익",
    code: "4",
    icon: TrendingUp,
    color: "text-purple-700",
    bgColor: "bg-purple-50",
    borderColor: "border-purple-200",
    description: "영업 활동으로 발생하는 수입",
  },
  {
    key: "expenses",
    label: "비용",
    code: "5",
    icon: CircleDot,
    color: "text-orange-700",
    bgColor: "bg-orange-50",
    borderColor: "border-orange-200",
    description: "수익 창출을 위해 지출한 비용",
  },
];

const categoryLabels: Record<AccountCategory, string> = {
  assets: "자산",
  liabilities: "부채",
  equity: "자본",
  revenue: "수익",
  expenses: "비용",
};

const categoryBadgeColors: Record<AccountCategory, string> = {
  assets: "bg-blue-100 text-blue-800",
  liabilities: "bg-red-100 text-red-800",
  equity: "bg-green-100 text-green-800",
  revenue: "bg-purple-100 text-purple-800",
  expenses: "bg-orange-100 text-orange-800",
};

// majorCategory(한국어) → AccountCategory(영어) 매핑
const majorToCategory: Record<string, AccountCategory> = {
  "자산": "assets",
  "부채": "liabilities",
  "자본": "equity",
  "수익": "revenue",
  "비용": "expenses",
};

const categoryToMajor: Record<AccountCategory, string> = {
  assets: "자산",
  liabilities: "부채",
  equity: "자본",
  revenue: "수익",
  expenses: "비용",
};

export default function AccountingAccounts() {
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

// ===================================================================
// 탭 A: 계정 구조 (5분류) - 카드 뷰
// 고정된 5대 분류 + 그 아래 상위계정(그룹) 관리
// ===================================================================
function AccountStructureTab({
  categories,
  catLoading,
  refetchCategories,
  allAccounts,
  stats,
}: {
  categories: any[];
  catLoading: boolean;
  refetchCategories: () => void;
  allAccounts: any[];
  stats: any;
}) {
  const [expandedCategories, setExpandedCategories] = useState<Set<AccountCategory>>(
    () => new Set<AccountCategory>(["assets", "liabilities", "equity", "revenue", "expenses"])
  );
  const [isGroupDialogOpen, setIsGroupDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<any>(null);
  const [selectedCategory, setSelectedCategory] = useState<AccountCategory>("assets");
  const [sideSheetOpen, setSideSheetOpen] = useState(false);
  const [sideSheetCategory, setSideSheetCategory] = useState<AccountCategory>("assets");
  const [sideSheetGroup, setSideSheetGroup] = useState<any>(null);

  const [groupFormData, setGroupFormData] = useState({
    code: "",
    name: "",
    majorCategory: "자산",
    minorCategory: "",
    description: "",
  });


  // 상위계정 그룹별 분류
  const groupedCategories = useMemo(() => {
    const grouped: Record<AccountCategory, any[]> = {
      assets: [],
      liabilities: [],
      equity: [],
      revenue: [],
      expenses: [],
    };
    (categories || []).forEach((cat: any) => {
      const major = cat.majorCategory || "기타";
      const categoryKey = majorToCategory[major];
      if (categoryKey && grouped[categoryKey]) {
        grouped[categoryKey].push(cat);
      }
    });
    return grouped;
  }, [categories]);

  // 세부 계정을 상위계정(그룹)별로 분류
  // 전략: account_category_id FK가 설정된 계정은 직접 매핑
  //       FK 미설정 시: 같은 카테고리의 모든 미매핑 계정을 각 그룹에서 공유 표시
  const accountsByGroup = useMemo(() => {
    const map: Record<string, any[]> = {};
    
    // FK로 매핑된 계정과 미매핑 계정 분리
    const fkMapped: any[] = [];
    const unmappedByCategory: Record<string, any[]> = {};
    
    (allAccounts || []).forEach((acc: any) => {
      if (acc.accountCategoryId) {
        fkMapped.push(acc);
      } else {
        const cat = acc.category || "";
        if (!unmappedByCategory[cat]) unmappedByCategory[cat] = [];
        unmappedByCategory[cat].push(acc);
      }
    });
    
    // 1단계: FK 매핑된 계정 직접 할당
    fkMapped.forEach((acc: any) => {
      const key = String(acc.accountCategoryId);
      if (!map[key]) map[key] = [];
      map[key].push(acc);
    });
    
    // 2단계: FK 미매핑 계정 → 같은 카테고리의 모든 그룹에 공유
    // (그룹 코드와 계정 코드 간에 수학적 관계가 없으므로, 모든 미매핑 계정을 카테고리 내 모든 그룹에 표시)
    (categories || []).forEach((cat: any) => {
      const catKey = majorToCategory[cat.majorCategory || ""];
      if (!catKey) return;
      const key = String(cat.id);
      const unmapped = unmappedByCategory[catKey] || [];
      if (!map[key]) map[key] = [];
      // FK 매핑된 것만 있으면 그대로, 없으면 미매핑 계정 추가
      if (map[key].length === 0 && unmapped.length > 0) {
        map[key].push(...unmapped);
      }
    });
    
    return map;
  }, [allAccounts, categories]);

  // 그룹에 FK 매핑된 계정이 있는지 여부 (미매핑 공유 vs 직접 매핑 구분용)
  const hasFkMapping = useMemo(() => {
    return (allAccounts || []).some((acc: any) => acc.accountCategoryId != null);
  }, [allAccounts]);

  // 카테고리별 계정 수
  const accountCountByCategory = useMemo(() => {
    const counts: Record<AccountCategory, number> = {
      assets: 0, liabilities: 0, equity: 0, revenue: 0, expenses: 0,
    };
    (allAccounts || []).forEach((acc: any) => {
      if (counts[acc.category as AccountCategory] !== undefined) {
        counts[acc.category as AccountCategory]++;
      }
    });
    return counts;
  }, [allAccounts]);

  const createGroupMutation = trpc.accountCategories.create.useMutation({
    onSuccess: () => {
      toast.success("상위계정(그룹)이 등록되었습니다.");
      setIsGroupDialogOpen(false);
      resetGroupForm();
      refetchCategories();
    },
    onError: (error: any) => toast.error(`등록 실패: ${error.message}`),
  });

  const updateGroupMutation = trpc.accountCategories.update.useMutation({
    onSuccess: () => {
      toast.success("상위계정(그룹)이 수정되었습니다.");
      setIsGroupDialogOpen(false);
      setEditingGroup(null);
      resetGroupForm();
      refetchCategories();
    },
    onError: (error: any) => toast.error(`수정 실패: ${error.message}`),
  });

  const deleteGroupMutation = trpc.accountCategories.delete.useMutation({
    onSuccess: () => {
      toast.success("상위계정(그룹)이 삭제되었습니다.");
      refetchCategories();
    },
    onError: (error: any) => toast.error(`삭제 실패: ${error.message}`),
  });

  const resetGroupForm = () => {
    setGroupFormData({ code: "", name: "", majorCategory: "자산", minorCategory: "", description: "" });
    setEditingGroup(null);
  };

  // 코드 자동 생성 — 카테고리 접두사 기반 숫자 코드
  // 자산=1xx, 부채=2xx, 자본=3xx, 수익=4xx, 비용=5xx
  const generateNextGroupCode = useCallback((majorCategory: string) => {
    const categoryKey = majorToCategory[majorCategory];
    const catConfig = FIXED_CATEGORIES.find(fc => fc.key === categoryKey);
    const catPrefix = catConfig?.code || "9"; // 예: assets→"1", liabilities→"2" ...
    
    // 같은 대분류에 속하는 기존 그룹 코드 중 숫자 코드만 추출
    const existingNumCodes = (categories || [])
      .filter((c: any) => {
        const cCatKey = majorToCategory[c.majorCategory || ""];
        return cCatKey === categoryKey && /^\d+$/.test(c.code || "");
      })
      .map((c: any) => parseInt(c.code, 10))
      .filter((n: number) => !isNaN(n))
      .sort((a: number, b: number) => a - b);
    
    // 기존 코드 중 최대값 기반으로 다음 코드 생성
    const prefix = parseInt(catPrefix, 10) * 100; // 100, 200, 300...
    if (existingNumCodes.length === 0) {
      return `${prefix}`; // 첫 그룹: 100, 200, 300...
    }
    const maxCode = Math.max(...existingNumCodes);
    return `${maxCode + 10}`; // 10 단위 증가: 100 → 110 → 120...
  }, [categories]);

  const toggleCategory = (cat: AccountCategory) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const openAddGroupDialog = (categoryKey: AccountCategory) => {
    const majorLabel = categoryToMajor[categoryKey];
    const nextCode = generateNextGroupCode(majorLabel);
    setGroupFormData({
      code: nextCode,
      name: "",
      majorCategory: majorLabel,
      minorCategory: "",
      description: "",
    });
    setSelectedCategory(categoryKey);
    setEditingGroup(null);
    setIsGroupDialogOpen(true);
  };

  const openEditGroupDialog = (group: any) => {
    setEditingGroup(group);
    setGroupFormData({
      code: group.code,
      name: group.name,
      majorCategory: group.majorCategory || "자산",
      minorCategory: group.minorCategory || "",
      description: group.description || "",
    });
    setIsGroupDialogOpen(true);
  };

  const handleGroupSubmit = () => {
    if (!groupFormData.code || !groupFormData.name) {
      toast.error("코드와 계정명은 필수입니다.");
      return;
    }
    if (editingGroup) {
      updateGroupMutation.mutate({
        id: editingGroup.id,
        code: groupFormData.code,
        name: groupFormData.name,
        majorCategory: groupFormData.majorCategory,
        minorCategory: groupFormData.minorCategory || undefined,
        description: groupFormData.description || undefined,
      });
    } else {
      createGroupMutation.mutate({
        code: groupFormData.code,
        name: groupFormData.name,
        majorCategory: groupFormData.majorCategory,
        minorCategory: groupFormData.minorCategory || undefined,
        description: groupFormData.description || undefined,
      });
    }
  };

  const handleDeleteGroup = (id: number, name: string) => {
    if (confirm(`"${name}" 상위계정(그룹)을 삭제하시겠습니까?\n해당 그룹 하위의 세부 계정은 유지됩니다.`)) {
      deleteGroupMutation.mutate({ id });
    }
  };

  // 그룹 클릭 → 사이드 패널에 하위 계정 표시
  const openGroupSidePanel = (categoryKey: AccountCategory, group: any) => {
    setSideSheetCategory(categoryKey);
    setSideSheetGroup(group);
    setSideSheetOpen(true);
  };

  if (catLoading) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        계정 구조를 불러오는 중...
      </div>
    );
  }

  return (
    <>
      {/* 안내 배너 */}
      <div className="bg-muted/50 border rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <Layers className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium">계정 구조 (5분류) 관리</p>
            <p className="text-xs text-muted-foreground mt-1">
              5대 분류(자산·부채·자본·수익·비용)는 고정되어 추가/삭제할 수 없습니다.
              각 분류 아래에 <strong>상위계정(그룹)</strong>을 생성하고, 그 그룹 안에 세부 계정을 배치하세요.
            </p>
          </div>
        </div>
      </div>

      {/* 요약 통계 */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
          <Card className="border-dashed">
            <CardHeader className="pb-1 pt-3 px-3">
              <CardTitle className="text-xs font-medium text-muted-foreground">전체 계정</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <div className="text-xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card className="border-dashed">
            <CardHeader className="pb-1 pt-3 px-3">
              <CardTitle className="text-xs font-medium text-muted-foreground">활성</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <div className="text-xl font-bold text-green-600">{stats.active}</div>
            </CardContent>
          </Card>
          {FIXED_CATEGORIES.map((fc) => (
            <Card key={fc.key} className="border-dashed">
              <CardHeader className="pb-1 pt-3 px-3">
                <CardTitle className="text-xs font-medium text-muted-foreground">{fc.label}</CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <div className="text-xl font-bold">{stats.byCategory[fc.key] || 0}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 5분류 카드 목록 */}
      <div className="space-y-4">
        {FIXED_CATEGORIES.map((fc) => {
          const Icon = fc.icon;
          const isExpanded = expandedCategories.has(fc.key);
          const groups = groupedCategories[fc.key] || [];
          const totalAccounts = accountCountByCategory[fc.key] || 0;

          return (
            <Card key={fc.key} className={`${fc.borderColor} border`}>
              {/* 카테고리 헤더 (고정 - 삭제/추가 불가) */}
              <div
                className={`flex items-center justify-between px-4 py-3 cursor-pointer select-none ${fc.bgColor} rounded-t-lg`}
                onClick={() => toggleCategory(fc.key)}
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? (
                    <ChevronDown className={`h-4 w-4 ${fc.color}`} />
                  ) : (
                    <ChevronRight className={`h-4 w-4 ${fc.color}`} />
                  )}
                  <Icon className={`h-5 w-5 ${fc.color}`} />
                  <div>
                    <span className={`font-semibold ${fc.color}`}>{fc.label}</span>
                    <span className="text-xs text-muted-foreground ml-2">({fc.code}xxx)</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    그룹 {groups.length}개 · 계정 {totalAccounts}개
                  </span>
                  <Badge variant="outline" className={`${fc.color} border-current text-xs`}>
                    고정 분류
                  </Badge>
                </div>
              </div>

              {/* 하위 그룹 목록 (펼치기) */}
              {isExpanded && (
                <CardContent className="pt-3 pb-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs text-muted-foreground">{fc.description}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        openAddGroupDialog(fc.key);
                      }}
                      className="h-7 text-xs"
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      상위계정(그룹) 추가
                    </Button>
                  </div>

                  {groups.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground text-sm border border-dashed rounded-lg">
                      등록된 상위계정(그룹)이 없습니다.
                      <br />
                      <span className="text-xs">상위계정을 추가하여 세부 계정을 분류하세요.</span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {groups.map((group: any) => {
                        const childAccounts = accountsByGroup[String(group.id)] || [];
                        const isFkMapped = childAccounts.some((acc: any) => acc.accountCategoryId === group.id);
                        const isShared = !isFkMapped && childAccounts.length > 0;
                        return (
                          <div
                            key={group.id}
                            className="border rounded-lg p-3 hover:bg-accent/50 transition-colors cursor-pointer group"
                            onClick={() => openGroupSidePanel(fc.key, group)}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-xs text-muted-foreground">{group.code}</span>
                                  <span className="font-medium text-sm truncate">{group.name}</span>
                                </div>
                                {group.minorCategory && (
                                  <span className="text-xs text-muted-foreground">
                                    중분류: {group.minorCategory}
                                  </span>
                                )}
                                <div className="text-xs text-muted-foreground mt-1">
                                  {isShared ? (
                                    <span className="text-amber-600">미배정 계정 {childAccounts.length}개</span>
                                  ) : (
                                    <>하위 계정 {childAccounts.length}개</>
                                  )}
                                </div>
                              </div>
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 p-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openEditGroupDialog(group);
                                  }}
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 p-0 text-destructive"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteGroup(group.id, group.name);
                                  }}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {/* 상위계정(그룹) 추가/수정 다이얼로그 */}
      <Dialog open={isGroupDialogOpen} onOpenChange={setIsGroupDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingGroup ? "상위계정(그룹) 수정" : "상위계정(그룹) 추가"}
            </DialogTitle>
            <DialogDescription>
              {editingGroup
                ? "상위계정(그룹) 정보를 수정하세요."
                : "5분류 아래에 새로운 상위계정(그룹)을 추가합니다. 5분류 자체는 변경할 수 없습니다."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>코드 *</Label>
                <Input
                  value={groupFormData.code}
                  onChange={(e) => setGroupFormData({ ...groupFormData, code: e.target.value })}
                  placeholder="자동 생성"
                  className={editingGroup ? "" : "bg-muted"}
                  readOnly={!editingGroup}
                />
              </div>
              <div className="space-y-2">
                <Label>소속 분류 (5분류) *</Label>
                <Select
                  value={groupFormData.majorCategory}
                  onValueChange={(value) => setGroupFormData({ ...groupFormData, majorCategory: value })}
                  disabled={!!editingGroup}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIXED_CATEGORIES.map((fc) => (
                      <SelectItem key={fc.key} value={fc.label}>
                        {fc.label} ({fc.code}xxx)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">5대 분류는 고정입니다.</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>상위계정(그룹)명 *</Label>
              <Input
                value={groupFormData.name}
                onChange={(e) => setGroupFormData({ ...groupFormData, name: e.target.value })}
                placeholder="예: 유동자산, 매출원가, 판매관리비"
              />
            </div>
            <div className="space-y-2">
              <Label>중분류</Label>
              <Input
                value={groupFormData.minorCategory}
                onChange={(e) => setGroupFormData({ ...groupFormData, minorCategory: e.target.value })}
                placeholder="예: 유동자산, 비유동자산"
              />
            </div>
            <div className="space-y-2">
              <Label>설명</Label>
              <Textarea
                value={groupFormData.description}
                onChange={(e) => setGroupFormData({ ...groupFormData, description: e.target.value })}
                placeholder="상위계정(그룹)에 대한 설명"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsGroupDialogOpen(false); resetGroupForm(); }}>
              취소
            </Button>
            <Button
              onClick={handleGroupSubmit}
              disabled={createGroupMutation.isPending || updateGroupMutation.isPending}
            >
              {createGroupMutation.isPending || updateGroupMutation.isPending
                ? "처리 중..."
                : editingGroup ? "수정" : "등록"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 그룹 클릭 → 하위 계정 목록 사이드 패널 */}
      <Sheet open={sideSheetOpen} onOpenChange={setSideSheetOpen}>
        <SheetContent className="w-[480px] sm:max-w-[480px]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <FolderTree className="h-5 w-5" />
              {sideSheetGroup?.name || ""}
              <Badge className={categoryBadgeColors[sideSheetCategory]}>
                {categoryLabels[sideSheetCategory]}
              </Badge>
            </SheetTitle>
            <SheetDescription>
              {sideSheetGroup?.code && (
                <span className="font-mono text-xs mr-2">[{sideSheetGroup.code}]</span>
              )}
              {sideSheetGroup?.description || "하위 세부 계정 목록"}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            <SideSheetAccountList
              categoryKey={sideSheetCategory}
              group={sideSheetGroup}
              accounts={allAccounts}
              allCategories={categories}
              accountsByGroupMap={accountsByGroup}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

// 사이드 패널 내부: 그룹 하위 계정 목록
// accountsByGroup map을 직접 참조하여 카드와 동일한 결과 보장
function SideSheetAccountList({
  categoryKey,
  group,
  accounts,
  allCategories,
  accountsByGroupMap,
}: {
  categoryKey: AccountCategory;
  group: any;
  accounts: any[];
  allCategories: any[];
  accountsByGroupMap: Record<string, any[]>;
}) {
  const childAccounts = useMemo(() => {
    if (!group) return [];
    // accountsByGroup에서 직접 가져옴 (카드 표시와 100% 동일)
    return accountsByGroupMap[String(group.id)] || [];
  }, [group, accountsByGroupMap]);

  const isFkMapped = useMemo(() => {
    if (!group) return false;
    return childAccounts.some((acc: any) => acc.accountCategoryId === group.id);
  }, [childAccounts, group]);

  if (!group) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {isFkMapped ? (
            <>하위 계정 {childAccounts.length}개</>
          ) : childAccounts.length > 0 ? (
            <span className="text-amber-600">미배정 계정 {childAccounts.length}개 (같은 분류)</span>
          ) : (
            <>하위 계정 0개</>
          )}
        </div>
      </div>
      {!isFkMapped && childAccounts.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
          아직 그룹에 직접 배정되지 않은 계정입니다. 같은 분류({categoryLabels[categoryKey]})의 전체 계정을 표시하고 있습니다.
        </div>
      )}
      {childAccounts.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm border border-dashed rounded-lg">
          아직 하위 계정이 없습니다.
          <br />
          <span className="text-xs">"계정 과목 목록" 탭에서 계정을 추가하세요.</span>
        </div>
      ) : (
        <div className="space-y-2">
          {childAccounts.map((acc: any) => (
            <div
              key={acc.id}
              className="flex items-center justify-between p-2 rounded-md border hover:bg-accent/50"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{acc.code}</span>
                  <span className="text-sm font-medium">{acc.name}</span>
                </div>
                {acc.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[300px]">
                    {acc.description}
                  </p>
                )}
              </div>
              <Badge variant={acc.isActive === "Y" ? "default" : "secondary"} className="text-xs">
                {acc.isActive === "Y" ? "활성" : "비활성"}
              </Badge>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground text-center pt-2">
        세부 계정의 추가/수정/삭제는 "계정 과목 목록" 탭에서 가능합니다.
      </p>
    </div>
  );
}

// ===================================================================
// 탭 B: 계정 과목 목록 - 테이블 뷰
// 전체 계정 목록, CRUD, 필터, 상위계정(부모 그룹) 컬럼
// ===================================================================
function AccountListTab({
  categories,
  allAccounts,
  accLoading,
  stats,
}: {
  categories: any[];
  allAccounts: any[];
  accLoading: boolean;
  stats: any;
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
    return allAccounts.filter((acc: any) => {
      if (filterCategory !== "ALL" && acc.category !== filterCategory) return false;
      if (filterActive !== "ALL" && acc.isActive !== filterActive) return false;
      return true;
    });
  }, [allAccounts, filterCategory, filterActive]);

  const isLoading = accLoading;

  // 상위계정 ID → 이름 매핑
  const groupNameMap = useMemo(() => {
    const map: Record<number, string> = {};
    (categories || []).forEach((cat: any) => {
      map[cat.id] = cat.name;
    });
    return map;
  }, [categories]);

  // 카테고리별 상위계정 필터
  const filteredGroups = useMemo(() => {
    const cat = formData.category;
    const majorLabel = categoryToMajor[cat];
    return (categories || []).filter((c: any) => c.majorCategory === majorLabel);
  }, [categories, formData.category]);

  // 검색 필터
  const filteredAccounts = useMemo(() => {
    if (!searchText.trim()) return accounts;
    const lower = searchText.toLowerCase();
    return accounts.filter(
      (acc: any) =>
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
    onError: (error: any) => toast.error(`생성 실패: ${error.message}`),
  });

  const updateMutation = trpc.accountingAccounts.update.useMutation({
    onSuccess: () => {
      utils.accountingAccounts.list.invalidate();
      utils.accountingAccounts.getStats.invalidate();
      toast.success("계정 과목이 수정되었습니다.");
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => toast.error(`수정 실패: ${error.message}`),
  });

  const deleteMutation = trpc.accountingAccounts.delete.useMutation({
    onSuccess: () => {
      utils.accountingAccounts.list.invalidate();
      utils.accountingAccounts.getStats.invalidate();
      toast.success("계정 과목이 비활성화되었습니다.");
    },
    onError: (error: any) => toast.error(`비활성화 실패: ${error.message}`),
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

  const handleEdit = (account: any) => {
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
                filteredAccounts.map((account: any) => (
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
                    {filteredGroups.map((g: any) => (
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

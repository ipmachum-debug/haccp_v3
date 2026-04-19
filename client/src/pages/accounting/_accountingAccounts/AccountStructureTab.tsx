/**
 * AccountingAccounts 분해 — 계정 구조 탭 (5분류 카드 뷰) + 사이드 시트.
 *
 * 포함:
 *  - AccountStructureTab    5대 분류 + 그 아래 상위계정(그룹) 관리
 *  - SideSheetAccountList   특정 그룹의 세부 계정 목록 (사이드시트)
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Plus, Pencil, Trash2, ChevronDown, ChevronRight, Layers, FolderTree,
} from "lucide-react";
import { toast } from "sonner";
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
} from "./constants";

// ===================================================================
// 탭 A: 계정 구조 (5분류) - 카드 뷰
// 고정된 5대 분류 + 그 아래 상위계정(그룹) 관리
// ===================================================================
export function AccountStructureTab({
  categories,
  catLoading,
  refetchCategories,
  allAccounts,
  stats,
}: {
  categories: AccountCategoryRow[];
  catLoading: boolean;
  refetchCategories: () => void;
  allAccounts: AccountingAccountRow[];
  stats: AccountingStats | undefined;
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
    (categories || []).forEach((cat: AccountCategoryRow) => {
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
    const fkMapped: AccountingAccountRow[] = [];
    const unmappedByCategory: Record<string, any[]> = {};
    
    (allAccounts || []).forEach((acc: AccountingAccountRow) => {
      if (acc.accountCategoryId) {
        fkMapped.push(acc);
      } else {
        const cat = acc.category || "";
        if (!unmappedByCategory[cat]) unmappedByCategory[cat] = [];
        unmappedByCategory[cat].push(acc);
      }
    });
    
    // 1단계: FK 매핑된 계정 직접 할당
    fkMapped.forEach((acc: AccountingAccountRow) => {
      const key = String(acc.accountCategoryId);
      if (!map[key]) map[key] = [];
      map[key].push(acc);
    });
    
    // 2단계: FK 미매핑 계정 → 같은 카테고리의 모든 그룹에 공유
    // (그룹 코드와 계정 코드 간에 수학적 관계가 없으므로, 모든 미매핑 계정을 카테고리 내 모든 그룹에 표시)
    (categories || []).forEach((cat: AccountCategoryRow) => {
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
    return (allAccounts || []).some((acc: AccountingAccountRow) => acc.accountCategoryId != null);
  }, [allAccounts]);

  // 카테고리별 계정 수
  const accountCountByCategory = useMemo(() => {
    const counts: Record<AccountCategory, number> = {
      assets: 0, liabilities: 0, equity: 0, revenue: 0, expenses: 0,
    };
    (allAccounts || []).forEach((acc: AccountingAccountRow) => {
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
    onError: (error: { message: string }) => toast.error(`등록 실패: ${error.message}`),
  });

  const updateGroupMutation = trpc.accountCategories.update.useMutation({
    onSuccess: () => {
      toast.success("상위계정(그룹)이 수정되었습니다.");
      setIsGroupDialogOpen(false);
      setEditingGroup(null);
      resetGroupForm();
      refetchCategories();
    },
    onError: (error: { message: string }) => toast.error(`수정 실패: ${error.message}`),
  });

  const deleteGroupMutation = trpc.accountCategories.delete.useMutation({
    onSuccess: () => {
      toast.success("상위계정(그룹)이 삭제되었습니다.");
      refetchCategories();
    },
    onError: (error: { message: string }) => toast.error(`삭제 실패: ${error.message}`),
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
      .filter((c: AccountCategoryRow) => {
        const cCatKey = majorToCategory[c.majorCategory || ""];
        return cCatKey === categoryKey && /^\d+$/.test(c.code || "");
      })
      .map((c: AccountCategoryRow) => parseInt(c.code, 10))
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

  const openEditGroupDialog = (group: AccountCategoryRow) => {
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
  const openGroupSidePanel = (categoryKey: AccountCategory, group: AccountCategoryRow) => {
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
                      {groups.map((group: AccountCategoryRow) => {
                        const childAccounts = accountsByGroup[String(group.id)] || [];
                        const isFkMapped = childAccounts.some((acc: AccountingAccountRow) => acc.accountCategoryId === group.id);
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
export function SideSheetAccountList({
  categoryKey,
  group,
  accounts,
  allCategories,
  accountsByGroupMap,
}: {
  categoryKey: AccountCategory;
  group: AccountCategoryRow;
  accounts: AccountingAccountRow[];
  allCategories: AccountCategoryRow[];
  accountsByGroupMap: Record<string, any[]>;
}) {
  const childAccounts = useMemo(() => {
    if (!group) return [];
    // accountsByGroup에서 직접 가져옴 (카드 표시와 100% 동일)
    return accountsByGroupMap[String(group.id)] || [];
  }, [group, accountsByGroupMap]);

  const isFkMapped = useMemo(() => {
    if (!group) return false;
    return childAccounts.some((acc: AccountingAccountRow) => acc.accountCategoryId === group.id);
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
          {childAccounts.map((acc: AccountingAccountRow) => (
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

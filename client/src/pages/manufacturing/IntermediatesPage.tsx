/**
 * 중간재 관리 페이지 — PR #248
 *
 * URL: /dashboard/manufacturing/intermediates
 *
 * 기능:
 *   - 중간재 마스터 (h_intermediates) CRUD
 *   - 컴포넌트 (h_mixed_material_components) 관리 — 중간재 → 원재료 분해
 *   - 검색 + 카테고리 필터
 *
 * 사용 시나리오:
 *   - 통팥앙금/콩고물/카스테라가루 등 BOM 에서 사용되는 중간재 등록
 *   - 각 중간재의 원재료 비율 (ratio_percent / grams_per_kg) 설정
 *   - BOM (h_mf_ingredients) 가 중간재 ID 참조 → 생산 차감 시 components 분해 차감
 *
 * 작성: 2026-05-05
 */
import { useState } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, Search, Layers, Package, ChevronRight, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export default function IntermediatesPage() {
  return (
    <DashboardLayout>
      <IntermediatesContent />
    </DashboardLayout>
  );
}

function IntermediatesContent() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [componentsFor, setComponentsFor] = useState<any>(null);

  const utils = trpc.useUtils();
  const { data: intermediates = [], isLoading } = trpc.intermediate.list.useQuery({
    search: search.trim() || undefined,
    category: category === "all" ? undefined : category,
  });
  const { data: categories = [] } = trpc.intermediate.categoryList.useQuery();

  const deleteMut = trpc.intermediate.delete.useMutation({
    onSuccess: () => {
      utils.intermediate.list.invalidate();
      toast({ title: "중간재가 삭제되었습니다" });
    },
    onError: (e) => toast({ title: "삭제 실패", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Layers className="w-3.5 h-3.5 text-primary" />
            제조 마스터 데이터
          </div>
          <h1 className="text-2xl font-bold tracking-tight">중간재 관리</h1>
          <div className="text-xs text-muted-foreground mt-1">
            전체 <span className="font-semibold text-foreground">{intermediates.length}</span>건
            (통팥앙금, 콩고물, 카스테라가루 등 BOM 사용 중간재 등록 / 원재료 분해 비율 설정)
          </div>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="w-3.5 h-3.5 mr-1" /> 중간재 등록
            </Button>
          </DialogTrigger>
          <IntermediateDialog
            editing={null}
            categories={categories}
            onSuccess={() => {
              utils.intermediate.list.invalidate();
              utils.intermediate.categoryList.invalidate();
              setCreateOpen(false);
            }}
          />
        </Dialog>
      </div>

      {/* 검색 + 필터 */}
      <Card>
        <CardContent className="p-3 flex items-center gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="중간재명 / 코드 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-44 h-9">
              <SelectValue placeholder="카테고리 전체" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">카테고리 전체</SelectItem>
              {categories.map((c: string) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* 목록 */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">불러오는 중...</div>
          ) : intermediates.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Layers className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p>등록된 중간재가 없습니다</p>
              <p className="text-xs mt-1">우상단 [중간재 등록] 으로 추가하세요</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">코드</TableHead>
                  <TableHead>중간재명</TableHead>
                  <TableHead className="w-32">카테고리</TableHead>
                  <TableHead className="w-20">단위</TableHead>
                  <TableHead className="w-24 text-center">유통기한</TableHead>
                  <TableHead className="w-32 text-center">분해 원재료</TableHead>
                  <TableHead className="w-32 text-right">액션</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {intermediates.map((it: any) => (
                  <TableRow key={it.id} className="hover:bg-accent/40">
                    <TableCell className="font-mono text-xs">{it.intermediateCode}</TableCell>
                    <TableCell className="font-medium">{it.intermediateName}</TableCell>
                    <TableCell>
                      {it.category ? (
                        <Badge variant="secondary" className="text-[10px]">
                          {it.category}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{it.unit || "-"}</TableCell>
                    <TableCell className="text-center text-xs">
                      {it.shelfLifeDays ? `${it.shelfLifeDays}일` : "-"}
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7"
                        onClick={() => setComponentsFor(it)}
                      >
                        <Package className="w-3.5 h-3.5 mr-1" />
                        {it.componentCount}개
                        <ChevronRight className="w-3 h-3 ml-1" />
                      </Button>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => setEditing(it)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (confirm(`'${it.intermediateName}' 중간재를 삭제할까요?\n관련 컴포넌트도 함께 삭제됩니다.`)) {
                            deleteMut.mutate({ id: it.id });
                          }
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 수정 다이얼로그 */}
      <Dialog open={!!editing} onOpenChange={(v) => { if (!v) setEditing(null); }}>
        <IntermediateDialog
          editing={editing}
          categories={categories}
          onSuccess={() => {
            utils.intermediate.list.invalidate();
            utils.intermediate.categoryList.invalidate();
            setEditing(null);
          }}
        />
      </Dialog>

      {/* 컴포넌트 관리 다이얼로그 */}
      <Dialog open={!!componentsFor} onOpenChange={(v) => { if (!v) setComponentsFor(null); }}>
        {componentsFor && (
          <ComponentsDialog
            intermediate={componentsFor}
            onClose={() => {
              setComponentsFor(null);
              utils.intermediate.list.invalidate(); // 컴포넌트 카운트 갱신
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

// ─── 중간재 등록/수정 다이얼로그 ───
function IntermediateDialog({
  editing,
  categories,
  onSuccess,
}: {
  editing: any;
  categories: string[];
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    intermediateCode: editing?.intermediateCode ?? "",
    intermediateName: editing?.intermediateName ?? "",
    category: editing?.category ?? "",
    unit: editing?.unit ?? "kg",
    shelfLifeDays: editing?.shelfLifeDays ?? "",
    description: editing?.description ?? "",
  });

  const createMut = trpc.intermediate.create.useMutation({
    onSuccess: () => {
      toast({ title: "중간재가 등록되었습니다" });
      onSuccess();
    },
    onError: (e) => toast({ title: "등록 실패", description: e.message, variant: "destructive" }),
  });
  const updateMut = trpc.intermediate.update.useMutation({
    onSuccess: () => {
      toast({ title: "중간재 정보가 수정되었습니다" });
      onSuccess();
    },
    onError: (e) => toast({ title: "수정 실패", description: e.message, variant: "destructive" }),
  });

  const submit = () => {
    const payload = {
      intermediateCode: form.intermediateCode.trim(),
      intermediateName: form.intermediateName.trim(),
      category: form.category.trim() || undefined,
      unit: form.unit.trim() || undefined,
      shelfLifeDays: form.shelfLifeDays === "" ? undefined : Number(form.shelfLifeDays),
      description: form.description.trim() || undefined,
    };
    if (editing) {
      updateMut.mutate({ id: editing.id, ...payload });
    } else {
      createMut.mutate(payload);
    }
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{editing ? "중간재 수정" : "중간재 등록"}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>코드 *</Label>
            <Input
              value={form.intermediateCode}
              onChange={(e) => setForm({ ...form, intermediateCode: e.target.value })}
              placeholder="MIX-PAT"
              disabled={!!editing}
            />
          </div>
          <div>
            <Label>중간재명 *</Label>
            <Input
              value={form.intermediateName}
              onChange={(e) => setForm({ ...form, intermediateName: e.target.value })}
              placeholder="통팥앙금"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>카테고리</Label>
            <Input
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder="조림류 / 가루류 / 향료 등"
              list="category-suggestions"
            />
            <datalist id="category-suggestions">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div>
            <Label>단위</Label>
            <Input
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
              placeholder="kg"
            />
          </div>
        </div>
        <div>
          <Label>유통기한 (일)</Label>
          <Input
            type="number"
            value={form.shelfLifeDays}
            onChange={(e) => setForm({ ...form, shelfLifeDays: e.target.value })}
            placeholder="365"
          />
        </div>
        <div>
          <Label>설명</Label>
          <Textarea
            rows={2}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="제조 방법 / 보관 조건 등"
          />
        </div>
      </div>
      <DialogFooter>
        <Button
          onClick={submit}
          disabled={
            !form.intermediateCode.trim() ||
            !form.intermediateName.trim() ||
            createMut.isPending ||
            updateMut.isPending
          }
        >
          {createMut.isPending || updateMut.isPending ? "저장 중..." : "저장"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ─── 컴포넌트 관리 다이얼로그 (중간재 → 원재료 분해) ───
function ComponentsDialog({
  intermediate,
  onClose,
}: {
  intermediate: any;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const { data: components = [], isLoading } = trpc.intermediate.componentList.useQuery({
    intermediateId: intermediate.id,
  });
  const { data: materials = [] } = trpc.material.list.useQuery({});
  const [addOpen, setAddOpen] = useState(false);

  const addMut = trpc.intermediate.componentAdd.useMutation({
    onSuccess: () => {
      utils.intermediate.componentList.invalidate();
      toast({ title: "원재료가 추가되었습니다" });
      setAddOpen(false);
    },
    onError: (e) => toast({ title: "추가 실패", description: e.message, variant: "destructive" }),
  });
  const removeMut = trpc.intermediate.componentRemove.useMutation({
    onSuccess: () => {
      utils.intermediate.componentList.invalidate();
    },
  });

  const totalRatio = components.reduce(
    (sum: number, c: any) => sum + (c.ratioPercent || 0),
    0,
  );

  return (
    <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-primary" />
          {intermediate.intermediateName}
          <Badge variant="secondary" className="text-[10px] font-mono">
            {intermediate.intermediateCode}
          </Badge>
        </DialogTitle>
        <p className="text-xs text-muted-foreground">
          이 중간재를 만드는 데 들어가는 원재료 구성. BOM 에서 이 중간재를 사용하면 자동으로 분해 차감됩니다.
        </p>
      </DialogHeader>

      {/* 합계 표시 */}
      <div className="flex items-center justify-between bg-muted/50 rounded p-2 text-sm">
        <span className="text-muted-foreground">
          총 {components.length}개 원재료 / 비율 합계{" "}
          <span className={`font-semibold ${totalRatio > 100 ? "text-red-500" : totalRatio === 100 ? "text-emerald-500" : "text-foreground"}`}>
            {totalRatio.toFixed(2)}%
          </span>
        </span>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="w-3.5 h-3.5 mr-1" /> 원재료 추가
            </Button>
          </DialogTrigger>
          <ComponentAddDialog
            materials={materials as any[]}
            existing={components as any[]}
            onAdd={(data) => addMut.mutate({ intermediateId: intermediate.id, ...data })}
            isPending={addMut.isPending}
          />
        </Dialog>
      </div>

      {/* 컴포넌트 표 */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">불러오는 중...</div>
      ) : components.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Package className="w-12 h-12 mx-auto mb-2 opacity-30" />
          <p>분해 원재료가 없습니다</p>
          <p className="text-xs mt-1">"+ 원재료 추가" 로 등록하세요</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">코드</TableHead>
              <TableHead>원재료명</TableHead>
              <TableHead className="w-24 text-right">비율 %</TableHead>
              <TableHead className="w-24 text-right">g/kg</TableHead>
              <TableHead>비고</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {components.map((c: any) => (
              <TableRow key={c.id}>
                <TableCell className="font-mono text-xs">{c.materialCode || "-"}</TableCell>
                <TableCell className="text-sm">{c.materialName || `(미매칭 #${c.componentMaterialId})`}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {c.ratioPercent !== null ? `${c.ratioPercent}%` : "-"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {c.gramsPerKg !== null ? `${c.gramsPerKg} g` : "-"}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{c.note || "-"}</TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (confirm(`'${c.materialName}' 을(를) 제거할까요?`)) {
                        removeMut.mutate({ id: c.id });
                      }
                    }}
                  >
                    <X className="w-3.5 h-3.5 text-red-500" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          닫기
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ─── 원재료 추가 다이얼로그 ───
function ComponentAddDialog({
  materials,
  existing,
  onAdd,
  isPending,
}: {
  materials: any[];
  existing: any[];
  onAdd: (data: { componentMaterialId: number; ratioPercent?: number; gramsPerKg?: number; note?: string }) => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState({
    componentMaterialId: 0,
    ratioPercent: "",
    gramsPerKg: "",
    note: "",
  });
  const [search, setSearch] = useState("");

  // 이미 추가된 원재료는 제외
  const existingIds = new Set(existing.map((c) => c.componentMaterialId));
  const filteredMaterials = (materials as any[])
    .filter((m) => !existingIds.has(Number(m.id)))
    .filter((m) => {
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return (
        m.materialName?.toLowerCase().includes(q) ||
        m.materialCode?.toLowerCase().includes(q)
      );
    })
    .slice(0, 50);

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>원재료 추가</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>원재료 검색 + 선택</Label>
          <Input
            placeholder="이름 / 코드"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="border rounded mt-2 max-h-48 overflow-y-auto">
            {filteredMaterials.length === 0 ? (
              <div className="text-center py-4 text-xs text-muted-foreground">
                {search ? "일치하는 원재료가 없습니다" : "원재료를 검색하세요"}
              </div>
            ) : (
              filteredMaterials.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setForm({ ...form, componentMaterialId: Number(m.id) })}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-accent ${
                    form.componentMaterialId === Number(m.id) ? "bg-accent" : ""
                  }`}
                >
                  <div className="font-medium">{m.materialName}</div>
                  <div className="text-xs text-muted-foreground">
                    {m.materialCode} {m.unit && `· ${m.unit}`}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>비율 (%)</Label>
            <Input
              type="number"
              step={0.01}
              value={form.ratioPercent}
              onChange={(e) => setForm({ ...form, ratioPercent: e.target.value })}
              placeholder="50"
            />
          </div>
          <div>
            <Label>g/kg</Label>
            <Input
              type="number"
              step={0.01}
              value={form.gramsPerKg}
              onChange={(e) => setForm({ ...form, gramsPerKg: e.target.value })}
              placeholder="500"
            />
          </div>
        </div>
        <div>
          <Label>비고 (원산지 등)</Label>
          <Input
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder="국내산 / 중국산 등"
          />
        </div>
      </div>
      <DialogFooter>
        <Button
          onClick={() =>
            onAdd({
              componentMaterialId: form.componentMaterialId,
              ratioPercent: form.ratioPercent ? Number(form.ratioPercent) : undefined,
              gramsPerKg: form.gramsPerKg ? Number(form.gramsPerKg) : undefined,
              note: form.note.trim() || undefined,
            })
          }
          disabled={!form.componentMaterialId || isPending}
        >
          {isPending ? "추가 중..." : "추가"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

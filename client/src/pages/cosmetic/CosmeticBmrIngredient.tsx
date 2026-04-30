/**
 * 화장품 BMR 원료 투입 페이지 (Phase 2-4b)
 *
 * 라우트: /dashboard/cosmetic/bmr/:id/ingredient
 *
 * 기능:
 *   1. BMR 별 원료 투입 목록 (planned vs actual)
 *   2. 신규 원료 행 추가 (계획량만 또는 실측 포함)
 *   3. 실측 후 actualQuantity 업데이트 (inline)
 *   4. 요약 카드: total/pending/planned 합산/actual 합산/variance
 *   5. LOT 번호 추적 (원료 추적성 — 향후 LOT 통합)
 */

import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  PlusCircle,
  Trash2,
  CheckCircle2,
  Clock,
  Beaker,
  Package,
} from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { toast } from "@/hooks/use-toast";

export default function CosmeticBmrIngredient() {
  const [, params] = useRoute("/dashboard/cosmetic/bmr/:id/ingredient");
  const [, navigate] = useLocation();
  const bmrId = Number(params?.id ?? 0);

  const { data: bmr } = trpc.cosmetic.bmr.getById.useQuery(
    { id: bmrId },
    { enabled: bmrId > 0 },
  );
  const {
    data: ingredients,
    isLoading,
    refetch,
  } = trpc.cosmetic.bmrIngredient.listByBmr.useQuery(
    { bmrId },
    { enabled: bmrId > 0, refetchInterval: 60_000 },
  );
  const { data: summary } = trpc.cosmetic.bmrIngredient.summaryByBmr.useQuery(
    { bmrId },
    { enabled: bmrId > 0 },
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [editingActual, setEditingActual] = useState<{
    id: number;
    value: string;
  } | null>(null);

  // 신규 원료 폼
  const [matName, setMatName] = useState("");
  const [matCode, setMatCode] = useState("");
  const [inciName, setInciName] = useState("");
  const [lotNumber, setLotNumber] = useState("");
  const [plannedQty, setPlannedQty] = useState("");
  const [actualQty, setActualQty] = useState("");
  const [unit, setUnit] = useState("g");
  const [notes, setNotes] = useState("");

  const createMutation = trpc.cosmetic.bmrIngredient.create.useMutation();
  const updateMutation = trpc.cosmetic.bmrIngredient.update.useMutation();
  const deleteMutation = trpc.cosmetic.bmrIngredient.delete.useMutation();

  const resetForm = () => {
    setMatName("");
    setMatCode("");
    setInciName("");
    setLotNumber("");
    setPlannedQty("");
    setActualQty("");
    setUnit("g");
    setNotes("");
  };

  const handleAdd = async () => {
    if (!matName.trim()) {
      toast({ title: "원료명 필수", variant: "destructive" });
      return;
    }
    const planned = plannedQty === "" ? undefined : Number(plannedQty);
    const actual = actualQty === "" ? undefined : Number(actualQty);
    if (planned !== undefined && (!Number.isFinite(planned) || planned < 0)) {
      toast({ title: "계획량은 0 이상", variant: "destructive" });
      return;
    }
    if (actual !== undefined && (!Number.isFinite(actual) || actual < 0)) {
      toast({ title: "실제량은 0 이상", variant: "destructive" });
      return;
    }
    try {
      await createMutation.mutateAsync({
        bmrId,
        materialName: matName.trim(),
        materialCode: matCode.trim() || undefined,
        inciName: inciName.trim() || undefined,
        lotNumber: lotNumber.trim() || undefined,
        plannedQuantity: planned,
        actualQuantity: actual,
        unit: unit.trim() || "g",
        notes: notes.trim() || undefined,
      });
      toast({ title: "원료 행 추가" });
      resetForm();
      setCreateOpen(false);
      refetch();
    } catch (e: any) {
      toast({
        title: "추가 실패",
        description: e?.message ?? String(e),
        variant: "destructive",
      });
    }
  };

  const handleSaveActual = async (id: number) => {
    if (!editingActual || editingActual.id !== id) return;
    const val = editingActual.value === "" ? null : Number(editingActual.value);
    if (val !== null && (!Number.isFinite(val) || val < 0)) {
      toast({ title: "실제량은 0 이상", variant: "destructive" });
      return;
    }
    try {
      await updateMutation.mutateAsync({ id, actualQuantity: val });
      toast({ title: "실제량 저장" });
      setEditingActual(null);
      refetch();
    } catch (e: any) {
      toast({
        title: "저장 실패",
        description: e?.message ?? String(e),
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("이 원료 행을 삭제하시겠습니까?")) return;
    try {
      const result = await deleteMutation.mutateAsync({ id });
      if (!result.deleted) {
        toast({ title: "삭제 실패", variant: "destructive" });
        return;
      }
      toast({ title: "삭제 완료" });
      refetch();
    } catch (e: any) {
      toast({
        title: "삭제 실패",
        description: e?.message ?? String(e),
        variant: "destructive",
      });
    }
  };

  if (bmrId <= 0) {
    return (
      <DashboardLayout>
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            잘못된 BMR ID
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div>
            <Button
              variant="ghost"
              size="sm"
              className="mb-2 -ml-3"
              onClick={() => navigate(`/dashboard/cosmetic/bmr/${bmrId}`)}
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              BMR 상세로
            </Button>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Beaker className="w-6 h-6 text-amber-600" />
              원료 투입 기록
            </h1>
            <p className="text-sm text-muted-foreground mt-1 font-mono">
              {bmr?.bmrCode ?? `BMR #${bmrId}`}
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <PlusCircle className="w-4 h-4 mr-1" />
            원료 행 추가
          </Button>
        </div>

        {/* 요약 카드 */}
        {summary && summary.total > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                {summary.allActual ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <Clock className="w-4 h-4 text-amber-600" />
                )}
                투입 요약
              </CardTitle>
              <CardDescription>
                {summary.allActual
                  ? "✅ 모든 원료 실측 완료 — BMR completed 전이 가능"
                  : `⏳ ${summary.pendingActual}개 항목 실측 대기 중`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <SumTile label="총 항목" value={`${summary.total}개`} icon={<Package className="w-4 h-4 text-muted-foreground" />} />
                <SumTile
                  label="실측 대기"
                  value={`${summary.pendingActual}개`}
                  icon={<Clock className="w-4 h-4 text-amber-600" />}
                  highlight={summary.pendingActual > 0}
                />
                <SumTile
                  label="계획 합산"
                  value={`${summary.totalPlanned.toLocaleString("ko-KR")}`}
                  icon={<Package className="w-4 h-4 text-blue-600" />}
                />
                <SumTile
                  label="실측 합산 (차이)"
                  value={`${summary.totalActual.toLocaleString("ko-KR")} (${
                    summary.variance >= 0 ? "+" : ""
                  }${summary.variance.toLocaleString("ko-KR")})`}
                  icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                  highlight={Math.abs(summary.variance) > 0.01}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* 원료 목록 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-baseline justify-between">
              <span>원료 투입 목록 {ingredients ? `(${ingredients.length}건)` : ""}</span>
              <span className="text-xs text-muted-foreground font-normal">
                자동 갱신 60초
              </span>
            </CardTitle>
            <CardDescription>
              실제 투입량을 클릭하여 즉시 수정 가능. 향후 배합표 (Phase 2-4a) 자동 채움 예정.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-sm text-muted-foreground py-8 text-center">로딩 중...</div>
            ) : !ingredients || ingredients.length === 0 ? (
              <div className="py-12 text-center">
                <Beaker className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">투입 원료 0건</p>
                <p className="text-xs text-muted-foreground mt-2">
                  우측 상단 "원료 행 추가" 버튼으로 첫 항목을 추가하세요.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>원료명</TableHead>
                    <TableHead className="w-32">코드</TableHead>
                    <TableHead className="w-32">LOT</TableHead>
                    <TableHead className="w-28 text-right">계획량</TableHead>
                    <TableHead className="w-32 text-right">실제량 (클릭)</TableHead>
                    <TableHead className="w-16">단위</TableHead>
                    <TableHead className="w-12 text-right"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ingredients.map((ing) => (
                    <TableRow key={ing.id}>
                      <TableCell className="text-sm font-medium">
                        {ing.materialName}
                        {ing.inciName && (
                          <div className="text-xs text-muted-foreground font-mono">
                            {ing.inciName}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {ing.materialCode ?? "-"}
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        {ing.lotNumber ?? <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {ing.plannedQuantity !== null
                          ? ing.plannedQuantity.toLocaleString("ko-KR")
                          : <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        {editingActual?.id === ing.id ? (
                          <div className="flex gap-1 items-center">
                            <Input
                              type="number"
                              step="0.0001"
                              min="0"
                              value={editingActual.value}
                              onChange={(e) =>
                                setEditingActual({ id: ing.id, value: e.target.value })
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleSaveActual(ing.id);
                                if (e.key === "Escape") setEditingActual(null);
                              }}
                              className="h-7 text-right text-sm"
                              autoFocus
                            />
                            <Button
                              size="sm"
                              className="h-7 px-2"
                              onClick={() => handleSaveActual(ing.id)}
                            >
                              ✓
                            </Button>
                          </div>
                        ) : (
                          <button
                            className="text-sm font-medium hover:underline cursor-pointer"
                            onClick={() =>
                              setEditingActual({
                                id: ing.id,
                                value:
                                  ing.actualQuantity !== null
                                    ? String(ing.actualQuantity)
                                    : "",
                              })
                            }
                          >
                            {ing.actualQuantity !== null ? (
                              ing.actualQuantity.toLocaleString("ko-KR")
                            ) : (
                              <Badge variant="secondary" className="text-xs">
                                실측 입력
                              </Badge>
                            )}
                          </button>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{ing.unit}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(ing.id)}
                        >
                          <Trash2 className="w-4 h-4 text-muted-foreground" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="bg-muted/30 border-dashed">
          <CardHeader>
            <CardTitle className="text-sm">향후 확장</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1">
            <p>• 배합표 (Phase 2-4a) 자동 채움 — active formula 선택 → ingredient 자동 prefill</p>
            <p>• LOT 추적 — h_inventory_lots 와 통합 (FEFO 자동 할당)</p>
            <p>• Phase 2-5 — 라벨/전성분 자동 생성 (INCI name 활용)</p>
          </CardContent>
        </Card>
      </div>

      {/* 신규 원료 dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>원료 행 추가</DialogTitle>
            <DialogDescription>
              계획량만 먼저 등록 가능 (실측은 나중에 클릭으로 입력).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="bmrIngName">원료명 *</Label>
                <Input
                  id="bmrIngName"
                  value={matName}
                  onChange={(e) => setMatName(e.target.value)}
                  placeholder="예: 정제수"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bmrIngCode">코드</Label>
                <Input
                  id="bmrIngCode"
                  value={matCode}
                  onChange={(e) => setMatCode(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bmrIngInci">INCI 명칭</Label>
              <Input
                id="bmrIngInci"
                value={inciName}
                onChange={(e) => setInciName(e.target.value)}
                placeholder="예: Water"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bmrIngLot">LOT 번호 (원료 추적)</Label>
              <Input
                id="bmrIngLot"
                value={lotNumber}
                onChange={(e) => setLotNumber(e.target.value)}
                placeholder="예: ML-20260415-001"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="bmrPlanned">계획량</Label>
                <Input
                  id="bmrPlanned"
                  type="number"
                  step="0.0001"
                  min="0"
                  value={plannedQty}
                  onChange={(e) => setPlannedQty(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bmrActual">실제량 (선택)</Label>
                <Input
                  id="bmrActual"
                  type="number"
                  step="0.0001"
                  min="0"
                  value={actualQty}
                  onChange={(e) => setActualQty(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bmrUnit">단위</Label>
                <Input
                  id="bmrUnit"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="g / mL / kg"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bmrIngNotes">메모</Label>
              <Textarea
                id="bmrIngNotes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              취소
            </Button>
            <Button onClick={handleAdd}>추가</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

function SumTile(props: {
  label: string;
  value: string;
  icon: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={`p-3 rounded-lg border ${
        props.highlight ? "bg-amber-50 border-amber-200" : "bg-card"
      }`}
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
        {props.icon}
        <span>{props.label}</span>
      </div>
      <div className="text-lg font-semibold">{props.value}</div>
    </div>
  );
}

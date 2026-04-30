/**
 * 배합표 상세 페이지 (Phase 2-4a)
 *
 * 라우트: /dashboard/cosmetic/formula/:id
 *
 * 기능:
 *   - 헤더 정보 표시
 *   - 배합 항목 목록 + 합산 % 검증 (100% 권장)
 *   - draft 상태에서만 항목 추가/삭제
 *   - 상태 전이 버튼 (draft → approved → active → deprecated)
 *   - 헤더 수정 버튼 (draft 만)
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
  FlaskConical,
  PlusCircle,
  Trash2,
  CheckCircle2,
  Pencil,
  PlayCircle,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { toast } from "@/hooks/use-toast";
import { CosmeticFormulaDialog } from "./CosmeticFormulaDialog";

const STATUS_LABEL: Record<string, string> = {
  draft: "작성 중",
  approved: "승인",
  active: "운영 표준",
  deprecated: "구버전",
};
const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  draft: "secondary",
  approved: "default",
  active: "default",
  deprecated: "destructive",
};

export default function CosmeticFormulaDetail() {
  const [, params] = useRoute("/dashboard/cosmetic/formula/:id");
  const [, navigate] = useLocation();
  const id = Number(params?.id ?? 0);

  const { data: formula, refetch: refetchFormula } =
    trpc.cosmetic.formula.getById.useQuery({ id }, { enabled: id > 0 });
  const { data: ingredients, refetch: refetchIngredients } =
    trpc.cosmetic.formula.listIngredients.useQuery(
      { formulaId: id },
      { enabled: id > 0 },
    );
  const { data: summary } = trpc.cosmetic.formula.ingredientSummary.useQuery(
    { formulaId: id },
    { enabled: id > 0 },
  );

  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  // 항목 추가 상태
  const [matName, setMatName] = useState("");
  const [matCode, setMatCode] = useState("");
  const [inciName, setInciName] = useState("");
  const [percentage, setPercentage] = useState("");
  const [role, setRole] = useState("");
  const [notes, setNotes] = useState("");

  const addIngredient = trpc.cosmetic.formula.addIngredient.useMutation();
  const deleteIngredient = trpc.cosmetic.formula.deleteIngredient.useMutation();
  const approveMutation = trpc.cosmetic.formula.approve.useMutation();
  const activateMutation = trpc.cosmetic.formula.activate.useMutation();
  const deprecateMutation = trpc.cosmetic.formula.deprecate.useMutation();
  const deleteFormulaMutation = trpc.cosmetic.formula.deleteDraft.useMutation();

  const refresh = () => {
    refetchFormula();
    refetchIngredients();
  };

  const handleAddIngredient = async () => {
    const pct = Number(percentage);
    if (!matName.trim()) {
      toast({ title: "원료명 필수", variant: "destructive" });
      return;
    }
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
      toast({ title: "배합비 0 < % ≤ 100", variant: "destructive" });
      return;
    }
    try {
      await addIngredient.mutateAsync({
        formulaId: id,
        materialName: matName.trim(),
        materialCode: matCode.trim() || undefined,
        inciName: inciName.trim() || undefined,
        percentage: pct,
        role: role.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      toast({ title: "배합 항목 추가" });
      setMatName("");
      setMatCode("");
      setInciName("");
      setPercentage("");
      setRole("");
      setNotes("");
      setAddOpen(false);
      refresh();
    } catch (e: any) {
      toast({
        title: "추가 실패",
        description: e?.message ?? String(e),
        variant: "destructive",
      });
    }
  };

  const handleDeleteIngredient = async (ingId: number) => {
    if (!confirm("이 배합 항목을 삭제하시겠습니까?")) return;
    try {
      const result = await deleteIngredient.mutateAsync({ id: ingId });
      if (!result.deleted) {
        toast({
          title: "삭제 실패",
          description: result.reason ?? "삭제 불가",
          variant: "destructive",
        });
        return;
      }
      toast({ title: "삭제 완료" });
      refresh();
    } catch (e: any) {
      toast({
        title: "삭제 실패",
        description: e?.message ?? String(e),
        variant: "destructive",
      });
    }
  };

  const handleTransition = async (
    fn: () => Promise<any>,
    label: string,
  ) => {
    try {
      const result = await fn();
      if (result?.ok === false) {
        toast({
          title: `${label} 실패`,
          description: result.reason ?? "허용되지 않은 전이",
          variant: "destructive",
        });
        return;
      }
      toast({ title: `${label} 완료` });
      refresh();
    } catch (e: any) {
      toast({
        title: `${label} 실패`,
        description: e?.message ?? String(e),
        variant: "destructive",
      });
    }
  };

  const handleDeleteFormula = async () => {
    if (!confirm("draft 배합표를 삭제합니다 (배합 항목도 함께 삭제). 계속?")) return;
    try {
      const result = await deleteFormulaMutation.mutateAsync({ id });
      if (!result.deleted) {
        toast({
          title: "삭제 실패",
          description: result.reason ?? "draft 만 삭제 가능",
          variant: "destructive",
        });
        return;
      }
      toast({ title: "배합표 삭제 완료" });
      navigate("/dashboard/cosmetic/formula");
    } catch (e: any) {
      toast({
        title: "삭제 실패",
        description: e?.message ?? String(e),
        variant: "destructive",
      });
    }
  };

  if (!formula) {
    return (
      <DashboardLayout>
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            로딩 중...
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  const isDraft = formula.status === "draft";
  const isApproved = formula.status === "approved";
  const isActive = formula.status === "active";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* 헤더 */}
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div>
            <Button
              variant="ghost"
              size="sm"
              className="mb-2 -ml-3"
              onClick={() => navigate("/dashboard/cosmetic/formula")}
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              목록
            </Button>
            <h1 className="text-2xl font-semibold flex items-center gap-2 font-mono">
              <FlaskConical className="w-6 h-6 text-fuchsia-600" />
              {formula.formulaCode}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {formula.name} · v{formula.version} · 제품 #{formula.productId}
            </p>
          </div>
          <Badge variant={STATUS_VARIANT[formula.status] ?? "default"} className="text-sm">
            {STATUS_LABEL[formula.status] ?? formula.status}
          </Badge>
        </div>

        {/* 액션 버튼 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">액션</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {isDraft && (
              <>
                <Button onClick={() => setEditOpen(true)} variant="outline">
                  <Pencil className="w-4 h-4 mr-1" /> 헤더 수정
                </Button>
                <Button
                  onClick={() =>
                    handleTransition(
                      () => approveMutation.mutateAsync({ id }),
                      "QA 승인",
                    )
                  }
                  variant="default"
                >
                  <CheckCircle2 className="w-4 h-4 mr-1" /> QA 승인
                </Button>
                <Button onClick={handleDeleteFormula} variant="ghost">
                  <Trash2 className="w-4 h-4 mr-1" /> 삭제
                </Button>
              </>
            )}
            {isApproved && (
              <Button
                onClick={() =>
                  handleTransition(
                    () => activateMutation.mutateAsync({ id }),
                    "운영 표준 활성화",
                  )
                }
                variant="default"
              >
                <PlayCircle className="w-4 h-4 mr-1" /> 운영 표준 활성화
              </Button>
            )}
            {(isApproved || isActive) && (
              <Button
                onClick={() =>
                  handleTransition(
                    () => deprecateMutation.mutateAsync({ id }),
                    "구버전 처리",
                  )
                }
                variant="destructive"
              >
                <XCircle className="w-4 h-4 mr-1" /> 구버전 처리
              </Button>
            )}
            {!isDraft && !isApproved && !isActive && (
              <p className="text-sm text-muted-foreground">현재 상태에서 추가 액션 없음</p>
            )}
          </CardContent>
        </Card>

        {/* 합산 검증 */}
        {summary && (
          <Card
            className={
              summary.totalCount === 0
                ? ""
                : summary.isHundred
                ? "border-emerald-200 bg-emerald-50/50"
                : "border-amber-200 bg-amber-50/50"
            }
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                {summary.totalCount === 0 ? (
                  <AlertTriangle className="w-4 h-4 text-muted-foreground" />
                ) : summary.isHundred ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                )}
                배합비 합산 검증
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <div className="flex items-baseline gap-3">
                <span className="text-muted-foreground">총 항목</span>
                <span className="font-medium">{summary.totalCount}개</span>
                <span className="text-muted-foreground ml-4">합산 %</span>
                <span className="font-medium font-mono">
                  {summary.totalPercentage.toFixed(4)}%
                </span>
              </div>
              {summary.totalCount > 0 && !summary.isHundred && (
                <p className="text-xs text-amber-700 mt-2">
                  ⚠️ 100% 가 아닙니다 — 누락 또는 초과 — 조정 후 승인 권장
                </p>
              )}
              {summary.isHundred && (
                <p className="text-xs text-emerald-700 mt-2">
                  ✅ 합산 100% — 승인 가능
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* 배합 항목 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-baseline justify-between">
              <span>배합 항목</span>
              {isDraft && (
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => setAddOpen(true)}
                >
                  <PlusCircle className="w-4 h-4 mr-1" />
                  항목 추가
                </Button>
              )}
            </CardTitle>
            <CardDescription>
              draft 상태에서만 추가/삭제 가능. 승인 후엔 read-only.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!ingredients || ingredients.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                배합 항목 0개 — {isDraft ? "우측 상단 버튼으로 추가" : "(이 상태에선 추가 불가)"}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>원료명</TableHead>
                    <TableHead className="w-32">코드</TableHead>
                    <TableHead className="w-40">INCI 명칭</TableHead>
                    <TableHead className="w-28 text-right">배합비 (%)</TableHead>
                    <TableHead className="w-28">역할</TableHead>
                    <TableHead className="w-12 text-right"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ingredients.map((ing) => (
                    <TableRow key={ing.id}>
                      <TableCell className="text-sm font-medium">
                        {ing.materialName}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {ing.materialCode ?? "-"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {ing.inciName ?? "-"}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {ing.percentage.toFixed(4)}
                      </TableCell>
                      <TableCell className="text-xs">{ing.role ?? "-"}</TableCell>
                      <TableCell className="text-right">
                        {isDraft && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteIngredient(ing.id)}
                          >
                            <Trash2 className="w-4 h-4 text-muted-foreground" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {formula.description && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">설명</CardTitle>
            </CardHeader>
            <CardContent className="text-sm whitespace-pre-wrap">
              {formula.description}
            </CardContent>
          </Card>
        )}
      </div>

      {/* 헤더 수정 dialog */}
      <CosmeticFormulaDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        mode="edit"
        formula={formula}
        onSuccess={refresh}
      />

      {/* 배합 항목 추가 dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>배합 항목 추가</DialogTitle>
            <DialogDescription>
              원료 + 배합비 (%) 입력. 합산 100% 가 되도록 관리.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="matName">원료명 *</Label>
                <Input
                  id="matName"
                  value={matName}
                  onChange={(e) => setMatName(e.target.value)}
                  placeholder="예: 정제수 / 글리세린"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="matCode">코드 (선택)</Label>
                <Input
                  id="matCode"
                  value={matCode}
                  onChange={(e) => setMatCode(e.target.value)}
                  placeholder="MAT-001"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inciName">INCI 명칭 (전성분 표시용)</Label>
              <Input
                id="inciName"
                value={inciName}
                onChange={(e) => setInciName(e.target.value)}
                placeholder="예: Water / Glycerin"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pct">배합비 (%) *</Label>
                <Input
                  id="pct"
                  type="number"
                  step="0.0001"
                  min="0.0001"
                  max="100"
                  value={percentage}
                  onChange={(e) => setPercentage(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="role">역할 (선택)</Label>
                <Input
                  id="role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="solvent / emulsifier 등"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ingNotes">메모</Label>
              <Textarea
                id="ingNotes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              취소
            </Button>
            <Button onClick={handleAddIngredient}>추가</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

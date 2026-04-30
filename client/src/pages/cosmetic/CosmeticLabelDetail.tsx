/**
 * 라벨 상세 페이지 (Phase 2-5)
 *
 * 라우트: /dashboard/cosmetic/label/:id
 *
 * 주요 기능:
 *   1. 라벨 헤더 (제품명/용량/제조사) — Edit dialog
 *   2. 전성분 (INCI) 입력 + 알러지 자동 검출
 *   3. 사용방법 / 주의사항 / 보관방법 입력
 *   4. 라벨 미리보기 (실제 라벨 레이아웃 모방)
 *   5. 상태 전이 (draft → approved → active → deprecated)
 */

import { useEffect, useState } from "react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  Tag,
  Pencil,
  CheckCircle2,
  PlayCircle,
  XCircle,
  AlertCircle,
  Save,
  AlertTriangle,
} from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { toast } from "@/hooks/use-toast";
import { CosmeticLabelDialog } from "./CosmeticLabelDialog";

const STATUS_LABEL: Record<string, string> = {
  draft: "작성 중",
  approved: "승인",
  active: "사용 중",
  deprecated: "구버전",
};
const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  draft: "secondary",
  approved: "default",
  active: "default",
  deprecated: "destructive",
};

export default function CosmeticLabelDetail() {
  const [, params] = useRoute("/dashboard/cosmetic/label/:id");
  const [, navigate] = useLocation();
  const id = Number(params?.id ?? 0);

  const { data: label, refetch } = trpc.cosmetic.label.getById.useQuery(
    { id },
    { enabled: id > 0 },
  );

  const [editOpen, setEditOpen] = useState(false);

  // Editable text fields (textarea)
  const [inciList, setInciList] = useState("");
  const [usageInstructions, setUsageInstructions] = useState("");
  const [cautions, setCautions] = useState("");
  const [storageMethod, setStorageMethod] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (label) {
      setInciList(label.inciList ?? "");
      setUsageInstructions(label.usageInstructions ?? "");
      setCautions(label.cautions ?? "");
      setStorageMethod(label.storageMethod ?? "");
      setDirty(false);
    }
  }, [label?.id]);

  // 알러지 자동 검출 — INCI 변경 시
  const allergenQuery = trpc.cosmetic.label.detectAllergens.useQuery(
    { inciText: inciList },
    { enabled: inciList.length > 0 },
  );

  const updateMutation = trpc.cosmetic.label.updateDraft.useMutation();
  const approveMutation = trpc.cosmetic.label.approve.useMutation();
  const activateMutation = trpc.cosmetic.label.activate.useMutation();
  const deprecateMutation = trpc.cosmetic.label.deprecate.useMutation();
  const deleteMutation = trpc.cosmetic.label.deleteDraft.useMutation();

  const handleSaveTextFields = async () => {
    if (!label || label.status !== "draft") return;
    try {
      const result = await updateMutation.mutateAsync({
        id: label.id,
        inciList: inciList || null,
        usageInstructions: usageInstructions || null,
        cautions: cautions || null,
        storageMethod: storageMethod || null,
        allergenList:
          allergenQuery.data?.detected.join(", ") || null,
      });
      if (!result.updated) {
        toast({
          title: "저장 실패",
          description: result.reason ?? "draft 만 저장 가능",
          variant: "destructive",
        });
        return;
      }
      toast({ title: "저장 완료" });
      setDirty(false);
      refetch();
    } catch (e: any) {
      toast({
        title: "저장 실패",
        description: e?.message ?? String(e),
        variant: "destructive",
      });
    }
  };

  const handleTransition = async (fn: () => Promise<any>, label_: string) => {
    try {
      const result = await fn();
      if (result?.ok === false) {
        toast({
          title: `${label_} 실패`,
          description: result.reason ?? "전이 불가",
          variant: "destructive",
        });
        return;
      }
      toast({ title: `${label_} 완료` });
      refetch();
    } catch (e: any) {
      toast({
        title: `${label_} 실패`,
        description: e?.message ?? String(e),
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!confirm("draft 라벨을 삭제하시겠습니까?")) return;
    try {
      const result = await deleteMutation.mutateAsync({ id });
      if (!result.deleted) {
        toast({
          title: "삭제 실패",
          description: result.reason ?? "draft 만 삭제 가능",
          variant: "destructive",
        });
        return;
      }
      toast({ title: "라벨 삭제" });
      navigate("/dashboard/cosmetic/label");
    } catch (e: any) {
      toast({
        title: "삭제 실패",
        description: e?.message ?? String(e),
        variant: "destructive",
      });
    }
  };

  if (!label) {
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

  const isDraft = label.status === "draft";
  const isApproved = label.status === "approved";
  const isActive = label.status === "active";
  const detectedAllergens = allergenQuery.data?.detected ?? [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div>
            <Button
              variant="ghost"
              size="sm"
              className="mb-2 -ml-3"
              onClick={() => navigate("/dashboard/cosmetic/label")}
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              목록
            </Button>
            <h1 className="text-2xl font-semibold flex items-center gap-2 font-mono">
              <Tag className="w-6 h-6 text-rose-600" />
              {label.labelCode}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {label.productNameKo}
              {label.productNameEn && ` (${label.productNameEn})`}
              {label.capacity && ` · ${label.capacity}`}
            </p>
          </div>
          <Badge variant={STATUS_VARIANT[label.status] ?? "default"} className="text-sm">
            {STATUS_LABEL[label.status] ?? label.status}
          </Badge>
        </div>

        {/* 액션 */}
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
                <Button onClick={handleDelete} variant="ghost">
                  삭제
                </Button>
              </>
            )}
            {isApproved && (
              <Button
                onClick={() =>
                  handleTransition(
                    () => activateMutation.mutateAsync({ id }),
                    "사용 활성화",
                  )
                }
                variant="default"
              >
                <PlayCircle className="w-4 h-4 mr-1" /> 사용 활성화
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
          </CardContent>
        </Card>

        {/* 전성분 + 알러지 검출 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">전성분 (INCI)</CardTitle>
            <CardDescription>
              KFDA 화장품법 § 19 표기 의무 — 함량 1% 초과 시 내림차순, 1% 이하 임의.
              알러지 유발물질 22종은 자동 검출 + 별도 표시.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              rows={4}
              value={inciList}
              onChange={(e) => {
                setInciList(e.target.value);
                setDirty(true);
              }}
              disabled={!isDraft}
              placeholder="예: Water, Glycerin, Butylene Glycol, Niacinamide, Phenoxyethanol, Linalool, Limonene..."
              className="font-mono text-sm"
            />
            {detectedAllergens.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs">
                <div className="flex items-center gap-2 font-medium text-amber-900 mb-1">
                  <AlertCircle className="w-4 h-4" />
                  KFDA 알러지 유발물질 감지 ({detectedAllergens.length}개)
                </div>
                <div className="text-amber-800 font-mono">
                  {detectedAllergens.join(", ")}
                </div>
                <div className="text-amber-700 mt-1">
                  → 라벨에 별도 표시 의무 (관련 법령: 화장품법 시행규칙)
                </div>
              </div>
            )}
            {label.allergenList && (
              <div className="text-xs text-muted-foreground">
                저장된 알러지 목록: {label.allergenList}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 사용 정보 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">사용 정보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="lblUsage">사용방법</Label>
              <Textarea
                id="lblUsage"
                rows={3}
                value={usageInstructions}
                onChange={(e) => {
                  setUsageInstructions(e.target.value);
                  setDirty(true);
                }}
                disabled={!isDraft}
                placeholder="예: 적당량을 취하여 부드럽게 펴 발라주세요."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lblCautions">사용 시 주의사항</Label>
              <Textarea
                id="lblCautions"
                rows={3}
                value={cautions}
                onChange={(e) => {
                  setCautions(e.target.value);
                  setDirty(true);
                }}
                disabled={!isDraft}
                placeholder="예: 상처 부위에는 사용을 피하십시오. 직사광선 보관 금지."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lblStorage">보관방법</Label>
              <Textarea
                id="lblStorage"
                rows={2}
                value={storageMethod}
                onChange={(e) => {
                  setStorageMethod(e.target.value);
                  setDirty(true);
                }}
                disabled={!isDraft}
                placeholder="예: 직사광선을 피해 서늘한 곳에 보관하세요."
              />
            </div>

            {isDraft && dirty && (
              <Button onClick={handleSaveTextFields}>
                <Save className="w-4 h-4 mr-1" />
                전성분 / 사용 정보 저장
              </Button>
            )}
          </CardContent>
        </Card>

        {/* 라벨 미리보기 */}
        <Card className="border-2 border-rose-200 bg-rose-50/30">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Tag className="w-4 h-4" />
              라벨 미리보기 (KFDA § 19 표기)
            </CardTitle>
            <CardDescription>
              실제 인쇄 양식은 향후 PDF 미리보기로 별도 생성 예정.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-xs space-y-2 font-sans">
            <div className="text-base font-semibold">
              {label.productNameKo}
              {label.productNameEn && (
                <span className="text-muted-foreground font-normal ml-2">
                  ({label.productNameEn})
                </span>
              )}
            </div>
            {label.capacity && <div>용량: {label.capacity}</div>}
            <div className="border-t pt-2 mt-2">
              <span className="font-medium">전성분:</span>{" "}
              <span className="text-muted-foreground">
                {inciList || "(미입력)"}
              </span>
            </div>
            {detectedAllergens.length > 0 && (
              <div>
                <span className="font-medium text-amber-700">알러지 유발물질:</span>{" "}
                <span className="font-mono">{detectedAllergens.join(", ")}</span>
              </div>
            )}
            {usageInstructions && (
              <div>
                <span className="font-medium">사용방법:</span> {usageInstructions}
              </div>
            )}
            {cautions && (
              <div>
                <span className="font-medium">주의사항:</span> {cautions}
              </div>
            )}
            {storageMethod && (
              <div>
                <span className="font-medium">보관방법:</span> {storageMethod}
              </div>
            )}
            {label.manufacturerName && (
              <div className="border-t pt-2 mt-2 text-muted-foreground">
                제조사: {label.manufacturerName}
                {label.manufacturerAddress && ` · ${label.manufacturerAddress}`}
              </div>
            )}
            {label.responsibleParty && (
              <div className="text-muted-foreground">
                책임판매업자: {label.responsibleParty}
              </div>
            )}
          </CardContent>
        </Card>

        {!isDraft && (
          <Card className="border-amber-200 bg-amber-50/40">
            <CardContent className="py-3 text-xs text-amber-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              현재 상태에서는 read-only — 수정하려면 신규 라벨로 등록 후 이 라벨을 deprecated 처리.
            </CardContent>
          </Card>
        )}
      </div>

      <CosmeticLabelDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        mode="edit"
        label={label}
        onSuccess={refetch}
      />
    </DashboardLayout>
  );
}

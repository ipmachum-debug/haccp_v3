/**
 * 화장품 BMR IPC 측정값 입력 Dialog (Phase 2-3)
 *
 * 사용:
 *   <CosmeticBmrIpcDialog bmrId={123} open={open} onOpenChange={setOpen} onSuccess={refetch} />
 *
 * 입력:
 *   - measurementType (필수, free text — 향후 template 기반 selector)
 *   - expected min/max (선택)
 *   - measuredValue (선택 — 미입력 시 'pending')
 *   - unit (선택)
 *   - notes (선택)
 *
 * passFail 은 서버에서 자동 평가 — 클라이언트는 입력만.
 */

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";

// 일반적인 화장품 IPC 항목 — 자유 입력 가능 (template 기반 selector 는 향후)
const COMMON_TYPES: Array<{ value: string; label: string; defaultUnit: string }> = [
  { value: "viscosity", label: "점도 (Viscosity)", defaultUnit: "cP" },
  { value: "ph", label: "pH", defaultUnit: "pH" },
  { value: "microbial", label: "미생물 (Microbial)", defaultUnit: "cfu/g" },
  { value: "color", label: "색상", defaultUnit: "" },
  { value: "weight", label: "중량 (Weight)", defaultUnit: "g" },
  { value: "density", label: "비중 (Density)", defaultUnit: "g/mL" },
  { value: "appearance", label: "외관", defaultUnit: "" },
  { value: "odor", label: "향취", defaultUnit: "" },
  { value: "custom", label: "직접 입력", defaultUnit: "" },
];

export interface IpcDialogProps {
  bmrId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function CosmeticBmrIpcDialog({
  bmrId,
  open,
  onOpenChange,
  onSuccess,
}: IpcDialogProps) {
  const [typeKey, setTypeKey] = useState<string>("");
  const [customType, setCustomType] = useState("");
  const [measurementLabel, setMeasurementLabel] = useState("");
  const [expectedMin, setExpectedMin] = useState("");
  const [expectedMax, setExpectedMax] = useState("");
  const [measuredValue, setMeasuredValue] = useState("");
  const [unit, setUnit] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const createMutation = trpc.cosmetic.bmrIpc.create.useMutation();

  useEffect(() => {
    if (open) {
      // reset on open
      setTypeKey("");
      setCustomType("");
      setMeasurementLabel("");
      setExpectedMin("");
      setExpectedMax("");
      setMeasuredValue("");
      setUnit("");
      setNotes("");
    }
  }, [open]);

  const handleTypeChange = (value: string) => {
    setTypeKey(value);
    const preset = COMMON_TYPES.find((t) => t.value === value);
    if (preset && value !== "custom") {
      setUnit(preset.defaultUnit);
      setMeasurementLabel(preset.label);
    }
  };

  const handleSubmit = async () => {
    const finalType =
      typeKey === "custom" ? customType.trim() : typeKey;
    if (!finalType) {
      toast({ title: "측정 항목 필수", variant: "destructive" });
      return;
    }

    const parsedMin = expectedMin === "" ? undefined : Number(expectedMin);
    const parsedMax = expectedMax === "" ? undefined : Number(expectedMax);
    const parsedValue =
      measuredValue === "" ? undefined : Number(measuredValue);

    if (parsedMin !== undefined && !Number.isFinite(parsedMin)) {
      toast({ title: "최소값 형식 오류", variant: "destructive" });
      return;
    }
    if (parsedMax !== undefined && !Number.isFinite(parsedMax)) {
      toast({ title: "최대값 형식 오류", variant: "destructive" });
      return;
    }
    if (parsedValue !== undefined && !Number.isFinite(parsedValue)) {
      toast({ title: "측정값 형식 오류", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const result = await createMutation.mutateAsync({
        bmrId,
        measurementType: finalType,
        measurementLabel: measurementLabel.trim() || undefined,
        expectedMin: parsedMin,
        expectedMax: parsedMax,
        measuredValue: parsedValue,
        unit: unit.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      const passFailLabel =
        result.passFail === "pass"
          ? "✅ 합격"
          : result.passFail === "fail"
          ? "❌ 부적합"
          : "⏳ 측정 대기";
      toast({
        title: `IPC 측정값 등록 — ${passFailLabel}`,
        description: `ID #${result.id}`,
      });
      onSuccess?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({
        title: "처리 실패",
        description: e?.message ?? String(e),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>IPC 측정값 등록</DialogTitle>
          <DialogDescription>
            한계값 (min~max) 와 측정값을 입력하면 합격/부적합이 자동 평가됩니다.
            측정값 미입력 시 'pending' 상태로 저장.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="ipcType">측정 항목 *</Label>
            <Select value={typeKey} onValueChange={handleTypeChange}>
              <SelectTrigger id="ipcType">
                <SelectValue placeholder="항목 선택" />
              </SelectTrigger>
              <SelectContent>
                {COMMON_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {typeKey === "custom" && (
              <Input
                placeholder="측정 항목 키 (영문 소문자, 예: skin_irritation)"
                value={customType}
                onChange={(e) => setCustomType(e.target.value)}
                className="mt-2"
              />
            )}
          </div>

          {typeKey === "custom" && (
            <div className="space-y-1.5">
              <Label htmlFor="ipcLabel">표시명 (한국어)</Label>
              <Input
                id="ipcLabel"
                value={measurementLabel}
                onChange={(e) => setMeasurementLabel(e.target.value)}
                placeholder="예: 피부 자극 점수"
              />
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="expectedMin">최소값</Label>
              <Input
                id="expectedMin"
                type="number"
                step="0.0001"
                value={expectedMin}
                onChange={(e) => setExpectedMin(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expectedMax">최대값</Label>
              <Input
                id="expectedMax"
                type="number"
                step="0.0001"
                value={expectedMax}
                onChange={(e) => setExpectedMax(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ipcUnit">단위</Label>
              <Input
                id="ipcUnit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="cP, pH, cfu/g 등"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="measuredValue">측정값 (미입력 시 pending)</Label>
            <Input
              id="measuredValue"
              type="number"
              step="0.0001"
              value={measuredValue}
              onChange={(e) => setMeasuredValue(e.target.value)}
              placeholder="예: 5500"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ipcNotes">메모</Label>
            <Textarea
              id="ipcNotes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="측정 환경 / 특이사항"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            취소
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "처리 중..." : "등록"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

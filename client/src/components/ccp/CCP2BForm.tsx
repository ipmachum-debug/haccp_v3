import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";

import { todayLocal } from "../../lib/dateUtils";
import { type CcpFormProps, confidenceClass } from "./ccpFormTypes";

// ★ PR-AN: CCP-2B/3B 공용 데이터 구조 (3B 는 wrapper)
export interface Ccp2bFormData {
  recordDate: string;
  productName: string;
  measurementTime: string;
  heatingTimeMin: string;
  temperatureC: string;
  inputAmountKg: string;
  passFail: "적합" | "부적합";
  deviationContent: string;
  correctiveAction: string;
}

const DEFAULT_VALUES: Ccp2bFormData = {
  recordDate: todayLocal(),
  productName: "",
  measurementTime: "",
  heatingTimeMin: "",
  temperatureC: "",
  inputAmountKg: "",
  passFail: "적합",
  deviationContent: "",
  correctiveAction: "",
};

interface CCP2BFormProps extends CcpFormProps<Ccp2bFormData> {
  /** CCP3B wrapper 에서 ccpType 을 "CCP-3B" 로 덮어쓰기 위한 옵션 */
  ccpType?: "CCP-2B" | "CCP-3B";
}

export function CCP2BForm(props: CCP2BFormProps = {}) {
  const { initialValues, fieldConfidence, mode = "manual", onSaved, title, description, ccpType = "CCP-2B" } = props;

  const [formData, setFormData] = useState<Ccp2bFormData>(() => ({
    ...DEFAULT_VALUES,
    recordDate: todayLocal(),
    ...(initialValues ?? {}),
  }));

  const createMutation = trpc.ccpMonitoring.createCcpMonitoringRecord.useMutation({
    onSuccess: (record: any) => {
      toast.success(`${ccpType} 모니터링 기록이 저장되었습니다.`);
      if (mode === "manual") {
        setFormData({ ...DEFAULT_VALUES, recordDate: todayLocal() });
      }
      onSaved?.(record);
    },
    onError: (error: { message: string }) => {
      toast.error(`저장 실패: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      ccpType,
      recordDate: new Date(formData.recordDate),
      productName: formData.productName,
      measurementTime: formData.measurementTime,
      heatingTimeMin: formData.heatingTimeMin ? parseInt(formData.heatingTimeMin) : undefined,
      temperatureC: formData.temperatureC || undefined,
      inputAmountKg: formData.inputAmountKg || undefined,
      passFail: formData.passFail,
      deviationContent: formData.deviationContent || undefined,
      correctiveAction: formData.correctiveAction || undefined,
    });
  };

  const ccls = (field: keyof Ccp2bFormData) =>
    confidenceClass(mode, fieldConfidence?.[field]);
  const isOcrMode = mode === "ocr-review";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {isOcrMode && <Sparkles className="h-4 w-4 text-amber-500" />}
          {title ?? `${ccpType}: 가열(굽기)공정 모니터링 기록서`}
        </CardTitle>
        <CardDescription>
          {description ?? (isOcrMode
            ? "AI 자동 인식 결과 — 노란색 강조 항목은 신뢰도가 낮으니 확인 후 수정해 주세요."
            : "마카다미아, 호두, 땅콩, 해바라기씨앗, 호박씨앗 등의 가열(굽기)공정 모니터링")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="recordDate">작성일자</Label>
              <Input
                id="recordDate"
                type="date"
                value={formData.recordDate}
                onChange={(e) => setFormData({ ...formData, recordDate: e.target.value })}
                className={ccls("recordDate")}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="productName">제품명</Label>
              <Input
                id="productName"
                value={formData.productName}
                onChange={(e) => setFormData({ ...formData, productName: e.target.value })}
                className={ccls("productName")}
                placeholder="예: 마카다미아"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="measurementTime">측정시각</Label>
              <Input
                id="measurementTime"
                type="time"
                value={formData.measurementTime}
                onChange={(e) => setFormData({ ...formData, measurementTime: e.target.value })}
                className={ccls("measurementTime")}
              />
            </div>
          </div>

          <div className="bg-muted p-4 rounded-lg space-y-2">
            <h3 className="font-semibold">한계기준 (참고)</h3>
            <div className="text-sm text-muted-foreground">
              모든 품목: 10-15분, 150℃ 이상
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="heatingTimeMin">가열시간 (분)</Label>
              <Input
                id="heatingTimeMin"
                type="number"
                value={formData.heatingTimeMin}
                onChange={(e) => setFormData({ ...formData, heatingTimeMin: e.target.value })}
                className={ccls("heatingTimeMin")}
                placeholder="예: 12"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="temperatureC">가열온도 (℃)</Label>
              <Input
                id="temperatureC"
                type="number"
                step="0.1"
                value={formData.temperatureC}
                onChange={(e) => setFormData({ ...formData, temperatureC: e.target.value })}
                className={ccls("temperatureC")}
                placeholder="예: 155"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inputAmountKg">투입량 (kg)</Label>
              <Input
                id="inputAmountKg"
                type="number"
                step="0.1"
                value={formData.inputAmountKg}
                onChange={(e) => setFormData({ ...formData, inputAmountKg: e.target.value })}
                className={ccls("inputAmountKg")}
                placeholder="예: 30"
              />
            </div>
          </div>

          <div className={`space-y-2 p-2 rounded ${ccls("passFail")}`}>
            <Label>판정</Label>
            <RadioGroup
              value={formData.passFail}
              onValueChange={(value) => setFormData({ ...formData, passFail: value as "적합" | "부적합" })}
            >
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="적합" id="pass" />
                  <Label htmlFor="pass">적합</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="부적합" id="fail" />
                  <Label htmlFor="fail">부적합</Label>
                </div>
              </div>
            </RadioGroup>
          </div>

          {formData.passFail === "부적합" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="deviationContent">이탈 내용</Label>
                <Textarea
                  id="deviationContent"
                  value={formData.deviationContent}
                  onChange={(e) => setFormData({ ...formData, deviationContent: e.target.value })}
                  className={ccls("deviationContent")}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="correctiveAction">개선조치 및 결과</Label>
                <Textarea
                  id="correctiveAction"
                  value={formData.correctiveAction}
                  onChange={(e) => setFormData({ ...formData, correctiveAction: e.target.value })}
                  className={ccls("correctiveAction")}
                  rows={3}
                />
              </div>
            </>
          )}

          <div className="flex justify-end gap-2">
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isOcrMode ? "확정 저장" : "기록 저장"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

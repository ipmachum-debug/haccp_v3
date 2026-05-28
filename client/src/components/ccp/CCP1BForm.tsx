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

// ★ PR-AN: 평면 데이터 구조 — items[] 배열 없음
export interface Ccp1bFormData {
  recordDate: string;
  productName: string;
  measurementTime: string;
  heatingTimeMin: string;
  pressureMpa: string;
  inputAmountKg: string;
  tempEdgeC: string;
  tempCenterC: string;
  passFail: "적합" | "부적합";
  deviationContent: string;
  correctiveAction: string;
}

const DEFAULT_VALUES: Ccp1bFormData = {
  recordDate: todayLocal(),
  productName: "",
  measurementTime: "",
  heatingTimeMin: "",
  pressureMpa: "",
  inputAmountKg: "",
  tempEdgeC: "",
  tempCenterC: "",
  passFail: "적합",
  deviationContent: "",
  correctiveAction: "",
};

export function CCP1BForm(props: CcpFormProps<Ccp1bFormData> = {}) {
  const { initialValues, fieldConfidence, mode = "manual", onSaved, title, description } = props;

  const [formData, setFormData] = useState<Ccp1bFormData>(() => ({
    ...DEFAULT_VALUES,
    recordDate: todayLocal(),
    ...(initialValues ?? {}),
  }));

  // ★ PR-AS2 (2026-05-28): 등록된 한계기준 (기존값) 조회 — 하드코딩 대신 테넌트 등록값 사용
  const { data: registeredLimits } = trpc.ccpMonitoring.getCcpLimits.useQuery({ ccpType: "CCP-1B" });

  const createMutation = trpc.ccpMonitoring.createCcpMonitoringRecord.useMutation({
    onSuccess: (record: any) => {
      toast.success("CCP-1B 모니터링 기록이 저장되었습니다.");
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
      ccpType: "CCP-1B",
      recordDate: new Date(formData.recordDate),
      productName: formData.productName,
      measurementTime: formData.measurementTime,
      heatingTimeMin: formData.heatingTimeMin ? parseInt(formData.heatingTimeMin) : undefined,
      pressureMpa: formData.pressureMpa || undefined,
      inputAmountKg: formData.inputAmountKg || undefined,
      tempEdgeC: formData.tempEdgeC || undefined,
      tempCenterC: formData.tempCenterC || undefined,
      passFail: formData.passFail,
      deviationContent: formData.deviationContent || undefined,
      correctiveAction: formData.correctiveAction || undefined,
    });
  };

  const ccls = (field: keyof Ccp1bFormData) =>
    confidenceClass(mode, fieldConfidence?.[field]);
  const isOcrMode = mode === "ocr-review";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {isOcrMode && <Sparkles className="h-4 w-4 text-amber-500" />}
          {title ?? "CCP-1B: 가열(증숙)공정 모니터링 기록서"}
        </CardTitle>
        <CardDescription>
          {description ?? (isOcrMode
            ? "AI 자동 인식 결과 — 노란색 강조 항목은 신뢰도가 낮으니 확인 후 수정해 주세요."
            : "참쌀떡류, 전통떡류, 약식 등의 가열(증숙)공정 모니터링")}
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
                placeholder="예: 참쌀떡류(교반기1)"
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
            {registeredLimits && registeredLimits.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                {registeredLimits.map((lim: any) => {
                  const parts: string[] = [];
                  if (lim.heatingTimeMinMin != null || lim.heatingTimeMinMax != null) {
                    parts.push(`${lim.heatingTimeMinMin ?? "?"}-${lim.heatingTimeMinMax ?? "?"}분`);
                  }
                  if (lim.pressureMpaMin) parts.push(`${lim.pressureMpaMin}Mpa 이상`);
                  if (lim.temperatureCMin) parts.push(`${lim.temperatureCMin}℃ 이상`);
                  return (
                    <div key={lim.id}>
                      <div className="font-medium">{lim.productName}</div>
                      <div className="text-muted-foreground">{parts.join(", ") || "기준 미설정"}</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                등록된 한계기준이 없습니다. CCP 한계기준 관리에서 제품별 기준을 먼저 등록해 주세요.
              </div>
            )}
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
              <Label htmlFor="pressureMpa">압력 (Mpa)</Label>
              <Input
                id="pressureMpa"
                type="number"
                step="0.01"
                value={formData.pressureMpa}
                onChange={(e) => setFormData({ ...formData, pressureMpa: e.target.value })}
                className={ccls("pressureMpa")}
                placeholder="예: 0.16"
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
                placeholder="예: 50"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tempEdgeC">가열 후 품온 - 모서리 (℃)</Label>
              <Input
                id="tempEdgeC"
                type="number"
                step="0.1"
                value={formData.tempEdgeC}
                onChange={(e) => setFormData({ ...formData, tempEdgeC: e.target.value })}
                className={ccls("tempEdgeC")}
                placeholder="예: 92"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tempCenterC">가열 후 품온 - 중심부 (℃)</Label>
              <Input
                id="tempCenterC"
                type="number"
                step="0.1"
                value={formData.tempCenterC}
                onChange={(e) => setFormData({ ...formData, tempCenterC: e.target.value })}
                className={ccls("tempCenterC")}
                placeholder="예: 91"
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

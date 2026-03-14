import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export function CCP1BForm() {

  const [formData, setFormData] = useState({
    recordDate: new Date().toISOString().split('T')[0],
    productName: "",
    measurementTime: "",
    heatingTimeMin: "",
    pressureMpa: "",
    inputAmountKg: "",
    tempEdgeC: "",
    tempCenterC: "",
    passFail: "적합" as "적합" | "부적합",
    deviationContent: "",
    correctiveAction: "",
  });

  const createMutation = trpc.ccpMonitoring.createCcpMonitoringRecord.useMutation({
    onSuccess: () => {
      toast.success("CCP-1B 모니터링 기록이 저장되었습니다.");
      // Reset form
      setFormData({
        recordDate: new Date().toISOString().split('T')[0],
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
      });
    },
    onError: (error: any) => {
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>CCP-1B: 가열(증숙)공정 모니터링 기록서</CardTitle>
        <CardDescription>
          참쌀떡류, 전통떡류, 약식 등의 가열(증숙)공정 모니터링
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 기본 정보 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="recordDate">작성일자</Label>
              <Input
                id="recordDate"
                type="date"
                value={formData.recordDate}
                onChange={(e) => setFormData({ ...formData, recordDate: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="productName">제품명</Label>
              <Input
                id="productName"
                value={formData.productName}
                onChange={(e) => setFormData({ ...formData, productName: e.target.value })}
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
              />
            </div>
          </div>

          {/* 한계기준 정보 */}
          <div className="bg-muted p-4 rounded-lg space-y-2">
            <h3 className="font-semibold">한계기준 (참고)</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="font-medium">참쌀떡류(교반기1)</div>
                <div className="text-muted-foreground">10-15분, 0.16Mpa 이상, 90℃ 이상</div>
              </div>
              <div>
                <div className="font-medium">참쌀떡류(교반기2)</div>
                <div className="text-muted-foreground">10-15분, 0.12Mpa 이상, 90℃ 이상</div>
              </div>
              <div>
                <div className="font-medium">전통떡류</div>
                <div className="text-muted-foreground">10-15분, 0.28Mpa 이상, 90℃ 이상</div>
              </div>
              <div>
                <div className="font-medium">약식</div>
                <div className="text-muted-foreground">35-40분, 0.28Mpa 이상, 90℃ 이상</div>
              </div>
            </div>
          </div>

          {/* 측정 데이터 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="heatingTimeMin">가열시간 (분)</Label>
              <Input
                id="heatingTimeMin"
                type="number"
                value={formData.heatingTimeMin}
                onChange={(e) => setFormData({ ...formData, heatingTimeMin: e.target.value })}
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
                placeholder="예: 91"
              />
            </div>
          </div>

          {/* 판정 */}
          <div className="space-y-2">
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

          {/* 이탈 및 개선조치 */}
          {formData.passFail === "부적합" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="deviationContent">이탈 내용</Label>
                <Textarea
                  id="deviationContent"
                  value={formData.deviationContent}
                  onChange={(e) => setFormData({ ...formData, deviationContent: e.target.value })}
                  placeholder="한계기준 이탈 내용을 입력하세요"
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="correctiveAction">개선조치 및 결과</Label>
                <Textarea
                  id="correctiveAction"
                  value={formData.correctiveAction}
                  onChange={(e) => setFormData({ ...formData, correctiveAction: e.target.value })}
                  placeholder="개선조치 내용 및 결과를 입력하세요"
                  rows={3}
                />
              </div>
            </>
          )}

          {/* 제출 버튼 */}
          <div className="flex justify-end gap-2">
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              기록 저장
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

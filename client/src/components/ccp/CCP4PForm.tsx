import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";

export function CCP4PForm() {
  const [formData, setFormData] = useState({
    recordDate: new Date().toISOString().split('T')[0],
    productName: "",
    measurementTime: "",
    sensitivitySetting: "",
    feTestPiecePass: "O",
    stsTestPiecePass: "O",
    productOnlyPass: "O",
    feProductPass: "O",
    stsProductPass: "O",
    passedQuantity: "",
    detectedQuantity: "",
    passFail: "적합" as "적합" | "부적합",
    deviationContent: "",
    correctiveAction: "",
  });

  const createMutation = trpc.ccpMonitoring.createCcpMonitoringRecord.useMutation({
    onSuccess: () => {
      setFormData({
        recordDate: new Date().toISOString().split('T')[0],
        productName: "",
        measurementTime: "",
        sensitivitySetting: "",
        feTestPiecePass: "O",
        stsTestPiecePass: "O",
        productOnlyPass: "O",
        feProductPass: "O",
        stsProductPass: "O",
        passedQuantity: "",
        detectedQuantity: "",
        passFail: "적합",
        deviationContent: "",
        correctiveAction: "",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      ccpType: "CCP-4P",
      recordDate: new Date(formData.recordDate),
      productName: formData.productName,
      measurementTime: formData.measurementTime,
      sensitivitySetting: formData.sensitivitySetting ? parseInt(formData.sensitivitySetting) : undefined,
      feTestPiecePass: formData.feTestPiecePass,
      stsTestPiecePass: formData.stsTestPiecePass,
      productOnlyPass: formData.productOnlyPass,
      feProductPass: formData.feProductPass,
      stsProductPass: formData.stsProductPass,
      passedQuantity: formData.passedQuantity ? parseInt(formData.passedQuantity) : undefined,
      detectedQuantity: formData.detectedQuantity ? parseInt(formData.detectedQuantity) : undefined,
      passFail: formData.passFail,
      deviationContent: formData.deviationContent || undefined,
      correctiveAction: formData.correctiveAction || undefined,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>CCP-4P: 금속검출공정 모니터링 기록서</CardTitle>
        <CardDescription>
          금속검출기 감도 확인 및 제품 검출 모니터링
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
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="productName">제품명</Label>
              <Input
                id="productName"
                value={formData.productName}
                onChange={(e) => setFormData({ ...formData, productName: e.target.value })}
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

          <div className="bg-muted p-4 rounded-lg space-y-2">
            <h3 className="font-semibold">한계기준 (참고)</h3>
            <div className="text-sm text-muted-foreground">
              감도 130: Fe 2.0mmΦ 이상 불검출, SUS 3.0mmΦ 이상 불검출
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sensitivitySetting">감도 설정</Label>
            <Input
              id="sensitivitySetting"
              type="number"
              value={formData.sensitivitySetting}
              onChange={(e) => setFormData({ ...formData, sensitivitySetting: e.target.value })}
              placeholder="예: 130"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Fe 시편 통과 (중간)</Label>
              <RadioGroup
                value={formData.feTestPiecePass}
                onValueChange={(value) => setFormData({ ...formData, feTestPiecePass: value })}
              >
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="O" id="fe-test-o" />
                    <Label htmlFor="fe-test-o">O (검출)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="X" id="fe-test-x" />
                    <Label htmlFor="fe-test-x">X (미검출)</Label>
                  </div>
                </div>
              </RadioGroup>
            </div>
            <div className="space-y-2">
              <Label>SUS 시편 통과 (중간)</Label>
              <RadioGroup
                value={formData.stsTestPiecePass}
                onValueChange={(value) => setFormData({ ...formData, stsTestPiecePass: value })}
              >
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="O" id="sts-test-o" />
                    <Label htmlFor="sts-test-o">O (검출)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="X" id="sts-test-x" />
                    <Label htmlFor="sts-test-x">X (미검출)</Label>
                  </div>
                </div>
              </RadioGroup>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="passedQuantity">통과량 (개)</Label>
              <Input
                id="passedQuantity"
                type="number"
                value={formData.passedQuantity}
                onChange={(e) => setFormData({ ...formData, passedQuantity: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="detectedQuantity">검출량 (개)</Label>
              <Input
                id="detectedQuantity"
                type="number"
                value={formData.detectedQuantity}
                onChange={(e) => setFormData({ ...formData, detectedQuantity: e.target.value })}
              />
            </div>
          </div>

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

          {formData.passFail === "부적합" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="deviationContent">이탈 내용</Label>
                <Textarea
                  id="deviationContent"
                  value={formData.deviationContent}
                  onChange={(e) => setFormData({ ...formData, deviationContent: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="correctiveAction">개선조치 및 결과</Label>
                <Textarea
                  id="correctiveAction"
                  value={formData.correctiveAction}
                  onChange={(e) => setFormData({ ...formData, correctiveAction: e.target.value })}
                  rows={3}
                />
              </div>
            </>
          )}

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

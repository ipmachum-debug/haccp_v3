import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar, Save, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { trpc } from "@/lib/trpc";
import WriterSelect from "@/components/WriterSelect";

interface YearlyLogModalProps {
  open: boolean;
  onClose: () => void;
  tenantId: number;
}

export function YearlyLogModal({ open, onClose, tenantId }: YearlyLogModalProps) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    inspectionDate: new Date().toISOString().split('T')[0],
    inspector: "",
    calibrationFreezerPanelThermometer: "",
    calibrationRefrigerator: "",
    calibrationTimer: "",
    calibrationProbeThermometer: "",
    calibrationScale: "",
    calibrationOven: "",
    calibrationMetalDetector: "",
    calibrationHygrothermograph: "",
    calibrationRadiationThermometer1: "",
    calibrationRadiationThermometer2: "",
    calibrationOvenWorkThermometer: "",
    metalDetectorCheckDate: "",
    metalDetectorNextCheck: "",
    periodicVerificationDate: "",
    periodicVerificationNext: "",
    specialNotes: "",
    improvementAction: "",
    actionTaker: "",
    confirmation: "",
  });

  const createMutation = trpc.genericChecklist.create.useMutation({
    onSuccess: () => {
      toast({ title: "저장 완료", description: "연간일지가 저장되었습니다." });
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "저장 실패", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (!formData.inspector) {
      toast({
        title: "입력 오류",
        description: "점검자를 선택해주세요.",
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate({
      formType: "yearly_log",
      formDate: formData.inspectionDate,
      title: "연간일지 - " + formData.inspectionDate,
      formData: formData,
      status: "draft",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Calendar className="h-6 w-6" />
            일반위생관리 및 공정점검표 (연간)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* 기본 정보 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>점검 일자 *</Label>
              <Input
                type="date"
                value={formData.inspectionDate}
                onChange={(e) => setFormData({ ...formData, inspectionDate: e.target.value })}
              />
            </div>
            <div>
              <Label>점검자 *</Label>
              <WriterSelect value={formData.inspector} onChange={(v: string) => setFormData(prev => ({...prev, inspector: v}))} />
            </div>
          </div>

          {/* 검교정 항목 */}
          <div className="border rounded-lg p-4 bg-blue-50">
            <h3 className="font-semibold mb-4 text-blue-900">
              가열기 및 냉장/냉동창고의 온도계, 타이머, 저울 등은 검·교정하였는가?
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>냉동창고 판넬온도계</Label>
                <Input
                  type="date"
                  value={formData.calibrationFreezerPanelThermometer}
                  onChange={(e) => setFormData({ ...formData, calibrationFreezerPanelThermometer: e.target.value })}
                />
              </div>
              <div>
                <Label>냉장고</Label>
                <Input
                  type="date"
                  value={formData.calibrationRefrigerator}
                  onChange={(e) => setFormData({ ...formData, calibrationRefrigerator: e.target.value })}
                />
              </div>
              <div>
                <Label>타이머</Label>
                <Input
                  type="date"
                  value={formData.calibrationTimer}
                  onChange={(e) => setFormData({ ...formData, calibrationTimer: e.target.value })}
                />
              </div>
              <div>
                <Label>탈침온도계</Label>
                <Input
                  type="date"
                  value={formData.calibrationProbeThermometer}
                  onChange={(e) => setFormData({ ...formData, calibrationProbeThermometer: e.target.value })}
                />
              </div>
              <div>
                <Label>저울</Label>
                <Input
                  type="date"
                  value={formData.calibrationScale}
                  onChange={(e) => setFormData({ ...formData, calibrationScale: e.target.value })}
                />
              </div>
              <div>
                <Label>오븐기</Label>
                <Input
                  type="date"
                  value={formData.calibrationOven}
                  onChange={(e) => setFormData({ ...formData, calibrationOven: e.target.value })}
                />
              </div>
              <div>
                <Label>금속검출기</Label>
                <Input
                  type="date"
                  value={formData.calibrationMetalDetector}
                  onChange={(e) => setFormData({ ...formData, calibrationMetalDetector: e.target.value })}
                />
              </div>
              <div>
                <Label>온습도계</Label>
                <Input
                  type="date"
                  value={formData.calibrationHygrothermograph}
                  onChange={(e) => setFormData({ ...formData, calibrationHygrothermograph: e.target.value })}
                />
              </div>
              <div>
                <Label>복사온도계1</Label>
                <Input
                  type="date"
                  value={formData.calibrationRadiationThermometer1}
                  onChange={(e) => setFormData({ ...formData, calibrationRadiationThermometer1: e.target.value })}
                />
              </div>
              <div>
                <Label>복사온도계2</Label>
                <Input
                  type="date"
                  value={formData.calibrationRadiationThermometer2}
                  onChange={(e) => setFormData({ ...formData, calibrationRadiationThermometer2: e.target.value })}
                />
              </div>
              <div>
                <Label>오븐용 실무온도계</Label>
                <Input
                  type="date"
                  value={formData.calibrationOvenWorkThermometer}
                  onChange={(e) => setFormData({ ...formData, calibrationOvenWorkThermometer: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* 추가 질문 */}
          <div className="border rounded-lg p-4 bg-green-50">
            <h3 className="font-semibold mb-4 text-green-900">금속검출기에 대한 정기점검을 실시하였는가?</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>점검 일자</Label>
                <Input
                  type="date"
                  value={formData.metalDetectorCheckDate}
                  onChange={(e) => setFormData({ ...formData, metalDetectorCheckDate: e.target.value })}
                />
              </div>
              <div>
                <Label>차기 검교정 일자</Label>
                <Input
                  type="date"
                  value={formData.metalDetectorNextCheck}
                  onChange={(e) => setFormData({ ...formData, metalDetectorNextCheck: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="border rounded-lg p-4 bg-purple-50">
            <h3 className="font-semibold mb-4 text-purple-900">정기검증(실시상황평가표 활용)을 실시하였는가?</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>검증 일자</Label>
                <Input
                  type="date"
                  value={formData.periodicVerificationDate}
                  onChange={(e) => setFormData({ ...formData, periodicVerificationDate: e.target.value })}
                />
              </div>
              <div>
                <Label>차기 정기검증 일자</Label>
                <Input
                  type="date"
                  value={formData.periodicVerificationNext}
                  onChange={(e) => setFormData({ ...formData, periodicVerificationNext: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* 하단 필드 */}
          <div className="space-y-4">
            <div>
              <Label>특이사항</Label>
              <Textarea
                value={formData.specialNotes}
                onChange={(e) => setFormData({ ...formData, specialNotes: e.target.value })}
                placeholder="특이사항을 입력하세요"
                rows={3}
              />
            </div>
            <div>
              <Label>개선조치 및 결과</Label>
              <Textarea
                value={formData.improvementAction}
                onChange={(e) => setFormData({ ...formData, improvementAction: e.target.value })}
                placeholder="개선조치 및 결과를 입력하세요"
                rows={3}
              />
            </div>

          </div>
        </div>

        {/* 버튼 */}
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            <X className="h-4 w-4 mr-2" />
            취소
          </Button>
          <Button onClick={handleSubmit}>
            <Save className="h-4 w-4 mr-2" />
            저장
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

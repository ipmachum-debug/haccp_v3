import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Save, X, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { trpc } from "@/lib/trpc";
import WriterSelect from "@/components/checklist/WriterSelect";

import { todayLocal } from "../../lib/dateUtils";

interface CustomPeriodLogModalProps {
  open: boolean;
  onClose: () => void;
  tenantId: number;
}

export function CustomPeriodLogModal({ open, onClose, tenantId }: CustomPeriodLogModalProps) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    startDate: todayLocal(),
    endDate: todayLocal(),
    inspector: "",
    logType: "위생점검",
    content: "",
    specialNotes: "",
    improvementAction: "",
    actionTaker: "",
    confirmation: "",
  });

  const createMutation = trpc.genericChecklist.create.useMutation({
    onSuccess: () => {
      toast({ title: "저장 완료", description: "특정기간일지가 저장되었습니다." });
      onClose();
    },
    onError: (err: { message: string }) => {
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
    if (new Date(formData.startDate) > new Date(formData.endDate)) {
      toast({
        title: "입력 오류",
        description: "시작일자가 종료일자보다 늦을 수 없습니다.",
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate({
      formType: "custom_period_log",
      formDate: formData.startDate,
      title: `특정기간일지 - ${formData.startDate} ~ ${formData.endDate}`,
      formData: formData,
      status: "draft",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Calendar className="h-6 w-6" />
            특정기간일지 작성
          </DialogTitle>
        </DialogHeader>

        <Alert className="bg-blue-50 border-blue-200">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-900">
            특정 기간 동안의 위생관리, 품질점검, 설비관리 등을 기록하는 일지입니다.
            시작일자와 종료일자를 지정하여 해당 기간의 점검 내용을 작성하세요.
          </AlertDescription>
        </Alert>

        <div className="space-y-6 py-4">
          {/* 기본 정보 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>시작일자 *</Label>
              <Input
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              />
            </div>
            <div>
              <Label>종료일자 *</Label>
              <Input
                type="date"
                value={formData.endDate}
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>점검자 *</Label>
              <WriterSelect value={formData.inspector} onChange={(v: string) => setFormData(prev => ({...prev, inspector: v}))} />
            </div>
            <div>
              <Label>일지 유형 *</Label>
              <Select value={formData.logType} onValueChange={(value) => setFormData({ ...formData, logType: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="위생점검">위생점검</SelectItem>
                  <SelectItem value="품질점검">품질점검</SelectItem>
                  <SelectItem value="설비관리">설비관리</SelectItem>
                  <SelectItem value="방충방서">방충방서</SelectItem>
                  <SelectItem value="교육훈련">교육훈련</SelectItem>
                  <SelectItem value="기타">기타</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 점검 내용 */}
          <div>
            <Label>점검 내용</Label>
            <Textarea
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              placeholder="해당 기간 동안의 점검 내용을 상세히 기록하세요"
              rows={6}
            />
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

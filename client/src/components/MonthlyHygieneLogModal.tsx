import WriterSelect from "@/components/WriterSelect";
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/hooks/use-toast';

interface MonthlyHygieneLogModalProps {
  open: boolean;
  onClose: () => void;
  tenantId: number;
}

export function MonthlyHygieneLogModal({
  open,
  onClose,
  tenantId
}: MonthlyHygieneLogModalProps) {
  const { toast } = useToast();
  const [checkDate, setCheckDate] = useState('');
  const [checkerName, setCheckerName] = useState('');

  
  // 청소·소독 항목
  const [cleaningStatus, setCleaningStatus] = useState('');
  const [educationStatus, setEducationStatus] = useState('');
  const [ccpVerification, setCcpVerification] = useState('');
  
  // 특이사항, 개선조치, 확인
  const [specialNotes, setSpecialNotes] = useState('');
  const [improvementAction, setImprovementAction] = useState('');


  const createMutation = trpc.monthlyLog.createHygiene.useMutation({
    onSuccess: () => {
      toast({
        title: '성공',
        description: '월간일지가 작성되었습니다.'
      });
      resetForm();
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: '오류',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const resetForm = () => {
    setCheckDate('');
    setCheckerName('');

    setCleaningStatus('');
    setEducationStatus('');
    setCcpVerification('');
    setSpecialNotes('');
    setImprovementAction('');
    setConfirmation('');
  };

  const handleSubmit = () => {
    if (!checkDate) {
      toast({
        title: '입력 오류',
        description: '점검 일자를 입력해주세요.',
        variant: 'destructive'
      });
      return;
    }

    createMutation.mutate({
      tenant_id: tenantId,
      check_date: checkDate,
      checker_name: checkerName,
      confirmer_name: '',
      confirm_date: '',
      cleaning_status: cleaningStatus,
      education_status: educationStatus,
      ccp_verification: ccpVerification,
      special_notes: specialNotes,
      improvement_action: improvementAction,
      confirmation: '',
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            일반위생관리 및 공정점검표 (월간)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 p-4">
          {/* 기본 정보 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>점검 일자 *</Label>
              <Input
                type="date"
                value={checkDate}
                onChange={(e) => setCheckDate(e.target.value)}
              />
            </div>
            <div>
              <Label>점검자</Label>
              <WriterSelect value={checkerName} onChange={(v: string) => setCheckerName(v)} />
            </div>

          </div>

          {/* 주기 및 관리 */}
          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="font-semibold">주기</Label>
                <p className="text-sm text-gray-600 mt-1">매월 (첫째주)</p>
              </div>
              <div>
                <Label className="font-semibold">관리</Label>
                <p className="text-sm text-gray-600 mt-1">청소·소독</p>
              </div>
            </div>
          </div>

          {/* 청소·소독 항목 */}
          <div className="space-y-4 border-t pt-4">
            <h3 className="font-semibold text-lg">청소·소독 점검 내용</h3>
            
            {/* 1. 청소 */}
            <div className="space-y-2">
              <Label className="font-medium">
                1. 직업성 전해 청소 상태는 양호한가?
              </Label>
              <RadioGroup value={cleaningStatus} onValueChange={setCleaningStatus}>
                <div className="flex gap-4">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="예" id="cleaning-yes" />
                    <Label htmlFor="cleaning-yes">예</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="아니오" id="cleaning-no" />
                    <Label htmlFor="cleaning-no">아니오</Label>
                  </div>
                </div>
              </RadioGroup>
            </div>

            {/* 2. 교육 */}
            <div className="space-y-2">
              <Label className="font-medium">
                2. 종사자 위생교육을 실시하였는가?
              </Label>
              <RadioGroup value={educationStatus} onValueChange={setEducationStatus}>
                <div className="flex gap-4">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="예" id="education-yes" />
                    <Label htmlFor="education-yes">예</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="아니오" id="education-no" />
                    <Label htmlFor="education-no">아니오</Label>
                  </div>
                </div>
              </RadioGroup>
            </div>

            {/* 3. 검증 */}
            <div className="space-y-2">
              <Label className="font-medium">
                3. 중요관리공정(CCP) 검증표를 작성하였는가?
              </Label>
              <RadioGroup value={ccpVerification} onValueChange={setCcpVerification}>
                <div className="flex gap-4">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="예" id="ccp-yes" />
                    <Label htmlFor="ccp-yes">예</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="아니오" id="ccp-no" />
                    <Label htmlFor="ccp-no">아니오</Label>
                  </div>
                </div>
              </RadioGroup>
            </div>
          </div>

          {/* 특이사항 */}
          <div className="space-y-2">
            <Label>특이사항</Label>
            <Textarea
              value={specialNotes}
              onChange={(e) => setSpecialNotes(e.target.value)}
              placeholder="특이사항을 입력하세요"
              rows={3}
            />
          </div>

          {/* 개선조치 및 결과 */}
          <div className="space-y-2">
            <Label>개선조치 및 결과</Label>
            <Textarea
              value={improvementAction}
              onChange={(e) => setImprovementAction(e.target.value)}
              placeholder="개선조치 및 결과를 입력하세요"
              rows={3}
            />
          </div>

          {/* 버튼 */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={onClose}>
              취소
            </Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending}>
              {createMutation.isPending ? '저장 중...' : '저장'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

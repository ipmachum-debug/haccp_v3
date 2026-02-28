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

interface WeeklyHygieneLogModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  tenantId: number;
}

export function WeeklyHygieneLogModal({
  open,
  onClose,
  onSuccess,
  tenantId
}: WeeklyHygieneLogModalProps) {
  const { toast } = useToast();
  const [checkDate, setCheckDate] = useState('');
  const [checkerName, setCheckerName] = useState('');
  const [coldStorageClean, setColdStorageClean] = useState<'예' | '아니오'>('예');
  const [facilityClean, setFacilityClean] = useState<'예' | '아니오'>('예');
  const [uniformWash, setUniformWash] = useState<'예' | '아니오'>('예');
  const [specialNotes, setSpecialNotes] = useState('');
  const [improvementAction, setImprovementAction] = useState('');


  const createMutation = trpc.weeklyLog.createHygiene.useMutation({
    onSuccess: () => {
      toast({
        title: '성공',
        description: '일반위생관리 주간일지가 작성되었습니다.'
      });
      handleClose();
      onSuccess?.();
    },
    onError: (error) => {
      toast({
        title: '오류',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const handleSubmit = () => {
    if (!checkDate) {
      toast({
        title: '필수 입력',
        description: '점검 일자를 입력해주세요.',
        variant: 'destructive'
      });
      return;
    }

    createMutation.mutate({
      tenant_id: tenantId,
      check_date: checkDate,
      checker_name: checkerName,
      cold_storage_clean: coldStorageClean,
      facility_clean: facilityClean,
      uniform_wash: uniformWash,
      special_notes: specialNotes,
      improvement_action: improvementAction,
      confirmation: ''
    });
  };

  const handleClose = () => {
    setCheckDate('');
    setCheckerName('');
    setColdStorageClean('예');
    setFacilityClean('예');
    setUniformWash('예');
    setSpecialNotes('');
    setImprovementAction('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-center bg-blue-100 py-3">
            일반위생관리 및 공정점검표 (주간)
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

          {/* 청소·소독 항목 */}
          <div className="border rounded-lg p-4 space-y-4">
            <div className="font-semibold bg-gray-100 p-2 rounded">청소·소독</div>

            {/* 1. 냉장창고 내부 청소 */}
            <div className="space-y-2">
              <Label>냉장창고 내부 청소 상태는 양호한가?</Label>
              <RadioGroup
                value={coldStorageClean}
                onValueChange={(value) => setColdStorageClean(value as '예' | '아니오')}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="예" id="cold-yes" />
                  <Label htmlFor="cold-yes">예</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="아니오" id="cold-no" />
                  <Label htmlFor="cold-no">아니오</Label>
                </div>
              </RadioGroup>
            </div>

            {/* 2. 작업장 벽, 제조설비 청소·소독 */}
            <div className="space-y-2">
              <Label>
                작업장 벽, 제조설비(제품과 직접 닿지 않는 부분)에 대한 청소·소독 상태는 양호한가?
              </Label>
              <RadioGroup
                value={facilityClean}
                onValueChange={(value) => setFacilityClean(value as '예' | '아니오')}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="예" id="facility-yes" />
                  <Label htmlFor="facility-yes">예</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="아니오" id="facility-no" />
                  <Label htmlFor="facility-no">아니오</Label>
                </div>
              </RadioGroup>
            </div>

            {/* 3. 위생복 세탁 */}
            <div className="space-y-2">
              <Label>위생복 세탁은 실시하였는가?</Label>
              <RadioGroup
                value={uniformWash}
                onValueChange={(value) => setUniformWash(value as '예' | '아니오')}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="예" id="uniform-yes" />
                  <Label htmlFor="uniform-yes">예</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="아니오" id="uniform-no" />
                  <Label htmlFor="uniform-no">아니오</Label>
                </div>
              </RadioGroup>
            </div>
          </div>

          {/* 특이사항 */}
          <div>
            <Label>특이사항</Label>
            <Textarea
              value={specialNotes}
              onChange={(e) => setSpecialNotes(e.target.value)}
              placeholder="특이사항을 입력하세요"
              rows={3}
            />
          </div>

          {/* 개선조치 및 결과 */}
          <div>
            <Label>개선조치 및 결과</Label>
            <Textarea
              value={improvementAction}
              onChange={(e) => setImprovementAction(e.target.value)}
              placeholder="개선조치 및 결과를 입력하세요"
              rows={3}
            />
          </div>

          {/* 버튼 */}
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={handleClose}>
              취소
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? '저장 중...' : '저장'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

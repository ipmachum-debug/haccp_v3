import { useState } from 'react';
import WriterSelect from "@/components/checklist/WriterSelect";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/hooks/use-toast';

interface MonthlyCCPLogModalProps {
  open: boolean;
  onClose: () => void;
  tenantId: number;
}

export function MonthlyCCPLogModal({
  open,
  onClose,
  tenantId
}: MonthlyCCPLogModalProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('basic');
  
  // 기본 정보
  const [checkDate, setCheckDate] = useState('');
  const [checkerName, setCheckerName] = useState('');

  const [confirmDate, setConfirmDate] = useState('');
  
  // 가열 공정
  const [heatingTempTimeCheck, setHeatingTempTimeCheck] = useState('');
  const [heatingEquipmentCalibration, setHeatingEquipmentCalibration] = useState('');
  const [heatingTempMethod, setHeatingTempMethod] = useState('');
  const [heatingTimeMethod, setHeatingTimeMethod] = useState('');
  const [heatingCoreTempMethod, setHeatingCoreTempMethod] = useState('');
  const [heatingMonitoringObservationDate, setHeatingMonitoringObservationDate] = useState('');
  const [heatingCorrectiveActionKnowledge, setHeatingCorrectiveActionKnowledge] = useState('');
  const [heatingMonitoringInterviewDate, setHeatingMonitoringInterviewDate] = useState('');
  
  // 금속검출 공정
  const [metalDetectorTest, setMetalDetectorTest] = useState('');
  const [metalDetectorCalibration, setMetalDetectorCalibration] = useState('');
  const [metalDetectorMethod, setMetalDetectorMethod] = useState('');
  const [metalMonitoringObservationDate, setMetalMonitoringObservationDate] = useState('');
  const [metalCorrectiveActionKnowledge, setMetalCorrectiveActionKnowledge] = useState('');
  const [metalMonitoringInterviewDate, setMetalMonitoringInterviewDate] = useState('');
  
  // 한계기준 이탈내용, 개선조치, 조치자, 확인
  const [deviationDetails, setDeviationDetails] = useState('');
  const [improvementAction, setImprovementAction] = useState('');
  const [confirmerName, setConfirmerName] = useState('');
  const [actionTaker, setActionTaker] = useState('');
  const [confirmation, setConfirmation] = useState('');


  const createMutation = trpc.monthlyLog.createCCP.useMutation({
    onSuccess: () => {
      toast({
        title: '성공',
        description: 'CCP 월간일지가 작성되었습니다.'
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
    setConfirmerName('');
    setConfirmDate('');
    setHeatingTempTimeCheck('');
    setHeatingEquipmentCalibration('');
    setHeatingTempMethod('');
    setHeatingTimeMethod('');
    setHeatingCoreTempMethod('');
    setHeatingMonitoringObservationDate('');
    setHeatingCorrectiveActionKnowledge('');
    setHeatingMonitoringInterviewDate('');
    setMetalDetectorTest('');
    setMetalDetectorCalibration('');
    setMetalDetectorMethod('');
    setMetalMonitoringObservationDate('');
    setMetalCorrectiveActionKnowledge('');
    setMetalMonitoringInterviewDate('');
    setDeviationDetails('');
    setImprovementAction('');
    setActionTaker('');
    setConfirmation('');
    setActiveTab('basic');
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
      confirm_date: confirmDate,
      heating_temp_time_check: heatingTempTimeCheck,
      heating_equipment_calibration: heatingEquipmentCalibration,
      heating_temp_method: heatingTempMethod,
      heating_time_method: heatingTimeMethod,
      heating_core_temp_method: heatingCoreTempMethod,
      heating_monitoring_observation_date: heatingMonitoringObservationDate,
      heating_corrective_action_knowledge: heatingCorrectiveActionKnowledge,
      heating_monitoring_interview_date: heatingMonitoringInterviewDate,
      metal_detector_test: metalDetectorTest,
      metal_detector_calibration: metalDetectorCalibration,
      metal_detector_method: metalDetectorMethod,
      metal_monitoring_observation_date: metalMonitoringObservationDate,
      metal_corrective_action_knowledge: metalCorrectiveActionKnowledge,
      metal_monitoring_interview_date: metalMonitoringInterviewDate,
      deviation_details: deviationDetails,
      improvement_action: improvementAction,
      action_taker: '',
      confirmation: '',
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            중요관리점(CCP) 검증점검표 (매월 작성)
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="basic">기본 정보</TabsTrigger>
            <TabsTrigger value="heating">가열 공정</TabsTrigger>
            <TabsTrigger value="metal">금속검출</TabsTrigger>
            <TabsTrigger value="deviation">이탈 및 조치</TabsTrigger>
          </TabsList>

          {/* 기본 정보 탭 */}
          <TabsContent value="basic" className="space-y-4 p-4">
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
                <WriterSelect value={checkerName} onChange={(v: string) => setCheckerName(v)} placeholder="점검자 선택" />
              </div>
              <div>

              </div>
              <div>
                <Label>확인일</Label>
                <Input
                  type="date"
                  value={confirmDate}
                  onChange={(e) => setConfirmDate(e.target.value)}
                />
              </div>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg">
              <p className="text-sm text-gray-700">
                <strong>공정:</strong> 검증 내용 (가열, 금속검출)
              </p>
              <p className="text-sm text-gray-600 mt-2">
                각 탭에서 해당 공정의 검증 내용을 입력하세요.
              </p>
            </div>

            <div className="flex justify-end">
              <Button onClick={() => setActiveTab('heating')}>
                다음: 가열 공정 →
              </Button>
            </div>
          </TabsContent>

          {/* 가열 공정 탭 */}
          <TabsContent value="heating" className="space-y-4 p-4">
            <h3 className="font-semibold text-lg">가열 (증숙, 금기, 볶음 공정)</h3>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="font-medium text-sm">
                  종사자가 주기적으로 가열온도 및 가열시간을 확인하고, 그 내용을 기록하고 있습니까?
                </Label>
                <RadioGroup value={heatingTempTimeCheck} onValueChange={setHeatingTempTimeCheck}>
                  <div className="flex gap-4">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="예" id="h1-yes" />
                      <Label htmlFor="h1-yes">예</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="아니오" id="h1-no" />
                      <Label htmlFor="h1-no">아니오</Label>
                    </div>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label className="font-medium text-sm">
                  가열기,냉동고의 온도계, 타이머는 연 1회 이상 검·교정이 이루어지고 있습니까?
                </Label>
                <RadioGroup value={heatingEquipmentCalibration} onValueChange={setHeatingEquipmentCalibration}>
                  <div className="flex gap-4">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="예" id="h2-yes" />
                      <Label htmlFor="h2-yes">예</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="아니오" id="h2-no" />
                      <Label htmlFor="h2-no">아니오</Label>
                    </div>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label className="font-medium text-sm">
                  종사자가 가열온도를 확인하는 방법을 정확히 알고 있습니까?
                </Label>
                <RadioGroup value={heatingTempMethod} onValueChange={setHeatingTempMethod}>
                  <div className="flex gap-4">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="예" id="h3-yes" />
                      <Label htmlFor="h3-yes">예</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="아니오" id="h3-no" />
                      <Label htmlFor="h3-no">아니오</Label>
                    </div>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label className="font-medium text-sm">
                  종사자가 가열시간을 확인하는 방법을 정확히 알고 있습니까?
                </Label>
                <RadioGroup value={heatingTimeMethod} onValueChange={setHeatingTimeMethod}>
                  <div className="flex gap-4">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="예" id="h4-yes" />
                      <Label htmlFor="h4-yes">예</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="아니오" id="h4-no" />
                      <Label htmlFor="h4-no">아니오</Label>
                    </div>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label className="font-medium text-sm">
                  종사자가 품온을 확인하는 방법을 정확히 알고 있습니까?
                </Label>
                <RadioGroup value={heatingCoreTempMethod} onValueChange={setHeatingCoreTempMethod}>
                  <div className="flex gap-4">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="예" id="h5-yes" />
                      <Label htmlFor="h5-yes">예</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="아니오" id="h5-no" />
                      <Label htmlFor="h5-no">아니오</Label>
                    </div>
                  </div>
                </RadioGroup>
              </div>

              <div className="bg-gray-50 p-3 rounded">
                <Label className="font-semibold">모니터링 행동 관찰: 월 일 시</Label>
                <Input
                  className="mt-2"
                  value={heatingMonitoringObservationDate}
                  onChange={(e) => setHeatingMonitoringObservationDate(e.target.value)}
                  placeholder="예: 2월 5일 14시"
                />
              </div>

              <div className="space-y-2">
                <Label className="font-medium text-sm">
                  종사자가 한계기준 이탈 시 실시해야 하는 개선조치 방법을 알고 있으며, 이탈 및 개선조치 내용이 기록되고 있습니까?
                </Label>
                <RadioGroup value={heatingCorrectiveActionKnowledge} onValueChange={setHeatingCorrectiveActionKnowledge}>
                  <div className="flex gap-4">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="예" id="h6-yes" />
                      <Label htmlFor="h6-yes">예</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="아니오" id="h6-no" />
                      <Label htmlFor="h6-no">아니오</Label>
                    </div>
                  </div>
                </RadioGroup>
              </div>

              <div className="bg-gray-50 p-3 rounded">
                <Label className="font-semibold">모니터링 담당자 인터뷰: 월 일 시</Label>
                <Input
                  className="mt-2"
                  value={heatingMonitoringInterviewDate}
                  onChange={(e) => setHeatingMonitoringInterviewDate(e.target.value)}
                  placeholder="예: 2월 5일 15시"
                />
              </div>
            </div>

            <div className="flex justify-between pt-4 border-t">
              <Button variant="outline" onClick={() => setActiveTab('basic')}>
                ← 이전
              </Button>
              <Button onClick={() => setActiveTab('metal')}>
                다음: 금속검출 공정 →
              </Button>
            </div>
          </TabsContent>

          {/* 금속검출 공정 탭 */}
          <TabsContent value="metal" className="space-y-4 p-4">
            <h3 className="font-semibold text-lg">금속검출 공정</h3>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="font-medium text-sm">
                  종사자가 주기적으로 테스트피스를 통해 금속검출기의 감도 이상 유무를 확인하고 있습니까?
                </Label>
                <RadioGroup value={metalDetectorTest} onValueChange={setMetalDetectorTest}>
                  <div className="flex gap-4">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="예" id="m1-yes" />
                      <Label htmlFor="m1-yes">예</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="아니오" id="m1-no" />
                      <Label htmlFor="m1-no">아니오</Label>
                    </div>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label className="font-medium text-sm">
                  금속검출기는 연 1회 검·교정(또는 정기점검)이 이루어지고 있습니까?
                </Label>
                <RadioGroup value={metalDetectorCalibration} onValueChange={setMetalDetectorCalibration}>
                  <div className="flex gap-4">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="예" id="m2-yes" />
                      <Label htmlFor="m2-yes">예</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="아니오" id="m2-no" />
                      <Label htmlFor="m2-no">아니오</Label>
                    </div>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label className="font-medium text-sm">
                  종사자가 금속검출기 감도를 확인하는 방법을 정확히 알고 있습니까?
                </Label>
                <RadioGroup value={metalDetectorMethod} onValueChange={setMetalDetectorMethod}>
                  <div className="flex gap-4">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="예" id="m3-yes" />
                      <Label htmlFor="m3-yes">예</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="아니오" id="m3-no" />
                      <Label htmlFor="m3-no">아니오</Label>
                    </div>
                  </div>
                </RadioGroup>
              </div>

              <div className="bg-gray-50 p-3 rounded">
                <Label className="font-semibold">모니터링 행동 관찰: 월 일 시</Label>
                <Input
                  className="mt-2"
                  value={metalMonitoringObservationDate}
                  onChange={(e) => setMetalMonitoringObservationDate(e.target.value)}
                  placeholder="예: 2월 5일 14시"
                />
              </div>

              <div className="space-y-2">
                <Label className="font-medium text-sm">
                  종사자가 한계기준 이탈 시 실시해야 하는 개선조치 방법을 알고 있으며, 이탈 및 개선조치 내용이 기록되고 있습니까?
                </Label>
                <RadioGroup value={metalCorrectiveActionKnowledge} onValueChange={setMetalCorrectiveActionKnowledge}>
                  <div className="flex gap-4">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="예" id="m4-yes" />
                      <Label htmlFor="m4-yes">예</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="아니오" id="m4-no" />
                      <Label htmlFor="m4-no">아니오</Label>
                    </div>
                  </div>
                </RadioGroup>
              </div>

              <div className="bg-gray-50 p-3 rounded">
                <Label className="font-semibold">모니터링 담당자 인터뷰: 월 일 시</Label>
                <Input
                  className="mt-2"
                  value={metalMonitoringInterviewDate}
                  onChange={(e) => setMetalMonitoringInterviewDate(e.target.value)}
                  placeholder="예: 2월 5일 15시"
                />
              </div>
            </div>

            <div className="flex justify-between pt-4 border-t">
              <Button variant="outline" onClick={() => setActiveTab('heating')}>
                ← 이전
              </Button>
              <Button onClick={() => setActiveTab('deviation')}>
                다음: 이탈 및 조치 →
              </Button>
            </div>
          </TabsContent>

          {/* 이탈 및 조치 탭 */}
          <TabsContent value="deviation" className="space-y-4 p-4">
            <h3 className="font-semibold text-lg">한계기준 이탈 및 조치</h3>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>한계기준 이탈내용</Label>
                <Textarea
                  value={deviationDetails}
                  onChange={(e) => setDeviationDetails(e.target.value)}
                  placeholder="한계기준 이탈내용을 입력하세요"
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label>개선조치 및 결과</Label>
                <Textarea
                  value={improvementAction}
                  onChange={(e) => setImprovementAction(e.target.value)}
                  placeholder="개선조치 및 결과를 입력하세요"
                  rows={3}
                />
              </div>


            </div>

            <div className="flex justify-between pt-4 border-t">
              <Button variant="outline" onClick={() => setActiveTab('metal')}>
                ← 이전
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose}>
                  취소
                </Button>
                <Button onClick={handleSubmit} disabled={createMutation.isPending}>
                  {createMutation.isPending ? '저장 중...' : '저장'}
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

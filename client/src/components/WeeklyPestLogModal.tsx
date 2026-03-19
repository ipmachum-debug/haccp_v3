import WriterSelect from "@/components/WriterSelect";
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/hooks/use-toast';

interface WeeklyPestLogModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  tenantId: number;
}

interface Equipment {
  id: number;
  name: string;
  type: string;
  location: string;
  zone: string;
}

interface EquipmentCheck {
  equipment_id: number;
  dust: boolean;
  sticky: boolean;
  fly: boolean;
  fruit_fly: boolean;
  moth_fly: boolean;
  wing: boolean;
  cockroach: boolean;
  ant: boolean;
  spider: boolean;
  mouse: boolean;
  other: boolean;
  escape: boolean;
}

export function WeeklyPestLogModal({
  open,
  onClose,
  onSuccess,
  tenantId
}: WeeklyPestLogModalProps) {
  const { toast } = useToast();
  const [checkDate, setCheckDate] = useState('');
  const [checkerName, setCheckerName] = useState('');
  const [managementNotes, setManagementNotes] = useState('');
  const [deviationReason, setDeviationReason] = useState('');
  const [improvementAction, setImprovementAction] = useState('');
  const [equipmentList, setEquipmentList] = useState<Equipment[]>([]);
  const [equipmentChecks, setEquipmentChecks] = useState<Record<number, EquipmentCheck>>({});

  // 설비 목록 조회 (포충등, R-트랩)
  const { data: equipmentData } = trpc.equipment.list.useQuery(
    { tenant_id: tenantId },
    { enabled: open }
  );

  useEffect(() => {
    if (equipmentData?.items) {
      // 포충등과 R-트랩만 필터링
      const filtered = equipmentData.items.filter(
        (eq: Equipment) => eq.type === '포충등' || eq.type === 'R-트랩'
      );
      setEquipmentList(filtered);

      // 초기 체크 데이터 생성
      const initialChecks: Record<number, EquipmentCheck> = {};
      filtered.forEach((eq: Equipment) => {
        initialChecks[eq.id] = {
          equipment_id: eq.id,
          dust: false,
          sticky: false,
          fly: false,
          fruit_fly: false,
          moth_fly: false,
          wing: false,
          cockroach: false,
          ant: false,
          spider: false,
          mouse: false,
          other: false,
          escape: false
        };
      });
      setEquipmentChecks(initialChecks);
    }
  }, [equipmentData]);

  const createMutation = trpc.weeklyLog.createPest.useMutation({
    onSuccess: () => {
      toast({
        title: '성공',
        description: '방충방서 주간일지가 작성되었습니다.'
      });
      handleClose();
      onSuccess?.();
    },
    onError: (error: any) => {
      toast({
        title: '오류',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const handleCheckChange = (equipmentId: number, field: keyof Omit<EquipmentCheck, 'equipment_id'>, value: boolean) => {
    setEquipmentChecks((prev) => ({
      ...prev,
      [equipmentId]: {
        ...prev[equipmentId],
        [field]: value
      }
    }));
  };

  const handleSubmit = () => {
    if (!checkDate) {
      toast({
        title: '필수 입력',
        description: '점검 일자를 입력해주세요.',
        variant: 'destructive'
      });
      return;
    }

    const checksArray = Object.values(equipmentChecks);

    createMutation.mutate({
      tenant_id: tenantId,
      check_date: checkDate,
      checker_name: checkerName,
      management_notes: managementNotes,
      deviation_reason: deviationReason,
      improvement_action: improvementAction,
      equipment_checks: checksArray
    });
  };

  const handleClose = () => {
    setCheckDate('');
    setCheckerName('');
    setManagementNotes('');
    setDeviationReason('');
    setImprovementAction('');
    setEquipmentChecks({});
    onClose();
  };

  // 포충등과 R-트랩 분리
  const insectLamps = equipmentList.filter((eq) => eq.type === '포충등');
  const rTraps = equipmentList.filter((eq) => eq.type === 'R-트랩');

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-center bg-blue-100 py-3">
            방충·방서 점검표 (매주 작성)
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
              <WriterSelect value={checkerName} onChange={setCheckerName} />
            </div>
          </div>

          {/* 설비별 점검 테이블 */}
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border p-2">설비명</th>
                  <th className="border p-2">설치 위치</th>
                  <th className="border p-2">먼지</th>
                  <th className="border p-2">끈끈이</th>
                  <th className="border p-2">날파리</th>
                  <th className="border p-2">초파리</th>
                  <th className="border p-2">나방파리</th>
                  <th className="border p-2">날개</th>
                  <th className="border p-2">바퀴</th>
                  <th className="border p-2">개미</th>
                  <th className="border p-2">거미</th>
                  <th className="border p-2">취</th>
                  <th className="border p-2">기타</th>
                  <th className="border p-2">탈게</th>
                </tr>
              </thead>
              <tbody>
                {/* 포충등 */}
                {insectLamps.length > 0 && (
                  <>
                    <tr className="bg-blue-50">
                      <td colSpan={14} className="border p-2 font-semibold">
                        포충등 (비래 해충)
                      </td>
                    </tr>
                    {insectLamps.map((eq) => (
                      <tr key={eq.id}>
                        <td className="border p-2">
                          {eq.name}
                          <div className="text-xs text-gray-500">
                            {eq.zone === '청결' ? '청결 구역' : '일반 구역'}
                          </div>
                        </td>
                        <td className="border p-2">{eq.location}</td>
                        {(['dust', 'sticky', 'fly', 'fruit_fly', 'moth_fly', 'wing', 'cockroach', 'ant', 'spider', 'mouse', 'other', 'escape'] as const).map((field) => (
                          <td key={field} className="border p-2 text-center">
                            <Checkbox
                              checked={equipmentChecks[eq.id]?.[field] || false}
                              onCheckedChange={(checked) =>
                                handleCheckChange(eq.id, field, checked as boolean)
                              }
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </>
                )}

                {/* R-트랩 */}
                {rTraps.length > 0 && (
                  <>
                    <tr className="bg-green-50">
                      <td colSpan={14} className="border p-2 font-semibold">
                        R-트랩 (보행 해충)
                      </td>
                    </tr>
                    {rTraps.map((eq) => (
                      <tr key={eq.id}>
                        <td className="border p-2">
                          {eq.name}
                          <div className="text-xs text-gray-500">
                            {eq.zone === '청결' ? '청결 구역' : '일반 구역'}
                          </div>
                        </td>
                        <td className="border p-2">{eq.location}</td>
                        {(['dust', 'sticky', 'fly', 'fruit_fly', 'moth_fly', 'wing', 'cockroach', 'ant', 'spider', 'mouse', 'other', 'escape'] as const).map((field) => (
                          <td key={field} className="border p-2 text-center">
                            <Checkbox
                              checked={equipmentChecks[eq.id]?.[field] || false}
                              onCheckedChange={(checked) =>
                                handleCheckChange(eq.id, field, checked as boolean)
                              }
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </>
                )}
              </tbody>
            </table>
          </div>

          {/* 관리사항 */}
          <div>
            <Label>관리사항</Label>
            <Textarea
              value={managementNotes}
              onChange={(e) => setManagementNotes(e.target.value)}
              placeholder="관리사항을 입력하세요"
              rows={3}
            />
          </div>

          {/* 기준이탈 (원인파악) */}
          <div>
            <Label>기준이탈 (원인파악)</Label>
            <Textarea
              value={deviationReason}
              onChange={(e) => setDeviationReason(e.target.value)}
              placeholder="기준이탈 원인을 입력하세요"
              rows={3}
            />
          </div>

          {/* 개선조치 (조치사항) */}
          <div>
            <Label>개선조치 (조치사항)</Label>
            <Textarea
              value={improvementAction}
              onChange={(e) => setImprovementAction(e.target.value)}
              placeholder="개선조치 사항을 입력하세요"
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

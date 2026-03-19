import { useState } from "react";
import ChecklistFormLayout from "@/components/ChecklistFormLayout";
import type { ChecklistFormConfig } from "@/components/ChecklistFormLayout";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ThumbsUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const config: ChecklistFormConfig = {
  formType: "hygiene_facility_check",
  title: "위생시설 점검일지",
  listPath: "/hygiene-facility-check",
  documentTitle: "위생시설 점검일지",
};

const initialChecklistItems = [
  { id: 'location', label: '점검장소' },
  { id: 'toilet', label: '화장실청결' },
  { id: 'handwash', label: '손세척시설' },
  { id: 'locker', label: '탈의실' },
  { id: 'ventilation', label: '환기시설' },
  { id: 'screen', label: '방충망' },
  { id: 'drainage', label: '배수시설' },
];

export default function HygieneFacilityCheckForm() {
  const { toast } = useToast();
  const [checklist, setChecklist] = useState<Record<string, string>>(initialChecklistItems.reduce((acc, item) => ({ ...acc, [item.id]: '' }), {} as Record<string, string>));
  const [notes, setNotes] = useState('');
  const [actions, setActions] = useState('');
  const [operator, setOperator] = useState('');
  const [confirmer, setConfirmer] = useState('');

  const collectFormData = () => ({
    checklist,
    notes,
    actions,
    operator,
    confirmer,
  });

  const onDataRestore = (fd: any) => {
    if (fd.checklist) setChecklist(fd.checklist);
    if (fd.notes) setNotes(fd.notes);
    if (fd.actions) setActions(fd.actions);
    if (fd.operator) setOperator(fd.operator);
    if (fd.confirmer) setConfirmer(fd.confirmer);
  };

  const handleBatchApprove = () => {
    const allApproved = initialChecklistItems.reduce((acc, item) => ({ ...acc, [item.id]: '적합' }), {} as Record<string, string>);
    setChecklist(allApproved);
    toast({ title: '일괄 적용 완료', description: '모든 항목에 대해 \'적합\'으로 표시되었습니다.' });
  };

  const toggleCell = (id: string) => {
    setChecklist(prev => ({ ...prev, [id]: prev[id] === '적합' ? '부적합' : '적합' }));
  };

  const extraActions = (
    <Button variant="outline" onClick={handleBatchApprove}><ThumbsUp className="mr-2 h-4 w-4" /> 일괄적합</Button>
  );

  return (
    <ChecklistFormLayout
      config={config}
      collectFormData={collectFormData}
      onDataRestore={onDataRestore}
      extraActions={extraActions}
    >
      <div className="px-6 pb-6">
        <Table className="border">
          <TableHeader>
            <TableRow>
              {initialChecklistItems.map(item => <TableHead key={item.id} className="text-center">{item.label}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              {initialChecklistItems.map(item => (
                <TableCell key={item.id} className="text-center cursor-pointer" onClick={() => toggleCell(item.id)}>
                  {checklist[item.id] || ''}
                </TableCell>
              ))}
            </TableRow>
          </TableBody>
        </Table>

        <div className="mt-4 grid gap-4">
          <div>
            <label className="font-semibold">특이사항</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" />
          </div>
          <div>
            <label className="font-semibold">개선조치 및 결과</label>
            <Textarea value={actions} onChange={(e) => setActions(e.target.value)} className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="font-semibold">조치자</label>
              <Input value={operator} onChange={(e) => setOperator(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="font-semibold">확인자</label>
              <Input value={confirmer} onChange={(e) => setConfirmer(e.target.value)} className="mt-1" />
            </div>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-4">* 셀을 클릭하여 '적합'/'부적합' 상태를 변경할 수 있습니다.</p>
      </div>
    </ChecklistFormLayout>
  );
}

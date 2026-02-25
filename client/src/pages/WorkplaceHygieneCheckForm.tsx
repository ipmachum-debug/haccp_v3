import { useState } from "react";
import ChecklistFormLayout from "@/components/ChecklistFormLayout";
import type { ChecklistFormConfig } from "@/components/ChecklistFormLayout";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ThumbsUp } from "lucide-react";

const config: ChecklistFormConfig = {
  formType: "workplace_hygiene_check",
  title: "작업장 위생관리 점검표",
  listPath: "/workplace-hygiene-check",
  documentTitle: "작업장 위생관리 점검표",
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

const initialChecklistState = initialChecklistItems.reduce((acc, item) => ({ ...acc, [item.id]: '' }), {} as Record<string, string>);

export default function WorkplaceHygieneCheckForm() {
  const [checklist, setChecklist] = useState(initialChecklistState);
  const [notes, setNotes] = useState('');
  const [actions, setActions] = useState('');

  const collectFormData = () => ({
    checklist,
    notes,
    actions,
  });

  const onDataRestore = (fd: any) => {
    if (fd.checklist) setChecklist(fd.checklist);
    if (fd.notes) setNotes(fd.notes);
    if (fd.actions) setActions(fd.actions);
  };

  const toggleCell = (id: string) => {
    setChecklist(prev => ({ ...prev, [id]: prev[id] === '적합' ? '부적합' : '적합' }));
  };

  const handleBatchApprove = () => {
    const allApproved = initialChecklistItems.reduce((acc, item) => ({ ...acc, [item.id]: '적합' }), {} as Record<string, string>);
    setChecklist(allApproved);
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
        </div>
        <p className="text-sm text-muted-foreground mt-4">* 셀을 클릭하여 '적합'/'부적합' 상태를 변경할 수 있습니다.</p>
      </div>
    </ChecklistFormLayout>
  );
}

export { WorkplaceHygieneCheckForm };

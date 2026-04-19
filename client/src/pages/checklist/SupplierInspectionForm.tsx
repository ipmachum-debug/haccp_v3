
import { useState } from "react";
import ChecklistFormLayout from "@/components/checklist/ChecklistFormLayout";
import type { ChecklistFormConfig } from "@/components/checklist/ChecklistFormLayout";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from '@/components/ui/textarea';
import { Button } from "@/components/ui/button";
import { useToast } from '@/hooks/use-toast';

const config: ChecklistFormConfig = {
  formType: "supplier_inspection",
  title: "협력업체 점검표",
  listPath: "/supplier-inspection",
  documentTitle: "협력업체 점검표",
};

const inspectionItems = [
  { id: 'supplierName', label: '업체명' },
  { id: 'hygiene', label: '위생상태' },
  { id: 'quality', label: '품질관리' },
  { id: 'documents', label: '서류관리' },
  { id: 'facilities', label: '시설상태' },
  { id: 'overall', label: '종합판정' },
];

const initialFormData = inspectionItems.map((item) => ({
  ...item,
  status: '',
}));

export default function SupplierInspectionForm() {
  const { toast } = useToast();
  const [formData, setFormData] = useState(initialFormData);
  const [notes, setNotes] = useState('');
  const [correctiveAction, setCorrectiveAction] = useState('');
  const [actionTaker, setActionTaker] = useState('');
  const [confirmer, setConfirmer] = useState('');

  const collectFormData = () => ({
    formData,
    notes,
    correctiveAction,
    actionTaker,
    confirmer,
  });

  const onDataRestore = (fd: any) => {
    if (fd.formData) setFormData(fd.formData);
    if (fd.notes) setNotes(fd.notes);
    if (fd.correctiveAction) setCorrectiveAction(fd.correctiveAction);
    if (fd.actionTaker) setActionTaker(fd.actionTaker);
    if (fd.confirmer) setConfirmer(fd.confirmer);
  };

  const handleBulkPass = () => {
    setFormData(
      formData.map((item) => ({
        ...item,
        status: item.id === 'supplierName' ? '' : '적합',
      }))
    );
    toast({
      title: '일괄 적용 완료',
      description: '모든 점검 항목을 "적합"으로 변경했습니다.',
    });
  };

  const toggleStatus = (id: string) => {
    if (id === 'supplierName') return;
    setFormData(
      formData.map((item) =>
        item.id === id
          ? {
              ...item,
              status: item.status === '적합' ? '부적합' : '적합',
            }
          : item
      )
    );
  };

  const extraActions = (
    <Button variant="outline" onClick={handleBulkPass}>
      일괄적합
    </Button>
  );

  return (
    <ChecklistFormLayout
      config={config}
      collectFormData={collectFormData}
      onDataRestore={onDataRestore}
      extraActions={extraActions}
    >
      <div className="px-6 pb-6">
        <div className="grid grid-cols-3 gap-4 mb-4 print:grid-cols-3 print:gap-2 print:text-sm">
            <div className="flex items-center space-x-2">
                <label className="font-semibold whitespace-nowrap">점검일:</label>
                <Input type="date" defaultValue={new Date().toISOString().substring(0, 10)} />
            </div>
            <div className="flex items-center space-x-2">
                <label className="font-semibold whitespace-nowrap">점검자:</label>
                <Input placeholder="점검자" />
            </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              {inspectionItems.map((item) => (
                <TableHead key={item.id} className="text-center">{item.label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              {formData.map((item) => (
                <TableCell key={item.id} className="text-center h-24" onClick={() => toggleStatus(item.id)}>
                  {item.id === 'supplierName' ? (
                    <Input placeholder="업체명 입력" className="text-center" />
                  ) : (
                    <span className={`cursor-pointer ${item.status === '적합' ? 'text-green-500' : item.status === '부적합' ? 'text-red-500' : ''}`}>
                      {item.status || '-'}
                    </span>
                  )}
                </TableCell>
              ))}
            </TableRow>
          </TableBody>
        </Table>

        <div className="mt-6 space-y-4">
          <div>
            <label htmlFor="notes" className="font-semibold">특이사항</label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="특이사항을 입력하세요." />
          </div>
          <div>
            <label htmlFor="correctiveAction" className="font-semibold">개선조치 및 결과</label>
            <Textarea id="correctiveAction" value={correctiveAction} onChange={(e) => setCorrectiveAction(e.target.value)} placeholder="개선조치 및 결과를 입력하세요." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="actionTaker" className="font-semibold">조치자</label>
              <Input id="actionTaker" value={actionTaker} onChange={(e) => setActionTaker(e.target.value)} placeholder="조치자 성명" />
            </div>
            <div>
              <label htmlFor="confirmer" className="font-semibold">확인자</label>
              <Input id="confirmer" value={confirmer} onChange={(e) => setConfirmer(e.target.value)} placeholder="확인자 성명" />
            </div>
          </div>
        </div>
      </div>
    </ChecklistFormLayout>
  );
}

export { SupplierInspectionForm };

import { useState } from "react";
import ChecklistFormLayout from "@/components/checklist/ChecklistFormLayout";
import type { ChecklistFormConfig } from "@/components/checklist/ChecklistFormLayout";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { CheckCircle, Settings } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const config: ChecklistFormConfig = {
  formType: "product_test_report",
  title: "제품검사 성적서",
  listPath: "/product-test-report",
  documentTitle: "제품검사 성적서",
};

const initialChecklistItems = [
  { id: 1, item: '성상', standard: '고유의 성상', result: '' },
  { id: 2, item: '수분', standard: '15% 이하', result: '' },
  { id: 3, item: '타르색소', standard: '불검출', result: '' },
  { id: 4, item: '대장균', standard: '음성', result: '' },
  { id: 5, item: '세균수', standard: '1.0x10^5 이하', result: '' },
];

export default function ProductTestReportForm() {
  const { toast } = useToast();
  const [items, setItems] = useState(initialChecklistItems);
  const [productName, setProductName] = useState('');
  const [lotNo, setLotNo] = useState('');
  const [notes, setNotes] = useState('');
  const [correctiveAction, setCorrectiveAction] = useState('');
  const [actionTaker, setActionTaker] = useState('');
  const [confirmer, setConfirmer] = useState('');

  const collectFormData = () => ({
    items,
    productName,
    lotNo,
    notes,
    correctiveAction,
    actionTaker,
    confirmer,
  });

  const onDataRestore = (fd: any) => {
    if (fd.items) setItems(fd.items);
    if (fd.productName) setProductName(fd.productName);
    if (fd.lotNo) setLotNo(fd.lotNo);
    if (fd.notes) setNotes(fd.notes);
    if (fd.correctiveAction) setCorrectiveAction(fd.correctiveAction);
    if (fd.actionTaker) setActionTaker(fd.actionTaker);
    if (fd.confirmer) setConfirmer(fd.confirmer);
  };

  const handleToggleResult = (id: number) => {
    setItems(items.map(item => 
      item.id === id ? { ...item, result: item.result === '적합' ? '부적합' : '적합' } : item
    ));
  };

  const handleBulkPass = () => {
    setItems(items.map(item => ({ ...item, result: '적합' })));
    toast({ title: '성공', description: '모든 항목이 일괄적으로 적합 처리되었습니다.' });
  };

  const extraActions = (
    <>
      <Button variant="outline" onClick={handleBulkPass}><CheckCircle className="mr-2 h-4 w-4" /> 일괄적합</Button>
      <Button variant="outline"><Settings className="mr-2 h-4 w-4" /> 설정</Button>
    </>
  );

  return (
    <ChecklistFormLayout
      config={config}
      collectFormData={collectFormData}
      onDataRestore={onDataRestore}
      extraActions={extraActions}
    >
      <div className="px-6 pb-6">
        <div className="grid grid-cols-2 gap-4 mb-4">
            <Input placeholder="제품명" value={productName} onChange={(e) => setProductName(e.target.value)} />
            <Input placeholder="로트번호" value={lotNo} onChange={(e) => setLotNo(e.target.value)} />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-1/4">검사항목</TableHead>
              <TableHead className="w-1/4">검사기준</TableHead>
              <TableHead className="w-1/4">검사결과</TableHead>
              <TableHead className="w-1/4">판정</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.item}</TableCell>
                <TableCell>{item.standard}</TableCell>
                <TableCell onClick={() => handleToggleResult(item.id)} className="cursor-pointer">
                  {item.result || '클릭하여 판정'}
                </TableCell>
                <TableCell>{item.result === '적합' ? 'O' : item.result === '부적합' ? 'X' : ''}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="mt-6 space-y-4">
          <div>
            <h4 className="font-semibold mb-2">특이사항</h4>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div>
            <h4 className="font-semibold mb-2">개선조치 및 결과</h4>
            <Textarea value={correctiveAction} onChange={(e) => setCorrectiveAction(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input placeholder="조치자" value={actionTaker} onChange={(e) => setActionTaker(e.target.value)} />
            <Input placeholder="확인자" value={confirmer} onChange={(e) => setConfirmer(e.target.value)} />
          </div>
        </div>
      </div>
    </ChecklistFormLayout>
  );
}

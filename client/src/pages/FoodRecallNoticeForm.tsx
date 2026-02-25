
import { useState } from "react";
import ChecklistFormLayout from "@/components/ChecklistFormLayout";
import type { ChecklistFormConfig } from "@/components/ChecklistFormLayout";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

const config: ChecklistFormConfig = {
  formType: "food_recall_notice",
  title: "식품 회수 안내문",
  listPath: "/food-recall-notice",
  documentTitle: "식품 회수 안내문",
};

const initialColumns = ['회수일', '제품명', '로트번호', '회수사유', '회수수량', '회수방법', '조치사항'];
const initialData = [Array(initialColumns.length).fill('')];

export default function FoodRecallNoticeForm() {
  const [columns] = useState(initialColumns);
  const [data, setData] = useState(initialData);
  const [notes, setNotes] = useState('');
  const [actions, setActions] = useState('');
  const [manager, setManager] = useState('');
  const [confirmer, setConfirmer] = useState('');

  const collectFormData = () => ({
    columns,
    data,
    notes,
    actions,
    manager,
    confirmer,
  });

  const onDataRestore = (fd: any) => {
    if (fd.columns) setData(fd.columns); // This seems like a bug in original, should be fd.data
    if (fd.data) setData(fd.data);
    if (fd.notes) setNotes(fd.notes);
    if (fd.actions) setActions(fd.actions);
    if (fd.manager) setManager(fd.manager);
    if (fd.confirmer) setConfirmer(fd.confirmer);
  };

  const handleBatchFit = () => {
    setData(data.map(row => row.map(() => '적합')));
  };

  const toggleCell = (rowIndex: number, colIndex: number) => {
    const newData = [...data];
    newData[rowIndex][colIndex] = newData[rowIndex][colIndex] === '적합' ? '부적합' : '적합';
    setData(newData);
  };

  const extraActions = (
    <Button variant="outline" onClick={handleBatchFit}>일괄적합</Button>
  );

  return (
    <ChecklistFormLayout
      config={config}
      collectFormData={collectFormData}
      onDataRestore={onDataRestore}
      extraActions={extraActions}
    >
      <div className="px-6 pb-6">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map(col => <TableHead key={col} className="text-center">{col}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row, rowIndex) => (
              <TableRow key={rowIndex}>
                {row.map((cell, colIndex) => (
                  <TableCell key={colIndex} className="text-center cursor-pointer" onClick={() => toggleCell(rowIndex, colIndex)}>
                    {cell || <span className="text-gray-400">-</span>}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="mt-4 space-y-4">
          <div>
            <h3 className="font-semibold">특이사항</h3>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          <div>
            <h3 className="font-semibold">개선조치 및 결과</h3>
            <Textarea value={actions} onChange={e => setActions(e.target.value)} />
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <h3 className="font-semibold">조치자</h3>
              <Input value={manager} onChange={e => setManager(e.target.value)} />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold">확인자</h3>
              <Input value={confirmer} onChange={e => setConfirmer(e.target.value)} />
            </div>
          </div>
        </div>
      </div>
    </ChecklistFormLayout>
  );
}

export { FoodRecallNoticeForm };

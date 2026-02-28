import { useState } from "react";
import ChecklistFormLayout from "@/components/ChecklistFormLayout";
import type { ChecklistFormConfig } from "@/components/ChecklistFormLayout";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";

const config: ChecklistFormConfig = {
  formType: "equipment_history",
  title: "시설·설비 이력카드",
  listPath: "/equipment-history",
  documentTitle: "시설·설비 이력카드",
};

const initialColumns = ["설비명", "모델명", "제조사", "설치일", "점검주기", "최근점검일", "상태", "비고"];
const initialData = [
  { "설비명": "", "모델명": "", "제조사": "", "설치일": "", "점검주기": "", "최근점검일": "", "상태": "", "비고": "" },
];

export default function EquipmentHistoryForm() {
  const [columns] = useState(initialColumns);
  const [data, setData] = useState(initialData);
  const [notes, setNotes] = useState("");
  const [improvements, setImprovements] = useState("");
  const [actionTaker, setActionTaker] = useState("");
  const [confirmer, setConfirmer] = useState("");

  const collectFormData = () => ({
    data,
    notes,
    improvements,
    actionTaker,
    confirmer,
  });

  const onDataRestore = (fd: any) => {
    if (fd.data) setData(fd.data);
    if (fd.notes) setNotes(fd.notes);
    if (fd.improvements) setImprovements(fd.improvements);
    if (fd.actionTaker) setActionTaker(fd.actionTaker);
    if (fd.confirmer) setConfirmer(fd.confirmer);
  };

  const handleDataChange = (rowIndex: number, colName: string, value: string) => {
    const newData = [...data];
    newData[rowIndex][colName] = value;
    setData(newData);
  };

  const handleBatchFit = () => {
    setData(data.map(row => ({ ...row, "상태": "적합" })))
  };

  const extraActions = (
    <>
      <Button variant="outline" onClick={handleBatchFit}>일괄적합</Button>
      {/* <Button variant="outline"><Settings className="w-4 h-4 mr-2" />설정</Button> */}
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
        <Table className="border">
          <TableHeader>
            <TableRow>
              {columns.map((col) => <TableHead key={col} className="border text-center h-12">{col}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row, rowIndex) => (
              <TableRow key={rowIndex}>
                {columns.map((col) => (
                  <TableCell key={col} className="border text-center p-0 h-12">
                     <Input
                       type="text"
                       value={row[col]}
                       onChange={(e) => handleDataChange(rowIndex, col, e.target.value)}
                       className="w-full h-full text-center bg-transparent border-none focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                     />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="mt-4 space-y-4">
            <div>
                <label className="font-bold">특이사항</label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full p-2 mt-1 border rounded-md" rows={3} />
            </div>
            <div>
                <label className="font-bold">개선조치 및 결과</label>
                <Textarea value={improvements} onChange={(e) => setImprovements(e.target.value)} className="w-full p-2 mt-1 border rounded-md" rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="font-bold">조치자</label>
                    <Input type="text" value={actionTaker} onChange={(e) => setActionTaker(e.target.value)} className="w-full p-2 mt-1 border rounded-md" />
                </div>
                <div>
                    <label className="font-bold">확인자</label>
                    <Input type="text" value={confirmer} onChange={(e) => setConfirmer(e.target.value)} className="w-full p-2 mt-1 border rounded-md" />
                </div>
            </div>
        </div>
      </div>
    </ChecklistFormLayout>
  );
}

export { EquipmentHistoryForm };

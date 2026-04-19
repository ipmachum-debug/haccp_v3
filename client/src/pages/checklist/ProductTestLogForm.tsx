import { useState } from "react";
import ChecklistFormLayout from "@/components/checklist/ChecklistFormLayout";
import type { ChecklistFormConfig } from "@/components/checklist/ChecklistFormLayout";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useIndustryLabel } from "@/hooks/useIndustryFeatures";

const config: ChecklistFormConfig = {
  formType: "product_test_log",
  title: "제품 검사 일지",
  listPath: "/product-test-log",
  documentTitle: "제품 검사 일지",
};

const initialRows = [
  { id: 1, productName: "", lotNumber: "", checkItem: "외관", result: "", decision: "" },
  { id: 2, productName: "", lotNumber: "", checkItem: "성상", result: "", decision: "" },
  { id: 3, productName: "", lotNumber: "", checkItem: "수분", result: "", decision: "" },
  { id: 4, productName: "", lotNumber: "", checkItem: "함량", result: "", decision: "" },
];

export default function ProductTestLogForm() {
  const L = useIndustryLabel();
  const [rows, setRows] = useState(initialRows);
  const [notes, setNotes] = useState("");
  const [correctiveAction, setCorrectiveAction] = useState("");
  const [actionTaker, setActionTaker] = useState("");
  const [confirmer, setConfirmer] = useState("");

  const collectFormData = () => ({
    rows,
    notes,
    correctiveAction,
    actionTaker,
    confirmer,
  });

  const onDataRestore = (fd: any) => {
    if (fd.rows) setRows(fd.rows);
    if (fd.notes) setNotes(fd.notes);
    if (fd.correctiveAction) setCorrectiveAction(fd.correctiveAction);
    if (fd.actionTaker) setActionTaker(fd.actionTaker);
    if (fd.confirmer) setConfirmer(fd.confirmer);
  };

  const handleCellClick = (rowIndex: number, field: "result" | "decision") => {
    const newRows = [...rows];
    if (newRows[rowIndex][field] === "적합" || newRows[rowIndex][field] === "O") {
      newRows[rowIndex][field] = "부적합";
    } else {
      newRows[rowIndex][field] = "적합";
    }
    setRows(newRows);
  };

  const handleBatchFit = () => {
    const newRows = rows.map(row => ({ ...row, result: "적합", decision: "O" }));
    setRows(newRows);
  };

  return (
    <ChecklistFormLayout
      config={config}
      collectFormData={collectFormData}
      onDataRestore={onDataRestore}
      extraActions={<Button variant="outline" onClick={handleBatchFit}>일괄적합</Button>}
    >
      <div className="px-6 pb-6">
        <p className="text-sm text-gray-500 mb-4">※ 부적합 항목 발생 시 특이사항에 상세 내용을 기록하고 개선조치를 실시합니다.</p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>검사일</TableHead>
              <TableHead>{`${L("product")}명`}</TableHead>
              <TableHead>로트번호</TableHead>
              <TableHead>검사항목</TableHead>
              <TableHead>검사결과</TableHead>
              <TableHead>판정</TableHead>
              <TableHead>검사자</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, rowIndex) => (
              <TableRow key={row.id}>
                <TableCell><Input type="date" className="w-full" /></TableCell>
                <TableCell><Input value={row.productName} onChange={(e) => { const newRows = [...rows]; newRows[rowIndex].productName = e.target.value; setRows(newRows); }} /></TableCell>
                <TableCell><Input value={row.lotNumber} onChange={(e) => { const newRows = [...rows]; newRows[rowIndex].lotNumber = e.target.value; setRows(newRows); }} /></TableCell>
                <TableCell>{row.checkItem}</TableCell>
                <TableCell onClick={() => handleCellClick(rowIndex, "result")} className="cursor-pointer">{row.result}</TableCell>
                <TableCell onClick={() => handleCellClick(rowIndex, "decision")} className="cursor-pointer">{row.decision}</TableCell>
                <TableCell><Input className="w-full" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">특이사항</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">개선조치 및 결과</label>
            <Input value={correctiveAction} onChange={(e) => setCorrectiveAction(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">조치자</label>
              <Input value={actionTaker} onChange={(e) => setActionTaker(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">확인자</label>
              <Input value={confirmer} onChange={(e) => setConfirmer(e.target.value)} />
            </div>
          </div>
        </div>
      </div>
    </ChecklistFormLayout>
  );
}

export { ProductTestLogForm };

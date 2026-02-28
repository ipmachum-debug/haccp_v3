import { useState } from "react";
import ChecklistFormLayout from "@/components/ChecklistFormLayout";
import type { ChecklistFormConfig } from "@/components/ChecklistFormLayout";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const config: ChecklistFormConfig = {
  formType: "weight_quality_check",
  title: "중량 및 품질 검사 일지",
  listPath: "/weight-quality-check",
  documentTitle: "중량 및 품질 검사 일지",
};

const initialRows = Array(5).fill({ productName: "", lotNumber: "", statedWeight: "", actualWeight1: "", actualWeight2: "", actualWeight3: "", averageWeight: "", judgment: "부적합" });

export default function WeightQualityCheckForm() {
  const { toast } = useToast();
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

  const handleToggleJudgment = (index: number) => {
    const newRows = [...rows];
    newRows[index].judgment = newRows[index].judgment === "적합" ? "부적합" : "적합";
    setRows(newRows);
  };

  const handleBulkPass = () => {
    const newRows = rows.map(row => ({ ...row, judgment: "적합" }));
    setRows(newRows);
    toast({ title: "일괄 적용 완료", description: "모든 항목을 '적합'으로 처리했습니다." });
  };

  const calculateAverage = (row: any) => {
      const weights = [parseFloat(row.actualWeight1), parseFloat(row.actualWeight2), parseFloat(row.actualWeight3)].filter(w => !isNaN(w));
      if (weights.length === 0) return "";
      const avg = weights.reduce((a, b) => a + b, 0) / weights.length;
      return avg.toFixed(2);
  }

  const handleInputChange = (index: number, field: string, value: string) => {
      const newRows = [...rows];
      const updatedRow = { ...newRows[index], [field]: value };

      if (field.startsWith("actualWeight")) {
          updatedRow.averageWeight = calculateAverage(updatedRow);
      }

      newRows[index] = updatedRow;
      setRows(newRows);
  }

  return (
    <ChecklistFormLayout
      config={config}
      collectFormData={collectFormData}
      onDataRestore={onDataRestore}
      extraActions={<Button variant="outline" onClick={handleBulkPass}>일괄적합</Button>}
    >
      <div className="px-6 pb-6">
        <Table className="border">
          <TableHeader>
            <TableRow>
              <TableHead className="border text-center">제품명</TableHead>
              <TableHead className="border text-center">로트번호</TableHead>
              <TableHead className="border text-center">표시중량</TableHead>
              <TableHead className="border text-center">실측중량1</TableHead>
              <TableHead className="border text-center">실측중량2</TableHead>
              <TableHead className="border text-center">실측중량3</TableHead>
              <TableHead className="border text-center">평균중량</TableHead>
              <TableHead className="border text-center">판정</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={index}>
                <TableCell className="p-0 border"><Input value={row.productName} onChange={(e) => handleInputChange(index, "productName", e.target.value)} className="border-0 text-center" /></TableCell>
                <TableCell className="p-0 border"><Input value={row.lotNumber} onChange={(e) => handleInputChange(index, "lotNumber", e.target.value)} className="border-0 text-center" /></TableCell>
                <TableCell className="p-0 border"><Input value={row.statedWeight} onChange={(e) => handleInputChange(index, "statedWeight", e.target.value)} className="border-0 text-center" /></TableCell>
                <TableCell className="p-0 border"><Input value={row.actualWeight1} onChange={(e) => handleInputChange(index, "actualWeight1", e.target.value)} className="border-0 text-center" /></TableCell>
                <TableCell className="p-0 border"><Input value={row.actualWeight2} onChange={(e) => handleInputChange(index, "actualWeight2", e.target.value)} className="border-0 text-center" /></TableCell>
                <TableCell className="p-0 border"><Input value={row.actualWeight3} onChange={(e) => handleInputChange(index, "actualWeight3", e.target.value)} className="border-0 text-center" /></TableCell>
                <TableCell className="p-0 border"><Input value={row.averageWeight} className="border-0 text-center bg-gray-100" readOnly /></TableCell>
                <TableCell 
                  className={`border text-center cursor-pointer ${row.judgment === "적합" ? "bg-green-200" : "bg-red-200"}`}
                  onClick={() => handleToggleJudgment(index)}
                >
                  {row.judgment}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="mt-4 space-y-4">
            <div>
                <label className="font-semibold">특이사항</label>
                <Textarea placeholder="특이사항을 입력하세요." value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <div>
                <label className="font-semibold">개선조치 및 결과</label>
                <Textarea placeholder="개선조치 및 결과를 입력하세요." value={correctiveAction} onChange={(e) => setCorrectiveAction(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="font-semibold">조치자</label>
                    <Input placeholder="조치자 성명" value={actionTaker} onChange={(e) => setActionTaker(e.target.value)} />
                </div>
                <div>
                    <label className="font-semibold">확인자</label>
                    <Input placeholder="확인자 성명" value={confirmer} onChange={(e) => setConfirmer(e.target.value)} />
                </div>
            </div>
        </div>
        <p className="text-xs text-gray-500 mt-4">* 판정 셀을 클릭하여 '적합'/'부적합'을 변경할 수 있습니다.</p>
      </div>
    </ChecklistFormLayout>
  );
}

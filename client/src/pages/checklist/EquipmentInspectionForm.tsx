import { useState } from "react";
import ChecklistFormLayout from "@/components/checklist/ChecklistFormLayout";
import type { ChecklistFormConfig } from "@/components/checklist/ChecklistFormLayout";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const config: ChecklistFormConfig = {
  formType: "equipment_inspection",
  title: "시설·설비·제조도구 점검표",
  listPath: "/equipment-inspection",
  documentTitle: "시설·설비·제조도구 점검표",
};

const initialColumns = ["설비명", "외관상태", "작동상태", "청결상태", "안전장치", "윤활상태", "판정"];
const initialData: Record<string, string>[] = [
  { "설비명": "냉장/냉동고", "외관상태": "", "작동상태": "", "청결상태": "", "안전장치": "", "윤활상태": "N/A", "판정": "" },
  { "설비명": "금속검출기", "외관상태": "", "작동상태": "", "청결상태": "", "안전장치": "", "윤활상태": "N/A", "판정": "" },
  { "설비명": "포장기", "외관상태": "", "작동상태": "", "청결상태": "", "안전장치": "", "윤활상태": "", "판정": "" },
  { "설비명": "살균기", "외관상태": "", "작동상태": "", "청결상태": "", "안전장치": "", "윤활상태": "N/A", "판정": "" },
  { "설비명": "운반차량", "외관상태": "", "작동상태": "", "청결상태": "", "안전장치": "", "윤활상태": "N/A", "판정": "" },
];

export default function EquipmentInspectionForm() {
  const { toast } = useToast();
  const [data, setData] = useState(initialData);
  const [notes, setNotes] = useState("");
  const [actions, setActions] = useState("");
  const [operator, setOperator] = useState("");
  const [verifier, setVerifier] = useState("");

  const collectFormData = () => ({
    data,
    notes,
    actions,
    operator,
    verifier,
  });

  const onDataRestore = (fd: any) => {
    if (fd.data) setData(fd.data);
    if (fd.notes) setNotes(fd.notes);
    if (fd.actions) setActions(fd.actions);
    if (fd.operator) setOperator(fd.operator);
    if (fd.verifier) setVerifier(fd.verifier);
  };

  const handleCellClick = (rowIndex: number, colName: string) => {
    if (colName === "설비명" || colName === "판정" || data[rowIndex][colName] === "N/A") return;

    setData(prevData => {
      const newData = [...prevData];
      const currentValue = newData[rowIndex][colName];
      newData[rowIndex][colName] = currentValue === "적합" ? "부적합" : "적합";
      return newData;
    });
  };

  const handleBatchPass = () => {
    setData(prevData =>
      prevData.map(row => {
        const newRow = { ...row };
        initialColumns.forEach(col => {
          if (col !== "설비명" && col !== "판정" && newRow[col] !== "N/A") {
            newRow[col] = "적합";
          }
        });
        return newRow;
      })
    );
    toast({ title: "일괄 적용 완료", description: "모든 점검 항목을 '적합'으로 처리했습니다." });
  };

  const extraActions = (
    <Button variant="outline" onClick={handleBatchPass}>일괄적합</Button>
  );

  return (
    <ChecklistFormLayout
      config={config}
      collectFormData={collectFormData}
      onDataRestore={onDataRestore}
      extraActions={extraActions}
    >
      <div className="px-6 pb-6 space-y-4">
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  {initialColumns.map(col => <TableHead key={col} className="text-center">{col}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row, rowIndex) => (
                  <TableRow key={rowIndex}>
                    {initialColumns.map(colName => (
                      <TableCell
                        key={colName}
                        className={`text-center cursor-pointer ${row[colName] === "부적합" ? "text-red-500 font-bold" : ""}`}
                        onClick={() => handleCellClick(rowIndex, colName)}
                      >
                        {row[colName]}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle>특이사항</CardTitle></CardHeader>
            <CardContent>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="점검 중 발견된 특이사항을 입력하세요." />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>개선조치 및 결과</CardTitle></CardHeader>
            <CardContent>
              <Textarea value={actions} onChange={e => setActions(e.target.value)} placeholder="부적합 사항에 대한 개선조치 및 결과를 입력하세요." />
            </CardContent>
          </Card>
        </div>
        <div className="grid grid-cols-2 gap-4">
            <Input value={operator} onChange={e => setOperator(e.target.value)} placeholder="조치자" />
            <Input value={verifier} onChange={e => setVerifier(e.target.value)} placeholder="확인자" />
        </div>
        <p className="text-sm text-muted-foreground">
          * 점검항목 셀을 클릭하여 '적합'/'부적합' 상태를 변경할 수 있습니다. (N/A 제외)
        </p>
      </div>
    </ChecklistFormLayout>
  );
}

export { EquipmentInspectionForm };

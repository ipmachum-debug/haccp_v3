import { useState } from "react";
import ChecklistFormLayout from "@/components/ChecklistFormLayout";
import type { ChecklistFormConfig } from "@/components/ChecklistFormLayout";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const config: ChecklistFormConfig = {
  formType: "vehicle_temperature_check",
  title: "입·출고 차량 온도기록지",
  listPath: "/vehicle-temperature-check",
  documentTitle: "입·출고 차량 온도기록지",
};

const initialRows = [
  { id: 1, vehicleNumber: "", type: "입고", productName: "", standardTemp: "5℃ 이하", measuredTemp: "", result: "미판정" },
  { id: 2, vehicleNumber: "", type: "출고", productName: "", standardTemp: "5℃ 이하", measuredTemp: "", result: "미판정" },
  { id: 3, vehicleNumber: "", type: "입고", productName: "", standardTemp: "-18℃ 이하", measuredTemp: "", result: "미판정" },
];

export default function VehicleTemperatureCheckForm() {
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

  const handleCellChange = (id: number, field: string, value: string) => {
    setRows(rows.map(row => (row.id === id ? { ...row, [field]: value } : row)));
  };

  const toggleResult = (id: number) => {
    setRows(
      rows.map(row => {
        if (row.id === id) {
          const newResult = row.result === "적합" ? "부적합" : "적합";
          return { ...row, result: newResult };
        }
        return row;
      })
    );
  };

  const applyAllPass = () => {
    setRows(rows.map(row => ({ ...row, result: "적합" })));
    toast({ title: "성공", description: "모든 항목이 '적합'으로 처리되었습니다." });
  };

  return (
    <ChecklistFormLayout
      config={config}
      collectFormData={collectFormData}
      onDataRestore={onDataRestore}
      extraActions={<Button variant="outline" onClick={applyAllPass}>일괄적합</Button>}
    >
      <div className="px-6 pb-6">
        <Card>
          <CardContent className="p-6">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[15%]">차량번호</TableHead>
                    <TableHead className="w-[10%]">입출고구분</TableHead>
                    <TableHead className="w-[20%]">제품명</TableHead>
                    <TableHead className="w-[15%]">기준온도</TableHead>
                    <TableHead className="w-[15%]">측정온도</TableHead>
                    <TableHead className="w-[15%] text-center">판정</TableHead>
                    <TableHead className="w-[10%]">비고</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(row => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <Input
                          value={row.vehicleNumber}
                          onChange={e => handleCellChange(row.id, "vehicleNumber", e.target.value)}
                          className="w-full"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={row.type}
                          onChange={e => handleCellChange(row.id, "type", e.target.value)}
                          className="w-full"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={row.productName}
                          onChange={e => handleCellChange(row.id, "productName", e.target.value)}
                          className="w-full"
                        />
                      </TableCell>
                      <TableCell>{row.standardTemp}</TableCell>
                      <TableCell>
                        <Input
                          value={row.measuredTemp}
                          onChange={e => handleCellChange(row.id, "measuredTemp", e.target.value)}
                          className="w-full"
                        />
                      </TableCell>
                      <TableCell className="text-center cursor-pointer" onClick={() => toggleResult(row.id)}>
                        <span
                          className={`font-semibold ${
                            row.result === "적합" ? "text-green-600" : row.result === "부적합" ? "text-red-600" : "text-gray-500"
                          }`}>
                          {row.result}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Input className="w-full" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>특이사항</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>개선조치 및 결과</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea value={correctiveAction} onChange={e => setCorrectiveAction(e.target.value)} />
            </CardContent>
          </Card>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
            <Input placeholder="조치자" value={actionTaker} onChange={e => setActionTaker(e.target.value)} />
            <Input placeholder="확인자" value={confirmer} onChange={e => setConfirmer(e.target.value)} />
        </div>
      </div>
    </ChecklistFormLayout>
  );
}

export { VehicleTemperatureCheckForm };

import { useState } from "react";
import ChecklistFormLayout from "@/components/ChecklistFormLayout";
import type { ChecklistFormConfig } from "@/components/ChecklistFormLayout";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

const config: ChecklistFormConfig = {
  formType: "illumination_check",
  title: "조도점검표",
  listPath: "/illumination-check",
  documentTitle: "조도점검표",
};

const initialRows = [
  { id: 1, location: "포장실", standard: "500 lux 이상", measurement: "", result: "", remarks: "" },
  { id: 2, location: "내포장실", standard: "500 lux 이상", measurement: "", result: "", remarks: "" },
  { id: 3, location: "외포장실", standard: "200 lux 이상", measurement: "", result: "", remarks: "" },
  { id: 4, location: "원료처리실", standard: "500 lux 이상", measurement: "", result: "", remarks: "" },
  { id: 5, location: "검사실", standard: "500 lux 이상", measurement: "", result: "", remarks: "" },
];

export default function IlluminationCheckForm() {
  const { toast } = useToast();
  const [rows, setRows] = useState(initialRows);
  const [notes, setNotes] = useState("");
  const [actions, setActions] = useState("");

  const collectFormData = () => ({
    rows,
    notes,
    actions,
  });

  const onDataRestore = (fd: any) => {
    if (fd.rows) setRows(fd.rows);
    if (fd.notes) setNotes(fd.notes);
    if (fd.actions) setActions(fd.actions);
  };

  const handleToggleResult = (id: number) => {
    setRows(
      rows.map((row) =>
        row.id === id ? { ...row, result: row.result === "적합" ? "부적합" : "적합" } : row
      )
    );
  };

  const handleBulkPass = () => {
    setRows(rows.map((row) => ({ ...row, result: "적합" })));
    toast({ title: "일괄 적용 완료", description: "모든 항목을 '적합'으로 처리했습니다." });
  };

  const extraActions = (
    <Button variant="outline" onClick={handleBulkPass}>일괄적합</Button>
  );

  return (
    <ChecklistFormLayout
      config={config}
      collectFormData={collectFormData}
      onDataRestore={onDataRestore}
      extraActions={extraActions}
    >
      <div className="px-6 pb-6">
        <Card>
          <CardHeader>
            <CardTitle>점검 내용</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[20%]">측정장소</TableHead>
                  <TableHead className="w-[20%]">기준조도(lux)</TableHead>
                  <TableHead className="w-[20%]">측정조도(lux)</TableHead>
                  <TableHead className="w-[15%]">판정</TableHead>
                  <TableHead className="w-[25%]">비고</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.location}</TableCell>
                    <TableCell>{row.standard}</TableCell>
                    <TableCell>
                      <Input
                        type="text"
                        value={row.measurement}
                        onChange={(e) =>
                          setRows(
                            rows.map((r) =>
                              r.id === row.id ? { ...r, measurement: e.target.value } : r
                            )
                          )
                        }
                      />
                    </TableCell>
                    <TableCell onClick={() => handleToggleResult(row.id)} className="cursor-pointer text-center">
                      {row.result || "-"}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="text"
                        value={row.remarks}
                        onChange={(e) =>
                          setRows(
                            rows.map((r) =>
                              r.id === row.id ? { ...r, remarks: e.target.value } : r
                            )
                          )
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-4 mt-4">
          <Card>
            <CardHeader><CardTitle>특이사항</CardTitle></CardHeader>
            <CardContent>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>개선조치 및 결과</CardTitle></CardHeader>
            <CardContent>
              <Textarea value={actions} onChange={(e) => setActions(e.target.value)} />
            </CardContent>
          </Card>
        </div>
      </div>
    </ChecklistFormLayout>
  );
}

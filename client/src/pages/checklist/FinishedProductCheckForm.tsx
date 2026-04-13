import { useState } from "react";
import ChecklistFormLayout from "@/components/checklist/ChecklistFormLayout";
import type { ChecklistFormConfig } from "@/components/checklist/ChecklistFormLayout";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, XCircle, Settings } from "lucide-react";

const config: ChecklistFormConfig = {
  formType: "finished_product_check",
  title: "완제품 출고검사 일지",
  listPath: "/finished-product-check",
  documentTitle: "완제품 출고검사 일지",
};

const CHECK_ITEMS = ["출고일", "제품명", "로트번호", "수량", "포장상태", "표시사항", "온도", "판정"];

const initialRows = [
  { id: 1, values: Array(CHECK_ITEMS.length).fill("") },
  { id: 2, values: Array(CHECK_ITEMS.length).fill("") },
  { id: 3, values: Array(CHECK_ITEMS.length).fill("") },
  { id: 4, values: Array(CHECK_ITEMS.length).fill("") },
  { id: 5, values: Array(CHECK_ITEMS.length).fill("") },
];

export default function FinishedProductCheckForm() {
  const [rows, setRows] = useState(initialRows);
  const [notes, setNotes] = useState("");
  const [actions, setActions] = useState("");
  const [actionTaker, setActionTaker] = useState("");
  const [confirmer, setConfirmer] = useState("");

  const collectFormData = () => ({
    rows,
    notes,
    actions,
    actionTaker,
    confirmer,
  });

  const onDataRestore = (fd: any) => {
    if (fd.rows) setRows(fd.rows);
    if (fd.notes) setNotes(fd.notes);
    if (fd.actions) setActions(fd.actions);
    if (fd.actionTaker) setActionTaker(fd.actionTaker);
    if (fd.confirmer) setConfirmer(fd.confirmer);
  };

  const handleCellClick = (rowIndex: number, cellIndex: number) => {
    if (CHECK_ITEMS[cellIndex] !== "판정") return;

    setRows((prevData) => {
      const newData = [...prevData];
      const currentVal = newData[rowIndex].values[cellIndex];
      newData[rowIndex].values[cellIndex] = currentVal === "적합" ? "부적합" : "적합";
      return newData;
    });
  };

  const handleBulkApprove = () => {
    setRows((prevData) =>
      prevData.map((row) => ({
        ...row,
        values: row.values.map((_, cellIndex) => {
          if (CHECK_ITEMS[cellIndex] === "판정") return "적합";
          if (["포장상태", "표시사항"].includes(CHECK_ITEMS[cellIndex])) return "O";
          return row.values[cellIndex];
        }),
      }))
    );
  };

  const extraActions = (
    <>
      <Button variant="outline" onClick={handleBulkApprove}>일괄적합</Button>
      <Button variant="outline" size="icon">
        <Settings className="h-4 w-4" />
      </Button>
    </>
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
          <CardHeader>
            <CardTitle>점검 내용</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  {CHECK_ITEMS.map((item) => (
                    <TableHead key={item} className="text-center">{item}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, rowIndex) => (
                  <TableRow key={row.id}>
                    {row.values.map((value, cellIndex) => (
                      <TableCell
                        key={cellIndex}
                        className="text-center p-0"
                        onClick={() => handleCellClick(rowIndex, cellIndex)}
                      >
                        {CHECK_ITEMS[cellIndex] === "판정" ? (
                          <div className={`cursor-pointer h-full w-full flex items-center justify-center p-2 ${value === "적합" ? "text-green-600" : value === "부적합" ? "text-red-600" : ""}`}>
                            {value === "적합" && <CheckCircle className="h-5 w-5" />}
                            {value === "부적합" && <XCircle className="h-5 w-5" />}
                            {value !== "적합" && value !== "부적합" && value}
                          </div>
                        ) : (
                          <Input
                            type="text"
                            value={value}
                            onChange={(e) => {
                              const newValue = e.target.value;
                              setRows(prev => {
                                const next = [...prev];
                                next[rowIndex].values[cellIndex] = newValue;
                                return next;
                              });
                            }}
                            className="border-none text-center"
                          />
                        )}
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
            <CardHeader>
              <CardTitle>특이사항</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="특이사항을 입력하세요..."
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>개선조치 및 결과</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={actions}
                onChange={(e) => setActions(e.target.value)}
                placeholder="개선조치 및 결과를 입력하세요..."
              />
              <div className="grid grid-cols-2 gap-4 mt-4">
                <Input placeholder="조치자" value={actionTaker} onChange={e => setActionTaker(e.target.value)} />
                <Input placeholder="확인자" value={confirmer} onChange={e => setConfirmer(e.target.value)} />
              </div>
            </CardContent>
          </Card>
        </div>
        <p className="text-sm text-muted-foreground">
          * 판정 셀을 클릭하여 '적합'과 '부적합' 상태를 변경할 수 있습니다.
        </p>
      </div>
    </ChecklistFormLayout>
  );
}

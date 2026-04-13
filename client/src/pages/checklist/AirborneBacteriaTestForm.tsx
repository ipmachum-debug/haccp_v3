import { useState } from "react";
import ChecklistFormLayout from "@/components/checklist/ChecklistFormLayout";
import type { ChecklistFormConfig } from "@/components/checklist/ChecklistFormLayout";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ThumbsUp } from "lucide-react";

const config: ChecklistFormConfig = {
  formType: "airborne_bacteria_test",
  title: "공중낙하세균 검사 성적서",
  listPath: "/airborne-bacteria-test",
  documentTitle: "공중낙하세균 검사 성적서",
};

const initialRows = Array(5).fill({}).map((_, i) => ({
  id: i + 1,
  inspectionDate: "",
  location: "",
  exposureTime: "",
  bacteriaCount: "",
  criteria: "100 이하",
  result: "",
}));

export default function AirborneBacteriaTestForm() {
  const { toast } = useToast();
  const [rows, setRows] = useState(initialRows);
  const [notes, setNotes] = useState("");
  const [actions, setActions] = useState("");
  const [actionTaker, setActionTaker] = useState("");
  const [confirmer, setConfirmer] = useState("");

  const collectFormData = () => ({
    rows, notes, actions, actionTaker, confirmer,
  });

  const onDataRestore = (fd: any) => {
    if (fd.rows) setRows(fd.rows);
    if (fd.notes) setNotes(fd.notes);
    if (fd.actions) setActions(fd.actions);
    if (fd.actionTaker) setActionTaker(fd.actionTaker);
    if (fd.confirmer) setConfirmer(fd.confirmer);
  };

  const handleToggleResult = (id: number) => {
    setRows(rows.map((row) =>
      row.id === id ? { ...row, result: row.result === "적합" ? "부적합" : "적합" } : row
    ));
  };

  const handleBulkPass = () => {
    setRows(rows.map((row) => ({ ...row, result: "적합" })));
    toast({ title: "일괄 적용 완료", description: "모든 항목을 '적합'으로 처리했습니다." });
  };

  return (
    <ChecklistFormLayout
      config={config}
      collectFormData={collectFormData}
      onDataRestore={onDataRestore}
      extraActions={
        <Button variant="outline" size="sm" onClick={handleBulkPass}>
          <ThumbsUp className="h-4 w-4 mr-1" />
          일괄적합
        </Button>
      }
    >
      <div className="px-6 pb-6">
        <div className="overflow-x-auto">
          <Table className="min-w-full border">
            <TableHeader>
              <TableRow>
                <TableHead className="border text-center w-[15%]">검사일</TableHead>
                <TableHead className="border text-center w-[15%]">검사장소</TableHead>
                <TableHead className="border text-center w-[15%]">노출시간</TableHead>
                <TableHead className="border text-center w-[15%]">세균수(CFU)</TableHead>
                <TableHead className="border text-center w-[15%]">판정기준</TableHead>
                <TableHead className="border text-center w-[15%]">판정결과</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="border p-1">
                    <Input
                      type="date"
                      className="w-full"
                      value={row.inspectionDate}
                      onChange={(e) => setRows(rows.map((r) => r.id === row.id ? { ...r, inspectionDate: e.target.value } : r))}
                    />
                  </TableCell>
                  <TableCell className="border p-1">
                    <Input
                      placeholder="검사장소 입력"
                      value={row.location}
                      onChange={(e) => setRows(rows.map((r) => r.id === row.id ? { ...r, location: e.target.value } : r))}
                    />
                  </TableCell>
                  <TableCell className="border p-1">
                    <Input
                      placeholder="노출시간 입력"
                      value={row.exposureTime}
                      onChange={(e) => setRows(rows.map((r) => r.id === row.id ? { ...r, exposureTime: e.target.value } : r))}
                    />
                  </TableCell>
                  <TableCell className="border p-1">
                    <Input
                      type="number"
                      placeholder="세균수 입력"
                      value={row.bacteriaCount}
                      onChange={(e) => setRows(rows.map((r) => r.id === row.id ? { ...r, bacteriaCount: e.target.value } : r))}
                    />
                  </TableCell>
                  <TableCell className="border text-center">{row.criteria}</TableCell>
                  <TableCell
                    className={`border text-center cursor-pointer ${row.result === "적합" ? "text-green-600 font-bold" : row.result === "부적합" ? "text-red-600 font-bold" : "text-gray-400"}`}
                    onClick={() => handleToggleResult(row.id)}
                  >
                    {row.result || "선택"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">특이사항</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="특이사항을 입력하세요." />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">개선조치 및 결과</label>
            <Input value={actions} onChange={(e) => setActions(e.target.value)} placeholder="개선조치 및 결과를 입력하세요." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">조치자</label>
              <Input value={actionTaker} onChange={(e) => setActionTaker(e.target.value)} placeholder="조치자 성명" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">확인자</label>
              <Input value={confirmer} onChange={(e) => setConfirmer(e.target.value)} placeholder="확인자 성명" />
            </div>
          </div>
        </div>
      </div>
    </ChecklistFormLayout>
  );
}

export { AirborneBacteriaTestForm };

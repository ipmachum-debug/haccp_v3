import { useState } from "react";
import ChecklistFormLayout from "@/components/ChecklistFormLayout";
import type { ChecklistFormConfig } from "@/components/ChecklistFormLayout";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const config: ChecklistFormConfig = {
  formType: "surface_contamination_test",
  title: "표면오염도 검사 성적서",
  listPath: "/surface-contamination-test",
  documentTitle: "표면오염도 검사 성적서",
};

const initialChecklistItems = [
  { id: 1, location: "작업대 A", item: "표면 미생물", method: "ATP 측정", result: "", criteria: "100 RLU 이하", judgment: "" },
  { id: 2, location: "칼/도마", item: "표면 세균 수", method: "Petrifilm", result: "", criteria: "100 CFU/cm² 이하", judgment: "" },
  { id: 3, location: "컨베이어 벨트", item: "잔류 세제", method: "테스트 스트립", result: "", criteria: "음성", judgment: "" },
];

export default function SurfaceContaminationTestForm() {
  const { toast } = useToast();
  const [items, setItems] = useState(initialChecklistItems);
  const [notes, setNotes] = useState("");
  const [actions, setActions] = useState("");

  const collectFormData = () => ({
    items,
    notes,
    actions,
  });

  const onDataRestore = (fd: any) => {
    if (fd.items) setItems(fd.items);
    if (fd.notes) setNotes(fd.notes);
    if (fd.actions) setActions(fd.actions);
  };

  const handleBatchPass = () => {
    setItems(items.map(item => ({ ...item, judgment: "적합" })));
    toast({ title: "성공", description: "모든 항목이 '적합'으로 처리되었습니다." });
  };

  const toggleJudgment = (id: number) => {
    setItems(items.map(item => item.id === id ? { ...item, judgment: item.judgment === "적합" ? "부적합" : "적합" } : item));
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
      <div className="px-6 pb-6">
        <div className="overflow-x-auto">
          <Table className="min-w-full border">
            <TableHeader>
              <TableRow>
                <TableHead className="border text-center">검사일시</TableHead>
                <TableHead className="border text-center">검사장소</TableHead>
                <TableHead className="border text-center">검사항목</TableHead>
                <TableHead className="border text-center">검사방법</TableHead>
                <TableHead className="border text-center">검사결과(CFU)</TableHead>
                <TableHead className="border text-center">판정기준</TableHead>
                <TableHead className="border text-center">판정결과</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="border text-center p-1"><Input type="datetime-local" className="w-full" /></TableCell>
                  <TableCell className="border text-center">{item.location}</TableCell>
                  <TableCell className="border text-center">{item.item}</TableCell>
                  <TableCell className="border text-center">{item.method}</TableCell>
                  <TableCell className="border text-center p-1">
                    <Input
                      placeholder="결과 입력"
                      className="w-full text-center"
                      value={item.result}
                      onChange={(e) => setItems(items.map(i => i.id === item.id ? { ...i, result: e.target.value } : i))}
                    />
                  </TableCell>
                  <TableCell className="border text-center">{item.criteria}</TableCell>
                  <TableCell
                    className={`border text-center cursor-pointer ${item.judgment === "적합" ? "text-green-600" : item.judgment === "부적합" ? "text-red-600" : ""}`}
                    onClick={() => toggleJudgment(item.id)}
                  >
                    {item.judgment || "클릭하여 판정"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="mt-6 space-y-4">
          <div>
            <label className="font-semibold">특이사항</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="특이사항을 입력하세요." className="mt-1" />
          </div>
          <div>
            <label className="font-semibold">개선조치 및 결과</label>
            <Textarea value={actions} onChange={(e) => setActions(e.target.value)} placeholder="부적합 사항에 대한 개선조치 및 결과를 입력하세요." className="mt-1" />
          </div>
        </div>
        <p className="text-sm text-gray-500 mt-4 print:hidden">* 판정결과 셀을 클릭하여 '적합'/'부적합'을 선택할 수 있습니다.</p>
      </div>
    </ChecklistFormLayout>
  );
}


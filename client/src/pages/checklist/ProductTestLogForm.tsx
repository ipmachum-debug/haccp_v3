import { useState } from "react";
import ChecklistFormLayout from "@/components/checklist/ChecklistFormLayout";
import type { ChecklistFormConfig } from "@/components/checklist/ChecklistFormLayout";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useIndustryLabel } from "@/hooks/useIndustryFeatures";
import { todayLocal } from "../../lib/dateUtils";

const config: ChecklistFormConfig = {
  formType: "product_test_log",
  title: "제품 검사 일지",
  listPath: "/product-test-log",
  documentTitle: "제품 검사 일지",
};

type TestRow = { id: number; testDate: string; productName: string; lotNumber: string; checkItem: string; result: string; decision: string; inspector: string };

const CHECK_ITEMS = ["외관", "성상", "수분", "함량"];

// 행마다 새 객체 — 이전에는 모듈 전역 배열을 그대로 써서 입력이 초기값 자체를 바꿨다 (2026-10-15)
// 검사일·검사자도 상태로 저장 (이전에는 입력칸만 있고 저장되지 않았다)
const makeRows = (): TestRow[] => CHECK_ITEMS.map((checkItem, i) => ({
  id: i + 1, testDate: todayLocal(), productName: "", lotNumber: "", checkItem, result: "", decision: "", inspector: "",
}));

export default function ProductTestLogForm() {
  const L = useIndustryLabel();
  const [rows, setRows] = useState<TestRow[]>(makeRows);
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
    // 옛 기록(검사일·검사자 칸 없음)은 빈 값으로 채워 제어 상태 유지
    if (Array.isArray(fd.rows)) setRows(fd.rows.map((r: Partial<TestRow>, i: number) => ({
      id: r.id ?? i + 1, testDate: r.testDate ?? "", productName: r.productName ?? "", lotNumber: r.lotNumber ?? "",
      checkItem: r.checkItem ?? "", result: r.result ?? "", decision: r.decision ?? "", inspector: r.inspector ?? "",
    })));
    if (fd.notes) setNotes(fd.notes);
    if (fd.correctiveAction) setCorrectiveAction(fd.correctiveAction);
    if (fd.actionTaker) setActionTaker(fd.actionTaker);
    if (fd.confirmer) setConfirmer(fd.confirmer);
  };

  const updateRow = (rowIndex: number, patch: Partial<TestRow>) =>
    setRows((prev) => prev.map((r, i) => (i === rowIndex ? { ...r, ...patch } : r)));

  const handleCellClick = (rowIndex: number, field: "result" | "decision") => {
    const cur = rows[rowIndex][field];
    updateRow(rowIndex, { [field]: cur === "적합" || cur === "O" ? "부적합" : "적합" });
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
                <TableCell><Input type="date" className="w-full" value={row.testDate} onChange={(e) => updateRow(rowIndex, { testDate: e.target.value })} aria-label={`${row.checkItem} 검사일`} /></TableCell>
                <TableCell><Input value={row.productName} onChange={(e) => updateRow(rowIndex, { productName: e.target.value })} /></TableCell>
                <TableCell><Input value={row.lotNumber} onChange={(e) => updateRow(rowIndex, { lotNumber: e.target.value })} /></TableCell>
                <TableCell>{row.checkItem}</TableCell>
                <TableCell onClick={() => handleCellClick(rowIndex, "result")} className="cursor-pointer">{row.result}</TableCell>
                <TableCell onClick={() => handleCellClick(rowIndex, "decision")} className="cursor-pointer">{row.decision}</TableCell>
                <TableCell><Input className="w-full" value={row.inspector} onChange={(e) => updateRow(rowIndex, { inspector: e.target.value })} aria-label={`${row.checkItem} 검사자`} /></TableCell>
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

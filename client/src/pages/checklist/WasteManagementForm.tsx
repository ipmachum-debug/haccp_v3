import { useState } from "react";
import ChecklistFormLayout from "@/components/checklist/ChecklistFormLayout";
import type { ChecklistFormConfig } from "@/components/checklist/ChecklistFormLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

const config: ChecklistFormConfig = {
  formType: "waste_management",
  title: "폐기물 관리대장",
  listPath: "/waste-management",
  documentTitle: "폐기물 관리대장",
};

interface WasteRow {
  date: string;
  generatedAmount: string;
  selfDisposalMethod: string;
  selfDisposalAmount: string;
  selfDisposalCumulative: string;
  recycleAmount: string;
  recycleMethod: string;
  recycler: string;
  cumulative: string;
}

const initialRows: WasteRow[] = [
    { date: "", generatedAmount: "", selfDisposalMethod: "", selfDisposalAmount: "", selfDisposalCumulative: "", recycleAmount: "", recycleMethod: "", recycler: "", cumulative: "" },
];

export default function WasteManagementForm() {
  const [companyName, setCompanyName] = useState("");
  const [unit] = useState("kg");
  const [rows, setRows] = useState<WasteRow[]>(initialRows);

  const collectFormData = () => ({
    companyName,
    rows,
  });

  const onDataRestore = (fd: any) => {
    if (fd.companyName) setCompanyName(fd.companyName);
    if (fd.rows) setRows(fd.rows);
  };

  const addRow = () => {
    setRows([...rows, { date: "", generatedAmount: "", selfDisposalMethod: "", selfDisposalAmount: "", selfDisposalCumulative: "", recycleAmount: "", recycleMethod: "", recycler: "", cumulative: "" }]);
  };

  const removeRow = (index: number) => {
    if (rows.length <= 1) return;
    setRows(rows.filter((_, i) => i !== index));
  };

  const updateRow = (index: number, field: keyof WasteRow, value: string) => {
    const newRows = [...rows];
    newRows[index][field] = value;
    setRows(newRows);
  };

  return (
    <ChecklistFormLayout
      config={config}
      collectFormData={collectFormData}
      onDataRestore={onDataRestore}
    >
      <div className="px-6 pb-6">
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>사업장명</Label>
                <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="사업장명 입력" />
              </div>
              <div>
                <Label>단위</Label>
                <Input value={unit} readOnly className="bg-gray-50" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader className="flex flex-row items-center justify-between print:hidden">
            <CardTitle>폐기물 기록</CardTitle>
            <Button variant="outline" size="sm" onClick={addRow}>
              <Plus className="h-4 w-4 mr-1" /> 행 추가
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-300 text-sm">
                <thead>
                  <tr className="bg-blue-50">
                    <th rowSpan={2} className="border border-gray-300 px-2 py-2 w-28">연월일</th>
                    <th rowSpan={2} className="border border-gray-300 px-2 py-2 w-24">발생량</th>
                    <th colSpan={3} className="border border-gray-300 px-2 py-2 text-center">자가처리</th>
                    <th colSpan={3} className="border border-gray-300 px-2 py-2 text-center">재활용</th>
                    <th rowSpan={2} className="border border-gray-300 px-2 py-2 w-24">누계</th>
                    <th rowSpan={2} className="border border-gray-300 px-2 py-2 w-10 print:hidden">삭제</th>
                  </tr>
                  <tr className="bg-blue-50">
                    <th className="border border-gray-300 px-2 py-1 text-xs">자가처리방법</th>
                    <th className="border border-gray-300 px-2 py-1 text-xs">자가처리량</th>
                    <th className="border border-gray-300 px-2 py-1 text-xs">처리량 누계</th>
                    <th className="border border-gray-300 px-2 py-1 text-xs">재활용량</th>
                    <th className="border border-gray-300 px-2 py-1 text-xs">재활용방법</th>
                    <th className="border border-gray-300 px-2 py-1 text-xs">재활용자</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="border border-gray-300 px-1 py-1">
                        <Input type="date" className="h-8 text-sm border-0" value={row.date} onChange={(e) => updateRow(idx, "date", e.target.value)} />
                      </td>
                      <td className="border border-gray-300 px-1 py-1">
                        <Input className="h-8 text-sm border-0" type="number" value={row.generatedAmount} onChange={(e) => updateRow(idx, "generatedAmount", e.target.value)} placeholder="kg" />
                      </td>
                      <td className="border border-gray-300 px-1 py-1">
                        <Input className="h-8 text-sm border-0" value={row.selfDisposalMethod} onChange={(e) => updateRow(idx, "selfDisposalMethod", e.target.value)} placeholder="방법" />
                      </td>
                      <td className="border border-gray-300 px-1 py-1">
                        <Input className="h-8 text-sm border-0" type="number" value={row.selfDisposalAmount} onChange={(e) => updateRow(idx, "selfDisposalAmount", e.target.value)} placeholder="kg" />
                      </td>
                      <td className="border border-gray-300 px-1 py-1">
                        <Input className="h-8 text-sm border-0" type="number" value={row.selfDisposalCumulative} onChange={(e) => updateRow(idx, "selfDisposalCumulative", e.target.value)} placeholder="누계" />
                      </td>
                      <td className="border border-gray-300 px-1 py-1">
                        <Input className="h-8 text-sm border-0" type="number" value={row.recycleAmount} onChange={(e) => updateRow(idx, "recycleAmount", e.target.value)} placeholder="kg" />
                      </td>
                      <td className="border border-gray-300 px-1 py-1">
                        <Input className="h-8 text-sm border-0" value={row.recycleMethod} onChange={(e) => updateRow(idx, "recycleMethod", e.target.value)} placeholder="방법" />
                      </td>
                      <td className="border border-gray-300 px-1 py-1">
                        <Input className="h-8 text-sm border-0" value={row.recycler} onChange={(e) => updateRow(idx, "recycler", e.target.value)} placeholder="재활용자" />
                      </td>
                      <td className="border border-gray-300 px-1 py-1">
                        <Input className="h-8 text-sm border-0" type="number" value={row.cumulative} onChange={(e) => updateRow(idx, "cumulative", e.target.value)} placeholder="누계" />
                      </td>
                      <td className="border border-gray-300 px-1 py-1 text-center print:hidden">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeRow(idx)}>
                          <Trash2 className="h-3 w-3 text-red-500" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        <p className="text-xs text-gray-500 mt-4 print:hidden">
          ※ 폐기물 관리대장은 사업장에서 발생하는 폐기물의 발생량, 자가처리, 재활용 현황을 기록합니다.
        </p>
      </div>
    </ChecklistFormLayout>
  );
}

export { WasteManagementForm };

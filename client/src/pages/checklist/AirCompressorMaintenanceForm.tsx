import { useState } from "react";
import ChecklistFormLayout from "@/components/checklist/ChecklistFormLayout";
import type { ChecklistFormConfig } from "@/components/checklist/ChecklistFormLayout";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2 } from "lucide-react";

interface MaintenanceRow {
  date: string;
  oilChange: boolean;
  cleanerWash: boolean;
  worker: string;
  signature: string;
}

const config: ChecklistFormConfig = {
  formType: "air_compressor_maintenance",
  title: "에어콤프레샤 관리일지",
  listPath: "/air-compressor-maintenance",
  documentTitle: "에어 콤프레샤 윤활유(식품오일, H1급) 및 에어 크리너 세척, 소독 점검표",
};

const initialRows: MaintenanceRow[] = [
  { date: "", oilChange: false, cleanerWash: false, worker: "", signature: "" },
];

export default function AirCompressorMaintenanceForm() {
  const [rows, setRows] = useState<MaintenanceRow[]>(initialRows);

  const collectFormData = () => ({
    rows,
  });

  const onDataRestore = (fd: any) => {
    if (fd.rows && Array.isArray(fd.rows)) {
      setRows(fd.rows);
    }
  };

  const addRow = () => {
    setRows([...rows, { date: "", oilChange: false, cleanerWash: false, worker: "", signature: "" }]);
  };

  const removeRow = (index: number) => {
    if (rows.length <= 1) return;
    setRows(rows.filter((_, i) => i !== index));
  };

  const updateRow = (index: number, field: keyof MaintenanceRow, value: any) => {
    const newRows = [...rows];
    (newRows[index] as any)[field] = value;
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
          <CardHeader>
            <CardTitle className="text-lg">
              에어 콤프레샤 윤활유(식품오일, H1급) 및 에어 크리너 세척, 소독 점검표
            </CardTitle>
            <p className="text-sm text-blue-600">(식품오일 6개월마다, 에어크리너 3개월마다 첫째주 월요일)</p>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
              <li>에어 콤프레샤 윤활유는 식품오일(H1급)으로 한다.</li>
              <li>식품용 윤활유는 매년 2회. 6월, 12월 첫째주 월요일에 정기적으로 교환한다.</li>
              <li>에어 크리너는 매월 3개월 마다. 첫째주 월요일에 정기적으로 세척, 소독한다.</li>
              <li>수시로 에어필터속 축에 공기 주입구를 열어 수분을 제거하여 녹 발생을 미연에 방지한다.</li>
              <li>에어 콤프레샤 외부 전체 소독수를 뿌리고 행주로 깨끗이 닦아 청결하게 관리 유지한다.</li>
            </ul>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>교환 / 세척 기록</CardTitle>
            <Button variant="outline" size="sm" onClick={addRow}>
              <Plus className="h-4 w-4 mr-1" /> 행 추가
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-300 text-sm">
                <thead>
                  <tr className="bg-blue-50">
                    <th rowSpan={2} className="border border-gray-300 px-2 py-2 min-w-[100px]">월 일</th>
                    <th colSpan={2} className="border border-gray-300 px-2 py-2 text-center">교 환 / 세 척 내 용</th>
                    <th rowSpan={2} className="border border-gray-300 px-2 py-2 min-w-[80px]">작업자</th>
                    <th rowSpan={2} className="border border-gray-300 px-2 py-2 min-w-[80px]">서명</th>
                    <th rowSpan={2} className="border border-gray-300 px-2 py-2 w-10">삭제</th>
                  </tr>
                  <tr className="bg-blue-50">
                    <th className="border border-gray-300 px-2 py-2 min-w-[100px]">식품 오일<br/>(H1급, 교환)</th>
                    <th className="border border-gray-300 px-2 py-2 min-w-[100px]">에어크리너<br/>세척, 소독</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="border border-gray-300 px-1 py-1">
                        <Input
                          type="date"
                          className="h-8 text-sm border-0"
                          value={row.date}
                          onChange={(e) => updateRow(idx, "date", e.target.value)}
                        />
                      </td>
                      <td className="border border-gray-300 px-2 py-1 text-center">
                        <div className="flex items-center justify-center">
                          <Checkbox
                            checked={row.oilChange}
                            onCheckedChange={(checked) => updateRow(idx, "oilChange", checked)}
                          />
                        </div>
                      </td>
                      <td className="border border-gray-300 px-2 py-1 text-center">
                        <div className="flex items-center justify-center">
                          <Checkbox
                            checked={row.cleanerWash}
                            onCheckedChange={(checked) => updateRow(idx, "cleanerWash", checked)}
                          />
                        </div>
                      </td>
                      <td className="border border-gray-300 px-1 py-1">
                        <Input
                          className="h-8 text-sm border-0"
                          value={row.worker}
                          onChange={(e) => updateRow(idx, "worker", e.target.value)}
                        />
                      </td>
                      <td className="border border-gray-300 px-1 py-1">
                        <Input
                          className="h-8 text-sm border-0"
                          value={row.signature}
                          onChange={(e) => updateRow(idx, "signature", e.target.value)}
                        />
                      </td>
                      <td className="border border-gray-300 px-2 py-1 text-center">
                        <Button variant="ghost" size="icon" onClick={() => removeRow(idx)}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </ChecklistFormLayout>
  );
}

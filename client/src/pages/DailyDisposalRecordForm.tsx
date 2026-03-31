import { useState } from "react";
import ChecklistFormLayout from "@/components/ChecklistFormLayout";
import type { ChecklistFormConfig } from "@/components/ChecklistFormLayout";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2 } from "lucide-react";

import { todayLocal } from "../lib/dateUtils";

const config: ChecklistFormConfig = {
  formType: "daily_disposal_record",
  title: "일일 폐기 기록",
  listPath: "/daily-disposal-record",
  documentTitle: "일일 폐기 기록",
};

interface DisposalRow {
  productName: string;
  lotNumber: string;
  quantity: string;
  unit: string;
  reason: string;
  disposalMethod: string;
  disposalBy: string;
  confirmedBy: string;
}

const initialRows: DisposalRow[] = [
  { productName: "", lotNumber: "", quantity: "", unit: "kg", reason: "", disposalMethod: "", disposalBy: "", confirmedBy: "" },
];

export default function DailyDisposalRecordForm() {
  const [recordDate, setRecordDate] = useState(todayLocal());
  const [department, setDepartment] = useState("");
  const [rows, setRows] = useState<DisposalRow[]>(initialRows);
  const [remarks, setRemarks] = useState("");

  const collectFormData = () => ({
    recordDate,
    department,
    rows,
    remarks,
  });

  const onDataRestore = (fd: any) => {
    if (fd.recordDate) setRecordDate(fd.recordDate);
    if (fd.department) setDepartment(fd.department);
    if (fd.rows) setRows(fd.rows);
    if (fd.remarks) setRemarks(fd.remarks);
  };

  const addRow = () => {
    setRows([...rows, { productName: "", lotNumber: "", quantity: "", unit: "kg", reason: "", disposalMethod: "", disposalBy: "", confirmedBy: "" }]);
  };

  const removeRow = (index: number) => {
    if (rows.length <= 1) return;
    setRows(rows.filter((_, i) => i !== index));
  };

  const updateRow = (index: number, field: keyof DisposalRow, value: string) => {
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
                <Label>기록일자</Label>
                <Input type="date" value={recordDate} onChange={(e) => setRecordDate(e.target.value)} />
              </div>
              <div>
                <Label>부서</Label>
                <Input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="부서명" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>폐기 내역</CardTitle>
            <Button variant="outline" size="sm" onClick={addRow}>
              <Plus className="h-4 w-4 mr-1" /> 행 추가
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-300 text-sm">
                <thead>
                  <tr className="bg-blue-50">
                    <th className="border border-gray-300 px-2 py-2 w-10">No</th>
                    <th className="border border-gray-300 px-2 py-2">제품명</th>
                    <th className="border border-gray-300 px-2 py-2 w-28">LOT번호</th>
                    <th className="border border-gray-300 px-2 py-2 w-20">수량</th>
                    <th className="border border-gray-300 px-2 py-2 w-16">단위</th>
                    <th className="border border-gray-300 px-2 py-2">폐기사유</th>
                    <th className="border border-gray-300 px-2 py-2 w-28">폐기방법</th>
                    <th className="border border-gray-300 px-2 py-2 w-20">폐기자</th>
                    <th className="border border-gray-300 px-2 py-2 w-20">확인자</th>
                    <th className="border border-gray-300 px-2 py-2 w-10">삭제</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="border border-gray-300 px-2 py-1 text-center">{idx + 1}</td>
                      <td className="border border-gray-300 px-1 py-1">
                        <Input className="h-8 text-sm border-0" value={row.productName} onChange={(e) => updateRow(idx, "productName", e.target.value)} placeholder="제품명" />
                      </td>
                      <td className="border border-gray-300 px-1 py-1">
                        <Input className="h-8 text-sm border-0" value={row.lotNumber} onChange={(e) => updateRow(idx, "lotNumber", e.target.value)} placeholder="LOT번호" />
                      </td>
                      <td className="border border-gray-300 px-1 py-1">
                        <Input className="h-8 text-sm border-0" type="number" value={row.quantity} onChange={(e) => updateRow(idx, "quantity", e.target.value)} placeholder="수량" />
                      </td>
                      <td className="border border-gray-300 px-1 py-1">
                        <Input className="h-8 text-sm border-0" value={row.unit} onChange={(e) => updateRow(idx, "unit", e.target.value)} placeholder="단위" />
                      </td>
                      <td className="border border-gray-300 px-1 py-1">
                        <Input className="h-8 text-sm border-0" value={row.reason} onChange={(e) => updateRow(idx, "reason", e.target.value)} placeholder="폐기사유" />
                      </td>
                      <td className="border border-gray-300 px-1 py-1">
                        <Input className="h-8 text-sm border-0" value={row.disposalMethod} onChange={(e) => updateRow(idx, "disposalMethod", e.target.value)} placeholder="폐기방법" />
                      </td>
                      <td className="border border-gray-300 px-1 py-1">
                        <Input className="h-8 text-sm border-0" value={row.disposalBy} onChange={(e) => updateRow(idx, "disposalBy", e.target.value)} placeholder="폐기자" />
                      </td>
                      <td className="border border-gray-300 px-1 py-1">
                        <Input className="h-8 text-sm border-0" value={row.confirmedBy} onChange={(e) => updateRow(idx, "confirmedBy", e.target.value)} placeholder="확인자" />
                      </td>
                      <td className="border border-gray-300 px-1 py-1 text-center">
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

        <Card>
          <CardHeader><CardTitle>비고</CardTitle></CardHeader>
          <CardContent>
            <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="비고 사항을 입력하세요." rows={3} />
          </CardContent>
        </Card>
      </div>
    </ChecklistFormLayout>
  );
}

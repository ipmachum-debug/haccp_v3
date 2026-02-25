import { useState, useCallback } from "react";
import ChecklistFormLayout from "@/components/ChecklistFormLayout";
import type { ChecklistFormConfig } from "@/components/ChecklistFormLayout";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Trash2, Plus } from "lucide-react";

const config: ChecklistFormConfig = {
  formType: "sanitation_record",
  title: "세척소독 관리대장",
  listPath: "/sanitation-record",
  documentTitle: "세척소독 관리대장",
};

interface ProductRow {
  productName: string;
  specification: string;
  manufacturer: string;
  purchaseDate: string;
  usageLocation: string;
}

const initialRows: ProductRow[] = Array.from({ length: 15 }, () => ({
  productName: "",
  specification: "",
  manufacturer: "",
  purchaseDate: "",
  usageLocation: "",
}));

export default function SanitationRecordForm() {
  const [productRows, setProductRows] = useState<ProductRow[]>(initialRows);

  const collectFormData = () => ({
    productRows,
  });

  const onDataRestore = (fd: any) => {
    if (fd.productRows) setProductRows(fd.productRows);
  };

  const handleRowChange = useCallback((index: number, field: keyof ProductRow, value: string) => {
    setProductRows(prev => {
      const newRows = [...prev];
      newRows[index] = { ...newRows[index], [field]: value };
      return newRows;
    });
  }, []);

  const addRow = useCallback(() => {
    setProductRows(prev => [...prev, {
      productName: "", specification: "", manufacturer: "", purchaseDate: "", usageLocation: "",
    }]);
  }, []);

  const removeRow = useCallback((index: number) => {
    setProductRows(prev => prev.filter((_, i) => i !== index));
  }, []);

  return (
    <ChecklistFormLayout
      config={config}
      collectFormData={collectFormData}
      onDataRestore={onDataRestore}
    >
      <div className="px-6 pb-6">
        <div className="relative overflow-x-auto">
          <Table className="min-w-full border-collapse border border-gray-300 text-center text-sm print:text-xs">
            <TableHeader className="bg-gray-50 print:bg-gray-100">
              <TableRow>
                <TableHead className="border border-gray-300 px-2 py-2 w-8 print:w-6">No</TableHead>
                <TableHead className="border border-gray-300 px-2 py-2">품명</TableHead>
                <TableHead className="border border-gray-300 px-2 py-2">규격</TableHead>
                <TableHead className="border border-gray-300 px-2 py-2">제조업체</TableHead>
                <TableHead className="border border-gray-300 px-2 py-2">구입년월일</TableHead>
                <TableHead className="border border-gray-300 px-2 py-2">사용장소</TableHead>
                <TableHead className="border border-gray-300 px-2 py-2 w-16 print:hidden">삭제</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {productRows.map((row, index) => (
                <TableRow key={index}>
                  <TableCell className="border border-gray-300 px-2 py-1">{index + 1}</TableCell>
                  <TableCell className="border border-gray-300 p-0">
                    <Input
                      type="text"
                      value={row.productName}
                      onChange={(e) => handleRowChange(index, "productName", e.target.value)}
                      className="w-full h-full border-none rounded-none text-center px-1 py-0.5 print:bg-transparent"
                    />
                  </TableCell>
                  <TableCell className="border border-gray-300 p-0">
                    <Input
                      type="text"
                      value={row.specification}
                      onChange={(e) => handleRowChange(index, "specification", e.target.value)}
                      className="w-full h-full border-none rounded-none text-center px-1 py-0.5 print:bg-transparent"
                    />
                  </TableCell>
                  <TableCell className="border border-gray-300 p-0">
                    <Input
                      type="text"
                      value={row.manufacturer}
                      onChange={(e) => handleRowChange(index, "manufacturer", e.target.value)}
                      className="w-full h-full border-none rounded-none text-center px-1 py-0.5 print:bg-transparent"
                    />
                  </TableCell>
                  <TableCell className="border border-gray-300 p-0">
                    <Input
                      type="date"
                      value={row.purchaseDate}
                      onChange={(e) => handleRowChange(index, "purchaseDate", e.target.value)}
                      className="w-full h-full border-none rounded-none text-center px-1 py-0.5 print:bg-transparent"
                    />
                  </TableCell>
                  <TableCell className="border border-gray-300 p-0">
                    <Input
                      type="text"
                      value={row.usageLocation}
                      onChange={(e) => handleRowChange(index, "usageLocation", e.target.value)}
                      className="w-full h-full border-none rounded-none text-center px-1 py-0.5 print:bg-transparent"
                    />
                  </TableCell>
                  <TableCell className="border border-gray-300 px-1 py-1 print:hidden">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeRow(index)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="mt-4 flex justify-start print:hidden">
          <Button variant="outline" size="sm" onClick={addRow}>
            <Plus className="h-4 w-4 mr-1" />
            행 추가
          </Button>
        </div>
      </div>
    </ChecklistFormLayout>
  );
}

export { SanitationRecordForm };

import { useState } from "react";
import ChecklistFormLayout from "@/components/checklist/ChecklistFormLayout";
import type { ChecklistFormConfig } from "@/components/checklist/ChecklistFormLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";

import { todayLocal } from "../../lib/dateUtils";

const config: ChecklistFormConfig = {
  formType: "material_inspection",
  title: "원재료 검사 기록 작성",
  listPath: "/dashboard/inspection/material",
  documentTitle: "원재료 검사 기록",
};

interface InspectionItem {
  itemName: string;
  standard: string;
  result: string;
  passed: "pass" | "fail" | "na";
  sortOrder: number;
}

const initialItems: InspectionItem[] = [
  {
    itemName: "외관 검사",
    standard: "이물질 없음, 변색 없음",
    result: "",
    passed: "na",
    sortOrder: 1,
  },
  {
    itemName: "냄새 검사",
    standard: "이취 없음",
    result: "",
    passed: "na",
    sortOrder: 2,
  },
  {
    itemName: "포장 상태",
    standard: "파손 없음, 밀봉 상태 양호",
    result: "",
    passed: "na",
    sortOrder: 3,
  },
];

export default function MaterialInspectionForm() {
  const [materialId, setMaterialId] = useState("");
  const [materialCode, setMaterialCode] = useState("");
  const [materialName, setMaterialName] = useState("");
  const [lotNumber, setLotNumber] = useState("");
  const [inspectionDate, setInspectionDate] = useState(
    todayLocal()
  );
  const [supplierName, setSupplierName] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<InspectionItem[]>(initialItems);

  const collectFormData = () => ({
    materialId,
    materialCode,
    materialName,
    lotNumber,
    inspectionDate,
    supplierName,
    notes,
    items,
  });

  const onDataRestore = (fd: any) => {
    if (fd.materialId) setMaterialId(fd.materialId);
    if (fd.materialCode) setMaterialCode(fd.materialCode);
    if (fd.materialName) setMaterialName(fd.materialName);
    if (fd.lotNumber) setLotNumber(fd.lotNumber);
    if (fd.inspectionDate) setInspectionDate(fd.inspectionDate);
    if (fd.supplierName) setSupplierName(fd.supplierName);
    if (fd.notes) setNotes(fd.notes);
    if (fd.items) setItems(fd.items);
  };

  const addItem = () => {
    setItems([
      ...items,
      {
        itemName: "",
        standard: "",
        result: "",
        passed: "na",
        sortOrder: items.length + 1,
      },
    ]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof InspectionItem, value: string) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  return (
    <ChecklistFormLayout
      config={config}
      collectFormData={collectFormData}
      onDataRestore={onDataRestore}
    >
      <div className="space-y-6 px-6 pb-6">
        <Card>
          <CardHeader>
            <CardTitle>기본 정보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="materialId">원재료 ID *</Label>
                <Input
                  id="materialId"
                  type="number"
                  value={materialId}
                  onChange={(e) => setMaterialId(e.target.value)}
                  placeholder="원재료 ID"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="materialCode">원재료 코드 *</Label>
                <Input
                  id="materialCode"
                  value={materialCode}
                  onChange={(e) => setMaterialCode(e.target.value)}
                  placeholder="예: MAT-001"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="materialName">원재료명 *</Label>
              <Input
                id="materialName"
                value={materialName}
                onChange={(e) => setMaterialName(e.target.value)}
                placeholder="예: 돼지고기"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="lotNumber">LOT 번호 *</Label>
                <Input
                  id="lotNumber"
                  value={lotNumber}
                  onChange={(e) => setLotNumber(e.target.value)}
                  placeholder="예: LOT-20260119-001"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inspectionDate">검사일 *</Label>
                <Input
                  id="inspectionDate"
                  type="date"
                  value={inspectionDate}
                  onChange={(e) => setInspectionDate(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* inspectorName is handled by ChecklistFormLayout */}
              <div className="space-y-2">
                <Label htmlFor="supplierName">공급업체</Label>
                <Input
                  id="supplierName"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  placeholder="공급업체명"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">비고</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="특이사항 또는 비고를 입력하세요"
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>검사 항목</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={addItem}>
              <Plus className="h-4 w-4 mr-1" />
              항목 추가
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {items.map((item, index) => (
              <div key={index} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">항목 {index + 1}</h4>
                  {items.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeItem(index)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>항목명</Label>
                    <Input
                      value={item.itemName}
                      onChange={(e) => updateItem(index, "itemName", e.target.value)}
                      placeholder="예: 외관 검사"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>기준</Label>
                    <Input
                      value={item.standard}
                      onChange={(e) => updateItem(index, "standard", e.target.value)}
                      placeholder="예: 이물질 없음"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>결과</Label>
                    <Input
                      value={item.result}
                      onChange={(e) => updateItem(index, "result", e.target.value)}
                      placeholder="검사 결과 입력"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>합격 여부</Label>
                    <Select
                      value={item.passed}
                      onValueChange={(value) =>
                        updateItem(index, "passed", value as "pass" | "fail" | "na")
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pass">합격</SelectItem>
                        <SelectItem value="fail">불합격</SelectItem>
                        <SelectItem value="na">해당없음</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </ChecklistFormLayout>
  );
}

export { MaterialInspectionForm };

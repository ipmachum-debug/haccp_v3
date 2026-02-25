
import { useState } from "react";
import ChecklistFormLayout from "@/components/ChecklistFormLayout";
import type { ChecklistFormConfig } from "@/components/ChecklistFormLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

const config: ChecklistFormConfig = {
  formType: "hygiene_inspection",
  title: "위생 검사 작성",
  listPath: "/dashboard/inspection/hygiene",
  documentTitle: "위생 점검 기록부",
};

interface InspectionItem {
  itemName: string;
  standard: string;
  result: string;
  passed: "pass" | "fail" | "na";
}

const initialItems: InspectionItem[] = [
  {
    itemName: "바닥 청결 상태",
    standard: "오염물 없음, 건조 상태",
    result: "",
    passed: "pass",
  },
];

export default function HygieneInspectionForm() {
  const [inspectionArea, setInspectionArea] = useState("");
  const [inspectionDate, setInspectionDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<InspectionItem[]>(initialItems);

  const collectFormData = () => ({
    inspectionArea,
    inspectionDate,
    notes,
    items,
  });

  const onDataRestore = (data: any) => {
    if (data.inspectionArea) setInspectionArea(data.inspectionArea);
    if (data.inspectionDate) setInspectionDate(data.inspectionDate);
    if (data.notes) setNotes(data.notes);
    if (data.items) setItems(data.items);
  };

  const handleAddItem = () => {
    setItems([
      ...items,
      {
        itemName: "",
        standard: "",
        result: "",
        passed: "pass",
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: keyof InspectionItem, value: any) => {
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
      <div className="px-6 pb-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="inspectionArea">
              검사 구역 <span className="text-red-500">*</span>
            </Label>
            <Input
              id="inspectionArea"
              value={inspectionArea}
              onChange={(e) => setInspectionArea(e.target.value)}
              placeholder="검사 구역을 입력하세요 (예: 작업장, 창고, 화장실)"
              required
            />
          </div>
          <div>
            <Label htmlFor="inspectionDate">검사일</Label>
            <Input
              id="inspectionDate"
              type="date"
              value={inspectionDate}
              onChange={(e) => setInspectionDate(e.target.value)}
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-4">
            <Label className="text-lg font-semibold">검사 항목</Label>
            <Button type="button" variant="outline" size="sm" onClick={handleAddItem}>
              <Plus className="mr-2 h-4 w-4" />
              항목 추가
            </Button>
          </div>
          <div className="space-y-4">
            {items.map((item, index) => (
              <Card key={index}>
                <CardContent className="pt-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor={`itemName-${index}`}>항목명</Label>
                      <Input
                        id={`itemName-${index}`}
                        value={item.itemName}
                        onChange={(e) => handleItemChange(index, "itemName", e.target.value)}
                        placeholder="검사 항목명을 입력하세요"
                      />
                    </div>
                    <div>
                      <Label htmlFor={`standard-${index}`}>기준</Label>
                      <Input
                        id={`standard-${index}`}
                        value={item.standard}
                        onChange={(e) => handleItemChange(index, "standard", e.target.value)}
                        placeholder="검사 기준을 입력하세요"
                      />
                    </div>
                    <div>
                      <Label htmlFor={`result-${index}`}>결과</Label>
                      <Input
                        id={`result-${index}`}
                        value={item.result}
                        onChange={(e) => handleItemChange(index, "result", e.target.value)}
                        placeholder="검사 결과를 입력하세요"
                      />
                    </div>
                    <div>
                      <Label htmlFor={`passed-${index}`}>합격 여부</Label>
                      <Select
                        value={item.passed}
                        onValueChange={(value) => handleItemChange(index, "passed", value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pass">양호</SelectItem>
                          <SelectItem value="fail">불량</SelectItem>
                          <SelectItem value="na">해당없음</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="md:col-span-2 flex justify-end">
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => handleRemoveItem(index)}
                        disabled={items.length === 1}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        삭제
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <div>
          <Label htmlFor="notes">비고</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="추가 메모를 입력하세요"
            rows={4}
          />
        </div>
      </div>
    </ChecklistFormLayout>
  );
}

export { HygieneInspectionForm };


import { useState } from "react";
import ChecklistFormLayout from "@/components/checklist/ChecklistFormLayout";
import type { ChecklistFormConfig } from "@/components/checklist/ChecklistFormLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2 } from "lucide-react";

import { todayLocal } from "../../lib/dateUtils";

import { useIndustryLabel } from "@/hooks/useIndustryFeatures";
const config: ChecklistFormConfig = {
  formType: "shipping_inspection",
  title: "출하 검사 작성",
  listPath: "/dashboard/inspection/shipping",
  documentTitle: "출하 검사서",
};

interface InspectionItem {
  itemName: string;
  standard: string;
  result: string;
  passed: "pass" | "fail" | "na";
}

const initialItems: InspectionItem[] = [
  {
    itemName: "외관 검사",
    standard: "이물질 없음, 변색 없음",
    result: "",
    passed: "pass",
  },
];

export default function ShippingInspectionForm() {
  const L = useIndustryLabel();
  const [productName, setProductName] = useState("");
  const [batchCode, setBatchCode] = useState("");
  const [inspectionDate, setInspectionDate] = useState(todayLocal());
  const [inspectorName, setInspectorName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [productCode, setProductCode] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<InspectionItem[]>(initialItems);

  const collectFormData = () => ({
    productName,
    batchCode,
    inspectionDate,
    inspectorName,
    quantity,
    productCode,
    notes,
    items,
  });

  const onDataRestore = (data: any) => {
    if (data.productName) setProductName(data.productName);
    if (data.batchCode) setBatchCode(data.batchCode);
    if (data.inspectionDate) setInspectionDate(data.inspectionDate);
    if (data.inspectorName) setInspectorName(data.inspectorName);
    if (data.quantity) setQuantity(data.quantity);
    if (data.productCode) setProductCode(data.productCode);
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
        {/* 기본 정보 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="productName">
              제품명 <span className="text-red-500">*</span>
            </Label>
            <Input
              id="productName"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="제품명을 입력하세요"
              required
            />
          </div>

          <div>
            <Label htmlFor="batchCode">
              배치 번호 <span className="text-red-500">*</span>
            </Label>
            <Input
              id="batchCode"
              value={batchCode}
              onChange={(e) => setBatchCode(e.target.value)}
              placeholder="배치 번호를 입력하세요"
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

          <div>
            <Label htmlFor="inspectorName">
              검사자 <span className="text-red-500">*</span>
            </Label>
            <Input
              id="inspectorName"
              value={inspectorName}
              onChange={(e) => setInspectorName(e.target.value)}
              placeholder="검사자 이름을 입력하세요"
              required
            />
          </div>

          <div>
            <Label htmlFor="quantity">출하 수량</Label>
            <Input
              id="quantity"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="수량을 입력하세요"
            />
          </div>

          <div>
            <Label htmlFor="productCode">제품 코드</Label>
            <Input
              id="productCode"
              value={productCode}
              onChange={(e) => setProductCode(e.target.value)}
              placeholder="제품 코드를 입력하세요"
            />
          </div>
        </div>

        {/* 검사 항목 */}
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
                          <SelectItem value="pass">합격</SelectItem>
                          <SelectItem value="fail">불합격</SelectItem>
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

        {/* 비고 */}
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

export { ShippingInspectionForm };

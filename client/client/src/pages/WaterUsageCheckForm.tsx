import { useState } from "react";
import ChecklistFormLayout from "@/components/ChecklistFormLayout";
import type { ChecklistFormConfig } from "@/components/ChecklistFormLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const config: ChecklistFormConfig = {
  formType: "water_usage_check",
  title: "용수 사용 점검",
  listPath: "/water-usage-check",
  documentTitle: "용수 사용 점검표",
};

export default function WaterUsageCheckForm() {
  const [checkDate, setCheckDate] = useState(new Date().toISOString().split("T")[0]);
  const [usageArea, setUsageArea] = useState("");
  const [waterSource, setWaterSource] = useState("");
  const [usageAmount, setUsageAmount] = useState(0);
  const [checkResult, setCheckResult] = useState("pass");

  const collectFormData = () => ({
    checkDate,
    usageArea,
    waterSource,
    usageAmount,
    checkResult,
  });

  const onDataRestore = (data: any) => {
    if (data.checkDate) setCheckDate(data.checkDate);
    if (data.usageArea) setUsageArea(data.usageArea);
    if (data.waterSource) setWaterSource(data.waterSource);
    if (data.usageAmount) setUsageAmount(data.usageAmount);
    if (data.checkResult) setCheckResult(data.checkResult);
  };

  return (
    <ChecklistFormLayout
      config={config}
      collectFormData={collectFormData}
      onDataRestore={onDataRestore}
    >
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="checkDate">점검일 *</Label>
            <Input
              id="checkDate"
              type="date"
              value={checkDate}
              onChange={(e) => setCheckDate(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="usageArea">사용 구역 *</Label>
            <Input
              id="usageArea"
              type="text"
              value={usageArea}
              onChange={(e) => setUsageArea(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="waterSource">용수 출처 *</Label>
            <Input
              id="waterSource"
              type="text"
              value={waterSource}
              onChange={(e) => setWaterSource(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="usageAmount">사용량</Label>
            <Input
              id="usageAmount"
              type="number"
              step="0.01"
              value={usageAmount}
              onChange={(e) => setUsageAmount(parseFloat(e.target.value))}
            />
          </div>
          <div>
            <Label htmlFor="checkResult">점검 결과</Label>
            <Select
              value={checkResult}
              onValueChange={(value) => setCheckResult(value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pass">pass</SelectItem>
                <SelectItem value="fail">fail</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </ChecklistFormLayout>
  );
}

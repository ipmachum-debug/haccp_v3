import { useState } from "react";
import ChecklistFormLayout from "@/components/checklist/ChecklistFormLayout";
import type { ChecklistFormConfig } from "@/components/checklist/ChecklistFormLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { todayLocal } from "../../lib/dateUtils";

const config: ChecklistFormConfig = {
  formType: "refrigeration_check",
  title: "냉동·냉장 설비 점검",
  listPath: "/refrigeration-check",
  documentTitle: "냉동·냉장 설비 점검표",
};

export default function RefrigerationCheckForm() {
  const [checkDate, setCheckDate] = useState(todayLocal());
  const [equipmentName, setEquipmentName] = useState("");
  const [equipmentType, setEquipmentType] = useState("freezer");
  const [temperature, setTemperature] = useState(0);
  const [checkResult, setCheckResult] = useState("pass");

  const collectFormData = () => ({
    checkDate,
    equipmentName,
    equipmentType,
    temperature,
    checkResult,
  });

  const onDataRestore = (data: any) => {
    if (data.checkDate) setCheckDate(data.checkDate.split("T")[0]);
    if (data.equipmentName) setEquipmentName(data.equipmentName);
    if (data.equipmentType) setEquipmentType(data.equipmentType);
    if (data.temperature) setTemperature(data.temperature);
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
            <Label htmlFor="equipmentName">설비명 *</Label>
            <Input
              id="equipmentName"
              type="text"
              value={equipmentName}
              onChange={(e) => setEquipmentName(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="equipmentType">설비 유형 *</Label>
            <Select
              value={equipmentType}
              onValueChange={(value) => setEquipmentType(value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="freezer">freezer</SelectItem>
                <SelectItem value="refrigerator">refrigerator</SelectItem>
                <SelectItem value="cold_storage">cold_storage</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="temperature">온도 (°C) *</Label>
            <Input
              id="temperature"
              type="number"
              step="0.01"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value) || 0)}
              required
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

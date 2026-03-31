
import { useState } from "react";
import ChecklistFormLayout from "@/components/ChecklistFormLayout";
import type { ChecklistFormConfig } from "@/components/ChecklistFormLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { todayLocal } from "../lib/dateUtils";

const config: ChecklistFormConfig = {
  formType: "equipment_cleaning_record",
  title: "설비 세척·소독 기록",
  listPath: "/equipment-cleaning-record",
  documentTitle: "설비 세척·소독 기록",
};

export default function EquipmentCleaningRecordForm() {
  const [cleaningDate, setCleaningDate] = useState(todayLocal());
  const [equipmentName, setEquipmentName] = useState("");
  const [cleaningMethod, setCleaningMethod] = useState("");
  const [detergentUsed, setDetergentUsed] = useState("");
  const [verificationResult, setVerificationResult] = useState("pass");

  const collectFormData = () => ({
    cleaningDate,
    equipmentName,
    cleaningMethod,
    detergentUsed,
    verificationResult,
  });

  const onDataRestore = (data: any) => {
    if (data.cleaningDate) setCleaningDate(data.cleaningDate);
    if (data.equipmentName) setEquipmentName(data.equipmentName);
    if (data.cleaningMethod) setCleaningMethod(data.cleaningMethod);
    if (data.detergentUsed) setDetergentUsed(data.detergentUsed);
    if (data.verificationResult) setVerificationResult(data.verificationResult);
  };

  return (
    <ChecklistFormLayout
      config={config}
      collectFormData={collectFormData}
      onDataRestore={onDataRestore}
    >
      <div className="px-6 pb-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="cleaningDate">세척일 *</Label>
            <Input
              id="cleaningDate"
              type="date"
              value={cleaningDate}
              onChange={(e) => setCleaningDate(e.target.value)}
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
            <Label htmlFor="cleaningMethod">세척 방법</Label>
            <Input
              id="cleaningMethod"
              type="text"
              value={cleaningMethod}
              onChange={(e) => setCleaningMethod(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="detergentUsed">사용 세제</Label>
            <Input
              id="detergentUsed"
              type="text"
              value={detergentUsed}
              onChange={(e) => setDetergentUsed(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="verificationResult">검증 결과</Label>
            <Select
              value={verificationResult}
              onValueChange={(value) => setVerificationResult(value)}
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

export { EquipmentCleaningRecordForm };

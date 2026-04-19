import { useState } from "react";
import ChecklistFormLayout from "@/components/checklist/ChecklistFormLayout";
import type { ChecklistFormConfig } from "@/components/checklist/ChecklistFormLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { todayLocal } from "../../lib/dateUtils";

const config: ChecklistFormConfig = {
  formType: "foreign_material_record",
  title: "이물 관리 기록",
  listPath: "/foreign-material-record",
  documentTitle: "이물 관리 기록",
};

const initialData = {
  detectionDate: todayLocal(),
  detectionLocation: "",
  materialType: "",
  severity: "low" as "low" | "medium" | "high" | "critical",
  status: "open" as "open" | "investigating" | "resolved" | "closed",
};

export default function ForeignMaterialRecordForm() {
  const [formData, setFormData] = useState(initialData);

  const collectFormData = () => {
    return formData;
  };

  const onDataRestore = (data: any) => {
    if (data) {
      setFormData({
        ...initialData,
        ...data,
      });
    }
  };

  const handleInputChange = (field: keyof typeof initialData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
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
            <Label htmlFor="detectionDate">발견일 *</Label>
            <Input
              id="detectionDate"
              type="date"
              value={formData.detectionDate}
              onChange={(e) => handleInputChange("detectionDate", e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="detectionLocation">발견 위치 *</Label>
            <Input
              id="detectionLocation"
              type="text"
              value={formData.detectionLocation}
              onChange={(e) => handleInputChange("detectionLocation", e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="materialType">이물 유형 *</Label>
            <Input
              id="materialType"
              type="text"
              value={formData.materialType}
              onChange={(e) => handleInputChange("materialType", e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="severity">심각도</Label>
            <Select
              value={formData.severity}
              onValueChange={(value: any) => handleInputChange("severity", value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">low</SelectItem>
                <SelectItem value="medium">medium</SelectItem>
                <SelectItem value="high">high</SelectItem>
                <SelectItem value="critical">critical</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="status">상태</Label>
            <Select
              value={formData.status}
              onValueChange={(value: any) => handleInputChange("status", value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">open</SelectItem>
                <SelectItem value="investigating">investigating</SelectItem>
                <SelectItem value="resolved">resolved</SelectItem>
                <SelectItem value="closed">closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </ChecklistFormLayout>
  );
}

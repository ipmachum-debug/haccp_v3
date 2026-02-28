import { useState } from "react";
import ChecklistFormLayout from "@/components/ChecklistFormLayout";
import type { ChecklistFormConfig } from "@/components/ChecklistFormLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const config: ChecklistFormConfig = {
  formType: "packaging_storage_record",
  title: "포장재 보관 관리",
  listPath: "/packaging-storage-record",
  documentTitle: "포장재 보관 관리 기록",
};

export default function PackagingStorageRecordForm() {
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().split("T")[0]);
  const [materialName, setMaterialName] = useState("");
  const [materialType, setMaterialType] = useState("");
  const [storageLocation, setStorageLocation] = useState("");
  const [quantity, setQuantity] = useState(0);
  const [inspectionResult, setInspectionResult] = useState("pass");

  const collectFormData = () => ({
    receivedDate,
    materialName,
    materialType,
    storageLocation,
    quantity,
    inspectionResult,
  });

  const onDataRestore = (fd: any) => {
    if (fd.receivedDate) setReceivedDate(fd.receivedDate);
    if (fd.materialName) setMaterialName(fd.materialName);
    if (fd.materialType) setMaterialType(fd.materialType);
    if (fd.storageLocation) setStorageLocation(fd.storageLocation);
    if (fd.quantity) setQuantity(fd.quantity);
    if (fd.inspectionResult) setInspectionResult(fd.inspectionResult);
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
            <Label htmlFor="receivedDate">입고일 *</Label>
            <Input
              id="receivedDate"
              type="date"
              value={receivedDate}
              onChange={(e) => setReceivedDate(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="materialName">자재명 *</Label>
            <Input
              id="materialName"
              type="text"
              value={materialName}
              onChange={(e) => setMaterialName(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="materialType">자재 유형 *</Label>
            <Input
              id="materialType"
              type="text"
              value={materialType}
              onChange={(e) => setMaterialType(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="storageLocation">보관 위치 *</Label>
            <Input
              id="storageLocation"
              type="text"
              value={storageLocation}
              onChange={(e) => setStorageLocation(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="quantity">수량 *</Label>
            <Input
              id="quantity"
              type="number"
              step="0.01"
              value={quantity}
              onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)}
              required
            />
          </div>
          <div>
            <Label htmlFor="inspectionResult">검사 결과</Label>
            <Select
              value={inspectionResult}
              onValueChange={(value) => setInspectionResult(value)}
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

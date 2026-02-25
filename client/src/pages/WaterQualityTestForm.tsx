import { useState } from "react";
import ChecklistFormLayout from "@/components/ChecklistFormLayout";
import type { ChecklistFormConfig } from "@/components/ChecklistFormLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const config: ChecklistFormConfig = {
  formType: "water_quality_test",
  title: "수질 검사 기록",
  listPath: "/water-quality-test",
  documentTitle: "수질 검사 기록",
};

export default function WaterQualityTestForm() {
  const [testDate, setTestDate] = useState(new Date().toISOString().split("T")[0]);
  const [testLocation, setTestLocation] = useState("");
  const [ph, setPh] = useState("");
  const [turbidity, setTurbidity] = useState("");
  const [residualChlorine, setResidualChlorine] = useState("");
  const [coliformBacteria, setColiformBacteria] = useState("");
  const [testResult, setTestResult] = useState<"pass" | "fail" | "pending">("pending");
  const [remarks, setRemarks] = useState("");

  const collectFormData = () => ({
    testDate,
    testLocation,
    ph,
    turbidity,
    residualChlorine,
    coliformBacteria,
    testResult,
    remarks,
  });

  const onDataRestore = (fd: any) => {
    if (fd.testDate) setTestDate(fd.testDate.split("T")[0]);
    if (fd.testLocation) setTestLocation(fd.testLocation);
    if (fd.ph) setPh(fd.ph);
    if (fd.turbidity) setTurbidity(fd.turbidity);
    if (fd.residualChlorine) setResidualChlorine(fd.residualChlorine);
    if (fd.coliformBacteria) setColiformBacteria(fd.coliformBacteria);
    if (fd.testResult) setTestResult(fd.testResult);
    if (fd.remarks) setRemarks(fd.remarks);
  };

  return (
    <ChecklistFormLayout
      config={config}
      collectFormData={collectFormData}
      onDataRestore={onDataRestore}
    >
      <div className="px-6 pb-6 space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="testDate">검사일 *</Label>
            <Input
              id="testDate"
              type="date"
              value={testDate}
              onChange={(e) => setTestDate(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="testLocation">검사 위치 *</Label>
            <Input
              id="testLocation"
              value={testLocation}
              onChange={(e) => setTestLocation(e.target.value)}
              placeholder="예: 1층 정수기"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label htmlFor="ph">pH</Label>
            <Input
              id="ph"
              type="number"
              step="0.01"
              value={ph}
              onChange={(e) => setPh(e.target.value)}
              placeholder="예: 7.2"
            />
          </div>
          <div>
            <Label htmlFor="turbidity">탁도 (NTU)</Label>
            <Input
              id="turbidity"
              type="number"
              step="0.01"
              value={turbidity}
              onChange={(e) => setTurbidity(e.target.value)}
              placeholder="예: 0.5"
            />
          </div>
          <div>
            <Label htmlFor="residualChlorine">잔류염소 (ppm)</Label>
            <Input
              id="residualChlorine"
              type="number"
              step="0.01"
              value={residualChlorine}
              onChange={(e) => setResidualChlorine(e.target.value)}
              placeholder="예: 0.3"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="coliformBacteria">대장균 검사 결과</Label>
            <Input
              id="coliformBacteria"
              value={coliformBacteria}
              onChange={(e) => setColiformBacteria(e.target.value)}
              placeholder="예: 불검출"
            />
          </div>
          <div>
            <Label htmlFor="testResult">검사 결과 *</Label>
            <Select
              value={testResult}
              onValueChange={(value: any) => setTestResult(value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pass">적합</SelectItem>
                <SelectItem value="fail">부적합</SelectItem>
                <SelectItem value="pending">대기</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor="remarks">비고</Label>
          <Textarea
            id="remarks"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="추가 메모 사항을 입력하세요"
            rows={4}
          />
        </div>
      </div>
    </ChecklistFormLayout>
  );
}

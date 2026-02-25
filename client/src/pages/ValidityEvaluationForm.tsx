import { useState } from "react";
import ChecklistFormLayout from "@/components/ChecklistFormLayout";
import type { ChecklistFormConfig } from "@/components/ChecklistFormLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const config: ChecklistFormConfig = {
  formType: "validity_evaluation",
  title: "유효성 평가",
  listPath: "/validity-evaluation",
  documentTitle: "유효성 평가 기록",
};

export default function ValidityEvaluationForm() {
  const [evaluationDate, setEvaluationDate] = useState(new Date().toISOString().split("T")[0]);
  const [evaluationType, setEvaluationType] = useState("");
  const [evaluationScope, setEvaluationScope] = useState("");
  const [evaluationResult, setEvaluationResult] = useState("pass");

  const collectFormData = () => ({
    evaluationDate,
    evaluationType,
    evaluationScope,
    evaluationResult,
  });

  const onDataRestore = (data: any) => {
    if (data.evaluationDate) setEvaluationDate(data.evaluationDate.split("T")[0]);
    if (data.evaluationType) setEvaluationType(data.evaluationType);
    if (data.evaluationScope) setEvaluationScope(data.evaluationScope);
    if (data.evaluationResult) setEvaluationResult(data.evaluationResult);
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
            <Label htmlFor="evaluationDate">평가일 *</Label>
            <Input
              id="evaluationDate"
              type="date"
              value={evaluationDate}
              onChange={(e) => setEvaluationDate(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="evaluationType">평가 유형 *</Label>
            <Input
              id="evaluationType"
              type="text"
              value={evaluationType}
              onChange={(e) => setEvaluationType(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="evaluationScope">평가 범위</Label>
            <Input
              id="evaluationScope"
              type="text"
              value={evaluationScope}
              onChange={(e) => setEvaluationScope(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="evaluationResult">평가 결과</Label>
            <Select
              value={evaluationResult}
              onValueChange={(value) => setEvaluationResult(value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pass">pass</SelectItem>
                <SelectItem value="fail">fail</SelectItem>
                <SelectItem value="pending">pending</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </ChecklistFormLayout>
  );
}

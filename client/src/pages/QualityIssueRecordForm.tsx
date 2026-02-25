import { useState } from "react";
import ChecklistFormLayout from "@/components/ChecklistFormLayout";
import type { ChecklistFormConfig } from "@/components/ChecklistFormLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const config: ChecklistFormConfig = {
  formType: "quality_issue_record",
  title: "품질 이상 발생 기록",
  listPath: "/quality-issue-record",
  documentTitle: "품질 이상 발생 기록",
};

export default function QualityIssueRecordForm() {
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split("T")[0]);
  const [issueType, setIssueType] = useState("");
  const [issueDescription, setIssueDescription] = useState("");
  const [severity, setSeverity] = useState("low");
  const [status, setStatus] = useState("open");

  const collectFormData = () => ({
    issueDate,
    issueType,
    issueDescription,
    severity,
    status,
  });

  const onDataRestore = (data: any) => {
    if (data.issueDate) setIssueDate(data.issueDate);
    if (data.issueType) setIssueType(data.issueType);
    if (data.issueDescription) setIssueDescription(data.issueDescription);
    if (data.severity) setSeverity(data.severity);
    if (data.status) setStatus(data.status);
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
            <Label htmlFor="issueDate">발생일 *</Label>
            <Input
              id="issueDate"
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="issueType">이상 유형 *</Label>
            <Input
              id="issueType"
              type="text"
              value={issueType}
              onChange={(e) => setIssueType(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="issueDescription">이상 내용 *</Label>
            <Textarea
              id="issueDescription"
              value={issueDescription}
              onChange={(e) => setIssueDescription(e.target.value)}
              required
              rows={4}
            />
          </div>
          <div>
            <Label htmlFor="severity">심각도</Label>
            <Select value={severity} onValueChange={setSeverity}>
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
            <Select value={status} onValueChange={setStatus}>
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

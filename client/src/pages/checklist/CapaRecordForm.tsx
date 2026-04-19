import { useState } from "react";
import ChecklistFormLayout from "@/components/checklist/ChecklistFormLayout";
import type { ChecklistFormConfig } from "@/components/checklist/ChecklistFormLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { todayLocal } from "../../lib/dateUtils";

const config: ChecklistFormConfig = {
  formType: "capa_record",
  title: "개선조치(CAPA) 기록",
  listPath: "/capa-record",
  documentTitle: "개선조치(CAPA) 기록",
};

export default function CapaRecordForm() {
  const [capaNumber, setCapaNumber] = useState("");
  const [issueDate, setIssueDate] = useState(todayLocal());
  const [problemDescription, setProblemDescription] = useState("");
  const [correctiveAction, setCorrectiveAction] = useState("");
  const [preventiveAction, setPreventiveAction] = useState("");
  const [status, setStatus] = useState("open");
  const [priority, setPriority] = useState("medium");

  const collectFormData = () => ({
    capaNumber,
    issueDate,
    problemDescription,
    correctiveAction,
    preventiveAction,
    status,
    priority,
  });

  const onDataRestore = (fd: any) => {
    if (fd.capaNumber) setCapaNumber(fd.capaNumber);
    if (fd.issueDate) setIssueDate(fd.issueDate);
    if (fd.problemDescription) setProblemDescription(fd.problemDescription);
    if (fd.correctiveAction) setCorrectiveAction(fd.correctiveAction);
    if (fd.preventiveAction) setPreventiveAction(fd.preventiveAction);
    if (fd.status) setStatus(fd.status);
    if (fd.priority) setPriority(fd.priority);
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
            <Label htmlFor="capaNumber">CAPA 번호 *</Label>
            <Input
              id="capaNumber"
              type="text"
              value={capaNumber}
              onChange={(e) => setCapaNumber(e.target.value)}
              required
            />
          </div>
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
            <Label htmlFor="problemDescription">문제 설명 *</Label>
            <Textarea
              id="problemDescription"
              value={problemDescription}
              onChange={(e) => setProblemDescription(e.target.value)}
              required
              rows={4}
            />
          </div>
          <div>
            <Label htmlFor="correctiveAction">시정 조치</Label>
            <Textarea
              id="correctiveAction"
              value={correctiveAction}
              onChange={(e) => setCorrectiveAction(e.target.value)}
              rows={4}
            />
          </div>
          <div>
            <Label htmlFor="preventiveAction">예방 조치</Label>
            <Textarea
              id="preventiveAction"
              value={preventiveAction}
              onChange={(e) => setPreventiveAction(e.target.value)}
              rows={4}
            />
          </div>
          <div>
            <Label htmlFor="status">상태</Label>
            <Select
              value={status}
              onValueChange={(value) => setStatus(value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">open</SelectItem>
                <SelectItem value="in_progress">in_progress</SelectItem>
                <SelectItem value="completed">completed</SelectItem>
                <SelectItem value="verified">verified</SelectItem>
                <SelectItem value="closed">closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="priority">우선순위</Label>
            <Select
              value={priority}
              onValueChange={(value) => setPriority(value)}
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
        </div>
      </div>
    </ChecklistFormLayout>
  );
}

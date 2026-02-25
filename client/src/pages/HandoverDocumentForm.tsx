import { useState } from "react";
import ChecklistFormLayout from "@/components/ChecklistFormLayout";
import type { ChecklistFormConfig } from "@/components/ChecklistFormLayout";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const config: ChecklistFormConfig = {
  formType: "handover_document",
  title: "업무 인수인계서",
  listPath: "/handover-document",
  documentTitle: "업무 인수인계서",
};

const initialHandoverData = {
  transferor: '',
  transferee: '',
  handoverTask: '',
  taskContent: '',
  progress: '',
  specialNotes: '',
  improvementAction: '',
  actionTaker: '',
  confirmer: '',
};

export default function HandoverDocumentForm() {
  const [handoverData, setHandoverData] = useState(initialHandoverData);

  const collectFormData = () => ({
    handoverData,
  });

  const onDataRestore = (fd: any) => {
    if (fd.handoverData) setHandoverData(fd.handoverData);
  };

  const handleInputChange = (field: keyof typeof initialHandoverData, value: string) => {
    setHandoverData((prev) => ({ ...prev, [field]: value }));
  };

  const toggleCell = (field: 'progress') => {
    setHandoverData((prev) => ({
      ...prev,
      [field]: prev[field] === '적합' ? '부적합' : '적합',
    }));
  };

  const handleBatchFit = () => {
    setHandoverData((prev) => ({
      ...prev,
      progress: '적합',
    }));
  };

  return (
    <ChecklistFormLayout
      config={config}
      collectFormData={collectFormData}
      onDataRestore={onDataRestore}
      extraActions={
        <Button variant="outline" onClick={handleBatchFit}>
          일괄적합
        </Button>
      }
    >
      <div className="px-6 pb-6">
        <Card className="print:shadow-none print:border-none">
          <CardContent className="pt-6">
            <Table className="border-collapse border mb-4">
              <TableBody>
                <TableRow>
                  <TableHead className="border p-2 w-1/4">인계자</TableHead>
                  <TableCell className="border p-2 w-1/4">
                    <Input
                      value={handoverData.transferor}
                      onChange={(e) => handleInputChange('transferor', e.target.value)}
                      className="border-none focus:ring-0"
                    />
                  </TableCell>
                  <TableHead className="border p-2 w-1/4">인수자</TableHead>
                  <TableCell className="border p-2 w-1/4">
                    <Input
                      value={handoverData.transferee}
                      onChange={(e) => handleInputChange('transferee', e.target.value)}
                      className="border-none focus:ring-0"
                    />
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableHead className="border p-2">인계업무</TableHead>
                  <TableCell colSpan={3} className="border p-2">
                    <Input
                      value={handoverData.handoverTask}
                      onChange={(e) => handleInputChange('handoverTask', e.target.value)}
                      className="border-none focus:ring-0"
                    />
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableHead className="border p-2">업무내용</TableHead>
                  <TableCell colSpan={3} className="border p-2 h-32 align-top">
                    <Textarea
                      value={handoverData.taskContent}
                      onChange={(e) => handleInputChange('taskContent', e.target.value)}
                      className="border-none focus:ring-0 h-full resize-none"
                      placeholder="업무 내용을 상세히 작성해주세요."
                    />
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableHead className="border p-2">진행상태</TableHead>
                  <TableCell
                    colSpan={3}
                    className="border p-2 cursor-pointer"
                    onClick={() => toggleCell('progress')}
                  >
                    {handoverData.progress || '클릭하여 상태 변경'}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableHead className="border p-2">특이사항</TableHead>
                  <TableCell colSpan={3} className="border p-2 h-24 align-top">
                    <Textarea
                      value={handoverData.specialNotes}
                      onChange={(e) => handleInputChange('specialNotes', e.target.value)}
                      className="border-none focus:ring-0 h-full resize-none"
                    />
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>

            <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">개선조치 및 결과</h3>
                <Textarea
                  value={handoverData.improvementAction}
                  onChange={(e) => handleInputChange('improvementAction', e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="actionTaker" className="block text-sm font-medium text-gray-700 mb-1">
                    조치자
                  </label>
                  <Input
                    id="actionTaker"
                    value={handoverData.actionTaker}
                    onChange={(e) => handleInputChange('actionTaker', e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="confirmer" className="block text-sm font-medium text-gray-700 mb-1">
                    확인자
                  </label>
                  <Input
                    id="confirmer"
                    value={handoverData.confirmer}
                    onChange={(e) => handleInputChange('confirmer', e.target.value)}
                  />
                </div>
              </div>
            </div>
            <p className="text-sm text-gray-500 mt-4 print:hidden">
              * 셀 클릭으로 적합/부적합을 선택할 수 있습니다.
            </p>
          </CardContent>
        </Card>
      </div>
    </ChecklistFormLayout>
  );
}

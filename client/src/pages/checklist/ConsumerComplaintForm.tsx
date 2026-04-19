
import { useState } from "react";
import ChecklistFormLayout from "@/components/checklist/ChecklistFormLayout";
import type { ChecklistFormConfig } from "@/components/checklist/ChecklistFormLayout";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useIndustryLabel } from "@/hooks/useIndustryFeatures";

const config: ChecklistFormConfig = {
  formType: "consumer_complaint",
  title: "소비자 불만 관리 일지",
  listPath: "/consumer-complaint",
  documentTitle: "소비자 불만 관리 일지",
};

const initialRows: Record<string, any>[] = [
  { id: 1, 접수일: '', 접수경로: '', 고객명: '', 제품명: '', 불만내용: '', 원인분석: '', 조치내용: '', 조치일: '', 결과: '적합' },
];

export default function ConsumerComplaintForm() {
  const L = useIndustryLabel();
  const [rows, setRows] = useState(initialRows);
  const [notes, setNotes] = useState("");
  const [improvement, setImprovement] = useState("");
  const [actionTaker, setActionTaker] = useState("");
  const [confirmer, setConfirmer] = useState("");

  const collectFormData = () => ({
    rows,
    notes,
    improvement,
    actionTaker,
    confirmer,
  });

  const onDataRestore = (fd: any) => {
    if (fd.rows) setRows(fd.rows);
    if (fd.notes) setNotes(fd.notes);
    if (fd.improvement) setImprovement(fd.improvement);
    if (fd.actionTaker) setActionTaker(fd.actionTaker);
    if (fd.confirmer) setConfirmer(fd.confirmer);
  };

  const handleRowChange = (rowIndex: number, key: string, value: any) => {
    setRows(rows.map((row, i) => (i === rowIndex ? { ...row, [key]: value } : row)));
  };

  const toggleCell = (rowIndex: number, key: string) => {
    const currentStatus = rows[rowIndex][key];
    handleRowChange(rowIndex, key, currentStatus === '적합' ? '부적합' : '적합');
  };

  const handleBulkAppropriate = () => {
    setRows(rows.map(row => ({ ...row, 결과: '적합' })))
  };

  const extraActions = (
    <Button variant="outline" onClick={handleBulkAppropriate}>일괄적합</Button>
  );

  return (
    <ChecklistFormLayout
      config={config}
      collectFormData={collectFormData}
      onDataRestore={onDataRestore}
      extraActions={extraActions}
    >
      <div className="px-6 pb-6">
        <Table className="border">
          <TableHeader>
            <TableRow>
              <TableHead className="text-center border">접수일</TableHead>
              <TableHead className="text-center border">접수경로</TableHead>
              <TableHead className="text-center border">고객명</TableHead>
              <TableHead className="text-center border">{`${L("product")}명`}</TableHead>
              <TableHead className="text-center border">불만내용</TableHead>
              <TableHead className="text-center border">원인분석</TableHead>
              <TableHead className="text-center border">조치내용</TableHead>
              <TableHead className="text-center border">조치일</TableHead>
              <TableHead className="text-center border">결과</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, rowIndex) => (
              <TableRow key={row.id}>
                {Object.keys(row).filter(k => k !== 'id').map(col => (
                  <TableCell key={col} className="p-0 text-center border">
                    {col === '결과' ? (
                      <span 
                        className={`cursor-pointer ${row[col] === '적합' ? 'text-green-600' : 'text-red-600'}`}
                        onClick={() => toggleCell(rowIndex, col)}
                      >
                        {row[col]}
                      </span>
                    ) : (
                      <Input 
                        type="text" 
                        value={row[col]} 
                        onChange={(e) => handleRowChange(rowIndex, col, e.target.value)}
                        className="border-0 text-center"
                      />
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="mt-4 space-y-4">
          <div>
            <label className="font-bold">특이사항</label>
            <Textarea placeholder="특이사항을 입력하세요." value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div>
            <label className="font-bold">개선조치 및 결과</label>
            <Textarea placeholder="개선조치 및 결과를 입력하세요." value={improvement} onChange={(e) => setImprovement(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="font-bold">조치자</label>
              <Input placeholder="조치자 성명을 입력하세요." value={actionTaker} onChange={(e) => setActionTaker(e.target.value)} />
            </div>
            <div>
              <label className="font-bold">확인자</label>
              <Input placeholder="확인자 성명을 입력하세요." value={confirmer} onChange={(e) => setConfirmer(e.target.value)} />
            </div>
          </div>
        </div>
      </div>
    </ChecklistFormLayout>
  );
}

export { ConsumerComplaintForm };

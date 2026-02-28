import { useState } from "react";
import ChecklistFormLayout from "@/components/ChecklistFormLayout";
import type { ChecklistFormConfig } from "@/components/ChecklistFormLayout";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { Label } from "@/components/ui/label";

const config: ChecklistFormConfig = {
  formType: "pest_control_checklist",
  title: "방충·방서 점검표",
  listPath: "/pest-control/checklists",
  documentTitle: "방충·방서 관리일지",
};

// 비래해충 종류
const FLYING_PESTS = ["파리", "모기", "팔랑나방", "초파리", "날파리", "나방파리"] as const;
// 보행해충 종류
const CRAWLING_PESTS = ["바퀴", "개미", "거미", "쥐", "기타"] as const;

type PestControlRow = {
  equipmentName: string;
  installLocation: string;
  zone: string;
  flyingPests: Record<string, number>;
  flyingTotal: number;
  crawlingPests: Record<string, number>;
  crawlingTotal: number;
  managementNote: string;
  deviation: string;
  correctiveAction: string;
};

function createEmptyRow(): PestControlRow {
  const flyingPests: Record<string, number> = {};
  FLYING_PESTS.forEach(p => { flyingPests[p] = 0; });
  const crawlingPests: Record<string, number> = {};
  CRAWLING_PESTS.forEach(p => { crawlingPests[p] = 0; });
  return {
    equipmentName: "",
    installLocation: "",
    zone: "",
    flyingPests,
    flyingTotal: 0,
    crawlingPests,
    crawlingTotal: 0,
    managementNote: "",
    deviation: "",
    correctiveAction: "",
  };
}

export default function PestControlChecklistForm() {
  const [checkDate, setCheckDate] = useState("");
  const [specialNotes, setSpecialNotes] = useState("");
  const [rows, setRows] = useState<PestControlRow[]>([
    createEmptyRow(), createEmptyRow(), createEmptyRow(), createEmptyRow(), createEmptyRow(),
  ]);

  const collectFormData = () => ({
    checkDate,
    specialNotes,
    rows: rows.filter(r => r.equipmentName.trim() !== "" || r.installLocation.trim() !== ""),
  });

  const onDataRestore = (data: any) => {
    if (data.checkDate) setCheckDate(data.checkDate instanceof Date ? data.checkDate.toISOString().split("T")[0] : data.checkDate);
    if (data.specialNotes) setSpecialNotes(data.specialNotes);
    if (data.rows && data.rows.length > 0) {
      setRows(data.rows.map((r: any) => ({
        ...createEmptyRow(),
        ...r,
        flyingPests: { ...createEmptyRow().flyingPests, ...(r.flyingPests || {}) },
        crawlingPests: { ...createEmptyRow().crawlingPests, ...(r.crawlingPests || {}) },
      })));
    }
  };

  const addRow = () => setRows([...rows, createEmptyRow()]);

  const removeRow = (index: number) => {
    if (rows.length > 1) setRows(rows.filter((_, i) => i !== index));
  };

  const updateRow = (index: number, field: keyof PestControlRow, value: any) => {
    const newRows = [...rows];
    newRows[index] = { ...newRows[index], [field]: value };
    setRows(newRows);
  };

  const updateFlyingPest = (rowIndex: number, pest: string, value: number) => {
    const newRows = [...rows];
    const row = { ...newRows[rowIndex] };
    row.flyingPests = { ...row.flyingPests, [pest]: value };
    row.flyingTotal = Object.values(row.flyingPests).reduce((sum, v) => sum + (v || 0), 0);
    newRows[rowIndex] = row;
    setRows(newRows);
  };

  const updateCrawlingPest = (rowIndex: number, pest: string, value: number) => {
    const newRows = [...rows];
    const row = { ...newRows[rowIndex] };
    row.crawlingPests = { ...row.crawlingPests, [pest]: value };
    row.crawlingTotal = Object.values(row.crawlingPests).reduce((sum, v) => sum + (v || 0), 0);
    newRows[rowIndex] = row;
    setRows(newRows);
  };

  return (
    <ChecklistFormLayout
      config={config}
      collectFormData={collectFormData}
      onDataRestore={onDataRestore}
      extraActions={
        <Button type="button" variant="outline" size="sm" onClick={addRow} className="print:hidden">
          <Plus className="mr-1 h-4 w-4" />
          행 추가
        </Button>
      }
    >
      <div className="px-4 pb-6 space-y-4">
        {/* 점검일자 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 print:hidden">
          <div className="space-y-2">
            <Label htmlFor="checkDate">점검 일자 *</Label>
            <Input
              id="checkDate"
              type="date"
              value={checkDate}
              onChange={(e) => setCheckDate(e.target.value)}
              required
            />
          </div>
        </div>

        {/* 메인 점검표 테이블 */}
        <div className="border rounded-lg overflow-x-auto">
          <Table className="min-w-[1400px] text-xs">
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead rowSpan={2} className="border text-center font-semibold w-[80px] align-middle">설비명</TableHead>
                <TableHead rowSpan={2} className="border text-center font-semibold w-[90px] align-middle">설치위치</TableHead>
                <TableHead rowSpan={2} className="border text-center font-semibold w-[70px] align-middle">구역</TableHead>
                <TableHead colSpan={FLYING_PESTS.length + 1} className="border text-center font-semibold bg-blue-50">비래해충</TableHead>
                <TableHead colSpan={CRAWLING_PESTS.length + 1} className="border text-center font-semibold bg-orange-50">보행해충</TableHead>
                <TableHead rowSpan={2} className="border text-center font-semibold w-[80px] align-middle">관리사항</TableHead>
                <TableHead rowSpan={2} className="border text-center font-semibold w-[70px] align-middle">기준이탈</TableHead>
                <TableHead rowSpan={2} className="border text-center font-semibold w-[80px] align-middle">개선조치</TableHead>
                <TableHead rowSpan={2} className="border text-center font-semibold w-[40px] align-middle print:hidden"></TableHead>
              </TableRow>
              <TableRow className="bg-gray-50">
                {FLYING_PESTS.map(pest => (
                  <TableHead key={pest} className="border text-center font-medium text-[10px] bg-blue-50 w-[45px] px-0.5">{pest}</TableHead>
                ))}
                <TableHead className="border text-center font-semibold text-[10px] bg-blue-100 w-[45px] px-0.5">합계</TableHead>
                {CRAWLING_PESTS.map(pest => (
                  <TableHead key={pest} className="border text-center font-medium text-[10px] bg-orange-50 w-[45px] px-0.5">{pest}</TableHead>
                ))}
                <TableHead className="border text-center font-semibold text-[10px] bg-orange-100 w-[45px] px-0.5">합계</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, rowIndex) => (
                <TableRow key={rowIndex}>
                  <TableCell className="border p-1">
                    <Input value={row.equipmentName} onChange={(e) => updateRow(rowIndex, "equipmentName", e.target.value)} placeholder="포충등1" className="h-7 text-xs px-1" />
                  </TableCell>
                  <TableCell className="border p-1">
                    <Input value={row.installLocation} onChange={(e) => updateRow(rowIndex, "installLocation", e.target.value)} placeholder="원료창고 입구" className="h-7 text-xs px-1" />
                  </TableCell>
                  <TableCell className="border p-1">
                    <Input value={row.zone} onChange={(e) => updateRow(rowIndex, "zone", e.target.value)} placeholder="A구역" className="h-7 text-xs px-1" />
                  </TableCell>
                  {FLYING_PESTS.map(pest => (
                    <TableCell key={pest} className="border p-0.5 bg-blue-50/30">
                      <Input type="number" min="0" value={row.flyingPests[pest] || 0} onChange={(e) => updateFlyingPest(rowIndex, pest, parseInt(e.target.value) || 0)} className="h-7 text-xs px-0.5 text-center w-full" />
                    </TableCell>
                  ))}
                  <TableCell className="border p-0.5 bg-blue-100/30 text-center font-semibold text-xs">{row.flyingTotal}</TableCell>
                  {CRAWLING_PESTS.map(pest => (
                    <TableCell key={pest} className="border p-0.5 bg-orange-50/30">
                      <Input type="number" min="0" value={row.crawlingPests[pest] || 0} onChange={(e) => updateCrawlingPest(rowIndex, pest, parseInt(e.target.value) || 0)} className="h-7 text-xs px-0.5 text-center w-full" />
                    </TableCell>
                  ))}
                  <TableCell className="border p-0.5 bg-orange-100/30 text-center font-semibold text-xs">{row.crawlingTotal}</TableCell>
                  <TableCell className="border p-1">
                    <Input value={row.managementNote} onChange={(e) => updateRow(rowIndex, "managementNote", e.target.value)} className="h-7 text-xs px-1" />
                  </TableCell>
                  <TableCell className="border p-1">
                    <Input value={row.deviation} onChange={(e) => updateRow(rowIndex, "deviation", e.target.value)} className="h-7 text-xs px-1" />
                  </TableCell>
                  <TableCell className="border p-1">
                    <Input value={row.correctiveAction} onChange={(e) => updateRow(rowIndex, "correctiveAction", e.target.value)} className="h-7 text-xs px-1" />
                  </TableCell>
                  <TableCell className="border p-0.5 text-center print:hidden">
                    {rows.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeRow(rowIndex)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* 특이사항 */}
        <div className="space-y-2">
          <Label htmlFor="specialNotes">특이사항 및 종합 의견</Label>
          <Textarea
            id="specialNotes"
            value={specialNotes}
            onChange={(e) => setSpecialNotes(e.target.value)}
            placeholder="특이사항을 입력하세요"
            rows={3}
          />
        </div>
      </div>
    </ChecklistFormLayout>
  );
}

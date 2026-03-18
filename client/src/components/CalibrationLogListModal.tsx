import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Search, FileText, Download } from "lucide-react";

interface CalibrationLogListModalProps {
  open: boolean;
  onClose: () => void;
}

export default function CalibrationLogListModal({ open, onClose }: CalibrationLogListModalProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // 검교정 기록 목록 조회
  const { data: records, refetch } = trpc.calibration.listRecords.useQuery(
    {
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    },
    { enabled: open }
  );

  // 검색 필터링
  const filteredRecords = (records as any[])?.filter((record: any) => {
    if (!searchTerm) return true;
    return (
      record.equipmentName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.equipmentCode?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      draft: { label: "임시저장", variant: "secondary" },
      pending_review: { label: "승인대기", variant: "outline" },
      approved: { label: "승인완료", variant: "default" },
      rejected: { label: "반려", variant: "destructive" },
    };
    const statusInfo = statusMap[status] || { label: status, variant: "outline" };
    return <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>;
  };

  const handleDownloadPDF = (recordId: number) => {
    // PDF 다운로드 기능 (Phase 5에서 구현)
    alert("PDF 다운로드 기능은 다음 단계에서 구현됩니다");
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>검교정 일지 목록</DialogTitle>
        </DialogHeader>

        {/* 검색 및 필터 */}
        <div className="space-y-4 py-4">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="설비명 또는 코드로 검색..."
                className="pl-10"
              />
            </div>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              placeholder="시작일"
              className="w-40"
            />
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              placeholder="종료일"
              className="w-40"
            />
            <Button onClick={() => refetch()}>조회</Button>
          </div>
        </div>

        {/* 검교정 기록 목록 */}
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted">
              <tr>
                <th className="p-3 text-left">설비코드</th>
                <th className="p-3 text-left">설비명</th>
                <th className="p-3 text-left">검교정일</th>
                <th className="p-3 text-left">다음 검교정일</th>
                <th className="p-3 text-left">상태</th>
                <th className="p-3 text-left">작성자</th>
                <th className="p-3 text-center">액션</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords && filteredRecords.length > 0 ? (
                filteredRecords.map((record: any) => (
                  <tr key={record.id} className="border-t hover:bg-muted/50">
                    <td className="p-3">{record.equipmentCode}</td>
                    <td className="p-3">{record.equipmentName}</td>
                    <td className="p-3">{record.calibrationDate}</td>
                    <td className="p-3">{record.nextCalibrationDate || "-"}</td>
                    <td className="p-3">{getStatusBadge(record.approvalStatus || record.status || 'draft')}</td>
                    <td className="p-3">{record.createdBy}</td>
                    <td className="p-3 text-center">
                      <div className="flex justify-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            // 상세보기 기능
                            alert("상세보기 기능은 다음 단계에서 구현됩니다");
                          }}
                        >
                          <FileText className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDownloadPDF(record.id)}
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    작성된 검교정 일지가 없습니다
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 하단 버튼 */}
        <div className="flex justify-end pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            닫기
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

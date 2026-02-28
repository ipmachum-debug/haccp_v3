import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FileDown, Trash2, Check, X, Clock } from "lucide-react";

interface TrainingLogListModalProps {
  open: boolean;
  onClose: () => void;
}

export default function TrainingLogListModal({ open, onClose }: TrainingLogListModalProps) {
  const [logs, setLogs] = useState<any[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState("all");

  useEffect(() => {
    if (open) {
      fetchLogs();
    }
  }, [open]);

  const fetchLogs = async () => {
    try {
      const params = new URLSearchParams({
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
        ...(status !== "all" && { status }),
      });

      const response = await fetch(`/api/trainingLog/list?${params}`);
      const data = await response.json();
      setLogs(data.logs || []);
    } catch (error) {
      console.error(error);
    }
  };

  const handleRequestApproval = async (id: number) => {
    if (!confirm("승인 요청하시겠습니까?")) return;

    try {
      const response = await fetch(`/api/trainingLog/${id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "승인대기" }),
      });

      if (response.ok) {
        alert("승인 요청되었습니다.");
        fetchLogs();
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleApprove = async (id: number) => {
    if (!confirm("승인하시겠습니까?")) return;

    try {
      const response = await fetch(`/api/trainingLog/${id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "승인완료" }),
      });

      if (response.ok) {
        alert("승인되었습니다.");
        fetchLogs();
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleReject = async (id: number) => {
    if (!confirm("반려하시겠습니까?")) return;

    try {
      const response = await fetch(`/api/trainingLog/${id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "반려" }),
      });

      if (response.ok) {
        alert("반려되었습니다.");
        fetchLogs();
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("삭제하시겠습니까?")) return;

    try {
      const response = await fetch(`/api/trainingLog/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        alert("삭제되었습니다.");
        fetchLogs();
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handlePdfExport = async (id: number) => {
    try {
      window.open(`/api/trainingLog/${id}/pdf`, '_blank');
    } catch (error) {
      console.error(error);
      alert("PDF 출력 중 오류가 발생했습니다.");
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "작성중":
        return <Badge variant="secondary">작성중</Badge>;
      case "승인대기":
        return <Badge className="bg-yellow-500">승인대기</Badge>;
      case "승인완료":
        return <Badge className="bg-green-500">승인완료</Badge>;
      case "반려":
        return <Badge className="bg-red-500">반려</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('ko-KR');
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>교육훈련일지 목록</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* 필터 */}
          <div className="grid grid-cols-4 gap-4">
            <div>
              <Label>시작일</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <Label>종료일</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div>
              <Label>상태</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  <SelectItem value="작성중">작성중</SelectItem>
                  <SelectItem value="승인대기">승인대기</SelectItem>
                  <SelectItem value="승인완료">승인완료</SelectItem>
                  <SelectItem value="반려">반려</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={fetchLogs} className="w-full">조회</Button>
            </div>
          </div>

          {/* 목록 */}
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left">교육일시</th>
                  <th className="px-4 py-2 text-left">교육자</th>
                  <th className="px-4 py-2 text-left">장소</th>
                  <th className="px-4 py-2 text-left">대상</th>
                  <th className="px-4 py-2 text-left">참석자 수</th>
                  <th className="px-4 py-2 text-left">상태</th>
                  <th className="px-4 py-2 text-left">액션</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                      등록된 교육훈련일지가 없습니다.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="border-t hover:bg-gray-50">
                      <td className="px-4 py-2">
                        {formatDate(log.training_date)} {log.start_time}~{log.end_time}
                      </td>
                      <td className="px-4 py-2">{log.educator}</td>
                      <td className="px-4 py-2">{log.location}</td>
                      <td className="px-4 py-2">{log.target_audience}</td>
                      <td className="px-4 py-2">{(log.attendees || []).length}명</td>
                      <td className="px-4 py-2">{getStatusBadge(log.status)}</td>
                      <td className="px-4 py-2">
                        <div className="flex gap-2">
                          {log.status === "작성중" && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleRequestApproval(log.id)}
                              >
                                <Clock className="h-4 w-4 mr-1" />
                                승인 요청
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleDelete(log.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}

                          {log.status === "승인대기" && (
                            <>
                              <Button
                                size="sm"
                                className="bg-green-500"
                                onClick={() => handleApprove(log.id)}
                              >
                                <Check className="h-4 w-4 mr-1" />
                                승인
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleReject(log.id)}
                              >
                                <X className="h-4 w-4 mr-1" />
                                반려
                              </Button>
                            </>
                          )}

                          {log.status === "승인완료" && (
                            <Button size="sm" variant="outline" onClick={() => handlePdfExport(log.id)}>
                              <FileDown className="h-4 w-4 mr-1" />
                              PDF 출력
                            </Button>
                          )}

                          {log.status === "반려" && (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDelete(log.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}

                          {/* 모든 상태에서 PDF 미리보기 가능 */}
                          <Button size="sm" variant="ghost" onClick={() => handlePdfExport(log.id)}>
                            <FileDown className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

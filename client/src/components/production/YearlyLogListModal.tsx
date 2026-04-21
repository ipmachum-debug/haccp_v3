import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Calendar, Search, CheckCircle, Clock, Trash2, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface YearlyLogListModalProps {
  open: boolean;
  onClose: () => void;
  tenantId: number;
}

export function YearlyLogListModal({ open, onClose, tenantId }: YearlyLogListModalProps) {
  const { toast } = useToast();
  const [logs, setLogs] = useState<any[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState("전체");

  const fetchLogs = async () => {
    try {
      const params = new URLSearchParams({
        tenantId: tenantId.toString(),
        startDate,
        endDate,
        status,
      });

      const response = await fetch(`/api/yearlyLog/get?${params}`);
      if (response.ok) {
        const data = await response.json();
        setLogs(data);
      }
    } catch (error) {
      console.error("연간일지 조회 오류:", error);
    }
  };

  useEffect(() => {
    if (open) {
      fetchLogs();
    }
  }, [open, startDate, endDate, status]);

  const handleApprove = async (id: number) => {
    try {
      const response = await fetch(`/api/yearlyLog/approve/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvedBy: "관리자" }),
      });

      if (response.ok) {
        toast({ title: "승인 완료", description: "연간일지가 승인되었습니다." });
        fetchLogs();
      }
    } catch (error) {
      toast({ title: "승인 실패", variant: "destructive" });
    }
  };

  const handleRequestApproval = async (id: number) => {
    try {
      const response = await fetch(`/api/yearlyLog/requestApproval/${id}`, {
        method: "POST",
      });

      if (response.ok) {
        toast({ title: "승인 요청 완료", description: "승인 요청이 전송되었습니다." });
        fetchLogs();
      }
    } catch (error) {
      toast({ title: "승인 요청 실패", variant: "destructive" });
    }
  };

  const handleReject = async (id: number) => {
    const reason = prompt("반려 사유를 입력하세요:");
    if (!reason) return;

    try {
      const response = await fetch(`/api/yearlyLog/reject/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rejectedReason: reason }),
      });

      if (response.ok) {
        toast({ title: "반려 완료", description: "연간일지가 반려되었습니다." });
        fetchLogs();
      }
    } catch (error) {
      toast({ title: "반려 실패", variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;

    try {
      const response = await fetch(`/api/yearlyLog/delete/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast({ title: "삭제 완료", description: "연간일지가 삭제되었습니다." });
        fetchLogs();
      }
    } catch (error) {
      toast({ title: "삭제 실패", variant: "destructive" });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "작성중":
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />작성중</Badge>;
      case "승인대기":
        return <Badge variant="outline" className="border-yellow-500 text-yellow-700"><Clock className="h-3 w-3 mr-1" />승인대기</Badge>;
      case "승인완료":
        return <Badge variant="default" className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />승인완료</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Calendar className="h-6 w-6" />
            연간일지 목록
          </DialogTitle>
        </DialogHeader>

        {/* 필터 */}
        <div className="grid grid-cols-4 gap-4 py-4">
          <div>
            <Label>시작일자</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <Label>종료일자</Label>
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
                <SelectItem value="전체">전체</SelectItem>
                <SelectItem value="작성중">작성중</SelectItem>
                <SelectItem value="승인대기">승인대기</SelectItem>
                <SelectItem value="승인완료">승인완료</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button onClick={fetchLogs} className="w-full">
              <Search className="h-4 w-4 mr-2" />
              조회
            </Button>
          </div>
        </div>

        {/* 테이블 */}
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>점검일자</TableHead>
                <TableHead>점검자</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>승인자</TableHead>
                <TableHead>승인일시</TableHead>
                <TableHead className="text-right">작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-gray-500 py-8">
                    조회된 연간일지가 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>{log.inspection_date}</TableCell>
                    <TableCell>{log.inspector}</TableCell>
                    <TableCell>{getStatusBadge(log.status)}</TableCell>
                    <TableCell>{log.approved_by || "-"}</TableCell>
                    <TableCell>{log.approved_at ? new Date(log.approved_at).toLocaleString() : "-"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {log.status === "작성중" && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleRequestApproval(log.id)}
                            >
                              <Clock className="h-3 w-3 mr-1" />
                              승인 요청
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDelete(log.id)}
                            >
                              <Trash2 className="h-3 w-3 mr-1" />
                              삭제
                            </Button>
                          </>
                        )}
                        {log.status === "승인대기" && (
                          <>
                            <Button
                              size="sm"
                              variant="default"
                              className="bg-green-600"
                              onClick={() => handleApprove(log.id)}
                            >
                              <CheckCircle className="h-3 w-3 mr-1" />
                              승인
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleReject(log.id)}
                            >
                              <XCircle className="h-3 w-3 mr-1" />
                              반려
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

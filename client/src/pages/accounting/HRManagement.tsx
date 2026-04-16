/**
 * 인사관리 — ERP 강화 Phase 3-2
 * 근태(출퇴근) + 휴가(연차/병가) 관리
 */
import { useState, useMemo } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Clock, Calendar, Users, LogIn, LogOut, CheckCircle, XCircle,
  Loader2, Plus, AlertTriangle, Timer, Pencil,
} from "lucide-react";
import { todayLocal } from "@/lib/dateUtils";
import { useAuth } from "@/_core/hooks/useAuth";

// Date 객체를 안전하게 문자열로 변환
const safeDate = (v: any): string => {
  if (!v) return "-";
  if (typeof v === "string") return v.slice(0, 10);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
};

const fmt = (n: number) => `₩${n.toLocaleString()}`;

const leaveTypeLabels: Record<string, { label: string; color: string }> = {
  annual: { label: "연차", color: "bg-blue-100 text-blue-700" },
  sick: { label: "병가", color: "bg-red-100 text-red-700" },
  personal: { label: "경조", color: "bg-purple-100 text-purple-700" },
  maternity: { label: "출산", color: "bg-pink-100 text-pink-700" },
  other: { label: "기타", color: "bg-gray-100 text-gray-700" },
};

const statusLabels: Record<string, { label: string; color: string }> = {
  pending: { label: "대기", color: "bg-amber-100 text-amber-700" },
  approved: { label: "승인", color: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "반려", color: "bg-red-100 text-red-700" },
};

export default function HRManagement() {
  const { isAdmin } = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = `${year}-${String(month).padStart(2, "0")}-31`;
  const [leaveOpen, setLeaveOpen] = useState(false);

  // 출퇴근
  const { data: myToday, refetch: refetchToday } = trpc.hr.myToday.useQuery(undefined, { refetchInterval: 30000 });
  const clockInMut = trpc.hr.clockIn.useMutation({
    onSuccess: (r: any) => { toast.success(r.message); refetchToday(); refetchAtt(); },
    onError: (e: any) => toast.error(e.message),
  });
  const clockOutMut = trpc.hr.clockOut.useMutation({
    onSuccess: (r: any) => { toast.success(r.message); refetchToday(); refetchAtt(); },
    onError: (e: any) => toast.error(e.message),
  });

  // 근태 목록
  const { data: attendance, refetch: refetchAtt } = trpc.hr.attendanceList.useQuery({ startDate, endDate });

  // 휴가
  const { data: leaves, refetch: refetchLeaves } = trpc.hr.leaveList.useQuery({ year, status: "all" });
  const { data: leaveBalance } = trpc.hr.leaveBalance.useQuery({ year });

  // 근태 수정 (관리자)
  const updateAttMut = trpc.hr.updateAttendance.useMutation({
    onSuccess: (r: any) => { toast.success(r.message); refetchAtt(); },
    onError: (e: any) => toast.error(e.message),
  });

  // 휴가 승인/반려
  const approveMut = trpc.hr.approveLeave.useMutation({
    onSuccess: (r: any) => { toast.success(r.message); refetchLeaves(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* 헤더 + 출퇴근 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Users className="h-5 w-5 text-sky-600" /> 인사관리
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">근태(출퇴근), 휴가(연차/병가) 관리</p>
          </div>
          <div className="flex gap-2 items-center">
            {/* 출퇴근 버튼 */}
            <div className="flex items-center gap-2 bg-white border rounded-lg px-3 py-1.5 shadow-sm">
              {myToday ? (
                <>
                  <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">
                    출근 {myToday.clockIn}
                  </Badge>
                  {myToday.clockOut ? (
                    <Badge className="bg-blue-100 text-blue-700 text-[10px]">
                      퇴근 {myToday.clockOut} ({myToday.workHours.toFixed(1)}h)
                    </Badge>
                  ) : (
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-red-600 border-red-300"
                      onClick={() => clockOutMut.mutate()} disabled={clockOutMut.isPending}>
                      <LogOut className="h-3 w-3" /> 퇴근
                    </Button>
                  )}
                </>
              ) : (
                <Button size="sm" className="h-7 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => clockInMut.mutate()} disabled={clockInMut.isPending}>
                  <LogIn className="h-3 w-3" /> 출근
                </Button>
              )}
            </div>

            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="h-8 text-xs border rounded px-2">
              {[2024, 2025, 2026, 2027].map((y) => <option key={y}>{y}</option>)}
            </select>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="h-8 text-xs border rounded px-2">
              {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}월</option>)}
            </select>
          </div>
        </div>

        <Tabs defaultValue="attendance">
          <TabsList>
            <TabsTrigger value="attendance" className="text-xs gap-1.5"><Clock className="h-3.5 w-3.5" /> 근태관리</TabsTrigger>
            <TabsTrigger value="leave" className="text-xs gap-1.5"><Calendar className="h-3.5 w-3.5" /> 휴가관리</TabsTrigger>
            <TabsTrigger value="balance" className="text-xs gap-1.5"><Timer className="h-3.5 w-3.5" /> 연차현황</TabsTrigger>
          </TabsList>

          {/* 근태 탭 */}
          <TabsContent value="attendance">
            <Card>
              <CardHeader className="py-3 px-4 border-b">
                <CardTitle className="text-sm">{year}년 {month}월 근태 현황</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {!attendance?.length ? (
                  <div className="py-16 text-center text-muted-foreground">근태 기록이 없습니다</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead><tr className="border-b bg-muted/30">
                        <th className="p-2.5 text-left font-medium">날짜</th>
                        <th className="p-2.5 text-left font-medium">성명</th>
                        <th className="p-2.5 text-center font-medium">출근</th>
                        <th className="p-2.5 text-center font-medium">퇴근</th>
                        <th className="p-2.5 text-right font-medium">근무시간</th>
                        <th className="p-2.5 text-right font-medium">연장</th>
                        <th className="p-2.5 text-center font-medium">상태</th>
                        {isAdmin && <th className="p-2.5 text-center font-medium w-[60px]">수정</th>}
                      </tr></thead>
                      <tbody>
                        {attendance.map((a: any) => (
                          <tr key={a.id} className="border-b hover:bg-accent/50">
                            <td className="p-2.5 font-mono">{safeDate(a.workDate)}</td>
                            <td className="p-2.5 font-medium">{a.employeeName}</td>
                            <td className="p-2.5 text-center font-mono text-emerald-700">{a.clockIn || "-"}</td>
                            <td className="p-2.5 text-center font-mono text-blue-700">{a.clockOut || "-"}</td>
                            <td className="p-2.5 text-right font-mono">{a.workHours > 0 ? `${a.workHours.toFixed(1)}h` : "-"}</td>
                            <td className="p-2.5 text-right font-mono text-amber-700">
                              {a.overtimeHours > 0 ? `+${a.overtimeHours.toFixed(1)}h` : "-"}
                            </td>
                            <td className="p-2.5 text-center">
                              <Badge variant="outline" className={
                                a.status === "present" ? "text-emerald-600" :
                                a.status === "late" ? "text-amber-600" : "text-red-600"
                              }>
                                {a.status === "present" ? "출근" : a.status === "late" ? "지각" : "결근"}
                              </Badge>
                            </td>
                            {isAdmin && (
                              <td className="p-2.5 text-center">
                                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-blue-600"
                                  onClick={() => {
                                    const newIn = prompt(`출근 시간 수정 (현재: ${a.clockIn || "없음"})`, a.clockIn || "09:00:00");
                                    if (newIn === null) return;
                                    const newOut = prompt(`퇴근 시간 수정 (현재: ${a.clockOut || "없음"})`, a.clockOut || "18:00:00");
                                    const notes = prompt("수정 사유:");
                                    updateAttMut.mutate({ id: a.id, clockIn: newIn || undefined, clockOut: newOut || undefined, notes: notes ? `[관리자수정] ${notes}` : undefined });
                                  }} title="수정">
                                  <Pencil className="h-3 w-3" />
                                </Button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 휴가 탭 */}
          <TabsContent value="leave">
            <div className="space-y-3">
              <div className="flex justify-end">
                <Dialog open={leaveOpen} onOpenChange={setLeaveOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> 휴가 신청</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>휴가 신청</DialogTitle></DialogHeader>
                    <LeaveRequestForm onSuccess={() => { setLeaveOpen(false); refetchLeaves(); }} />
                  </DialogContent>
                </Dialog>
              </div>

              <Card>
                <CardContent className="p-0">
                  {!leaves?.length ? (
                    <div className="py-16 text-center text-muted-foreground">휴가 기록이 없습니다</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead><tr className="border-b bg-muted/30">
                          <th className="p-2.5 text-left font-medium">신청자</th>
                          <th className="p-2.5 text-center font-medium">유형</th>
                          <th className="p-2.5 text-left font-medium">기간</th>
                          <th className="p-2.5 text-center font-medium">일수</th>
                          <th className="p-2.5 text-left font-medium">사유</th>
                          <th className="p-2.5 text-center font-medium">상태</th>
                          {isAdmin && <th className="p-2.5 text-center font-medium w-[100px]">액션</th>}
                        </tr></thead>
                        <tbody>
                          {leaves.map((l: any) => {
                            const lt = leaveTypeLabels[l.leaveType] || leaveTypeLabels.other;
                            const st = statusLabels[l.status] || statusLabels.pending;
                            return (
                              <tr key={l.id} className="border-b hover:bg-accent/50">
                                <td className="p-2.5 font-medium">{l.employeeName}</td>
                                <td className="p-2.5 text-center"><Badge className={`${lt.color} text-[10px]`}>{lt.label}</Badge></td>
                                <td className="p-2.5 font-mono">{safeDate(l.startDate)} ~ {safeDate(l.endDate)}</td>
                                <td className="p-2.5 text-center font-bold">{l.days}일</td>
                                <td className="p-2.5 text-muted-foreground truncate max-w-[200px]">{l.reason}</td>
                                <td className="p-2.5 text-center"><Badge className={`${st.color} text-[10px]`}>{st.label}</Badge></td>
                                {isAdmin && (
                                  <td className="p-2.5 text-center">
                                    {l.status === "pending" && (
                                      <div className="flex gap-1 justify-center">
                                        <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 text-emerald-600"
                                          onClick={() => approveMut.mutate({ id: l.id, action: "approved" })}>
                                          <CheckCircle className="h-3 w-3 mr-0.5" />승인
                                        </Button>
                                        <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 text-red-600"
                                          onClick={() => {
                                            const comment = prompt("반려 사유:");
                                            if (comment !== null) approveMut.mutate({ id: l.id, action: "rejected", comment });
                                          }}>
                                          <XCircle className="h-3 w-3 mr-0.5" />반려
                                        </Button>
                                      </div>
                                    )}
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* 연차현황 탭 */}
          <TabsContent value="balance">
            <Card>
              <CardHeader className="py-3 px-4 border-b">
                <CardTitle className="text-sm">{year}년 연차 현황</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {!leaveBalance?.length ? (
                  <div className="py-16 text-center text-muted-foreground">직원 데이터가 없습니다</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead><tr className="border-b bg-muted/30">
                        <th className="p-2.5 text-left font-medium">성명</th>
                        <th className="p-2.5 text-left font-medium">직급</th>
                        <th className="p-2.5 text-center font-medium">부여</th>
                        <th className="p-2.5 text-center font-medium">사용</th>
                        <th className="p-2.5 text-center font-medium">잔여</th>
                        <th className="p-2.5 text-center font-medium">소진율</th>
                      </tr></thead>
                      <tbody>
                        {leaveBalance.map((b: any) => {
                          const rate = b.annualTotal > 0 ? Math.round((b.annualUsed / b.annualTotal) * 100) : 0;
                          return (
                            <tr key={b.employeeId} className="border-b hover:bg-accent/50">
                              <td className="p-2.5 font-medium">{b.employeeName}</td>
                              <td className="p-2.5 text-muted-foreground">{b.employeeRole}</td>
                              <td className="p-2.5 text-center font-bold">{b.annualTotal}일</td>
                              <td className="p-2.5 text-center text-blue-700">{b.annualUsed}일</td>
                              <td className={`p-2.5 text-center font-bold ${b.annualRemaining <= 3 ? "text-red-600" : "text-emerald-700"}`}>
                                {b.annualRemaining}일
                              </td>
                              <td className="p-2.5 text-center">
                                <div className="flex items-center gap-1 justify-center">
                                  <div className="w-12 bg-gray-100 rounded-full h-1.5">
                                    <div className={`h-1.5 rounded-full ${rate > 80 ? "bg-red-500" : rate > 50 ? "bg-amber-500" : "bg-emerald-500"}`}
                                      style={{ width: `${Math.min(rate, 100)}%` }} />
                                  </div>
                                  <span className="text-[10px] font-bold">{rate}%</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

function LeaveRequestForm({ onSuccess }: { onSuccess: () => void }) {
  const [leaveType, setLeaveType] = useState("annual");
  const [startDate, setStartDate] = useState(todayLocal());
  const [endDate, setEndDate] = useState(todayLocal());
  const [reason, setReason] = useState("");

  const requestMut = trpc.hr.requestLeave.useMutation({
    onSuccess: (r: any) => { toast.success(r.message); onSuccess(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs">휴가 유형</Label>
        <Select value={leaveType} onValueChange={setLeaveType}>
          <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(leaveTypeLabels).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">시작일</Label>
          <Input type="date" value={startDate} onChange={(e: any) => setStartDate(e.target.value)} className="h-9 text-sm" />
        </div>
        <div>
          <Label className="text-xs">종료일</Label>
          <Input type="date" value={endDate} onChange={(e: any) => setEndDate(e.target.value)} className="h-9 text-sm" />
        </div>
      </div>
      <div>
        <Label className="text-xs">사유 *</Label>
        <Textarea value={reason} onChange={(e: any) => setReason(e.target.value)} placeholder="휴가 사유" rows={2} />
      </div>
      <Button className="w-full" disabled={requestMut.isPending || !reason.trim()}
        onClick={() => requestMut.mutate({ leaveType: leaveType as any, startDate, endDate, reason })}>
        {requestMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        휴가 신청
      </Button>
    </div>
  );
}

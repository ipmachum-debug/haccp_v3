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
  Loader2, Plus, AlertTriangle, Timer, Pencil, Printer, Trash2,
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
  const [selectedEmployee, setSelectedEmployee] = useState<number | null>(null);

  // 직원 목록 (필터용)
  const { data: employeeList } = trpc.payroll.employees.useQuery();
  const employees: any[] = (employeeList as any[]) || [];

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

  // 근태 목록 (직원 필터 적용 — attendance_records.employee_id는 users.id 기준)
  const selectedUserId = useMemo(() => {
    if (!selectedEmployee) return undefined;
    const emp = employees.find((e: any) => e.id === selectedEmployee);
    // h_employees.userId가 있으면 사용, 없으면 id 그대로 (users 폴백 경우)
    return emp?.userId || emp?.id || selectedEmployee;
  }, [selectedEmployee, employees]);

  const { data: attendance, refetch: refetchAtt } = trpc.hr.attendanceList.useQuery({
    startDate, endDate,
    employeeId: selectedUserId || undefined,
  });

  // 휴가
  const { data: leaves, refetch: refetchLeaves } = trpc.hr.leaveList.useQuery({ year, status: "all" });
  const { data: leaveBalance, refetch: refetchBalance } = trpc.hr.leaveBalance.useQuery({ year });
  const [empStatusTab, setEmpStatusTab] = useState<"active" | "inactive">("active");
  const { data: inactiveEmployees, refetch: refetchInactive } = trpc.hr.employeesByStatus.useQuery({ isActive: false });
  const [manualLeaveOpen, setManualLeaveOpen] = useState(false);
  const [manualLeaveEmpId, setManualLeaveEmpId] = useState<number | null>(null);

  // 근태 수정 (관리자)
  const updateAttMut = trpc.hr.updateAttendance.useMutation({
    onSuccess: (r: any) => { toast.success(r.message); refetchAtt(); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteAttMut = trpc.hr.deleteAttendance.useMutation({
    onSuccess: (r: any) => { toast.success(r.message); refetchAtt(); },
    onError: (e: any) => toast.error(e.message),
  });

  // 근태 수기 등록
  const [manualAttOpen, setManualAttOpen] = useState(false);
  const createAttMut = trpc.hr.createAttendanceManual.useMutation({
    onSuccess: (r: any) => { toast.success(r.message); setManualAttOpen(false); refetchAtt(); },
    onError: (e: any) => toast.error(e.message),
  });

  // 일일 마감 (퇴근 미기록 자동처리)
  const closeDayMut = trpc.hr.closeDay.useMutation({
    onSuccess: (r: any) => { toast.success(r.message); refetchAtt(); },
    onError: (e: any) => toast.error(e.message),
  });

  // 비회원 직원 등록
  const [newEmpOpen, setNewEmpOpen] = useState(false);
  const { data: deptList } = trpc.hr.departments.useQuery();
  const { data: posList } = trpc.hr.positions.useQuery();
  const createEmpMut = trpc.hr.createEmployee.useMutation({
    onSuccess: (r: any) => { toast.success(r.message); setNewEmpOpen(false); refetchBalance(); },
    onError: (e: any) => toast.error(e.message),
  });

  // 유저-구성원 매칭
  const [matchOpen, setMatchOpen] = useState(false);
  const { data: unmatchedUsers } = trpc.hr.unmatchedUsers.useQuery();
  const { data: matchingStatus, refetch: refetchMatching } = trpc.hr.matchingStatus.useQuery();
  const linkUserMut = trpc.hr.linkUserToEmployee.useMutation({
    onSuccess: (r: any) => { toast.success(r.message); refetchBalance(); refetchMatching(); },
    onError: (e: any) => toast.error(e.message),
  });

  // 연차 부여 수정 (관리자)
  const setBalanceMut = trpc.hr.setLeaveBalance.useMutation({
    onSuccess: (r: any) => { toast.success(r.message); refetchBalance(); },
    onError: (e: any) => toast.error(e.message),
  });

  // 수기 연차 등록 (관리자)
  const manualLeaveMut = trpc.hr.createLeaveManual.useMutation({
    onSuccess: (r: any) => { toast.success(r.message); setManualLeaveOpen(false); refetchLeaves(); refetchBalance(); },
    onError: (e: any) => toast.error(e.message),
  });

  // 직원 상태 변경 (관리자)
  const updateStatusMut = trpc.hr.updateEmployeeStatus.useMutation({
    onSuccess: (r: any) => { toast.success(r.message); refetchBalance(); refetchInactive(); },
    onError: (e: any) => toast.error(e.message),
  });

  // 연차관리대장 출력
  const handlePrintLeaveReport = () => {
    if (!leaveBalance || !(leaveBalance as any[]).length) {
      toast.error("출력할 연차 데이터가 없습니다.");
      return;
    }
    const pw = window.open("", "_blank");
    if (!pw) return;

    const balanceRows = (leaveBalance as any[]).map((b: any) => {
      const rate = b.annualTotal > 0 ? Math.round((b.annualUsed / b.annualTotal) * 100) : 0;
      return `<tr>
        <td class="b">${b.employeeName}</td>
        <td class="b tc">${b.employeeRole || "-"}</td>
        <td class="b tc fw">${b.annualTotal}</td>
        <td class="b tc" style="color:#2563eb">${b.annualUsed}</td>
        <td class="b tc fw" style="color:${b.annualRemaining <= 3 ? "#dc2626" : "#059669"}">${b.annualRemaining}</td>
        <td class="b tc">${rate}%</td>
        <td class="b"></td>
      </tr>`;
    }).join("");

    const leaveDetailRows = (leaves as any[] || [])
      .filter((l: any) => l.status === "approved")
      .map((l: any) => `<tr>
        <td class="b">${l.employeeName}</td>
        <td class="b tc">${l.leaveType === "annual" ? "연차" : l.leaveType === "sick" ? "병가" : l.leaveType === "personal" ? "경조" : l.leaveType}</td>
        <td class="b tc">${safeDate(l.startDate)}</td>
        <td class="b tc">${safeDate(l.endDate)}</td>
        <td class="b tc fw">${l.days}일</td>
        <td class="b">${l.reason || ""}</td>
        <td class="b tc">${l.approvedByName || ""}</td>
      </tr>`).join("");

    const totalBalance = (leaveBalance as any[]);
    const totalGranted = totalBalance.reduce((s: number, b: any) => s + b.annualTotal, 0);
    const totalUsed = totalBalance.reduce((s: number, b: any) => s + b.annualUsed, 0);
    const totalRemaining = totalBalance.reduce((s: number, b: any) => s + b.annualRemaining, 0);

    pw.document.write(`<html><head><title>연차관리대장 ${year}년</title>
    <style>
      body{font-family:'Malgun Gothic',sans-serif;font-size:11px;padding:20px;max-width:210mm}
      h1{text-align:center;font-size:18px;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:4px}
      .sub{text-align:center;font-size:11px;color:#666;margin-bottom:16px}
      table{width:100%;border-collapse:collapse;margin-bottom:16px}
      .b{border:1px solid #999;padding:4px 6px}
      .tc{text-align:center}
      .fw{font-weight:bold}
      .bg{background:#f3f4f6}
      .sig td{height:40px}
      h3{font-size:13px;margin:16px 0 8px;border-left:4px solid #2563eb;padding-left:8px}
      @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;margin:0;padding:10px}}
    </style></head><body>
    <h1>연차관리대장</h1>
    <p class="sub">${year}년 | HACCP-ONE</p>

    <table><tr>
      <td class="b bg fw" width="20%">대상기간</td><td class="b">${year}년 1월 ~ 12월</td>
      <td class="b bg fw" width="20%">대상인원</td><td class="b">${totalBalance.length}명</td>
    </tr><tr>
      <td class="b bg fw">총 부여</td><td class="b">${totalGranted}일</td>
      <td class="b bg fw">총 사용 / 잔여</td><td class="b">${totalUsed}일 / ${totalRemaining}일</td>
    </tr></table>

    <h3>1. 직원별 연차 현황</h3>
    <table>
      <tr class="bg"><th class="b">성명</th><th class="b">직급</th><th class="b">부여(일)</th><th class="b">사용(일)</th><th class="b">잔여(일)</th><th class="b">소진율</th><th class="b" width="80">비고</th></tr>
      ${balanceRows}
      <tr class="bg fw"><td class="b" colspan="2" style="text-align:right">합계</td><td class="b tc">${totalGranted}</td><td class="b tc">${totalUsed}</td><td class="b tc">${totalRemaining}</td><td class="b" colspan="2"></td></tr>
    </table>

    <h3>2. 승인된 휴가 상세 내역</h3>
    <table>
      <tr class="bg"><th class="b">신청자</th><th class="b">유형</th><th class="b">시작일</th><th class="b">종료일</th><th class="b">일수</th><th class="b">사유</th><th class="b">승인자</th></tr>
      ${leaveDetailRows || '<tr><td class="b" colspan="7" style="text-align:center;color:#999">승인된 휴가가 없습니다</td></tr>'}
    </table>

    <h3>3. 확인</h3>
    <table><tr class="bg"><th class="b" width="25%">구분</th><th class="b" width="25%">작성자</th><th class="b" width="25%">검토자</th><th class="b" width="25%">승인자</th></tr>
    <tr class="sig"><td class="b bg fw">서명</td><td class="b"></td><td class="b"></td><td class="b"></td></tr>
    <tr><td class="b bg fw">일자</td><td class="b"></td><td class="b"></td><td class="b"></td></tr></table>

    <p style="text-align:center;font-size:9px;color:#999;margin-top:16px">
      본 기록은 근로기준법에 따라 3년간 보관합니다. | HACCP-ONE 자동생성
    </p>
    <script>window.onload=function(){setTimeout(function(){window.print()},800)}</script>
    </body></html>`);
    pw.document.close();
  };

  // 휴가 승인/반려/삭제
  const approveMut = trpc.hr.approveLeave.useMutation({
    onSuccess: (r: any) => { toast.success(r.message); refetchLeaves(); refetchBalance(); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteLeaveMut = trpc.hr.deleteLeave.useMutation({
    onSuccess: (r: any) => { toast.success(r.message); refetchLeaves(); refetchBalance(); },
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

            <select value={selectedEmployee || ""} onChange={(e) => setSelectedEmployee(e.target.value ? Number(e.target.value) : null)}
              className="h-8 text-xs border rounded px-2">
              <option value="">전체 직원</option>
              {employees.map((emp: any) => (
                <option key={emp.id} value={emp.id}>{emp.name}{emp.department ? ` (${emp.department})` : ""}{emp.position ? ` · ${emp.position}` : ""}</option>
              ))}
            </select>
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
            {isAdmin && <TabsTrigger value="matching" className="text-xs gap-1.5"><Users className="h-3.5 w-3.5" /> 구성원 매칭</TabsTrigger>}
          </TabsList>

          {/* 근태 탭 */}
          <TabsContent value="attendance">
            {/* 월간 요약 */}
            {attendance && (attendance as any[]).length > 0 && (() => {
              const att = attendance as any[];
              const totalDays = att.length;
              const totalHours = att.reduce((s: number, a: any) => s + (a.workHours || 0), 0);
              const overtimeHours = att.reduce((s: number, a: any) => s + Math.max(0, (a.workHours || 0) - 8), 0);
              const lateDays = att.filter((a: any) => a.status === "late").length;
              return (
                <div className="grid grid-cols-4 gap-2 mb-3">
                  <Card><CardContent className="p-2.5 text-center">
                    <p className="text-[10px] text-muted-foreground">출근일</p>
                    <p className="text-lg font-bold text-sky-700">{totalDays}<span className="text-xs">일</span></p>
                  </CardContent></Card>
                  <Card><CardContent className="p-2.5 text-center">
                    <p className="text-[10px] text-muted-foreground">총 근무</p>
                    <p className="text-lg font-bold text-blue-700">{totalHours.toFixed(1)}<span className="text-xs">h</span></p>
                  </CardContent></Card>
                  <Card><CardContent className="p-2.5 text-center">
                    <p className="text-[10px] text-muted-foreground">연장근로</p>
                    <p className="text-lg font-bold text-amber-700">{overtimeHours.toFixed(1)}<span className="text-xs">h</span></p>
                  </CardContent></Card>
                  <Card><CardContent className="p-2.5 text-center">
                    <p className="text-[10px] text-muted-foreground">지각</p>
                    <p className="text-lg font-bold text-red-600">{lateDays}<span className="text-xs">일</span></p>
                  </CardContent></Card>
                </div>
              );
            })()}
            <Card>
              <CardHeader className="py-3 px-4 border-b flex flex-row items-center justify-between">
                <CardTitle className="text-sm">
                  {year}년 {month}월 근태 현황
                  {selectedEmployee && employees.find((e: any) => e.id === selectedEmployee)
                    ? ` — ${employees.find((e: any) => e.id === selectedEmployee)?.name}`
                    : " — 전체"}
                </CardTitle>
                {isAdmin && (
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1"
                      onClick={() => setManualAttOpen(true)}>
                      <Plus className="h-3 w-3" /> 수기 등록
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1 border-amber-300 text-amber-700"
                      onClick={() => {
                        if (confirm(`오늘 퇴근 미기록 직원을 18:00 퇴근 자동 처리하시겠습니까?`))
                          closeDayMut.mutate({});
                      }}>
                      <Clock className="h-3 w-3" /> 일일 마감
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1 border-emerald-300 text-emerald-700"
                      onClick={() => {
                        const date = prompt("일괄 출근 처리할 날짜 (YYYY-MM-DD):", todayLocal());
                        if (!date) return;
                        const clockIn = prompt("출근 시간:", "09:00:00") || "09:00:00";
                        const clockOut = prompt("퇴근 시간 (빈칸=미퇴근):", "18:00:00");
                        if (!confirm(`${date} 전체 직원 일괄 출근 처리?\n출근: ${clockIn}\n퇴근: ${clockOut || "미처리"}`)) return;
                        employees.forEach((emp: any) => {
                          const userId = emp.userId || emp.id;
                          createAttMut.mutate({ employeeId: userId, workDate: date, clockIn, clockOut: clockOut || undefined, notes: "일괄등록" });
                        });
                      }}>
                      <Users className="h-3 w-3" /> 일괄 출근
                    </Button>
                  </div>
                )}
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
                                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500"
                                  onClick={() => {
                                    if (confirm(`${a.employeeName} ${safeDate(a.workDate)} 근태 삭제?`))
                                      deleteAttMut.mutate({ id: a.id });
                                  }} title="삭제">
                                  <Trash2 className="h-3 w-3" />
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

            {/* 수기 출퇴근 등록 다이얼로그 */}
            {manualAttOpen && (
              <Dialog open onOpenChange={() => setManualAttOpen(false)}>
                <DialogContent>
                  <DialogHeader><DialogTitle>출퇴근 수기 등록</DialogTitle></DialogHeader>
                  <ManualAttendanceForm
                    employees={employees}
                    onSubmit={(data) => createAttMut.mutate(data)}
                    isPending={createAttMut.isPending}
                  />
                </DialogContent>
              </Dialog>
            )}
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
                                    <div className="flex gap-1 justify-center">
                                      {l.status === "pending" && (
                                        <>
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
                                        </>
                                      )}
                                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-400"
                                        onClick={() => {
                                          if (confirm(`${l.employeeName} ${safeDate(l.startDate)} 휴가 삭제?`))
                                            deleteLeaveMut.mutate({ id: l.id });
                                        }} title="삭제">
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    </div>
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
            <div className="space-y-3">
              {/* 상단: 활성/비활성 토글 + 액션 버튼 */}
              <div className="flex items-center justify-between">
                <div className="flex gap-1">
                  <Button variant={empStatusTab === "active" ? "default" : "outline"} size="sm" className="h-7 text-xs"
                    onClick={() => setEmpStatusTab("active")}>활성 직원</Button>
                  <Button variant={empStatusTab === "inactive" ? "default" : "outline"} size="sm" className="h-7 text-xs"
                    onClick={() => setEmpStatusTab("inactive")}>비활성 (퇴사·휴직)</Button>
                </div>
                <div className="flex gap-2">
                  {isAdmin && empStatusTab === "active" && (
                    <>
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1 border-emerald-300 text-emerald-700"
                        onClick={() => setNewEmpOpen(true)}>
                        <Plus className="h-3 w-3" /> 비회원 직원등록
                      </Button>
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1"
                        onClick={() => { setManualLeaveOpen(true); setManualLeaveEmpId(null); }}>
                        <Plus className="h-3 w-3" /> 수기 연차등록
                      </Button>
                    </>
                  )}
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => handlePrintLeaveReport()}>
                    <Printer className="h-3 w-3" /> 연차관리대장 출력
                  </Button>
                </div>
              </div>

              {/* 활성 직원 연차 현황 */}
              {empStatusTab === "active" && (
                <Card>
                  <CardHeader className="py-2.5 px-4 border-b">
                    <CardTitle className="text-sm">{year}년 활성 직원 연차 현황</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {!leaveBalance?.length ? (
                      <div className="py-12 text-center text-muted-foreground">직원 데이터가 없습니다</div>
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
                            {isAdmin && <th className="p-2.5 text-center font-medium w-[140px]">관리</th>}
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
                                  {isAdmin && (
                                    <td className="p-2.5 text-center">
                                      <div className="flex gap-1 justify-center">
                                        <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5 text-blue-600"
                                          onClick={() => {
                                            const val = prompt(`${b.employeeName} 연차 부여일수 (현재: ${b.annualTotal}일)`, String(b.annualTotal));
                                            if (val !== null) setBalanceMut.mutate({ employeeId: b.employeeId, year, annualTotal: Number(val) || 0 });
                                          }}>연차수정</Button>
                                        <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5 text-amber-600"
                                          onClick={() => { setManualLeaveEmpId(b.employeeId); setManualLeaveOpen(true); }}>수기등록</Button>
                                        <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5 text-red-500"
                                          onClick={() => {
                                            const action = prompt(`${b.employeeName} 상태 변경:\n1: 퇴사\n2: 휴직\n번호 입력:`);
                                            if (action === "1") updateStatusMut.mutate({ employeeId: b.employeeId, status: "resigned" });
                                            else if (action === "2") updateStatusMut.mutate({ employeeId: b.employeeId, status: "on_leave" });
                                          }}>상태변경</Button>
                                      </div>
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot><tr className="bg-muted/30 border-t-2 font-bold">
                            <td colSpan={2} className="p-2.5 text-right">합계</td>
                            <td className="p-2.5 text-center">{(leaveBalance as any[]).reduce((s: number, b: any) => s + b.annualTotal, 0)}일</td>
                            <td className="p-2.5 text-center text-blue-700">{(leaveBalance as any[]).reduce((s: number, b: any) => s + b.annualUsed, 0)}일</td>
                            <td className="p-2.5 text-center text-emerald-700">{(leaveBalance as any[]).reduce((s: number, b: any) => s + b.annualRemaining, 0)}일</td>
                            <td colSpan={isAdmin ? 2 : 1}></td>
                          </tr></tfoot>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* 비활성 직원 (퇴사·휴직) */}
              {empStatusTab === "inactive" && (
                <Card>
                  <CardHeader className="py-2.5 px-4 border-b">
                    <CardTitle className="text-sm">비활성 직원 (퇴사·휴직) — 기록 보존</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {!inactiveEmployees?.length ? (
                      <div className="py-12 text-center text-muted-foreground">비활성 직원이 없습니다</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead><tr className="border-b bg-muted/30">
                            <th className="p-2.5 text-left font-medium">사번</th>
                            <th className="p-2.5 text-left font-medium">성명</th>
                            <th className="p-2.5 text-left font-medium">부서</th>
                            <th className="p-2.5 text-left font-medium">직급</th>
                            <th className="p-2.5 text-left font-medium">입사일</th>
                            {isAdmin && <th className="p-2.5 text-center font-medium w-[80px]">복원</th>}
                          </tr></thead>
                          <tbody>
                            {(inactiveEmployees as any[]).map((emp: any) => (
                              <tr key={emp.id} className="border-b hover:bg-accent/50 opacity-60">
                                <td className="p-2.5 font-mono">{emp.employeeCode}</td>
                                <td className="p-2.5 font-medium">{emp.name}</td>
                                <td className="p-2.5 text-muted-foreground">{emp.department || "-"}</td>
                                <td className="p-2.5 text-muted-foreground">{emp.position || "-"}</td>
                                <td className="p-2.5 font-mono">{emp.hireDate || "-"}</td>
                                {isAdmin && (
                                  <td className="p-2.5 text-center">
                                    <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-emerald-600"
                                      onClick={() => {
                                        if (confirm(`${emp.name}을(를) 활성으로 복원하시겠습니까?`))
                                          updateStatusMut.mutate({ employeeId: emp.id, status: "active" });
                                      }}>활성화</Button>
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
              )}

              {/* 수기 연차 등록 다이얼로그 */}
              {manualLeaveOpen && (
                <Dialog open onOpenChange={() => setManualLeaveOpen(false)}>
                  <DialogContent>
                    <DialogHeader><DialogTitle>수기 연차 등록</DialogTitle></DialogHeader>
                    <ManualLeaveForm
                      employees={employees}
                      preselectedId={manualLeaveEmpId}
                      onSubmit={(data) => manualLeaveMut.mutate(data)}
                      isPending={manualLeaveMut.isPending}
                    />
                  </DialogContent>
                </Dialog>
              )}

              {/* 비회원 직원 등록 다이얼로그 */}
              {newEmpOpen && (
                <Dialog open onOpenChange={() => setNewEmpOpen(false)}>
                  <DialogContent>
                    <DialogHeader><DialogTitle>비회원 직원 등록</DialogTitle></DialogHeader>
                    <NewEmployeeForm
                      departments={(deptList as any[]) || []}
                      positions={(posList as any[]) || []}
                      onSubmit={(data) => createEmpMut.mutate(data)}
                      isPending={createEmpMut.isPending}
                    />
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </TabsContent>

          {/* 구성원 매칭 탭 */}
          {isAdmin && (
            <TabsContent value="matching">
              <div className="space-y-3">
                {/* 미연결 유저 매칭 */}
                {unmatchedUsers && (unmatchedUsers as any[]).length > 0 && (
                  <Card className="border-blue-200">
                    <CardHeader className="py-2.5 px-4 border-b bg-blue-50">
                      <CardTitle className="text-xs text-blue-800">미연결 회원 → 구성원 매칭</CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 space-y-2">
                      <p className="text-[10px] text-muted-foreground">회원가입했지만 구성원에 연결되지 않은 유저입니다. 해당 직원을 선택해 매칭하세요.</p>
                      {(unmatchedUsers as any[]).map((u: any) => (
                        <div key={u.id} className="flex items-center justify-between bg-white border rounded-lg px-3 py-2">
                          <div>
                            <span className="text-xs font-medium">{u.name}</span>
                            <span className="text-[10px] text-muted-foreground ml-2">{u.email}</span>
                            <Badge variant="outline" className="ml-2 text-[9px]">{u.role}</Badge>
                          </div>
                          <select className="h-7 text-[10px] border rounded px-1 min-w-[120px]"
                            defaultValue=""
                            onChange={(e) => {
                              if (e.target.value) linkUserMut.mutate({ employeeId: Number(e.target.value), userId: u.id });
                            }}>
                            <option value="">구성원 선택</option>
                            {(matchingStatus as any[] || []).filter((m: any) => !m.isLinked).map((m: any) => (
                              <option key={m.empId} value={m.empId}>{m.empName} ({m.employeeCode})</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* 전체 매칭 현황 */}
                <Card>
                  <CardHeader className="py-2.5 px-4 border-b">
                    <CardTitle className="text-sm">전체 구성원 ↔ 회원 매칭 현황</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {!matchingStatus || !(matchingStatus as any[]).length ? (
                      <div className="py-12 text-center text-muted-foreground text-sm">구성원 데이터가 없습니다</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-[11px]">
                          <thead><tr className="border-b bg-muted/30">
                            <th className="p-2.5 text-left font-medium">사번</th>
                            <th className="p-2.5 text-left font-medium">구성원명</th>
                            <th className="p-2.5 text-left font-medium">부서</th>
                            <th className="p-2.5 text-left font-medium">직급</th>
                            <th className="p-2.5 text-center font-medium">매칭</th>
                            <th className="p-2.5 text-left font-medium">연결 계정</th>
                            <th className="p-2.5 text-left font-medium">이메일</th>
                          </tr></thead>
                          <tbody>
                            {(matchingStatus as any[]).map((m: any) => (
                              <tr key={m.empId} className={`border-b hover:bg-accent/50 ${m.isLinked ? "" : "bg-amber-50/30"}`}>
                                <td className="p-2.5 font-mono text-muted-foreground">{m.employeeCode}</td>
                                <td className="p-2.5 font-medium">{m.empName}</td>
                                <td className="p-2.5 text-muted-foreground">{m.department || "-"}</td>
                                <td className="p-2.5 text-muted-foreground">{m.position || "-"}</td>
                                <td className="p-2.5 text-center">
                                  {m.isLinked ? (
                                    <Badge className="bg-emerald-100 text-emerald-700 text-[9px]">연결됨</Badge>
                                  ) : (
                                    <Badge className="bg-amber-100 text-amber-700 text-[9px]">미연결</Badge>
                                  )}
                                </td>
                                <td className="p-2.5">{m.userName || <span className="text-gray-300">-</span>}</td>
                                <td className="p-2.5 text-muted-foreground text-[10px]">{m.userEmail || "-"}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot><tr className="bg-muted/30 border-t-2 font-bold text-[10px]">
                            <td colSpan={4} className="p-2.5 text-right">총 {(matchingStatus as any[]).length}명</td>
                            <td className="p-2.5 text-center">
                              연결 {(matchingStatus as any[]).filter((m: any) => m.isLinked).length} /
                              미연결 {(matchingStatus as any[]).filter((m: any) => !m.isLinked).length}
                            </td>
                            <td colSpan={2}></td>
                          </tr></tfoot>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          )}
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

/* ═══════════════════════════════════════════
   수기 연차 등록 폼 (관리자 → 미가입 직원용)
   ═══════════════════════════════════════════ */
/* ═══════════════════════════════════════════
   비회원 직원 등록 폼
   ═══════════════════════════════════════════ */
/* ═══════════════════════════════════════════
   출퇴근 수기 등록 폼 (관리자)
   ═══════════════════════════════════════════ */
function ManualAttendanceForm({ employees, onSubmit, isPending }: {
  employees: any[]; onSubmit: (data: any) => void; isPending: boolean;
}) {
  const [empId, setEmpId] = useState<number | null>(null);
  const [workDate, setWorkDate] = useState(todayLocal());
  const [clockIn, setClockIn] = useState("09:00:00");
  const [clockOut, setClockOut] = useState("18:00:00");
  const [notes, setNotes] = useState("");

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">인터넷 미사용/누락 직원의 출퇴근을 수기 등록합니다.</p>
      <div>
        <Label className="text-xs">직원 *</Label>
        <select className="w-full h-9 border rounded-lg px-2 text-sm"
          value={empId?.toString() || ""} onChange={(e) => setEmpId(Number(e.target.value) || null)}>
          <option value="">직원 선택</option>
          {employees.map((emp: any) => (
            <option key={emp.id} value={emp.userId || emp.id}>{emp.name} {emp.position ? `(${emp.position})` : ""}</option>
          ))}
        </select>
      </div>
      <div>
        <Label className="text-xs">날짜 *</Label>
        <Input type="date" value={workDate} onChange={(e: any) => setWorkDate(e.target.value)} className="h-9 text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">출근 시간 *</Label>
          <Input type="time" step="1" value={clockIn} onChange={(e: any) => setClockIn(e.target.value)} className="h-9 text-sm" />
        </div>
        <div>
          <Label className="text-xs">퇴근 시간</Label>
          <Input type="time" step="1" value={clockOut} onChange={(e: any) => setClockOut(e.target.value)} className="h-9 text-sm" />
        </div>
      </div>
      <div>
        <Label className="text-xs">비고</Label>
        <Input value={notes} onChange={(e: any) => setNotes(e.target.value)} placeholder="수기 등록 사유" className="h-9 text-sm" />
      </div>
      <Button className="w-full" disabled={isPending || !empId || !workDate || !clockIn}
        onClick={() => onSubmit({ employeeId: empId!, workDate, clockIn, clockOut: clockOut || undefined, notes: notes || undefined })}>
        {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        출퇴근 등록
      </Button>
    </div>
  );
}

function NewEmployeeForm({ departments, positions, onSubmit, isPending }: {
  departments: any[]; positions: any[];
  onSubmit: (data: any) => void; isPending: boolean;
}) {
  const [name, setName] = useState("");
  const [deptId, setDeptId] = useState<number | undefined>();
  const [posId, setPosId] = useState<number | undefined>();
  const [hireDate, setHireDate] = useState("");

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">회원가입 없이 직원을 등록합니다. 사번이 자동 생성됩니다.</p>
      <div>
        <Label className="text-xs">이름 *</Label>
        <Input value={name} onChange={(e: any) => setName(e.target.value)} placeholder="홍길동" className="h-9 text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">부서</Label>
          <select className="w-full h-9 border rounded-lg px-2 text-sm"
            value={deptId || ""} onChange={(e) => setDeptId(Number(e.target.value) || undefined)}>
            <option value="">선택 안함</option>
            {departments.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-xs">직급</Label>
          <select className="w-full h-9 border rounded-lg px-2 text-sm"
            value={posId || ""} onChange={(e) => setPosId(Number(e.target.value) || undefined)}>
            <option value="">선택 안함</option>
            {positions.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>
      <div>
        <Label className="text-xs">입사일</Label>
        <Input type="date" value={hireDate} onChange={(e: any) => setHireDate(e.target.value)} className="h-9 text-sm" />
      </div>
      <Button className="w-full" disabled={isPending || !name.trim()}
        onClick={() => onSubmit({ name: name.trim(), departmentId: deptId, positionId: posId, hireDate: hireDate || undefined })}>
        {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        직원 등록
      </Button>
    </div>
  );
}

function ManualLeaveForm({ employees, preselectedId, onSubmit, isPending }: {
  employees: any[]; preselectedId: number | null;
  onSubmit: (data: any) => void; isPending: boolean;
}) {
  const [empId, setEmpId] = useState<number | null>(preselectedId);
  const [leaveType, setLeaveType] = useState("annual");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");

  const days = startDate && endDate
    ? Math.max(1, Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000*60*60*24)) + 1)
    : 0;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">회원가입 안 된 직원 등 수기로 연차를 등록합니다. 자동 승인 처리됩니다.</p>
      <div>
        <Label className="text-xs">직원 선택 *</Label>
        <select className="w-full h-9 border rounded-lg px-2 text-sm"
          value={empId?.toString() || ""} onChange={(e) => setEmpId(Number(e.target.value) || null)}>
          <option value="">직원 선택</option>
          {employees.map((emp: any) => (
            <option key={emp.id} value={emp.id}>{emp.name} {emp.position ? `(${emp.position})` : ""}</option>
          ))}
        </select>
      </div>
      <div>
        <Label className="text-xs">유형</Label>
        <select className="w-full h-9 border rounded-lg px-2 text-sm" value={leaveType}
          onChange={(e) => setLeaveType(e.target.value)}>
          <option value="annual">연차</option>
          <option value="sick">병가</option>
          <option value="personal">경조</option>
          <option value="other">기타</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">시작일 *</Label>
          <Input type="date" value={startDate} onChange={(e: any) => setStartDate(e.target.value)} className="h-9 text-sm" />
        </div>
        <div>
          <Label className="text-xs">종료일 *</Label>
          <Input type="date" value={endDate} onChange={(e: any) => setEndDate(e.target.value)} className="h-9 text-sm" />
        </div>
      </div>
      {days > 0 && <p className="text-xs text-blue-600 font-bold">→ {days}일</p>}
      <div>
        <Label className="text-xs">사유 *</Label>
        <Input value={reason} onChange={(e: any) => setReason(e.target.value)} placeholder="연차 사유" className="h-9 text-sm" />
      </div>
      <Button className="w-full" disabled={isPending || !empId || !startDate || !endDate || !reason.trim()}
        onClick={() => onSubmit({ employeeId: empId!, leaveType, startDate, endDate, days, reason })}>
        {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        수기 등록 (자동 승인)
      </Button>
    </div>
  );
}

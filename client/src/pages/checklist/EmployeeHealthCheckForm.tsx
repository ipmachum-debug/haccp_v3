import { useState, useRef, useCallback, useEffect, useMemo, Fragment } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { todayLocal } from "../../lib/dateUtils";

import {
  ArrowLeft,
  Save,
  Send,
  Printer,
  Settings,
  Plus,
  Trash2,
  Edit,
  CheckCircle2,
  Loader2,
  User,
} from "lucide-react";

// 질문 항목 타입
interface HealthQuestion {
  id: string;
  text: string;
  boldText?: string;
}

// 종사자 행 데이터
interface EmployeeRow {
  name: string;
  answers: Record<string, "O" | "X" | "">;
}

// 결재 정보
interface ApprovalInfo {
  writerId: number | null;
  writerName: string;
  reviewerId: number | null;
  reviewerName: string;
  approverId: number | null;
  approverName: string;
  writerApproved: boolean;
  reviewerApproved: boolean;
  approverApproved: boolean;
  writerDate?: string;
  reviewerDate?: string;
  approverDate?: string;
}

// 기본 건강 질문 항목 (PDF 양식 기준)
const DEFAULT_QUESTIONS: HealthQuestion[] = [
  { id: "q1", text: "현재 또는 2주 이내에 설사를 한 적이 있습니까?", boldText: "현재 또는 2주" },
  { id: "q2", text: "기침 또는 발열(37.5°C 이상) 증상이 있습니까?", boldText: "기침 또는 발열(37.5°C 이상)" },
  { id: "q3", text: "복통이 있거나 구토를 합니까?", boldText: "복통" },
  { id: "q4", text: "눈, 귀 또는 코에서 진물이나 고름이 나옵니까?", boldText: "눈, 귀 또는 코" },
  { id: "q5", text: "피부감염(화상, 화농성질환 또는 상처 등)이 있습니까?", boldText: "피부감염" },
];

export default function EmployeeHealthCheckForm() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const navigate = (path: string) => setLocation(path);
  const { toast } = useToast();
  const { user } = useAuth();
  const isEdit = params.id !== undefined && params.id !== "new";
  const printRef = useRef<HTMLDivElement>(null);

  // 헤더 정보
  const [checkDate, setCheckDate] = useState(todayLocal());

  // 결재 정보
  const [approval, setApproval] = useState<ApprovalInfo>({
    writerId: null,
    writerName: "",
    reviewerId: null,
    reviewerName: "",
    approverId: null,
    approverName: "",
    writerApproved: false,
    reviewerApproved: false,
    approverApproved: false,
  });

  const [approvalStatus, setApprovalStatus] = useState<"draft" | "submitted" | "approved" | "rejected">("draft");

  // 질문 항목 (커스터마이징 가능)
  const [questions, setQuestions] = useState<HealthQuestion[]>(DEFAULT_QUESTIONS);

  // 종사자 행 데이터
  const [employeeRows, setEmployeeRows] = useState<EmployeeRow[]>(
    Array.from({ length: 13 }, () => ({ name: "", answers: {} }))
  );

  // 하단 특이사항
  const [specialNotes, setSpecialNotes] = useState("");
  const [actionBy, setActionBy] = useState("");

  // 설정 모달
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<HealthQuestion | null>(null);
  const [newQuestionText, setNewQuestionText] = useState("");

  // 저장 중 상태
  const [isSaving, setIsSaving] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);

  // ============================================================================
  // API 쿼리
  // ============================================================================

  // 구성원 목록
  const { data: employees } = trpc.organization.employees.list.useQuery();
  const activeEmployees = useMemo(() => (employees || []).filter((e: any) => e.isActive === 1), [employees]);

  // 문서 결재자 설정 (조직/책임관리에서 설정된 담당자)
  const { data: approvalSetting } = trpc.organization.approvalSettings.getByType.useQuery(
    { documentType: "employee_health_check" },
    { retry: false }
  );

  // 기존 데이터 로드 (편집 모드)
  const { data: existingRecord } = trpc.genericChecklist.getById.useQuery(
    { id: Number(params.id) },
    { enabled: isEdit && !!params.id && params.id !== "new" }
  );

  // DB 저장 mutations
  const [savedRecordId, setSavedRecordId] = useState<number | null>(
    isEdit ? Number(params.id) : null
  );

  const gcSaveMutation = trpc.genericChecklist.create.useMutation({
    onSuccess: (result: any) => { setSavedRecordId(result.id); },
  });
  const gcUpdateMutation = trpc.genericChecklist.update.useMutation({});

  // 승인 요청 mutation (submitForReview 사용)
  const submitForReviewMutation = trpc.genericChecklist.submitForReview.useMutation({
    onSuccess: () => {
      setApprovalStatus("submitted");
      toast({ title: "승인 요청 완료", description: "검토자에게 승인 요청이 전송되었습니다." });
    },
    onError: (error: { message: string }) => {
      toast({ title: "승인 요청 실패", description: error.message, variant: "destructive" });
    },
  });

  // ============================================================================
  // 조직/책임관리 기반 담당자 자동 설정
  // ============================================================================
  useEffect(() => {
    if (approvalSetting && activeEmployees.length > 0 && !dataLoaded) {
      const setting = approvalSetting as any;
      
      // 작성자 설정
      if (setting.authorEmployeeId) {
        const author = activeEmployees.find((e: any) => e.id === setting.authorEmployeeId);
        if (author) {
          setApproval(prev => ({
            ...prev,
            writerId: author.id,
            writerName: author.name,
          }));
        }
      }
      
      // 검토자 설정
      if (setting.reviewerEmployeeId) {
        const reviewer = activeEmployees.find((e: any) => e.id === setting.reviewerEmployeeId);
        if (reviewer) {
          setApproval(prev => ({
            ...prev,
            reviewerId: reviewer.id,
            reviewerName: reviewer.name,
          }));
        }
      }
      
      // 승인자 설정
      if (setting.approverEmployeeId) {
        const approver = activeEmployees.find((e: any) => e.id === setting.approverEmployeeId);
        if (approver) {
          setApproval(prev => ({
            ...prev,
            approverId: approver.id,
            approverName: approver.name,
          }));
        }
      }
    }
  }, [approvalSetting, activeEmployees, dataLoaded]);

  // 조직/책임관리 설정이 없을 때 기본값 (현재 로그인 사용자 + approvalRole 기반)
  useEffect(() => {
    if (!approvalSetting && activeEmployees.length > 0 && user && !dataLoaded) {
      // 작성자: 현재 로그인 사용자
      if (!approval.writerName) {
        setApproval(prev => ({ ...prev, writerName: user.name || "" }));
      }
      // 검토자: approvalRole이 reviewer인 직원
      const reviewer = activeEmployees.find((e: any) => e.approvalRole === "reviewer");
      if (reviewer && !approval.reviewerName) {
        setApproval(prev => ({ ...prev, reviewerId: reviewer.id, reviewerName: reviewer.name }));
      }
      // 승인자: approvalRole이 approver인 직원
      const approver = activeEmployees.find((e: any) => e.approvalRole === "approver");
      if (approver && !approval.approverName) {
        setApproval(prev => ({ ...prev, approverId: approver.id, approverName: approver.name }));
      }
    }
  }, [approvalSetting, activeEmployees, user, dataLoaded]);

  // ============================================================================
  // 기존 데이터 복원 (편집 모드)
  // ============================================================================
  useEffect(() => {
    if (existingRecord && existingRecord.formData && !dataLoaded) {
      const fd = existingRecord.formData as any;
      try {
        if (fd.checkDate) setCheckDate(fd.checkDate);
        if (fd.questions && Array.isArray(fd.questions)) setQuestions(fd.questions);
        if (fd.employeeRows && Array.isArray(fd.employeeRows)) setEmployeeRows(fd.employeeRows);
        if (fd.specialNotes !== undefined) setSpecialNotes(fd.specialNotes);
        if (fd.actionBy !== undefined) setActionBy(fd.actionBy);
        if (fd.approval) {
          setApproval(prev => ({ ...prev, ...fd.approval }));
        }
        if (existingRecord.status) {
          setApprovalStatus(existingRecord.status as any);
        }
        setDataLoaded(true);
      } catch (e) {
        console.error("데이터 복원 오류:", e);
      }
    }
  }, [existingRecord, dataLoaded]);

  // ============================================================================
  // 이벤트 핸들러
  // ============================================================================

  // 종사자 이름 변경
  const handleNameChange = useCallback((index: number, name: string) => {
    setEmployeeRows(prev => {
      const newRows = [...prev];
      newRows[index] = { ...newRows[index], name };
      return newRows;
    });
  }, []);

  // 종사자 행 추가
  const addEmployeeRow = useCallback(() => {
    setEmployeeRows(prev => [...prev, { name: "", answers: {} }]);
  }, []);

  // 종사자 행 삭제
  const removeEmployeeRow = useCallback((index: number) => {
    setEmployeeRows(prev => prev.filter((_, i) => i !== index));
  }, []);

  // 일괄 X 처리 (전원 정상)
  const setAllNormal = useCallback(() => {
    setEmployeeRows(prev =>
      prev.map(row => {
        const answers: Record<string, "O" | "X" | ""> = {};
        questions.forEach(q => { answers[q.id] = "X"; });
        return { ...row, answers };
      })
    );
    toast({ title: "일괄 정상 처리", description: "모든 종사자의 건강 질문이 X(해당없음)로 처리되었습니다." });
  }, [questions, toast]);

  // 질문 추가
  const addQuestion = useCallback(() => {
    if (!newQuestionText.trim()) return;
    const newId = `custom_${Date.now()}`;
    setQuestions(prev => [...prev, { id: newId, text: newQuestionText }]);
    setNewQuestionText("");
  }, [newQuestionText]);

  // 질문 삭제
  const removeQuestion = useCallback((id: string) => {
    setQuestions(prev => prev.filter(q => q.id !== id));
  }, []);

  // 질문 수정
  const updateQuestion = useCallback(() => {
    if (!editingQuestion) return;
    setQuestions(prev => prev.map(q => q.id === editingQuestion.id ? editingQuestion : q));
    setEditingQuestion(null);
  }, [editingQuestion]);

  // ============================================================================
  // 저장
  // ============================================================================
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const today = todayLocal();
      
      // 전체 폼 데이터를 formData에 저장
      const formData = {
        checkDate,
        questions,
        employeeRows,
        specialNotes,
        actionBy,
        approval: {
          writerId: approval.writerId,
          writerName: approval.writerName,
          reviewerId: approval.reviewerId,
          reviewerName: approval.reviewerName,
          approverId: approval.approverId,
          approverName: approval.approverName,
          writerApproved: true,
          reviewerApproved: approval.reviewerApproved,
          approverApproved: approval.approverApproved,
          writerDate: new Date().toLocaleDateString("ko-KR"),
          reviewerDate: approval.reviewerDate,
          approverDate: approval.approverDate,
        },
      };

      if (savedRecordId) {
        await gcUpdateMutation.mutateAsync({
          id: savedRecordId,
          formDate: checkDate,
          title: `종사자 건강상태 확인 일지 - ${checkDate}`,
          formData,
          status: approvalStatus === "draft" ? "draft" : approvalStatus,
        });
      } else {
        const r = await gcSaveMutation.mutateAsync({
          formType: "employee_health_check",
          formDate: checkDate,
          title: `종사자 건강상태 확인 일지 - ${checkDate}`,
          formData,
          status: "draft",
        });
        if (r.id) setSavedRecordId(r.id);
      }

      // 결재란 작성자 승인 처리
      setApproval(prev => ({
        ...prev,
        writerApproved: true,
        writerDate: new Date().toLocaleDateString("ko-KR"),
      }));

      const filledRows = employeeRows.filter(row => row.name.trim());
      toast({
        title: "저장 완료",
        description: `종사자 건강상태 확인 일지가 저장되었습니다. (종사자 ${filledRows.length}명)`,
      });
    } catch (error: any) {
      toast({ title: "저장 실패", description: error.message || "알 수 없는 오류가 발생했습니다.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  // ============================================================================
  // 승인 요청
  // ============================================================================
  const handleApprovalRequest = async () => {
    if (!savedRecordId) {
      toast({ title: "저장 필요", description: "먼저 점검표를 저장해주세요.", variant: "destructive" });
      return;
    }
    try {
      await submitForReviewMutation.mutateAsync({
        id: savedRecordId,
        requestType: "employee_health_check",
        title: `종사자 건강상태 확인 일지 - ${checkDate}`,
        description: `작성일: ${checkDate}, 작성자: ${approval.writerName}, 점검인원: ${employeeRows.filter(r => r.name.trim()).length}명`,
      });
    } catch {}
  };

  // 인쇄
  const handlePrint = () => { window.print(); };

  // 작성자 변경 핸들러 (직인란 연동)
  const handleWriterChange = (name: string, employeeId?: number) => {
    setApproval(prev => ({
      ...prev,
      writerId: employeeId || null,
      writerName: name,
    }));
  };

  // ============================================================================
  // 체크 셀 렌더링
  // ============================================================================
  const renderAnswerCell = (value: "O" | "X" | "", rowIndex: number, questionId: string, type: "O" | "X") => {
    const isChecked = value === type;
    return (
      <td
        className="border border-gray-300 p-0.5 text-center cursor-pointer hover:bg-blue-50 transition-colors select-none print:cursor-default print:hover:bg-transparent w-8"
        onClick={() => {
          setEmployeeRows(prev => {
            const newRows = [...prev];
            const current = newRows[rowIndex].answers[questionId] || "";
            newRows[rowIndex] = {
              ...newRows[rowIndex],
              answers: { ...newRows[rowIndex].answers, [questionId]: current === type ? "" : type },
            };
            return newRows;
          });
        }}
        title={`${type} 선택`}
      >
        <div className={`w-4 h-4 border rounded mx-auto flex items-center justify-center ${
          isChecked ? "bg-blue-500 border-blue-500 text-white" : "border-gray-300"
        } print:bg-transparent print:border-gray-400`}>
          {isChecked && <span className="text-[10px] font-bold print:text-black">✓</span>}
        </div>
      </td>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* 상단 액션 바 - 인쇄 시 숨김 */}
        <div className="flex items-center justify-between mb-4 print:hidden">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => setLocation("/employee-health-check")}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              목록
            </Button>
            <h1 className="text-xl font-bold">종사자 건강상태 확인 일지</h1>
            {approvalStatus === "submitted" && <Badge variant="outline" className="text-yellow-600 border-yellow-400">승인 대기중</Badge>}
            {approvalStatus === "approved" && <Badge variant="default" className="bg-green-600">승인 완료</Badge>}
            {approvalStatus === "rejected" && <Badge variant="destructive">반려</Badge>}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={setAllNormal}>
              <CheckCircle2 className="h-4 w-4 mr-1" />
              일괄 정상(X)
            </Button>
            <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Settings className="h-4 w-4 mr-1" />
                  설정
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>건강 질문 항목 관리</DialogTitle>
                  <DialogDescription>회사에 맞게 건강 질문을 추가, 수정, 삭제할 수 있습니다.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 max-h-[60vh] overflow-y-auto">
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">현재 질문 항목</Label>
                    {questions.map((q) => (
                      <div key={q.id} className="flex items-center gap-2 p-2 border rounded-lg">
                        {editingQuestion?.id === q.id ? (
                          <>
                            <Input
                              value={editingQuestion.text}
                              onChange={(e) => setEditingQuestion({ ...editingQuestion, text: e.target.value })}
                              className="flex-1 h-8 text-sm"
                            />
                            <Button size="sm" variant="default" onClick={updateQuestion} className="h-8 px-2">
                              <CheckCircle2 className="h-3 w-3" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <span className="flex-1 text-sm">{q.text}</span>
                            <Button size="sm" variant="ghost" onClick={() => setEditingQuestion({ ...q })} className="h-7 px-1">
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => removeQuestion(q.id)} className="h-7 px-1 text-red-500">
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="border-t pt-3 space-y-2">
                    <Label className="text-sm font-semibold">새 질문 추가</Label>
                    <div className="flex gap-2">
                      <Input
                        value={newQuestionText}
                        onChange={(e) => setNewQuestionText(e.target.value)}
                        placeholder="질문 내용"
                        className="flex-1 h-8 text-sm"
                      />
                      <Button size="sm" onClick={addQuestion} className="h-8">
                        <Plus className="h-3 w-3 mr-1" />
                        추가
                      </Button>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setSettingsOpen(false)}>닫기</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-1" />
              인쇄
            </Button>
            <Button variant="outline" size="sm" onClick={handleApprovalRequest} disabled={!savedRecordId || approvalStatus === "submitted" || approvalStatus === "approved"}>
              {submitForReviewMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
              승인 요청
            </Button>
            <Button size="sm" onClick={handleSave} disabled={isSaving} className="bg-blue-600 hover:bg-blue-700 text-white">
              {isSaving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
              저장
            </Button>
          </div>
        </div>

        {/* 인쇄 영역 */}
        <div ref={printRef} className="bg-white border rounded-lg shadow-sm print:border-none print:shadow-none print:rounded-none">
          {/* 결재란 */}
          <div className="flex justify-between items-start px-4 pt-4">
            <div className="flex-1"></div>
            <div>
              <table className="border-collapse text-xs">
                <tbody>
                  <tr>
                    <td className="border border-gray-400 px-3 py-0.5 text-center text-[10px] font-semibold bg-gray-50">작성</td>
                    <td className="border border-gray-400 px-3 py-0.5 text-center text-[10px] font-semibold bg-gray-50">검토</td>
                    <td className="border border-gray-400 px-3 py-0.5 text-center text-[10px] font-semibold bg-gray-50">승인</td>
                  </tr>
                  <tr>
                    {(["writer", "reviewer", "approver"] as const).map((role) => {
                      const nameKey = `${role}Name` as keyof ApprovalInfo;
                      const approvedKey = `${role}Approved` as keyof ApprovalInfo;
                      const dateKey = `${role}Date` as keyof ApprovalInfo;
                      const name = approval[nameKey] as string;
                      const approved = approval[approvedKey] as boolean;
                      const date = approval[dateKey] as string | undefined;
                      return (
                        <td key={role} className="border border-gray-400 p-1 text-center h-16 align-middle w-16">
                          {approved ? (
                            <div className="w-12 h-12 rounded-full border-2 border-red-500 flex flex-col items-center justify-center mx-auto">
                              <span className="text-red-500 font-bold text-[11px]">{name}</span>
                              {date && <span className="text-red-400 text-[8px]">{date}</span>}
                            </div>
                          ) : (
                            <div className="w-12 h-12 rounded-full border border-dashed border-gray-300 flex items-center justify-center mx-auto print:border-gray-400">
                              <span className="text-[10px] text-gray-400">{name || "-"}</span>
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                  <tr>
                    <td className="border border-gray-400 px-2 py-0.5 text-center text-[10px] text-gray-600">{approval.writerName || "-"}</td>
                    <td className="border border-gray-400 px-2 py-0.5 text-center text-[10px] text-gray-600">{approval.reviewerName || "-"}</td>
                    <td className="border border-gray-400 px-2 py-0.5 text-center text-[10px] text-gray-600">{approval.approverName || "-"}</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-400 px-2 py-0.5 text-center text-[10px] text-gray-400">작성자</td>
                    <td className="border border-gray-400 px-2 py-0.5 text-center text-[10px] text-gray-400">검토자</td>
                    <td className="border border-gray-400 px-2 py-0.5 text-center text-[10px] text-gray-400">승인자</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 제목 */}
          <div className="px-6 py-4 text-center">
            <h2 className="text-2xl font-bold tracking-wide">작업장 출입 전 종사자 건강상태 확인 일지</h2>
          </div>

          {/* 안내문구 (인쇄용) */}
          <div className="px-6 pb-2 text-xs text-gray-600 space-y-0.5">
            <p>★ 작업 시작 전 종사자 본인이 직접 아래 질문(1~{questions.length}번)에 대한 답변 작성</p>
            <p className="pl-4">→ 해당하는 경우 "O" / 해당하지 않는 경우 "X" 기재</p>
            <p>★ 작업 시작 전 팀장은 종사자가 작성한 내용 확인</p>
            <p className="pl-4">→ "O" 표시한 항목이 있는 경우, 팀장 확인 후 당일 작업 여부 결정</p>
          </div>

          {/* 헤더 정보 */}
          <div className="px-4 py-2">
            <table className="w-full border-collapse">
              <tbody>
                <tr>
                  <td className="border border-gray-300 bg-gray-50 px-3 py-2 text-sm font-semibold w-24 text-center">작성일자</td>
                  <td className="border border-gray-300 px-3 py-2 w-1/3">
                    <Input type="date" value={checkDate} onChange={(e) => setCheckDate(e.target.value)}
                      className="h-8 border-none shadow-none p-0 text-sm print:appearance-none" />
                  </td>
                  <td className="border border-gray-300 bg-gray-50 px-3 py-2 text-sm font-semibold w-24 text-center">작성자</td>
                  <td className="border border-gray-300 px-3 py-2">
                    <Select
                      value={approval.writerName || undefined}
                      onValueChange={(val) => {
                        const emp = activeEmployees.find((e: any) => e.name === val);
                        handleWriterChange(val, emp?.id);
                      }}
                    >
                      <SelectTrigger className="h-8 border-none shadow-none p-0 text-sm">
                        <SelectValue placeholder="작성자 선택">
                          {approval.writerName ? (
                            <div className="flex items-center gap-1.5">
                              <User className="h-3.5 w-3.5 text-muted-foreground" />
                              <span>{approval.writerName}</span>
                            </div>
                          ) : "작성자 선택"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {activeEmployees.map((emp: any) => (
                          <SelectItem key={emp.id} value={emp.name}>
                            <div className="flex items-center gap-2">
                              <User className="h-3.5 w-3.5 text-muted-foreground" />
                              <span>{emp.name}</span>
                              {emp.positionName && (
                                <span className="text-xs text-muted-foreground">({emp.positionName})</span>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 질문내용 라벨 */}
          <div className="px-4 py-1">
            <div className="text-center text-sm font-semibold text-gray-700">질문내용</div>
          </div>

          {/* 메인 테이블 */}
          <div className="px-4 py-2 overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="border border-gray-300 bg-gray-50 px-2 py-1 text-center font-semibold w-20" rowSpan={2}>
                    종사자명
                  </th>
                  {questions.map((q) => (
                    <th key={q.id} className="border border-gray-300 bg-gray-50 px-1 py-1 text-center font-normal min-w-[80px]" colSpan={2}>
                      <div className="text-[10px] leading-tight px-1">{q.text}</div>
                    </th>
                  ))}
                </tr>
                <tr>
                  {questions.map((q) => (
                    <Fragment key={q.id}>
                      <th className="border border-gray-300 bg-gray-50 px-1 py-0.5 text-center text-[10px] font-semibold w-8">O</th>
                      <th className="border border-gray-300 bg-gray-50 px-1 py-0.5 text-center text-[10px] font-semibold w-8">X</th>
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {employeeRows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="hover:bg-gray-50/50 print:hover:bg-transparent">
                    <td className="border border-gray-300 px-1 py-0.5">
                      <div className="flex items-center gap-0.5">
                        <Input
                          value={row.name}
                          onChange={(e) => handleNameChange(rowIndex, e.target.value)}
                          placeholder={`종사자 ${rowIndex + 1}`}
                          className="h-6 border-none shadow-none p-0 text-xs print:placeholder-transparent"
                        />
                        <button onClick={() => removeEmployeeRow(rowIndex)}
                          className="text-gray-300 hover:text-red-500 transition-colors print:hidden flex-shrink-0">
                          <Trash2 className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    </td>
                    {questions.map((q) => (
                      <Fragment key={q.id}>
                        {renderAnswerCell(row.answers[q.id] || "", rowIndex, q.id, "O")}
                        {renderAnswerCell(row.answers[q.id] || "", rowIndex, q.id, "X")}
                      </Fragment>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-2 print:hidden">
              <Button variant="outline" size="sm" onClick={addEmployeeRow} className="w-full border-dashed text-muted-foreground">
                <Plus className="h-3 w-3 mr-1" />
                종사자 행 추가
              </Button>
            </div>
          </div>

          {/* 하단 특이사항 */}
          <div className="px-4 py-2 pb-6">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="border border-gray-300 bg-gray-50 px-3 py-2 text-center font-semibold" style={{ width: "80%" }}>
                    특이사항 및 개선조치 내역
                  </th>
                  <th className="border border-gray-300 bg-gray-50 px-3 py-2 text-center font-semibold" style={{ width: "20%" }}>
                    조치자
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-gray-300 p-2 align-top">
                    <Textarea value={specialNotes} onChange={(e) => setSpecialNotes(e.target.value)}
                      placeholder="특이사항 및 개선조치 내역을 입력하세요"
                      className="min-h-[60px] border-none shadow-none p-0 text-sm resize-none print:placeholder-transparent" />
                  </td>
                  <td className="border border-gray-300 p-2 align-top">
                    <Input value={actionBy} onChange={(e) => setActionBy(e.target.value)} placeholder="조치자"
                      className="h-8 border-none shadow-none p-0 text-sm text-center print:placeholder-transparent" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* 안내 문구 */}
        <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200 text-sm text-blue-700 print:hidden">
          <p className="font-medium mb-1">사용 안내</p>
          <ul className="list-disc list-inside space-y-0.5 text-xs">
            <li>각 질문의 O/X 체크박스를 <strong>클릭</strong>하여 해당 여부를 선택합니다.</li>
            <li><strong>일괄 정상(X)</strong> 버튼을 누르면 모든 종사자의 질문이 X(해당없음)로 처리됩니다.</li>
            <li><strong>설정</strong> 버튼에서 건강 질문을 회사에 맞게 추가/수정/삭제할 수 있습니다.</li>
            <li><strong>인쇄</strong> 버튼으로 양식 그대로 PDF 출력이 가능합니다.</li>
            <li>작성자/검토자/승인자는 <strong>시스템관리 → 조직/책임관리</strong>에서 설정된 담당자로 자동 지정됩니다.</li>
          </ul>
        </div>
      </div>

      {/* 인쇄 전용 스타일 */}
      <style>{`
        @media print {
          nav, aside, header, footer,
          [data-sidebar], [role="navigation"],
          .sidebar, .dashboard-sidebar {
            display: none !important;
          }
          main, [role="main"], .main-content {
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
          }
          .container {
            margin: 0 !important;
            padding: 0 !important;
            max-width: 100% !important;
          }
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          input::placeholder, textarea::placeholder {
            color: transparent !important;
          }
          input, textarea {
            border: none !important;
            box-shadow: none !important;
            background: transparent !important;
          }
          .bg-gray-50 {
            background-color: #f9fafb !important;
          }
        }
      `}</style>
    </DashboardLayout>
  );
}

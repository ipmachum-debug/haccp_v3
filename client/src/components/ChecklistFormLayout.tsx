import { useState, useEffect, useRef, ReactNode } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Save,
  Send,
  Printer,
  Loader2,
  User,
  CheckCircle2,
} from "lucide-react";

// ============================================================================
// 공통 타입
// ============================================================================
export interface ApprovalInfo {
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

export interface ChecklistFormConfig {
  formType: string;           // genericChecklist formType (예: "employee_health_check")
  title: string;              // 페이지 제목 (예: "종사자 건강상태 확인 일지")
  listPath: string;           // 리스트 페이지 경로 (예: "/employee-health-check")
  documentTitle: string;      // 문서 출력 제목 (예: "작업장 출입 전 종사자 건강상태 확인 일지")
}

interface ChecklistFormLayoutProps {
  config: ChecklistFormConfig;
  // 각 폼에서 제공하는 formData 수집 함수
  collectFormData: () => any;
  // 기존 데이터 복원 함수
  onDataRestore?: (formData: any) => void;
  // 추가 액션 버튼 (일괄 정상, 설정 등)
  extraActions?: ReactNode;
  // 문서 양식 + 입력 폼 영역
  children: ReactNode;
}

// ============================================================================
// 공통 결재란 컴포넌트
// ============================================================================
function ApprovalStampTable({ approval }: { approval: ApprovalInfo }) {
  return (
    <table className="border-collapse text-xs">
      <tbody>
        <tr>
          <td className="border border-gray-400 px-3 py-0.5 text-center text-[10px] font-semibold bg-gray-50">작 성</td>
          <td className="border border-gray-400 px-3 py-0.5 text-center text-[10px] font-semibold bg-gray-50">검 토</td>
          <td className="border border-gray-400 px-3 py-0.5 text-center text-[10px] font-semibold bg-gray-50">승 인</td>
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
  );
}

// ============================================================================
// 공통 작성자 선택 컴포넌트
// ============================================================================
function WriterSelectField({
  approval,
  activeEmployees,
  onWriterChange,
  isAutoSet,
}: {
  approval: ApprovalInfo;
  activeEmployees: any[];
  onWriterChange: (name: string, employeeId?: number) => void;
  isAutoSet?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <Select
        value={approval.writerName}
        onValueChange={(val) => {
          const emp = activeEmployees.find((e: any) => e.name === val);
          onWriterChange(val, emp?.id);
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
      {isAutoSet && (
        <span className="text-xs text-green-600 flex items-center gap-0.5">
          <CheckCircle2 className="h-3 w-3" />
          자동설정
        </span>
      )}
    </div>
  );
}

// ============================================================================
// 메인 공통 레이아웃 컴포넌트
// ============================================================================
export default function ChecklistFormLayout({
  config,
  collectFormData,
  onDataRestore,
  extraActions,
  children,
}: ChecklistFormLayoutProps) {
  const params = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const isEdit = params.id !== undefined && params.id !== "new";
  const printRef = useRef<HTMLDivElement>(null);

  // ============================================================================
  // 결재 상태
  // ============================================================================
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
  const [isSaving, setIsSaving] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [approvalSettingApplied, setApprovalSettingApplied] = useState(false);
  const [formDate, setFormDate] = useState(new Date().toISOString().split("T")[0]);

  // ============================================================================
  // API 쿼리
  // ============================================================================

  // 구성원 목록
  const { data: employees } = trpc.organization.employees.list.useQuery();
  const activeEmployees = (employees || []).filter((e: any) => e.isActive === 1);

  // 문서 결재자 설정 (조직/책임관리에서 설정된 담당자)
  const { data: approvalSetting } = trpc.organization.approvalSettings.getByType.useQuery(
    { documentType: config.formType },
    { retry: false }
  );

  // 기존 데이터 로드 (편집 모드)
  const { data: existingRecord } = trpc.genericChecklist.getById.useQuery(
    { id: Number(params.id) },
    { enabled: isEdit && !!params.id && params.id !== "new" }
  );

  // 새 문서 작성 시 같은 formType의 최신 레코드 자동 복원
  const { data: latestByDate } = trpc.genericChecklist.getLatestByDate.useQuery(
    { formType: config.formType, formDate: formDate },
    { enabled: !isEdit && !!formDate }
  );

  // DB 저장 mutations
  const [savedRecordId, setSavedRecordId] = useState<number | null>(
    isEdit ? Number(params.id) : null
  );

  const gcSaveMutation = trpc.genericChecklist.create.useMutation({
    onSuccess: (result) => { setSavedRecordId(result.id); },
  });
  const gcUpdateMutation = trpc.genericChecklist.update.useMutation({});

  // 승인 요청 mutation
  const submitForReviewMutation = trpc.genericChecklist.submitForReview.useMutation({
    onSuccess: () => {
      setApprovalStatus("submitted");
      toast({ title: "승인 요청 완료", description: "검토자에게 승인 요청이 전송되었습니다." });
    },
    onError: (error: any) => {
      toast({ title: "승인 요청 실패", description: error.message, variant: "destructive" });
    },
  });

  // ============================================================================
  // 결재자 자동 매핑 - 대시보드 설정 기반 (최우선)
  // ============================================================================
  useEffect(() => {
    if (approvalSetting && activeEmployees.length > 0 && !approvalSettingApplied) {
      const setting = approvalSetting as any;
      const newApproval: Partial<ApprovalInfo> = {};

      // 작성자 자동 설정
      if (setting.authorEmployeeId) {
        const author = activeEmployees.find((e: any) => e.id === setting.authorEmployeeId);
        if (author) {
          newApproval.writerId = author.id;
          newApproval.writerName = author.name;
        }
      }

      // 검토자 자동 설정
      if (setting.reviewerEmployeeId) {
        const reviewer = activeEmployees.find((e: any) => e.id === setting.reviewerEmployeeId);
        if (reviewer) {
          newApproval.reviewerId = reviewer.id;
          newApproval.reviewerName = reviewer.name;
        }
      }

      // 승인자 자동 설정
      if (setting.approverEmployeeId) {
        const approver = activeEmployees.find((e: any) => e.id === setting.approverEmployeeId);
        if (approver) {
          newApproval.approverId = approver.id;
          newApproval.approverName = approver.name;
        }
      }

      if (Object.keys(newApproval).length > 0) {
        setApproval(prev => ({ ...prev, ...newApproval }));
        setApprovalSettingApplied(true);
      }
    }
  }, [approvalSetting, activeEmployees, approvalSettingApplied]);

  // 우선순위 2: approvalRole 기반 (직급관리) - 대시보드 설정이 없을 때만
  useEffect(() => {
    if (!approvalSetting && activeEmployees.length > 0 && !approvalSettingApplied) {
      const newApproval: Partial<ApprovalInfo> = {};

      // 검토자: approvalRole이 reviewer인 직원
      const reviewer = activeEmployees.find((e: any) => e.approvalRole === "reviewer");
      if (reviewer) {
        newApproval.reviewerId = reviewer.id;
        newApproval.reviewerName = reviewer.name;
      }
      // 승인자: approvalRole이 approver인 직원
      const approver = activeEmployees.find((e: any) => e.approvalRole === "approver");
      if (approver) {
        newApproval.approverId = approver.id;
        newApproval.approverName = approver.name;
      }

      if (Object.keys(newApproval).length > 0) {
        setApproval(prev => ({ ...prev, ...newApproval }));
        setApprovalSettingApplied(true);
      }
    }
  }, [approvalSetting, activeEmployees, approvalSettingApplied]);

  // ============================================================================
  // 기존 데이터 복원 (편집 모드) - 결재 설정 적용 후 실행
  // ============================================================================
  useEffect(() => {
    if (existingRecord && existingRecord.formData && !dataLoaded && approvalSettingApplied) {
      const fd = existingRecord.formData as any;
      try {
        // 공통 데이터 복원
        if (fd.formDate) setFormDate(fd.formDate);
        // 결재 정보: 저장된 데이터를 우선 사용하되, 대시보드 설정이 있으면 이름은 대시보드 기준 유지
        if (fd.approval) {
          setApproval(prev => ({
            ...prev,
            // 승인 상태는 저장된 데이터에서 복원
            writerApproved: fd.approval.writerApproved || false,
            reviewerApproved: fd.approval.reviewerApproved || false,
            approverApproved: fd.approval.approverApproved || false,
            writerDate: fd.approval.writerDate,
            reviewerDate: fd.approval.reviewerDate,
            approverDate: fd.approval.approverDate,
            // 이름은 대시보드 설정이 이미 적용되어 있으므로, 대시보드 설정이 없는 경우에만 저장된 데이터 사용
            ...((!approval.writerName && fd.approval.writerName) ? { writerId: fd.approval.writerId, writerName: fd.approval.writerName } : {}),
            ...((!approval.reviewerName && fd.approval.reviewerName) ? { reviewerId: fd.approval.reviewerId, reviewerName: fd.approval.reviewerName } : {}),
            ...((!approval.approverName && fd.approval.approverName) ? { approverId: fd.approval.approverId, approverName: fd.approval.approverName } : {}),
          }));
        }
        if (existingRecord.status) {
          setApprovalStatus(existingRecord.status as any);
        }
        // 각 폼 고유 데이터 복원
        if (onDataRestore) {
          onDataRestore(fd);
        }
        setDataLoaded(true);
      } catch (e) {
        console.error("데이터 복원 오류:", e);
      }
    }
  }, [existingRecord, dataLoaded, approvalSettingApplied]);

  // ============================================================================
  // 새 문서 작성 시 이전 작성 내용 자동 복원
  // ============================================================================
  useEffect(() => {
    if (!isEdit && latestByDate && latestByDate.formData && !dataLoaded && approvalSettingApplied) {
      const fd = latestByDate.formData as any;
      try {
        // 각 폼 고유 데이터 복원 (입력 필드 내용)
        if (onDataRestore) {
          onDataRestore(fd);
        }
        // 기존 레코드 ID를 savedRecordId에 설정하여 업데이트 모드로 전환
        setSavedRecordId(latestByDate.id);
        setDataLoaded(true);
        toast({ title: "이전 데이터 자동 불러오기", description: "가장 최근 작성된 데이터를 자동으로 불러왔습니다. 결재자는 대시보드 설정이 적용됩니다." });
      } catch (e) {
        console.error("기존 데이터 자동 복원 오류:", e);
      }
    }
  }, [latestByDate, dataLoaded, isEdit, approvalSettingApplied]);

  // 결재 설정이 없고 latestByDate도 없으면 dataLoaded를 true로 설정 (무한 대기 방지)
  useEffect(() => {
    if (!isEdit && !latestByDate && approvalSettingApplied && !dataLoaded) {
      // latestByDate 쿼리가 완료되었지만 데이터가 없는 경우
      const timer = setTimeout(() => {
        if (!dataLoaded) setDataLoaded(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isEdit, latestByDate, approvalSettingApplied, dataLoaded]);

  // ============================================================================
  // 작성자 변경 핸들러
  // ============================================================================
  const handleWriterChange = (name: string, employeeId?: number) => {
    setApproval(prev => ({
      ...prev,
      writerId: employeeId || null,
      writerName: name,
    }));
  };

  // ============================================================================
  // 저장
  // ============================================================================
  const handleSave = async () => {
    setIsSaving(true);
    try {
      // 각 폼에서 고유 데이터 수집
      const customData = collectFormData();
      
      // 전체 폼 데이터를 formData에 저장
      const formData = {
        ...customData,
        formDate,
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
          formDate,
          title: `${config.title} - ${formDate}`,
          formData,
          status: approvalStatus === "draft" ? "draft" : approvalStatus,
        });
      } else {
        const r = await gcSaveMutation.mutateAsync({
          formType: config.formType,
          formDate,
          title: `${config.title} - ${formDate}`,
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

      toast({
        title: "저장 완료",
        description: `${config.title}가 저장되었습니다.`,
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
        requestType: config.formType,
        title: `${config.title} - ${formDate}`,
        description: `작성일: ${formDate}, 작성자: ${approval.writerName}`,
      });
    } catch {}
  };

  // 인쇄
  const handlePrint = () => { window.print(); };

  // ============================================================================
  // 렌더링
  // ============================================================================
  return (
    <DashboardLayout>
      <div className="container mx-auto py-6 max-w-[1200px]">
        {/* 상단 액션 바 - 인쇄 시 숨김 */}
        <div className="flex items-center justify-between mb-4 print:hidden">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => setLocation(config.listPath)}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              목록
            </Button>
            <h1 className="text-xl font-bold">{config.title}</h1>
            {approvalStatus === "submitted" && <Badge variant="outline" className="text-yellow-600 border-yellow-400">승인 대기중</Badge>}
            {approvalStatus === "approved" && <Badge variant="default" className="bg-green-600">승인 완료</Badge>}
            {approvalStatus === "rejected" && <Badge variant="destructive">반려</Badge>}
          </div>
          <div className="flex items-center gap-2">
            {extraActions}
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
            <ApprovalStampTable approval={approval} />
          </div>

          {/* 작성자 선택 - 인쇄 시 숨김 */}
          <div className="px-6 pt-2 print:hidden">
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-600 whitespace-nowrap">
                <User className="h-3.5 w-3.5 inline mr-1" />
                작성자
              </label>
              <div className="w-64">
                <WriterSelectField
                  approval={approval}
                  activeEmployees={activeEmployees}
                  onWriterChange={handleWriterChange}
                  isAutoSet={approvalSettingApplied && !!approval.writerName}
                />
              </div>
            </div>
            {approvalSettingApplied && (
              <p className="text-xs text-gray-400 mt-1 ml-6">
                문서 결재 설정에서 자동 적용되었습니다. 변경이 필요하면 드롭다운에서 선택하세요.
              </p>
            )}
          </div>

          {/* 문서 제목 */}
          <div className="px-6 py-4 text-center">
            <h2 className="text-2xl font-bold tracking-wide">{config.documentTitle}</h2>
          </div>

          {/* 각 폼의 문서 양식 + 입력 폼 영역 */}
          {children}
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
      </div>
    </DashboardLayout>
  );
}

// ============================================================================
// Export 공통 컴포넌트들 (각 폼에서 사용)
// ============================================================================
export { ApprovalStampTable, WriterSelectField };
export type { ChecklistFormConfig };

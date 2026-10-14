import { useState, useEffect, useRef, useMemo, ReactNode } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
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
import { todayLocal } from "../../lib/dateUtils";
import { resolveRecordDate, stripPrefillDates } from "../../lib/checklistRecordDate";
import { sanitizeForPrefill, describePrefill, entryPolicyOf, type ClearedValue } from "../../lib/checklist/prefillPolicy";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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
  /**
   * 기록일로 쓸 양식 본문의 날짜 칸 이름 (collectFormData 결과의 키, 예: "checkDate").
   * 있으면 그 값이 DB form_date·목록 작성일·승인 제목이 된다. 없으면 머리의 "작성일" 칸을 쓴다. (2026-10-15)
   */
  dateField?: string;
  /** 자동 채움 예외 (일지 PR 2) — keep: 비우지 않을 칸 이름, clear: 추가로 비울 칸 이름 */
  prefill?: { keep?: readonly string[]; clear?: readonly string[] };
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
  // 문서 제목 (인쇄/PDF용)
  documentTitle?: string;
  // 작성자 필드명
  writerField?: string;
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
  documentTitle,
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
  const [formDate, setFormDate] = useState(todayLocal());

  // ============================================================================
  // API 쿼리
  // ============================================================================

  // 구성원 목록
  const employeesQ = trpc.organization.employees.list.useQuery();
  const employees = employeesQ.data;
  const activeEmployees = (employees || []).filter((e: any) => e.isActive === 1);

  // 문서 결재자 설정 (조직/책임관리에서 설정된 담당자)
  const approvalSettingQ = trpc.organization.approvalSettings.getByType.useQuery(
    { documentType: config.formType },
    { retry: false }
  );
  const approvalSetting = approvalSettingQ.data;
  // 결재 정보 조회가 끝났는가 (성공·실패 모두) — 이전에는 "결재자 자동 지정이 적용됐을 때만" 기록을 복원해
  // 결재 설정·역할이 없는 회사에서는 수정 화면이 비어 있을 수 있었다 (2026-10-15)
  const approvalReady = (approvalSettingQ.isFetched || approvalSettingQ.isError) && (employeesQ.isFetched || employeesQ.isError);
  const [approvalSettled, setApprovalSettled] = useState(false);

  // 기존 데이터 로드 (편집 모드)
  const { data: existingRecord } = trpc.genericChecklist.getById.useQuery(
    { id: Number(params.id) },
    { enabled: isEdit && !!params.id && params.id !== "new" }
  );

  // ── 새 문서 자동 채움 (일지 PR 2, 2026-10-15) ──────────────────────────────
  //  ?ref=none → 빈 양식 / ?ref=<id> → 그 기록 참고 / 없음 → 최근 기록 자동 선택
  //  조회 기준일은 화면을 연 날로 고정 (저장 후 날짜가 바뀌어도 다시 조회·덮어쓰기 하지 않음)
  const refParam = useMemo(() => {
    try { return new URLSearchParams(window.location.search).get("ref"); } catch { return null; }
  }, []);
  const [openedDate] = useState(() => todayLocal());
  const prefillQ = trpc.genericChecklist.prefillContext.useQuery(
    { formType: config.formType, formDate: openedDate, refId: refParam && /^\d+$/.test(refParam) ? Number(refParam) : undefined },
    { enabled: !isEdit, retry: 1, refetchOnWindowFocus: false, staleTime: Infinity },
  );
  type PrefillState =
    | { kind: "loading" } | { kind: "blank" } | { kind: "none" } | { kind: "error"; reason: string }
    | { kind: "applied"; refId: number; refDate: string; refStatus: string; message: string; cleared: ClearedValue[] }
    | { kind: "skipped"; refId: number; refDate: string };
  const [prefill, setPrefill] = useState<PrefillState>({ kind: "loading" });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [refPanelOpen, setRefPanelOpen] = useState(false);
  // 사용자가 이미 입력을 시작했는가 — 늦게 온 참고 기록이 입력을 덮지 않게
  const touchedRef = useRef(false);
  const markTouched = () => { touchedRef.current = true; };
  const entryPolicy = entryPolicyOf(config.formType);

  // DB 저장 mutations
  const [savedRecordId, setSavedRecordId] = useState<number | null>(
    isEdit ? Number(params.id) : null
  );

  const gcSaveMutation = trpc.genericChecklist.create.useMutation({
    onSuccess: (result: any) => { setSavedRecordId(result.id); },
  });
  const gcUpdateMutation = trpc.genericChecklist.update.useMutation({});
  const reopenMutation = trpc.genericChecklist.reopenForEdit.useMutation({});

  // 승인 요청 없는 '승인대기' (이전 오류로 생긴 기록) 알아보기 — 2026-10-15 상태 정책
  const approvalStateQ = trpc.genericChecklist.approvalState.useQuery(
    { id: savedRecordId ?? 0 },
    { enabled: !!savedRecordId && approvalStatus === "submitted", retry: 1 },
  );
  const orphanSubmitted = approvalStatus === "submitted" && !!approvalStateQ.data?.orphanSubmitted;

  // 승인 요청 mutation
  const submitForReviewMutation = trpc.genericChecklist.submitForReview.useMutation({
    onSuccess: (r: { recovered?: boolean; message?: string }) => {
      setApprovalStatus("submitted");
      approvalStateQ.refetch();
      toast({ title: r?.recovered ? "승인 요청 복구" : "승인 요청 완료", description: r?.message || "검토자에게 승인 요청이 전송되었습니다." });
    },
    onError: (error: { message: string }) => {
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
    if (existingRecord && existingRecord.formData && !dataLoaded && approvalSettled) {
      const fd = existingRecord.formData as any;
      try {
        // 공통 데이터 복원
        // 기록일은 DB form_date(목록·승인 제목과 같은 값)를 우선 — 본문 안 formDate 는 옛 값일 수 있다 (2026-10-15)
        const recDate = typeof (existingRecord as any).formDate === "string" ? String((existingRecord as any).formDate).slice(0, 10) : "";
        if (recDate) setFormDate(recDate); else if (fd.formDate) setFormDate(fd.formDate);
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
  }, [existingRecord, dataLoaded, approvalSettled]);

  // 결재 자동 지정 효과들이 먼저 돈 뒤 "정착" 표시 — 같은 커밋의 setApproval 과 함께 다음 렌더에 반영
  useEffect(() => {
    if (approvalReady && !approvalSettled) setApprovalSettled(true);
  }, [approvalReady, approvalSettled]);

  // ============================================================================
  // 새 문서 자동 채움 (일지 PR 2) — 조회가 "끝났을 때" 한 번만 판단 (이전: 1초 타이머·결재 설정 의존)
  //  - 참고 기록에서 장소·설비·항목·기준은 가져오고, 판정·측정값·체크·날짜·서명은 비운다 (prefillPolicy)
  //  - 이미 입력을 시작했으면 덮어쓰지 않고 "불러오기" 버튼만 보여 준다
  //  - 실패·부분 복원을 성공처럼 표시하지 않는다
  // ============================================================================
  const applyReference = (force: boolean) => {
    const ctx = prefillQ.data;
    const ref = ctx?.reference;
    if (!ref) return;
    if (!force && touchedRef.current) {
      setPrefill({ kind: "skipped", refId: ref.id, refDate: ref.formDate });
      return;
    }
    try {
      const base = stripPrefillDates({ ...(ref.formData as Record<string, unknown>) }, config.dateField);
      const result = sanitizeForPrefill(base, { recordDate: openedDate, keep: config.prefill?.keep, clear: config.prefill?.clear });
      if (onDataRestore) onDataRestore(result.data);
      setPrefill({
        kind: "applied", refId: ref.id, refDate: ref.formDate, refStatus: ref.status,
        message: describePrefill(result.counts), cleared: result.cleared,
      });
    } catch (e: any) {
      console.error("자동 채움 실패:", e);
      setPrefill({ kind: "error", reason: e?.message || "알 수 없는 오류" });
    }
  };

  useEffect(() => {
    if (isEdit || prefill.kind !== "loading") return;
    if (refParam === "none") { setPrefill({ kind: "blank" }); return; }
    if (prefillQ.isError) { setPrefill({ kind: "error", reason: prefillQ.error?.message || "조회 실패" }); return; }
    if (!prefillQ.isSuccess || !approvalSettled) return;
    if (prefillQ.data?.refNotFound) { setPrefill({ kind: "error", reason: `고른 기록 #${refParam} 을 찾을 수 없습니다 (다른 사업장이거나 삭제됨)` }); return; }
    if (!prefillQ.data?.reference) { setPrefill({ kind: "none" }); return; }
    applyReference(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, prefill.kind, prefillQ.isSuccess, prefillQ.isError, approvalSettled]);

  const goWithRef = (ref: string | null) => {
    const url = new URL(window.location.href);
    if (ref == null) url.searchParams.delete("ref"); else url.searchParams.set("ref", ref);
    // 양식 상태를 깨끗이 다시 만들기 위해 새로 연다 (참고 기록 원본은 바뀌지 않음)
    window.location.assign(url.pathname + url.search);
  };
  const todayRecords = (prefillQ.data?.todayRecords ?? []) as Array<{ id: number; status: string }>;

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
      // 기록일 = 양식의 날짜 칸(있으면) — 화면 날짜와 DB form_date 를 하나로 (2026-10-15)
      const recordDate = resolveRecordDate(customData, config.dateField, formDate);
      // 하루 한 장 일지: 같은 날 기록이 이미 있으면 새로 만들기 전에 한 번 묻는다 (이어쓰기 권장)
      if (!savedRecordId && entryPolicy === "single" && recordDate === openedDate && todayRecords.length > 0) {
        const ok = window.confirm(`${recordDate} 에 이미 작성한 ${config.title}이(가) 있습니다 (#${todayRecords.map((r) => r.id).join(", #")}).\n기존 기록을 이어 쓰려면 [취소] 후 '이어쓰기'를 누르세요.\n새 기록을 하나 더 만들까요?`);
        if (!ok) { setIsSaving(false); return; }
      }
      if (recordDate !== formDate) setFormDate(recordDate);

      // 이미 검토/승인 단계로 넘어간 문서를 수정하는 경우 → 재작성(재승인) 흐름
      //  · 검토/승인 직인 제거, 상태 draft 로 복귀, 연결된 승인요청 취소
      const wasNonDraft = !!savedRecordId && approvalStatus !== "draft";

      // 전체 폼 데이터를 formData에 저장
      const formData = {
        ...customData,
        formDate: recordDate,
        approval: {
          writerId: approval.writerId,
          writerName: approval.writerName,
          reviewerId: approval.reviewerId,
          reviewerName: approval.reviewerName,
          approverId: approval.approverId,
          approverName: approval.approverName,
          writerApproved: true,
          reviewerApproved: wasNonDraft ? false : approval.reviewerApproved,
          approverApproved: wasNonDraft ? false : approval.approverApproved,
          writerDate: new Date().toLocaleDateString("ko-KR"),
          reviewerDate: wasNonDraft ? undefined : approval.reviewerDate,
          approverDate: wasNonDraft ? undefined : approval.approverDate,
        },
      };

      if (savedRecordId) {
        await gcUpdateMutation.mutateAsync({
          id: savedRecordId,
          formDate: recordDate,
          title: `${config.title} - ${recordDate}`,
          formData,
          status: wasNonDraft ? "draft" : (approvalStatus === "draft" ? "draft" : approvalStatus),
        });
        // 승인/검토 단계였던 문서면 연결된 승인요청까지 취소하여 재작성 상태로 전환
        if (wasNonDraft) {
          try { await reopenMutation.mutateAsync({ id: savedRecordId }); } catch (_) {}
          setApprovalStatus("draft");
        }
      } else {
        const r = await gcSaveMutation.mutateAsync({
          formType: config.formType,
          formDate: recordDate,
          title: `${config.title} - ${recordDate}`,
          formData,
          status: "draft",
        });
        if (r.id) setSavedRecordId(r.id);
      }

      // 결재란 작성자 승인 처리 (재작성 시 검토/승인 직인은 초기화)
      setApproval(prev => ({
        ...prev,
        writerApproved: true,
        writerDate: new Date().toLocaleDateString("ko-KR"),
        ...(wasNonDraft ? { reviewerApproved: false, approverApproved: false, reviewerDate: undefined, approverDate: undefined } : {}),
      }));

      toast({
        title: "저장 완료",
        description: wasNonDraft
          ? `${config.title}가 수정되어 재작성(재승인 대기) 상태로 전환되었습니다. 다시 승인 요청해주세요.`
          : `${config.title}가 저장되었습니다.`,
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
            <Button variant="outline" size="sm" onClick={handleApprovalRequest} disabled={!savedRecordId || (approvalStatus === "submitted" && !orphanSubmitted) || approvalStatus === "approved"}>
              {submitForReviewMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
              승인 요청
            </Button>
            <Button size="sm" onClick={handleSave} disabled={isSaving} className="bg-blue-600 hover:bg-blue-700 text-white">
              {isSaving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
              저장
            </Button>
          </div>
        </div>

        {approvalStatus === "submitted" && approvalStateQ.data?.statusMismatch && (
          <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 print:hidden" data-testid="status-mismatch">
            승인은 이미 완료됐지만(요청 #{approvalStateQ.data.approvedRequestIds.join(", #")}) 이 기록의 상태가 '승인대기'로 남아 있습니다. 다시 요청하지 마세요 — 관리자에게 상태 정리를 요청하세요.
          </div>
        )}
        {orphanSubmitted && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 print:hidden" data-testid="orphan-submitted">
            <span>이 기록은 '승인대기' 이지만 승인 요청이 없습니다 (이전 오류). 승인관리에 보이지 않습니다.</span>
            <Button size="sm" variant="outline" className="h-7" onClick={handleApprovalRequest} disabled={submitForReviewMutation.isPending}>승인 요청 다시 만들기</Button>
          </div>
        )}

        {/* 자동 채움 안내 (새 문서) — 인쇄 시 숨김 */}
        {!isEdit && (
          <div className="mb-3 space-y-2 print:hidden" data-testid="prefill-banner">
            {entryPolicy === "single" && todayRecords.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:bg-blue-500/10 dark:text-blue-200">
                <span>오늘({openedDate}) 이미 작성한 기록이 있습니다 — 하루 한 장 일지입니다.</span>
                {todayRecords.map((r) => (
                  <Button key={r.id} size="sm" variant="outline" className="h-7" onClick={() => setLocation(`${config.listPath}/${r.id}`)} data-testid="prefill-continue">
                    #{r.id} 이어쓰기 ({r.status === "draft" ? "작성중" : r.status === "submitted" ? "승인대기" : r.status === "approved" ? "승인완료" : r.status})
                  </Button>
                ))}
              </div>
            )}
            {(() => {
              const box = "flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm";
              const actions = (
                <span className="ml-auto flex flex-wrap gap-1">
                  {(prefillQ.data?.candidates?.length ?? 0) > 0 && (
                    <Button size="sm" variant="outline" className="h-7" onClick={() => setPickerOpen(true)} data-testid="prefill-pick">다른 기록 선택</Button>
                  )}
                  {prefill.kind !== "blank" && prefill.kind !== "none" && (
                    <Button size="sm" variant="ghost" className="h-7" onClick={() => goWithRef("none")} data-testid="prefill-blank">빈 양식으로 시작</Button>
                  )}
                </span>
              );
              switch (prefill.kind) {
                case "loading":
                  return <div className={`${box} border-gray-200 text-gray-500`}><Loader2 className="h-3.5 w-3.5 animate-spin" />이전 기록 확인 중…</div>;
                case "applied":
                  return (
                    <div className={`${box} border-emerald-300 bg-emerald-50 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200`} data-testid="prefill-applied">
                      <span>
                        이전 기록 <b>{prefill.refDate}</b> (#{prefill.refId} · {prefill.refStatus === "approved" ? "승인완료" : prefill.refStatus === "submitted" ? "승인대기" : "작성중"})을 참고해 새 일지를 채웠습니다.
                        원본은 바뀌지 않습니다. {prefill.message}
                      </span>
                      {prefill.cleared.some((c) => c.kind === "measurement" || c.kind === "judgment") && (
                        <Button size="sm" variant="outline" className="h-7" onClick={() => setRefPanelOpen((v) => !v)} data-testid="prefill-refvalues">
                          이전 값 {refPanelOpen ? "닫기" : "보기"}
                        </Button>
                      )}
                      {actions}
                    </div>
                  );
                case "skipped":
                  return (
                    <div className={`${box} border-amber-300 bg-amber-50 text-amber-900`} data-testid="prefill-skipped">
                      <span>이전 기록({prefill.refDate})이 도착했지만 이미 입력을 시작해 채우지 않았습니다.</span>
                      <Button size="sm" variant="outline" className="h-7" onClick={() => { if (window.confirm("지금 입력한 내용을 이전 기록 내용으로 바꿉니다. 계속할까요?")) applyReference(true); }}>이전 기록으로 채우기</Button>
                      {actions}
                    </div>
                  );
                case "none":
                  return <div className={`${box} border-gray-200 text-gray-600`} data-testid="prefill-none">참고할 이전 기록이 없습니다 — 빈 양식입니다.</div>;
                case "blank":
                  return (
                    <div className={`${box} border-gray-200 text-gray-600`} data-testid="prefill-blank-state">
                      <span>빈 양식으로 시작했습니다.</span>
                      <Button size="sm" variant="outline" className="h-7" onClick={() => goWithRef(null)}>최근 기록 참고하기</Button>
                    </div>
                  );
                case "error":
                  return (
                    <div className={`${box} border-red-300 bg-red-50 text-red-900`} data-testid="prefill-error">
                      <span>이전 기록을 불러오지 못했습니다 ({prefill.reason}). 빈 양식입니다.</span>
                      {actions}
                    </div>
                  );
              }
            })()}
            {prefill.kind === "applied" && refPanelOpen && (
              <div className="max-h-56 overflow-auto rounded-md border bg-white px-3 py-2 text-xs dark:bg-background" data-testid="prefill-refpanel">
                <div className="mb-1 font-medium">이전 기록({prefill.refDate})의 값 — 참고용. 오늘 값을 직접 입력·판정하세요.</div>
                <table className="w-full">
                  <tbody>
                    {prefill.cleared.filter((c) => c.kind === "measurement" || c.kind === "judgment").map((c) => (
                      <tr key={c.path} className="border-t">
                        <td className="py-0.5 pr-2 text-muted-foreground">{c.label}</td>
                        <td className="py-0.5 tabular-nums">{String(c.value)}</td>
                        <td className="py-0.5 pl-2 text-muted-foreground">{c.kind === "judgment" ? "판정" : "측정"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>참고할 기록 선택</DialogTitle></DialogHeader>
            <p className="text-xs text-muted-foreground">고른 기록을 참고해 새 일지를 만듭니다. 판정·측정값·서명은 비우고, 원본 기록은 바뀌지 않습니다.</p>
            <div className="max-h-80 space-y-1 overflow-auto">
              {(prefillQ.data?.candidates ?? []).map((c: any) => (
                <button key={c.id} type="button" onClick={() => goWithRef(String(c.id))} data-testid="prefill-candidate"
                  className={`w-full rounded border px-3 py-2 text-left text-sm hover:bg-muted ${prefill.kind === "applied" && prefill.refId === c.id ? "border-emerald-400" : ""}`}>
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">{c.formDate} · #{c.id}</span>
                    <span className="text-xs text-muted-foreground">{c.status === "approved" ? "승인완료" : c.status === "submitted" ? "승인대기" : "작성중"}{c.writerName ? ` · ${c.writerName}` : ""}</span>
                  </div>
                  {c.summary && <div className="text-xs text-muted-foreground">{c.summary}</div>}
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        {/* 인쇄 영역 */}
        <div ref={printRef} className="bg-white border rounded-lg shadow-sm print:border-none print:shadow-none print:rounded-none">
          {/* 상단: 문서 제목(좌) + 결재란(우) — 제목이 결재란과 같은 높이에서 시작하도록 배치 */}
          <div className="flex justify-between items-center gap-4 px-4 pt-4">
            <div className="flex-1 text-center">
              <h2 className="text-2xl font-bold tracking-wide">{documentTitle ?? config.documentTitle}</h2>
            </div>
            <ApprovalStampTable approval={approval} />
          </div>

          {/* 작성자 선택 - 인쇄 시 숨김 */}
          <div className="px-6 pt-2 print:hidden">
            <div className="flex flex-wrap items-center gap-3">
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
              {!config.dateField && (
                <>
                  <label htmlFor="checklist-form-date" className="ml-4 text-sm font-medium text-gray-600 whitespace-nowrap">작성일</label>
                  <input
                    id="checklist-form-date"
                    type="date"
                    value={formDate}
                    onChange={(e) => { markTouched(); if (e.target.value) setFormDate(e.target.value); }}
                    className="h-9 rounded-md border px-2 text-sm"
                    data-testid="checklist-form-date"
                  />
                </>
              )}
            </div>
            {approvalSettingApplied && (
              <p className="text-xs text-gray-400 mt-1 ml-6">
                문서 결재 설정에서 자동 적용되었습니다. 변경이 필요하면 드롭다운에서 선택하세요.
              </p>
            )}
          </div>

          {/* 각 폼의 문서 양식 + 입력 폼 영역 */}
          {/* 입력이 시작되면 표시 — 늦게 온 참고 기록이 덮어쓰지 않게 (일지 PR 2) */}
          <div onInputCapture={markTouched} onChangeCapture={markTouched} onClickCapture={(e) => {
            const t = e.target as HTMLElement;
            if (t.closest("button, [role=checkbox], [role=radio], td, select")) markTouched();
          }}>
            {children}
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
      </div>
    </DashboardLayout>
  );
}

// ============================================================================
// Export 공통 컴포넌트들 (각 폼에서 사용)
// ============================================================================
export { ApprovalStampTable, WriterSelectField };

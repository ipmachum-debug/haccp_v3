/**
 * 작성자 사전 검토 페이지 — PR #264
 *
 * URL: /dashboard/writer-review/:approvalId
 *
 * 흐름:
 *   배치 자동 생성 → approval_request status='pending_writer' (작성자 사전 검토 대기)
 *   ↓
 *   작성자가 본 페이지 진입 → CCP 자동 생성 결과 확인 / 수정 / 메모 추가
 *   ↓
 *   [제출] 버튼 → status='pending_review' (검토자 단계)
 *
 * 사용자 시나리오:
 *   - 작성자가 자동 생성 결과를 즉시 검토 (오류 발견 시 수정)
 *   - 작업 중 / 작업 후 / 담당자 분리 (URL bookmark 가능)
 *   - 향후 PR-2: 사진 업로드 / 특이사항 메모 보강
 *
 * 작성: 2026-05-06 (PR #264)
 */
import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  FileCheck,
  User,
  Calendar,
  Send,
  Edit3,
  Image as ImageIcon,
  FileText as FileTextIcon,
  Upload,
  Trash2,
  Paperclip,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

export default function WriterReviewPage() {
  return (
    <DashboardLayout>
      <WriterReviewContent />
    </DashboardLayout>
  );
}

function WriterReviewContent() {
  const [, params] = useRoute("/dashboard/writer-review/:approvalId");
  const [, navigate] = useLocation();
  const approvalId = Number(params?.approvalId || 0);
  const [notes, setNotes] = useState("");

  const utils = trpc.useUtils();
  const { data: approval, isLoading } = trpc.approval.getById.useQuery(
    { id: approvalId },
    { enabled: approvalId > 0 },
  );

  const submitMut = trpc.approval.submitByWriter.useMutation({
    onSuccess: () => {
      utils.approval.pendingWriterCount.invalidate();
      utils.approval.listByIds.invalidate();
      toast({
        title: "검토자 단계로 제출되었습니다",
        description: "검토자가 검토 후 승인자에게 전달됩니다",
      });
      navigate("/dashboard/approval");
    },
    onError: (e: any) => {
      toast({
        title: "제출 실패",
        description: e.message,
        variant: "destructive",
      });
    },
  });

  if (!approvalId) {
    return <div className="p-8 text-center text-muted-foreground">잘못된 접근입니다</div>;
  }

  if (isLoading || !approval) {
    return <div className="p-8 text-center text-muted-foreground">불러오는 중...</div>;
  }

  // approval 의 status 가 pending_writer 가 아니면 표시만 (제출 불가)
  const a = approval as any;
  const isPendingWriter = a.status === "pending_writer";
  const isAlreadySubmitted = a.status !== "pending_writer" && a.status !== "rejected";
  const referenceType = a.referenceType || "";
  const isCcpForm = a.requestType === "ccp_form";
  const isBatchProduction = a.requestType === "batch_production";

  return (
    <div className="space-y-4 max-w-5xl">
      {/* 뒤로가기 */}
      <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard/approval")}>
        <ArrowLeft className="w-4 h-4 mr-1" /> 승인 관리로
      </Button>

      {/* 헤더 */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Edit3 className="w-3.5 h-3.5 text-primary" />
            작성자 사전 검토
          </div>
          <h1 className="text-xl font-bold tracking-tight mb-3">{a.title || "(제목 없음)"}</h1>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <Stat icon={<FileCheck className="w-3.5 h-3.5" />} label="유형">
              {a.requestType || "-"}
            </Stat>
            <Stat icon={<Calendar className="w-3.5 h-3.5" />} label="요청 일시">
              {a.requestedAt ? new Date(a.requestedAt).toLocaleString("ko-KR") : "-"}
            </Stat>
            <Stat icon={<User className="w-3.5 h-3.5" />} label="작성자">
              {a.requester?.name || `#${a.requestedBy}`}
            </Stat>
            <Stat icon={<Clock className="w-3.5 h-3.5" />} label="현재 상태">
              <StatusBadge status={a.status} />
            </Stat>
          </div>
        </CardContent>
      </Card>

      {/* 자동 생성 결과 안내 */}
      {a.description && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">자동 생성 결과</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-sm whitespace-pre-wrap font-sans text-foreground/90 bg-muted/40 rounded p-3">
              {a.description}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* 검토 / 수정 영역 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">검토 / 수정</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* CCP form 인 경우 — 기존 CCP 모니터링 페이지로 이동 안내 */}
          {(isCcpForm || isBatchProduction) && a.referenceId && (
            <div className="bg-blue-500/10 border border-blue-500/30 rounded p-3 text-sm">
              <div className="font-semibold text-blue-700 dark:text-blue-300 mb-1">
                💡 CCP 측정값 입력 / 수정
              </div>
              <p className="text-xs text-foreground/80 mb-2">
                CCP 기록지 내용 (측정값, 시간, 작업자) 을 직접 입력 / 수정하려면:
              </p>
              {isBatchProduction && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/dashboard/batch/${a.referenceId}`)}
                >
                  배치 #{a.referenceId} 상세 페이지로 이동
                </Button>
              )}
              {isCcpForm && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/dashboard/ccp-monitoring`)}
                >
                  CCP 모니터링 페이지로 이동
                </Button>
              )}
            </div>
          )}

          {/* 작성자 메모 */}
          <div>
            <Label className="text-sm">
              작성자 메모 (선택) — 특이사항 / 진행 상황 / 검토 내용
            </Label>
            <Textarea
              rows={5}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="예: 시작 온도 측정 시 외부 환경 변수 있었음. 측정값 정상 범위 내."
              disabled={!isPendingWriter}
            />
            <p className="text-xs text-muted-foreground mt-1">
              제출 시 description 에 추가됨. 검토자가 함께 확인 가능.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 첨부 파일 — PR #265 */}
      <AttachmentsSection
        approvalId={approvalId}
        canUpload={isPendingWriter}
      />

      {/* 제출 버튼 */}
      <Card>
        <CardContent className="p-4">
          {isPendingWriter ? (
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">검토 완료 후 제출</div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  제출 시 status 가{" "}
                  <Badge variant="outline" className="text-[10px] mx-1">
                    pending_writer
                  </Badge>
                  →
                  <Badge variant="outline" className="text-[10px] mx-1">
                    pending_review
                  </Badge>{" "}
                  로 전이되며 검토자에게 전달됩니다.
                </p>
              </div>
              <Button
                onClick={() => submitMut.mutate({ approvalRequestId: approvalId, notes: notes.trim() || undefined })}
                disabled={submitMut.isPending}
                size="lg"
              >
                <Send className="w-4 h-4 mr-2" />
                {submitMut.isPending ? "제출 중..." : "검토자에게 제출"}
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span>이미 작성자 검토를 마쳤습니다 (현재 상태: <StatusBadge status={a.status} />)</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1 text-muted-foreground mb-0.5">
        {icon}
        <span>{label}</span>
      </div>
      <div className="font-medium text-foreground">{children}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    pending_writer: { label: "작성자 사전 검토", className: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
    pending_review: { label: "검토 대기", className: "bg-blue-500/10 text-blue-700 dark:text-blue-400" },
    pending_approval: { label: "승인 대기", className: "bg-purple-500/10 text-purple-700 dark:text-purple-400" },
    approved: { label: "승인됨", className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
    rejected: { label: "반려됨", className: "bg-red-500/10 text-red-700 dark:text-red-400" },
    cancelled: { label: "취소됨", className: "bg-gray-500/10 text-gray-700 dark:text-gray-400" },
  };
  const c = config[status] || { label: status, className: "bg-gray-500/10" };
  return (
    <Badge variant="outline" className={`text-[10px] ${c.className}`}>
      {c.label}
    </Badge>
  );
}

// ─── PR #265: 첨부 파일 섹션 ───
function AttachmentsSection({
  approvalId,
  canUpload,
}: {
  approvalId: number;
  canUpload: boolean;
}) {
  const utils = trpc.useUtils();
  const { data: attachments = [], isLoading } = trpc.approval.listAttachments.useQuery({
    approvalRequestId: approvalId,
  });

  const uploadMut = trpc.approval.uploadAttachment.useMutation({
    onSuccess: () => {
      utils.approval.listAttachments.invalidate();
      toast({ title: "파일이 업로드되었습니다" });
    },
    onError: (e: any) => {
      toast({ title: "업로드 실패", description: e.message, variant: "destructive" });
    },
  });

  const deleteMut = trpc.approval.deleteAttachment.useMutation({
    onSuccess: () => {
      utils.approval.listAttachments.invalidate();
      toast({ title: "파일이 삭제되었습니다" });
    },
  });

  const [caption, setCaption] = useState("");

  const handleFileSelect = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "파일 크기 초과", description: "10MB 이하만 업로드 가능", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] || result;
      const isPhoto = file.type.startsWith("image/");
      uploadMut.mutate({
        approvalRequestId: approvalId,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        fileBase64: base64,
        attachmentType: isPhoto ? "photo" : "document",
        caption: caption.trim() || undefined,
      });
      setCaption("");
    };
    reader.readAsDataURL(file);
  };

  const fmtSize = (bytes: number | null): string => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Paperclip className="w-4 h-4 text-primary" />
          첨부 파일 (사진 / 문서)
          {attachments.length > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              {attachments.length}건
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* 업로드 영역 */}
        {canUpload && (
          <div className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-4 hover:border-primary/40 transition-colors">
            <div className="flex flex-col gap-2">
              <Label className="text-xs">설명 (선택)</Label>
              <Input
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="예: 제조 시작 시점 작업장 / CCP-1B 측정값 사진"
              />
              <Label
                htmlFor="file-upload"
                className="cursor-pointer flex items-center justify-center gap-2 py-3 bg-primary/5 hover:bg-primary/10 rounded text-sm font-medium"
              >
                <Upload className="w-4 h-4" />
                {uploadMut.isPending ? "업로드 중..." : "사진 / 문서 선택"}
              </Label>
              <input
                id="file-upload"
                type="file"
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                className="hidden"
                disabled={uploadMut.isPending}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(file);
                  e.target.value = ""; // 같은 파일 재선택 가능
                }}
              />
              <p className="text-[10px] text-muted-foreground text-center">
                이미지 (jpg/png) 또는 문서 (pdf/docx/xlsx) · 10MB 이하
              </p>
            </div>
          </div>
        )}

        {/* 첨부 목록 */}
        {isLoading ? (
          <div className="text-center py-4 text-sm text-muted-foreground">불러오는 중...</div>
        ) : attachments.length === 0 ? (
          <div className="text-center py-6 text-sm text-muted-foreground">
            <Paperclip className="w-10 h-10 mx-auto mb-1 opacity-30" />
            <p>첨부된 파일이 없습니다</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {attachments.map((a: any) => (
              <div
                key={a.id}
                className="border rounded p-2 flex flex-col gap-1 hover:shadow-sm transition-shadow"
              >
                {a.attachmentType === "photo" && a.mimeType?.startsWith("image/") ? (
                  <a href={a.fileUrl} target="_blank" rel="noreferrer">
                    <img
                      src={a.fileUrl}
                      alt={a.fileName}
                      className="w-full h-32 object-cover rounded bg-muted"
                    />
                  </a>
                ) : (
                  <a
                    href={a.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="h-32 flex items-center justify-center bg-muted rounded"
                  >
                    {a.attachmentType === "photo" ? (
                      <ImageIcon className="w-10 h-10 text-muted-foreground" />
                    ) : (
                      <FileTextIcon className="w-10 h-10 text-muted-foreground" />
                    )}
                  </a>
                )}
                <div className="flex items-start justify-between gap-1">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate" title={a.fileName}>
                      {a.fileName}
                    </div>
                    {a.caption && (
                      <div className="text-[10px] text-muted-foreground truncate" title={a.caption}>
                        {a.caption}
                      </div>
                    )}
                    <div className="text-[10px] text-muted-foreground">
                      {fmtSize(a.fileSize)}
                    </div>
                  </div>
                  {canUpload && (
                    <button
                      onClick={() => {
                        if (confirm(`'${a.fileName}' 을(를) 삭제할까요?`)) {
                          deleteMut.mutate({ id: a.id });
                        }
                      }}
                      className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-1 rounded"
                      title="삭제"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

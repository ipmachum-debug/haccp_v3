/**
 * ApprovalManagement.tsx 분해 — 승인 요청 상세 다이얼로그.
 * 원본의 detailDialog JSX 를 그대로 컴포넌트화.
 */
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Package, FileText, UserCheck, ShieldCheck, Printer } from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

import { ApprovalSealRow } from "@/components/SealGenerator";
import { CcpInspectionCard } from "@/components/ccp/CcpInspectionCard";

import type {
  ApprovalRequest,
  CcpFormRecord,
  CcpInstance,
} from "./types";
import {
  REQUEST_TYPE_LABELS,
  STATUS_LABELS,
  STATUS_COLORS,
} from "./constants";
import { ApprovalStepsInline } from "./ApprovalStepsInline";

export interface RequestDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: ApprovalRequest | null;
  canReview: boolean;
  canApprove: boolean;
  settingNames: {
    writerName?: string | null;
    reviewerName?: string | null;
    approverName?: string | null;
  } | null;
  ccpFormRecords: CcpFormRecord[];
  ccpListForApproval: CcpInstance[] | undefined;
  onRecordSaved: () => void;
  onClose: () => void;
  onOpenReview: () => void;
  onOpenApprove: () => void;
  onOpenReject: () => void;
  onNavigate: (path: string) => void;
}

export function RequestDetailDialog({
  open,
  onOpenChange,
  request,
  canReview,
  canApprove,
  settingNames,
  ccpFormRecords,
  ccpListForApproval,
  onRecordSaved,
  onClose,
  onOpenReview,
  onOpenApprove,
  onOpenReject,
  onNavigate,
}: RequestDetailDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">승인 요청 상세</DialogTitle>
        </DialogHeader>
        {request && (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {/* 3단계 진행 표시 */}
            <div className="p-2 bg-muted/50 rounded text-xs">
              <ApprovalStepsInline status={request.status ?? "pending"} />
            </div>

            {/* 승인 직인 (승인 완료 시) */}
            {request.status === "approved" && (() => {
              const cfd = (request as ApprovalRequest & {
                checklistFormData?: {
                  approval?: {
                    writerName?: string;
                    reviewerName?: string;
                    approverName?: string;
                    reviewerApproved?: boolean;
                    approverApproved?: boolean;
                  };
                };
              }).checklistFormData;
              const approval = cfd?.approval;
              const writerName =
                settingNames?.writerName ||
                approval?.writerName ||
                request.requester?.name ||
                "작성자";
              const reviewerName =
                settingNames?.reviewerName ||
                approval?.reviewerName ||
                request.reviewer?.name ||
                "검토자";
              const approverName =
                settingNames?.approverName ||
                approval?.approverName ||
                request.approver?.name ||
                "승인자";
              const toDateStr = (d: string | Date | null | undefined): string | undefined =>
                d == null ? undefined : typeof d === "string" ? d : d.toISOString();
              return (
                <div className="p-2 bg-muted/50 rounded flex justify-center">
                  <ApprovalSealRow
                    writer={{ name: writerName, date: toDateStr(request.requestedAt || request.createdAt) }}
                    reviewer={
                      request.reviewedAt || approval?.reviewerApproved
                        ? { name: reviewerName, date: toDateStr(request.reviewedAt || request.approvedAt) }
                        : undefined
                    }
                    approver={
                      request.approvedAt || approval?.approverApproved
                        ? { name: approverName, date: toDateStr(request.approvedAt) }
                        : undefined
                    }
                    size={45}
                  />
                </div>
              );
            })()}

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-[10px] text-muted-foreground">유형</div>
                <div className="font-medium text-xs">
                  {REQUEST_TYPE_LABELS[request.requestType] || request.requestType}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground">상태</div>
                <Badge
                  className={`${
                    STATUS_COLORS[request.status ?? "pending"] || STATUS_COLORS.pending
                  } text-[10px]`}
                >
                  {STATUS_LABELS[request.status ?? "pending"] || request.status}
                </Badge>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground">제목</div>
                <div className="font-medium text-xs">{request.title}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground">요청일</div>
                <div className="text-xs">
                  {request.requestedAt
                    ? format(new Date(request.requestedAt), "PPP p", { locale: ko })
                    : "-"}
                </div>
              </div>
              {request.reviewedAt && (
                <div>
                  <div className="text-[10px] text-muted-foreground">검토일</div>
                  <div className="text-xs">
                    {format(new Date(request.reviewedAt), "PPP p", { locale: ko })}
                  </div>
                </div>
              )}
              {request.approvedAt && (
                <div>
                  <div className="text-[10px] text-muted-foreground">승인일</div>
                  <div className="text-xs">
                    {format(new Date(request.approvedAt), "PPP p", { locale: ko })}
                  </div>
                </div>
              )}
            </div>

            {request.description && (
              <div className="border-t pt-2">
                <div className="text-[10px] text-muted-foreground mb-1">설명</div>
                <div className="text-xs whitespace-pre-line">{request.description}</div>
              </div>
            )}

            {(request.requestType === "batch_production" ||
              request.requestType === "batch_approval") &&
              request.referenceId && (
                <div className="border-t pt-2">
                  <div className="text-xs font-semibold mb-1 flex items-center gap-1">
                    <Package className="h-3.5 w-3.5 text-blue-600" />
                    CCP 기록지 (배치 #{request.referenceId})
                  </div>
                  {ccpFormRecords.length > 0 && (
                    <div className="mb-2 space-y-1">
                      {ccpFormRecords.map((fr) => (
                        <div
                          key={fr.id}
                          className="flex items-center justify-between bg-gray-50 border rounded px-2 py-1 text-xs"
                        >
                          <span className="font-medium">
                            {fr.ccpType} - {fr.processGroupName || "-"}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                              fr.status === "approved"
                                ? "bg-green-100 text-green-700"
                                : fr.status === "submitted"
                                  ? "bg-blue-100 text-blue-700"
                                  : fr.status === "rejected"
                                    ? "bg-red-100 text-red-700"
                                    : "bg-yellow-100 text-yellow-700"
                            }`}
                          >
                            {fr.status === "approved"
                              ? "OK"
                              : fr.status === "submitted"
                                ? "검토중"
                                : fr.status === "rejected"
                                  ? "반려"
                                  : "작성중"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {ccpListForApproval && ccpListForApproval.length > 0 ? (
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                      {ccpListForApproval.map((ccp) => (
                        <CcpInspectionCard
                          key={ccp.id}
                          ccp={ccp}
                          onRecordSaved={onRecordSaved}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-blue-600 bg-blue-50 p-2 rounded">
                      CCP 기록지를 불러오는 중이거나 생성되지 않았습니다.
                    </div>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full mt-2 text-blue-600 border-blue-300 h-7 text-xs"
                    onClick={() => {
                      onClose();
                      onNavigate(`/dashboard/batch/${request.referenceId}`);
                    }}
                  >
                    배치 상세 / CCP 전체 보기
                  </Button>
                </div>
              )}

            {request.reviewComments && (
              <div className="text-xs text-blue-600 bg-blue-50 p-2 rounded">
                검토: {request.reviewComments}
              </div>
            )}
            {request.notes && request.status === "approved" && (
              <div className="text-xs text-green-600 bg-green-50 p-2 rounded">
                승인: {request.notes}
              </div>
            )}
            {request.rejectionReason && (
              <div className="text-xs text-red-600 bg-red-50 p-2 rounded">
                반려: {request.rejectionReason}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex-wrap gap-1.5">
          <Button variant="outline" size="sm" onClick={onClose}>
            닫기
          </Button>

          {request &&
            ["daily_log", "weekly_log", "monthly_log"].includes(
              request.requestType
            ) &&
            request.status !== "approved" &&
            (() => {
              const routeMap: Record<string, string> = {
                daily_log: "/daily-log/daily",
                weekly_log: "/weekly-log/form",
                monthly_log: "/monthly-log/form",
              };
              const route = routeMap[request.requestType];
              const dateMatch = request.title?.match(/(\d{4}-\d{2}-\d{2})/);
              const dateParam = dateMatch ? dateMatch[1] : "";
              return (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-amber-600 border-amber-300"
                  onClick={() => {
                    onClose();
                    onNavigate(`${route}?date=${dateParam}&id=${request.referenceId}`);
                  }}
                >
                  <FileText className="h-3.5 w-3.5 mr-1" />
                  수정
                </Button>
              );
            })()}

          {request &&
            (request.requestType === "batch_production" ||
              request.requestType === "batch_approval") &&
            request.referenceId && (
              <Button
                variant="outline"
                size="sm"
                className="text-blue-600"
                onClick={() => {
                  onClose();
                  onNavigate(`/dashboard/batch/${request.referenceId}`);
                }}
              >
                <Package className="h-3.5 w-3.5 mr-1" />
                배치
              </Button>
            )}

          {request &&
            (request.status === "pending_review" || request.status === "pending") &&
            canReview && (
              <>
                <Button
                  size="sm"
                  className="bg-orange-500 hover:bg-orange-600"
                  onClick={() => {
                    onClose();
                    onOpenReview();
                  }}
                >
                  <UserCheck className="h-3.5 w-3.5 mr-1" />
                  검토
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    onClose();
                    onOpenReject();
                  }}
                >
                  반려
                </Button>
              </>
            )}

          {request?.status === "pending_approval" && canApprove && (
            <>
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700"
                onClick={() => {
                  onClose();
                  onOpenApprove();
                }}
              >
                <ShieldCheck className="h-3.5 w-3.5 mr-1" />
                승인
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  onClose();
                  onOpenReject();
                }}
              >
                반려
              </Button>
            </>
          )}

          {request?.status === "approved" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigate("/dashboard/document-output")}
            >
              <Printer className="h-3.5 w-3.5 mr-1" />
              출력
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

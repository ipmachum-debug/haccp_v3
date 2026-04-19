/**
 * ApprovalManagement.tsx 분해 — 승인 요청 한 건의 행 렌더러.
 * 원본의 renderRequestRow() 를 그대로 컴포넌트화.
 */
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import {
  CheckSquare,
  Square,
  Eye,
  UserCheck,
  ShieldCheck,
  XCircle,
  Printer,
  Trash2,
  FileText,
} from "lucide-react";
import type { ApprovalRequest } from "./types";
import {
  REQUEST_TYPE_LABELS,
  REQUEST_TYPE_ICONS,
  REQUEST_CATEGORIES,
  CATEGORY_COLORS,
  STATUS_LABELS,
  STATUS_COLORS,
} from "./constants";

export type RequestRowMode = "review" | "approve" | "readonly";

export interface RequestRowProps {
  request: ApprovalRequest;
  mode?: RequestRowMode;
  isSelected: boolean;
  canReview: boolean;
  canApprove: boolean;
  writerName?: string | null;
  reviewerName?: string | null;
  approverName?: string | null;
  autoReviewApprovePending: boolean;
  onToggleSelect: (id: number) => void;
  onOpenDetail: (r: ApprovalRequest) => void;
  onOpenReview: (r: ApprovalRequest) => void;
  onAutoReviewApprove: (r: ApprovalRequest) => void;
  onOpenApprove: (r: ApprovalRequest) => void;
  onOpenReject: (r: ApprovalRequest) => void;
  onOpenCancel: (r: ApprovalRequest) => void;
  onNavigate: (path: string) => void;
}

export function RequestRow({
  request,
  mode = "readonly",
  isSelected,
  canReview,
  canApprove,
  writerName,
  reviewerName,
  approverName,
  autoReviewApprovePending,
  onToggleSelect,
  onOpenDetail,
  onOpenReview,
  onAutoReviewApprove,
  onOpenApprove,
  onOpenReject,
  onOpenCancel,
  onNavigate,
}: RequestRowProps) {
  const Icon = REQUEST_TYPE_ICONS[request.requestType] || FileText;
  const category = REQUEST_CATEGORIES[request.requestType] || "기타";
  const categoryColor = CATEGORY_COLORS[category] || "bg-gray-100 text-gray-800";

  // 작업일(work_date) 우선 표시: title에서 YYYY-MM-DD 추출 → 시간 제거
  const titleDateMatch = request.title?.match(/(\d{4}-\d{2}-\d{2})/);
  const dateStr = titleDateMatch
    ? format(new Date(titleDateMatch[1] + "T12:00:00"), "MM.dd")
    : request.requestedAt
      ? format(new Date(request.requestedAt), "MM.dd")
      : request.createdAt
        ? format(new Date(request.createdAt), "MM.dd")
        : "-";

  const resolvedWriter = writerName || request.requester?.name || "?";
  const isReviewed =
    request.status === "pending_approval" || request.status === "approved";
  const isApproved = request.status === "approved";

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2.5 border-b last:border-b-0 hover:bg-accent/40 transition-colors text-sm ${
        isSelected ? "bg-blue-50/60 dark:bg-blue-950/10" : ""
      }`}
    >
      {/* 체크박스 */}
      {mode !== "readonly" && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(request.id);
          }}
          className="flex-shrink-0 text-muted-foreground hover:text-blue-600"
        >
          {isSelected ? (
            <CheckSquare className="w-4 h-4 text-blue-600" />
          ) : (
            <Square className="w-4 h-4" />
          )}
        </button>
      )}

      {/* 아이콘 + 카테고리 */}
      <div className="flex-shrink-0 flex items-center gap-1.5">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <Badge className={`${categoryColor} text-[10px] px-1.5 py-0`}>
          {category}
        </Badge>
      </div>

      {/* 제목 + 유형 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-medium truncate text-sm">
            {request.title ||
              REQUEST_TYPE_LABELS[request.requestType] ||
              request.requestType}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
          <span>{resolvedWriter}</span>
          <span>{dateStr}</span>
          <span className="inline-flex items-center gap-0.5 text-[10px]">
            <span className="text-green-600 font-semibold">{"\u2713"}작성</span>
            <span className="text-gray-300 mx-0.5">{">"}</span>
            <span
              className={
                isReviewed
                  ? "text-green-600 font-semibold"
                  : "text-gray-400"
              }
            >
              {isReviewed ? "\u2713" : "\u25CB"}검토
              {reviewerName && (
                <span className="ml-0.5 text-gray-500">·{reviewerName}</span>
              )}
            </span>
            <span className="text-gray-300 mx-0.5">{">"}</span>
            <span
              className={
                isApproved
                  ? "text-green-600 font-semibold"
                  : "text-gray-400"
              }
            >
              {isApproved ? "\u2713" : "\u25CB"}승인
              {approverName && (
                <span className="ml-0.5 text-gray-500">·{approverName}</span>
              )}
            </span>
          </span>
        </div>
      </div>

      {/* 상태 */}
      <Badge
        className={`${
          STATUS_COLORS[request.status ?? "pending"] || STATUS_COLORS.pending
        } text-[10px] px-1.5 py-0 flex-shrink-0`}
      >
        {STATUS_LABELS[request.status ?? "pending"] || request.status}
      </Badge>

      {/* 액션 버튼 */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          onClick={() => onOpenDetail(request)}
          title="상세"
        >
          <Eye className="h-3.5 w-3.5" />
        </Button>

        {mode === "review" &&
          (request.status === "pending_review" ||
            request.status === "pending") &&
          canReview && (
            <>
              <Button
                size="sm"
                className="h-7 px-2 text-xs bg-orange-500 hover:bg-orange-600"
                onClick={() => onOpenReview(request)}
                title="검토완료"
              >
                <UserCheck className="h-3 w-3 mr-0.5" />
                검토
              </Button>
              {canApprove && (
                <Button
                  size="sm"
                  className="h-7 px-2 text-xs bg-green-600 hover:bg-green-700"
                  onClick={() => onAutoReviewApprove(request)}
                  disabled={autoReviewApprovePending}
                  title="바로승인"
                >
                  <ShieldCheck className="h-3 w-3 mr-0.5" />
                  승인
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                onClick={() => onOpenReject(request)}
                title="반려"
              >
                <XCircle className="h-3.5 w-3.5" />
              </Button>
            </>
          )}

        {mode === "approve" &&
          request.status === "pending_approval" &&
          canApprove && (
            <>
              <Button
                size="sm"
                className="h-7 px-2 text-xs bg-green-600 hover:bg-green-700"
                onClick={() => onOpenApprove(request)}
                title="최종승인"
              >
                <ShieldCheck className="h-3 w-3 mr-0.5" />
                승인
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                onClick={() => onOpenReject(request)}
                title="반려"
              >
                <XCircle className="h-3.5 w-3.5" />
              </Button>
            </>
          )}

        {mode === "readonly" && request.status === "approved" && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => onNavigate("/dashboard/document-output")}
            title="문서출력"
          >
            <Printer className="h-3.5 w-3.5" />
          </Button>
        )}

        {/* 삭제 버튼 */}
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 text-gray-400 hover:text-red-500"
          onClick={() => onOpenCancel(request)}
          title="삭제"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

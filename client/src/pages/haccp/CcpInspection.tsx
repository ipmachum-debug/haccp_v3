/**
 * /dashboard/ccp/:id — CCP 점검 기록 단건 상세
 *
 * 정본은 공식 CCP 모니터링 기록지(h_ccp_form_records / h_ccp_form_rows) 다. 인쇄 양식·제출·승인이
 * 전부 기록지에서 돌아가고, 배치별 측정시각·투입량·품온도 거기에만 있다 (2026-10-12 CEO 확인).
 * 설비행(h_ccp_rows) 은 배치 생성 시 설비 기준값으로 만들어지는 사본이라 참고용으로 접어 둔다.
 */
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CcpInspectionCard } from "@/components/ccp/CcpInspectionCard";
import { CcpMonitoringForms } from "@/components/ccp/CcpMonitoringForms";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Boxes, Loader2 } from "lucide-react";
import { Link, useLocation, useParams } from "wouter";

const CCP_LIST_PATH = "/quality/ccp-monitoring";

const STATUS_LABEL: Record<string, string> = {
  draft: "작성중",
  submitted: "검토중",
  approved: "승인완료",
  rejected: "반려",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  submitted: "secondary",
  approved: "default",
  rejected: "destructive",
};

const CCP_TYPE_LABEL: Record<string, string> = {
  "CCP-1B": "교반/증숙",
  "CCP-2B": "오븐굽기",
  "CCP-3B": "냉각",
  "CCP-4P": "금속검출",
};

function toDateStr(v: Date | string | null | undefined): string | undefined {
  if (!v) return undefined;
  if (typeof v === "string") return v.slice(0, 10);
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return undefined;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtDate(v: Date | string | null | undefined): string {
  if (!v) return "-";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("ko-KR", { year: "numeric", month: "numeric", day: "numeric" });
}

export default function CcpInspection() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const instanceId = params.id ? parseInt(params.id, 10) : 0;

  const { data: detail, isLoading, refetch } = trpc.ccp.getInstanceDetail.useQuery(
    { instanceId },
    { enabled: !!instanceId }
  );

  // 상태는 기록지 상태를 우선 — 인스턴스 status 는 설비행 사본의 상태
  const status: string | undefined = detail ? (detail.formStatus ?? detail.status) : undefined;

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-4 md:gap-6">
        {/* 헤더 */}
        <div className="flex items-start gap-4">
          <Button variant="outline" size="icon" onClick={() => setLocation(CCP_LIST_PATH)} title="CCP 기록 목록">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2 flex-wrap">
              {detail ? (detail.productName ?? "제품 미지정") : "CCP 점검 기록"}
              {detail && (
                <>
                  <Badge variant="outline" className="font-mono text-xs">
                    {detail.ccpType}
                    {CCP_TYPE_LABEL[detail.ccpType] ? ` ${CCP_TYPE_LABEL[detail.ccpType]}` : ""}
                  </Badge>
                  {status && (
                    <Badge variant={STATUS_VARIANT[status] ?? "outline"} className="text-xs">
                      {STATUS_LABEL[status] ?? status}
                    </Badge>
                  )}
                </>
              )}
            </h1>
            {detail && (
              <p className="text-sm text-muted-foreground mt-1 flex items-center gap-x-3 gap-y-1 flex-wrap">
                <span>작업일 {fmtDate(detail.workDate)}</span>
                {detail.batchId && (
                  <Link href={`/dashboard/batch/${detail.batchId}`} className="inline-flex items-center gap-1 underline-offset-2 hover:underline">
                    <Boxes className="h-3.5 w-3.5" />
                    배치 {detail.batchCode ?? `#${detail.batchId}`}
                  </Link>
                )}
                {detail.processGroupName && <span>공정 {detail.processGroupName}</span>}
                <span className="text-gray-400">#{detail.id}</span>
              </p>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            불러오는 중...
          </div>
        ) : !detail ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <p>CCP 기록 #{instanceId} 을(를) 찾을 수 없습니다.</p>
              <p className="text-xs mt-1">삭제되었거나 다른 사업장의 기록일 수 있습니다.</p>
              <Button variant="outline" className="mt-4" onClick={() => setLocation(CCP_LIST_PATH)}>
                목록으로
              </Button>
            </CardContent>
          </Card>
        ) : !detail.batchId ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <p>이 CCP 기록은 배치에 연결돼 있지 않아 공식 기록지가 없습니다.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* 정본: 공식 CCP 모니터링 기록지 (배치별 측정시각·투입량·품온·판정·제출) */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  CCP 모니터링 기록지
                  <Badge variant="outline" className="text-xs">공식 양식</Badge>
                </CardTitle>
                <CardDescription>
                  배치별 측정시각 · 투입량 · 측정값 · 판정. 인쇄 양식과 같은 데이터이며 제출·승인도 여기서 합니다.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CcpMonitoringForms
                  batchId={detail.batchId}
                  batchNumber={detail.batchCode ?? String(detail.batchId)}
                  productId={detail.productId ?? undefined}
                  productName={detail.productName ?? undefined}
                  plannedQtyKg={detail.batchPlannedQuantity ? parseFloat(detail.batchPlannedQuantity) : undefined}
                  workDate={toDateStr(detail.batchPlannedDate ?? detail.workDate)}
                  ccpTypeFilter={detail.ccpType}
                  hideHelp
                  onFormSaved={() => void refetch()}
                />
              </CardContent>
            </Card>

            {/* 참고: 설비 기준값 (배치 생성 시 설비 마스터에서 복사된 사본) */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">설비 기준값 (참고)</CardTitle>
                <CardDescription>
                  배치 생성 시 설비 마스터의 운영 기준값으로 만들어진 행입니다. 실제 기록은 위 기록지가 기준입니다.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CcpInspectionCard ccp={detail} onRecordSaved={() => void refetch()} />
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

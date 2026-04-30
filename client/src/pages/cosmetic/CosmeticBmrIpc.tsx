/**
 * 화장품 BMR IPC 페이지 (Phase 2-3)
 *
 * 라우트: /dashboard/cosmetic/bmr/:id/ipc
 *
 * 기능:
 *   1. BMR 별 IPC 측정값 목록
 *   2. 요약 카드 (pass/fail/pending 카운트 + 모든 IPC pass 여부)
 *   3. 신규 IPC 등록 dialog
 *   4. IPC 행 삭제
 *   5. BMR Detail 로 deeplink (수정 / 상태전이)
 */

import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  PlusCircle,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  TestTube2,
} from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { toast } from "@/hooks/use-toast";
import { CosmeticBmrIpcDialog } from "./CosmeticBmrIpcDialog";

const PASS_FAIL_LABEL: Record<string, string> = {
  pass: "합격",
  fail: "부적합",
  pending: "측정 대기",
};

const PASS_FAIL_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  pass: "default",
  fail: "destructive",
  pending: "secondary",
};

const PASS_FAIL_ICON: Record<string, React.ComponentType<any>> = {
  pass: CheckCircle2,
  fail: XCircle,
  pending: Clock,
};

export default function CosmeticBmrIpc() {
  const [, params] = useRoute("/dashboard/cosmetic/bmr/:id/ipc");
  const [, navigate] = useLocation();
  const bmrId = Number(params?.id ?? 0);

  const [createOpen, setCreateOpen] = useState(false);

  const { data: bmr } = trpc.cosmetic.bmr.getById.useQuery(
    { id: bmrId },
    { enabled: bmrId > 0 },
  );
  const {
    data: ipcs,
    isLoading,
    refetch,
  } = trpc.cosmetic.bmrIpc.listByBmr.useQuery(
    { bmrId },
    { enabled: bmrId > 0, refetchInterval: 60_000 },
  );
  const { data: summary } = trpc.cosmetic.bmrIpc.summaryByBmr.useQuery(
    { bmrId },
    { enabled: bmrId > 0 },
  );

  const deleteMutation = trpc.cosmetic.bmrIpc.delete.useMutation();

  const handleDelete = async (id: number) => {
    if (!confirm("이 IPC 측정값을 삭제하시겠습니까?")) return;
    try {
      const result = await deleteMutation.mutateAsync({ id });
      if (!result.deleted) {
        toast({ title: "삭제 실패 (대상 없음)", variant: "destructive" });
        return;
      }
      toast({ title: "IPC 삭제 완료" });
      refetch();
    } catch (e: any) {
      toast({
        title: "삭제 실패",
        description: e?.message ?? String(e),
        variant: "destructive",
      });
    }
  };

  if (bmrId <= 0) {
    return (
      <DashboardLayout>
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            잘못된 BMR ID
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* 헤더 */}
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div>
            <Button
              variant="ghost"
              size="sm"
              className="mb-2 -ml-3"
              onClick={() => navigate(`/dashboard/cosmetic/bmr/${bmrId}`)}
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              BMR 상세로
            </Button>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <TestTube2 className="w-6 h-6 text-violet-600" />
              IPC 측정값
            </h1>
            <p className="text-sm text-muted-foreground mt-1 font-mono">
              {bmr?.bmrCode ?? `BMR #${bmrId}`}
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <PlusCircle className="w-4 h-4 mr-1" />
            IPC 측정값 등록
          </Button>
        </div>

        {/* 요약 카드 */}
        {summary && summary.total > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">검증 요약</CardTitle>
              <CardDescription>
                {summary.allPass
                  ? "✅ 모든 IPC 항목이 합격 — completed 단계 전이 권장"
                  : summary.fail > 0
                  ? "❌ 부적합 항목이 있습니다 — 검토 필요"
                  : "⏳ 측정 대기 중인 항목이 있습니다"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-3">
                <SummaryTile
                  label="총합"
                  value={summary.total}
                  icon={<TestTube2 className="w-4 h-4 text-muted-foreground" />}
                />
                <SummaryTile
                  label="합격"
                  value={summary.pass}
                  icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                  highlight={summary.pass > 0}
                  highlightClass="bg-emerald-50 border-emerald-200"
                />
                <SummaryTile
                  label="부적합"
                  value={summary.fail}
                  icon={<XCircle className="w-4 h-4 text-red-600" />}
                  highlight={summary.fail > 0}
                  highlightClass="bg-red-50 border-red-200"
                />
                <SummaryTile
                  label="대기"
                  value={summary.pending}
                  icon={<Clock className="w-4 h-4 text-amber-600" />}
                  highlight={summary.pending > 0}
                  highlightClass="bg-amber-50 border-amber-200"
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* IPC 목록 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-baseline justify-between">
              <span>IPC 목록 {ipcs ? `(${ipcs.length}건)` : ""}</span>
              <span className="text-xs text-muted-foreground font-normal">
                자동 갱신 60초
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-sm text-muted-foreground py-8 text-center">로딩 중...</div>
            ) : !ipcs || ipcs.length === 0 ? (
              <div className="py-12 text-center">
                <TestTube2 className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">등록된 IPC 측정값 0건</p>
                <p className="text-xs text-muted-foreground mt-2">
                  우측 상단 "IPC 측정값 등록" 버튼으로 첫 항목을 추가하세요.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>측정 항목</TableHead>
                    <TableHead className="text-right">한계 (min~max)</TableHead>
                    <TableHead className="text-right">측정값</TableHead>
                    <TableHead className="w-20">단위</TableHead>
                    <TableHead className="w-24">결과</TableHead>
                    <TableHead className="w-32">측정 시각</TableHead>
                    <TableHead className="w-12 text-right"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ipcs.map((ipc) => {
                    const Icon = PASS_FAIL_ICON[ipc.passFail] ?? Clock;
                    return (
                      <TableRow key={ipc.id} className="hover:bg-muted/40">
                        <TableCell className="text-sm">
                          <div className="font-medium">
                            {ipc.measurementLabel ?? ipc.measurementType}
                          </div>
                          {ipc.measurementLabel && (
                            <div className="text-xs text-muted-foreground font-mono">
                              {ipc.measurementType}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {ipc.expectedMin !== null || ipc.expectedMax !== null
                            ? `${ipc.expectedMin ?? "-"} ~ ${ipc.expectedMax ?? "-"}`
                            : <span className="text-muted-foreground">-</span>}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium">
                          {ipc.measuredValue !== null ? ipc.measuredValue : <span className="text-muted-foreground">-</span>}
                        </TableCell>
                        <TableCell className="text-xs">{ipc.unit ?? "-"}</TableCell>
                        <TableCell>
                          <Badge variant={PASS_FAIL_VARIANT[ipc.passFail] ?? "secondary"} className="gap-1">
                            <Icon className="w-3 h-3" />
                            {PASS_FAIL_LABEL[ipc.passFail] ?? ipc.passFail}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {ipc.measuredAt
                            ? new Date(ipc.measuredAt as any).toLocaleString("ko-KR")
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(ipc.id)}
                          >
                            <Trash2 className="w-4 h-4 text-muted-foreground" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* 향후 안내 */}
        <Card className="bg-muted/30 border-dashed">
          <CardHeader>
            <CardTitle className="text-sm">향후 확장</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1">
            <p>• 표준 IPC template 마스터 (h_cosmetic_ipc_template)</p>
            <p>• 부적합 시 자동 알림 / CAR 등록 (Phase 2-7 — F-3 cosmetic)</p>
            <p>• BMR Detail 페이지에 IPC 카드 통합 (Phase 2-2 머지 후)</p>
          </CardContent>
        </Card>
      </div>

      {/* 신규 등록 dialog */}
      <CosmeticBmrIpcDialog
        bmrId={bmrId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={refetch}
      />
    </DashboardLayout>
  );
}

function SummaryTile(props: {
  label: string;
  value: number;
  icon: React.ReactNode;
  highlight?: boolean;
  highlightClass?: string;
}) {
  return (
    <div
      className={`p-3 rounded-lg border ${
        props.highlight ? props.highlightClass ?? "bg-card" : "bg-card"
      }`}
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
        {props.icon}
        <span>{props.label}</span>
      </div>
      <div className="text-2xl font-semibold">{props.value}</div>
    </div>
  );
}

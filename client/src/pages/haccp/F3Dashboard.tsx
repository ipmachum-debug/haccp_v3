/**
 * F-3 운영 현황 대시보드 (CP-3-i)
 *
 * 특허 [0016] F-3 IoT 폐쇄 루프의 5단계 활성화 상태 + 24h 작동 현황을 한 화면에.
 * 운영자/영업이 한눈에: "지금 어떤 자동화가 켜져있고, 지난 하루 얼마나 작동했는지".
 */

import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import {
  Activity,
  AlertTriangle,
  PackageMinus,
  Receipt,
  ClipboardCheck,
  Cpu,
  CheckCircle2,
  CircleSlash,
} from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";

const STAGES = [
  {
    key: "eval" as const,
    label: "1단계 — 평가 + 알림",
    env: "ENABLE_CCP_EVAL",
    icon: Activity,
    desc: "CCP 측정 → 한계 이탈 감지 → 관리자/QA 알림",
  },
  {
    key: "lotHold" as const,
    label: "2단계 — 자동 LOT HOLD",
    env: "ENABLE_CCP_LOT_HOLD",
    icon: PackageMinus,
    desc: "이탈 시 영향 LOT 자동 'reserved' 처리",
  },
  {
    key: "autoJournal" as const,
    label: "3단계 — 자동 손실분개",
    env: "ENABLE_CCP_AUTO_JOURNAL",
    icon: Receipt,
    desc: "HOLD 된 LOT 가치 → 제조손실 자동 분개",
  },
  {
    key: "car" as const,
    label: "4단계 — 자동 시정조치",
    env: "ENABLE_CCP_CAR",
    icon: ClipboardCheck,
    desc: "deviation → CAR 요청 자동 등록",
  },
  {
    key: "iotBridge" as const,
    label: "5단계 — IoT 신호 브리지",
    env: "ENABLE_CCP_IOT_BRIDGE",
    icon: Cpu,
    desc: "외부 센서 → ccp_records 자동 + 평가기 발화",
  },
] as const;

const priorityVariant: Record<string, "default" | "secondary" | "destructive"> = {
  low: "secondary",
  medium: "default",
  high: "default",
  urgent: "destructive",
  critical: "destructive",
};

const statusLabel: Record<string, string> = {
  open: "접수",
  investigating: "조사 중",
  action_taken: "조치 완료",
  verifying: "검증 중",
  closed: "종결",
  reopened: "재개",
};

function formatRelative(date: Date | string | null | undefined): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "방금 전";
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}시간 전`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}일 전`;
}

export default function F3Dashboard() {
  const { data: summary, isLoading } = trpc.f3Dashboard.summary.useQuery(
    undefined,
    { refetchInterval: 60_000 },
  );
  const { data: deviations } = trpc.f3Dashboard.recentDeviations.useQuery(
    { limit: 5 },
    { refetchInterval: 60_000 },
  );
  const { data: cars } = trpc.f3Dashboard.recentCars.useQuery(
    { limit: 5 },
    { refetchInterval: 60_000 },
  );

  const flags = summary?.flags;
  const counts = summary?.counts24h;
  const lossSum = summary?.lossSum24h ?? 0;

  // 활성 단계 수 (영업 데모용 진행도)
  const activeCount = flags
    ? Object.values(flags).filter(Boolean).length
    : 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-semibold">F-3 IoT 폐쇄 루프 운영 현황</h1>
            <p className="text-sm text-muted-foreground mt-1">
              특허 [0016] — CCP 이탈 → LOT HOLD → 손실분개 → 시정조치 자동화 5단계
            </p>
          </div>
          <Badge variant={activeCount === 5 ? "default" : "secondary"} className="text-sm">
            {activeCount}/5 단계 활성
          </Badge>
        </div>

        {/* 5단계 활성화 카드 — 점진 활성화 시각화 */}
        <Card>
          <CardHeader>
            <CardTitle>활성화 단계</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
              {STAGES.map((stage) => {
                const isActive = !!flags?.[stage.key];
                const Icon = stage.icon;
                return (
                  <div
                    key={stage.key}
                    className={`p-4 rounded-lg border ${
                      isActive
                        ? "bg-emerald-50 border-emerald-200"
                        : "bg-muted/40 border-muted"
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <Icon
                        className={`w-5 h-5 ${
                          isActive ? "text-emerald-600" : "text-muted-foreground"
                        }`}
                      />
                      {isActive ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <CircleSlash className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="text-sm font-medium">{stage.label}</div>
                    <div className="text-xs text-muted-foreground mt-1">{stage.desc}</div>
                    <div className="text-[10px] text-muted-foreground mt-2 font-mono">
                      {stage.env}={isActive ? "true" : "false"}
                    </div>
                  </div>
                );
              })}
            </div>
            {activeCount < 5 && (
              <p className="text-xs text-muted-foreground mt-4">
                💡 점진 활성화: 운영 .env 에 단계별로 추가 (예: <code>ENABLE_CCP_EVAL_TENANTS="2"</code>) 후 PM2 reload.
                자세한 절차는 <code>docs/workflow/</code> 참고.
              </p>
            )}
          </CardContent>
        </Card>

        {/* 24h 작동 카운트 — 영업 데모용 핵심 메트릭 */}
        <Card>
          <CardHeader>
            <CardTitle>지난 24시간 자동 처리 현황</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-sm text-muted-foreground py-8 text-center">로딩 중...</div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                <MetricCard
                  icon={<Activity className="w-4 h-4 text-blue-600" />}
                  label="CCP 측정"
                  value={counts?.ccpRecords ?? 0}
                  unit="건"
                />
                <MetricCard
                  icon={<AlertTriangle className="w-4 h-4 text-orange-600" />}
                  label="이탈 감지"
                  value={counts?.deviations ?? 0}
                  unit="건"
                  highlight={(counts?.deviations ?? 0) > 0}
                />
                <MetricCard
                  icon={<PackageMinus className="w-4 h-4 text-amber-600" />}
                  label="LOT HOLD"
                  value={counts?.lotHolds ?? 0}
                  unit="건"
                />
                <MetricCard
                  icon={<Receipt className="w-4 h-4 text-rose-600" />}
                  label="자동 손실분개"
                  value={counts?.lossJournals ?? 0}
                  unit="건"
                  subtitle={lossSum > 0 ? `총 ${lossSum.toLocaleString("ko-KR")}원` : undefined}
                />
                <MetricCard
                  icon={<ClipboardCheck className="w-4 h-4 text-purple-600" />}
                  label="자동 CAR"
                  value={counts?.cars ?? 0}
                  unit="건"
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* 최근 이탈 + 최근 CAR */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">최근 이탈 5건</CardTitle>
            </CardHeader>
            <CardContent>
              {(deviations?.length ?? 0) === 0 ? (
                <div className="text-sm text-muted-foreground py-6 text-center">
                  지난 기간 이탈 없음 (또는 평가기 비활성)
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>제목</TableHead>
                      <TableHead className="w-24">우선순위</TableHead>
                      <TableHead className="w-20 text-right">시각</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(deviations ?? []).map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="text-sm">{d.title}</TableCell>
                        <TableCell>
                          <Badge variant={priorityVariant[d.priority] ?? "default"} className="text-xs">
                            {d.priority}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-right text-muted-foreground">
                          {formatRelative(d.createdAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-baseline justify-between">
                <span>최근 자동 시정조치 5건</span>
                <Link href="/corrective-actions" className="text-xs text-primary font-normal underline">
                  전체 보기
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(cars?.length ?? 0) === 0 ? (
                <div className="text-sm text-muted-foreground py-6 text-center">
                  지난 기간 자동 등록된 CAR 없음 (또는 ENABLE_CCP_CAR 비활성)
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>CAR 번호</TableHead>
                      <TableHead className="w-20">상태</TableHead>
                      <TableHead className="w-24">우선순위</TableHead>
                      <TableHead className="w-20 text-right">시각</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(cars ?? []).map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="text-sm font-mono">{c.requestNumber}</TableCell>
                        <TableCell className="text-xs">
                          {statusLabel[c.status] ?? c.status}
                        </TableCell>
                        <TableCell>
                          <Badge variant={priorityVariant[c.priority] ?? "default"} className="text-xs">
                            {c.priority}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-right text-muted-foreground">
                          {formatRelative(c.createdAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}

function MetricCard(props: {
  icon: React.ReactNode;
  label: string;
  value: number;
  unit: string;
  highlight?: boolean;
  subtitle?: string;
}) {
  return (
    <div
      className={`p-4 rounded-lg border ${
        props.highlight ? "bg-orange-50 border-orange-200" : "bg-card"
      }`}
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
        {props.icon}
        <span>{props.label}</span>
      </div>
      <div className="text-2xl font-semibold">
        {props.value}
        <span className="text-sm text-muted-foreground ml-1">{props.unit}</span>
      </div>
      {props.subtitle && (
        <div className="text-xs text-muted-foreground mt-1">{props.subtitle}</div>
      )}
    </div>
  );
}

/**
 * 화장품 GMP 운영 대시보드 (Phase 2-10)
 *
 * 식품 F-3 운영 대시보드 (PR #143) 의 cosmetic 버전.
 * 8 모듈 활성화 상태 + 24h 작동 현황 + 최근 BMR/Release/IPC fail.
 *
 * 라우트: /dashboard/cosmetic/dashboard
 */

import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
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
  Sparkles,
  TestTube2,
  FlaskConical,
  Beaker,
  Tag,
  Truck,
  Thermometer,
  FileText,
  CheckCircle2,
  AlertCircle,
  XCircle,
} from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";

const MODULES = [
  { key: "bmr",       label: "BMR",            icon: Sparkles,      desc: "배치 제조 기록 (Phase 2-1)" },
  { key: "ipc",       label: "IPC 측정",        icon: TestTube2,     desc: "공정 중 품질 검증 (2-3)" },
  { key: "formula",   label: "배합표 (Formula)", icon: FlaskConical,  desc: "제품별 표준 배합 (2-4a)" },
  { key: "ingredient",label: "원료 투입",        icon: Beaker,        desc: "BMR 별 실측 (2-4b)" },
  { key: "label",     label: "라벨 / INCI",      icon: Tag,           desc: "KFDA § 19 표기 (2-5)" },
  { key: "release",   label: "QA 출고",          icon: Truck,         desc: "BMR + IPC 검증 후 출시 (2-6)" },
  { key: "stability", label: "안정성시험",       icon: Thermometer,   desc: "ICH Q1A 사용기한 결정 (2-8)" },
  { key: "kfda",      label: "KFDA 신고서 PDF", icon: FileText,      desc: "심사 자료 통합 (2-9)" },
] as const;

const STATUS_LABEL: Record<string, string> = {
  draft: "작성 중",
  approved: "승인",
  manufacturing: "제조 중",
  completed: "완료",
  rejected: "거절",
  active: "사용 중",
  deprecated: "구버전",
  pending: "대기",
  released: "출고",
  recalled: "회수",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  draft: "secondary",
  approved: "default",
  manufacturing: "default",
  completed: "default",
  rejected: "destructive",
  active: "default",
  deprecated: "destructive",
  pending: "secondary",
  released: "default",
  recalled: "destructive",
};

function formatRelative(date: any): string {
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

export default function CosmeticDashboard() {
  const { data: summary, isLoading } = trpc.cosmetic.dashboard.summary.useQuery(
    undefined,
    { refetchInterval: 60_000 },
  );
  const { data: bmrs } = trpc.cosmetic.dashboard.recentBmrs.useQuery(
    { limit: 5 },
    { refetchInterval: 60_000 },
  );
  const { data: releases } = trpc.cosmetic.dashboard.recentReleases.useQuery(
    { limit: 5 },
    { refetchInterval: 60_000 },
  );
  const { data: ipcFails } = trpc.cosmetic.dashboard.recentIpcFails.useQuery(
    { limit: 5 },
    { refetchInterval: 60_000 },
  );

  const counts = summary?.counts24h;
  const totals = summary?.totals;
  const alertsActive = summary?.flags?.alerts ?? false;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-pink-600" />
              화장품 GMP 운영 현황
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              제조 / 공정중관리 / 출고 등 8개 GMP 모듈 운영 상태
            </p>
          </div>
          <Badge variant={alertsActive ? "default" : "secondary"} className="text-sm">
            F-3 알림 {alertsActive ? "ON" : "OFF"}
          </Badge>
        </div>

        {/* 8 모듈 활성화 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">화장품 GMP 모듈</CardTitle>
            <CardDescription>
              KGMP / ISO 22716 기준 — Phase 2 lifecycle 8개 모듈 활성화 상태
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {MODULES.map((m) => {
                const Icon = m.icon;
                return (
                  <div
                    key={m.key}
                    className="p-3 rounded-lg border bg-emerald-50/40 border-emerald-200"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <Icon className="w-5 h-5 text-emerald-700" />
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div className="text-sm font-medium">{m.label}</div>
                    <div className="text-xs text-muted-foreground mt-1">{m.desc}</div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* 24h 카운트 + 누적 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">지난 24시간</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-sm text-muted-foreground py-4 text-center">
                  로딩 중...
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <Metric
                    label="BMR 신규"
                    value={counts?.bmrCreated ?? 0}
                    icon={<Sparkles className="w-4 h-4 text-pink-600" />}
                  />
                  <Metric
                    label="BMR 완료"
                    value={counts?.bmrCompleted ?? 0}
                    icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                  />
                  <Metric
                    label="IPC 부적합"
                    value={counts?.ipcFail ?? 0}
                    icon={<XCircle className="w-4 h-4 text-red-600" />}
                    highlight={(counts?.ipcFail ?? 0) > 0}
                  />
                  <Metric
                    label="출고 승인"
                    value={counts?.releaseApproved ?? 0}
                    icon={<Truck className="w-4 h-4 text-emerald-600" />}
                  />
                  <Metric
                    label="회수"
                    value={counts?.releaseRecalled ?? 0}
                    icon={<AlertCircle className="w-4 h-4 text-red-600" />}
                    highlight={(counts?.releaseRecalled ?? 0) > 0}
                  />
                  <Metric
                    label="안정성 관측"
                    value={counts?.stabilityObserved ?? 0}
                    icon={<Thermometer className="w-4 h-4 text-orange-600" />}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">누적 / 활성</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-sm text-muted-foreground py-4 text-center">
                  로딩 중...
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <Metric
                    label="BMR 총"
                    value={totals?.bmrTotal ?? 0}
                    icon={<Sparkles className="w-4 h-4 text-muted-foreground" />}
                  />
                  <Metric
                    label="active 배합표"
                    value={totals?.formulaActive ?? 0}
                    icon={<FlaskConical className="w-4 h-4 text-fuchsia-600" />}
                  />
                  <Metric
                    label="active 라벨"
                    value={totals?.labelActive ?? 0}
                    icon={<Tag className="w-4 h-4 text-rose-600" />}
                  />
                  <Metric
                    label="진행 중 안정성"
                    value={totals?.stabilityInProgress ?? 0}
                    icon={<Thermometer className="w-4 h-4 text-orange-600" />}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 최근 IPC fail (위로 — 우선 검토 필요) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-600" />
              최근 IPC 부적합 (우선 검토)
            </CardTitle>
            <CardDescription>
              부적합 IPC 5건 — BMR 검토 후 시정 또는 폐기 결정.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(ipcFails?.length ?? 0) === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                ✅ 부적합 IPC 0건
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>측정 항목</TableHead>
                    <TableHead className="w-32 text-right">한계</TableHead>
                    <TableHead className="w-24 text-right">측정값</TableHead>
                    <TableHead className="w-24">BMR</TableHead>
                    <TableHead className="w-24 text-right">시각</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(ipcFails ?? []).map((ipc) => (
                    <TableRow key={ipc.id} className="bg-red-50/40">
                      <TableCell className="text-sm">
                        {ipc.measurementLabel ?? ipc.measurementType}
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {ipc.expectedMin ?? "-"} ~ {ipc.expectedMax ?? "-"}
                        {ipc.unit ?? ""}
                      </TableCell>
                      <TableCell className="text-right text-xs font-mono">
                        {ipc.measuredValue ?? "-"}{ipc.unit ?? ""}
                      </TableCell>
                      <TableCell className="text-xs">
                        <Link
                          href={`/dashboard/cosmetic/bmr/${ipc.bmrId}`}
                          className="text-primary hover:underline"
                        >
                          #{ipc.bmrId}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {formatRelative(ipc.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* 최근 BMR + Release */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-baseline justify-between">
                <span>최근 BMR 5건</span>
                <Link
                  href="/dashboard/cosmetic/bmr"
                  className="text-xs text-primary font-normal underline"
                >
                  전체 보기
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(bmrs?.length ?? 0) === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  등록된 BMR 0건
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>코드</TableHead>
                      <TableHead className="w-24">상태</TableHead>
                      <TableHead className="w-20 text-right">시각</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(bmrs ?? []).map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="font-mono text-xs">
                          <Link
                            href={`/dashboard/cosmetic/bmr/${b.id}`}
                            className="text-primary hover:underline"
                          >
                            {b.bmrCode}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANT[b.status] ?? "default"} className="text-xs">
                            {STATUS_LABEL[b.status] ?? b.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {formatRelative(b.createdAt)}
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
                <span>최근 출고 5건</span>
                <Link
                  href="/dashboard/cosmetic/release"
                  className="text-xs text-primary font-normal underline"
                >
                  전체 보기
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(releases?.length ?? 0) === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  출고 0건
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>코드</TableHead>
                      <TableHead className="w-20 text-right">출고량</TableHead>
                      <TableHead className="w-24">상태</TableHead>
                      <TableHead className="w-20 text-right">시각</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(releases ?? []).map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-xs">
                          <Link
                            href={`/dashboard/cosmetic/release/${r.id}`}
                            className="text-primary hover:underline"
                          >
                            {r.releaseCode}
                          </Link>
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          {r.releaseQuantity.toLocaleString("ko-KR")} {r.releaseUnit}
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANT[r.status] ?? "default"} className="text-xs">
                            {STATUS_LABEL[r.status] ?? r.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {formatRelative(r.createdAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 알림 비활성 안내 (운영자용) */}
        {!alertsActive && (
          <Card className="bg-muted/30 border-dashed">
            <CardHeader>
              <CardTitle className="text-sm">실시간 알림 비활성</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-1">
              <p>
                현재 IPC 부적합 / 회수 발생 시 자동 알림이 비활성 상태입니다.
                활성화하려면 시스템 관리자에게 문의하세요.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}

function Metric(props: {
  label: string;
  value: number;
  icon: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={`p-3 rounded-lg border ${
        props.highlight ? "bg-red-50 border-red-200" : "bg-card"
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

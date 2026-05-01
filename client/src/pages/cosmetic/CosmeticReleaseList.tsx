/**
 * 화장품 QA 출고 목록 (Phase 2-6)
 *
 * 라우트: /dashboard/cosmetic/release
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Truck, FileCheck, AlertTriangle, ShieldCheck, ShieldX } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { CosmeticReleaseDialog } from "./CosmeticReleaseDialog";

const STATUS_OPTIONS = [
  { value: null, label: "전체" },
  { value: "pending", label: "검토 대기" },
  { value: "approved", label: "QA 승인" },
  { value: "released", label: "출고 완료" },
  { value: "recalled", label: "회수" },
] as const;

const STATUS_LABEL: Record<string, string> = {
  pending: "검토 대기",
  approved: "QA 승인",
  released: "출고 완료",
  recalled: "회수",
};
const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  pending: "secondary",
  approved: "default",
  released: "default",
  recalled: "destructive",
};

type StatusFilter = "pending" | "approved" | "released" | "recalled" | null;

export default function CosmeticReleaseList() {
  const [filter, setFilter] = useState<StatusFilter>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading, refetch } = trpc.cosmetic.release.list.useQuery(
    filter ? { status: filter } : undefined,
    { refetchInterval: 60_000 },
  );

  const items = data ?? [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Truck className="w-6 h-6 text-emerald-600" />
              QA 출고 (Release)
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              제조 완료된 화장품의 출고 검토 / 승인 / 출고 완료 / 회수를 관리합니다.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <FileCheck className="w-4 h-4 mr-1" />
            신규 출고 신청
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">상태 필터</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map((opt) => (
                <Button
                  key={opt.value ?? "all"}
                  variant={filter === opt.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilter(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-baseline justify-between">
              <span>출고 목록 {data ? `(${items.length}건)` : ""}</span>
              <span className="text-xs text-muted-foreground font-normal">자동 갱신 60초</span>
            </CardTitle>
            <CardDescription>
              검토 대기 → QA 승인 → 출고 완료 (필요 시 회수). QA 검증 결과는 코드 옆 아이콘으로 표시됩니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-sm text-muted-foreground py-8 text-center">로딩 중...</div>
            ) : items.length === 0 ? (
              <div className="py-12 text-center">
                <AlertTriangle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  {filter
                    ? `'${STATUS_LABEL[filter] ?? filter}' 상태 출고 0건`
                    : "출고 신청 0건"}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-44">출고 코드</TableHead>
                    <TableHead className="w-12 text-center">QA</TableHead>
                    <TableHead className="w-24 text-right">BMR</TableHead>
                    <TableHead className="text-right">출고량</TableHead>
                    <TableHead className="w-32">대상 시장</TableHead>
                    <TableHead className="w-24">사용기한</TableHead>
                    <TableHead className="w-28">상태</TableHead>
                    <TableHead className="w-28 text-right">신청일</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((r) => {
                    const qaPass = r.bmrCompletedCheck && r.ipcAllPassCheck;
                    return (
                      <TableRow key={r.id} className="hover:bg-muted/40">
                        <TableCell className="font-mono text-sm">
                          <Link
                            href={`/dashboard/cosmetic/release/${r.id}`}
                            className="text-primary hover:underline"
                          >
                            {r.releaseCode}
                          </Link>
                        </TableCell>
                        <TableCell className="text-center">
                          {qaPass ? (
                            <ShieldCheck className="w-4 h-4 text-emerald-600 inline" />
                          ) : (
                            <ShieldX className="w-4 h-4 text-amber-600 inline" />
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm">#{r.bmrId}</TableCell>
                        <TableCell className="text-right">
                          {r.releaseQuantity.toLocaleString("ko-KR")} {r.releaseUnit}
                        </TableCell>
                        <TableCell className="text-xs">{r.targetMarket ?? "-"}</TableCell>
                        <TableCell className="text-xs">
                          {r.expiryDate ? String(r.expiryDate).slice(0, 10) : "-"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANT[r.status] ?? "default"}>
                            {STATUS_LABEL[r.status] ?? r.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {r.createdAt
                            ? new Date(r.createdAt as any).toLocaleDateString("ko-KR")
                            : "-"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="bg-muted/30 border-dashed">
          <CardHeader>
            <CardTitle className="text-sm">자동 QA 검증 항목</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1">
            <p>• <strong>BMR 제조 완료</strong> — 제조기록서 상태가 완료여야 출고 가능</p>
            <p>• <strong>IPC 모두 합격</strong> — 공정중관리 측정값이 모두 한계 기준 이내</p>
            <p>• <strong>라벨 승인</strong> — 활성 라벨 확보 (KFDA 신고용)</p>
            <p>• <strong>안정성시험</strong> — 결과 확인 (해당 시)</p>
          </CardContent>
        </Card>
      </div>

      <CosmeticReleaseDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={refetch}
      />
    </DashboardLayout>
  );
}

/**
 * 화장품 BMR 목록 페이지 (Phase 2 Cosmetic GMP)
 *
 * 가시화: 화장품 GMP 의 첫 본격 화면 — BMR (Batch Manufacturing Record) 목록 + 상태 필터.
 * 실제 등록/승인/거절 등은 향후 PR 에서 detail 페이지 + dialog.
 *
 * 라우트: /dashboard/cosmetic/bmr
 * 메뉴 노출 조건: useIndustryFeatures().hasGMP === true (cosmetic / pharma 등)
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
import { Sparkles, FileCheck, AlertTriangle } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { CosmeticBmrDialog } from "./CosmeticBmrDialog";

const STATUS_OPTIONS = [
  { value: null, label: "전체" },
  { value: "draft", label: "작성 중" },
  { value: "approved", label: "QA 승인" },
  { value: "manufacturing", label: "제조 중" },
  { value: "completed", label: "제조 완료" },
  { value: "rejected", label: "거절" },
] as const;

const statusLabel: Record<string, string> = {
  draft: "작성 중",
  approved: "QA 승인",
  manufacturing: "제조 중",
  completed: "제조 완료",
  rejected: "거절",
};

const statusVariant: Record<string, "default" | "secondary" | "destructive"> = {
  draft: "secondary",
  approved: "default",
  manufacturing: "default",
  completed: "default",
  rejected: "destructive",
};

type StatusFilter =
  | "draft"
  | "approved"
  | "manufacturing"
  | "completed"
  | "rejected"
  | null;

export default function CosmeticBmrList() {
  const [filter, setFilter] = useState<StatusFilter>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading, refetch } = trpc.cosmetic.bmr.list.useQuery(
    filter ? { status: filter } : undefined,
    { refetchInterval: 60_000 },
  );

  const items = data?.items ?? [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-pink-600" />
              BMR (Batch Manufacturing Record)
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              화장품 GMP — 배치 제조 기록 lifecycle 관리 (Phase 2 첫 모듈)
            </p>
          </div>
          <Button variant="default" onClick={() => setCreateOpen(true)}>
            <FileCheck className="w-4 h-4 mr-1" />
            신규 BMR 등록
          </Button>
        </div>

        {/* 상태 필터 */}
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

        {/* BMR 목록 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-baseline justify-between">
              <span>
                BMR 목록 {data ? `(${items.length}건)` : ""}
              </span>
              <span className="text-xs text-muted-foreground font-normal">
                자동 갱신 60초
              </span>
            </CardTitle>
            <CardDescription>
              작성 중 → 승인 → 제조 중 → 완료 (또는 반려). 60초마다 자동 갱신됩니다.
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
                    ? `'${statusLabel[filter] ?? filter}' 상태의 BMR 0건`
                    : "등록된 BMR 0건"}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  우측 상단 "신규 BMR 등록" 버튼으로 첫 BMR 을 작성하세요.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-40">BMR 번호</TableHead>
                    <TableHead className="w-20 text-right">제품 ID</TableHead>
                    <TableHead className="text-right">계획량 (kg)</TableHead>
                    <TableHead className="text-right">실제량 (kg)</TableHead>
                    <TableHead className="w-28">상태</TableHead>
                    <TableHead className="w-32">제조일</TableHead>
                    <TableHead className="w-28 text-right">생성일</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((b) => (
                    <TableRow key={b.id} className="hover:bg-muted/40">
                      <TableCell className="font-mono text-sm">
                        <Link href={`/dashboard/cosmetic/bmr/${b.id}`} className="text-primary hover:underline">
                          {b.bmrCode}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right text-sm">#{b.productId}</TableCell>
                      <TableCell className="text-right">
                        {b.plannedQuantityKg.toLocaleString("ko-KR")}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {b.actualQuantityKg !== null
                          ? b.actualQuantityKg.toLocaleString("ko-KR")
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant[b.status] ?? "default"}>
                          {statusLabel[b.status] ?? b.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {b.manufacturingDate ? String(b.manufacturingDate).slice(0, 10) : "-"}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {b.createdAt
                          ? new Date(b.createdAt as any).toLocaleDateString("ko-KR")
                          : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* 연계 모듈 안내 */}
        <Card className="bg-muted/30 border-dashed">
          <CardHeader>
            <CardTitle className="text-sm">연계 모듈</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1">
            <p>• <strong>IPC 측정값 기록</strong> — 공정 중 품질 검증</p>
            <p>• <strong>처방 (Formula / 원료 투입) 관리</strong> — 배합표 기준 + 실측 비교</p>
            <p>• <strong>라벨 / 전성분 (INCI)</strong> — KFDA 표시 의무 자동화</p>
            <p>• <strong>QA 출고 (Release) 승인</strong> — 제조 완료 후 시장 출시 워크플로</p>
          </CardContent>
        </Card>
      </div>

      {/* 신규 BMR dialog */}
      <CosmeticBmrDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        onSuccess={refetch}
      />
    </DashboardLayout>
  );
}

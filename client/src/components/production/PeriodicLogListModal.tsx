/**
 * 주간·월간일지 목록 (2026-10-14 — 끊긴 API 정리)
 *
 * 이전: Weekly/MonthlyHygieneLogListModal 이 폐기된 구형 API(getHygiene·approveHygiene·deleteHygiene·rejectHygiene)를 불러
 *       "리스트 보기"가 항상 빈 목록이었고 승인·반려·삭제 버튼은 오류였다.
 * 이후: 새 양식(saveFullForm)으로 저장된 일지를 weeklyLog.list / monthlyLog.list 로 보여 주고,
 *       행을 누르면 해당 날짜의 작성 화면(/weekly-log/form?date=…)을 연다.
 *       결재(승인·반려)는 기존 결재 흐름 그대로 — 작성 화면의 결재 요청 → 승인 관리.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";

type Kind = "weekly" | "monthly";

const META: Record<Kind, { title: string; formPath: string }> = {
  weekly: { title: "주간일지 목록", formPath: "/weekly-log/form" },
  monthly: { title: "월간일지 목록", formPath: "/monthly-log/form" },
};

const APPROVAL_LABEL: Record<string, { label: string; className: string }> = {
  approved: { label: "승인", className: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "반려", className: "bg-red-100 text-red-700" },
  pending: { label: "결재 대기", className: "bg-amber-100 text-amber-700" },
  pending_writer: { label: "작성자 확인", className: "bg-amber-100 text-amber-700" },
  pending_review: { label: "검토 대기", className: "bg-amber-100 text-amber-700" },
  pending_approval: { label: "승인 대기", className: "bg-amber-100 text-amber-700" },
};

export function PeriodicLogListModal({ kind, open, onClose }: { kind: Kind; open: boolean; onClose: () => void }) {
  const [, navigate] = useLocation();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const input = { startDate: startDate || undefined, endDate: endDate || undefined, limit: 100, offset: 0 };
  const weekly = trpc.weeklyLog.list.useQuery(input, { enabled: open && kind === "weekly" });
  const monthly = trpc.monthlyLog.list.useQuery(input, { enabled: open && kind === "monthly" });
  const q = kind === "weekly" ? weekly : monthly;
  const rows = ((q.data ?? []) as any[]);
  const meta = META[kind];

  const openForm = (date: string) => {
    onClose();
    navigate(`${meta.formPath}?date=${encodeURIComponent(date)}`);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{meta.title}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">시작일</span>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9 w-40" />
          </div>
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">종료일</span>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9 w-40" />
          </div>
          {(startDate || endDate) && (
            <Button variant="ghost" size="sm" onClick={() => { setStartDate(""); setEndDate(""); }}>초기화</Button>
          )}
        </div>

        {q.isLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">불러오는 중…</p>
        ) : q.error ? (
          <p className="py-10 text-center text-sm text-red-600">목록을 불러오지 못했습니다: {q.error.message}</p>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">저장된 일지가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>일자</TableHead>
                  <TableHead>제목</TableHead>
                  <TableHead>작성자</TableHead>
                  <TableHead>결재</TableHead>
                  <TableHead className="text-right">열기</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const ap = r.approval_status ? APPROVAL_LABEL[r.approval_status] ?? { label: r.approval_status, className: "bg-slate-100 text-slate-700" } : null;
                  return (
                    <TableRow key={r.id} className="cursor-pointer" onClick={() => openForm(r.log_date)}>
                      <TableCell className="font-mono text-sm">{r.log_date}</TableCell>
                      <TableCell className="text-sm">{r.title || "-"}</TableCell>
                      <TableCell className="text-sm">{r.creator_name || "-"}</TableCell>
                      <TableCell>{ap ? <Badge className={ap.className}>{ap.label}</Badge> : <span className="text-xs text-muted-foreground">요청 전</span>}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); openForm(r.log_date); }}>열기</Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">결재 요청은 일지 작성 화면에서, 승인·반려는 승인 관리에서 처리합니다.</p>
      </DialogContent>
    </Dialog>
  );
}

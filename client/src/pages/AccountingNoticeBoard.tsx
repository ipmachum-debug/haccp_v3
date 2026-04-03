/**
 * 회계 - 사내공지보드
 * 회계탭에서 접근하는 공지보드 (회계/재무 관련 공지 + 전체 공지)
 * DashboardLayout 감싸기 + 기존 board API 재사용
 */
import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Megaphone, ClipboardList, Pin, CheckCircle2, User, Loader2,
  Plus, X, Pencil, Trash2, Bell
} from "lucide-react";

const typeConfig: Record<string, { label: string; emoji: string; color: string; bg: string }> = {
  notice: { label: "공지", emoji: "📢", color: "text-blue-700", bg: "bg-blue-50 border-l-blue-500" },
  work: { label: "작업지시", emoji: "📋", color: "text-amber-700", bg: "bg-amber-50 border-l-amber-500" },
  handover: { label: "전달사항", emoji: "📌", color: "text-emerald-700", bg: "bg-emerald-50 border-l-emerald-500" },
};

export default function AccountingNoticeBoard() {
  const { isAdmin } = useAuth();
  const [selectedType, setSelectedType] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [newType, setNewType] = useState("notice");
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");

  const { data: items = [], refetch, isLoading } = trpc.board.getBoardItems.useQuery(
    { type: selectedType as any },
    { refetchInterval: 30000 }
  );
  const { data: stats, refetch: refetchStats } = trpc.board.getBoardStats.useQuery(undefined, { refetchInterval: 30000 });

  const ackMutation = trpc.board.ackLog.useMutation({
    onSuccess: (r: any) => {
      toast.success(r.alreadyAcked ? "이미 확인됨" : "확인 완료!");
      refetch();
    },
  });
  const createMutation = trpc.board.createNotice.useMutation({
    onSuccess: () => {
      toast.success("등록 완료!");
      setNewContent(""); setNewTitle(""); setShowForm(false);
      refetch(); refetchStats();
    },
  });
  const deleteMutation = trpc.board.deleteNotice.useMutation({
    onSuccess: () => { toast.success("삭제 완료!"); refetch(); refetchStats(); },
  });

  const s = stats || { total: 0, notice: 0, work: 0, handover: 0 };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-5">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Bell className="h-5 w-5 text-blue-600" />
              사내 공지보드
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">전 직원 공지사항 및 작업지시</p>
          </div>
          {isAdmin && (
            <Button onClick={() => setShowForm(!showForm)} variant={showForm ? "outline" : "default"} size="sm">
              {showForm ? <><X className="h-4 w-4 mr-1" />닫기</> : <><Plus className="h-4 w-4 mr-1" />새 공지</>}
            </Button>
          )}
        </div>

        {/* 통계 */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "전체", count: s.total, color: "text-gray-700", bg: "bg-gray-50" },
            { label: "공지", count: s.notice, color: "text-blue-700", bg: "bg-blue-50" },
            { label: "작업", count: s.work, color: "text-amber-700", bg: "bg-amber-50" },
            { label: "전달", count: s.handover, color: "text-emerald-700", bg: "bg-emerald-50" },
          ].map((c) => (
            <div key={c.label} className={`${c.bg} rounded-lg border p-3 text-center`}>
              <p className="text-xs text-gray-500">{c.label}</p>
              <p className={`text-xl font-bold ${c.color}`}>{c.count}</p>
            </div>
          ))}
        </div>

        {/* 필터 탭 */}
        <div className="flex gap-2">
          {[
            { key: "all", label: "전체" },
            { key: "notice", label: "📢 공지" },
            { key: "work", label: "📋 작업" },
            { key: "handover", label: "📌 전달" },
          ].map((t) => (
            <Button
              key={t.key}
              variant={selectedType === t.key ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedType(t.key)}
              className="text-xs"
            >
              {t.label}
            </Button>
          ))}
        </div>

        {/* 작성 폼 */}
        {showForm && isAdmin && (
          <div className="bg-white border rounded-xl p-5 space-y-3 shadow-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold text-gray-600">분류</Label>
                <Select value={newType} onValueChange={setNewType}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="notice">📢 공지</SelectItem>
                    <SelectItem value="work">📋 작업지시</SelectItem>
                    <SelectItem value="handover">📌 전달사항</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-bold text-gray-600">제목</Label>
                <Input value={newTitle} onChange={(e: any) => setNewTitle(e.target.value)} placeholder="제목 (선택)" className="mt-1" />
              </div>
            </div>
            <Textarea value={newContent} onChange={(e: any) => setNewContent(e.target.value)} placeholder="내용을 입력하세요..." rows={3} />
            <div className="flex justify-end">
              <Button onClick={() => {
                if (!newContent.trim()) { toast.error("내용을 입력하세요"); return; }
                createMutation.mutate({ type: newType as any, content: newContent.trim(), title: newTitle.trim() || undefined });
              }} disabled={createMutation.isPending}>
                {createMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                등록
              </Button>
            </div>
          </div>
        )}

        {/* 게시글 리스트 */}
        <div className="space-y-3">
          {isLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>
          ) : (items as any[]).length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Megaphone className="h-10 w-10 mx-auto mb-3 text-gray-300" />
              <p className="font-medium">등록된 공지가 없습니다</p>
            </div>
          ) : (
            (items as any[]).map((item: any) => {
              const cfg = typeConfig[item.logType] || typeConfig.notice;
              const isAcked = Number(item.myAck) > 0;
              const ackCount = Number(item.ackCount) || 0;
              const totalUsers = Number(item.totalUsers) || 0;

              return (
                <div key={item.id} className={`bg-white rounded-xl border border-l-4 ${cfg.bg} p-4 shadow-sm`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`${cfg.color} text-[11px]`}>{cfg.emoji} {cfg.label}</Badge>
                      <span className="text-[11px] text-gray-400">
                        {new Date(item.createdAt).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {isAdmin && (
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                          onClick={() => { if (confirm("삭제?")) deleteMutation.mutate({ id: item.id }); }}>
                          <Trash2 className="h-3.5 w-3.5 text-gray-400" />
                        </Button>
                      )}
                    </div>
                  </div>
                  {item.title && <h3 className="font-bold text-gray-900 mb-1">{item.title}</h3>}
                  <p className="text-sm text-gray-600 whitespace-pre-wrap mb-3">{item.content}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <User className="h-3 w-3" /> {item.authorName || "관리자"}
                      <span>· 확인 {ackCount}/{totalUsers}</span>
                    </div>
                    <Button
                      size="sm"
                      variant={isAcked ? "outline" : "default"}
                      disabled={isAcked}
                      onClick={() => ackMutation.mutate({ logId: item.id })}
                      className="h-8 text-xs"
                    >
                      {isAcked ? <><CheckCircle2 className="h-3.5 w-3.5 mr-1" />확인완료</> : "확인"}
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

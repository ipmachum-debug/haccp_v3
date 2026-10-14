/**
 * HACCP 체크리스트 — 시작 화면 (일지 PR 3, 2026-10-15) · /quality/checklists
 *
 * 이전: 33종 양식마다 "리스트 보기 · 작성하기" 카드 (지금은 /quality/checklists/classic 에 그대로 보존)
 * 지금: [오늘] [작성 기록] [새 일지 작성] [관리]
 *  - 오늘: 내 즐겨찾기(이름=기록 목록, ✎=새 작성, 순서 위/아래) · 오늘 작성된 기록 · 내 작성중·반려
 *          일정 데이터가 없는 양식을 "미작성" 으로 판정하지 않는다 — 오늘 기록이 있으면 있다고만 표시
 *  - 작성 기록: 전 양식 통합 검색 (종류·기간·작성자·상태) — 주소에 필터 유지
 *  - 새 일지 작성: 양식 고르기 한 곳 (주기 필터·검색·별표). 작성은 각 양식의 기존 /new 주소 → 자동 채움 정책(PR 2) 공통
 *  - 관리(관리자): 양식 템플릿·결재 설정·옛 전체 화면 등 기존 관리 화면으로
 * 즐겨찾기: 회사·사용자별 서버 저장 (양식 식별자만). 메뉴 즐겨찾기와 별개 — 서로 변환하지 않는다.
 */
import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { PageHeader } from "@/components/common/PageHeader";
import { FilterBar, useUrlFilters } from "@/components/common/FilterBar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useTabWithUrl } from "@/hooks/useTabWithUrl";
import { notify } from "@/lib/notify";
import { todayLocal, offsetLocalDate } from "@/lib/dateUtils";
import { CHECKLIST_CATEGORIES, CHECKLIST_ITEMS, CYCLE_LABELS, FORM_TYPE_LABELS, type ChecklistCycle } from "@/lib/checklist/catalog";
import { PERIODIC_LOGS, STATUS_LABEL, filterCatalog, moveFavorite, recordHref, resolveFavorites, toggleFavorite } from "@/lib/checklist/home";
import { ArrowDown, ArrowUp, ChevronRight, ClipboardList, FilePlus2, History, PenSquare, Settings, Star } from "lucide-react";

const STATUS_CLS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700", submitted: "bg-amber-100 text-amber-800", approved: "bg-emerald-100 text-emerald-800", rejected: "bg-red-100 text-red-700",
};

function StatusChip({ status }: { status: string }) {
  return <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_CLS[status] ?? "bg-gray-100"}`}>{STATUS_LABEL[status] ?? status}</span>;
}

type RecordRow = { id: number; formType: string; formDate: string; title: string | null; status: string; writerName: string | null };

function RecordList({ rows, empty, onOpen }: { rows: RecordRow[]; empty: string; onOpen: (r: RecordRow) => void }) {
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y">
      {rows.map((r) => (
        <li key={r.id}>
          <button type="button" className="flex w-full items-center gap-2 px-1 py-2 text-left text-sm hover:bg-muted/50" onClick={() => onOpen(r)} data-testid="record-row">
            <span className="w-24 shrink-0 tabular-nums text-muted-foreground">{r.formDate}</span>
            <span className="min-w-0 flex-1 truncate">
              <span className="font-medium">{FORM_TYPE_LABELS[r.formType] ?? r.formType}</span>
              {r.writerName && <span className="text-muted-foreground"> · {r.writerName}</span>}
            </span>
            <StatusChip status={r.status} />
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function ChecklistHome() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const [, navigate] = useLocation();
  const [tab, setTab] = useTabWithUrl("tab", "today");
  const today = todayLocal();
  const utils = trpc.useUtils();

  // ── 즐겨찾기 (회사·사용자별) ──
  const favQ = trpc.checklistHome.favorites.useQuery(undefined, { staleTime: 60_000 });
  const favIds = favQ.data?.items ?? [];
  const setFav = trpc.checklistHome.setFavorites.useMutation({
    onMutate: async ({ items }: { items: string[] }) => {
      await utils.checklistHome.favorites.cancel();
      const prev = utils.checklistHome.favorites.getData();
      utils.checklistHome.favorites.setData(undefined, { items });
      return { prev };
    },
    onError: (e: unknown, _v: unknown, c: { prev?: { items: string[] } } | undefined) => { if (c?.prev) utils.checklistHome.favorites.setData(undefined, c.prev); notify.error("즐겨찾기 저장 실패", e); },
    onSettled: () => utils.checklistHome.favorites.invalidate(),
  });
  const saveFav = (items: string[]) => setFav.mutate({ items });
  const favorites = useMemo(() => resolveFavorites(favIds), [favIds]);

  const openRecord = (r: RecordRow) => {
    const href = recordHref(r.formType, r.id);
    if (href) navigate(href); else notify.info("이 기록은 기존 전체 화면에서 열 수 있습니다.");
  };

  // ── 오늘 ──
  const todayQ = trpc.checklistHome.records.useQuery({ from: today, to: today, page: 1, pageSize: 100 }, { enabled: tab === "today" });
  const mineDraftQ = trpc.checklistHome.records.useQuery({ mine: true, status: "draft", from: offsetLocalDate(-30), page: 1, pageSize: 20 }, { enabled: tab === "today" });
  const mineRejectedQ = trpc.checklistHome.records.useQuery({ mine: true, status: "rejected", from: offsetLocalDate(-90), page: 1, pageSize: 20 }, { enabled: tab === "today" });
  const todayByType = useMemo(() => {
    const m = new Map<string, RecordRow[]>();
    for (const r of (todayQ.data?.items ?? []) as RecordRow[]) m.set(r.formType, [...(m.get(r.formType) ?? []), r]);
    return m;
  }, [todayQ.data]);

  // ── 작성 기록 (주소에 필터) ──
  const [f, setF, resetF] = useUrlFilters({ type: "", from: offsetLocalDate(-30), to: today, writer: "", status: "", page: "1" });
  const page = Math.max(1, Number(f.page) || 1);
  const recordsQ = trpc.checklistHome.records.useQuery(
    {
      formTypes: f.type ? [f.type] : undefined, from: f.from || undefined, to: f.to || undefined,
      writer: f.writer || undefined, status: (f.status || undefined) as "draft" | "submitted" | "approved" | "rejected" | undefined, page, pageSize: 30,
    },
    { enabled: tab === "records", placeholderData: (prev: unknown) => prev as any },
  );
  const totalPages = Math.max(1, Math.ceil((recordsQ.data?.total ?? 0) / 30));
  const typeOptions = useMemo(() => Object.entries(FORM_TYPE_LABELS).sort((a, b) => a[1].localeCompare(b[1], "ko")), []);

  // ── 새 일지 작성 ──
  const [q, setQ] = useState("");
  const [cycle, setCycle] = useState<ChecklistCycle | "all">("all");
  const periodic = PERIODIC_LOGS.filter((p) => (cycle === "all" || p.cycle === cycle) && (!q.trim() || p.title.includes(q.trim())));

  const FavStar = ({ id, title }: { id: string; title: string }) => {
    const on = favIds.includes(id);
    return (
      <button type="button" aria-label={on ? `${title} 즐겨찾기 해제` : `${title} 즐겨찾기`} aria-pressed={on}
        className="rounded p-1 hover:bg-muted" onClick={() => saveFav(toggleFavorite(favIds, id))} data-testid={`fav-${id}`}>
        <Star className={`h-4 w-4 ${on ? "fill-amber-400 text-amber-500" : "text-muted-foreground"}`} />
      </button>
    );
  };

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-5xl">
        <PageHeader
          title="HACCP 체크리스트"
          description="오늘 쓸 일지와 작성한 기록을 한 곳에서. 새 일지는 최근 기록을 참고해 채워집니다 (판정·측정값은 오늘 다시 확인)."
          primary={{ label: "새 일지 작성", icon: FilePlus2, onClick: () => setTab("new") }}
        />
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-4 flex w-full flex-wrap justify-start">
            <TabsTrigger value="today" data-testid="tab-today">오늘</TabsTrigger>
            <TabsTrigger value="records" data-testid="tab-records">작성 기록</TabsTrigger>
            <TabsTrigger value="new" data-testid="tab-new">새 일지 작성</TabsTrigger>
            {isAdmin && <TabsTrigger value="manage" data-testid="tab-manage">관리</TabsTrigger>}
          </TabsList>

          {/* ─────────── 오늘 ─────────── */}
          <TabsContent value="today" className="space-y-4">
            <section className="rounded-xl border bg-card p-3" data-testid="favorites">
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Star className="h-4 w-4 text-amber-500" />내 즐겨찾기</h2>
              {favQ.isLoading ? (
                <p className="py-4 text-center text-sm text-muted-foreground">불러오는 중…</p>
              ) : favorites.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  자주 쓰는 양식을 <button type="button" className="underline" onClick={() => setTab("new")}>새 일지 작성</button> 에서 ☆ 로 추가하세요.
                </p>
              ) : (
                <ul className="divide-y">
                  {favorites.map((it, idx) => {
                    const todays = it.formType ? todayByType.get(it.formType) ?? [] : [];
                    const Icon = it.icon;
                    return (
                      <li key={it.id} className="flex items-center gap-2 py-2" data-testid="fav-row">
                        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <Link href={it.listPath} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline" data-testid="fav-name">{it.title}</Link>
                        {todays.length > 0 && (
                          <button type="button" className="hidden text-xs text-emerald-700 hover:underline sm:inline" onClick={() => openRecord(todays[0])}>
                            오늘 기록 {todays.length}건 · {STATUS_LABEL[todays[0].status] ?? todays[0].status}
                          </button>
                        )}
                        <span className="hidden text-[11px] text-muted-foreground sm:inline">{CYCLE_LABELS[it.cycle]}</span>
                        <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`${it.title} 위로`} disabled={idx === 0} onClick={() => saveFav(moveFavorite(favIds, it.id, -1))}><ArrowUp className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`${it.title} 아래로`} disabled={idx === favorites.length - 1} onClick={() => saveFav(moveFavorite(favIds, it.id, 1))}><ArrowDown className="h-4 w-4" /></Button>
                        <Button size="sm" className="h-8" onClick={() => navigate(it.createPath)} aria-label={`${it.title} 새로 작성`} data-testid="fav-create"><PenSquare className="mr-1 h-3.5 w-3.5" />작성</Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <div className="grid gap-4 md:grid-cols-2">
              <section className="rounded-xl border bg-card p-3" data-testid="today-records">
                <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold"><ClipboardList className="h-4 w-4" />오늘 작성된 기록 <span className="text-muted-foreground">({todayQ.data?.total ?? 0})</span></h2>
                <RecordList rows={(todayQ.data?.items ?? []) as RecordRow[]} empty={todayQ.isLoading ? "불러오는 중…" : "오늘 작성된 기록이 없습니다."} onOpen={openRecord} />
              </section>
              <section className="rounded-xl border bg-card p-3" data-testid="my-pending">
                <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold"><History className="h-4 w-4" />내가 이어서 할 일</h2>
                <p className="mb-1 text-xs text-muted-foreground">작성중(최근 30일)·반려(최근 90일) 기록</p>
                <RecordList
                  rows={[...((mineRejectedQ.data?.items ?? []) as RecordRow[]), ...((mineDraftQ.data?.items ?? []) as RecordRow[])]}
                  empty={mineDraftQ.isLoading ? "불러오는 중…" : "이어서 할 기록이 없습니다."}
                  onOpen={openRecord}
                />
              </section>
            </div>
          </TabsContent>

          {/* ─────────── 작성 기록 ─────────── */}
          <TabsContent value="records">
            <FilterBar onReset={resetF}>
              <select className="h-9 rounded-md border bg-background px-2 text-sm" value={f.type} onChange={(e) => setF({ type: e.target.value, page: "1" })} aria-label="일지 종류" data-testid="filter-type">
                <option value="">전체 종류</option>
                {typeOptions.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <Input type="date" className="h-9 w-40" value={f.from} onChange={(e) => setF({ from: e.target.value, page: "1" })} aria-label="시작일" />
              <span className="text-muted-foreground">~</span>
              <Input type="date" className="h-9 w-40" value={f.to} onChange={(e) => setF({ to: e.target.value, page: "1" })} aria-label="종료일" />
              <Input className="h-9 w-32" placeholder="작성자" value={f.writer} onChange={(e) => setF({ writer: e.target.value, page: "1" })} aria-label="작성자" data-testid="filter-writer" />
              <select className="h-9 rounded-md border bg-background px-2 text-sm" value={f.status} onChange={(e) => setF({ status: e.target.value, page: "1" })} aria-label="상태" data-testid="filter-status">
                <option value="">전체 상태</option>
                {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </FilterBar>
            <div className="rounded-xl border bg-card p-2" data-testid="records-list">
              <div className="px-1 pb-1 text-xs text-muted-foreground">{recordsQ.data ? `${recordsQ.data.total}건` : "불러오는 중…"}</div>
              <RecordList rows={(recordsQ.data?.items ?? []) as RecordRow[]} empty={recordsQ.isLoading ? "불러오는 중…" : "조건에 맞는 기록이 없습니다."} onOpen={openRecord} />
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-2 text-sm">
                  <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setF({ page: String(page - 1) })}>이전</Button>
                  <span className="tabular-nums">{page} / {totalPages}</span>
                  <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setF({ page: String(page + 1) })}>다음</Button>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ─────────── 새 일지 작성 ─────────── */}
          <TabsContent value="new" className="space-y-4">
            <FilterBar search={{ value: q, onChange: setQ, placeholder: "양식 이름 검색" }}>
              {(["all", "daily", "weekly", "monthly", "asNeeded"] as const).map((c) => (
                <Button key={c} size="sm" variant={cycle === c ? "default" : "outline"} className="h-8" onClick={() => setCycle(c)} data-testid={`cycle-${c}`}>
                  {c === "all" ? "전체" : CYCLE_LABELS[c]}
                </Button>
              ))}
            </FilterBar>
            <p className="text-xs text-muted-foreground">주기는 분류 표시입니다 (작성 일정이 아님). 이름을 누르면 그 양식의 기록 목록, <b>작성</b>을 누르면 새 일지 — 최근 기록을 참고해 채웁니다.</p>

            {periodic.length > 0 && (
              <section className="rounded-xl border bg-card p-3">
                <h2 className="mb-1 text-sm font-semibold">주기 일지</h2>
                <ul className="divide-y">
                  {periodic.map((p) => (
                    <li key={p.id} className="flex items-center gap-2 py-2">
                      <Link href={p.listPath} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">{p.title}</Link>
                      <span className="text-[11px] text-muted-foreground">{CYCLE_LABELS[p.cycle]}</span>
                      <Button size="sm" className="h-8" onClick={() => navigate(p.createPath)}><PenSquare className="mr-1 h-3.5 w-3.5" />작성</Button>
                    </li>
                  ))}
                  <li className="py-2 text-xs text-muted-foreground">연간·특정기간 일지는 <Link href="/quality/checklists/classic" className="underline">기존 전체 화면</Link>에서 작성합니다.</li>
                </ul>
              </section>
            )}

            {CHECKLIST_CATEGORIES.map((cat) => {
              const items = filterCatalog(cat.items, q, cycle);
              if (items.length === 0) return null;
              const CatIcon = cat.icon;
              return (
                <section key={cat.id} className="rounded-xl border bg-card p-3" data-testid={`cat-${cat.id}`}>
                  <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold"><CatIcon className={`h-4 w-4 ${cat.color}`} />{cat.title}</h2>
                  <ul className="divide-y">
                    {items.map((it) => (
                      <li key={it.id} className="flex items-center gap-2 py-2" data-testid="catalog-row">
                        <FavStar id={it.id} title={it.title} />
                        <div className="min-w-0 flex-1">
                          <Link href={it.listPath} className="block truncate text-sm font-medium hover:underline">{it.title}</Link>
                          <span className="block truncate text-xs text-muted-foreground">{it.description}</span>
                        </div>
                        <span className="text-[11px] text-muted-foreground">{CYCLE_LABELS[it.cycle]}</span>
                        <Button size="sm" className="h-8" onClick={() => navigate(it.createPath)} aria-label={`${it.title} 새로 작성`}><PenSquare className="mr-1 h-3.5 w-3.5" />작성</Button>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
            {CHECKLIST_ITEMS.length > 0 && CHECKLIST_CATEGORIES.every((c) => filterCatalog(c.items, q, cycle).length === 0) && (
              <p className="py-6 text-center text-sm text-muted-foreground">조건에 맞는 양식이 없습니다.</p>
            )}
          </TabsContent>

          {/* ─────────── 관리 (관리자) ─────────── */}
          {isAdmin && (
            <TabsContent value="manage">
              <section className="rounded-xl border bg-card p-3">
                <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Settings className="h-4 w-4" />양식·결재 관리 (관리자)</h2>
                <ul className="divide-y text-sm">
                  {[
                    { href: "/quality/templates", label: "체크리스트 템플릿 관리", desc: "점검 항목·양식 구성" },
                    { href: "/document-approval-settings", label: "문서 결재 설정", desc: "양식별 작성자·검토자·승인자 자동 지정" },
                    { href: "/quality/checklists/classic", label: "기존 전체 화면", desc: "33종 카드 · 주기 일지(연간·특정기간 포함) · 순서 편집" },
                    { href: "/dashboard/checklist/employee-health", label: "건강진단결과서 관리", desc: "보건증 만료 관리" },
                    { href: "/calibration", label: "검교정 관리", desc: "계측기 검교정 일정·기록" },
                  ].map((l) => (
                    <li key={l.href}>
                      <Link href={l.href} className="flex items-center gap-2 py-2 hover:underline">
                        <span className="font-medium">{l.label}</span>
                        <span className="text-xs text-muted-foreground">{l.desc}</span>
                        <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            </TabsContent>
          )}
        </Tabs>
        {favQ.isError && <Badge variant="destructive" className="mt-2">즐겨찾기를 불러오지 못했습니다</Badge>}
      </div>
    </DashboardLayout>
  );
}

#!/usr/bin/env python3
"""
TimeProfileDialog와 ProductTimeProfileMapDialog를 완전히 재작성하는 스크립트.

새 설계:
1. TimeProfileDialog
   - ccp_process_groups 목록을 불러와서 그룹별 time_min, time_max 인라인 편집
   - 프로파일명 = 공정그룹명 자동 적용
   - updateProcessGroup API 사용

2. ProductTimeProfileMapDialog
   - 공정그룹별로 매핑된 제품 목록과 적용 시간 결과를 보여주는 읽기전용 결과 뷰
   - getProcessGroups + ccp_process_group_products 기반
"""

import re

TARGET = "/home/root/webapp/CCPLimitsManagement_pages_cur.tsx"

# ─── 새 TimeProfileDialog ───────────────────────────────────────────────────
NEW_TIME_PROFILE_DIALOG = '''// ========== 시간 프로파일 관리 다이얼로그 (공정그룹 기반 직접 편집) ==========
function TimeProfileDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<{
    timeMin: string;
    timeMax: string;
    description: string;
  }>({ timeMin: "", timeMax: "", description: "" });

  // 공정그룹 목록 조회 (시간 데이터 포함)
  const { data: processGroupsRaw, refetch } = trpc.ccpMonitoring.getProcessGroups.useQuery(undefined);
  const processGroups: any[] = Array.isArray(processGroupsRaw) ? processGroupsRaw : [];

  const updateMutation = trpc.ccpMonitoring.updateProcessGroup.useMutation({
    onSuccess: () => {
      toast.success("시간 설정이 저장되었습니다");
      refetch();
      setEditingId(null);
    },
    onError: (err) => toast.error("저장 실패: " + err.message),
  });

  const startEdit = (group: any) => {
    setEditingId(group.id);
    setEditForm({
      timeMin: group.time_min?.toString() ?? "",
      timeMax: group.time_max?.toString() ?? "",
      description: group.description ?? "",
    });
  };

  const handleSave = (group: any) => {
    if (!editForm.timeMin) {
      toast.error("최소 시간(분)을 입력하세요");
      return;
    }
    updateMutation.mutate({
      id: group.id,
      name: group.name,
      ccpType: group.ccp_type,
      timeMin: Number(editForm.timeMin),
      timeMax: editForm.timeMax ? Number(editForm.timeMax) : undefined,
      description: editForm.description || undefined,
    });
  };

  // CCP 타입별 배경색
  const ccpBadgeClass = (type: string) => {
    if (type === "CCP-1B") return "bg-red-100 text-red-700 border-red-200";
    if (type === "CCP-2B") return "bg-blue-100 text-blue-700 border-blue-200";
    if (type === "CCP-3B") return "bg-yellow-100 text-yellow-700 border-yellow-200";
    if (type === "CCP-4P") return "bg-green-100 text-green-700 border-green-200";
    return "bg-gray-100 text-gray-700 border-gray-200";
  };

  // 시간 설정이 있는 그룹만 (CCP-4P 제외 — 금속검출은 시간 없음)
  const timeGroups = processGroups.filter((g: any) => g.ccp_type !== "CCP-4P");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-600" />
            공정별 시간 설정 관리
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* 안내 배너 */}
          <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
            <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
              각 공정 그룹의 <strong>기준 운영 시간</strong>을 직접 수정합니다.
              프로파일명은 공정 그룹명으로 자동 적용됩니다.
              배치 생성 시 <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">시간(분)</code>이 자동으로 적용됩니다.
            </p>
          </div>

          {/* 공정그룹 카드 목록 */}
          {timeGroups.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              등록된 공정 그룹이 없습니다
            </div>
          ) : (
            <div className="space-y-2">
              {timeGroups.map((group: any) => (
                <div
                  key={group.id}
                  className="border rounded-lg p-4 bg-white dark:bg-gray-950 hover:border-blue-300 transition-colors"
                >
                  {editingId === group.id ? (
                    /* 편집 모드 */
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge className={`text-xs ${ccpBadgeClass(group.ccp_type)}`}>
                          {group.ccp_type}
                        </Badge>
                        <span className="font-semibold text-sm">{group.name}</span>
                        <span className="text-xs text-muted-foreground ml-auto">프로파일명: {group.name} (자동적용)</span>
                      </div>
                      <div className="flex gap-3 items-end">
                        <div className="w-[120px]">
                          <Label className="text-xs font-medium mb-1 block">
                            최소 시간(분) <span className="text-red-500">*</span>
                          </Label>
                          <Input
                            type="number"
                            min={1}
                            value={editForm.timeMin}
                            onChange={(e) => setEditForm({ ...editForm, timeMin: e.target.value })}
                            className="h-8 text-sm"
                            placeholder="10"
                          />
                        </div>
                        <div className="w-[120px]">
                          <Label className="text-xs font-medium mb-1 block">최대 시간(분)</Label>
                          <Input
                            type="number"
                            min={1}
                            value={editForm.timeMax}
                            onChange={(e) => setEditForm({ ...editForm, timeMax: e.target.value })}
                            className="h-8 text-sm"
                            placeholder="선택"
                          />
                        </div>
                        <div className="flex-1">
                          <Label className="text-xs font-medium mb-1 block">메모 (선택)</Label>
                          <Input
                            value={editForm.description}
                            onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                            className="h-8 text-sm"
                            placeholder="공정 설명"
                          />
                        </div>
                        <div className="flex gap-1 pb-0.5">
                          <Button
                            size="sm"
                            className="h-8 px-3"
                            onClick={() => handleSave(group)}
                            disabled={updateMutation.isPending}
                          >
                            {updateMutation.isPending ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Save className="h-3.5 w-3.5" />
                            )}
                            <span className="ml-1 text-xs">저장</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-2"
                            onClick={() => setEditingId(null)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* 보기 모드 */
                    <div className="flex items-center gap-3">
                      <Badge className={`text-xs shrink-0 ${ccpBadgeClass(group.ccp_type)}`}>
                        {group.ccp_type}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{group.name}</p>
                        {group.description && (
                          <p className="text-xs text-muted-foreground truncate">{group.description}</p>
                        )}
                      </div>
                      {/* 시간 표시 */}
                      <div className="flex items-center gap-1 shrink-0">
                        <Clock className="h-3.5 w-3.5 text-blue-500" />
                        {group.time_min != null ? (
                          <span className="text-sm font-bold text-blue-700 dark:text-blue-300">
                            {group.time_min}{group.time_max ? `~${group.time_max}` : ""} 분
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">미설정</span>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 shrink-0"
                        onClick={() => startEdit(group)}
                      >
                        <Edit className="h-3 w-3 mr-1" />
                        <span className="text-xs">수정</span>
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 안내: CCP-4P 제외 이유 */}
          <p className="text-[11px] text-muted-foreground text-center">
            * 금속검출(CCP-4P) 공정은 시간 기준이 없으므로 목록에서 제외됩니다.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
'''

# ─── 새 ProductTimeProfileMapDialog ─────────────────────────────────────────
NEW_PRODUCT_MAP_DIALOG = '''// ========== 제품별 시간 결과 다이얼로그 (공정그룹별 매핑 결과 조회) ==========
function ProductTimeProfileMapDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [selectedGroupId, setSelectedGroupId] = useState<string>("all");

  // 공정그룹 + 매핑된 제품 목록
  const { data: processGroupsRaw } = trpc.ccpMonitoring.getProcessGroups.useQuery(undefined);
  const processGroups: any[] = Array.isArray(processGroupsRaw) ? processGroupsRaw : [];

  // 제품별 공정그룹 매핑 목록 (기존 updateProcessGroupProducts 활용)
  // 그룹 각각의 products 배열을 화면에 보여줌
  // 실제 product 목록은 getProcessGroups 결과의 products 필드 or 별도 쿼리
  const { data: productData } = trpc.product.list.useQuery({ limit: 500 });
  const allProducts: any[] = (productData as any)?.items ?? [];

  // ccp_process_group_products 기반 제품 목록을 공정그룹별로 구성
  // getProcessGroups가 각 그룹에 products 배열을 포함하는지 확인 후 fallback
  const timeGroups = processGroups.filter((g: any) => g.ccp_type !== "CCP-4P");

  const filteredGroups = selectedGroupId === "all"
    ? timeGroups
    : timeGroups.filter((g: any) => g.id.toString() === selectedGroupId);

  const ccpBadgeClass = (type: string) => {
    if (type === "CCP-1B") return "bg-red-100 text-red-700 border-red-200";
    if (type === "CCP-2B") return "bg-blue-100 text-blue-700 border-blue-200";
    if (type === "CCP-3B") return "bg-yellow-100 text-yellow-700 border-yellow-200";
    if (type === "CCP-4P") return "bg-green-100 text-green-700 border-green-200";
    return "bg-gray-100 text-gray-700 border-gray-200";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-green-600" />
            제품별 공정시간 결과
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* 안내 배너 */}
          <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-3 border border-green-200 dark:border-green-800">
            <p className="text-xs text-green-700 dark:text-green-300 leading-relaxed">
              BOM에서 연결된 공정 그룹 기준으로 <strong>각 제품에 적용되는 시간</strong>을 보여줍니다.
              시간 수정은 <strong>공정별 시간 설정</strong> 버튼에서 하세요.
            </p>
          </div>

          {/* 공정그룹 필터 */}
          <div className="flex items-center gap-2">
            <Label className="text-xs shrink-0">공정 필터:</Label>
            <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
              <SelectTrigger className="w-[220px] h-8 text-xs">
                <SelectValue placeholder="전체 공정" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 공정</SelectItem>
                {timeGroups.map((g: any) => (
                  <SelectItem key={g.id} value={g.id.toString()}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 공정그룹별 카드 */}
          {filteredGroups.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              공정 그룹 데이터가 없습니다
            </div>
          ) : (
            <div className="space-y-4">
              {filteredGroups.map((group: any) => {
                // 해당 그룹에 매핑된 제품 목록 (group.products 배열이 있으면 사용, 없으면 빈 배열)
                const mappedProducts: any[] = Array.isArray(group.products) ? group.products : [];

                return (
                  <div key={group.id} className="border rounded-lg overflow-hidden">
                    {/* 그룹 헤더 */}
                    <div className="bg-gray-50 dark:bg-gray-900 px-4 py-3 flex items-center gap-3 border-b">
                      <Badge className={`text-xs ${ccpBadgeClass(group.ccp_type)}`}>
                        {group.ccp_type}
                      </Badge>
                      <span className="font-semibold text-sm">{group.name}</span>
                      <div className="flex items-center gap-1 ml-auto">
                        <Clock className="h-3.5 w-3.5 text-blue-500" />
                        <span className="text-sm font-bold text-blue-700 dark:text-blue-300">
                          {group.time_min != null
                            ? `${group.time_min}${group.time_max ? `~${group.time_max}` : ""} 분`
                            : "미설정"}
                        </span>
                      </div>
                    </div>

                    {/* 제품 목록 테이블 */}
                    <Table>
                      <TableHeader>
                        <TableRow className="text-xs">
                          <TableHead className="text-xs">제품명</TableHead>
                          <TableHead className="text-xs w-[100px] text-center">적용 시간</TableHead>
                          <TableHead className="text-xs w-[120px] text-center">공정 그룹</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {mappedProducts.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center py-6 text-xs text-muted-foreground">
                              이 공정 그룹에 매핑된 제품이 없습니다
                              <br />
                              <span className="text-[10px]">공정 그룹 편집에서 제품을 연결하세요</span>
                            </TableCell>
                          </TableRow>
                        ) : (
                          mappedProducts.map((product: any) => (
                            <TableRow key={product.id ?? product.product_id}>
                              <TableCell className="text-sm font-medium">
                                {product.product_name ?? product.name}
                              </TableCell>
                              <TableCell className="text-center">
                                <span className="inline-flex items-center gap-1 font-semibold text-sm text-blue-700 dark:text-blue-300">
                                  <Clock className="h-3 w-3" />
                                  {group.time_min != null ? `${group.time_min} 분` : "-"}
                                </span>
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge variant="outline" className="text-[10px]">
                                  {group.name}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                );
              })}
            </div>
          )}

          <p className="text-[11px] text-muted-foreground text-center">
            * 시간 수정은 "공정별 시간 설정" 버튼에서, 제품 연결은 각 공정 그룹의 "수정" 버튼에서 관리합니다.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
'''

with open(TARGET, "r", encoding="utf-8") as f:
    content = f.read()

# ──────────────────────────────────────────────
# 1. TimeProfileDialog 교체
# ──────────────────────────────────────────────
# 시작 마커: "// ========== 시간 프로파일 관리 다이얼로그 =========="
# 끝 마커:   "// ========== 제품별 시간 프로파일 매핑 다이얼로그 =========="
start_marker_time = "// ========== 시간 프로파일 관리 다이얼로그 =========="
end_marker_time   = "// ========== 제품별 시간 프로파일 매핑 다이얼로그 =========="

idx_start = content.find(start_marker_time)
idx_end   = content.find(end_marker_time)

if idx_start == -1 or idx_end == -1:
    print(f"ERROR: markers not found. start={idx_start}, end={idx_end}")
    print("  Looking for:", repr(start_marker_time[:50]))
    # 가장 가까운 텍스트 찾기
    for marker in ["// ========== 시간 프로파일", "// ========== 제품별"]:
        pos = content.find(marker)
        print(f"  '{marker[:30]}' at pos {pos}")
    exit(1)

before = content[:idx_start]
after  = content[idx_end:]
content = before + NEW_TIME_PROFILE_DIALOG + "\n" + after

print("✅ TimeProfileDialog 교체 완료")

# ──────────────────────────────────────────────
# 2. ProductTimeProfileMapDialog 교체
# ──────────────────────────────────────────────
start_marker_prod = "// ========== 제품별 시간 프로파일 매핑 다이얼로그 =========="
end_marker_prod   = "// ========== 메인 컴포넌트 =========="

idx_start2 = content.find(start_marker_prod)
idx_end2   = content.find(end_marker_prod)

if idx_start2 == -1 or idx_end2 == -1:
    print(f"ERROR: product markers not found. start={idx_start2}, end={idx_end2}")
    exit(1)

before2 = content[:idx_start2]
after2  = content[idx_end2:]
content = before2 + NEW_PRODUCT_MAP_DIALOG + "\n" + after2

print("✅ ProductTimeProfileMapDialog 교체 완료")

# ──────────────────────────────────────────────
# 3. 메인 컴포넌트에서 TimeProfileDialog props 수정
#    기존: <TimeProfileDialog ... processGroups={groups} />
#    새로: <TimeProfileDialog ... /> (processGroups prop 제거)
# ──────────────────────────────────────────────
# processGroups prop을 TimeProfileDialog에 전달하는 부분 제거
content = re.sub(
    r'<TimeProfileDialog\s+open=\{isTimeProfileOpen\}\s+onOpenChange=\{setIsTimeProfileOpen\}\s+processGroups=\{[^}]+\}\s*/>',
    '<TimeProfileDialog\n          open={isTimeProfileOpen}\n          onOpenChange={setIsTimeProfileOpen}\n        />',
    content
)
print("✅ TimeProfileDialog props 정리 완료")

# ──────────────────────────────────────────────
# 4. 저장
# ──────────────────────────────────────────────
with open(TARGET, "w", encoding="utf-8") as f:
    f.write(content)

print(f"\n✅ 저장 완료: {TARGET}")
print(f"   총 {len(content.splitlines())} 줄")

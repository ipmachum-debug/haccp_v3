with open("/home/root/webapp/CCPLimitsManagement_latest.tsx", "r", encoding="utf-8") as f:
    content = f.read()

# ── 1. TimeProfileDialog 전체 교체 ──────────────────────────────────────────
old_time_dialog_start = "// ========== 시간 프로파일 관리 다이얼로그 =========="
old_time_dialog_end   = "// ========== 제품별 시간 프로파일 매핑 다이얼로그 =========="

new_time_dialog = '''\
// ========== 시간 프로파일 관리 다이얼로그 (= ccp_process_groups 직접 편집) ==========
function TimeProfileDialog({
  open,
  onOpenChange,
  processGroups,
  onRefresh,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  processGroups: any[];
  onRefresh: () => void;
}) {
  // 그룹별 편집 중인 time_min 값 (id → string)
  const [editValues, setEditValues] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  const updateMutation = trpc.ccpMonitoring.updateProcessGroup.useMutation({
    onSuccess: () => {
      toast.success("가열 시간이 저장되었습니다");
      onRefresh();
      setSavingId(null);
    },
    onError: (err) => {
      toast.error("저장 실패: " + err.message);
      setSavingId(null);
    },
  });

  // CCP-4P(금속검출) 제외, 시간 설정이 의미있는 그룹만
  const editableGroups = processGroups.filter(
    (g: any) => g.ccp_type !== "CCP-4P"
  );

  const handleSave = (group: any) => {
    const val = editValues[group.id];
    if (val === undefined || val === "") return;
    const num = Number(val);
    if (isNaN(num) || num <= 0) {
      toast.error("올바른 시간(분)을 입력하세요");
      return;
    }
    setSavingId(group.id);
    updateMutation.mutate({
      id: group.id,
      timeMin: num,
    });
  };

  const startEdit = (group: any) => {
    setEditValues((prev) => ({
      ...prev,
      [group.id]: String(group.time_min ?? ""),
    }));
  };

  const cancelEdit = (groupId: number) => {
    setEditValues((prev) => {
      const next = { ...prev };
      delete next[groupId];
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            공정별 가열 시간 설정
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* 안내 */}
          <div className="bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-950/30 dark:to-cyan-950/30 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
            <p className="text-xs text-blue-700 dark:text-blue-300">
              공정 그룹별 기본 가열 시간(time_min)을 직접 설정합니다.
              BOM에서 제품이 해당 공정그룹에 연결되면 이 시간이 배치 생성 시 자동 적용됩니다.
              <br />
              <span className="font-semibold">배치 총소요시간 = 설비 사이클 + (이 가열시간 - 설비 기본가열)</span>
            </p>
          </div>

          {/* 공정그룹별 시간 설정 테이블 */}
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50 dark:bg-gray-900">
                  <TableHead className="text-xs">공정 그룹명</TableHead>
                  <TableHead className="text-xs w-[80px] text-center">CCP 유형</TableHead>
                  <TableHead className="text-xs w-[120px] text-center">가열 시간(분)</TableHead>
                  <TableHead className="text-xs w-[80px] text-center">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {editableGroups.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-sm text-muted-foreground">
                      설정 가능한 공정 그룹이 없습니다
                    </TableCell>
                  </TableRow>
                ) : (
                  editableGroups.map((group: any) => {
                    const isEditing = group.id in editValues;
                    const isSaving  = savingId === group.id;
                    return (
                      <TableRow key={group.id}>
                        <TableCell className="font-medium text-sm">{group.name}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="text-[10px]">{group.ccp_type}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {isEditing ? (
                            <Input
                              type="number"
                              value={editValues[group.id]}
                              onChange={(e) =>
                                setEditValues((prev) => ({ ...prev, [group.id]: e.target.value }))
                              }
                              className="h-7 text-xs text-center w-20 mx-auto"
                              autoFocus
                            />
                          ) : (
                            <span className="font-semibold text-base">
                              {group.time_min != null ? `${group.time_min}분` : <span className="text-gray-400">-</span>}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {isEditing ? (
                            <div className="flex gap-1 justify-center">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                onClick={() => handleSave(group)}
                                disabled={isSaving}
                              >
                                {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3 text-green-600" />}
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                onClick={() => cancelEdit(group.id)}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={() => startEdit(group)}
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

'''

# ── 2. ProductTimeProfileMapDialog 전체 교체 ──────────────────────────────────
old_product_dialog_end = "// ========== 메인 컴포넌트 =========="

new_product_dialog = '''\
// ========== 제품별 시간 현황 다이얼로그 (BOM 자동매핑 결과, 공정그룹별 그룹화) ==========
function ProductTimeProfileMapDialog({
  open,
  onOpenChange,
  processGroups,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  processGroups: any[];
}) {
  const [selectedGroupId, setSelectedGroupId] = useState<string>("all");

  // CCP-4P 제외 그룹
  const editableGroups = processGroups.filter((g: any) => g.ccp_type !== "CCP-4P");

  // 선택된 공정그룹의 BOM 매핑 제품 조회
  const { data: mappedProducts, isLoading } = trpc.ccpMonitoring.getProcessGroupProducts.useQuery(
    selectedGroupId !== "all"
      ? { processGroupId: Number(selectedGroupId) }
      : { ccpType: "CCP-1B" },    // 전체일 때 CCP-1B/2B 전체
    { enabled: open }
  );

  const productList = Array.isArray(mappedProducts) ? mappedProducts : [];

  // 그룹별로 묶기 (전체 조회 시)
  const groupedProducts = selectedGroupId === "all"
    ? editableGroups.map((g: any) => ({
        group: g,
        products: productList.filter((p: any) => p.process_group_id === g.id),
      })).filter((entry) => entry.products.length > 0)
    : [{
        group: editableGroups.find((g: any) => g.id === Number(selectedGroupId)),
        products: productList,
      }];

  const selectedGroup = selectedGroupId !== "all"
    ? editableGroups.find((g: any) => g.id === Number(selectedGroupId))
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            제품별 시간 현황
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* 안내 */}
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 rounded-lg p-3 border border-green-200 dark:border-green-800">
            <div className="flex items-center gap-2 mb-1">
              <Link2 className="h-4 w-4 text-green-600" />
              <span className="text-xs font-semibold text-green-700 dark:text-green-300">BOM 원재료 기반 자동 매핑 결과</span>
            </div>
            <p className="text-xs text-green-600/80 dark:text-green-400/80">
              품목제조보고서(BOM)에서 원재료에 공정그룹이 태깅된 제품이 자동으로 표시됩니다.
              매핑을 변경하려면 품목제조보고서 → 원재료 → CCP 공정그룹 열에서 수정하세요.
            </p>
          </div>

          {/* 공정그룹 필터 */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0">공정 그룹:</span>
            <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
              <SelectTrigger className="h-8 text-xs flex-1">
                <SelectValue placeholder="공정 그룹 선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 공정 그룹</SelectItem>
                {editableGroups.map((g: any) => (
                  <SelectItem key={g.id} value={g.id.toString()}>
                    {g.name}
                    <span className="ml-2 text-muted-foreground text-[10px]">({g.ccp_type})</span>
                    {g.time_min != null && (
                      <span className="ml-1 font-semibold text-blue-600 text-[10px]">가열 {g.time_min}분</span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 선택된 그룹 요약 정보 */}
          {selectedGroup && (
            <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3 border border-blue-200 dark:border-blue-800 flex items-center gap-4">
              <div>
                <div className="text-xs text-muted-foreground">공정 그룹</div>
                <div className="font-semibold text-sm">{selectedGroup.name}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">가열 시간</div>
                <div className="font-bold text-lg text-blue-600">{selectedGroup.time_min ?? "-"}분</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">CCP 유형</div>
                <Badge variant="outline" className="text-[10px]">{selectedGroup.ccp_type}</Badge>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">연결 제품</div>
                <div className="font-semibold text-sm">{productList.length}개</div>
              </div>
            </div>
          )}

          {/* 로딩 */}
          {isLoading && (
            <div className="flex items-center justify-center py-8 gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">불러오는 중...</span>
            </div>
          )}

          {/* 그룹별 제품 목록 */}
          {!isLoading && groupedProducts.map(({ group, products }) => group && (
            <div key={group.id} className="border rounded-lg overflow-hidden">
              {/* 그룹 헤더 */}
              <div className="bg-blue-50 dark:bg-blue-950/30 px-4 py-2.5 flex items-center justify-between border-b">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] border-blue-300 text-blue-700">{group.ccp_type}</Badge>
                  <span className="font-semibold text-sm">{group.name}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>
                    가열시간:{" "}
                    <span className="font-bold text-blue-600">
                      {group.time_min != null ? `${group.time_min}분` : <span className="text-gray-400">미설정</span>}
                    </span>
                  </span>
                  <span className="text-gray-400">|</span>
                  <span>연결 {products.length}개 제품</span>
                </div>
              </div>

              {/* 제품 목록 */}
              {products.length === 0 ? (
                <div className="text-center py-6 text-sm text-muted-foreground">
                  <Package className="h-6 w-6 mx-auto mb-1 text-gray-300" />
                  BOM에서 이 공정으로 태깅된 제품이 없습니다
                </div>
              ) : (
                <div className="divide-y">
                  {products.map((product: any, idx: number) => (
                    <div
                      key={product.product_id}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-900/50"
                    >
                      <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-[10px] font-bold text-blue-600 shrink-0">
                        {idx + 1}
                      </div>
                      <div className="flex-1 font-medium text-sm">{product.product_name}</div>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-300 text-blue-600 shrink-0">
                        BOM 자동
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* 전체 조회 시 매핑된 그룹 없을 때 */}
          {!isLoading && groupedProducts.length === 0 && (
            <div className="text-center py-10 text-sm text-muted-foreground border rounded-lg">
              <Package className="h-10 w-10 mx-auto mb-2 text-gray-300" />
              <p>BOM에서 매핑된 제품이 없습니다.</p>
              <p className="text-xs mt-1">품목제조보고서 → 원재료 → CCP 공정그룹 열에서 매핑하세요.</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

'''

# 교체 실행
idx_time_start = content.index(old_time_dialog_start)
idx_time_end   = content.index(old_time_dialog_end)

idx_product_start = content.index(old_time_dialog_end)
idx_product_end   = content.index(old_product_dialog_end)

new_content = (
    content[:idx_time_start]
    + new_time_dialog
    + new_product_dialog
    + content[idx_product_end:]
)

with open("/home/root/webapp/CCPLimitsManagement_latest.tsx", "w", encoding="utf-8") as f:
    f.write(new_content)

print(f"Done: {len(new_content.splitlines())} lines")

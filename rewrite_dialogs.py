#!/usr/bin/env python3
"""
TimeProfileDialog와 ProductTimeProfileMapDialog를 재설계된 버전으로 교체
"""

NEW_DIALOGS = '''
// ========== 시간 프로파일 관리 다이얼로그 ==========
// ccp_process_groups 기반으로 공정그룹의 time_min을 직접 편집
function TimeProfileDialog({
  open,
  onOpenChange,
  processGroups,
  onGroupUpdated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  processGroups: any[];
  onGroupUpdated?: () => void;
}) {
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<{ timeMin: string; timeMax: string; description: string }>({
    timeMin: "",
    timeMax: "",
    description: "",
  });

  const updateGroupMutation = trpc.ccpMonitoring.updateProcessGroup.useMutation({
    onSuccess: () => {
      toast.success("공정그룹 시간 설정이 저장되었습니다");
      setEditingGroupId(null);
      onGroupUpdated?.();
    },
    onError: (err) => toast.error("저장 실패: " + err.message),
  });

  const startEdit = (group: any) => {
    setEditingGroupId(group.id);
    setEditForm({
      timeMin: (group.time_min ?? "").toString(),
      timeMax: (group.time_max ?? "").toString(),
      description: group.description || "",
    });
  };

  const handleSave = (group: any) => {
    updateGroupMutation.mutate({
      id: group.id,
      name: group.name,
      ccpType: group.ccp_type,
      timeMin: editForm.timeMin ? Number(editForm.timeMin) : undefined,
      timeMax: editForm.timeMax ? Number(editForm.timeMax) : undefined,
      description: editForm.description || undefined,
      temperatureMin: group.temperature_min,
      temperatureMax: group.temperature_max,
      pressureMin: group.pressure_min,
      pressureMax: group.pressure_max,
    });
  };

  // CCP-4P 제외한 시간 관련 공정그룹만 표시
  const timeGroups = processGroups.filter(g => g.ccp_type !== "CCP-4P");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            공정별 시간 설정 관리
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* 안내 */}
          <div className="bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-950/30 dark:to-cyan-950/30 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
            <p className="text-xs text-blue-700 dark:text-blue-300">
              각 공정그룹의 기본 운영시간(time_min)을 직접 설정합니다.
              BOM에서 해당 공정그룹으로 매핑된 모든 제품에 이 시간이 적용됩니다.
              <br />
              <span className="font-semibold">배치 총소요시간 = 설비 사이클시간 + (공정 가열시간 - 설비 기본 가열시간)</span>
            </p>
          </div>

          {/* 공정그룹 시간 설정 테이블 */}
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50 dark:bg-gray-900">
                  <TableHead className="text-xs">공정그룹명</TableHead>
                  <TableHead className="text-xs w-[90px]">CCP 유형</TableHead>
                  <TableHead className="text-xs w-[110px] text-center">최소시간(분)</TableHead>
                  <TableHead className="text-xs w-[110px] text-center">최대시간(분)</TableHead>
                  <TableHead className="text-xs">설명</TableHead>
                  <TableHead className="text-xs w-[80px] text-center">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {timeGroups.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-sm text-muted-foreground">
                      등록된 공정그룹이 없습니다
                    </TableCell>
                  </TableRow>
                ) : (
                  timeGroups.map((group: any) => (
                    <TableRow key={group.id}>
                      {editingGroupId === group.id ? (
                        <>
                          <TableCell className="font-medium text-sm">
                            {group.name}
                          </TableCell>
                          <TableCell>
                            <Badge className={`text-[10px] ${getCcpColor(group.ccp_type)}`}>
                              {group.ccp_type}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={editForm.timeMin}
                              onChange={(e) => setEditForm({ ...editForm, timeMin: e.target.value })}
                              className="h-7 text-xs text-center"
                              placeholder="분"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={editForm.timeMax}
                              onChange={(e) => setEditForm({ ...editForm, timeMax: e.target.value })}
                              className="h-7 text-xs text-center"
                              placeholder="분 (선택)"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={editForm.description}
                              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                              className="h-7 text-xs"
                              placeholder="설명"
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1 justify-center">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                onClick={() => handleSave(group)}
                                disabled={updateGroupMutation.isPending}
                              >
                                {updateGroupMutation.isPending ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Save className="h-3 w-3 text-green-600" />
                                )}
                              </Button>
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingGroupId(null)}>
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell className="font-medium text-sm">{group.name}</TableCell>
                          <TableCell>
                            <Badge className={`text-[10px] ${getCcpColor(group.ccp_type)}`}>
                              {group.ccp_type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            {group.time_min != null ? (
                              <span className="font-semibold text-blue-600">{group.time_min}분</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {group.time_max != null ? (
                              <span className="text-sm text-gray-500">{group.time_max}분</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {group.description || "-"}
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-center">
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => startEdit(group)}>
                                <Edit className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <p className="text-[11px] text-muted-foreground text-right">
            * 금속검출(CCP-4P) 공정은 시간 설정이 적용되지 않습니다
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ========== 제품별 시간 현황 다이얼로그 ==========
// BOM 기반 매핑 결과를 공정그룹별로 그룹화하여 표시 (읽기 전용)
function ProductTimeProfileMapDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [filterCcpType, setFilterCcpType] = useState<string>("all");

  // BOM 기반 제품-공정그룹 전체 매핑 조회 (getProcessGroupProducts 재활용)
  const { data: allMappings, isLoading } = trpc.ccpMonitoring.getProcessGroupProducts.useQuery(
    filterCcpType !== "all" ? { ccpType: filterCcpType } : {}
  );

  // 공정그룹 목록 (time_min 포함)
  const { data: processGroupData } = trpc.ccpMonitoring.getProcessGroups.useQuery(undefined);
  const processGroups = Array.isArray(processGroupData) ? processGroupData : [];

  const mappings = Array.isArray(allMappings) ? allMappings : [];

  // 공정그룹별로 그룹화
  const groupedByProcessGroup = mappings.reduce((acc: Record<string, any>, m: any) => {
    const key = m.process_group_id?.toString() || "unknown";
    if (!acc[key]) {
      const group = processGroups.find((g: any) => g.id === m.process_group_id);
      acc[key] = {
        processGroupId: m.process_group_id,
        groupName: m.group_name || group?.name || "알 수 없음",
        ccpType: m.ccp_type || group?.ccp_type || "",
        timeMin: group?.time_min,
        timeMax: group?.time_max,
        mappingSource: m.mapping_source,
        products: [],
      };
    }
    acc[key].products.push({
      productId: m.product_id,
      productName: m.product_name,
    });
    return acc;
  }, {} as Record<string, any>);

  const groupedList = Object.values(groupedByProcessGroup) as any[];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            제품별 공정시간 현황
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* 안내 */}
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 rounded-lg p-3 border border-green-200 dark:border-green-800">
            <p className="text-xs text-green-700 dark:text-green-300">
              BOM 데이터에서 자동으로 연결된 제품-공정그룹 매핑 결과입니다.
              공정그룹별로 묶어서 어떤 제품이 해당 공정을 거치는지, 그리고 적용되는 시간을 확인할 수 있습니다.
              <br />
              시간 수정은 <span className="font-semibold">시간 설정 관리</span> 버튼에서 하세요.
            </p>
          </div>

          {/* CCP 유형 필터 */}
          <div className="flex items-center gap-2">
            <Select value={filterCcpType} onValueChange={setFilterCcpType}>
              <SelectTrigger className="w-[180px] h-8 text-xs">
                <SelectValue placeholder="CCP 유형 필터" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 유형</SelectItem>
                {ccpTypes.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            <span className="text-xs text-muted-foreground">
              {groupedList.length}개 공정그룹 / {mappings.length}개 제품 매핑
            </span>
          </div>

          {/* 공정그룹별 제품 현황 */}
          {groupedList.length === 0 ? (
            <div className="border rounded-lg p-8 text-center text-sm text-muted-foreground">
              {isLoading ? "데이터를 불러오는 중..." : "BOM 기반 매핑 데이터가 없습니다"}
            </div>
          ) : (
            <div className="space-y-3">
              {groupedList.map((group: any) => (
                <div key={group.processGroupId} className="border rounded-lg overflow-hidden">
                  {/* 공정그룹 헤더 */}
                  <div className="bg-gray-50 dark:bg-gray-900 px-4 py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge className={`text-[10px] ${getCcpColor(group.ccpType)}`}>
                        {group.ccpType}
                      </Badge>
                      <span className="font-semibold text-sm">{group.groupName}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {group.mappingSource === "BOM" ? "BOM 자동" : "수동 매핑"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      {group.timeMin != null ? (
                        <span className="font-semibold text-blue-600 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          최소 {group.timeMin}분
                          {group.timeMax ? ` ~ 최대 ${group.timeMax}분` : ""}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">시간 미설정</span>
                      )}
                      <span className="text-muted-foreground">제품 {group.products.length}개</span>
                    </div>
                  </div>
                  {/* 제품 목록 */}
                  <div className="px-4 py-2 flex flex-wrap gap-1.5">
                    {group.products.map((p: any) => (
                      <Badge
                        key={p.productId}
                        variant="secondary"
                        className="text-[11px] font-normal"
                      >
                        {p.productName}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
'''

def replace_dialogs(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # TimeProfileDialog 시작과 ProductTimeProfileMapDialog 끝 사이를 교체
    start_marker = "// ========== 시간 프로파일 관리 다이얼로그 =========="
    end_marker = "// ========== 메인 컴포넌트 =========="

    start_idx = content.find(start_marker)
    end_idx = content.find(end_marker)

    if start_idx == -1:
        print(f"ERROR: 시작 마커를 찾을 수 없습니다: {start_marker}")
        return False

    if end_idx == -1:
        print(f"ERROR: 끝 마커를 찾을 수 없습니다: {end_marker}")
        return False

    print(f"교체 범위: {start_idx} ~ {end_idx}")
    print(f"원본 교체 블록 길이: {end_idx - start_idx} chars")

    new_content = content[:start_idx] + NEW_DIALOGS + "\n" + content[end_idx:]

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_content)

    print(f"✅ 파일 업데이트 완료: {filepath}")
    print(f"원본 {len(content)} chars → 새 {len(new_content)} chars")
    return True

if __name__ == "__main__":
    import sys
    filepath = sys.argv[1] if len(sys.argv) > 1 else "/home/root/webapp/CCPLimitsManagement_work.tsx"
    replace_dialogs(filepath)

import { useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Save, Loader2, Search, User, UserCheck, Shield, Settings } from "lucide-react";
import { filterFormTypesByIndustry } from "@/lib/documentFormTypes";
import { useIndustryFeatures } from "@/hooks/useIndustryFeatures";

// ============================================================================
// 문서 양식 카탈로그 — industry 별 분류 + 필터 (lib/documentFormTypes.ts 참조)
//
// 이전: 51개 모두 하드코딩 → 화장품 GMP 테넌트도 식품 HACCP 전용 문서 (CCP 기록지 등)
//      를 그대로 보는 데이터 분리 미흡 이슈 발생.
// 현재: useIndustryFeatures().hasHACCP/hasGMP 로 industry 자동 필터.
//      화장품 GMP Phase 2 lifecycle (BMR/Formula/Label/Release/Stability) +
//      Y-시리즈 cross-cutting 7종 추가됨.
// ============================================================================
// ============================================================================
// 설정 행 타입
// ============================================================================
interface SettingRow {
  formType: string;
  name: string;
  category: string;
  settingId?: number;
  authorEmployeeId?: number;
  reviewerEmployeeId?: number;
  approverEmployeeId?: number;
  changed: boolean;
}

// ============================================================================
// 메인 컴포넌트
// ============================================================================
export default function DocumentApprovalSettingsPage() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<SettingRow[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [isSaving, setIsSaving] = useState(false);

  // 테넌트 industry 기반 문서 양식 자동 필터
  // (식품 HACCP 만 활성 → CCP 기록지 등 / 화장품 GMP 만 활성 → BMR/Formula 등)
  const { hasHACCP, hasGMP, isLoading: industryLoading } = useIndustryFeatures();
  const FORM_TYPES = useMemo(
    () => filterFormTypesByIndustry(hasHACCP, hasGMP),
    [hasHACCP, hasGMP],
  );

  // API 쿼리
  const { data: employees } = trpc.organization.employees.list.useQuery();
  const { data: existingSettings, refetch: refetchSettings } = trpc.organization.approvalSettings.list.useQuery();
  const activeEmployees = (employees || []).filter((e: any) => e.isActive === 1);

  const createMutation = trpc.organization.approvalSettings.create.useMutation();
  const updateMutation = trpc.organization.approvalSettings.update.useMutation();

  // 기존 설정 로드 — FORM_TYPES 가 industry 따라 변경되면 재계산
  useEffect(() => {
    const rows: SettingRow[] = FORM_TYPES.map((ft) => {
      const existing = (existingSettings || []).find(
        (s: any) => s.documentType === ft.formType
      );
      return {
        formType: ft.formType,
        name: ft.name,
        category: ft.category,
        settingId: existing?.id,
        authorEmployeeId: existing?.authorEmployeeId || undefined,
        reviewerEmployeeId: existing?.reviewerEmployeeId || undefined,
        approverEmployeeId: existing?.approverEmployeeId || undefined,
        changed: false,
      };
    });
    setSettings(rows);
  }, [existingSettings, FORM_TYPES]);

  // 설정 변경 핸들러
  const handleChange = (formType: string, field: "authorEmployeeId" | "reviewerEmployeeId" | "approverEmployeeId", value: string) => {
    setSettings((prev) =>
      prev.map((row) =>
        row.formType === formType
          ? { ...row, [field]: value === "none" ? undefined : Number(value), changed: true }
          : row
      )
    );
  };

  // 일괄 설정 (전체에 동일한 검토자/승인자 적용)
  const handleBulkApply = (field: "reviewerEmployeeId" | "approverEmployeeId", employeeId: number) => {
    setSettings((prev) =>
      prev.map((row) => ({ ...row, [field]: employeeId, changed: true }))
    );
  };

  // 저장
  const handleSave = async () => {
    const changedRows = settings.filter((r) => r.changed);
    if (changedRows.length === 0) {
      toast({ title: "변경 사항 없음", description: "수정된 항목이 없습니다." });
      return;
    }

    setIsSaving(true);
    try {
      for (const row of changedRows) {
        if (row.settingId) {
          // 기존 설정 업데이트
          await updateMutation.mutateAsync({
            id: row.settingId,
            documentType: row.formType,
            documentTypeName: row.name,
            authorEmployeeId: row.authorEmployeeId,
            reviewerEmployeeId: row.reviewerEmployeeId,
            approverEmployeeId: row.approverEmployeeId,
          });
        } else {
          // 새 설정 생성
          await createMutation.mutateAsync({
            documentType: row.formType,
            documentTypeName: row.name,
            authorEmployeeId: row.authorEmployeeId,
            reviewerEmployeeId: row.reviewerEmployeeId,
            approverEmployeeId: row.approverEmployeeId,
          });
        }
      }
      toast({ title: "저장 완료", description: `${changedRows.length}개 문서 유형의 결재 설정이 저장되었습니다.` });
      refetchSettings();
    } catch (error: any) {
      toast({ title: "저장 실패", description: error.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  // 필터링
  const categories = Array.from(new Set(FORM_TYPES.map((ft) => ft.category)));
  const filteredSettings = settings.filter((row) => {
    const matchSearch = !searchTerm || row.name.includes(searchTerm) || row.formType.includes(searchTerm);
    const matchCategory = categoryFilter === "all" || row.category === categoryFilter;
    return matchSearch && matchCategory;
  });

  const getEmployeeName = (employeeId?: number) => {
    if (!employeeId) return null;
    const emp = activeEmployees.find((e: any) => e.id === employeeId);
    return emp ? emp.name : null;
  };

  const changedCount = settings.filter((r) => r.changed).length;

  return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  문서 결재자 설정
                </CardTitle>
                <CardDescription className="mt-1">
                  문서 유형별 기본 작성자, 검토자, 승인자를 설정합니다. 새 문서 작성 시 자동으로 적용됩니다.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {changedCount > 0 && (
                  <Badge variant="outline" className="text-orange-600 border-orange-300">
                    {changedCount}건 변경됨
                  </Badge>
                )}
                <Button onClick={handleSave} disabled={isSaving || changedCount === 0} className="bg-blue-600 hover:bg-blue-700 text-white">
                  {isSaving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                  저장
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* 필터 영역 */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="문서명 검색..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-60 h-9"
                />
              </div>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-40 h-9">
                  <SelectValue placeholder="카테고리" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* 일괄 적용 */}
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-muted-foreground">일괄 적용:</span>
                <Select
                  onValueChange={(val) => {
                    if (val !== "none") handleBulkApply("reviewerEmployeeId", Number(val));
                  }}
                >
                  <SelectTrigger className="w-36 h-8 text-xs">
                    <SelectValue placeholder="검토자 일괄" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">선택 안함</SelectItem>
                    {activeEmployees.map((emp: any) => (
                      <SelectItem key={emp.id} value={String(emp.id)}>
                        {emp.name} {emp.positionName ? `(${emp.positionName})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  onValueChange={(val) => {
                    if (val !== "none") handleBulkApply("approverEmployeeId", Number(val));
                  }}
                >
                  <SelectTrigger className="w-36 h-8 text-xs">
                    <SelectValue placeholder="승인자 일괄" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">선택 안함</SelectItem>
                    {activeEmployees.map((emp: any) => (
                      <SelectItem key={emp.id} value={String(emp.id)}>
                        {emp.name} {emp.positionName ? `(${emp.positionName})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 설정 테이블 */}
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-12 text-center">No.</TableHead>
                    <TableHead className="w-28">카테고리</TableHead>
                    <TableHead className="w-64">문서 유형</TableHead>
                    <TableHead className="w-48">
                      <div className="flex items-center gap-1">
                        <User className="h-3.5 w-3.5" />
                        기본 작성자
                      </div>
                    </TableHead>
                    <TableHead className="w-48">
                      <div className="flex items-center gap-1">
                        <UserCheck className="h-3.5 w-3.5" />
                        기본 검토자
                      </div>
                    </TableHead>
                    <TableHead className="w-48">
                      <div className="flex items-center gap-1">
                        <Shield className="h-3.5 w-3.5" />
                        기본 승인자
                      </div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSettings.map((row, index) => (
                    <TableRow
                      key={row.formType}
                      className={row.changed ? "bg-orange-50" : ""}
                    >
                      <TableCell className="text-center text-muted-foreground text-xs">{index + 1}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{row.category}</Badge>
                      </TableCell>
                      <TableCell className="text-sm font-medium">{row.name}</TableCell>
                      <TableCell>
                        <Select
                          value={row.authorEmployeeId ? String(row.authorEmployeeId) : "none"}
                          onValueChange={(val) => handleChange(row.formType, "authorEmployeeId", val)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="선택 안함">
                              {getEmployeeName(row.authorEmployeeId) || "선택 안함"}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">선택 안함</SelectItem>
                            {activeEmployees.map((emp: any) => (
                              <SelectItem key={emp.id} value={String(emp.id)}>
                                {emp.name} {emp.positionName ? `(${emp.positionName})` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={row.reviewerEmployeeId ? String(row.reviewerEmployeeId) : "none"}
                          onValueChange={(val) => handleChange(row.formType, "reviewerEmployeeId", val)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="선택 안함">
                              {getEmployeeName(row.reviewerEmployeeId) || "선택 안함"}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">선택 안함</SelectItem>
                            {activeEmployees.map((emp: any) => (
                              <SelectItem key={emp.id} value={String(emp.id)}>
                                {emp.name} {emp.positionName ? `(${emp.positionName})` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={row.approverEmployeeId ? String(row.approverEmployeeId) : "none"}
                          onValueChange={(val) => handleChange(row.formType, "approverEmployeeId", val)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="선택 안함">
                              {getEmployeeName(row.approverEmployeeId) || "선택 안함"}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">선택 안함</SelectItem>
                            {activeEmployees.map((emp: any) => (
                              <SelectItem key={emp.id} value={String(emp.id)}>
                                {emp.name} {emp.positionName ? `(${emp.positionName})` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="mt-3 text-sm text-muted-foreground">
              총 {filteredSettings.length}개 문서 유형 | 설정된 항목: {settings.filter((r) => r.authorEmployeeId || r.reviewerEmployeeId || r.approverEmployeeId).length}개
            </div>
          </CardContent>
        </Card>
      </div>
  );
}

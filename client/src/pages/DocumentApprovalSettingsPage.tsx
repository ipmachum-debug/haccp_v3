import { useState, useEffect } from "react";
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

// ============================================================================
// 44개 formType 전체 목록 (표시명 포함)
// ============================================================================
const FORM_TYPES: { formType: string; name: string; category: string }[] = [
  // 일일 점검 (일일일지 탭 항목들)
  { formType: "hygiene_checklist", name: "일반위생관리 점검일지", category: "일일 점검" },
  { formType: "foreign_material_record", name: "이물관리 점검일지", category: "일일 점검" },
  { formType: "temperature_humidity_check", name: "원재료실 온습도 관리일지", category: "일일 점검" },
  { formType: "refrigeration_check", name: "냉동·냉장고 온도관리일지", category: "일일 점검" },
  // 검사 성적서
  { formType: "airborne_bacteria_test", name: "공중낙하세균 검사 성적서", category: "검사 성적서" },
  { formType: "surface_contamination_test", name: "표면오염도 검사 성적서", category: "검사 성적서" },
  { formType: "product_test_log", name: "대장균군 검사 성적서", category: "검사 성적서" },
  { formType: "product_test_report", name: "제품 검사 성적서", category: "검사 성적서" },
  // 위생 관리
  { formType: "personal_hygiene_check", name: "개인 위생관리 점검표", category: "위생 관리" },
  { formType: "hygiene_facility_check", name: "위생시설 점검일지", category: "위생 관리" },
  { formType: "workplace_hygiene_check", name: "작업장 위생관리 점검표", category: "위생 관리" },
  { formType: "sanitation_record", name: "손세척 소독 점검일지", category: "위생 관리" },
  { formType: "employee_health_check", name: "종사자 건강상태 확인 일지", category: "위생 관리" },
  { formType: "hygiene_inspection", name: "방문자 위생관리 점검표", category: "위생 관리" },
  // 설비 관리
  { formType: "air_compressor_maintenance", name: "공조장치 관리일지", category: "설비 관리" },
  { formType: "air_compressor_filter", name: "공조장치 필터 관리대장", category: "설비 관리" },
  { formType: "equipment_inspection", name: "설비 점검 관리대장", category: "설비 관리" },
  { formType: "equipment_history", name: "설비 이력 관리대장", category: "설비 관리" },
  { formType: "equipment_cleaning_record", name: "세척소독 관리대장", category: "설비 관리" },
  { formType: "illumination_check", name: "조도 점검 관리대장", category: "설비 관리" },
  // 용수/방충 관리
  { formType: "water_quality_test", name: "수질 검사 성적서", category: "용수/방충 관리" },
  { formType: "water_management_check", name: "용수관리 점검일지", category: "용수/방충 관리" },
  { formType: "water_usage_check", name: "용수 사용량 점검일지", category: "용수/방충 관리" },
  { formType: "pest_control_checklist", name: "방충방서 관리일지", category: "용수/방충 관리" },
  // 원재료/제품 관리
  { formType: "material_inspection", name: "원재료 검수 관리대장", category: "원재료/제품 관리" },
  { formType: "packaging_storage_record", name: "포장재 보관 관리대장", category: "원재료/제품 관리" },
  { formType: "finished_product_check", name: "완제품 검사 관리대장", category: "원재료/제품 관리" },
  { formType: "shipping_inspection", name: "출하 검사 관리대장", category: "원재료/제품 관리" },
  { formType: "self_quality_inspection", name: "자주품질 검사 관리대장", category: "원재료/제품 관리" },
  { formType: "weight_quality_check", name: "중량 품질 검사 관리대장", category: "원재료/제품 관리" },
  { formType: "supplier_inspection", name: "공급업체 점검 관리대장", category: "원재료/제품 관리" },
  // 교육/훈련
  { formType: "training_log", name: "교육훈련 관리대장", category: "교육/훈련" },
  // 기타 관리
  { formType: "waste_management", name: "폐기물 관리대장", category: "기타 관리" },
  { formType: "daily_disposal_record", name: "일일 폐기 관리대장", category: "기타 관리" },
  { formType: "food_recall_notice", name: "회수 관리대장", category: "기타 관리" },
  { formType: "consumer_complaint", name: "소비자 불만 관리대장", category: "기타 관리" },
  { formType: "capa_record", name: "개선/시정 조치 관리대장", category: "기타 관리" },
  { formType: "quality_issue_record", name: "품질 이슈 관리대장", category: "기타 관리" },
  { formType: "handover_document", name: "인수인계 문서", category: "기타 관리" },
  { formType: "vehicle_temperature_check", name: "차량 온도 점검일지", category: "기타 관리" },
  // 기타
  { formType: "validity_evaluation", name: "유효성 평가 기록부", category: "기타" },
  // 기간별 일지
  { formType: "daily_log", name: "일일일지", category: "기간별 일지" },
  { formType: "weekly_log", name: "주간일지", category: "기간별 일지" },
  { formType: "monthly_log", name: "월간일지", category: "기간별 일지" },
  { formType: "yearly_log", name: "연간일지", category: "기간별 일지" },
  // 생산일지
  { formType: "production_daily", name: "생산일지", category: "생산관리" },
  // CCP 기록지 (배치 생산)
  { formType: "batch_production", name: "[CCP] 배치 CCP 승인 (자동)", category: "CCP 기록지" },
  { formType: "ccp_form", name: "[CCP] CCP 모니터링 기록지", category: "CCP 기록지" },
  { formType: "ccp_2b_baking", name: "[CCP-2B] 가열(굽기)공정 기록지", category: "CCP 기록지" },
  { formType: "ccp_1b_steam", name: "[CCP-1B] 가열(증숙)공정 기록지", category: "CCP 기록지" },
  { formType: "ccp_4p_metal", name: "[CCP-4P] 금속검출공정 기록지", category: "CCP 기록지" },
];

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

  // API 쿼리
  const { data: employees } = trpc.organization.employees.list.useQuery();
  const { data: existingSettings, refetch: refetchSettings } = trpc.organization.approvalSettings.list.useQuery();
  const activeEmployees = (employees || []).filter((e: any) => e.isActive === 1);

  const createMutation = trpc.organization.approvalSettings.create.useMutation();
  const updateMutation = trpc.organization.approvalSettings.update.useMutation();

  // 기존 설정 로드
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
  }, [existingSettings]);

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
  const categories = [...new Set(FORM_TYPES.map((ft) => ft.category))];
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
      <div className="max-w-[1400px]">
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

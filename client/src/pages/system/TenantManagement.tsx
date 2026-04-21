import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import SuperAdminLayout from "@/components/dashboard/SuperAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { 
  Building, 
  Calendar, 
  Users, 
  Search,
  CheckCircle,
  XCircle,
  Plus,
  Edit,
  Eye,
  Trash2,
  Package,
  Clock,
  AlertCircle,
  Database,
  Activity,
  FileText,
  ClipboardList,
  BarChart3,
  TrendingUp,
  Link2,
  Unlink,
  Factory,
} from "lucide-react";
import { motion as _motion } from "framer-motion";
const motion = _motion as any;
import { useToast } from "@/hooks/use-toast";

import { todayLocal } from "../../lib/dateUtils";
import { FEATURES } from "@/lib/featureFlags";
// 업종 카테고리/옵션은 `@/lib/industryOptions` 공유 상수 사용
import { INDUSTRY_OPTIONS, INDUSTRY_CATEGORIES } from "@/lib/industryOptions";
import { useIndustryLabel } from "@/hooks/useIndustryFeatures";

export default function TenantManagement() {
  const L = useIndustryLabel();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [subscriptionDialogOpen, setSubscriptionDialogOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<any>(null);
  const { toast } = useToast();

  // 폼 상태
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    status: "trial" as "active" | "suspended" | "trial" | "expired",
    industryCode: "C10" as string,
  });

  // 구독 폼 상태
  const [subscriptionForm, setSubscriptionForm] = useState({
    subscriptionPackage: "starter" as "starter" | "standard" | "enterprise",
    subscriptionDays: 30,
    startDate: todayLocal(),
  });

  // GOGOGOPICK 연동 폼 상태
  const [subscriptionTab, setSubscriptionTab] = useState("haccp");
  const [opscoreForm, setOpscoreForm] = useState({
    mappingId: 0,
    sync_enabled: false,
    opscore_tenant_id: null as number | null,
    opscore_tenant_name: null as string | null,
    sync_suppliers: true,
    sync_products: true,
    sync_materials: false,
    sync_orders: false,
    sync_inventory: false,
    sync_accounting: false,
  });

  // 테넌트 목록 조회
  const { data, isLoading, error, refetch } = trpc.tenants.list.useQuery({
    search: searchTerm || undefined,
    status: statusFilter !== "all" ? (statusFilter as any) : undefined,
    page: 1,
    pageSize: 100,
  });

  // GOGOGOPICK 연동 매핑 정보 조회
  const { data: opscoreMappings, refetch: refetchOpscore } = trpc.opscoreSync.getAllMappings.useQuery(
    undefined,
    { enabled: subscriptionDialogOpen }
  );

  // 테넌트 상세 정보 조회
  const { data: tenantDetail, isLoading: detailLoading } = trpc.tenant.getDetail.useQuery(
    { tenantId: selectedTenant?.id },
    { enabled: !!selectedTenant && detailDialogOpen }
  );

  // 테넌트 생성 mutation
  const createMutation = trpc.tenants.create.useMutation({
    onSuccess: () => {
      toast({
        title: "성공",
        description: "테넌트가 생성되었습니다.",
      });
      setCreateDialogOpen(false);
      setFormData({ name: "", slug: "", status: "trial", industryCode: "C10" });
      refetch();
    },
    onError: (error: { message: string }) => {
      toast({
        title: "오류",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // 테넌트 수정 mutation
  const updateMutation = trpc.tenants.update.useMutation({
    onSuccess: () => {
      toast({
        title: "성공",
        description: "테넌트가 수정되었습니다.",
      });
      setEditDialogOpen(false);
      setSelectedTenant(null);
      refetch();
    },
    onError: (error: { message: string }) => {
      toast({
        title: "오류",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // 구독 업데이트 mutation
  const updateSubscriptionMutation = trpc.subscriptionPublic.updateSubscription.useMutation({
    onSuccess: () => {
      toast({
        title: "성공",
        description: "구독 정보가 업데이트되었습니다.",
      });
      setSubscriptionDialogOpen(false);
      setSelectedTenant(null);
      refetch();
    },
    onError: (error: { message: string }) => {
      toast({
        title: "오류",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // GOGOGOPICK 연동 업데이트 mutation
  const updateOpscoreMappingMutation = trpc.opscoreSync.updateMapping.useMutation({
    onSuccess: () => {
      toast({
        title: "✅ 저장 완료",
        description: "GOGOGOPICK 연동 설정이 성공적으로 업데이트되었습니다.",
      });
      refetchOpscore();
      setTimeout(() => {
        setSubscriptionDialogOpen(false);
      }, 500);
    },
    onError: (error: { message: string }) => {
      toast({
        title: "❌ 오류 발생",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // 구독 연장 mutation
  const extendSubscriptionMutation = trpc.subscriptionPublic.extendSubscription.useMutation({
    onSuccess: () => {
      toast({
        title: "성공",
        description: "구독이 연장되었습니다.",
      });
      refetch();
    },
    onError: (error: { message: string }) => {
      toast({
        title: "오류",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // 테넌트 삭제 mutation
  const deleteMutation = trpc.tenants.delete.useMutation({
    onSuccess: () => {
      toast({
        title: "성공",
        description: "테넌트가 삭제되었습니다.",
      });
      refetch();
    },
    onError: (error: { message: string }) => {
      toast({
        title: "오류",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleCreate = () => {
    createMutation.mutate(formData);
  };

  const handleUpdate = () => {
    if (selectedTenant) {
      // 수정 확인 메시지
      if (!confirm(`정말 '${selectedTenant.name}' 테넌트를 수정하시겠습니까?`)) {
        return;
      }
      // slug는 생성 시에만 설정되고 수정 시에는 변경 불가
      const { slug, ...updateData } = formData;
      // 업종코드로부터 카테고리 자동 설정
      const opt = INDUSTRY_OPTIONS.find(o => o.code === updateData.industryCode);
      updateMutation.mutate({
        tenantId: selectedTenant.id,
        ...updateData,
        industryCategory: opt?.category || "general",
      });
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("정말 이 테넌트를 삭제하시겠습니까?")) {
      deleteMutation.mutate({ tenantId: id });
    }
  };

  const handleUpdateSubscription = () => {
    if (selectedTenant) {
      updateSubscriptionMutation.mutate({
        tenantId: selectedTenant.id,
        ...subscriptionForm,
      });
    }
  };

  const handleExtendSubscription = (tenantId: number, days: number) => {
    extendSubscriptionMutation.mutate({
      tenantId,
      additionalDays: days,
    });
  };

  const openEditDialog = (tenant: any) => {
    setSelectedTenant(tenant);
    setFormData({
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      industryCode: tenant.industryCode || "C10",
    });
    setEditDialogOpen(true);
  };

  const openDetailDialog = (tenant: any) => {
    setSelectedTenant(tenant);
    setDetailDialogOpen(true);
  };

  const openSubscriptionDialog = (tenant: any) => {
    setSelectedTenant(tenant);
    // ★ 2026-04-14: Date/ISO string → "YYYY-MM-DD" 변환
    //   <Input type="date"> 는 "YYYY-MM-DD" 문자열만 받으므로 Date 객체를 주면 빈 값 표시됨
    //   → 사용자가 그대로 "업데이트" 누르면 Zod 에서 string 이 아닌 값 받아 실패하던 버그 수정
    let startDateStr = todayLocal();
    if (tenant.subscriptionStartDate) {
      try {
        const d = new Date(tenant.subscriptionStartDate);
        if (!isNaN(d.getTime())) {
          // 로컬 기준 YYYY-MM-DD (UTC 변환 시 날짜 밀림 방지)
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, "0");
          const dd = String(d.getDate()).padStart(2, "0");
          startDateStr = `${yyyy}-${mm}-${dd}`;
        }
      } catch { /* fallback to todayLocal */ }
    }
    // ★ 패키지 값 검증 (구 값 "basic" / "pro" 호환)
    const rawPkg = tenant.subscriptionPackage;
    const validPkg: "starter" | "standard" | "enterprise" =
      rawPkg === "starter" || rawPkg === "standard" || rawPkg === "enterprise"
        ? rawPkg
        : "starter";
    setSubscriptionForm({
      subscriptionPackage: validPkg,
      subscriptionDays: tenant.subscriptionDays || 30,
      startDate: startDateStr,
    });
    setSubscriptionTab("haccp");
    setSubscriptionDialogOpen(true);
  };

  // GOGOGOPICK 연동 폼 초기화 (selectedTenant 변경 시)
  useEffect(() => {
    if (selectedTenant && opscoreMappings) {
      const mapping = opscoreMappings.mappings?.find(
        (m: any) => m.haccp_tenant_id === selectedTenant.id
      );
      if (mapping) {
        setOpscoreForm({
          mappingId: mapping.id,
          sync_enabled: !!mapping.sync_enabled,
          opscore_tenant_id: mapping.opscore_tenant_id || null,
          opscore_tenant_name: mapping.opscore_tenant_name || null,
          sync_suppliers: !!mapping.sync_suppliers,
          sync_products: !!mapping.sync_products,
          sync_materials: !!mapping.sync_materials,
          sync_orders: !!mapping.sync_orders,
          sync_inventory: !!mapping.sync_inventory,
          sync_accounting: !!mapping.sync_accounting,
        });
      } else {
        setOpscoreForm({
          mappingId: 0,
          sync_enabled: false,
          opscore_tenant_id: null,
          opscore_tenant_name: null,
          sync_suppliers: true,
          sync_products: true,
          sync_materials: false,
          sync_orders: false,
          sync_inventory: false,
          sync_accounting: false,
        });
      }
    }
  }, [selectedTenant, opscoreMappings]);

  const handleUpdateOpscoreMapping = () => {
    const payload = {
      ...opscoreForm,
      haccp_tenant_id: selectedTenant?.id,
    };
    updateOpscoreMappingMutation.mutate(payload);
  };

  const tenants = data?.tenants || [];

  // 구독 상태 뱃지 렌더링
  const renderSubscriptionBadge = (tenant: any) => {
    if (!tenant.subscriptionEndDate) {
      return <Badge variant="outline">구독 없음</Badge>;
    }

    const today = new Date();
    const endDate = new Date(tenant.subscriptionEndDate);
    const daysLeft = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (tenant.status === "suspended") {
      return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />차단됨</Badge>;
    }

    if (tenant.status === "expired" && tenant.isReadOnly) {
      return <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />유예기간 ({daysLeft}일 남음)</Badge>;
    }

    if (daysLeft <= 1) {
      return <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />만료 임박</Badge>;
    }

    if (daysLeft <= 7) {
      return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />{daysLeft}일 남음</Badge>;
    }

    return <Badge variant="default"><CheckCircle className="h-3 w-3 mr-1" />정상</Badge>;
  };

  // 역할 뱃지 렌더링
  const renderRoleBadge = (role: string) => {
    const roleMap: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
      super_admin: { label: "슈퍼관리자", variant: "default" },
      admin: { label: "관리자", variant: "default" },
      worker: { label: "작업자", variant: "secondary" },
      monitor: { label: "모니터", variant: "outline" },
    };
    const roleInfo = roleMap[role] || { label: role, variant: "outline" as const };
    return <Badge variant={roleInfo.variant}>{roleInfo.label}</Badge>;
  };

  // 승인 상태 뱃지 렌더링
  const renderApprovalBadge = (status: string) => {
    if (status === "approved") {
      return <Badge variant="default"><CheckCircle className="h-3 w-3 mr-1" />승인됨</Badge>;
    } else if (status === "pending") {
      return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />대기중</Badge>;
    } else if (status === "rejected") {
      return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />거부됨</Badge>;
    }
    return <Badge variant="outline">{status}</Badge>;
  };

  return (
    <SuperAdminLayout>
      <div className="space-y-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">테넌트 관리</h1>
            <p className="text-muted-foreground mt-1">
              회사별 테넌트 및 구독 관리
            </p>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            새 테넌트 생성
          </Button>
        </div>

        {/* 현재 선택된 테넌트 표시 */}
        <Card className="bg-gradient-to-r from-purple-50 to-blue-50 border-purple-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Building className="h-5 w-5 text-purple-600" />
              <div>
                <p className="text-sm font-medium text-purple-900">
                  현재 선택된 테넌트: <span className="font-bold">전체 테넌트 관리 모드</span>
                </p>
                <p className="text-xs text-purple-700 mt-0.5">
                  슈퍼관리자는 모든 테넌트를 수정/삭제할 수 있습니다. 수정 시 확인 메시지가 표시됩니다.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 필터 */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="테넌트 검색..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="상태 필터" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  <SelectItem value="active">활성</SelectItem>
                  <SelectItem value="trial">체험</SelectItem>
                  <SelectItem value="expired">만료</SelectItem>
                  <SelectItem value="suspended">정지</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* 로딩 상태 */}
        {isLoading && (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">로딩 중...</p>
            </CardContent>
          </Card>
        )}

        {/* 에러 상태 */}
        {error && (
          <Card>
            <CardContent className="py-12 text-center">
              <XCircle className="h-12 w-12 text-red-600 mx-auto mb-4" />
              <p className="text-red-600 font-medium">오류가 발생했습니다</p>
              <p className="text-sm text-muted-foreground mt-2">{error.message}</p>
            </CardContent>
          </Card>
        )}

        {/* 테넌트 카드 목록 */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tenants.map((tenant: any, index: number) => (
            <motion.div
              key={tenant.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <Building className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{tenant.name}</CardTitle>
                        <CardDescription className="text-xs">
                          {tenant.slug}
                        </CardDescription>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* 상태 뱃지 */}
                  <div className="flex gap-2 flex-wrap">
                    <Badge 
                      variant={
                        tenant.status === "active" ? "default" :
                        tenant.status === "trial" ? "secondary" :
                        tenant.status === "suspended" ? "destructive" :
                        "outline"
                      }
                    >
                      {tenant.status === "active" && <><CheckCircle className="h-3 w-3 mr-1" /> 활성</>}
                      {tenant.status === "trial" && "체험"}
                      {tenant.status === "suspended" && <><XCircle className="h-3 w-3 mr-1" /> 정지</>}
                      {tenant.status === "expired" && "만료"}
                    </Badge>
                    {renderSubscriptionBadge(tenant)}
                  </div>

                  {/* 업종 */}
                  {(() => {
                    const cat = INDUSTRY_CATEGORIES[tenant.industryCategory || "food"] || INDUSTRY_CATEGORIES.general;
                    const CatIcon = cat.icon;
                    return (
                      <div className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md border ${cat.color}`}>
                        <CatIcon className="h-3 w-3" />
                        {cat.label}
                        <span className="text-[10px] opacity-60">({tenant.industryCode || "C10"})</span>
                      </div>
                    );
                  })()}

                  {/* 구독 정보 */}
                  {tenant.subscriptionPackage && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Package className="h-4 w-4" />
                      <span>
                        패키지: {tenant.subscriptionPackage === "starter" ? "Starter" : tenant.subscriptionPackage === "standard" ? "Standard" : tenant.subscriptionPackage === "enterprise" ? "Enterprise" : tenant.subscriptionPackage}
                      </span>
                    </div>
                  )}

                  {tenant.subscriptionEndDate && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      <span>
                        만료일: {new Date(tenant.subscriptionEndDate).toLocaleDateString('ko-KR')}
                      </span>
                    </div>
                  )}

                  {/* 생성일 */}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>
                      생성일: {new Date(tenant.createdAt).toLocaleDateString('ko-KR')}
                    </span>
                  </div>

                  {/* 액션 버튼 */}
                  <div className="pt-3 border-t flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex-1"
                      onClick={() => openDetailDialog(tenant)}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      상세보기
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex-1"
                      onClick={() => openSubscriptionDialog(tenant)}
                    >
                      <Package className="h-4 w-4 mr-1" />
                      구독
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex-1"
                      onClick={() => openEditDialog(tenant)}
                    >
                      <Edit className="h-4 w-4 mr-1" />
                      수정
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleDelete(tenant.id)}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* 검색 결과 없음 */}
        {tenants.length === 0 && !isLoading && (
          <Card>
            <CardContent className="py-12 text-center">
              <Building className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                {searchTerm ? "검색 결과가 없습니다" : "등록된 테넌트가 없습니다"}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* 테넌트 상세보기 다이얼로그 */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building className="h-5 w-5" />
              {selectedTenant?.name} 상세 정보
            </DialogTitle>
            <DialogDescription>
              테넌트의 구성원, 사용 데이터량, 활동 통계를 확인할 수 있습니다.
            </DialogDescription>
          </DialogHeader>

          {detailLoading && (
            <div className="py-12 text-center">
              <p className="text-muted-foreground">로딩 중...</p>
            </div>
          )}

          {!detailLoading && tenantDetail && (
            <div className="space-y-6 py-4">
              {/* 1. 구성원 목록 (우선순위 1) */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-semibold">구성원 목록</h3>
                  <Badge variant="secondary">{tenantDetail.memberCount}명</Badge>
                </div>
                
                {tenantDetail.members && tenantDetail.members.length > 0 ? (
                  <Card>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>이름</TableHead>
                            <TableHead>이메일</TableHead>
                            <TableHead>역할</TableHead>
                            <TableHead>승인 상태</TableHead>
                            <TableHead>활성 상태</TableHead>
                            <TableHead>최근 로그인</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {tenantDetail.members.map((member: any) => (
                            <TableRow key={member.id}>
                              <TableCell className="font-medium">{member.name}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{member.email}</TableCell>
                              <TableCell>{renderRoleBadge(member.role)}</TableCell>
                              <TableCell>{renderApprovalBadge(member.approvalStatus)}</TableCell>
                              <TableCell>
                                {member.isActive ? (
                                  <Badge variant="default"><CheckCircle className="h-3 w-3 mr-1" />활성</Badge>
                                ) : (
                                  <Badge variant="outline"><XCircle className="h-3 w-3 mr-1" />비활성</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {member.lastLoginAt 
                                  ? new Date(member.lastLoginAt).toLocaleString('ko-KR')
                                  : "로그인 기록 없음"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="py-8 text-center">
                      <Users className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                      <p className="text-muted-foreground">등록된 구성원이 없습니다</p>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* 2. 사용 데이터량 (우선순위 2) */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Database className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-semibold">사용 데이터량</h3>
                </div>
                
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 border-blue-200 dark:border-blue-800">
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-blue-600 dark:text-blue-400">{L("batch")}</p>
                          <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                            {tenantDetail.dataUsage?.batches || 0}
                          </p>
                        </div>
                        <Package className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 border-green-200 dark:border-green-800">
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-green-600 dark:text-green-400">CCP 인스턴스</p>
                          <p className="text-2xl font-bold text-green-900 dark:text-green-100">
                            {tenantDetail.dataUsage?.ccpInstances || 0}
                          </p>
                        </div>
                        <AlertCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900 border-purple-200 dark:border-purple-800">
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-purple-600 dark:text-purple-400">문서</p>
                          <p className="text-2xl font-bold text-purple-900 dark:text-purple-100">
                            {tenantDetail.dataUsage?.documents || 0}
                          </p>
                        </div>
                        <FileText className="h-8 w-8 text-purple-600 dark:text-purple-400" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950 dark:to-orange-900 border-orange-200 dark:border-orange-800">
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-orange-600 dark:text-orange-400">체크리스트</p>
                          <p className="text-2xl font-bold text-orange-900 dark:text-orange-100">
                            {tenantDetail.dataUsage?.checklists || 0}
                          </p>
                        </div>
                        <ClipboardList className="h-8 w-8 text-orange-600 dark:text-orange-400" />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* 3. 활동 통계 (우선순위 3) */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-semibold">활동 통계</h3>
                </div>
                
                <div className="grid gap-4 md:grid-cols-3">
                  <Card className="bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-950 dark:to-indigo-900 border-indigo-200 dark:border-indigo-800">
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400">최근 7일 활성 사용자</p>
                          <p className="text-2xl font-bold text-indigo-900 dark:text-indigo-100">
                            {tenantDetail.activityStats?.activeUsersLast7Days || 0}명
                          </p>
                        </div>
                        <TrendingUp className="h-8 w-8 text-indigo-600 dark:text-indigo-400" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-gradient-to-br from-pink-50 to-pink-100 dark:from-pink-950 dark:to-pink-900 border-pink-200 dark:border-pink-800">
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-pink-600 dark:text-pink-400">최근 7일 총 로그인</p>
                          <p className="text-2xl font-bold text-pink-900 dark:text-pink-100">
                            {tenantDetail.activityStats?.totalLoginsLast7Days || 0}회
                          </p>
                        </div>
                        <BarChart3 className="h-8 w-8 text-pink-600 dark:text-pink-400" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-gradient-to-br from-teal-50 to-teal-100 dark:from-teal-950 dark:to-teal-900 border-teal-200 dark:border-teal-800">
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-teal-600 dark:text-teal-400">마지막 활동</p>
                          <p className="text-sm font-bold text-teal-900 dark:text-teal-100">
                            {tenantDetail.activityStats?.lastActivity 
                              ? new Date(tenantDetail.activityStats.lastActivity).toLocaleString('ko-KR')
                              : "활동 없음"}
                          </p>
                        </div>
                        <Clock className="h-8 w-8 text-teal-600 dark:text-teal-400" />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailDialogOpen(false)}>
              닫기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 테넌트 생성 다이얼로그 */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>새 테넌트 생성</DialogTitle>
            <DialogDescription>
              새로운 회사(테넌트)를 생성합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">회사명</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="예: 주식회사 ABC"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">슬러그 (URL 식별자)</Label>
              <Input
                id="slug"
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                placeholder="예: abc-company"
              />
              <p className="text-xs text-muted-foreground">
                소문자, 숫자, 하이픈만 사용 가능합니다
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">초기 상태</Label>
              <Select
                value={formData.status}
                onValueChange={(value: any) => setFormData({ ...formData, status: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="trial">체험</SelectItem>
                  <SelectItem value="active">활성</SelectItem>
                  <SelectItem value="suspended">정지</SelectItem>
                  <SelectItem value="expired">만료</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-industry">업종</Label>
              <Select
                value={formData.industryCode}
                onValueChange={(value: string) => setFormData({ ...formData, industryCode: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="업종 선택" />
                </SelectTrigger>
                <SelectContent>
                  {INDUSTRY_OPTIONS.map(opt => {
                    const cat = INDUSTRY_CATEGORIES[opt.category];
                    const CatIcon = cat?.icon || Factory;
                    return (
                      <SelectItem key={opt.code} value={opt.code}>
                        <span className="flex items-center gap-2">
                          <CatIcon className="h-3.5 w-3.5" />
                          {opt.label}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? "생성 중..." : "생성"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 테넌트 수정 다이얼로그 */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>테넌트 수정</DialogTitle>
            <DialogDescription>
              테넌트 정보를 수정합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">회사명</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-slug">슬러그</Label>
              <Input
                id="edit-slug"
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-status">상태</Label>
              <Select
                value={formData.status}
                onValueChange={(value: any) => setFormData({ ...formData, status: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="trial">체험</SelectItem>
                  <SelectItem value="active">활성</SelectItem>
                  <SelectItem value="suspended">정지</SelectItem>
                  <SelectItem value="expired">만료</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-industry">업종</Label>
              <Select
                value={formData.industryCode}
                onValueChange={(value: string) => {
                  const opt = INDUSTRY_OPTIONS.find(o => o.code === value);
                  setFormData({ ...formData, industryCode: value });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="업종 선택" />
                </SelectTrigger>
                <SelectContent>
                  {INDUSTRY_OPTIONS.map(opt => {
                    const cat = INDUSTRY_CATEGORIES[opt.category];
                    const CatIcon = cat?.icon || Factory;
                    return (
                      <SelectItem key={opt.code} value={opt.code}>
                        <span className="flex items-center gap-2">
                          <CatIcon className="h-3.5 w-3.5" />
                          {opt.label}
                          <span className="text-xs text-muted-foreground">({opt.code})</span>
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "수정 중..." : "수정"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 구독 및 연동 관리 다이얼로그 */}
      <Dialog open={subscriptionDialogOpen} onOpenChange={setSubscriptionDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>구독 및 연동 관리</DialogTitle>
            <DialogDescription>
              {selectedTenant?.name}의 구독 및 연동 정보를 관리합니다.
            </DialogDescription>
          </DialogHeader>

          <Tabs value={subscriptionTab} onValueChange={setSubscriptionTab} className="w-full">
            {/* ★ GOGOGOPICK 연동 탭은 feature flag 로 제어. 비활성 시 단일 탭만 표시 */}
            <TabsList className={`grid w-full ${FEATURES.GOGOGOPICK_INTEGRATION ? "grid-cols-2" : "grid-cols-1"}`}>
              <TabsTrigger value="haccp" className="flex items-center gap-1">
                <Package className="h-4 w-4" />
                HACCP 구독
              </TabsTrigger>
              {FEATURES.GOGOGOPICK_INTEGRATION && (
                <TabsTrigger value="gogogopick" className="flex items-center gap-1">
                  <Link2 className="h-4 w-4" />
                  GOGOGOPICK 연동
                </TabsTrigger>
              )}
            </TabsList>

            {/* HACCP 구독 탭 */}
            <TabsContent value="haccp" className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="package">패키지</Label>
                <Select
                  value={subscriptionForm.subscriptionPackage}
                  onValueChange={(value: any) => 
                    setSubscriptionForm({ ...subscriptionForm, subscriptionPackage: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="starter">Starter (월 99,000원)</SelectItem>
                    <SelectItem value="standard">Standard (월 199,000원)</SelectItem>
                    <SelectItem value="enterprise">Enterprise (월 299,000원)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="days">구독 기간 (일)</Label>
                <Input
                  id="days"
                  type="number"
                  min="1"
                  value={subscriptionForm.subscriptionDays}
                  onChange={(e) => 
                    setSubscriptionForm({ 
                      ...subscriptionForm, 
                      subscriptionDays: parseInt(e.target.value) || 30 
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="startDate">시작일</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={subscriptionForm.startDate}
                  onChange={(e) => 
                    setSubscriptionForm({ ...subscriptionForm, startDate: e.target.value })
                  }
                />
              </div>

              {/* 빠른 연장 버튼 */}
              {selectedTenant?.subscriptionEndDate && (
                <div className="space-y-2 pt-4 border-t">
                  <Label>빠른 연장</Label>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleExtendSubscription(selectedTenant.id, 30)}
                    >
                      +30일
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleExtendSubscription(selectedTenant.id, 90)}
                    >
                      +90일
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleExtendSubscription(selectedTenant.id, 365)}
                    >
                      +1년
                    </Button>
                  </div>
                </div>
              )}

              <DialogFooter className="pt-4">
                <Button variant="outline" onClick={() => setSubscriptionDialogOpen(false)}>
                  취소
                </Button>
                <Button onClick={handleUpdateSubscription} disabled={updateSubscriptionMutation.isPending}>
                  {updateSubscriptionMutation.isPending ? "업데이트 중..." : "업데이트"}
                </Button>
              </DialogFooter>
            </TabsContent>

            {/* GOGOGOPICK 연동 탭 (feature flag 제어) */}
            {FEATURES.GOGOGOPICK_INTEGRATION && (
            <TabsContent value="gogogopick" className="space-y-4 pt-2">
              {opscoreForm.mappingId === 0 ? (
                <div className="py-8 text-center">
                  <Unlink className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">이 테넌트의 GOGOGOPICK 연동 매핑이 아직 생성되지 않았습니다.</p>
                  <p className="text-xs text-muted-foreground mt-1">GOGOGOPICK 연동 페이지에서 매핑을 먼저 생성해주세요.</p>
                </div>
              ) : (
                <>
                  {/* 연동 허용 토글 */}
                  <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
                    <div className="space-y-0.5">
                      <Label className="text-base font-medium">연동 허용</Label>
                      <p className="text-sm text-muted-foreground">
                        이 테넌트의 GOGOGOPICK 데이터 동기화를 허용합니다
                      </p>
                    </div>
                    <Switch
                      checked={opscoreForm.sync_enabled}
                      onCheckedChange={(checked) => 
                        setOpscoreForm({ ...opscoreForm, sync_enabled: checked })
                      }
                    />
                  </div>

                  {/* GOGOGOPICK 테넌트 매칭 */}
                  <div className="space-y-2">
                    <Label>GOGOGOPICK 테넌트 매칭</Label>
                    <Select
                      value={opscoreForm.opscore_tenant_id?.toString() || "none"}
                      onValueChange={(value) => {
                        if (value === "none") {
                          setOpscoreForm({ ...opscoreForm, opscore_tenant_id: null, opscore_tenant_name: null });
                        } else {
                          const tenant = opscoreMappings?.opscoreTenants?.find((t: any) => t.id.toString() === value);
                          setOpscoreForm({
                            ...opscoreForm,
                            opscore_tenant_id: parseInt(value),
                            opscore_tenant_name: tenant?.name || null,
                          });
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="GOGOGOPICK 테넌트 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">매칭 없음</SelectItem>
                        {opscoreMappings?.opscoreTenants?.map((t: any) => (
                          <SelectItem key={t.id} value={t.id.toString()}>
                            {t.name} ({t.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {opscoreMappings?.opscoreTenants?.length === 0 && (
                      <p className="text-xs text-orange-600">
                        GOGOGOPICK 서버에 등록된 테넌트가 없습니다.
                      </p>
                    )}
                  </div>

                  <Separator />

                  {/* 동기화 범위 설정 */}
                  <div className="space-y-3">
                    <Label className="text-base font-medium">동기화 범위</Label>
                    <p className="text-sm text-muted-foreground -mt-1">
                      양방향 동기화할 데이터 유형을 선택합니다.
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="sync_suppliers"
                          checked={opscoreForm.sync_suppliers}
                          onCheckedChange={(checked) =>
                            setOpscoreForm({ ...opscoreForm, sync_suppliers: !!checked })
                          }
                        />
                        <Label htmlFor="sync_suppliers" className="text-sm font-normal cursor-pointer">거래처</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="sync_products"
                          checked={opscoreForm.sync_products}
                          onCheckedChange={(checked) =>
                            setOpscoreForm({ ...opscoreForm, sync_products: !!checked })
                          }
                        />
                        <Label htmlFor="sync_products" className="text-sm font-normal cursor-pointer">{L("product")}</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="sync_materials"
                          checked={opscoreForm.sync_materials}
                          onCheckedChange={(checked) =>
                            setOpscoreForm({ ...opscoreForm, sync_materials: !!checked })
                          }
                        />
                        <Label htmlFor="sync_materials" className="text-sm font-normal cursor-pointer">{L("material")}</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="sync_orders"
                          checked={opscoreForm.sync_orders}
                          onCheckedChange={(checked) =>
                            setOpscoreForm({ ...opscoreForm, sync_orders: !!checked })
                          }
                        />
                        <Label htmlFor="sync_orders" className="text-sm font-normal cursor-pointer">발주/주문</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="sync_inventory"
                          checked={opscoreForm.sync_inventory}
                          onCheckedChange={(checked) =>
                            setOpscoreForm({ ...opscoreForm, sync_inventory: !!checked })
                          }
                        />
                        <Label htmlFor="sync_inventory" className="text-sm font-normal cursor-pointer">재고</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="sync_accounting"
                          checked={opscoreForm.sync_accounting}
                          onCheckedChange={(checked) =>
                            setOpscoreForm({ ...opscoreForm, sync_accounting: !!checked })
                          }
                        />
                        <Label htmlFor="sync_accounting" className="text-sm font-normal cursor-pointer">회계</Label>
                      </div>
                    </div>
                  </div>

                  {/* 현재 상태 요약 */}
                  {opscoreForm.opscore_tenant_name && (
                    <div className="p-3 rounded-lg bg-muted/50 text-sm">
                      <div className="flex items-center gap-2 mb-1">
                        <Link2 className="h-4 w-4 text-primary" />
                        <span className="font-medium">매칭 정보</span>
                      </div>
                      <p className="text-muted-foreground">
                        {selectedTenant?.name} ↔ {opscoreForm.opscore_tenant_name}
                      </p>
                    </div>
                  )}

                  <DialogFooter className="pt-4">
                    <Button variant="outline" onClick={() => setSubscriptionDialogOpen(false)}>
                      취소
                    </Button>
                    <Button 
                      onClick={handleUpdateOpscoreMapping} 
                      disabled={updateOpscoreMappingMutation.isPending}
                    >
                      {updateOpscoreMappingMutation.isPending ? "저장 중..." : "GOGOGOPICK 연동 저장"}
                    </Button>
                  </DialogFooter>
                </>
              )}
            </TabsContent>
            )}
          </Tabs>
        </DialogContent>
      </Dialog>
    </SuperAdminLayout>
  );
}

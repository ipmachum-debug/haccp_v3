/**
 * 관리자 설정 페이지
 * 데이터베이스 초기화 및 샘플 데이터 생성 기능
 */

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MaterialCombobox } from "@/components/inventory/MaterialCombobox";
import WidgetSettingsPanel from "@/components/dashboard/WidgetSettingsPanel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Loader2, Database, FileSpreadsheet, AlertTriangle, Trash2, Archive, Settings, Clock, Play, Building2, Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useIndustryLabel } from "@/hooks/useIndustryFeatures";
import { useAuth } from "@/_core/hooks/useAuth";
import IndustryPicker from "@/components/system/IndustryPicker";
import { Factory } from "lucide-react";
// DashboardLayout removed - managed by SystemManagement

export default function AdminSettings() {
  const L = useIndustryLabel();
  // DB 초기화·샘플 데이터는 개발·운영 도구 — 플랫폼 관리자에게만 (고객 관리자 화면에서 숨김, 서버도 같은 조건)
  const { user } = useAuth();
  const isPlatformAdmin = String((user as any)?.role ?? "") === "super_admin";
  const [showInitDialog, setShowInitDialog] = useState(false);
  const [showSeedDialog, setShowSeedDialog] = useState(false);
  const [deleteOldDays, setDeleteOldDays] = useState(30);
  const [archiveType, setArchiveType] = useState("");
  const [retentionDays, setRetentionDays] = useState(30);

  // ★ 2026-04-13: 회사 정보 (거래명세표 PDF 에 자동 반영)
  const [companyForm, setCompanyForm] = useState({
    companyName: "",
    companyBusinessNumber: "",
    companyRepresentative: "",
    companyAddress: "",
    companyPhone: "",
  });
  const utilsCompany = trpc.useUtils();
  const { data: companyInfoData } = trpc.companyInfo.get.useQuery();
  useEffect(() => {
    if (companyInfoData) {
      setCompanyForm({
        companyName: (companyInfoData as any).companyName || "",
        companyBusinessNumber: (companyInfoData as any).companyBusinessNumber || "",
        companyRepresentative: (companyInfoData as any).companyRepresentative || "",
        companyAddress: (companyInfoData as any).companyAddress || "",
        companyPhone: (companyInfoData as any).companyPhone || "",
      });
    }
  }, [companyInfoData]);
  const updateCompanyInfoMutation = trpc.companyInfo.update.useMutation({
    onSuccess: () => {
      toast.success("회사 정보가 저장되었습니다. 거래명세표에 즉시 반영됩니다.");
      utilsCompany.companyInfo.get.invalidate();
    },
    onError: (err: { message: string }) => {
      toast.error(`저장 실패: ${err.message || "알 수 없는 오류"}`);
    },
  });
  const handleSaveCompanyInfo = () => {
    if (!companyForm.companyName.trim()) {
      toast.error("회사명은 필수입니다");
      return;
    }
    updateCompanyInfoMutation.mutate(companyForm);
  };
  
  // 알림 보관 정책 설정 조회
  // ★ 2026-10-16 생산 계산 방식 — 원물·공정 기준(수율 환산) 은 회사가 선택 (기본 꺼짐)
  const { data: massBasisFeature, refetch: refetchMassBasis } = trpc.mfReport.massBasisFeature.useQuery();
  const setMassBasisMutation = trpc.mfReport.setMassBasisFeature.useMutation({
    onSuccess: (r: { enabled: boolean }) => {
      toast.success(r.enabled ? "수율 환산 방식을 사용합니다" : "수율 환산 방식을 사용하지 않습니다 (기본 BOM 계산)");
      refetchMassBasis();
    },
    onError: (e: { message: string }) => toast.error(`변경 실패: ${e.message}`),
  });
  // ★ 2026-10-17 재고관리 사용 여부 (회사 선택) — 회계만 쓰는 회사는 LOT·재고 없이 전표만
  const { data: invTracking, refetch: refetchInvTracking } = trpc.inbound.inventoryTracking.useQuery();
  const setInvTrackingMutation = trpc.inbound.setInventoryTracking.useMutation({
    onSuccess: (r: { enabled: boolean }) => {
      toast.success(r.enabled ? "재고관리를 사용합니다 (입고·출고가 LOT·재고에 반영)" : "회계만 사용합니다 (LOT·재고 없이 전표만)");
      refetchInvTracking();
    },
    onError: (e: { message: string }) => toast.error(`변경 실패: ${e.message}`),
  });
  // ★ 2026-10-17 재고 차감 제외 원료 (CEO 결정 — 정제수 등): 자동출고가 투입만 기록하고 LOT·재고를 쓰지 않는다
  const { data: exemptList = [], refetch: refetchExempt } = trpc.inbound.stockExemptMaterials.useQuery();
  const [exemptPick, setExemptPick] = useState<{ id: number; name: string } | null>(null);
  const setExemptMutation = trpc.inbound.setStockExempt.useMutation({
    onSuccess: (r: { exempt: boolean }) => {
      toast.success(r.exempt ? "재고 차감에서 제외했습니다 (다음 출고부터)" : "재고 차감에 다시 포함했습니다");
      setExemptPick(null);
      refetchExempt();
    },
    onError: (e: { message: string }) => toast.error(`변경 실패: ${e.message}`),
  });
  const { data: retentionPolicy } = trpc.notification.getNotificationRetentionPolicy.useQuery();
  
  // 스케줄러 실행 이력 조회
  const { data: schedulerLogs, refetch: refetchLogs } = trpc.scheduler.getLogs.useQuery({ limit: 10 });
  
  useEffect(() => {
    if (retentionPolicy) {
      setRetentionDays(retentionPolicy.days);
    }
  }, [retentionPolicy]);

  const initializeMutation = trpc.admin.initializeDatabase.useMutation({
    onSuccess: () => {
      toast.success("데이터베이스 스키마가 성공적으로 생성되었습니다");
      setShowInitDialog(false);
    },
    onError: (error: { message: string }) => {
      toast.error(`데이터베이스 초기화 실패: ${error.message}`);
    },
  });

  const seedMutation = trpc.admin.seedSampleData.useMutation({
    onSuccess: (result: any) => {
      toast.success(
        `샘플 데이터 생성 완료: 사용자 ${result.data.users}명, 제품 ${result.data.products}개, 원재료 ${result.data.materials}개, 배치 ${result.data.batches}개`
      );
      setShowSeedDialog(false);
    },
    onError: (error: { message: string }) => {
      toast.error(`샘플 데이터 생성 실패: ${error.message}`);
    },
  });

  const handleInitialize = () => {
    initializeMutation.mutate();
  };

  const handleSeed = () => {
    seedMutation.mutate();
  };

  const deleteOldReadMutation = trpc.notification.deleteOldReadNotifications.useMutation({
    onSuccess: (result: any) => {
      toast.success(`${result.deletedCount}개의 오래된 알림이 삭제되었습니다`);
    },
    onError: (error: { message: string }) => {
      toast.error(`자동 삭제 실패: ${error.message}`);
    },
  });

  const archiveByTypeMutation = trpc.notification.archiveByType.useMutation({
    onSuccess: (result: any) => {
      toast.success(`${result.archivedCount}개의 알림이 아카이브되었습니다`);
      setArchiveType("");
    },
    onError: (error: { message: string }) => {
      toast.error(`아카이브 실패: ${error.message}`);
    },
  });

  const handleDeleteOldRead = () => {
    deleteOldReadMutation.mutate({ days: deleteOldDays });
  };

  const handleArchiveByType = () => {
    if (!archiveType.trim()) {
      toast.error("알림 타입을 입력해주세요");
      return;
    }
    archiveByTypeMutation.mutate({ type: archiveType });
  };

  const runSchedulerManuallyMutation = trpc.scheduler.runManually.useMutation({
    onSuccess: (result: any) => {
      toast.success(result.message);
      refetchLogs();
    },
    onError: (error: { message: string }) => {
      toast.error(`수동 실행 실패: ${error.message}`);
    },
  });

  const handleRunSchedulerManually = () => {
    runSchedulerManuallyMutation.mutate();
  };
  
  // 알림 보관 정책 설정 저장
  const setRetentionPolicyMutation = trpc.notification.setNotificationRetentionPolicy.useMutation({
    onSuccess: (result: any) => {
      toast.success(result.message);
    },
    onError: (error: { message: string }) => {
      toast.error(`설정 저장 실패: ${error.message}`);
    },
  });
  
  const handleSaveRetentionPolicy = () => {
    if (retentionDays < 1 || retentionDays > 365) {
      toast.error("보관 기간은 1일부터 365일 사이여야 합니다");
      return;
    }
    setRetentionPolicyMutation.mutate({ days: retentionDays });
  };

  return (

    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">관리자 설정</h1>
        <p className="text-muted-foreground mt-2">
          업종, 회사 정보, 알림·보관 설정{isPlatformAdmin ? " · (플랫폼 관리자) 개발용 도구" : ""}
        </p>
      </div>

      {/* 업종 — 메뉴·기록지·라벨이 업종을 따른다 (2026-10-20 신규 회사 시험: 설정에서 업종 칸을 찾을 수 없었음) */}
      <Card data-testid="industry-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Factory className="h-5 w-5 text-primary" />
            <CardTitle>업종</CardTitle>
          </div>
          <CardDescription>고른 업종에 맞는 메뉴(식품이면 생산·생산 설계·CCP)와 기록지가 열립니다.</CardDescription>
        </CardHeader>
        <CardContent><IndustryPicker /></CardContent>
      </Card>

      {/* ★ 2026-04-13: 회사 정보 (거래명세표 PDF 에 자동 반영) */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <CardTitle>회사 정보</CardTitle>
          </div>
          <CardDescription>
            매입/매출 거래명세표 PDF 및 공식 문서에 표시되는 우리 회사 정보입니다.
            저장 후 즉시 반영됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="companyName">회사명 *</Label>
              <Input
                id="companyName"
                value={companyForm.companyName}
                onChange={(e) => setCompanyForm({ ...companyForm, companyName: e.target.value })}
                placeholder="예: (주)인투푸드"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="companyBusinessNumber">사업자등록번호</Label>
              <Input
                id="companyBusinessNumber"
                value={companyForm.companyBusinessNumber}
                onChange={(e) =>
                  setCompanyForm({ ...companyForm, companyBusinessNumber: e.target.value })
                }
                placeholder="예: 123-45-67890"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="companyRepresentative">대표자명</Label>
              <Input
                id="companyRepresentative"
                value={companyForm.companyRepresentative}
                onChange={(e) =>
                  setCompanyForm({ ...companyForm, companyRepresentative: e.target.value })
                }
                placeholder="예: 홍길동"
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="companyAddress">주소</Label>
              <Input
                id="companyAddress"
                value={companyForm.companyAddress}
                onChange={(e) =>
                  setCompanyForm({ ...companyForm, companyAddress: e.target.value })
                }
                placeholder="예: 서울특별시 강남구 테헤란로 123"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="companyPhone">전화번호</Label>
              <Input
                id="companyPhone"
                value={companyForm.companyPhone}
                onChange={(e) =>
                  setCompanyForm({ ...companyForm, companyPhone: e.target.value })
                }
                placeholder="예: 02-1234-5678"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              onClick={handleSaveCompanyInfo}
              disabled={updateCompanyInfoMutation.isPending || !companyForm.companyName.trim()}
            >
              {updateCompanyInfoMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              회사 정보 저장
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 생산 계산 방식 (2026-10-16) — 수율 환산은 회사 선택 */}
      <Card>
        <CardHeader>
          <CardTitle>생산 원료 계산 방식</CardTitle>
          <CardDescription>
            기본은 품목제조보고 배합비 × 생산량입니다. 쌀 불림·증숙처럼 공정에서 무게가 늘어나는 제품이 있으면
            수율 환산을 켜고, 품목제조보고 편집에서 해당 배합의 기준값을 입력한 뒤 '사용'을 켭니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <div className="text-sm font-medium">원물·공정 기준 (수율 환산) 사용</div>
              <div className="text-xs text-muted-foreground">
                끄면 새 배치는 기본 BOM 계산. 이미 만든 배치의 고정 기준은 유지됩니다.
              </div>
            </div>
            <Switch
              checked={!!massBasisFeature?.enabled}
              disabled={setMassBasisMutation.isPending || massBasisFeature === undefined}
              onCheckedChange={(v) => setMassBasisMutation.mutate({ enabled: v })}
            />
          </div>
        </CardContent>
      </Card>

      {/* 재고관리 사용 여부 (2026-10-17) */}
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>재고관리 사용</CardTitle>
          <CardDescription>
            켜면 입고·매입 확정·매출 확정이 LOT·재고·수불부에 반영됩니다 (HACCP 사용 여부와 무관).
            끄면 회계만 사용합니다 — LOT·재고 없이 전표(분개)만 만들고, 입고는 수량 기록만 남깁니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <div className="text-sm font-medium">재고관리 사용</div>
              <div className="text-xs text-muted-foreground">
                {invTracking?.source === "package" ? "아직 선택하지 않음 — 구독 패키지 기준으로 동작 중" : "회사 설정으로 동작 중"}
              </div>
            </div>
            <Switch
              checked={!!invTracking?.enabled}
              disabled={setInvTrackingMutation.isPending || invTracking === undefined}
              onCheckedChange={(v) => {
                if (!v && !confirm("회계만 사용으로 바꾸면 이후 입고·매출에서 재고가 반영되지 않습니다. 계속할까요?")) return;
                setInvTrackingMutation.mutate({ enabled: v });
              }}
            />
          </div>
          <div className="rounded-md border p-3 space-y-2">
            <div className="text-sm font-medium">재고 차감 제외 원료</div>
            <div className="text-xs text-muted-foreground">
              배치에 투입은 기록하지만 LOT·재고에서 빼지 않는 원료입니다 (예: 정제수). 다음 출고부터 적용되고, 지난 차감·남은 음수 LOT 은 바꾸지 않습니다.
            </div>
            <div className="flex flex-wrap gap-2">
              {(exemptList as any[]).length === 0 && <span className="text-xs text-muted-foreground">없음</span>}
              {/* 해제 = 제외 목록의 재고 원료 번호 / 추가 = 품목 선택창의 품목 번호 — 번호 종류를 밝혀 보낸다 (번호 체계 2b) */}
              {(exemptList as any[]).map((m) => (
                <span key={m.materialId} className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs">
                  {m.materialName}
                  <button
                    className="text-red-600"
                    disabled={setExemptMutation.isPending}
                    onClick={() => { if (confirm(`${m.materialName} 을(를) 재고 차감에 다시 포함할까요?`)) setExemptMutation.mutate({ inventoryMaterialId: m.materialId, exempt: false }); }}
                  >×</button>
                </span>
              ))}
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <MaterialCombobox
                  selectedId={exemptPick?.id ?? null}
                  selectedName={exemptPick?.name}
                  onSelect={(m) => setExemptPick({ id: Number(m.id), name: m.materialName })}
                  onClear={() => setExemptPick(null)}
                  placeholder="원료 검색"
                />
              </div>
              <Button
                size="sm"
                disabled={!exemptPick || setExemptMutation.isPending}
                onClick={() => exemptPick && confirm(`${exemptPick.name} 을(를) 재고 차감에서 제외할까요?`) && setExemptMutation.mutate({ itemMasterId: exemptPick.id, exempt: true })}
              >제외 추가</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 스케줄러 모니터링 */}
      <Card className="md:col-span-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              <CardTitle>스케줄러 모니터링</CardTitle>
            </div>
            <Button
              onClick={handleRunSchedulerManually}
              disabled={runSchedulerManuallyMutation.isPending}
              size="sm"
            >
              {runSchedulerManuallyMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  실행 중...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  수동 실행
                </>
              )}
            </Button>
          </div>
          <CardDescription>
            알림 자동 삭제 스케줄러의 실행 이력을 확인하고 수동으로 실행할 수 있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {schedulerLogs && schedulerLogs.length > 0 ? (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-4 py-2 text-left text-sm font-medium">실행 시간</th>
                      <th className="px-4 py-2 text-left text-sm font-medium">스케줄러</th>
                      <th className="px-4 py-2 text-left text-sm font-medium">상태</th>
                      <th className="px-4 py-2 text-left text-sm font-medium">결과</th>
                      <th className="px-4 py-2 text-right text-sm font-medium">삭제수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedulerLogs.map((log: any) => (
                      <tr key={log.id} className="border-t">
                        <td className="px-4 py-2 text-sm">
                          {new Date(log.executionTime).toLocaleString('ko-KR')}
                        </td>
                        <td className="px-4 py-2 text-sm">
                          {log.schedulerName === 'notification_cleanup' ? '자동 삭제' : '수동 삭제'}
                        </td>
                        <td className="px-4 py-2 text-sm">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            log.status === 'success' 
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                              : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                          }`}>
                            {log.status === 'success' ? '성공' : '실패'}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-sm text-muted-foreground">
                          {log.resultMessage}
                        </td>
                        <td className="px-4 py-2 text-sm text-right font-medium">
                          {log.deletedCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                아직 실행 이력이 없습니다.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 대시보드 위젯 설정 */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            <CardTitle>대시보드 위젯 설정</CardTitle>
          </div>
          <CardDescription>
            대시보드에 표시할 위젯을 선택하세요.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WidgetSettingsPanel />
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* 알림 보관 정책 설정 */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-primary" />
              <CardTitle>알림 보관 정책</CardTitle>
            </div>
            <CardDescription>
              알림 자동 삭제 기준일을 설정합니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="retentionDays">보관 기간 (일)</Label>
              <Input
                id="retentionDays"
                type="number"
                value={retentionDays}
                onChange={(e) => setRetentionDays(Number(e.target.value))}
                min={1}
                max={365}
              />
              <p className="text-sm text-muted-foreground">
                {retentionDays}일 이상 경과한 읽은 알림을 자동으로 삭제합니다.
              </p>
            </div>

            <Button
              onClick={handleSaveRetentionPolicy}
              disabled={setRetentionPolicyMutation.isPending}
              className="w-full"
            >
              {setRetentionPolicyMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  저장 중...
                </>
              ) : (
                <>
                  <Settings className="mr-2 h-4 w-4" />
                  설정 저장
                </>
              )}
            </Button>
          </CardContent>
        </Card>
        
        {/* 알림 자동 삭제 규칙 */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-primary" />
              <CardTitle>알림 자동 삭제</CardTitle>
            </div>
            <CardDescription>
              읽은 알림을 자동으로 삭제합니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="deleteOldDays">삭제 기준 (일)</Label>
              <Input
                id="deleteOldDays"
                type="number"
                value={deleteOldDays}
                onChange={(e) => setDeleteOldDays(Number(e.target.value))}
                min={1}
                max={365}
              />
              <p className="text-sm text-muted-foreground">
                {deleteOldDays}일 이상 경과한 읽은 알림을 삭제합니다.
              </p>
            </div>

            <Button
              onClick={handleDeleteOldRead}
              disabled={deleteOldReadMutation.isPending}
              className="w-full"
              variant="destructive"
            >
              {deleteOldReadMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  삭제 중...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  오래된 알림 삭제
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* 알림 타입별 아카이브 */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Archive className="h-5 w-5 text-primary" />
              <CardTitle>알림 아카이브</CardTitle>
            </div>
            <CardDescription>
              특정 타입의 알림을 아카이브합니다 (읽음 처리).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="archiveType">알림 타입</Label>
              <Input
                id="archiveType"
                type="text"
                value={archiveType}
                onChange={(e) => setArchiveType(e.target.value)}
                placeholder="예: expiry_warning_7d, low_stock"
              />
              <p className="text-sm text-muted-foreground">
                아카이브할 알림 타입을 입력하세요.
              </p>
            </div>

            <Button
              onClick={handleArchiveByType}
              disabled={archiveByTypeMutation.isPending}
              className="w-full"
            >
              {archiveByTypeMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  아카이브 중...
                </>
              ) : (
                <>
                  <Archive className="mr-2 h-4 w-4" />
                  알림 아카이브
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {isPlatformAdmin && (<>
        {/* 데이터베이스 초기화 */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              <CardTitle>데이터베이스 초기화</CardTitle>
            </div>
            <CardDescription>
              데이터베이스 스키마를 생성합니다. 기존 데이터가 손실될 수 있습니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <div className="flex gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-yellow-800 dark:text-yellow-200">
                  <p className="font-semibold mb-1">주의사항</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>기존 테이블 구조가 변경될 수 있습니다</li>
                    <li>데이터 손실이 발생할 수 있습니다</li>
                    <li>운영 환경에서는 신중하게 사용하세요</li>
                  </ul>
                </div>
              </div>
            </div>

            <Button
              onClick={() => setShowInitDialog(true)}
              disabled={initializeMutation.isPending}
              className="w-full"
              variant="destructive"
            >
              {initializeMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  초기화 중...
                </>
              ) : (
                <>
                  <Database className="mr-2 h-4 w-4" />
                  데이터베이스 초기화
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* 샘플 데이터 생성 */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              <CardTitle>샘플 데이터 생성</CardTitle>
            </div>
            <CardDescription>
              테스트용 샘플 데이터를 생성합니다. 데모 및 개발 목적으로 사용하세요.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="text-sm text-blue-800 dark:text-blue-200">
                <p className="font-semibold mb-2">생성될 데이터</p>
                <ul className="space-y-1">
                  <li className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    <span>관리자 계정 (admin@haccp.com / admin1234)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    <span>{L("product")} 3개 (프리미엄 식빵, 크로와상, 베이글)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    <span>{L("material")} 5개 (밀가루, 설탕, 버터, 계란, 이스트)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    <span>{L("batch")} 2개 (계획됨, 진행중)</span>
                  </li>
                </ul>
              </div>
            </div>

            <Button
              onClick={() => setShowSeedDialog(true)}
              disabled={seedMutation.isPending}
              className="w-full"
            >
              {seedMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  생성 중...
                </>
              ) : (
                <>
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  샘플 데이터 생성
                </>
              )}
            </Button>
          </CardContent>
        </Card>
        </>)}
      </div>

      {/* 데이터베이스 초기화 확인 다이얼로그 */}
      <AlertDialog open={showInitDialog} onOpenChange={setShowInitDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              데이터베이스 초기화 확인
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>정말로 데이터베이스를 초기화하시겠습니까?</p>
              <p className="text-destructive font-semibold">
                이 작업은 되돌릴 수 없으며, 기존 데이터가 손실될 수 있습니다.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleInitialize} className="bg-destructive hover:bg-destructive/90">
              초기화
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 샘플 데이터 생성 확인 다이얼로그 */}
      <AlertDialog open={showSeedDialog} onOpenChange={setShowSeedDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>샘플 데이터 생성 확인</AlertDialogTitle>
            <AlertDialogDescription>
              테스트용 샘플 데이터를 생성하시겠습니까? 기존에 동일한 코드의 데이터가 있으면 건너뜁니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleSeed}>생성</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

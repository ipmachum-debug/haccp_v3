import { trpc } from "@/lib/trpc";
import { Users, Building2, Activity, AlertCircle, TrendingUp, TrendingDown, HardDrive, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import SuperAdminLayout from "@/components/dashboard/SuperAdminLayout";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";

// ★ PR-AC2 (2026-05-23): Storage 진단 결과 타입
//   tenantIsolationAudit.storageHealthCheck 의 응답 구조와 일치.
type StorageHealthResult = {
  env: {
    hasAwsBucket: boolean;
    bucketName: string | null;
    region: string;
    hasEndpoint: boolean;
    endpointHost: string | null;
    hasAccessKey: boolean;
    hasSecretKey: boolean;
    hasCdnBase: boolean;
    cdnBase: string | null;
  };
  putGetCheck: {
    ok: boolean;
    putError?: string;
    getError?: string;
    urlSample?: string;
    urlSigned?: boolean;
  };
};

export default function SuperAdminDashboard() {
  // 테넌트 선택 상태
  const [selectedTenantId, setSelectedTenantId] = useState<number | null>(null);

  // API 데이터 조회
  const { data: stats, isLoading: statsLoading } = trpc.superadminDashboard.getStats.useQuery();
  const { data: activities, isLoading: activitiesLoading } = trpc.superadminDashboard.getRecentActivities.useQuery();
  
  // 슈퍼관리자 전용 API
  const { data: tenants, isLoading: tenantsLoading } = trpc.superadmin.listTenants.useQuery();
  const { data: actingTenant } = trpc.superadmin.getActingTenant.useQuery();
  const setActingTenantMutation = trpc.superadmin.setActingTenant.useMutation({
    onSuccess: (data: any) => {
      console.log("✅ 테넌트 전환:", data.message);
    },
    onError: (error: { message: string }) => {
      console.error("❌ 테넌트 전환 실패:", error.message);
    },
  });

  // 초기 로드 시 현재 선택된 테넌트 설정
  useEffect(() => {
    if (actingTenant?.actingTenantId) {
      setSelectedTenantId(actingTenant.actingTenantId);
    }
  }, [actingTenant]);

  const [, setLocation] = useLocation();

  // ★ PR-AC2: Storage 진단 (수동 실행 — enabled:false 로 자동 호출 막음)
  // ★ PR-AC3 (2026-05-23) hot-fix: tRPC 경로를 systemRouterMap 의 spread 등록 사실에 맞춰 수정.
  //   server/routers/_root.ts 에서 `...systemRouterMap` 으로 spread 되므로
  //   `tenantIsolationAudit` 은 `system.tenantIsolationAudit` 이 아니라
  //   **최상위 `tenantIsolationAudit`** 으로 등록됩니다.
  //   사장님 보고: "No procedure found on path 'system.tenantIsolationAudit.storageHealthCheck'"
  const storageHealthQuery = trpc.tenantIsolationAudit.storageHealthCheck.useQuery(
    undefined,
    {
      enabled: false,
      retry: false,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    }
  );
  const storageHealth = storageHealthQuery.data as StorageHealthResult | undefined;

  // 테넌트 선택 핸들러
  const handleTenantChange = (tenantId: number | null) => {
    setSelectedTenantId(tenantId);
    setActingTenantMutation.mutate({ tenantId }, {
      onSuccess: () => {
        // 테넌트 선택 후 일반 대시보드로 이동
        if (tenantId) {
          setLocation("/dashboard");
        }
      }
    });
  };

  return (
    <SuperAdminLayout>
      <div className="p-6">
        {/* 헤더 + 테넌트 선택 */}
        <div className="mb-8">
          <div className="bg-gradient-to-r from-purple-600 via-pink-500 to-blue-500 rounded-2xl p-6 shadow-xl text-white">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                  <span className="text-2xl">👑</span>
                </div>
                <div>
                  <h1 className="text-3xl font-bold">슈퍼관리자 대시보드</h1>
                  <p className="text-white/80 text-sm mt-1">전체 시스템 모니터링 및 관리</p>
                </div>
              </div>

              {/* 테넌트 선택 드롭다운 */}
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 min-w-[280px]">
                <label className="block text-white/90 text-sm font-medium mb-2">
                  🏢 테넌트 선택
                </label>
                <select
                  value={selectedTenantId || ""}
                  onChange={(e) => handleTenantChange(e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-4 py-2 bg-white text-gray-900 rounded-lg border-0 focus:ring-2 focus:ring-white/50 transition-all"
                  disabled={tenantsLoading}
                >
                  <option value="">전체 시스템 뷰</option>
                  {tenants?.tenants.map((tenant: any) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.name} (ID: {tenant.id})
                    </option>
                  ))}
                </select>
                {selectedTenantId && (
                  <div className="mt-2 text-xs text-white/70">
                    ✅ 현재 테넌트 ID {selectedTenantId}의 데이터를 조회합니다.
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2 text-white/90">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                <span>최고 관리자 권한</span>
              </div>
              <div className="flex items-center gap-2 text-white/90">
                <span>•</span>
                <span>골든터틀컴퍼니</span>
              </div>
            </div>
          </div>
        </div>

        {/* 통계 카드 */}
        <div className="mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* 전체 사용자 */}
            <div className="bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                  <Users className="w-6 h-6 text-blue-600" />
                </div>
                {statsLoading ? (
                  <div className="text-sm text-gray-500">로딩중...</div>
                ) : (
                  <div className={`flex items-center gap-1 text-sm ${stats && stats.userGrowthRate > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {stats && stats.userGrowthRate > 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                    <span>+{stats?.userGrowthRate || 0}%</span>
                  </div>
                )}
              </div>
              <h3 className="text-gray-600 text-sm mb-1">전체 사용자</h3>
              <p className="text-3xl font-bold text-gray-900">
                {statsLoading ? "-" : stats?.totalUsers || 0}
              </p>
            </div>

            {/* 테넌트 */}
            <div className="bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-pink-100 rounded-xl flex items-center justify-center">
                  <Building2 className="w-6 h-6 text-pink-600" />
                </div>
                {statsLoading ? (
                  <div className="text-sm text-gray-500">로딩중...</div>
                ) : (
                  <div className={`flex items-center gap-1 text-sm ${stats && stats.tenantGrowthRate > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {stats && stats.tenantGrowthRate > 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                    <span>+{stats?.tenantGrowthRate || 0}%</span>
                  </div>
                )}
              </div>
              <h3 className="text-gray-600 text-sm mb-1">테넌트</h3>
              <p className="text-3xl font-bold text-gray-900">
                {statsLoading ? "-" : stats?.totalTenants || 0}
              </p>
            </div>

            {/* 활성 사용자 */}
            <div className="bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                  <Activity className="w-6 h-6 text-green-600" />
                </div>
                {statsLoading ? (
                  <div className="text-sm text-gray-500">로딩중...</div>
                ) : (
                  <div className="flex items-center gap-1 text-sm text-green-600">
                    <TrendingUp className="w-4 h-4" />
                    <span>+8%</span>
                  </div>
                )}
              </div>
              <h3 className="text-gray-600 text-sm mb-1">활성 사용자</h3>
              <p className="text-3xl font-bold text-gray-900">
                {statsLoading ? "-" : stats?.activeUsers || 0}
              </p>
            </div>

            {/* 승인 대기 */}
            <div className="bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
                  <AlertCircle className="w-6 h-6 text-orange-600" />
                </div>
                {statsLoading ? (
                  <div className="text-sm text-gray-500">로딩중...</div>
                ) : (
                  <div className="flex items-center gap-1 text-sm text-red-600">
                    <TrendingDown className="w-4 h-4" />
                    <span>-3</span>
                  </div>
                )}
              </div>
              <h3 className="text-gray-600 text-sm mb-1">승인 대기</h3>
              <p className="text-3xl font-bold text-gray-900">
                {statsLoading ? "-" : stats?.pendingUsers || 0}
              </p>
            </div>
          </div>
        </div>

        {/* 빠른 액세스 카드 */}
        <div className="mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* 사용자 승인 */}
            <a
              href="/dashboard/user-approval"
              className="bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all hover:scale-105 cursor-pointer"
            >
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-4">
                <Users className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">클라이언트 승인</h3>
              <p className="text-gray-600 text-sm">대기 중인 사용자 승인 처리</p>
            </a>

            {/* 테넌트 관리 */}
            <a
              href="/dashboard/tenant-management"
              className="bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all hover:scale-105 cursor-pointer"
            >
              <div className="w-12 h-12 bg-pink-100 rounded-xl flex items-center justify-center mb-4">
                <Building2 className="w-6 h-6 text-pink-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">테넌트 관리</h3>
              <p className="text-gray-600 text-sm">테넌트 생성 및 관리</p>
            </a>

            {/* 시스템 모니터링 */}
            <a
              href="/dashboard/system-monitoring"
              className="bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all hover:scale-105 cursor-pointer"
            >
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mb-4">
                <Activity className="w-6 h-6 text-green-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">시스템 모니터링</h3>
              <p className="text-gray-600 text-sm">전역 시스템 모니터링</p>
            </a>
          </div>
        </div>

        {/* ★ PR-AC2 (2026-05-23): Storage 백엔드 진단 카드
            건강진단서 다운로드 AccessDenied 사고 (PR-AB / PR-AC) 의 root cause 를
            확정하기 위한 super_admin 전용 진단 도구.
            - PUT/GET 라이브 테스트로 IAM 권한 확인
            - 환경 변수 (버킷, CDN, endpoint) 표시
            - 실패 시 정확한 에러 메시지 노출 */}
        <div className="mb-8">
          <div className="bg-white rounded-2xl p-6 shadow-lg border-2 border-purple-100">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <HardDrive className="w-5 h-5 text-purple-700" />
                <h2 className="text-xl font-bold text-gray-900">Storage 백엔드 진단</h2>
                <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                  PR-AC2
                </span>
              </div>
              <button
                onClick={() => storageHealthQuery.refetch()}
                disabled={storageHealthQuery.isFetching}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                {storageHealthQuery.isFetching ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    진단 중...
                  </>
                ) : (
                  <>
                    <HardDrive className="w-4 h-4" />
                    진단 실행
                  </>
                )}
              </button>
            </div>

            <p className="text-sm text-gray-600 mb-4">
              S3/R2 버킷에 작은 테스트 파일을 PUT 한 뒤 즉시 presigned URL 로 GET 해서 IAM 권한과 CORS/CDN 설정을 확인합니다.
              건강진단서 다운로드 사고 (AccessDenied 403) 의 정확한 원인을 진단합니다.
            </p>

            {storageHealthQuery.isError && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg mb-4">
                <div className="flex items-start gap-2">
                  <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-red-900">진단 endpoint 호출 실패</p>
                    <p className="text-sm text-red-700 mt-1 font-mono">
                      {storageHealthQuery.error?.message ?? "unknown error"}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {storageHealth && (
              <div className="space-y-4">
                {/* PUT/GET 라이브 테스트 결과 */}
                <div
                  className={`p-4 rounded-lg border-2 ${
                    storageHealth.putGetCheck.ok
                      ? "bg-green-50 border-green-200"
                      : "bg-red-50 border-red-200"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {storageHealth.putGetCheck.ok ? (
                      <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0" />
                    ) : (
                      <XCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
                    )}
                    <div className="flex-1">
                      <p
                        className={`font-bold ${
                          storageHealth.putGetCheck.ok ? "text-green-900" : "text-red-900"
                        }`}
                      >
                        {storageHealth.putGetCheck.ok
                          ? "✅ PUT + GET 라이브 테스트 통과"
                          : "❌ PUT/GET 라이브 테스트 실패"}
                      </p>
                      {storageHealth.putGetCheck.putError && (
                        <p className="text-sm text-red-700 mt-2">
                          <span className="font-semibold">PutObject 실패:</span>{" "}
                          <span className="font-mono">{storageHealth.putGetCheck.putError}</span>
                        </p>
                      )}
                      {storageHealth.putGetCheck.getError && (
                        <p className="text-sm text-red-700 mt-2">
                          <span className="font-semibold">GetObject 실패:</span>{" "}
                          <span className="font-mono">{storageHealth.putGetCheck.getError}</span>
                          {storageHealth.putGetCheck.getError.includes("403") && (
                            <span className="block mt-1 text-red-800">
                              💡 IAM 권한 누락 의심 (PutObject 만 있고 GetObject 없음)
                            </span>
                          )}
                          {storageHealth.putGetCheck.getError.includes("404") && (
                            <span className="block mt-1 text-red-800">
                              💡 객체가 사라졌거나 버킷 이름 mismatch 의심
                            </span>
                          )}
                        </p>
                      )}
                      {storageHealth.putGetCheck.urlSample && (
                        <p className="text-xs text-gray-600 mt-2 break-all">
                          <span className="font-semibold">URL 샘플:</span>{" "}
                          <span className="font-mono">{storageHealth.putGetCheck.urlSample}…</span>
                        </p>
                      )}
                      {typeof storageHealth.putGetCheck.urlSigned === "boolean" && (
                        <p className="text-xs text-gray-600 mt-1">
                          <span className="font-semibold">Presigned 여부:</span>{" "}
                          <span className="font-mono">
                            {storageHealth.putGetCheck.urlSigned ? "X-Amz-Signature 포함 ✅" : "서명 없음 (CDN URL?) ⚠️"}
                          </span>
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* 환경 변수 정보 */}
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="font-semibold text-gray-900 mb-3">환경 변수</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                    <div className="flex justify-between gap-2">
                      <span className="text-gray-600">AWS_S3_BUCKET:</span>
                      <span className="font-mono text-gray-900">
                        {storageHealth.env.hasAwsBucket
                          ? storageHealth.env.bucketName ?? "[set]"
                          : "❌ 미설정"}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-gray-600">AWS_S3_REGION:</span>
                      <span className="font-mono text-gray-900">{storageHealth.env.region}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-gray-600">AWS_S3_ENDPOINT:</span>
                      <span className="font-mono text-gray-900">
                        {storageHealth.env.hasEndpoint
                          ? storageHealth.env.endpointHost ?? "[set]"
                          : "[unset, default AWS S3]"}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-gray-600">AWS_ACCESS_KEY_ID:</span>
                      <span className="font-mono text-gray-900">
                        {storageHealth.env.hasAccessKey ? "✅ 설정됨" : "❌ 미설정"}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-gray-600">AWS_SECRET_ACCESS_KEY:</span>
                      <span className="font-mono text-gray-900">
                        {storageHealth.env.hasSecretKey ? "✅ 설정됨" : "❌ 미설정"}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-gray-600">AWS_S3_PUBLIC_BASE_URL:</span>
                      <span className="font-mono text-gray-900 break-all">
                        {storageHealth.env.hasCdnBase
                          ? storageHealth.env.cdnBase ?? "[set]"
                          : "[unset]"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 진단 가이드 */}
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="font-semibold text-blue-900 mb-2">📋 진단 결과 해석</p>
                  <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                    <li>
                      <strong>PUT 실패:</strong> AccessKey/SecretKey 또는 `s3:PutObject` IAM 권한 누락
                    </li>
                    <li>
                      <strong>GET 403:</strong> `s3:GetObject` IAM 권한 누락 (가장 흔한 사고)
                    </li>
                    <li>
                      <strong>GET 404:</strong> 버킷 이름 mismatch 또는 객체 즉시 삭제 정책
                    </li>
                    <li>
                      <strong>GET timeout:</strong> AWS_S3_ENDPOINT 또는 CDN URL 잘못 설정
                    </li>
                  </ul>
                </div>
              </div>
            )}

            {!storageHealth && !storageHealthQuery.isFetching && !storageHealthQuery.isError && (
              <div className="text-center py-8 text-gray-500 text-sm">
                "진단 실행" 버튼을 클릭하여 storage 백엔드 상태를 확인하세요.
              </div>
            )}
          </div>
        </div>

        {/* 최근 시스템 활동 */}
        <div>
          <div className="bg-white rounded-2xl p-6 shadow-lg">
            <div className="flex items-center gap-2 mb-6">
              <Activity className="w-5 h-5 text-gray-700" />
              <h2 className="text-xl font-bold text-gray-900">최근 시스템 활동</h2>
            </div>

            {activitiesLoading ? (
              <div className="text-center py-8 text-gray-500">로딩중...</div>
            ) : activities && activities.activities.length > 0 ? (
              <div className="space-y-4">
                {activities.activities.map((activity: any, index: any) => (
                  <div
                    key={index}
                    className="flex items-start gap-4 p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                  >
                    <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center flex-shrink-0">
                      {activity.type === 'tenant_created' ? (
                        <Building2 className="w-5 h-5 text-pink-600" />
                      ) : (
                        <Users className="w-5 h-5 text-blue-600" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="font-semibold text-gray-900">{activity.description}</h3>
                        <span className="text-sm text-gray-500">
                          {new Date(activity.timestamp).toLocaleDateString('ko-KR', {
                            month: 'long',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className="text-gray-600 text-sm">{activity.name}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                최근 활동이 없습니다.
              </div>
            )}
          </div>
        </div>
      </div>
    </SuperAdminLayout>
  );
}

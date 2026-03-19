import { trpc } from "@/lib/trpc";
import { Users, Building2, Activity, AlertCircle, TrendingUp, TrendingDown } from "lucide-react";
import SuperAdminLayout from "@/components/SuperAdminLayout";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";

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
    onError: (error: any) => {
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

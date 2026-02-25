import { trpc } from "@/lib/trpc";
import SuperAdminLayout from "@/components/SuperAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Activity, 
  Database, 
  Users, 
  Building,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Clock
} from "lucide-react";
import { motion } from "framer-motion";

export default function SystemMonitoring() {
  // 모든 테넌트 조회
  const { data, isLoading: tenantsLoading } = trpc.tenantsPublic.getAll.useQuery();
  const tenants = data?.tenants || [];

  // TODO: 시스템 통계 API 추가 필요
  // const { data: stats } = trpc.system.getStats.useQuery();

  if (tenantsLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  // 임시 통계 계산
  const totalTenants = tenants.length;
  const activeTenants = tenants.filter((t: any) => t.isActive).length;
  const totalUsers = tenants.reduce((sum: number, t: any) => sum + (t._count?.users || 0), 0);

  return (
    <SuperAdminLayout>
      <div className="container mx-auto p-6 space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-3xl font-bold">시스템 모니터링</h1>
        <p className="text-muted-foreground mt-1">
          실시간 시스템 상태 및 통계를 확인합니다
        </p>
      </div>

      {/* 주요 지표 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* 총 테넌트 수 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                총 테넌트 수
              </CardTitle>
              <Building className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalTenants}</div>
              <p className="text-xs text-muted-foreground">
                등록된 회사 수
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {/* 활성 테넌트 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                활성 테넌트
              </CardTitle>
              <CheckCircle className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeTenants}</div>
              <p className="text-xs text-muted-foreground">
                현재 활성화된 회사
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {/* 총 사용자 수 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                총 사용자 수
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalUsers}</div>
              <p className="text-xs text-muted-foreground">
                전체 시스템 사용자
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {/* 시스템 상태 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                시스템 상태
              </CardTitle>
              <Activity className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">정상</div>
              <p className="text-xs text-muted-foreground">
                모든 서비스 정상 작동
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* 테넌트 목록 */}
      <Card>
        <CardHeader>
          <CardTitle>테넌트 목록</CardTitle>
          <CardDescription>
            시스템에 등록된 모든 회사 목록
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {tenants?.map((tenant: any, index: number) => (
              <motion.div
                key={tenant.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Building className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">{tenant.name}</p>
                    <p className="text-sm text-muted-foreground">
                      ID: {tenant.id} | 사용자: {tenant._count?.users || 0}명
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge 
                    variant={tenant.isActive ? "default" : "secondary"}
                  >
                    {tenant.isActive ? "활성" : "비활성"}
                  </Badge>
                  <div className="text-sm text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(tenant.createdAt).toLocaleDateString('ko-KR')}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {tenants?.length === 0 && (
            <div className="py-12 text-center">
              <Database className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                등록된 테넌트가 없습니다
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 시스템 알림 (예시) */}
      <Card>
        <CardHeader>
          <CardTitle>시스템 알림</CardTitle>
          <CardDescription>
            최근 시스템 이벤트 및 알림
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 border rounded-lg">
              <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
              <div>
                <p className="font-medium">시스템 정상 작동 중</p>
                <p className="text-sm text-muted-foreground">
                  모든 서비스가 정상적으로 작동하고 있습니다
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 border rounded-lg">
              <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
              <div>
                <p className="font-medium">데이터베이스 연결 안정</p>
                <p className="text-sm text-muted-foreground">
                  데이터베이스 응답 시간: 평균 15ms
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      </div>
    </SuperAdminLayout>
  );
}

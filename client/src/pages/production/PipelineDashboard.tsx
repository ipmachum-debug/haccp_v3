import React, { useState, useMemo } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  XCircle,
  RefreshCw,
  TrendingUp,
  Package,
  FileText,
  ClipboardCheck,
  Printer,
  ChevronRight,
  Thermometer,
  Gauge,
  Search,
  Radio,
  Wifi,
  WifiOff,
  Activity,
  Zap,
  Shield,
  PlayCircle,
  FileBarChart,
  Bell,
  AlertTriangle,
  Boxes,
  Calendar
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import type { RouterOutput } from '@/lib/trpcTypes';
import { useAuth } from '@/_core/hooks/useAuth';

// 파이프라인 대시보드 도메인 타입 — trpc proxy 가 깊은 타입을 완전히 전파하지 못해 명시 추출
type PipelineBatch = {
  id: number;
  batchId?: number;
  batchCode?: string;
  productName?: string;
  status?: string;
  steps?: PipelineStep[];
  alerts?: PipelineAlert[];
  mode?: string;
  startTime?: string | Date | null;
  currentStep?: string;
  [k: string]: unknown;
};
type PipelineStep = { id?: number; step?: string; name?: string; status?: string; [k: string]: unknown };
type PipelineAlert = { id?: number; level?: string; message?: string; [k: string]: unknown };
type ClosingNotification = {
  id: number;
  is_read?: 0 | 1 | boolean;
  message?: string;
  title?: string;
  priority?: string;
  notification_type?: string;
  created_at?: string | Date;
};
type ClosingReportSummary = {
  production?: {
    totalBatches?: number;
    completedBatches?: number;
    incompleteBatches?: number;
    completionRate?: number;
  };
  approvals?: { pendingCount?: number };
  inventory?: { lowStockCount?: number };
  ccp?: { deviationCount?: number };
  alerts?: Array<{ id: number; message?: string; level?: string }>;
  warnings?: string[];
};
type IotDevice = {
  id: number;
  status?: string;
  name?: string;
  device_name?: string;
  device_type?: string;
  equipment_name?: string;
  unit?: string;
  last_heartbeat?: string | Date | null;
  heartbeat_interval_sec?: number;
  latest_value?: number | string | null;
};

import { todayLocal } from "../../lib/dateUtils";
import { useIndustryLabel } from "@/hooks/useIndustryFeatures";

// 파이프라인 단계 정의
const PIPELINE_STAGES = [
  { id: 'recipe', name: '레시피', icon: FileText, step: 1 },
  { id: 'batch_created', name: '배치생성', icon: Package, step: 2 },
  { id: 'material_issued', name: '원료출고', icon: TrendingUp, step: 3 },
  { id: 'ccp_managed', name: 'CCP관리', icon: Shield, step: 4 },
  { id: 'recording', name: '기록', icon: ClipboardCheck, step: 5 },
  { id: 'daily_report', name: '일일일지', icon: FileText, step: 6 },
  { id: 'document_created', name: '문서생성', icon: FileText, step: 7 },
  { id: 'approval', name: '결재', icon: ClipboardCheck, step: 8 },
  { id: 'document_printed', name: '문서출력', icon: Printer, step: 9 },
];

// 상태별 스타일 (에메랄드 테마)
const STATUS_STYLES: Record<string, { bg: string; text: string; ring: string; icon: string; label: string }> = {
  completed: { 
    bg: 'bg-emerald-500', 
    text: 'text-emerald-700',
    ring: 'ring-emerald-300',
    icon: 'text-white',
    label: '완료'
  },
  in_progress: { 
    bg: 'bg-amber-400', 
    text: 'text-amber-700',
    ring: 'ring-amber-200',
    icon: 'text-white',
    label: '진행중'
  },
  pending: { 
    bg: 'bg-stone-300', 
    text: 'text-stone-500',
    ring: 'ring-stone-200',
    icon: 'text-white',
    label: '대기'
  },
  error: { 
    bg: 'bg-rose-500', 
    text: 'text-rose-700',
    ring: 'ring-rose-300',
    icon: 'text-white',
    label: '오류'
  },
};

// IoT 센서 타입 정의
interface SensorData {
  id: string;
  name: string;
  type: 'temperature' | 'pressure' | 'metal_detector';
  value: number | string;
  unit: string;
  status: 'online' | 'offline' | 'warning' | 'error';
  lastUpdate?: string;
}

// 센서 데이터: IoT API에서 조회, 없으면 기본 표시
const DEFAULT_SENSORS: SensorData[] = [
  { id: 'temp-01', name: '가열 공정 온도', type: 'temperature', value: '--', unit: '°C', status: 'offline' },
  { id: 'press-01', name: '공정 압력', type: 'pressure', value: '--', unit: 'bar', status: 'offline' },
  { id: 'metal-01', name: '금속탐지기', type: 'metal_detector', value: '대기', unit: '', status: 'offline' },
];

const SensorIcon = ({ type }: { type: string }) => {
  switch (type) {
    case 'temperature': return <Thermometer className="w-5 h-5" />;
    case 'pressure': return <Gauge className="w-5 h-5" />;
    case 'metal_detector': return <Search className="w-5 h-5" />;
    default: return <Activity className="w-5 h-5" />;
  }
};

const SensorStatusBadge = ({ status }: { status: string }) => {
  const styles: Record<string, string> = {
    online: 'bg-emerald-100 text-emerald-700 border-emerald-300',
    offline: 'bg-stone-100 text-stone-500 border-stone-300',
    warning: 'bg-amber-100 text-amber-700 border-amber-300',
    error: 'bg-rose-100 text-rose-700 border-rose-300',
  };
  const labels: Record<string, string> = {
    online: '연결됨',
    offline: '미연결',
    warning: '주의',
    error: '오류',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border ${styles[status] || styles.offline}`}>
      {status === 'online' ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
      {labels[status] || '알 수 없음'}
    </span>
  );
};

// 콘텐츠만 (ProductionManagement 탭에 임베드할 때 사용)
export const PipelineDashboardContent: React.FC = () => {
  const L = useIndustryLabel();
  const { user } = useAuth();
  const siteId = (user as { siteId?: number; tenantId?: number } | null)?.siteId || (user as { siteId?: number; tenantId?: number } | null)?.tenantId || 0;
  const [selectedDate, setSelectedDate] = useState<string>(
    todayLocal()
  );
  const [autoRefresh, setAutoRefresh] = useState(true);
  // IoT 디바이스 목록 조회 (등록된 센서가 있으면 동적 표시)
  const { data: iotDevices } = trpc.iot?.listDevices?.useQuery?.(undefined, {
    refetchInterval: autoRefresh ? 10000 : false, // 10초 갱신
  }) ?? { data: undefined };
  const { data: iotDashboard } = trpc.iot?.getDashboard?.useQuery?.(undefined, {
    refetchInterval: autoRefresh ? 10000 : false,
  }) ?? { data: undefined };

  // IoT 디바이스 → SensorData 변환 (설비별 개별 표시)
  const sensors: SensorData[] = useMemo(() => {
    if (!iotDevices || (iotDevices as IotDevice[]).length === 0) return DEFAULT_SENSORS;
    return (iotDevices as IotDevice[]).map((dev: IotDevice) => {
      const isOnline = dev.status === 'active' && dev.last_heartbeat;
      const lastHb = dev.last_heartbeat ? new Date(dev.last_heartbeat) : null;
      const secSinceHb = lastHb ? (Date.now() - lastHb.getTime()) / 1000 : Infinity;
      const isStale = secSinceHb > (dev.heartbeat_interval_sec || 60) * 3;

      return {
        id: `dev-${dev.id}`,
        name: dev.equipment_name ? `${dev.device_name} (${dev.equipment_name})` : dev.device_name,
        type: dev.device_type as SensorData['type'],
        value: isOnline && !isStale ? (dev.latest_value ?? '--') : '--',
        unit: dev.unit || '',
        status: dev.status === 'error' || isStale ? 'error'
              : dev.status === 'active' ? 'online'
              : 'offline',
        lastUpdate: lastHb ? lastHb.toLocaleString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : undefined,
      } as SensorData;
    });
  }, [iotDevices]);
  const [isClosingRunning, setIsClosingRunning] = useState(false);
  const tenantId = (user as { tenantId?: number } | null)?.tenantId || 0;

  // tRPC 쿼리 - 파이프라인 현황 조회
  const { data: pipelineData, isLoading, refetch } = trpc.pipeline.getStatus.useQuery(
    { siteId, workDate: selectedDate },
    { 
      refetchInterval: autoRefresh ? 30000 : false,
      refetchOnWindowFocus: true
    }
  );

  // 일일 마감 보고서 조회
  const { data: closingReport, refetch: refetchReport } = trpc.pipeline.getDailyClosingReport.useQuery(
    { tenantId, reportDate: selectedDate },
    { enabled: !!tenantId }
  );

  // 실시간 승인 대기 건수
  const { data: pendingApprovalData } = trpc.pipeline.getPendingApprovalCount.useQuery(
    undefined,
    { enabled: !!tenantId, refetchInterval: 30000 }
  );

  // 마감 알림 조회
  const { data: closingNotifications } = trpc.pipeline.getClosingNotifications.useQuery(
    { tenantId, limit: 10 },
    { enabled: !!tenantId }
  );

  // 수동 마감 실행
  const runManualClosing = trpc.pipeline.runManualClosing.useMutation({
    onSuccess: () => {
      setIsClosingRunning(false);
      refetch();
      refetchReport();
    },
    onError: () => {
      setIsClosingRunning(false);
    }
  });

  const handleManualClosing = () => {
    if (isClosingRunning) return;
    setIsClosingRunning(true);
    runManualClosing.mutate({ tenantId });
  };

  // 최근 알림 (읽지 않은 것)
  const unreadNotifications = useMemo(() => {
    if (!closingNotifications) return [];
    return (closingNotifications as ClosingNotification[]).filter((n: ClosingNotification) => !n.is_read).slice(0, 5);
  }, [closingNotifications]);

  const handleRefresh = () => { refetch(); };

  // 통계 계산
  const batches = (pipelineData as { batches?: PipelineBatch[] } | undefined)?.batches || ((pipelineData as PipelineBatch[] | undefined) || []);
  const batchList = Array.isArray(batches) ? batches : [];
  const totalBatches = batchList.length;
  const completedBatches = batchList.filter((b: PipelineBatch) => b.status === 'completed').length;
  const inProgressBatches = batchList.filter((b: PipelineBatch) => b.status === 'in_progress').length;
  const pendingBatches = batchList.filter((b: PipelineBatch) => b.status === 'planned' || b.status === 'pending').length;
  const errorBatches = batchList.filter((b: PipelineBatch) => b.status === 'error' || b.status === 'cancelled').length;
  const overallProgress = totalBatches > 0 
    ? Math.round(batchList.reduce((sum: number, b: PipelineBatch) => {
        const steps = b.steps || b.pipeline || [];
        if (Array.isArray(steps) && steps.length > 0) {
          const completed = steps.filter((s: PipelineStep) => s.status === 'completed').length;
          return sum + (completed / PIPELINE_STAGES.length) * 100;
        }
        if (b.status === 'completed') return sum + 100;
        if (b.status === 'in_progress') return sum + 50;
        return sum;
      }, 0) / totalBatches)
    : 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border-4 border-emerald-200 border-t-emerald-500 animate-spin" />
            <Activity className="w-6 h-6 text-emerald-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          </div>
          <p className="text-lg font-medium text-emerald-800">파이프라인 현황을 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── 헤더 ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-200">
            <Activity className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-emerald-900 tracking-tight">생산 파이프라인</h2>
            <p className="text-sm text-emerald-600/70">실시간 배치 진행 상태 모니터링</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-2 text-sm border border-emerald-200 rounded-lg bg-white/80 backdrop-blur focus:ring-2 focus:ring-emerald-400 focus:border-transparent text-emerald-900"
          />
          <Button
            onClick={handleRefresh}
            variant="outline"
            size="sm"
            className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
          >
            <RefreshCw className="w-4 h-4 mr-1" /> 새로고침
          </Button>
          <Button
            onClick={() => setAutoRefresh(!autoRefresh)}
            size="sm"
            className={autoRefresh 
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-200' 
              : 'bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-50'}
          >
            <Radio className={`w-4 h-4 mr-1 ${autoRefresh ? 'animate-pulse' : ''}`} />
            {autoRefresh ? 'LIVE' : 'OFF'}
          </Button>
        </div>
      </div>

      {/* ── 요약 카드 ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: '전체 배치', value: totalBatches, icon: Package, gradient: 'from-emerald-500 to-teal-500', shadow: 'shadow-emerald-200' },
          { label: '완료', value: completedBatches, icon: CheckCircle2, gradient: 'from-green-500 to-emerald-500', shadow: 'shadow-green-200' },
          { label: '진행중', value: inProgressBatches, icon: Clock, gradient: 'from-amber-400 to-orange-400', shadow: 'shadow-amber-200' },
          { label: '대기', value: pendingBatches, icon: Clock, gradient: 'from-stone-400 to-stone-500', shadow: 'shadow-stone-200' },
          { label: '오류', value: errorBatches, icon: XCircle, gradient: 'from-rose-400 to-red-500', shadow: 'shadow-rose-200' },
        ].map((item) => (
          <div 
            key={item.label}
            className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${item.gradient} p-4 text-white shadow-lg ${item.shadow}`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium opacity-90">{item.label}</p>
                <p className="text-2xl font-bold mt-0.5">{item.value}</p>
              </div>
              <item.icon className="w-9 h-9 opacity-40" />
            </div>
            {/* 장식 원 */}
            <div className="absolute -right-3 -bottom-3 w-16 h-16 rounded-full bg-white/10" />
          </div>
        ))}
      </div>

      {/* ── 전체 진행률 ── */}
      <div className="rounded-xl bg-white/70 backdrop-blur border border-emerald-100 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-emerald-600" />
            <span className="text-sm font-semibold text-emerald-900">금일 전체 진행률</span>
          </div>
          <span className="text-xl font-bold text-emerald-600">{overallProgress}%</span>
        </div>
        <div className="w-full bg-emerald-100 rounded-full h-3 overflow-hidden">
          <div 
            className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-all duration-700 ease-out"
            style={{ width: `${overallProgress}%` }}
          />
        </div>
      </div>

      {/* ── IoT 센서 현황 ── */}
      <div className="rounded-xl bg-white/70 backdrop-blur border border-emerald-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            <Radio className="w-4 h-4" />
            <span className="text-sm font-semibold">IoT 센서 모니터링</span>
          </div>
          <div className="flex items-center gap-2">
            {iotDashboard && ((iotDashboard as { anomalies24h?: number }).anomalies24h ?? 0) > 0 && (
              <span className="text-xs text-rose-100 bg-rose-500/40 px-2 py-0.5 rounded-full">
                이상치 {(iotDashboard as { anomalies24h?: number }).anomalies24h}건
              </span>
            )}
            <span className="text-xs text-emerald-100 bg-white/20 px-2 py-0.5 rounded-full">
              {iotDevices && (iotDevices as IotDevice[]).length > 0
                ? `${(iotDevices as IotDevice[]).filter((d: IotDevice) => d.status === 'active').length}/${(iotDevices as IotDevice[]).length} 연결`
                : 'API 연동 가능'}
            </span>
          </div>
        </div>
        <div className={`grid grid-cols-2 ${sensors.length <= 4 ? 'md:grid-cols-4' : sensors.length <= 6 ? 'md:grid-cols-3 lg:grid-cols-6' : 'md:grid-cols-4 lg:grid-cols-6'} gap-px bg-emerald-100`}>
          {sensors.map((sensor) => (
            <div key={sensor.id} className="bg-white p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-700">
                  <SensorIcon type={sensor.type} />
                  <span className="text-xs font-medium truncate">{sensor.name}</span>
                </div>
                <SensorStatusBadge status={sensor.status} />
              </div>
              <div className="flex items-end gap-1">
                <span className="text-2xl font-bold text-stone-400">{sensor.value}</span>
                {sensor.unit && <span className="text-sm text-stone-400 mb-0.5">{sensor.unit}</span>}
              </div>
              <p className="text-xs text-stone-400">
                {sensor.status === 'offline' ? '센서 미연결 (API 준비됨)' : sensor.lastUpdate || '-'}
              </p>
            </div>
          ))}
        </div>
        <div className="px-5 py-2.5 bg-emerald-50/50 border-t border-emerald-100">
          <p className="text-xs text-emerald-600/70 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            IoT API가 구축되었습니다. 센서 장비를 연결하면 실시간 CCP 모니터링 + 배치 자동 전환이 활성화됩니다
          </p>
        </div>
      </div>

      {/* ── 일일 마감 현황 ── */}
      {closingReport && (
        <div className="rounded-xl bg-white/70 backdrop-blur border border-emerald-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 flex items-center justify-between">
            <div className="flex items-center gap-2 text-white">
              <FileBarChart className="w-4 h-4" />
              <span className="text-sm font-semibold">일일 마감 보고서</span>
            </div>
            <span className="text-xs text-emerald-100">
              {(closingReport as { generated_at?: string } | undefined)?.generated_at ? new Date(String((closingReport as { generated_at?: string }).generated_at)).toLocaleString('ko-KR') : ''}
            </span>
          </div>
          <div className="p-5">
            {(() => {
              const summary = (closingReport as { summary?: ClosingReportSummary } | undefined)?.summary;
              if (!summary) return <p className="text-sm text-stone-400">보고서 데이터 없음</p>;
              const prod = summary.production || {};
              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-100">
                      <p className="text-xs text-emerald-600 font-medium">{`${L("batch")} 완료율`}</p>
                      <p className="text-xl font-bold text-emerald-800">{prod.completionRate || 0}%</p>
                      <p className="text-xs text-emerald-500">{prod.completedBatches || 0}/{prod.totalBatches || 0}건</p>
                    </div>
                    <div className="bg-amber-50 rounded-lg p-3 border border-amber-100">
                      <p className="text-xs text-amber-600 font-medium">미완료 배치</p>
                      <p className="text-xl font-bold text-amber-800">{prod.incompleteBatches || 0}건</p>
                      <p className="text-xs text-amber-500">확인 필요</p>
                    </div>
                    <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                      <p className="text-xs text-blue-600 font-medium">승인 대기</p>
                      <p className="text-xl font-bold text-blue-800">{pendingApprovalData?.count ?? summary.approvals?.pendingCount ?? 0}건</p>
                      <p className="text-xs text-blue-500">문서 처리 필요</p>
                    </div>
                    <div className="bg-rose-50 rounded-lg p-3 border border-rose-100">
                      <p className="text-xs text-rose-600 font-medium">재고 부족</p>
                      <p className="text-xl font-bold text-rose-800">{summary.inventory?.lowStockCount || 0}건</p>
                      <p className="text-xs text-rose-500">원자재 발주 필요</p>
                    </div>
                  </div>
                  {summary.warnings && summary.warnings.length > 0 && (
                    <div className="space-y-1.5">
                      {summary.warnings.map((w: string, i: number) => (
                        <div key={i} className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                          {w}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── 마감 알림 ── */}
      {unreadNotifications.length > 0 && (
        <div className="rounded-xl bg-white/70 backdrop-blur border border-amber-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-gradient-to-r from-amber-500 to-orange-500 flex items-center justify-between">
            <div className="flex items-center gap-2 text-white">
              <Bell className="w-4 h-4" />
              <span className="text-sm font-semibold">마감 알림</span>
            </div>
            <Badge className="bg-white/20 text-white border-0 text-xs">{unreadNotifications.length}건</Badge>
          </div>
          <div className="divide-y divide-amber-100">
            {unreadNotifications.map((notif: ClosingNotification) => (
              <div key={notif.id} className="px-5 py-3 flex items-start gap-3 hover:bg-amber-50/50 transition-colors">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  notif.priority === 'urgent' ? 'bg-rose-100 text-rose-600' :
                  notif.priority === 'high' ? 'bg-amber-100 text-amber-600' :
                  'bg-emerald-100 text-emerald-600'
                }`}>
                  {notif.notification_type?.includes('stock') ? <Boxes className="w-4 h-4" /> :
                   notif.notification_type?.includes('batch') ? <Package className="w-4 h-4" /> :
                   notif.notification_type?.includes('approval') ? <ClipboardCheck className="w-4 h-4" /> :
                   <Bell className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-stone-800 truncate">{notif.title}</p>
                  <p className="text-xs text-stone-500 mt-0.5 line-clamp-2">{notif.message}</p>
                </div>
                <span className="text-[10px] text-stone-400 flex-shrink-0">
                  {notif.created_at ? new Date(notif.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 수동 마감 버튼 ── */}
      <div className="flex justify-end">
        <Button
          onClick={handleManualClosing}
          disabled={isClosingRunning}
          className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-lg shadow-emerald-200 px-6"
        >
          {isClosingRunning ? (
            <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> 마감 처리 중...</>
          ) : (
            <><PlayCircle className="w-4 h-4 mr-2" /> 수동 일일 마감 실행</>
          )}
        </Button>
      </div>

      {/* ── 배치별 파이프라인 ── */}
      <div className="space-y-3">
        {batchList.map((batch: PipelineBatch) => {
          const b = batch as Record<string, unknown>;
          const steps = (batch.steps || b.pipeline || []) as PipelineStep[];
          const batchCode = String(batch.batchCode ?? b.batch_code ?? '-');
          const productName = String(batch.productName ?? b.product_name ?? '제품');
          const lotNumber = String(b.lotNumber ?? b.lot_number ?? '');
          const plannedQty = Number(b.plannedQuantity ?? b.planned_quantity ?? 0);
          const actualQty = Number(b.actualQuantity ?? b.actual_quantity ?? 0);

          // 진행률 계산
          let batchProgress = 0;
          if (Array.isArray(steps) && steps.length > 0) {
            const completedSteps = steps.filter((s: PipelineStep) => s.status === 'completed').length;
            batchProgress = Math.round((completedSteps / PIPELINE_STAGES.length) * 100);
          } else if (batch.status === 'completed') {
            batchProgress = 100;
          } else if (batch.status === 'in_progress') {
            batchProgress = 50;
          }

          return (
            <div 
              key={batch.id || batch.batchId}
              className="rounded-xl bg-white/80 backdrop-blur border border-emerald-100 shadow-sm hover:shadow-md hover:border-emerald-200 transition-all duration-300 overflow-hidden"
            >
              {/* 배치 헤더 */}
              <div className="px-5 py-3 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-100 flex flex-col md:flex-row md:items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white font-bold text-sm shadow-sm">
                    {batchCode.slice(-2) || 'B'}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-emerald-900">{productName}</h3>
                    <p className="text-xs text-emerald-600/70">
                      {batchCode}{lotNumber ? ` · LOT ${lotNumber}` : ''} · 목표 {plannedQty}{actualQty ? ` / 실적 ${actualQty}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-xs text-emerald-600/70">진행률</p>
                    <p className="text-lg font-bold text-emerald-600">{batchProgress}%</p>
                  </div>
                  <div className="w-24">
                    <div className="w-full bg-emerald-100 rounded-full h-2 overflow-hidden">
                      <div 
                        className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-all duration-500"
                        style={{ width: `${batchProgress}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* 파이프라인 단계 */}
              <div className="px-5 py-4 overflow-x-auto">
                <div className="flex items-center min-w-[700px]">
                  {PIPELINE_STAGES.map((stage, index) => {
                    // 단계 상태 결정
                    let stageStatus = 'pending';
                    let stageDetail = '';
                    
                    if (Array.isArray(steps) && steps.length > 0) {
                      const matchedStep = steps.find((s: PipelineStep) => String(s.step ?? '') === String(stage.step) || s.name === stage.name || String(s.id ?? '') === stage.id);
                      if (matchedStep) {
                        stageStatus = matchedStep.status || 'pending';
                        stageDetail = String((matchedStep as { detail?: string }).detail ?? '');
                      }
                    } else {
                      // steps 배열이 없을 때 batch.status로 추정
                      if (batch.status === 'completed') {
                        stageStatus = 'completed';
                      } else if (batch.status === 'in_progress') {
                        stageStatus = index < 4 ? 'completed' : index === 4 ? 'in_progress' : 'pending';
                      } else if (batch.status === 'planned' || batch.status === 'pending') {
                        stageStatus = index === 0 ? 'completed' : 'pending';
                      }
                    }

                    const style = STATUS_STYLES[stageStatus] || STATUS_STYLES.pending;
                    const StageIcon = stage.icon;

                    return (
                      <React.Fragment key={stage.id}>
                        <div className="flex flex-col items-center flex-shrink-0" style={{ width: 72 }}>
                          {/* 원형 아이콘 */}
                          <div
                            className={`
                              w-11 h-11 rounded-full flex items-center justify-center
                              ${style.bg} ring-4 ${style.ring}
                              ${stageStatus === 'in_progress' ? 'animate-pulse' : ''}
                              shadow-sm transition-all duration-300
                            `}
                          >
                            <StageIcon className={`w-5 h-5 ${style.icon}`} />
                          </div>
                          {/* 단계명 */}
                          <p className="text-[11px] font-medium text-emerald-800 mt-1.5 text-center leading-tight">
                            {stage.name}
                          </p>
                          {/* 상태 */}
                          <span className={`text-[10px] font-medium ${style.text} mt-0.5`}>
                            {style.label}
                          </span>
                          {/* 상세 */}
                          {stageDetail && (
                            <p className="text-[9px] text-stone-400 mt-0.5 text-center truncate w-16">
                              {stageDetail}
                            </p>
                          )}
                        </div>

                        {/* 연결선 */}
                        {index < PIPELINE_STAGES.length - 1 && (
                          <div className="flex-1 flex items-center px-0.5 -mt-6">
                            <div
                              className={`
                                h-0.5 w-full rounded
                                ${stageStatus === 'completed' ? 'bg-emerald-400' : 'bg-stone-200'}
                                transition-all duration-500
                              `}
                            />
                            <ChevronRight className={`w-3.5 h-3.5 -ml-1 flex-shrink-0 ${stageStatus === 'completed' ? 'text-emerald-400' : 'text-stone-300'}`} />
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>

              {/* 알림 영역 */}
              {batch.alerts && Array.isArray(batch.alerts) && batch.alerts.length > 0 && (
                <div className="px-5 pb-4 space-y-1.5">
                  {batch.alerts.map((alert: PipelineAlert, idx: number) => (
                    <div
                      key={idx}
                      className={`
                        px-3 py-2 rounded-lg text-xs flex items-start gap-2
                        ${alert.type === 'error' ? 'bg-rose-50 text-rose-700 border border-rose-200' : ''}
                        ${alert.type === 'warning' ? 'bg-amber-50 text-amber-700 border border-amber-200' : ''}
                        ${alert.type === 'info' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : ''}
                      `}
                    >
                      <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                      <span>{alert.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* 빈 상태 */}
        {batchList.length === 0 && (
          <div className="rounded-xl bg-white/70 backdrop-blur border border-emerald-100 shadow-sm">
            <div className="py-16 text-center">
              <div className="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                <Package className="w-10 h-10 text-emerald-300" />
              </div>
              <p className="text-lg font-medium text-emerald-800">선택한 날짜에 배치가 없습니다</p>
              <p className="text-sm text-emerald-600/60 mt-1">다른 날짜를 선택하거나 새 배치를 생성하세요</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// 전체 페이지 (직접 라우트 접근 시 사용 - DashboardLayout 포함)
export const PipelineDashboard: React.FC = () => {
  return (
    <DashboardLayout>
      <PipelineDashboardContent />
    </DashboardLayout>
  );
};

export default PipelineDashboard;

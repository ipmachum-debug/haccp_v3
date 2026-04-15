/**
 * 서버 모니터링 대시보드 (관리자 전용)
 * CPU, RAM, 디스크, MySQL, 프로세스 상태 + 경고 + 백업 현황
 */
import { useState } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Cpu, HardDrive, Database, Activity, AlertTriangle, CheckCircle2,
  RefreshCw, Loader2, Server, Clock, Shield, Archive
} from "lucide-react";

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return d > 0 ? `${d}일 ${h}시간` : h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}

function GaugeBar({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-600">{label}</span>
        <span className="font-bold">{value}%</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-3">
        <div className={`h-3 rounded-full transition-all ${color}`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
    </div>
  );
}

export default function ServerMonitorDashboard() {
  const { data: status, isLoading, refetch } = trpc.serverMonitor.getStatus.useQuery(undefined, {
    refetchInterval: 30000,
  });
  const { data: diagnosis } = trpc.serverMonitor.diagnose.useQuery(undefined, {
    refetchInterval: 60000,
  });
  const { data: backupInfo } = trpc.serverMonitor.getBackupInfo.useQuery();
  const recordMutation = trpc.serverMonitor.recordSnapshot.useMutation();

  const cpuColor = (status?.cpu.usage || 0) > 80 ? "bg-red-500" : (status?.cpu.usage || 0) > 50 ? "bg-amber-500" : "bg-emerald-500";
  const memColor = (status?.memory.usagePercent || 0) > 85 ? "bg-red-500" : (status?.memory.usagePercent || 0) > 60 ? "bg-amber-500" : "bg-emerald-500";
  const diskColor = (status?.disk.usagePercent || 0) > 85 ? "bg-red-500" : (status?.disk.usagePercent || 0) > 60 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Server className="h-5 w-5 text-blue-600" />
              서버 모니터링
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              실시간 서버 상태 · {status?.timestamp ? new Date(status.timestamp).toLocaleTimeString("ko-KR") : "로딩 중..."}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-1.5">새로고침</span>
          </Button>
        </div>

        {/* 경고 배너 */}
        {status?.alerts && status.alerts.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <div className="flex items-center gap-2 text-red-800 font-bold text-sm mb-2">
              <AlertTriangle className="h-4 w-4" /> 경고 {status.alerts.length}건
            </div>
            {status.alerts.map((a: any, i: number) => (
              <p key={i} className="text-sm text-red-700 ml-6">• {a}</p>
            ))}
          </div>
        )}

        {/* 메인 게이지 4개 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border p-4 shadow-sm">
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-2"><Cpu className="h-4 w-4" /> CPU</div>
            <GaugeBar value={status?.cpu.usage || 0} label="사용률" color={cpuColor} />
            <p className="text-[10px] text-gray-400 mt-1">Load: {status?.cpu.loadAvg?.join(" / ") || "-"}</p>
          </div>
          <div className="bg-white rounded-xl border p-4 shadow-sm">
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-2"><Activity className="h-4 w-4" /> 메모리</div>
            <GaugeBar value={status?.memory.usagePercent || 0} label={`${status?.memory.used || 0}MB / ${status?.memory.total || 0}MB`} color={memColor} />
          </div>
          <div className="bg-white rounded-xl border p-4 shadow-sm">
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-2"><HardDrive className="h-4 w-4" /> 디스크</div>
            <GaugeBar value={status?.disk.usagePercent || 0} label={`${status?.disk.used || "-"} / ${status?.disk.total || "-"}`} color={diskColor} />
          </div>
          <div className="bg-white rounded-xl border p-4 shadow-sm">
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-2"><Database className="h-4 w-4" /> MySQL</div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-gray-600">연결</span><span className="font-bold">{status?.mysql.connections || 0}</span></div>
              <div className="flex justify-between"><span className="text-gray-600">실행 쓰레드</span><span className="font-bold">{status?.mysql.threadsRunning || 0}</span></div>
              <div className="flex justify-between"><span className="text-gray-600">슬로우쿼리</span><span className="font-bold">{status?.mysql.slowQueries || 0}</span></div>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {/* 느림 원인 진단 */}
          <div className="bg-white rounded-xl border shadow-sm">
            <div className="px-4 py-3 border-b font-bold text-sm flex items-center gap-2">
              <Shield className="h-4 w-4 text-blue-600" /> 느림 원인 진단
            </div>
            <div className="p-4">
              {diagnosis ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge className={diagnosis.bottleneck === "외부 API (가능성 높음)" ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700"}>
                      {diagnosis.bottleneck}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-700">{diagnosis.recommendation}</p>
                  <div className="text-xs text-gray-400 bg-gray-50 rounded p-2">
                    {JSON.stringify(diagnosis.details, null, 2)}
                  </div>
                </div>
              ) : (
                <p className="text-gray-400 text-sm">진단 중...</p>
              )}
            </div>
          </div>

          {/* 프로세스 + 백업 */}
          <div className="space-y-4">
            {/* 프로세스 정보 */}
            <div className="bg-white rounded-xl border shadow-sm">
              <div className="px-4 py-3 border-b font-bold text-sm flex items-center gap-2">
                <Clock className="h-4 w-4 text-gray-600" /> 프로세스
              </div>
              <div className="p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-600">PID</span><span className="font-mono">{status?.process.pid || "-"}</span></div>
                <div className="flex justify-between"><span className="text-gray-600">가동시간</span><span>{status?.process.uptime ? formatUptime(status.process.uptime) : "-"}</span></div>
                <div className="flex justify-between"><span className="text-gray-600">메모리(Heap)</span><span>{status?.process.memoryMB || 0}MB</span></div>
                <div className="flex justify-between"><span className="text-gray-600">MySQL 가동</span><span>{status?.mysql.uptime ? formatUptime(status.mysql.uptime) : "-"}</span></div>
              </div>
            </div>

            {/* 백업 현황 */}
            <div className="bg-white rounded-xl border shadow-sm">
              <div className="px-4 py-3 border-b font-bold text-sm flex items-center gap-2">
                <Archive className="h-4 w-4 text-emerald-600" /> 백업 현황
              </div>
              <div className="p-4 space-y-2 text-sm">
                {backupInfo ? (
                  <>
                    <div className="flex justify-between"><span className="text-gray-600">전체 크기</span><span className="font-bold">{backupInfo.totalSize}</span></div>
                    <div className="flex justify-between"><span className="text-gray-600">DB 백업 수</span><span>{backupInfo.backupCount}개</span></div>
                    {(backupInfo as any).note && <p className="text-xs text-amber-600">{(backupInfo as any).note}</p>}
                    {backupInfo.recentBackups?.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <p className="text-xs text-gray-500 font-bold">최근 백업:</p>
                        {backupInfo.recentBackups.map((b: any, i: number) => (
                          <p key={i} className="text-xs text-gray-400">{b.date} ({b.size})</p>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-gray-400 text-xs">백업 정보 로딩 중...</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

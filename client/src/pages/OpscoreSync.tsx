/**
 * GOGOGOPICK 연동 관리 페이지
 * 
 * - 슈퍼관리자: 테넌트별 매칭 및 동기화 권한 관리
 * - 테넌트 관리자: 자기 테넌트 동기화 설정 및 실행
 * - 비허용 테넌트: 서비스 신청 안내 토스트
 */
import React, { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { toast } from "sonner";

// ============================================================
// 슈퍼관리자 전용: 테넌트 매핑 관리
// ============================================================
function SuperAdminPanel() {
  const { data: mappingData, refetch } = trpc.opscoreSync.getAllMappings.useQuery();
  const updateMapping = trpc.opscoreSync.updateMapping.useMutation({
    onSuccess: () => {
      toast.success("매핑 설정이 저장되었습니다.");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  const { data: logsData } = trpc.opscoreSync.getSyncLogs.useQuery({ limit: 30 });

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<any>({});

  const startEdit = (mapping: any) => {
    setEditingId(mapping.id);
    setEditForm({
      opscore_tenant_id: mapping.opscore_tenant_id,
      opscore_tenant_name: mapping.opscore_tenant_name,
      sync_enabled: mapping.sync_enabled === 1,
      sync_suppliers: mapping.sync_suppliers === 1,
      sync_products: mapping.sync_products === 1,
      sync_materials: mapping.sync_materials === 1,
      sync_orders: mapping.sync_orders === 1,
      sync_inventory: mapping.sync_inventory === 1,
      sync_accounting: mapping.sync_accounting === 1,
    });
  };

  const saveEdit = () => {
    if (editingId === null) return;
    updateMapping.mutate({
      mappingId: editingId,
      ...editForm,
    });
    setEditingId(null);
  };

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-6 text-white shadow-lg">
        <h2 className="text-2xl font-bold flex items-center gap-3">
          <span className="text-3xl">🔗</span>
          GOGOGOPICK 연동 관리
        </h2>
        <p className="mt-2 text-indigo-100">
          테넌트별 GOGOGOPICK 연동 서비스를 관리합니다. 매칭 설정, 동기화 권한 부여, 동기화 범위를 설정할 수 있습니다.
        </p>
      </div>

      {/* 연결 상태 */}
      <div className="bg-white rounded-xl border p-4 flex items-center gap-3">
        <div className={`w-3 h-3 rounded-full ${mappingData ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
        <span className="font-medium">
          GOGOGOPICK 서버: {mappingData ? '연결 성공' : '연결 확인 중...'}
        </span>
        {mappingData?.opscoreTenants && (
          <span className="text-sm text-gray-500 ml-2">
            (GOGOGOPICK 테넌트 {mappingData.opscoreTenants.length}개 감지)
          </span>
        )}
      </div>

      {/* 테넌트 매핑 테이블 */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b bg-gray-50">
          <h3 className="text-lg font-semibold">테넌트별 연동 설정</h3>
          <p className="text-sm text-gray-500 mt-1">
            각 HACCP-ONE 테넌트를 GOGOGOPICK 테넌트와 매칭하고, 동기화 기능을 부여합니다.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">HACCP-ONE 테넌트</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">GOGOGOPICK 매칭</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">동기화 허용</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">테넌트 활성</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">동기화 범위</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">마지막 동기화</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {mappingData?.mappings?.map((m: any) => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium">{m.haccp_tenant_name}</div>
                    <div className="text-xs text-gray-400">ID: {m.haccp_tenant_id}</div>
                  </td>
                  <td className="px-4 py-3">
                    {editingId === m.id ? (
                      <select
                        className="border rounded px-2 py-1 text-sm w-full"
                        value={editForm.opscore_tenant_id || ""}
                        onChange={(e) => {
                          const selected = mappingData?.opscoreTenants?.find((t: any) => t.id === Number(e.target.value));
                          setEditForm({
                            ...editForm,
                            opscore_tenant_id: selected ? selected.id : null,
                            opscore_tenant_name: selected ? selected.name : null,
                          });
                        }}
                      >
                        <option value="">미매칭</option>
                        {mappingData?.opscoreTenants?.map((t: any) => (
                          <option key={t.id} value={t.id}>{t.name} ({t.code})</option>
                        ))}
                      </select>
                    ) : (
                      <div>
                        {m.opscore_tenant_name ? (
                          <span className="text-indigo-600 font-medium">{m.opscore_tenant_name}</span>
                        ) : (
                          <span className="text-gray-400 italic">미매칭</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {editingId === m.id ? (
                      <input
                        type="checkbox"
                        checked={editForm.sync_enabled}
                        onChange={(e) => setEditForm({ ...editForm, sync_enabled: e.target.checked })}
                        className="w-5 h-5 text-indigo-600 rounded"
                      />
                    ) : (
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        m.sync_enabled === 1 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {m.sync_enabled === 1 ? '허용' : '차단'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      m.tenant_sync_active === 1 ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {m.tenant_sync_active === 1 ? '사용중' : '미사용'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {editingId === m.id ? (
                      <div className="flex flex-wrap gap-1 justify-center">
                        {[
                          { key: "sync_suppliers", label: "거래처" },
                          { key: "sync_products", label: "제품" },
                          { key: "sync_materials", label: "원재료" },
                          { key: "sync_orders", label: "발주" },
                          { key: "sync_inventory", label: "재고" },
                          { key: "sync_accounting", label: "회계" },
                        ].map(({ key, label }) => (
                          <label key={key} className="flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              checked={editForm[key]}
                              onChange={(e) => setEditForm({ ...editForm, [key]: e.target.checked })}
                              className="w-3.5 h-3.5 text-indigo-600 rounded"
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1 justify-center">
                        {m.sync_suppliers === 1 && <span className="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded text-xs">거래처</span>}
                        {m.sync_products === 1 && <span className="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded text-xs">제품</span>}
                        {m.sync_materials === 1 && <span className="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded text-xs">원재료</span>}
                        {m.sync_orders === 1 && <span className="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded text-xs">발주</span>}
                        {m.sync_inventory === 1 && <span className="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded text-xs">재고</span>}
                        {m.sync_accounting === 1 && <span className="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded text-xs">회계</span>}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-gray-500">
                    {m.last_sync_at ? (
                      <div>
                        <div>{new Date(m.last_sync_at).toLocaleDateString("ko-KR")}</div>
                        <div>{new Date(m.last_sync_at).toLocaleTimeString("ko-KR")}</div>
                        {m.last_sync_status && (
                          <span className={`inline-block mt-1 px-1.5 py-0.5 rounded text-xs ${
                            m.last_sync_status === "SUCCESS" ? "bg-green-100 text-green-700" :
                            m.last_sync_status === "PARTIAL" ? "bg-yellow-100 text-yellow-700" :
                            "bg-red-100 text-red-700"
                          }`}>
                            {m.last_sync_status === "SUCCESS" ? "성공" : m.last_sync_status === "PARTIAL" ? "부분성공" : "실패"}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {editingId === m.id ? (
                      <div className="flex gap-1 justify-center">
                        <button onClick={saveEdit} className="px-3 py-1 bg-indigo-600 text-white rounded text-xs hover:bg-indigo-700">저장</button>
                        <button onClick={() => setEditingId(null)} className="px-3 py-1 bg-gray-300 text-gray-700 rounded text-xs hover:bg-gray-400">취소</button>
                      </div>
                    ) : (
                      <button onClick={() => startEdit(m)} className="px-3 py-1 bg-gray-100 text-gray-700 rounded text-xs hover:bg-gray-200">수정</button>
                    )}
                  </td>
                </tr>
              ))}
              {(!mappingData?.mappings || mappingData.mappings.length === 0) && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    테넌트 매핑 데이터가 없습니다. 시스템 초기화가 필요합니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 동기화 로그 */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b bg-gray-50">
          <h3 className="text-lg font-semibold">동기화 로그</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">시간</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">테넌트</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">유형</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">방향</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">상태</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">처리/성공/실패</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {logsData?.logs?.map((log: any, i: number) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-xs text-gray-500">
                    {new Date(log.created_at).toLocaleString("ko-KR")}
                  </td>
                  <td className="px-4 py-2 text-sm">{log.haccp_tenant_name || "-"}</td>
                  <td className="px-4 py-2 text-center text-xs">{log.sync_type}</td>
                  <td className="px-4 py-2 text-center text-xs">
                    {log.sync_direction === "BIDIRECTIONAL" ? "양방향" :
                     log.sync_direction === "HACCP_TO_OPSCORE" ? "HACCP→PICK" : "PICK→HACCP"}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      log.status === "SUCCESS" ? "bg-green-100 text-green-700" :
                      log.status === "PARTIAL" ? "bg-yellow-100 text-yellow-700" :
                      "bg-red-100 text-red-700"
                    }`}>
                      {log.status === "SUCCESS" ? "성공" : log.status === "PARTIAL" ? "부분성공" : "실패"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-center text-xs">
                    {log.records_processed}/{log.records_success}/{log.records_failed}
                  </td>
                </tr>
              ))}
              {(!logsData?.logs || logsData.logs.length === 0) && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-400">동기화 로그가 없습니다.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 테넌트 관리자용: 동기화 설정 및 실행
// ============================================================
function TenantAdminPanel() {
  const { data: myMapping, refetch: refetchMapping } = trpc.opscoreSync.getMyMapping.useQuery();
  const { data: statusData, refetch: refetchStatus } = trpc.opscoreSync.getStatus.useQuery();
  const toggleSync = trpc.opscoreSync.toggleTenantSync.useMutation({
    onSuccess: () => {
      toast.success("동기화 설정이 변경되었습니다.");
      refetchMapping();
    },
    onError: (err) => toast.error(err.message),
  });
  const syncNow = trpc.opscoreSync.syncNow.useMutation({
    onSuccess: (data) => {
      toast.success("동기화가 완료되었습니다.");
      refetchStatus();
      refetchLogs();
    },
    onError: (err) => toast.error(err.message),
  });
  const { data: logsData, refetch: refetchLogs } = trpc.opscoreSync.getSyncLogs.useQuery({ limit: 10 });

  const [direction, setDirection] = useState<"bidirectional" | "toOpscore" | "fromOpscore">("bidirectional");

  // 비허용 테넌트 처리
  if (!myMapping?.allowed) {
    return (
      <div className="space-y-6">
        <div className="bg-gradient-to-r from-gray-400 to-gray-500 rounded-xl p-6 text-white shadow-lg">
          <h2 className="text-2xl font-bold flex items-center gap-3">
            <span className="text-3xl">🔗</span>
            GOGOGOPICK 연동
          </h2>
          <p className="mt-2 text-gray-100">
            GOGOGOPICK 연동 서비스를 통해 거래처, 제품 데이터를 양방향으로 동기화할 수 있습니다.
          </p>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-8 text-center">
          <div className="text-5xl mb-4">🔒</div>
          <h3 className="text-xl font-bold text-yellow-800 mb-2">연동 서비스 신청이 필요합니다</h3>
          <p className="text-yellow-700 mb-4">
            GOGOGOPICK 연동 서비스를 이용하시려면 서비스 신청이 필요합니다.<br />
            아래 연락처로 문의해주세요.
          </p>
          <div className="bg-white rounded-lg p-4 inline-block shadow-sm">
            <div className="flex items-center gap-2 text-gray-700 mb-2">
              <span className="font-medium">📞 전화:</span>
              <a href="tel:032-322-9958" className="text-indigo-600 font-bold hover:underline">032-322-9958</a>
            </div>
            <div className="flex items-center gap-2 text-gray-700">
              <span className="font-medium">📧 이메일:</span>
              <a href="mailto:ipmachum@gmail.com" className="text-indigo-600 font-bold hover:underline">ipmachum@gmail.com</a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const mapping = myMapping?.mapping;
  const isActive = mapping?.tenant_sync_active === 1;

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-6 text-white shadow-lg">
        <h2 className="text-2xl font-bold flex items-center gap-3">
          <span className="text-3xl">🔗</span>
          GOGOGOPICK 연동
        </h2>
        <p className="mt-2 text-indigo-100">
          GOGOGOPICK과 데이터를 양방향으로 동기화합니다. 거래처, 제품 정보를 자동으로 연동할 수 있습니다.
        </p>
      </div>

      {/* 동기화 ON/OFF 토글 */}
      <div className="bg-white rounded-xl border shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">동기화 사용 설정</h3>
            <p className="text-sm text-gray-500 mt-1">
              동기화를 활성화하면 GOGOGOPICK과 데이터를 주고받을 수 있습니다.
            </p>
          </div>
          <button
            onClick={() => toggleSync.mutate({ active: !isActive })}
            disabled={toggleSync.isLoading}
            className={`relative inline-flex h-8 w-16 items-center rounded-full transition-colors ${
              isActive ? 'bg-indigo-600' : 'bg-gray-300'
            }`}
          >
            <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform shadow ${
              isActive ? 'translate-x-9' : 'translate-x-1'
            }`} />
          </button>
        </div>
        {isActive && (
          <div className="mt-4 flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${statusData?.opscoreConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
            <span className="text-sm font-medium">
              GOGOGOPICK 서버: {statusData?.opscoreConnected ? '연결 성공' : '연결 실패'}
            </span>
          </div>
        )}
      </div>

      {/* 데이터 현황 및 동기화 실행 */}
      {isActive && (
        <>
          {/* 데이터 현황 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border shadow-sm p-5">
              <h4 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                HACCP-ONE 데이터
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">거래처</span><span className="font-bold">{statusData?.haccpPartners || 0}건</span></div>
                <div className="flex justify-between"><span className="text-gray-500">공급업체</span><span className="font-bold">{statusData?.haccpSuppliers || 0}건</span></div>
                <div className="flex justify-between"><span className="text-gray-500">제품</span><span className="font-bold">{statusData?.haccpProducts || 0}건</span></div>
              </div>
            </div>
            <div className="bg-white rounded-xl border shadow-sm p-5">
              <h4 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-purple-500" />
                GOGOGOPICK 데이터
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">거래처</span><span className="font-bold">{statusData?.opscorePartners || 0}건</span></div>
                <div className="flex justify-between"><span className="text-gray-500">제품</span><span className="font-bold">{statusData?.opscoreProducts || 0}건</span></div>
              </div>
            </div>
          </div>

          {/* 동기화 방향 선택 */}
          <div className="bg-white rounded-xl border shadow-sm p-5">
            <h4 className="font-semibold text-gray-700 mb-3">동기화 방향</h4>
            <div className="flex gap-2">
              {[
                { value: "bidirectional" as const, label: "양방향", icon: "↔" },
                { value: "toOpscore" as const, label: "HACCP → PICK", icon: "→" },
                { value: "fromOpscore" as const, label: "PICK → HACCP", icon: "←" },
              ].map(({ value, label, icon }) => (
                <button
                  key={value}
                  onClick={() => setDirection(value)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    direction === value
                      ? 'bg-indigo-600 text-white shadow'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {icon} {label}
                </button>
              ))}
            </div>
          </div>

          {/* 동기화 실행 버튼 */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { type: "suppliers" as const, label: "거래처 동기화", icon: "🏢", desc: "거래처/공급업체 데이터 동기화" },
              { type: "products" as const, label: "제품 동기화", icon: "📦", desc: "제품 데이터 동기화" },
              { type: "all" as const, label: "전체 동기화", icon: "🔄", desc: "모든 데이터 일괄 동기화" },
            ].map(({ type, label, icon, desc }) => (
              <button
                key={type}
                onClick={() => syncNow.mutate({ syncType: type, direction })}
                disabled={syncNow.isLoading}
                className={`p-5 rounded-xl border text-left transition-all hover:shadow-md ${
                  type === "all"
                    ? 'bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-200 hover:border-indigo-400'
                    : 'bg-white hover:border-indigo-300'
                }`}
              >
                <div className="text-2xl mb-2">{icon}</div>
                <div className="font-semibold text-gray-800">{label}</div>
                <div className="text-xs text-gray-500 mt-1">{desc}</div>
                {syncNow.isLoading && <div className="text-xs text-indigo-600 mt-2">동기화 중...</div>}
              </button>
            ))}
          </div>

          {/* 동기화 결과 */}
          {syncNow.data?.results && (
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b bg-green-50">
                <h3 className="text-lg font-semibold text-green-800">동기화 결과</h3>
              </div>
              <div className="p-4">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left">항목</th>
                      <th className="px-4 py-2 text-center">동기화</th>
                      <th className="px-4 py-2 text-center">오류</th>
                      <th className="px-4 py-2 text-left">메시지</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {syncNow.data.results.map((r: any, i: number) => (
                      <tr key={i}>
                        <td className="px-4 py-2 font-medium">{r.type}</td>
                        <td className="px-4 py-2 text-center text-indigo-600 font-bold">{r.synced}건</td>
                        <td className="px-4 py-2 text-center text-red-600">{r.errors}건</td>
                        <td className="px-4 py-2 text-gray-500 text-xs">{r.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 최근 동기화 로그 */}
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b bg-gray-50">
              <h3 className="text-lg font-semibold">최근 동기화 로그</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-2 text-left text-gray-600">시간</th>
                    <th className="px-4 py-2 text-center text-gray-600">유형</th>
                    <th className="px-4 py-2 text-center text-gray-600">방향</th>
                    <th className="px-4 py-2 text-center text-gray-600">상태</th>
                    <th className="px-4 py-2 text-center text-gray-600">결과</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {logsData?.logs?.map((log: any, i: number) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-xs text-gray-500">{new Date(log.created_at).toLocaleString("ko-KR")}</td>
                      <td className="px-4 py-2 text-center text-xs">{log.sync_type}</td>
                      <td className="px-4 py-2 text-center text-xs">
                        {log.sync_direction === "BIDIRECTIONAL" ? "양방향" :
                         log.sync_direction === "HACCP_TO_OPSCORE" ? "HACCP→PICK" : "PICK→HACCP"}
                      </td>
                      <td className="px-4 py-2 text-center">
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          log.status === "SUCCESS" ? "bg-green-100 text-green-700" :
                          log.status === "PARTIAL" ? "bg-yellow-100 text-yellow-700" :
                          "bg-red-100 text-red-700"
                        }`}>
                          {log.status === "SUCCESS" ? "성공" : log.status === "PARTIAL" ? "부분성공" : "실패"}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-center text-xs">{log.records_success}/{log.records_processed}</td>
                    </tr>
                  ))}
                  {(!logsData?.logs || logsData.logs.length === 0) && (
                    <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">동기화 로그가 없습니다.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================
// 메인 페이지 컴포넌트
// ============================================================
export default function OpscoreSync() {
  const { user, loading } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";

  // 비허용 테넌트가 메뉴를 클릭했을 때 토스트 표시
  const { data: myMapping } = trpc.opscoreSync.getMyMapping.useQuery(undefined, {
    enabled: !isSuperAdmin && !loading && !!user,
  });

  useEffect(() => {
    if (myMapping && !myMapping.allowed && !isSuperAdmin) {
      toast.error(
        "GOGOGOPICK 연동 서비스를 이용하시려면 서비스 신청이 필요합니다. 고객센터로 문의해주세요. (📞 032-322-9958 / 📧 ipmachum@gmail.com)",
        { duration: 6000 }
      );
    }
  }, [myMapping, isSuperAdmin]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="p-6 flex items-center justify-center min-h-[400px]">
          <div className="text-gray-500">로딩 중...</div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 max-w-7xl mx-auto">
        {isSuperAdmin ? <SuperAdminPanel /> : <TenantAdminPanel />}
      </div>
    </DashboardLayout>
  );
}

import React, { useState } from 'react';
import { trpc } from '../lib/trpc';
import SuperAdminLayout from '../components/SuperAdminLayout';
import { Search, Filter, Calendar, User, FileText, Activity } from 'lucide-react';

export default function AuditLogs() {
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [filters, setFilters] = useState({
    action: '',
    entityType: '',
    userId: '',
    userEmail: '',
    startDate: '',
    endDate: '',
    search: ''
  });

  // 감사 로그 조회
  const { data: logsData, isLoading } = trpc.auditLogs.getAuditLogs.useQuery({
    page,
    limit,
    action: filters.action || undefined,
    entityType: filters.entityType || undefined,
    userId: filters.userId ? parseInt(filters.userId) : undefined,
    userEmail: filters.userEmail || undefined,
    startDate: filters.startDate || undefined,
    endDate: filters.endDate || undefined,
    search: filters.search || undefined,
  });

  // 감사 로그 통계
  const { data: stats } = trpc.auditLogs.getAuditLogStats.useQuery();

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1); // 필터 변경 시 첫 페이지로 이동
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
  };

  const resetFilters = () => {
    setFilters({
      action: '',
      entityType: '',
      userId: '',
      userEmail: '',
      startDate: '',
      endDate: '',
      search: ''
    });
    setPage(1);
  };

  // 액션 타입 한글 변환
  const getActionLabel = (action: string) => {
    const actionLabels: Record<string, string> = {
      'login': '로그인',
      'logout': '로그아웃',
      'user_created': '사용자 생성',
      'user_updated': '사용자 수정',
      'user_deleted': '사용자 삭제',
      'tenant_created': '테넌트 생성',
      'tenant_updated': '테넌트 수정',
      'tenant_deleted': '테넌트 삭제',
      'tenant_approved': '테넌트 승인',
      'tenant_rejected': '테넌트 거부',
      'settings_updated': '설정 변경',
      'password_changed': '비밀번호 변경',
      'password_reset': '비밀번호 재설정',
      'role_changed': '권한 변경'
    };
    return actionLabels[action] || action;
  };

  // 엔티티 타입 한글 변환
  const getEntityTypeLabel = (entityType: string | null) => {
    if (!entityType) return '-';
    const entityLabels: Record<string, string> = {
      'users': '사용자',
      'tenants': '테넌트',
      'settings': '설정',
      'auth': '인증',
      'roles': '권한'
    };
    return entityLabels[entityType] || entityType;
  };

  // 액션 타입별 색상
  const getActionColor = (action: string) => {
    if (action.includes('created')) return 'bg-green-100 text-green-800';
    if (action.includes('updated')) return 'bg-blue-100 text-blue-800';
    if (action.includes('deleted')) return 'bg-red-100 text-red-800';
    if (action.includes('approved')) return 'bg-purple-100 text-purple-800';
    if (action.includes('rejected')) return 'bg-orange-100 text-orange-800';
    if (action.includes('login')) return 'bg-teal-100 text-teal-800';
    return 'bg-gray-100 text-gray-800';
  };

  return (
    <SuperAdminLayout>
      <div className="p-6 max-w-7xl mx-auto">
        {/* 헤더 */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Activity className="w-8 h-8 text-purple-600" />
            감사 로그
          </h1>
          <p className="text-gray-600 mt-2">시스템의 모든 활동을 추적하고 감사합니다</p>
        </div>

        {/* 통계 카드 */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">최근 24시간 로그</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{stats.recentCount}</p>
                </div>
                <div className="bg-purple-100 p-3 rounded-lg">
                  <Activity className="w-6 h-6 text-purple-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">주요 액션</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {stats.actionStats[0]?.action ? getActionLabel(stats.actionStats[0].action) : '-'}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {stats.actionStats[0]?.count || 0}회
                  </p>
                </div>
                <div className="bg-blue-100 p-3 rounded-lg">
                  <FileText className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">주요 리소스</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {stats.entityStats[0]?.entityType ? getEntityTypeLabel(stats.entityStats[0].entityType) : '-'}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {stats.entityStats[0]?.count || 0}회
                  </p>
                </div>
                <div className="bg-green-100 p-3 rounded-lg">
                  <User className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 필터 및 검색 */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-5 h-5 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">필터 및 검색</h2>
          </div>

          <form onSubmit={handleSearch} className="space-y-4">
            {/* 검색 */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="설명으로 검색..."
                value={filters.search}
                onChange={(e) => handleFilterChange('search', e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>

            {/* 필터 그리드 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* 액션 타입 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">액션 타입</label>
                <select
                  value={filters.action}
                  onChange={(e) => handleFilterChange('action', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  <option value="">전체</option>
                  <option value="login">로그인</option>
                  <option value="logout">로그아웃</option>
                  <option value="user_created">사용자 생성</option>
                  <option value="user_updated">사용자 수정</option>
                  <option value="user_deleted">사용자 삭제</option>
                  <option value="tenant_created">테넌트 생성</option>
                  <option value="tenant_updated">테넌트 수정</option>
                  <option value="tenant_deleted">테넌트 삭제</option>
                  <option value="tenant_approved">테넌트 승인</option>
                  <option value="tenant_rejected">테넌트 거부</option>
                  <option value="settings_updated">설정 변경</option>
                </select>
              </div>

              {/* 엔티티 타입 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">리소스 타입</label>
                <select
                  value={filters.entityType}
                  onChange={(e) => handleFilterChange('entityType', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  <option value="">전체</option>
                  <option value="users">사용자</option>
                  <option value="tenants">테넌트</option>
                  <option value="settings">설정</option>
                  <option value="auth">인증</option>
                  <option value="roles">권한</option>
                </select>
              </div>

              {/* 사용자 이메일 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">사용자 이메일</label>
                <input
                  type="email"
                  placeholder="user@example.com"
                  value={filters.userEmail}
                  onChange={(e) => handleFilterChange('userEmail', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* 날짜 범위 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">시작일</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="date"
                    value={filters.startDate}
                    onChange={(e) => handleFilterChange('startDate', e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">종료일</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="date"
                    value={filters.endDate}
                    onChange={(e) => handleFilterChange('endDate', e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            {/* 버튼 */}
            <div className="flex gap-3">
              <button
                type="submit"
                className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
              >
                검색
              </button>
              <button
                type="button"
                onClick={resetFilters}
                className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                초기화
              </button>
            </div>
          </form>
        </div>

        {/* 로그 테이블 */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    시간
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    사용자
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    액션
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    리소스
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    IP 주소
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                      로딩 중...
                    </td>
                  </tr>
                ) : logsData?.logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                      감사 로그가 없습니다
                    </td>
                  </tr>
                ) : (
                  logsData?.logs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(log.createdAt).toLocaleString('ko-KR')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{log.actorId || '-'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getActionColor(log.action)}`}>
                          {getActionLabel(log.action)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {getEntityTypeLabel(log.targetType)}
                        {log.targetId && ` #${log.targetId}`}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {log.ip || '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* 페이지네이션 */}
          {logsData && logsData.pagination.totalPages > 1 && (
            <div className="bg-gray-50 px-6 py-4 flex items-center justify-between border-t border-gray-200">
              <div className="text-sm text-gray-700">
                전체 {logsData.pagination.total}개 중 {(page - 1) * limit + 1}-{Math.min(page * limit, logsData.pagination.total)}개 표시
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  이전
                </button>
                <span className="px-4 py-2 text-sm font-medium text-gray-700">
                  {page} / {logsData.pagination.totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(logsData.pagination.totalPages, p + 1))}
                  disabled={page === logsData.pagination.totalPages}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  다음
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </SuperAdminLayout>
  );
}

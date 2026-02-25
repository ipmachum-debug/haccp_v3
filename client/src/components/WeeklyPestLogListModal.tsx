import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/hooks/use-toast';
import { Eye, Trash2, CheckCircle, XCircle, Clock } from 'lucide-react';
import { WeeklyPestPDFExport } from './WeeklyPestPDFExport';

interface WeeklyPestLogListModalProps {
  open: boolean;
  onClose: () => void;
  tenantId: number;
  onViewDetail?: (logId: number) => void;
}

export function WeeklyPestLogListModal({
  open,
  onClose,
  tenantId,
  onViewDetail
}: WeeklyPestLogListModalProps) {
  const { toast } = useToast();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | '작성중' | '승인대기' | '승인완료'>('all');

  const { data, isLoading, refetch } = trpc.weeklyLog.getPest.useQuery(
    {
      tenant_id: tenantId,
      start_date: startDate || undefined,
      end_date: endDate || undefined,
      status: statusFilter === 'all' ? undefined : statusFilter
    },
    { enabled: open }
  );

  const deleteMutation = trpc.weeklyLog.deletePest.useMutation({
    onSuccess: () => {
      toast({
        title: '성공',
        description: '일지가 삭제되었습니다.'
      });
      refetch();
    },
    onError: (error) => {
      toast({
        title: '오류',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const approveMutation = trpc.weeklyLog.approvePest.useMutation({
    onSuccess: () => {
      toast({
        title: '성공',
        description: '일지가 승인되었습니다.'
      });
      refetch();
    },
    onError: (error) => {
      toast({
        title: '오류',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const requestApprovalMutation = trpc.weeklyLog.requestPestApproval.useMutation({
    onSuccess: () => {
      toast({
        title: '성공',
        description: '승인 요청되었습니다.'
      });
      refetch();
    },
    onError: (error) => {
      toast({
        title: '오류',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const rejectMutation = trpc.weeklyLog.rejectPest.useMutation({
    onSuccess: () => {
      toast({
        title: '성공',
        description: '반려되었습니다.'
      });
      refetch();
    },
    onError: (error) => {
      toast({
        title: '오류',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const handleDelete = (id: number) => {
    if (confirm('정말 삭제하시겠습니까?')) {
      deleteMutation.mutate({ id });
    }
  };

  const handleRequestApproval = (id: number) => {
    if (confirm('승인 요청하시겠습니까?')) {
      requestApprovalMutation.mutate({ id });
    }
  };

  const handleApprove = (id: number) => {
    if (confirm('승인하시겠습니까?')) {
      approveMutation.mutate({ id, approved_by: currentUser?.name || '관리자' });
    }
  };

  const handleReject = (id: number) => {
    const reason = prompt('반려 사유를 입력하세요:');
    if (reason !== null) {
      rejectMutation.mutate({ id, rejected_by: '관리자', reject_reason: reason });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case '작성중':
        return <Badge variant="outline" className="bg-gray-100"><Clock className="h-3 w-3 mr-1" />작성중</Badge>;
      case '승인대기':
        return <Badge variant="outline" className="bg-yellow-100"><Clock className="h-3 w-3 mr-1" />승인대기</Badge>;
      case '승인완료':
        return <Badge variant="outline" className="bg-green-100"><CheckCircle className="h-3 w-3 mr-1" />승인완료</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            방충방서 주간일지 목록
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 p-4">
          {/* 필터 */}
          <div className="grid grid-cols-4 gap-4">
            <div>
              <Label>시작 일자</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <Label>종료 일자</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div>
              <Label>상태</Label>
              <Select value={statusFilter} onValueChange={(value: any) => setStatusFilter(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  <SelectItem value="작성중">작성중</SelectItem>
                  <SelectItem value="승인대기">승인대기</SelectItem>
                  <SelectItem value="승인완료">승인완료</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={() => refetch()} className="w-full">
                조회
              </Button>
            </div>
          </div>

          {/* 테이블 */}
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">점검 일자</TableHead>
                  <TableHead>점검자</TableHead>
                  <TableHead>설비 수</TableHead>
                  <TableHead>관리사항</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>승인자</TableHead>
                  <TableHead className="text-center">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      로딩 중...
                    </TableCell>
                  </TableRow>
                ) : data?.logs && data.logs.length > 0 ? (
                  data.logs.map((log: any) => (
                    <TableRow key={log.id}>
                      <TableCell>{log.check_date}</TableCell>
                      <TableCell>{log.checker_name || '-'}</TableCell>
                      <TableCell>
                        {log.equipment_checks ? log.equipment_checks.length : 0}개
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {log.management_notes || '-'}
                      </TableCell>
                      <TableCell>{getStatusBadge(log.status)}</TableCell>
                      <TableCell>{log.approved_by || '-'}</TableCell>
                      <TableCell>
                        <div className="flex gap-2 justify-center">
                          <WeeklyPestPDFExport log={log} />
                          {onViewDetail && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => onViewDetail(log.id)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          )}
                          {log.status === '작성중' && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-blue-600"
                                onClick={() => handleRequestApproval(log.id)}
                                title="승인 요청"
                              >
                                <Clock className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-red-600"
                                onClick={() => handleDelete(log.id)}
                                title="삭제"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          {log.status === '승인대기' && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-green-600"
                                onClick={() => handleApprove(log.id)}
                                title="승인"
                              >
                                <CheckCircle className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-red-600"
                                onClick={() => handleReject(log.id)}
                                title="반려"
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                      조회된 일지가 없습니다.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* 버튼 */}
          <div className="flex justify-end">
            <Button variant="outline" onClick={onClose}>
              닫기
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

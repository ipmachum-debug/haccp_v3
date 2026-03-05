import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Download, Trash2, Database, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";
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

export default function BackupManagement() {
  const utils = trpc.useUtils();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedBackupId, setSelectedBackupId] = useState<number | null>(null);

  // 백업 목록 조회
  const { data: backups, isLoading, refetch } = trpc.admin.listBackups.useQuery();

  // 백업 삭제 mutation
  const deleteBackupMutation = trpc.admin.deleteBackup.useMutation({
    onSuccess: () => {
      toast.success("백업이 성공적으로 삭제되었습니다.");
      refetch();
      setDeleteDialogOpen(false);
      setSelectedBackupId(null);
    },
    onError: (error) => {
      toast.error(`백업 삭제 실패: ${error.message}`);
    },
  });

  // 백업 다운로드
  const handleDownload = async (backupId: number, fileName: string) => {
    try {
      const result = await utils.admin.getBackupDownloadUrl.fetch({ backupId });
      
      // 새 탭에서 다운로드 URL 열기
      window.open(result.url, "_blank");
      
      toast.success(`${fileName} 다운로드를 시작합니다.`);
    } catch (error: any) {
      toast.error(`다운로드 실패: ${error.message}`);
    }
  };

  // 백업 삭제 확인
  const handleDeleteClick = (backupId: number) => {
    setSelectedBackupId(backupId);
    setDeleteDialogOpen(true);
  };

  // 백업 삭제 실행
  const handleDeleteConfirm = () => {
    if (selectedBackupId) {
      deleteBackupMutation.mutate({ backupId: selectedBackupId });
    }
  };

  // 파일 크기 포맷팅
  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "N/A";
    const kb = bytes / 1024;
    const mb = kb / 1024;
    if (mb >= 1) {
      return `${mb.toFixed(2)} MB`;
    }
    return `${kb.toFixed(2)} KB`;
  };

  // 날짜 포맷팅
  const formatDate = (date: Date | string | null) => {
    if (!date) return "N/A";
    return new Date(date).toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // 백업 타입 배지
  const getBackupTypeBadge = (type: string) => {
    switch (type) {
      case "s3":
        return <Badge variant="default">S3</Badge>;
      case "local":
        return <Badge variant="secondary">로컬</Badge>;
      case "both":
        return <Badge variant="outline">로컬 + S3</Badge>;
      default:
        return <Badge variant="secondary">{type}</Badge>;
    }
  };

  // 백업 상태 배지
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge variant="default" className="bg-green-500">완료</Badge>;
      case "pending":
        return <Badge variant="secondary">대기 중</Badge>;
      case "failed":
        return <Badge variant="destructive">실패</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">백업 관리</h1>
          <p className="text-muted-foreground mt-2">
            데이터베이스 백업 파일을 관리하고 다운로드할 수 있습니다.
          </p>
        </div>
        <Button onClick={() => refetch()} variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-2" />
          새로고침
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            백업 목록
          </CardTitle>
          <CardDescription>
            최근 50개의 백업 파일이 표시됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              백업 목록을 불러오는 중...
            </div>
          ) : !backups || backups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              백업 파일이 없습니다.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>파일명</TableHead>
                    <TableHead>크기</TableHead>
                    <TableHead>타입</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead>생성일시</TableHead>
                    <TableHead className="text-right">작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {backups.map((backup) => (
                    <TableRow key={backup.id}>
                      <TableCell className="font-medium">
                        {backup.fileName}
                      </TableCell>
                      <TableCell>{formatFileSize(backup.fileSize)}</TableCell>
                      <TableCell>{getBackupTypeBadge(backup.backupType)}</TableCell>
                      <TableCell>{getStatusBadge(backup.status)}</TableCell>
                      <TableCell>{formatDate(backup.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {backup.backupType === "s3" && backup.status === "completed" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDownload(backup.id, backup.fileName)}
                            >
                              <Download className="w-4 h-4 mr-1" />
                              다운로드
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteClick(backup.id)}
                          >
                            <Trash2 className="w-4 h-4 mr-1" />
                            삭제
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 삭제 확인 다이얼로그 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>백업 삭제 확인</AlertDialogTitle>
            <AlertDialogDescription>
              정말로 이 백업을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

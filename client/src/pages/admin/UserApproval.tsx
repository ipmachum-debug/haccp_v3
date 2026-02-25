import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  Building2, 
  Mail, 
  User, 
  Calendar,
  FileText,
  Loader2
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import SuperAdminLayout from "@/components/SuperAdminLayout";

export default function UserApproval() {
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [action, setAction] = useState<"approve" | "reject" | null>(null);
  const [adminMemo, setAdminMemo] = useState("");

  const utils = trpc.useUtils();

  // 승인 대기 중인 클라이언트 관리자 조회
  const { data: pendingData, isLoading } = trpc.superadminApproval.getPendingClientAdmins.useQuery();

  // 승인/거부 mutation
  const approveMutation = trpc.superadminApproval.approveClientAdmin.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      utils.superadminApproval.getPendingClientAdmins.invalidate();
      setSelectedUser(null);
      setAction(null);
      setAdminMemo("");
    },
    onError: (error) => {
      toast.error(error.message || "처리 중 오류가 발생했습니다.");
    },
  });

  const handleApprove = () => {
    if (!selectedUser) return;
    
    approveMutation.mutate({
      userId: selectedUser.id,
      action: "approve",
      adminMemo: adminMemo.trim() || undefined,
    });
  };

  const handleReject = () => {
    if (!selectedUser) return;
    
    if (!adminMemo.trim()) {
      toast.error("거부 사유를 입력해주세요.");
      return;
    }
    
    approveMutation.mutate({
      userId: selectedUser.id,
      action: "reject",
      adminMemo: adminMemo.trim(),
    });
  };

  const openDialog = (user: any, actionType: "approve" | "reject") => {
    setSelectedUser(user);
    setAction(actionType);
    setAdminMemo("");
  };

  const closeDialog = () => {
    setSelectedUser(null);
    setAction(null);
    setAdminMemo("");
  };

  if (isLoading) {
    return (
      <SuperAdminLayout>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      </SuperAdminLayout>
    );
  }

  const pendingUsers = pendingData?.users || [];

  return (
    <SuperAdminLayout>
      <div className="container mx-auto p-6 max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          {/* 헤더 */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-foreground mb-2">
              클라이언트 관리자 승인
            </h1>
            <p className="text-muted-foreground">
              새로 가입한 클라이언트 관리자를 승인하거나 거부할 수 있습니다.
            </p>
          </div>

          {/* 통계 카드 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">승인 대기</CardTitle>
                <Clock className="h-4 w-4 text-yellow-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{pendingUsers.length}</div>
                <p className="text-xs text-muted-foreground">
                  검토가 필요한 신청
                </p>
              </CardContent>
            </Card>
          </div>

          {/* 승인 대기 목록 */}
          {pendingUsers.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <CheckCircle className="w-16 h-16 text-green-500 mb-4" />
                <h3 className="text-xl font-semibold text-foreground mb-2">
                  모든 신청이 처리되었습니다
                </h3>
                <p className="text-muted-foreground text-center">
                  현재 승인 대기 중인 클라이언트 관리자가 없습니다.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-6">
              {pendingUsers.map((user: any, index: number) => (
                <motion.div
                  key={user.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1, duration: 0.4 }}
                >
                  <Card className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <CardTitle className="flex items-center gap-2">
                            <User className="w-5 h-5 text-blue-600" />
                            {user.name}
                          </CardTitle>
                          <CardDescription className="flex items-center gap-2">
                            <Mail className="w-4 h-4" />
                            {user.email}
                          </CardDescription>
                        </div>
                        <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                          <Clock className="w-3 h-3 mr-1" />
                          승인 대기
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {/* 회사 정보 */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                            <Building2 className="w-5 h-5 text-muted-foreground mt-0.5" />
                            <div>
                              <p className="text-sm font-medium text-foreground">회사명</p>
                              <p className="text-sm text-muted-foreground">{user.companyName || "미입력"}</p>
                            </div>
                          </div>

                          <div className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                            <FileText className="w-5 h-5 text-muted-foreground mt-0.5" />
                            <div>
                              <p className="text-sm font-medium text-foreground">사업자번호</p>
                              <p className="text-sm text-muted-foreground">{user.businessNumber || "미입력"}</p>
                            </div>
                          </div>
                        </div>

                        {/* 사용자 메모 */}
                        {user.userMemo && (
                          <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                            <p className="text-sm font-medium text-foreground mb-1">신청자 메모</p>
                            <p className="text-sm text-muted-foreground">{user.userMemo}</p>
                          </div>
                        )}

                        {/* 가입일 */}
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Calendar className="w-4 h-4" />
                          가입일: {new Date(user.createdAt).toLocaleString("ko-KR")}
                        </div>

                        {/* 액션 버튼 */}
                        <div className="flex gap-3 pt-4 border-t">
                          <Button
                            onClick={() => openDialog(user, "approve")}
                            className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                          >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            승인
                          </Button>
                          <Button
                            onClick={() => openDialog(user, "reject")}
                            variant="destructive"
                            className="flex-1"
                          >
                            <XCircle className="w-4 h-4 mr-2" />
                            거부
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>

        {/* 승인/거부 확인 다이얼로그 */}
        <Dialog open={!!selectedUser} onOpenChange={closeDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {action === "approve" ? "클라이언트 관리자 승인" : "클라이언트 관리자 거부"}
              </DialogTitle>
              <DialogDescription>
                {action === "approve"
                  ? "승인하면 새로운 테넌트가 생성되고, 사용자는 즉시 시스템을 사용할 수 있습니다."
                  : "거부 시 사용자에게 이메일로 알림이 전송됩니다. 거부 사유를 입력해주세요."}
              </DialogDescription>
            </DialogHeader>

            {selectedUser && (
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <p className="text-sm font-medium">신청자 정보</p>
                  <div className="p-3 bg-muted rounded-lg space-y-1">
                    <p className="text-sm">
                      <span className="font-medium">이름:</span> {selectedUser.name}
                    </p>
                    <p className="text-sm">
                      <span className="font-medium">이메일:</span> {selectedUser.email}
                    </p>
                    <p className="text-sm">
                      <span className="font-medium">회사명:</span> {selectedUser.companyName || "미입력"}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="adminMemo">
                    {action === "approve" ? "관리자 메모 (선택)" : "거부 사유 (필수)"}
                  </Label>
                  <Textarea
                    id="adminMemo"
                    placeholder={
                      action === "approve"
                        ? "승인 관련 메모를 입력하세요 (선택)"
                        : "거부 사유를 입력하세요 (필수)"
                    }
                    value={adminMemo}
                    onChange={(e) => setAdminMemo(e.target.value)}
                    rows={4}
                    className="resize-none"
                  />
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={closeDialog} disabled={approveMutation.isPending}>
                취소
              </Button>
              <Button
                onClick={action === "approve" ? handleApprove : handleReject}
                disabled={approveMutation.isPending}
                className={
                  action === "approve"
                    ? "bg-green-600 hover:bg-green-700"
                    : "bg-red-600 hover:bg-red-700"
                }
              >
                {approveMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    처리 중...
                  </>
                ) : action === "approve" ? (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    승인하기
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4 mr-2" />
                    거부하기
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </SuperAdminLayout>
  );
}
